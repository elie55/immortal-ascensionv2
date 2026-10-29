import { z } from "zod";
import { ItemRef, RewardRef, ref } from "./ids.ts";

// ---------- Enumerations ----------

export const RARITIES = [
  "common", "uncommon", "rare", "epic", "legendary", "mythic", "immortal", "divine",
] as const;
export const Rarity = z.enum(RARITIES);
export type Rarity = z.infer<typeof Rarity>;
export const rarityIndex = (r: Rarity) => RARITIES.indexOf(r);
/** Refinement can never push a piece above this rarity. */
export const REFINE_CAP: Rarity = "mythic";

export const ELEMENTS = ["wood", "fire", "earth", "metal", "water"] as const;
export const ElementName = z.enum(ELEMENTS);

export const SLOTS = ["weapon", "armor", "helmet", "boots", "necklace", "ring", "artifact"] as const;
export const Slot = z.enum(SLOTS);
export type Slot = z.infer<typeof Slot>;

export const CORE_ATTRIBUTES = [
  "hp", "atk", "def", "spd", "crit", "crit_dmg", "acc", "eva", "sp_power", "sp_energy",
] as const;
export const SECONDARY_ATTRIBUTES = [
  "armor_pen", "life_steal", "heal_bonus", "shield_str", "cdr", "dmg_red", "status_res",
] as const;
export const ELEMENTAL_ATTRIBUTES = [
  ...ELEMENTS.map((e) => `elem_dmg.${e}` as const),
  ...ELEMENTS.map((e) => `elem_res.${e}` as const),
] as const;
export const ATTRIBUTES = [...CORE_ATTRIBUTES, ...SECONDARY_ATTRIBUTES, ...ELEMENTAL_ATTRIBUTES] as const;
export const Attribute = z.enum(ATTRIBUTES as unknown as [string, ...string[]]);
export type Attribute = (typeof ATTRIBUTES)[number];

/** Partial stat block: attribute → flat value (percent stats are stored as percent, e.g. crit 18.5). */
export const Stats = z.record(Attribute, z.number());

export const CURRENCIES = ["spirit_stones", "sect_fame", "contribution"] as const;
export const Currency = z.enum(CURRENCIES);

// ---------- Text ----------

export const Named = z.object({
  name: z.string().min(1),
  name_cn: z.string().optional(),
  description: z.string().min(1),
  lore: z.string().optional(),
});

// ---------- Quantities, rewards, requirements ----------

export const Quantity = z.object({ id: ItemRef, qty: z.number().int().positive() });
export type Quantity = z.infer<typeof Quantity>;

export const Range2 = z.tuple([z.number(), z.number()]).refine(([a, b]) => a <= b, "range min must be <= max");

export const Rewards = z.object({
  spirit_stones: z.number().int().nonnegative().optional(),
  sect_fame: z.number().int().optional(),
  contribution: z.number().int().nonnegative().optional(),
  items: z.array(Quantity).optional(),
  techniques: z.array(ref("tech", "method")).optional(),
  beasts: z.array(ref("beast")).optional(),
  titles: z.array(ref("title")).optional(),
  mastery_xp: z.number().int().nonnegative().optional(),
  affinity: z.array(z.object({ npc: ref("npc"), delta: z.number().int() })).optional(),
});
export type Rewards = z.infer<typeof Rewards>;

export const RealmStage = z.object({
  id: ref("realm"),
  stage: z.number().int().min(1).max(9).optional(),
});

/** Generic unlock/prerequisite block used by regions, dungeons, quests, shops, sect locations… */
export const Unlock = z.object({
  realm: RealmStage.optional(),
  rank: ref("rank").optional(),
  sect_fame: z.number().int().nonnegative().optional(),
  quests: z.array(ref("quest")).optional(),
  affinity: z.array(z.object({ npc: ref("npc"), level: z.number().int().min(0) })).optional(),
  regions: z.array(ref("region")).optional(),
  dungeons_cleared: z.array(ref("dungeon")).optional(),
  items: z.array(Quantity).optional(),
  achievements: z.array(ref("ach")).optional(),
});
export type Unlock = z.infer<typeof Unlock>;

// ---------- Status application & effects ----------

export const StatusApply = z.object({
  status: ref("status"),
  chance: z.number().min(0).max(1).default(1),
  turns: z.number().int().positive().default(2),
  potency: z.number().optional(),
});

export const EffectKinds = [
  "on_hit_apply", "on_crit_apply", "on_kill", "stat_mult", "cooldown_reduction",
  "counter", "sp_restore", "elem_dmg", "shield_on_battle_start", "heal_on_turn", "reflect",
] as const;
export const GearEffect = z.object({
  kind: z.enum(EffectKinds),
  status: ref("status").optional(),
  attribute: Attribute.optional(),
  value: z.number().optional(),
  chance: z.number().min(0).max(1).optional(),
  description: z.string().min(1),
});

// ---------- Art ----------

export const ART_STATUS = ["planned", "generated", "approved"] as const;
export const ArtAsset = z.object({
  file: z.string().regex(/^assets\/[a-z0-9_\-\/]+\.(png|webp|jpg)$/, "assets/… path"),
  size: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  transparent: z.boolean(),
  prompt: z.string().min(10),
  negative: z.string().optional(),
  references: z.array(z.string()).default([]),
  status: z.enum(ART_STATUS).default("planned"),
  notes: z.string().optional(),
});
export type ArtAsset = z.infer<typeof ArtAsset>;

/**
 * Build an `art` object schema: the given keys are required; any extra key
 * (e.g. `expression_smile`, `battle_juvenile`) must also be a valid ArtAsset.
 */
export function artBlock<K extends string>(required: readonly K[]) {
  const shape = Object.fromEntries(required.map((k) => [k, ArtAsset])) as Record<K, typeof ArtAsset>;
  return z.object(shape).catchall(ArtAsset);
}

// ---------- Misc ----------

export const Position = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);
export const MasteryCurve = z.object({
  max_level: z.number().int().min(1).max(20).default(10),
  xp_per_level: z.number().int().positive().default(100),
  per_level_bonus: z.number().default(0.03),
});

export { ItemRef, RewardRef, ref };
