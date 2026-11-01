/**
 * Journey simulation: one player, day by day, from the first region to the last, through the real engine
 * (Encounter, loot, crafting, cultivation, breakthroughs). Where the per-region simulator (sim.ts) asks "can an
 * archetype win here?", this asks "how long does the whole game take, and what runs out first?".
 *
 *   node tools/balance/journey.ts [--seeds 3] [--days 400] [--hours 2] [--out tools/balance/out/journey.json]
 *
 * The player (a steady but not optimal human):
 *   - plays `--hours` a day in sessions; the rest of the day is offline cultivation (the 12 h offline cap applies);
 *   - spends all energy on the best farmable place: the highest-reward node of the current region they win ≥ 70 %
 *     against (measured), the region boss once it is beatable, the next region once its boss falls;
 *   - equips the best gear that drops (equipBest), enhances the equipped set with the stones and stones-of-enhancing
 *     at hand up to the region's sensible level, learns every technique obtainable by then (sim_lib availability);
 *   - breaks through a stage whenever the Qi is there, a realm when its requirements are met (pills bought or
 *     farmed; the trial / tribulation fought for real).
 * Output: per region the day of arrival, the day the boss fell, the stones earned and spent, energy used, gear
 * level, realm and stage, and whether gear or cultivation was the bottleneck (what the player waited for).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { loadDatabase } from "../lib/load.ts";
import { ContentIndex, type ContentBundle, type Region, type Realm, type MapNode } from "../../src/content/index.ts";
import { newGameState, type GameState } from "../../src/engine/state.ts";
import { Encounter, canEnterTournament, canStart, type EncounterSource } from "../../src/engine/encounter.ts";
import { computeStats } from "../../src/engine/stats.ts";
import { energyNow, energyMax, tick as cultTick, applyOffline, minorBreakthrough, canMinorBreakthrough, majorRequirements, canAttemptMajor, majorBreakthrough, isFinalStage } from "../../src/engine/cultivation.ts";
import { enhanceCost, enhance, alchemyStatus, refinePills, upgradeFurnace, readBook, furnaces } from "../../src/engine/crafting.ts";
import { equipBest, sellItem } from "../../src/engine/actions.ts";
import { checkUnlock } from "../../src/engine/unlock.ts";
import { nodeState, gather, openChest, meditateAt, resolveEvent } from "../../src/engine/nodes.ts";
import { regionsOf, availableAt, T0 } from "./sim_lib.ts";
import { EQUIP_SLOTS, bagGearUids, bagUsed, bagCapacity, claimPouch, pouchCount } from "../../src/engine/inventory.ts";
import { seedRng } from "../../src/engine/rng.ts";
import { Game } from "../../src/engine/game.ts";
import { questStatus, acceptQuest, turnInQuest, questProgress } from "../../src/engine/progression.ts";
import { completeScene, firstScene } from "../../src/engine/story.ts";
import { chat, askTopic, giveGift } from "../../src/engine/social.ts";
import { shopRows, buy, sellGear } from "../../src/engine/shop.ts";
import { canEnterRealm, enterRealm, realmNodeState, realmInteract, realmRun } from "../../src/engine/delves.ts";

const args = process.argv.slice(2);
const arg = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1]! : d; };
const SEEDS = Number(arg("--seeds", "3"));
const DAYS = Number(arg("--days", "400"));
const HOURS = Number(arg("--hours", "2"));
const OUT = arg("--out", "tools/balance/out/journey.json");
const VERBOSE = args.includes("--verbose");
const WATCH = process.env.IA_WATCH ?? ""; let watchLast = 0;

const ROOT = join(import.meta.dirname, "../..");
const db = loadDatabase(ROOT);
const entities: Record<string, any> = {};
for (const [id, e] of db.registry) entities[id] = e.data;
const c = new ContentIndex({ version: 1, builtAt: "journey", entities, singletons: db.singletons } as ContentBundle);
const regions = regionsOf(c);
const realmOrder = (id: string) => c.get<Realm>(id).order;
const DAY = 86_400_000, HOUR = 3_600_000;

export interface RegionLog { region: string; order: number; arrivedDay: number; bossDay: number | null; cp: number; realm: string; stage: number; stonesEarned: number; stonesSpent: number; energySpent: number; fights: number; losses: number; plus: number; waitedFor: Record<string, number> }
export interface Journey { seed: number; days: number; finishedDay: number | null; regions: RegionLog[]; realms: { realm: string; day: number }[] }

/** A fight through the real game loop: the encounter's events go through Game.run so quests, achievements and ranks follow. */
function fight(g: Game | null, s: GameState, src: EncounterSource, now: number): { won: boolean; stones: number } {
  const st = Encounter.start(s, c, src, now);
  if (!st.ok) return { won: false, stones: 0 };
  const enc = st.encounter;
  let stones = 0;
  while (!enc.done) {
    enc.battle!.run();
    const wr = enc.settleWave(now);
    stones += wr.drops.spirit_stones;
    if (g) g.run("battle", now, () => ({ ok: true, events: enc.drainEvents() }));
    if (wr.summary.result !== "victory") break;
    if (enc.hasNextWave) enc.nextWave();
  }
  return { won: !!enc.done?.won, stones };
}
/** Play every story scene the game has queued (first choice at every question), chained scenes included. */
function stories(g: Game, s: GameState, now: number) {
  const play = (id: string) => {
    if (s.progress.storySeen[id]) return;
    const sc = c.get<any>(id);
    const nq = (sc.lines ?? []).filter((l: any) => l.choices?.length).length;
    const choice = nq ? Array.from({ length: nq }, () => 0) : sc.choices?.length ? 0 : null;
    const r = g.run("story", now, (x, cc) => completeScene(x, cc, id, choice, now));
    if (r.ok && r.next) play(r.next);
  };
  const first = firstScene(c); if (first) play(first.id);
  for (let guard = 0; g.storyQueue.length && guard < 50; guard++) play(g.storyQueue.shift()!);
}
/** Accept every quest the player can and turn in every one that is ready (what a player who reads the log does). */
function quests(g: Game, s: GameState, now: number) {
  stories(g, s, now);
  for (const q of c.byPrefix<any>("quest")) {
    const st = questStatus(s, c, q, now);
    if (st === "available") g.run("quest", now, (x, cc) => acceptQuest(x, cc, q.id, now));
    else if (st === "active") {
      // social steps: talk to the NPC (chat, or the named topic) — the fights and clears happen on the map
      for (const o of q.objectives as any[]) {
        if (o.type === "talk") { if (o.topic) g.run("talk", now, (x, cc) => askTopic(x, cc, o.npc, o.topic)); else g.run("talk", now, (x, cc) => chat(x, cc, o.npc)); }
        if (o.type === "gift" && (s.inventory.stacks["gift.osmanthus_cake"] ?? 0) > 0) g.run("gift", now, (x, cc) => giveGift(x, cc, o.npc, "gift.osmanthus_cake"));
      }
    }
    else if (st === "ready") g.run("quest", now, (x, cc) => turnInQuest(x, cc, q.id, now));
  }
}

