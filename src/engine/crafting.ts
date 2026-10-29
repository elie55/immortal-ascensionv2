/**
 * Spirit Forge (enhance, refine, reforge, awaken, craft) and Alchemy (pill refining, furnaces, proficiency).
 * All costs and odds come from content: equipment/enhancement.json, refinement.json, reforge.json,
 * economy/furnaces.json and the recipe files. Randomness uses the save's RNG so results are reproducible.
 */
import type { ContentIndex, GearBase, AlchemyRecipe, ForgeRecipe, Furnace, Blueprint } from "../content/index.ts";
import type { GameState, GearInstance } from "./state.ts";
import type { DomainEvent } from "./events.ts";
import type { ActionResult } from "./actions.ts";
import { addItem, removeItems, hasItems, grantGear, itemCount } from "./inventory.ts";
import { checkUnlock, affinityLevel } from "./unlock.ts";
import { nextFloat, nextInt, rngFn } from "./rng.ts";
import { refineInstance, rollInstance } from "../../schema/gear-math.ts";
import { REFINE_CAP, RARITIES } from "../../schema/common.ts";

type Qty = { id: string; qty: number };
export interface Cost { stones: number; items: Qty[]; chance: number }
const fail = (reason: string) => ({ ok: false as const, reason });

function pay(s: GameState, cost: { stones: number; items: Qty[] }, events: DomainEvent[]): string | null {
  if (s.resources.spirit_stones < cost.stones) return "Not enough spirit stones";
  if (!hasItems(s, cost.items)) return "Missing materials";
  s.resources.spirit_stones -= cost.stones;
  removeItems(s, cost.items);
  if (cost.stones) events.push({ type: "currency", currency: "spirit_stones", delta: -cost.stones });
  for (const q of cost.items) events.push({ type: "item_used", id: q.id, qty: q.qty });
  return null;
}
const gear = (s: GameState, uid: number) => s.inventory.gear[uid];
const rIdx = (r: string) => RARITIES.indexOf(r as any);

// ---------- enhancement (+1 … +15) ----------

/** Item-level factor on stone costs (enhancement.ilvl_cost): early gear is cheap to upgrade, endgame gear costs real money. */
export const ilvlCost = (c: ContentIndex, ilvl: number) => Math.pow(Math.max(1, ilvl) / c.singletons.enhancement.ilvl_cost.ref, c.singletons.enhancement.ilvl_cost.exp);

export function enhanceCost(c: ContentIndex, g: GearInstance): Cost | null {
  const t = c.singletons.enhancement;
  const row = t.levels[g.enhance];
  if (!row) return null;
  const mult = t.rarity_cost_mult[g.rarity as keyof typeof t.rarity_cost_mult] ?? 1;
  return { stones: Math.max(1, Math.round(row.stones_base * mult * ilvlCost(c, g.ilvl))), items: row.materials, chance: row.success };
}

export function enhance(s: GameState, c: ContentIndex, uid: number): ActionResult<{ success: boolean; level: number }> {
  const g = gear(s, uid);
  if (!g) return fail("No such item");
  const cost = enhanceCost(c, g);
  if (!cost) return fail("Already at +15");
  const events: DomainEvent[] = [];
  const err = pay(s, cost, events);
  if (err) return fail(err);
  const success = nextFloat(s.rng) < cost.chance;
  if (success) g.enhance++;
  events.push({ type: "enhanced", uid, level: g.enhance, success });
  return { ok: true, events, success, level: g.enhance };
}

// ---------- refinement (one rarity up, capped at mythic and the base's range) ----------

export function refineCap(c: ContentIndex, g: GearInstance): string {
  const base = c.get<GearBase>(g.base);
  return RARITIES[Math.min(rIdx(base.rarity_range[1]), rIdx(REFINE_CAP))]!;
}

export function refineCost(c: ContentIndex, g: GearInstance): (Cost & { to: string }) | { blocked: string } {
  if (rIdx(g.rarity) >= rIdx(REFINE_CAP)) return { blocked: "Mythic is the highest rarity refinement can reach" };
  if (rIdx(g.rarity) >= rIdx(refineCap(c, g))) return { blocked: "This piece cannot hold a higher rarity" };
  const step = c.singletons.refinement.steps.find((x) => x.from === g.rarity);
  if (!step) return { blocked: "No refinement step for this rarity" };
  return { stones: step.stones, items: step.materials, chance: step.chance, to: RARITIES[rIdx(g.rarity) + 1]! };
}

