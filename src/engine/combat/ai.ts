/**
 * Target resolution, auto-battle priority rules (allies) and strategy AI (enemies).
 *
 * Enemies focus fire (the whole side keeps hitting the ally it started on), pick the technique that does the most
 * expected damage to the chosen target (so the element advantage counts), and bosses hold their ultimate for an
 * opening (a later phase, an unshielded target) instead of firing it the moment it charges. `opts.legacyAi` keeps the
 * older behaviour so tools/balance/ai_eval.ts can measure the difference.
 */
import { nextFloat } from "../rng.ts";
import type { Battle } from "./battle.ts";
import type { Combatant, Skill, AutoRuleResolved } from "./types.ts";

export type Choice = { skill: Skill; target?: number };

const isHeal = (s: Skill) => (s.healPct ?? 0) > 0 || s.applies.some((a) => a.status === "status.regen");
const isShield = (s: Skill) => (s.shieldPct ?? 0) > 0 || s.applies.some((a) => a.status === "status.shield");
const isDamage = (s: Skill) => s.power > 0 && (s.kind === "active" || s.kind === "beast");
const isTempo = (s: Skill) => (s.turnShift ?? 0) > 0 && s.power === 0 && !s.ultCost;
const isDebuff = (b: Battle, s: Skill) => s.applies.some((a) => { const d = b.c.find<any>(a.status); return d && (d.kind === "debuff" || d.kind === "control" || d.kind === "dot"); });
const score = (s: Skill) => s.power * s.hits * s.masteryMult;
const ratio = (u: Combatant) => u.hp / Math.max(1, u.maxHp);

/** Expected damage of a damaging skill on a target, every hit counted; AoE skills sum over the side. */
function expected(b: Battle, actor: Combatant, s: Skill, tgt: Combatant): number {
  if (s.power <= 0) return 0;
  const foes = b.alive(actor.side === "ally" ? "enemy" : "ally");
  return s.targeting === "all_enemies" ? foes.reduce((n, f) => n + b.estimate(actor, f, s), 0) : b.estimate(actor, tgt, s);
}

/**
 * An enemy the skill can bring down this turn (shield included), the lowest HP among them. Enemies do not count a
 * spirit beast as a kill worth a turn while the cultivator stands (its HP pool is small and so is its bite).
 */
function killable(b: Battle, actor: Combatant, s: Skill): Combatant | undefined {
  const foes = b.alive(actor.side === "ally" ? "enemy" : "ally");
  const list = actor.side === "enemy" && foes.some((f) => f.kind !== "beast") ? foes.filter((f) => f.kind !== "beast") : foes;
  return list.filter((f) => b.estimate(actor, f, s) >= f.hp + f.shield).sort((x, y) => x.hp - y.hp)[0];
}

function pickTarget(b: Battle, actor: Combatant, mode: string, skill?: Skill): Combatant | undefined {
  const foes = b.alive(actor.side === "ally" ? "enemy" : "ally");
  if (!foes.length) return undefined;
  switch (mode) {
    case "lowest_hp": case "weakest": return foes.reduce((a, c) => (ratio(c) < ratio(a) ? c : a));
    case "highest_cp": case "strongest": return foes.reduce((a, c) => (c.cp > a.cp ? c : a));
    case "highest_atk": return foes.reduce((a, c) => (b.eff(c, "atk") > b.eff(a, "atk") ? c : a));
    case "random": return foes[Math.floor(nextFloat(b.rng) * foes.length)];
    case "focus": return (skill && killable(b, actor, skill)) ?? foes.find((f) => f.kind === "boss") ?? foes.reduce((a, c) => (ratio(c) < ratio(a) ? c : a));
    case "weak_to": {
      if (!skill) return pickTarget(b, actor, "default");
      const best = foes.map((f) => ({ f, m: b.elementMult(actor, f, skill.element) })).sort((x, y) => y.m - x.m)[0]!;
      return best.m > 1 ? best.f : pickTarget(b, actor, "default");
    }
    default:
      // allies: the boss first, then the lowest HP; enemies: focus fire on one ally until it falls
      if (actor.side === "ally") return foes.find((f) => f.kind === "boss") ?? foes.reduce((a, c) => (ratio(c) < ratio(a) ? c : a));
      return focusTarget(b, foes);
  }
}

/** The enemy side's shared target: kept while it lives, otherwise the most fragile ally (beasts last, they are small). */
function focusTarget(b: Battle, allies: Combatant[]): Combatant {
  const cur = allies.find((u) => u.uid === b.focus);
  if (cur) return cur;
  const pool = allies.filter((u) => u.kind !== "beast");
  const pick = (pool.length ? pool : allies).reduce((a, c) => (c.hp + c.shield < a.hp + a.shield ? c : a));
  b.focus = pick.uid;
  return pick;
}