/** Win rate of the player as they are now against a source, over a few seeds, without touching their state. */
function probe(s: GameState, src: EncounterSource, now: number, n = 4, seed0 = 1): number {
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const copy: GameState = structuredClone(s); copy.rng = seedRng(seed0 * 97 + i * 13 + (s.meta.playtimeMs | 0));
    copy.resources.energy.value = 1e6;
    if (fight(null, copy, src, now).won) wins++;
  }
  return wins / n;
}

/** Enhance every equipped piece as far as the stones and materials allow, up to `cap`. */
function enhanceAll(s: GameState, cap: number): number {
  let spent = 0;
  for (let pass = 0; pass < 30; pass++) {
    let any = false;
    for (const slot of EQUIP_SLOTS) {
      const uid = s.equipped[slot]; if (uid === undefined) continue;
      const g = s.inventory.gear[uid]; if (!g || g.enhance >= cap) continue;
      const cost = enhanceCost(c, g); if (!cost) continue;
      if (s.resources.spirit_stones < cost.stones || !cost.items.every((q) => (s.inventory.stacks[q.id] ?? 0) >= q.qty)) continue;
      const r = enhance(s, c, uid); if (!r.ok) continue;
      spent += cost.stones; any = true;
    }
    if (!any) break;
  }
  return spent;
}

/**
 * The alchemy loop a player who visits the hall runs: upgrade the furnace when affordable, refine the pills a coming
 * breakthrough asks for (and their ingredient pills), and keep proficiency growing with the cheapest unlocked recipe.
 */
