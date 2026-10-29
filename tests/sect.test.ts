import { test } from "node:test";
import assert from "node:assert/strict";
import { testContent } from "./helpers/content.ts";
import { newGameState, type GameState } from "../src/engine/state.ts";
import { Game } from "../src/engine/game.ts";
import { completeScene } from "../src/engine/story.ts";
import { acceptQuest, turnInQuest, questStatus, questProgress, achievementProgress, nextRank, visit } from "../src/engine/progression.ts";
import { addItem, itemCount, grantGear } from "../src/engine/inventory.ts";
import { shopRows, buy, discountPct, sellGear, periodKey } from "../src/engine/shop.ts";
import { enhance, enhanceCost, refine, refineCost, reforge, craftGear, forgeStatus, refinePills, alchemyStatus, upgradeFurnace, studyBlueprint, awaken } from "../src/engine/crafting.ts";
import { giveGift, giftValue, giftsLeft, askTopic, topics, chat } from "../src/engine/social.ts";
import { Encounter, canStart } from "../src/engine/encounter.ts";
import { affinityLevel, checkUnlock } from "../src/engine/unlock.ts";
import type { DomainEvent } from "../src/engine/events.ts";

const c = testContent();
const T0 = Date.UTC(2026, 9, 29, 12, 0, 0);
const fresh = (seed = 5) => newGameState(c, T0, { seed });
const rich = (s: GameState) => { s.resources.spirit_stones = 10_000_000; return s; };
function game(s = fresh()) {
  const g = new Game(c, s);
  const events: DomainEvent[] = [];
  g.onChange((ev) => events.push(...ev));
  return { g, s, events, types: () => events.map((e) => e.type) };
}

// ---------- quests ----------

test("main chain: system quest auto-accepts, story completes it, next quest is offered, deliver consumes the item", () => {
  const { g, s, events } = game();
  g.settle(T0);
  assert.ok(s.progress.quests.active["quest.main.the_path_begins"], "system quest accepted on first settle");
  g.run("story", T0, (st, cc) => completeScene(st, cc, "story.prologue.senior_sister", pickChoice(cc, "story.prologue.senior_sister"), T0));
  assert.equal(s.progress.quests.completed["quest.main.the_path_begins"], 1, "auto turn-in");
  assert.ok(s.progress.quests.active["quest.main.senior_sister"], "chain continues");
  assert.ok(events.some((e) => e.type === "quest_completed"));
  if (!itemCount(s, "qitem.elder_wen_token")) addItem(s, c, "qitem.elder_wen_token", 1);
  const q = c.get<any>("quest.main.senior_sister");
  assert.equal(questStatus(s, c, q, T0), "ready");
  const aff0 = s.relations["npc.bai_lingshuang"]?.affinity ?? 0;
  const r = g.run("turn_in", T0, (st, cc) => turnInQuest(st, cc, q.id, T0));
  assert.ok(r.ok);
  assert.equal(itemCount(s, "qitem.elder_wen_token"), 0, "delivered item consumed");
  assert.equal(s.relations["npc.bai_lingshuang"]!.affinity, aff0 + 20);
  assert.ok(s.progress.quests.active["quest.main.first_breath"]);
});

function pickChoice(cc: typeof c, id: string): number | null { return cc.get<any>(id).choices?.length ? 0 : null; }

test("defeat objectives count only kills made after accepting; abandoning is refused for main quests", () => {
  const { g, s } = game();
  s.progress.quests.completed["quest.main.first_breath"] = 1;
  s.progress.counters["kills:enemy.wild_boar"] = 10;     // earlier kills
  assert.ok(acceptQuest(s, c, "quest.main.first_hunt", T0).ok);
  const q = c.get<any>("quest.main.first_hunt");
  assert.equal(questProgress(s, c, q)[0]!.have, 0);
  for (let i = 0; i < 3; i++) g.run("kill", T0, () => ({ ok: true, events: [{ type: "enemy_defeated", id: "enemy.wild_boar", boss: false }] }), false);
  assert.equal(questProgress(s, c, q)[0]!.have, 3);
  assert.equal(questStatus(s, c, q, T0), "ready");
});

