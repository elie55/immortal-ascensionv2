/**
 * Battle core: speed-gauge turn order, damage/heal/shield resolution, status effects, techniques and
 * ultimates, gear specials, boss phases (summons, shields, enrage, charged attacks), hazards, auto-battle
 * rules for allies and strategy AI for enemies. Deterministic given the rng. No DOM.
 */
import type { ContentIndex, StatusEffect, Element } from "../../content/index.ts";
import { nextFloat, chance, type RngState } from "../rng.ts";
import type { Combatant, Skill, BattleEvent, BattleOptions, BattleSummary, PlayerChoice, AutoRuleResolved, StatusInstance, HitKind, BossSignature } from "./types.ts";
import { BASIC, buildEnemy } from "./build.ts";
import { chooseAuto, chooseEnemy, resolveTargets } from "./ai.ts";

const CONTROL = new Set(["status.stun", "status.freeze", "status.silence"]);
/** Stats that are already percentages: status modifiers add points to them (poison −30 heal bonus) instead of scaling them. */
const POINT_STATS = new Set(["crit", "crit_dmg", "eva", "acc", "cdr", "dmg_red", "life_steal", "armor_pen", "heal_bonus", "shield_str", "status_res"]);

export class Battle {
  readonly c: ContentIndex;
  readonly units: Combatant[];
  readonly rng: RngState;
  readonly opts: BattleOptions;
  readonly autoRules: AutoRuleResolved[];
  manual = false;
  events: BattleEvent[] = [];
  round = 0;
  result: BattleSummary["result"] | null = null;
  pending: Combatant | null = null;   // player waiting for manual input
  killed: string[] = [];
  /** Enemy focus fire: the ally every enemy keeps hitting until it falls (ai.ts). */
  focus: number | null = null;
  private ticks = 0;
  private statusDefs = new Map<string, StatusEffect>();
  private elements = new Map<string, Element>();

  constructor(c: ContentIndex, units: Combatant[], rng: RngState, autoRules: AutoRuleResolved[], opts: BattleOptions = {}) {
    this.c = c; this.units = units; this.rng = rng; this.opts = opts; this.autoRules = autoRules;
    for (const s of c.byPrefix<StatusEffect>("status")) this.statusDefs.set(s.id, s);
    for (const e of c.byPrefix<Element>("elem")) this.elements.set(e.id, e);
  }

  get player(): Combatant { return this.units.find((u) => u.kind === "player")!; }
  alive(side?: "ally" | "enemy"): Combatant[] { return this.units.filter((u) => u.alive && (!side || u.side === side)); }
  get needsInput(): boolean { return this.pending !== null; }
  drain(): BattleEvent[] { const e = this.events; this.events = []; return e; }
  private emit(e: BattleEvent) { this.events.push(e); }

  // ---------- stats ----------

  /** Effective stat: base × status modifiers (%), boss enrage, clamped where it matters. */
  eff(u: Combatant, k: string): number {
    let v = u.base[k] ?? 0;
    let pct = 0;
    for (const s of u.statuses) { const d = this.statusDefs.get(s.id); const m = d?.modifiers?.[k as keyof typeof d.modifiers]; if (m) pct += m * (d!.stacking === "stack" ? s.stacks : 1); }
    if (POINT_STATS.has(k) || k.startsWith("elem_")) v += pct; else v *= 1 + pct / 100;
    if (u.boss?.phases[u.boss.phase]?.enrage) { const en = u.boss.phases[u.boss.phase]!.enrage!; if (k === "atk") v *= en.atk_mult; if (k === "spd") v *= en.spd_mult; }
    if (k === "atk" && u.boss?.signature?.kind === "fury" && u.boss.sig.fury) v *= 1 + u.boss.sig.fury * (u.boss.signature.atk_pct_per_round as number) / 100;
    const caps = this.c.combat.caps as Record<string, number>;
    if (k === "spd") { const mn = this.c.combat.turn.min_speed; v = Math.max(mn, v); if (caps.spd_exp !== 1) v = mn + Math.pow(v - mn, caps.spd_exp) * Math.pow(10, 1 - caps.spd_exp); }
    else if (caps[k] !== undefined) v = Math.min(caps[k]!, v);
    else if (k.startsWith("elem_dmg.") || k.startsWith("elem_res.")) v = Math.min(caps.elem_diff!, v);
    return v;
  }
  has(u: Combatant, status: string): StatusInstance | undefined { return u.statuses.find((s) => s.id === status); }

  // ---------- start ----------

  start(wave = 1, waves = 1): void {
    this.emit({ t: "start", wave, waves });
    for (const u of this.units) {
      for (const sp of u.specials) {
        if (sp.kind === "shield_on_battle_start") this.addShield(u, u, Math.round(u.maxHp * (sp.value ?? 10) / 100));
        if (sp.kind === "cooldown_reduction") for (const sk of u.skills) if (sk.cooldown > 1) sk.cooldown = Math.max(1, sk.cooldown - (sp.value ?? 1));
      }
      if (u.boss) this.enterPhase(u, 0, true);
    }
    for (const u of this.units) if (u.side === "enemy") this.planNext(u);
  }

  // ---------- main loop ----------

  /** Advance until the battle ends or the player needs manual input. Returns the result when finished. */
  run(maxTurns = 10_000): BattleSummary["result"] | null {
    for (let i = 0; i < maxTurns && !this.result && !this.pending; i++) this.step();
    return this.result;
  }

