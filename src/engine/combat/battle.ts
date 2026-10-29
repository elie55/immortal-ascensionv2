/**
 * Battle core: speed-gauge turn order, damage/heal/shield resolution, status effects, techniques and
 * ultimates, gear specials, boss phases (summons, shields, enrage, charged attacks), hazards, auto-battle
 * rules for allies and strategy AI for enemies. Deterministic given the rng. No DOM.
 */
import type { ContentIndex, StatusEffect, Element } from "../../content/index.ts";
import { nextFloat, chance, type RngState } from "../rng.ts";
import type { Combatant, Skill, BattleEvent, BattleOptions, BattleSummary, PlayerChoice, AutoRuleResolved, StatusInstance, HitKind } from "./types.ts";
import { BASIC, buildEnemy } from "./build.ts";
import { chooseAuto, chooseEnemy, resolveTargets } from "./ai.ts";

const CONTROL = new Set(["status.stun", "status.freeze"]);

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
    v *= 1 + pct / 100;
    if (u.boss?.phases[u.boss.phase]?.enrage) { const en = u.boss.phases[u.boss.phase]!.enrage!; if (k === "atk") v *= en.atk_mult; if (k === "spd") v *= en.spd_mult; }
    if (k === "spd") v = Math.max(this.c.combat.turn.min_speed, v);
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
    if (this.isControlled(actor)) { this.emit({ t: "skip", actor: actor.uid, reason: this.has(actor, "status.freeze") ? "frozen" : "stunned" }); if (actor.boss?.charging) { actor.boss.charging = null; this.emit({ t: "interrupt", actor: actor.uid }); } this.endTurn(actor); return; }
    if (actor.kind === "player" && this.manual) { this.pending = actor; return; }
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
    }
    this.emit({ t: "turn", actor: u.uid, round: this.round });
    for (const k of Object.keys(u.cooldowns)) if (u.cooldowns[k]! > 0) u.cooldowns[k]!--;
    if (u.maxSp > 0) this.gainSp(u, Math.round(u.maxSp * this.c.combat.spirit_energy.regen_pct_per_turn / 100));
    for (const sp of u.specials) {
      if (sp.kind === "sp_restore") this.gainSp(u, sp.value ?? 0);
      if (sp.kind === "heal_on_turn") this.heal(u, u, Math.round(u.maxHp * (sp.value ?? 0) / 100), "regen");
    }
    if (u.boss?.charging) u.boss.charging.turnsLeft--;
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
    for (const s of expired) { this.emit({ t: "status", actor: u.uid, target: u.uid, status: s.id, result: "expired" }); if (s.id === "status.shield" && !u.statuses.some((x) => x.id === "status.shield")) u.shield = 0; }
    this.checkEnd();
  }

  private isControlled(u: Combatant): boolean { return u.statuses.some((s) => CONTROL.has(s.id)); }
  canUse(u: Combatant, s: Skill): boolean {
    if (s.kind === "basic") return true;
    if ((u.cooldowns[s.id] ?? 0) > 0) return false;
    if (s.kind === "ultimate") return u.ult >= (s.ultCharge ?? 100);
    if (this.has(u, "status.silence")) return false;
    return u.sp >= s.spCost;
  }
  availableSkills(u: Combatant): Skill[] { return u.skills.filter((s) => this.canUse(u, s)); }

  // ---------- actions ----------

  perform(actor: Combatant, choice: { skill: Skill; target?: number; charged?: boolean }): void {
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
    if (skill.kind === "ultimate") actor.ult = 0;
    else actor.ult = Math.min(100, actor.ult + this.c.combat.ultimate.gain_per_action);
    if (skill.kind === "basic") this.gainSp(actor, this.c.combat.spirit_energy.basic_attack_restore);
    this.emit({ t: "action", actor: actor.uid, skill: skill.id, name: skill.name, targets: targets.map((t) => t.uid), charged: choice.charged });
    const mult = choice.charged ? this.c.combat.damage.charged_attack_mult : 1;
    for (const tgt of targets) {
      if (skill.healPct) this.heal(actor, tgt, Math.round(actor.maxHp * skill.healPct / 100 * skill.masteryMult), "heal");
      if (skill.shieldPct) this.addShield(actor, tgt, Math.round(actor.maxHp * skill.shieldPct / 100 * skill.masteryMult));
      if (skill.power > 0 && tgt.side !== actor.side) {
        for (let h = 0; h < skill.hits && tgt.alive && actor.alive; h++) this.strike(actor, tgt, skill, mult);
      }
      for (const ap of skill.applies) if (tgt.alive && (skill.power === 0 || tgt.side === actor.side || this.lastHitLanded)) this.applyStatus(actor, tgt, ap.status, ap.chance, ap.turns, ap.potency);
    }
    if (actor.ult >= 100 && actor.skills.some((s) => s.kind === "ultimate")) this.emit({ t: "ult_ready", actor: actor.uid });
  }

  private cooldownFor(u: Combatant, s: Skill): number {
    const cdr = this.eff(u, "cdr");
    return Math.max(1, Math.round(s.cooldown * (1 - Math.min(0.6, cdr / 100))));
  }

  private lastHitLanded = false;

  /** One hit of a damaging skill. */
  private strike(a: Combatant, d: Combatant, skill: Skill, extraMult = 1): void {
    const R = this.c.combat.damage;
    this.lastHitLanded = false;
    const hitChance = Math.max(R.hit_floor, Math.min(1, (this.eff(a, "acc") - this.eff(d, "eva")) / 100));
    if (!chance(this.rng, hitChance)) { this.emit({ t: "hit", actor: a.uid, target: d.uid, amount: 0, crit: false, element: skill.element, absorbed: 0, dodged: true, kind: "attack" }); return; }
    let raw = (this.eff(a, "atk") + this.eff(a, "sp_power") * R.sp_power_weight) * (skill.power / 100) * skill.masteryMult * extraMult;
    raw *= this.elementMult(a, d, skill.element);
    const crit = chance(this.rng, Math.max(0, Math.min(1, this.eff(a, "crit") / 100)));
    if (crit) raw *= Math.max(100, this.eff(a, "crit_dmg") || R.crit_dmg_default) / 100;
    const defEff = this.eff(d, "def") * (1 - Math.min(0.9, this.eff(a, "armor_pen") / 100));
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
      if (counter && d.alive && a.alive && chance(this.rng, counter.chance ?? 0.3)) {
        const basic = d.skills.find((s) => s.kind === "basic") ?? { ...BASIC, element: d.element, power: 100, masteryMult: 1 };
        this.emit({ t: "action", actor: d.uid, skill: "counter", name: "Counter", targets: [a.uid] });
        this.applyDamage(d, a, Math.round(this.eff(d, "atk") * (counter.value ?? 50) / 100 * this.elementMult(d, a, basic.element) * (Math.max(1, this.eff(d, "atk")) / (Math.max(1, this.eff(d, "atk")) + this.eff(a, "def") * R.def_factor))), { element: basic.element, kind: "counter", noReact: true });
      }
    }
  }

  elementMult(a: Combatant, d: Combatant, element: string): number {
    const R = this.c.combat.damage;
    let m = 1;
    const ea = this.elements.get(element), ed = this.elements.get(d.element);
    if (ea && ed) { if (ea.overcomes === d.element) m += R.element_advantage; else if (ed.overcomes === element) m -= R.element_advantage; }
    if (d.boss?.weaknesses.includes(element)) m += R.boss_weakness_bonus;
    const el = element.split(".")[1];
    if (el && el !== "none") m += (this.eff(a, `elem_dmg.${el}`) - this.eff(d, `elem_res.${el}`) - (d.resistances[`elem_res.${el}`] ?? d.resistances[el] ?? 0)) / 100;
    return Math.max(0.1, m);
  }

  /** Apply damage after all multipliers: invulnerability, damage reduction, shield, death, ult gain, boss phases. */
  applyDamage(a: Combatant | null, d: Combatant, amount: number, o: { element: string; kind: HitKind; crit?: boolean; ignoreDef?: boolean; trueDamage?: boolean; noReact?: boolean }): number {
    if (!d.alive) return 0;
    const R = this.c.combat.damage;
    let amt = amount;
    if (this.has(d, "status.invuln")) amt = 0;
    else {
      if (!o.trueDamage) amt = Math.round(amt * (1 - Math.min(0.8, this.eff(d, "dmg_red") / 100)));
      if (amt > 0 && amt < R.min_damage) amt = R.min_damage;
    }
    let absorbed = 0;
    if (d.shield > 0 && amt > 0) { absorbed = Math.min(d.shield, amt); d.shield -= absorbed; amt -= absorbed; if (d.shield <= 0) { d.shield = 0; d.statuses = d.statuses.filter((s) => s.id !== "status.shield"); } }
    d.hp = Math.max(0, d.hp - amt);
    d.stats.taken += amt;
    if (a) a.stats.dealt += amt + absorbed;
    this.emit({ t: "hit", actor: a?.uid ?? 0, target: d.uid, amount: amt, crit: !!o.crit, element: o.element, absorbed, kind: o.kind });
    if (amt > 0 && d.maxHp > 0) d.ult = Math.min(100, d.ult + (amt / d.maxHp) * this.c.combat.ultimate.gain_per_damage_taken_pct);
    if (d.hp <= 0) this.kill(d, a); else if (d.boss) this.checkPhase(d);
    return amt;
  }

  private kill(d: Combatant, by: Combatant | null): void {
    d.alive = false; d.statuses = []; d.shield = 0;
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
    const bonus = 1 + this.eff(t, "heal_bonus") / 100 + (a !== t ? this.eff(a, "heal_bonus") / 100 : 0);
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
      const res = Math.min(this.c.combat.status.control_resist_cap, this.eff(tgt, "status_res") / 100);
      if (!chance(this.rng, p * (1 - res))) { this.emit({ t: "status", actor: src.uid, target: tgt.uid, status, result: "resisted" }); return; }
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
    if (CONTROL.has(status) && tgt.boss?.charging) { tgt.boss.charging = null; this.emit({ t: "interrupt", actor: tgt.uid }); }
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
