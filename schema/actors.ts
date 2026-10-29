import { z } from "zod";
import { Named, Rarity, Stats, Quantity, artBlock, ref, ItemRef, Rewards, Unlock } from "./common.ts";

// ---------- Enemies & bosses ----------

const AiStrategy = z.enum(["aggressive", "defensive", "support", "trickster", "berserker", "caster", "guardian"]);

const CombatantBase = Named.extend({
  element: ref("elem"),
  realm: z.object({ id: ref("realm"), stage: z.number().int().min(1).max(9) }),
  stats: Stats,
  cp: z.number().int().positive(),
  techniques: z.array(ref("tech")).min(1),
  ai: z.object({
    strategy: AiStrategy,
    rules: z.array(z.string()).default([]),
  }),
  resistances: Stats.default({}),
  loot: ref("loot"),
  mastery_xp: z.number().int().nonnegative().default(10),
});

export const Enemy = CombatantBase.extend({
  id: ref("enemy"),
  kind: z.enum(["normal", "elite", "human", "demonic", "beast", "guardian", "celestial", "construct"]),
  art: artBlock(["icon", "battle"]),
});

export const Boss = CombatantBase.extend({
  id: ref("boss"),
  kind: z.enum(["region", "dungeon", "secret_realm", "mega", "tribulation", "tournament", "story"]),
  phases: z.array(z.object({
    name: z.string().min(1),
    hp_threshold: z.number().min(0).max(1),
    techniques: z.array(ref("tech")).min(1),
    summons: z.array(z.object({ enemy: ref("enemy"), count: z.number().int().positive() })).default([]),
    shield_pct: z.number().min(0).optional(),
    enrage: z.object({ atk_mult: z.number().positive(), spd_mult: z.number().positive() }).optional(),
    charged_attack: z.object({ tech: ref("tech"), turns_to_charge: z.number().int().positive() }).optional(),
  })).min(1),
  weaknesses: z.array(ref("elem")).default([]),
  art: artBlock(["icon", "battle", "intro"]),
});

// ---------- Spirit beasts ----------

export const BeastStage = z.object({
  key: z.enum(["hatchling", "juvenile", "adult", "sovereign"]),
  name: z.string().min(1),
  level_required: z.number().int().min(1),
  evolve_materials: z.array(Quantity).default([]),
  evolve_cost_stones: z.number().int().nonnegative().default(0),
  stats: Stats,
  active: ref("btech"),
  passive: ref("btech"),
});

export const Beast = Named.extend({
  id: ref("beast"),
  rarity: Rarity,
  element: ref("elem"),
  species: z.string().min(1),
  stages: z.array(BeastStage).min(1).max(4),
  food: z.array(ref("bfood")).min(1),
  bond: z.object({ max: z.number().int().positive(), milestones: z.array(z.object({ level: z.number().int(), bonus: Stats })) }),
  /** Passive contribution to cultivation while active companion. */
  cultivation_bonus: z.number().min(0).default(0),
  art: artBlock(["icon"]),
}).superRefine((b, ctx) => {
  for (const s of b.stages) {
    if (!(b.art as Record<string, unknown>)[`battle_${s.key}`])
      ctx.addIssue({ code: "custom", message: `beast art missing battle_${s.key}` });
  }
  const keys = b.stages.map((s) => s.key);
  const order = ["hatchling", "juvenile", "adult", "sovereign"];
  const idx = keys.map((k) => order.indexOf(k));
  for (let i = 1; i < idx.length; i++) if (idx[i] <= idx[i - 1]) ctx.addIssue({ code: "custom", message: "beast stages out of order" });
  for (let i = 1; i < b.stages.length; i++)
    if (b.stages[i].evolve_materials.length === 0) ctx.addIssue({ code: "custom", message: `stage ${b.stages[i].key} needs evolve_materials` });
});

// ---------- NPCs ----------

export const AffinityLevel = z.object({ name: z.string().min(1), threshold: z.number().int().nonnegative() });

export const Npc = Named.extend({
  id: ref("npc"),
  role: z.enum(["protagonist", "elder", "senior", "merchant", "instructor", "beast_keeper", "disciple", "opponent", "villager", "story"]),
  title: z.string().optional(),
  location: ref("sectloc", "node", "region").optional(),
  personality: z.string().min(1),
  backstory: z.string().min(1),
  elements: z.array(ref("elem")).default([]),
  realm: z.object({ id: ref("realm"), stage: z.number().int().min(1).max(9) }).optional(),
  cp: z.number().int().positive().optional(),
  affinity_levels: z.array(AffinityLevel).default([
    { name: "Stranger", threshold: 0 }, { name: "Acquaintance", threshold: 50 },
    { name: "Friend", threshold: 300 }, { name: "Confidant", threshold: 600 }, { name: "Dao Companion", threshold: 1000 },
  ]),
  gifts: z.object({
    loved: z.array(z.object({ id: ItemRef, affinity: z.number().int().positive() })).default([]),
    liked: z.array(z.object({ id: ItemRef, affinity: z.number().int().positive() })).default([]),
    disliked: z.array(z.object({ id: ItemRef, affinity: z.number().int().negative() })).default([]),
    /** Gift tags this NPC loves/likes (matched against gift.gift_tags). */
    loved_tags: z.array(z.string()).default([]),
    liked_tags: z.array(z.string()).default([]),
    repeat_decay: z.number().min(0).max(1).default(0.5),
    daily_limit: z.number().int().positive().default(3),
  }).default({}),
  topics: z.array(z.object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    title: z.string().min(1),
    summary: z.string().min(1),
    unlock: z.object({ affinity: z.number().int().nonnegative().optional(), quest: ref("quest").optional() }).default({}),
    answer: z.string().min(1),
  })).default([]),
  quests: z.array(ref("quest")).default([]),
  duel: z.object({
    enabled: z.boolean(),
    loadout: z.array(ref("tech")).min(1),
    strategy: AiStrategy,
    win: Rewards,
    lose: Rewards,
    cooldown_min: z.number().int().nonnegative().default(60),
  }).optional(),
  shop: ref("shop").optional(),
  dao_companion: z.object({
    eligible: z.boolean(),
    role: z.enum(["dps", "support", "tank", "control"]).optional(),
    stats: Stats.optional(),
    techniques: z.array(ref("tech")).optional(),
  }).default({ eligible: false }),
  expressions: z.array(z.string().regex(/^[a-z_]+$/)).default([]),
  art: artBlock(["portrait", "full_body"]),
}).superRefine((n, ctx) => {
  for (const e of n.expressions)
    if (!(n.art as Record<string, unknown>)[`expression_${e}`]) ctx.addIssue({ code: "custom", message: `npc art missing expression_${e}` });
  if ((n.duel?.enabled || n.dao_companion.eligible) && !(n.art as Record<string, unknown>).battle)
    ctx.addIssue({ code: "custom", message: "duelable/companion NPC needs art.battle" });
  if (n.dao_companion.eligible && (!n.dao_companion.techniques || !n.dao_companion.stats || !n.dao_companion.role))
    ctx.addIssue({ code: "custom", message: "dao companion needs role, stats and techniques" });
});

export { Unlock };
