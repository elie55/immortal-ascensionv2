/** Item stacks, gear instances and equipment slots. */
import type { ContentIndex, GearBase } from "../content/index.ts";
import type { GameState, GearInstance } from "./state.ts";
import type { GearGrant } from "../../schema/common.ts";
import { rollInstance } from "../../schema/gear-math.ts";
import { rngFn } from "./rng.ts";

export type Result<T = {}> = ({ ok: true } & T) | { ok: false; reason: string };

/** Equipment slot keys on the character. Rings have two slots; every other slot one. */
export const EQUIP_SLOTS = ["weapon", "armor", "helmet", "boots", "necklace", "ring_1", "ring_2", "artifact"] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];
export const slotKeysFor = (slot: GearBase["slot"]): EquipSlot[] => slot === "ring" ? ["ring_1", "ring_2"] : [slot as EquipSlot];

// ---------- capacity ----------
// One slot per item stack (any quantity up to its stack_limit) or per gear piece in the bag; worn gear takes none.
// Drops that do not fit go to the overflow pouch (never lost) and are claimed once there is room. The depot in
// Your Quarters has its own slots; crafting, selling and using work from the bag only, so the depot matters.

const rankOrder = (s: GameState, c: ContentIndex) => (c.get<any>(s.character.rank)?.order ?? 0);
export function bagCapacity(s: GameState, c: ContentIndex): number {
  const r = c.rules.inventory;
  return r.bag_slots + r.slots_per_rank_order * rankOrder(s, c) + r.expansion_slots * s.inventory.bagExpansions;
}
export function depotCapacity(s: GameState, c: ContentIndex): number {
  const r = c.rules.inventory;
  return r.depot_slots + r.slots_per_rank_order * rankOrder(s, c) + r.expansion_slots * s.inventory.depotExpansions;
}
/** Where a gear instance lives. */
export function gearPlace(s: GameState, uid: number): "worn" | "depot" | "pouch" | "bag" | "none" {
  if (!s.inventory.gear[uid]) return "none";
  if (equippedSlotOf(s, uid)) return "worn";
  if (s.inventory.depot.gear.includes(uid)) return "depot";
  if (s.inventory.pouch.gear.includes(uid)) return "pouch";
  return "bag";
}
export const bagGearUids = (s: GameState) => Object.keys(s.inventory.gear).map(Number).filter((u) => gearPlace(s, u) === "bag");
export function bagUsed(s: GameState): number { return Object.values(s.inventory.stacks).filter((q) => q > 0).length + bagGearUids(s).length; }
export function depotUsed(s: GameState): number { return Object.values(s.inventory.depot.stacks).filter((q) => q > 0).length + s.inventory.depot.gear.length; }
export const bagFree = (s: GameState, c: ContentIndex) => Math.max(0, bagCapacity(s, c) - bagUsed(s));
export const depotFree = (s: GameState, c: ContentIndex) => Math.max(0, depotCapacity(s, c) - depotUsed(s));
export const pouchCount = (s: GameState) => Object.values(s.inventory.pouch.stacks).filter((q) => q > 0).length + s.inventory.pouch.gear.length;

/** Cost in spirit stones of the next bag/depot expansion; null when the maximum is reached. */
export function expansionCost(s: GameState, c: ContentIndex, which: "bag" | "depot"): number | null {
  const r = c.rules.inventory;
  const n = which === "bag" ? s.inventory.bagExpansions : s.inventory.depotExpansions;
  if (n >= (which === "bag" ? r.bag_expansions_max : r.depot_expansions_max)) return null;
  return Math.round(r.expansion_cost_base * Math.pow(r.expansion_cost_growth, n));
}
export function expand(s: GameState, c: ContentIndex, which: "bag" | "depot"): Result<{ slots: number; cost: number }> {
  const cost = expansionCost(s, c, which);
  if (cost === null) return { ok: false, reason: "No more expansions available" };
  if (s.resources.spirit_stones < cost) return { ok: false, reason: `Needs ${cost} spirit stones` };
  s.resources.spirit_stones -= cost;
  if (which === "bag") s.inventory.bagExpansions++; else s.inventory.depotExpansions++;
  return { ok: true, slots: c.rules.inventory.expansion_slots, cost };
}

// ---------- stacks ----------

export const itemCount = (s: GameState, id: string) => s.inventory.stacks[id] ?? 0;
export const hasItems = (s: GameState, items: { id: string; qty: number }[]) => items.every((q) => itemCount(s, q.id) >= q.qty);

const stackLimit = (content: ContentIndex, id: string) => (content.get<any>(id).stack_limit ?? Number.MAX_SAFE_INTEGER) as number;