export function refine(s: GameState, c: ContentIndex, uid: number): ActionResult<{ success: boolean; rarity: string }> {
  const g = gear(s, uid);
  if (!g) return fail("No such item");
  const cost = refineCost(c, g);
  if ("blocked" in cost) return fail(cost.blocked);
  const events: DomainEvent[] = [];
  const err = pay(s, cost, events);
  if (err) return fail(err);
  const success = nextFloat(s.rng) < cost.chance;
  if (success) s.inventory.gear[uid] = refineInstance(c.gearRules, g as any, c.get<GearBase>(g.base) as any, rngFn(s.rng)) as GearInstance;
  events.push({ type: "refined", uid, rarity: s.inventory.gear[uid]!.rarity, success });
  return { ok: true, events, success, rarity: s.inventory.gear[uid]!.rarity };
}

// ---------- reforge (re-roll secondary stats, keep locked ones) ----------

export function reforgeCost(c: ContentIndex, g: GearInstance, locked: number[]): Cost & { maxLocks: number } {
  const t = c.singletons.reforge;
  const mult = c.singletons.enhancement.rarity_cost_mult[g.rarity as keyof typeof c.singletons.enhancement.rarity_cost_mult] ?? 1;
  const items: Qty[] = t.materials.map((m) => ({ ...m }));
  for (const l of t.lock_cost_per_stat) {
    const have = items.find((x) => x.id === l.id);
    if (have) have.qty += l.qty * locked.length; else if (locked.length) items.push({ id: l.id, qty: l.qty * locked.length });
  }
  return { stones: Math.max(1, Math.round(t.stones_base * mult * Math.max(0.25, ilvlCost(c, g.ilvl)))), items, chance: 1, maxLocks: Math.min(t.max_secondary_stats, Math.max(0, g.affixes.length - 1)) };
}

export function reforge(s: GameState, c: ContentIndex, uid: number, locked: number[]): ActionResult {
  const g = gear(s, uid);
  if (!g) return fail("No such item");
  if (!g.affixes.length) return fail("This piece has no secondary attributes");
  const cost = reforgeCost(c, g, locked);
  if (locked.length > cost.maxLocks) return fail(`At most ${cost.maxLocks} attributes can be locked`);
  const events: DomainEvent[] = [];
  const err = pay(s, cost, events);
  if (err) return fail(err);
  const base = c.get<GearBase>(g.base);
  // Roll fresh affixes at the same rarity and level; locked stats keep their slot, the rest take new stats.
  const fresh = rollInstance(c.gearRules, { ...base, signature_affix: undefined } as any, g.rarity as any, g.ilvl, rngFn(s.rng));
  const kept = new Set(g.affixes.filter((_, i) => locked.includes(i)).map((x) => x.stat));
  const pool = fresh.affixes.filter((x) => !kept.has(x.stat));
  g.affixes = g.affixes.map((x, i) => (locked.includes(i) ? x : (pool.shift() ?? x)));
  events.push({ type: "reforged", uid });
  return { ok: true, events };
}

// ---------- awakening ----------

export function awakenInfo(c: ContentIndex, g: GearInstance) { return c.get<GearBase>(g.base).awakening; }

export function awaken(s: GameState, c: ContentIndex, uid: number): ActionResult {
  const g = gear(s, uid);
  if (!g) return fail("No such item");
  const a = awakenInfo(c, g);
  if (!a) return fail("This piece cannot be awakened");
  if (g.awakened) return fail("Already awakened");
  const events: DomainEvent[] = [];
  const err = pay(s, { stones: a.cost_stones, items: a.materials }, events);
  if (err) return fail(err);
  g.awakened = true;
  g.specials = [...g.specials, a.effect];
  events.push({ type: "unlock", id: `awakened:${uid}` });
  return { ok: true, events };
}

// ---------- recipe unlocks (shared by forge and alchemy) ----------

