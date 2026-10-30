/** Build Combatants from the player state, enemies, bosses and beasts. */
import type { ContentIndex, Boss, Technique, Beast, BeastAbility } from "../../content/index.ts";
import type { GameState } from "../state.ts";
import { computeStats, masteryMult, type StatBlock } from "../stats.ts";
import { EQUIP_SLOTS } from "../inventory.ts";
import type { Combatant, Skill, GearSpecial } from "./types.ts";
import { companionCombatant } from "../companions.ts";

export const BASIC: Omit<Skill, "element" | "power" | "masteryMult"> = { id: "basic", name: "Attack", kind: "basic", hits: 1, spCost: 0, cooldown: 0, targeting: "single", applies: [] };

function techSkill(c: ContentIndex, id: string, masteryXp: number, slot?: string): Skill {
  const t = c.get<Technique>(id);
  return {
    id, name: t.name, kind: t.kind === "ultimate" ? "ultimate" : "active", element: t.element, power: t.power, hits: t.hits, healPct: t.heal_pct, shieldPct: t.shield_pct_max_hp,
    spCost: t.sp_cost, cooldown: t.cooldown, targeting: t.targeting, applies: t.applies.map((a) => ({ status: a.status, chance: a.chance, turns: a.turns, potency: a.potency })),
    masteryMult: masteryMult(masteryXp, t.mastery), ultCharge: t.ult_charge, slot,
  };
}

let nextUid = 1;
export const resetUids = () => { nextUid = 1; };

function make(partial: Omit<Combatant, "uid" | "hp" | "sp" | "shield" | "ult" | "gauge" | "cooldowns" | "statuses" | "alive" | "turns" | "stats"> & { hp?: number; sp?: number }): Combatant {
  return { uid: nextUid++, hp: partial.hp ?? partial.maxHp, sp: partial.sp ?? partial.maxSp, shield: 0, ult: 0, gauge: 0, cooldowns: {}, statuses: [], alive: true, turns: 0, stats: { dealt: 0, taken: 0, healed: 0, kills: 0 }, ...partial };
}

/** The player, from her computed stats, loadout and gear specials. `hp`/`sp` carry over between waves. */
export function buildPlayer(s: GameState, c: ContentIndex, carry?: { hp?: number; sp?: number; ult?: number }): Combatant {
  const st = computeStats(s, c).total;
  const base: StatBlock = { ...st };
  const specials: GearSpecial[] = [];
  for (const slot of EQUIP_SLOTS) {
    const uid = s.equipped[slot]; const inst = uid !== undefined ? s.inventory.gear[uid] : undefined;
    if (!inst) continue;
    for (const e of inst.specials as GearSpecial[]) {
      if (e.kind === "stat_mult" && e.attribute) base[e.attribute] = (base[e.attribute] ?? 0) * (1 + (e.value ?? 0) / 100);
      else if (e.kind === "elem_dmg" && e.attribute) base[e.attribute] = (base[e.attribute] ?? 0) + (e.value ?? 0);
      else specials.push(e);
    }
  }
  // Active beast passive bonuses apply to the player (elemental affinity etc.)
  if (s.beasts.active !== null) {
    const bi = s.beasts.owned[s.beasts.active];
    if (bi) {
      const beast = c.get<Beast>(bi.beast);
      const stage = beast.stages.find((x) => x.key === bi.stage) ?? beast.stages[0]!;
      const pas = c.get<BeastAbility>(stage.passive);
      for (const [k, v] of Object.entries(pas.passive_bonuses)) base[k] = (base[k] ?? 0) + v;
    }
  }
  const skills: Skill[] = [{ ...BASIC, element: c.get<any>(s.character.root).elements[0] ?? "elem.metal", power: c.combat.damage.basic_power, masteryMult: 1 }];
  s.techniques.actives.forEach((id, i) => { if (id) skills.push(techSkill(c, id, s.techniques.known[id] ?? 0, `a${i}`)); });
  if (s.techniques.ultimate) skills.push(techSkill(c, s.techniques.ultimate, s.techniques.known[s.techniques.ultimate] ?? 0, "ultimate"));
  const maxHp = Math.max(1, Math.round(base.hp ?? 1)), maxSp = Math.max(0, Math.round(base.sp_energy ?? 0));
  const p = make({
    id: s.character.npc, name: s.character.name, side: "ally", kind: "player", element: c.get<any>(s.character.root).elements[0] ?? "elem.metal", base, maxHp, maxSp,
    hp: carry?.hp !== undefined ? Math.min(maxHp, Math.max(1, carry.hp)) : (s.character.hp !== undefined ? Math.min(maxHp, Math.max(1, s.character.hp)) : maxHp),
    sp: carry?.sp !== undefined ? Math.min(maxSp, carry.sp) : maxSp,
    skills, specials, resistances: {}, ai: null, art: c.artAny(s.character.npc, "battle", "full_body"), cp: computeStats(s, c).cp, masteryXp: 0, realmOrder: c.get<any>(s.character.realm).order,
  });
  p.ult = carry?.ult ?? 0;
  return p;
}

