/** Battle data model. Plain objects; the Battle class mutates them and emits BattleEvents for the UI. */
import type { RngState } from "../rng.ts";

export type Side = "ally" | "enemy";
export type HitKind = "attack" | "dot" | "reflect" | "counter" | "hazard";

export interface StatusInstance {
  id: string;            // status.*
  turns: number;         // remaining turns (ticked at the end of the holder's turn)
  stacks: number;
  sourceAtk: number;     // for dot ticks scaled by the applier's attack
  potency?: number;      // overrides (e.g. reflect %)
}

export interface Skill {
  id: string;            // tech.* or btech.* or "basic"
  name: string;
  kind: "basic" | "active" | "ultimate" | "beast";
  element: string;       // elem.*
  power: number;         // % of attack (0 = non-damaging)
  hits: number;
  healPct?: number;
  shieldPct?: number;
  spCost: number;
  cooldown: number;
  targeting: string;
  applies: { status: string; chance: number; turns: number; potency?: number }[];
  masteryMult: number;
  ultCharge?: number;
  /** Slot key in the player's loadout ("a0".."a3", "ultimate", "beast") for auto rules. */
  slot?: string;
}

export interface GearSpecial { kind: string; status?: string; attribute?: string; value?: number; chance?: number; description: string }

export interface BossProfile {
  phases: { name: string; hp_threshold: number; techniques: string[]; summons: { enemy: string; count: number }[]; shield_pct?: number; enrage?: { atk_mult: number; spd_mult: number }; charged_attack?: { tech: string; turns_to_charge: number } }[];
  weaknesses: string[];
  phase: number;                               // index of the current phase
  charging: { tech: string; turnsLeft: number } | null;
}

export interface Combatant {
  uid: number;
  id: string;            // npc.*, enemy.*, boss.*, beast.*
  name: string;
  side: Side;
  kind: "player" | "beast" | "companion" | "enemy" | "boss" | "summon";
  element: string;
  base: Record<string, number>;   // stats before status modifiers
  maxHp: number;
  hp: number;
  maxSp: number;
  sp: number;
  shield: number;
  ult: number;           // 0..100 charge
  gauge: number;         // turn gauge
  skills: Skill[];
  cooldowns: Record<string, number>;
  statuses: StatusInstance[];
  specials: GearSpecial[];
  resistances: Record<string, number>;
  boss?: BossProfile;
  ai: { strategy: string; rules: string[] } | null;   // null = player (manual or auto rules)
  alive: boolean;
  turns: number;         // own turns taken
  stats: { dealt: number; taken: number; healed: number; kills: number };
  art?: string;
  cp: number;
  masteryXp: number;
  lootTable?: string;
  realmOrder: number;
}

export interface AutoRuleResolved { slot: string; when: string; value?: number; target: string }

export type BattleEvent =
  | { t: "start"; wave: number; waves: number }
  | { t: "turn"; actor: number; round: number }
  | { t: "skip"; actor: number; reason: string }
  | { t: "action"; actor: number; skill: string; name: string; targets: number[]; charged?: boolean }
  | { t: "hit"; actor: number; target: number; amount: number; crit: boolean; element: string; absorbed: number; dodged?: boolean; kind: HitKind }
  | { t: "heal"; actor: number; target: number; amount: number; kind: "heal" | "regen" | "lifesteal" | "on_kill" }
  | { t: "shield"; actor: number; target: number; amount: number }
  | { t: "status"; actor: number; target: number; status: string; result: "applied" | "stacked" | "resisted" | "expired" | "immune" }
  | { t: "sp"; actor: number; delta: number }
  | { t: "ult_ready"; actor: number }
  | { t: "death"; target: number; by: number }
  | { t: "phase"; actor: number; name: string; index: number }
  | { t: "summon"; actor: number; spawned: number[] }
  | { t: "charge"; actor: number; skill: string; turns: number }
  | { t: "interrupt"; actor: number }
  | { t: "hazard"; name: string; element: string; wave: number; waves: number }
  | { t: "end"; result: "victory" | "defeat" | "timeout" | "fled" };

export interface BattleOptions {
  /** Multipliers from dungeon modifiers, tribulations etc. */
  enemyDmgMult?: number;
  enemyHpMult?: number;
  allyDmgMult?: number;
  /** Tribulation lightning: one entry per wave; the wave advances every `turnsPerWave` player turns. */
  hazard?: { name: string; source: number; turnsPerWave: number; waves: { element: string; power: number; bolts: number }[] };
  /** Survive this many player turns to win even if enemies remain (tribulations). */
  surviveRounds?: number;
  isBossFight?: boolean;
}

export interface BattleSummary {
  result: "victory" | "defeat" | "timeout" | "fled";
  rounds: number;
  dealt: number; taken: number; healed: number;
  killed: string[];                 // enemy ids defeated (incl. summons)
  playerHp: number; playerSp: number; playerUlt: number;
}

export interface PlayerChoice { skill: string; target?: number }
export type RngLike = RngState;
