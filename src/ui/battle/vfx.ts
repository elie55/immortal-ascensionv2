/**
 * Technique effects for the arena stage (docs/BATTLE_STAGE.md §4). Each `vfx.shape` is a small choreography of
 * painted light (the `ui.vfx` art: slash arcs, impact bursts, spirit blades, ice shards, rings, pillars, arrays,
 * flares, wind streaks, dust — light on black, shipped with alpha) layered with procedural sparks. A painted
 * piece is drawn twice: a soft tint in the technique's colour (the sprite as a mask over the colour, blurred) and a
 * bright core on top, both added to the scene. When a painting is missing the shape falls back to CSS shapes.
 * `play` resolves at the moment the effect connects: the screen shows the numbers and the hit-stop then.
 */
import { h } from "../core/dom.ts";
import type { Shape, Impact } from "./choreo.ts";

export interface Pt { x: number; y: number }
export type Sprite = "slash_arc" | "slash_cross" | "impact" | "blade" | "shard" | "ring" | "pillar" | "array" | "flare" | "swirl" | "wind" | "dust"
  | "burst_fire" | "burst_water" | "burst_wood" | "burst_earth" | "rock" | "flame" | "lightning" | "frost" | "miasma";
/** The element's own burst painting (fire, water, wood, earth); metal and the rest use the plain light impact. */
const BURST: Record<string, Sprite> = { "elem.fire": "burst_fire", "elem.water": "burst_water", "elem.wood": "burst_wood", "elem.earth": "burst_earth" };
export interface VfxCtx {
  layer: HTMLElement;
  /** Scales a duration by the battle speed (ms at 1× → ms now). */
  dur: (ms: number) => number;
  reduced: boolean;
  /** The painted effect's URL (css `url(...)`), when it has been generated. */
  sprite: (key: Sprite) => string | undefined;
}
export interface VfxArgs {
  shape: Shape; color: string; impact: Impact;
  /** The actor's chest (beams, pierces and waves start there). */
  from: Pt;
  /** The targets' chests; ring/glow use them as the friendly targets. */
  to: Pt[];
  /** Height of a target's figure in px (effects are sized from it). */
  size: number;
  /** Ground line of the targets (pillars, rings and rain land there). */
  ground?: number;
  /** Water and ice rain shards instead of blades. */
  element?: string;
  /** Called at every blade / shard landing of a rain (the stage shakes a little each time). */
  onLand?: (i: number) => void;
}

const IMPACT: Record<Impact, number> = { light: 0.8, medium: 1, heavy: 1.35 };
const SVGNS = "http://www.w3.org/2000/svg";

function anim(el: Element, frames: Keyframe[], ms: number, ctx: VfxCtx, opts: KeyframeAnimationOptions = {}) {
  return el.animate(frames, { duration: ctx.dur(ms), easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards", ...opts });
}
function mount(ctx: VfxCtx, el: HTMLElement, life: number) {
  ctx.layer.appendChild(el);
  setTimeout(() => el.remove(), ctx.dur(life) + 80);
  return el;
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * A painted piece of light: a box at (x, y) of w × h (centred unless `origin` says otherwise), rotated, with a
 * colour tint under a bright core. Returns the box (to animate) or null when the painting is missing.
 */
function painted(ctx: VfxCtx, key: Sprite, at: Pt, w: number, hgt: number, color: string, life: number, o: { rot?: number; origin?: string; core?: number; tint?: number; normal?: boolean } = {}) {
  const url = ctx.sprite(key); if (!url) return null;
  const box = mount(ctx, h("div", { class: ["vx vx-p", o.normal && "normal"], style: { left: `${at.x}px`, top: `${at.y}px`, width: `${w}px`, height: `${hgt}px`, "--c": edge(color), "--img": url, transformOrigin: o.origin ?? "50% 50%", "--rot": `${o.rot ?? 0}deg` } },
    !o.normal && h("i", { class: "vx-tint", style: { opacity: String(o.tint ?? 0.95) } }),
    h("b", { class: "vx-core", style: { opacity: String(o.core ?? 0.9) } })), life);
  return box;
}
/** The colour light is tinted and haloed with: a near-white colour (metal) would only wash the scene out, so it gets a steel-blue edge. */
export function edge(color: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color); if (!m) return color;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x!, 16)) as [number, number, number];
  return Math.max(r, g, b) - Math.min(r, g, b) < 40 && Math.min(r, g, b) > 180 ? "#8fc8ff" : color;
}
/** Keyframes for a painted box: translate to its anchor, rotate, then the given scale/opacity steps. */
const pf = (o: string, rot: number, steps: [number, number, number, number?][]) => steps.map(([sx, sy, op, off]) => ({ transform: `translate(${o}) rotate(${rot}deg) scale(${sx}, ${sy})`, opacity: op, ...(off !== undefined ? { offset: off } : {}) }));

