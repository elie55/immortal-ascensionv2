import { z } from "zod";
import { Named, Quantity, artBlock, ref, Unlock, Rewards, Position, Range2 } from "./common.ts";

// ---------- Adventure regions & nodes ----------

export const Region = Named.extend({
  id: ref("region"),
  order: z.number().int().min(1),
  realm_range: z.object({ min: ref("realm"), max: ref("realm") }),
  unlock: Unlock.default({}),
  entry_node: ref("node"),
  boss: ref("boss"),
  /** Summary of signature materials (validated against actual loot in the region). */
  signature_materials: z.array(ref("mat")).default([]),
  art: artBlock(["card", "map", "battle_bg"]),
});

export const NodeKind = z.enum([
  "battle", "elite", "boss", "gather", "chest", "event", "cultivation", "merchant", "hidden", "secret_realm", "story",
]);

export const Node = Named.extend({
  id: ref("node"),
  region: ref("region"),
  kind: NodeKind,
  position: Position,
  connections: z.array(ref("node")).default([]),
  rec_cp: z.number().int().positive(),
  /** battle/elite/boss: enemy waves. */
  waves: z.array(z.array(ref("enemy", "boss")).min(1)).optional(),
  gather: z.object({ items: z.array(Quantity).min(1), energy_cost: z.number().int().positive(), cooldown_min: z.number().int().positive() }).optional(),
  chest: ref("loot").optional(),
  event: ref("event").optional(),
  shop: ref("shop").optional(),
  secret_realm: ref("dungeon").optional(),
  story: ref("story").optional(),
  cultivation: z.object({ qi_mult: z.number().positive(), minutes: z.number().int().positive(), energy_cost: z.number().int().positive() }).optional(),
  hidden: z.object({ condition: z.string().min(1), reveal_chance: z.number().min(0).max(1) }).optional(),
  /** First-clear reward (replays use enemy loot only). */
  first_clear: Rewards.default({}),
  replayable: z.boolean().default(true),
  energy_cost: z.number().int().nonnegative().default(5),
  art: artBlock([]).optional(),
}).superRefine((n, ctx) => {
  const seg = n.id.split(".");
  if (`region.${seg[1]}` !== n.region) ctx.addIssue({ code: "custom", message: "node id must be node.<region>.<name>" });
  const need = (cond: boolean, msg: string) => { if (!cond) ctx.addIssue({ code: "custom", message: msg }); };
  switch (n.kind) {
    case "battle": case "elite": need(!!n.waves, `${n.kind} node needs waves`); break;
    case "boss": need(!!n.waves && n.waves.some((w) => w.some((e) => e.startsWith("boss."))), "boss node needs a boss in waves"); break;
    case "gather": need(!!n.gather, "gather node needs gather"); break;
    case "chest": need(!!n.chest, "chest node needs chest loot"); break;
    case "event": case "hidden": need(!!n.event, `${n.kind} node needs event`); break;
    case "cultivation": need(!!n.cultivation, "cultivation node needs cultivation"); break;
    case "merchant": need(!!n.shop, "merchant node needs shop"); break;
    case "secret_realm": need(!!n.secret_realm, "secret_realm node needs secret_realm"); break;
    case "story": need(!!n.story, "story node needs story"); break;
  }
});

// ---------- Dungeons ----------

export const DungeonKind = z.enum(["resource", "challenge", "secret_realm", "mega", "tower"]);

const Modifier = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  description: z.string().min(1),
  effect: z.record(z.string(), z.number()),
});

const RealmNode = z.object({
  key: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  kind: z.enum(["battle", "elite", "boss", "chest", "event", "cultivation", "merchant", "hidden", "exit"]),
  position: Position,
  connections: z.array(z.string()).default([]),
  waves: z.array(z.array(ref("enemy", "boss")).min(1)).optional(),
  chest: ref("loot").optional(),
  event: ref("event").optional(),
  shop: ref("shop").optional(),
  hidden: z.object({ condition: z.string() }).optional(),
});

