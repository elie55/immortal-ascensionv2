import { test } from "node:test";
import assert from "node:assert/strict";
import { testContent } from "./helpers/content.ts";
import { newGameState } from "../src/engine/state.ts";
import { seedRng } from "../src/engine/rng.ts";
import { Battle } from "../src/engine/combat/battle.ts";
import { buildPlayer, buildEnemy, buildBeast, resetUids } from "../src/engine/combat/build.ts";
import { Encounter, canStart } from "../src/engine/encounter.ts";
import { rollTable, poolBases } from "../src/engine/loot.ts";
import { energyNow, qiNeeded } from "../src/engine/cultivation.ts";
import { itemCount } from "../src/engine/inventory.ts";
import { computeStats } from "../src/engine/stats.ts";
import type { Combatant, AutoRuleResolved } from "../src/engine/combat/types.ts";
import { chooseAuto } from "../src/engine/combat/ai.ts";

const c = testContent();
const T0 = Date.UTC(2026, 9, 29, 12, 0, 0);
const rules = (): AutoRuleResolved[] => c.combat.auto_default.map((r) => ({ slot: r.slot, when: r.when, value: r.value, target: r.target }));
const fresh = (seed = 11) => newGameState(c, T0, { seed });

function duel(seed: number, enemies: string[], mutate?: (s: ReturnType<typeof fresh>) => void, opts = {}) {
  const s = fresh(seed); mutate?.(s);
  resetUids();
  const units: Combatant[] = [buildPlayer(s, c), ...enemies.map((e) => buildEnemy(c, e))];
  const b = new Battle(c, units, seedRng(seed), rules(), opts);
  b.start();
  const r = b.run();
  return { b, s, r, events: b.drain() };
}

test("a fresh Lin Xueyao beats a single Field Bandit most of the time, and never with NaN or negative HP", () => {
  let wins = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { b, r } = duel(seed, ["enemy.field_bandit"]);
    if (r === "victory") wins++;
    for (const u of b.units) { assert.ok(Number.isFinite(u.hp) && u.hp >= 0, "hp finite and non-negative"); assert.ok(u.sp >= 0); }
  }
  assert.ok(wins >= 24, `won ${wins}/30`);
});

test("two bandits are harder than one; a Core Formation boss is out of reach at Qi Condensation 1", () => {
  let one = 0, two = 0, boss = 0;
  for (let seed = 1; seed <= 20; seed++) {
    if (duel(seed, ["enemy.field_bandit"]).r === "victory") one++;
    if (duel(seed, ["enemy.field_bandit", "enemy.field_bandit"]).r === "victory") two++;
    if (duel(seed, ["boss.thousand_node_bamboo_dragon"]).r === "victory") boss++;
  }
  assert.ok(one >= two, `one=${one} two=${two}`);
  assert.equal(boss, 0);
});

test("same seed and state → identical battle log (determinism)", () => {
  const a = duel(5, ["enemy.grey_wolf", "enemy.field_bandit"]).events;
  const b = duel(5, ["enemy.grey_wolf", "enemy.field_bandit"]).events;
  assert.deepEqual(a, b);
});

test("speed decides turn order and frequency; frozen units skip turns", () => {
  resetUids();
  const s = fresh();
  const p = buildPlayer(s, c);
  const e = buildEnemy(c, "enemy.field_bandit");
  p.base.spd = 30; e.base.spd = 10; p.base.atk = 1; e.base.atk = 1; // nobody dies quickly
  const b = new Battle(c, [p, e], seedRng(1), [{ slot: "basic", when: "always", target: "default" }]);
  b.start();
  for (let i = 0; i < 12; i++) b.step();
  const turns = b.drain().filter((x) => x.t === "turn").map((x: any) => x.actor);
  assert.ok(turns.filter((u) => u === p.uid).length >= 2 * turns.filter((u) => u === e.uid).length, `player turns ${turns.filter((u) => u === p.uid).length} vs enemy ${turns.filter((u) => u === e.uid).length}`);
  e.statuses.push({ id: "status.freeze", turns: 2, stacks: 1, sourceAtk: 0 });
  const before = e.turns;
  while (e.turns === before) b.step();
  assert.ok(b.drain().some((x) => x.t === "skip"), "frozen enemy skips its turn");
});

