/**
 * Save slots: atomic write with backup, repair on load, slot summaries for the main menu, settings.
 *
 * Keys:  slot:<n>  slot:<n>:bak  slot:<n>:tmp  slots (summary index)  settings
 */
import type { StorageAdapter } from "./storage.ts";
import { encode, decode, type DecodeResult } from "./codec.ts";
import type { GameState } from "../engine/state.ts";
import type { ContentIndex } from "../content/index.ts";

export const SLOT_COUNT = 4;

export interface SlotSummary {
  slot: number; name: string; npc: string; realm: string; stage: number; rank: string;
  playtimeMs: number; savedAt: number; createdAt: number; regions: number; questsDone: number; sectFame: number;
}

export interface Settings {
  musicVolume: number; sfxVolume: number; battleSpeed: 1 | 2 | 3; autoBattle: boolean; damageNumbers: boolean;
  screenShake: boolean; animationQuality: "low" | "medium" | "high"; reducedMotion: boolean; textSize: "normal" | "large";
  language: "en"; lastSlot: number | null;
}
export const DEFAULT_SETTINGS: Settings = {
  musicVolume: 0.7, sfxVolume: 0.8, battleSpeed: 1, autoBattle: true, damageNumbers: true, screenShake: true,
  animationQuality: "high", reducedMotion: false, textSize: "normal", language: "en", lastSlot: null,
};

export type LoadResult =
  | { ok: true; state: GameState; savedAt: number; recoveredFromBackup: boolean; migratedFrom?: number }
  | { ok: false; empty: true }
  | { ok: false; empty: false; reason: string; backupReason?: string; raw?: string };

export class SaveManager {
  private readonly storage: StorageAdapter;
  readonly content: ContentIndex;
  constructor(storage: StorageAdapter, content: ContentIndex) { this.storage = storage; this.content = content; }

  summarize(state: GameState, slot: number, savedAt: number): SlotSummary {
    return {
      slot, name: state.character.name, npc: state.character.npc, realm: state.character.realm, stage: state.character.stage,
      rank: state.character.rank, playtimeMs: state.meta.playtimeMs, savedAt, createdAt: state.meta.createdAt,
      regions: Object.keys(state.progress.regions).length, questsDone: Object.keys(state.progress.quests.completed).length,
      sectFame: state.resources.sect_fame,
    };
  }

  /** Write a slot atomically: tmp → verify → rotate current to bak → publish. */
  async save(state: GameState, slot: number, now: number): Promise<void> {
    state.meta.lastSaveAt = now;
    const text = encode(state, slot, now);
    const check = decode(text);
    if (!check.ok) throw new Error(`refusing to save an invalid state: ${check.reason}`);
    await this.storage.set(`slot:${slot}:tmp`, text);
    const back = await this.storage.get(`slot:${slot}:tmp`);
    if (back !== text) throw new Error("storage readback mismatch");
    const current = await this.storage.get(`slot:${slot}`);
    if (current) await this.storage.set(`slot:${slot}:bak`, current);
    await this.storage.set(`slot:${slot}`, text);
    await this.storage.remove(`slot:${slot}:tmp`);
    await this.updateIndex(this.summarize(state, slot, now));
  }

  async load(slot: number): Promise<LoadResult> {
    const main = await this.storage.get(`slot:${slot}`);
    const bak = await this.storage.get(`slot:${slot}:bak`);
    if (!main && !bak) return { ok: false, empty: true };
    const tryText = (t: string | null): DecodeResult | null => (t ? decode(t) : null);
    const r1 = tryText(main);
    if (r1?.ok) return { ok: true, state: r1.state, savedAt: r1.savedAt, recoveredFromBackup: false, migratedFrom: r1.migratedFrom };
    const r2 = tryText(bak);
    if (r2?.ok) return { ok: true, state: r2.state, savedAt: r2.savedAt, recoveredFromBackup: true, migratedFrom: r2.migratedFrom };
    return { ok: false, empty: false, reason: r1 && !r1.ok ? r1.reason : "missing", backupReason: r2 && !r2.ok ? r2.reason : undefined, raw: main ?? bak ?? undefined };
  }

  /** Whether a slot has a readable backup copy (shown as "Backup OK"). */
  async hasBackup(slot: number): Promise<boolean> {
    const t = await this.storage.get(`slot:${slot}:bak`);
    return !!t && decode(t).ok;
  }

  async delete(slot: number): Promise<void> {
    for (const k of [`slot:${slot}`, `slot:${slot}:bak`, `slot:${slot}:tmp`]) await this.storage.remove(k);
    const idx = await this.index();
    delete idx[slot];
    await this.storage.set("slots", JSON.stringify(idx));
  }

  async copy(from: number, to: number): Promise<void> {
    const r = await this.load(from);
    if (!r.ok) throw new Error("source slot is empty or corrupted");
    await this.save(r.state, to, r.savedAt);
  }

  async index(): Promise<Record<number, SlotSummary>> {
    try { return JSON.parse((await this.storage.get("slots")) ?? "{}"); } catch { return {}; }
  }
  private async updateIndex(sum: SlotSummary): Promise<void> {
    const idx = await this.index();
    idx[sum.slot] = sum;
    await this.storage.set("slots", JSON.stringify(idx));
  }

  async loadSettings(): Promise<Settings> {
    try { return { ...DEFAULT_SETTINGS, ...JSON.parse((await this.storage.get("settings")) ?? "{}") }; } catch { return { ...DEFAULT_SETTINGS }; }
  }
  async saveSettings(s: Settings): Promise<void> { await this.storage.set("settings", JSON.stringify(s)); }

  /** Export a slot as text the player can keep (same format as storage). */
  async exportSlot(slot: number): Promise<string | null> { return this.storage.get(`slot:${slot}`); }
  async importSlot(slot: number, text: string, now: number): Promise<LoadResult> {
    const r = decode(text);
    if (!r.ok) return { ok: false, empty: false, reason: r.reason };
    await this.save(r.state, slot, now);
    return { ok: true, state: r.state, savedAt: r.savedAt, recoveredFromBackup: false, migratedFrom: r.migratedFrom };
  }
}
