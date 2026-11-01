/**
 * Today's board: five things a session is made of, counted from the daily counters, and one reward when four of them
 * are done (Contribution for the Exchange, refining stones, stones scaled to the player's furthest region). The
 * counters reset with the day (game.ts rollDay); the systems bump them: turn-ins (progression.ts), won node fights
 * and tournament rounds (encounter.ts), gathers (nodes.ts), dungeon clears (their own `dungeon:*` counters).
 */
import type { ContentIndex } from "../content/index.ts";
import type { GameState } from "./state.ts";
import type { DomainEvent } from "./events.ts";
import type { ActionResult } from "./actions.ts";
import { grantRewards } from "./actions.ts";

export interface DailyTask { id: string; label: string; have: number; need: number; done: boolean; go: "missions" | "adventure" | "dungeons" | "tournament" | "gather"; icon: string }

export const DAILY_NEED = 4;

export const bumpDaily = (s: GameState, key: string, n = 1) => { s.daily.counters[`d:${key}`] = (s.daily.counters[`d:${key}`] ?? 0) + n; };
const count = (s: GameState, key: string) => s.daily.counters[`d:${key}`] ?? 0;

export function dailyTasks(s: GameState, c: ContentIndex): DailyTask[] {
  const dungeons = Object.entries(s.daily.counters).filter(([k, v]) => k.startsWith("dungeon:") && v > 0).length;
  const t = (id: string, label: string, have: number, need: number, go: DailyTask["go"], icon: string): DailyTask => ({ id, label, have: Math.min(have, need), need, done: have >= need, go, icon });
  return [
    t("missions", "Turn in Mission Hall requests", count(s, "missions"), 2, "missions", "scroll"),
    t("fights", "Win battles on the map", count(s, "fights"), 8, "adventure", "sword"),
    t("dungeon", "Clear a dungeon", dungeons, 1, "dungeons", "temple"),
    t("tournament", "Fight a tournament round", count(s, "tournament"), 1, "tournament", "fame"),
    t("gather", "Gather at three places", count(s, "gathers"), 3, "gather", "lotus"),
  ].filter(() => c !== undefined);
}

/** The reward grows with the furthest region opened: stones and Contribution, a few refining stones always. */
export function dailyReward(s: GameState, c: ContentIndex): { spirit_stones: number; contribution: number; items: { id: string; qty: number }[] } {
  const n = Math.max(1, ...c.byPrefix<any>("region").filter((r) => s.progress.regions[r.id]).map((r) => r.order));
  return { spirit_stones: 150 * n * n, contribution: 20 + 5 * n, items: [{ id: "mat.refining_stone", qty: 3 }] };
}

export const dailyClaimed = (s: GameState) => count(s, "claimed") > 0;
export const dailyDone = (s: GameState, c: ContentIndex) => dailyTasks(s, c).filter((t) => t.done).length;

export function claimDaily(s: GameState, c: ContentIndex): ActionResult {
  if (dailyClaimed(s)) return { ok: false, reason: "Already claimed today" };
  const done = dailyDone(s, c);
  if (done < DAILY_NEED) return { ok: false, reason: `Finish ${DAILY_NEED - done} more of today's tasks` };
  const events: DomainEvent[] = [];
  grantRewards(s, c, dailyReward(s, c) as any, events);
  bumpDaily(s, "claimed");
  events.push({ type: "daily_claimed" });
  return { ok: true, events };
}