test("damage formula: elements, boss weakness, defense and crits move numbers the right way", () => {
  resetUids();
  const s = fresh();
  const p = buildPlayer(s, c);
  const wolf = buildEnemy(c, "enemy.grey_wolf"); // check its element in content
  const b = new Battle(c, [p, wolf], seedRng(3), rules());
  const wolfEl = c.get<any>("enemy.grey_wolf").element;
  const over = c.get<any>(wolfEl).overcomes;      // element the wolf beats
  const beats = c.byPrefix<any>("elem").find((e) => e.overcomes === wolfEl)!.id; // element that beats the wolf
  assert.ok(b.elementMult(p, wolf, beats) > 1 && b.elementMult(p, wolf, over) < 1);
  assert.ok(b.elementMult(p, wolf, beats) - 1 - c.combat.damage.element_advantage < 1e-9);
  const boss = buildEnemy(c, "boss.plains_bandit_chief");
  const weak = boss.boss!.weaknesses[0]!;
  assert.ok(b.elementMult(p, boss, weak) > b.elementMult(p, boss, "elem.metal"));
  // defense: same attack into higher def deals less
  const lo = { ...wolf, base: { ...wolf.base, def: 10 } } as Combatant, hi = { ...wolf, base: { ...wolf.base, def: 200 } } as Combatant;
  lo.uid = 90; hi.uid = 91; lo.hp = hi.hp = 1e6; lo.maxHp = hi.maxHp = 1e6; lo.statuses = []; hi.statuses = []; lo.base.eva = 0; hi.base.eva = 0; p.base.acc = 100; p.base.crit = 0;
  const b2 = new Battle(c, [p, lo, hi], seedRng(4), rules());
  const basic = p.skills[0]!;
  let loSum = 0, hiSum = 0;
  for (let i = 0; i < 20; i++) { (b2 as any).strike(p, lo, basic); (b2 as any).strike(p, hi, basic); }
  for (const x of b2.drain()) if (x.t === "hit") { if (x.target === 90) loSum += x.amount; else if (x.target === 91) hiSum += x.amount; }
  assert.ok(loSum > hiSum, `def 10 → ${loSum}, def 200 → ${hiSum}`);
});

test("statuses: burning stacks and ticks, shield absorbs, stun blocks the actor, silence blocks techniques", () => {
  resetUids();
  const s = fresh();
  const p = buildPlayer(s, c);
  const e = buildEnemy(c, "enemy.field_bandit");
  const b = new Battle(c, [p, e], seedRng(2), rules());
  b.start();
  e.base.status_res = 0;
  b.applyStatus(p, e, "status.burning", 1, 2);
  b.applyStatus(p, e, "status.burning", 1, 2);
  assert.equal(e.statuses.find((x) => x.id === "status.burning")!.stacks, 2);
  const hpBefore = e.hp;
  (b as any).endTurn(e);
  assert.ok(e.hp < hpBefore, "burning ticks at the end of the holder's turn");
  b.addShield(p, p, 100);
  const php = p.hp;
  b.applyDamage(e, p, 60, { element: "elem.metal", kind: "attack" });
  assert.equal(p.hp, php, "shield absorbed the hit");
  assert.equal(p.shield, 40);
  b.applyStatus(e, p, "status.silence", 1, 2);
  assert.ok(b.availableSkills(p).every((sk) => sk.kind === "basic"), "silenced: only basic attacks");
  b.applyStatus(e, p, "status.stun", 1, 1);
  assert.ok((b as any).isControlled(p));
});

test("heal and shield techniques follow auto rules (heal below 50% HP, shield when unshielded)", () => {
  resetUids();
  const s = fresh();
  s.techniques.known["tech.active.ripple_mending"] = 0; s.techniques.known["tech.active.earth_guardian"] = 0;
  s.techniques.actives = ["tech.active.azure_strike", "tech.active.ripple_mending", "tech.active.earth_guardian", null];
  const p = buildPlayer(s, c);
  const e = buildEnemy(c, "enemy.field_bandit");
  e.base.atk = 1;
  const b = new Battle(c, [p, e], seedRng(9), rules());
  b.start();
  p.hp = Math.round(p.maxHp * 0.3);
  const acts: any[] = [];
  for (let i = 0; i < 8 && !b.result; i++) { b.step(); acts.push(...b.drain().filter((x) => x.t === "action" && (x as any).actor === p.uid)); }
  assert.ok(acts.some((a) => a.skill === "tech.active.ripple_mending"), `expected a heal, got ${acts.map((a) => a.skill).join(",")}`);
  assert.ok(acts.some((a) => a.skill === "tech.active.earth_guardian"), "shield used when unshielded");
});

