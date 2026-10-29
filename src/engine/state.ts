/**
 * GameState: the unified, JSON-safe model of one save slot. Validated with zod on load (see src/save).
 * Keep every field plain data. Derived values (stats, CP, rate) are computed, never stored.
 */
import { z } from "zod";
import type { ContentIndex } from "../content/index.ts";
import { seedRng } from "./rng.ts";
import { grantGear } from "./inventory.ts";

export const STATE_VERSION = 1;

export const GearInstanceSchema = z.object({
  base: z.string(), rarity: z.string(), ilvl: z.number().int(), enhance: z.number().int().min(0).max(15),
  main: z.object({ stat: z.string(), roll: z.number(), value: z.number() }),
  affixes: z.array(z.object({ stat: z.string(), roll: z.number(), value: z.number(), locked: z.boolean().optional() })),
  specials: z.array(z.any()),
  awakened: z.boolean(),
});

export const BuffSchema = z.object({
  id: z.string(),            // cons id or status id that created it
  label: z.string(),
  qi_mult: z.number().positive().optional(),
  stats: z.record(z.string(), z.number()).optional(),
  expiresAt: z.number(),     // epoch ms
});

export const BeastInstanceSchema = z.object({
  uid: z.number().int(), beast: z.string(), name: z.string(), stage: z.string(), level: z.number().int().min(1), xp: z.number().min(0),
  bond: z.number().min(0), hatchedAt: z.number(),
});

export const GameStateSchema = z.object({
  meta: z.object({
    version: z.number().int(),
    createdAt: z.number(),
    playtimeMs: z.number().min(0),
    /** Wall clock of the last processed tick; offline progression starts from here. */
    lastTickAt: z.number(),
    lastSaveAt: z.number().optional(),
    clockBackCount: z.number().int().min(0),
    offlineSessions: z.number().int().min(0),
  }),
  character: z.object({
    name: z.string().min(1),
    npc: z.string(),                       // portrait / art source (npc.lin_xueyao)
    realm: z.string(),
    stage: z.number().int().min(1).max(9),
    qi: z.number().min(0),
    root: z.string(),
    method: z.string(),
    methodMastery: z.record(z.string(), z.number().min(0)),   // method id → xp
    rank: z.string(),
    titles: z.array(z.string()),
    activeTitle: z.string().optional(),
    location: z.string().optional(),       // sectloc or node id where she cultivates (affects qi rate)
    hp: z.number().min(0).optional(),      // current HP outside battle (undefined = full)
    permanent: z.record(z.string(), z.number()),   // permanent stat gains from elixirs
    breakthroughBonus: z.number().min(0),          // success bonus banked from a breakthrough pill
    cooldowns: z.record(z.string(), z.number()),   // consumable id → usable again at (ms)
  }),
  techniques: z.object({
    known: z.record(z.string(), z.number().min(0)),           // tech id → mastery xp
    actives: z.array(z.string().nullable()).length(4),
    passives: z.array(z.string().nullable()).length(2),
    ultimate: z.string().nullable(),
  }),
  resources: z.object({
    spirit_stones: z.number().int().min(0),
    sect_fame: z.number().int().min(0),
    contribution: z.number().int().min(0),
    energy: z.object({ value: z.number().min(0), updatedAt: z.number() }),
  }),
  inventory: z.object({
    stacks: z.record(z.string(), z.number().int().min(0)),
    gear: z.record(z.string(), GearInstanceSchema),            // uid (string key) → instance
    nextUid: z.number().int().min(1),
    lockedGear: z.array(z.number().int()),
  }),
  equipped: z.record(z.string(), z.number().int()),            // slot key → gear uid
  buffs: z.array(BuffSchema),
  beasts: z.object({ owned: z.record(z.string(), BeastInstanceSchema), active: z.number().int().nullable() }),
  relations: z.record(z.string(), z.object({
    affinity: z.number().int(), giftsToday: z.number().int().min(0), lastGiftDay: z.string().optional(), topics: z.array(z.string()), lastDuelAt: z.number().optional(),
  })),
  progress: z.object({
    quests: z.object({
      active: z.record(z.string(), z.object({ startedAt: z.number(), counters: z.array(z.number()) })),
      completed: z.record(z.string(), z.number()),              // quest id → completion count
      lastCompletedAt: z.record(z.string(), z.number()),        // for repeatable cooldowns
    }),
    achievements: z.record(z.string(), z.number()),             // id → unlockedAt
    storySeen: z.record(z.string(), z.number()),
    storyChoices: z.record(z.string(), z.string()),
    regions: z.record(z.string(), z.object({ discoveredAt: z.number(), nodes: z.record(z.string(), z.object({ clears: z.number().int(), firstClearAt: z.number().optional(), revealed: z.boolean().optional() })) })),
    dungeons: z.record(z.string(), z.object({ clears: z.number().int(), firstClearAt: z.number().optional(), bestFloor: z.number().int().optional() })),
    trialsCleared: z.record(z.string(), z.number()),            // boss/dungeon/tournament/tribulation id → at
    tournaments: z.record(z.string(), z.object({ round: z.number().int(), wins: z.number().int(), lastAt: z.number().optional() })),
    tribulations: z.record(z.string(), z.object({ attempts: z.number().int(), passedAt: z.number().optional(), nextTryAt: z.number().optional() })),
    recipes: z.array(z.string()),
    shopPurchases: z.record(z.string(), z.record(z.string(), z.number().int())),
    counters: z.record(z.string(), z.number()),                 // free-form: kills:enemy.x, battles_won, …
    realmsEntered: z.array(z.string()),
  }),
  daily: z.object({ day: z.string(), counters: z.record(z.string(), z.number().int()) }),
  rng: z.object({ a: z.number().int(), b: z.number().int() }),
});

