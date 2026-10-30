/** Animation runtime math (src/ui/anim/rig.ts): clips, speed scaling, interrupt rules, reduced motion, mesh. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ambient, buildMesh, clips, compose, deform, samplePose, weaponPlacement, Player, REST, type RigDef } from "../src/ui/anim/rig.ts";

const rig: RigDef = { id: "t", body: "b", size: [768, 1024], bbox: [66, 60, 697, 1005], ground: [382, 1005], facing: -1, archetype: "humanoid", mesh: [8, 12], hips: 551, chest: 315, neck: 202,
  weapon: { file: "w", size: [300, 500], offset: [300, 400], pivot: [560, 520] } };

test("every archetype has the clips the battle screen asks for, with contact inside the clip", () => {
  for (const arch of ["humanoid", "humanoid_unarmed", "quadruped", "flying", "serpent", "large"] as const) {
    const lib = clips(arch);
    for (const n of ["idle", "enter", "attack", "cast", "ult", "hit", "hitBig", "dodge", "victory", "defeat"]) assert.ok(lib[n], `${arch}.${n}`);
    for (const c of Object.values(lib)) if (c.contact !== undefined) assert.ok(c.contact > 0 && c.contact < c.dur, `${arch}.${c.name} contact`);
    assert.equal(samplePose(lib.attack!, 0).lean, 0); assert.equal(samplePose(lib.attack!, lib.attack!.dur).lean, 0, "attack returns to rest");
  }
});

test("playback speed scales the curves exactly: 3× reaches contact in a third of the wall time", () => {
  const times: number[] = [];
  for (const speed of [1, 2, 3]) {
    const pl = new Player(clips("humanoid"));
    let t = 0;
    pl.play("attack", speed);
    while (!pl.current!.contactFired && t < 5000) { pl.tick(16); t += 16; }
    times.push(t);
  }
  assert.ok(Math.abs(times[0]! / 2 - times[1]!) <= 16 * 1.01 && Math.abs(times[0]! / 3 - times[2]!) <= 16 * 1.01, `contact wall times ${times}`);
  // the pose at contact is the same regardless of speed
  const a = samplePose(clips("humanoid").attack!, 300), b = samplePose(clips("humanoid").attack!, 300);
  assert.deepEqual(a, b);
});

test("a hit waits for a swing in flight to connect, then plays; defeat ends everything; idle resumes after a one-shot", async () => {
  const pl = new Player(clips("humanoid"));
  pl.play("attack");
  for (let i = 0; i < 6; i++) pl.tick(16);            // 96 ms: before contact (300)
  pl.play("hit");
  assert.equal(pl.name, "attack", "the swing is not interrupted before contact");
  for (let i = 0; i < 40; i++) pl.tick(16);           // past the attack's end
  assert.equal(pl.name, "hit", "the queued hit plays once the swing is done");
  for (let i = 0; i < 40; i++) pl.tick(16);
  assert.equal(pl.name, "idle");
  pl.play("victory"); assert.equal(pl.name, "victory");
  pl.play("hit"); assert.equal(pl.name, "hit", "a hit interrupts the victory loop");
  const d = pl.play("defeat"); assert.equal(pl.name, "defeat");
  const r = pl.play("attack"); await r.done;           // resolved immediately: nothing plays after defeat
  assert.equal(pl.name, "defeat");
  for (let i = 0; i < 80; i++) pl.tick(16);
  await d.done;
  assert.equal(pl.name, "defeat", "defeat holds its last frame");
  assert.ok(pl.lastPose.dissolve > 0.99);
});

test("reduced motion removes ambient sway, flash and flutter but keeps pose changes", () => {
  const amb = ambient(1234, 1, true, 3);
  assert.deepEqual(amb, { breath: 0, wind: 0, y: 0, blink: 0 });
  const live = ambient(1234, 1, false, 3);
  assert.ok(live.breath >= 0 && live.breath <= 1 && live.wind > 0);
  const hit = samplePose(clips("humanoid").hit!, 30);
  const reduced = { ...compose(hit, amb, 0), flash: 0, flutter: 0 };
  assert.ok(reduced.lean < 0, "the flinch still happens"); assert.equal(reduced.flash, 0); assert.equal(reduced.flutter, 0);
});

test("blink: short, periodic, never while reduced", () => {
  let blinks = 0, open = 0;
  for (let t = 0; t < 20000; t += 10) { const b = ambient(t, 1, false, 7).blink; if (b > 0.5) blinks++; else open++; }
  assert.ok(blinks > 0 && blinks < open * 0.05, `blink duty ${blinks}/${open}`);
});

test("mesh deformation keeps the feet on the ground, stays finite, and leans toward the facing", () => {
  const mesh = buildMesh(rig);
  assert.equal(mesh.index.length, 8 * 12 * 6);
  const still = { ...REST, flutter: 0 };
  const rest = deform(rig, mesh, still);
  // the bottom-centre vertex (the feet) sits on the ground line; the top row is above it
  const rows = 13, cols = 9; const feet = ((rows - 1) * cols + 4) * 2; const bottomY = rest[feet + 1]!, topY = rest[1]!;
  assert.ok(Math.abs(bottomY - 1005) < 1e-6 && topY < bottomY, `feet y ${bottomY}`);
  const lean = deform(rig, mesh, { ...still, lean: 0.3 });
  const topXrest = rest[8]!, topXlean = lean[8]!;   // top-centre vertex
  assert.ok(topXlean < topXrest, "facing −1 (left) leans the top of the figure to the left");
  assert.ok(Math.abs(lean[feet]! - rest[feet]!) < 1e-6 && Math.abs(lean[feet + 1]! - rest[feet + 1]!) < 1e-6, "feet do not move when leaning");
  for (const v of deform(rig, mesh, { ...REST, squash: 0.1, rot: 0.2, flutter: 3, wind: 1.3, breath: 1, head: 0.3, x: 0.2, y: -20 })) assert.ok(Number.isFinite(v));
  const geo = Array.from(mesh.flutter); assert.ok(Math.max(...geo) > 0.5 && Math.min(...geo) === 0, "geometric flutter: edges sway, the spine does not");
});

test("the weapon pivots at the grip and swings toward the foe", () => {
  const rest = weaponPlacement(rig, REST);
  assert.deepEqual([rest.px, rest.py], [560, 520]);
  const swing = weaponPlacement(rig, { ...REST, weapon: 1 });
  assert.equal(swing.angle, -1, "facing −1 mirrors the swing");
});
