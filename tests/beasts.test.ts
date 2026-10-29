import { test } from "node:test";
import assert from "node:assert/strict";
import { testContent } from "./helpers/content.ts";
import { newGameState, type GameState } from "../src/engine/state.ts";
import { Game } from "../src/engine/game.ts";
import { addItem, itemCount } from "../src/engine/inventory.ts";
import { incubate, incubateCheck, hatch, warmEggs, feed, foodXp, play, train, trainXp, evolve, evolveCheck, levelCap, xpToNext, bondInfo, setActiveBeast, renameBeast, addBeastXp } from "../src/engine/beasts.ts";
import { canBond, bondDao, setCompanionActive, companionSlots, MAX_ACTIVE } from "../src/engine/companions.ts";
import { Encounter } from "../src/engine/encounter.ts";
import { computeStats } from "../src/engine/stats.ts";
import { qiRate, energyNow } from "../src/engine/cultivation.ts";
import { decode, encode, fnv1a, canonical } from "../src/save/codec.ts";
import type { DomainEvent } from "../src/engine/events.ts";

const c = testContent();
const T0 = Date.UTC(2026, 9, 29, 12, 0, 0);
const fresh = (seed = 3) => newGameState(c, T0, { seed });

function hatchYunyun(s: GameState): number {
  if (!itemCount(s, "egg.cloud_fox")) addItem(s, c, "egg.cloud_fox", 1);
  assert.ok(incubate(s, c, "egg.cloud_fox", T0).ok);
  warmEggs(s, 99);
  const r = hatch(s, c, s.beasts.incubating.length - 1, T0);
  assert.ok(r.ok);
  return r.uid;
}

test("the starting egg incubates, hatches only from victories, and becomes the active companion", () => {
  const s = fresh();
  assert.equal(itemCount(s, "egg.cloud_fox"), 1, "new disciples start with YunYun's egg");
  assert.ok(incubate(s, c, "egg.cloud_fox", T0).ok);
  assert.equal(itemCount(s, "egg.cloud_fox"), 0);
  const inc = s.beasts.incubating[0]!;
  assert.equal(inc.need, c.get<any>("egg.cloud_fox").hatch_wins);
  assert.equal(hatch(s, c, 0, T0 + 86_400_000).ok, false, "time alone does not hatch an egg");
  for (let i = 0; i < inc.need; i++) warmEggs(s);
  const r = hatch(s, c, 0, T0);
  assert.ok(r.ok);
  assert.equal(s.beasts.active, r.uid);
  assert.equal(s.beasts.owned[r.uid]!.beast, "beast.yunyun");
  assert.equal(s.beasts.incubating.length, 0);
});

test("incubators are limited and eggs respect realm requirements", () => {
  const s = fresh();
  addItem(s, c, "egg.azure_wolf", 1);
  assert.match(incubateCheck(s, c, "egg.azure_wolf").reason ?? "", /Requires/);
  s.character.realm = "realm.foundation_establishment"; s.progress.realmsEntered.push("realm.foundation_establishment");
  addItem(s, c, "egg.flame_fox", 2);
  assert.ok(incubate(s, c, "egg.azure_wolf", T0).ok);
  assert.ok(incubate(s, c, "egg.flame_fox", T0).ok);
  assert.match(incubateCheck(s, c, "egg.flame_fox").reason ?? "", /incubators/);
});

test("winning adventure battles warms eggs and trains the active beast", () => {
  const s = fresh(9);
  const uid = hatchYunyun(s);
  addItem(s, c, "egg.flame_fox", 1);
  assert.ok(incubate(s, c, "egg.flame_fox", T0).ok);
  const xp0 = s.beasts.owned[uid]!.xp + s.beasts.owned[uid]!.level * 1e6;
  const node = c.nodesOf("region.mortal_plains").find((n) => n.waves?.length)!;
  s.character.realm = "realm.foundation_establishment"; s.character.stage = 9; s.progress.realmsEntered.push("realm.foundation_establishment");
  const st = Encounter.start(s, c, { kind: "node", id: node.id }, T0);
  assert.ok(st.ok);
  const enc = st.encounter;
  assert.ok(enc.battle!.units.some((u) => u.kind === "beast"), "the active beast fights");
  while (!enc.done) { enc.battle!.run(); const wr = enc.settleWave(T0); if (wr.summary.result !== "victory") break; if (enc.hasNextWave) enc.nextWave(); }
  assert.ok(enc.done!.won);
  assert.equal(s.beasts.incubating[0]!.wins, 1);
  assert.ok(s.beasts.owned[uid]!.xp + s.beasts.owned[uid]!.level * 1e6 > xp0);
});

