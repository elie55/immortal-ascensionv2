/**
 * Character animation: pure math, no DOM (see docs/ANIMATION.md).
 *
 * A figure is a cutout rig: its body image stretched over a mesh, an optional rigid weapon layer rotating
 * around the hand, and an optional eyelid patch for blinking. A clip is a set of parameter tracks over time
 * (lean, lunge, squash, weapon angle, flash…); `deform()` turns a pose into mesh vertex positions. Everything
 * is a function of time, so playing at 2× or 3× samples the same curves faster, and a test can evaluate any
 * frame without a browser.
 */

export type Archetype = "humanoid" | "humanoid_unarmed" | "quadruped" | "flying" | "serpent" | "large";

export interface RigDef {
  id: string;
  body: string;                       // asset path of the body texture
  size: [number, number];             // body texture size in px
  bbox: [number, number, number, number]; // opaque box inside the texture
  ground: [number, number];           // feet point (texture px)
  facing: 1 | -1 | 0;                 // +1 faces right (player's side), −1 faces left, 0 faces the viewer (foes)
  /** unit vector toward the foe in screen space (set by the stage: allies advance up the screen, foes down) */
  toward?: [number, number];
  archetype: Archetype;
  mesh: [number, number];             // columns × rows
  /** heights (texture px, from the top) used by the deformers */
  hips: number; chest: number; neck: number;
  weapon?: { file: string; size: [number, number]; offset: [number, number]; pivot: [number, number] };
  blink?: { file: string; rect: [number, number, number, number] };
  weights?: string;                   // png, R = flutter weight 0–255, G = hair
}

/** Everything a frame needs; all zero = the still image. */
export interface Pose {
  x: number; y: number;        // x = advance toward the foe (fraction of the bbox width, along rig.toward); y = lift in px
  rot: number;                 // root rotation around the ground point, radians
  lean: number;                // forward (+, toward facing) bend of the upper body
  squash: number;              // + flattens, − stretches (volume-preserving, around the ground)
  breath: number;              // 0–1 chest expansion
  head: number;                // head tilt, radians
  flutter: number;             // flutter amplitude multiplier (1 = idle breeze)
  wind: number;                // flutter phase
  weapon: number;              // weapon angle around the grip, radians (+ = swing toward facing)
  trail: number;               // weapon ghost trail strength 0–1
  blink: number;               // 0 open … 1 closed
  flash: number;               // 0–1 white-out
  glow: number;                // 0–1 elemental glow (renderer tints)
  alpha: number;               // opacity
  dissolve: number;            // 0–1 dissolve-away
}

export const REST: Pose = { x: 0, y: 0, rot: 0, lean: 0, squash: 0, breath: 0, head: 0, flutter: 1, wind: 0, weapon: 0, trail: 0, blink: 0, flash: 0, glow: 0, alpha: 1, dissolve: 0 };

// ---------- tracks ----------

type Key = [number, number];                 // [time ms, value]
export type Ease = "smooth" | "linear" | "out" | "in" | "snap";
export interface Track { keys: Key[]; ease?: Ease }

const smooth = (t: number) => t * t * (3 - 2 * t);
const easeFn: Record<Ease, (t: number) => number> = { smooth, linear: (t) => t, out: (t) => 1 - (1 - t) * (1 - t), in: (t) => t * t, snap: (t) => (t >= 1 ? 1 : 0) };

export function sample(tr: Track, t: number): number {
  const k = tr.keys;
  if (t <= k[0]![0]) return k[0]![1];
  for (let i = 1; i < k.length; i++) {
    const [t1, v1] = k[i]!;
    if (t <= t1) { const [t0, v0] = k[i - 1]!; const f = easeFn[tr.ease ?? "smooth"]((t - t0) / Math.max(1, t1 - t0)); return v0 + (v1 - v0) * f; }
  }
  return k[k.length - 1]![1];
}

