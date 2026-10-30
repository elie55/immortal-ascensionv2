/**
 * Shops: unlock-gated stock, affinity/fame discounts, limited stock per restock period, buying techniques,
 * items and rolled gear, and selling items and gear back.
 *
 * Restock periods: daily (UTC day), weekly (ISO-like week), per_visit (a travelling merchant's visit: every
 * 6 hours), none (limited stock never returns).
 */
import type { ContentIndex, Shop, GearBase } from "../content/index.ts";
import type { GameState } from "./state.ts";
import type { DomainEvent } from "./events.ts";
import type { ActionResult } from "./actions.ts";
import { addItem, grantGear, discardGear, enhanceMult } from "./inventory.ts";
import { checkUnlock, affinityLevel } from "./unlock.ts";
import { dayKey } from "./state.ts";
import { instanceCp } from "../../schema/gear-math.ts";

type Entry = Shop["stock"][number];
export const VISIT_HOURS = 6;
const MAX_DISCOUNT = 30;

export function periodKey(restock: Shop["restock"], now: number): string {
  switch (restock) {
    case "daily": return dayKey(now);
    case "weekly": return `w${Math.floor((now / 86_400_000 + 3) / 7)}`;
    case "per_visit": return `v${Math.floor(now / (VISIT_HOURS * 3_600_000))}`;
    default: return "forever";
  }
}

/** Ms until the next restock (null when stock never returns). */
/** Rumours (mockup merchant_pavilion): bought once per save; the answer is then readable from the shop and the NPC's topics. */
export function rumourState(s: GameState, c: ContentIndex, shopId: string) {
  const shop = c.get<Shop>(shopId);
  return (shop.rumours ?? []).map((r) => {
    const known = (s.relations[r.about]?.topics ?? []).includes(`rumour:${r.id}`);
    const aff = s.relations[shop.owner ?? ""]?.affinity ?? 0;
    const locked = r.unlock.sect_fame && s.resources.sect_fame < r.unlock.sect_fame ? `${r.unlock.sect_fame} Fame` : r.unlock.affinity && aff < r.unlock.affinity ? `Affinity ${r.unlock.affinity}` : null;
    return { ...r, known, locked };
  });
}
export function buyRumour(s: GameState, c: ContentIndex, shopId: string, id: string): ActionResult<{ answer: string }> {
  const r = rumourState(s, c, shopId).find((x) => x.id === id);
  if (!r) return { ok: false, reason: "No such rumour" };
  if (r.known) return { ok: true, events: [], answer: r.answer };
  if (r.locked) return { ok: false, reason: `Needs ${r.locked}` };
  if (s.resources.spirit_stones < r.price) return { ok: false, reason: "Not enough spirit stones" };
  s.resources.spirit_stones -= r.price;
  const rel = (s.relations[r.about] ??= { affinity: 0, giftsToday: 0, topics: [] });
  rel.topics.push(`rumour:${r.id}`);
  return { ok: true, events: [{ type: "talk", npc: r.about, topic: `rumour:${r.id}` }], answer: r.answer };
}

export function restockIn(shop: Shop, now: number): number | null {
  const len = shop.restock === "daily" ? 86_400_000 : shop.restock === "weekly" ? 7 * 86_400_000 : shop.restock === "per_visit" ? VISIT_HOURS * 3_600_000 : 0;
  if (!len) return null;
  const off = shop.restock === "weekly" ? 3 * 86_400_000 : 0;
  return len - ((now + off) % len);
}

/** Purchase counts for the current period (resets them when the period has rolled over). */
function purchases(s: GameState, shop: Shop, now: number): Record<string, number> {
  const key = periodKey(shop.restock, now);
  if (s.progress.shopPeriods[shop.id] !== key) { s.progress.shopPeriods[shop.id] = key; s.progress.shopPurchases[shop.id] = {}; }
  return (s.progress.shopPurchases[shop.id] ??= {});
}

export function discountPct(s: GameState, c: ContentIndex, shop: Shop): number {
  let pct = 0;
  if (shop.affinity_discount) pct += shop.affinity_discount.pct_per_level * affinityLevel(c, shop.affinity_discount.npc, s.relations[shop.affinity_discount.npc]?.affinity ?? 0).index;
  if (shop.fame_discount_pct_per_500) pct += shop.fame_discount_pct_per_500 * Math.floor(s.resources.sect_fame / 500);
  return Math.min(MAX_DISCOUNT, pct);
}