test("feeding gives XP (favourite food more) and bond; levels stop at the stage cap until evolution", () => {
  const s = fresh();
  const uid = hatchYunyun(s);
  const b = s.beasts.owned[uid]!;
  const fav = foodXp(c, b, "bfood.spirit_fruit"), other = foodXp(c, b, "bfood.spirit_meat");
  assert.ok(fav > c.get<any>("bfood.spirit_fruit").xp && other === c.get<any>("bfood.spirit_meat").xp);
  addItem(s, c, "bfood.spirit_fruit", 5);
  assert.ok(feed(s, c, uid, "bfood.spirit_fruit", 5).ok);
  assert.ok(b.level > 1 || b.xp > 0);
  assert.equal(b.bond, 5);
  const ev: DomainEvent[] = [];
  addBeastXp(s, c, uid, 1e9, ev);
  assert.equal(b.level, levelCap(c, b));
  assert.equal(b.xp, xpToNext(c, b.level), "excess XP is banked up to one level");
  addItem(s, c, "bfood.spirit_fruit", 1);
  assert.match((feed(s, c, uid, "bfood.spirit_fruit", 1) as any).reason, /evolve/);
  assert.equal(feed(s, c, uid, "mat.spirit_grass", 1).ok, false);
});

test("evolution needs the level, materials and stones; the banked XP flows on; stats grow", () => {
  const s = fresh();
  const uid = hatchYunyun(s);
  const b = s.beasts.owned[uid]!;
  assert.match(evolveCheck(s, c, b).reason ?? "", /level/);
  addBeastXp(s, c, uid, 1e9, []);
  const next = c.get<any>("beast.yunyun").stages[1];
  assert.match(evolveCheck(s, c, b).reason ?? "", /stones|Missing/);
  s.resources.spirit_stones = 1e6;
  for (const q of next.evolve_materials) addItem(s, c, q.id, q.qty);
  const lvl = b.level;
  const r = evolve(s, c, uid);
  assert.ok(r.ok);
  assert.equal(b.stage, "juvenile");
  assert.equal(b.level, lvl + 1, "banked XP becomes the next level");
  for (const q of next.evolve_materials) assert.equal(itemCount(s, q.id), 0);
});

test("bond levels come from points, unlock milestone stats and play has a cooldown", () => {
  const s = fresh();
  const uid = hatchYunyun(s);
  const b = s.beasts.owned[uid]!;
  const hp0 = computeStats(s, c).total.hp!;
  b.bond = 10 + 20 + 30;                  // levels 1..3 at 10/20/30 points
  assert.equal(bondInfo(c, b).level, 3);
  assert.equal(computeStats(s, c).total.hp, hp0 + 50, "YunYun's bond-3 milestone adds 50 HP");
  assert.ok(play(s, c, uid, T0).ok);
  assert.equal(play(s, c, uid, T0 + 60_000).ok, false);
  assert.ok(play(s, c, uid, T0 + c.rules.beasts.play.cooldown_min * 60_000).ok);
  b.bond = 1e6;
  assert.equal(bondInfo(c, b).level, bondInfo(c, b).max);
  assert.equal(play(s, c, uid, T0 + 1e9).ok, false, "a complete bond cannot grow");
});

test("training spends energy for a share of the next level", () => {
  const s = fresh();
  const uid = hatchYunyun(s);
  const e0 = energyNow(s, c, T0);
  const want = trainXp(c, s.beasts.owned[uid]!);
  const r = train(s, c, uid, T0);
  assert.ok(r.ok && r.xp === want);
  assert.equal(energyNow(s, c, T0), e0 - c.rules.beasts.train.energy);
  s.resources.energy.value = 0;
  assert.equal(train(s, c, uid, T0).ok, false);
});

