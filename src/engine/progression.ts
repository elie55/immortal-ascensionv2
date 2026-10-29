/**
 * Quests, achievements, story triggers and rank promotion.
 *
 * Counting model: every countable action increments a global counter in state.progress.counters
 * (kills:<enemy>, clears:<node|dungeon>, gifts:<npc>, refines:<recipe>, …). A quest stores the counter's value
 * when it was accepted, so progress = current − baseline. Achievements read the same counters from zero.
 * State-like objectives (realm, items in bag, rank, explored nodes…) are evaluated live.
 */
import type { ContentIndex, Quest, Achievement, StoryScene, Rank } from "../content/index.ts";
import type { GameState } from "./state.ts";
import type { DomainEvent } from "./events.ts";
import type { ActionResult } from "./actions.ts";
import { grantRewards } from "./actions.ts";
import { checkUnlock, realmAtLeast, affinityLevel } from "./unlock.ts";
import { itemCount, removeItems, gearPlace } from "./inventory.ts";
import { applyUnlock } from "./story.ts";

type Objective = Quest["objectives"][number];
export interface ObjProgress { label: string; have: number; need: number; done: boolean }

const bump = (s: GameState, key: string, n = 1) => { s.progress.counters[key] = (s.progress.counters[key] ?? 0) + n; };
const counter = (s: GameState, key: string) => s.progress.counters[key] ?? 0;
const name = (c: ContentIndex, id: string) => c.find<any>(id)?.name ?? id;

/** Global counter backing an event-counted objective, or null for live-evaluated ones. */
export function counterKey(o: Objective): string | null {
  switch (o.type) {
    case "defeat": return `kills:${o.target}`;
    case "clear": return `clears:${o.target}`;
    case "win_duel": return `duels:${o.npc}`;
    case "refine": return `refines:${o.recipe}`;
    case "craft": return `crafts:${o.recipe}`;
    case "gift": return `gifts:${o.npc}`;
    case "talk": return `talk:${o.npc}${o.topic ? `:${o.topic}` : ""}`;
    case "visit": return `visits:${o.target}`;
    case "meditate": return "meditation_minutes";
    default: return null;
  }
}

export { affinityLevel };

/** Evaluate one objective. `baseline` is the counter value at acceptance (0 for achievements). */
export function evalObjective(s: GameState, c: ContentIndex, o: Objective, baseline = 0): ObjProgress {
  const key = counterKey(o);
  const counted = (need: number, label: string): ObjProgress => { const have = Math.max(0, counter(s, key!) - baseline); return { label, have: Math.min(have, need), need, done: have >= need }; };
  const flag = (ok: boolean, label: string): ObjProgress => ({ label, have: ok ? 1 : 0, need: 1, done: ok });
  switch (o.type) {
    case "defeat": return counted(o.count, `Defeat ${name(c, o.target)}`);
    case "clear": return counted(o.count, `Clear ${name(c, o.target)}`);
    case "win_duel": return counted(o.count, `Win a duel against ${name(c, o.npc)}`);
    case "refine": return counted(o.count, `Refine ${name(c, o.recipe)}`);
    case "craft": return counted(o.count, `Forge ${name(c, o.recipe)}`);
    case "gift": return counted(o.count, `Give gifts to ${name(c, o.npc)}`);
    case "talk": return counted(1, `Talk with ${name(c, o.npc)}`);
    case "visit": return counted(1, `Visit ${name(c, o.target)}`);
    case "meditate": return counted(o.minutes, `Cultivate for ${o.minutes} minutes`);
    case "collect": { const have = itemCount(s, o.item); return { label: `Collect ${name(c, o.item)}`, have: Math.min(have, o.count), need: o.count, done: have >= o.count }; }
    case "deliver": { const have = itemCount(s, o.item); return { label: `Bring ${name(c, o.item)} to ${name(c, o.to)}`, have: Math.min(have, o.count), need: o.count, done: have >= o.count }; }
    case "reach_realm": return flag(realmAtLeast(s, c, o.realm, o.stage), `Reach ${name(c, o.realm)}${o.stage > 1 ? ` ${o.stage}` : ""}`);
    case "learn": return flag(o.target.startsWith("method.") ? s.character.methodMastery[o.target] !== undefined : s.techniques.known[o.target] !== undefined, `Learn ${name(c, o.target)}`);
    case "enhance": {
      const uids = o.slot ? [s.equipped[o.slot]].filter((u): u is number => u !== undefined) : Object.keys(s.inventory.gear).map(Number).filter((u) => gearPlace(s, u) === "bag" || gearPlace(s, u) === "worn");
      const best = Math.max(0, ...uids.map((u) => s.inventory.gear[u]?.enhance ?? 0));
      return { label: `Enhance ${o.slot ? `your ${o.slot}` : "a piece of gear"} to +${o.level}`, have: Math.min(best, o.level), need: o.level, done: best >= o.level };
    }
    case "explore": { const n = Object.values(s.progress.regions[o.region]?.nodes ?? {}).filter((x) => x.clears > 0).length; return { label: `Explore ${name(c, o.region)}`, have: Math.min(n, o.nodes), need: o.nodes, done: n >= o.nodes }; }
    case "affinity": { const lv = affinityLevel(c, o.npc, s.relations[o.npc]?.affinity ?? 0); return { label: `Grow closer to ${name(c, o.npc)}`, have: Math.min(lv.index, o.level), need: o.level, done: lv.index >= o.level }; }
    case "rank": return flag(c.get<Rank>(s.character.rank).order >= c.get<Rank>(o.rank).order, `Become ${name(c, o.rank)}`);
    case "tournament": { const r = s.progress.trialsCleared[o.tournament] ? 99 : Math.max(s.progress.tournaments[o.tournament]?.round ?? 0, counter(s, `tournament_best:${o.tournament}`)); return { label: `${name(c, o.tournament)}: reach round ${o.round}`, have: Math.min(r, o.round), need: o.round, done: r >= o.round }; }
    case "tower_floor": { const f = s.progress.dungeons[o.dungeon]?.bestFloor ?? 0; return { label: `${name(c, o.dungeon)}: floor ${o.floor}`, have: Math.min(f, o.floor), need: o.floor, done: f >= o.floor }; }
    case "hatch": return flag(Object.values(s.beasts.owned).some((b) => b.beast === o.beast), `Hatch a ${name(c, o.beast)}`);
    case "evolve": { const order = ["hatchling", "juvenile", "adult", "sovereign"]; return flag(Object.values(s.beasts.owned).some((b) => b.beast === o.beast && order.indexOf(b.stage) >= order.indexOf(o.stage)), `Evolve ${name(c, o.beast)} to ${o.stage}`); }
    case "story": return flag(!!s.progress.storySeen[o.scene], `Story: ${name(c, o.scene)}`);
  }
}

