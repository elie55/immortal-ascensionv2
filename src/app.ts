/**
 * Composition root: content → settings → main menu → (new journey → prologue | continue → offline report) → game.
 * The only file that touches timers, the clock and the DOM lifecycle.
 */
import { loadContent, type ContentIndex } from "./content/index.ts";
import { Game } from "./engine/game.ts";
import { newGameState, type GameState } from "./engine/state.ts";
import { firstScene } from "./engine/story.ts";
import { pickStorage } from "./save/storage.ts";
import { SaveManager, SLOT_COUNT, type Settings, type SlotSummary } from "./save/slots.ts";
import { Autosave } from "./save/autosave.ts";
import { Router, type Tab, type Screen } from "./ui/core/router.ts";
import { h } from "./ui/core/dom.ts";
import { mainMenuScreen } from "./ui/screens/menu.ts";
import { storyScreen } from "./ui/screens/story.ts";
import { cultivateScreen } from "./ui/screens/cultivate.ts";
import { characterScreen } from "./ui/screens/character.ts";
import { inventoryScreen } from "./ui/screens/inventory.ts";
import { sectScreen } from "./ui/screens/sect.ts";
import { adventureScreen } from "./ui/screens/adventure.ts";
import { offlineModal } from "./ui/screens/offline.ts";

export const VERSION = "0.2.0";

export class App {
  content!: ContentIndex;
  game!: Game;
  saves!: SaveManager;
  autosave: Autosave | null = null;
  router!: Router;
  settings!: Settings;
  slot = 0;
  slots: Record<number, SlotSummary> = {};
  backups: Record<number, boolean> = {};
  private lastMono = 0;
  private timer: number | undefined;

  /** Wall clock (window.__ia.clockOffset lets tests simulate time away). */
  now(): number { return Date.now() + ((globalThis as any).__ia?.clockOffset ?? 0); }
  img(file?: string): string { return file ? `url("./${file}")` : "none"; }
  ui(id: string, key: string): string | undefined { return this.content.art(id, key); }
  get inGame(): boolean { return !!this.game && !!this.autosave; }

  async boot(root: HTMLElement): Promise<void> {
    this.content = await loadContent();
    this.saves = new SaveManager(pickStorage(), this.content);
    this.settings = await this.saves.loadSettings();
    this.applySettings();
    this.router = new Router(root, (tab) => this.tabScreen(tab));
    this.router.img = (f) => this.img(f);
    this.router.defaultBg = () => this.ui("ui.backdrop", "sky");
    await this.refreshSlots();
    this.router.pushGlobal(mainMenuScreen(this));
    this.installLifecycle();
    (globalThis as any).__ia = Object.assign((globalThis as any).__ia ?? {}, { app: this, content: this.content });
  }

  async refreshSlots(): Promise<void> {
    this.slots = await this.saves.index();
    for (let i = 0; i < SLOT_COUNT; i++) this.backups[i] = this.slots[i] ? await this.saves.hasBackup(i) : false;
  }

  applySettings(): void {
    const root = document.documentElement;
    root.classList.toggle("text-large", this.settings.textSize === "large");
    root.classList.toggle("reduce-motion", this.settings.reducedMotion);
  }
  async setSettings(patch: Partial<Settings>): Promise<void> {
    Object.assign(this.settings, patch);
    this.applySettings();
    await this.saves.saveSettings(this.settings);
    this.router.refresh();
  }

  // ---------- journeys ----------

  /** Start a fresh journey in a slot and play the prologue. */
  async newJourney(slot: number): Promise<void> {
    const now = this.now();
    this.attach(newGameState(this.content, now), slot);
    await this.autosave!.flush(now);
    await this.setSettings({ lastSlot: slot });
    await this.refreshSlots();
    const first = firstScene(this.content);
    this.router.clearGlobal();
    if (first) this.playStory(first.id, () => this.enterGame());
    else this.enterGame();
  }