  /** One actor's turn (or the start of the player's manual turn). */
  step(): void {
    if (this.result) return;
    if (this.pending) {
      if (this.manual) return;
      // auto mode resumed while waiting: let the rules act for the pending turn
      const p = this.pending; this.pending = null;
      this.perform(p, chooseAuto(this, p, this.autoRules)); this.endTurn(p); return;
    }
    const actor = this.nextActor();
    if (!actor) { this.finish("timeout"); return; }
    this.beginTurn(actor);
    if (this.result) return;
    if (!actor.alive) return;
    if (this.isControlled(actor)) { this.emit({ t: "skip", actor: actor.uid, reason: this.has(actor, "status.freeze") ? "frozen" : "stunned" }); this.interrupt(actor); this.endTurn(actor); return; }
    if (actor.kind === "player" && this.manual) { this.pending = actor; return; }
    // a big attack announced at the end of this unit's last turn lands now
    if (actor.telegraph) {
      const tg = actor.telegraph; actor.telegraph = null;
      const sk = actor.skills.find((s) => s.id === tg.skill);
      if (sk) { this.perform(actor, { skill: sk, target: tg.target, heavy: true }); this.endTurn(actor); return; }
    }
    const choice = actor.ai ? chooseEnemy(this, actor) : chooseAuto(this, actor, this.autoRules);
    this.perform(actor, choice);
    this.endTurn(actor);
  }

  /** Manual mode: the player's choice for the pending turn. */
  act(choice: PlayerChoice): boolean {
    const actor = this.pending;
    if (!actor) return false;
    const skill = actor.skills.find((s) => s.id === choice.skill);
    if (!skill || !this.canUse(actor, skill)) return false;
    this.pending = null;
    this.perform(actor, { skill, target: choice.target });
    this.endTurn(actor);
    return true;
  }

  /** The next `n` actors by the speed gauge, simulated on a copy (nothing changes). For the turn-order strip. */
  previewOrder(n = 6): number[] {
    const th = this.c.combat.turn.gauge_threshold;
    const live = this.alive();
    if (!live.length) return [];
    const g = new Map(live.map((u) => [u.uid, u.gauge]));
    const spd = new Map(live.map((u) => [u.uid, this.eff(u, "spd")]));
    const out: number[] = [];
    for (let guard = 0; out.length < n && guard < 100_000; guard++) {
      let best: Combatant | null = null;
      for (const u of live) { const v = g.get(u.uid)!; if (v >= th && (!best || v > g.get(best.uid)! || (v === g.get(best.uid)! && u.uid < best.uid))) best = u; }
      if (best) { g.set(best.uid, g.get(best.uid)! - th); out.push(best.uid); continue; }
      for (const u of live) g.set(u.uid, g.get(u.uid)! + spd.get(u.uid)!);
    }
    return out;
  }

  /** Stun, freeze or silence cancels a boss charge and a wound-up big attack. */
  private interrupt(u: Combatant): void {
    let hit = false;
    if (u.boss?.charging) { u.boss.charging = null; hit = true; }
    if (u.telegraph) { u.telegraph = null; hit = true; }
    if (hit) this.emit({ t: "interrupt", actor: u.uid });
  }

  /**
   * Elites and bosses telegraph big attacks ("intent"): at the end of their turn they decide their next move as they
   * would at the start of it (cooldowns one lower, spirit energy regenerated). When that move is estimated to take at
   * least `telegraph.heavy_pct` % of the player's or a companion's max HP it is locked in and announced, and it lands
   * on that next turn, so the warning never delays or weakens the attack. Stun, freeze or silence cancels it.
   */
  private planNext(actor: Combatant): void {
    actor.telegraph = null;
    const T = this.c.combat.telegraph;
    const rank = actor.boss ? "boss" : actor.elite ? "elite" : null;
    if (!rank || !T.ranks.includes(rank) || !actor.alive || !actor.ai || this.result) return;
    if (actor.boss?.charging && actor.boss.charging.turnsLeft <= 1) return;   // its charged attack lands first
    const cds = { ...actor.cooldowns }, sp = actor.sp;
    for (const k of Object.keys(actor.cooldowns)) if (actor.cooldowns[k]! > 0) actor.cooldowns[k]!--;
    if (actor.maxSp > 0) actor.sp = Math.min(actor.maxSp, actor.sp + Math.round(actor.maxSp * this.c.combat.spirit_energy.regen_pct_per_turn / 100));
    const choice = chooseEnemy(this, actor);
    actor.cooldowns = cds; actor.sp = sp;
    this.windUp(actor, choice);
  }

  private windUp(actor: Combatant, choice: { skill: Skill; target?: number }): boolean {
    const T = this.c.combat.telegraph;
    const sk = choice.skill;
    if (sk.kind === "basic" || sk.power <= 0) return false;
    const targets = resolveTargets(this, actor, sk, choice.target).filter((t) => t.side !== actor.side);
    // measured on the player and Dao companions: a spirit beast's small HP pool would make every hit look "big"
    const judged = targets.filter((t) => t.kind !== "beast");
    if (!judged.length) return false;
    const pct = Math.max(...judged.map((t) => this.estimate(actor, t, sk) / Math.max(1, t.maxHp) * 100));
    if (pct < T.heavy_pct) return false;
    actor.telegraph = { skill: sk.id, name: sk.name, target: choice.target, targets: targets.map((t) => t.uid), pct: Math.round(pct) };
    this.emit({ t: "telegraph", actor: actor.uid, skill: sk.id, name: sk.name, targets: actor.telegraph.targets, pct: Math.round(pct) });
    return true;
  }

