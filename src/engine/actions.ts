/**
 * Player actions: the only way the UI changes state. Each validates, mutates, and returns events.
 * `ctx.now` is the wall clock in ms. Randomness comes from state.rng.
 */
import type { ContentIndex, Consumable } from "../content/index.ts";
import type { GameState } from "./state.ts";
import type { DomainEvent } from "./events.ts";
import { addItem, removeItem, itemCount, grantGear, equip as equipGear, unequip as unequipGear, meetsRequirements, equippedSlotOf, gearPlace, EQUIP_SLOTS, deposit, withdraw, depositGear, withdrawGear, claimPouch, expand, type Result, type EquipSlot } from "./inventory.ts";
import { slotOpen } from "./unlock.ts";
import { addBuff, minorBreakthrough, majorBreakthrough, countAffordableStages, qiBankCap, isBreakthroughItem } from "./cultivation.ts";
import { computeStats } from "./stats.ts";
import type { Rewards } from "../../schema/common.ts";

export interface Ctx { now: number }

export type ActionResult<T = {}> = ({ ok: true; events: DomainEvent[] } & T) | { ok: false; reason: string };
const fail = (reason: string): ActionResult<never> => ({ ok: false, reason });

// ---------- rewards ----------

/** Grant a Rewards block (quests, achievements, first clears, story). */
export function grantRewards(s: GameState, content: ContentIndex, r: Rewards, out: DomainEvent[]): void {
  if (r.spirit_stones) { s.resources.spirit_stones += r.spirit_stones; out.push({ type: "currency", currency: "spirit_stones", delta: r.spirit_stones }); }
  if (r.sect_fame) { s.resources.sect_fame = Math.max(0, s.resources.sect_fame + r.sect_fame); out.push({ type: "currency", currency: "sect_fame", delta: r.sect_fame }); }
  if (r.contribution) { s.resources.contribution += r.contribution; out.push({ type: "currency", currency: "contribution", delta: r.contribution }); }
  for (const q of r.items ?? []) { addItem(s, content, q.id, q.qty); out.push({ type: "item_gained", id: q.id, qty: q.qty }); }
  for (const g of r.gear ?? []) { const uid = grantGear(s, content, g); out.push({ type: "gear_gained", uid, base: g.base, rarity: g.rarity, ilvl: g.ilvl }); }
  for (const t of r.techniques ?? []) {
    if (t.startsWith("method.")) { if (s.character.methodMastery[t] === undefined) s.character.methodMastery[t] = 0; }
    else if (s.techniques.known[t] === undefined) s.techniques.known[t] = 0;
    out.push({ type: "unlock", id: t });
  }
  for (const t of r.titles ?? []) if (!s.character.titles.includes(t)) { s.character.titles.push(t); out.push({ type: "unlock", id: t }); }
  for (const a of r.affinity ?? []) {
    const rel = (s.relations[a.npc] ??= { affinity: 0, giftsToday: 0, topics: [] });
    rel.affinity = Math.max(0, rel.affinity + a.delta);
  }
  if (r.mastery_xp) addMasteryXp(s, content, s.character.method, r.mastery_xp, out);
}

export function addMasteryXp(s: GameState, content: ContentIndex, id: string, xp: number, out: DomainEvent[]): void {
  const def = content.get<any>(id);
  const curve = def.mastery ?? { max_level: 10, xp_per_level: 100, per_level_bonus: 0.03 };
  const max = curve.max_level * curve.xp_per_level;
  const table = id.startsWith("method.") ? s.character.methodMastery : s.techniques.known;
  const before = table[id] ?? 0;
  table[id] = Math.min(max, before + xp);
  out.push({ type: "mastery", id, xp: table[id]!, level: Math.floor(table[id]! / curve.xp_per_level) });
}

// ---------- cultivation ----------

export function breakThrough(s: GameState, content: ContentIndex, _ctx: Ctx): ActionResult<{ kind: "minor" | "major"; success: boolean; chance?: number }> {
  if (s.character.stage < 9) {
    const r = minorBreakthrough(s, content);
    return r.ok ? { ok: true, events: r.events, kind: "minor", success: true } : fail(r.reason);
  }
  const bonus = s.character.breakthroughBonus;
  const r = majorBreakthrough(s, content, { pillBonus: bonus });
  if (!r.ok) return fail(r.reason);
  s.character.breakthroughBonus = 0;
  return { ok: true, events: r.events, kind: "major", success: r.success, chance: r.chance };
}

