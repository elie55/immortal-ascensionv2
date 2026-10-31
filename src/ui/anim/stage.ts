/**
 * AnimStage: the battle screen's puppet layer. One WebGL canvas over the stage; every rigged unit is a Puppet
 * drawn where its (now invisible) `.spr` box is, so the DOM keeps doing layout, hit-testing and effect anchors
 * and the canvas only paints. `play(uid, clip)` returns `{ contact, done }` so battle.ts can line up
 * projectiles, damage numbers and shake with the frame that connects.
 */
import { GL, mapping, QUAD_UV, type Tex } from "./gl.ts";
import { ambient, buildMesh, clips, compose, deform, weaponPlacement, Player, type Archetype, type Mesh, type Pose, type RigDef } from "./rig.ts";

export type Quality = "low" | "medium" | "high";
const MESH: Record<Quality, [number, number]> = { low: [1, 1], medium: [8, 12], high: [14, 22] };

interface Puppet {
  uid: number; rig: RigDef; anchor: HTMLElement; unit: HTMLElement; z: number;
  player: Player; mesh: Mesh; pos: Float32Array; body: Tex; weapon?: Tex; blink?: Tex;
  glowColor: [number, number, number]; seed: number; blinkSeed: number;
  prevAngle: number; angleVel: number;
  cssW: number; cssH: number;
}

export interface StageOpts { quality: Quality; reducedMotion: boolean; img: (file: string) => string }

/** Rig definitions by the art file they animate (filled by the content index from `anim` blocks). */
export class AnimStage {
  readonly ok: boolean;
  private gl: GL | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private puppets = new Map<number, Puppet>();
  private raf = 0; private last = 0; private running = false;
  private wall = 0;
  private ro: ResizeObserver | null = null;
  private cssW = 1; private cssH = 1;
  private textures = new Map<string, Promise<Tex>>();
  private stage: HTMLElement; private opts: StageOpts;

  constructor(stage: HTMLElement, opts: StageOpts) {
    this.stage = stage; this.opts = opts;
    let ok = opts.quality !== "low" && typeof WebGL2RenderingContext !== "undefined";
    if (ok) {
      try {
        const canvas = document.createElement("canvas");
        canvas.className = "bt-puppets"; canvas.setAttribute("aria-hidden", "true");
        stage.insertBefore(canvas, stage.firstChild);
        this.gl = new GL(canvas); this.canvas = canvas;
        this.measure();
        this.ro = new ResizeObserver(() => this.measure()); this.ro.observe(stage);
      } catch { ok = false; this.canvas?.remove(); this.canvas = null; this.gl = null; }
    }
    this.ok = ok;
  }

  private measure() {
    const r = this.stage.getBoundingClientRect();
    this.cssW = Math.max(1, r.width); this.cssH = Math.max(1, r.height);
    this.gl?.resize(this.cssW, this.cssH, Math.min(2, window.devicePixelRatio || 1));
    if (this.running && this.puppets.size) this.draw(0); // resizing clears the canvas: repaint before the frame is shown
  }

  private loadTex(file: string): Promise<Tex> {
    let p = this.textures.get(file);
    if (!p) {
      p = new Promise<Tex>((res, rej) => { const im = new Image(); im.onload = () => res(this.gl!.texture(im)); im.onerror = () => rej(new Error(`texture ${file}`)); im.src = this.opts.img(file); });
      this.textures.set(file, p);
    }
    return p;
  }