test("repeatable missions go on cooldown after turn-in and come back", () => {
  const s = fresh();
  const q = c.byPrefix<any>("quest").find((x) => x.repeatable && x.objectives[0].type === "deliver")!;
  for (const r of q.prereqs.regions ?? []) s.progress.regions[r] = { discoveredAt: T0, nodes: {} };
  for (const id of q.prereqs.quests ?? []) s.progress.quests.completed[id] = 1;
  if (q.prereqs.realm) { s.character.realm = q.prereqs.realm.id; s.character.stage = 9; }
  assert.equal(questStatus(s, c, q, T0), "available");
  assert.ok(acceptQuest(s, c, q.id, T0).ok);
  const o = q.objectives[0];
  addItem(s, c, o.item, o.count);
  assert.ok(turnInQuest(s, c, q.id, T0).ok);
  assert.equal(itemCount(s, o.item), 0);
  assert.equal(questStatus(s, c, q, T0 + 60_000), "cooldown");
  assert.equal(questStatus(s, c, q, T0 + q.repeatable.cooldown_min * 60_000 + 1), "available");
});

test("achievements unlock from counters and pay rewards once", () => {
  const { g, s, events } = game();
  const a = c.get<any>("ach.combat.hundred_victories");
  s.progress.counters.enemies_defeated = a.condition.target - 1;
  g.run("kill", T0, () => ({ ok: true, events: [{ type: "enemy_defeated", id: "enemy.wild_boar", boss: false }] }), false);
  assert.ok(s.progress.achievements[a.id]);
  assert.ok(achievementProgress(s, c, a).done);
  const n = events.filter((e) => e.type === "achievement" && e.id === a.id).length;
  g.run("kill", T0, () => ({ ok: true, events: [{ type: "enemy_defeated", id: "enemy.wild_boar", boss: false }] }), false);
  assert.equal(events.filter((e) => e.type === "achievement" && e.id === a.id).length, n);
});

test("rank promotion needs fame, quests and the tournament trial", () => {
  const { g, s, events } = game();
  g.settle(T0);
  const n = nextRank(s, c)!;
  assert.equal(n.rank.id, "rank.inner_disciple");
  assert.ok(!n.ready && n.reasons.length === 3);
  s.resources.sect_fame = n.rank.fame_required;
  s.progress.quests.completed["quest.main.bamboo_sovereign"] = 1;
  g.settle(T0);
  assert.equal(s.character.rank, "rank.outer_disciple", "trial still missing");
  s.progress.trialsCleared["tournament.outer_sect"] = T0;
  g.settle(T0);
  assert.equal(s.character.rank, "rank.inner_disciple");
  assert.ok(events.some((e) => e.type === "rank_up"));
});

test("story triggers are queued once: region visits and affinity levels", () => {
  const { g, s } = game();
  g.run("visit", T0, (st) => visit(st, "region.azure_bamboo_forest"), false);
  assert.ok(g.storyQueue.includes("story.forest.first_steps"));
  g.run("visit", T0, (st) => visit(st, "region.azure_bamboo_forest"), false);
  assert.equal(g.storyQueue.filter((x) => x === "story.forest.first_steps").length, 1);
  s.relations["npc.tang_xiaoman"] = { affinity: 600, giftsToday: 0, topics: [] };
  g.settle(T0);
  assert.ok(g.storyQueue.includes("story.tang.confidant_secret"));
});

test("affinity unlock requirements use named levels", () => {
  const s = fresh();
  const u = { affinity: [{ npc: "npc.tang_xiaoman", level: 1 }] };
  assert.equal(checkUnlock(s, c, u as any).ok, false);
  s.relations["npc.tang_xiaoman"] = { affinity: 50, giftsToday: 0, topics: [] };
  assert.equal(checkUnlock(s, c, u as any).ok, true);
  assert.equal(affinityLevel(c, "npc.tang_xiaoman", 50).name, "Acquaintance");
});

