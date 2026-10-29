/**
 * Autosave policy: every `intervalMs` of play, immediately after important actions, and on demand
 * (app going to background). Serialises writes so two saves never interleave.
 */
import type { Game } from "../engine/game.ts";
import type { SaveManager } from "./slots.ts";

export class Autosave {
  private lastSaveAt = 0;
  private inFlight: Promise<void> | null = null;
  private pending = false;
  lastError: string | null = null;

  private readonly game: Game; private readonly saves: SaveManager; slot: number; private readonly intervalMs: number;
  constructor(game: Game, saves: SaveManager, slot: number, intervalMs: number) { this.game = game; this.saves = saves; this.slot = slot; this.intervalMs = intervalMs; }

  /** Call from the game loop after each tick. */
  maybe(now: number): void {
    if (this.game.dirtyImportant || (this.game.dirty && now - this.lastSaveAt >= this.intervalMs)) void this.flush(now);
  }

  /** Force a save now (manual save, pause, before unload). Resolves when written. */
  flush(now: number): Promise<void> {
    if (this.inFlight) { this.pending = true; return this.inFlight; }
    this.game.dirty = false; this.game.dirtyImportant = false;
    this.inFlight = this.saves.save(this.game.state, this.slot, now)
      .then(() => { this.lastSaveAt = now; this.lastError = null; })
      .catch((e) => { this.lastError = (e as Error).message; this.game.dirty = true; })
      .finally(() => {
        this.inFlight = null;
        if (this.pending) { this.pending = false; void this.flush(now); }
      });
    return this.inFlight;
  }
}