export interface ShopRow {
  index: number; entry: Entry; id: string; price: number; currency: Entry["currency"];
  left: number | null; locked?: string; owned?: boolean;
}

export const entryId = (e: Entry) => ("id" in e ? e.id : e.gear.base);

export function shopRows(s: GameState, c: ContentIndex, shopId: string, now: number): ShopRow[] {
  const shop = c.get<Shop>(shopId);
  const bought = purchases(s, shop, now);
  const disc = discountPct(s, c, shop);
  return shop.stock.map((e, index) => {
    const id = entryId(e);
    const u = checkUnlock(s, c, e.unlock as any);
    const owned = "id" in e && (id.startsWith("tech.") ? s.techniques.known[id] !== undefined : id.startsWith("method.") ? s.character.methodMastery[id] !== undefined : false);
    const price = e.currency === "spirit_stones" ? Math.max(1, Math.round(e.price * (1 - disc / 100))) : e.price;
    return { index, entry: e, id, price, currency: e.currency, left: e.qty === undefined ? null : Math.max(0, e.qty - (bought[index] ?? 0)), locked: u.ok ? undefined : u.reasons[0], owned };
  });
}

export function buy(s: GameState, c: ContentIndex, shopId: string, index: number, qty: number, now: number): ActionResult<{ spent: number }> {
  const row = shopRows(s, c, shopId, now)[index];
  if (!row) return { ok: false, reason: "Not sold here" };
  if (row.locked) return { ok: false, reason: row.locked };
  if (row.owned) return { ok: false, reason: "Already learned" };
  const isLearnable = row.id.startsWith("tech.") || row.id.startsWith("method.");
  const n = isLearnable || "gear" in row.entry ? 1 : Math.max(1, Math.floor(qty));
  if (row.left !== null && row.left < n) return { ok: false, reason: row.left === 0 ? "Sold out" : `Only ${row.left} left` };
  const cost = row.price * n;
  if (s.resources[row.currency] < cost) return { ok: false, reason: "Not enough " + (row.currency === "spirit_stones" ? "spirit stones" : row.currency === "sect_fame" ? "fame" : "contribution") };
  s.resources[row.currency] -= cost;
  const events: DomainEvent[] = [{ type: "currency", currency: row.currency, delta: -cost }];
  if ("gear" in row.entry) {
    const uid = grantGear(s, c, row.entry.gear);
    events.push({ type: "gear_gained", uid, base: row.entry.gear.base, rarity: row.entry.gear.rarity, ilvl: row.entry.gear.ilvl });
  } else if (row.id.startsWith("tech.")) { s.techniques.known[row.id] = 0; events.push({ type: "unlock", id: row.id }); }
  else if (row.id.startsWith("method.")) { s.character.methodMastery[row.id] = 0; events.push({ type: "unlock", id: row.id }); }
  else { addItem(s, c, row.id, n); events.push({ type: "item_gained", id: row.id, qty: n }); }
  const bought = purchases(s, c.get<Shop>(shopId), now);
  bought[index] = (bought[index] ?? 0) + n;
  events.push({ type: "purchase", shop: shopId, id: row.id, qty: n });
  return { ok: true, events, spent: cost };
}

/** Spirit stones a piece of gear sells for: proportional to its combat power. */
export function gearSellValue(c: ContentIndex, uid: number, s: GameState): number {
  const g = s.inventory.gear[uid];
  if (!g) return 0;
  return Math.max(5, Math.round(instanceCp(c.gearRules, g as any, enhanceMult(c, g)) * 0.4));
}

export function sellGear(s: GameState, c: ContentIndex, uids: number[]): ActionResult<{ stones: number }> {
  let stones = 0;
  for (const uid of uids) {
    const v = gearSellValue(c, uid, s);
    const r = discardGear(s, uid);
    if (!r.ok) return { ok: false, reason: r.reason };
    stones += v;
  }
  s.resources.spirit_stones += stones;
  return { ok: true, events: [{ type: "currency", currency: "spirit_stones", delta: stones }], stones };
}

/** The shop an NPC or location runs (a location's NPC owner, or the location's own shop field). */
export function shopAt(c: ContentIndex, locOrNpc: string): string | undefined {
  const x = c.find<any>(locOrNpc);
  if (x?.shop) return x.shop;
  return c.byPrefix<Shop>("shop").find((sh) => sh.owner && c.get<any>(sh.owner).location === locOrNpc)?.id;
}

export const gearBase = (c: ContentIndex, e: Entry): GearBase | undefined => ("gear" in e ? c.get<GearBase>(e.gear.base) : undefined);