// ---------- quests ----------

export type QuestStatus = "locked" | "available" | "active" | "ready" | "done" | "cooldown";

export function questStatus(s: GameState, c: ContentIndex, q: Quest, now: number): QuestStatus {
  const act = s.progress.quests.active[q.id];
  if (act) return questProgress(s, c, q).every((p) => p.done) ? "ready" : "active";
  const doneCount = s.progress.quests.completed[q.id] ?? 0;
  if (doneCount > 0) {
    if (!q.repeatable) return "done";
    const last = s.progress.quests.lastCompletedAt[q.id] ?? 0;
    if (now - last < q.repeatable.cooldown_min * 60_000) return "cooldown";
  }
  return checkUnlock(s, c, q.prereqs as any).ok ? "available" : "locked";
}

export function questProgress(s: GameState, c: ContentIndex, q: Quest): ObjProgress[] {
  const act = s.progress.quests.active[q.id];
  return q.objectives.map((o, i) => evalObjective(s, c, o, act?.counters[i] ?? 0));
}

export function acceptQuest(s: GameState, c: ContentIndex, id: string, now: number): ActionResult {
  const q = c.get<Quest>(id);
  const st = questStatus(s, c, q, now);
  if (st !== "available") return { ok: false, reason: st === "locked" ? (checkUnlock(s, c, q.prereqs as any).reasons[0] ?? "Locked") : st === "cooldown" ? "Not available again yet" : "Already taken" };
  s.progress.quests.active[id] = { startedAt: now, counters: q.objectives.map((o) => { const k = counterKey(o); return k ? counter(s, k) : 0; }) };
  if (!s.progress.quests.tracked && q.type === "main") s.progress.quests.tracked = id; // main quests pin themselves until the player picks another
  return { ok: true, events: [{ type: "quest_accepted", quest: id }] };
}

/** Turn in every ready quest from the Quest Log (no walk to the giver). Returns how many were handed in. */
export function turnInAll(s: GameState, c: ContentIndex, now: number): ActionResult<{ count: number }> {
  const events: DomainEvent[] = [];
  let count = 0;
  for (const id of Object.keys(s.progress.quests.active)) {
    const q = c.get<Quest>(id);
    if (questStatus(s, c, q, now) !== "ready") continue;
    const r = turnInQuest(s, c, id, now);
    if (r.ok) { count++; events.push(...r.events); }
  }
  return count ? { ok: true, events, count } : { ok: false, reason: "No quest is ready to turn in" };
}

export function abandonQuest(s: GameState, c: ContentIndex, id: string): ActionResult {
  const q = c.get<Quest>(id);
  if (!s.progress.quests.active[id]) return { ok: false, reason: "Not active" };
  if (q.type === "main") return { ok: false, reason: "Main quests cannot be abandoned" };
  delete s.progress.quests.active[id];
  return { ok: true, events: [] };
}

