# Gear System

Owner's design goals (29 Oct 2026):

1. A few **meaningful sets**, not hundreds of hand-made items.
2. **Random stats** on dropped gear.
3. An **item level** on every drop, decided by the content it came from.
4. At the same item level, a **higher rarity is better in every stat** — *slightly to much better*, decided by the roll.
5. **Higher item level means better stats and better rolls.**

Everything below is implemented in `schema/gear-math.ts` (used by the game and the validator)
and parameterised by `content/equipment/rules.json`.

## 1. Vocabulary

| Term | Meaning |
|---|---|
| **Base** (`gear.<base>`) | A kind of item: slot, weapon type, element, set, main stat, art per rarity, allowed rarity range. Example: `gear.rimeglass_spear`. |
| **Instance** | What the player actually owns: `base + rarity + ilvl + rolls + enhancement + awakening`. Only instances live in saves. |
| **ilvl** | Item level, 1 … `ilvl_cap` (150). Set by the drop source. |
| **Main stat** | One fixed stat per slot (weapon → ATK, armor → HP, helmet → DEF, boots → SPD, necklace → SP Power, ring → ATK, artifact → SP Power). Always present. |
| **Affix** | A secondary stat rolled from the slot's pool. Count depends on rarity. |
| **Signature affix** | A base may name one affix that is always present (e.g. Rimeglass Spear always has Water Damage). |
| **Special effect** | Non-numeric effect (on-hit Burn, counter…). Mythic+ instances get them; unique bases carry fixed ones. |
| **Roll** | A number in `[floor, 1]` drawn per stat at creation. `1.0` is a perfect roll. |

## 2. Formulas

```
scale(L)        = 1 + a·L + b·L²                      (a = 0.12, b = 0.0025; L = ilvl)
floor(r, L)     = f_r + (0.95 − f_r) · min(1, L / ilvl_cap) · 0.6   (f_r per rarity, see rules.json)
roll            ~ U[floor(r, L), 1]
main(r, L)      = base.main_value · scale(L) · M_r · roll
affix_s(r, L)   = pool[s].value · scale(L) · A_r · roll
```

`M_r` and `A_r` are the rarity multipliers. The rules file guarantees, for every ilvl `L`:

```
M_{r+1} · floor(r+1, L)  >  M_r · 1.0          (worst higher-rarity roll beats best lower-rarity roll)
```

and the same for `A_r`. With a ×1.5 ladder and floors ≥ 0.7 this holds everywhere; the validator
(`gear-math` rule) recomputes it for all `L` and all rarity pairs and fails the build if a change to
`rules.json` ever breaks it. The floor rising with `L` is what makes rolls better at higher item level;
`scale(L)` is what makes the stats themselves better.

### Affix counts and specials by rarity

| Rarity | Affixes | Special effects |
|---|---|---|
| common | 0 | 0 |
| uncommon | 1 | 0 |
| rare | 2 | 0 |
| epic | 3 | 0 |
| legendary | 4 | 0 (unique bases may carry 1) |
| mythic | 4 | 1 |
| immortal | 5 | 1 |
| divine | 5 | 2 |

Affix types are drawn without replacement from the slot pool (signature affix first). A stat that
appears on two instances of different rarity is always higher on the higher rarity; the higher
rarity also never has fewer affixes. Total item CP (see §5) is strictly ordered by rarity.

### Worked example — weapon main stat (ATK), `main_value` 10, computed from the shipped `rules.json`

| ilvl | Rare (worst → best) | Epic (worst → best) | Legendary (worst → best) |
|---|---|---|---|
| 1 | 19 → 25 | 29 → 38 | 45 → 57 |
| 10 | 41 → 55 | 64 → 83 | 98 → 125 |
| 40 | 171 → 221 | 263 → 333 | 403 → 500 |
| 100 | 705 → 855 | 1080 → 1292 | 1643 → 1938 |
| 150 | 1466 → 1693 | 2236 → 2559 | 3385 → 3838 |

Reading: the *worst* Epic (64 at ilvl 10) still beats the *best* Rare (55); a lucky Epic (83) is 50 %
stronger than a lucky Rare. Roll floors rise with ilvl: a Common rolls at least 70 % of its ceiling at
ilvl 1 and 85 % at ilvl 150; Divine 84 % → 91 %. `tests/gear-math.test.ts` rolls hundreds of instances
per rarity pair and asserts the ordering on main stat, shared affixes and CP.

