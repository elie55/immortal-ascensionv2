/**
 * Procedural technique effects for the arena stage (docs/BATTLE_STAGE.md §4): one effect per `vfx.shape`,
 * tinted by `color` and sized by `impact`, drawn with DOM + CSS + Web Animations in the stage's effect layer
 * (so the camera transform applies to them). `play` resolves at the moment the effect connects, which is when
 * the screen shows damage numbers; the effect itself finishes and removes itself afterwards.
 */
import { h } from "../core/dom.ts";
import type { Shape, Impact } from "./choreo.ts";

export interface Pt { x: number; y: number }
export interface VfxCtx {
  layer: HTMLElement;
  /** Scales a duration by the battle speed (ms at 1× → ms now). */
  dur: (ms: number) => number;
  reduced: boolean;
}
export interface VfxArgs {
  shape: Shape; color: string; impact: Impact;
  /** The actor's chest (beams, pierces and waves start there). */
  from: Pt;
  /** The targets' chests; ring/glow use them as the friendly targets. */
  to: Pt[];
  /** Height of a target's figure in px (effects are sized from it). */
  size: number;
  /** Ground line of the targets (pillars and rain land there). */
  ground?: number;
}

const IMPACT: Record<Impact, number> = { light: 0.8, medium: 1, heavy: 1.35 };
const SVGNS = "http://www.w3.org/2000/svg";

