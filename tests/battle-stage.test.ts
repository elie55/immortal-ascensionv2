/** The battle stage's pure parts (docs/BATTLE_STAGE.md): arena line-up, beats and shot plans, the test fight. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { layout, lineUp, strikeBox, focusOf, overlapShare, ARENA, type LayoutUnit, type Box } from "../src/ui/battle/field.ts";
import { beats, plan, cameraFor, shotLength, type Vfx } from "../src/ui/battle/choreo.ts";
import type { BattleEvent } from "../src/engine/combat/types.ts";

/** Phone and tablet stage sizes (the area between the top bar and the dock), from small to wide. */
const STAGES = [{ w: 360, h: 380 }, { w: 360, h: 470 }, { w: 390, h: 560 }, { w: 412, h: 620 }, { w: 480, h: 720 }, { w: 560, h: 700 }];
const PARTIES: LayoutUnit["kind"][][] = [["player"], ["player", "companion"], ["player", "beast"], ["player", "companion", "beast"], ["player", "companion", "companion"], ["player", "companion", "companion", "beast"]];
const FOES: LayoutUnit["kind"][][] = [["enemy"], ["enemy", "enemy"], ["enemy", "enemy", "enemy"], ["boss"], ["boss", "enemy", "enemy"], ["enemy", "enemy", "enemy", "enemy"], ["enemy", "enemy", "enemy", "enemy", "enemy"]];
const group = (party: LayoutUnit["kind"][], foes: LayoutUnit["kind"][]) => [
  ...party.map((kind, i) => ({ uid: 1 + i, kind, side: "ally" as const })),
  ...foes.map((kind, i) => ({ uid: 20 + i, kind, side: "enemy" as const })),
];
/** The bar strips: under a party figure's feet, above a foe's head (text line + bar, px). */
const bar = (b: Box, side: "ally" | "enemy") => side === "ally" ? { x0: b.x - b.w * 0.32, x1: b.x + b.w * 0.32, y0: b.feet + 2, y1: b.feet + 22 } : { x0: b.x - b.w * 0.32, x1: b.x + b.w * 0.32, y0: b.feet - b.h - 22, y1: b.feet - b.h - 2 };
/** A figure's visible body (the art's margins excluded). */
const body = (b: Box) => ({ x0: b.x - b.h * ARENA.visible / 2, x1: b.x + b.h * ARENA.visible / 2, y0: b.feet - b.h * 0.92, y1: b.feet });
const hit = (a: { x0: number; x1: number; y0: number; y1: number }, b: typeof a) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

test("line-up: on every stage size and group, figures barely overlap and every HP bar is clear of the other figures", () => {
  for (const st of STAGES) for (const party of PARTIES) for (const foes of FOES) {
    const us = group(party, foes);
    const boxes = layout(us, st);
    const tag = `${st.w}×${st.h} · ${party.join("+")} vs ${foes.join("+")}`;
    for (const u of us) {
      const b = boxes.get(u.uid)!;
      // inside the stage (a sliver of sleeve may leave it, never a body)
      assert.ok(b.x - b.h * ARENA.visible / 2 >= -st.w * 0.03 && b.x + b.h * ARENA.visible / 2 <= st.w * 1.03, `${tag}: ${u.kind} ${u.uid} inside the width`);
      const br = bar(b, u.side);
      assert.ok(br.y0 >= 0 && br.y1 <= st.h + 4, `${tag}: ${u.kind} ${u.uid}'s bar inside the stage`);
      for (const o of us) {
        if (o === u) continue;
        const ob = boxes.get(o.uid)!;
        // same side: neighbours overlap a little (depth), never more than a third of the narrower figure
        if (o.side === u.side) assert.ok(overlapShare(b, ob) <= 0.34, `${tag}: ${u.uid} and ${o.uid} overlap ${overlapShare(b, ob).toFixed(2)}`);
        // a bar never lies on another figure's body or on another bar
        const area = (br.x1 - br.x0) * (br.y1 - br.y0);
        assert.ok(hit(br, body(ob)) <= area * 0.12, `${tag}: ${u.uid}'s bar covers ${o.uid}`);
        assert.ok(hit(br, bar(ob, o.side)) <= area * 0.05, `${tag}: bars of ${u.uid} and ${o.uid} collide`);
      }
      // the party's bodies stay below the enemies' bodies (two bands, one field)
      if (u.side === "ally") for (const o of us.filter((x) => x.side === "enemy")) { const ob = boxes.get(o.uid)!; assert.ok(hit(body(b), body(ob)) <= (body(b).x1 - body(b).x0) * (body(b).y1 - body(b).y0) * 0.06, `${tag}: ${u.uid} covers foe ${o.uid}`); }
    }
  }
});

