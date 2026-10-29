/**
 * Encounters turn content (nodes, dungeons, tribulations, duels) into one or more battles and settle the
 * outcome: energy, carried HP/SP between waves, loot per enemy and per wave, first clears, mastery, defeat
 * consequences, and the domain events that drive quests, achievements and story.
 * An Encounter is a session object (not saved); closing the app mid-fight forfeits that fight only.
 */
import type { ContentIndex, MapNode, Dungeon, Tribulation, Npc, Tournament } from "../content/index.ts";
import type { GameState } from "./state.ts";
import type { DomainEvent } from "./events.ts";
import type { Result } from "./inventory.ts";
import { energyNow, spendEnergy } from "./cultivation.ts";
import { checkUnlock, realmAtLeast } from "./unlock.ts";
import { computeStats } from "./stats.ts";
import { addMasteryXp, grantRewards } from "./actions.ts";
import { rollTable, grantDrops, mergeDrops, type Drops } from "./loot.ts";
import { Battle } from "./combat/battle.ts";
import { revealHidden, discoverRegions, finishEventBattle } from "./nodes.ts";
import { buildPlayer, buildBeast, buildEnemy, buildEnemyFrom, buildCompanion, resetUids } from "./combat/build.ts";
import { companionSlots } from "./companions.ts";
import { beastsAfterVictory } from "./beasts.ts";
import { canClimb, towerFloor, towerFloorCleared, realmRun, realmNodeState, realmBattleDone, trackRealmLoot } from "./delves.ts";
import type { Combatant, BattleOptions, BattleSummary, AutoRuleResolved } from "./combat/types.ts";

export type EncounterSource =
  | { kind: "node"; id: string }
  | { kind: "dungeon"; id: string; tier?: number }
  | { kind: "tribulation"; id: string }
  | { kind: "duel"; npc: string; cp?: number }
  | { kind: "tournament"; id: string }
  | { kind: "tower"; id: string; floor: number }
  | { kind: "realm"; id: string; node: string; enemies?: string[] }
  | { kind: "event"; node: string; enemies: string[] };

export interface WaveResult { summary: BattleSummary; drops: Drops; gearUids: number[] }
export interface EncounterResult {
  won: boolean; source: EncounterSource; waves: WaveResult[]; total: Drops; firstClear?: Record<string, unknown>;
  masteryXp: number; recommendations: string[]; enemyCp: number; playerCp: number;
}

const emptyDrops = (): Drops => ({ items: [], gear: [], spirit_stones: 0, sect_fame: 0, mastery_xp: 0 });

/** Highest tier of a resource dungeon cleared at least once (0 = none). */
export function tierCleared(s: GameState, dungeonId: string, tier: number): boolean {
  const rec = s.progress.dungeons[dungeonId];
  return tier <= 1 ? (rec?.clears ?? 0) > 0 : (rec?.tierClears?.[tier] ?? 0) > 0;
}
/** Can tier `tier` (≥ 2) be entered: its realm reached and the tier below cleared once. */
export function tierCheck(s: GameState, c: ContentIndex, d: Dungeon, tier: number): Result {
  const t = d.tiers?.find((x) => x.tier === tier);
  if (!t) return { ok: false, reason: "No such tier" };
  if (!tierCleared(s, d.id, tier - 1)) return { ok: false, reason: `Clear tier ${d.tiers![tier - 2]!.name} first` };
  if (!realmAtLeast(s, c, t.realm.id, t.realm.stage)) return { ok: false, reason: `Requires ${c.get<any>(t.realm.id).name}${t.realm.stage > 1 ? ` ${t.realm.stage}` : ""}` };
  return { ok: true };
}