function alchemy(g: Game, s: GameState, now: number): number {
  let spent = 0;
  for (let k = 0; k < 3; k++) { const before = s.resources.spirit_stones; const r = g.run("furnace", now, (x, cc) => upgradeFurnace(x, cc)); if (!r.ok) break; spent += before - s.resources.spirit_stones; }
  const want = new Set(majorRequirements(s, c).filter((r) => r.kind === "item" && !r.met).map((r) => r.id!));
  // the next realm's pills too, so the player is not waiting on alchemy when the Qi is there
  const next = c.nextRealm(s.character.realm); const next2 = next ? c.nextRealm(next.id) : null;
  for (const q of next2?.major_breakthrough.requirements ?? []) if ((s.inventory.stacks[q.id] ?? 0) < q.qty) want.add(q.id);
  const recipes = c.byPrefix<any>("alchemy");
  const byOut = new Map(recipes.map((r) => [r.output.id, r]));
  const refine = (r: any, batch: number) => { const before = s.resources.spirit_stones; const res = g.run("alchemy", now, (x, cc) => refinePills(x, cc, r.id, batch)); if (res.ok) spent += before - s.resources.spirit_stones; return res.ok; };
  for (const id of want) {
    const r = byOut.get(id); if (!r) continue;
    // ingredients that are themselves pills: refine those first
    for (const q of r.ingredients) { const sub = byOut.get(q.id); if (sub && (s.inventory.stacks[q.id] ?? 0) < q.qty) { const st = alchemyStatus(s, c, sub); if (st.unlocked && st.maxBatch) refine(sub, Math.min(st.maxBatch, 3)); } }
    const st = alchemyStatus(s, c, r);
    if (st.unlocked && st.maxBatch) refine(r, Math.min(st.maxBatch, 3));
  }
  // proficiency: when a wanted recipe is still locked by proficiency, grind the best unlocked recipe; otherwise one
  // cheap load of the lowest unlocked recipe per session when stones are plentiful
  const usable = recipes.filter((r) => alchemyStatus(s, c, r).unlocked && alchemyStatus(s, c, r).maxBatch);
  const lockedBy = Math.max(0, ...[...want].map((id) => byOut.get(id)?.proficiency_min ?? 0));
  if (lockedBy > s.progress.crafting.proficiency) { const best = usable.sort((a, b) => b.proficiency_xp - a.proficiency_xp)[0]; if (best) refine(best, Math.min(alchemyStatus(s, c, best).maxBatch, 3)); }
  else { const cheap = usable.sort((a, b) => a.proficiency_min - b.proficiency_min)[0]; if (cheap && s.resources.spirit_stones > cheap.cost_stones * 20) refine(cheap, 1); }
  // manuals in the bag teach techniques
  for (const id of Object.keys(s.inventory.stacks)) if (id.startsWith("book.") && (s.inventory.stacks[id] ?? 0) > 0) g.run("book", now, (x, cc) => readBook(x, cc, id));
  return spent;
}

/** Learn every technique and method available by region n (what a player who reads the shops and quests would have). */
function learn(s: GameState, n: number) {
  const ro = realmOrder(s.character.realm);
  const ok = (t: any) => !t.enemy_only && availableAt(c, t.id) <= n && (!t.requirements?.realm || realmOrder(t.requirements.realm.id) < ro || (realmOrder(t.requirements.realm.id) === ro && (t.requirements.realm.stage ?? 1) <= s.character.stage));
  const score = (t: any) => t.power * t.hits * (t.targeting === "all_enemies" ? 1.6 : 1) + (t.heal_pct ?? 0) * 2 + (t.shield_pct_max_hp ?? 0) * 2;
  const techs = c.byPrefix<any>("tech").filter(ok);
  for (const t of techs) s.techniques.known[t.id] ??= 0;
  const actives = techs.filter((t) => t.kind === "active").sort((a, b) => score(b) - score(a));
  const heal = actives.find((t) => t.heal_pct), shield = actives.find((t) => t.shield_pct_max_hp);
  const picks: any[] = []; for (const t of [heal, shield, ...actives]) if (t && !picks.includes(t) && picks.length < 4) picks.push(t);
  picks.forEach((t, i) => { s.techniques.actives[i] = t.id; });
  techs.filter((t) => t.kind === "passive").sort((a, b) => Object.values(b.passive_bonuses).reduce((x: number, y: any) => x + y, 0) - Object.values(a.passive_bonuses).reduce((x: number, y: any) => x + y, 0)).slice(0, 2).forEach((t, i) => { s.techniques.passives[i] = t.id; });
  const ult = techs.filter((t) => t.kind === "ultimate").sort((a, b) => score(b) - score(a))[0]; if (ult) s.techniques.ultimate = ult.id;
  const methods = c.byPrefix<any>("method").filter((m) => availableAt(c, m.id) <= n && (!m.requirements?.realm || realmOrder(m.requirements.realm.id) <= ro)).sort((a, b) => b.qi_mult - a.qi_mult);
  if (methods[0] && methods[0].id !== s.character.method) { s.character.methodMastery[methods[0].id] ??= 0; s.character.method = methods[0].id; }
}