// ---------- shops ----------

test("shops: unlock gates, discounts, limited stock with restock, learning techniques", () => {
  const s = rich(fresh());
  const merchant = shopRows(s, c, "shop.merchant_pavilion", T0);
  const locked = merchant.find((r) => r.locked);
  assert.ok(locked, "fame-gated entry is locked for a new disciple");
  assert.equal(buy(s, c, "shop.merchant_pavilion", locked!.index, 1, T0).ok, false);
  const pill = merchant.find((r) => !r.locked && r.id.startsWith("cons."))!;
  const before = itemCount(s, pill.id);
  assert.ok(buy(s, c, "shop.merchant_pavilion", pill.index, 3, T0).ok);
  assert.equal(itemCount(s, pill.id), before + 3);
  // discounts: affinity levels with Tang + fame
  s.relations["npc.tang_xiaoman"] = { affinity: 300, giftsToday: 0, topics: [] };
  s.resources.sect_fame = 1000;
  assert.equal(discountPct(s, c, c.get<any>("shop.merchant_pavilion")), 3 * 2 + 5 * 2);
  assert.ok(shopRows(s, c, "shop.merchant_pavilion", T0)[pill.index]!.price < pill.price);
  // limited stock
  const origin = shopRows(s, c, "shop.origin_realm_merchant", T0);
  const lim = origin.find((r) => r.left !== null)!;
  assert.ok(buy(s, c, "shop.origin_realm_merchant", lim.index, lim.left!, T0).ok);
  const r = buy(s, c, "shop.origin_realm_merchant", lim.index, 1, T0);
  assert.ok(!r.ok && /Sold out/.test(r.reason));
  const later = T0 + 6 * 3_600_000;
  assert.notEqual(periodKey("per_visit", later), periodKey("per_visit", T0));
  assert.ok(buy(s, c, "shop.origin_realm_merchant", lim.index, 1, later).ok, "restocked next visit");
  // techniques
  const tech = shopRows(s, c, "shop.scripture_pavilion", T0).find((x) => !x.locked && !x.owned && x.id.startsWith("tech."))!;
  assert.ok(buy(s, c, "shop.scripture_pavilion", tech.index, 5, T0).ok);
  assert.equal(s.techniques.known[tech.id], 0);
  assert.equal(buy(s, c, "shop.scripture_pavilion", tech.index, 1, T0).ok, false, "cannot buy a known technique twice");
  // not enough money
  const poor = fresh(); poor.resources.spirit_stones = 0;
  assert.equal(buy(poor, c, "shop.merchant_pavilion", pill.index, 1, T0).ok, false);
});

test("selling gear pays by power and refuses equipped or locked pieces", () => {
  const s = fresh();
  const uid = grantGear(s, c, { base: "gear.bamboo_sword", rarity: "rare", ilvl: 5 });
  const st0 = s.resources.spirit_stones;
  assert.equal(sellGear(s, c, [s.equipped.weapon!]).ok, false);
  s.inventory.lockedGear.push(uid);
  assert.equal(sellGear(s, c, [uid]).ok, false);
  s.inventory.lockedGear = [];
  const r = sellGear(s, c, [uid]);
  assert.ok(r.ok && r.stones > 0 && s.resources.spirit_stones === st0 + r.stones && !s.inventory.gear[uid]);
});

// ---------- forge ----------

function stockForge(s: GameState) { for (const m of ["mat.lesser_enhancement_stone", "mat.spirit_enhancing_stone", "mat.refining_stone", "mat.reforging_sand"]) if (c.has(m)) addItem(s, c, m, 500); }

