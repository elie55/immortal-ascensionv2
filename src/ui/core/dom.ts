/**
 * Tiny DOM view layer. `h(tag, props, ...children)` builds elements; screens are functions returning
 * elements and are re-rendered wholesale when the game state changes (cheap at this UI size; the battle
 * stage uses canvas and is not rebuilt per change).
 */
export type Child = Node | string | number | null | undefined | false | Child[];
export type Props = Record<string, any> | null;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props, ...children: Child[]): HTMLElementTagNameMap[K];
export function h(tag: string, props?: Props, ...children: Child[]): HTMLElement;
export function h(tag: string, props: Props = null, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = Array.isArray(v) ? v.filter(Boolean).join(" ") : String(v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k in el && k !== "list" && k !== "form") (el as any)[k] = v;
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

export function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
}

export function replaceChildren(el: Element, ...children: Child[]): void {
  el.replaceChildren();
  append(el, children);
}

/** Minimal pub/sub store for UI-only state (current tab, open modal, toasts). */
export class Store<T extends object> {
  private subs = new Set<(s: T) => void>();
  state: T;
  constructor(initial: T) { this.state = initial; }
  set(patch: Partial<T>): void { Object.assign(this.state, patch); this.notify(); }
  update(fn: (s: T) => void): void { fn(this.state); this.notify(); }
  subscribe(fn: (s: T) => void): () => void { this.subs.add(fn); return () => this.subs.delete(fn); }
  notify(): void { for (const s of this.subs) s(this.state); }
}

export const fmt = {
  int: (n: number) => Math.floor(n).toLocaleString("en-US"),
  num: (n: number, d = 1) => (Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: d })),
  pct: (n: number, d = 1) => `${n.toFixed(d)}%`,
  /** 1234567 → 1.23M for compact Qi displays */
  compact: (n: number) => {
    const a = Math.abs(n);
    if (a >= 1e12) return (n / 1e12).toFixed(2) + "T";
    if (a >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (a >= 1e4) return (n / 1e3).toFixed(1) + "K";
    return Math.floor(n).toLocaleString("en-US");
  },
  duration: (ms: number) => {
    if (!Number.isFinite(ms)) return "∞";
    const s = Math.max(0, Math.round(ms / 1000));
    const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    if (d) return `${d}d ${hh}h`;
    if (hh) return `${hh}h ${mm}m`;
    if (mm) return `${mm}m ${ss}s`;
    return `${ss}s`;
  },
  roman: (n: number) => ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"][n] ?? String(n),
};