/** Everything the player is short of for progress: breakthrough items, their recipe ingredients, the furnace upgrade, the next enhancement. */
function wanted(s: GameState): Map<string, number> {
  const want = new Map<string, number>();
  const add = (id: string, n: number) => { if (n > 0) want.set(id, Math.max(want.get(id) ?? 0, n)); };
  const short = (id: string, qty: number) => Math.max(0, qty - (s.inventory.stacks[id] ?? 0));
  const recipes = c.byPrefix<any>("alchemy");
  const needPill = (id: string, qty: number, depth = 0) => {
    add(id, short(id, qty));
    const rec = recipes.find((a) => a.output.id === id); if (!rec || depth > 2) return;
    // enough ingredients for a few attempts (the recipe fails more often than not early on)
    for (const q of rec.ingredients) { if (recipes.some((a) => a.output.id === q.id)) needPill(q.id, q.qty * 2, depth + 1); else add(q.id, short(q.id, q.qty * 3)); }
  };
  for (const r of majorRequirements(s, c)) if (r.kind === "item" && !r.met) needPill(r.id!, r.need);
  const next = c.nextRealm(s.character.realm); const next2 = next ? c.nextRealm(next.id) : null;
  for (const q of next2?.major_breakthrough.requirements ?? []) needPill(q.id, q.qty);
  // a wanted recipe locked behind proficiency: farm herbs for the best unlocked recipe (what a player grinding the hall does)
  const prof = s.progress.crafting.proficiency;
  const lockedBy = Math.max(0, ...[...want.keys()].map((id) => recipes.find((a) => a.output.id === id)?.proficiency_min ?? 0));
  if (lockedBy > prof) {
    const ladder = recipes.filter((a) => alchemyStatus(s, c, a).unlocked).sort((a, b) => b.proficiency_xp - a.proficiency_xp)[0];
    for (const q of ladder?.ingredients ?? []) add(q.id, short(q.id, q.qty * 4));
  }
  // the furnace a wanted recipe needs
  const cur = furnaces(c).find((f: any) => f.grade === s.progress.crafting.furnace);
  const needGrade = Math.max(0, ...[...want.keys()].map((id) => recipes.find((a) => a.output.id === id)?.furnace_min ?? 0));
  if (cur?.upgrade && s.progress.crafting.furnace < needGrade) for (const q of cur.upgrade.materials) add(q.id, short(q.id, q.qty));
  for (const slot of EQUIP_SLOTS) { const uid = s.equipped[slot]; if (uid === undefined) continue; const cost = enhanceCost(c, s.inventory.gear[uid]!); for (const q of cost?.items ?? []) add(q.id, (want.get(q.id) ?? 0) + q.qty); }
  return want;
}

/**
 * Bag keeping, as a player does when the bag fills: sell the gear not worn, sell junk, trim material stacks nobody
 * needs, then claim what waited in the overflow pouch. Without this the pouch swallows every new drop once the
 * bag's slots are taken (the first journey runs stalled for weeks on a "missing" material that sat in the pouch).
 */
function tidy(g: Game, s: GameState, now: number): void {
  const spare = bagGearUids(s).filter((u) => !EQUIP_SLOTS.some((sl) => s.equipped[sl] === u));
  if (spare.length) g.run("sell", now, (x, cc) => sellGear(x, cc, spare));
  const want = wanted(s);
  for (const [id, qty] of Object.entries(s.inventory.stacks)) {
    if (qty <= 0) continue;
    if (id.startsWith("junk.")) { g.run("sell", now, (x, cc) => sellItem(x, cc, id, qty)); continue; }
    if (id.startsWith("mat.") && !want.has(id) && qty > 300) g.run("sell", now, (x, cc) => sellItem(x, cc, id, qty - 150));
  }
  if (bagUsed(s) >= bagCapacity(s, c) - 2) {
    // still tight: let go of the material stacks the recipes and breakthroughs do not ask for, smallest first
    const idle = Object.entries(s.inventory.stacks).filter(([id, q]) => q > 0 && id.startsWith("mat.") && !want.has(id)).sort((a, b) => a[1] - b[1]);
    for (const [id, q] of idle.slice(0, 6)) g.run("sell", now, (x, cc) => sellItem(x, cc, id, q));
  }
  if (pouchCount(s)) claimPouch(s, c);
}

/**
 * Shopping, through the real shops: what the player wants (breakthrough pills and their ingredients, the enhancement
 * materials the equipped set needs next, every technique and method on sale) when the stones are there. Keeps a
 * reserve of a day's income so enhancement is never starved by shopping.
 */