/** The active spirit beast as an ally. Stats scale with level; its active ability is its only skill. */
export function buildBeast(s: GameState, c: ContentIndex): Combatant | null {
  if (s.beasts.active === null) return null;
  const bi = s.beasts.owned[s.beasts.active];
  if (!bi) return null;
  const beast = c.get<Beast>(bi.beast);
  const stage = beast.stages.find((x) => x.key === bi.stage) ?? beast.stages[0]!;
  const mult = 1 + (bi.level - 1) * c.combat.companions.beast_level_stat_pct / 100;
  const base: StatBlock = { crit: 5, crit_dmg: 150, acc: 90, eva: 5, sp_power: 0, sp_energy: 0 };
  for (const [k, v] of Object.entries(stage.stats)) base[k] = v * mult;
  const act = c.get<BeastAbility>(stage.active);
  const skills: Skill[] = [
    { ...BASIC, element: beast.element, power: c.combat.damage.basic_power * 0.8, masteryMult: 1 },
    { id: act.id, name: act.name, kind: "beast", element: act.element, power: act.power, hits: 1, healPct: act.heal_pct, spCost: 0, cooldown: act.cooldown || c.combat.companions.beast_active_cooldown,
      targeting: act.power > 0 ? "single" : (act.heal_pct ? "ally" : "self"), applies: act.applies.map((a) => ({ status: a.status, chance: a.chance, turns: a.turns, potency: a.potency })), masteryMult: 1, slot: "beast" },
  ];
  return make({ id: beast.id, name: bi.name, side: "ally", kind: "beast", element: beast.element, base, maxHp: Math.max(1, Math.round(base.hp ?? 1)), maxSp: 0, skills, specials: [], resistances: {},
    ai: { strategy: "aggressive", rules: [] }, art: c.art(beast.id, `battle_${bi.stage}`), cp: 0, masteryXp: 0, realmOrder: 1 });
}

/** A bonded Dao companion as an ally (see companions.ts for scaling). */
export function buildCompanion(s: GameState, c: ContentIndex, npcId: string): Combatant { return companionCombatant(s, c, npcId, make); }

/** An enemy or boss from content. `hpMult` applies dungeon modifiers. */
export function buildEnemy(c: ContentIndex, id: string, opts: { hpMult?: number; statMult?: number; kind?: Combatant["kind"] } = {}): Combatant {
  return buildEnemyFrom(c, id, c.get<any>(id), opts);
}

export interface EnemyDef { name: string; kind?: string; element: string; realm: { id: string }; stats: Record<string, number>; cp: number; techniques: string[]; ai: { strategy: string; rules: string[] }; resistances?: Record<string, number>; loot?: string; mastery_xp?: number; phases?: Boss["phases"]; weaknesses?: string[] }

/** Build from an explicit definition (content enemy/boss, or a synthetic one such as a duelling NPC). */
export function buildEnemyFrom(c: ContentIndex, id: string, e: EnemyDef, opts: { hpMult?: number; statMult?: number; kind?: Combatant["kind"]; art?: string } = {}): Combatant {
  const isBoss = !!e.phases?.length;
  const base: StatBlock = { ...e.stats };
  // statMult scales an enemy to a target power (Endless Tower floors): HP, attack, defence and spiritual power.
  if (opts.statMult && opts.statMult !== 1) {
    for (const k of ["hp", "atk", "def", "sp_power"]) if (base[k] !== undefined) base[k] = base[k]! * opts.statMult;
    // Speed grows gently with the floor so late floors are not out-acted by a fast cultivator (regions raise enemy speed too).
    base.spd = (base.spd ?? 10) * Math.pow(opts.statMult, 0.45);
  }
  const maxHp = Math.max(1, Math.round((base.hp ?? 1) * (opts.hpMult ?? 1)));
  const techIds = isBoss ? [...new Set([...e.phases![0]!.techniques, ...e.techniques])] : e.techniques;
  const skills: Skill[] = [{ ...BASIC, element: e.element, power: c.combat.damage.basic_power, masteryMult: 1 }, ...techIds.map((t: string) => techSkill(c, t, 0))];
  const cmb = make({
    id, name: e.name, side: "enemy", kind: opts.kind ?? (isBoss ? "boss" : "enemy"), element: e.element, base, maxHp, maxSp: Math.max(0, Math.round(base.sp_energy ?? 100)), skills, specials: [],
    resistances: { ...(e.resistances ?? {}) }, ai: { strategy: e.ai.strategy, rules: e.ai.rules }, art: opts.art ?? c.art(id, "battle"), cp: Math.round(e.cp * (opts.statMult ?? 1)), masteryXp: e.mastery_xp ?? 0, lootTable: e.loot, realmOrder: c.get<any>(e.realm.id).order,
  });
  if (!isBoss && e.kind === "elite") cmb.elite = true;
  if (isBoss) cmb.boss = { phases: [...e.phases!].sort((a, b) => b.hp_threshold - a.hp_threshold), weaknesses: e.weaknesses ?? [], phase: 0, charging: null };
  return cmb;
}
