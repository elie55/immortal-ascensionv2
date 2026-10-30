/**
 * Navigation: five main tabs (each with its own stack of sub-screens), a global stack above the tabs for
 * fullscreen flows (main menu, save slots, story), plus modals, bottom sheets and toasts.
 * Screens are render functions; the shell re-renders the visible screen when the game changes.
 */
import { h, morph, Store, type Child } from "./dom.ts";
import { icon } from "./icons.ts";

export type Tab = "cultivate" | "adventure" | "character" | "inventory" | "sect";
export const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "cultivate", label: "Cultivate", icon: "lotus" }, { id: "adventure", label: "Adventure", icon: "brush" }, { id: "character", label: "Character", icon: "person" },
  { id: "inventory", label: "Inventory", icon: "pouch" }, { id: "sect", label: "Sect", icon: "temple" },
];

export interface Screen {
  id: string;
  render: () => Child;
  /** Background art file (assets/…); falls back to the shell default. */
  bg?: string | (() => string | undefined);
  /** Show the bottom nav (default: true for tab screens, false for global screens). */
  nav?: boolean;
  /** Called when the screen is removed from a stack. */
  onLeave?: () => void;
}
export interface Overlay { id: string; kind: "modal" | "sheet"; render: (close: () => void) => Child; dismissible?: boolean; cls?: string }

export interface UiState { tab: Tab; stacks: Record<Tab, Screen[]>; global: Screen[]; overlays: Overlay[]; toasts: { id: number; text: string; kind: "info" | "good" | "bad" }[] }

export class Router {
  readonly store: Store<UiState>;
  private root: HTMLElement;
  private toastId = 0;
  private tabRoot: (tab: Tab) => Screen;
  defaultBg: () => string | undefined = () => undefined;
  badges: (tab: Tab) => number = () => 0;
  img: (file?: string) => string = (f) => (f ? `url("./${f}")` : "none");
  private scrollKey = "";
  private scrollPos = new Map<string, number>();

  constructor(root: HTMLElement, tabRoot: (tab: Tab) => Screen, initial: Tab = "cultivate") {
    this.root = root; this.tabRoot = tabRoot;
    this.store = new Store<UiState>({ tab: initial, stacks: { cultivate: [], adventure: [], character: [], inventory: [], sect: [] }, global: [], overlays: [], toasts: [] });
    this.store.subscribe(() => this.render());
  }

  get tab(): Tab { return this.store.state.tab; }
  /** Switching tab also drops toasts still waiting: they belonged to the screen being left. */
  setTab(tab: Tab): void { if (tab !== this.tab) this.toastQueue = []; this.store.update((s) => { if (s.tab === tab) { s.stacks[tab].forEach((x) => x.onLeave?.()); s.stacks[tab] = []; } s.tab = tab; }); }
  push(screen: Screen): void { this.store.update((s) => s.stacks[s.tab].push(screen)); }
  pop(): void { this.store.update((s) => { s.stacks[s.tab].pop()?.onLeave?.(); }); }
  replace(screen: Screen): void { this.store.update((s) => { s.stacks[s.tab].pop()?.onLeave?.(); s.stacks[s.tab].push(screen); }); }
  pushGlobal(screen: Screen): void { this.store.update((s) => s.global.push(screen)); }
  popGlobal(): void { this.store.update((s) => { s.global.pop()?.onLeave?.(); }); }
  clearGlobal(): void { this.store.update((s) => { s.global.forEach((x) => x.onLeave?.()); s.global = []; }); }
  /** Back: closes the top overlay, else pops global, else pops the tab stack. Returns false when there was nothing to go back from. */
  back(): boolean {
    const s = this.store.state;
    if (s.overlays.length) { const o = s.overlays[s.overlays.length - 1]!; if (o.dismissible !== false) this.close(o.id); return true; }
    if (s.global.length > 1 || (s.global.length === 1 && s.global[0]!.id !== "menu")) { this.popGlobal(); return true; }
    if (s.stacks[s.tab].length) { this.pop(); return true; }
    if (s.tab !== "cultivate" && !s.global.length) { this.setTab("cultivate"); return true; }
    return false;
  }
  open(o: Overlay): void { this.store.update((s) => { s.overlays = s.overlays.filter((x) => x.id !== o.id); s.overlays.push(o); }); }
  close(id?: string): void { this.store.update((s) => { if (!id) s.overlays.pop(); else s.overlays = s.overlays.filter((m) => m.id !== id); }); }
  hasOverlay(id: string): boolean { return this.store.state.overlays.some((o) => o.id === id); }
  /** Toasts show two at a time at the top; the rest wait their turn (repeats are merged). A burst plays faster, so a
   *  string of rewards never covers the header for long; waiting toasts are dropped when the player changes tab. */
  toast(text: string, kind: "info" | "good" | "bad" = "info", ms = 2400): void {
    if (this.toastQueue.some((t) => t.text === text) || this.store.state.toasts.some((t) => t.text === text)) return;
    this.toastQueue.push({ text, kind, ms });
    this.pumpToasts();
  }
  private toastQueue: { text: string; kind: "info" | "good" | "bad"; ms: number }[] = [];
  /** Toasts wait while this says so (the battle screen: no toasts over a fight; they play when it ends). */
  holdToasts: () => boolean = () => false;
  private pumpToasts(): void {
    if (this.holdToasts()) return;
    while (this.store.state.toasts.length < 2 && this.toastQueue.length) {
      const t = this.toastQueue.shift()!;
      const id = ++this.toastId;
      const ms = this.toastQueue.length >= 2 ? Math.min(t.ms, 1500) : this.toastQueue.length ? Math.min(t.ms, 1900) : t.ms;
      this.store.update((s) => { s.toasts = [...s.toasts, { id, text: t.text, kind: t.kind }]; });
      setTimeout(() => { this.store.update((s) => { s.toasts = s.toasts.filter((x) => x.id !== id); }); this.pumpToasts(); }, ms);
    }
  }
  refresh(): void { this.render(); }