function shop(g: Game, s: GameState, now: number): number {
  let spent = 0;
  const want = wanted(s);
  for (const sh of c.byPrefix<any>("shop")) {
    let rows; try { rows = shopRows(s, c, sh.id, now); } catch { continue; }
    for (const row of rows) {
      if (row.locked || row.owned || row.currency === "sect_fame") continue;
      const learnable = row.id.startsWith("tech.") || row.id.startsWith("method.");
      let n = learnable ? 1 : Math.min(want.get(row.id) ?? 0, row.left ?? 99);
      if (row.currency === "contribution") n = Math.min(n, Math.floor(s.resources.contribution / row.price));   // the exchange: spend what the missions earned
      if (n <= 0) continue;
      if (row.currency === "spirit_stones" && s.resources.spirit_stones - row.price * n < 500) continue;
      const before = s.resources.spirit_stones;
      const r = g.run("buy", now, (x, cc) => buy(x, cc, sh.id, row.index, n, now));
      if (r.ok) { spent += before - s.resources.spirit_stones; if (!learnable) want.set(row.id, (want.get(row.id) ?? 0) - n); }
    }
  }
  return spent;
}

function run(seed: number): Journey {
  const s = newGameState(c, T0, { seed });
  const g = new Game(c, s);
  s.progress.regions[regions[0]!.id] ??= { discoveredAt: T0, nodes: {} };
  g.settle(T0);
  const log: RegionLog[] = [];
  const realmsLog: { realm: string; day: number }[] = [{ realm: s.character.realm, day: 0 }];
  let now = T0;
  let region = 1;
  let cur: RegionLog = { region: regions[0]!.id, order: 1, arrivedDay: 0, bossDay: null, cp: 0, realm: s.character.realm, stage: s.character.stage, stonesEarned: 0, stonesSpent: 0, energySpent: 0, fights: 0, losses: 0, plus: 0, waitedFor: {} };
  log.push(cur);
  let finishedDay: number | null = null;
  const plusCap = (n: number) => Math.min(15, 4 + n);   // how far a steady player bothers to enhance in region n

  for (let day = 0; day < DAYS && finishedDay === null; day++) {
    // offline night, then the play sessions
    now += (24 - HOURS) * HOUR; applyOffline(s, c, now);
    let minutes = HOURS * 60;
    learn(s, region); quests(g, s, now);
    while (minutes > 0) {
      // cultivate for a minute of wall time while deciding
      cultTick(s, c, 60_000, now); now += 60_000; minutes--;
      while (canMinorBreakthrough(s, c).ok) minorBreakthrough(s, c);
      if (isFinalStage(s)) {

        if (canAttemptMajor(s, c)) { const r = majorBreakthrough(s, c, { now }); if (r.ok && r.success) realmsLog.push({ realm: s.character.realm, day }); }
        else {
          // a trial or tribulation still unfought: fight it when the player can
          for (const r of majorRequirements(s, c)) if (!r.met && (r.kind === "trial" || r.kind === "tribulation")) {
            const src: EncounterSource = r.kind === "tribulation" ? { kind: "tribulation", id: r.id! } : { kind: "dungeon", id: r.id! };
            if (probe(s, src, now, 2) >= 0.5) { const f = fight(g, s, src, now); cur.fights++; if (!f.won) cur.losses++; }
            else cur.waitedFor[r.kind] = (cur.waitedFor[r.kind] ?? 0) + 1;
          }
        }
      }
      // tournaments and dungeons the player can enter and expects to win (free of energy: tournaments; dungeons once a day each)
      if (minutes % 30 === 0) {
        for (const t of c.byPrefix<any>("tournament")) {
          if (s.progress.trialsCleared[t.id] || !canEnterTournament(s, c, t.id, now).ok) continue;
          if (probe(s, { kind: "tournament", id: t.id }, now, 2) < 0.5) continue;
          for (let r = 0; r < (t.rounds?.length ?? 3) + 1 && !s.progress.trialsCleared[t.id]; r++) { const f = fight(g, s, { kind: "tournament", id: t.id }, now); cur.fights++; if (!f.won) { cur.losses++; break; } }
        }
        // secret realms: a full run when open and winnable (trials, chests, events, the realm merchant, the exit)
        for (const d of c.byPrefix<any>("dungeon").filter((x) => x.kind === "secret_realm")) {
          const chk = canEnterRealm(s, c, d.id, now); if (!chk.ok) continue;
          if (!realmRun(s, d.id)) {
            // can the player beat the realm's first trial? probe on a copy that has entered
            const first = d.realm_nodes!.find((n: any) => n.waves?.length);
            const copy: GameState = structuredClone(s); copy.resources.energy.value = 1e6; enterRealm(copy, c, d.id, now);
            if (first && probe(copy, { kind: "realm", id: d.id, node: first.key }, now, 2) < 0.5) continue;
          }
          if (!g.run("realm", now, (x, cc) => enterRealm(x, cc, d.id, now)).ok) continue;
          for (let step = 0; step < 40 && realmRun(s, d.id); step++) {
            const open = d.realm_nodes!.filter((n: any) => realmNodeState(s, c, d.id, n.key) === "open");
            const pick = open.find((n: any) => n.kind !== "exit") ?? open[0]; if (!pick) break;
            if (pick.waves?.length) { const f = fight(g, s, { kind: "realm", id: d.id, node: pick.key }, now); cur.fights++; if (!f.won) { cur.losses++; break; } continue; }
            const r = g.run("realm", now, (x, cc) => realmInteract(x, cc, d.id, pick.key, now, 0));
            if (!r.ok) break;
            if (r.shop) cur.stonesSpent += shop(g, s, now);
            if (r.battle?.length) { const f = fight(g, s, { kind: "realm", id: d.id, node: pick.key, enemies: r.battle }, now); cur.fights++; if (!f.won) { cur.losses++; break; } }
          }
        }
        for (const d of c.byPrefix<any>("dungeon")) {
          if (d.kind === "tower" || d.kind === "secret_realm") continue;
          const src: EncounterSource = { kind: "dungeon", id: d.id };
          if (!canStart(s, c, src, now).ok || (s.daily.counters[`dungeon:${d.id}`] ?? 0) > 0) continue;
          if (energyNow(s, c, now) < d.entry.energy_cost || probe(s, src, now, 2) < 0.5) continue;
          const f = fight(g, s, src, now); cur.fights++; cur.energySpent += d.entry.energy_cost; if (!f.won) cur.losses++;
        }
      }
      // gear, alchemy and technique upkeep
      equipBest(s, c);
      cur.stonesSpent += enhanceAll(s, plusCap(region));
      if (minutes % 15 === 0) { tidy(g, s, now); cur.stonesSpent += shop(g, s, now); cur.stonesSpent += alchemy(g, s, now); cur.stonesSpent += enhanceAll(s, plusCap(region)); }
      const reg = regions[region - 1]!;
      // tap every open place that is not a fight (gathering, chests, meditation spots, events): they open the map;
      // gathering spots in every discovered region are revisited when their cooldown is over (herbs for alchemy)
      for (const r of regions) for (const n of c.nodesOf(r.id)) {
        if (!s.progress.regions[r.id] || n.waves?.length) continue;
        if (r.order !== region && minutes % 15 !== 0) continue;
        const st = nodeState(s, c, n);
        if (st !== "reachable" && !(st === "cleared" && n.gather)) continue;
        const act = n.gather ? gather : n.chest ? openChest : n.cultivation ? meditateAt : n.event ? ((x: GameState, cc: ContentIndex, t: number, id: string) => resolveEvent(x, cc, t, id, 0)) : null;
        if (act) g.run("node", now, (x, cc) => act(x, cc, now, n.id));
      }
      // spend energy: the region boss if beatable, else the best node the player wins reliably
      const en = energyNow(s, c, now);
      if (en < 4) { cur.waitedFor.energy = (cur.waitedFor.energy ?? 0) + 1; continue; }
      const nodes = c.nodesOf(reg.id).filter((n) => n.waves?.length && ["reachable", "cleared"].includes(nodeState(s, c, n)));
      const boss = nodes.find((n) => n.kind === "boss");
      let target: MapNode | undefined;
      // an active quest still asking for this boss (the Sovereign quest opens at a realm stage the player may reach after
      // the first kill): fight it again, as a player following the quest log does
      const questWantsBoss = boss && c.byPrefix<any>("quest").some((q) => s.progress.quests.active[q.id] && questProgress(s, c, q).some((p, i) => !p.done && boss.waves!.flat().includes(q.objectives[i].target)));
      if (boss && (!s.progress.regions[reg.id]?.nodes[boss.id]?.clears || questWantsBoss) && canStart(s, c, { kind: "node", id: boss.id }, now).ok && probe(s, { kind: "node", id: boss.id }, now) >= 0.5) target = boss;
      // a breakthrough material still missing: farm the place that drops it (a boss of an earlier region, usually)
      if (!target && isFinalStage(s)) {
        const w = wanted(s);
        // enhancement materials are bought, not farmed
        for (const slot of EQUIP_SLOTS) { const uid = s.equipped[slot]; if (uid !== undefined) for (const q of enhanceCost(c, s.inventory.gear[uid]!)?.items ?? []) w.delete(q.id); }
        outer: for (const id of w.keys()) for (const lt of c.byPrefix<any>("loot")) {
          if (!lt.entries.some((x: any) => x.id === id) && !lt.guaranteed.some((x: any) => x.id === id)) continue;
          const dropper = [...c.byPrefix<any>("enemy"), ...c.byPrefix<any>("boss")].find((e) => e.loot === lt.id); if (!dropper) continue;
          for (const r of regions) if (s.progress.regions[r.id]) for (const n of c.nodesOf(r.id)) if (n.waves?.flat().includes(dropper.id) && ["reachable", "cleared"].includes(nodeState(s, c, n)) && (n.replayable !== false) && probe(s, { kind: "node", id: n.id }, now, 2) >= 0.5) { target = n; { const k = `farm:${id.split(".")[1] ?? id}`; cur.waitedFor[k] = (cur.waitedFor[k] ?? 0) + 1; } break outer; }
        }
      }
      // explore: every place not yet cleared opens the map toward the throne (a player clears the region once first)
      if (!target) {
        const unexplored = nodes.filter((n) => n.kind !== "boss" && !s.progress.regions[reg.id]?.nodes[n.id]?.clears).sort((a, b) => a.rec_cp - b.rec_cp);
        for (const n of unexplored) if (probe(s, { kind: "node", id: n.id }, now, 3) >= 0.5) { target = n; break; }
      }
      if (!target) {
        const farm = nodes.filter((n) => n.kind !== "boss").sort((a, b) => b.rec_cp - a.rec_cp);
        for (const n of farm) if (probe(s, { kind: "node", id: n.id }, now, 3) >= 0.67) { target = n; break; }
        if (!target) target = farm[farm.length - 1];
      }
      if (!target || en < target.energy_cost) { cur.waitedFor.energy = (cur.waitedFor.energy ?? 0) + 1; continue; }
      const before = s.resources.spirit_stones;
      const f = fight(g, s, { kind: "node", id: target.id }, now);
      cur.fights++; cur.energySpent += target.energy_cost; if (!f.won) cur.losses++;
      quests(g, s, now);
      cur.stonesEarned += Math.max(0, s.resources.spirit_stones - before);
      // the boss fell: the region is done; the next one opens when its unlock allows (realm gate measured as waiting)
      if (target.kind === "boss" && f.won) {
        cur.bossDay = day;
        if (region === regions.length) { finishedDay = day; break; }
      }
      if (cur.bossDay !== null) {
        const next = regions[region]!;
        if (s.progress.regions[next.id] || checkUnlock(s, c, next.unlock as any).ok) {
          s.progress.regions[next.id] ??= { discoveredAt: now, nodes: {} };
          region++;
          cur = { region: next.id, order: region, arrivedDay: day, bossDay: null, cp: 0, realm: s.character.realm, stage: s.character.stage, stonesEarned: 0, stonesSpent: 0, energySpent: 0, fights: 0, losses: 0, plus: 0, waitedFor: {} };
          log.push(cur);
        } else cur.waitedFor.realm = (cur.waitedFor.realm ?? 0) + 1;
      }
      if (WATCH) { const have = s.inventory.stacks[WATCH] ?? 0; if (have !== watchLast) { console.log(`   [watch] day ${day} min ${minutes} ${WATCH.split(".")[1]} ${watchLast} → ${have} after ${target ? target.id : "?"} won=${f.won} realm ${s.character.realm.split(".")[1]} ${s.character.stage} needs ${majorRequirements(s, c).filter((r) => !r.met).map((r) => r.label).join(",")}`); watchLast = have; } }
      cur.cp = computeStats(s, c).cp; cur.realm = s.character.realm; cur.stage = s.character.stage;
      cur.plus = Math.round(EQUIP_SLOTS.reduce((a, sl) => a + (s.equipped[sl] !== undefined ? s.inventory.gear[s.equipped[sl]!]!.enhance : 0), 0) / EQUIP_SLOTS.length);
    }
    if (VERBOSE && day % 10 === 0) {
      console.log(`seed ${seed} day ${day}: region ${region} ${s.character.realm.split(".")[1]} ${s.character.stage} cp ${computeStats(s, c).cp} stones ${Math.round(s.resources.spirit_stones)} plus ${cur.plus} rank ${s.character.rank} furnace ${s.progress.crafting.furnace} prof ${s.progress.crafting.proficiency}`);
      console.log("   needs", majorRequirements(s, c).filter((r) => !r.met).map((r) => `${r.label} ${r.have}/${r.need}`).join(" · "));
      console.log("   wanted", [...wanted(s)].map(([k, v]) => `${k.split(".")[1]}:${v}(have ${s.inventory.stacks[k] ?? 0})`).join(" "));
      console.log("   bag", Object.entries(s.inventory.stacks).filter(([, v]) => v > 0).map(([k, v]) => `${k.split(".")[1]}:${v}`).join(" ").slice(0, 400));
      for (const r of c.byPrefix<any>("alchemy")) { const st = alchemyStatus(s, c, r); console.log("   recipe", r.id.split(".")[1], st.unlocked ? `ok batch ${st.maxBatch}` : st.reason); }
      console.log("   main", c.byPrefix<any>("quest").filter((q) => q.type === "main").map((q) => `${q.id.split(".")[2]}:${questStatus(s, c, q, now)}`).join(" "));
      console.log("   fame", s.resources.sect_fame, "quests", Object.entries(s.progress.quests.active).map(([id]) => { const q = c.get<any>(id); return `${id.split(".").slice(1).join(".")}[${questProgress(s, c, q).filter((p) => !p.done).map((p) => `${p.label} ${p.have}/${p.need}`).join("; ")}]`; }).join(" | ").slice(0, 700));
      const w = s.equipped.weapon; if (w !== undefined) { const gg = s.inventory.gear[w]!; const cost = enhanceCost(c, gg); console.log("   weapon", gg.base, gg.rarity, gg.ilvl, "+" + gg.enhance, "cost", JSON.stringify(cost), "have", cost?.items.map((q) => `${q.id}:${s.inventory.stacks[q.id] ?? 0}`).join(",")); }
    }
  }
  return { seed, days: DAYS, finishedDay, regions: log, realms: realmsLog };
}

