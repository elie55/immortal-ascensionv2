/**
 * Arena placement (docs/BATTLE_STAGE.md §2). Two bands on one field: the enemies across the upper band, the
 * party across the lower one, each side packed so its figures do not cover each other and every HP bar has
 * room (enemy bars above the heads, party bars under the feet). Positions are computed in px for the actual
 * stage size, so a narrow phone and a wide tablet both get a clean line-up. Pure: no DOM, tested in Node.
 */
import type { Side } from "../../engine/combat/types.ts";

export interface StageSize { w: number; h: number }
/** A unit's box on the stage: x = centre, feet = ground line (px); h/w = box size; z = stacking. */
export interface Box { x: number; feet: number; h: number; w: number; z: number }
export interface LayoutUnit { uid: number; kind: "player" | "companion" | "beast" | "enemy" | "boss"; elite?: boolean }

/** The bands, as fractions of the stage. Tuned on 360×640 to 480×900 phones (see tests/battle-stage.test.ts). */
export const ARENA = {
  allyFeet: 0.93, allyStagger: 0.075, allyMaxH: 0.38,
  foeFeet: 0.52, foeStagger: 0.06, foeMaxH: 0.3,
  /** Visible share of a box's height that a figure is wide (the art has margins), and how much neighbours may overlap. */
  visible: 0.6, pack: 0.86,
  /** Horizontal span of each side (fractions of the width): the turn strip sits at the top left, over the enemy band. */
  allySpan: [0.03, 0.97] as [number, number], foeSpan: [0.19, 0.98] as [number, number],
  /** Where each side's line is centred. */
  allyCentre: 0.47, foeCentre: 0.6,
  /** Box width as a share of its height. */
  aspect: 0.78,
};

const size = (u: LayoutUnit) => u.kind === "beast" ? 0.62 : u.kind === "boss" ? 1.22 : u.elite ? 1.06 : 1;

/** Order along a side: the lead (player / boss / first foe) in the middle, the others around it, a beast at the end. */
export function lineUp(units: LayoutUnit[]): LayoutUnit[] {
  const lead = units.find((u) => u.kind === "player") ?? units.find((u) => u.kind === "boss") ?? units[0];
  const rest = units.filter((u) => u !== lead && u.kind !== "beast").sort((a, b) => a.uid - b.uid);
  const beasts = units.filter((u) => u !== lead && u.kind === "beast");
  if (!lead) return [];
  const out = [...rest];
  out.splice(Math.floor(rest.length / 2 + (rest.length % 2 ? 0.5 : 0)), 0, lead);
  return [...out, ...beasts];
}

/** Boxes for one side, keyed by uid. */
export function layoutSide(side: Side, units: LayoutUnit[], st: StageSize): Map<number, Box> {
  const out = new Map<number, Box>();
  const order = lineUp(units);
  if (!order.length) return out;
  const A = ARENA;
  const [s0, s1] = side === "ally" ? A.allySpan : A.foeSpan;
  const span = (s1 - s0) * st.w;
  const maxH = (side === "ally" ? A.allyMaxH : A.foeMaxH) * st.h;
  // the tallest figure that still lets the whole line fit its span
  const need = order.reduce((n, u) => n + size(u) * A.visible * A.pack, 0);
  const h = Math.min(maxH, span / need);
  const steps = order.map((u) => size(u) * h * A.visible * A.pack);
  const total = steps.reduce((a, b) => a + b, 0);
  const centre = (side === "ally" ? A.allyCentre : A.foeCentre) * st.w;
  let left = Math.max(s0 * st.w, Math.min(s1 * st.w - total, centre - total / 2));
  const leadIdx = order.findIndex((u) => u.kind === "player" || u.kind === "boss");
  const li = leadIdx >= 0 ? leadIdx : Math.floor(order.length / 2);
  const feet0 = (side === "ally" ? A.allyFeet : A.foeFeet) * st.h;
  const stagger = (side === "ally" ? A.allyStagger : A.foeStagger) * st.h;
  order.forEach((u, i) => {
    const bh = h * size(u);
    const x = left + steps[i]! / 2; left += steps[i]!;
    // the lead stands in front; its neighbours alternate a step back so the line reads as depth, not a row of cards
    const back = Math.abs(i - li) % 2 === 1;
    const feet = feet0 - (back ? stagger : 0) - (u.kind === "beast" ? -0.01 * st.h : 0);
    out.set(u.uid, { x, feet, h: bh, w: bh * A.aspect, z: Math.round(feet / st.h * 100) + (u.kind === "beast" ? 1 : 0) });
  });
  return out;
}

/** Both sides at once. */
export function layout(units: (LayoutUnit & { side: Side })[], st: StageSize): Map<number, Box> {
  return new Map([...layoutSide("enemy", units.filter((u) => u.side === "enemy"), st), ...layoutSide("ally", units.filter((u) => u.side === "ally"), st)]);
}

/**
 * Where an attacker stands to strike: beside the target, on the side facing the attacker's team, just in front
 * of it, at a size halfway between the two bands so the pair reads at one depth. Kept inside the stage.
 */
export function strikeBox(actor: Box, target: Box, side: Side, st: StageSize): Box {
  const h = (actor.h + target.h) / 2 * (actor.h > target.h ? 0.92 : 1);
  const w = h * ARENA.aspect;
  const gap = (target.w + w) * 0.36;
  const dir = side === "ally" ? -1 : 1;          // the party comes from the left of a foe, foes from the right of an ally
  let x = target.x + dir * gap;
  x = Math.max(w * 0.42, Math.min(st.w - w * 0.42, x));
  const feet = target.feet + (side === "ally" ? 0.03 : -0.02) * st.h;
  return { x, feet, h, w, z: 200 };
}

/** Centre of a few boxes' chests (what the camera pushes toward), in px. */
export function focusOf(boxes: Box[]): { x: number; y: number } {
  if (!boxes.length) return { x: 0, y: 0 };
  return { x: boxes.reduce((a, b) => a + b.x, 0) / boxes.length, y: boxes.reduce((a, b) => a + b.feet - b.h * 0.55, 0) / boxes.length };
}

/** Horizontal overlap of two figures' visible widths, as a share of the narrower one (0 = apart). */
export function overlapShare(a: Box, b: Box): number {
  const va = a.h * ARENA.visible / 2, vb = b.h * ARENA.visible / 2;
  const o = Math.min(a.x + va, b.x + vb) - Math.max(a.x - va, b.x - vb);
  return Math.max(0, o) / (2 * Math.min(va, vb));
}