  /** Expected damage of a skill on a target (no variance, crit averaged, no dodge, before shields). */
  estimate(a: Combatant, d: Combatant, skill: Skill, extraMult = 1): number {
    const R = this.c.combat.damage;
    let raw = (this.eff(a, "atk") + this.eff(a, "sp_power") * R.sp_power_weight) * (skill.power / 100) * skill.masteryMult * extraMult;
    raw *= this.elementMult(a, d, skill.element);
    const cr = Math.max(0, Math.min(1, this.eff(a, "crit") / 100));
    raw *= 1 + cr * (Math.max(100, this.eff(a, "crit_dmg") || R.crit_dmg_default) / 100 - 1);
    const defEff = this.eff(d, "def") * (1 - this.eff(a, "armor_pen") / 100);
    const atk = Math.max(1, this.eff(a, "atk"));
    raw *= atk / (atk + defEff * R.def_factor);
    raw *= a.side === "enemy" ? (this.opts.enemyDmgMult ?? 1) : (this.opts.allyDmgMult ?? 1);
    raw *= 1 - this.eff(d, "dmg_red") / 100;
    return raw * skill.hits;
  }

  private nextActor(): Combatant | null {
    const th = this.c.combat.turn.gauge_threshold;
    for (let guard = 0; guard < 10_000; guard++) {
      const live = this.alive();
      if (!live.length) return null;
      let best: Combatant | null = null;
      for (const u of live) if (u.gauge >= th && (!best || u.gauge > best.gauge || (u.gauge === best.gauge && u.uid < best.uid))) best = u;
      if (best) { best.gauge -= th; return best; }
      for (const u of live) u.gauge += this.eff(u, "spd");
      if (++this.ticks > 1e6) return null;
    }
    return null;
  }

  private beginTurn(u: Combatant): void {
    u.turns++;
    if (u.kind === "player") {
      this.round++;
      if (this.opts.surviveRounds && this.round > this.opts.surviveRounds) { this.finish("victory"); return; }
      if (this.round > this.c.combat.turn.max_rounds) { this.finish("timeout"); return; }
      this.hazardStrike(); if (this.result) return;
      for (const b of this.alive("enemy")) if (b.boss?.signature) this.signatureRound(b);
    }
    this.emit({ t: "turn", actor: u.uid, round: this.round });
    for (const k of Object.keys(u.cooldowns)) if (u.cooldowns[k]! > 0) u.cooldowns[k]!--;
    if ((u.controlGuard ?? 0) > 0 && !this.isControlled(u)) u.controlGuard!--;
    if (u.maxSp > 0) this.gainSp(u, Math.round(u.maxSp * this.c.combat.spirit_energy.regen_pct_per_turn / 100));
    for (const sp of u.specials) {
      if (sp.kind === "sp_restore") this.gainSp(u, sp.value ?? 0);
      if (sp.kind === "heal_on_turn") this.heal(u, u, Math.round(u.maxHp * (sp.value ?? 0) / 100), "regen");
    }
    if (u.boss?.charging) u.boss.charging.turnsLeft--;
    if (u.boss?.signature) this.signatureTurn(u);
  }

  private endTurn(u: Combatant): void {
    if (!u.alive) return;
    // damage-over-time and regeneration tick on the holder's own turn
    for (const st of [...u.statuses]) {
      const d = this.statusDefs.get(st.id);
      if (!d?.tick || !u.alive) continue;
      if (d.tick.pct_atk) this.applyDamage(null, u, Math.round(st.sourceAtk * d.tick.pct_atk / 100 * st.stacks), { element: "elem.none", kind: "dot", ignoreDef: true });
      if (d.tick.pct_max_hp) {
        const amt = Math.round(u.maxHp * d.tick.pct_max_hp / 100 * st.stacks);
        if (amt >= 0) this.applyDamage(null, u, amt, { element: "elem.none", kind: "dot", ignoreDef: true, trueDamage: true }); else this.heal(u, u, -amt, "regen");
      }
    }
    for (const st of u.statuses) st.turns--;
    const expired = u.statuses.filter((s) => s.turns <= 0);
    u.statuses = u.statuses.filter((s) => s.turns > 0);
    for (const s of expired) {
      this.emit({ t: "status", actor: u.uid, target: u.uid, status: s.id, result: "expired" });
      if (s.id === "status.shield" && !u.statuses.some((x) => x.id === "status.shield")) u.shield = 0;
      // Diminishing returns on control: after a stun/freeze/silence wears off the unit cannot be controlled again for a few of its turns.
      if (CONTROL.has(s.id)) u.controlGuard = Math.max(u.controlGuard ?? 0, this.c.combat.status.control_immunity_turns + (u.boss ? 1 : 0));
    }
    this.checkEnd();
    if (u.side === "enemy" && u.alive) this.planNext(u);
  }

  private isControlled(u: Combatant): boolean { return u.statuses.some((s) => CONTROL.has(s.id)); }
  canUse(u: Combatant, s: Skill): boolean {
    if (s.kind === "basic") return true;
    if ((u.cooldowns[s.id] ?? 0) > 0) return false;
    if (s.ultCost) return u.ult >= s.ultCost;
    if (s.kind === "ultimate") return u.ult >= (s.ultCharge ?? 100);
    if (this.has(u, "status.silence")) return false;
    return u.sp >= s.spCost;
  }
  availableSkills(u: Combatant): Skill[] { return u.skills.filter((s) => this.canUse(u, s)); }

  // ---------- actions ----------