export const Dungeon = Named.extend({
  id: ref("dungeon"),
  kind: DungeonKind,
  entry: Unlock.extend({
    energy_cost: z.number().int().nonnegative().default(0),
    daily_limit: z.number().int().positive().optional(),
    party: z.object({ companions_allowed: z.boolean(), max_companions: z.number().int().min(0).max(2) }).default({ companions_allowed: false, max_companions: 0 }),
  }).default({}),
  rec_cp: z.number().int().positive(),
  /** resource / challenge / mega: ordered waves. */
  waves: z.array(z.object({ enemies: z.array(ref("enemy", "boss")).min(1), modifier: z.string().optional() })).optional(),
  /** tower: generated floors. */
  tower: z.object({
    floors: z.number().int().min(10),
    enemy_pool: z.array(ref("enemy")).min(1),
    boss_pool: z.array(ref("boss")).min(1),
    boss_every: z.number().int().positive(),
    cp_growth_per_floor: z.number().positive(),
    milestones: z.array(z.object({ floor: z.number().int().positive(), rewards: Rewards })).min(1),
  }).optional(),
  /** secret_realm: branching node map. */
  realm_nodes: z.array(RealmNode).optional(),
  modifiers: z.array(Modifier).default([]),
  rewards: z.object({
    per_wave: ref("loot").optional(),
    clear: ref("loot"),
    first_clear: Rewards.default({}),
  }),
  checkpoints: z.boolean().default(false),
  persistent_hp: z.boolean().default(true),
  art: artBlock(["card", "battle_bg"]),
}).superRefine((d, ctx) => {
  const need = (c: boolean, m: string) => { if (!c) ctx.addIssue({ code: "custom", message: m }); };
  if (d.kind === "tower") need(!!d.tower, "tower dungeon needs tower block");
  else if (d.kind === "secret_realm") { need(!!d.realm_nodes, "secret realm needs realm_nodes"); need(!!(d.art as Record<string, unknown>).map, "secret realm needs art.map"); }
  else need(!!d.waves && d.waves.length > 0, `${d.kind} dungeon needs waves`);
  if (d.kind === "mega") need(d.entry.party.companions_allowed, "mega dungeon must allow companions");
  if (d.realm_nodes) {
    const keys = new Set(d.realm_nodes.map((n) => n.key));
    for (const n of d.realm_nodes) for (const c of n.connections) if (!keys.has(c)) ctx.addIssue({ code: "custom", message: `realm node ${n.key} connects to unknown ${c}` });
  }
});

export const Tribulation = Named.extend({
  id: ref("tribulation"),
  realm: ref("realm"),
  spirit: ref("boss"),
  waves: z.array(z.object({ bolts: z.number().int().positive(), dmg_mult: z.number().positive(), element: ref("elem") })).min(1),
  modifiers: z.array(Modifier).default([]),
  failure: z.object({ qi_loss_pct: z.number().min(0).max(1), retry_cooldown_min: z.number().int().nonnegative() }),
  rewards: ref("loot"),
  art: artBlock(["battle_bg"]),
});

// ---------- Sect ----------

export const SectFeature = z.enum([
  "missions", "pavilion", "meditation", "merchant", "alchemy", "forge", "beasts", "quarters", "duels", "tournament", "storage", "rest",
]);

export const SectLocation = Named.extend({
  id: ref("sectloc"),
  unlock: Unlock.default({}),
  features: z.array(SectFeature).min(1),
  npcs: z.array(ref("npc")).default([]),
  shop: ref("shop").optional(),
  map_position: Position,
  art: artBlock(["background"]),
});

export const Rank = Named.extend({
  id: ref("rank"),
  order: z.number().int().min(1).max(6),
  fame_required: z.number().int().nonnegative(),
  promotion: z.object({
    quests: z.array(ref("quest")).default([]),
    trial: ref("dungeon", "tournament", "boss").optional(),
  }).default({}),
  benefits: z.object({
    unlocks: z.array(z.string()).default([]),
    qi_mult: z.number().positive().default(1),
    shop_tier: z.number().int().min(1).default(1),
    rewards: Rewards.default({}),
  }).default({}),
});

export const Event = Named.extend({
  id: ref("event"),
  text: z.string().min(1),
  choices: z.array(z.object({
    text: z.string().min(1),
    outcomes: z.array(z.object({
      chance: z.number().min(0).max(1),
      text: z.string().min(1),
      rewards: Rewards.optional(),
      status: ref("status").optional(),
      root_transform: ref("root").optional(),
      battle: z.array(ref("enemy", "boss")).optional(),
    })).min(1),
  })).min(1),
  art: artBlock(["illustration"]),
});

export { Range2 };
