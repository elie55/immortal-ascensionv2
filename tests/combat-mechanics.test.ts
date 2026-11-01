/**
 * Combat mechanics pass (docs/COMBAT.md): turn tempo, Surge, counter stances, boss signature mechanics, and the
 * smarter auto-battle / enemy AI. Battles are built by hand so each rule is tested in isolation.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { testContent } from "./helpers/content.ts";
import { newGameState } from "../src/engine/state.ts";
import { seedRng } from "../src/engine/rng.ts";
import { Battle } from "../src/engine/combat/battle.ts";
import { buildPlayer, buildEnemy, buildEnemyFrom, resetUids, surgeSkill, techSkill, BASIC } from "../src/engine/combat/build.ts";
import type { Combatant, AutoRuleResolved, Skill, BattleEvent } from "../src/engine/combat/types.ts";
import { chooseAuto, chooseEnemy } from "../src/engine/combat/ai.ts";

const c = testContent();
const T0 = Date.UTC(2026, 9, 29, 12, 0, 0);
const TH = c.combat.turn.gauge_threshold;
const rules = (): AutoRuleResolved[] => c.combat.auto_default.map((r) => ({ slot: r.slot, when: r.when, value: r.value, target: r.target }));
const fresh = (seed = 11) => newGameState(c, T0, { seed });

/** A battle that waits for the player's first manual turn, with every unit's gauge at zero. */
function arena(units: Combatant[], seed = 3, opts = {}) {
  const b = new Battle(c, units, seedRng(seed), rules(), opts);
  b.manual = true; b.start();
  return b;
}
const player = (mut?: (s: ReturnType<typeof fresh>) => void) => { const s = fresh(); mut?.(s); return buildPlayer(s, c); };
const bossDef = (base: any, signature: any) => ({ ...base, signature });
const sigBoss = (id: string, signature: any, opts: { hp?: number } = {}) => {
  const def = c.get<any>(id); const b = buildEnemyFrom(c, id, bossDef(def, signature));
  if (opts.hp) { b.maxHp = opts.hp; b.hp = opts.hp; b.base.hp = opts.hp; }
  return b;
};
const strong = (u: Combatant) => { u.base.atk = 5000; u.base.acc = 200; u.base.crit = 0; return u; };
const sturdy = (u: Combatant, hp = 100_000) => { u.maxHp = hp; u.hp = hp; u.base.hp = hp; return u; };
const skillOf = (u: Combatant, id: string) => u.skills.find((s) => s.id === id)!;
const evs = (b: Battle) => b.drain();

test("a technique with turn_shift delays the enemies it hits and hastens the ally it targets; the gauge never falls below −1 turn", () => {
  resetUids();
  const p = strong(player()); const e = sturdy(buildEnemy(c, "enemy.field_bandit"));
  const b = arena([p, e]); b.run();
  const slow: Skill = { ...BASIC, id: "t.slow", name: "Slow", kind: "active", element: "elem.water", power: 100, masteryMult: 1, turnShift: 35 };
  const haste: Skill = { ...BASIC, id: "t.haste", name: "Haste", kind: "active", element: "elem.wood", power: 0, masteryMult: 1, targeting: "self", turnShift: 60 };
  p.skills.push(slow, haste);
  const g0 = e.gauge;
  b.perform(p, { skill: slow }); let ev = evs(b);
  const sh = ev.find((x): x is Extract<BattleEvent, { t: "turn_shift" }> => x.t === "turn_shift")!;
  assert.ok(sh && sh.target === e.uid && sh.pct === -35, "the enemy is delayed");
  assert.equal(Math.round(e.gauge), Math.round(g0 - TH * 0.35));
  const pg = p.gauge;
  b.perform(p, { skill: haste }); ev = evs(b);
  assert.ok(ev.some((x) => x.t === "turn_shift" && x.target === p.uid && x.pct === 60), "the caster is hastened");
  assert.equal(Math.round(p.gauge), Math.round(pg + TH * 0.6));
  for (let i = 0; i < 10; i++) b.perform(p, { skill: slow });
  assert.ok(e.gauge >= -TH, "delay is capped at one turn");
});

test("Surge spends ultimate charge, gives no charge back, and the player acts again before the enemy", () => {
  resetUids();
  const p = player(); const e = buildEnemy(c, "enemy.field_bandit");
  e.base.spd = 1; p.base.spd = 50;
  const b = arena([p, e]); b.run();
  assert.equal(b.pending, p);
  const surge = surgeSkill(c);
  assert.ok(p.skills.some((s) => s.id === "surge"), "the player always carries Surge");
  p.ult = 30; assert.ok(!b.canUse(p, skillOf(p, "surge")), "not enough charge");
  p.ult = 50; assert.ok(b.canUse(p, skillOf(p, "surge")));
  assert.ok(b.act({ skill: "surge" }));
  const ev = evs(b);
  assert.ok(ev.some((x) => x.t === "surge" && x.actor === p.uid && x.cost === surge.ultCost));
  assert.equal(p.ult, 50 - surge.ultCost!);
  // the surge pushed the player a full turn ahead: she is the next actor
  b.run();
  assert.equal(b.pending, p, "the player acts again right away");
  assert.equal(e.turns, 0);
});