/** A burst of sparks flying out from a point. */
export function sparks(ctx: VfxCtx, at: Pt, color: string, n: number, reach: number, life = 520) {
  if (ctx.reduced) return;
  const box = mount(ctx, h("div", { class: "vx vx-sparks", style: { left: `${at.x}px`, top: `${at.y}px`, "--c": color } }), life);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.6, d = reach * (0.55 + Math.random() * 0.6);
    const s = h("i", { style: { width: `${2 + Math.random() * 3}px`, height: `${10 + Math.random() * 16}px`, transform: `rotate(${a + Math.PI / 2}rad)` } });
    box.appendChild(s);
    anim(s, [{ transform: `rotate(${a + Math.PI / 2}rad) translate(0, 0) scaleY(1)`, opacity: 1 }, { transform: `rotate(${a + Math.PI / 2}rad) translate(0, ${-d}px) scaleY(.3)`, opacity: 0 }], life * (0.7 + Math.random() * 0.3), ctx);
  }
}

/** A flash of light at a point (the moment of contact): the painted flare, else a radial glow. */
export function flare(ctx: VfxCtx, at: Pt, color: string, r: number, life = 360) {
  const p = painted(ctx, "flare", at, r * 2.6, r * 2.6, color, life, { core: 1 });
  if (p) { anim(p, pf("-50%,-50%", rnd(0, 40), [[0.2, 0.2, 1], [1, 1, 1, 0.3], [1.3, 1.3, 0]]), life, ctx); return; }
  const el = mount(ctx, h("div", { class: "vx vx-flare", style: { left: `${at.x}px`, top: `${at.y}px`, width: `${r * 2}px`, height: `${r * 2}px`, "--c": color } }), life);
  anim(el, [{ transform: "translate(-50%,-50%) scale(.2)", opacity: 1 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 0.9, offset: 0.35 }, { transform: "translate(-50%,-50%) scale(1.25)", opacity: 0 }], life, ctx);
}

/**
 * The painted impact: the element's own burst (flames, a splash, leaves, rock shards) with the light star over it,
 * or the light star alone; else sparks only.
 */
function impact(ctx: VfxCtx, at: Pt, color: string, r: number, life = 380, element?: string) {
  const el = element && BURST[element] && ctx.sprite(BURST[element]!) ? BURST[element]! : null;
  if (el) {
    const b = painted(ctx, el, at, r * 2.7, r * 2.7, color, life + 120, { core: 1, tint: 0.55, normal: false });
    if (b) anim(b, pf("-50%,-50%", rnd(-40, 40), [[0.3, 0.3, 1], [1, 1, 1, 0.4], [1.25, 1.25, 0]]), life + 120, ctx);
  }
  const p = painted(ctx, "impact", at, r * (el ? 1.7 : 2.4), r * (el ? 1.7 : 2.4), color, life, { core: 0.95 });
  if (p) anim(p, pf("-50%,-50%", rnd(-30, 30), [[0.25, 0.25, 1], [1, 1, 1, 0.35], [1.2, 1.2, 0]]), life, ctx);
}