export type GameState = z.infer<typeof GameStateSchema>;
export type GearInstance = z.infer<typeof GearInstanceSchema>;
export type Buff = z.infer<typeof BuffSchema>;
export type BeastInstance = z.infer<typeof BeastInstanceSchema>;

export const dayKey = (now: number) => new Date(now).toISOString().slice(0, 10);

/** Fresh state from content/meta/starting_state.json. */
export function newGameState(content: ContentIndex, now: number, opts: { name?: string; seed?: number } = {}): GameState {
  const s = content.starting;
  const rules = content.rules;
  const state: GameState = {
    meta: { version: STATE_VERSION, createdAt: now, playtimeMs: 0, lastTickAt: now, clockBackCount: 0, offlineSessions: 0 },
    character: {
      name: opts.name ?? content.get(s.character).name, npc: s.character, realm: s.realm.id, stage: s.realm.stage, qi: 0,
      root: s.root, method: s.method, methodMastery: { [s.method]: 0 }, rank: s.rank, titles: [],
      permanent: {}, breakthroughBonus: 0, cooldowns: {},
    },
    techniques: { known: Object.fromEntries(s.techniques.map((t) => [t, 0])), actives: [s.techniques[0] ?? null, null, null, null], passives: [null, null], ultimate: null },
    resources: { spirit_stones: s.spirit_stones, sect_fame: s.sect_fame, contribution: 0, energy: { value: rules.energy.max, updatedAt: now } },
    inventory: { stacks: {}, gear: {}, nextUid: 1, lockedGear: [] },
    equipped: {},
    buffs: [],
    beasts: { owned: {}, active: null },
    relations: {},
    progress: {
      quests: { active: {}, completed: {}, lastCompletedAt: {} }, achievements: {}, storySeen: {}, storyChoices: {},
      regions: { [s.region]: { discoveredAt: now, nodes: {} } }, dungeons: {}, trialsCleared: {}, tournaments: {}, tribulations: {},
      recipes: [], shopPurchases: {}, counters: {}, realmsEntered: [s.realm.id],
    },
    daily: { day: dayKey(now), counters: {} },
    rng: seedRng(opts.seed ?? (now >>> 0)),
  };
  for (const q of s.inventory) state.inventory.stacks[q.id] = (state.inventory.stacks[q.id] ?? 0) + q.qty;
  for (const [slot, grant] of Object.entries(s.equipped)) {
    const uid = grantGear(state, content, grant);
    state.equipped[slot] = uid;
  }
  return state;
}