  perform(actor: Combatant, choice: { skill: Skill; target?: number; charged?: boolean; heavy?: boolean }): void {
    const { skill } = choice;
    const boss = actor.boss;
    // boss charged attack lifecycle
    if (boss && !choice.charged) {
      const phase = boss.phases[boss.phase]!;
      if (boss.charging && boss.charging.turnsLeft <= 0) {
        const sk = actor.skills.find((s) => s.id === boss.charging!.tech) ?? skill;
        boss.charging = null; (boss as any).chargeDelay = (phase.charged_attack?.turns_to_charge ?? 2) + 2;
        return this.perform(actor, { skill: sk, charged: true });
      }
      if (phase.charged_attack && !boss.charging) {
        const delay = ((boss as any).chargeDelay ?? 0) as number;
        if (delay <= 0) { boss.charging = { tech: phase.charged_attack.tech, turnsLeft: phase.charged_attack.turns_to_charge }; this.emit({ t: "charge", actor: actor.uid, skill: phase.charged_attack.tech, turns: phase.charged_attack.turns_to_charge }); }
        else (boss as any).chargeDelay = delay - 1;
      }
    }
    const targets = resolveTargets(this, actor, skill, choice.target);
    if (!targets.length) return;
    if (skill.kind !== "basic") { actor.sp = Math.max(0, actor.sp - skill.spCost); if (skill.cooldown > 0) actor.cooldowns[skill.id] = this.cooldownFor(actor, skill); }
    if (skill.ultCost) actor.ult = Math.max(0, actor.ult - skill.ultCost);
    else if (skill.kind === "ultimate") actor.ult = 0;
    else actor.ult = Math.min(100, actor.ult + this.c.combat.ultimate.gain_per_action);
    if (skill.kind === "basic") this.gainSp(actor, this.c.combat.spirit_energy.basic_attack_restore);
    this.emit({ t: "action", actor: actor.uid, skill: skill.id, name: skill.name, targets: targets.map((t) => t.uid), charged: choice.charged, ...(choice.heavy ? { heavy: true } : {}) });
    if (skill.ultCost) this.emit({ t: "surge", actor: actor.uid, cost: skill.ultCost });
    const mult = choice.charged ? this.c.combat.damage.charged_attack_mult : 1;
    for (const tgt of targets) {
      if (skill.healPct) this.heal(actor, tgt, Math.round(actor.maxHp * skill.healPct / 100 * skill.masteryMult), "heal");
      if (skill.shieldPct) this.addShield(actor, tgt, Math.round(actor.maxHp * skill.shieldPct / 100 * skill.masteryMult));
      if (skill.power > 0 && tgt.side !== actor.side) {
        for (let h = 0; h < skill.hits && tgt.alive && actor.alive; h++) this.strike(actor, tgt, skill, mult);
      }
      for (const ap of skill.applies) if (tgt.alive && (skill.power === 0 || tgt.side === actor.side || this.lastHitLanded)) this.applyStatus(actor, tgt, ap.status, ap.chance, ap.turns, ap.potency);
      // tempo: a hit delays the enemy, a boon hastens the ally (or the caster)
      if (skill.turnShift && tgt.alive && (skill.power === 0 || tgt.side === actor.side || this.lastHitLanded)) this.shiftTurn(actor, tgt, tgt.side === actor.side ? skill.turnShift : -skill.turnShift);
    }
    // a sovereign that answers ultimates acts at once
    if (skill.kind === "ultimate" && actor.side === "ally") for (const b of this.alive("enemy")) if (b.boss?.signature?.kind === "answer") { this.emit({ t: "signature", actor: b.uid, kind: "answer", name: b.boss.signature.name, targets: [b.uid] }); this.shiftTurn(b, b, b.boss.signature.push_pct as number); }
    if (actor.ult >= 100 && actor.skills.some((s) => s.kind === "ultimate")) this.emit({ t: "ult_ready", actor: actor.uid });
  }

  /** Move a unit along the turn gauge by `pct` % of a turn (negative = delay). */
  shiftTurn(by: Combatant, u: Combatant, pct: number): void {
    const th = this.c.combat.turn.gauge_threshold;
    u.gauge = Math.max(-th, u.gauge + th * pct / 100);
    this.emit({ t: "turn_shift", actor: by.uid, target: u.uid, pct: Math.round(pct) });
  }

  private cooldownFor(u: Combatant, s: Skill): number {
    const cdr = this.eff(u, "cdr");
    return Math.max(1, Math.round(s.cooldown * (1 - cdr / 100)));
  }

  private lastHitLanded = false;