/** Add to a stack map bounded by `cap` slots; returns the quantity that did not fit. */
function addToStacks(stacks: Record<string, number>, id: string, qty: number, limit: number, cap: number): number {
  const have = stacks[id] ?? 0;
  if (have <= 0 && Object.values(stacks).filter((q) => q > 0).length >= cap) return qty;
  const put = Math.min(qty, Math.max(0, limit - have));
  if (put > 0) stacks[id] = have + put;
  return qty - put;
}

/** Add items to the bag; what does not fit (no free slot, or over the stack limit) waits in the overflow pouch. */
export function addItem(s: GameState, content: ContentIndex, id: string, qty: number): { pouched: number } {
  if (qty <= 0) return { pouched: 0 };
  const limit = stackLimit(content, id);
  const left = addToStacks(s.inventory.stacks, id, qty, limit, bagCapacity(s, content) - bagGearUids(s).length);
  if (left > 0) s.inventory.pouch.stacks[id] = (s.inventory.pouch.stacks[id] ?? 0) + left;
  return { pouched: left };
}

export function removeItem(s: GameState, id: string, qty: number): boolean {
  if (itemCount(s, id) < qty) return false;
  const left = itemCount(s, id) - qty;
  if (left === 0) delete s.inventory.stacks[id]; else s.inventory.stacks[id] = left;
  return true;
}

export function removeItems(s: GameState, items: { id: string; qty: number }[]): boolean {
  if (!hasItems(s, items)) return false;
  for (const q of items) removeItem(s, q.id, q.qty);
  return true;
}

// ---------- gear ----------

/** Roll a new instance from a grant and put it in the bag. Returns its uid. */
export function grantGear(s: GameState, content: ContentIndex, grant: GearGrant): number {
  const base = content.get<GearBase>(grant.base);
  const inst = rollInstance(content.gearRules, base as any, grant.rarity, grant.ilvl, rngFn(s.rng)) as GearInstance;
  const uid = s.inventory.nextUid++;
  const full = bagUsed(s) >= bagCapacity(s, content);
  s.inventory.gear[uid] = inst;
  if (full) s.inventory.pouch.gear.push(uid);
  return uid;
}

// ---------- overflow pouch ----------

/** Move everything that fits from the pouch into the bag. */
export function claimPouch(s: GameState, content: ContentIndex): Result<{ moved: number; left: number }> {
  if (!pouchCount(s)) return { ok: false, reason: "The pouch is empty" };
  let moved = 0;
  for (const [id, qty] of Object.entries(s.inventory.pouch.stacks)) {
    if (qty <= 0) { delete s.inventory.pouch.stacks[id]; continue; }
    const left = addToStacks(s.inventory.stacks, id, qty, stackLimit(content, id), bagCapacity(s, content) - bagGearUids(s).length);
    if (left < qty) moved++;
    if (left > 0) s.inventory.pouch.stacks[id] = left; else delete s.inventory.pouch.stacks[id];
  }
  const keep: number[] = [];
  for (const uid of s.inventory.pouch.gear) { if (bagUsed(s) < bagCapacity(s, content)) { moved++; } else keep.push(uid); }
  s.inventory.pouch.gear = keep;
  return moved ? { ok: true, moved, left: pouchCount(s) } : { ok: false, reason: "No room in your bag: sell, use or store something first" };
}

// ---------- depot (Your Quarters) ----------

export function deposit(s: GameState, content: ContentIndex, id: string, qty: number): Result {
  if (itemCount(s, id) < qty || qty <= 0) return { ok: false, reason: "Not enough items" };
  if (id.startsWith("qitem.")) return { ok: false, reason: "Quest items stay with you" };
  const left = addToStacks(s.inventory.depot.stacks, id, qty, stackLimit(content, id), depotCapacity(s, content) - s.inventory.depot.gear.length);
  const put = qty - left;
  if (put <= 0) return { ok: false, reason: "The depot is full" };
  removeItem(s, id, put);
  return { ok: true };
}
export function withdraw(s: GameState, content: ContentIndex, id: string, qty: number): Result {
  const have = s.inventory.depot.stacks[id] ?? 0;
  if (have < qty || qty <= 0) return { ok: false, reason: "Not enough in the depot" };
  const left = addToStacks(s.inventory.stacks, id, qty, stackLimit(content, id), bagCapacity(s, content) - bagGearUids(s).length);
  const put = qty - left;
  if (put <= 0) return { ok: false, reason: "Your bag is full" };
  if (have - put <= 0) delete s.inventory.depot.stacks[id]; else s.inventory.depot.stacks[id] = have - put;
  return { ok: true };
}
export function depositGear(s: GameState, content: ContentIndex, uid: number): Result {
  if (gearPlace(s, uid) !== "bag") return { ok: false, reason: gearPlace(s, uid) === "worn" ? "Unequip it first" : "Not in your bag" };
  if (depotUsed(s) >= depotCapacity(s, content)) return { ok: false, reason: "The depot is full" };
  s.inventory.depot.gear.push(uid);
  return { ok: true };
}
export function withdrawGear(s: GameState, content: ContentIndex, uid: number): Result {
  if (gearPlace(s, uid) !== "depot") return { ok: false, reason: "Not in the depot" };
  if (bagUsed(s) >= bagCapacity(s, content)) return { ok: false, reason: "Your bag is full" };
  s.inventory.depot.gear = s.inventory.depot.gear.filter((u) => u !== uid);
  return { ok: true };
}

