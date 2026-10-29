/**
 * NPC relationships: small talk, topics ("ask about…"), gifts with preferences and anti-spam rules.
 *
 * Gift value: an explicit loved/liked/disliked entry wins; otherwise loved tags ×3, liked tags ×2 of the
 * gift's base affinity, neutral ×1. Giving the same item again on the same day is multiplied by
 * repeat_decay per earlier gift. Each NPC accepts `daily_limit` gifts a day. Chat grants affinity once a day;
 * each topic grants affinity the first time it is asked.
 */
import type { ContentIndex, Npc } from "../content/index.ts";
import type { GameState } from "./state.ts";
import type { DomainEvent } from "./events.ts";
import type { ActionResult } from "./actions.ts";
import { removeItem, itemCount } from "./inventory.ts";
import { affinityLevel } from "./unlock.ts";
import { nextInt } from "./rng.ts";

export const CHAT_AFFINITY = 3;
export const TOPIC_AFFINITY = 5;
const fail = (reason: string) => ({ ok: false as const, reason });

export const relation = (s: GameState, npc: string) => (s.relations[npc] ??= { affinity: 0, giftsToday: 0, topics: [] });

/** Apply an affinity change and report a level change. */
export function changeAffinity(s: GameState, c: ContentIndex, npc: string, delta: number, events: DomainEvent[]): void {
  const rel = relation(s, npc);
  const before = affinityLevel(c, npc, rel.affinity).index;
  rel.affinity = Math.max(0, rel.affinity + delta);
  const after = affinityLevel(c, npc, rel.affinity);
  if (after.index > before) events.push({ type: "affinity_level", npc, level: after.index, name: after.name });
}

export type Preference = "loved" | "liked" | "neutral" | "disliked";

export function giftValue(s: GameState, c: ContentIndex, npcId: string, itemId: string): { value: number; pref: Preference } {
  const npc = c.get<Npc>(npcId);
  const g = npc.gifts;
  const item = c.get<any>(itemId);
  let value: number, pref: Preference;
  const loved = g.loved.find((x) => x.id === itemId), liked = g.liked.find((x) => x.id === itemId), dis = g.disliked.find((x) => x.id === itemId);
  if (loved) { value = loved.affinity; pref = "loved"; }
  else if (dis) { value = dis.affinity; pref = "disliked"; }
  else if (liked) { value = liked.affinity; pref = "liked"; }
  else {
    const base = item.base_affinity ?? 2;
    const tags: string[] = item.gift_tags ?? [];
    if (tags.some((t) => g.loved_tags.includes(t))) { value = base * 3; pref = "loved"; }
    else if (tags.some((t) => g.liked_tags.includes(t))) { value = base * 2; pref = "liked"; }
    else { value = base; pref = "neutral"; }
  }
  if (value > 0) {
    const repeats = s.daily.counters[`gift:${npcId}:${itemId}`] ?? 0;
    value = Math.max(1, Math.round(value * Math.pow(g.repeat_decay, repeats)));
  }
  return { value, pref };
}

/** Items in the bag that can be offered: gifts first, then anything an NPC has an explicit preference for. */
export function giftable(s: GameState, c: ContentIndex, npcId: string): string[] {
  const g = c.get<Npc>(npcId).gifts;
  const explicit = new Set([...g.loved, ...g.liked, ...g.disliked].map((x) => x.id));
  return Object.keys(s.inventory.stacks).filter((id) => itemCount(s, id) > 0 && (id.startsWith("gift.") || explicit.has(id)));
}

export function giftsLeft(s: GameState, c: ContentIndex, npcId: string): number {
  return Math.max(0, c.get<Npc>(npcId).gifts.daily_limit - (s.relations[npcId]?.giftsToday ?? 0));
}

