/**
 * Game: owns one GameState, runs ticks, dispatches actions, fans out domain events to trackers and the UI.
 * No DOM and no timers here; app.ts drives it with a clock.
 */
import type { ContentIndex } from "../content/index.ts";
import type { GameState } from "./state.ts";
import type { DomainEvent } from "./events.ts";
import { tick as tickCultivation, applyOffline, type OfflineReport, energyNow } from "./cultivation.ts";
import { dayKey } from "./state.ts";
import type { ActionResult } from "./actions.ts";

export type Listener = (events: DomainEvent[], reason: string) => void;
export type Tracker = (state: GameState, content: ContentIndex, e: DomainEvent, now: number) => DomainEvent[] | void;

export class Game {
  private listeners = new Set<Listener>();
  private trackers: Tracker[] = [];
  /** Set by actions flagged important; the autosave policy reads and clears it. */
  dirtyImportant = false;
  dirty = false;

  readonly content: ContentIndex;
  state: GameState;
  constructor(content: ContentIndex, state: GameState) { this.content = content; this.state = state; }

  onChange(l: Listener): () => void { this.listeners.add(l); return () => this.listeners.delete(l); }
  addTracker(t: Tracker): void { this.trackers.push(t); }

  /** Live tick: dtMs from a monotonic clock, now from the wall clock. */
  tick(dtMs: number, now: number): void {
    this.rollDay(now);
    energyNow(this.state, this.content, now);
    const events = tickCultivation(this.state, this.content, dtMs, now);
    this.dirty = true;
    this.emit(events, "tick", now);
  }

  /** Credit time away; returns the report for the offline screen (null = nothing to show). */
  offline(now: number): OfflineReport | null {
    this.rollDay(now);
    const report = applyOffline(this.state, this.content, now);
    if (report) {
      this.dirtyImportant = true;
      this.emit([{ type: "offline", elapsedMs: report.elapsedMs, creditedMs: report.creditedMs, qi: report.qiGained, clockMovedBack: report.clockMovedBack }], "offline", now);
    }
    return report;
  }

  /** Run an action and publish its events. `important` requests an autosave. */
  run<R extends ActionResult<any>>(label: string, now: number, fn: (state: GameState, content: ContentIndex) => R, important = true): R {
    const r = fn(this.state, this.content) as ActionResult<any>;
    if (r.ok) {
      this.dirty = true;
      if (important) this.dirtyImportant = true;
      this.emit(r.events, label, now);
    }
    return r as R;
  }

  private rollDay(now: number): void {
    const day = dayKey(now);
    if (this.state.daily.day !== day) {
      this.state.daily = { day, counters: {} };
      for (const rel of Object.values(this.state.relations)) rel.giftsToday = 0;
    }
  }

  private emit(events: DomainEvent[], reason: string, now: number): void {
    // Trackers may produce follow-up events (quest completed → rewards → item_gained …); process breadth-first, bounded.
    const queue = [...events];
    const all: DomainEvent[] = [];
    let guard = 0;
    while (queue.length && guard++ < 1000) {
      const e = queue.shift()!;
      all.push(e);
      for (const t of this.trackers) {
        const more = t(this.state, this.content, e, now);
        if (more?.length) queue.push(...more);
      }
    }
    for (const l of this.listeners) l(all, reason);
  }
}