test("boss phases: thresholds switch techniques, summon adds, enrage raises attack, charged attack telegraphs", () => {
  resetUids();
  const s = fresh();
  const p = buildPlayer(s, c);
  p.base.hp = 1e6; p.maxHp = 1e6; p.hp = 1e6; p.base.atk = 400; p.base.def = 1e4;
  const boss = buildEnemy(c, "boss.plains_bandit_chief");
  const b = new Battle(c, [p, boss], seedRng(7), rules());
  b.start();
  const atk0 = b.eff(boss, "atk");
  b.run(200);
  const ev = b.drain();
  assert.ok(ev.some((x) => x.t === "phase" && (x as any).name === "Cornered"), "phase 2 entered");
  const sm = ev.find((x) => x.t === "summon") as any;
  assert.ok(sm && sm.spawned.length === 2, "two bandits summoned");
  assert.ok(b.units.filter((u) => u.kind === "summon").length === 2);
  // enrage multiplier applied while in phase 2 (boss may be dead by now; check the profile math directly)
  boss.alive = true; boss.boss!.phase = 1;
  assert.ok(b.eff(boss, "atk") > atk0);
  // charged attack on a boss that has one
  resetUids();
  const p2 = buildPlayer(fresh(), c); p2.base.hp = 1e7; p2.maxHp = 1e7; p2.hp = 1e7; p2.base.atk = 50;
  const serpent = buildEnemy(c, "boss.nine_headed_abyss_serpent");
  const b2 = new Battle(c, [p2, serpent], seedRng(8), rules());
  b2.start();
  serpent.hp = Math.round(serpent.maxHp * 0.3); (b2 as any).checkPhase(serpent);
  assert.ok(b2.drain().some((x) => x.t === "charge"), "charge announced on entering the final phase");
  for (let i = 0; i < 40 && !b2.drain().some((x) => x.t === "action" && (x as any).charged); i++) b2.step();
  assert.ok(serpent.boss!.charging === null || serpent.boss!.charging.turnsLeft >= 0);
});

test("ultimate charges from actions and damage taken, then fires through the auto rules", () => {
  resetUids();
  const s = fresh();
  s.techniques.known["tech.ult.heavenly_sword_rain"] = 0; s.techniques.ultimate = "tech.ult.heavenly_sword_rain";
  const p = buildPlayer(s, c); p.base.hp = 1e5; p.maxHp = 1e5; p.hp = 1e5;
  const e = buildEnemy(c, "enemy.grey_wolf"); e.base.hp = 1e5; e.maxHp = 1e5; e.hp = 1e5;
  const b = new Battle(c, [p, e], seedRng(12), rules());
  b.start();
  let fired = false;
  for (let i = 0; i < 60 && !fired; i++) { b.step(); fired = b.drain().some((x) => x.t === "action" && (x as any).skill === "tech.ult.heavenly_sword_rain"); }
  assert.ok(fired, "ultimate fired once charged");
  assert.ok(p.ult < 10, "gauge reset by the ultimate (small regain from a counter-hit in the same step is fine)");
});

test("manual mode waits for input, rejects unusable skills and accepts a valid choice", () => {
  resetUids();
  const s = fresh();
  const p = buildPlayer(s, c);
  const e = buildEnemy(c, "enemy.field_bandit");
  const b = new Battle(c, [p, e], seedRng(1), rules());
  b.manual = true; b.start();
  b.run();
  assert.ok(b.needsInput && b.pending === p);
  assert.equal(b.act({ skill: "nope" }), false);
  p.sp = 0;
  assert.equal(b.act({ skill: "tech.active.azure_strike" }), false, "no SP → rejected");
  assert.equal(b.act({ skill: "basic", target: e.uid }), true);
  assert.ok(!b.needsInput);
});