/** An expanding ring on the ground (flattened) or in the air. */
export function ring(ctx: VfxCtx, at: Pt, color: string, r: number, flat = 0.38, life = 520) {
  const p = painted(ctx, "ring", at, r * 2.2, r * 2.2 * Math.max(0.3, flat) * 0.6 / 0.5, color, life, { core: 0.7 });
  if (p) { anim(p, pf("-50%,-50%", 0, [[0.15, 0.15, 1], [1, 1, 0.9, 0.5], [1.15, 1.15, 0]]), life, ctx, { easing: "cubic-bezier(.1,.8,.3,1)" }); return; }
  const el = mount(ctx, h("div", { class: "vx vx-ring", style: { left: `${at.x}px`, top: `${at.y}px`, width: `${r * 2}px`, height: `${r * 2 * flat}px`, "--c": color } }), life);
  anim(el, [{ transform: "translate(-50%,-50%) scale(.15)", opacity: 1 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 0 }], life, ctx, { easing: "cubic-bezier(.1,.8,.3,1)" });
}

/** Dust kicked up at a point on the ground (dashes, landings, heavy blows). */
export function dust(ctx: VfxCtx, at: Pt, w: number, dir = 0) {
  if (ctx.reduced) return;
  const p = painted(ctx, "dust", at, w, w * 0.5, "#c8b08a", 620, { normal: true });
  if (p) { anim(p, [{ transform: `translate(-50%,-80%) scale(.4, .3)`, opacity: 0.9 }, { transform: `translate(calc(-50% + ${dir * w * 0.25}px),-85%) scale(1.15, 1)`, opacity: 0 }], 620, ctx, { easing: "ease-out" }); return; }
  const el = mount(ctx, h("div", { class: "vx vx-dust", style: { left: `${at.x}px`, top: `${at.y}px` } }), 520);
  anim(el, [{ transform: "translate(-50%,-50%) scale(.3)", opacity: 0.8 }, { transform: "translate(-50%,-50%) scale(1.4)", opacity: 0 }], 520, ctx);
}

/** Embers rising from a defeated figure while it dissolves. */
export function embers(ctx: VfxCtx, at: Pt, size: number, color = "#ffcf7a") {
  if (ctx.reduced) return;
  for (let i = 0; i < 16; i++) {
    const el = mount(ctx, h("div", { class: "vx vx-mote", style: { left: `${at.x + rnd(-0.28, 0.28) * size}px`, top: `${at.y + rnd(-0.3, 0.35) * size}px`, "--c": color, width: `${rnd(3, 7)}px`, height: `${rnd(3, 7)}px` } }), 1500);
    anim(el, [{ transform: "translate(-50%,0) scale(.5)", opacity: 0 }, { transform: `translate(-50%, ${-size * 0.15}px) scale(1)`, opacity: 1, offset: 0.2 }, { transform: `translate(calc(-50% + ${rnd(-20, 20)}px), ${-size * rnd(0.5, 0.9)}px) scale(.3)`, opacity: 0 }], rnd(900, 1400), ctx, { delay: ctx.dur(i * 40), easing: "ease-out" });
  }
}