  /** One hit of a damaging skill. */
  private strike(a: Combatant, d: Combatant, skill: Skill, extraMult = 1): void {
    const R = this.c.combat.damage;
    this.lastHitLanded = false;
    const hitChance = Math.max(R.hit_floor, Math.min(1, (this.eff(a, "acc") - this.eff(d, "eva")) / 100));
    if (!chance(this.rng, hitChance)) { this.emit({ t: "hit", actor: a.uid, target: d.uid, amount: 0, crit: false, element: skill.element, absorbed: 0, dodged: true, kind: "attack" }); return; }
    let raw = (this.eff(a, "atk") + this.eff(a, "sp_power") * R.sp_power_weight) * (skill.power / 100) * skill.masteryMult * extraMult;
    // a warded element feeds the boss instead of wounding it
    if (d.boss?.signature?.kind === "ward" && d.boss.sig.ward === skill.element) {
      this.emit({ t: "signature", actor: d.uid, kind: "ward", name: d.boss.signature.name, targets: [a.uid], detail: this.elements.get(skill.element)?.name });
      this.heal(d, d, Math.round(raw * 0.5), "heal"); this.lastHitLanded = true; return;
    }
    raw *= this.elementMult(a, d, skill.element);
    const crit = chance(this.rng, Math.max(0, Math.min(1, this.eff(a, "crit") / 100)));
    if (crit) raw *= Math.max(100, this.eff(a, "crit_dmg") || R.crit_dmg_default) / 100;
    const defEff = this.eff(d, "def") * (1 - this.eff(a, "armor_pen") / 100);
    const atk = Math.max(1, this.eff(a, "atk"));
    raw *= atk / (atk + defEff * R.def_factor);
    raw *= 1 + (nextFloat(this.rng) * 2 - 1) * R.variance;
    raw *= a.side === "enemy" ? (this.opts.enemyDmgMult ?? 1) : (this.opts.allyDmgMult ?? 1);
    const dealt = this.applyDamage(a, d, Math.round(raw), { element: skill.element, kind: "attack", crit });
    this.lastHitLanded = true;
    if (dealt > 0) {
      const ls = this.eff(a, "life_steal");
      if (ls > 0) this.heal(a, a, Math.round(dealt * ls / 100), "lifesteal");
      for (const sp of a.specials) {
        if (sp.kind === "on_hit_apply" && sp.status && d.alive) this.applyStatus(a, d, sp.status, sp.chance ?? 0.2, 2);
        if (sp.kind === "on_crit_apply" && crit && sp.status && d.alive) this.applyStatus(a, d, sp.status, sp.chance ?? 0.3, 2);
      }
      // defender reactions
      const refl = this.has(d, "status.reflect");
      const reflSpecial = d.specials.find((s) => s.kind === "reflect");
      const reflPct = (refl ? (refl.potency ?? this.c.combat.status.default_reflect_pct) : 0) + (reflSpecial?.value ?? 0);
      if (reflPct > 0 && a.alive) this.applyDamage(d, a, Math.round(dealt * reflPct / 100), { element: "elem.none", kind: "reflect", ignoreDef: true, noReact: true });
      const counter = d.specials.find((s) => s.kind === "counter");
      const stance = this.has(d, "status.counter_stance");
      if (d.alive && a.alive && (stance || (counter && chance(this.rng, counter.chance ?? 0.3)))) this.counter(d, a, stance ? (stance.potency ?? 80) : (counter!.value ?? 50));
      // signatures on the defender (riposte) and the attacker (rend)
      const ds = d.boss?.signature;
      if (ds?.kind === "riposte" && d.alive && a.alive && ++d.boss!.sig.hits % (ds.every as number) === 0) { this.emit({ t: "signature", actor: d.uid, kind: "riposte", name: ds.name, targets: [a.uid] }); this.counter(d, a, ds.pct as number); }
      const as = a.boss?.signature;
      if (as?.kind === "rend" && d.alive) {
        if (a.boss!.sig.last === d.uid) { const before = this.has(d, "status.rend")?.stacks ?? 0; this.forceStatus(a, d, "status.rend", 3); const now = this.has(d, "status.rend")?.stacks ?? 0; if (now > before) this.emit({ t: "signature", actor: a.uid, kind: "rend", name: as.name, targets: [d.uid], detail: `×${now}` }); }
        a.boss!.sig.last = d.uid;
      }
    }
  }

  /** A counter-blow at `pct` % of the defender's attack, with its basic element. */
  private counter(d: Combatant, a: Combatant, pct: number): void {
    const R = this.c.combat.damage;
    const basic = d.skills.find((s) => s.kind === "basic") ?? { ...BASIC, element: d.element, power: 100, masteryMult: 1 };
    this.emit({ t: "action", actor: d.uid, skill: "counter", name: "Counter", targets: [a.uid] });
    this.applyDamage(d, a, Math.round(this.eff(d, "atk") * pct / 100 * this.elementMult(d, a, basic.element) * (Math.max(1, this.eff(d, "atk")) / (Math.max(1, this.eff(d, "atk")) + this.eff(a, "def") * R.def_factor))), { element: basic.element, kind: "counter", noReact: true });
  }

  elementMult(a: Combatant, d: Combatant, element: string): number {
    const R = this.c.combat.damage;
    let m = 1;
    const ea = this.elements.get(element), ed = this.elements.get(d.element);
    if (ea && ed) { if (ea.overcomes === d.element) m += R.element_advantage; else if (ed.overcomes === element) m -= R.element_advantage; }
    if (d.boss?.weaknesses.includes(element)) m += R.boss_weakness_bonus;
    const el = element.split(".")[1];
    const cap = this.c.combat.caps.elem_diff / 100;
    if (el && el !== "none") m += Math.max(-cap, Math.min(cap, (this.eff(a, `elem_dmg.${el}`) - this.eff(d, `elem_res.${el}`) - (d.resistances[`elem_res.${el}`] ?? d.resistances[el] ?? 0)) / 100));
    return Math.max(0.1, m);
  }