  /** Load a slot; reports damaged files instead of throwing. Returns false when it could not be loaded. */
  async continueSlot(slot: number): Promise<boolean> {
    const loaded = await this.saves.load(slot);
    if (!loaded.ok) {
      this.router.toast(loaded.empty ? "That slot is empty" : `Slot ${slot + 1} could not be read: ${loaded.reason}`, "bad", 5000);
      return false;
    }
    const now = this.now();
    this.attach(loaded.state, slot);
    const report = this.game.offline(now);
    await this.setSettings({ lastSlot: slot });
    this.router.clearGlobal();
    this.enterGame();
    if (loaded.recoveredFromBackup) this.router.toast("Your last save was damaged; the backup was restored.", "bad", 5000);
    if (report) this.router.open(offlineModal(this, report));
    return true;
  }

  private attach(state: GameState, slot: number): void {
    this.stopLoop();
    this.slot = slot;
    this.game = new Game(this.content, state);
    this.autosave = new Autosave(this.game, this.saves, slot, this.content.rules.autosave_seconds * 1000);
    this.game.onChange(() => this.router.refresh());
    (globalThis as any).__ia.game = this.game;
  }

  private enterGame(tab: Tab = "cultivate"): void {
    this.router.store.update((s) => { s.tab = tab; s.stacks = { cultivate: [], adventure: [], character: [], inventory: [], sect: [] }; });
    this.startLoop();
  }

  /** Return to the main menu (saves first). */
  async toMenu(): Promise<void> {
    if (this.autosave) await this.autosave.flush(this.now());
    await this.refreshSlots();
    this.router.store.update((s) => { s.overlays = []; s.toasts = []; });
    this.router.clearGlobal();
    this.router.pushGlobal(mainMenuScreen(this));
  }

  /** Play a chain of story scenes as a global fullscreen screen, then run `done`. */
  playStory(sceneId: string, done: () => void): void {
    this.router.pushGlobal(storyScreen(this, sceneId, () => { this.router.popGlobal(); done(); }));
  }

  async save(manual = true): Promise<void> {
    if (!this.autosave) return;
    await this.autosave.flush(this.now());
    await this.refreshSlots();
    if (manual) this.router.toast(this.autosave.lastError ? `Save failed: ${this.autosave.lastError}` : "Saved", this.autosave.lastError ? "bad" : "good");
  }

  private tabScreen(tab: Tab): Screen {
    switch (tab) {
      case "cultivate": return { id: "cultivate", render: () => cultivateScreen(this), bg: () => this.ui("ui.cultivate", "meditation") };
      case "adventure": return { id: "adventure", render: () => adventureScreen(this) };
      case "character": return { id: "character", render: () => characterScreen(this) };
      case "inventory": return { id: "inventory", render: () => inventoryScreen(this) };
      case "sect": return { id: "sect", render: () => sectScreen(this), bg: () => this.ui("ui.sect_map", "map") };
    }
  }

  // ---------- loop & lifecycle ----------

  private startLoop(): void {
    this.stopLoop();
    this.lastMono = performance.now();
    const step = () => {
      const mono = performance.now();
      const dt = Math.min(mono - this.lastMono, 60_000); // a throttled background tab never credits more than a minute per step
      this.lastMono = mono;
      const now = this.now();
      this.game.tick(dt, now);
      this.autosave?.maybe(now);
    };
    this.timer = window.setInterval(step, this.content.rules.tick_seconds * 1000);
  }
  private stopLoop(): void { if (this.timer !== undefined) { clearInterval(this.timer); this.timer = undefined; } }

  private installLifecycle(): void {
    const flush = () => { if (this.autosave) void this.autosave.flush(this.now()); };
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); else this.lastMono = performance.now(); });
    window.addEventListener("pagehide", flush);
    // Android back button (Capacitor) and browser history both route through Router.back()
    document.addEventListener("backbutton", () => { this.router.back(); });
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") this.router.back(); });
  }
}

const app = new App();
app.boot(document.getElementById("app")!).catch((e) => {
  const root = document.getElementById("app")!;
  root.replaceChildren(h("div", { class: "glass panel", style: { margin: "40% 16px" } }, h("h3", { class: "title" }, "Could not start"), h("p", { class: "muted" }, String(e?.message ?? e))));
  console.error(e);
});
