/**
 * Tiny DOM view layer. `h(tag, props, ...children)` builds elements; screens are functions returning
 * elements and are re-rendered when the game state changes (every tick). `morph()` patches the live DOM to
 * match the fresh tree instead of replacing it, so open sheets don't replay their entry animation, inner
 * lists keep their scroll, inputs keep focus and a tap that spans a tick is not lost.
 * Elements with `data-key` are matched by key (a different key = a different element, which animates in).
 * Screens that own their DOM (battle, story) mark their root with `keep()`: it is moved, never patched.
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
    else if (k === "style" && typeof v === "object") { for (const [sk, sv] of Object.entries(v)) if (sv !== undefined && sv !== null) { if (sk.startsWith("--")) el.style.setProperty(sk, String(sv)); else (el.style as any)[sk] = sv; } }
    else if (k.startsWith("on") && typeof v === "function") on(el, k.slice(2).toLowerCase(), v);
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

// ---------- event handlers that survive patching ----------
type Handlers = Record<string, (e: Event) => void>;
const HANDLERS = Symbol("handlers"), LISTENING = Symbol("listening"), KEEP = Symbol("keep");
function on(el: HTMLElement, type: string, fn: (e: Event) => void): void {
  const hs: Handlers = ((el as any)[HANDLERS] ??= {});
  hs[type] = fn;
  const ls: Set<string> = ((el as any)[LISTENING] ??= new Set());
  if (!ls.has(type)) { ls.add(type); el.addEventListener(type, function (this: HTMLElement, e) { (this as any)[HANDLERS]?.[type]?.call(this, e); }); }
}

/** Mark an element whose content its screen manages itself (moved as is by morph, never patched). */
export function keep<T extends Element>(el: T): T { (el as any)[KEEP] = true; return el; }

/** Patch `el`'s children to match `children` (see the header comment). */
export function morph(el: Element, ...children: Child[]): void {
  const next = document.createElement(el.tagName);
  append(next, children);
  morphKids(el, next);
}

const keyOf = (n: Node): string | null => (n.nodeType === 1 ? (n as Element).getAttribute("data-key") : null);
function sameKind(a: Node, b: Node): boolean {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType !== 1) return true;
  const ea = a as HTMLElement, eb = b as HTMLElement;
  return ea.tagName === eb.tagName && !(ea as any)[KEEP] && !(eb as any)[KEEP] && keyOf(ea) === keyOf(eb)
    && (ea.tagName !== "INPUT" || (ea as HTMLInputElement).type === (eb as HTMLInputElement).type);
}
function morphKids(oldP: Node, newP: Node): void {
  const kids = [...newP.childNodes];
  const keyed = new Map<string, Node>();
  for (const c of oldP.childNodes) { const k = keyOf(c); if (k) keyed.set(k, c); }
  kids.forEach((nk, i) => {
    let ok: Node | null = oldP.childNodes[i] ?? null;
    if (ok === nk) return;
    const k = keyOf(nk);
    if (k && keyed.has(k)) { const m = keyed.get(k)!; keyed.delete(k); if (m !== ok) { oldP.insertBefore(m, ok); ok = m; } }
    if (ok && sameKind(ok, nk)) morphNode(ok, nk);
    else oldP.insertBefore(nk, ok);
  });
  while (oldP.childNodes.length > kids.length) oldP.removeChild(oldP.lastChild!);
}
function morphNode(o: Node, n: Node): void {
  if (o.nodeType !== 1) { if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue; return; }
  const oe = o as HTMLElement, ne = n as HTMLElement;
  for (const a of [...oe.attributes]) if (!ne.hasAttribute(a.name)) oe.removeAttribute(a.name);
  for (const a of ne.attributes) if (oe.getAttribute(a.name) !== a.value) oe.setAttribute(a.name, a.value);
  if (oe instanceof HTMLInputElement || oe instanceof HTMLTextAreaElement || oe instanceof HTMLSelectElement) {
    const ni = ne as HTMLInputElement;
    if (document.activeElement !== oe && oe.value !== ni.value) oe.value = ni.value;
    if (oe instanceof HTMLInputElement && oe.checked !== ni.checked) oe.checked = ni.checked;
  }
  if ("disabled" in oe && (oe as any).disabled !== (ne as any).disabled) (oe as any).disabled = (ne as any).disabled;
  const hs: Handlers | undefined = (ne as any)[HANDLERS];
  (oe as any)[HANDLERS] = hs;
  if (hs) for (const t of Object.keys(hs)) on(oe, t, hs[t]!);
  morphKids(oe, ne);
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