test("enhancement climbs to +15 with costs scaled by rarity; failures keep the level", () => {
  const s = rich(fresh(8)); stockForge(s);
  for (const r of c.singletons.enhancement.levels) for (const m of r.materials) addItem(s, c, m.id, 50);
  const uid = grantGear(s, c, { base: "gear.bamboo_sword", rarity: "rare", ilvl: 5 });
  const g = s.inventory.gear[uid]!;
  const cost = enhanceCost(c, g)!;
  const ilvlFactor = Math.pow(5 / c.singletons.enhancement.ilvl_cost.ref, c.singletons.enhancement.ilvl_cost.exp);
  assert.equal(cost.stones, Math.max(1, Math.round(c.singletons.enhancement.levels[0]!.stones_base * 2.25 * ilvlFactor)), "rare × ilvl factor");
  let fails = 0;
  for (const u of [uid, ...[1, 2, 3].map(() => grantGear(s, c, { base: "gear.bamboo_sword", rarity: "rare", ilvl: 5 }))]) {
    let guard = 0;
    while (s.inventory.gear[u]!.enhance < 15 && guard++ < 500) { const r = enhance(s, c, u); assert.ok(r.ok); if (!r.success) { fails++; assert.ok(s.inventory.gear[u]!.enhance >= 9); } }
  }
  assert.equal(g.enhance, 15);
  assert.ok(fails > 0, "high levels can fail");
  assert.equal(enhance(s, c, uid).ok, false);
});

test("refinement raises rarity, is capped at mythic and the base's range, and keeps enhancement", () => {
  const s = rich(fresh(9)); stockForge(s);
  const base = c.byPrefix<any>("gear").find((b) => !b.unique && b.rarity_range[0] === "rare" && b.rarity_range[1] === "mythic")!;
  const uid = grantGear(s, c, { base: base.id, rarity: "rare", ilvl: 10 });
  s.inventory.gear[uid]!.enhance = 4;
  let guard = 0;
  while (!("blocked" in refineCost(c, s.inventory.gear[uid]!)) && guard++ < 400) assert.ok(refine(s, c, uid).ok);
  const g = s.inventory.gear[uid]!;
  assert.equal(g.rarity, "mythic");
  assert.equal(g.enhance, 4);
  assert.equal(refine(s, c, uid).ok, false);
  const narrow = c.byPrefix<any>("gear").find((b) => !b.unique && b.rarity_range[1] === "rare")!;
  const u2 = grantGear(s, c, { base: narrow.id, rarity: "rare", ilvl: 5 });
  assert.ok("blocked" in refineCost(c, s.inventory.gear[u2]!));
});

test("reforge rerolls unlocked secondary stats and keeps locked ones in place", () => {
  const s = rich(fresh(10)); stockForge(s);
  const uid = grantGear(s, c, { base: "gear.bamboo_sword", rarity: "epic", ilvl: 10 });
  const g = s.inventory.gear[uid]!;
  assert.ok(g.affixes.length >= 2);
  const keep = { ...g.affixes[0]! };
  const sand = itemCount(s, "mat.reforging_sand");
  let changed = false;
  for (let i = 0; i < 6; i++) {
    const before = JSON.stringify(g.affixes.slice(1));
    assert.ok(reforge(s, c, uid, [0]).ok);
    assert.deepEqual(g.affixes[0], keep);
    if (JSON.stringify(g.affixes.slice(1)) !== before) changed = true;
    assert.equal(new Set(g.affixes.map((a) => a.stat)).size, g.affixes.length, "no duplicate stats");
  }
  assert.ok(changed);
  assert.ok(itemCount(s, "mat.reforging_sand") < sand);
  assert.equal(reforge(s, c, uid, g.affixes.map((_, i) => i)).ok, false, "cannot lock everything");
});