type RecipeUnlock = AlchemyRecipe["unlock"];
export function recipeUnlocked(s: GameState, c: ContentIndex, id: string, u: RecipeUnlock): { ok: boolean; reason?: string } {
  if (s.progress.recipes.includes(id)) return { ok: true };
  switch (u.type) {
    case "known": return { ok: true };
    case "blueprint": return { ok: false, reason: `Study ${c.get<Blueprint>(u.id).name}` };
    case "rank": return c.get<any>(s.character.rank).order >= c.get<any>(u.id).order ? { ok: true } : { ok: false, reason: `Requires rank ${c.get<any>(u.id).name}` };
    case "npc": return (s.relations[u.id]?.affinity ?? 0) >= u.affinity ? { ok: true } : { ok: false, reason: `${c.get<any>(u.id).name} affinity ${u.affinity}` };
    case "quest": return s.progress.quests.completed[u.id] ? { ok: true } : { ok: false, reason: `Complete “${c.get<any>(u.id).name}”` };
    case "sect_fame": return s.resources.sect_fame >= u.fame ? { ok: true } : { ok: false, reason: `Requires ${u.fame.toLocaleString("en-US")} Fame` };
  }
}

/** Reading a blueprint consumes it and teaches its recipe. */
export function studyBlueprint(s: GameState, c: ContentIndex, id: string): ActionResult<{ recipe: string }> {
  const bp = c.get<Blueprint>(id);
  if (itemCount(s, id) < 1) return fail("You do not have this blueprint");
  if (s.progress.recipes.includes(bp.unlocks)) return fail("Recipe already known");
  removeItems(s, [{ id, qty: 1 }]);
  s.progress.recipes.push(bp.unlocks);
  return { ok: true, events: [{ type: "item_used", id, qty: 1 }, { type: "unlock", id: bp.unlocks }], recipe: bp.unlocks };
}

// ---------- forge crafting ----------

export function forgeStatus(s: GameState, c: ContentIndex, r: ForgeRecipe): { unlocked: boolean; reason?: string; affordable: boolean } {
  const u = recipeUnlocked(s, c, r.id, r.unlock);
  if (!u.ok) return { unlocked: false, reason: u.reason, affordable: false };
  if (s.resources.sect_fame < r.fame_required) return { unlocked: false, reason: `Requires ${r.fame_required.toLocaleString("en-US")} Fame`, affordable: false };
  return { unlocked: true, affordable: hasItems(s, r.ingredients) && s.resources.spirit_stones >= r.cost_stones };
}

export function craftGear(s: GameState, c: ContentIndex, recipeId: string): ActionResult<{ uid: number }> {
  const r = c.get<ForgeRecipe>(recipeId);
  const st = forgeStatus(s, c, r);
  if (!st.unlocked) return fail(st.reason ?? "Locked");
  const events: DomainEvent[] = [];
  const err = pay(s, { stones: r.cost_stones, items: r.ingredients }, events);
  if (err) return fail(err);
  const uid = grantGear(s, c, r.output);
  events.push({ type: "gear_gained", uid, base: r.output.base, rarity: r.output.rarity, ilvl: r.output.ilvl }, { type: "forge", recipe: r.id });
  return { ok: true, events, uid };
}

// ---------- alchemy ----------

export const furnaces = (c: ContentIndex): Furnace[] => c.singletons.furnaces.slice().sort((a, b) => a.grade - b.grade);
export const furnaceOf = (s: GameState, c: ContentIndex): Furnace => furnaces(c).find((f) => f.grade === s.progress.crafting.furnace) ?? furnaces(c)[0]!;

/** Proficiency above a recipe's minimum adds up to +10 % success (1 % per 50 points). */
export function alchemyChance(s: GameState, c: ContentIndex, r: AlchemyRecipe): number {
  const extra = Math.max(0, s.progress.crafting.proficiency - r.proficiency_min);
  return Math.min(0.98, r.success_base + furnaceOf(s, c).success_bonus + Math.min(0.1, extra / 5000));
}

export function alchemyStatus(s: GameState, c: ContentIndex, r: AlchemyRecipe): { unlocked: boolean; reason?: string; maxBatch: number } {
  const u = recipeUnlocked(s, c, r.id, r.unlock);
  if (!u.ok) return { unlocked: false, reason: u.reason, maxBatch: 0 };
  if (s.progress.crafting.furnace < r.furnace_min) return { unlocked: false, reason: `Needs a grade ${r.furnace_min} furnace`, maxBatch: 0 };
  if (s.progress.crafting.proficiency < r.proficiency_min) return { unlocked: false, reason: `Needs ${r.proficiency_min} alchemy proficiency`, maxBatch: 0 };
  let max = r.cost_stones > 0 ? Math.floor(s.resources.spirit_stones / r.cost_stones) : 99;
  for (const q of r.ingredients) max = Math.min(max, Math.floor(itemCount(s, q.id) / q.qty));
  return { unlocked: true, maxBatch: Math.max(0, Math.min(10, max)) };
}