  /** Apply damage after all multipliers: invulnerability, damage reduction, shield, death, ult gain, boss phases. */
  applyDamage(a: Combatant | null, d: Combatant, amount: number, o: { element: string; kind: HitKind; crit?: boolean; ignoreDef?: boolean; trueDamage?: boolean; noReact?: boolean }): number {
    if (!d.alive) return 0;
    const R = this.c.combat.damage;
    let amt = amount;
    const sig = d.boss?.signature;
    if (this.has(d, "status.invuln")) amt = 0;
    else {
      if (!o.trueDamage) amt = Math.round(amt * (1 - this.eff(d, "dmg_red") / 100));
      if (sig?.kind === "guarded" && amt > 0 && this.alive("enemy").some((u) => u.kind === "summon")) amt = Math.round(amt * (1 - (sig.dmg_red as number) / 100));
      if (sig?.kind === "measure" && o.kind === "attack") amt = Math.min(amt, Math.max(1, Math.round(d.maxHp * (sig.pct as number) / 100)));
      if (amt > 0 && amt < R.min_damage) amt = R.min_damage;
    }
    let absorbed = 0;
    const hadShield = d.shield > 0;
    if (d.shield > 0 && amt > 0) { absorbed = Math.min(d.shield, amt); d.shield -= absorbed; amt -= absorbed; if (d.shield <= 0) { d.shield = 0; d.statuses = d.statuses.filter((s) => s.id !== "status.shield"); } }
    // a shattered ward staggers the boss and leaves it open
    if (hadShield && d.shield <= 0 && sig?.kind === "break") { this.emit({ t: "signature", actor: d.uid, kind: "break", name: sig.name, targets: [d.uid] }); this.shiftTurn(a ?? d, d, -(sig.delay_pct as number)); this.forceStatus(a ?? d, d, "status.vulnerable", sig.vuln_turns as number); }
    d.hp = Math.max(0, d.hp - amt);
    d.stats.taken += amt;
    if (a) a.stats.dealt += amt + absorbed;
    this.emit({ t: "hit", actor: a?.uid ?? 0, target: d.uid, amount: amt, crit: !!o.crit, element: o.element, absorbed, kind: o.kind });
    if (amt > 0 && d.maxHp > 0) d.ult = Math.min(100, d.ult + (amt / d.maxHp) * this.c.combat.ultimate.gain_per_damage_taken_pct);
    if (d.hp <= 0) this.kill(d, a); else if (d.boss) this.checkPhase(d);
    return amt;
  }

  private kill(d: Combatant, by: Combatant | null): void {
    const sig = d.boss?.signature;
    if (sig?.kind === "rebirth" && !d.boss!.sig.reborn) {
      d.boss!.sig.reborn = true; d.hp = Math.max(1, Math.round(d.maxHp * (sig.hp_pct as number) / 100)); d.statuses = []; d.shield = 0; d.telegraph = null;
      this.emit({ t: "signature", actor: d.uid, kind: "rebirth", name: sig.name, targets: [d.uid] });
      this.checkPhase(d); return;
    }
    d.alive = false; d.statuses = []; d.shield = 0; d.telegraph = null;
    if (d.side === "enemy") this.killed.push(d.id);
    this.emit({ t: "death", target: d.uid, by: by?.uid ?? 0 });
    if (by && by.alive) {
      by.stats.kills++;
      by.ult = Math.min(100, by.ult + this.c.combat.ultimate.gain_per_kill);
      for (const sp of by.specials) if (sp.kind === "on_kill") this.heal(by, by, Math.round(by.maxHp * (sp.value ?? 10) / 100), "on_kill");
    }
    this.checkEnd();
  }

  heal(a: Combatant, t: Combatant, amount: number, kind: "heal" | "regen" | "lifesteal" | "on_kill"): void {
    if (!t.alive || amount <= 0) return;
    if (this.has(t, "status.cursed")) { this.emit({ t: "heal", actor: a.uid, target: t.uid, amount: 0, kind }); return; }
    const bonus = Math.max(0, 1 + this.eff(t, "heal_bonus") / 100 + (a !== t ? this.eff(a, "heal_bonus") / 100 : 0));
    const amt = Math.min(t.maxHp - t.hp, Math.max(0, Math.round(amount * bonus)));
    if (amt <= 0) return;
    t.hp += amt; a.stats.healed += amt;
    this.emit({ t: "heal", actor: a.uid, target: t.uid, amount: amt, kind });
  }

  addShield(a: Combatant, t: Combatant, amount: number): void {
    if (!t.alive || amount <= 0) return;
    const amt = Math.round(amount * (1 + this.eff(a, "shield_str") / 100));
    t.shield = Math.max(t.shield, amt);
    if (!this.has(t, "status.shield")) t.statuses.push({ id: "status.shield", turns: this.statusDefs.get("status.shield")?.default_turns ?? 3, stacks: 1, sourceAtk: 0 });
    this.emit({ t: "shield", actor: a.uid, target: t.uid, amount: amt });
  }

  gainSp(u: Combatant, n: number): void { if (u.maxSp <= 0 || n <= 0) return; const before = u.sp; u.sp = Math.min(u.maxSp, u.sp + n); if (u.sp !== before) this.emit({ t: "sp", actor: u.uid, delta: u.sp - before }); }

