/**
 * Cultivation: Qi generation, ticking, offline progression, minor/major breakthroughs, energy, buffs.
 * See docs/ARCHITECTURE.md §3.3–3.4. Pure functions over GameState; time is always passed in.
 */
import type { ContentIndex, Realm, Root, Method, Rank, Beast, MapNode } from "../content/index.ts";
import type { GameState, Buff } from "./state.ts";
import type { DomainEvent } from "./events.ts";
import type { Result } from "./inventory.ts";
import { hasItems, removeItems } from "./inventory.ts";
import { chance } from "./rng.ts";
import { computeStats } from "./stats.ts";

// ---------- Qi requirements ----------

export const qiNeeded = (realm: Realm, stage: number) => realm.qi.base * Math.pow(realm.qi.stage_growth, stage - 1);

/** Qi the character may bank: rest of the current realm + N stages of the next (N from rules). */
export function qiBankCap(s: GameState, content: ContentIndex): number {
  const realm = content.get<Realm>(s.character.realm);
  let cap = 0;
  for (let st = s.character.stage; st <= 9; st++) cap += qiNeeded(realm, st);
  const next = content.nextRealm(realm.id);
  if (next) for (let st = 1; st <= content.rules.qi_bank_extra_stages; st++) cap += qiNeeded(next, st);
  return cap;
}

export const isFinalStage = (s: GameState) => s.character.stage >= 9;
export const qiForNextStage = (s: GameState, content: ContentIndex) => qiNeeded(content.get<Realm>(s.character.realm), s.character.stage);
export const stageProgress = (s: GameState, content: ContentIndex) => Math.min(1, s.character.qi / qiForNextStage(s, content));

// ---------- Qi rate ----------

export interface RateFactor { label: string; mult: number }
export interface RateBreakdown { base: number; factors: RateFactor[]; perSecond: number }

/** Multiplier of the place where she cultivates (sect location or an adventure cultivation node). */
export function locationQiMult(s: GameState, content: ContentIndex): number {
  const loc = s.character.location;
  if (!loc) return content.rules.location_qi_mult.sect_default ?? 1;
  const node = content.find<MapNode>(loc);
  if (node?.cultivation) return node.cultivation.qi_mult;
  const key = loc.split(".").slice(1).join(".");
  return content.rules.location_qi_mult[key] ?? content.rules.location_qi_mult.sect_default ?? 1;
}

export function qiRate(s: GameState, content: ContentIndex, now: number): RateBreakdown {
  const realm = content.get<Realm>(s.character.realm);
  const minutes = content.rules.minutes_for_stage1[realm.order - 1] ?? 60;
  const base = qiNeeded(realm, 1) / (60 * minutes);
  const factors: RateFactor[] = [];
  const root = content.get<Root>(s.character.root);
  factors.push({ label: root.name, mult: root.qi_mult });
  const method = content.get<Method>(s.character.method);
  factors.push({ label: method.name, mult: method.qi_mult });
  const rank = content.get<Rank>(s.character.rank);
  if (rank.benefits.qi_mult !== 1) factors.push({ label: rank.name, mult: rank.benefits.qi_mult });
  const loc = locationQiMult(s, content);
  if (loc !== 1) factors.push({ label: "Location", mult: loc });
  if (s.beasts.active !== null) {
    const bi = s.beasts.owned[s.beasts.active];
    const beast = bi ? content.get<Beast>(bi.beast) : undefined;
    if (beast && beast.cultivation_bonus > 0) factors.push({ label: bi!.name, mult: 1 + beast.cultivation_bonus });
  }
  for (const b of s.buffs) if (b.qi_mult && b.expiresAt > now) factors.push({ label: b.label, mult: b.qi_mult });
  const perSecond = factors.reduce((r, f) => r * f.mult, base);
  return { base, factors, perSecond };
}

// ---------- Energy ----------

export function energyMax(s: GameState, content: ContentIndex): number {
  const rank = content.get<Rank>(s.character.rank);
  return content.rules.energy.max + content.rules.energy.max_per_rank_order * (rank.order - 1);
}