function anim(el: Element, frames: Keyframe[], ms: number, ctx: VfxCtx, opts: KeyframeAnimationOptions = {}) {
  return el.animate(frames, { duration: ctx.dur(ms), easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards", ...opts });
}
function mount(ctx: VfxCtx, el: HTMLElement, life: number) {
  ctx.layer.appendChild(el);
  setTimeout(() => el.remove(), ctx.dur(life) + 60);
  return el;
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A burst of sparks flying out from a point. */
function sparks(ctx: VfxCtx, at: Pt, color: string, n: number, reach: number, life = 520) {
  if (ctx.reduced) return;
  const box = mount(ctx, h("div", { class: "vx vx-sparks", style: { left: `${at.x}px`, top: `${at.y}px`, "--c": color } }), life);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.6, d = reach * (0.55 + Math.random() * 0.6);
    const s = h("i", { style: { width: `${3 + Math.random() * 4}px`, height: `${12 + Math.random() * 14}px`, transform: `rotate(${a + Math.PI / 2}rad)` } });
    box.appendChild(s);
    anim(s, [{ transform: `rotate(${a + Math.PI / 2}rad) translate(0, 0) scaleY(1)`, opacity: 1 }, { transform: `rotate(${a + Math.PI / 2}rad) translate(0, ${-d}px) scaleY(.3)`, opacity: 0 }], life * (0.7 + Math.random() * 0.3), ctx);
  }
}

/** A soft flash of light at a point (the moment of contact). */
function flare(ctx: VfxCtx, at: Pt, color: string, r: number, life = 360) {
  const el = mount(ctx, h("div", { class: "vx vx-flare", style: { left: `${at.x}px`, top: `${at.y}px`, width: `${r * 2}px`, height: `${r * 2}px`, "--c": color } }), life);
  anim(el, [{ transform: "translate(-50%,-50%) scale(.2)", opacity: 1 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 0.9, offset: 0.35 }, { transform: "translate(-50%,-50%) scale(1.25)", opacity: 0 }], life, ctx);
}

/** An expanding ring on the ground or in the air. */
function ring(ctx: VfxCtx, at: Pt, color: string, r: number, flat = 0.38, life = 520) {
  const el = mount(ctx, h("div", { class: "vx vx-ring", style: { left: `${at.x}px`, top: `${at.y}px`, width: `${r * 2}px`, height: `${r * 2 * flat}px`, "--c": color } }), life);
  anim(el, [{ transform: "translate(-50%,-50%) scale(.15)", opacity: 1 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 0 }], life, ctx, { easing: "cubic-bezier(.1,.8,.3,1)" });
}

/** Sword arcs across the target: two crossing crescents drawn as stroked paths. */
async function slash(ctx: VfxCtx, a: VfxArgs, k: number) {
  for (const [i, t] of a.to.entries()) {
    const w = a.size * 0.95 * k;
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", "-50 -50 100 100"); svg.setAttribute("class", "vx-arc");
    const rot = -30 + (i % 2) * 50 + (Math.random() * 16 - 8);
    for (const [j, d] of ["M -44 18 Q -4 -40 44 -18", "M -40 -22 Q 6 34 42 20"].entries()) {
      const p = document.createElementNS(SVGNS, "path");
      p.setAttribute("d", d); p.setAttribute("pathLength", "100");
      p.setAttribute("class", j ? "vx-arc2" : "vx-arc1");
      svg.appendChild(p);
      anim(p, [{ strokeDashoffset: 100, opacity: 1 }, { strokeDashoffset: 0, opacity: 1, offset: 0.45 }, { strokeDashoffset: -100, opacity: 0 }], 360, ctx, { delay: ctx.dur(j * 70) });
    }
    const el = mount(ctx, h("div", { class: "vx vx-slash", style: { left: `${t.x}px`, top: `${t.y}px`, width: `${w}px`, height: `${w}px`, "--c": a.color, transform: `translate(-50%,-50%) rotate(${rot}deg)` } }), 520);
    el.appendChild(svg);
  }
  await sleep(ctx.dur(120));
  for (const t of a.to) { flare(ctx, t, a.color, a.size * 0.32 * k); sparks(ctx, t, a.color, Math.round(8 * k), a.size * 0.45 * k); }
}

/** A spear streak from the actor to the target. */
async function pierce(ctx: VfxCtx, a: VfxArgs, k: number) {
  const t = a.to[0]!; const dx = t.x - a.from.x, dy = t.y - a.from.y, len = Math.hypot(dx, dy);
  const el = mount(ctx, h("div", { class: "vx vx-pierce", style: { left: `${a.from.x}px`, top: `${a.from.y}px`, width: `${len}px`, height: `${10 * k}px`, "--c": a.color, transform: `translateY(-50%) rotate(${Math.atan2(dy, dx)}rad)` } }), 420);
  anim(el, [{ clipPath: "inset(0 100% 0 0)", opacity: 1 }, { clipPath: "inset(0 0 0 0)", opacity: 1, offset: 0.4 }, { clipPath: "inset(0 0 0 100%)", opacity: 0 }], 420, ctx, { easing: "linear" });
  await sleep(ctx.dur(170));
  flare(ctx, t, a.color, a.size * 0.3 * k); sparks(ctx, t, a.color, Math.round(7 * k), a.size * 0.4 * k);
}

/** A palm or claw blow: an expanding shock with rays. */
async function burst(ctx: VfxCtx, a: VfxArgs, k: number) {
  for (const t of a.to) {
    const r = a.size * 0.42 * k;
    const el = mount(ctx, h("div", { class: "vx vx-burst", style: { left: `${t.x}px`, top: `${t.y}px`, width: `${r * 2}px`, height: `${r * 2}px`, "--c": a.color } }), 520);
    anim(el, [{ transform: "translate(-50%,-50%) scale(.2) rotate(0deg)", opacity: 1 }, { transform: "translate(-50%,-50%) scale(1.1) rotate(25deg)", opacity: 0 }], 480, ctx);
    ring(ctx, t, a.color, r * 1.1, 1, 460);
  }
  await sleep(ctx.dur(70));
  for (const t of a.to) sparks(ctx, t, a.color, Math.round(9 * k), a.size * 0.5 * k);
}

/** A beam of energy from the actor to the target, held for a moment. */
async function beam(ctx: VfxCtx, a: VfxArgs, k: number) {
  for (const t of a.to) {
    const dx = t.x - a.from.x, dy = t.y - a.from.y, len = Math.hypot(dx, dy);
    const el = mount(ctx, h("div", { class: "vx vx-beam", style: { left: `${a.from.x}px`, top: `${a.from.y}px`, width: `${len}px`, height: `${22 * k}px`, "--c": a.color, transform: `translateY(-50%) rotate(${Math.atan2(dy, dx)}rad)` } }), 560);
    anim(el, [{ clipPath: "inset(30% 100% 30% 0)", opacity: 1 }, { clipPath: "inset(0 0 0 0)", opacity: 1, offset: 0.3 }, { clipPath: "inset(0 0 0 0)", opacity: 1, offset: 0.7 }, { clipPath: "inset(45% 0 45% 0)", opacity: 0 }], 560, ctx, { easing: "linear" });
  }
  await sleep(ctx.dur(170));
  for (const t of a.to) { flare(ctx, t, a.color, a.size * 0.34 * k); sparks(ctx, t, a.color, Math.round(6 * k), a.size * 0.35 * k); }
}

/** A crescent sweep across a whole line of targets. */
async function wave(ctx: VfxCtx, a: VfxArgs, k: number) {
  const xs = a.to.map((t) => t.x), ys = a.to.map((t) => t.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const span = Math.max(a.size * 1.4, Math.max(...xs) - Math.min(...xs) + a.size) * k;
  const el = mount(ctx, h("div", { class: "vx vx-wave", style: { left: `${cx}px`, top: `${cy}px`, width: `${span}px`, height: `${span * 0.42}px`, "--c": a.color } }), 620);
  anim(el, [{ transform: "translate(-80%,-50%) rotate(-14deg) scaleX(.3)", opacity: 0 }, { transform: "translate(-50%,-50%) rotate(-14deg) scaleX(1)", opacity: 1, offset: 0.45 }, { transform: "translate(-20%,-50%) rotate(-14deg) scaleX(1.1)", opacity: 0 }], 620, ctx, { easing: "ease-out" });
  await sleep(ctx.dur(260));
  for (const t of a.to) { flare(ctx, t, a.color, a.size * 0.26 * k); sparks(ctx, t, a.color, Math.round(5 * k), a.size * 0.35 * k); }
}

/** A column of light falling on one target, with a ring on the ground. */
async function pillar(ctx: VfxCtx, a: VfxArgs, k: number) {
  for (const t of a.to) {
    const w = a.size * 0.55 * k, g = a.ground ?? t.y + a.size * 0.45;
    const el = mount(ctx, h("div", { class: "vx vx-pillar", style: { left: `${t.x}px`, top: "0px", width: `${w}px`, height: `${g}px`, "--c": a.color } }), 760);
    anim(el, [{ transform: "translateX(-50%) scaleX(.15)", opacity: 0 }, { transform: "translateX(-50%) scaleX(1)", opacity: 1, offset: 0.35 }, { transform: "translateX(-50%) scaleX(.6)", opacity: 0 }], 760, ctx);
    setTimeout(() => ring(ctx, { x: t.x, y: g }, a.color, a.size * 0.7 * k, 0.32, 600), ctx.dur(220));
  }
  await sleep(ctx.dur(300));
  for (const t of a.to) { flare(ctx, t, a.color, a.size * 0.45 * k, 480); sparks(ctx, t, a.color, Math.round(12 * k), a.size * 0.6 * k, 700); }
}

/** Blades or ice shards raining on every target, staggered. */
async function rain(ctx: VfxCtx, a: VfxArgs, k: number) {
  const n = ctx.reduced ? 4 : Math.round(12 * k);
  const landings: Promise<void>[] = [];
  for (const t of a.to) for (let i = 0; i < n; i++) {
    const delay = i * 55 + Math.random() * 40;
    const x = t.x + (Math.random() - 0.5) * a.size * 0.7, y = t.y + (Math.random() - 0.3) * a.size * 0.4;
    const len = a.size * (0.45 + Math.random() * 0.25);
    const el = mount(ctx, h("div", { class: "vx vx-drop", style: { left: `${x}px`, top: `${y}px`, height: `${len}px`, "--c": a.color } }), delay + 420);
    anim(el, [{ transform: `translate(-50%, ${-a.size * 1.6}px) rotate(18deg)`, opacity: 0 }, { transform: "translate(-50%, -100%) rotate(18deg)", opacity: 1, offset: 0.7 }, { transform: "translate(-50%, -100%) rotate(18deg) scaleY(.2)", opacity: 0 }], 380, ctx, { delay: ctx.dur(delay), easing: "ease-in" });
    landings.push(sleep(ctx.dur(delay + 270)).then(() => { if (!ctx.reduced) sparks(ctx, { x, y }, a.color, 3, a.size * 0.2, 340); }));
  }
  await sleep(ctx.dur(300));
  for (const t of a.to) { flare(ctx, t, a.color, a.size * 0.5 * k, 620); ring(ctx, { x: t.x, y: a.ground ?? t.y + a.size * 0.45 }, a.color, a.size * 0.8 * k, 0.3, 700); }
  await Promise.race([Promise.all(landings), sleep(ctx.dur(400))]);
}

/** A protective ring on friendly targets (buffs and shields). */
async function ringFx(ctx: VfxCtx, a: VfxArgs, k: number) {
  for (const t of a.to) { ring(ctx, { x: t.x, y: t.y + a.size * 0.42 }, a.color, a.size * 0.6 * k, 0.34, 640); ring(ctx, t, a.color, a.size * 0.5 * k, 1, 560); }
  await sleep(ctx.dur(150));
}

/** Healing light rising around friendly targets. */
async function glow(ctx: VfxCtx, a: VfxArgs, k: number) {
  for (const t of a.to) {
    flare(ctx, t, a.color, a.size * 0.4 * k, 700);
    if (ctx.reduced) continue;
    for (let i = 0; i < 8; i++) {
      const el = mount(ctx, h("div", { class: "vx vx-mote", style: { left: `${t.x + (Math.random() - 0.5) * a.size * 0.6}px`, top: `${t.y + a.size * 0.3}px`, "--c": a.color } }), 900);
      anim(el, [{ transform: "translate(-50%,0) scale(.6)", opacity: 0 }, { transform: `translate(-50%, ${-a.size * 0.3}px) scale(1)`, opacity: 1, offset: 0.3 }, { transform: `translate(-50%, ${-a.size * 0.8}px) scale(.4)`, opacity: 0 }], 820, ctx, { delay: ctx.dur(i * 50) });
    }
  }
  await sleep(ctx.dur(200));
}

const SHAPES: Record<Shape, (ctx: VfxCtx, a: VfxArgs, k: number) => Promise<void>> = { slash, pierce, burst, beam, wave, pillar, rain, ring: ringFx, glow };

/** Play one technique effect; resolves when it connects (the moment numbers should appear). */
export function play(ctx: VfxCtx, a: VfxArgs): Promise<void> {
  if (!a.to.length) return Promise.resolve();
  return SHAPES[a.shape](ctx, a, IMPACT[a.impact]);
}

/** Dust and a short streak where a dash starts (the figure kicks off the ground). */
export function dashTrail(ctx: VfxCtx, from: Pt, to: Pt, color: string) {
  if (ctx.reduced) return;
  const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy);
  const el = mount(ctx, h("div", { class: "vx vx-streak", style: { left: `${from.x}px`, top: `${from.y}px`, width: `${len}px`, "--c": color, transform: `translateY(-50%) rotate(${Math.atan2(dy, dx)}rad)` } }), 380);
  anim(el, [{ clipPath: "inset(0 100% 0 0)", opacity: 0.9 }, { clipPath: "inset(0 0 0 0)", opacity: 0.7, offset: 0.5 }, { clipPath: "inset(0 0 0 100%)", opacity: 0 }], 380, ctx, { easing: "ease-out" });
  const puff = mount(ctx, h("div", { class: "vx vx-dust", style: { left: `${from.x}px`, top: `${from.y}px` } }), 520);
  anim(puff, [{ transform: "translate(-50%,-50%) scale(.3)", opacity: 0.8 }, { transform: "translate(-50%,-50%) scale(1.4)", opacity: 0 }], 520, ctx);
}
