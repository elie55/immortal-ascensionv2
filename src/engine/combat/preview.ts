/**
 * What a technique does right now with the player's current stats and its mastery (the Techniques screen):
 * damage per target before the target's defense, element matchup and critical hits (the same terms as
 * `Battle.strike`), or the heal / shield it gives. Pure; tested in tests/tech-preview.test.ts.
 */
import type { ContentIndex } from "../../content/index.ts";
import type { GameState } from "../state.ts";
import { buildPlayer, techSkill } from "./build.ts";
import { masteryLevel } from "../stats.ts";

export interface TechPreview {
  /** What the number is: damage per target, healing, shield, or nothing to show (a pure buff / debuff). */
  kind: "damage" | "heal" | "shield" | "none";
  /** Per target and per cast (all hits added up). */
  value: number;
  hits: number;
  /** All enemies / all allies: the value applies to each one. */
  each: boolean;
  /** Mastery level and the multiplier it gives (1.3 at level 10 with +3% a level). */
  level: number;
  mult: number;
}

export function techPreview(s: GameState, c: ContentIndex, id: string): TechPreview {
  const t = c.get<any>(id);
  const xp = s.techniques.known[id] ?? 0;
  const skill = techSkill(c, id, xp);
  const level = t.mastery ? masteryLevel(xp, t.mastery) : 0;
  const each = t.targeting === "all_enemies" || t.targeting === "all_allies";
  const base = { hits: t.hits ?? 1, each, level, mult: skill.masteryMult };
  const p = buildPlayer(s, c);
  const R = c.combat.damage;
  const cap = (k: string, v: number) => { const caps = c.combat.caps as Record<string, number>; return caps[k] !== undefined ? Math.min(caps[k]!, v) : k.startsWith("elem_") ? Math.min(caps.elem_diff ?? v, v) : v; };
  const st = (k: string) => cap(k, p.base[k] ?? 0);
  if (t.power > 0) {
    let raw = (st("atk") + st("sp_power") * R.sp_power_weight) * (t.power / 100) * skill.masteryMult;
    const el = (t.element ?? "").split(".")[1];
    if (el && el !== "none") raw *= 1 + Math.min(c.combat.caps.elem_diff / 100, st(`elem_dmg.${el}`) / 100);   // your element bonus, against no resistance
    return { kind: "damage", value: Math.round(raw * base.hits), ...base };
  }
  if (t.heal_pct) return { kind: "heal", value: Math.round(p.maxHp * t.heal_pct / 100 * skill.masteryMult), ...base };
  if (t.shield_pct_max_hp) return { kind: "shield", value: Math.round(p.maxHp * t.shield_pct_max_hp / 100 * skill.masteryMult), ...base };
  return { kind: "none", value: 0, ...base };
}