export interface Clip {
  name: string;
  dur: number;                 // ms at 1×
  loop?: boolean;
  contact?: number;            // ms at 1×: the frame that connects (projectile leaves, hit lands)
  hold?: boolean;              // keep the last frame when done (defeat)
  tracks: Partial<Record<keyof Pose, Track>>;
  /** ambient idle motion still layered under this clip (breath, breeze) */
  ambient?: number;
}

export function samplePose(clip: Clip, t: number): Pose {
  const tt = clip.loop ? ((t % clip.dur) + clip.dur) % clip.dur : Math.min(t, clip.dur);
  const p: Pose = { ...REST };
  for (const k of Object.keys(clip.tracks) as (keyof Pose)[]) p[k] = sample(clip.tracks[k]!, tt);
  return p;
}

export function lerpPose(a: Pose, b: Pose, f: number): Pose {
  const out: any = {};
  for (const k of Object.keys(REST) as (keyof Pose)[]) out[k] = a[k] + (b[k] - a[k]) * f;
  return out;
}

// ---------- clip library ----------

const T = (keys: Key[], ease?: Ease): Track => ({ keys, ease });
const deg = (d: number) => d * Math.PI / 180;

/** Clips for an archetype. Directions are "toward the foe"; the renderer multiplies by facing. */
export function clips(arch: Archetype): Record<string, Clip> {
  const armed = arch === "humanoid";
  const beast = arch === "quadruped" || arch === "serpent";
  const big = arch === "large";
  const lunge = big ? 0.08 : beast ? 0.26 : 0.17;
  const c: Record<string, Clip> = {
    idle: { name: "idle", dur: 3200, loop: true, ambient: 1, tracks: {} },
    enter: { name: "enter", dur: 600, ambient: 1, tracks: { alpha: T([[0, 0], [260, 1]], "out"), y: T([[0, -34], [380, 0], [470, 3], [600, 0]]), squash: T([[0, -0.06], [380, 0.07], [600, 0]]) } },
    attack: {
      name: "attack", dur: 640, contact: 300, ambient: 0.4,
      tracks: {
        lean: T([[0, 0], [200, -0.22], [300, 0.34], [430, 0.18], [640, 0]]),
        x: T([[0, 0], [200, -0.05], [300, lunge], [440, lunge * 0.8], [640, 0]]),
        squash: T([[0, 0], [200, -0.05], [300, 0.05], [380, -0.02], [640, 0]]),
        weapon: armed ? T([[0, 0], [200, deg(-75)], [300, deg(85)], [420, deg(100)], [640, 0]]) : T([[0, 0]]),
        trail: T([[0, 0], [199, 0], [200, 1], [360, 1], [460, 0]], "linear"),
        head: T([[0, 0], [200, -0.1], [300, 0.12], [640, 0]]),
        flutter: T([[0, 1], [300, 2.6], [640, 1]]),
      },
    },
    cast: {
      name: "cast", dur: 820, contact: 540, ambient: 0.6,
      tracks: {
        y: T([[0, 0], [400, -10], [540, -6], [820, 0]]),
        lean: T([[0, 0], [380, -0.1], [540, 0.14], [820, 0]]),
        breath: T([[0, 0], [420, 1], [560, 0.3], [820, 0]]),
        flutter: T([[0, 1], [420, 3.2], [540, 4], [820, 1]]),
        glow: T([[0, 0], [380, 0.8], [540, 1], [700, 0]]),
        squash: T([[0, 0], [540, -0.04], [620, 0.03], [820, 0]]),
        weapon: armed ? T([[0, 0], [400, deg(-30)], [540, deg(20)], [820, 0]]) : T([[0, 0]]),
      },
    },
    ult: {
      name: "ult", dur: 1150, contact: 720, ambient: 0.4,
      tracks: {
        y: T([[0, 0], [500, -26], [720, -16], [1150, 0]]),
        lean: T([[0, 0], [560, -0.18], [720, 0.3], [900, 0.1], [1150, 0]]),
        x: T([[0, 0], [720, lunge * 0.6], [1150, 0]]),
        flutter: T([[0, 1], [500, 4.5], [720, 5], [1150, 1]]),
        glow: T([[0, 0], [400, 1], [720, 1], [1000, 0]]),
        flash: T([[0, 0], [700, 0], [730, 0.9], [900, 0]], "linear"),
        weapon: armed ? T([[0, 0], [560, deg(-120)], [720, deg(110)], [860, deg(120)], [1150, 0]]) : T([[0, 0]]),
        trail: T([[0, 0], [560, 0], [561, 1], [820, 1], [950, 0]], "linear"),
      },
    },
    hit: {
      name: "hit", dur: 380, ambient: 0.3,
      tracks: {
        lean: T([[0, 0], [60, -0.3], [180, 0.08], [380, 0]]),
        x: T([[0, 0], [60, -0.08], [220, 0.01], [380, 0]]),
        squash: T([[0, 0], [60, 0.09], [200, -0.03], [380, 0]]),
        head: T([[0, 0], [60, -0.25], [380, 0]]),
        flash: T([[0, 0.9], [160, 0]], "linear"),
        flutter: T([[0, 2.5], [380, 1]]),
      },
    },
    hitBig: {
      name: "hitBig", dur: 560, ambient: 0.3,
      tracks: {
        lean: T([[0, 0], [70, -0.45], [220, 0.12], [360, -0.05], [560, 0]]),
        rot: T([[0, 0], [70, -0.08], [300, 0], [560, 0]]),
        x: T([[0, 0], [70, -0.14], [300, -0.02], [560, 0]]),
        squash: T([[0, 0], [70, 0.14], [240, -0.05], [560, 0]]),
        head: T([[0, 0], [70, -0.35], [560, 0]]),
        flash: T([[0, 1], [200, 0]], "linear"),
        flutter: T([[0, 3.5], [560, 1]]),
      },
    },
    dodge: {
      name: "dodge", dur: 440, ambient: 0.5,
      tracks: {
        x: T([[0, 0], [140, -0.24], [300, -0.2], [440, 0]]),
        y: T([[0, 0], [140, -8], [440, 0]]),
        lean: T([[0, 0], [140, -0.2], [440, 0]]),
        alpha: T([[0, 1], [120, 0.55], [330, 1]]),
        flutter: T([[0, 2.5], [440, 1]]),
      },
    },
    victory: {
      name: "victory", dur: 1500, loop: true, ambient: 1,
      tracks: { y: T([[0, 0], [300, -18], [560, 0], [640, 2], [760, 0], [1500, 0]]), squash: T([[0, 0.05], [300, -0.05], [560, 0.07], [760, 0], [1500, 0]]), head: T([[0, 0], [400, 0.14], [900, -0.05], [1500, 0]]), flutter: T([[0, 1.6]]) },
    },
    defeat: {
      name: "defeat", dur: 950, hold: true, ambient: 0,
      tracks: {
        lean: T([[0, 0], [250, -0.55], [950, -0.7]]),
        rot: T([[0, 0], [300, -0.25], [950, -0.32]]),
        x: T([[0, 0], [300, -0.1], [950, -0.12]]),
        y: T([[0, 0], [300, 6], [950, 10]]),
        squash: T([[0, 0], [300, 0.12], [950, 0.12]]),
        flash: T([[0, 0.6], [200, 0]], "linear"),
        dissolve: T([[0, 0], [420, 0], [950, 1]], "linear"),
        flutter: T([[0, 2]]),
      },
    },
  };
  if (beast) { // pounce instead of a swing; whole-body bite
    c.attack!.tracks.lean = T([[0, 0], [200, -0.3], [300, 0.5], [430, 0.3], [640, 0]]);
    c.attack!.tracks.y = T([[0, 0], [200, 4], [300, -14], [400, 0], [640, 0]]);
  }
  if (arch === "flying") { c.idle!.tracks.y = T([[0, 0], [1600, -9], [3200, 0]]); c.victory!.tracks.y = T([[0, 0], [750, -24], [1500, 0]]); }
  return c;
}

