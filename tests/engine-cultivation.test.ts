import { test } from "node:test";
import assert from "node:assert/strict";
import { testContent } from "./helpers/content.ts";
import { newGameState } from "../src/engine/state.ts";
import { qiNeeded, qiRate, tick, applyOffline, minorBreakthrough, majorBreakthrough, majorRequirements, qiBankCap, countAffordableStages, energyNow, spendEnergy, etaToNextStage } from "../src/engine/cultivation.ts";
import { computeStats } from "../src/engine/stats.ts";
import { breakThrough, breakThroughAll, useConsumable, equip, unequip, grantRewards } from "../src/engine/actions.ts";
import { addItem, itemCount, grantGear } from "../src/engine/inventory.ts";
import { Game } from "../src/engine/game.ts";

const content = testContent();
const T0 = Date.UTC(2026, 9, 29, 12, 0, 0);
const fresh = (seed = 7) => newGameState(content, T0, { seed });

test("new game matches starting_state: realm, stones, inventory, equipped gear with rolled stats", () => {
  const s = fresh();
  const st = content.starting;
  assert.equal(s.character.realm, st.realm.id);
  assert.equal(s.character.stage, st.realm.stage);
  assert.equal(s.resources.spirit_stones, st.spirit_stones);
  for (const q of st.inventory) assert.equal(itemCount(s, q.id), q.qty);
  assert.equal(Object.keys(s.equipped).length, Object.keys(st.equipped).length);
  const weapon = s.inventory.gear[s.equipped.weapon!]!;
  assert.equal(weapon.base, st.equipped.weapon!.base);
  assert.ok(weapon.main.value > 0);
});

test("same seed → identical state (deterministic rolls)", () => {
  assert.deepEqual(fresh(3), fresh(3));
  assert.notDeepEqual(fresh(3).inventory.gear, fresh(4).inventory.gear);
});

test("stage 1 of a realm takes minutes_for_stage1 at multiplier 1", () => {
  const s = fresh();
  const realm = content.get<any>(s.character.realm);
  const rate = qiRate(s, content, T0);
  const mult = rate.factors.reduce((a, f) => a * f.mult, 1);
  const seconds = qiNeeded(realm, 1) / rate.base;
  assert.equal(Math.round(seconds), content.rules.minutes_for_stage1[realm.order - 1]! * 60);
  assert.ok(Math.abs(rate.perSecond - rate.base * mult) < 1e-9);
});

test("ticking accumulates Qi, caps at the bank, and advances playtime", () => {
  const s = fresh();
  tick(s, content, 60_000, T0 + 60_000);
  const r = qiRate(s, content, T0).perSecond;
  assert.ok(Math.abs(s.character.qi - r * 60) < 1e-6);
  assert.equal(s.meta.playtimeMs, 60_000);
  tick(s, content, 1e12, T0 + 1e12);
  assert.equal(s.character.qi, qiBankCap(s, content));
});

test("minor breakthroughs cost exactly qiNeeded and stop at stage 9", () => {
  const s = fresh();
  const realm = content.get<any>(s.character.realm);
  assert.equal(minorBreakthrough(s, content).ok, false);
  s.character.qi = qiNeeded(realm, 1) + 5;
  const r = minorBreakthrough(s, content);
  assert.ok(r.ok && r.events[0]!.type === "stage_up");
  assert.equal(s.character.stage, 2);
  assert.ok(Math.abs(s.character.qi - 5) < 1e-9);
  s.character.stage = 9; s.character.qi = 1e12;
  assert.equal(minorBreakthrough(s, content).ok, false);
});

test("offline: credits capped, efficiency-scaled Qi; clock moved back gives nothing and is counted", () => {
  const s = fresh();
  const rules = content.rules.offline;
  const rate = qiRate(s, content, T0).perSecond;
  // 2 hours away
  s.meta.lastTickAt = T0;
  const rep = applyOffline(s, content, T0 + 2 * 3_600_000)!;
  assert.ok(rep && !rep.capped && !rep.clockMovedBack);
  assert.ok(Math.abs(rep.qiGained - rate * 7200 * rules.efficiency) < 1e-6);
  assert.ok(rep.stagesAvailable >= 1);
  // 100 hours away → capped at cap_hours
  const s2 = fresh(); s2.meta.lastTickAt = T0;
  const rep2 = applyOffline(s2, content, T0 + 100 * 3_600_000)!;
  assert.ok(rep2.capped);
  assert.ok(Math.abs(rep2.creditedMs - rules.cap_hours * 3_600_000 * rules.efficiency) < 1);
  // clock moved back
  const s3 = fresh(); s3.meta.lastTickAt = T0;
  const rep3 = applyOffline(s3, content, T0 - 3_600_000)!;
  assert.ok(rep3.clockMovedBack);
  assert.equal(rep3.qiGained, 0);
  assert.equal(s3.meta.clockBackCount, 1);
  assert.equal(s3.meta.lastTickAt, T0 - 3_600_000, "lastTickAt follows the device clock so the player is not punished twice");
  // short absence → no report
  const s4 = fresh(); s4.meta.lastTickAt = T0;
  assert.equal(applyOffline(s4, content, T0 + 10_000), null);
});

