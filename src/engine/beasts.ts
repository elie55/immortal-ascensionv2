/**
 * Spirit beasts: incubating eggs (they hatch from battles won, never from waiting), feeding, playing and
 * training, levels capped by the evolution stage, bond levels, evolution, the active companion.
 * Tunables live in cultivation_rules.beasts; per-beast data in content/beasts.
 *
 * Level cap: a beast cannot level past the next stage's `level_required` until it evolves (last stage:
 * rules.max_level). XP beyond the cap is kept up to the threshold of the capped level, so nothing is lost.
 * Bond: points; level L → L+1 costs bond_per_level·(L+1); max level from the beast's `bond.max`.
 */
import type { ContentIndex, Beast, Egg, BeastFood } from "../content/index.ts";
import type { GameState, BeastInstance } from "./state.ts";
import type { DomainEvent } from "./events.ts";
import type { ActionResult } from "./actions.ts";
import { addItem, removeItems, hasItems, itemCount } from "./inventory.ts";
import { realmAtLeast } from "./unlock.ts";
import { energyNow, spendEnergy } from "./cultivation.ts";

const fail = (reason: string) => ({ ok: false as const, reason });
const rules = (c: ContentIndex) => c.rules.beasts;
export const STAGE_ORDER = ["hatchling", "juvenile", "adult", "sovereign"] as const;

export const xpToNext = (c: ContentIndex, level: number) => Math.round(rules(c).xp_base * Math.pow(level, rules(c).xp_exp));

export function stageOf(c: ContentIndex, b: BeastInstance) {
  const def = c.get<Beast>(b.beast);
  const i = Math.max(0, def.stages.findIndex((x) => x.key === b.stage));
  return { def, stage: def.stages[i]!, index: i, next: def.stages[i + 1] };
}

/** Highest level reachable at the current stage. */
export function levelCap(c: ContentIndex, b: BeastInstance): number {
  const { next } = stageOf(c, b);
  return next ? next.level_required : rules(c).max_level;
}

export function bondInfo(c: ContentIndex, b: BeastInstance): { level: number; max: number; into: number; need: number } {
  const max = c.get<Beast>(b.beast).bond.max;
  let level = 0, left = b.bond;
  while (level < max && left >= rules(c).bond_per_level * (level + 1)) { left -= rules(c).bond_per_level * (level + 1); level++; }
  return { level, max, into: level >= max ? 0 : left, need: level >= max ? 0 : rules(c).bond_per_level * (level + 1) };
}
export const bondLevel = (c: ContentIndex, b: BeastInstance) => bondInfo(c, b).level;

export function addBeastXp(s: GameState, c: ContentIndex, uid: number, xp: number, events: DomainEvent[]): number {
  const b = s.beasts.owned[uid];
  if (!b || xp <= 0) return 0;
  const cap = levelCap(c, b);
  let gained = 0;
  b.xp += xp;
  while (b.level < cap && b.xp >= xpToNext(c, b.level)) { b.xp -= xpToNext(c, b.level); b.level++; gained++; }
  if (b.level >= cap) b.xp = Math.min(b.xp, xpToNext(c, b.level));   // banked up to one full level
  if (gained) events.push({ type: "beast_level", uid, level: b.level });
  return gained;
}

export function addBond(s: GameState, c: ContentIndex, uid: number, points: number, events: DomainEvent[]): void {
  const b = s.beasts.owned[uid];
  if (!b || points <= 0) return;
  const before = bondLevel(c, b);
  const info = bondInfo(c, b);
  if (info.level >= info.max) return;
  b.bond += points;
  const after = bondLevel(c, b);
  if (after > before) events.push({ type: "beast_bond", uid, level: after });
}

// ---------- eggs ----------

export function incubateCheck(s: GameState, c: ContentIndex, eggId: string): { ok: boolean; reason?: string } {
  const egg = c.get<Egg>(eggId);
  if (itemCount(s, eggId) < 1) return { ok: false, reason: "You do not have this egg" };
  if (s.beasts.incubating.length >= rules(c).incubators) return { ok: false, reason: "All incubators are in use" };
  if (egg.hatch_requirements.realm && !realmAtLeast(s, c, egg.hatch_requirements.realm, 1)) return { ok: false, reason: `Requires ${c.get<any>(egg.hatch_requirements.realm).name}` };
  if (egg.hatch_requirements.items && !hasItems(s, egg.hatch_requirements.items)) return { ok: false, reason: `Needs ${egg.hatch_requirements.items.map((q) => `${q.qty}× ${c.get<any>(q.id).name}`).join(", ")}` };
  return { ok: true };
}