test("Counter Stance answers every hit; a boss with the riposte signature answers every third", () => {
  resetUids();
  const p = sturdy(player()); const e = strong(sturdy(buildEnemy(c, "enemy.field_bandit")));
  const b = arena([p, e]); b.run();
  p.statuses.push({ id: "status.counter_stance", turns: 2, stacks: 1, sourceAtk: 0, potency: 90 });
  const hp0 = e.hp;
  b.perform(e, { skill: skillOf(e, "basic") });
  const ev = evs(b);
  assert.ok(ev.some((x) => x.t === "action" && x.skill === "counter" && x.actor === p.uid), "the stance counters");
  assert.ok(e.hp < hp0, "the counter wounded the attacker");

  resetUids();
  const p2 = strong(sturdy(player()));
  const boss = sturdy(sigBoss("boss.plains_bandit_chief", { kind: "riposte", name: "Riposte", description: "x", every: 3, pct: 120 }));
  const b2 = arena([p2, boss]); b2.run();
  let counters = 0;
  for (let i = 0; i < 6; i++) { b2.perform(p2, { skill: skillOf(p2, "basic") }); counters += evs(b2).filter((x) => x.t === "signature" && x.kind === "riposte").length; }
  assert.equal(counters, 2, "two ripostes in six hits");
});

test("signature: guarded (less damage while summons live), measure (per-hit cap) and rebirth (rises once)", () => {
  resetUids();
  const p = strong(player());
  const guard = sturdy(sigBoss("boss.plains_bandit_chief", { kind: "guarded", name: "Shell", description: "x", dmg_red: 70 }));
  const minion = buildEnemy(c, "enemy.field_bandit", { kind: "summon" });
  const b = arena([p, guard, minion]); b.run();
  const hp0 = guard.hp; b.perform(p, { skill: skillOf(p, "basic"), target: guard.uid }); const withMinion = hp0 - guard.hp; evs(b);
  minion.alive = false;
  const hp1 = guard.hp; b.perform(p, { skill: skillOf(p, "basic"), target: guard.uid }); const alone = hp1 - guard.hp;
  assert.ok(withMinion > 0 && alone > withMinion * 2.5, `guarded ${withMinion} vs alone ${alone}`);

  resetUids();
  const p2 = strong(player()); p2.base.atk = 1e6;
  const law = sturdy(sigBoss("boss.plains_bandit_chief", { kind: "measure", name: "Law", description: "x", pct: 8 }), 10_000);
  const b2 = arena([p2, law]); b2.run();
  b2.perform(p2, { skill: skillOf(p2, "basic") });
  assert.equal(law.hp, 9_200, "one hit takes at most 8%");

  resetUids();
  const p3 = strong(player()); p3.base.atk = 1e6;
  const phoenix = sturdy(sigBoss("boss.plains_bandit_chief", { kind: "rebirth", name: "Rebirth", description: "x", hp_pct: 30 }), 10_000);
  const b3 = arena([p3, phoenix]); b3.run();
  b3.perform(p3, { skill: skillOf(p3, "basic") });
  const ev = evs(b3);
  assert.ok(phoenix.alive && phoenix.hp === 3_000, "rose at 30%");
  assert.ok(ev.some((x) => x.t === "signature" && x.kind === "rebirth"));
  b3.perform(p3, { skill: skillOf(p3, "basic"), target: phoenix.uid });
  assert.ok(!phoenix.alive, "only once");
});