/** Targets for a skill, honouring its targeting mode and an optional explicit target uid. */
export function resolveTargets(b: Battle, actor: Combatant, skill: Skill, explicit?: number): Combatant[] {
  const foes = b.alive(actor.side === "ally" ? "enemy" : "ally");
  const friends = b.alive(actor.side);
  const pickFoe = () => (explicit !== undefined ? foes.find((f) => f.uid === explicit) : undefined) ?? pickTarget(b, actor, b.opts.legacyAi && actor.side === "enemy" ? "lowest_hp" : "default", skill);
  switch (skill.targeting) {
    case "all_enemies": return foes;
    case "self": return [actor];
    case "all_allies": return friends;
    case "ally": { const ex = explicit !== undefined ? friends.find((f) => f.uid === explicit) : undefined; return [ex ?? friends.reduce((a, c) => (ratio(c) < ratio(a) ? c : a))]; }
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
    const cands = candidates(b, actor, avail, r.slot, r.when);
    if (!cands.length) continue;
    const skill = cands[0]!;
    const tgt = r.target !== "default" && skill.targeting === "single" ? pickTarget(b, actor, r.target, skill) : undefined;
    return { skill, target: tgt?.uid };
  }
  return { skill: basic };
}

function candidates(b: Battle, actor: Combatant, avail: Skill[], slot: string, when: string): Skill[] {
  switch (slot) {
    case "ultimate": return avail.filter((s) => s.kind === "ultimate");
    case "surge": return avail.filter((s) => !!s.ultCost);
    case "heal": return avail.filter(isHeal).sort((x, y) => (y.healPct ?? 0) - (x.healPct ?? 0));
    case "shield": return avail.filter(isShield);
    case "tempo": return avail.filter(isTempo);
    case "damage": {
      const dmg = avail.filter(isDamage);
      if (when === "can_finish") return dmg.filter((s) => killable(b, actor, s)).sort((x, y) => x.spCost - y.spCost);
      if (when === "element_edge") return dmg.filter((s) => b.alive(actor.side === "ally" ? "enemy" : "ally").some((f) => b.elementMult(actor, f, s.element) > 1)).sort((x, y) => score(y) - score(x));
      return dmg.sort((x, y) => score(y) - score(x));
    }
    case "debuff": return avail.filter((s) => isDebuff(b, s)).sort((x, y) => score(y) - score(x));
    case "basic": return avail.filter((s) => s.kind === "basic");
    case "beast": return avail.filter((s) => s.kind === "beast");
    default: return avail.filter((s) => s.slot === slot);
  }
}

function condition(b: Battle, actor: Combatant, r: AutoRuleResolved): boolean {
  const foes = () => b.alive(actor.side === "ally" ? "enemy" : "ally");
  switch (r.when) {
    case "never": return false;
    case "hp_below": return ratio(actor) * 100 < (r.value ?? 50);
    case "ally_hp_below": return b.alive(actor.side).some((u) => u.uid !== actor.uid && ratio(u) * 100 < (r.value ?? 40));
    case "sp_above": return actor.maxSp > 0 && actor.sp / actor.maxSp * 100 > (r.value ?? 50);
    case "ult_above": return actor.ult > (r.value ?? 50);
    case "boss_only": return !!b.opts.isBossFight || foes().some((e) => e.kind === "boss");
    case "no_shield": return actor.shield <= 0;
    case "enemies_at_least": return foes().length >= (r.value ?? 2);
    // a wound-up or charged blow is coming, or a brand on the party is about to detonate
    case "big_attack": return foes().some((e) => !!e.telegraph || (!!e.boss?.charging && e.boss.charging.turnsLeft <= 1) || (e.boss?.signature?.kind === "mark" && !!e.boss.sig.mark && e.boss.sig.mark.left <= 1)) || b.alive(actor.side).some((u) => u.statuses.some((s) => s.id === "status.marked"));
    case "can_finish": return b.availableSkills(actor).some((s) => isDamage(s) && killable(b, actor, s));
    case "element_edge": return b.availableSkills(actor).some((s) => isDamage(s) && foes().some((f) => b.elementMult(actor, f, s.element) > 1));
    default: return true;
  }
}