test("line-up order: the player and the boss lead in the middle, a beast at the end, the lead in front", () => {
  const order = lineUp([{ uid: 3, kind: "beast" }, { uid: 2, kind: "companion" }, { uid: 1, kind: "player" }, { uid: 4, kind: "companion" }]).map((u) => u.uid);
  assert.deepEqual(order, [2, 1, 4, 3]);
  assert.deepEqual(lineUp([{ uid: 9, kind: "enemy" }, { uid: 7, kind: "boss" }, { uid: 8, kind: "enemy" }]).map((u) => u.uid), [8, 7, 9]);
  const boxes = layout(group(["player", "companion", "beast"], ["enemy", "boss", "enemy"]), { w: 390, h: 560 });
  assert.ok(boxes.get(1)!.feet > boxes.get(2)!.feet, "the player stands in front of a companion");
  assert.ok(boxes.get(21)!.h > boxes.get(20)!.h, "the boss is the biggest foe");
  assert.ok(boxes.get(3)!.h < boxes.get(1)!.h, "a beast is smaller");
});

test("a dash ends beside the target on the attacker's side, inside the stage; the camera aims between them", () => {
  const st = { w: 390, h: 560 };
  const boxes = layout(group(["player", "companion"], ["enemy", "enemy"]), st);
  const me = boxes.get(1)!, foe = boxes.get(21)!;
  const sp = strikeBox(me, foe, "ally", st);
  assert.ok(sp.x < foe.x && Math.abs(sp.feet - foe.feet) < st.h * 0.05, "left of the foe, at its depth");
  assert.ok(sp.x - sp.w * 0.42 >= 0 && sp.x + sp.w * 0.42 <= st.w);
  const back = strikeBox(foe, me, "enemy", st);
  assert.ok(back.x > me.x, "a foe comes from the right of an ally");
  const f = focusOf([sp, foe]);
  assert.ok(f.x > Math.min(sp.x, foe.x) && f.x < Math.max(sp.x, foe.x));
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

test("the arena test fight: free to start, Lin and Bai against two bandits, an ultimate charged, nothing settled", async () => {
  const { testContent } = await import("./helpers/content.ts");
  const { newGameState } = await import("../src/engine/state.ts");
  const { Encounter, canStart, SHOWCASE } = await import("../src/engine/encounter.ts");
  const c = testContent();
  for (const [k, id] of Object.entries(SHOWCASE)) if (k !== "beastStage") assert.ok(c.has(id), `${id} exists`);
  assert.ok(c.get<any>(SHOWCASE.beast).stages.some((x: any) => x.key === SHOWCASE.beastStage), "the beast has that stage");
  const s = newGameState(c, 1_700_000_000_000, { seed: 3 });
  const energy = s.resources.energy.value;
  const can = canStart(s, c, { kind: "showcase" }, 1_700_000_000_000);
  assert.ok(can.ok && can.energy === 0);
  const r = Encounter.start(s, c, { kind: "showcase" }, 1_700_000_000_000);
  assert.ok(r.ok);
  const b = r.encounter.battle!;
  assert.deepEqual(b.units.filter((u) => u.side === "enemy").map((u) => u.id), [SHOWCASE.enemy, SHOWCASE.enemy]);
  assert.ok(b.units.some((u) => u.id === SHOWCASE.companion), "Bai joins even when not bonded");
  assert.ok(b.units.some((u) => u.id === SHOWCASE.beast && u.kind === "beast"), "YunYun joins even without a beast in the save");
  const p = b.player;
  assert.equal(p.ult, 100); assert.ok(p.skills.some((x) => x.kind === "ultimate"));
  assert.equal(s.resources.energy.value, energy, "no energy spent");
  assert.equal(s.techniques.ultimate ?? null, null, "the save's loadout is untouched");
  // every technique the test fight can show has a stage effect
  for (const u of b.units) for (const sk of u.skills) if (sk.id.startsWith("tech.") || sk.id.startsWith("btech.")) assert.ok(c.get<any>(sk.id).vfx, `${sk.id} has a vfx block`);
});