/** Can this encounter start now? Checks unlocks, energy, daily limits and cooldowns. */
export function canStart(s: GameState, c: ContentIndex, src: EncounterSource, now: number): Result<{ energy: number }> {
  const energy = energyNow(s, c, now);
  if (src.kind === "node") {
    const n = c.get<MapNode>(src.id);
    if (!s.progress.regions[n.region]) return { ok: false, reason: "Region not discovered" };
    if (!n.waves?.length) return { ok: false, reason: "Nothing to fight here" };
    if (!n.replayable && s.progress.regions[n.region]!.nodes[n.id]?.clears) return { ok: false, reason: "Already cleared" };
    if (energy < n.energy_cost) return { ok: false, reason: `Needs ${n.energy_cost} energy` };
    return { ok: true, energy: n.energy_cost };
  }
  if (src.kind === "dungeon") {
    const d = c.get<Dungeon>(src.id);
    const u = checkUnlock(s, c, d.entry as any);
    if (!u.ok) return { ok: false, reason: u.reasons[0]! };
    if (d.kind === "tower" || d.kind === "secret_realm") return { ok: false, reason: "This dungeon type opens later" };
    if (src.tier && src.tier > 1) { const t = tierCheck(s, c, d, src.tier); if (!t.ok) return t; }
    if (d.entry.daily_limit && (s.daily.counters[`dungeon:${d.id}`] ?? 0) >= d.entry.daily_limit) return { ok: false, reason: `Daily limit reached (${d.entry.daily_limit})` };
    if (energy < d.entry.energy_cost) return { ok: false, reason: `Needs ${d.entry.energy_cost} energy` };
    return { ok: true, energy: d.entry.energy_cost };
  }
  if (src.kind === "tribulation") {
    const t = c.get<Tribulation>(src.id);
    const p = s.progress.tribulations[t.id];
    if (p?.passedAt) return { ok: false, reason: "Already passed" };
    if (p?.nextTryAt && p.nextTryAt > now) return { ok: false, reason: `Steady your Qi first: ${Math.ceil((p.nextTryAt - now) / 60000)} min` };
    return { ok: true, energy: 0 };
  }
  if (src.kind === "event") return { ok: true, energy: 0 };
  if (src.kind === "tournament") return canEnterTournament(s, c, src.id, now);
  if (src.kind === "tower") { const r = canClimb(s, c, src.id, src.floor); return r.ok ? { ok: true, energy: 0 } : r; }
  if (src.kind === "realm") {
    const run = realmRun(s, src.id);
    if (!run) return { ok: false, reason: "Enter the realm first" };
    const st = realmNodeState(s, c, src.id, src.node);
    if (st !== "open") return { ok: false, reason: st === "cleared" ? "Already cleared" : "Not reachable yet" };
    const n = c.get<Dungeon>(src.id).realm_nodes!.find((x) => x.key === src.node)!;
    if (!src.enemies?.length && !n.waves?.length) return { ok: false, reason: "Nothing to fight here" };
    return { ok: true, energy: 0 };
  }
  const npc = c.get<Npc>(src.npc);
  if (!npc.duel?.enabled) return { ok: false, reason: "They will not duel" };
  const last = s.relations[src.npc]?.lastDuelAt ?? 0;
  if (now - last < npc.duel.cooldown_min * 60_000) return { ok: false, reason: `Ready in ${Math.ceil((npc.duel.cooldown_min * 60_000 - (now - last)) / 60000)} min` };
  return { ok: true, energy: 0 };
}

export class Encounter {
  readonly s: GameState; readonly c: ContentIndex; readonly src: EncounterSource;
  readonly waves: string[][];
  wave = 0;
  battle: Battle | null = null;
  results: WaveResult[] = [];
  carry: { hp?: number; sp?: number; ult?: number } = {};
  done: EncounterResult | null = null;
  readonly opts: BattleOptions;
  readonly name: string;
  readonly bg?: string;
  private events: DomainEvent[] = [];
  private spiritUid = 0;
  /** Tower floors scale their enemies to the floor's power. */
  private statMult = 1;