/** Light gathering into a point (an ultimate's charge): motes drawn inward, a swirl, the array under the feet. */
export function gather(ctx: VfxCtx, at: Pt, ground: number, size: number, color: string, ms = 700) {
  const sw = painted(ctx, "swirl", at, size * 0.85, size * 0.85, color, ms + 200, { core: 0.55, tint: 0.6 });
  if (sw) anim(sw, [{ transform: "translate(-50%,-50%) scale(1.5) rotate(0deg)", opacity: 0 }, { transform: "translate(-50%,-50%) scale(1) rotate(160deg)", opacity: 0.85, offset: 0.45 }, { transform: "translate(-50%,-50%) scale(.35) rotate(360deg)", opacity: 0 }], ms + 200, ctx, { easing: "ease-in" });
  groundArray(ctx, { x: at.x, y: ground }, size * 1.25, color, ms + 900, 0.85);
  if (ctx.reduced) return;
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2, d = size * rnd(0.6, 1.1);
    const el = mount(ctx, h("div", { class: "vx vx-mote", style: { left: `${at.x}px`, top: `${at.y}px`, "--c": color } }), ms);
    anim(el, [{ transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(1.2)`, opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: "translate(-50%,-50%) scale(.3)", opacity: 0 }], ms * rnd(0.6, 1), ctx, { delay: ctx.dur(rnd(0, ms * 0.35)), easing: "cubic-bezier(.5,0,.9,.4)" });
  }
}

/** The casting array under a spellcaster's feet (spells, buffs). */
export function castArray(ctx: VfxCtx, foot: Pt, size: number, color: string, ms = 700) {
  groundArray(ctx, foot, size * 1.05, color, ms, 0.8);
}
/** An array lying on the ground: a square painting spun in its own plane, then flattened (the spin stays a circle). */
function groundArray(ctx: VfxCtx, foot: Pt, w: number, color: string, ms: number, core: number) {
  const ar = painted(ctx, "array", foot, w, w, color, ms, { core, tint: 0.8 });
  const f = 0.34;
  if (ar) anim(ar, [{ transform: `translate(-50%,-50%) scale(.3, ${0.3 * f}) rotate(0deg)`, opacity: 0 }, { transform: `translate(-50%,-50%) scale(1, ${f}) rotate(50deg)`, opacity: 1, offset: 0.35 }, { transform: `translate(-50%,-50%) scale(1.04, ${1.04 * f}) rotate(100deg)`, opacity: 0 }], ms, ctx, { easing: "cubic-bezier(.2,.7,.3,1)" });
}

// ---------- shapes ----------

/** Sword arcs across each target: a painted crescent (an X on heavy arts) that opens across the body, the burst, sparks. */
async function slash(ctx: VfxCtx, a: VfxArgs, k: number) {
  const heavy = a.impact === "heavy";
  for (const [i, t] of a.to.entries()) {
    const w = a.size * 1.35 * k, rot = -28 + (i % 2) * 18 + rnd(-10, 10);
    const p = painted(ctx, heavy ? "slash_cross" : "slash_arc", t, w, heavy ? w : w * 0.5, a.color, 420, { core: 1 });
    if (p) anim(p, pf("-50%,-50%", rot, [[0.25, 0.6, 0], [1.05, 1, 1, 0.3], [1.18, 0.7, 0]]), 420, ctx, { easing: "cubic-bezier(.15,.85,.25,1)" });
    else legacyArc(ctx, t, a, k, rot);
  }
  await sleep(ctx.dur(110));
  for (const t of a.to) { impact(ctx, t, a.color, a.size * 0.34 * k, 380, a.element); sparks(ctx, t, a.color, Math.round(10 * k), a.size * 0.5 * k); }
}
function legacyArc(ctx: VfxCtx, t: Pt, a: VfxArgs, k: number, rot: number) {
  const w = a.size * 0.95 * k;
  const svg = document.createElementNS(SVGNS, "svg"); svg.setAttribute("viewBox", "-50 -50 100 100"); svg.setAttribute("class", "vx-arc");
  for (const [j, d] of ["M -44 18 Q -4 -40 44 -18", "M -40 -22 Q 6 34 42 20"].entries()) {
    const p = document.createElementNS(SVGNS, "path"); p.setAttribute("d", d); p.setAttribute("pathLength", "100"); p.setAttribute("class", j ? "vx-arc2" : "vx-arc1"); svg.appendChild(p);
    anim(p, [{ strokeDashoffset: 100, opacity: 1 }, { strokeDashoffset: 0, opacity: 1, offset: 0.45 }, { strokeDashoffset: -100, opacity: 0 }], 360, ctx, { delay: ctx.dur(j * 70) });
  }
  mount(ctx, h("div", { class: "vx vx-slash", style: { left: `${t.x}px`, top: `${t.y}px`, width: `${w}px`, height: `${w}px`, "--c": a.color, transform: `translate(-50%,-50%) rotate(${rot}deg)` } }), 520).appendChild(svg);
}

/** A thrust: a streak of wind from the actor through the target, the burst at the tip. */
async function pierce(ctx: VfxCtx, a: VfxArgs, k: number) {
  const t = a.to[0]!; const dx = t.x - a.from.x, dy = t.y - a.from.y, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx) * 180 / Math.PI;
  const p = painted(ctx, "wind", { x: a.from.x, y: a.from.y }, len * 1.15, a.size * 0.32 * k, a.color, 380, { origin: "0% 50%" });
  if (p) anim(p, [{ transform: `translate(0,-50%) rotate(${ang}deg) scale(.1, 1)`, opacity: 1 }, { transform: `translate(0,-50%) rotate(${ang}deg) scale(1, 1)`, opacity: 1, offset: 0.45 }, { transform: `translate(0,-50%) rotate(${ang}deg) scale(1.05, .4)`, opacity: 0 }], 380, ctx);
  await sleep(ctx.dur(160));
  impact(ctx, t, a.color, a.size * 0.38 * k, 380, a.element); flare(ctx, t, a.color, a.size * 0.25 * k); sparks(ctx, t, a.color, Math.round(8 * k), a.size * 0.45 * k);
}

/** A palm or claw blow: the burst on the body and a shock ring on the ground. */
async function burst(ctx: VfxCtx, a: VfxArgs, k: number) {
  for (const t of a.to) {
    impact(ctx, t, a.color, a.size * 0.5 * k, 460, a.element);
    flare(ctx, t, a.color, a.size * 0.3 * k);
    if (a.ground !== undefined) ring(ctx, { x: t.x, y: a.ground }, a.color, a.size * 0.55 * k, 0.32, 520);
  }
  await sleep(ctx.dur(70));
  for (const t of a.to) sparks(ctx, t, a.color, Math.round(10 * k), a.size * 0.55 * k);
}

/** A beam: a thick streak held from the actor to the target. */
async function beam(ctx: VfxCtx, a: VfxArgs, k: number) {
  for (const t of a.to) {
    const dx = t.x - a.from.x, dy = t.y - a.from.y, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx) * 180 / Math.PI;
    const p = painted(ctx, "wind", a.from, len * 1.1, a.size * 0.55 * k, a.color, 600, { origin: "0% 50%", core: 1 });
    if (p) anim(p, [{ transform: `translate(0,-50%) rotate(${ang}deg) scale(.05, .6)`, opacity: 1 }, { transform: `translate(0,-50%) rotate(${ang}deg) scale(1, 1)`, opacity: 1, offset: 0.3 }, { transform: `translate(0,-50%) rotate(${ang}deg) scale(1, 1.1)`, opacity: 1, offset: 0.7 }, { transform: `translate(0,-50%) rotate(${ang}deg) scale(1, .2)`, opacity: 0 }], 600, ctx, { easing: "linear" });
    flare(ctx, a.from, a.color, a.size * 0.22 * k, 520);
  }
  await sleep(ctx.dur(170));
  for (const t of a.to) { impact(ctx, t, a.color, a.size * 0.4 * k, 380, a.element); sparks(ctx, t, a.color, Math.round(6 * k), a.size * 0.4 * k); }
}

/** A sweep of sword wind across a whole line of targets. */
async function wave(ctx: VfxCtx, a: VfxArgs, k: number) {
  const xs = a.to.map((t) => t.x), ys = a.to.map((t) => t.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const span = Math.max(a.size * 1.6, Math.max(...xs) - Math.min(...xs) + a.size * 1.2) * k;
  const p = painted(ctx, "wind", { x: cx, y: cy }, span, span * 0.38, a.color, 620, { core: 1 });
  if (p) anim(p, [{ transform: "translate(-85%,-50%) rotate(-12deg) scale(.4, .8)", opacity: 0 }, { transform: "translate(-50%,-50%) rotate(-12deg) scale(1, 1)", opacity: 1, offset: 0.45 }, { transform: "translate(-15%,-50%) rotate(-12deg) scale(1.1, .7)", opacity: 0 }], 620, ctx, { easing: "ease-out" });
  await sleep(ctx.dur(250));
  for (const t of a.to) { impact(ctx, t, a.color, a.size * 0.32 * k, 380, a.element); sparks(ctx, t, a.color, Math.round(5 * k), a.size * 0.35 * k); }
}

/** A column of heavenly light on one target, its ring on the ground. */
async function pillar(ctx: VfxCtx, a: VfxArgs, k: number) {
  for (const t of a.to) {
    const g = a.ground ?? t.y + a.size * 0.45;
    const p = painted(ctx, "pillar", { x: t.x, y: g }, a.size * 0.8 * k, g + a.size * 0.2, a.color, 820, { origin: "50% 100%", core: 1 });
    if (p) anim(p, [{ transform: "translate(-50%,-100%) scale(.15, 1)", opacity: 0 }, { transform: "translate(-50%,-100%) scale(1, 1)", opacity: 1, offset: 0.3 }, { transform: "translate(-50%,-100%) scale(.5, 1)", opacity: 0 }], 820, ctx);
    setTimeout(() => ring(ctx, { x: t.x, y: g }, a.color, a.size * 0.8 * k, 0.3, 640), ctx.dur(200));
  }
  await sleep(ctx.dur(280));
  for (const t of a.to) { impact(ctx, t, a.color, a.size * 0.55 * k, 480, a.element); sparks(ctx, t, a.color, Math.round(14 * k), a.size * 0.7 * k, 700); }
}

/** Spirit blades (or ice shards) raining on every target, staggered, each landing with a flash; a ring to close. */
async function rain(ctx: VfxCtx, a: VfxArgs, k: number) {
  const n = ctx.reduced ? 4 : Math.round(9 * k);
  // what falls: ice shards for water, burning rocks for earth, falling fire for fire, spirit blades otherwise
  const pick: Sprite = a.element === "elem.water" ? "shard" : a.element === "elem.earth" ? "rock" : a.element === "elem.fire" ? "flame" : "blade";
  const key: Sprite = ctx.sprite(pick) ? pick : a.element === "elem.water" ? "shard" : "blade";
  const flip = key === "flame";   // a flame is painted rising: turned over, it falls like a meteor
  const landings: Promise<void>[] = [];
  let landed = 0;
  for (const t of a.to) for (let i = 0; i < n; i++) {
    const delay = i * 70 + rnd(0, 50);
    const x = t.x + rnd(-0.4, 0.4) * a.size, y = (a.ground ?? t.y + a.size * 0.45) - rnd(0.02, 0.35) * a.size;
    const len = a.size * rnd(0.55, 0.8), w = len * 0.36;
    const fall = a.size * 1.9, tilt = 14;
    const p = painted(ctx, key, { x, y }, w * (key === "rock" ? 1.5 : 1), len * (key === "rock" ? 0.8 : 1), a.color, delay + 520, { origin: flip ? "50% 50%" : "50% 100%", core: 1 });
    // the box's bottom centre sits on the landing point; the blade falls along its own slant
    const sx = Math.sin(tilt * Math.PI / 180) * fall;
    const r = flip ? 180 + tilt : tilt;
    const frames = [{ transform: `translate(calc(-50% - ${sx}px), calc(-100% - ${fall}px)) rotate(${r}deg)`, opacity: 0 }, { transform: `translate(-50%, -100%) rotate(${r}deg)`, opacity: 1, offset: 0.62 }, { transform: `translate(-50%, -96%) rotate(${r}deg) scale(1, .85)`, opacity: 1, offset: 0.8 }, { transform: `translate(-50%, -96%) rotate(${r}deg) scale(.6, .5)`, opacity: 0 }];
    if (p) anim(p, frames, 460, ctx, { delay: ctx.dur(delay), easing: "cubic-bezier(.6,0,.9,.6)" });
    else { const el = mount(ctx, h("div", { class: "vx vx-drop", style: { left: `${x}px`, top: `${y}px`, height: `${len}px`, "--c": a.color } }), delay + 460); anim(el, frames, 460, ctx, { delay: ctx.dur(delay), easing: "ease-in" }); }
    landings.push(sleep(ctx.dur(delay + 290)).then(() => {
      flare(ctx, { x, y: y - len * 0.08 }, a.color, a.size * 0.16, 300);
      if (key === "rock" || key === "flame") impact(ctx, { x, y: y - len * 0.1 }, a.color, a.size * 0.14, 320, a.element);
      if (key === "rock") dust(ctx, { x, y }, a.size * 0.4);
      if (!ctx.reduced) sparks(ctx, { x, y }, a.color, 4, a.size * 0.25, 380);
      a.onLand?.(landed++);
    }));
  }
  await sleep(ctx.dur(290));
  await Promise.race([Promise.all(landings), sleep(ctx.dur(900))]);
  // the last blade's shock: a burst on the body and a ring along the ground, kept inside the target's own space
  for (const t of a.to) { impact(ctx, t, a.color, a.size * 0.4 * k, 520, a.element); ring(ctx, { x: t.x, y: a.ground ?? t.y + a.size * 0.45 }, a.color, a.size * 0.6 * k, 0.3, 700); }
}

/** A protective array and ring on friendly targets (buffs and shields). */
async function ringFx(ctx: VfxCtx, a: VfxArgs, k: number) {
  for (const t of a.to) {
    const g = a.ground ?? t.y + a.size * 0.42;
    castArray(ctx, { x: t.x, y: g }, a.size * k, a.color, 900);
    ring(ctx, { x: t.x, y: g }, a.color, a.size * 0.65 * k, 0.32, 700);
    flare(ctx, t, a.color, a.size * 0.3 * k, 520);
  }
  await sleep(ctx.dur(160));
}

/** Healing light: a swirl and motes rising around friendly targets. */
async function glow(ctx: VfxCtx, a: VfxArgs, k: number) {
  for (const t of a.to) {
    const sw = painted(ctx, "swirl", t, a.size * 0.9 * k, a.size * 0.9 * k, a.color, 900, { core: 0.7 });
    if (sw) anim(sw, pf("-50%,-50%", 0, [[0.5, 0.5, 0], [1, 1, 1, 0.35], [1.15, 1.15, 0]]), 900, ctx);
    flare(ctx, t, a.color, a.size * 0.35 * k, 700);
    if (ctx.reduced) continue;
    for (let i = 0; i < 10; i++) {
      const el = mount(ctx, h("div", { class: "vx vx-mote", style: { left: `${t.x + rnd(-0.3, 0.3) * a.size}px`, top: `${t.y + a.size * 0.3}px`, "--c": a.color } }), 1000);
      anim(el, [{ transform: "translate(-50%,0) scale(.6)", opacity: 0 }, { transform: `translate(-50%, ${-a.size * 0.3}px) scale(1)`, opacity: 1, offset: 0.3 }, { transform: `translate(-50%, ${-a.size * 0.85}px) scale(.4)`, opacity: 0 }], 900, ctx, { delay: ctx.dur(i * 45) });
    }
  }
  await sleep(ctx.dur(200));
}

/** Thunder from the sky: a bolt on every target (two on heavy arts), each with its burst and ring; the stage flickers. */
async function boltFx(ctx: VfxCtx, a: VfxArgs, k: number) {
  const n = a.impact === "heavy" ? 2 : 1;
  for (const [i, t] of a.to.entries()) for (let j = 0; j < n; j++) {
    setTimeout(() => {
      const g = { x: t.x + (j ? rnd(-0.15, 0.15) * a.size : 0), y: a.ground ?? t.y + a.size * 0.45 };
      if (!bolt(ctx, g, a.color, a.size * 0.6 * k)) { impact(ctx, t, a.color, a.size * 0.45 * k); }
      sparks(ctx, t, a.color, Math.round(8 * k), a.size * 0.5 * k);
    }, ctx.dur(i * 90 + j * 160));
  }
  await sleep(ctx.dur(120));
}

const SHAPES: Record<Shape, (ctx: VfxCtx, a: VfxArgs, k: number) => Promise<void>> = { slash, pierce, burst, beam, wave, pillar, rain, ring: ringFx, glow, bolt: boltFx };

/** Play one technique effect; resolves when it connects (the moment numbers should appear). */
export function play(ctx: VfxCtx, a: VfxArgs): Promise<void> {
  if (!a.to.length) return Promise.resolve();
  return SHAPES[a.shape](ctx, a, IMPACT[a.impact]);
}

/** A bolt of lightning striking a point from the top of the stage (tribulations, thunder arts). */
export function bolt(ctx: VfxCtx, at: Pt, color: string, w: number, life = 420) {
  const p = painted(ctx, "lightning", { x: at.x, y: at.y }, w, at.y + w * 0.4, color, life, { origin: "50% 100%", core: 1, tint: 0.8 });
  if (!p) return false;
  anim(p, [{ transform: "translate(-50%,-100%) scale(.6, 1)", opacity: 0 }, { transform: "translate(-50%,-100%) scale(1, 1)", opacity: 1, offset: 0.08 }, { transform: "translate(-50%,-100%) scale(.9, 1)", opacity: 0.4, offset: 0.25 }, { transform: "translate(-50%,-100%) scale(1.05, 1)", opacity: 1, offset: 0.35 }, { transform: "translate(-50%,-100%) scale(.7, 1)", opacity: 0 }], life, ctx, { easing: "linear" });
  impact(ctx, at, color, w * 0.45, 360); ring(ctx, at, color, w * 0.8, 0.3, 520);
  return true;
}

/** A dash: dust where the feet push off and a streak of wind along the path. */
export function dashTrail(ctx: VfxCtx, from: Pt, to: Pt, color: string) {
  if (ctx.reduced) return;
  dust(ctx, from, 90, Math.sign(from.x - to.x));
  const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx) * 180 / Math.PI;
  const p = painted(ctx, "wind", { x: from.x, y: from.y - 40 }, len, 50, color, 420, { origin: "0% 50%", core: 0.6, tint: 0.5 });
  if (p) { anim(p, [{ transform: `translate(0,-50%) rotate(${ang}deg) scale(.1, 1)`, opacity: 0.8 }, { transform: `translate(0,-50%) rotate(${ang}deg) scale(1, .8)`, opacity: 0.6, offset: 0.5 }, { transform: `translate(0,-50%) rotate(${ang}deg) scale(1, .3)`, opacity: 0 }], 420, ctx, { easing: "ease-out" }); return; }
  const el = mount(ctx, h("div", { class: "vx vx-streak", style: { left: `${from.x}px`, top: `${from.y}px`, width: `${len}px`, "--c": color, transform: `translateY(-50%) rotate(${Math.atan2(dy, dx)}rad)` } }), 380);
  anim(el, [{ clipPath: "inset(0 100% 0 0)", opacity: 0.9 }, { clipPath: "inset(0 0 0 0)", opacity: 0.7, offset: 0.5 }, { clipPath: "inset(0 0 0 100%)", opacity: 0 }], 380, ctx, { easing: "ease-out" });
}
