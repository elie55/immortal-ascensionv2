/**
 * Screen router: five main tabs, a stack of sub-screens inside the active tab, and a modal stack above
 * everything. Screens are render functions; the shell re-renders the top screen on game change.
 */
import { h, replaceChildren, Store, type Child } from "./dom.ts";

export type Tab = "cultivate" | "adventure" | "character" | "inventory" | "sect";
export const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "cultivate", label: "Cultivate", icon: "☯" }, { id: "adventure", label: "Adventure", icon: "⚔" }, { id: "character", label: "Character", icon: "👤" },
  { id: "inventory", label: "Inventory", icon: "🎒" }, { id: "sect", label: "Sect", icon: "⛩" },
];

export interface Screen { id: string; render: () => Child; title?: string; /** hide the bottom nav (battle, story) */ fullscreen?: boolean }
export interface Modal { id: string; render: (close: () => void) => Child; dismissible?: boolean }

export interface UiState { tab: Tab; stacks: Record<Tab, Screen[]>; modals: Modal[]; toasts: { id: number; text: string; kind: "info" | "good" | "bad" }[] }

export class Router {
  readonly store: Store<UiState>;
  private root: HTMLElement;
  private toastId = 0;
  private renderTab: (tab: Tab) => Screen;

  constructor(root: HTMLElement, renderTab: (tab: Tab) => Screen, initial: Tab = "cultivate") {
    this.root = root; this.renderTab = renderTab;
    this.store = new Store<UiState>({ tab: initial, stacks: { cultivate: [], adventure: [], character: [], inventory: [], sect: [] }, modals: [], toasts: [] });
    this.store.subscribe(() => this.render());
  }

  get tab(): Tab { return this.store.state.tab; }
  setTab(tab: Tab): void { this.store.set({ tab }); }
  push(screen: Screen): void { this.store.update((s) => s.stacks[s.tab].push(screen)); }
  pop(): void { this.store.update((s) => { s.stacks[s.tab].pop(); }); }
  popTo(id: string): void { this.store.update((s) => { const st = s.stacks[s.tab]; const i = st.findIndex((x) => x.id === id); if (i >= 0) st.length = i + 1; }); }
  resetTab(tab: Tab): void { this.store.update((s) => { s.stacks[tab] = []; s.tab = tab; }); }
  openModal(m: Modal): void { this.store.update((s) => s.modals.push(m)); }
  closeModal(id?: string): void { this.store.update((s) => { if (!id) s.modals.pop(); else s.modals = s.modals.filter((m) => m.id !== id); }); }
  toast(text: string, kind: "info" | "good" | "bad" = "info", ms = 2200): void {
    const id = ++this.toastId;
    this.store.update((s) => s.toasts.push({ id, text, kind }));
    setTimeout(() => this.store.update((s) => { s.toasts = s.toasts.filter((t) => t.id !== id); }), ms);
  }
  /** Re-render without changing navigation (game state changed). */
  refresh(): void { this.render(); }

  private top(): Screen {
    const s = this.store.state;
    const st = s.stacks[s.tab];
    return st.length ? st[st.length - 1]! : this.renderTab(s.tab);
  }

  private render(): void {
    const s = this.store.state;
    const screen = this.top();
    const nav = screen.fullscreen ? null : h("nav", { class: "tabbar" }, TABS.map((t) =>
      h("button", { class: ["tab", t.id === s.tab && "active"], onClick: () => this.resetTab(t.id), "aria-label": t.label },
        h("span", { class: "tab-icon" }, t.icon), h("span", { class: "tab-label" }, t.label))));
    const modals = s.modals.map((m, i) => h("div", { class: "modal-backdrop", onClick: (e: MouseEvent) => { if (e.target === e.currentTarget && m.dismissible !== false && i === s.modals.length - 1) this.closeModal(m.id); } },
      h("div", { class: "modal" }, m.render(() => this.closeModal(m.id)))));
    const toasts = h("div", { class: "toasts" }, s.toasts.map((t) => h("div", { class: ["toast", t.kind] }, t.text)));
    replaceChildren(this.root, h("main", { class: ["screen", screen.fullscreen && "fullscreen"], dataset: { screen: screen.id } }, screen.render()), nav, modals, toasts);
  }
}
