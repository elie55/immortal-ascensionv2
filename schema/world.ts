import { z } from "zod";
import { Named, Stats, Quantity, artBlock, ref, Rarity, Unlock, MasteryCurve, StatusApply, Attribute } from "./common.ts";

// ---------- Realms ----------

export const Realm = Named.extend({
  id: ref("realm"),
  order: z.number().int().min(1).max(15),
  stages: z.literal(9).default(9),
  qi: z.object({
    /** Qi needed for stage 1 of this realm. */
    base: z.number().positive(),
    /** Multiplier applied per stage within the realm. */
    stage_growth: z.number().min(1),
  }),
  /** Attribute growth granted per stage. */
  stage_growth: Stats,
  /** Bonus granted on entering the realm (stage 1). */
  realm_bonus: Stats.default({}),
  major_breakthrough: z.object({
    requirements: z.array(Quantity).default([]),
    tribulation: ref("tribulation").optional(),
    trial: ref("dungeon", "boss", "tournament").optional(),
    success_base: z.number().min(0).max(1).default(1),
    unlocks: z.array(z.string()).default([]),
  }),
  art: artBlock(["breakthrough_bg"]),
});

// ---------- Elements ----------

export const Element = Named.extend({
  id: ref("elem"),
  /** Five-element overcoming cycle (wood→earth→water→fire→metal→wood). */
  overcomes: ref("elem"),
  generates: ref("elem"),
  color: z.string().regex(/^#[0-9a-f]{6}$/),
  themes: z.array(z.string()).min(1),
});

// ---------- Spiritual roots ----------

export const Root = Named.extend({
  id: ref("root"),
  tier: z.enum(["single", "dual", "triple", "five"]),
  elements: z.array(ref("elem")).min(1).max(5),
  qi_mult: z.number().positive(),
  bonuses: Stats.default({}),
  /** Roots this one can be transformed into by rare opportunities. */
  upgrade_to: z.array(ref("root")).default([]),
  transform_sources: z.array(ref("event", "dungeon", "quest")).default([]),
  art: artBlock(["illustration"]),
});

// ---------- Status effects ----------

export const StatusEffect = Named.extend({
  id: ref("status"),
  kind: z.enum(["buff", "debuff", "control", "dot", "shield", "special"]),
  stacking: z.enum(["none", "refresh", "stack"]).default("refresh"),
  max_stacks: z.number().int().min(1).default(1),
  default_turns: z.number().int().positive().default(2),
  /** Attribute multipliers while active, e.g. def -20% → {def: -20}. */
  modifiers: Stats.default({}),
  /** Damage per turn as % of source ATK (dot) or % max HP. */
  tick: z.object({ pct_atk: z.number().optional(), pct_max_hp: z.number().optional() }).optional(),
  art: artBlock(["icon"]),
});

// ---------- Cultivation methods & techniques ----------

const LearnRequirements = z.object({
  realm: z.object({ id: ref("realm"), stage: z.number().int().min(1).max(9).optional() }).optional(),
  rank: ref("rank").optional(),
  root_elements: z.array(ref("elem")).optional(),
  techniques: z.array(ref("tech")).optional(),
});

export const Method = Named.extend({
  id: ref("method"),
  rarity: Rarity,
  grade: z.enum(["mortal", "earth", "heaven", "immortal"]),
  element: ref("elem").optional(),
  qi_mult: z.number().positive(),
  bonuses: Stats.default({}),
  requirements: LearnRequirements.default({}),
  mastery: MasteryCurve.default({}),
  art: artBlock(["icon"]),
});

export const TechKind = z.enum(["active", "passive", "ultimate"]);
export const Targeting = z.enum([
  "single", "all_enemies", "self", "ally", "all_allies", "lowest_hp_enemy", "highest_cp_enemy", "random",
]);

export const Technique = Named.extend({
  id: ref("tech"),
  kind: TechKind,
  rarity: Rarity,
  element: ref("elem"),
  weapon_affinity: z.enum(["sword", "spear", "saber", "staff", "fan", "palm", "any"]).default("any"),
  targeting: Targeting.default("single"),
  /** Damage as % of ATK (0 for non-damaging). */
  power: z.number().min(0).default(0),
  hits: z.number().int().min(1).default(1),
  heal_pct: z.number().min(0).optional(),
  shield_pct_max_hp: z.number().min(0).optional(),
  sp_cost: z.number().int().min(0).default(0),
  cooldown: z.number().int().min(0).default(0),
  applies: z.array(StatusApply).default([]),
  /** Passive-only: permanent bonuses while equipped. */
  passive_bonuses: Stats.default({}),
  /** Ultimate-only: energy gauge required. */
  ult_charge: z.number().int().positive().optional(),
  requirements: LearnRequirements.default({}),
  mastery: MasteryCurve.default({}),
  /** Used only by enemies/bosses; the player can never learn it (exempt from the source rule). */
  enemy_only: z.boolean().default(false),
  art: artBlock(["icon"]),
}).superRefine((t, ctx) => {
  const seg = t.id.split(".")[1];
  const expect = t.kind === "ultimate" ? "ult" : t.kind;
  if (seg !== expect) ctx.addIssue({ code: "custom", message: `technique id must be tech.${expect}.* for kind ${t.kind}` });
  if (t.kind === "ultimate" && !t.ult_charge) ctx.addIssue({ code: "custom", message: "ultimate needs ult_charge" });
  if (t.kind === "passive" && (t.power > 0 || t.sp_cost > 0)) ctx.addIssue({ code: "custom", message: "passive cannot have power/sp_cost" });
});

export const BeastAbility = Named.extend({
  id: ref("btech"),
  beast: ref("beast"),
  kind: z.enum(["active", "passive"]),
  element: ref("elem"),
  power: z.number().min(0).default(0),
  heal_pct: z.number().min(0).optional(),
  applies: z.array(StatusApply).default([]),
  passive_bonuses: Stats.default({}),
  cooldown: z.number().int().min(0).default(3),
  art: artBlock(["icon"]),
}).superRefine((b, ctx) => {
  const beastSeg = b.id.split(".")[1];
  if (b.beast !== `beast.${beastSeg}`) ctx.addIssue({ code: "custom", message: "btech id must be btech.<beast>.<name>" });
});

export type Attr = z.infer<typeof Attribute>;
