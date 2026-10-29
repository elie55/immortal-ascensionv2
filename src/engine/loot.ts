/** Loot tables → concrete drops. Mirrors the validator's rules: pools only yield bases whose range allows the rolled rarity. */
import type { ContentIndex, LootTable, GearBase } from "../content/index.ts";
import type { GameState } from "./state.ts";
import type { DomainEvent } from "./events.ts";
import { addItem, grantGear } from "./inventory.ts";
import { nextInt, nextFloat, weightedIndex, chance } from "./rng.ts";
import { RARITIES, type Rarity } from "../../schema/common.ts";
import type { GearGrant } from "../../schema/common.ts";

export interface Drops { items: { id: string; qty: number }[]; gear: GearGrant[]; spirit_stones: number; sect_fame: number; mastery_xp: number }

const rIdx = (r: string) => RARITIES.indexOf(r as Rarity);

/** Bases a selector can yield at a given rarity. */
export function poolBases(c: ContentIndex, sel: any, rarity: string): GearBase[] {
  if (sel.base) { const b = c.get<GearBase>(sel.base); return rIdx(rarity) >= rIdx(b.rarity_range[0]) && rIdx(rarity) <= rIdx(b.rarity_range[1]) ? [b] : []; }
  const p = sel.pool;
  return c.byPrefix<GearBase>("gear").filter((b) => b.droppable && !b.unique
    && (!p.slot || b.slot === p.slot) && (!p.set || b.set === p.set) && (!p.tags?.length || p.tags.some((t: string) => b.drop_tags.includes(t)))
    && rIdx(rarity) >= rIdx(b.rarity_range[0]) && rIdx(rarity) <= rIdx(b.rarity_range[1]));
}

export function rollTable(s: GameState, c: ContentIndex, tableId: string): Drops {
  const t = c.get<LootTable>(tableId);
  const out: Drops = { items: [], gear: [], spirit_stones: 0, sect_fame: t.sect_fame, mastery_xp: t.mastery_xp };
  const add = (id: string, qty: number) => { if (qty <= 0) return; const e = out.items.find((x) => x.id === id); if (e) e.qty += qty; else out.items.push({ id, qty }); };
  const rollEntry = (e: any) => {
    if ("gear" in e) {
      const band = e.ilvl ?? t.ilvl ?? [1, 1];
      const ilvl = nextInt(s.rng, band[0], band[1]);
      const rars = Object.entries(e.rarity_weights as Record<string, number>).filter(([, w]) => w > 0);
      // choose rarity by weight, but only among rarities that some base in the pool can actually be
      const viable = rars.filter(([r]) => poolBases(c, e.gear, r).length > 0);
      if (!viable.length) return;
      const i = weightedIndex(s.rng, viable.map(([, w]) => w));
      const rarity = viable[i]![0];
      const bases = poolBases(c, e.gear, rarity);
      const base = bases[Math.floor(nextFloat(s.rng) * bases.length)]!;
      out.gear.push({ base: base.id, rarity: rarity as Rarity, ilvl });
    } else add(e.id, nextInt(s.rng, e.qty[0], e.qty[1]));
  };
  if (t.mode === "pick") {
    for (let r = 0; r < t.rolls; r++) { const i = weightedIndex(s.rng, t.entries.map((e) => e.chance)); if (i >= 0) rollEntry(t.entries[i]); }
  } else for (let r = 0; r < t.rolls; r++) for (const e of t.entries) if (chance(s.rng, e.chance)) rollEntry(e);
  for (const g of t.guaranteed) add(g.id, g.qty);
  for (const g of t.guaranteed_gear) out.gear.push(g);
  out.spirit_stones = nextInt(s.rng, t.spirit_stones[0], t.spirit_stones[1]);
  return out;
}

export function mergeDrops(a: Drops, b: Drops): Drops {
  const items = [...a.items.map((x) => ({ ...x }))];
  for (const x of b.items) { const e = items.find((y) => y.id === x.id); if (e) e.qty += x.qty; else items.push({ ...x }); }
  return { items, gear: [...a.gear, ...b.gear], spirit_stones: a.spirit_stones + b.spirit_stones, sect_fame: a.sect_fame + b.sect_fame, mastery_xp: a.mastery_xp + b.mastery_xp };
}

/** Put drops in the bag / wallet and return the events (gear uids included for the victory screen). */
export function grantDrops(s: GameState, c: ContentIndex, d: Drops, out: DomainEvent[]): { gearUids: number[] } {
  const gearUids: number[] = [];
  for (const it of d.items) { addItem(s, c, it.id, it.qty); out.push({ type: "item_gained", id: it.id, qty: it.qty }); }
  for (const g of d.gear) { const uid = grantGear(s, c, g); gearUids.push(uid); out.push({ type: "gear_gained", uid, base: g.base, rarity: g.rarity, ilvl: g.ilvl }); }
  if (d.spirit_stones) { s.resources.spirit_stones += d.spirit_stones; out.push({ type: "currency", currency: "spirit_stones", delta: d.spirit_stones }); }
  if (d.sect_fame) { s.resources.sect_fame += d.sect_fame; out.push({ type: "currency", currency: "sect_fame", delta: d.sect_fame }); }
  return { gearUids };
}
