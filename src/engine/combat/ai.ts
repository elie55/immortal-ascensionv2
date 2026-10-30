/** Target resolution, auto-battle priority rules (allies) and strategy AI (enemies). */
import { nextFloat } from "../rng.ts";
import type { Battle } from "./battle.ts";
import type { Combatant, Skill, AutoRuleResolved } from "./types.ts";

export type Choice = { skill: Skill; target?: number };

const isHeal = (s: Skill) => (s.healPct ?? 0) > 0 || s.applies.some((a) => a.status === "status.regen");
const isShield = (s: Skill) => (s.shieldPct ?? 0) > 0 || s.applies.some((a) => a.status === "status.shield");
const isDamage = (s: Skill) => s.power > 0 && s.kind !== "basic";
const isDebuff = (b: Battle, s: Skill) => s.applies.some((a) => { const d = b.c.find<any>(a.status); return d && (d.kind === "debuff" || d.kind === "control" || d.kind === "dot"); });
const score = (s: Skill) => s.power * s.hits * s.masteryMult;

function pickTarget(b: Battle, actor: Combatant, mode: string): Combatant | undefined {
  const foes = b.alive(actor.side === "ally" ? "enemy" : "ally");
  if (!foes.length) return undefined;
  switch (mode) {
    case "lowest_hp": case "weakest": return foes.reduce((a, c) => (c.hp / c.maxHp < a.hp / a.maxHp ? c : a));
    case "highest_cp": case "strongest": return foes.reduce((a, c) => (c.cp > a.cp ? c : a));
    case "highest_atk": return foes.reduce((a, c) => (b.eff(c, "atk") > b.eff(a, "atk") ? c : a));
    case "random": return foes[Math.floor(nextFloat(b.rng) * foes.length)];
    default: // prefer bosses, then the lowest HP
      return foes.find((f) => f.kind === "boss") ?? foes.reduce((a, c) => (c.hp / c.maxHp < a.hp / a.maxHp ? c : a));
  }
}

/** Targets for a skill, honouring its targeting mode and an optional explicit target uid. */
export function resolveTargets(b: Battle, actor: Combatant, skill: Skill, explicit?: number): Combatant[] {
  const foes = b.alive(actor.side === "ally" ? "enemy" : "ally");
  const friends = b.alive(actor.side);
  const pickFoe = () => (explicit !== undefined ? foes.find((f) => f.uid === explicit) : undefined) ?? pickTarget(b, actor, "default");
  switch (skill.targeting) {
    case "all_enemies": return foes;
    case "self": return [actor];
    case "all_allies": return friends;
    case "ally": { const ex = explicit !== undefined ? friends.find((f) => f.uid === explicit) : undefined; return [ex ?? friends.reduce((a, c) => (c.hp / c.maxHp < a.hp / a.maxHp ? c : a))]; }
    case "lowest_hp_enemy": return [pickTarget(b, actor, "lowest_hp")!].filter(Boolean);
    case "highest_cp_enemy": return [pickTarget(b, actor, "highest_cp")!].filter(Boolean);
    case "random": return [pickTarget(b, actor, "random")!].filter(Boolean);
    default: { const t = pickFoe(); return t ? [t] : []; }
  }
}

/** Player / ally action from the auto-battle priority list. Falls back to a basic attack. */
export function chooseAuto(b: Battle, actor: Combatant, rules: AutoRuleResolved[]): Choice {
  const avail = b.availableSkills(actor);
  const basic = actor.skills.find((s) => s.kind === "basic")!;
  for (const r of rules) {
    if (!condition(b, actor, r)) continue;
    const cands = candidates(b, avail, r.slot);
    if (!cands.length) continue;
    const skill = cands[0]!;
    const tgt = r.target !== "default" && skill.targeting === "single" ? pickTarget(b, actor, r.target) : undefined;
    return { skill, target: tgt?.uid };
  }
  return { skill: basic };
}

function candidates(b: Battle, avail: Skill[], slot: string): Skill[] {
  switch (slot) {
    case "ultimate": return avail.filter((s) => s.kind === "ultimate");
    case "heal": return avail.filter(isHeal).sort((x, y) => (y.healPct ?? 0) - (x.healPct ?? 0));
    case "shield": return avail.filter(isShield);
    case "damage": return avail.filter(isDamage).sort((x, y) => score(y) - score(x));
    case "debuff": return avail.filter((s) => isDebuff(b, s)).sort((x, y) => score(y) - score(x));
    case "basic": return avail.filter((s) => s.kind === "basic");
    case "beast": return avail.filter((s) => s.kind === "beast");
    default: return avail.filter((s) => s.slot === slot);
  }
}