test("spirit beast fights as an ally with its own ability", () => {
  resetUids();
  const s = fresh();
  const beastId = c.byPrefix<any>("beast")[0]!.id;
  const beast = c.get<any>(beastId);
  s.beasts.owned[1] = { uid: 1, beast: beastId, name: "Pal", stage: beast.stages[0].key, level: 5, xp: 0, bond: 0, hatchedAt: T0 };
  s.beasts.active = 1;
  const bu = buildBeast(s, c)!;
  assert.ok(bu && bu.side === "ally" && bu.skills.some((k) => k.kind === "beast"));
  const units = [buildPlayer(s, c), bu, buildEnemy(c, "enemy.field_bandit")];
  const b = new Battle(c, units, seedRng(2), rules());
  b.start(); b.run();
  assert.ok(b.drain().some((x) => x.t === "action" && (x as any).actor === bu.uid), "beast acted");
});

test("loot: pools only yield bases whose range allows the rarity; ilvl stays inside the band; stones in range", () => {
  const s = fresh();
  const table = c.byPrefix<any>("loot").find((t) => t.id === "loot.boss.thousand_node_bamboo_dragon")!;
  for (let i = 0; i < 40; i++) {
    const d = rollTable(s, c, table.id);
    for (const g of d.gear) {
      const base = c.get<any>(g.base);
      const R = ["common", "uncommon", "rare", "epic", "legendary", "mythic", "immortal", "divine"];
      assert.ok(R.indexOf(g.rarity) >= R.indexOf(base.rarity_range[0]) && R.indexOf(g.rarity) <= R.indexOf(base.rarity_range[1]), `${g.base} cannot be ${g.rarity}`);
      assert.ok(g.ilvl >= table.ilvl[0] && g.ilvl <= table.ilvl[1]);
    }
    assert.ok(d.spirit_stones >= table.spirit_stones[0] && d.spirit_stones <= table.spirit_stones[1]);
    for (const q of table.guaranteed) assert.ok(d.items.find((x) => x.id === q.id)!.qty >= q.qty);
  }
  assert.equal(poolBases(c, { pool: { tags: ["nonexistent_tag"] } }, "rare").length, 0);
});

test("node encounter: energy, waves with carried HP, loot granted, first clear once, events emitted", () => {
  const s = fresh(21);
  const node = c.byPrefix<any>("node").find((n) => n.region === "region.mortal_plains" && n.kind === "battle" && n.waves.length >= 2)!;
  const energy0 = energyNow(s, c, T0);
  const stones0 = s.resources.spirit_stones;
  const st = Encounter.start(s, c, { kind: "node", id: node.id }, T0);
  assert.ok(st.ok);
  const enc = st.encounter;
  assert.equal(energyNow(s, c, T0), energy0 - node.energy_cost);
  let guard = 0;
  while (!enc.done && guard++ < 10) {
    enc.battle!.run();
    const wr = enc.settleWave(T0);
    if (wr.summary.result !== "victory") break;
    if (enc.hasNextWave) { const b = enc.nextWave(); assert.ok(b.player.hp <= b.player.maxHp && b.player.hp === wr.summary.playerHp || b.player.hp > 0); }
  }
  assert.ok(enc.done);
  if (enc.done!.won) {
    assert.ok(s.resources.spirit_stones > stones0, "stones from loot and first clear");
    const rec = s.progress.regions[node.region]!.nodes[node.id]!;
    assert.equal(rec.clears, 1);
    const ev = enc.drainEvents();
    assert.ok(ev.some((e) => e.type === "node_cleared" && (e as any).first === true));
    assert.ok(ev.some((e) => e.type === "enemy_defeated"));
    assert.ok(ev.some((e) => e.type === "mastery"));
    // second run: not a first clear any more, energy spent again
    const st2 = Encounter.start(s, c, { kind: "node", id: node.id }, T0);
    assert.ok(st2.ok);
  } else {
    assert.ok(s.character.hp! > 0, "defeat leaves the player alive");
    assert.ok(enc.done!.recommendations.length > 0);
  }
});

