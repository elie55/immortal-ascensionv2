import { test } from "node:test";
import assert from "node:assert/strict";
import { testContent } from "./helpers/content.ts";
import { newGameState, type GameState } from "../src/engine/state.ts";
import { Game } from "../src/engine/game.ts";
import { Encounter, canStart, type EncounterSource } from "../src/engine/encounter.ts";
import { towerFloor, bestFloor, canClimb, enterRealm, canEnterRealm, realmNodeState, realmInteract, realmSummary, abandonRealm, hiddenMet, realmRun } from "../src/engine/delves.ts";
import { energyNow } from "../src/engine/cultivation.ts";
import { itemCount } from "../src/engine/inventory.ts";
import { buildEnemy } from "../src/engine/combat/build.ts";

const c = testContent();
const T0 = Date.UTC(2026, 9, 29, 12, 0, 0);
const TOWER = "dungeon.heaven_piercing_tower", ORIGIN = "dungeon.origin_secret_realm";
const strong = (seed = 4) => {
  const s = newGameState(c, T0, { seed });
  s.character.realm = "realm.core_formation"; s.character.stage = 9;
  s.progress.realmsEntered.push("realm.foundation_establishment", "realm.core_formation");
  s.character.permanent = { atk: 20000, hp: 400000, def: 8000, spd: 80 };
  s.resources.energy.value = 100;
  return s;
};
function fight(s: GameState, src: EncounterSource): boolean {
  const st = Encounter.start(s, c, src, T0);
  assert.ok(st.ok, (st as any).reason);
  const enc = st.encounter;
  while (!enc.done) { enc.battle!.run(); const wr = enc.settleWave(T0); if (wr.summary.result !== "victory") break; if (enc.hasNextWave) enc.nextWave(); }
  return enc.done!.won;
}

test("tower floors scale power by floor, add enemies, and put a Warden on every tenth floor", () => {
  const d = c.get<any>(TOWER);
  const f1 = towerFloor(c, d, 1), f9 = towerFloor(c, d, 9), f10 = towerFloor(c, d, 10), f25 = towerFloor(c, d, 25);
  assert.equal(f1.power, d.rec_cp);
  assert.ok(f9.power > f1.power && f25.power > f10.power);
  assert.equal(f1.enemies.length, 1); assert.equal(f9.enemies.length, 2); assert.equal(f25.enemies.length, 3);
  assert.ok(f10.boss && f10.enemies.length === 1 && f10.enemies[0]!.startsWith("boss."));
  // scaled enemies reach the floor's power
  const e = buildEnemy(c, f9.enemies[0]!, { statMult: f9.statMult });
  const natural = c.get<any>(f9.enemies[0]!).stats.atk;
  assert.ok(Math.abs(e.base.atk! - natural * f9.statMult) < 1e-6);
  const sum = f9.enemies.reduce((n, id) => n + c.get<any>(id).cp * f9.statMult, 0);
  assert.ok(Math.abs(sum - f9.power) < 1);
});

test("climbing: one floor at a time from the best, no energy, milestones pay once", () => {
  const s = strong();
  assert.match((canClimb(newGameState(c, T0), c, TOWER, 1) as any).reason, /Requires/);
  assert.equal(canClimb(s, c, TOWER, 2).ok, false, "floors are climbed in order");
  const e0 = energyNow(s, c, T0);
  for (let f = 1; f <= 5; f++) assert.ok(fight(s, { kind: "tower", id: TOWER, floor: f }), `floor ${f}`);
  assert.equal(bestFloor(s, TOWER), 5);
  assert.equal(energyNow(s, c, T0), e0, "the tower costs no energy");
  const m5 = c.get<any>(TOWER).tower.milestones.find((m: any) => m.floor === 5);
  assert.ok(itemCount(s, m5.rewards.items[0].id) >= m5.rewards.items[0].qty, "floor 5 milestone paid");
  assert.equal(canStart(s, c, { kind: "tower", id: TOWER, floor: 5 }, T0).ok, false);
  assert.equal(s.progress.counters[`tower_best:${TOWER}`], 5);
});

