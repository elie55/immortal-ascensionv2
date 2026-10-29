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

// ---------- stacks ----------

export const itemCount = (s: GameState, id: string) => s.inventory.stacks[id] ?? 0;
export const hasItems = (s: GameState, items: { id: string; qty: number }[]) => items.every((q) => itemCount(s, q.id) >= q.qty);

export function addItem(s: GameState, content: ContentIndex, id: string, qty: number): void {
  if (qty <= 0) return;
  const def = content.get<any>(id);
  const limit = def.stack_limit ?? Number.MAX_SAFE_INTEGER;
  s.inventory.stacks[id] = Math.min(limit, itemCount(s, id) + qty);
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
  s.inventory.gear[uid] = inst;
  return uid;
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
  const base = content.get<GearBase>(inst.base);
  const req = meetsRequirements(s, content, base);
  if (!req.ok) return req;
  const keys = slotKeysFor(base.slot);
  const target = slot && keys.includes(slot) ? slot : (keys.find((k) => s.equipped[k] === undefined) ?? keys[0]!);
  const already = equippedSlotOf(s, uid);
  if (already) delete s.equipped[already];
  const replaced = s.equipped[target];
  s.equipped[target] = uid;
  return { ok: true, slot: target, replaced };
}

export function unequip(s: GameState, slot: EquipSlot): Result<{ uid: number }> {
  const uid = s.equipped[slot];
  if (uid === undefined) return { ok: false, reason: "Slot is empty" };
  delete s.equipped[slot];
  return { ok: true, uid };
}

export function discardGear(s: GameState, uid: number): Result {
  if (!gearOf(s, uid)) return { ok: false, reason: "No such item" };
  if (equippedSlotOf(s, uid)) return { ok: false, reason: "Unequip it first" };
  if (s.inventory.lockedGear.includes(uid)) return { ok: false, reason: "Item is locked" };
  delete s.inventory.gear[uid];
  return { ok: true };
}
