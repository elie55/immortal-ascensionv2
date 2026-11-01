/** The Techniques screen's preview (src/engine/combat/preview.ts): current damage / heal / shield with mastery. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { testContent } from "./helpers/content.ts";
import { newGameState } from "../src/engine/state.ts";
import { techPreview } from "../src/engine/combat/preview.ts";
import { buildPlayer } from "../src/engine/combat/build.ts";

const c = testContent();
const T0 = Date.UTC(2026, 9, 30, 8, 0, 0);

test("damage grows with mastery: +3% a level, ×1.3 at level 10", () => {
  const s = newGameState(c, T0, { seed: 1 });
  const id = "tech.active.azure_strike";
  s.techniques.known[id] = 0;
  const m0 = techPreview(s, c, id);
  assert.equal(m0.kind, "damage"); assert.equal(m0.level, 0); assert.ok(m0.value > 0);
  s.techniques.known[id] = 10 * c.get<any>(id).mastery.xp_per_level;
  const m10 = techPreview(s, c, id);
  assert.equal(m10.level, 10);
  assert.ok(Math.abs(m10.value / m0.value - 1.3) < 0.02, `${m0.value} → ${m10.value}`);
});

test("damage is the battle formula before defense: (ATK + SP power × weight) × power × mastery × element bonus × hits", () => {
  const s = newGameState(c, T0, { seed: 1 });
  const id = "tech.active.azure_strike"; const t = c.get<any>(id);
  s.techniques.known[id] = 0;
  const p = buildPlayer(s, c); const R = c.combat.damage;
  const el = t.element.split(".")[1];
  const want = (p.base.atk! + (p.base.sp_power ?? 0) * R.sp_power_weight) * t.power / 100 * (1 + Math.min(c.combat.caps.elem_diff, p.base[`elem_dmg.${el}`] ?? 0) / 100) * t.hits;
  assert.equal(techPreview(s, c, id).value, Math.round(want));
});

test("shields and heals are shares of max HP, raised by mastery", () => {
  const s = newGameState(c, T0, { seed: 1 });
  const p = buildPlayer(s, c);
  for (const t of c.byPrefix<any>("tech").filter((x) => x.kind === "active" && !x.power && (x.heal_pct || x.shield_pct_max_hp)).slice(0, 4)) {
    s.techniques.known[t.id] = 10 * t.mastery.xp_per_level;
    const pv = techPreview(s, c, t.id);
    const pct = t.heal_pct || t.shield_pct_max_hp;
    assert.equal(pv.kind, t.heal_pct ? "heal" : "shield");
    assert.equal(pv.value, Math.round(p.maxHp * pct / 100 * (1 + 10 * t.mastery.per_level_bonus)));
  }
});