  private constructor(s: GameState, c: ContentIndex, src: EncounterSource) {
    this.s = s; this.c = c; this.src = src;
    const opts: BattleOptions = {};
    if (src.kind === "node") { const n = c.get<MapNode>(src.id); this.waves = n.waves!; this.name = n.name; this.bg = c.art(n.region, "battle_bg"); opts.isBossFight = n.kind === "boss"; }
    else if (src.kind === "dungeon") {
      const d = c.get<Dungeon>(src.id); this.waves = d.waves!.map((w) => w.enemies); this.bg = c.art(d.id, "battle_bg");
      const tier = d.tiers?.find((t) => t.tier === (src.tier ?? 1));
      this.name = tier && tier.tier > 1 ? `${d.name} · Tier ${tier.name}` : d.name;
      if (tier) this.statMult = tier.stat_mult;
      for (const m of d.modifiers) { if (m.effect.enemy_dmg_mult) opts.enemyDmgMult = (opts.enemyDmgMult ?? 1) * m.effect.enemy_dmg_mult; if (m.effect.enemy_hp_mult) opts.enemyHpMult = (opts.enemyHpMult ?? 1) * m.effect.enemy_hp_mult; }
      opts.isBossFight = d.kind === "mega";
    } else if (src.kind === "tribulation") {
      const t = c.get<Tribulation>(src.id); this.waves = [[t.spirit]]; this.name = t.name; this.bg = c.art(t.id, "battle_bg"); opts.isBossFight = true;
      opts.surviveRounds = t.waves.length * c.combat.tribulation.turns_per_wave;
      opts.hazard = { name: "Heavenly Lightning", source: 0, turnsPerWave: c.combat.tribulation.turns_per_wave, waves: t.waves.map((w) => ({ element: w.element, power: c.combat.tribulation.bolt_power * w.dmg_mult, bolts: w.bolts })) };
    } else if (src.kind === "event") { const n = c.get<MapNode>(src.node); this.waves = [src.enemies]; this.name = n.name; this.bg = c.art(n.region, "battle_bg"); }
    else if (src.kind === "tower") {
      const d = c.get<Dungeon>(src.id); const f = towerFloor(c, d, src.floor);
      this.waves = [f.enemies]; this.name = `${d.name} · Floor ${src.floor}`; this.bg = c.art(d.id, "battle_bg"); opts.isBossFight = f.boss; this.statMult = f.statMult;
    } else if (src.kind === "realm") {
      const d = c.get<Dungeon>(src.id); const n = d.realm_nodes!.find((x) => x.key === src.node)!;
      this.waves = src.enemies?.length ? [src.enemies] : n.waves!; this.name = `${d.name} · ${n.name}`; this.bg = c.art(d.id, "battle_bg"); opts.isBossFight = n.kind === "boss";
      const hp = realmRun(s, src.id)?.hp; if (hp !== undefined) this.carry = { hp };
    }
    else if (src.kind === "tournament") { const t = c.get<Tournament>(src.id); const r = s.progress.tournaments[t.id]?.round ?? 0; this.waves = [[t.rounds[r]!.opponent]]; this.name = `${t.name} · ${r + 1 === t.rounds.length ? "Final" : `Round ${r + 1}`}`; this.bg = c.art("sectloc.proving_arena", "background") ?? c.art("sectloc.sword_grounds", "background"); }
    else { const n = c.get<Npc>(src.npc); this.waves = [[src.npc]]; this.name = `Spar: ${n.name}`; this.bg = c.art("sectloc.sword_grounds", "background"); }
    this.opts = opts;
  }

  /** Spend energy and open the first wave. */
  static start(s: GameState, c: ContentIndex, src: EncounterSource, now: number): Result<{ encounter: Encounter }> {
    const can = canStart(s, c, src, now);
    if (!can.ok) return can;
    if (can.energy) { const sp = spendEnergy(s, c, now, can.energy); if (!sp.ok) return sp; }
    if (src.kind === "dungeon") s.daily.counters[`dungeon:${src.id}`] = (s.daily.counters[`dungeon:${src.id}`] ?? 0) + 1;
    if (src.kind === "tribulation") { const p = (s.progress.tribulations[src.id] ??= { attempts: 0 }); p.attempts++; }
    if (src.kind === "tournament") { const p = (s.progress.tournaments[src.id] ??= { round: 0, wins: 0 }); p.lastAt = now; }
    const e = new Encounter(s, c, src);
    e.nextWave();
    return { ok: true, encounter: e };
  }

  get autoRules(): AutoRuleResolved[] { const p = this.s.combat.presets[this.s.combat.active] ?? this.s.combat.presets[0]!; return p.rules as AutoRuleResolved[]; }

  /** Build and start the battle for the current wave. */
  nextWave(): Battle {
    resetUids();
    const units: Combatant[] = [buildPlayer(this.s, this.c, this.carry)];
    const beast = buildBeast(this.s, this.c);
    if (beast) units.push(beast);
    for (const npc of this.s.companions.active.slice(0, companionSlots(this.c, this.src))) units.push(buildCompanion(this.s, this.c, npc));
    for (const id of this.waves[this.wave]!) {
      if (id.startsWith("npc.")) units.push(buildDuelist(this.c, id, this.src.kind === "tournament" ? this.c.get<Tournament>(this.src.id).rounds[this.s.progress.tournaments[this.src.id]?.round ?? 0]!.cp : (this.src as any).cp));
      else units.push(buildEnemy(this.c, id, { hpMult: this.opts.enemyHpMult, statMult: this.statMult }));
    }
    const opts = { ...this.opts };
    if (opts.hazard) { this.spiritUid = units.find((u) => u.side === "enemy")!.uid; opts.hazard = { ...opts.hazard, source: this.spiritUid }; }
    const b = new Battle(this.c, units, this.s.rng, this.autoRules, opts);
    b.manual = this.s.combat.manual;
    b.start(this.wave + 1, this.waves.length);
    this.battle = b;
    return b;
  }