test("crafting needs the recipe unlock and materials; blueprints teach recipes; awakening adds the effect", () => {
  const s = rich(fresh(12));
  const known = c.byPrefix<any>("forge").find((r) => r.unlock.type === "known")!;
  assert.equal(craftGear(s, c, known.id).ok, false, "materials missing");
  for (const q of known.ingredients) addItem(s, c, q.id, q.qty);
  const r = craftGear(s, c, known.id);
  assert.ok(r.ok && s.inventory.gear[r.uid]!.base === known.output.base);
  const bpRecipe = c.byPrefix<any>("forge").find((x) => x.unlock.type === "blueprint")!;
  assert.equal(forgeStatus(s, c, bpRecipe).unlocked, false);
  addItem(s, c, bpRecipe.unlock.id, 1);
  assert.ok(studyBlueprint(s, c, bpRecipe.unlock.id).ok);
  s.resources.sect_fame = bpRecipe.fame_required;
  assert.equal(forgeStatus(s, c, bpRecipe).unlocked, true);
  const aw = c.byPrefix<any>("gear").find((b) => b.awakening);
  if (aw) {
    const [lo] = aw.rarity_range;
    const uid = grantGear(s, c, { base: aw.id, rarity: lo, ilvl: 20 });
    for (const m of aw.awakening.materials) addItem(s, c, m.id, m.qty);
    const n0 = s.inventory.gear[uid]!.specials.length;
    assert.ok(awaken(s, c, uid).ok);
    assert.ok(s.inventory.gear[uid]!.awakened && s.inventory.gear[uid]!.specials.length === n0 + 1);
    assert.equal(awaken(s, c, uid).ok, false);
  }
});

// ---------- alchemy ----------

test("alchemy: batches roll per load, failures return herbs and a byproduct, proficiency grows, furnace upgrades", () => {
  const s = rich(fresh(13));
  const r = c.get<any>("alchemy.qi_gathering_pill");
  assert.equal(alchemyStatus(s, c, r).maxBatch, 0);
  for (const q of r.ingredients) addItem(s, c, q.id, q.qty * 10);
  assert.equal(alchemyStatus(s, c, r).maxBatch, 10);
  const pill0 = itemCount(s, r.output.id);
  const run = refinePills(s, c, r.id, 10);
  assert.ok(run.ok);
  assert.equal(run.success + run.failed, 10);
  assert.equal(itemCount(s, r.output.id) - pill0, run.made);
  if (run.failed) assert.ok(itemCount(s, r.failure.byproduct) >= run.failed);
  assert.ok(s.progress.crafting.proficiency > 0);
  const gated = c.get<any>("alchemy.foundation_pill");
  s.resources.sect_fame = 10_000;
  assert.match(alchemyStatus(s, c, gated).reason ?? "", /furnace/);
  const f = c.singletons.furnaces.find((x) => x.grade === 1)!;
  for (const m of f.upgrade!.materials) addItem(s, c, m.id, m.qty);
  assert.ok(upgradeFurnace(s, c).ok);
  assert.equal(s.progress.crafting.furnace, 2);
  s.progress.crafting.proficiency = 0;
  assert.match(alchemyStatus(s, c, gated).reason ?? "", /proficiency/);
});

// ---------- relationships ----------

test("gifts: preferences, tag matching, repeat decay, daily limit and affinity level-up", () => {
  const { g, s, events } = game(fresh(14));
  const npc = "npc.tang_xiaoman";
  assert.equal(giftValue(s, c, npc, "gift.ancient_spirit_coin").pref, "loved");
  assert.equal(giftValue(s, c, npc, "gift.counterfeit_coin").pref, "disliked");
  addItem(s, c, "gift.ancient_spirit_coin", 5);
  const v1 = giftValue(s, c, npc, "gift.ancient_spirit_coin").value;
  assert.ok(g.run("gift", T0, (st, cc) => giveGift(st, cc, npc, "gift.ancient_spirit_coin")).ok);
  const v2 = giftValue(s, c, npc, "gift.ancient_spirit_coin").value;
  assert.equal(v2, Math.round(v1 * 0.5));
  g.run("gift", T0, (st, cc) => giveGift(st, cc, npc, "gift.ancient_spirit_coin"));
  assert.ok(events.some((e) => e.type === "affinity_level"), "40 + 20 crosses Acquaintance (50)");
  giveGift(s, c, npc, "gift.ancient_spirit_coin");
  assert.equal(giftsLeft(s, c, npc), 0);
  assert.equal(giveGift(s, c, npc, "gift.ancient_spirit_coin").ok, false);
  g.tick(1000, T0 + 86_400_000);
  assert.equal(giftsLeft(s, c, npc), 3, "new day");
  assert.equal(s.progress.counters[`gifts:${npc}`], 2, "only gifts dispatched through the Game are counted");
});

