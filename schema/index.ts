/**
 * Collection registry: which files hold which entity type, and the schema that validates them.
 * Every JSON file under content/ is an array of entities of one type (except meta singletons).
 */
import type { ZodTypeAny } from "zod";
import type { Prefix } from "./ids.ts";
import { Realm, Element, Root, StatusEffect, Method, Technique, BeastAbility } from "./world.ts";
import {
  Material, Consumable, Gift, Book, Blueprint, QuestItem, Egg, BeastFood, Junk,
  GearBase, GearSet, EnhancementTable, RefinementTable, ReforgeTable, Title,
} from "./items.ts";
import { Enemy, Boss, Beast, Npc } from "./actors.ts";
import { Region, Node, Dungeon, Tribulation, SectLocation, Rank, Event } from "./places.ts";
import { Shop, LootTable, AlchemyRecipe, ForgeRecipe, Furnace } from "./economy.ts";
import { GearRules } from "./gear-math.ts";
import { Quest, Achievement, Tournament, StoryScene, StartingState, ContentTargets } from "./progress.ts";

export interface Collection {
  prefix: Prefix;
  /** Glob relative to repo root; `*` matches within one directory segment. */
  files: string;
  schema: ZodTypeAny;
  label: string;
}

export const COLLECTIONS: Collection[] = [
  { prefix: "realm", files: "content/world/realms.json", schema: Realm, label: "Realms" },
  { prefix: "elem", files: "content/world/elements.json", schema: Element, label: "Elements" },
  { prefix: "root", files: "content/world/roots.json", schema: Root, label: "Spiritual roots" },
  { prefix: "status", files: "content/world/status_effects.json", schema: StatusEffect, label: "Status effects" },
  { prefix: "method", files: "content/techniques/methods.json", schema: Method, label: "Cultivation methods" },
  { prefix: "tech", files: "content/techniques/*.techs.json", schema: Technique, label: "Techniques" },
  { prefix: "btech", files: "content/techniques/beast_abilities.json", schema: BeastAbility, label: "Beast abilities" },
  { prefix: "mat", files: "content/items/materials.json", schema: Material, label: "Materials" },
  { prefix: "cons", files: "content/items/consumables.json", schema: Consumable, label: "Consumables" },
  { prefix: "gift", files: "content/items/gifts.json", schema: Gift, label: "Gifts" },
  { prefix: "book", files: "content/items/books.json", schema: Book, label: "Books" },
  { prefix: "blueprint", files: "content/items/blueprints.json", schema: Blueprint, label: "Blueprints" },
  { prefix: "qitem", files: "content/items/quest_items.json", schema: QuestItem, label: "Quest items" },
  { prefix: "egg", files: "content/items/eggs.json", schema: Egg, label: "Beast eggs" },
  { prefix: "bfood", files: "content/items/beast_food.json", schema: BeastFood, label: "Beast food" },
  { prefix: "junk", files: "content/items/junk.json", schema: Junk, label: "Junk" },
  { prefix: "gear", files: "content/equipment/bases/*.json", schema: GearBase, label: "Gear bases" },
  { prefix: "set", files: "content/equipment/sets.json", schema: GearSet, label: "Gear sets" },
  { prefix: "title", files: "content/items/titles.json", schema: Title, label: "Titles" },
  { prefix: "enemy", files: "content/enemies/*.enemies.json", schema: Enemy, label: "Enemies" },
  { prefix: "boss", files: "content/enemies/*.bosses.json", schema: Boss, label: "Bosses" },
  { prefix: "beast", files: "content/beasts/beasts.json", schema: Beast, label: "Spirit beasts" },
  { prefix: "npc", files: "content/npcs/npcs.json", schema: Npc, label: "NPCs" },
  { prefix: "region", files: "content/adventure/regions.json", schema: Region, label: "Regions" },
  { prefix: "node", files: "content/adventure/nodes/*.json", schema: Node, label: "Adventure nodes" },
  { prefix: "event", files: "content/adventure/events.json", schema: Event, label: "Events" },
  { prefix: "dungeon", files: "content/dungeons/dungeons.json", schema: Dungeon, label: "Dungeons" },
  { prefix: "tribulation", files: "content/dungeons/tribulations.json", schema: Tribulation, label: "Tribulations" },
  { prefix: "sectloc", files: "content/sect/locations.json", schema: SectLocation, label: "Sect locations" },
  { prefix: "rank", files: "content/sect/ranks.json", schema: Rank, label: "Sect ranks" },
  { prefix: "tournament", files: "content/sect/tournaments.json", schema: Tournament, label: "Tournaments" },
  { prefix: "shop", files: "content/economy/shops.json", schema: Shop, label: "Shops" },
  { prefix: "loot", files: "content/economy/loot/*.json", schema: LootTable, label: "Loot tables" },
  { prefix: "alchemy", files: "content/economy/recipes/alchemy.json", schema: AlchemyRecipe, label: "Alchemy recipes" },
  { prefix: "forge", files: "content/economy/recipes/forge.json", schema: ForgeRecipe, label: "Forge recipes" },
  { prefix: "quest", files: "content/quests/*.json", schema: Quest, label: "Quests" },
  { prefix: "ach", files: "content/achievements/achievements.json", schema: Achievement, label: "Achievements" },
  { prefix: "story", files: "content/story/*.json", schema: StoryScene, label: "Story scenes" },
];

/** Single-object files (not arrays, no IDs). */
export const SINGLETONS = {
  gear_rules: { file: "content/equipment/rules.json", schema: GearRules },
  enhancement: { file: "content/equipment/enhancement.json", schema: EnhancementTable },
  refinement: { file: "content/equipment/refinement.json", schema: RefinementTable },
  reforge: { file: "content/equipment/reforge.json", schema: ReforgeTable },
  furnaces: { file: "content/economy/furnaces.json", schema: Furnace.array() },
  starting_state: { file: "content/meta/starting_state.json", schema: StartingState },
  content_targets: { file: "content/meta/content_targets.json", schema: ContentTargets },
} as const;

export * from "./ids.ts";
export * from "./common.ts";
export * from "./world.ts";
export * from "./items.ts";
export * from "./actors.ts";
export * from "./places.ts";
export * from "./economy.ts";
export * from "./progress.ts";
export * from "./gear-math.ts";