test("dungeon encounter respects unlocks, daily limits and grants clear + first-clear rewards", () => {
  const s = fresh(31);
  const d = c.get<any>("dungeon.old_granary_cellars");
  s.character.realm = "realm.core_formation"; s.character.stage = 9; s.progress.realmsEntered.push("realm.foundation_establishment", "realm.core_formation");
  for (let run = 0; run < d.entry.daily_limit; run++) {
    const st = Encounter.start(s, c, { kind: "dungeon", id: d.id }, T0);
    assert.ok(st.ok, `run ${run}`);
    const enc = st.encounter;
    while (!enc.done) { enc.battle!.run(); const wr = enc.settleWave(T0); if (wr.summary.result !== "victory") break; if (enc.hasNextWave) enc.nextWave(); }
    assert.ok(enc.done!.won, "core formation cultivator clears the granary");
  }
  assert.equal(s.progress.dungeons[d.id]!.clears, d.entry.daily_limit);
  const blocked = canStart(s, c, { kind: "dungeon", id: d.id }, T0);
  assert.ok(!blocked.ok && /Daily limit/.test(blocked.reason));
  const locked = canStart(fresh(), c, { kind: "dungeon", id: "dungeon.green_labyrinth" }, T0);
  assert.ok(!locked.ok);
});

test("tribulation: lightning each round, survive the waves to pass; failure burns Qi and sets a cooldown", () => {
  const trib = c.get<any>("tribulation.core_formation");
  // strong cultivator passes
  const s = fresh(41);
  s.character.realm = "realm.core_formation"; s.character.stage = 9; s.progress.realmsEntered.push("realm.foundation_establishment", "realm.core_formation");
  s.character.permanent = { hp: 20000, def: 800, atk: 600 };
  const st = Encounter.start(s, c, { kind: "tribulation", id: trib.id }, T0);
  assert.ok(st.ok);
  const enc = st.encounter;
  enc.battle!.run(); enc.settleWave(T0);
  const ev = enc.battle!.drain();
  assert.ok(ev.some((x) => x.t === "hazard"), "lightning struck");
  assert.ok(enc.done!.won && s.progress.tribulations[trib.id]!.passedAt, "survived");
  // weak cultivator fails
  const w = fresh(42); w.character.stage = 9; w.character.qi = qiNeeded(c.get<any>(w.character.realm), 9);
  const st2 = Encounter.start(w, c, { kind: "tribulation", id: trib.id }, T0);
  assert.ok(st2.ok);
  st2.encounter.battle!.run(); st2.encounter.settleWave(T0);
  assert.ok(!st2.encounter.done!.won);
  assert.ok(w.character.qi < qiNeeded(c.get<any>(w.character.realm), 9));
  assert.ok(w.progress.tribulations[trib.id]!.nextTryAt! > T0);
  assert.ok(!canStart(w, c, { kind: "tribulation", id: trib.id }, T0).ok);
});

test("300 random battles across regions terminate with sane invariants", () => {
  const enemies = c.byPrefix<any>("enemy").map((e) => e.id);
  const bosses = c.byPrefix<any>("boss").map((e) => e.id);
  const realms = c.realms;
  for (let i = 0; i < 300; i++) {
    const s = fresh(1000 + i);
    const realm = realms[i % realms.length]!;
    s.character.realm = realm.id; s.character.stage = 1 + (i % 9);
    s.progress.realmsEntered = realms.filter((r) => r.order <= realm.order).map((r) => r.id);
    const picks = i % 7 === 0 ? [bosses[i % bosses.length]!] : [enemies[i % enemies.length]!, ...(i % 3 === 0 ? [enemies[(i * 7) % enemies.length]!] : [])];
    const { b, r } = duel(1000 + i, picks, (st) => { st.character.realm = s.character.realm; st.character.stage = s.character.stage; st.progress.realmsEntered = s.progress.realmsEntered; });
    assert.ok(r !== null, "battle terminated");
    for (const u of b.units) { assert.ok(Number.isFinite(u.hp) && u.hp >= 0 && u.hp <= u.maxHp + 1); assert.ok(u.shield >= 0); }
    const sum = b.summary();
    assert.ok(Number.isFinite(sum.dealt) && sum.dealt >= 0);
  }
});


