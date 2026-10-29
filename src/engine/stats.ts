/**
 * Derived character stats and Combat Power. Pure: (state, content) → numbers.
 * Order of folding: base → realms/stages → root → method → passives → gear → sets → beast bond → buffs → title.
 */
import { bondLevel } from "./beasts.ts";
import type { ContentIndex, Realm, Root, Method, Technique, GearBase, GearSet, Beast, Title } from "../content/index.ts";
import type { GameState } from "./state.ts";
import { gearStats, EQUIP_SLOTS } from "./inventory.ts";
import { ATTRIBUTES } from "../../schema/common.ts";

export type StatBlock = Record<string, number>;

export interface StatSource { label: string; stats: StatBlock }
export interface StatBreakdown { total: StatBlock; sources: StatSource[]; cp: number }

const add = (into: StatBlock, from: Record<string, number> | undefined, mult = 1) => {
  if (!from) return;
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v * mult;
};

/** Mastery level from xp for a mastery curve. */
export function masteryLevel(xp: number, curve: { max_level: number; xp_per_level: number }): number {
  return Math.min(curve.max_level, Math.floor(xp / curve.xp_per_level));
}
export const masteryMult = (xp: number, curve: { max_level: number; xp_per_level: number; per_level_bonus: number }) =>
  1 + masteryLevel(xp, curve) * curve.per_level_bonus;

export function computeStats(s: GameState, content: ContentIndex): StatBreakdown {
  const rules = content.rules;
  const sources: StatSource[] = [];
  const push = (label: string, stats: StatBlock) => { if (Object.keys(stats).length) sources.push({ label, stats }); };

  push("Base", { ...rules.base_stats });

  // Realms: every realm entered grants its realm_bonus; stages grant stage_growth (8 steps per finished realm).
  const realmStats: StatBlock = {};
  const current = content.get<Realm>(s.character.realm);
  for (const rid of s.progress.realmsEntered) {
    const r = content.get<Realm>(rid);
    add(realmStats, r.realm_bonus);
    const steps = r.order < current.order ? 8 : r.order === current.order ? s.character.stage - 1 : 0;
    add(realmStats, r.stage_growth, steps);
  }
  push("Cultivation", realmStats);

  push("Spiritual root", { ...content.get<Root>(s.character.root).bonuses });
  push("Elixirs", { ...s.character.permanent });

  const method = content.get<Method>(s.character.method);
  const mStats: StatBlock = {};
  add(mStats, method.bonuses, masteryMult(s.character.methodMastery[method.id] ?? 0, method.mastery));
  push("Method", mStats);

  const pStats: StatBlock = {};
  for (const tid of s.techniques.passives) {
    if (!tid) continue;
    const t = content.get<Technique>(tid);
    add(pStats, t.passive_bonuses, masteryMult(s.techniques.known[tid] ?? 0, t.mastery));
  }
  push("Passives", pStats);

  const gStats: StatBlock = {};
  const setCount = new Map<string, number>();
  for (const slot of EQUIP_SLOTS) {
    const uid = s.equipped[slot];
    if (uid === undefined) continue;
    const inst = s.inventory.gear[uid];
    if (!inst) continue;
    add(gStats, gearStats(content, inst));
    const base = content.get<GearBase>(inst.base);
    if (base.set) setCount.set(base.set, (setCount.get(base.set) ?? 0) + 1);
  }
  push("Equipment", gStats);

  const setStats: StatBlock = {};
  for (const [setId, n] of setCount) {
    const set = content.get<GearSet>(setId);
    for (const b of set.bonuses) if (n >= b.pieces) add(setStats, b.stats);
  }
  push("Set bonuses", setStats);

  if (s.beasts.active !== null) {
    const bi = s.beasts.owned[s.beasts.active];
    if (bi) {
      const beast = content.get<Beast>(bi.beast);
      const bStats: StatBlock = {};
      const lvl = bondLevel(content, bi);
      for (const m of beast.bond.milestones) if (lvl >= m.level) add(bStats, m.bonus);
      push("Spirit beast bond", bStats);
    }
  }

  const buffStats: StatBlock = {};
  for (const b of s.buffs) add(buffStats, b.stats);
  push("Buffs", buffStats);

  if (s.character.activeTitle) push("Title", { ...content.get<Title>(s.character.activeTitle).bonuses });

  const total: StatBlock = {};
  for (const src of sources) add(total, src.stats);
  for (const a of ATTRIBUTES) total[a] = Math.round((total[a] ?? 0) * 100) / 100;
  return { total, sources, cp: combatPower(total, content) };
}

/** Combat Power: weighted sum over attributes, baselines subtracted so defaults add nothing. */
export function combatPower(stats: StatBlock, content: ContentIndex): number {
  const w = content.rules.cp_weights, base = content.rules.cp_baseline;
  let cp = 0;
  for (const [k, v] of Object.entries(stats)) {
    const weight = k.startsWith("elem_") ? (w.elem ?? 0) : (w[k] ?? 0);
    cp += Math.max(0, v - (base[k] ?? 0)) * weight;
  }
  return Math.round(cp);
}

/** Active set bonuses for display: set id → pieces equipped. */
export function equippedSets(s: GameState, content: ContentIndex): Map<string, number> {
  const m = new Map<string, number>();
  for (const slot of EQUIP_SLOTS) {
    const uid = s.equipped[slot];
    const inst = uid === undefined ? undefined : s.inventory.gear[uid];
    const set = inst ? content.get<GearBase>(inst.base).set : undefined;
    if (set) m.set(set, (m.get(set) ?? 0) + 1);
  }
  return m;
}