  current(): { screen: Screen; global: boolean } {
    const s = this.store.state;
    if (s.global.length) return { screen: s.global[s.global.length - 1]!, global: true };
    const st = s.stacks[s.tab];
    return { screen: st.length ? st[st.length - 1]! : this.tabRoot(s.tab), global: false };
  }

  private render(): void {
    const s = this.store.state;
    const { screen, global } = this.current();
    if (this.toastQueue.length && !this.holdToasts()) queueMicrotask(() => this.pumpToasts());   // held toasts play once the hold ends
    const showNav = screen.nav ?? !global;
    // keep scroll position across re-renders of the same screen
    const prevMain = this.root.querySelector<HTMLElement>("main.screen");
    if (prevMain) this.scrollPos.set(this.scrollKey, prevMain.scrollTop);
    const key = `${global ? "g" : s.tab}:${screen.id}`;
    const bgFile = (typeof screen.bg === "function" ? screen.bg() : screen.bg) ?? this.defaultBg();
    const main = h("main", { class: ["screen", !showNav && "fullscreen"], dataset: { screen: screen.id, key: `screen:${key}` } }, screen.render());
    const nav = showNav ? h("nav", { class: "nav glass", dataset: { key: "nav" } }, TABS.map((t) => {
      const n = this.badges(t.id);
      return h("button", { class: t.id === s.tab && "on", onClick: () => this.setTab(t.id), "aria-label": t.label }, icon(t.icon, 24), t.label, n > 0 && h("span", { class: "badge" }, String(n)));
    })) : null;
    const overlays = s.overlays.map((o, i) => {
      const top = i === s.overlays.length - 1;
      const close = () => this.close(o.id);
      if (o.kind === "sheet") return [h("div", { class: "sheet-backdrop", dataset: { key: `bd:${o.id}` }, onClick: () => { if (top && o.dismissible !== false) close(); } }), h("div", { class: ["sheet glass", o.cls], dataset: { key: `ov:${o.id}` } }, h("div", { class: "grab" }), o.render(close))];
      return h("div", { class: "modal-backdrop", dataset: { key: `ov:${o.id}` }, onClick: (e: MouseEvent) => { if (top && e.target === e.currentTarget && o.dismissible !== false) close(); } },
        h("div", { class: ["modal glass gold", o.cls] }, o.render(close)));
    });
    const toasts = h("div", { class: "toasts", dataset: { key: "toasts" } }, s.toasts.map((t) => h("div", { class: ["toast", t.kind], dataset: { key: `t${t.id}` } }, t.text)));
    const backdrop = h("div", { class: "backdrop", dataset: { key: "bg" } }, bgFile ? h("div", { class: "img", style: { backgroundImage: this.img(bgFile) } }) : null, h("div", { class: "veil" }));
    // Patch instead of replace: the same screen keeps its nodes (scroll, focus, running animations, taps in flight).
    morph(this.root, backdrop, main, nav, overlays, toasts);
    if (key !== this.scrollKey) { const live = this.root.querySelector<HTMLElement>("main.screen"); if (live) live.scrollTop = this.scrollPos.get(key) ?? 0; }
    this.scrollKey = key;
  }
}