// ---------- ambient motion ----------

/** Breath, breeze and the blink schedule; `t` is wall time (never speed-scaled). */
export function ambient(t: number, strength: number, reduced: boolean, blinkSeed = 0): Pick<Pose, "breath" | "wind" | "y" | "blink"> {
  if (reduced || strength <= 0) return { breath: 0, wind: 0, y: 0, blink: 0 };
  const breath = (0.5 + 0.5 * Math.sin(t / 3200 * 2 * Math.PI)) * strength;
  // one blink every 3–6 s, 130 ms long, deterministic from a seed so tests can check it
  const period = 3000 + (((blinkSeed * 9301 + 49297) % 233280) / 233280) * 3000;
  const ph = ((t + blinkSeed * 731) % period);
  const blink = ph < 130 ? Math.sin(ph / 130 * Math.PI) : 0;
  return { breath, wind: t * 0.0042, y: -1.2 * breath * strength, blink };
}

// ---------- mesh deformation ----------

export interface Mesh { cols: number; rows: number; uv: Float32Array; base: Float32Array; flutter: Float32Array; index: Uint16Array }

/** A regular grid over the rig's bbox: uv into the texture, base positions in texture px, flutter weight per vertex. */
export function buildMesh(rig: RigDef, weightAt?: (x: number, y: number) => number): Mesh {
  const [cols, rows] = rig.mesh; const [x0, y0, x1, y1] = rig.bbox;
  const n = (cols + 1) * (rows + 1);
  const uv = new Float32Array(n * 2), base = new Float32Array(n * 2), flutter = new Float32Array(n);
  const cx = (x0 + x1) / 2, w = x1 - x0, h = y1 - y0;
  let i = 0;
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++, i++) {
    const x = x0 + w * c / cols, y = y0 + h * r / rows;
    uv[i * 2] = x / rig.size[0]; uv[i * 2 + 1] = y / rig.size[1];
    base[i * 2] = x; base[i * 2 + 1] = y;
    // geometric default: anything far from the spine column sways, more so higher up (hair, sleeves) and at the hem
    const dx = Math.abs(x - cx) / (w / 2), hh = 1 - (y - y0) / h;
    const side = Math.max(0, (dx - 0.22) / 0.78);
    const hem = hh < 0.16 ? (0.16 - hh) / 0.16 * Math.max(0, (dx - 0.1) / 0.9) : 0;
    const geo = Math.min(1, side * (0.35 + 0.65 * hh) + hem * 0.8);
    flutter[i] = weightAt ? weightAt(x, y) : geo;
  }
  const index = new Uint16Array(cols * rows * 6); let k = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = r * (cols + 1) + c, b = a + 1, d = a + cols + 1, e = d + 1;
    index[k++] = a; index[k++] = d; index[k++] = b; index[k++] = b; index[k++] = d; index[k++] = e;
  }
  return { cols, rows, uv, base, flutter, index };
}

