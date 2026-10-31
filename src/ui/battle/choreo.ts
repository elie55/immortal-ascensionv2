/**
 * Choreography (docs/BATTLE_STAGE.md §3): the engine's event stream grouped into beats, and each action beat
 * turned into a shot plan the stage executes (approach, strike, aftermath, return). Pure data, no DOM:
 * the stage only has to play what is planned here, and tests can check the plan in Node.
 */
import type { BattleEvent } from "../../engine/combat/types.ts";

export type Approach = "dash" | "none";
export type Shape = "slash" | "pierce" | "burst" | "beam" | "wave" | "pillar" | "ring" | "rain" | "glow" | "bolt";
export type Impact = "light" | "medium" | "heavy";
export type Camera = "none" | "push" | "zoom";

/** The `vfx` block of a technique or beast ability (schema/world.ts). */
export interface Vfx { approach: Approach; shape: Shape; impact: Impact; camera: Camera; color: string; sprite?: string }

/** What the plan needs to know about a unit: side and whether it is a melee figure. */
export interface UnitInfo { side: "ally" | "enemy"; alive: boolean }

type ActionEvent = Extract<BattleEvent, { t: "action" }>;
type HitEvent = Extract<BattleEvent, { t: "hit" }>;

export interface ActionBeat {
  kind: "action";
  action: ActionEvent;
  /** Everything the action caused, in order (hits, heals, shields, statuses, deaths, sp, phase, summon…). */
  effects: BattleEvent[];
}
export interface LoneBeat { kind: "lone"; event: BattleEvent }
export type Beat = ActionBeat | LoneBeat;

/** Events that an action causes; anything else closes the beat. */
const CAUSED = new Set<BattleEvent["t"]>(["hit", "heal", "shield", "status", "death", "sp", "phase", "summon", "ult_ready", "interrupt"]);

export function beats(events: BattleEvent[]): Beat[] {
  const out: Beat[] = [];
  let cur: ActionBeat | null = null;
  for (const e of events) {
    if (e.t === "action") { cur = { kind: "action", action: e, effects: [] }; out.push(cur); continue; }
    if (cur && CAUSED.has(e.t)) { cur.effects.push(e); continue; }
    cur = null;
    out.push({ kind: "lone", event: e });
  }
  return out;
}

/** One strike of a shot: the target, its hits in this beat, and whether it dies at the end of them. */
export interface Strike { target: number; hits: HitEvent[]; dies: boolean }

export interface Shot {
  actor: number;
  skill: string;
  name: string;
  ultimate: boolean;
  vfx: Vfx;
  /** The rig clip for the strike stage. */
  clip: "attack" | "cast" | "ult";
  /** Hostile targets in order; the first is where a dash goes. */
  strikes: Strike[];
  /** Friendly targets (heals, shields, buffs) for ring/glow effects. */
  friendly: number[];
  /** Landed hits in the beat (what the hit counter shows); 0 hides the counter. */
  hitCount: number;
  /** Total damage dealt in the beat (for the ultimate's cascade). */
  damage: number;
  /** Base durations at speed 1×, ms. */
  timing: { approach: number; strike: number; aftermath: number; back: number };
}

/** The basic strike has no technique entry: a plain melee hit for armed and unarmed figures alike. */
export const BASIC_VFX: Vfx = { approach: "dash", shape: "slash", impact: "light", camera: "none", color: "#f2f5ff" };
/** Counter-attacks hit from where the unit stands. */
export const COUNTER_VFX: Vfx = { approach: "none", shape: "slash", impact: "light", camera: "none", color: "#f2f5ff" };

export function plan(beat: ActionBeat, unitOf: (uid: number) => UnitInfo | undefined, vfxOf: (skill: string) => Vfx | undefined, ultimate: boolean): Shot {
  const a = beat.action;
  const vfx = a.skill === "basic" ? BASIC_VFX : a.skill === "counter" ? COUNTER_VFX : vfxOf(a.skill) ?? { ...BASIC_VFX, approach: "none", shape: "burst" };
  const actor = unitOf(a.actor);
  const hits = beat.effects.filter((e): e is HitEvent => e.t === "hit" && e.actor === a.actor);
  const deaths = new Set(beat.effects.filter((e) => e.t === "death").map((e) => (e as Extract<BattleEvent, { t: "death" }>).target));
  const hostile = a.targets.filter((t) => unitOf(t)?.side !== actor?.side);
  const friendly = a.targets.filter((t) => unitOf(t)?.side === actor?.side);
  // targets that were hit but not listed (reflects, splash) still get a strike entry so their numbers have a place
  const order = [...hostile, ...hits.map((h) => h.target).filter((t) => !hostile.includes(t))];
  const strikes: Strike[] = [...new Set(order)].map((t) => ({ target: t, hits: hits.filter((h) => h.target === t), dies: deaths.has(t) }));
  const landed = hits.filter((h) => !h.dodged);
  const damage = landed.reduce((s, h) => s + h.amount, 0);
  const clip = ultimate ? "ult" : vfx.approach === "dash" || (vfx.shape === "slash" || vfx.shape === "pierce") ? "attack" : "cast";
  // a dash needs someone to run at; spells and ultimates strike from where the actor stands
  const approach: Approach = ultimate || !strikes.length ? "none" : vfx.approach;
  const heavy = vfx.impact === "heavy" || a.heavy || a.charged;
  const timing = {
    approach: approach === "dash" ? 220 : 0,
    strike: ultimate ? 1500 : heavy ? 700 : 520,
    aftermath: 120 + Math.min(4, Math.max(0, landed.length - 1)) * 90 + (deaths.size ? 450 : 0),
    back: approach === "dash" ? 260 : 0,
  };
  return { actor: a.actor, skill: a.skill, name: a.name, ultimate, vfx: { ...vfx, approach }, clip, strikes, friendly, hitCount: landed.length, damage, timing };
}

/** Camera move for a shot: zoom on ultimates, push on dashes and heavy hits, nothing otherwise. */
export function cameraFor(shot: Shot): Camera {
  if (shot.ultimate) return "zoom";
  if (shot.vfx.camera === "zoom") return "zoom";
  if (shot.vfx.approach === "dash" || shot.vfx.impact === "heavy" || shot.vfx.camera === "push") return "push";
  return "none";
}

/** Total length of a shot at a given speed, for Auto pacing and tests. */
export function shotLength(shot: Shot, speed = 1): number {
  const t = shot.timing;
  return (t.approach + t.strike + t.aftermath + t.back) / speed;
}