const runs: Journey[] = [];
for (let seed = 1; seed <= SEEDS; seed++) { console.log(`seed ${seed}…`); runs.push(run(seed)); }
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(runs, null, 1));

// ---- report: medians across seeds ----
const med = (xs: number[]) => { const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)]! : NaN; };
const lines = [`# Journey (${SEEDS} seeds · ${HOURS} h/day · ${DAYS} days max)`, "", "| region | arrive day | boss day | days here | realm · stage | CP | avg + | stones earned | spent | energy | fights (lost) | waited for |", "|---|---|---|---|---|---|---|---|---|---|---|---|"];
for (let i = 0; i < regions.length; i++) {
  const rows = runs.map((r) => r.regions[i]).filter((x): x is RegionLog => !!x);
  if (!rows.length) break;
  const arr = med(rows.map((r) => r.arrivedDay)), boss = med(rows.map((r) => r.bossDay ?? NaN));
  const waited = Object.entries(rows.reduce((a, r) => { for (const [k, v] of Object.entries(r.waitedFor)) a[k] = (a[k] ?? 0) + v / rows.length; return a; }, {} as Record<string, number>)).filter(([, v]) => v >= 1).map(([k, v]) => `${k} ${Math.round(v)}′`).join(" · ");
  lines.push(`| ${regions[i]!.id.split(".")[1]} | ${arr} | ${Number.isNaN(boss) ? "—" : boss} | ${Number.isNaN(boss) ? "—" : boss - arr} | ${rows[0]!.realm.split(".")[1]} · ${med(rows.map((r) => r.stage))} | ${Math.round(med(rows.map((r) => r.cp)))} | +${med(rows.map((r) => r.plus))} | ${Math.round(med(rows.map((r) => r.stonesEarned)))} | ${Math.round(med(rows.map((r) => r.stonesSpent)))} | ${Math.round(med(rows.map((r) => r.energySpent)))} | ${Math.round(med(rows.map((r) => r.fights)))} (${Math.round(med(rows.map((r) => r.losses)))}) | ${waited} |`);
}
lines.push("", `Finished (region 15 boss) on day: ${runs.map((r) => r.finishedDay ?? "not within " + DAYS).join(", ")}`);
lines.push("", "## Realms", "", "| realm | day reached (median) |", "|---|---|");
const realmDays = new Map<string, number[]>();
for (const r of runs) for (const x of r.realms) (realmDays.get(x.realm) ?? realmDays.set(x.realm, []).get(x.realm)!).push(x.day);
for (const [realm, days] of realmDays) lines.push(`| ${realm.split(".")[1]} | ${med(days)} |`);
const md = lines.join("\n");
writeFileSync(OUT.replace(/\.json$/, ".md"), md);
console.log(md);