/**
 * Vertex positions for a pose, in texture px (the renderer maps texture px → screen).
 * The ground point is the fixed point of lean, squash and rotation; x offsets are fractions of the bbox width.
 */
export function deform(rig: RigDef, mesh: Mesh, p: Pose, out?: Float32Array): Float32Array {
  const n = mesh.base.length / 2;
  const pos = out ?? new Float32Array(n * 2);
  const [gx, gy] = rig.ground; const [x0, y0, x1, y1] = rig.bbox;
  const w = x1 - x0, h = y1 - y0, f = rig.facing, sf = swingSide(rig);
  const front = f === 0;                   // a figure facing the viewer bends toward the camera instead of sideways
  const [tx, ty] = rig.toward ?? [f, 0];   // "advance" (pose.x) moves along this vector
  const sx = 1 + p.squash * 0.6, sy = 1 - p.squash;
  const cosR = Math.cos(p.rot * sf), sinR = Math.sin(p.rot * sf);
  const neckH = (gy - rig.neck) / h, chestH = (gy - rig.chest) / h;
  for (let i = 0; i < n; i++) {
    let x = mesh.base[i * 2]! - gx, y = mesh.base[i * 2 + 1]! - gy;  // relative to the ground point, y up is negative
    const hh = Math.min(1, Math.max(0, -y / h));                        // 0 feet … 1 top
    // breath: chest widens and shoulders lift, strongest around chest height
    const wChest = Math.exp(-Math.pow((hh - chestH) / 0.18, 2));
    x *= 1 + p.breath * 0.025 * wChest; y -= p.breath * 2.2 * Math.min(1, hh / Math.max(0.01, chestH));
    // head tilt: vertices above the neck rotate around the neck point
    if (hh > neckH && p.head) {
      const wHead = Math.min(1, (hh - neckH) / 0.08);
      const ny = -neckH * h; const dx = x, dy = y - ny; const a = p.head * sf * wHead;
      x = dx * Math.cos(a) - dy * Math.sin(a); y = ny + dx * Math.sin(a) + dy * Math.cos(a);
    }
    // lean: shear growing with height (bend from the hips)
    if (front) { const k = Math.pow(hh, 1.35); y += p.lean * k * h * 0.07; x *= 1 + p.lean * 0.09 * k; } // bow toward the viewer: the top comes down and closer
    else x += p.lean * f * Math.pow(hh, 1.35) * h * 0.42;
    // flutter: lagged wave on hair, sleeves and hems
    const fl = mesh.flutter[i]! * p.flutter;
    if (fl) { const ph = p.wind - hh * 2.4 + (x / w) * 1.1; x += Math.sin(ph) * fl * w * 0.028; y += Math.cos(ph * 0.7) * fl * h * 0.006; }
    // squash/stretch around the ground, then root rotation, then root offset
    x *= sx; y *= sy;
    const rx = x * cosR - y * sinR, ry = x * sinR + y * cosR;
    pos[i * 2] = gx + rx + p.x * tx * w; pos[i * 2 + 1] = gy + ry + p.y + p.x * ty * h * 0.35;
  }
  return pos;
}

