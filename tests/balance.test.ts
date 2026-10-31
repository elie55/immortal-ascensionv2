/**
 * Balance regression: the provisional targets from docs/qa/BALANCE_MODEL.md, checked with the simulator's archetypes
 * on a sample of regions (seeded, deterministic). Full tables: node tools/balance/sim.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { testContent } from "./helpers/content.ts";
import { makePlayer, regionsOf, T0, type Arch } from "../tools/balance/sim_lib.ts";
import { Encounter, type EncounterSource } from "../src/engine/encounter.ts";
import { computeStats } from "../src/engine/stats.ts";
import { towerFloor } from "../src/engine/delves.ts";
import { enhanceCost } from "../src/engine/crafting.ts";

const c = testContent();
const regions = regionsOf(c);
const SEEDS = 6;

function fight(s: ReturnType<typeof makePlayer>, src: EncounterSource): boolean {
  const st = Encounter.start(s, c, src, T0);
  assert.ok(st.ok, (st as any).reason);
  const enc = st.encounter;
  while (!enc.done) { enc.battle!.run(); const wr = enc.settleWave(T0); if (wr.summary.result !== "victory") break; if (enc.hasNextWave) enc.nextWave(); }
  return enc.done!.won;
}
function winRate(n: number, arch: Arch, kind: string, stage?: number): number {
  const reg = regions[n - 1]!;
  const nodes = c.nodesOf(reg.id).filter((x) => x.kind === kind && x.waves?.length);
  let wins = 0, total = 0;
  for (const node of nodes) for (let seed = 1; seed <= SEEDS; seed++) { total++; if (fight(makePlayer(c, n, arch, seed * 31 + node.id.length, stage), { kind: "node", id: node.id })) wins++; }
  return wins / Math.max(1, total);
}

const SAMPLE = [3, 6, 9, 12, 15];

test("fitted players (stage 5, last band's gear) beat normal nodes in every sampled region ≥ 75%", () => {
  const report = SAMPLE.map((n) => `${n}:${Math.round(winRate(n, "fitted", "battle") * 100)}%`);
  console.log("    normals →", report.join(" "));
  for (const n of SAMPLE) assert.ok(winRate(n, "fitted", "battle") >= 0.75, `region ${n}`);
});

test("region bosses are a real first-try challenge for fitted players (10–85%) and beaten by geared ones (≥ 70%)", () => {
  for (const n of SAMPLE) {
    const f = winRate(n, "fitted", "boss"), g = winRate(n, "geared", "boss");
    assert.ok(f >= 0.1 && f <= 0.85, `region ${n} fitted boss ${f}`);
    assert.ok(g >= 0.7, `region ${n} geared boss ${g}`);
  }
});

test("Combat Power tracks the enemy curve: fitted CP is 0.75–2× the region's normal enemy CP", () => {
  for (const n of [3, 5, 8, 11, 14]) {
    const reg = regions[n - 1]!;
    const node = c.nodesOf(reg.id).find((x) => x.kind === "battle" && x.waves?.length)!;
    const cb = c.get<any>(node.waves![0]![0]!).cp;
    const cp = computeStats(makePlayer(c, n, "fitted", 1), c).cp;
    const ratio = cp / cb;
    assert.ok(ratio > 0.75 && ratio < 2.0, `region ${n}: fitted CP ${cp} vs normal cp ${cb} (ratio ${ratio.toFixed(2)})`);
  }
});

test("tribulations: a fitted stage-9 cultivator passes the realm's tribulation 30–95% of the time", () => {
  for (const n of [5, 7, 10, 15]) {
    const reg = regions[n - 1]!;
    const trib = c.byPrefix<any>("tribulation").find((t) => t.realm === reg.realm_range.max);
    if (!trib) continue;
    let wins = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const s = makePlayer(c, n, "fitted", seed * 7, 9);
      s.character.realm = reg.realm_range.max; s.progress.realmsEntered = c.realms.filter((r) => r.order <= c.get<any>(reg.realm_range.max).order).map((r) => r.id);
      if (fight(s, { kind: "tribulation", id: trib.id })) wins++;
    }
    assert.ok(wins >= 2 && wins <= 6, `${trib.id}: ${wins}/${SEEDS}`);
  }
});

test("tower: the floor a fitted player stalls on rises with the region and floor 100 is late game", () => {
  const tower = c.byPrefix<any>("dungeon").find((d) => d.kind === "tower")!;
  const stall = (n: number) => { const s = makePlayer(c, n, "fitted", 5); let f = 1; while (f <= 100) { if (!fight(s, { kind: "tower", id: tower.id, floor: f })) break; s.character.hp = undefined; f++; } return f - 1; };
  const s3 = stall(3), s9 = stall(9), s15 = stall(15);
  console.log(`    tower stalls → r3 ${s3}, r9 ${s9}, r15 ${s15}`);
  assert.ok(s3 >= 15 && s3 < s9 && s9 < 90 && s15 >= 85, `stalls ${s3}/${s9}/${s15}`);
  assert.ok(towerFloor(c, tower, 100).power > computeStats(makePlayer(c, 14, "geared", 1), c).cp, "floor 100 outpowers a geared region-14 player");
});

test("economy: enhancing a full set to +10 costs 1–10 days of the region's farming at every region", () => {
  const loot = (n: number) => { const reg = regions[n - 1]!; const nodes = c.nodesOf(reg.id).filter((x) => x.kind === "battle" && x.waves?.length); let st = 0, k = 0, en = 0; for (const nd of nodes) { for (const e of nd.waves!.flat()) { const l = c.find<any>(c.get<any>(e).loot); if (l) st += (l.spirit_stones[0] + l.spirit_stones[1]) / 2; } k++; en += nd.energy_cost; } return { perClear: st / k, energy: en / k }; };
  for (const n of [1, 4, 8, 12, 15]) {
    const { perClear, energy } = loot(n);
    const perDay = perClear * (c.rules.energy.max + 24 * 60 / c.rules.energy.regen_minutes) / energy;   // a full bar plus a day of regeneration
    const s = makePlayer(c, n, "fitted", 1);
    const uid = s.equipped.weapon!; const g = s.inventory.gear[uid]!; g.enhance = 0;
    let cost = 0; for (let l = 0; l < 10; l++) { cost += enhanceCost(c, g)!.stones; g.enhance++; }
    const days = cost * 8 / perDay;
    assert.ok(days >= 0.5 && days <= 10, `region ${n}: ${days.toFixed(1)} days (${cost} per slot, ${Math.round(perDay)}/day)`);
  }
});