export function turnInQuest(s: GameState, c: ContentIndex, id: string, now: number): ActionResult {
  const q = c.get<Quest>(id);
  if (questStatus(s, c, q, now) !== "ready") return { ok: false, reason: "Objectives not complete" };
  const consume = q.objectives.flatMap((o) => (o.type === "deliver" || (o.type === "collect" && o.consume)) ? [{ id: o.item, qty: o.count }] : []);
  if (consume.length && !removeItems(s, consume)) return { ok: false, reason: "Items missing" };
  const events: DomainEvent[] = consume.map((x) => ({ type: "item_used", id: x.id, qty: x.qty }));
  delete s.progress.quests.active[id];
  if (s.progress.quests.tracked === id) s.progress.quests.tracked = null;
  s.progress.quests.completed[id] = (s.progress.quests.completed[id] ?? 0) + 1;
  s.progress.quests.lastCompletedAt[id] = now;
  bump(s, "quests_completed");
  grantRewards(s, c, q.rewards, events);
  events.push({ type: "quest_completed", quest: id });
  if (q.next) { const r = acceptQuest(s, c, q.next, now); if (r.ok) events.push(...r.events); }
  return { ok: true, events };
}

/** Quests offered by a giver (npc or sect location), excluding system quests. */
export function questsAt(s: GameState, c: ContentIndex, giver: string, now: number): { quest: Quest; status: QuestStatus }[] {
  return c.byPrefix<Quest>("quest").filter((q) => q.giver === giver || q.turn_in === giver).map((q) => ({ quest: q, status: questStatus(s, c, q, now) }))
    .filter((x) => x.status !== "locked" && !(x.status === "done" && !x.quest.repeatable));
}

// ---------- counters from events ----------

/** Update global counters from one domain event. Pure bookkeeping; called by the progression tracker. */
export function countEvent(s: GameState, e: DomainEvent): void {
  switch (e.type) {
    case "enemy_defeated": bump(s, `kills:${e.id}`); bump(s, "enemies_defeated"); if (e.boss) bump(s, "bosses_defeated"); break;
    case "node_cleared": bump(s, `clears:${e.node}`); if (e.first) bump(s, "nodes_cleared"); break;
    case "dungeon_cleared": bump(s, `clears:${e.dungeon}`); break;
    case "duel_won": bump(s, `duels:${e.npc}`); bump(s, "duels_won"); break;
    case "alchemy": if (e.success) { bump(s, `refines:${e.recipe}`, e.qty); bump(s, "pills_refined", e.qty); } break;
    case "forge": bump(s, `crafts:${e.recipe}`); bump(s, "gear_crafted"); break;
    case "gift": bump(s, `gifts:${e.npc}`); bump(s, "gifts_given"); break;
    case "talk": bump(s, `talk:${e.npc}`); bump(s, `talk:${e.npc}:${e.topic}`); break;
    case "visit": bump(s, `visits:${e.target}`); break;
    case "enhanced": if (e.success && e.level >= 15) bump(s, "gear_enhanced_15"); break;
    case "tournament_won": bump(s, "tournaments_won"); break;
    case "beast_evolved": bump(s, "beasts_evolved"); bump(s, `evolved:${e.beast}:${e.stage}`); break;
    case "beast_hatched": bump(s, `hatched:${e.beast}`); break;
    case "currency": if (e.currency === "spirit_stones" && e.delta > 0) bump(s, "spirit_stones_earned", e.delta); break;
    default: break;
  }
}

// ---------- achievements ----------

const METRIC: Record<string, (s: GameState, c: ContentIndex) => number> = {
  regions_cleared: (s, c) => Object.keys(s.progress.regions).filter((r) => { const nodes = c.nodesOf(r); return nodes.length > 0 && nodes.every((n) => s.progress.regions[r]!.nodes[n.id]?.clears); }).length,
  beasts_hatched: (s) => Object.keys(s.beasts.owned).length,
  hidden_found: (s) => Object.values(s.progress.regions).reduce((n, r) => n + Object.values(r.nodes).filter((x) => x.revealed).length, 0),
  tower_floor: (s) => Math.max(0, ...Object.values(s.progress.dungeons).map((d) => d.bestFloor ?? 0)),
};
export function achievementProgress(s: GameState, c: ContentIndex, a: Achievement): ObjProgress {
  const cond = a.condition;
  if (cond.type === "counter") { const have = METRIC[cond.metric]?.(s, c) ?? counter(s, cond.metric); return { label: a.name, have: Math.min(have, cond.target), need: cond.target, done: have >= cond.target }; }
  return evalObjective(s, c, cond.objective, 0);
}

// ---------- story triggers & ranks ----------