  /** Call once the current battle has a result. Settles loot for the wave; finishes the encounter after the last wave or on defeat. */
  settleWave(now: number): WaveResult {
    const b = this.battle!;
    const sum = b.summary();
    const drops = emptyDrops();
    let gearUids: number[] = [];
    if (sum.result === "victory") {
      let merged = drops;
      for (const id of sum.killed) {
        const def = this.c.find<any>(id);
        if (def?.loot && this.src.kind !== "tower") merged = mergeDrops(merged, rollTable(this.s, this.c, def.loot));   // tower floors pay their own loot
        this.events.push({ type: "enemy_defeated", id, boss: id.startsWith("boss.") });
      }
      if (this.src.kind === "dungeon") { const d = this.c.get<Dungeon>(this.src.id); if (d.rewards.per_wave) merged = mergeDrops(merged, rollTable(this.s, this.c, d.rewards.per_wave)); }
      gearUids = grantDrops(this.s, this.c, merged, this.events).gearUids;
      if (this.src.kind === "realm") trackRealmLoot(this.s, this.src.id, merged, gearUids);
      Object.assign(drops, merged);
      this.carry = { hp: sum.playerHp, sp: sum.playerSp, ult: sum.playerUlt };
    }
    const wr = { summary: sum, drops, gearUids };
    this.results.push(wr);
    this.s.character.hp = Math.max(1, sum.playerHp);
    if (sum.result !== "victory") this.finish(false, now);
    else if (this.wave + 1 >= this.waves.length) this.finish(true, now);
    else this.wave++;
    return wr;
  }

  get hasNextWave(): boolean { return !this.done && this.wave < this.waves.length && this.results.length === this.wave; }

