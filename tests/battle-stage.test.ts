/** The battle stage's pure parts (docs/BATTLE_STAGE.md): field projection, formations, beats and shot plans. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PORTRAIT, project, slot, strikePoint, facing, centroid, FORMATIONS } from "../src/ui/battle/field.ts";
import { beats, plan, cameraFor, shotLength, type Vfx } from "../src/ui/battle/choreo.ts";
import type { BattleEvent } from "../src/engine/combat/types.ts";

test("the floor narrows and units shrink toward the back; front units draw over back ones", () => {
  const front = project(PORTRAIT, { fx: 0.5, fy: 0 }), back = project(PORTRAIT, { fx: 0.5, fy: 1 });
  assert.ok(front.y > back.y, "the front row stands lower on the screen");
  assert.equal(front.scale, PORTRAIT.near); assert.equal(back.scale, PORTRAIT.far);
  assert.ok(front.z > back.z);
  const left0 = project(PORTRAIT, { fx: 0, fy: 0 }).x, left1 = project(PORTRAIT, { fx: 0, fy: 1 }).x;
  assert.ok(left1 > left0, "the back edge is inset more than the front edge");
  const out = project(PORTRAIT, { fx: 2, fy: -1 });
  assert.ok(out.x <= 1 && out.y <= 1 && out.scale <= 1, "positions are clamped to the field");
});

test("formations keep the party front left and the enemies back right, every slot inside the field", () => {
  for (const side of ["ally", "enemy"] as const) for (const [n, row] of Object.entries(FORMATIONS[side])) {
    assert.equal(row.length, Number(n));
    for (const p of row) {
      assert.ok(p.fx >= 0 && p.fx <= 1 && p.fy >= 0 && p.fy <= 1, `${side} ${n}: slot inside the field`);
      if (side === "ally") assert.ok(p.fy < 0.6 && p.fx < 0.5, `${side} ${n}: allies front left`); else assert.ok(p.fy > 0.4 && p.fx > 0.35, `${side} ${n}: enemies back right`);
    }
    // no two units share a screen spot
    const seen = new Set(row.map((p) => { const q = project(PORTRAIT, p); return `${q.x.toFixed(2)}|${q.y.toFixed(2)}`; }));
    assert.equal(seen.size, row.length, `${side} ${n}: distinct placements`);
  }
  assert.deepEqual(slot("enemy", 9, 7), FORMATIONS.enemy[5]![4], "extra units share the last slot of the largest template");
  assert.deepEqual(slot("ally", 0, 0), FORMATIONS.ally[1]![0]);
});

test("a dash stops one reach short of the target, on the attacker's side, and faces it", () => {
  const me = slot("ally", 0, 2), foe = slot("enemy", 0, 2);
  const sp = strikePoint(me, foe);
  const dBefore = Math.hypot(foe.fx - me.fx, foe.fy - me.fy), dAfter = Math.hypot(foe.fx - sp.fx, foe.fy - (sp.fy + 0.03));
  assert.ok(dAfter < dBefore && Math.abs(dAfter - 0.16) < 1e-9, "stops at reach distance");
  assert.ok(sp.fx > me.fx && sp.fx < foe.fx, "between the two");
  assert.equal(facing(me, foe), 1); assert.equal(facing(foe, me), -1);
  const c = centroid([me, foe]);
  assert.ok(c.fx > me.fx && c.fx < foe.fx);
});

const ev = {
  turn: (actor: number): BattleEvent => ({ t: "turn", actor, round: 1 }),
  action: (actor: number, skill: string, targets: number[], extra: Partial<Extract<BattleEvent, { t: "action" }>> = {}): BattleEvent => ({ t: "action", actor, skill, name: skill, targets, ...extra }),
  hit: (actor: number, target: number, amount: number, dodged = false): BattleEvent => ({ t: "hit", actor, target, amount, crit: false, element: "elem.metal", absorbed: 0, dodged, kind: "attack" }),
  death: (target: number, by: number): BattleEvent => ({ t: "death", target, by }),
  status: (actor: number, target: number): BattleEvent => ({ t: "status", actor, target, status: "status.bleed", result: "applied" }),
  sp: (actor: number): BattleEvent => ({ t: "sp", actor, delta: 10 }),
};
const units: Record<number, { side: "ally" | "enemy"; alive: boolean }> = { 1: { side: "ally", alive: true }, 2: { side: "ally", alive: true }, 11: { side: "enemy", alive: true }, 12: { side: "enemy", alive: true } };
const unitOf = (uid: number) => units[uid];
const SLASH: Vfx = { approach: "dash", shape: "slash", impact: "medium", camera: "push", color: "#f2f5ff" };
const RAIN: Vfx = { approach: "none", shape: "rain", impact: "heavy", camera: "zoom", color: "#6fd0ff" };
const vfxOf = (id: string) => ({ "tech.active.azure_strike": SLASH, "tech.ult.frost_rain": RAIN } as Record<string, Vfx>)[id];

test("beats group an action with what it causes and leave the rest alone", () => {
  const b = beats([ev.turn(1), ev.action(1, "tech.active.azure_strike", [11]), ev.hit(1, 11, 120), ev.status(1, 11), ev.sp(1), ev.turn(11), ev.action(11, "basic", [1]), ev.hit(11, 1, 40), ev.death(1, 11), { t: "end", result: "defeat" }]);
  assert.deepEqual(b.map((x) => x.kind), ["lone", "action", "lone", "action", "lone"]);
  assert.equal((b[1] as any).effects.length, 3);
  assert.equal((b[3] as any).effects.length, 2);
});

test("a melee technique dashes to its target, swings, and the plan counts landed hits", () => {
  const [beat] = beats([ev.action(1, "tech.active.azure_strike", [11]), ev.hit(1, 11, 120), ev.hit(1, 11, 130, true), ev.death(11, 1)]);
  const shot = plan(beat as any, unitOf, vfxOf, false);
  assert.equal(shot.vfx.approach, "dash"); assert.equal(shot.clip, "attack");
  assert.equal(shot.strikes.length, 1); assert.equal(shot.strikes[0]!.target, 11); assert.equal(shot.strikes[0]!.dies, true);
  assert.equal(shot.hitCount, 1, "a dodged hit does not count"); assert.equal(shot.damage, 120);
  assert.equal(cameraFor(shot), "push");
  assert.ok(shot.timing.approach > 0 && shot.timing.back > 0 && shot.timing.aftermath >= 450, "dash out, dash back, time for the defeat");
  assert.equal(shotLength(shot, 2), shotLength(shot, 1) / 2);
});

test("an ultimate never dashes, zooms the camera and strikes everyone from where it stands", () => {
  const [beat] = beats([ev.action(2, "tech.ult.frost_rain", [11, 12]), ev.hit(2, 11, 300), ev.hit(2, 12, 280), ev.hit(2, 11, 300)]);
  const shot = plan(beat as any, unitOf, vfxOf, true);
  assert.equal(shot.vfx.approach, "none"); assert.equal(shot.clip, "ult"); assert.equal(cameraFor(shot), "zoom");
  assert.equal(shot.strikes.length, 2); assert.equal(shot.hitCount, 3); assert.equal(shot.damage, 880);
  assert.equal(shot.timing.strike, 1500);
});

test("basic strikes and counters have built-in looks; unknown techniques fall back to a burst without a dash", () => {
  const basic = plan(beats([ev.action(11, "basic", [1]), ev.hit(11, 1, 40)])[0] as any, unitOf, vfxOf, false);
  assert.equal(basic.vfx.approach, "dash"); assert.equal(basic.clip, "attack");
  const counter = plan(beats([ev.action(1, "counter", [11]), ev.hit(1, 11, 40)])[0] as any, unitOf, vfxOf, false);
  assert.equal(counter.vfx.approach, "none");
  const unknown = plan(beats([ev.action(1, "tech.active.nothing", [11]), ev.hit(1, 11, 40)])[0] as any, unitOf, vfxOf, false);
  assert.equal(unknown.vfx.shape, "burst"); assert.equal(unknown.vfx.approach, "none"); assert.equal(unknown.clip, "cast");
  const heal = plan(beats([ev.action(1, "tech.active.azure_strike", [2])])[0] as any, unitOf, () => ({ ...SLASH, approach: "none", shape: "glow" }), false);
  assert.deepEqual(heal.friendly, [2]); assert.equal(heal.strikes.length, 0); assert.equal(heal.vfx.approach, "none", "nothing to run at");
});
