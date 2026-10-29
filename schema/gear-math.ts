/**
 * Gear formulas shared by the game and the validator. See docs/GEAR.md.
 * Pure functions over `GearRules` (content/equipment/rules.json) — no randomness here except
 * `rollInstance`, which takes an injected RNG so tests and saves stay deterministic.
 */
import { z } from "zod";
import { RARITIES, Rarity, Slot, Attribute, GearEffect, rarityIndex } from "./common.ts";
type Effect = z.infer<typeof GearEffect>;
import { ref } from "./ids.ts";

export const RarityRule = z.object({
  main_mult: z.number().positive(),
  affix_mult: z.number().positive(),
  /** Lowest possible roll at ilvl 1 (0 < floor ≤ 1). */
  floor: z.number().gt(0).max(1),
  affixes: z.number().int().min(0).max(6),
  specials: z.number().int().min(0).max(3),
});

export const AffixDef = z.object({ stat: Attribute, value: z.number().positive(), weight: z.number().positive().default(1) });

export const GearRules = z.object({
  ilvl_cap: z.number().int().min(10),
  scale: z.object({ a: z.number().nonnegative(), b: z.number().nonnegative() }),
  /** Fraction of the gap between a rarity's floor and 0.95 that is gained by ilvl_cap. */
  floor_ilvl_bonus: z.number().min(0).max(1),
  rarity: z.record(Rarity, RarityRule).refine((r) => RARITIES.every((k) => r[k]), "every rarity needs a rule"),
  main_stat_by_slot: z.record(Slot, Attribute),
  affix_pools: z.record(Slot, z.array(AffixDef).min(5)),
  special_pool: z.array(GearEffect).min(3),
  cp_weights: z.object({ main: z.number().positive(), special: z.number().positive(), affix: z.record(z.string(), z.number().positive()).default({}) }),
  /** Percentage-like stats grow gently with item level: top = value · rarity_mult · (1 + bounded_scale · L / ilvl_cap). Flat stats use `scale`. */
  bounded_stats: z.array(z.string()).default(["crit", "crit_dmg", "acc", "eva", "spd", "cdr", "dmg_red", "life_steal", "armor_pen", "heal_bonus", "shield_str", "status_res", "elem_dmg", "elem_res"]),
  bounded_scale: z.number().min(0).default(1),
  content_bands: z.object({ region_per_order: z.number().int().positive(), region_span: z.number().int().positive(), tower_base: z.number().int().nonnegative(), mega_min: z.number().int().positive() }),
});
export type GearRules = z.infer<typeof GearRules>;
type RRule = z.infer<typeof RarityRule>;
type Affix = z.infer<typeof AffixDef>;
const rr = (rules: GearRules, r: Rarity): RRule => rules.rarity[r] as RRule;
const pool = (rules: GearRules, slot: Slot): Affix[] => (rules.affix_pools[slot] ?? []) as Affix[];

export const scale = (rules: GearRules, L: number) => 1 + rules.scale.a * L + rules.scale.b * L * L;
export const isBounded = (rules: GearRules, stat: string) => rules.bounded_stats.includes(stat) || rules.bounded_stats.includes(stat.split(".")[0]!);
/** Item-level multiplier for a stat: flat stats follow `scale`, bounded (percentage-like) stats a gentle linear ramp. */
export const statScale = (rules: GearRules, stat: string, L: number) => isBounded(rules, stat) ? 1 + rules.bounded_scale * Math.min(1, L / rules.ilvl_cap) : scale(rules, L);

/** Lowest roll for a rarity at an item level. Rises with ilvl. */
export function rollFloor(rules: GearRules, r: Rarity, L: number): number {
  const f = rr(rules, r).floor;
  return f + (0.95 - f) * Math.min(1, L / rules.ilvl_cap) * rules.floor_ilvl_bonus;
}

export function mainStatRange(rules: GearRules, mainValue: number, r: Rarity, L: number, stat = "atk"): [number, number] {
  const top = mainValue * statScale(rules, stat, L) * rr(rules, r).main_mult;
  return [top * rollFloor(rules, r, L), top];
}

export function affixRange(rules: GearRules, affixValue: number, r: Rarity, L: number, stat = "atk"): [number, number] {
  const top = affixValue * statScale(rules, stat, L) * rr(rules, r).affix_mult;
  return [top * rollFloor(rules, r, L), top];
}

/** ilvl band a region of the given order should drop. */
export function regionBand(rules: GearRules, order: number): [number, number] {
  const lo = Math.max(1, rules.content_bands.region_per_order * (order - 1) + 1);
  return [lo, Math.min(rules.ilvl_cap, lo + rules.content_bands.region_span)];
}

export interface GearInstance {
  base: string; rarity: Rarity; ilvl: number; enhance: number;
  main: { stat: string; roll: number; value: number };
  affixes: { stat: string; roll: number; value: number; locked?: boolean }[];
  specials: Effect[];
  awakened: boolean;
}

/**
 * Create an instance. `rng()` ∈ [0,1). `fixedSpecials` come from unique bases; otherwise specials are
 * drawn from the rule pool. Deterministic given the rng sequence.
 */