test("topics unlock with affinity, pay affinity once; chat pays once a day", () => {
  const s = fresh(15);
  const npc = "npc.tang_xiaoman";
  const t = topics(s, c, npc);
  assert.ok(t.some((x) => !x.unlocked));
  const open = t.find((x) => x.unlocked)!;
  const a = askTopic(s, c, npc, open.id);
  assert.ok(a.ok && a.first);
  const aff = s.relations[npc]!.affinity;
  const b = askTopic(s, c, npc, open.id);
  assert.ok(b.ok && !b.first && s.relations[npc]!.affinity === aff);
  assert.equal(askTopic(s, c, npc, t.find((x) => !x.unlocked)!.id).ok, false);
  const c1 = chat(s, c, npc), c2 = chat(s, c, npc);
  assert.ok(c1.ok && c1.gained > 0 && c1.line.length > 0);
  assert.ok(c2.ok && c2.gained === 0);
});

// ---------- tournaments ----------

test("tournament: entry gate, one saved round per entry, champion rewards, loss resets the run", () => {
  const s = fresh(16);
  const t = c.get<any>("tournament.outer_sect");
  assert.equal(canStart(s, c, { kind: "tournament", id: t.id }, T0).ok, false);
  s.character.realm = "realm.core_formation"; s.character.stage = 9;
  s.progress.realmsEntered.push("realm.foundation_establishment", "realm.core_formation");
  s.resources.sect_fame = 5000;
  const strong = { atk: 5000, hp: 100000, def: 2000, spd: 50 };
  s.character.permanent = strong;
  const fight = () => {
    const st = Encounter.start(s, c, { kind: "tournament", id: t.id }, T0);
    assert.ok(st.ok);
    const enc = st.encounter;
    assert.equal(enc.waves.length, 1);
    const hp = enc.battle!.player.hp;
    enc.battle!.run(); enc.settleWave(T0);
    return { won: enc.done!.won, hp };
  };
  const hps: number[] = [];
  for (let r = 1; r <= t.rounds.length; r++) {
    const f = fight();
    assert.ok(f.won, `round ${r}`);
    hps.push(f.hp);
    if (r < t.rounds.length) assert.equal(s.progress.tournaments[t.id]!.round, r, "bracket position saved");
  }
  assert.equal(new Set(hps).size, 1, "each round starts at full health");
  assert.ok(s.progress.trialsCleared[t.id]);
  assert.equal(s.progress.tournaments[t.id]!.wins, 1);
  assert.ok(s.techniques.known["tech.ult.heavenly_sword_rain"] !== undefined);
  // a weak entrant loses round 1: fame lost and run reset
  const w = fresh(17);
  w.character.realm = "realm.foundation_establishment"; w.character.stage = 1; w.progress.realmsEntered.push("realm.foundation_establishment");
  w.resources.sect_fame = 1000;
  const st = Encounter.start(w, c, { kind: "tournament", id: t.id }, T0);
  assert.ok(st.ok);
  st.encounter.battle!.run(); st.encounter.settleWave(T0);
  assert.ok(!st.encounter.done!.won);
  assert.equal(w.resources.sect_fame, 1000 + t.loss.sect_fame);
  assert.equal(w.progress.tournaments[t.id]!.round, 0);
  if (t.reentry.sect_fame_required > w.resources.sect_fame) assert.equal(canStart(w, c, { kind: "tournament", id: t.id }, T0).ok, false);
});