  applyStatus(src: Combatant, tgt: Combatant, status: string, p: number, turns: number, potency?: number): void {
    const def = this.statusDefs.get(status);
    if (!def || !tgt.alive) return;
    const hostile = def.kind === "debuff" || def.kind === "control" || def.kind === "dot";
    if (hostile) {
      if (CONTROL.has(status) && (tgt.controlGuard ?? 0) > 0) { this.emit({ t: "status", actor: src.uid, target: tgt.uid, status, result: "immune" }); return; }
      const res = Math.min(this.c.combat.status.control_resist_cap, this.eff(tgt, "status_res") / 100);
      const bossMult = CONTROL.has(status) && tgt.boss ? this.c.combat.status.boss_control_mult : 1;
      if (!chance(this.rng, p * (1 - res) * bossMult)) { this.emit({ t: "status", actor: src.uid, target: tgt.uid, status, result: "resisted" }); return; }
    } else if (p < 1 && !chance(this.rng, p)) return;
    const cur = this.has(tgt, status);
    const dur = Math.max(1, turns || def.default_turns);
    if (cur) {
      if (def.stacking === "none") { this.emit({ t: "status", actor: src.uid, target: tgt.uid, status, result: "immune" }); return; }
      cur.turns = Math.max(cur.turns, dur); cur.sourceAtk = Math.max(cur.sourceAtk, this.eff(src, "atk")); if (potency !== undefined) cur.potency = potency;
      if (def.stacking === "stack" && cur.stacks < def.max_stacks) { cur.stacks++; this.emit({ t: "status", actor: src.uid, target: tgt.uid, status, result: "stacked" }); }
      else this.emit({ t: "status", actor: src.uid, target: tgt.uid, status, result: "applied" });
    } else {
      tgt.statuses.push({ id: status, turns: dur, stacks: 1, sourceAtk: this.eff(src, "atk"), potency });
      this.emit({ t: "status", actor: src.uid, target: tgt.uid, status, result: "applied" });
      if (status === "status.shield" && tgt.shield <= 0) this.addShield(src, tgt, Math.round(tgt.maxHp * this.c.combat.status.shield_from_status_pct / 100));
    }
    if (CONTROL.has(status)) this.interrupt(tgt);
  }

  /** A status that is part of a mechanic, not a roll: no resistance, no control immunity; stacks where the status stacks. */
  private forceStatus(src: Combatant, tgt: Combatant, status: string, turns: number): void {
    const def = this.statusDefs.get(status);
    if (!def || !tgt.alive) return;
    const cur = this.has(tgt, status);
    if (cur) {
      cur.turns = Math.max(cur.turns, turns);
      if (def.stacking === "stack" && cur.stacks < def.max_stacks) { cur.stacks++; this.emit({ t: "status", actor: src.uid, target: tgt.uid, status, result: "stacked" }); }
      else this.emit({ t: "status", actor: src.uid, target: tgt.uid, status, result: "applied" });
    } else { tgt.statuses.push({ id: status, turns, stacks: 1, sourceAtk: this.eff(src, "atk") }); this.emit({ t: "status", actor: src.uid, target: tgt.uid, status, result: "applied" }); }
  }

  // ---------- bosses ----------

  private checkPhase(b: Combatant): void {
    const prof = b.boss!;
    while (prof.phase + 1 < prof.phases.length && b.hp / b.maxHp <= prof.phases[prof.phase + 1]!.hp_threshold) this.enterPhase(b, prof.phase + 1);
  }

  private enterPhase(b: Combatant, index: number, initial = false): void {
    const prof = b.boss!;
    const ph = prof.phases[index]!;
    prof.phase = index;
    if (!initial) this.emit({ t: "phase", actor: b.uid, name: ph.name, index });
    // preferred technique set for this phase (basic + phase techs + the rest as fallbacks)
    const ids = ph.techniques;
    b.skills.sort((x, y) => (x.kind === "basic" ? -1 : y.kind === "basic" ? 1 : (ids.includes(y.id) ? 1 : 0) - (ids.includes(x.id) ? 1 : 0)));
    (b as any).phaseTechs = ids;
    if (ph.shield_pct) this.addShield(b, b, Math.round(b.maxHp * ph.shield_pct / 100));
    if (prof.signature?.kind === "break") this.addShield(b, b, Math.round(b.maxHp * (prof.signature.shield_pct as number) / 100));
    if (ph.summons.length) {
      const spawned: number[] = [];
      for (const sm of ph.summons) for (let i = 0; i < sm.count; i++) {
        if (this.alive("enemy").length >= this.c.combat.turn.max_enemies) break;
        const e = buildEnemy(this.c, sm.enemy, { hpMult: this.opts.enemyHpMult, kind: "summon" });
        e.gauge = 0; this.units.push(e); spawned.push(e.uid);
      }
      if (spawned.length) this.emit({ t: "summon", actor: b.uid, spawned });
    }
    if (ph.charged_attack) { prof.charging = { tech: ph.charged_attack.tech, turnsLeft: ph.charged_attack.turns_to_charge }; (prof as any).chargeDelay = 0; if (!initial) this.emit({ t: "charge", actor: b.uid, skill: ph.charged_attack.tech, turns: ph.charged_attack.turns_to_charge }); }
    else prof.charging = null;
  }

  // ---------- signature mechanics (schema/actors.ts BossSignature) ----------

  /** Hooks on the player's round: fury stacks and the tide. */
  private signatureRound(b: Combatant): void {
    const sig = b.boss!.signature as BossSignature;
    if (sig.kind === "fury" && this.round > (sig.after_round as number)) { b.boss!.sig.fury++; this.emit({ t: "signature", actor: b.uid, kind: "fury", name: sig.name, targets: [b.uid], detail: `+${Math.round(b.boss!.sig.fury * (sig.atk_pct_per_round as number))}%` }); }
    if (sig.kind === "tide" && (this.round - 1) % (sig.cycle as number) === 0) {
      const high = b.boss!.sig.tide !== "high"; b.boss!.sig.tide = high ? "high" : "low";
      b.statuses = b.statuses.filter((s) => s.id !== "status.tide_high" && s.id !== "status.tide_low");
      this.forceStatus(b, b, high ? "status.tide_high" : "status.tide_low", (sig.cycle as number) + 1);
      this.emit({ t: "signature", actor: b.uid, kind: "tide", name: sig.name, targets: [b.uid], detail: high ? "High tide" : "Low tide" });
    }
  }