test("active beast, renaming, qi bonus, and a hatched beast completes hatch objectives", () => {
  const { s, g, events } = (() => { const s = fresh(); const g = new Game(c, s); const events: DomainEvent[] = []; g.onChange((e) => events.push(...e)); return { s, g, events }; })();
  const q0 = qiRate(s, c, T0).perSecond;
  const uid = hatchYunyun(s);
  assert.ok(qiRate(s, c, T0).perSecond > q0, "YunYun adds her cultivation bonus");
  assert.ok(renameBeast(s, uid, "  Mochi  ").ok);
  assert.equal(s.beasts.owned[uid]!.name, "Mochi");
  assert.equal(renameBeast(s, uid, "   ").ok, false);
  assert.ok(setActiveBeast(s, null).ok);
  assert.equal(qiRate(s, c, T0).perSecond, q0);
  g.settle(T0);
  assert.ok(s.progress.achievements["ach.beasts.beast_friend"], "first hatch unlocks the achievement");
  assert.ok(events.some((e) => e.type === "achievement"));
});

test("Dao companions: need the top relationship level, add dual cultivation and join allowed battles", () => {
  const s = fresh(21);
  const npc = "npc.bai_lingshuang";
  assert.equal(canBond(s, c, npc).ok, false);
  assert.equal(canBond(s, c, "npc.elder_feng").ok, false, "not every NPC can become a Dao companion");
  s.relations[npc] = { affinity: 1000, giftsToday: 0, topics: [] };
  const q0 = qiRate(s, c, T0).perSecond;
  assert.ok(bondDao(s, c, npc).ok);
  assert.equal(bondDao(s, c, npc).ok, false);
  assert.ok(Math.abs(qiRate(s, c, T0).perSecond / q0 - c.rules.dao.qi_mult) < 1e-9);
  assert.deepEqual(s.companions.active, [npc]);
  // slots
  assert.equal(companionSlots(c, { kind: "node", id: "x" }), 1);
  assert.equal(companionSlots(c, { kind: "tribulation", id: "x" }), 0);
  assert.equal(companionSlots(c, { kind: "duel", npc }), 0);
  const mega = c.byPrefix<any>("dungeon").find((d) => d.kind === "mega")!;
  assert.equal(companionSlots(c, { kind: "dungeon", id: mega.id }), mega.entry.party.max_companions);
  // battle
  const node = c.nodesOf("region.mortal_plains").find((n) => n.waves?.length)!;
  const st = Encounter.start(s, c, { kind: "node", id: node.id }, T0);
  assert.ok(st.ok);
  const comp = st.encounter.battle!.units.find((u) => u.kind === "companion")!;
  assert.ok(comp && comp.side === "ally" && comp.ai !== null);
  const player = st.encounter.battle!.player;
  assert.ok(Math.abs(comp.maxHp - player.maxHp * c.rules.dao.stat_scale) <= 2, "companion HP follows the player's");
  // toggles
  s.relations["npc.tang_xiaoman"] = { affinity: 1000, giftsToday: 0, topics: [] };
  assert.ok(bondDao(s, c, "npc.tang_xiaoman").ok);
  assert.equal(s.companions.active.length, MAX_ACTIVE);
  assert.ok(setCompanionActive(s, npc, false).ok);
  assert.deepEqual(s.companions.active, ["npc.tang_xiaoman"]);
  assert.equal(setCompanionActive(s, "npc.qin", true).ok, false);
});

test("v3 saves migrate: incubators, beast uids and companions are added", () => {
  const s = fresh();
  const raw = JSON.parse(encode(s, 0, T0));
  raw.v = 3; raw.state.meta.version = 3;
  delete raw.state.companions; delete raw.state.beasts.incubating; delete raw.state.beasts.nextUid;
  raw.state.beasts.owned = { 7: { uid: 7, beast: "beast.yunyun", name: "YunYun", stage: "hatchling", level: 3, xp: 0, bond: 0, hatchedAt: T0 } };
  raw.checksum = fnv1a(canonical(raw.state));
  const r = decode(JSON.stringify(raw));
  assert.ok(r.ok, (r as any).reason);
  assert.equal(r.state.beasts.nextUid, 8);
  assert.deepEqual(r.state.companions, { bonded: [], active: [] });
  assert.deepEqual(r.state.beasts.incubating, []);
});