test("breakThroughAll chains every affordable stage after a long absence", () => {
  const s = fresh(); s.meta.lastTickAt = T0;
  applyOffline(s, content, T0 + 12 * 3_600_000);
  const n = countAffordableStages(s, content);
  assert.ok(n >= 2, `expected several stages, got ${n}`);
  const r = breakThroughAll(s, content, { now: T0 });
  assert.ok(r.ok && r.count === n);
  assert.equal(s.character.stage, 1 + n);
});

test("major breakthrough: lists requirements, consumes items, rolls success, applies realm bonus", () => {
  const s = fresh(); s.character.stage = 9;
  const realm = content.get<any>(s.character.realm);
  const next = content.nextRealm(realm.id)!;
  s.character.qi = qiNeeded(realm, 9) * 2;
  const reqs = majorRequirements(s, content);
  assert.ok(reqs.find((r) => r.kind === "qi")!.met);
  const itemReq = reqs.find((r) => r.kind === "item");
  if (itemReq) {
    assert.equal(majorBreakthrough(s, content).ok, false, "missing pill blocks the attempt");
    addItem(s, content, itemReq.id!, itemReq.need);
  }
  const hpBefore = computeStats(s, content).total.hp!;
  const r = majorBreakthrough(s, content);
  assert.ok(r.ok);
  if (r.ok && r.success) {
    assert.equal(s.character.realm, next.id);
    assert.equal(s.character.stage, 1);
    assert.ok(s.progress.realmsEntered.includes(next.id));
    assert.ok(computeStats(s, content).total.hp! > hpBefore);
    if (itemReq) assert.equal(itemCount(s, itemReq.id!), 0);
  } else if (r.ok) {
    assert.equal(s.character.realm, realm.id);
    assert.ok(s.character.qi < qiNeeded(realm, 9) * 2);
  }
});

test("core formation requires the tribulation to have been passed", () => {
  const s = fresh();
  s.character.realm = "realm.foundation_establishment"; s.character.stage = 9;
  s.progress.realmsEntered.push("realm.foundation_establishment");
  s.character.qi = 1e12; s.character.qi = qiBankCap(s, content);
  const reqs = majorRequirements(s, content);
  const trib = reqs.find((r) => r.kind === "tribulation");
  assert.ok(trib && !trib.met);
  assert.equal(majorBreakthrough(s, content).ok, false);
  s.progress.tribulations[trib!.id!] = { attempts: 1, passedAt: T0 };
  for (const q of content.get<any>("realm.core_formation").major_breakthrough.requirements) addItem(s, content, q.id, q.qty);
  assert.equal(majorBreakthrough(s, content).ok, true);
});

test("stats fold every source and CP is monotonic in stage and gear", () => {
  const s = fresh();
  const a = computeStats(s, content);
  assert.ok(a.sources.some((x) => x.label === "Equipment"));
  assert.ok(a.total.hp! > content.rules.base_stats.hp!);
  s.character.stage = 5;
  const b = computeStats(s, content);
  assert.ok(b.cp > a.cp && b.total.atk! > a.total.atk!);
  const weaponUid = s.equipped.weapon!;
  unequip(s, content, "weapon");
  const c = computeStats(s, content);
  assert.ok(c.cp < b.cp);
  const e = equip(s, content, weaponUid);
  assert.ok(e.ok && computeStats(s, content).cp === b.cp);
});

test("ring equips into the first free ring slot, then replaces the chosen one", () => {
  const s = fresh();
  const first = s.equipped.ring_1!;
  const base = content.get<any>(s.inventory.gear[first]!.base);
  assert.equal(base.slot, "ring");
  const uid2 = grantGear(s, content, { base: base.id, rarity: "common", ilvl: 2 });
  const r = equip(s, content, uid2);
  assert.ok(r.ok && r.slot === "ring_2" && r.replaced === undefined);
  const uid3 = grantGear(s, content, { base: base.id, rarity: "common", ilvl: 3 });
  const r3 = equip(s, content, uid3, "ring_1");
  assert.ok(r3.ok && r3.slot === "ring_1" && r3.replaced === first);
  assert.equal(s.equipped.ring_2, uid2);
});