  private async weights(file: string, rig: RigDef): Promise<(x: number, y: number) => number> {
    const im = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(file)); i.src = this.opts.img(file); });
    const cv = document.createElement("canvas"); cv.width = im.width; cv.height = im.height;
    const cx = cv.getContext("2d", { willReadFrequently: true })!; cx.drawImage(im, 0, 0);
    const d = cx.getImageData(0, 0, cv.width, cv.height).data; const sx = cv.width / rig.size[0], sy = cv.height / rig.size[1];
    return (x, y) => { const ix = Math.min(cv.width - 1, Math.max(0, Math.round(x * sx))), iy = Math.min(cv.height - 1, Math.max(0, Math.round(y * sy))); return d[(iy * cv.width + ix) * 4]! / 255; };
  }

  /** Attach a rig to a unit; resolves once its textures are on the GPU. Safe to call when `ok` is false (no-op). */
  async add(uid: number, rig: RigDef, anchor: HTMLElement, unit: HTMLElement, z: number, glowColor: [number, number, number] = [1, 0.9, 0.6], side: "ally" | "enemy" = "enemy", towardOverride?: [number, number]): Promise<void> {
    if (!this.ok || !this.gl) return;
    const [body, weapon, blink] = await Promise.all([this.loadTex(rig.body), rig.weapon ? this.loadTex(rig.weapon.file) : undefined, rig.blink ? this.loadTex(rig.blink.file) : undefined]);
    const weightAt = rig.weights && this.opts.quality === "high" ? await this.weights(rig.weights, rig).catch(() => undefined) : undefined;
    if (this.puppets.has(uid)) return;
    // the foe is up the screen for the party and down the screen for enemies, with a little sideways in the facing direction
    // (the arena stage passes its own diagonal: the party advances up and right, the enemies down and left)
    const toward: [number, number] = towardOverride ?? (side === "ally" ? [0.3 * rig.facing, -1] : [0.3 * rig.facing, 1]);
    const def: RigDef = { ...rig, mesh: MESH[this.opts.quality], toward };
    const mesh = buildMesh(def, weightAt);
    const p: Puppet = { uid, rig: def, anchor, unit, z, player: new Player(clips(rig.archetype)), mesh, pos: new Float32Array(mesh.base.length), body, weapon, blink,
      glowColor, seed: (uid * 97) % 1000 / 1000, blinkSeed: uid, prevAngle: 0, angleVel: 0, cssW: 0, cssH: 0 };
    this.puppets.set(uid, p);
    anchor.classList.add("rigged"); unit.classList.add("rigged");
    this.start();
  }

  /**
   * A figure with no rig yet, as a puppet: its whole picture is the body, so it shares the depth order and the
   * clips (lunge, hit, defeat) with the rigged ones (the arena stage; docs/BATTLE_STAGE.md).
   */
  async addStill(uid: number, file: string, anchor: HTMLElement, unit: HTMLElement, z: number, glowColor: [number, number, number], side: "ally" | "enemy", toward: [number, number] | undefined, archetype: Archetype = "humanoid_unarmed"): Promise<void> {
    if (!this.ok || !this.gl) return;
    const body = await this.loadTex(file);
    const w = body.w, h = body.h;
    const rig: RigDef = { id: `still:${file}`, body: file, size: [w, h], bbox: [w * 0.08, h * 0.04, w * 0.92, h * 0.97], ground: [w / 2, h * 0.97], facing: 0, archetype, mesh: [8, 12], hips: h * 0.58, chest: h * 0.4, neck: h * 0.24 };
    return this.add(uid, rig, anchor, unit, z, glowColor, side, toward);
  }

  has(uid: number): boolean { return this.puppets.has(uid); }
  remove(uid: number): void { const p = this.puppets.get(uid); if (!p) return; p.anchor.classList.remove("rigged"); p.unit.classList.remove("rigged"); this.puppets.delete(uid); }
  setZ(uid: number, z: number): void { const p = this.puppets.get(uid); if (p) p.z = z; }
  setGlow(uid: number, c: [number, number, number]): void { const p = this.puppets.get(uid); if (p) p.glowColor = c; }

  /** Play a clip at a speed; `contact` resolves at the connecting frame (or at once when the clip has none). */
  play(uid: number, clip: string, speed = 1): { contact: Promise<void>; done: Promise<void> } {
    const p = this.puppets.get(uid);
    if (!p) return { contact: Promise.resolve(), done: Promise.resolve() };
    return p.player.play(clip, speed);
  }
  state(uid: number): string | undefined { return this.puppets.get(uid)?.player.name; }

  start(): void { if (this.running || !this.ok) return; this.running = true; this.last = performance.now(); this.raf = requestAnimationFrame(this.frame); }
  stop(): void { this.running = false; cancelAnimationFrame(this.raf); }
  dispose(): void { this.stop(); this.ro?.disconnect(); for (const uid of [...this.puppets.keys()]) this.remove(uid); this.gl?.dispose(); this.canvas?.remove(); }

  private frame = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(50, Math.max(0, now - this.last)); this.last = now; this.wall += dt;
    this.draw(dt);
    this.raf = requestAnimationFrame(this.frame);
  };

  /** One frame; exposed for tests (deterministic given dt). */
  draw(dt: number): void {
    const gl = this.gl; if (!gl) return;
    gl.clear();
    const stageRect = this.stage.getBoundingClientRect();
    const list = [...this.puppets.values()].sort((a, b) => a.z - b.z);
    for (const p of list) {
      const r = p.anchor.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) { p.player.tick(dt); continue; }
      const clipPose = p.player.tick(dt);
      const amb = ambient(this.wall, 1, this.opts.reducedMotion, p.blinkSeed);
      const pose: Pose = this.opts.reducedMotion ? { ...compose(clipPose, amb, 0), flash: 0, flutter: 0 } : compose(clipPose, amb, p.player.ambientStrength);
      // box → texture mapping (background: bottom center / contain), in the stage's own layout pixels: the anchor
      // rect is read as a fraction of the stage rect, so a camera transform on the stage (docs/BATTLE_STAGE.md §5)
      // moves and scales the canvas and the anchors together and the puppets stay on their boxes
      const kx = this.cssW / Math.max(1, stageRect.width), ky = this.cssH / Math.max(1, stageRect.height);
      const bw = r.width * kx, bh = r.height * ky, bl = (r.left - stageRect.left) * kx, bt = (r.top - stageRect.top) * ky;
      const [tw, th] = p.rig.size; const scale = Math.min(bw / tw, bh / th);
      const offX = bl + (bw - tw * scale) / 2, offY = bt + bh - th * scale;
      const m = mapping(scale, offX, offY, this.cssW, this.cssH);
      const fx = { alpha: pose.alpha, flash: pose.flash, dissolve: pose.dissolve, glow: pose.glow, glowColor: p.glowColor, seed: p.seed };
      // weapon behind the body when swung back, in front when swung forward
      const wp = p.weapon && p.rig.weapon ? weaponPlacement(p.rig, pose) : null;
      const drawWeapon = () => {
        if (!wp || !p.weapon || !p.rig.weapon) return;
        const w = p.rig.weapon; const [ox, oy] = w.offset, [ww, wh] = w.size, [pvx, pvy] = w.pivot;
        const corners = (angle: number) => {
          const c = Math.cos(angle), s = Math.sin(angle); const out = new Float32Array(8);
          [[ox, oy], [ox + ww, oy], [ox, oy + wh], [ox + ww, oy + wh]].forEach(([cx, cy], i) => {
            const dx = (cx! - pvx) * wp.sx, dy = (cy! - pvy) * wp.sy;
            out[i * 2] = wp.px + dx * c - dy * s; out[i * 2 + 1] = wp.py + dx * s + dy * c;
          });
          return out;
        };
        const vel = wp.angle - p.prevAngle; p.angleVel = p.angleVel * 0.5 + vel * 0.5; p.prevAngle = wp.angle;
        if (pose.trail > 0 && Math.abs(p.angleVel) > 0.01) for (let k = 3; k >= 1; k--) gl.quad(p.weapon, corners(wp.angle - p.angleVel * k * 1.6), m, { ...fx, alpha: pose.alpha * pose.trail * (0.32 / k), flash: Math.max(fx.flash, 0.35) });
        gl.quad(p.weapon, corners(wp.angle), m, fx);
      };
      const forward = pose.weapon >= 0; // swung toward the foe → in front of the body; swung back → behind
      if (!forward) drawWeapon();
      deform(p.rig, p.mesh, pose, p.pos);
      gl.draw(p.body, p.pos, p.mesh.uv, p.mesh.index, m, fx);
      if (p.blink && p.rig.blink && pose.blink > 0.05 && !this.opts.reducedMotion) {
        const [bx, by, bw, bh] = p.rig.blink.rect;
        const q = new Float32Array(8); const pts = [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]];
        pts.forEach(([x, y], i) => { const [dx, dy] = meshPoint(p.mesh, p.pos, x!, y!); q[i * 2] = dx; q[i * 2 + 1] = dy; });
        gl.draw(p.blink, q, QUAD_UV, QUAD_IDX, m, { ...fx, alpha: pose.alpha * Math.min(1, pose.blink * 1.4) });
      }
      if (forward) drawWeapon();
    }
  }
}