  private finish(won: boolean, now: number): void {
    const s = this.s, c = this.c;
    const total = this.results.reduce((a, r) => mergeDrops(a, r.drops), emptyDrops());
    let firstClear: Record<string, unknown> | undefined;
    let masteryXp = 0;
    const enemyCp = this.waves.flat().reduce((n, id) => n + (c.find<any>(id)?.cp ?? 0), 0) * this.statMult / Math.max(1, this.waves.length);
    if (won) {
      masteryXp = this.results.reduce((n, r) => n + r.summary.killed.reduce((m, id) => m + (c.find<any>(id)?.mastery_xp ?? 0), 0) + r.drops.mastery_xp, 0);
      if (this.src.kind === "node") {
        const n = c.get<MapNode>(this.src.id);
        const reg = s.progress.regions[n.region]!;
        const rec = (reg.nodes[n.id] ??= { clears: 0 });
        const first = rec.clears === 0;
        rec.clears++;
        if (first) { rec.firstClearAt = now; firstClear = n.first_clear as any; grantRewards(s, c, n.first_clear as any, this.events); }
        this.events.push({ type: "node_cleared", node: n.id, region: n.region, first });
        revealHidden(s, c, n.id, this.events);
        discoverRegions(s, c, now, this.events);
      } else if (this.src.kind === "event") {
        finishEventBattle(s, c, now, this.src.node, this.events);
        revealHidden(s, c, this.src.node, this.events);
        discoverRegions(s, c, now, this.events);
      } else if (this.src.kind === "dungeon") {
        const d = c.get<Dungeon>(this.src.id);
        const rec = (s.progress.dungeons[d.id] ??= { clears: 0 });
        const tierN = this.src.tier ?? 1;
        const tier = tierN > 1 ? d.tiers?.find((t) => t.tier === tierN) : undefined;
        const first = tier ? !(rec.tierClears?.[tierN]) : rec.clears === 0;
        rec.clears++;
        if (tier) { rec.tierClears ??= {}; rec.tierClears[tierN] = (rec.tierClears[tierN] ?? 0) + 1; }
        const rewards = tier ? tier.rewards : d.rewards;
        const clear = rollTable(s, c, rewards.clear);
        grantDrops(s, c, clear, this.events);
        Object.assign(total, mergeDrops(total, clear));
        if (first) { if (!tier) rec.firstClearAt = now; firstClear = rewards.first_clear as any; grantRewards(s, c, rewards.first_clear as any, this.events); }
        s.progress.trialsCleared[d.id] = now;
        this.events.push({ type: "dungeon_cleared", dungeon: d.id, first });
      } else if (this.src.kind === "tribulation") {
        const t = c.get<Tribulation>(this.src.id);
        s.progress.tribulations[t.id]!.passedAt = now;
        const r = rollTable(s, c, t.rewards); grantDrops(s, c, r, this.events); Object.assign(total, mergeDrops(total, r));
        this.events.push({ type: "tribulation_passed", tribulation: t.id });
      } else if (this.src.kind === "duel") {
        const npc = c.get<Npc>(this.src.npc);
        const rel = (s.relations[this.src.npc] ??= { affinity: 0, giftsToday: 0, topics: [] });
        rel.lastDuelAt = now;
        grantRewards(s, c, npc.duel!.win as any, this.events);
        masteryXp += (npc.duel!.win as any).mastery_xp ?? 0;
        this.events.push({ type: "duel_won", npc: npc.id });
      } else if (this.src.kind === "tournament") {
        // One round per entry; the bracket position is saved between bouts.
        const t = c.get<Tournament>(this.src.id);
        const p = s.progress.tournaments[t.id]!;
        grantRewards(s, c, t.rounds[p.round]!.rewards as any, this.events);
        p.round++;
        const best = `tournament_best:${t.id}`;
        s.progress.counters[best] = Math.max(s.progress.counters[best] ?? 0, p.round);
        this.events.push({ type: "tournament_round", tournament: t.id, round: p.round, won: true });
        if (p.round >= t.rounds.length) {
          p.wins++; p.round = 0;
          s.progress.trialsCleared[t.id] = now;
          grantRewards(s, c, t.champion_rewards as any, this.events);
          this.events.push({ type: "tournament_won", tournament: t.id });
        }
      }
      if (masteryXp > 0) {
        addMasteryXp(s, c, s.character.method, Math.round(masteryXp * c.combat.mastery.method_share), this.events);
        for (const t of s.techniques.actives) if (t) addMasteryXp(s, c, t, Math.round(masteryXp * c.combat.mastery.active_share), this.events);
      }
      if (this.src.kind === "tower") towerFloorCleared(s, c, this.src.id, this.src.floor, now, this.events);
      if (this.src.kind === "realm") { const src = this.src; const n = c.get<Dungeon>(src.id).realm_nodes!.find((x) => x.key === src.node)!; realmBattleDone(s, src.id, n.key, n.kind, true, s.character.hp ?? 1, this.events); }
      if (["node", "event", "dungeon", "tower", "realm"].includes(this.src.kind)) beastsAfterVictory(s, c, masteryXp, this.events);
      s.progress.counters.battles_won = (s.progress.counters.battles_won ?? 0) + 1;
      this.events.push({ type: "battle_won", source: srcId(this.src) });
    } else {
      const maxHp = computeStats(s, c).total.hp ?? 1;
      s.character.hp = Math.max(1, Math.round(maxHp * c.combat.defeat.hp_pct_after_defeat / 100));
      if (this.src.kind === "tribulation") {
        const t = c.get<Tribulation>(this.src.id);
        s.character.qi = Math.max(0, s.character.qi * (1 - t.failure.qi_loss_pct));
        s.progress.tribulations[t.id]!.nextTryAt = now + t.failure.retry_cooldown_min * 60_000;
        this.events.push({ type: "tribulation_failed", tribulation: t.id });
      } else if (this.src.kind === "duel") {
        const npc = c.get<Npc>(this.src.npc);
        (s.relations[this.src.npc] ??= { affinity: 0, giftsToday: 0, topics: [] }).lastDuelAt = now;
        grantRewards(s, c, npc.duel!.lose as any, this.events);
      } else if (this.src.kind === "tournament") {
        const t = c.get<Tournament>(this.src.id);
        const p = s.progress.tournaments[t.id]!;
        this.events.push({ type: "tournament_round", tournament: t.id, round: p.round + 1, won: false });
        p.round = 0;
        if (t.loss.sect_fame) grantRewards(s, c, { sect_fame: t.loss.sect_fame }, this.events);
      } else if (this.src.kind === "realm") {
        const src = this.src; const n = c.get<Dungeon>(src.id).realm_nodes!.find((x) => x.key === src.node)!;
        realmBattleDone(s, src.id, n.key, n.kind, false, s.character.hp, this.events);
      }
      s.progress.counters.battles_lost = (s.progress.counters.battles_lost ?? 0) + 1;
      this.events.push({ type: "battle_lost", source: srcId(this.src) });
    }
    const playerCp = computeStats(s, c).cp;
    this.done = { won, source: this.src, waves: this.results, total, firstClear, masteryXp, recommendations: won ? [] : recommend(s, c, playerCp, enemyCp), enemyCp: Math.round(enemyCp), playerCp };
  }