/** Lazily regenerate energy up to now; returns the current value. */
export function energyNow(s: GameState, content: ContentIndex, now: number): number {
  const e = s.resources.energy, max = energyMax(s, content);
  const perMs = 1 / (content.rules.energy.regen_minutes * 60_000);
  if (now > e.updatedAt && e.value < max) e.value = Math.min(max, e.value + (now - e.updatedAt) * perMs);
  if (now > e.updatedAt) e.updatedAt = now;
  return e.value;
}

export function spendEnergy(s: GameState, content: ContentIndex, now: number, amount: number): Result {
  if (energyNow(s, content, now) < amount) return { ok: false, reason: "Not enough energy" };
  s.resources.energy.value -= amount;
  return { ok: true };
}

// ---------- Buffs ----------

export function addBuff(s: GameState, buff: Buff, out: DomainEvent[]): void {
  const i = s.buffs.findIndex((b) => b.id === buff.id);
  if (i >= 0) s.buffs[i] = { ...buff, expiresAt: Math.max(buff.expiresAt, s.buffs[i]!.expiresAt) };
  else s.buffs.push(buff);
  out.push({ type: "buff_applied", id: buff.id, expiresAt: buff.expiresAt });
}

export function expireBuffs(s: GameState, now: number, out: DomainEvent[]): void {
  const keep: Buff[] = [];
  for (const b of s.buffs) { if (b.expiresAt > now) keep.push(b); else out.push({ type: "buff_expired", id: b.id }); }
  if (keep.length !== s.buffs.length) s.buffs = keep;
}

// ---------- Ticking ----------

/** Add Qi for a live interval. `dtMs` comes from a monotonic clock; `now` is the wall clock for buff expiry. */
export function tick(s: GameState, content: ContentIndex, dtMs: number, now: number): DomainEvent[] {
  const out: DomainEvent[] = [];
  if (dtMs <= 0) return out;
  const dt = dtMs / 1000;
  // Integrate buff boundaries roughly: use the rate at `now - dt` end? One-second ticks make this negligible.
  const rate = qiRate(s, content, now).perSecond;
  s.character.qi = Math.min(qiBankCap(s, content), s.character.qi + rate * dt);
  if (s.character.hp !== undefined) {
    const maxHp = computeStats(s, content).total.hp ?? 1;
    s.character.hp = Math.min(maxHp, s.character.hp + maxHp * content.combat.recovery.hp_pct_per_min / 100 * (dt / 60));
    if (s.character.hp >= maxHp) s.character.hp = undefined;
  }
  s.meta.playtimeMs += dtMs;
  s.meta.lastTickAt = now;
  expireBuffs(s, now, out);
  return out;
}

export interface OfflineReport {
  elapsedMs: number;        // wall-clock time away
  creditedMs: number;       // after cap and efficiency are applied (what the player is told)
  capped: boolean;
  clockMovedBack: boolean;
  qiBefore: number;
  qiGained: number;
  stagesAvailable: number;  // minor breakthroughs the banked Qi can pay for right now
  majorAvailable: boolean;  // sitting at stage 9 with enough Qi
  ratePerSecond: number;
}

/**
 * Credit cultivation for the time the game was closed. Call once on load, before the first tick.
 * Returns null when the absence is shorter than rules.offline.min_seconds (no report shown).
 */