export function incubate(s: GameState, c: ContentIndex, eggId: string, now: number): ActionResult {
  const chk = incubateCheck(s, c, eggId);
  if (!chk.ok) return fail(chk.reason!);
  const egg = c.get<Egg>(eggId);
  const used = [{ id: eggId, qty: 1 }, ...(egg.hatch_requirements.items ?? [])];
  removeItems(s, used);
  s.beasts.incubating.push({ egg: eggId, wins: 0, need: egg.hatch_wins, startedAt: now });
  return { ok: true, events: [...used.map((q) => ({ type: "item_used" as const, id: q.id, qty: q.qty })), { type: "egg_incubated", egg: eggId }] };
}

/** Called once per battle won: every incubating egg moves one step closer. */
export function warmEggs(s: GameState, n = 1): void {
  for (const inc of s.beasts.incubating) inc.wins = Math.min(inc.need, inc.wins + n);
}

export function hatch(s: GameState, c: ContentIndex, index: number, now: number): ActionResult<{ uid: number }> {
  const inc = s.beasts.incubating[index];
  if (!inc) return fail("Empty incubator");
  if (inc.wins < inc.need) return fail(`Needs ${inc.need - inc.wins} more victories`);
  const egg = c.get<Egg>(inc.egg);
  const def = c.get<Beast>(egg.hatches_into);
  const uid = s.beasts.nextUid++;
  s.beasts.owned[uid] = { uid, beast: def.id, name: def.name, stage: def.stages[0]!.key, level: 1, xp: 0, bond: 0, hatchedAt: now };
  s.beasts.incubating.splice(index, 1);
  if (s.beasts.active === null) s.beasts.active = uid;
  return { ok: true, events: [{ type: "beast_hatched", uid, beast: def.id }], uid };
}

// ---------- care ----------

export function foodXp(c: ContentIndex, b: BeastInstance, foodId: string): number {
  const f = c.get<BeastFood>(foodId);
  const def = c.get<Beast>(b.beast);
  const liked = def.food.includes(foodId) || f.preferred_elements.includes(def.element);
  return Math.round(f.xp * (liked ? rules(c).preferred_food_mult : 1));
}

export function feed(s: GameState, c: ContentIndex, uid: number, foodId: string, qty = 1): ActionResult<{ xp: number }> {
  const b = s.beasts.owned[uid];
  if (!b) return fail("No such beast");
  if (!foodId.startsWith("bfood.")) return fail("Beasts only eat beast food");
  const n = Math.max(1, Math.floor(qty));
  if (itemCount(s, foodId) < n) return fail("Not enough food");
  if (b.level >= levelCap(c, b) && b.xp >= xpToNext(c, b.level)) return fail(stageOf(c, b).next ? "Ready to evolve: it cannot grow further until it does" : "Already at its peak");
  removeItems(s, [{ id: foodId, qty: n }]);
  const events: DomainEvent[] = [{ type: "item_used", id: foodId, qty: n }];
  const xp = foodXp(c, b, foodId) * n;
  addBeastXp(s, c, uid, xp, events);
  addBond(s, c, uid, c.get<BeastFood>(foodId).bond * n, events);
  return { ok: true, events, xp };
}

export function playReadyAt(c: ContentIndex, b: BeastInstance): number { return (b.playedAt ?? 0) + rules(c).play.cooldown_min * 60_000; }

export function play(s: GameState, c: ContentIndex, uid: number, now: number): ActionResult<{ bond: number }> {
  const b = s.beasts.owned[uid];
  if (!b) return fail("No such beast");
  const ready = playReadyAt(c, b);
  if (now < ready) return fail(`${b.name} is resting: ${Math.ceil((ready - now) / 60_000)} min`);
  const info = bondInfo(c, b);
  if (info.level >= info.max) return fail("Your bond is already complete");
  b.playedAt = now;
  const events: DomainEvent[] = [];
  addBond(s, c, uid, rules(c).play.bond, events);
  return { ok: true, events, bond: rules(c).play.bond };
}

