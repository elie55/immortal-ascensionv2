/**
 * Peeks: a long press (or a right click / two-finger tap on desktop) on anything in the game opens a small card
 * beside it that says what it is — a technique's numbers, an item's uses, a status, an enemy. A tap anywhere closes
 * it. The press never fires the element's own tap: the click that follows a long press is swallowed.
 */
import type { Child } from "./dom.ts";
import type { Router } from "./router.ts";

const HOLD_MS = 430;
const MOVE_PX = 10;

/** Make `el` peekable: `show()` builds the card's content when the press is long enough. Returns `el`. */
export function peekable<T extends HTMLElement>(el: T, router: Router, show: () => Child | null | undefined, opts: { ms?: number } = {}): T {
  let timer: number | undefined; let x0 = 0, y0 = 0; let fired = false;
  const open = () => {
    const body = show(); if (!body) return;
    fired = true;
    const r = el.getBoundingClientRect();
    router.open({ id: "peek", kind: "peek", at: { x: r.left, y: r.top, w: r.width, h: r.height }, render: () => body });
    try { navigator.vibrate?.(8); } catch { /* not supported */ }
  };
  const clear = () => { if (timer !== undefined) { clearTimeout(timer); timer = undefined; } };
  el.addEventListener("pointerdown", (e) => { if ((e as PointerEvent).button !== 0) return; fired = false; x0 = e.clientX; y0 = e.clientY; clear(); timer = window.setTimeout(open, opts.ms ?? HOLD_MS); });
  el.addEventListener("pointermove", (e) => { if (Math.abs(e.clientX - x0) > MOVE_PX || Math.abs(e.clientY - y0) > MOVE_PX) clear(); });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) el.addEventListener(ev, clear);
  el.addEventListener("contextmenu", (e) => { e.preventDefault(); clear(); open(); });
  // the tap that ends a long press is not a tap
  el.addEventListener("click", (e) => { if (fired) { e.stopImmediatePropagation(); e.preventDefault(); fired = false; } }, true);
  el.classList.add("peekable");
  return el;
}
