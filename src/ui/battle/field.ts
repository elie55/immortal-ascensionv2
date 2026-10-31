/**
 * The battlefield as one ground plane (docs/BATTLE_STAGE.md §2). Units have a field position (fx across,
 * fy into the depth); `project` turns it into a screen placement (fractions of the stage, scale, z) and
 * the choreographer uses the same coordinates for travel paths and effect aims. Pure: no DOM, tested in Node.
 */
import type { Side } from "../../engine/combat/types.ts";

export interface FieldPos { fx: number; fy: number }
/** x, y as fractions of the stage (y = feet line), scale relative to a front-row unit, z for stacking. */
export interface Placement { x: number; y: number; scale: number; z: number }

export interface FieldGeometry {
  /** Feet line of the farthest row, fraction of the stage height. */
  horizon: number;
  /** Feet line of the nearest row, fraction of the stage height. */
  floorBottom: number;
  /** Scale at the front (fy 0) and at the back (fy 1). */
  near: number; far: number;
  /** Horizontal inset of the floor at the front and at the back (perspective narrowing). */
  insetNear: number; insetFar: number;
}

/** Portrait phone: the party stands low and large, the enemies high and smaller, with a visible floor between. */
export const PORTRAIT: FieldGeometry = { horizon: 0.42, floorBottom: 0.9, near: 1, far: 0.66, insetNear: 0.04, insetFar: 0.14 };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function project(g: FieldGeometry, p: FieldPos): Placement {
  const fy = clamp01(p.fy), fx = clamp01(p.fx);
  const inset = lerp(g.insetNear, g.insetFar, fy);
  return { x: lerp(inset, 1 - inset, fx), y: lerp(g.floorBottom, g.horizon, fy), scale: lerp(g.near, g.far, fy), z: Math.round((1 - fy) * 100) };
}

/**
 * Formation templates: the party in a slanted line front left, the enemies in a slanted line back right, both
 * facing the diagonal. Index 0 is the lead (the player; the focused enemy or boss), placed where it reads best:
 * the player nearest the centre of its line, the boss deepest.
 */
export const FORMATIONS: Record<Side, Record<number, FieldPos[]>> = {
  ally: {
    1: [{ fx: 0.3, fy: 0.12 }],
    2: [{ fx: 0.36, fy: 0.1 }, { fx: 0.16, fy: 0.3 }],
    3: [{ fx: 0.38, fy: 0.08 }, { fx: 0.18, fy: 0.26 }, { fx: 0.06, fy: 0.46 }],
    4: [{ fx: 0.4, fy: 0.06 }, { fx: 0.24, fy: 0.2 }, { fx: 0.1, fy: 0.36 }, { fx: 0.02, fy: 0.54 }],
  },
  enemy: {
    1: [{ fx: 0.7, fy: 0.8 }],
    2: [{ fx: 0.76, fy: 0.86 }, { fx: 0.58, fy: 0.66 }],
    3: [{ fx: 0.8, fy: 0.9 }, { fx: 0.62, fy: 0.72 }, { fx: 0.48, fy: 0.56 }],
    4: [{ fx: 0.84, fy: 0.92 }, { fx: 0.68, fy: 0.78 }, { fx: 0.54, fy: 0.64 }, { fx: 0.42, fy: 0.5 }],
    5: [{ fx: 0.86, fy: 0.94 }, { fx: 0.72, fy: 0.82 }, { fx: 0.6, fy: 0.7 }, { fx: 0.48, fy: 0.58 }, { fx: 0.38, fy: 0.46 }],
  },
};

/** Field position of the `i`-th unit of `n` on a side (n clamped to the templates; extra units share the last slot). */
export function slot(side: Side, i: number, n: number): FieldPos {
  const table = FORMATIONS[side];
  const max = Math.max(...Object.keys(table).map(Number));
  const row = table[Math.min(max, Math.max(1, n))]!;
  return row[Math.min(i, row.length - 1)]!;
}

/**
 * Where a melee attacker stands to strike `target`: one unit width short of it along the line between them,
 * on the attacker's side, slightly toward the camera so the pair never overlaps exactly.
 */
export function strikePoint(from: FieldPos, target: FieldPos, reach = 0.16): FieldPos {
  const dx = target.fx - from.fx, dy = target.fy - from.fy;
  const d = Math.hypot(dx, dy) || 1;
  const k = Math.max(0, d - reach) / d;
  return { fx: clamp01(from.fx + dx * k), fy: clamp01(from.fy + dy * k - 0.03) };
}

/** Facing of a unit toward another: +1 looks right, −1 looks left (for mirrored puppets and effects). */
export function facing(from: FieldPos, to: FieldPos): 1 | -1 { return to.fx >= from.fx ? 1 : -1; }

/** Centre of a group on the field (what the camera pushes toward). */
export function centroid(ps: FieldPos[]): FieldPos {
  if (!ps.length) return { fx: 0.5, fy: 0.5 };
  return { fx: ps.reduce((a, p) => a + p.fx, 0) / ps.length, fy: ps.reduce((a, p) => a + p.fy, 0) / ps.length };
}