/** Chain every affordable minor breakthrough (offline report's "Break through ×N"). */
export function breakThroughAll(s: GameState, content: ContentIndex, ctx: Ctx): ActionResult<{ count: number }> {
  const events: DomainEvent[] = [];
  let count = 0;
  while (countAffordableStages(s, content) > 0) {
    const r = breakThrough(s, content, ctx);
    if (!r.ok) break;
    events.push(...r.events); count++;
  }
  return count ? { ok: true, events, count } : fail("Not enough Qi");
}

export function switchMethod(s: GameState, content: ContentIndex, methodId: string): ActionResult {
  if (s.character.methodMastery[methodId] === undefined) return fail("Method not learned");
  const m = content.get<any>(methodId);
  const need = m.requirements?.realm;
  if (need && content.get<any>(need.id).order > content.get<any>(s.character.realm).order) return fail(`Requires ${content.get<any>(need.id).name}`);
  s.character.method = methodId;
  return { ok: true, events: [] };
}

export function setLocation(s: GameState, _content: ContentIndex, location: string | undefined): ActionResult {
  s.character.location = location;
  return { ok: true, events: [] };
}

// ---------- items ----------

export function useConsumable(s: GameState, content: ContentIndex, ctx: Ctx, id: string, qty = 1): ActionResult<{ qi?: number }> {
  const def = content.find<Consumable>(id);
  if (!def || !id.startsWith("cons.")) return fail("Not a consumable");
  if (itemCount(s, id) < qty) return fail("Not enough items");
  if (isBreakthroughItem(content, id)) return fail("Kept for your breakthrough: it is used automatically");
  const cd = s.character.cooldowns[id] ?? 0;
  if (cd > ctx.now) return fail(`Ready in ${Math.ceil((cd - ctx.now) / 60000)} min`);
  const e = def.effects;
  const events: DomainEvent[] = [];
  let qi = 0;
  const stats = computeStats(s, content).total;
  for (let i = 0; i < qty; i++) {
    if (e.qi) qi += e.qi;
    if (e.cultivation_boost) addBuff(s, { id, label: def.name, qi_mult: e.cultivation_boost.mult, expiresAt: ctx.now + e.cultivation_boost.minutes * 60_000 }, events);
    if (e.buff) addBuff(s, { id: e.buff.status, label: content.get<any>(e.buff.status).name, stats: content.get<any>(e.buff.status).modifiers, expiresAt: ctx.now + e.buff.turns * 60_000 }, events);
    if (e.permanent) for (const [k, v] of Object.entries(e.permanent)) s.character.permanent[k] = (s.character.permanent[k] ?? 0) + v;
    if (e.breakthrough_chance_bonus) s.character.breakthroughBonus = Math.min(content.rules.major_breakthrough.pill_bonus_cap, s.character.breakthroughBonus + e.breakthrough_chance_bonus);
    if (e.hp_pct) s.character.hp = Math.min(stats.hp ?? 0, (s.character.hp ?? stats.hp ?? 0) + (stats.hp ?? 0) * e.hp_pct / 100);
    if (e.mastery_xp) addMasteryXp(s, content, s.character.method, e.mastery_xp, events);
  }
  if (qi) s.character.qi = Math.min(qiBankCap(s, content), s.character.qi + qi);
  removeItem(s, id, qty);
  if (def.cooldown_min) s.character.cooldowns[id] = ctx.now + def.cooldown_min * 60_000;
  events.push({ type: "item_used", id, qty });
  return { ok: true, events, qi: qi || undefined };
}

export function equip(s: GameState, content: ContentIndex, uid: number, slot?: EquipSlot): ActionResult<{ slot: EquipSlot; replaced?: number }> {
  const r = equipGear(s, content, uid, slot);
  return r.ok ? { ok: true, events: [{ type: "equipped", uid, slot: r.slot }], slot: r.slot, replaced: r.replaced } : fail(r.reason);
}

/**
 * The loadout with the highest Combat Power from the bag (sets and rings included): each open slot tries every
 * piece that fits and keeps the best; two passes so set bonuses can settle. Returns the changes without applying
 * them (the caller applies them; also drives the "better gear" badge).
 */