function storyTriggered(s: GameState, c: ContentIndex, sc: StoryScene): boolean {
  const t = sc.trigger;
  switch (t.on) {
    case "realm_reached": return realmAtLeast(s, c, t.realm, t.stage ?? 1);
    case "quest_complete": return !!s.progress.quests.completed[t.quest];
    case "quest_accept": return !!s.progress.quests.active[t.quest] || !!s.progress.quests.completed[t.quest];
    case "region_enter": return counter(s, `visits:${t.region}`) > 0;
    case "affinity": return affinityLevel(c, t.npc, s.relations[t.npc]?.affinity ?? 0).index >= t.level;
    default: return false;
  }
}

export function nextRank(s: GameState, c: ContentIndex): { rank: Rank; ready: boolean; reasons: string[] } | null {
  const cur = c.get<Rank>(s.character.rank);
  const next = c.byPrefix<Rank>("rank").find((r) => r.order === cur.order + 1);
  if (!next) return null;
  const reasons: string[] = [];
  if (s.resources.sect_fame < next.fame_required) reasons.push(`${next.fame_required.toLocaleString("en-US")} Sect Fame`);
  for (const q of next.promotion.quests ?? []) if (!s.progress.quests.completed[q]) reasons.push(`Complete “${name(c, q)}”`);
  const trial = next.promotion.trial;
  if (trial && !s.progress.trialsCleared[trial]) reasons.push(`${trial.startsWith("tournament.") ? "Win" : "Clear"} ${name(c, trial)}`);
  return { rank: next, ready: reasons.length === 0, reasons };
}

export function promote(s: GameState, c: ContentIndex, out: DomainEvent[]): boolean {
  const n = nextRank(s, c);
  if (!n?.ready) return false;
  s.character.rank = n.rank.id;
  grantRewards(s, c, n.rank.benefits.rewards as any, out);
  for (const u of n.rank.benefits.unlocks) applyUnlock(s, c, u, out);
  out.push({ type: "rank_up", rank: n.rank.id });
  return true;
}

// ---------- the sweep (runs after every batch of events) ----------

export interface SweepResult { events: DomainEvent[]; stories: string[] }

/**
 * Re-evaluate everything that depends on state: auto-accept system quests, auto-turn-in "auto" quests,
 * announce ready quests, unlock achievements, promote ranks, and collect story scenes whose trigger is met.
 * `announced` is session memory so "quest ready" is only announced once.
 */
export function sweep(s: GameState, c: ContentIndex, now: number, announced: Set<string>, queued: Set<string>): SweepResult {
  const events: DomainEvent[] = [];
  for (const q of c.byPrefix<Quest>("quest")) {
    const st = questStatus(s, c, q, now);
    if (st === "available" && q.giver === "system" && !q.repeatable) { const r = acceptQuest(s, c, q.id, now); if (r.ok) events.push(...r.events); }
    else if (st === "ready") {
      if (q.turn_in === "auto") { const r = turnInQuest(s, c, q.id, now); if (r.ok) events.push(...r.events); }
      else if (!announced.has(q.id)) { announced.add(q.id); events.push({ type: "quest_ready", quest: q.id }); }
    }
  }
  for (const a of c.byPrefix<Achievement>("ach")) {
    if (s.progress.achievements[a.id]) continue;
    if (achievementProgress(s, c, a).done) { s.progress.achievements[a.id] = now; grantRewards(s, c, a.rewards, events); events.push({ type: "achievement", id: a.id }); }
  }
  while (promote(s, c, events)) { /* multiple ranks in a row are possible after a long absence */ }
  // Places gated by Sect Fame or realm (sect locations, secret realms) announce themselves once when they open.
  for (const p of [...c.byPrefix<any>("sectloc"), ...c.byPrefix<any>("dungeon").filter((d) => d.kind === "secret_realm")]) {
    const u = p.unlock ?? p.entry;
    if (!u || (!u.sect_fame && !u.realm && !u.rank)) continue;
    const key = `opened:${p.id}`;
    if (s.progress.unlocks.includes(key)) continue;
    if (checkUnlock(s, c, u).ok) { s.progress.unlocks.push(key); events.push({ type: "place_opened", id: p.id, by: u.sect_fame ? "fame" : u.rank ? "rank" : "realm" }); }
  }
  const stories: string[] = [];
  for (const sc of c.byPrefix<StoryScene>("story")) {
    if (s.progress.storySeen[sc.id] || queued.has(sc.id) || sc.trigger.on === "new_game" || sc.trigger.on === "chained") continue;
    if (storyTriggered(s, c, sc)) { queued.add(sc.id); stories.push(sc.id); }
  }
  return { events, stories };
}

/** Record that the player opened a place (sect location, region, node): drives visit objectives and region_enter scenes. */
export function visit(s: GameState, target: string): ActionResult {
  return { ok: true, events: [{ type: "visit", target }] };
}
