import { z } from "zod";
import { Named, Rarity, Stats, Quantity, artBlock, ref, StatusApply, GearEffect, Slot, RARITIES, ItemRef } from "./common.ts";

const ItemBase = Named.extend({
  rarity: Rarity,
  sell_value: z.number().int().nonnegative(),
  stack_limit: z.number().int().positive().default(999),
  tags: z.array(z.string()).default([]),
  art: artBlock(["icon"]),
});

export const Material = ItemBase.extend({
  id: ref("mat"),
  subtype: z.enum(["ore", "herb", "flower", "monster", "crystal", "fragment", "enhancement", "refining", "awakening", "breakthrough", "treasure"]),
  tier: z.number().int().min(1).max(8),
  /** Enhancement materials: which rarities of gear they can enhance. */
  enhances: z.array(Rarity).optional(),
  /** Fragments: the technique they assemble into, and how many are needed. */
  fragment_of: z.object({ tech: ref("tech", "method"), count: z.number().int().positive() }).optional(),
});

export const Consumable = ItemBase.extend({
  id: ref("cons"),
  subtype: z.enum(["pill", "elixir", "food"]),
  grade: z.number().int().min(1).max(9).default(1),
  effects: z.object({
    qi: z.number().int().optional(),
    hp_pct: z.number().optional(),
    sp_pct: z.number().optional(),
    buff: StatusApply.optional(),
    cultivation_boost: z.object({ mult: z.number().positive(), minutes: z.number().int().positive() }).optional(),
    permanent: Stats.optional(),
    breakthrough_chance_bonus: z.number().min(0).max(1).optional(),
    mastery_xp: z.number().int().optional(),
  }).refine((e) => Object.values(e).some((v) => v !== undefined), "consumable needs at least one effect"),
  usable_in_battle: z.boolean().default(false),
  cooldown_min: z.number().int().nonnegative().default(0),
});

export const Gift = ItemBase.extend({
  id: ref("gift"),
  /** Affinity when given to an NPC with no stated preference. */
  base_affinity: z.number().int().default(5),
  gift_tags: z.array(z.string()).min(1),
});

export const Book = ItemBase.extend({
  id: ref("book"),
  teaches: ref("tech", "method"),
});

export const Blueprint = ItemBase.extend({
  id: ref("blueprint"),
  unlocks: ref("forge", "alchemy"),
});

export const QuestItem = ItemBase.extend({
  id: ref("qitem"),
  stack_limit: z.number().int().positive().default(1),
});

export const Egg = ItemBase.extend({
  id: ref("egg"),
  hatches_into: ref("beast"),
  hatch_minutes: z.number().int().positive(),
  hatch_requirements: z.object({ realm: ref("realm").optional(), items: z.array(Quantity).optional() }).default({}),
});

export const BeastFood = ItemBase.extend({
  id: ref("bfood"),
  xp: z.number().int().positive(),
  bond: z.number().int().nonnegative().default(1),
  preferred_elements: z.array(ref("elem")).default([]),
});

export const Junk = ItemBase.extend({ id: ref("junk") });

// ---------- Equipment (see docs/GEAR.md) ----------

const RarityArt = z.object({
  /** Optional display-name override for this rarity (default: base name). */
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  art: artBlock(["icon"]),
});

/**
 * A gear *base*: what kind of item it is. Stats are never stored here — they are rolled per instance
 * from `content/equipment/rules.json` using (base.main_value, rarity, ilvl).
 */
export const GearBase = Named.extend({
  id: ref("gear").refine((id) => id.split(".").length === 2, "gear id is gear.<base>"),
  slot: Slot,
  weapon_type: z.enum(["sword", "spear", "saber", "staff", "fan", "flute", "bow", "whip"]).optional(),
  armor_type: z.enum(["robe", "light", "heavy", "mystic"]).optional(),
  element: ref("elem").optional(),
  set: ref("set").optional(),
  /** Main-stat value at ilvl 1, common, perfect roll. Typical: 10 weapon ATK, 60 armor HP. */
  main_value: z.number().positive(),
  /** Affix that is always present (must be in the slot's affix pool). */
  signature_affix: z.string().optional(),
  rarity_range: z.tuple([Rarity, Rarity]),
  /** Can be produced by generic pool drops ({pool:{slot}}); uniques and set pieces usually false. */
  droppable: z.boolean().default(true),
  drop_tags: z.array(z.string()).default([]),
  /** Unique: single rarity, fixed special effects, still rolls main stat and affixes. */
  unique: z.boolean().default(false),
  special_effects: z.array(GearEffect).default([]),
  awakening: z
    .object({ effect: GearEffect, materials: z.array(Quantity).min(1), cost_stones: z.number().int().positive() })
    .optional(),
  requirements: z.object({ realm: ref("realm").optional() }).default({}),
  rarities: z.record(Rarity, RarityArt),
}).superRefine((b, ctx) => {
  const [lo, hi] = b.rarity_range.map((r) => RARITIES.indexOf(r));
  if (lo > hi) ctx.addIssue({ code: "custom", message: "rarity_range min > max" });
  const expected = RARITIES.slice(lo, hi + 1);
  for (const r of expected) if (!b.rarities[r]) ctx.addIssue({ code: "custom", message: `missing art for rarity ${r} (inside rarity_range)` });
  for (const r of Object.keys(b.rarities)) if (!expected.includes(r as Rarity)) ctx.addIssue({ code: "custom", message: `rarity ${r} is outside rarity_range` });
  if (b.slot === "weapon" && !b.weapon_type) ctx.addIssue({ code: "custom", message: "weapon base needs weapon_type" });
  if (b.unique && lo !== hi) ctx.addIssue({ code: "custom", message: "unique base must have a single rarity" });
  if (b.unique && b.special_effects.length === 0) ctx.addIssue({ code: "custom", message: "unique base needs special_effects" });
});
export type GearBase = z.infer<typeof GearBase>;

export const GearSet = Named.extend({
  id: ref("set"),
  pieces: z.array(ref("gear")).min(3).max(5),
  bonuses: z.array(z.object({
    pieces: z.number().int().min(2),
    stats: Stats.default({}),
    effect: GearEffect.optional(),
  })).min(1),
  /** Where the set drops (documentation; validated loosely). */
  source_hint: z.string().min(1),
});

/** +1 … +15 enhancement table. */
export const EnhancementTable = z.object({
  levels: z.array(z.object({
    level: z.number().int().min(1).max(15),
    stat_mult: z.number().positive(),
    stones_base: z.number().int().positive(),
    materials: z.array(Quantity).default([]),
    success: z.number().min(0).max(1).default(1),
  })).length(15),
  rarity_cost_mult: z.record(Rarity, z.number().positive()),
});

/** Refinement: chance to raise rarity by one step, capped at mythic. */
export const RefinementTable = z.object({
  steps: z.array(z.object({
    from: Rarity,
    chance: z.number().min(0).max(1),
    stones: z.number().int().positive(),
    materials: z.array(Quantity).min(1),
  })),
});

export const ReforgeTable = z.object({
  stones_base: z.number().int().positive(),
  materials: z.array(Quantity).min(1),
  lock_cost_per_stat: z.array(Quantity).min(1),
  max_secondary_stats: z.number().int().min(1).max(4),
});

export const Title = Named.extend({ id: ref("title"), bonuses: Stats.default({}) });

export { ItemRef };

