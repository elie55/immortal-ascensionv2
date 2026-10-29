/** Evaluate an Unlock block (regions, sect locations, shops, quests, dungeons…) against the game state. */
import type { ContentIndex } from "../content/index.ts";
import type { GameState } from "./state.ts";
import type { Unlock } from "../../schema/common.ts";

export interface UnlockCheck { ok: boolean; reasons: string[] }

const realmOrder = (c: ContentIndex, id: string) => c.get<any>(id).order as number;

export function realmAtLeast(s: GameState, c: ContentIndex, id: string, stage = 1): boolean {
  const have = realmOrder(c, s.character.realm), need = realmOrder(c, id);
  return have > need || (have === need && s.character.stage >= stage);
}

export function checkUnlock(s: GameState, c: ContentIndex, u: Unlock | undefined): UnlockCheck {
  const reasons: string[] = [];
  if (!u) return { ok: true, reasons };
  if (u.realm && !realmAtLeast(s, c, u.realm.id, u.realm.stage ?? 1)) reasons.push(`Requires ${c.get<any>(u.realm.id).name}${u.realm.stage && u.realm.stage > 1 ? ` ${u.realm.stage}` : ""}`);
  if (u.rank && c.get<any>(s.character.rank).order < c.get<any>(u.rank).order) reasons.push(`Requires rank ${c.get<any>(u.rank).name}`);
  if (u.sect_fame && s.resources.sect_fame < u.sect_fame) reasons.push(`Requires ${u.sect_fame.toLocaleString("en-US")} Fame`);
  for (const q of u.quests ?? []) if (!s.progress.quests.completed[q]) reasons.push(`Complete “${c.get<any>(q).name}”`);
  for (const a of u.affinity ?? []) if (affinityLevel(c, a.npc, s.relations[a.npc]?.affinity ?? 0).index < a.level) reasons.push(`${c.get<any>(a.npc).name}: ${c.get<any>(a.npc).affinity_levels[a.level]?.name ?? `level ${a.level}`}`);
  for (const r of u.regions ?? []) if (!s.progress.regions[r]) reasons.push(`Discover ${c.get<any>(r).name}`);
  for (const d of u.dungeons_cleared ?? []) if (!s.progress.dungeons[d]?.clears) reasons.push(`Clear ${c.get<any>(d).name}`);
  for (const it of u.items ?? []) if ((s.inventory.stacks[it.id] ?? 0) < it.qty) reasons.push(`Bring ${it.qty}× ${c.get<any>(it.id).name}`);
  for (const a of u.achievements ?? []) if (!s.progress.achievements[a]) reasons.push(`Achievement “${c.get<any>(a).name}”`);
  return { ok: reasons.length === 0, reasons };
}

/** Sect locations may also be opened early by a story/rank unlock (state.progress.unlocks). */
export function locationOpen(s: GameState, c: ContentIndex, locId: string): UnlockCheck {
  if (s.progress.unlocks.includes(locId)) return { ok: true, reasons: [] };
  const loc = c.get<any>(locId);
  const rankUnlocks = c.byPrefix<any>("rank").filter((r) => r.order <= c.get<any>(s.character.rank).order).flatMap((r) => r.benefits?.unlocks ?? []);
  if (rankUnlocks.includes(locId)) return { ok: true, reasons: [] };
  return checkUnlock(s, c, loc.unlock);
}

/** Equipment slots that open with progress (e.g. the artifact slot at Foundation Establishment). */
export function slotOpen(s: GameState, c: ContentIndex, slot: string): UnlockCheck {
  const need = c.rules.slot_unlocks?.[slot];
  if (!need) return { ok: true, reasons: [] };
  return realmAtLeast(s, c, need) ? { ok: true, reasons: [] } : { ok: false, reasons: [`Unlocks at ${c.get<any>(need).name}`] };
}

/** Named affinity level reached with an NPC (index 0 = Stranger). */
export function affinityLevel(c: ContentIndex, npcId: string, affinity: number): { index: number; name: string; next?: { name: string; threshold: number } } {
  const lv = c.get<any>(npcId).affinity_levels as { name: string; threshold: number }[];
  let i = 0;
  for (let k = 0; k < lv.length; k++) if (affinity >= lv[k]!.threshold) i = k;
  return { index: i, name: lv[i]!.name, next: lv[i + 1] };
}