export function bestLoadout(s: GameState, content: ContentIndex): { changes: { slot: EquipSlot; uid: number }[]; cpBefore: number; cpAfter: number } {
  const start = { ...s.equipped };
  const cpBefore = computeStats(s, content).cp;
  let best = cpBefore;
  for (let pass = 0; pass < 2; pass++) {
    for (const slot of EQUIP_SLOTS) {
      if (!slotOpen(s, content, slot).ok) continue;
      const want = slot.startsWith("ring") ? "ring" : slot;
      for (const [u, g] of Object.entries(s.inventory.gear)) {
        const uid = Number(u);
        if (s.equipped[slot] === uid) continue;
        const place = gearPlace(s, uid);
        if (place === "depot" || place === "pouch") continue; // only what is in the bag (or worn elsewhere)
        const base = content.get<any>(g.base);
        if (base.slot !== want || !meetsRequirements(s, content, base).ok) continue;
        const other = equippedSlotOf(s, uid);
        if (other && other !== slot) continue; // never move a piece from the other ring slot
        const prev = s.equipped[slot];
        s.equipped[slot] = uid;
        const cp = computeStats(s, content).cp;
        if (cp > best) best = cp;
        else if (prev === undefined) delete s.equipped[slot]; else s.equipped[slot] = prev;
      }
    }
  }
  const changes = EQUIP_SLOTS.filter((k) => s.equipped[k] !== start[k] && s.equipped[k] !== undefined).map((k) => ({ slot: k, uid: s.equipped[k]! }));
  for (const k of EQUIP_SLOTS) { if (start[k] === undefined) delete s.equipped[k]; else s.equipped[k] = start[k]; }
  return { changes, cpBefore, cpAfter: best };
}

/** Equip the best loadout (see bestLoadout). */
export function equipBest(s: GameState, content: ContentIndex): ActionResult<{ changed: number; cpGain: number }> {
  const plan = bestLoadout(s, content);
  if (!plan.changes.length) return fail("You are already wearing your best gear");
  const events: DomainEvent[] = [];
  for (const ch of plan.changes) { s.equipped[ch.slot] = ch.uid; events.push({ type: "equipped", uid: ch.uid, slot: ch.slot }); }
  return { ok: true, events, changed: plan.changes.length, cpGain: Math.round(plan.cpAfter - plan.cpBefore) };
}

export function unequip(s: GameState, _content: ContentIndex, slot: EquipSlot): ActionResult<{ uid: number }> {
  const r = unequipGear(s, slot, _content);
  return r.ok ? { ok: true, events: [], uid: r.uid } : fail(r.reason);
}

export function sellItem(s: GameState, content: ContentIndex, id: string, qty: number): ActionResult<{ stones: number }> {
  const def = content.find<any>(id);
  if (!def || typeof def.sell_value !== "number") return fail("Cannot be sold");
  if (!removeItem(s, id, qty)) return fail("Not enough items");
  const stones = def.sell_value * qty;
  s.resources.spirit_stones += stones;
  return { ok: true, events: [{ type: "currency", currency: "spirit_stones", delta: stones }], stones };
}

export function setLoadout(s: GameState, content: ContentIndex, kind: "actives" | "passives" | "ultimate", index: number, techId: string | null): ActionResult {
  if (techId && s.techniques.known[techId] === undefined) return fail("Technique not learned");
  if (techId) {
    const t = content.get<any>(techId);
    const want = kind === "actives" ? "active" : kind === "passives" ? "passive" : "ultimate";
    if (t.kind !== want) return fail(`Not a ${want} technique`);
  }
  if (kind === "ultimate") s.techniques.ultimate = techId;
  else {
    const arr = s.techniques[kind];
    if (index < 0 || index >= arr.length) return fail("Bad slot");
    const dup = arr.findIndex((x, i) => x === techId && i !== index);
    if (techId && dup >= 0) arr[dup] = null;
    arr[index] = techId;
  }
  return { ok: true, events: [] };
}

export type { Result };

// ---------- bag, depot and overflow pouch ----------
const wrap = (r: Result): ActionResult => (r.ok ? { ok: true, events: [] } : fail(r.reason));
export const storeItem = (s: GameState, c: ContentIndex, id: string, qty: number): ActionResult => wrap(deposit(s, c, id, qty));
export const takeItem = (s: GameState, c: ContentIndex, id: string, qty: number): ActionResult => wrap(withdraw(s, c, id, qty));
export const storeGear = (s: GameState, c: ContentIndex, uid: number): ActionResult => wrap(depositGear(s, c, uid));
export const takeGear = (s: GameState, c: ContentIndex, uid: number): ActionResult => wrap(withdrawGear(s, c, uid));
export function claimOverflow(s: GameState, c: ContentIndex): ActionResult<{ moved: number; left: number }> {
  const r = claimPouch(s, c);
  return r.ok ? { ok: true, events: [], moved: r.moved, left: r.left } : fail(r.reason);
}
export function buyExpansion(s: GameState, c: ContentIndex, which: "bag" | "depot"): ActionResult<{ slots: number; cost: number }> {
  const r = expand(s, c, which);
  return r.ok ? { ok: true, events: [{ type: "currency", currency: "spirit_stones", delta: -r.cost }], slots: r.slots, cost: r.cost } : fail(r.reason);
}