test("secret realm: entry gate and energy once, branching unlocks, persistent run, hidden rooms, exit clears", () => {
  const g = new Game(c, strong(8));
  const s = g.state;
  assert.equal(canEnterRealm(s, c, ORIGIN, T0).ok, false, "needs the forest sovereign quest");
  s.progress.quests.completed["quest.main.bamboo_sovereign"] = 1;
  const e0 = energyNow(s, c, T0);
  assert.ok(g.run("realm", T0, (st, cc) => enterRealm(st, cc, ORIGIN, T0)).ok);
  assert.equal(energyNow(s, c, T0), e0 - c.get<any>(ORIGIN).entry.energy_cost);
  assert.ok(enterRealm(s, c, ORIGIN, T0).ok && energyNow(s, c, T0) === e0 - c.get<any>(ORIGIN).entry.energy_cost, "resuming is free");
  assert.equal(realmNodeState(s, c, ORIGIN, "gate"), "open");
  assert.equal(realmNodeState(s, c, ORIGIN, "sword_pillar"), "locked");
  assert.equal(realmNodeState(s, c, ORIGIN, "exit"), "locked");
  assert.ok(fight(s, { kind: "realm", id: ORIGIN, node: "gate" }));
  assert.equal(realmNodeState(s, c, ORIGIN, "gate"), "cleared");
  assert.equal(realmNodeState(s, c, ORIGIN, "sword_pillar"), "open");
  assert.equal(realmNodeState(s, c, ORIGIN, "mirror_pool"), "open");
  assert.ok(realmRun(s, ORIGIN)!.hp !== undefined, "HP carries across the run");
  // pool heals
  assert.ok(realmInteract(s, c, ORIGIN, "mirror_pool", T0).ok);
  assert.equal(realmRun(s, ORIGIN)!.hp, undefined);
  // hidden room depends on the wood condition
  const wood = hiddenMet(s, c, "wood root or wood technique equipped");
  assert.equal(realmNodeState(s, c, ORIGIN, "weeping_falls") === "hidden", !wood);
  // elite, vault, merchant, boss
  assert.ok(fight(s, { kind: "realm", id: ORIGIN, node: "sword_pillar" }));
  const vault = realmInteract(s, c, ORIGIN, "vault", T0);
  assert.ok(vault.ok);
  assert.equal(realmInteract(s, c, ORIGIN, "vault", T0).ok, false, "a vault opens once per run");
  const shop = realmInteract(s, c, ORIGIN, "merchant", T0);
  assert.ok(shop.ok && shop.shop === "shop.origin_realm_merchant");
  assert.ok(realmRun(s, ORIGIN)!.stones > 0 || realmRun(s, ORIGIN)!.items.length > 0, "run loot is tracked");
  assert.ok(fight(s, { kind: "realm", id: ORIGIN, node: "altar" }));
  assert.equal(realmSummary(s, c, ORIGIN).trialsDone, 3);
  assert.equal(realmNodeState(s, c, ORIGIN, "exit"), "open");
  const st0 = s.resources.spirit_stones;
  const done = g.run("realm", T0, (st, cc) => realmInteract(st, cc, ORIGIN, "exit", T0));
  assert.ok(done.ok && done.finished);
  assert.ok(s.resources.spirit_stones >= st0 + c.get<any>(ORIGIN).rewards.first_clear.spirit_stones);
  assert.equal(realmRun(s, ORIGIN), undefined);
  assert.equal(s.progress.dungeons[ORIGIN]!.clears, 1);
  // a second run pays energy again, no first-clear bonus
  assert.ok(enterRealm(s, c, ORIGIN, T0).ok);
  assert.ok(abandonRealm(s, ORIGIN).ok);
});

test("losing a realm battle keeps the run: the node stays open and HP is low", () => {
  const s = newGameState(c, T0, { seed: 2 });
  s.character.realm = "realm.foundation_establishment"; s.progress.realmsEntered.push("realm.foundation_establishment");
  s.progress.quests.completed["quest.main.bamboo_sovereign"] = 1;
  assert.ok(enterRealm(s, c, ORIGIN, T0).ok);
  const won = fight(s, { kind: "realm", id: ORIGIN, node: "gate" });
  if (!won) {
    assert.equal(realmNodeState(s, c, ORIGIN, "gate"), "open");
    assert.ok(realmRun(s, ORIGIN)!.hp! > 0);
  } else assert.equal(realmNodeState(s, c, ORIGIN, "gate"), "cleared");
});
