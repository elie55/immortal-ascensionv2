/**
 * Deterministic RNG stored in the save (two 32-bit words). SplitMix-style step; good enough for loot and
 * battle rolls and trivially serialisable. Never use Math.random() for anything that affects game state.
 */
export interface RngState { a: number; b: number }

export function seedRng(seed: number): RngState {
  let a = (seed ^ 0x9e3779b9) >>> 0, b = (Math.imul(seed, 0x85ebca6b) ^ 0xc2b2ae35) >>> 0;
  if (a === 0 && b === 0) b = 1;
  return { a, b };
}

/** Advance the state and return a float in [0, 1). */
export function nextFloat(s: RngState): number {
  // xorshift64* split into two 32-bit lanes (xorshift128-like)
  let t = s.a;
  const y = s.b;
  s.a = y;
  t ^= t << 11; t ^= t >>> 8;
  s.b = (t ^ y ^ (y >>> 19)) >>> 0;
  return (s.b + (s.a >>> 16) / 65536) / 4294967296 % 1;
}

export const nextInt = (s: RngState, minIncl: number, maxIncl: number) => minIncl + Math.floor(nextFloat(s) * (maxIncl - minIncl + 1));
export const chance = (s: RngState, p: number) => nextFloat(s) < p;

/** Pick an index by weight; returns -1 when all weights are 0. */
export function weightedIndex(s: RngState, weights: number[]): number {
  const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return -1;
  let x = nextFloat(s) * total;
  for (let i = 0; i < weights.length; i++) { x -= Math.max(0, weights[i]!); if (x < 0) return i; }
  return weights.length - 1;
}

/** Adapter for APIs that take a `() => number` (schema/gear-math). */
export const rngFn = (s: RngState) => () => nextFloat(s);