export const gearOf = (s: GameState, uid: number): GearInstance | undefined => s.inventory.gear[uid];
export const equippedUidIn = (s: GameState, slot: EquipSlot): number | undefined => s.equipped[slot];
export function equippedSlotOf(s: GameState, uid: number): EquipSlot | undefined {
  for (const k of EQUIP_SLOTS) if (s.equipped[k] === uid) return k;
  return undefined;
}

export function enhanceMult(content: ContentIndex, inst: GearInstance): number {
  if (inst.enhance <= 0) return 1;
  return content.singletons.enhancement.levels[inst.enhance - 1]?.stat_mult ?? 1;
}

/** Flat stat contribution of one instance (main + affixes), enhancement applied. */
export function gearStats(content: ContentIndex, inst: GearInstance): Record<string, number> {
  const m = enhanceMult(content, inst);
  const out: Record<string, number> = { [inst.main.stat]: inst.main.value * m };
  for (const a of inst.affixes) out[a.stat] = (out[a.stat] ?? 0) + a.value * m;
  return out;
}

export function meetsRequirements(s: GameState, content: ContentIndex, base: GearBase): Result {
  const req = base.requirements as any;
  if (req?.realm) {
    const need = content.get<any>(req.realm).order, have = content.get<any>(s.character.realm).order;
    if (have < need) return { ok: false, reason: `Requires ${content.get<any>(req.realm).name}` };
  }
  if (req?.rank) {
    const need = content.get<any>(req.rank).order, have = content.get<any>(s.character.rank).order;
    if (have < need) return { ok: false, reason: `Requires ${content.get<any>(req.rank).name}` };
  }
  return { ok: true };
}

/** Equip a bag instance; `slot` disambiguates rings (defaults to an empty ring slot, else ring_1). */
export function equip(s: GameState, content: ContentIndex, uid: number, slot?: EquipSlot): Result<{ slot: EquipSlot; replaced?: number }> {
  const inst = gearOf(s, uid);
  if (!inst) return { ok: false, reason: "No such item" };
  const place = gearPlace(s, uid);
  if (place === "depot" || place === "pouch") return { ok: false, reason: place === "depot" ? "Withdraw it from the depot first" : "Claim it from the pouch first" };
  const base = content.get<GearBase>(inst.base);
  const req = meetsRequirements(s, content, base);
  if (!req.ok) return req;
  const keys = slotKeysFor(base.slot);
  const target = slot && keys.includes(slot) ? slot : (keys.find((k) => s.equipped[k] === undefined) ?? keys[0]!);
  const gate = content.rules.slot_unlocks?.[target];
  if (gate && content.get<any>(s.character.realm).order < content.get<any>(gate).order) return { ok: false, reason: `Unlocks at ${content.get<any>(gate).name}` };
  const already = equippedSlotOf(s, uid);
  if (already) delete s.equipped[already];
  const replaced = s.equipped[target];
  s.equipped[target] = uid;
  return { ok: true, slot: target, replaced };
}

export function unequip(s: GameState, slot: EquipSlot, content?: ContentIndex): Result<{ uid: number }> {
  const uid = s.equipped[slot];
  if (uid === undefined) return { ok: false, reason: "Slot is empty" };
  if (content && bagUsed(s) >= bagCapacity(s, content)) return { ok: false, reason: "Your bag is full" };
  delete s.equipped[slot];
  return { ok: true, uid };
}

export function discardGear(s: GameState, uid: number): Result {
  if (!gearOf(s, uid)) return { ok: false, reason: "No such item" };
  if (equippedSlotOf(s, uid)) return { ok: false, reason: "Unequip it first" };
  if (gearPlace(s, uid) !== "bag") return { ok: false, reason: "Bring it to your bag first" };
  if (s.inventory.lockedGear.includes(uid)) return { ok: false, reason: "Item is locked" };
  delete s.inventory.gear[uid];
  return { ok: true };
}
