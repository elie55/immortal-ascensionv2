import { z } from "zod";

/**
 * ID conventions — see docs/DATABASE.md §2.
 * Format: `<prefix>.<segment>(.<segment>)*`, lowercase a-z0-9_.
 * The prefix is the entity type and decides which registry the ID lives in.
 */
export const PREFIXES = [
  "realm", "elem", "root", "status",
  "method", "tech", "btech",
  "mat", "cons", "gift", "book", "blueprint", "qitem", "egg", "bfood", "junk",
  "gear", "set",
  "enemy", "boss", "beast", "npc",
  "region", "node", "dungeon", "tribulation",
  "sectloc", "rank", "shop", "loot", "alchemy", "forge",
  "quest", "ach", "tournament", "story", "event", "title",
] as const;
export type Prefix = (typeof PREFIXES)[number];

/** Stackable inventory items. Gear is NOT an item ref: gear is granted as {base, rarity, ilvl} (see GearGrant). */
export const ITEM_PREFIXES = [
  "mat", "cons", "gift", "book", "blueprint", "qitem", "egg", "bfood", "junk",
] as const satisfies readonly Prefix[];

/** Things that can be granted as a reward (items + learnables + titles + beasts). */
export const REWARD_PREFIXES = [...ITEM_PREFIXES, "tech", "method", "title", "beast"] as const;

export const SEGMENT = "[a-z0-9_]+";
export const ID_PATTERN = new RegExp(`^(${PREFIXES.join("|")})\\.${SEGMENT}(\\.${SEGMENT})*$`);

/** A string that is a well-formed ID for one of the given prefixes. */
export function ref<P extends Prefix>(...prefixes: P[]) {
  const re = new RegExp(`^(${prefixes.join("|")})\\.${SEGMENT}(\\.${SEGMENT})*$`);
  return z
    .string()
    .regex(re, { message: `expected an ID with prefix ${prefixes.join("|")}` })
    .describe(`ref:${prefixes.join("|")}`);
}

export const ItemRef = ref(...ITEM_PREFIXES);
export const RewardRef = ref(...REWARD_PREFIXES);
export const AnyRef = z.string().regex(ID_PATTERN).describe("ref:any");

export function prefixOf(id: string): Prefix | undefined {
  const p = id.split(".")[0] as Prefix;
  return (PREFIXES as readonly string[]).includes(p) ? p : undefined;
}

/** Is this string shaped like one of our IDs (used by the generic reference sweep)? */
export function looksLikeId(s: string): boolean {
  return ID_PATTERN.test(s);
}
