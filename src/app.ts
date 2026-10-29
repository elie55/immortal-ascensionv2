/**
 * Composition root: content → save → game → loop → UI. The only file that touches timers and the clock.
 */
import { loadContent, type ContentIndex } from "./content/index.ts";
import { Game } from "./engine/game.ts";
import { newGameState } from "./engine/state.ts";
import { pickStorage } from "./save/storage.ts";
import { SaveManager, type Settings } from "./save/slots.ts";
import { Autosave } from "./save/autosave.ts";
import { Router, type Tab } from "./ui/core/router.ts";
import { h } from "./ui/core/dom.ts";
import { cultivateScreen } from "./ui/screens/cultivate.ts";
import { placeholderScreen, offlineModal } from "./ui/screens/shared.ts";

export class App {
  content!: ContentIndex;
  game!: Game;
  saves!: SaveManager;
  autosave!: Autosave;
  router!: Router;
  settings!: Settings;
  slot = 0;
  private lastMono = 0;
  private timer: number | undefined;

  /** Wall clock, injectable for tests/dev tools (window.__ia.clockOffset). */
  now(): number { return Date.now() + ((globalThis as any).__ia?.clockOffset ?? 0); }
  img(file?: string): string { return file ? `url("./${file}")` : "none"; }

  async boot(root: HTMLElement): Promise<void> {
    this.content = await loadContent();
    const storage = pickStorage();
    this.saves = new SaveManager(storage, this.content);
    this.settings = await this.saves.loadSettings();
    this.slot = this.settings.lastSlot ?? 0;
    const now = this.now();
    const loaded = await this.saves.load(this.slot);
    let state, report = null, notice: string | null = null;
    if (loaded.ok) {
      state = loaded.state;
      if (loaded.recoveredFromBackup) notice = "Your last save was damaged; the previous save was restored.";
    } else {
      if (!loaded.empty) notice = `Save slot ${this.slot + 1} could not be read (${loaded.reason}). A new journey was started; the damaged file is kept.`;
      state = newGameState(this.content, now);
    }
    this.game = new Game(this.content, state);
    this.autosave = new Autosave(this.game, this.saves, this.slot, this.content.rules.autosave_seconds * 1000);
    if (loaded.ok) report = this.game.offline(now);

    this.router = new Router(root, (tab) => this.tabScreen(tab));
    this.game.onChange(() => this.router.refresh());
    if (notice) this.router.toast(notice, "bad", 6000);
    if (report) this.router.openModal(offlineModal(this, report));
    this.router.refresh();
    this.startLoop();
    this.installLifecycle();
    (globalThis as any).__ia = Object.assign((globalThis as any).__ia ?? {}, { app: this, game: this.game, content: this.content });
  }

  private tabScreen(tab: Tab) {
    switch (tab) {
      case "cultivate": return { id: "cultivate", render: () => cultivateScreen(this) };
      case "adventure": return { id: "adventure", render: () => placeholderScreen(this, "Adventure", "Regions, nodes and dungeons arrive with the combat engine.") };
      case "character": return { id: "character", render: () => placeholderScreen(this, "Character", "Attributes, techniques and spirit beasts.") };
      case "inventory": return { id: "inventory", render: () => placeholderScreen(this, "Inventory", "Gear, materials, pills and gifts.") };
      case "sect": return { id: "sect", render: () => placeholderScreen(this, "Sect", "Azure Cloud Sect hub.") };
    }
  }

  private startLoop(): void {
    this.lastMono = performance.now();
    const step = () => {
      const mono = performance.now();
      const dt = Math.min(mono - this.lastMono, 60_000); // a throttled background tab never credits more than a minute per step
      this.lastMono = mono;
      const now = this.now();
      this.game.tick(dt, now);
      this.autosave.maybe(now);
    };
    this.timer = window.setInterval(step, this.content.rules.tick_seconds * 1000);
  }

  private installLifecycle(): void {
    const flush = () => { void this.autosave.flush(this.now()); };
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); else this.lastMono = performance.now(); });
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
  }

  async save(): Promise<void> { await this.autosave.flush(this.now()); this.router.toast(this.autosave.lastError ? `Save failed: ${this.autosave.lastError}` : "Saved", this.autosave.lastError ? "bad" : "good"); }
}

const app = new App();
app.boot(document.getElementById("app")!).catch((e) => {
  const root = document.getElementById("app")!;
  root.replaceChildren(h("div", { class: "panel", style: { margin: "auto" } }, h("h2", null, "Could not start"), h("p", { class: "muted" }, String(e?.message ?? e))));
  console.error(e);
});
