/**
 * Validator tests: each case copies the real content, breaks one thing, and asserts the
 * validator reports the expected rule. Run with `npm test` (Node ≥ 22.18, no extra deps).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validate } from "../tools/lib/validator.ts";

const REPO = join(import.meta.dirname, "..");
let base: string;

before(() => {
  base = mkdtempSync(join(tmpdir(), "ia-content-"));
  cpSync(join(REPO, "content"), join(base, "content"), { recursive: true });
  cpSync(join(REPO, "refs"), join(base, "refs"), { recursive: true });
  if (existsSync(join(REPO, "assets"))) cpSync(join(REPO, "assets"), join(base, "assets"), { recursive: true });
});
after(() => rmSync(base, { recursive: true, force: true }));

/** Fresh copy of the base content with one JSON file mutated. */
function scenario(file: string, mutate: (data: any) => void): string {
  const dir = mkdtempSync(join(tmpdir(), "ia-case-"));
  cpSync(base, dir, { recursive: true });
  const p = join(dir, file);
  const data = JSON.parse(readFileSync(p, "utf8"));
  mutate(data);
  writeFileSync(p, JSON.stringify(data));
  return dir;
}

function rulesOf(dir: string) {
  const r = validate(dir);
  rmSync(dir, { recursive: true, force: true });
  return { rules: new Set(r.errors.map((e) => e.rule)), errors: r.errors };
}

test("baseline content validates with zero errors", () => {
  const r = validate(base);
  assert.deepEqual(r.errors, [], r.errors.map((e) => `${e.rule} ${e.where}: ${e.message}`).join("\n"));
});

test("dangling reference is an error", () => {
  const dir = scenario("content/enemies/mortal_plains.enemies.json", (d) => { d[0].loot = "loot.enemy.does_not_exist"; });
  const { rules } = rulesOf(dir);
  assert.ok(rules.has("dangling-ref"), [...rules].join(","));
});

test("item with no source and no use is an error (reverse rule)", () => {
  const dir = scenario("content/items/materials.json", (d) => {
    d.push({ ...d[0], id: "mat.orphan_dust", name: "Orphan Dust", art: { icon: { ...d[0].art.icon, file: "assets/items/materials/orphan_dust.png" } } });
  });
  const { errors } = rulesOf(dir);
  const mine = errors.filter((e) => e.where === "mat.orphan_dust").map((e) => e.rule);
  assert.ok(mine.includes("no-source") && mine.includes("no-use"), mine.join(","));
});

test("divine gear dropped outside a mega dungeon is an error", () => {
  const dir = scenario("content/economy/loot/enemies.json", (d) => {
    d[0].ilvl = [1, 6];
    d[0].entries.push({ gear: { base: "gear.dragon_abyss_sword" }, rarity_weights: { divine: 1 }, chance: 0.5 });
  });
  assert.ok(rulesOf(dir).rules.has("divine-source"));
});

test("divine gear sold in a shop is an error", () => {
  const dir = scenario("content/economy/shops.json", (d) => { d[0].stock.push({ gear: { base: "gear.dragon_abyss_sword", rarity: "divine", ilvl: 100 }, price: 1, currency: "spirit_stones", unlock: {} }); });
  assert.ok(rulesOf(dir).rules.has("divine-source"));
});

test("gear base art must cover exactly its rarity range", () => {
  const dir = scenario("content/equipment/bases/azure_iron_sword.json", (d) => { delete d[0].rarities.rare; });
  const { errors } = rulesOf(dir);
  assert.ok(errors.some((e) => e.rule === "schema" && /missing art for rarity rare/.test(e.message)), errors.map((e) => e.message).join("\n"));
});

test("granting a rarity outside the base's range is an error", () => {
  const dir = scenario("content/economy/shops.json", (d) => { d[0].stock.push({ gear: { base: "gear.bamboo_sword", rarity: "legendary", ilvl: 10 }, price: 1, currency: "spirit_stones", unlock: {} }); });
  assert.ok(rulesOf(dir).rules.has("gear-rarity-range"));
});

test("a pool rarity no base can reach is an error", () => {
  const dir = scenario("content/economy/loot/enemies.json", (d) => {
    d[0].ilvl = [1, 6];
    d[0].entries.push({ gear: { pool: { tags: ["plains"] } }, rarity_weights: { divine: 1 }, chance: 0.5 });
  });
  assert.ok(rulesOf(dir).rules.has("gear-pool-empty"));
});

test("a gear variant with no source (and no refinement path) is an error", () => {
  const dir = scenario("content/equipment/bases/reed_hat.json", (d) => {
    d[0].rarity_range = ["common", "divine"];
    for (const r of ["rare", "epic", "legendary", "mythic", "immortal", "divine"]) d[0].rarities[r] = { art: { ...d[0].rarities.common.art, icon: { ...d[0].rarities.common.art.icon, file: `assets/x/reed_hat_${r}.png` } } };
  });
  const { errors } = rulesOf(dir);
  // common..mythic reachable by refinement from the shop's common hat; immortal and divine are not
  assert.ok(errors.some((e) => e.rule === "no-source" && e.where === "gear.reed_hat (immortal)"));
  assert.ok(errors.some((e) => e.rule === "no-source" && e.where === "gear.reed_hat (divine)"));
  assert.ok(!errors.some((e) => e.rule === "no-source" && e.where === "gear.reed_hat (mythic)"));
});