## 3. Where item level comes from

Every gear source declares its ilvl:

| Source | ilvl |
|---|---|
| Loot table | `ilvl: [min, max]` on the table; bosses use the top of their region's band |
| Shop stock | fixed `ilvl` per entry (restocks re-roll stats) |
| Forge recipe | `ilvl` on the recipe (blueprint tier) |
| Quest / achievement / tournament / story reward | `ilvl` on the reward entry |
| Starting equipment | `ilvl` in `starting_state` |

Content bands (guideline, enforced as warnings): region order *n* → ilvl `[8n−7, 8n+4]`;
dungeons inherit their region's band; tower floor *f* → `ilvl = min(cap, 3 + f)`; mega dungeons
use the top of their region band (+0…4): Abyss 68–72 … Primordial Chaos Abyss 124–128.

## 4. Rarity rules

- Each base declares `rarity_range: [min, max]`; drops outside it are build errors.
- **Divine** only appears in loot tables owned exclusively by `mega` dungeons; never in shops, forge or rewards.
- **Refinement** raises an instance one rarity step (≤ **mythic**), keeps base and ilvl, re-rolls every
  stat *preserving the roll percentile* (a 90 % roll stays a 90 % roll in the new, higher range) and
  rolls the newly unlocked affix fresh. The target rarity must be inside the base's range.
- **Reforge** re-rolls affix values; may swap an unlocked affix's type (never the signature affix);
  locked affixes keep both type and value. Cost from `reforge.json`.
- **Enhancement** +1 … +15 multiplies main stat and affixes by `enhancement.levels[n].stat_mult`.
  Applied equally to every rarity, so it never breaks the ordering.
- **Awakening** unlocks the base's awakening effect (bases with `awakening` only).

## 5. Item CP

`cp = main · w_main + Σ affix_s · w_s + specials · w_special`, weights in `rules.json`. Used for the
"vs equipped ▲ 15" comparison in the inventory and for the player's total CP.

## 6. Sets

A set lists 3–5 bases; set bonuses are fixed (not rolled) and apply at 2/3/5 pieces. A set piece is a
normal base (random stats, any rarity in its range) that happens to belong to a set. Each set is tied
to one content source (e.g. Rimeglass → Frozen Lotus Valley). Target: ~8 sets for the full game.

## 7. Uniques

Bases flagged `unique: true` have a single rarity, fixed `special_effects`, and still roll main stat
and affixes. Examples: Reed Witch's Whisper Ring (epic), Dragon Abyss Sword (divine).

## 8. Data shapes (see `schema/items.ts`)

```jsonc
// content/equipment/bases/rimeglass_spear.json
{ "id": "gear.rimeglass_spear", "slot": "weapon", "weapon_type": "spear", "element": "elem.water",
  "set": "set.rimeglass", "main_value": 10, "signature_affix": "elem_dmg.water",
  "rarity_range": ["epic", "mythic"], "droppable": true, "drop_tags": ["frost"],
  "rarities": { "epic": { "art": { "icon": … } }, "legendary": { … }, "mythic": { … } } }

// a gear entry in a loot table (ilvl comes from the table)
{ "gear": { "base": "gear.rimeglass_spear" }, "rarity_weights": { "epic": 80, "legendary": 18, "mythic": 2 }, "chance": 0.1 }
{ "gear": { "pool": { "slot": "ring" } }, "rarity_weights": { "common": 70, "uncommon": 25, "rare": 5 }, "chance": 0.3 }

// a fixed gear grant (shop, reward, starting state, forge output)
{ "base": "gear.azure_iron_sword", "rarity": "uncommon", "ilvl": 6 }
```

## Percentage stats (balance pass)

Stats listed in `rules.bounded_stats` (crit, crit_dmg, acc, eva, spd, cdr, dmg_red, life_steal, armor_pen, heal_bonus,
shield_str, status_res, elemental) use a gentle item-level ramp `1 + L/ilvl_cap` instead of the flat curve, so a
+5 % crit affix stays a few percent at endgame instead of 50 %. Their CP contribution still follows the flat curve
(a percentage is worth more on a stronger character), which keeps the rarity-ordering invariant. Enhancement
stone costs scale with item level (`enhancement.ilvl_cost`).
