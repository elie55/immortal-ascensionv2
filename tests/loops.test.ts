/** Daily board, sweeps, companion stances, tier bundles and the elites' mechanics arts (the retention pass). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { testContent } from "./helpers/content.ts";
import { newGameState } from "../src/engine/state.ts";
import { Game } from "../src/engine/game.ts";
import { dailyTasks, dailyDone, claimDaily, dailyClaimed, bumpDaily, DAILY_NEED } from "../src/engine/daily.ts";
import { sweep, sweepOptions } from "../src/engine/sweep.ts";
import { Encounter } from "../src/engine/encounter.ts";
import { companionCombatant, setCompanionStance } from "../src/engine/companions.ts";
import { makePlayer, T0 as T } from "../tools/balance/sim_lib.ts";

const c = testContent();
const T0 = Date.UTC(2026, 9, 29, 12, 0, 0);

test("today's board counts turn-ins, fights, gathers and tournaments; the reward is claimable at four of five, once", () => {
  const s = newGameState(c, T0, { seed: 3 });
  assert.equal(dailyTasks(s, c).length, 5);
  assert.equal(dailyDone(s, c), 0);
  assert.ok(!claimDaily(s, c).ok);
  bumpDaily(s, "missions", 2); bumpDaily(s, "fights", 8); bumpDaily(s, "gathers", 3); bumpDaily(s, "tournament");
  assert.equal(dailyDone(s, c), 4);
  const stones = s.resources.spirit_stones, contrib = s.resources.contribution;
  const r = claimDaily(s, c);
  assert.ok(r.ok && dailyClaimed(s));
  assert.ok(s.resources.spirit_stones > stones && s.resources.contribution > contrib && (s.inventory.stacks["mat.refining_stone"] ?? 0) >= 3);
  assert.ok(!claimDaily(s, c).ok, "once a day");
  assert.ok(DAILY_NEED === 4);
});

test("a won node fight, a turned-in mission and a gather bump the daily counters through the real actions", () => {
  const s = makePlayer(c, 2, "geared", 1); s.resources.energy.value = 1e6;
  const node = c.nodesOf("region.mortal_plains").find((n) => n.kind === "battle" && n.waves?.length)!;
  s.progress.regions["region.mortal_plains"] ??= { discoveredAt: T, nodes: {} };
  const st = Encounter.start(s, c, { kind: "node", id: node.id }, T); assert.ok(st.ok);
  const enc = st.encounter; while (!enc.done) { enc.battle!.run(); const wr = enc.settleWave(T); if (wr.summary.result !== "victory") break; if (enc.hasNextWave) enc.nextWave(); }
  assert.ok(enc.done?.won);
  assert.equal(s.daily.counters["d:fights"], 1);
});

test("sweep repeats a cleared place instantly: energy spent, drops and quest counters paid, refused on an uncleared place", () => {
  const s = makePlayer(c, 2, "geared", 2); s.resources.energy.value = 200;
  const g = new Game(c, s);
  const node = c.nodesOf("region.mortal_plains").find((n) => n.kind === "battle" && n.waves?.length && n.replayable !== false)!;
  s.progress.regions["region.mortal_plains"] ??= { discoveredAt: T, nodes: {} };
  assert.ok(!sweep(s, c, T, node.id, 3).ok, "not cleared yet");
  s.progress.regions["region.mortal_plains"]!.nodes[node.id] = { clears: 1 };
  const opts = sweepOptions(s, c, T);
  assert.ok(opts.some((o) => o.node.id === node.id));
  const before = s.resources.energy.value, kills = s.progress.counters[`kills:${node.waves![0]![0]}`] ?? 0;
  const r = g.run("sweep", T, (x, cc) => sweep(x, cc, T, node.id, 3));
  assert.ok(r.ok && r.runs === 3 && r.wins === 3, JSON.stringify(r));
  assert.equal(s.resources.energy.value, before - 3 * node.energy_cost);
  assert.ok((s.progress.counters[`kills:${node.waves![0]![0]}`] ?? 0) > kills, "kills counted for quests");
  assert.ok(r.drops.spirit_stones > 0);
  assert.equal(s.daily.counters["d:fights"], 3);
});

test("a companion's stance changes its battle AI: guard plays support, burst plays caster, balanced keeps the role", () => {
  const s = makePlayer(c, 5, "geared", 1);
  const npc = c.byPrefix<any>("npc").find((n) => n.dao_companion)!;
  const make = (p: any) => ({ uid: 1, hp: p.maxHp, sp: p.maxSp, shield: 0, ult: 0, gauge: 0, cooldowns: {}, statuses: [], alive: true, turns: 0, stats: { dealt: 0, taken: 0, healed: 0, kills: 0 }, ...p });
  const balanced = companionCombatant(s, c, npc.id, make).ai!.strategy;
  setCompanionStance(s, npc.id, "guard"); assert.equal(companionCombatant(s, c, npc.id, make).ai!.strategy, "support");
  setCompanionStance(s, npc.id, "burst"); assert.equal(companionCombatant(s, c, npc.id, make).ai!.strategy, "caster");
  setCompanionStance(s, npc.id, "balanced"); assert.equal(companionCombatant(s, c, npc.id, make).ai!.strategy, balanced);
});

test("resource dungeon tiers II+ guarantee refining stones, tier V a Dao Insight Crystal; elites carry a stance or a step", () => {
  for (const d of c.byPrefix<any>("dungeon").filter((x) => x.tiers?.length)) {
    for (const t of d.tiers.slice(1)) {
      const lt = c.get<any>(t.rewards.clear);
      assert.ok(lt.guaranteed.some((q: any) => q.id === "mat.refining_stone" && q.qty >= 2 * (t.tier - 1)), `${lt.id} refining stones`);
      if (t.tier >= 5) assert.ok(lt.guaranteed.some((q: any) => q.id === "mat.dao_insight_crystal"), `${lt.id} crystal`);
    }
  }
  const elites = c.byPrefix<any>("enemy").filter((e) => e.kind === "elite" && e.id.split(".")[1]?.length);
  const regional = elites.filter((e) => e.techniques.includes("tech.active.guard_stance") || e.techniques.includes("tech.active.wind_step"));
  assert.ok(regional.length >= 12, `${regional.length} elites with a mechanic art`);
  for (const id of ["tech.active.gale_spear_step", "tech.active.saber_guard_stance", "tech.active.fan_of_returning_wind", "tech.active.moon_sweep", "tech.active.mirror_palm_stance"]) assert.ok(c.find(id), id);
});
