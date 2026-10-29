/**
 * Endless Tower and Secret Realms (dungeon kinds "tower" and "secret_realm").
 *
 * Tower: floors are generated from the tower block. Floor n's party power is rec_cp · growth^(n-1); its
 * enemies come from the pool (1 on floors 1–4, 2 up to floor 19, 3 beyond) and are scaled to that power;
 * every `boss_every` floors a Warden from the boss pool guards the floor alone. You climb one floor at a time
 * from your best (checkpoints), with no energy and no daily cap. Each floor pays the per-floor loot and
 * spirit stones that grow with the floor; milestones pay once.
 *
 * Secret realm: a saved run over a branching node map. Entering a new run costs the energy once; you can
 * leave and resume. Nodes open when connected to a cleared node. Battles carry HP across the run; chests,
 * events and hidden rooms are once per run; cultivation pools heal; the merchant is the realm's shop; the
 * exit opens after the guardian and pays the clear loot (and the first-clear rewards once).
 */
import type { ContentIndex, Dungeon, GameEvent } from "../content/index.ts";
import type { GameState } from "./state.ts";
import type { DomainEvent } from "./events.ts";
import type { ActionResult } from "./actions.ts";
import { grantRewards } from "./actions.ts";
import { checkUnlock } from "./unlock.ts";
import { energyNow, spendEnergy } from "./cultivation.ts";
import { rollTable, grantDrops } from "./loot.ts";
import { computeStats } from "./stats.ts";
import { weightedIndex } from "./rng.ts";

const fail = (reason: string) => ({ ok: false as const, reason });

// ---------- tower ----------

export interface TowerFloor { floor: number; enemies: string[]; boss: boolean; power: number; statMult: number; milestone?: { floor: number; rewards: any }; stones: number }

export const bestFloor = (s: GameState, id: string) => s.progress.dungeons[id]?.bestFloor ?? 0;

export function towerFloor(c: ContentIndex, d: Dungeon, n: number): TowerFloor {
  const t = d.tower!;
  const power = Math.round(d.rec_cp * Math.pow(t.cp_growth_per_floor, n - 1));
  const boss = n % t.boss_every === 0;
  let enemies: string[];
  if (boss) enemies = [t.boss_pool[(n / t.boss_every - 1) % t.boss_pool.length]!];
  else {
    const count = n < 5 ? 1 : n < 20 ? 2 : 3;
    enemies = Array.from({ length: count }, (_, i) => t.enemy_pool[(n * 7 + i * 3) % t.enemy_pool.length]!);
  }
  const natural = enemies.reduce((sum, id) => sum + (c.get<any>(id).cp ?? 1), 0);
  const statMult = power / Math.max(1, natural);
  const milestone = t.milestones.find((m) => m.floor === n);
  return { floor: n, enemies, boss, power, statMult, milestone, stones: Math.round(20 * Math.pow(n, 1.35)) };
}

export function canClimb(s: GameState, c: ContentIndex, id: string, floor: number): { ok: true } | { ok: false; reason: string } {
  const d = c.get<Dungeon>(id);
  if (d.kind !== "tower" || !d.tower) return fail("Not a tower");
  const u = checkUnlock(s, c, d.entry as any);
  if (!u.ok) return fail(u.reasons[0]!);
  const best = bestFloor(s, id);
  if (floor > d.tower.floors) return fail("You stand at the summit");
  if (floor !== best + 1) return fail(`Climb floor ${best + 1} next`);
  return { ok: true };
}

/** Rewards after winning a floor (called by the encounter). */
export function towerFloorCleared(s: GameState, c: ContentIndex, id: string, floor: number, now: number, events: DomainEvent[]): void {
  const d = c.get<Dungeon>(id);
  const f = towerFloor(c, d, floor);
  const rec = (s.progress.dungeons[id] ??= { clears: 0 });
  const best = floor > (rec.bestFloor ?? 0);
  rec.clears++;
  if (best) rec.bestFloor = floor;
  if (!rec.firstClearAt) rec.firstClearAt = now;
  if (d.rewards.per_wave) grantDrops(s, c, rollTable(s, c, d.rewards.per_wave), events);
  grantRewards(s, c, { spirit_stones: f.stones }, events);
  if (best && f.milestone) grantRewards(s, c, f.milestone.rewards, events);
  s.progress.counters[`tower_best:${id}`] = Math.max(s.progress.counters[`tower_best:${id}`] ?? 0, floor);
  events.push({ type: "tower_floor", dungeon: id, floor, best });
}

// ---------- secret realms ----------

type RNode = NonNullable<Dungeon["realm_nodes"]>[number];
export const realmRun = (s: GameState, id: string) => s.progress.realmRuns[id];