  /** Domain events produced so far (drained by the caller after each wave / at the end). */
  drainEvents(): DomainEvent[] { const e = this.events; this.events = []; return e; }
}

const srcId = (src: EncounterSource) => src.kind === "duel" ? src.npc : src.kind === "event" ? src.node : src.id;

/**
 * Tournaments are fought one round per entry; the bracket position is saved. Losing a round resets the run
 * and costs fame; starting a new run needs the entry requirements and, after the first attempt, the re-entry fame.
 */
export function canEnterTournament(s: GameState, c: ContentIndex, id: string, _now: number): Result<{ energy: number }> {
  const t = c.get<Tournament>(id);
  const p = s.progress.tournaments[id];
  if (p && p.round > 0) return { ok: true, energy: 0 };          // continuing a run
  if (s.progress.trialsCleared[id] && !t.repeatable) return { ok: false, reason: "You are already champion" };
  const u = checkUnlock(s, c, t.entry as any);
  if (!u.ok) return { ok: false, reason: u.reasons[0]! };
  if (p?.lastAt && s.resources.sect_fame < t.reentry.sect_fame_required) return { ok: false, reason: `Re-entry needs ${t.reentry.sect_fame_required.toLocaleString("en-US")} Fame` };
  return { ok: true, energy: 0 };
}

/** An NPC opponent built from their duel loadout, scaled to a target CP when given (tournaments). */
export function buildDuelist(c: ContentIndex, npcId: string, cp?: number): Combatant {
  const npc = c.get<Npc>(npcId);
  const target = cp ?? npc.cp ?? 1000;
  // Stat block shaped from CP (inverse of the enemy formulas the generators use).
  // Speed follows the player's own speed curve (≈ 10 + 0.05·cp^0.78) so duels are decided by builds, not by action economy.
  const stats = { hp: target * 3.2, atk: target * 0.28, def: target * 0.13, spd: 10 + 0.05 * Math.pow(target, 0.78), crit: 8, crit_dmg: 150, acc: 92, eva: 6, sp_power: target * 0.2, sp_energy: 150 };
  const techniques = (npc.duel?.loadout ?? []).filter((t) => t.startsWith("tech.active") || t.startsWith("tech.ult"));
  return buildEnemyFrom(c, npcId, { name: npc.name, element: npc.elements?.[0] ?? "elem.metal", realm: npc.realm ?? { id: "realm.qi_condensation" }, stats, cp: target, techniques: techniques.length ? techniques : ["tech.active.flame_palm"], ai: { strategy: npc.duel?.strategy ?? "aggressive", rules: [] } }, { kind: "enemy", art: c.artAny(npcId, "battle", "full_body") });
}

function recommend(s: GameState, c: ContentIndex, playerCp: number, enemyCp: number): string[] {
  const out: string[] = [];
  if (enemyCp > playerCp * 1.3) out.push("Cultivate further: the enemy's power is well above yours.");
  const st = computeStats(s, c).total;
  const slotsEmpty = ["weapon", "armor", "helmet", "boots", "necklace", "ring_1"].filter((k) => s.equipped[k] === undefined).length;
  if (slotsEmpty) out.push(`Equip gear in your ${slotsEmpty} empty slot${slotsEmpty > 1 ? "s" : ""}.`);
  if (s.techniques.actives.filter(Boolean).length < 2) out.push("Learn more techniques at the Scripture Pavilion.");
  if (!s.techniques.actives.some((t) => t && (c.get<any>(t).heal_pct || c.get<any>(t).shield_pct_max_hp))) out.push("Add a defensive technique (shield or healing) to your loadout.");
  if ((st.def ?? 0) < (st.atk ?? 0) * 0.3) out.push("Your Defense is low: upgrade armor and helmet.");
  if (!s.beasts.active) out.push("Hatch and train a spirit beast to fight at your side.");
  return out.slice(0, 4);
}