test("qi pill adds Qi (bank-capped); cultivation boost adds a timed buff that expires on tick", () => {
  const s = fresh();
  const pill = content.byPrefix<any>("cons").find((c) => c.effects.qi)!;
  addItem(s, content, pill.id, 2);
  const before = s.character.qi, count = itemCount(s, pill.id);
  const r = useConsumable(s, content, { now: T0 }, pill.id);
  assert.ok(r.ok && s.character.qi === Math.min(qiBankCap(s, content), before + pill.effects.qi));
  assert.equal(itemCount(s, pill.id), count - 1);
  const boost = content.byPrefix<any>("cons").find((c) => c.effects.cultivation_boost);
  if (boost) {
    addItem(s, content, boost.id, 1);
    const base = qiRate(s, content, T0).perSecond;
    assert.ok(useConsumable(s, content, { now: T0 }, boost.id).ok);
    assert.ok(qiRate(s, content, T0 + 1000).perSecond > base);
    tick(s, content, 1000, T0 + boost.effects.cultivation_boost.minutes * 60_000 + 1);
    assert.equal(s.buffs.length, 0);
  }
});

test("energy regenerates lazily and cannot go negative", () => {
  const s = fresh();
  const max = energyNow(s, content, T0);
  assert.ok(spendEnergy(s, content, T0, max).ok);
  assert.equal(spendEnergy(s, content, T0, 1).ok, false);
  const perMin = 1 / content.rules.energy.regen_minutes;
  const e = energyNow(s, content, T0 + 60_000 * 30);
  assert.ok(Math.abs(e - Math.min(max, 30 * perMin)) < 1e-9);
});

test("Game dispatches actions, runs trackers and emits events; eta is finite", () => {
  const s = fresh();
  const g = new Game(content, s);
  const seen: string[] = [];
  g.onChange((ev) => seen.push(...ev.map((e) => e.type)));
  g.addTracker((_s, _c, e) => (e.type === "stage_up" ? [{ type: "unlock", id: "test" }] : undefined));
  g.tick(1000, T0 + 1000);
  assert.ok(etaToNextStage(s, content, T0) > 0 && Number.isFinite(etaToNextStage(s, content, T0)));
  s.character.qi = qiNeeded(content.get<any>(s.character.realm), 1);
  const r = g.run("breakthrough", T0, (st, c) => breakThrough(st, c, { now: T0 }));
  assert.ok(r.ok && g.dirtyImportant);
  assert.deepEqual(seen.filter((t) => t !== "tick"), ["stage_up", "unlock"]);
});

test("grantRewards covers stones, items, gear, techniques, titles and affinity", () => {
  const s = fresh();
  const ev: any[] = [];
  grantRewards(s, content, { spirit_stones: 10, items: [{ id: "mat.spirit_grass", qty: 2 }], gear: [{ base: "gear.bamboo_sword", rarity: "uncommon", ilvl: 3 }], techniques: ["tech.active.flame_palm"], affinity: [{ npc: "npc.bai_lingshuang", delta: 5 }] }, ev);
  assert.equal(s.resources.spirit_stones, content.starting.spirit_stones + 10);
  assert.equal(itemCount(s, "mat.spirit_grass"), 2);
  assert.equal(Object.keys(s.inventory.gear).length, Object.keys(content.starting.equipped).length + 1);
  assert.equal(s.techniques.known["tech.active.flame_palm"], 0);
  assert.equal(s.relations["npc.bai_lingshuang"]!.affinity, 5);
});

test("required breakthrough pills cannot be used from the bag and add their bonus automatically", async () => {
  const { majorChance } = await import("../src/engine/cultivation.ts");
  const s = fresh();
  addItem(s, content, "cons.foundation_pill", 1);
  const r = useConsumable(s, content, { now: T0 }, "cons.foundation_pill");
  assert.ok(!r.ok && /breakthrough/.test(r.reason));
  assert.equal(itemCount(s, "cons.foundation_pill"), 1);
  s.character.stage = 9;
  const ch = majorChance(s, content);
  const pill = content.get<any>("cons.foundation_pill").effects.breakthrough_chance_bonus;
  assert.ok(Math.abs(ch.total - Math.min(1, ch.base + pill)) < 1e-9);
  assert.ok(ch.parts.some((p) => p.label === "Foundation Pill"));
});
