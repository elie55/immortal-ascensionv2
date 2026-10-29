import { z } from "zod";
import { Named, Quantity, ref, ItemRef, Unlock, Currency, Range2, Rarity, GearGrant, Slot } from "./common.ts";

const ShopCommon = {
  price: z.number().int().positive(),
  currency: Currency.default("spirit_stones"),
  /** Limited stock per restock; omit for unlimited. */
  qty: z.number().int().positive().optional(),
  unlock: Unlock.default({}),
};
/** Either a stackable item / technique (`id`) or a piece of gear (`gear`, stats rolled on purchase). */
export const ShopEntry = z.union([
  z.object({ id: ref("mat", "cons", "gift", "book", "blueprint", "egg", "bfood", "tech", "method"), ...ShopCommon }),
  z.object({ gear: GearGrant, ...ShopCommon }),
]);

export const Shop = Named.extend({
  id: ref("shop"),
  owner: ref("npc").optional(),
  restock: z.enum(["none", "daily", "per_visit", "weekly"]).default("daily"),
  stock: z.array(ShopEntry).min(1),
  affinity_discount: z.object({ npc: ref("npc"), pct_per_level: z.number().min(0).max(50) }).optional(),
  fame_discount_pct_per_500: z.number().min(0).max(20).default(0),
  buys_items: z.boolean().default(true),
});

export const LootItemEntry = z.object({
  id: ref("mat", "cons", "gift", "book", "blueprint", "qitem", "egg", "bfood", "junk", "tech", "method"),
  chance: z.number().gt(0).max(1),
  qty: Range2.default([1, 1]),
});

/** A specific base, or a pool resolved against every droppable base matching the filters. */
export const GearSelector = z.union([
  z.object({ base: ref("gear") }),
  z.object({ pool: z.object({ slot: Slot.optional(), set: ref("set").optional(), tags: z.array(z.string()).optional() }) }),
]);

export const LootGearEntry = z.object({
  gear: GearSelector,
  /** Relative weights; rarities absent or 0 never drop. */
  rarity_weights: z.record(Rarity, z.number().nonnegative()),
  chance: z.number().gt(0).max(1),
  /** Override the table's ilvl band for this entry. */
  ilvl: Range2.optional(),
}).refine((e) => Object.values(e.rarity_weights).some((w) => w > 0), "rarity_weights must have a positive weight");

export const LootEntry = z.union([LootItemEntry, LootGearEntry]);

export const LootTable = z.object({
  id: ref("loot"),
  name: z.string().optional(),
  /** `independent`: each entry rolled separately; `pick`: roll `rolls` times weighted by chance. */
  mode: z.enum(["independent", "pick"]).default("independent"),
  rolls: z.number().int().positive().default(1),
  /** Item-level band for gear from this table (required when the table has gear entries). */
  ilvl: Range2.optional(),
  entries: z.array(LootEntry).default([]),
  guaranteed: z.array(Quantity).default([]),
  guaranteed_gear: z.array(GearGrant).default([]),
  spirit_stones: Range2.default([0, 0]),
  sect_fame: z.number().int().nonnegative().default(0),
  mastery_xp: z.number().int().nonnegative().default(0),
}).superRefine((l, ctx) => {
  if (l.entries.length + l.guaranteed.length + l.guaranteed_gear.length === 0 && l.spirit_stones[1] === 0) ctx.addIssue({ code: "custom", message: "loot table must yield something" });
  const hasGear = l.entries.some((e) => "gear" in e && !(e as any).ilvl);
  if (hasGear && !l.ilvl) ctx.addIssue({ code: "custom", message: "loot table with gear entries needs an ilvl band" });
});

const RecipeUnlock = z.discriminatedUnion("type", [
  z.object({ type: z.literal("known") }),
  z.object({ type: z.literal("blueprint"), id: ref("blueprint") }),
  z.object({ type: z.literal("rank"), id: ref("rank") }),
  z.object({ type: z.literal("npc"), id: ref("npc"), affinity: z.number().int().nonnegative() }),
  z.object({ type: z.literal("quest"), id: ref("quest") }),
  z.object({ type: z.literal("sect_fame"), fame: z.number().int().positive() }),
]);

export const AlchemyRecipe = Named.extend({
  id: ref("alchemy"),
  output: z.object({ id: ref("cons"), qty: Range2 }),
  ingredients: z.array(Quantity).min(1),
  cost_stones: z.number().int().nonnegative(),
  grade: z.number().int().min(1).max(9),
  success_base: z.number().min(0.05).max(1),
  furnace_min: z.number().int().min(1).max(9).default(1),
  proficiency_min: z.number().int().nonnegative().default(0),
  proficiency_xp: z.number().int().positive(),
  unlock: RecipeUnlock,
  failure: z.object({ return_pct: z.number().min(0).max(1).default(0), byproduct: ItemRef.optional() }).default({}),
});

export const ForgeRecipe = Named.extend({
  id: ref("forge"),
  /** The crafted piece: base + rarity + ilvl; stats rolled on craft. */
  output: GearGrant,
  ingredients: z.array(Quantity).min(1),
  cost_stones: z.number().int().nonnegative(),
  fame_required: z.number().int().nonnegative().default(0),
  unlock: RecipeUnlock,
});

export const Furnace = Named.extend({
  grade: z.number().int().min(1).max(9),
  success_bonus: z.number().min(0),
  yield_bonus: z.number().min(0).default(0),
  upgrade: z.object({ materials: z.array(Quantity), stones: z.number().int().nonnegative() }).optional(),
});

export { Rarity };