  /** Hooks on the boss's own turn: the ward rotates, the quake, the brand, the curse. */
  private signatureTurn(b: Combatant): void {
    const sig = b.boss!.signature as BossSignature; const st = b.boss!.sig;
    const allies = () => this.alive("ally");
    if (sig.kind === "ward" && (b.turns - 1) % (sig.cycle as number) === 0) {
      const order = ["elem.metal", "elem.wood", "elem.water", "elem.fire", "elem.earth"].filter((e) => this.elements.has(e));
      const i = order.indexOf(st.ward ?? b.element); st.ward = order[(i + 1) % order.length] ?? order[0];
      this.emit({ t: "signature", actor: b.uid, kind: "ward", name: sig.name, targets: [b.uid], detail: this.elements.get(st.ward!)?.name });
    }
    if (sig.kind === "quake" && b.turns % (sig.every as number) === 0) {
      const tg = allies(); this.emit({ t: "signature", actor: b.uid, kind: "quake", name: sig.name, targets: tg.map((u) => u.uid) });
      for (const u of tg) { this.applyDamage(b, u, this.blow(b, u, sig.pct as number), { element: b.element, kind: "hazard" }); if (this.result) return; }
    }
    if (sig.kind === "mark") {
      if (st.mark) {
        if (--st.mark.left <= 0) {
          const u = this.units.find((x) => x.uid === st.mark!.target); st.mark = undefined;
          if (u?.alive) { u.statuses = u.statuses.filter((s) => s.id !== "status.marked"); this.emit({ t: "signature", actor: b.uid, kind: "mark", name: sig.name, targets: [u.uid], detail: "detonates" }); this.applyDamage(b, u, this.blow(b, u, sig.pct as number), { element: b.element, kind: "hazard" }); }
        }
      } else {
        const pool = allies().filter((u) => u.kind !== "beast"); const list = pool.length ? pool : allies();
        const u = list[Math.floor(nextFloat(this.rng) * list.length)];
        if (u) { st.mark = { target: u.uid, left: sig.turns as number }; this.forceStatus(b, u, "status.marked", (sig.turns as number) + 1); this.emit({ t: "signature", actor: b.uid, kind: "mark", name: sig.name, targets: [u.uid], detail: `${sig.turns} turns` }); }
      }
    }
    if (sig.kind === "curse" && b.turns % (sig.every as number) === 0) {
      const tg = allies(); this.emit({ t: "signature", actor: b.uid, kind: "curse", name: sig.name, targets: tg.map((u) => u.uid) });
      for (const u of tg) this.forceStatus(b, u, "status.cursed", sig.turns as number);
    }
  }

  /** An unavoidable blow at `pct` % of the boss's attack against the target's defence (no crit, no dodge). */
  private blow(b: Combatant, u: Combatant, pct: number): number {
    const atk = Math.max(1, this.eff(b, "atk"));
    return Math.round(atk * pct / 100 * this.elementMult(b, u, b.element) * (atk / (atk + this.eff(u, "def") * this.c.combat.damage.def_factor)) * (this.opts.enemyDmgMult ?? 1));
  }

  // ---------- hazards (tribulation lightning) ----------

  private hazardStrike(): void {
    const hz = this.opts.hazard;
    if (!hz) return;
    const waveIdx = Math.min(hz.waves.length - 1, Math.floor((this.round - 1) / hz.turnsPerWave));
    const w = hz.waves[waveIdx]!;
    const src = this.units.find((u) => u.uid === hz.source);
    const allies = this.alive("ally");
    if (!allies.length) return;
    this.emit({ t: "hazard", name: hz.name, element: w.element, wave: waveIdx + 1, waves: hz.waves.length });
    const atk = src ? this.eff(src, "atk") : 100;
    const el = w.element.split(".")[1];
    for (let i = 0; i < w.bolts; i++) {
      const live = this.alive("ally");
      if (!live.length) return;
      const tgt = live[Math.floor(nextFloat(this.rng) * live.length)]!;
      let raw = atk * w.power / 100 * Math.max(0.1, 1 - this.eff(tgt, `elem_res.${el}`) / 100);
      raw *= atk / (atk + this.eff(tgt, "def") * this.c.combat.damage.def_factor);
      this.applyDamage(src ?? null, tgt, Math.round(raw), { element: w.element, kind: "hazard" });
      if (this.result) return;
    }
  }

  // ---------- end ----------

  private checkEnd(): void {
    if (this.result) return;
    if (!this.player.alive) this.finish("defeat");
    else if (!this.alive("enemy").length) this.finish("victory");
  }
  private finish(r: BattleSummary["result"]): void { if (this.result) return; this.result = r; this.pending = null; this.emit({ t: "end", result: r }); }

  summary(): BattleSummary {
    const allies = this.units.filter((u) => u.side === "ally");
    const p = this.player;
    return { result: this.result ?? "timeout", rounds: this.round, dealt: allies.reduce((n, u) => n + u.stats.dealt, 0), taken: allies.reduce((n, u) => n + u.stats.taken, 0), healed: allies.reduce((n, u) => n + u.stats.healed, 0), killed: [...this.killed], playerHp: p.hp, playerSp: p.sp, playerUlt: p.ult };
  }
}
