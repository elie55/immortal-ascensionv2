/**
 * Balance simulation: seeded, deterministic measurements across all 15 regions / realms.
 *   node tools/balance/sim.ts [--seeds 16] [--out tools/balance/out/run.json] [--regions 1-15] [--quick]
 *
 * Archetypes (provisional, see docs/qa/BALANCE_MODEL.md):
 *   bare    – realm min of the region, stage 5, starting gear and technique (a rusher)
 *   fitted  – stage 5, gear from the previous region's band at that band's common drop rarity, +4,
 *             best learnable techniques at mastery 3, YunYun juvenile Lv 10
 *   geared  – stage 9 of the region's max realm, gear of this band at the band's high rarity, +10,
 *             best techniques at max mastery, best method, beast adult Lv 25
 * Per region: win rate and rounds vs normal / elite / boss nodes (real node waves through Encounter),
 * the region's dungeon(s), the realm's tribulation (fitted at stage 9), tower stall floor,
 * economy (stones per clear vs upgrade costs), cultivation time per realm, breakthrough-material drop odds.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { loadDatabase } from "../lib/load.ts";
import { ContentIndex, type ContentBundle, type Dungeon, type MapNode, type Region, type Realm } from "../../src/content/index.ts";
import { newGameState, type GameState } from "../../src/engine/state.ts";
import { makePlayer as mk, regionsOf, band, rrange, rIdx, T0, type Arch } from "./sim_lib.ts";
import { Encounter, type EncounterSource } from "../../src/engine/encounter.ts";
import { computeStats } from "../../src/engine/stats.ts";
import { qiNeeded } from "../../src/engine/cultivation.ts";
import { towerFloor } from "../../src/engine/delves.ts";
import { enhanceCost } from "../../src/engine/crafting.ts";
import { rollTable } from "../../src/engine/loot.ts";
import { seedRng } from "../../src/engine/rng.ts";
import { RARITIES } from "../../schema/common.ts";


const args = process.argv.slice(2);
const arg = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1]! : d; };
const SEEDS = Number(arg("--seeds", "16"));
const OUT = arg("--out", "tools/balance/out/run.json");
const QUICK = args.includes("--quick");
const [R_LO, R_HI] = arg("--regions", "1-15").split("-").map(Number) as [number, number];

const ROOT = join(import.meta.dirname, "../..");
const db = loadDatabase(ROOT);
const entities: Record<string, any> = {};
for (const [id, e] of db.registry) entities[id] = e.data;
const c = new ContentIndex({ version: 1, builtAt: "sim", entities, singletons: db.singletons } as ContentBundle);
const makePlayer = (n: number, arch: Arch, seed: number, stageOverride?: number) => mk(c, n, arch, seed, stageOverride);
const regions = regionsOf(c);
const realmOrder = (id: string) => c.get<Realm>(id).order;
const BASES: Record<string, string> = (() => { const out: Record<string, string> = {}; for (const slot of ["weapon"]) { const list = c.byPrefix<any>("gear").filter((b) => b.slot === slot && b.droppable && !b.unique).sort((a, b) => a.main_value - b.main_value); out[slot] = list[Math.floor(list.length / 2)]!.id; } return out; })();

function fight(s: GameState, src: EncounterSource): { won: boolean; rounds: number; hpLeft: number } {
  const st = Encounter.start(s, c, src, T0);
  if (!st.ok) throw new Error(`cannot start ${JSON.stringify(src)}: ${st.reason}`);
  const enc = st.encounter;
  let rounds = 0;
  while (!enc.done) {
    enc.battle!.run();
    const sum = enc.battle!.summary();
    rounds += sum.rounds;
    const wr = enc.settleWave(T0);
    if (wr.summary.result !== "victory") break;
    if (enc.hasNextWave) enc.nextWave();
  }
  const maxHp = computeStats(s, c).total.hp ?? 1;
  return { won: enc.done!.won, rounds, hpLeft: (s.character.hp ?? maxHp) / maxHp };
}

interface Agg { n: number; wins: number; rounds: number; hp: number }
const agg = (): Agg => ({ n: 0, wins: 0, rounds: 0, hp: 0 });
const addr = (a: Agg, r: { won: boolean; rounds: number; hpLeft: number }) => { a.n++; if (r.won) { a.wins++; a.hp += r.hpLeft; } a.rounds += r.rounds; };
const pct = (a: Agg) => a.n ? Math.round(100 * a.wins / a.n) : null;
const fmtAgg = (a: Agg) => a.n ? `${pct(a)}% (${(a.rounds / a.n).toFixed(1)}r${a.wins ? `, hp ${Math.round(100 * a.hp / a.wins)}%` : ""})` : "—";

function runRegion(n: number) {
  const reg = regions[n - 1]!;
  const nodes = c.nodesOf(reg.id).filter((x) => x.waves?.length);
  const kinds: Record<string, MapNode[]> = { normal: nodes.filter((x) => x.kind === "battle"), elite: nodes.filter((x) => x.kind === "elite"), boss: nodes.filter((x) => x.kind === "boss") };
  const dungeons = c.byPrefix<Dungeon>("dungeon").filter((d) => d.waves && c.art(d.id, "card")?.includes(`/${reg.id.split(".")[1]}`) || d.waves && d.waves.some((w) => w.enemies.some((e) => kinds.normal.some((nd) => nd.waves!.flat().includes(e)))));
  const res: any = { region: reg.id, order: n, realm: reg.realm_range.min, cp: {}, battles: {}, dungeons: {}, tribulation: {}, tower: {} };
  const archs: Arch[] = QUICK ? ["fitted"] : ["bare", "fitted", "geared"];
  for (const arch of archs) {
    const probe = makePlayer(n, arch, 1);
    res.cp[arch] = computeStats(probe, c).cp;
    const out: Record<string, Agg> = { normal: agg(), elite: agg(), boss: agg() };
    for (const [kind, list] of Object.entries(kinds)) for (const node of list) for (let seed = 1; seed <= SEEDS; seed++) {
      const s = makePlayer(n, arch, seed * 31 + node.id.length);
      addr(out[kind]!, fight(s, { kind: "node", id: node.id }));
    }
    res.battles[arch] = Object.fromEntries(Object.entries(out).map(([k, a]) => [k, { win: pct(a), rounds: a.n ? +(a.rounds / a.n).toFixed(1) : null, hp: a.wins ? Math.round(100 * a.hp / a.wins) : null, n: a.n, text: fmtAgg(a) }]));
    // dungeons that live in this region (by enemy overlap)
    for (const d of dungeons) {
      const a = agg();
      for (let seed = 1; seed <= Math.max(4, SEEDS / 2); seed++) {
        const s = makePlayer(n, arch, seed * 17);
        for (const q of d.entry.quests ?? []) s.progress.quests.completed[q] = 1;
        if (d.entry.rank) s.character.rank = d.entry.rank; if (d.entry.sect_fame) s.resources.sect_fame = d.entry.sect_fame;
        for (const dd of d.entry.dungeons_cleared ?? []) s.progress.dungeons[dd] = { clears: 1 };
        if (d.entry.party.companions_allowed) { s.relations["npc.bai_lingshuang"] = { affinity: 1000, giftsToday: 0, topics: [] }; s.companions.bonded = ["npc.bai_lingshuang"]; s.companions.active = ["npc.bai_lingshuang"]; }
        s.character.realm = d.entry.realm ? (realmOrder(d.entry.realm.id) > realmOrder(s.character.realm) ? d.entry.realm.id : s.character.realm) : s.character.realm;
        if (d.entry.realm && realmOrder(d.entry.realm.id) >= realmOrder(s.character.realm)) s.character.stage = Math.max(s.character.stage, d.entry.realm.stage ?? 1);
        s.progress.realmsEntered = c.realms.filter((r) => r.order <= realmOrder(s.character.realm)).map((r) => r.id);
        addr(a, fight(s, { kind: "dungeon", id: d.id }));
      }
      (res.dungeons[arch] ??= {})[d.id] = { win: pct(a), rounds: a.n ? +(a.rounds / a.n).toFixed(1) : null, text: fmtAgg(a) };
    }
  }
  // tribulation of the region's max realm (fitted, stage 9 of that realm)
  const trib = c.byPrefix<any>("tribulation").find((t) => t.realm === reg.realm_range.max);
  if (trib && !QUICK) {
    for (const arch of ["fitted", "geared"] as Arch[]) {
      const a = agg();
      for (let seed = 1; seed <= SEEDS; seed++) {
        const s = makePlayer(n, arch, seed * 7, 9);
        s.character.realm = reg.realm_range.max; s.progress.realmsEntered = c.realms.filter((r) => r.order <= realmOrder(reg.realm_range.max)).map((r) => r.id);
        addr(a, fight(s, { kind: "tribulation", id: trib.id }));
      }
      res.tribulation[arch] = { id: trib.id, win: pct(a), text: fmtAgg(a) };
    }
  }
  // tower stall (fitted): climb until the first loss, 3 seeds
  if (!QUICK) {
    const tower = c.byPrefix<Dungeon>("dungeon").find((d) => d.kind === "tower")!;
    for (const arch of ["fitted", "geared"] as Arch[]) {
      const stalls: number[] = [];
      for (let seed = 1; seed <= 3; seed++) {
        const s = makePlayer(n, arch, seed * 5);
        let f = 1;
        while (f <= tower.tower!.floors) { const r = fight(s, { kind: "tower", id: tower.id, floor: f }); if (!r.won) break; s.character.hp = undefined; f++; }
        stalls.push(f - 1);
      }
      stalls.sort((a, b) => a - b);
      res.tower[arch] = { stall: stalls[1], recAt: towerFloor(c, tower, Math.max(1, stalls[1]!)).power };
    }
  }
  return res;
}

// ---------- cultivation and economy (analytic) ----------

function cultivation() {
  const rows: any[] = [];
  for (const r of c.realms) {
    const m1 = c.rules.minutes_for_stage1[r.order - 1]!;
    let minutes = 0; for (let st = 1; st <= 9; st++) minutes += m1 * Math.pow(r.qi.stage_growth, st - 1);
    rows.push({ realm: r.id, order: r.order, idle_hours: +(minutes / 60).toFixed(1), optimized_hours: +(minutes / 60 / (1.4 * 1.65 * 1.25 * 1.1)).toFixed(1), stage9_qi: qiNeeded(r, 9), offline_12h_share: +(12 * 60 * 0.8 / minutes).toFixed(2) });
  }
  return rows;
}

function economy() {
  const rows: any[] = [];
  for (const reg of regions) {
    const n = reg.order;
    const nodes = c.nodesOf(reg.id).filter((x) => x.kind === "battle" && x.waves?.length);
    let stones = 0, k = 0, energy = 0;
    const s = newGameState(c, T0, { seed: 99 });
    for (const nd of nodes) for (let i = 0; i < 40; i++) { for (const e of nd.waves!.flat()) { const loot = c.get<any>(e).loot; if (loot) stones += rollTable(s, c, loot).spirit_stones; } k++; energy += nd.energy_cost; }
    const perClear = stones / Math.max(1, k), energyPerClear = energy / Math.max(1, k);
    const clearsPerDay = (100 + 24 * 60 / c.rules.energy.regen_minutes) / Math.max(1, energyPerClear);
    const [blo, bhi] = band(n); const [rlo, rhi] = rrange(n);
    const rarity = RARITIES[Math.min(rIdx(rlo) + 1, rIdx(rhi))]!;
    let enh10 = 0; { const g: any = { base: BASES.weapon, rarity, ilvl: blo, enhance: 0, main: { stat: "atk", roll: 1, value: 1 }, affixes: [], specials: [], awakened: false }; for (let l = 0; l < 10; l++) { const cst = enhanceCost(c, g)!; enh10 += cst.stones; g.enhance++; } }
    const techs = c.byPrefix<any>("shop").flatMap((sh: any) => sh.stock).filter((e: any) => e.id?.startsWith("tech.") && c.get<any>(e.id).requirements?.realm?.id === reg.realm_range.min).map((e: any) => e.price);
    const tech = techs.length ? Math.round(techs.reduce((a: number, b: number) => a + b, 0) / techs.length) : null;
    const pill = c.byPrefix<any>("shop").flatMap((sh: any) => sh.stock).find((e: any) => e.id === "cons.qi_gathering_pill")?.price ?? null;
    rows.push({ region: reg.id, order: n, stones_per_clear: +perClear.toFixed(1), energy_per_clear: +energyPerClear.toFixed(1), clears_per_day: Math.round(clearsPerDay), stones_per_day: Math.round(perClear * clearsPerDay), enhance_weapon_to_10: enh10, days_for_8_slots_plus10: +((enh10 * 8) / Math.max(1, perClear * clearsPerDay)).toFixed(1), region_tech_price: tech, qi_pill: pill, mat_sell: c.byPrefix<any>("mat").filter((m) => m.tags?.includes(reg.id.split(".")[1]))[0]?.sell_value ?? null });
  }
  return rows;
}

function breakthroughMats() {
  const rows: any[] = [];
  for (const r of c.realms) {
    const next = c.nextRealm(r.id);
    if (!next) continue;
    for (const q of next.major_breakthrough.requirements) {
      const sources: string[] = [];
      let bestPerClear = 0;
      for (const lt of c.byPrefix<any>("loot")) {
        const ent = lt.entries.find((e: any) => e.id === q.id); const g = lt.guaranteed.find((e: any) => e.id === q.id);
        if (!ent && !g) continue;
        const per = g ? g.qty : ent.chance * (ent.qty[0] + ent.qty[1]) / 2;
        const users = [...c.byPrefix<any>("enemy"), ...c.byPrefix<any>("boss")].filter((e) => e.loot === lt.id).map((e) => e.id).concat(c.byPrefix<any>("node").filter((nd) => nd.chest === lt.id).map((nd) => nd.id), c.byPrefix<any>("dungeon").filter((d) => d.rewards.clear === lt.id || d.rewards.per_wave === lt.id).map((d) => d.id));
        sources.push(`${lt.id} (${per.toFixed(2)}/roll via ${users.slice(0, 2).join(", ")}${users.length > 2 ? "…" : ""})`);
        bestPerClear = Math.max(bestPerClear, per);
      }
      const shops = c.byPrefix<any>("shop").filter((sh) => sh.stock.some((e: any) => e.id === q.id)).map((sh) => sh.id);
      const alch = c.byPrefix<any>("alchemy").filter((a) => a.output.id === q.id).map((a) => a.id);
      const quests = c.byPrefix<any>("quest").filter((qq) => qq.rewards.items?.some((it: any) => it.id === q.id)).map((qq) => qq.id);
      rows.push({ to: next.id, item: q.id, qty: q.qty, best_per_clear: +bestPerClear.toFixed(3), clears_needed: bestPerClear ? Math.ceil(q.qty / bestPerClear) : null, loot: sources, shops, alchemy: alch, quests });
    }
  }
  return rows;
}

const t0 = Date.now();
const result: any = { seeds: SEEDS, generatedAt: new Date().toISOString(), regions: [], cultivation: cultivation(), economy: economy(), breakthrough: breakthroughMats() };
for (let n = R_LO; n <= R_HI; n++) { const r = runRegion(n); result.regions.push(r); console.error(`region ${n} done (${((Date.now() - t0) / 1000).toFixed(0)}s)`); }
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 1));

// ---------- summary ----------
const lines: string[] = [];
lines.push(`# Balance simulation (${SEEDS} seeds/battle, ${new Date().toISOString().slice(0, 16)})`, "");
lines.push("| # | region | realm | arch | CP | normal | elite | boss | dungeons | tribulation | tower stall |", "|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of result.regions) for (const arch of Object.keys(r.battles)) {
  const b = r.battles[arch];
  const d = Object.entries(r.dungeons[arch] ?? {}).map(([id, v]: any) => `${id.split(".")[1]} ${v.text}`).join("<br>");
  lines.push(`| ${r.order} | ${r.region.split(".")[1]} | ${r.realm.split(".")[1]} | ${arch} | ${r.cp[arch]} | ${b.normal.text} | ${b.elite.text} | ${b.boss.text} | ${d || "—"} | ${r.tribulation[arch]?.text ?? "—"} | ${r.tower[arch] ? `${r.tower[arch].stall} (rec ${r.tower[arch].recAt})` : "—"} |`);
}
lines.push("", "## Cultivation (hours per realm, stages 1→9)", "", "| realm | idle h | optimized h | 12h offline covers |", "|---|---|---|---|");
for (const r of result.cultivation) lines.push(`| ${r.realm.split(".")[1]} | ${r.idle_hours} | ${r.optimized_hours} | ${Math.round(r.offline_12h_share * 100)}% |`);
lines.push("", "## Economy", "", "| region | stones/clear | energy/clear | clears/day | stones/day | weapon +10 | days for 8×+10 | region tech price |", "|---|---|---|---|---|---|---|---|");
for (const r of result.economy) lines.push(`| ${r.region.split(".")[1]} | ${r.stones_per_clear} | ${r.energy_per_clear} | ${r.clears_per_day} | ${r.stones_per_day} | ${r.enhance_weapon_to_10} | ${r.days_for_8_slots_plus10} | ${r.region_tech_price ?? "—"} |`);
lines.push("", "## Breakthrough materials", "", "| to realm | item | qty | best/clear | clears | sources |", "|---|---|---|---|---|---|");
for (const r of result.breakthrough) lines.push(`| ${r.to.split(".")[1]} | ${r.item} | ${r.qty} | ${r.best_per_clear} | ${r.clears_needed ?? "none"} | ${[...r.loot, ...r.shops.map((x: string) => `shop ${x}`), ...r.alchemy.map((x: string) => `alchemy ${x}`), ...r.quests.map((x: string) => `quest ${x}`)].join("; ").slice(0, 160)} |`);
writeFileSync(OUT.replace(/\.json$/, ".md"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