function condition(b: Battle, actor: Combatant, r: AutoRuleResolved): boolean {
  switch (r.when) {
    case "never": return false;
    case "hp_below": return actor.hp / actor.maxHp * 100 < (r.value ?? 50);
    case "sp_above": return actor.maxSp > 0 && actor.sp / actor.maxSp * 100 > (r.value ?? 50);
    case "boss_only": return !!b.opts.isBossFight || b.alive("enemy").some((e) => e.kind === "boss");
    case "no_shield": return actor.shield <= 0;
    case "enemies_at_least": return b.alive(actor.side === "ally" ? "enemy" : "ally").length >= (r.value ?? 2);
    case "big_attack": return b.alive(actor.side === "ally" ? "enemy" : "ally").some((e) => !!e.telegraph || (!!e.boss?.charging && e.boss.charging.turnsLeft <= 1));
    default: return true;
  }
}

/** Enemy action by strategy. Bosses prefer their current phase's techniques. */
export function chooseEnemy(b: Battle, actor: Combatant): Choice {
  const avail = b.availableSkills(actor);
  const basic = actor.skills.find((s) => s.kind === "basic")!;
  const ult = avail.find((s) => s.kind === "ultimate");
  if (ult) return { skill: ult };
  const phaseTechs: string[] | undefined = (actor as any).phaseTechs;
  const pref = (list: Skill[]) => (phaseTechs ? list.filter((s) => s.kind === "basic" || phaseTechs.includes(s.id)) : list);
  const atks = pref(avail.filter(isDamage)).sort((x, y) => score(y) - score(x));
  const heals = avail.filter(isHeal), shields = avail.filter(isShield), debuffs = pref(avail.filter((s) => isDebuff(b, s)));
  const foes = b.alive(actor.side === "ally" ? "enemy" : "ally");
  const friends = b.alive(actor.side);
  const low = actor.hp / actor.maxHp;
  const strat = actor.ai?.strategy ?? "aggressive";
  const target = (m: string) => pickTarget(b, actor, m)?.uid;
  switch (strat) {
    case "berserker": return atks[0] ? { skill: atks[0], target: target("highest_atk") } : { skill: basic, target: target("highest_atk") };
    case "defensive":
      if (low < 0.5 && heals[0]) return { skill: heals[0], target: actor.uid };
      if (low < 0.7 && shields[0] && actor.shield <= 0) return { skill: shields[0], target: actor.uid };
      return atks[0] ? { skill: atks[0], target: target("lowest_hp") } : { skill: basic, target: target("lowest_hp") };
    case "support": {
      const hurt = friends.filter((f) => f.hp / f.maxHp < 0.7).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
      if (hurt && heals[0]) return { skill: heals[0], target: hurt.uid };
      const bare = friends.find((f) => f.shield <= 0 && f.uid !== actor.uid) ?? (actor.shield <= 0 ? actor : undefined);
      if (bare && shields[0]) return { skill: shields[0], target: bare.uid };
      return atks[0] ? { skill: atks[0], target: target("lowest_hp") } : { skill: basic, target: target("lowest_hp") };
    }
    case "trickster": {
      const victim = foes.find((f) => debuffs.some((s) => s.applies.some((a) => !f.statuses.some((st) => st.id === a.status))));
      if (victim && debuffs[0]) return { skill: debuffs[0], target: victim.uid };
      return atks[0] ? { skill: atks[0], target: target("random") } : { skill: basic, target: target("random") };
    }
    case "caster": return atks[0] ? { skill: atks[0], target: target("highest_cp") } : { skill: basic, target: target("highest_cp") };
    case "guardian":
      if (actor.shield <= 0 && shields[0]) return { skill: shields[0], target: actor.uid };
      return atks[0] ? { skill: atks[0], target: target("highest_cp") } : { skill: basic, target: target("highest_cp") };
    default: return atks[0] ? { skill: atks[0], target: target("lowest_hp") } : { skill: basic, target: target("lowest_hp") };
  }
}
