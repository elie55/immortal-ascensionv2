import { z } from "zod";
import { Named, Quantity, artBlock, ref, ItemRef, Unlock, Rewards, GearGrant, Stats } from "./common.ts";

// ---------- Quest objectives (each maps to a screen route in the game) ----------

const count = z.number().int().positive().default(1);

export const Objective = z.discriminatedUnion("type", [
  z.object({ type: z.literal("defeat"), target: ref("enemy", "boss"), count }),
  z.object({ type: z.literal("collect"), item: ItemRef, count, consume: z.boolean().default(true) }),
  z.object({ type: z.literal("deliver"), item: ItemRef, count, to: ref("npc", "sectloc") }),
  z.object({ type: z.literal("reach_realm"), realm: ref("realm"), stage: z.number().int().min(1).max(9).default(1) }),
  z.object({ type: z.literal("learn"), target: ref("tech", "method") }),
  z.object({ type: z.literal("win_duel"), npc: ref("npc"), count }),
  z.object({ type: z.literal("refine"), recipe: ref("alchemy"), count }),
  z.object({ type: z.literal("craft"), recipe: ref("forge"), count }),
  z.object({ type: z.literal("enhance"), slot: z.string().optional(), level: z.number().int().min(1).max(15) }),
  z.object({ type: z.literal("clear"), target: ref("dungeon", "node"), count }),
  z.object({ type: z.literal("tower_floor"), dungeon: ref("dungeon"), floor: z.number().int().positive() }),
  z.object({ type: z.literal("explore"), region: ref("region"), nodes: z.number().int().positive() }),
  z.object({ type: z.literal("gift"), npc: ref("npc"), count }),
  z.object({ type: z.literal("affinity"), npc: ref("npc"), level: z.number().int().min(1) }),
  z.object({ type: z.literal("rank"), rank: ref("rank") }),
  z.object({ type: z.literal("tournament"), tournament: ref("tournament"), round: z.number().int().positive() }),
  z.object({ type: z.literal("hatch"), beast: ref("beast") }),
  z.object({ type: z.literal("evolve"), beast: ref("beast"), stage: z.enum(["juvenile", "adult", "sovereign"]) }),
  z.object({ type: z.literal("meditate"), minutes: z.number().int().positive() }),
  z.object({ type: z.literal("visit"), target: ref("sectloc", "region") }),
  z.object({ type: z.literal("talk"), npc: ref("npc"), topic: z.string().optional() }),
  z.object({ type: z.literal("story"), scene: ref("story") }),
]);
export type Objective = z.infer<typeof Objective>;

export const QuestType = z.enum([
  "main", "mission", "npc", "adventure", "dungeon", "cultivation", "beast", "combat", "alchemy", "forge", "hidden", "achievement",
]);

export const Quest = Named.extend({
  id: ref("quest"),
  type: QuestType,
  giver: ref("npc", "sectloc").or(z.literal("system")),
  turn_in: ref("npc", "sectloc").or(z.literal("auto")),
  prereqs: Unlock.default({}),
  objectives: z.array(Objective).min(1),
  rewards: Rewards,
  next: ref("quest").optional(),
  repeatable: z.object({ cooldown_min: z.number().int().positive() }).optional(),
  difficulty: z.number().int().min(1).max(5).default(1),
  rec_cp: z.number().int().positive().optional(),
  /** Shown on the tracker ("Azure Bamboo Forest · Node 10"). */
  hint: z.string().min(1),
  art: artBlock(["icon"]).optional(),
}).superRefine((q, ctx) => {
  if (q.id.split(".")[1] !== q.type) ctx.addIssue({ code: "custom", message: `quest id must be quest.${q.type}.*` });
});

// ---------- Achievements ----------

export const AchievementCondition = z.discriminatedUnion("type", [
  z.object({ type: z.literal("counter"), metric: z.enum([
    "enemies_defeated", "bosses_defeated", "nodes_cleared", "regions_cleared", "pills_refined", "gear_crafted",
    "gear_enhanced_15", "beasts_hatched", "beasts_evolved", "gifts_given", "duels_won", "tournaments_won",
    "tower_floor", "quests_completed", "spirit_stones_earned", "meditation_minutes", "hidden_found",
  ]), target: z.number().int().positive() }),
  z.object({ type: z.literal("objective"), objective: Objective }),
]);

export const Achievement = Named.extend({
  id: ref("ach"),
  category: z.enum(["cultivation", "combat", "exploration", "equipment", "alchemy", "beasts", "sect", "relationships", "hidden"]),
  condition: AchievementCondition,
  rewards: Rewards,
  hidden: z.boolean().default(false),
  art: artBlock(["icon"]),
}).superRefine((a, ctx) => {
  if (a.id.split(".")[1] !== a.category) ctx.addIssue({ code: "custom", message: `achievement id must be ach.${a.category}.*` });
});

// ---------- Tournaments ----------