export interface AlchemyRun { success: number; failed: number; made: number; returned: Qty[]; byproduct: number; proficiency: number }

/** Refine `batch` furnace loads. Each load rolls separately; failures return part of the herbs and may leave a byproduct. */
export function refinePills(s: GameState, c: ContentIndex, recipeId: string, batch: number): ActionResult<AlchemyRun> {
  const r = c.get<AlchemyRecipe>(recipeId);
  const st = alchemyStatus(s, c, r);
  if (!st.unlocked) return fail(st.reason ?? "Locked");
  const n = Math.max(1, Math.floor(batch));
  if (n > st.maxBatch) return fail(st.maxBatch ? `You can refine at most ${st.maxBatch}` : "Missing ingredients");
  const events: DomainEvent[] = [];
  const err = pay(s, { stones: r.cost_stones * n, items: r.ingredients.map((q) => ({ id: q.id, qty: q.qty * n })) }, events);
  if (err) return fail(err);
  const chance = alchemyChance(s, c, r);
  const yieldBonus = furnaceOf(s, c).yield_bonus;
  const run: AlchemyRun = { success: 0, failed: 0, made: 0, returned: [], byproduct: 0, proficiency: 0 };
  const back = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    if (nextFloat(s.rng) < chance) {
      run.success++;
      let q = nextInt(s.rng, r.output.qty[0], r.output.qty[1]);
      if (yieldBonus && nextFloat(s.rng) < yieldBonus) q++;
      run.made += q;
      run.proficiency += r.proficiency_xp;
    } else {
      run.failed++;
      run.proficiency += Math.ceil(r.proficiency_xp / 4);
      for (const q of r.ingredients) { const k = Math.floor(q.qty * r.failure.return_pct); if (k) back.set(q.id, (back.get(q.id) ?? 0) + k); }
      if (r.failure.byproduct) run.byproduct++;
    }
  }
  if (run.made) { addItem(s, c, r.output.id, run.made); events.push({ type: "item_gained", id: r.output.id, qty: run.made }); }
  for (const [id, qty] of back) { addItem(s, c, id, qty); run.returned.push({ id, qty }); events.push({ type: "item_gained", id, qty }); }
  if (run.byproduct && r.failure.byproduct) { addItem(s, c, r.failure.byproduct, run.byproduct); events.push({ type: "item_gained", id: r.failure.byproduct, qty: run.byproduct }); }
  s.progress.crafting.proficiency += run.proficiency;
  events.push({ type: "alchemy", recipe: r.id, success: run.success > 0, qty: run.made });
  return { ok: true, events, ...run };
}

export function upgradeFurnace(s: GameState, c: ContentIndex): ActionResult<{ grade: number }> {
  const cur = furnaceOf(s, c);
  const next = furnaces(c).find((f) => f.grade === cur.grade + 1);
  if (!next || !cur.upgrade) return fail("Your furnace is already the finest available");
  const events: DomainEvent[] = [];
  const err = pay(s, { stones: cur.upgrade.stones, items: cur.upgrade.materials }, events);
  if (err) return fail(err);
  s.progress.crafting.furnace = next.grade;
  events.push({ type: "unlock", id: `furnace:${next.grade}` });
  return { ok: true, events, grade: next.grade };
}

export { affinityLevel, checkUnlock };

/** Reading a manual consumes it and teaches its technique or method. */
export function readBook(s: GameState, c: ContentIndex, id: string): ActionResult<{ teaches: string }> {
  const b = c.get<any>(id);
  if (itemCount(s, id) < 1) return fail("You do not have this manual");
  const t: string = b.teaches;
  const known = t.startsWith("method.") ? s.character.methodMastery[t] !== undefined : s.techniques.known[t] !== undefined;
  if (known) return fail("You already know this");
  removeItems(s, [{ id, qty: 1 }]);
  if (t.startsWith("method.")) s.character.methodMastery[t] = 0; else s.techniques.known[t] = 0;
  return { ok: true, events: [{ type: "item_used", id, qty: 1 }, { type: "unlock", id: t }], teaches: t };
}
