/** Property tests for the gear formulas against the real rules.json. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GearRules, rollInstance, refineInstance, mainStatRange, affixRange, checkRules, instanceCp } from "../schema/gear-math.ts";
import { RARITIES, type Rarity } from "../schema/common.ts";

const rules = GearRules.parse(JSON.parse(readFileSync(join(import.meta.dirname, "../content/equipment/rules.json"), "utf8")));
const base = { id: "gear.test_sword", slot: "weapon" as const, main_value: 10, signature_affix: "crit" };

// Deterministic LCG so failures are reproducible.
function lcg(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

test("rules.json satisfies the ordering guarantees", () => {
  assert.deepEqual(checkRules(rules), []);
});

test("at equal ilvl every higher-rarity instance beats every lower-rarity one on main stat, shared affixes and CP", () => {
  for (const L of [1, 10, 40, 100, 150]) {
    for (let i = 0; i < RARITIES.length - 1; i++) {
      const lo = RARITIES[i] as Rarity, hi = RARITIES[i + 1] as Rarity;
      const lows = Array.from({ length: 200 }, (_, k) => rollInstance(rules, base, lo, L, lcg(k + 1)));
      const highs = Array.from({ length: 200 }, (_, k) => rollInstance(rules, base, hi, L, lcg(k + 1000)));
      const maxLowMain = Math.max(...lows.map((x) => x.main.value));
      const minHighMain = Math.min(...highs.map((x) => x.main.value));
      assert.ok(minHighMain > maxLowMain, `ilvl ${L}: ${hi} main ${minHighMain} <= ${lo} main ${maxLowMain}`);
      const maxLowCp = Math.max(...lows.map((x) => instanceCp(rules, x)));
      const minHighCp = Math.min(...highs.map((x) => instanceCp(rules, x)));
      assert.ok(minHighCp > maxLowCp, `ilvl ${L}: ${hi} cp ${minHighCp} <= ${lo} cp ${maxLowCp}`);
      // signature affix (crit) is present on both from uncommon up → compare it
      if (rules.rarity[lo]!.affixes > 0) {
        const maxLowCrit = Math.max(...lows.map((x) => x.affixes.find((a) => a.stat === "crit")!.value));
        const minHighCrit = Math.min(...highs.map((x) => x.affixes.find((a) => a.stat === "crit")!.value));
        assert.ok(minHighCrit > maxLowCrit, `ilvl ${L}: ${hi} crit ${minHighCrit} <= ${lo} crit ${maxLowCrit}`);
      }
      assert.ok(highs.every((h) => h.affixes.length >= Math.min(rules.rarity[lo]!.affixes, lows[0]!.affixes.length)));
    }
  }
});

test("higher ilvl raises both the stat ceiling and the roll floor", () => {
  for (const r of RARITIES) for (let L = 2; L <= 150; L += 7) {
    const [minPrev, maxPrev] = mainStatRange(rules, 10, r, L - 1);
    const [minCur, maxCur] = mainStatRange(rules, 10, r, L);
    assert.ok(minCur > minPrev && maxCur > maxPrev, `${r} ilvl ${L}`);
    const [aMinPrev] = affixRange(rules, 1, r, L - 1);
    const [aMinCur] = affixRange(rules, 1, r, L);
    assert.ok(aMinCur > aMinPrev);
  }
});

test("refinement keeps base and ilvl, raises rarity, preserves roll percentile and adds the new affix", () => {
  const inst = rollInstance(rules, base, "rare", 20, lcg(7));
  const refined = refineInstance(rules, inst, base, lcg(8));
  assert.equal(refined.rarity, "epic");
  assert.equal(refined.ilvl, 20);
  assert.equal(refined.base, inst.base);
  assert.ok(refined.main.value > inst.main.value);
  assert.equal(refined.affixes.length, rules.rarity.epic!.affixes);
  for (const a of inst.affixes) {
    const b = refined.affixes.find((x) => x.stat === a.stat)!;
    assert.ok(b && b.value > a.value, `${a.stat} did not improve`);
  }
  // percentile preserved (within float noise)
  const pct = (roll: number, r: Rarity) => { const f = rules.rarity[r]!.floor; return (roll - f) / (1 - f); };
  assert.ok(Math.abs(pct(refined.main.roll, "epic") - pct(inst.main.roll, "rare")) < 0.05);
});

test("rollInstance is deterministic for a given rng sequence", () => {
  const a = rollInstance(rules, base, "legendary", 33, lcg(42));
  const b = rollInstance(rules, base, "legendary", 33, lcg(42));
  assert.deepEqual(a, b);
});