test("breaking the rarity ordering guarantee in rules.json is an error", () => {
  const dir = scenario("content/equipment/rules.json", (d) => { d.rarity.uncommon.main_mult = 1.2; });
  const { errors } = rulesOf(dir);
  assert.ok(errors.some((e) => e.rule === "gear-math" && /worst uncommon main stat/.test(e.message)));
});

test("quest prerequisite cycle is an error", () => {
  const dir = scenario("content/quests/main.json", (d) => {
    const q = d.find((x: any) => x.id === "quest.main.first_breath");
    q.prereqs.quests = ["quest.main.first_hunt"];
  });
  assert.ok(rulesOf(dir).rules.has("quest-cycle"));
});

test("quest requiring an unobtainable item is impossible", () => {
  const dir = scenario("content/quests/missions.json", (d) => {
    d[0].objectives = [{ type: "collect", item: "mat.orphan_dust", count: 1 }];
  });
  // mat.orphan_dust does not exist at all → dangling; add it to materials to isolate the objective rule
  const dir2 = scenario("content/items/materials.json", (d) => {
    d.push({ ...d[0], id: "mat.orphan_dust", name: "Orphan Dust", art: { icon: { ...d[0].art.icon, file: "assets/items/materials/orphan_dust.png" } } });
  });
  rmSync(dir, { recursive: true, force: true });
  const p = join(dir2, "content/quests/missions.json");
  const q = JSON.parse(readFileSync(p, "utf8"));
  q[0].objectives = [{ type: "collect", item: "mat.orphan_dust", count: 1 }];
  writeFileSync(p, JSON.stringify(q));
  const { errors } = rulesOf(dir2);
  assert.ok(errors.some((e) => e.rule === "objective" && /no acquisition source/.test(e.message)));
});

test("generated art whose file is missing is an error", () => {
  const dir = scenario("content/world/elements.json", () => {});
  const p = join(dir, "content/world/roots.json");
  const roots = JSON.parse(readFileSync(p, "utf8"));
  roots[0].art.illustration.status = "generated";
  writeFileSync(p, JSON.stringify(roots));
  assert.ok(rulesOf(dir).rules.has("art-missing"));
});

test("enemy that never appears anywhere is an orphan", () => {
  const dir = scenario("content/enemies/mortal_plains.enemies.json", (d) => {
    d.push({ ...d[0], id: "enemy.ghost_nobody", name: "Nobody", art: { icon: { ...d[0].art.icon, file: "assets/x/nobody_icon.png" }, battle: { ...d[0].art.battle, file: "assets/x/nobody_battle.png" } } });
  });
  const { errors } = rulesOf(dir);
  assert.ok(errors.some((e) => e.rule === "orphan" && e.where === "enemy.ghost_nobody"));
});

test("asymmetric or unreachable node links are errors", () => {
  const dir = scenario("content/adventure/nodes/mortal_plains.json", (d) => {
    const camp = d.find((n: any) => n.id === "node.mortal_plains.bandit_camp");
    camp.connections = [];
  });
  const { rules } = rulesOf(dir);
  assert.ok(rules.has("node-link") || rules.has("node-unreachable"), [...rules].join(","));
});

test("duplicate IDs are errors", () => {
  const dir = scenario("content/items/gifts.json", (d) => { d.push({ ...d[0] }); });
  assert.ok(rulesOf(dir).rules.has("duplicate-id"));
});

test("refinement step above the mythic cap is an error", () => {
  const dir = scenario("content/equipment/refinement.json", (d) => { d.steps.push({ from: "mythic", chance: 0.1, stones: 1, materials: [{ id: "mat.refining_stone", qty: 1 }] }); });
  assert.ok(rulesOf(dir).rules.has("refine-cap"));
});

test("blueprint and recipe must point at each other", () => {
  const dir = scenario("content/items/blueprints.json", (d) => { d[0].unlocks = "forge.azure_iron_sword"; });
  assert.ok(rulesOf(dir).rules.has("recipe-unlock"));
});

test("strict mode turns coverage shortfalls into errors", () => {
  const dir = scenario("content/meta/content_targets.json", (d) => { d.strict = true; d.targets.regions = 99; });
  const { rules } = rulesOf(dir);
  assert.ok(rules.has("content-target"));
});

test("every slot can roll every rarity in the shipped database", () => {
  const dir = scenario("content/meta/content_targets.json", (d) => { d.strict = true; });
  assert.ok(!rulesOf(dir).rules.has("rarity-coverage"));
});
