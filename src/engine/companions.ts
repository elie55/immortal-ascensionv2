/**
 * Dao companions. An NPC marked `dao_companion.eligible` can be asked once the relationship reaches the
 * level in cultivation_rules.dao (index 4 = "Dao Companion"). Bonded companions add the dual-cultivation
 * Qi multiplier and can fight beside the player where the encounter allows it:
 *   adventure nodes and events: 1 companion · dungeons: `entry.party.max_companions` when allowed (mega: 2)
 *   tribulations, duels and tournaments: none (those trials are faced alone).
 * Their stats follow the player's power (role profile from content × the player's own stats × stat_scale),
 * so a companion stays relevant at every realm without outshining the player.
 */
import type { ContentIndex, Npc, Dungeon, Technique } from "../content/index.ts";
import type { GameState } from "./state.ts";
import type { ActionResult } from "./actions.ts";
import type { EncounterSource } from "./encounter.ts";
import type { Combatant, Skill } from "./combat/types.ts";
import { affinityLevel } from "./unlock.ts";
import { computeStats } from "./stats.ts";

const fail = (reason: string) => ({ ok: false as const, reason });
export const MAX_ACTIVE = 2;
const ROLE_AI: Record<string, string> = { dps: "aggressive", support: "support", tank: "guardian", control: "trickster" };

export function canBond(s: GameState, c: ContentIndex, npcId: string): { ok: boolean; reason?: string } {
  const n = c.get<Npc>(npcId);
  if (!n.dao_companion.eligible) return { ok: false, reason: `${n.name} walks a different path` };
  if (s.companions.bonded.includes(npcId)) return { ok: false, reason: "Already your Dao companion" };
  const need = c.rules.dao.affinity_level;
  const lv = affinityLevel(c, npcId, s.relations[npcId]?.affinity ?? 0);
  if (lv.index < need) return { ok: false, reason: `Reach “${n.affinity_levels[need]?.name ?? `level ${need}`}” with ${n.name}` };
  return { ok: true };
}

export function bondDao(s: GameState, c: ContentIndex, npcId: string): ActionResult {
  const chk = canBond(s, c, npcId);
  if (!chk.ok) return fail(chk.reason!);
  s.companions.bonded.push(npcId);
  if (s.companions.active.length < MAX_ACTIVE) s.companions.active.push(npcId);
  return { ok: true, events: [{ type: "dao_bonded", npc: npcId }] };
}

export function setCompanionActive(s: GameState, npcId: string, on: boolean): ActionResult {
  if (!s.companions.bonded.includes(npcId)) return fail("Not your Dao companion");
  const list = s.companions.active.filter((x) => x !== npcId);
  if (on) { if (list.length >= MAX_ACTIVE) return fail(`At most ${MAX_ACTIVE} companions can join a battle`); list.push(npcId); }
  s.companions.active = list;
  return { ok: true, events: [] };
}

/** How many Dao companions may join this encounter. */
export function companionSlots(c: ContentIndex, src: EncounterSource): number {
  if (src.kind === "node" || src.kind === "event") return 1;
  if (src.kind === "dungeon") { const d = c.get<Dungeon>(src.id); return d.entry.party.companions_allowed ? d.entry.party.max_companions : 0; }
  return 0;
}

/** Dual cultivation: one multiplier while at least one companion is bonded. */
export const daoQiMult = (s: GameState, c: ContentIndex) => (s.companions.bonded.length ? c.rules.dao.qi_mult : 1);

/** A Dao companion as a battle ally. `make` is the combat builder's factory (kept there to own uids). */
export function companionCombatant(s: GameState, c: ContentIndex, npcId: string, make: (p: any) => Combatant): Combatant {
  const n = c.get<Npc>(npcId);
  const dc = n.dao_companion;
  const player = computeStats(s, c).total;
  const prof = dc.stats ?? {};
  // Scale the content profile so its HP matches the player's HP × stat_scale; ratios between stats are kept.
  const k = ((player.hp ?? 100) * c.rules.dao.stat_scale) / Math.max(1, prof.hp ?? 1);
  const base: Record<string, number> = { crit: prof.crit ?? 5, crit_dmg: prof.crit_dmg ?? 150, acc: prof.acc ?? 90, eva: prof.eva ?? 5, spd: Math.max(prof.spd ?? 10, (player.spd ?? 10) * 0.9) };
  for (const key of ["hp", "atk", "def", "sp_power"]) base[key] = (prof[key] ?? 0) * k;
  base.sp_energy = Math.max(100, prof.sp_energy ?? 100);
  const skills: Skill[] = [{ id: "basic", name: "Attack", kind: "basic", hits: 1, spCost: 0, cooldown: 0, targeting: "single", applies: [], element: n.elements[0] ?? "elem.metal", power: c.combat.damage.basic_power, masteryMult: 1 }];
  for (const id of dc.techniques ?? []) {
    const t = c.get<Technique>(id);
    if (t.kind === "passive") continue;
    skills.push({ id, name: t.name, kind: t.kind === "ultimate" ? "ultimate" : "active", element: t.element, power: t.power, hits: t.hits, healPct: t.heal_pct, shieldPct: t.shield_pct_max_hp,
      spCost: t.sp_cost, cooldown: t.cooldown, targeting: t.targeting, applies: t.applies.map((a) => ({ status: a.status, chance: a.chance, turns: a.turns, potency: a.potency })), masteryMult: 1.2, ultCharge: t.ult_charge });
  }
  const maxHp = Math.max(1, Math.round(base.hp ?? 1));
  return make({ id: npcId, name: n.name, side: "ally", kind: "companion", element: n.elements[0] ?? "elem.metal", base, maxHp, maxSp: Math.round(base.sp_energy!), skills, specials: [], resistances: {},
    ai: { strategy: ROLE_AI[dc.role ?? "dps"] ?? "aggressive", rules: [] }, art: c.artAny(npcId, "battle", "full_body"), cp: 0, masteryXp: 0, realmOrder: 1 });
}