const ELEM = (word: string) => `elem.${word.toLowerCase()}`;
/** Hidden-room conditions are written as "<element> root or <element> technique equipped". */
export function hiddenMet(s: GameState, c: ContentIndex, cond: string): boolean {
  const root = c.get<any>(s.character.root).elements as string[];
  const techs = [...s.techniques.actives, s.techniques.ultimate].filter((t): t is string => !!t).map((t) => c.get<any>(t).element);
  return cond.split(/\s+or\s+/i).some((part) => {
    const m = /(\w+)\s+root/i.exec(part); if (m && root.includes(ELEM(m[1]!))) return true;
    const t = /(\w+)\s+technique/i.exec(part); if (t && techs.includes(ELEM(t[1]!))) return true;
    return false;
  });
}

export type RealmNodeState = "cleared" | "open" | "locked" | "hidden";

export function realmNodeState(s: GameState, c: ContentIndex, id: string, key: string): RealmNodeState {
  const d = c.get<Dungeon>(id);
  const run = realmRun(s, id);
  const n = d.realm_nodes!.find((x) => x.key === key)!;
  if (n.kind === "hidden" && !(run?.found.includes(key)) && !(n.hidden && hiddenMet(s, c, n.hidden.condition))) return "hidden";
  if (!run) return key === d.realm_nodes![0]!.key ? "open" : "locked";
  if (run.cleared.includes(key)) return "cleared";
  if (key === d.realm_nodes![0]!.key) return "open";
  if (n.kind === "exit") return d.realm_nodes!.filter((x) => x.kind === "boss").every((b) => run.cleared.includes(b.key)) ? "open" : "locked";
  return n.connections.some((k) => run.cleared.includes(k)) || d.realm_nodes!.some((o) => o.connections.includes(key) && run.cleared.includes(o.key)) ? "open" : "locked";
}

export function realmSummary(s: GameState, c: ContentIndex, id: string) {
  const d = c.get<Dungeon>(id);
  const run = realmRun(s, id);
  const trials = d.realm_nodes!.filter((n) => n.waves?.length);
  const hidden = d.realm_nodes!.filter((n) => n.kind === "hidden");
  return {
    trials: trials.length, trialsDone: trials.filter((n) => run?.cleared.includes(n.key)).length,
    hidden: hidden.length, hiddenFound: hidden.filter((n) => run?.found.includes(n.key) || run?.cleared.includes(n.key)).length,
  };
}

export function canEnterRealm(s: GameState, c: ContentIndex, id: string, now: number): { ok: true; resume: boolean; energy: number } | { ok: false; reason: string } {
  const d = c.get<Dungeon>(id);
  if (d.kind !== "secret_realm") return fail("Not a secret realm");
  if (realmRun(s, id)) return { ok: true, resume: true, energy: 0 };
  const u = checkUnlock(s, c, d.entry as any);
  if (!u.ok) return fail(u.reasons[0]!);
  if (energyNow(s, c, now) < d.entry.energy_cost) return fail(`Needs ${d.entry.energy_cost} energy`);
  return { ok: true, resume: false, energy: d.entry.energy_cost };
}

/** Enter (or resume) a realm run. */
export function enterRealm(s: GameState, c: ContentIndex, id: string, now: number): ActionResult<{ resume: boolean }> {
  const chk = canEnterRealm(s, c, id, now);
  if (!chk.ok) return fail(chk.reason);
  if (chk.resume) return { ok: true, events: [], resume: true };
  if (chk.energy) { const sp = spendEnergy(s, c, now, chk.energy); if (!sp.ok) return fail(sp.reason); }
  const d = c.get<Dungeon>(id);
  s.progress.realmRuns[id] = { startedAt: now, at: d.realm_nodes![0]!.key, cleared: [], found: [], stones: 0, items: [], gear: [] };
  return { ok: true, events: [{ type: "energy_spent", amount: chk.energy }, { type: "realm_entered", dungeon: id }], resume: false };
}

/** Give up the run (progress and run loot already granted stay with you). */
export function abandonRealm(s: GameState, id: string): ActionResult {
  if (!realmRun(s, id)) return fail("No run in progress");
  delete s.progress.realmRuns[id];
  return { ok: true, events: [] };
}

function node(c: ContentIndex, id: string, key: string): RNode { const n = c.get<Dungeon>(id).realm_nodes!.find((x) => x.key === key); if (!n) throw new Error(`realm node ${key}`); return n; }

function requireOpen(s: GameState, c: ContentIndex, id: string, key: string): string | null {
  if (!realmRun(s, id)) return "Enter the realm first";
  const st = realmNodeState(s, c, id, key);
  if (st === "cleared") return "Already done";
  if (st === "locked") return "Not reachable yet";
  if (st === "hidden") return "You sense nothing here";
  return null;
}