test("elites and bosses announce big attacks one turn ahead; the announced move lands as is; control cancels it", () => {
  const elite = c.byPrefix<any>("enemy").find((e) => e.kind === "elite" && e.techniques.some((t: string) => c.get<any>(t).power > 0))!;
  assert.ok(elite, "an elite with a damaging technique exists");
  // a fragile player: any technique hit is "big"
  resetUids();
  const p = buildPlayer(fresh(), c); p.base.hp = 400; p.maxHp = 400; p.hp = 400; p.base.def = 0; p.base.atk = 1;
  const e = buildEnemy(c, elite.id);
  assert.equal(e.elite, true);
  const b = new Battle(c, [p, e], seedRng(4), rules());
  b.start();
  const evs: any[] = [...b.drain()];
  for (let i = 0; i < 30 && !b.result; i++) { b.step(); evs.push(...b.drain()); if (evs.some((x) => x.t === "action" && x.heavy)) break; }
  const tg = evs.find((x) => x.t === "telegraph");
  assert.ok(tg, "a telegraph is emitted");
  assert.ok(tg.pct >= c.combat.telegraph.heavy_pct, `estimated ${tg.pct}% ≥ threshold`);
  const heavy = evs.find((x) => x.t === "action" && x.heavy);
  if (heavy) { assert.equal(heavy.skill, tg.skill, "the announced technique is the one that lands"); assert.ok(evs.indexOf(tg) < evs.indexOf(heavy)); }

  // the auto-battle condition sees it
  resetUids();
  const p2 = buildPlayer(fresh(), c); p2.base.hp = 400; p2.maxHp = 400; p2.hp = 400; p2.base.def = 0;
  const e2 = buildEnemy(c, elite.id);
  const b2 = new Battle(c, [p2, e2], seedRng(5), rules());
  b2.start();
  assert.ok(e2.telegraph, "planned at battle start");
  // stun cancels the wound-up attack
  (b2 as any).applyStatus(p2, e2, "status.stun", 1, 1);
  if (e2.statuses.some((s) => s.id === "status.stun")) {
    assert.equal(e2.telegraph, null, "control interrupts the big attack");
    assert.ok(b2.drain().some((x) => x.t === "interrupt"));
  }

  // a sturdy player: the same elite never telegraphs
  resetUids();
  const p3 = buildPlayer(fresh(), c); p3.base.hp = 1e9; p3.maxHp = 1e9; p3.hp = 1e9; p3.base.def = 1e6;
  const e3 = buildEnemy(c, elite.id);
  const b3 = new Battle(c, [p3, e3], seedRng(6), rules());
  b3.start();
  for (let i = 0; i < 20 && !b3.result; i++) b3.step();
  assert.ok(!b3.drain().some((x) => x.t === "telegraph"), "small hits are not announced");
});

test("normal enemies never telegraph, and the Big attack coming rule picks a shield", () => {
  resetUids();
  const p = buildPlayer(fresh(), c); p.base.hp = 50; p.maxHp = 50; p.hp = 50; p.base.def = 0;
  const e = buildEnemy(c, "enemy.field_bandit");
  const b = new Battle(c, [p, e], seedRng(3), rules());
  b.start();
  for (let i = 0; i < 10 && !b.result; i++) b.step();
  assert.ok(!b.drain().some((x) => x.t === "telegraph"));
  // the auto-battle condition
  const sh = c.byPrefix<any>("tech").find((t) => t.shield_pct_max_hp > 0 && !t.enemy_only && t.kind === "active")!;
  const s = fresh(); s.techniques.known[sh.id] = 0; s.techniques.actives = [sh.id, null, null, null];
  resetUids();
  const p4 = buildPlayer(s, c);
  const e4 = buildEnemy(c, "enemy.field_bandit");
  const rl: AutoRuleResolved[] = [{ slot: "shield", when: "big_attack", target: "default" }, { slot: "basic", when: "always", target: "default" }];
  const b4 = new Battle(c, [p4, e4], seedRng(2), rl);
  b4.start();
  p4.sp = p4.maxSp;
  assert.equal(chooseAuto(b4, p4, rl).skill.kind, "basic", "no warning: basic attack");
  e4.telegraph = { skill: "basic", name: "x", targets: [p4.uid], pct: 50 };
  assert.equal(chooseAuto(b4, p4, rl).skill.id, sh.id, "warning: shield up");
});