export const Tournament = Named.extend({
  id: ref("tournament"),
  entry: Unlock.default({}),
  rounds: z.array(z.object({
    opponent: ref("npc"),
    cp: z.number().int().positive(),
    rewards: Rewards.default({}),
  })).min(2),
  champion_rewards: Rewards,
  loss: z.object({ sect_fame: z.number().int().max(0).default(0) }).default({}),
  reentry: z.object({ sect_fame_required: z.number().int().nonnegative() }).default({ sect_fame_required: 0 }),
  repeatable: z.boolean().default(true),
}).superRefine((t, ctx) => {
  const ops = t.rounds.map((r) => r.opponent);
  if (new Set(ops).size !== ops.length) ctx.addIssue({ code: "custom", message: "tournament opponents must be distinct" });
  for (let i = 1; i < t.rounds.length; i++) if (t.rounds[i].cp <= t.rounds[i - 1].cp) ctx.addIssue({ code: "custom", message: "round CP must increase" });
});

// ---------- Story ----------

export const StoryLine = z.object({
  speaker: ref("npc").or(z.enum(["narration", "player"])),
  expression: z.string().optional(),
  text: z.string().min(1),
});

export const StoryScene = Named.extend({
  id: ref("story"),
  chapter: z.string().regex(/^[a-z0-9_]+$/),
  trigger: z.discriminatedUnion("on", [
    z.object({ on: z.literal("new_game") }),
    z.object({ on: z.literal("quest_complete"), quest: ref("quest") }),
    z.object({ on: z.literal("quest_accept"), quest: ref("quest") }),
    z.object({ on: z.literal("realm_reached"), realm: ref("realm"), stage: z.number().int().min(1).max(9).default(1) }),
    z.object({ on: z.literal("region_enter"), region: ref("region") }),
    z.object({ on: z.literal("affinity"), npc: ref("npc"), level: z.number().int().min(1) }),
    z.object({ on: z.literal("chained") }),
  ]),
  lines: z.array(StoryLine).min(1),
  choices: z.array(z.object({
    text: z.string().min(1),
    effects: Rewards.default({}),
    next: ref("story").optional(),
  })).optional(),
  unlocks: z.array(z.string()).default([]),
  next: ref("story").optional(),
  skippable: z.boolean().default(true),
  art: artBlock(["cg"]),
}).superRefine((s, ctx) => {
  if (s.id.split(".")[1] !== s.chapter) ctx.addIssue({ code: "custom", message: `story id must be story.${s.chapter}.*` });
});

// ---------- Meta ----------

export const StartingState = z.object({
  character: ref("npc"),
  realm: z.object({ id: ref("realm"), stage: z.number().int().min(1).max(9) }),
  root: ref("root"),
  rank: ref("rank"),
  region: ref("region"),
  method: ref("method"),
  techniques: z.array(ref("tech")).min(1),
  inventory: z.array(Quantity).default([]),
  equipped: z.record(z.string(), GearGrant).default({}),
  spirit_stones: z.number().int().nonnegative(),
  sect_fame: z.number().int().nonnegative().default(0),
});

export const ContentTargets = z.object({
  /** When true, coverage shortfalls (targets, rarity coverage) are errors instead of warnings. */
  strict: z.boolean().default(false),
  targets: z.record(z.string(), z.number().int().positive()),
});

// ---------- Cultivation rules (singleton) ----------

export const CultivationRules = z.object({
  /** Minutes of idle cultivation (all multipliers = 1) to fill stage 1 of realm order n (index n-1). */
  minutes_for_stage1: z.array(z.number().positive()).length(15),
  /** Qi can be banked up to the end of the current realm plus this many stages of the next. */
  qi_bank_extra_stages: z.number().int().min(0).default(1),
  offline: z.object({
    cap_hours: z.number().positive(),
    efficiency: z.number().min(0).max(1),
    /** Absences shorter than this show no offline report. */
    min_seconds: z.number().nonnegative().default(60),
  }),
  major_breakthrough: z.object({
    fail_qi_loss_pct: z.number().min(0).max(1),
    pill_bonus_cap: z.number().min(0).max(1),
  }),
  energy: z.object({
    max: z.number().int().positive(),
    regen_minutes: z.number().positive(),
    max_per_rank_order: z.number().int().nonnegative().default(0),
  }),
  autosave_seconds: z.number().positive().default(30),
  tick_seconds: z.number().positive().default(1),
  location_qi_mult: z.record(z.string(), z.number().positive()).default({}),
  /** The character's stat block before realms, root, method, gear… */
  base_stats: Stats,
  /** Combat-power weights per attribute (`elem` applies to every elemental damage and resistance attribute). */
  cp_weights: z.record(z.string(), z.number()),
  /** Subtracted before weighting so a default value adds no CP (crit 5, crit_dmg 150, acc 90). */
  cp_baseline: z.record(z.string(), z.number()).default({}),
  mastery_bonus_per_level: z.number().default(0.03),
  /** Equipment slots that open at a realm (slot key → realm id). */
  slot_unlocks: z.record(z.string(), ref("realm")).default({}),
});
export type CultivationRules = z.infer<typeof CultivationRules>;

// ---------- UI art (screens that are not tied to a game entity) ----------

export const UiArt = Named.extend({
  id: ref("ui"),
  /** Which screen uses it (documentation; the client looks art up by id). */
  screen: z.string().min(1),
  art: artBlock([]),
}).refine((u) => Object.keys(u.art).length > 0, "ui entry needs at least one art asset");
