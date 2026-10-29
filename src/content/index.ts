/**
 * Read-only, id-indexed view of dist/content.json (built by tools/build.ts from content/).
 * The engine receives a ContentIndex and never reads files itself.
 */
import type { z } from "zod";
import type { Realm as RealmS, Element as ElementS, Root as RootS, StatusEffect as StatusS, Method as MethodS, Technique as TechS, BeastAbility as BTechS } from "../../schema/world.ts";
import type { Material as MatS, Consumable as ConsS, Gift as GiftS, Book as BookS, Blueprint as BpS, QuestItem as QItemS, Egg as EggS, BeastFood as BFoodS, Junk as JunkS, GearBase as GearBaseS, GearSet as GearSetS, EnhancementTable as EnhS, RefinementTable as RefS, ReforgeTable as ReforgeS, Title as TitleS } from "../../schema/items.ts";
import type { Enemy as EnemyS, Boss as BossS, Beast as BeastS, Npc as NpcS } from "../../schema/actors.ts";
import type { Region as RegionS, Node as NodeS, Dungeon as DungeonS, Tribulation as TribS, SectLocation as SectLocS, Rank as RankS, Event as EventS } from "../../schema/places.ts";
import type { Shop as ShopS, LootTable as LootS, AlchemyRecipe as AlchS, ForgeRecipe as ForgeS, Furnace as FurnaceS } from "../../schema/economy.ts";
import type { GearRules as GearRulesS } from "../../schema/gear-math.ts";
import type { Quest as QuestS, Achievement as AchS, Tournament as TournS, StoryScene as StoryS, StartingState as StartS, CultivationRules as CultRulesS, CombatRules as CombatRulesS, AutoRule as AutoRuleS } from "../../schema/progress.ts";
import type { Prefix } from "../../schema/ids.ts";

export type Realm = z.infer<typeof RealmS>; export type Element = z.infer<typeof ElementS>; export type Root = z.infer<typeof RootS>;
export type StatusEffect = z.infer<typeof StatusS>; export type Method = z.infer<typeof MethodS>; export type Technique = z.infer<typeof TechS>;
export type BeastAbility = z.infer<typeof BTechS>; export type Material = z.infer<typeof MatS>; export type Consumable = z.infer<typeof ConsS>;
export type Gift = z.infer<typeof GiftS>; export type Book = z.infer<typeof BookS>; export type Blueprint = z.infer<typeof BpS>; export type QuestItem = z.infer<typeof QItemS>;
export type Egg = z.infer<typeof EggS>; export type BeastFood = z.infer<typeof BFoodS>; export type Junk = z.infer<typeof JunkS>; export type GearBase = z.infer<typeof GearBaseS>;
export type GearSet = z.infer<typeof GearSetS>; export type EnhancementTable = z.infer<typeof EnhS>; export type RefinementTable = z.infer<typeof RefS>; export type ReforgeTable = z.infer<typeof ReforgeS>;
export type Title = z.infer<typeof TitleS>; export type Enemy = z.infer<typeof EnemyS>; export type Boss = z.infer<typeof BossS>; export type Beast = z.infer<typeof BeastS>; export type Npc = z.infer<typeof NpcS>;
export type Region = z.infer<typeof RegionS>; export type MapNode = z.infer<typeof NodeS>; export type Dungeon = z.infer<typeof DungeonS>; export type Tribulation = z.infer<typeof TribS>;
export type SectLocation = z.infer<typeof SectLocS>; export type Rank = z.infer<typeof RankS>; export type GameEvent = z.infer<typeof EventS>; export type Shop = z.infer<typeof ShopS>;
export type LootTable = z.infer<typeof LootS>; export type AlchemyRecipe = z.infer<typeof AlchS>; export type ForgeRecipe = z.infer<typeof ForgeS>; export type Furnace = z.infer<typeof FurnaceS>;
export type GearRules = z.infer<typeof GearRulesS>; export type Quest = z.infer<typeof QuestS>; export type Achievement = z.infer<typeof AchS>; export type Tournament = z.infer<typeof TournS>;
export type StoryScene = z.infer<typeof StoryS>; export type StartingState = z.infer<typeof StartS>; export type CultivationRules = z.infer<typeof CultRulesS>; export type CombatRules = z.infer<typeof CombatRulesS>; export type AutoRule = z.infer<typeof AutoRuleS>;

/** Any item a stack in the inventory can hold. */
export type AnyItem = Material | Consumable | Gift | Book | Blueprint | QuestItem | Egg | BeastFood | Junk;

export interface ContentBundle {
  version: number;
  builtAt: string;
  entities: Record<string, any>;
  singletons: {
    gear_rules: GearRules; enhancement: EnhancementTable; refinement: RefinementTable; reforge: ReforgeTable;
    furnaces: Furnace[]; starting_state: StartingState; content_targets: unknown; cultivation_rules: CultivationRules; combat_rules: CombatRules;
  };
}

export class ContentIndex {
  readonly singletons: ContentBundle["singletons"];
  private readonly entities: Record<string, any>;
  private readonly prefixCache = new Map<string, any[]>();
  private readonly realmsByOrder: Realm[] = [];

  constructor(bundle: ContentBundle) {
    this.entities = bundle.entities;
    this.singletons = bundle.singletons;
    this.realmsByOrder = this.byPrefix<Realm>("realm").slice().sort((a, b) => a.order - b.order);
  }

  /** Strict lookup: a missing id is a content/programmer error, never a game state. */
  get<T = any>(id: string): T {
    const e = this.entities[id];
    if (e === undefined) throw new Error(`content: unknown id ${id}`);
    return e as T;
  }
  find<T = any>(id: string): T | undefined { return this.entities[id] as T | undefined; }
  has(id: string): boolean { return id in this.entities; }
  prefixOf(id: string): Prefix { return id.split(".")[0] as Prefix; }

  byPrefix<T = any>(prefix: Prefix | string): T[] {
    let list = this.prefixCache.get(prefix);
    if (!list) {
      list = Object.keys(this.entities).filter((k) => k.startsWith(prefix + ".")).map((k) => this.entities[k]);
      this.prefixCache.set(prefix, list);
    }
    return list as T[];
  }

  get realms(): Realm[] { return this.realmsByOrder; }
  realm(order: number): Realm | undefined { return this.realmsByOrder[order - 1]; }
  nextRealm(id: string): Realm | undefined { return this.realm(this.get<Realm>(id).order + 1); }

  get rules(): CultivationRules { return this.singletons.cultivation_rules; }
  get combat(): CombatRules { return this.singletons.combat_rules; }
  get gearRules(): GearRules { return this.singletons.gear_rules; }
  get starting(): StartingState { return this.singletons.starting_state; }

  /** Nodes of a region, in file order. */
  nodesOf(regionId: string): MapNode[] { return this.byPrefix<MapNode>("node").filter((n) => n.region === regionId); }
  /** Art path for an entity's art block key, only when the image has actually been generated. */
  art(id: string, key: string): string | undefined {
    const a = this.find(id)?.art?.[key];
    return a && a.status !== "planned" ? a.file : undefined;
  }
  /** First generated art among several keys (e.g. portrait, then full_body). */
  artAny(id: string, ...keys: string[]): string | undefined {
    for (const k of keys) { const f = this.art(id, k); if (f) return f; }
    return undefined;
  }
}

/** Load the bundle in a browser. */
export async function loadContent(url = "./content.json"): Promise<ContentIndex> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`content.json: HTTP ${res.status}`);
  return new ContentIndex((await res.json()) as ContentBundle);
}