export const trainXp = (c: ContentIndex, b: BeastInstance) => Math.max(1, Math.round(xpToNext(c, b.level) * rules(c).train.xp_pct / 100));

export function train(s: GameState, c: ContentIndex, uid: number, now: number): ActionResult<{ xp: number }> {
  const b = s.beasts.owned[uid];
  if (!b) return fail("No such beast");
  if (b.level >= levelCap(c, b) && b.xp >= xpToNext(c, b.level)) return fail(stageOf(c, b).next ? "Ready to evolve first" : "Already at its peak");
  if (energyNow(s, c, now) < rules(c).train.energy) return fail(`Needs ${rules(c).train.energy} energy`);
  const sp = spendEnergy(s, c, now, rules(c).train.energy);
  if (!sp.ok) return fail(sp.reason);
  const events: DomainEvent[] = [{ type: "energy_spent", amount: rules(c).train.energy }];
  const xp = trainXp(c, b);
  addBeastXp(s, c, uid, xp, events);
  return { ok: true, events, xp };
}

// ---------- evolution ----------

export function evolveCheck(s: GameState, c: ContentIndex, b: BeastInstance): { ok: boolean; reason?: string; next?: Beast["stages"][number] } {
  const { next } = stageOf(c, b);
  if (!next) return { ok: false, reason: "Final form reached" };
  if (b.level < next.level_required) return { ok: false, reason: `Reach level ${next.level_required}`, next };
  if (s.resources.spirit_stones < next.evolve_cost_stones) return { ok: false, reason: "Not enough spirit stones", next };
  if (!hasItems(s, next.evolve_materials)) return { ok: false, reason: "Missing materials", next };
  return { ok: true, next };
}

export function evolve(s: GameState, c: ContentIndex, uid: number): ActionResult<{ stage: string }> {
  const b = s.beasts.owned[uid];
  if (!b) return fail("No such beast");
  const chk = evolveCheck(s, c, b);
  if (!chk.ok) return fail(chk.reason!);
  const next = chk.next!;
  s.resources.spirit_stones -= next.evolve_cost_stones;
  removeItems(s, next.evolve_materials);
  const events: DomainEvent[] = [];
  if (next.evolve_cost_stones) events.push({ type: "currency", currency: "spirit_stones", delta: -next.evolve_cost_stones });
  for (const q of next.evolve_materials) events.push({ type: "item_used", id: q.id, qty: q.qty });
  b.stage = next.key;
  // banked XP may now flow into new levels
  const extra = b.xp; b.xp = 0; addBeastXp(s, c, uid, extra, events);
  events.push({ type: "beast_evolved", uid, beast: b.beast, stage: next.key });
  return { ok: true, events, stage: next.key };
}

// ---------- management ----------

export function setActiveBeast(s: GameState, uid: number | null): ActionResult {
  if (uid !== null && !s.beasts.owned[uid]) return fail("No such beast");
  s.beasts.active = uid;
  return { ok: true, events: [] };
}

export function renameBeast(s: GameState, uid: number, name: string): ActionResult {
  const b = s.beasts.owned[uid];
  const n = name.trim().slice(0, 16);
  if (!b) return fail("No such beast");
  if (!n) return fail("Choose a name");
  b.name = n;
  return { ok: true, events: [] };
}

/** After a victory: eggs warm, the active beast gains a share of the battle's mastery XP and a little bond. */
export function beastsAfterVictory(s: GameState, c: ContentIndex, masteryXp: number, events: DomainEvent[]): void {
  warmEggs(s);
  const uid = s.beasts.active;
  if (uid === null || !s.beasts.owned[uid]) return;
  addBeastXp(s, c, uid, Math.max(5, Math.round(masteryXp * rules(c).battle_xp_share)), events);
  addBond(s, c, uid, rules(c).battle_bond, events);
}

/** Beasts the player has never owned are shown as silhouettes ("Not found yet"). */
export const beastsFound = (s: GameState) => new Set(Object.values(s.beasts.owned).map((b) => b.beast));

export { addItem };