test("signature: break staggers the boss when its ice shatters; ward heals from the attuned element; fury grows after a round", () => {
  resetUids();
  const p = strong(player()); p.base.atk = 20_000;
  const ice = sturdy(sigBoss("boss.plains_bandit_chief", { kind: "break", name: "Ice", description: "x", shield_pct: 30, delay_pct: 100, vuln_turns: 2 }), 100_000);
  const b = arena([p, ice]); b.run();
  assert.equal(ice.shield, 30_000, "each phase opens behind 30% ice");
  const g0 = ice.gauge;
  const ev: BattleEvent[] = [];
  for (let i = 0; i < 6 && ice.shield > 0; i++) { b.perform(p, { skill: skillOf(p, "basic") }); ev.push(...evs(b)); }
  assert.ok(ice.alive && (ice.shield as number) === 0, "the ice shattered");
  assert.ok(ev.some((x) => x.t === "signature" && x.kind === "break"));
  assert.ok(ice.statuses.some((s) => s.id === "status.vulnerable"), "vulnerable after the break");
  assert.ok(ice.gauge <= g0 - TH + 1, "delayed a full turn");

  resetUids();
  const p2 = strong(player());
  const mirror = sturdy(sigBoss("boss.plains_bandit_chief", { kind: "ward", name: "Mirror", description: "x", cycle: 3 }), 10_000);
  const b2 = arena([p2, mirror]); b2.run();
  mirror.boss!.sig.ward = "elem.fire"; mirror.hp = 5_000;
  const fire: Skill = { ...BASIC, id: "t.fire", name: "Fire", kind: "active", element: "elem.fire", power: 100, masteryMult: 1 };
  b2.perform(p2, { skill: fire });
  const ev2 = evs(b2);
  assert.ok(ev2.some((x) => x.t === "signature" && x.kind === "ward"));
  assert.ok(mirror.hp > 5_000, "the warded element healed it");

  resetUids();
  const p3 = player(); const ape = sturdy(sigBoss("boss.plains_bandit_chief", { kind: "fury", name: "Fury", description: "x", after_round: 2, atk_pct_per_round: 10 }));
  const b3 = arena([p3, ape]); b3.run();
  const atk0 = b3.eff(ape, "atk");
  for (let i = 0; i < 4; i++) { b3.act({ skill: "basic" }); b3.run(); }
  assert.ok(ape.boss!.sig.fury >= 2, `fury stacks ${ape.boss!.sig.fury}`);
  assert.ok(b3.eff(ape, "atk") > atk0 * 1.15, "attack grew");
});

test("signature: the thunder brand detonates after the boss's turns and a shield absorbs it; the curse stops healing", () => {
  resetUids();
  const p = sturdy(player(), 1_000_000); p.base.spd = 1;
  const emperor = sturdy(sigBoss("boss.plains_bandit_chief", { kind: "mark", name: "Brand", description: "x", turns: 1, pct: 180 }));
  emperor.base.spd = 100; emperor.base.atk = 1000;
  const b = arena([p, emperor]); b.run();
  // the boss acts several times before the slow player: brand, then detonation
  b.act({ skill: "basic" }); b.run();
  const ev = evs(b).filter((x): x is Extract<BattleEvent, { t: "signature" }> => x.t === "signature" && x.kind === "mark");
  assert.ok(ev.length >= 2 && ev.some((x) => x.detail === "detonates"), "branded then detonated");
  assert.ok(p.hp < p.maxHp);

  resetUids();
  const p2 = sturdy(player(), 1_000_000); p2.base.spd = 1;
  const pharaoh = sturdy(sigBoss("boss.plains_bandit_chief", { kind: "curse", name: "Curse", description: "x", every: 2, turns: 2 })); pharaoh.base.spd = 100;
  const b2 = arena([p2, pharaoh]); b2.run();
  b2.act({ skill: "basic" }); b2.run(); evs(b2);
  assert.ok(p2.statuses.some((s) => s.id === "status.cursed"), "cursed");
  p2.hp = 1000; b2.heal(p2, p2, 5000, "heal");
  assert.equal(p2.hp, 1000, "no healing under the curse");
});

test("enemy AI: the whole side focuses one ally, picks the element-advantaged art, and a boss holds its ultimate for an opening", () => {
  resetUids();
  const s = fresh(); const p = sturdy(buildPlayer(s, c), 50_000);
  const beast = { ...buildEnemy(c, "enemy.field_bandit"), side: "ally" as const, kind: "companion" as const, ai: { strategy: "aggressive", rules: [] } };
  beast.maxHp = 50_000; beast.hp = 20_000;   // the more fragile ally
  const e1 = buildEnemy(c, "enemy.field_bandit"), e2 = buildEnemy(c, "enemy.grey_wolf");
  const b = arena([p, beast, e1, e2]); b.run();
  const t1 = chooseEnemy(b, e1), t2 = chooseEnemy(b, e2);
  assert.equal(t1.target, beast.uid); assert.equal(t2.target, beast.uid);
  beast.alive = false;
  assert.equal(chooseEnemy(b, e1).target, p.uid, "moves on when the focus falls");

  // element: a fire enemy facing a metal player (fire overcomes metal) prefers its fire art over a stronger neutral one
  resetUids();
  const p2 = buildPlayer(fresh(), c); p2.element = "elem.metal";
  const e = buildEnemy(c, "enemy.field_bandit");
  e.skills = [skillOf(e, "basic"),
    { ...BASIC, id: "t.neutral", name: "Neutral", kind: "active", element: "elem.none", power: 130, masteryMult: 1 },
    { ...BASIC, id: "t.fire", name: "Fire", kind: "active", element: "elem.fire", power: 110, masteryMult: 1 }];
  const b2 = arena([p2, e]); b2.run();
  assert.equal(chooseEnemy(b2, e).skill.id, "t.fire");
  const legacy = arena([buildPlayer(fresh(), c), buildEnemy(c, "enemy.field_bandit")], 3, { legacyAi: true }); legacy.run();
  const le = legacy.units[1]!; le.skills = e.skills;
  assert.equal(chooseEnemy(legacy, le).skill.id, "t.neutral", "the legacy AI goes by raw power");

  // ultimate timing: phase 0 and a shielded target → hold; phase 1 → fire
  resetUids();
  const p3 = buildPlayer(fresh(), c); p3.shield = 10_000;
  const boss = buildEnemy(c, "boss.plains_bandit_chief");
  boss.skills.push({ ...BASIC, id: "t.ult", name: "Ult", kind: "ultimate", element: "elem.metal", power: 300, masteryMult: 1, ultCharge: 100 });
  const b3 = arena([p3, boss]); b3.run();
  boss.ult = 100;
  assert.notEqual(chooseEnemy(b3, boss).skill.id, "t.ult", "held while the target is shielded in phase 1");
  boss.boss!.phase = 1;
  assert.equal(chooseEnemy(b3, boss).skill.id, "t.ult", "fired once the fight has turned");
});