export function rollInstance(
  rules: GearRules,
  base: { id: string; slot: Slot; main_value: number; signature_affix?: string; special_effects?: Effect[] },
  rarity: Rarity, ilvl: number, rng: () => number,
): GearInstance {
  const L = Math.max(1, Math.min(rules.ilvl_cap, Math.round(ilvl)));
  const rule = rr(rules, rarity);
  const floor = rollFloor(rules, rarity, L);
  const roll = () => floor + (1 - floor) * rng();
  const mainStat = rules.main_stat_by_slot[base.slot] as string;
  const mr = roll();
  const avail = [...pool(rules, base.slot)];
  const picked: { stat: string; roll: number; value: number }[] = [];
  const take = (stat: string) => {
    const i = avail.findIndex((p) => p.stat === stat);
    if (i < 0) return;
    const def = avail.splice(i, 1)[0]!;
    const r = roll();
    picked.push({ stat, roll: r, value: round2(affixRange(rules, def.value, rarity, L, stat)[1] * r) });
  };
  if (base.signature_affix && rule.affixes > 0) take(base.signature_affix);
  while (picked.length < rule.affixes && avail.length) {
    const total = avail.reduce((s, p) => s + p.weight, 0);
    let x = rng() * total;
    for (const p of avail) { x -= p.weight; if (x <= 0) { take(p.stat); break; } }
  }
  const specials: Effect[] = [...(base.special_effects ?? [])];
  const specialPool = rules.special_pool.filter((s) => !specials.some((e) => e.description === s.description));
  while (specials.length < (base.special_effects?.length ?? 0) + rule.specials && specialPool.length) {
    specials.push(specialPool.splice(Math.floor(rng() * specialPool.length), 1)[0]!);
  }
  return {
    base: base.id, rarity, ilvl: L, enhance: 0,
    main: { stat: mainStat, roll: mr, value: round2(mainStatRange(rules, base.main_value, rarity, L, mainStat)[1] * mr) },
    affixes: picked, specials, awakened: false,
  };
}

/** Refinement: one rarity up, same ilvl, percentile-preserving re-roll, new affix rolled fresh. */
export function refineInstance(rules: GearRules, inst: GearInstance, base: Parameters<typeof rollInstance>[1], rng: () => number): GearInstance {
  const next = RARITIES[rarityIndex(inst.rarity) + 1] as Rarity | undefined;
  if (!next) throw new Error("already at max rarity");
  const L = inst.ilvl;
  const oldFloor = rollFloor(rules, inst.rarity, L), newFloor = rollFloor(rules, next, L);
  const carry = (roll: number) => newFloor + (1 - newFloor) * ((roll - oldFloor) / (1 - oldFloor));
  const fresh = rollInstance(rules, base, next, L, rng);
  const mr = carry(inst.main.roll);
  const affixes = inst.affixes.map((a) => {
    const def = pool(rules, base.slot).find((p) => p.stat === a.stat)!;
    const r = carry(a.roll);
    return { ...a, roll: r, value: round2(affixRange(rules, def.value, next, L, a.stat)[1] * r) };
  });
  for (const a of fresh.affixes) if (affixes.length < rr(rules, next).affixes && !affixes.some((x) => x.stat === a.stat)) affixes.push(a);
  return { ...fresh, enhance: inst.enhance, awakened: inst.awakened, main: { ...fresh.main, roll: mr, value: round2(mainStatRange(rules, base.main_value, next, L, fresh.main.stat)[1] * mr) }, affixes, specials: fresh.specials.length >= inst.specials.length ? fresh.specials : inst.specials };
}

export function instanceCp(rules: GearRules, inst: GearInstance, enhanceMult = 1): number {
  const w = rules.cp_weights;
  // A percentage stat is worth more on a higher-level item (it multiplies more flat power), so its CP follows the flat curve.
  const lvl = (stat: string) => isBounded(rules, stat) ? scale(rules, inst.ilvl) / statScale(rules, stat, inst.ilvl) : 1;
  let cp = inst.main.value * enhanceMult * w.main * lvl(inst.main.stat);
  for (const a of inst.affixes) cp += a.value * enhanceMult * (w.affix[a.stat] ?? 1) * lvl(a.stat);
  cp += inst.specials.length * w.special;
  return Math.round(cp);
}

/**
 * Verify the ordering guarantees for every ilvl and every adjacent rarity pair.
 * Returns human-readable violations (empty = OK).
 */
export function checkRules(rules: GearRules): string[] {
  const out: string[] = [];
  for (let L = 1; L <= rules.ilvl_cap; L++) {
    for (let i = 0; i < RARITIES.length - 1; i++) {
      const lo = RARITIES[i] as Rarity, hi = RARITIES[i + 1] as Rarity;
      const [, loMaxMain] = mainStatRange(rules, 1, lo, L);
      const [hiMinMain] = mainStatRange(rules, 1, hi, L);
      if (hiMinMain <= loMaxMain) out.push(`ilvl ${L}: worst ${hi} main stat (${hiMinMain.toFixed(3)}) does not beat best ${lo} (${loMaxMain.toFixed(3)})`);
      const [, loMaxAff] = affixRange(rules, 1, lo, L);
      const [hiMinAff] = affixRange(rules, 1, hi, L);
      if (hiMinAff <= loMaxAff) out.push(`ilvl ${L}: worst ${hi} affix (${hiMinAff.toFixed(3)}) does not beat best ${lo} (${loMaxAff.toFixed(3)})`);
      if (rr(rules, hi).affixes < rr(rules, lo).affixes) out.push(`${hi} has fewer affixes than ${lo}`);
      if (rr(rules, hi).specials < rr(rules, lo).specials) out.push(`${hi} has fewer specials than ${lo}`);
    }
    if (L > 1) for (const r of RARITIES) {
      if (rollFloor(rules, r, L) < rollFloor(rules, r, L - 1)) out.push(`ilvl ${L}: ${r} roll floor decreases`);
      if (mainStatRange(rules, 1, r, L)[0] < mainStatRange(rules, 1, r, L - 1)[0]) out.push(`ilvl ${L}: ${r} worst main stat decreases`);
    }
    if (out.length > 20) break;
  }
  return out;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

export { ref };