export function giveGift(s: GameState, c: ContentIndex, npcId: string, itemId: string): ActionResult<{ delta: number; pref: Preference }> {
  if (giftsLeft(s, c, npcId) <= 0) return fail(`${c.get<Npc>(npcId).name} has had enough gifts for today`);
  if (itemCount(s, itemId) < 1) return fail("You do not have that item");
  const { value, pref } = giftValue(s, c, npcId, itemId);
  removeItem(s, itemId, 1);
  const rel = relation(s, npcId);
  rel.giftsToday++;
  rel.lastGiftDay = s.daily.day;
  s.daily.counters[`gift:${npcId}:${itemId}`] = (s.daily.counters[`gift:${npcId}:${itemId}`] ?? 0) + 1;
  const events: DomainEvent[] = [{ type: "item_used", id: itemId, qty: 1 }];
  changeAffinity(s, c, npcId, value, events);
  events.push({ type: "gift", npc: npcId, item: itemId, delta: value });
  return { ok: true, events, delta: value, pref };
}

export interface TopicRow { id: string; title: string; summary: string; answer: string; unlocked: boolean; heard: boolean; reason?: string }

export function topics(s: GameState, c: ContentIndex, npcId: string): TopicRow[] {
  const rel = s.relations[npcId];
  return c.get<Npc>(npcId).topics.map((t) => {
    const reasons: string[] = [];
    if (t.unlock.affinity && (rel?.affinity ?? 0) < t.unlock.affinity) reasons.push(`Affinity ${t.unlock.affinity}`);
    if (t.unlock.quest && !s.progress.quests.completed[t.unlock.quest]) reasons.push(`Complete “${c.get<any>(t.unlock.quest).name}”`);
    return { id: t.id, title: t.title, summary: t.summary, answer: t.answer, unlocked: reasons.length === 0, heard: !!rel?.topics.includes(t.id), reason: reasons.join(" · ") || undefined };
  });
}

export function askTopic(s: GameState, c: ContentIndex, npcId: string, topicId: string): ActionResult<{ answer: string; first: boolean }> {
  const t = topics(s, c, npcId).find((x) => x.id === topicId);
  if (!t) return fail("Unknown topic");
  if (!t.unlocked) return fail(t.reason ?? "Not yet");
  const rel = relation(s, npcId);
  const events: DomainEvent[] = [];
  const first = !rel.topics.includes(topicId);
  if (first) { rel.topics.push(topicId); changeAffinity(s, c, npcId, TOPIC_AFFINITY, events); }
  events.push({ type: "talk", npc: npcId, topic: topicId });
  return { ok: true, events, answer: t.answer, first };
}

/** Small talk: picks an unlocked line (preferring the highest level), +affinity once per day. */
export function chat(s: GameState, c: ContentIndex, npcId: string): ActionResult<{ line: string; gained: number }> {
  const npc = c.get<Npc>(npcId);
  const lvl = affinityLevel(c, npcId, s.relations[npcId]?.affinity ?? 0).index;
  const lines = npc.chat.filter((l) => l.min_level <= lvl);
  const top = lines.length ? Math.max(...lines.map((l) => l.min_level)) : 0;
  const pool = lines.filter((l) => l.min_level >= top - 1);
  const line = pool.length ? pool[nextInt(s.rng, 0, pool.length - 1)]!.text : npc.topics[0]?.summary ?? `${npc.name} nods at you.`;
  const key = `chat:${npcId}`;
  const events: DomainEvent[] = [];
  let gained = 0;
  if (!s.daily.counters[key]) { s.daily.counters[key] = 1; gained = CHAT_AFFINITY; changeAffinity(s, c, npcId, gained, events); }
  events.push({ type: "talk", npc: npcId, topic: "chat" });
  return { ok: true, events, line, gained };
}

/** NPCs who can be found at a sect location (or node). */
export const npcsAt = (c: ContentIndex, loc: string): Npc[] => c.byPrefix<Npc>("npc").filter((n) => n.location === loc && n.role !== "protagonist");