test("auto-battle: can_finish picks the killing art on the enemy it kills, element_edge aims at the weak enemy, and the ultimate waits for a boss or a crowd", () => {
  resetUids();
  const s = fresh(); const p = strong(buildPlayer(s, c));
  const dying = buildEnemy(c, "enemy.field_bandit"); dying.hp = 10;
  const healthy = sturdy(buildEnemy(c, "enemy.field_bandit"));
  const b = arena([p, dying, healthy]); b.run();
  p.skills.push({ ...BASIC, id: "t.cheap", name: "Cheap", kind: "active", element: "elem.metal", power: 100, masteryMult: 1, spCost: 5 });
  p.skills.push({ ...BASIC, id: "t.ult", name: "Ult", kind: "ultimate", element: "elem.metal", power: 300, masteryMult: 1, ultCharge: 100 });
  p.ult = 100; p.sp = 1000; p.maxSp = 1000;
  const ch = chooseAuto(b, p, rules());
  assert.equal(ch.target, dying.uid, "aims at the enemy it can kill");
  assert.notEqual(ch.skill.kind, "ultimate", "no ultimate on two bandits when a cheaper art finishes one");
  dying.alive = false;
  const alone = chooseAuto(b, p, rules());
  assert.notEqual(alone.skill.kind, "ultimate", "the ultimate is held for a boss or three enemies");
  const bossFight = arena([strong(buildPlayer(fresh(), c)), sturdy(buildEnemy(c, "boss.plains_bandit_chief"))], 4, { isBossFight: true }); bossFight.run();
  const pb = bossFight.player; pb.skills.push({ ...BASIC, id: "t.ult", name: "Ult", kind: "ultimate", element: "elem.metal", power: 300, masteryMult: 1, ultCharge: 100 }); pb.ult = 100;
  assert.equal(chooseAuto(bossFight, pb, rules()).skill.id, "t.ult", "fired on a boss");

  // element edge: a wood art is aimed at the earth enemy (wood overcomes earth), not the metal one
  resetUids();
  const p2 = strong(buildPlayer(fresh(), c));
  const earth = sturdy(buildEnemy(c, "enemy.field_bandit")); earth.element = "elem.earth"; earth.hp = 90_000;
  const metal = sturdy(buildEnemy(c, "enemy.field_bandit")); metal.element = "elem.metal"; metal.hp = 50_000;
  const b2 = arena([p2, earth, metal]); b2.run();
  p2.skills = [skillOf(p2, "basic"), { ...BASIC, id: "t.wood", name: "Wood", kind: "active", element: "elem.wood", power: 100, masteryMult: 1, spCost: 5 }];
  p2.sp = 1000; p2.maxSp = 1000;
  const ch2 = chooseAuto(b2, p2, rules());
  assert.equal(ch2.skill.id, "t.wood"); assert.equal(ch2.target, earth.uid);
});

test("every region sovereign carries a signature mechanic, each kind used by one of them", () => {
  const sov = c.byPrefix<any>("boss").filter((b) => b.kind === "region" && b.id !== "boss.plains_bandit_chief");
  for (const b of sov) assert.ok(b.signature, `${b.id} has no signature`);
  const kinds = new Set(sov.map((b) => b.signature.kind));
  assert.equal(kinds.size, sov.length, "no two sovereigns share a mechanic");
  for (const b of sov) assert.ok(techSkill(c, b.techniques[0], 0), "techniques resolve");
});