const QUAD_IDX = new Uint16Array([0, 1, 2, 2, 1, 3]);

/** Where a texture point ends up after deformation (bilinear in its mesh cell). */
export function meshPoint(mesh: Mesh, pos: Float32Array, x: number, y: number): [number, number] {
  const { cols, rows, base } = mesh;
  const x0 = base[0]!, y0 = base[1]!, x1 = base[(cols) * 2]!, y1 = base[(rows * (cols + 1)) * 2 + 1]!;
  const u = Math.min(0.9999, Math.max(0, (x - x0) / (x1 - x0))) * cols, v = Math.min(0.9999, Math.max(0, (y - y0) / (y1 - y0))) * rows;
  const c = Math.floor(u), r = Math.floor(v), fu = u - c, fv = v - r;
  const i00 = r * (cols + 1) + c, i10 = i00 + 1, i01 = i00 + cols + 1, i11 = i01 + 1;
  const px = (pos[i00 * 2]! * (1 - fu) + pos[i10 * 2]! * fu) * (1 - fv) + (pos[i01 * 2]! * (1 - fu) + pos[i11 * 2]! * fu) * fv;
  const py = (pos[i00 * 2 + 1]! * (1 - fu) + pos[i10 * 2 + 1]! * fu) * (1 - fv) + (pos[i01 * 2 + 1]! * (1 - fu) + pos[i11 * 2 + 1]! * fu) * fv;
  return [px, py];
}