function track(run: NonNullable<ReturnType<typeof realmRun>>, drops: { items: { id: string; qty: number }[]; spirit_stones: number }, gearUids: number[]) {
  run.stones += drops.spirit_stones;
  for (const it of drops.items) { const x = run.items.find((y) => y.id === it.id); if (x) x.qty += it.qty; else run.items.push({ ...it }); }
  run.gear.push(...gearUids);
}

function markCleared(s: GameState, id: string, key: string, kind: string, events: DomainEvent[]): void {
  const run = realmRun(s, id)!;
  if (!run.cleared.includes(key)) run.cleared.push(key);
  if (kind === "hidden" && !run.found.includes(key)) run.found.push(key);
  run.at = key;
  events.push({ type: "realm_node", dungeon: id, node: key, kind });
}

/** Non-battle nodes: chest, cultivation pool, merchant (marks visited), event/hidden (choice), exit. */
export function realmInteract(s: GameState, c: ContentIndex, id: string, key: string, now: number, choice = 0): ActionResult<{ text?: string; battle?: string[]; shop?: string; finished?: boolean }> {
  const err = requireOpen(s, c, id, key);
  if (err) return fail(err);
  const n = node(c, id, key);
  const run = realmRun(s, id)!;
  const events: DomainEvent[] = [];
  switch (n.kind) {
    case "chest": {
      const drops = rollTable(s, c, n.chest!);
      const { gearUids } = grantDrops(s, c, drops, events);
      track(run, drops, gearUids);
      markCleared(s, id, key, n.kind, events);
      return { ok: true, events, text: "The seal breaks and the vault opens." };
    }
    case "cultivation": {
      delete run.hp;
      s.character.hp = undefined;
      markCleared(s, id, key, n.kind, events);
      return { ok: true, events, text: "You sit by the pool; your wounds close and your qi settles." };
    }
    case "merchant": {
      markCleared(s, id, key, n.kind, events);
      return { ok: true, events, shop: n.shop };
    }
    case "event": case "hidden": {
      if (!n.event) { markCleared(s, id, key, n.kind, events); return { ok: true, events, text: "A quiet room. You rest a moment." }; }
      const ev = c.get<GameEvent>(n.event);
      const ch = ev.choices[choice];
      if (!ch) return fail("Choose an option");
      const o = ch.outcomes[Math.max(0, weightedIndex(s.rng, ch.outcomes.map((x) => x.chance)))]!;
      if (o.rewards) grantRewards(s, c, o.rewards as any, events);
      if (o.root_transform && c.has(o.root_transform)) { s.character.root = o.root_transform; events.push({ type: "unlock", id: o.root_transform }); }
      if (n.kind === "hidden" && !run.found.includes(key)) run.found.push(key);
      if (o.battle?.length) return { ok: true, events, text: o.text, battle: o.battle };
      markCleared(s, id, key, n.kind, events);
      return { ok: true, events, text: o.text };
    }
    case "exit": return finishRealm(s, c, id, now);
    default: return fail("Fight to pass");
  }
}

/** Battle outcome for a realm node (the encounter calls this). `won` false keeps the node open. */
export function realmBattleDone(s: GameState, id: string, key: string, kind: string, won: boolean, hp: number, events: DomainEvent[]): void {
  const run = realmRun(s, id);
  if (!run) return;
  run.hp = Math.max(1, hp);
  if (won) markCleared(s, id, key, kind, events);
}

export function trackRealmLoot(s: GameState, id: string, drops: { items: { id: string; qty: number }[]; spirit_stones: number }, gearUids: number[]): void {
  const run = realmRun(s, id);
  if (run) track(run, drops, gearUids);
}

function finishRealm(s: GameState, c: ContentIndex, id: string, now: number): ActionResult<{ finished: boolean; text: string }> {
  const d = c.get<Dungeon>(id);
  const events: DomainEvent[] = [];
  const rec = (s.progress.dungeons[id] ??= { clears: 0 });
  const first = rec.clears === 0;
  rec.clears++;
  const drops = rollTable(s, c, d.rewards.clear);
  grantDrops(s, c, drops, events);
  if (first) { rec.firstClearAt = now; grantRewards(s, c, d.rewards.first_clear as any, events); }
  s.progress.trialsCleared[id] = now;
  delete s.progress.realmRuns[id];
  events.push({ type: "dungeon_cleared", dungeon: id, first });
  return { ok: true, events, finished: true, text: first ? "The realm seals behind you. Its first treasures are yours." : "You step out of the realm, richer than you entered." };
}

/** Recommended power check shown on cards. */
export const playerCp = (s: GameState, c: ContentIndex) => computeStats(s, c).cp;