export function applyOffline(s: GameState, content: ContentIndex, now: number): OfflineReport | null {
  const rules = content.rules.offline;
  const raw = now - s.meta.lastTickAt;
  const clockMovedBack = raw < 0;
  if (clockMovedBack) s.meta.clockBackCount++;
  const elapsedMs = Math.max(0, raw);
  s.meta.lastTickAt = now;
  if (!clockMovedBack && elapsedMs < rules.min_seconds * 1000) return null;
  const capMs = rules.cap_hours * 3_600_000;
  const capped = elapsedMs > capMs;
  const effectiveMs = clockMovedBack ? 0 : Math.min(elapsedMs, capMs);
  const rate = qiRate(s, content, now).perSecond;
  const qiBefore = s.character.qi;
  const gained = rate * (effectiveMs / 1000) * rules.efficiency;
  s.character.qi = Math.min(qiBankCap(s, content), qiBefore + gained);
  const out: DomainEvent[] = [];
  expireBuffs(s, now, out);
  s.meta.offlineSessions++;
  return {
    elapsedMs, creditedMs: effectiveMs * rules.efficiency, capped, clockMovedBack, qiBefore,
    qiGained: s.character.qi - qiBefore, stagesAvailable: countAffordableStages(s, content), majorAvailable: canAttemptMajor(s, content),
    ratePerSecond: rate,
  };
}

/** How many consecutive minor breakthroughs the current Qi pays for (stops at stage 9). */
export function countAffordableStages(s: GameState, content: ContentIndex): number {
  const realm = content.get<Realm>(s.character.realm);
  let qi = s.character.qi, n = 0;
  for (let st = s.character.stage; st < 9; st++) {
    const need = qiNeeded(realm, st);
    if (qi < need) break;
    qi -= need; n++;
  }
  return n;
}

// ---------- Breakthroughs ----------

export function canMinorBreakthrough(s: GameState, content: ContentIndex): Result {
  if (isFinalStage(s)) return { ok: false, reason: "Final stage: a major breakthrough is needed" };
  if (s.character.qi < qiForNextStage(s, content)) return { ok: false, reason: "Not enough Qi" };
  return { ok: true };
}

/** Stage → stage+1. Always succeeds when affordable. */
export function minorBreakthrough(s: GameState, content: ContentIndex): Result<{ events: DomainEvent[] }> {
  const can = canMinorBreakthrough(s, content);
  if (!can.ok) return can;
  s.character.qi -= qiForNextStage(s, content);
  s.character.stage++;
  return { ok: true, events: [{ type: "stage_up", realm: s.character.realm, stage: s.character.stage }] };
}

export interface MajorRequirement { kind: "qi" | "item" | "trial" | "tribulation" | "realm_cap"; id?: string; have: number; need: number; met: boolean; label: string }

/**
 * Everything the NEXT realm asks for, met or not, so the UI can list it. A realm's `major_breakthrough`
 * block describes what it takes to enter that realm (the Foundation Pill sits on Foundation Establishment).
 */
export function majorRequirements(s: GameState, content: ContentIndex): MajorRequirement[] {
  const realm = content.get<Realm>(s.character.realm);
  const next = content.nextRealm(realm.id);
  const reqs: MajorRequirement[] = [];
  if (!next) return [{ kind: "realm_cap", have: 0, need: 0, met: false, label: "You stand at the summit of cultivation" }];
  const need = qiNeeded(realm, 9);
  reqs.push({ kind: "qi", have: Math.floor(s.character.qi), need, met: s.character.qi >= need, label: "Qi" });
  const mb = next.major_breakthrough;
  for (const q of mb.requirements) {
    const have = s.inventory.stacks[q.id] ?? 0;
    reqs.push({ kind: "item", id: q.id, have, need: q.qty, met: have >= q.qty, label: content.get<any>(q.id).name });
  }
  if (mb.trial) reqs.push({ kind: "trial", id: mb.trial, have: s.progress.trialsCleared[mb.trial] ? 1 : 0, need: 1, met: !!s.progress.trialsCleared[mb.trial], label: content.get<any>(mb.trial).name });
  if (mb.tribulation) {
    const passed = !!s.progress.tribulations[mb.tribulation]?.passedAt;
    reqs.push({ kind: "tribulation", id: mb.tribulation, have: passed ? 1 : 0, need: 1, met: passed, label: content.get<any>(mb.tribulation).name });
  }
  return reqs;
}

export function canAttemptMajor(s: GameState, content: ContentIndex): boolean {
  return isFinalStage(s) && majorRequirements(s, content).every((r) => r.met);
}

