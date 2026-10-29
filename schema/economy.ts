import { z } from "zod";
import { Named, Quantity, ref, ItemRef, Unlock, Currency, Range2, Rarity } from "./common.ts";

export const ShopEntry = z.object({
  id: ref("mat", "cons", "gift", "book", "blueprint", "egg", "bfood", "gear", "tech", "method"),
  price: z.number().int().positive(),
  currency: Currency.default("spirit_stones"),
  /** Limited stock per restock; omit for unlimited. */
  qty: z.number().int().positive().optional(),
  unlock: Unlock.default({}),
});

export const Shop = Named.extend({
  id: ref("shop"),
  owner: ref("npc").optional(),
  restock: z.enum(["none", "daily", "per_visit", "weekly"]).default("daily"),
  stock: z.array(ShopEntry).min(1),
  affinity_discount: z.object({ npc: ref("npc"), pct_per_level: z.number().min(0).max(50) }).optional(),
  fame_discount_pct_per_500: z.number().min(0).max(20).default(0),
  buys_items: z.boolean().default(true),
});

export const LootEntry = z.object({
  id: ref("mat", "cons", "gift", "book", "blueprint", "qitem", "egg", "bfood", "junk", "gear", "tech", "method"),
  chance: z.number().gt(0).max(1),
  qty: Range2.default([1, 1]),
});

export const LootTable = z.object({
  id: ref("loot"),
  name: z.string().optional(),
  /** `independent`: each entry rolled separately; `pick`: roll `rolls` times weighted by chance. */
  mode: z.enum(["independent", "pick"]).default("independent"),
  rolls: z.number().int().positive().default(1),
  entries: z.array(LootEntry).default([]),
  guaranteed: z.array(Quantity).default([]),
  spirit_stones: Range2.default([0, 0]),
  sect_fame: z.number().int().nonnegative().default(0),
  mastery_xp: z.number().int().nonnegative().default(0),
}).refine((l) => l.entries.length + l.guaranteed.length > 0 || l.spirit_stones[1] > 0, "loot table must yield something");

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
  output: ref("gear").refine((g) => g.split(".").length === 3, "forge output must be gear.<family>.<rarity>"),
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