/** Which way swings and tilts turn: the facing, or for a figure facing the viewer the side its weapon is on. */
export function swingSide(rig: RigDef): 1 | -1 {
  if (rig.facing) return rig.facing;
  return rig.weapon && rig.weapon.pivot[0] < rig.ground[0] ? -1 : 1;
}

/** Weapon placement for a pose: pivot position (texture px) and angle (radians, screen space). */
export function weaponPlacement(rig: RigDef, p: Pose): { px: number; py: number; angle: number; sx: number; sy: number } {
  const wp = rig.weapon!; const [gx, gy] = rig.ground; const [x0, y0, x1, y1] = rig.bbox; const w = x1 - x0, h = y1 - y0, f = rig.facing, sf = swingSide(rig);
  let x = wp.pivot[0] - gx, y = wp.pivot[1] - gy;
  const hh = Math.min(1, Math.max(0, -y / h));
  if (f === 0) { const k = Math.pow(hh, 1.35); y += p.lean * k * h * 0.07; x *= 1 + p.lean * 0.09 * k; }
  else x += p.lean * f * Math.pow(hh, 1.35) * h * 0.42;
  const sx = 1 + p.squash * 0.6, sy = 1 - p.squash; x *= sx; y *= sy;
  const cosR = Math.cos(p.rot * sf), sinR = Math.sin(p.rot * sf);
  const rx = x * cosR - y * sinR, ry = x * sinR + y * cosR;
  const [tx, ty] = rig.toward ?? [f, 0];
  return { px: gx + rx + p.x * tx * w, py: gy + ry + p.y + p.x * ty * h * 0.35, angle: p.weapon * sf + p.rot * sf + p.lean * f * 0.5, sx, sy };
}

// ---------- state machine ----------

export type Channel = "idle" | "act" | "react" | "end";
const CHANNEL: Record<string, Channel> = { idle: "idle", victory: "idle", enter: "act", attack: "act", cast: "act", ult: "act", hit: "react", hitBig: "react", dodge: "react", defeat: "end" };

export interface Playing { clip: Clip; t: number; speed: number; contactFired: boolean; resolveContact: () => void; resolveDone: () => void }