export interface MajorOptions { /** Extra success chance from a breakthrough pill already consumed (0–1). */ pillBonus?: number }

export interface MajorChance { base: number; parts: { label: string; bonus: number }[]; total: number }

/** Success chance of the next major breakthrough: base + bonuses of the required pills it consumes + banked pill bonus, capped. */
export function majorChance(s: GameState, content: ContentIndex, banked = s.character.breakthroughBonus): MajorChance {
  const next = content.nextRealm(s.character.realm);
  if (!next) return { base: 0, parts: [], total: 0 };
  const mb = next.major_breakthrough;
  const parts: { label: string; bonus: number }[] = [];
  for (const q of mb.requirements) {
    const def = content.get<any>(q.id);
    const b = def.effects?.breakthrough_chance_bonus;
    if (b) parts.push({ label: def.name, bonus: b * q.qty });
  }
  if (banked > 0) parts.push({ label: "Pill effect", bonus: banked });
  const cap = content.rules.major_breakthrough.pill_bonus_cap;
  const bonus = Math.min(cap, parts.reduce((a, p) => a + p.bonus, 0));
  return { base: mb.success_base, parts, total: Math.min(1, mb.success_base + bonus) };
}

/** Items a future major breakthrough consumes: using them from the bag would block progress. */
export function isBreakthroughItem(content: ContentIndex, id: string): boolean {
  return content.realms.some((r) => r.major_breakthrough.requirements.some((q) => q.id === id));
}

/**
 * Stage 9 → next realm stage 1. Consumes the next realm's requirement items on attempt; rolls its
 * success_base (+ pill bonus, capped). Failure keeps the realm and burns a share of the Qi.
 */
export function majorBreakthrough(s: GameState, content: ContentIndex, opts: MajorOptions = {}): Result<{ success: boolean; events: DomainEvent[]; chance: number }> {
  if (!isFinalStage(s)) return { ok: false, reason: "Reach stage 9 first" };
  const reqs = majorRequirements(s, content);
  const unmet = reqs.find((r) => !r.met);
  if (unmet) return { ok: false, reason: unmet.kind === "realm_cap" ? unmet.label : `Missing: ${unmet.label}` };
  const realm = content.get<Realm>(s.character.realm);
  const next = content.nextRealm(realm.id)!;
  const mb = next.major_breakthrough;
  if (!hasItems(s, mb.requirements)) return { ok: false, reason: "Missing materials" };
  const rules = content.rules.major_breakthrough;
  const p = majorChance(s, content, opts.pillBonus ?? 0).total;
  const events: DomainEvent[] = [];
  removeItems(s, mb.requirements);
  for (const q of mb.requirements) events.push({ type: "item_used", id: q.id, qty: q.qty });
  const need = qiNeeded(realm, 9);
  if (!chance(s.rng, p)) {
    const lost = Math.floor(need * rules.fail_qi_loss_pct);
    s.character.qi = Math.max(0, s.character.qi - lost);
    events.push({ type: "breakthrough_failed", realm: realm.id, qiLost: lost });
    return { ok: true, success: false, events, chance: p };
  }
  s.character.qi -= need;
  s.character.realm = next.id;
  s.character.stage = 1;
  if (!s.progress.realmsEntered.includes(next.id)) s.progress.realmsEntered.push(next.id);
  s.character.qi = Math.min(qiBankCap(s, content), s.character.qi);
  events.push({ type: "realm_reached", realm: next.id });
  for (const u of mb.unlocks) events.push({ type: "unlock", id: u });
  return { ok: true, success: true, events, chance: p };
}

/** Time until the next stage is affordable at the current rate (ms), or 0 when affordable now. */
export function etaToNextStage(s: GameState, content: ContentIndex, now: number): number {
  const missing = qiForNextStage(s, content) - s.character.qi;
  if (missing <= 0) return 0;
  const r = qiRate(s, content, now).perSecond;
  return r > 0 ? (missing / r) * 1000 : Infinity;
}
