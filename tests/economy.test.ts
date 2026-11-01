/**
 * Economy loops added in the balance pass (docs/qa/BALANCE_SIMULATION_RESULTS.md "Journey"): bad-luck protection on
 * loot, the Contribution exchange, realm-scaled shop prices, regional pills as breakthrough ingredients, furnaces 4–5.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { testContent } from "./helpers/content.ts";
import { newGameState } from "../src/engine/state.ts";
import { rollTable } from "../src/engine/loot.ts";
import { shopRows, buy } from "../src/engine/shop.ts";
import { furnaces } from "../src/engine/crafting.ts";

const c = testContent();
const T0 = Date.UTC(2026, 9, 29, 12, 0, 0);
const fresh = (seed = 7) => newGameState(c, T0, { seed });

test("loot pity: a region boss's Dao Insight Crystal drops at the latest on the fifth kill, and the counter resets on a hit", () => {
  const s = fresh();
  const table = c.byPrefix<any>("loot").find((l) => l.id === "loot.boss.molten_ape_king")!;
  const entry = table.entries.find((e: any) => e.id === "mat.dao_insight_crystal");
  assert.equal(entry.pity, 5);
  let longestDry = 0, dry = 0;
  for (let i = 0; i < 400; i++) {
    const got = rollTable(s, c, table.id).items.some((q) => q.id === "mat.dao_insight_crystal");
    if (got) { longestDry = Math.max(longestDry, dry); dry = 0; } else dry++;
  }
  assert.ok(longestDry <= 4, `longest dry streak ${longestDry}`);
  assert.ok((s.progress.counters["pity:loot.boss.molten_ape_king:mat.dao_insight_crystal"] ?? 0) <= 4);
});

test("the Contribution exchange sells crystals for Contribution earned from missions; prices in stones scale with the realm", () => {
  const s = fresh(); s.resources.contribution = 250; s.resources.sect_fame = 5000;
  const rows = shopRows(s, c, "shop.sect_exchange", T0);
  const crystal = rows.find((r) => r.id === "mat.dao_insight_crystal")!;
  assert.equal(crystal.currency, "contribution"); assert.equal(crystal.left, 3);
  assert.ok(buy(s, c, "shop.sect_exchange", crystal.index, 2, T0).ok);
  assert.equal(s.resources.contribution, 250 - 2 * crystal.price);
  assert.equal(s.inventory.stacks["mat.dao_insight_crystal"], 2);
  assert.ok(!buy(s, c, "shop.sect_exchange", crystal.index, 2, T0).ok, "weekly stock and contribution run out");
  // missions pay contribution
  const missions = c.byPrefix<any>("quest").filter((q) => q.type === "mission" || q.type === "combat");
  assert.ok(missions.length > 10 && missions.every((q) => (q.rewards.contribution ?? 0) > 0), "every mission and hunt pays contribution");
  // the Pavilion's crystal costs more in later realms
  const price = (realm: string) => { const t = fresh(); t.resources.sect_fame = 5000; t.character.realm = realm; return shopRows(t, c, "shop.merchant_pavilion", T0).find((r) => r.id === "mat.dao_insight_crystal")!.price; };
  const p1 = price("realm.qi_condensation"), p8 = price("realm.tribulation_transcendence"), p15 = price("realm.immortal_emperor");
  assert.ok(p1 < p8 && p8 < p15, `${p1} < ${p8} < ${p15}`);
  assert.ok(p15 / p1 > 1000, "late-game sink");
});

test("every realm from Nascent Soul on needs its region's pill, whose recipe is brewable at a furnace that exists and unlocks by fame", () => {
  const recipes = c.byPrefix<any>("alchemy");
  const grades = furnaces(c).map((f) => f.grade);
  assert.deepEqual(grades, [1, 2, 3, 4, 5]);
  for (const f of furnaces(c).slice(0, -1)) assert.ok(f.upgrade && f.upgrade.stones > 0 && f.upgrade.materials.every((q: any) => c.find(q.id)), `furnace ${f.grade} upgrade`);
  for (const r of c.byPrefix<any>("realm").filter((x) => x.order >= 4)) {
    const pill = r.major_breakthrough.requirements.find((q: any) => q.id.startsWith("cons."));
    assert.ok(pill, `${r.id} needs a pill`);
    const rec = recipes.find((a) => a.output.id === pill.id);
    assert.ok(rec, `${pill.id} has a recipe`);
    assert.ok(grades.includes(rec.furnace_min), `${rec.id} furnace ${rec.furnace_min}`);
    assert.ok(rec.proficiency_min <= 600 && rec.unlock.type === "sect_fame");
    // the pill's region is the realm's number: its materials were farmable regions ago
    const regionOrder = c.byPrefix<any>("region").find((g) => rec.ingredients.every((q: any) => c.get<any>(q.id).tags?.includes(g.id.split(".")[1])))?.order;
    assert.equal(regionOrder, r.order, `${rec.id} brewed from region ${regionOrder}`);
  }
  // the proficiency ladder climbs 40 a realm, and each pill's xp covers the next step
  const ladder = c.byPrefix<any>("realm").filter((x) => x.order >= 4).map((r) => recipes.find((a) => a.output.id === r.major_breakthrough.requirements.find((q: any) => q.id.startsWith("cons.")).id)!);
  for (let i = 1; i < ladder.length; i++) assert.ok(ladder[i - 1]!.proficiency_xp >= ladder[i]!.proficiency_min - ladder[i - 1]!.proficiency_min, `${ladder[i]!.id} is reachable from ${ladder[i - 1]!.id}`);
});