/** Enemy action by strategy. Bosses prefer their current phase's techniques. */
export function chooseEnemy(b: Battle, actor: Combatant): Choice {
  if (b.opts.legacyAi) return chooseEnemyLegacy(b, actor);
  const avail = b.availableSkills(actor);
  const basic = actor.skills.find((s) => s.kind === "basic")!;
  const foes = b.alive(actor.side === "ally" ? "enemy" : "ally");
  const friends = b.alive(actor.side);
  const strat = actor.ai?.strategy ?? "aggressive";
  const phaseTechs: string[] | undefined = (actor as any).phaseTechs;
  const pref = (list: Skill[]) => (phaseTechs ? list.filter((s) => s.kind === "basic" || phaseTechs.includes(s.id)) : list);
  // the target first, so the technique can be judged against it
  const mode = strat === "berserker" ? "highest_atk" : strat === "caster" || strat === "guardian" ? "highest_cp" : strat === "trickster" ? "random" : "default";
  const tgt = pickTarget(b, actor, mode)!;
  if (!tgt) return { skill: basic };
  const byDamage = (list: Skill[]) => list.sort((x, y) => expected(b, actor, y, tgt) - expected(b, actor, x, tgt));
  const atks = byDamage(pref(avail.filter(isDamage)));
  const heals = avail.filter(isHeal), shields = avail.filter(isShield), debuffs = pref(avail.filter((s) => isDebuff(b, s)));
  const ult = avail.find((s) => s.kind === "ultimate");
  // the ultimate: a boss waits for an opening (a later phase, or a bare target), the rest fire when a target is bare
  if (ult) {
    const bare = foes.filter((f) => f.shield <= 0);
    const open = actor.boss ? actor.boss.phase > 0 || (tgt.shield <= 0 && (ratio(tgt) < 0.7 || ratio(actor) < 0.6)) : bare.length > 0 || foes.length === 1;
    if (open) return { skill: ult, target: ult.targeting === "single" ? (tgt.shield <= 0 ? tgt : bare[0] ?? tgt).uid : undefined };
  }
  const low = ratio(actor);
  const finisher = atks.find((s) => killable(b, actor, s));
  // a stance when hurt and not already braced; a step on the first turn, before anyone has acted twice
  const stance = avail.find((s) => s.applies.some((a) => a.status === "status.counter_stance"));
  const step = avail.find(isTempo);
  const attack = (): Choice => {
    if (stance && low < 0.7 && !b.has(actor, "status.counter_stance") && !finisher) return { skill: stance, target: actor.uid };
    if (step && actor.turns <= 1 && !finisher) return { skill: step, target: actor.uid };
    const s = finisher ?? atks[0]; return s ? { skill: s, target: s === finisher ? killable(b, actor, s)!.uid : tgt.uid } : { skill: basic, target: tgt.uid };
  };
  switch (strat) {
    case "defensive":
      if (low < 0.5 && heals[0]) return { skill: heals[0], target: actor.uid };
      if (low < 0.7 && shields[0] && actor.shield <= 0) return { skill: shields[0], target: actor.uid };
      return attack();
    case "support": {
      // heal whoever is hurt enough for the heal to count; shield the bare before the hurt
      const hurt = friends.filter((f) => ratio(f) < 0.55).sort((x, y) => ratio(x) - ratio(y))[0];
      if (hurt && heals[0]) return { skill: heals[0], target: hurt.uid };
      const bare = friends.filter((f) => f.shield <= 0 && f.uid !== actor.uid).sort((x, y) => ratio(x) - ratio(y))[0] ?? (actor.shield <= 0 ? actor : undefined);
      if (bare && shields[0]) return { skill: shields[0], target: bare.uid };
      return attack();
    }
    case "trickster": {
      const victim = foes.find((f) => debuffs.some((s) => s.applies.some((a) => !f.statuses.some((st) => st.id === a.status))));
      if (victim && debuffs[0] && !finisher) return { skill: debuffs[0], target: victim.uid };
      return attack();
    }
    case "guardian":
      if (actor.shield <= 0 && shields[0]) return { skill: shields[0], target: actor.uid };
      return attack();
    default: return attack();
  }
}

/** The enemy AI before the focus-fire pass (kept for ai_eval.ts). */
function chooseEnemyLegacy(b: Battle, actor: Combatant): Choice {
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
  const low = ratio(actor);
  const strat = actor.ai?.strategy ?? "aggressive";
  const target = (m: string) => pickTarget(b, actor, m)?.uid;
  switch (strat) {
    case "berserker": return atks[0] ? { skill: atks[0], target: target("highest_atk") } : { skill: basic, target: target("highest_atk") };
    case "defensive":
      if (low < 0.5 && heals[0]) return { skill: heals[0], target: actor.uid };
      if (low < 0.7 && shields[0] && actor.shield <= 0) return { skill: shields[0], target: actor.uid };
      return atks[0] ? { skill: atks[0], target: target("lowest_hp") } : { skill: basic, target: target("lowest_hp") };
    case "support": {
      const hurt = friends.filter((f) => ratio(f) < 0.7).sort((x, y) => ratio(x) - ratio(y))[0];
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