/**
 * One figure's clip player. Rules: `defeat` wins over everything; a reaction (hit, dodge) interrupts idle,
 * victory and other reactions but waits behind an action that has not reached its contact yet (the swing
 * finishes, then the figure flinches); an action interrupts idle and reactions and replaces a pending action.
 * Transitions blend over 90 ms so nothing pops.
 */
export class Player {
  current: Playing | null = null;
  private pending: Playing | null = null;
  private from: Pose | null = null; private blendT = 0;
  lastPose: Pose = { ...REST };
  readonly lib: Record<string, Clip>; rest: Pose;
  constructor(lib: Record<string, Clip>, rest: Pose = { ...REST }) { this.lib = lib; this.rest = rest; }

  play(name: string, speed = 1): { contact: Promise<void>; done: Promise<void> } {
    const clip = this.lib[name] ?? this.lib.idle!;
    let resolveContact!: () => void, resolveDone!: () => void;
    const contact = new Promise<void>((r) => (resolveContact = r)), done = new Promise<void>((r) => (resolveDone = r));
    const p: Playing = { clip, t: 0, speed, contactFired: false, resolveContact, resolveDone };
    const cur = this.current; const ch = CHANNEL[name] ?? "act";
    const curCh = cur ? CHANNEL[cur.clip.name] ?? "act" : "idle";
    if (curCh === "end") { resolveContact(); resolveDone(); return { contact, done }; } // defeated: nothing else plays
    if (ch === "react" && cur && curCh === "act" && cur.clip.contact !== undefined && !cur.contactFired) { this.pending?.resolveDone(); this.pending?.resolveContact(); this.pending = p; return { contact, done }; }
    if (ch === "idle" && cur && curCh === "act") { this.pending?.resolveDone(); this.pending?.resolveContact(); this.pending = p; return { contact, done }; }
    this.start(p);
    return { contact, done };
  }

  private start(p: Playing) {
    const cur = this.current;
    if (cur) { if (!cur.contactFired) cur.resolveContact(); cur.resolveDone(); this.from = { ...this.lastPose }; this.blendT = 0; }
    this.current = p;
    if (p.clip.contact === undefined) p.resolveContact();
  }

  /** Advance by `dt` ms of wall time; returns the clip pose (without ambient). */
  tick(dt: number): Pose {
    const cur = this.current;
    if (!cur) return this.rest;
    cur.t += dt * cur.speed;
    if (!cur.contactFired && cur.clip.contact !== undefined && cur.t >= cur.clip.contact) { cur.contactFired = true; cur.resolveContact(); }
    let pose = samplePose(cur.clip, cur.t);
    if (!cur.clip.loop && cur.t >= cur.clip.dur) {
      cur.resolveDone();
      if (cur.clip.hold) { this.lastPose = pose; return pose; }
      const next = this.pending; this.pending = null;
      this.current = null; this.from = { ...pose }; this.blendT = 0;
      if (next) { this.current = next; if (next.clip.contact === undefined) next.resolveContact(); pose = samplePose(next.clip, 0); }
      else pose = this.rest;
    }
    if (this.from) { this.blendT += dt; const f = Math.min(1, this.blendT / 90); pose = lerpPose(this.from, pose, smooth(f)); if (f >= 1) this.from = null; }
    this.lastPose = pose;
    return pose;
  }

  get name(): string { return this.current?.clip.name ?? "idle"; }
  get ambientStrength(): number { return this.current ? (this.current.clip.ambient ?? 0) : 1; }
}

/** Final pose for a frame: clip pose plus ambient breath/breeze/blink (which the clip's `ambient` scales). */
export function compose(clipPose: Pose, amb: ReturnType<typeof ambient>, strength: number): Pose {
  return { ...clipPose, breath: clipPose.breath + amb.breath * strength, wind: amb.wind, y: clipPose.y + amb.y * strength, blink: Math.max(clipPose.blink, amb.blink * (strength > 0 ? 1 : 0)) };
}
