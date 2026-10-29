# Balance simulation results

Seeded, deterministic runs of `tools/balance/sim.ts` (8 seeds per node, 16 seeds in the regression test sample). Full tables:
`tools/balance/out/baseline.md` (before) and `tools/balance/out/after.md` (after). Numbers are win rates of the simulator's
archetypes, **not** human playtests; with 8 seeds a cell has roughly ±15 points of sampling error.

## Before → after, fitted archetype (normal / elite / boss win %)

| region | CP | before | after | dungeons after | tribulation after | tower stall before → after |
|---|---|---|---|---|---|---|
| 1 mortal_plains | 781 | 100/100/100 | 100/100/100 | old_granary_cellars 100% · spirit_stone_mine 100% | — | 27 → 18 |
| 2 azure_bamboo_forest | 794 | 100/100/100 | 100/100/100 | spirit_stone_mine 100% · green_labyrinth 100% | — | 29 → 18 |
| 3 blazing_mountain | 2145 | 100/100/100 | 98/88/38 | ember_forge_ruins 100% | — | 40 → 30 |
| 4 frozen_lotus_valley | 2624 | 100/100/88 | 84/100/63 | glacier_caverns 100% | 100% | 49 → 33 |
| 5 ancient_sword_tomb | 5150 | 100/100/63 | 93/100/50 | hall_of_ten_thousand_blades 50% | 100% | 63 → 42 |
| 6 demon_territory | 10728 | 100/100/100 | 95/100/75 | blood_river_prison 100% | — | 90 → 49 |
| 7 celestial_mountains | 17616 | 100/100/100 | 91/50/38 | thunder_pine_sanctum 25% | 88% | 100 → 57 |
| 8 nine_heavens | 27436 | 100/100/100 | 91/100/38 | abyss_of_the_nine_heavens 0% · sunken_star_palace 75% | — | 100 → 63 |
| 9 thunderclap_wastes | 46174 | 100/100/100 | 88/88/63 | glass_labyrinth 75% | — | 100 → 72 |
| 10 sunken_dragon_sea | 64845 | 100/100/100 | 95/81/38 | coral_labyrinth 25% · dragon_king_palace 0% | 100% | 100 → 72 |
| 11 starfall_desert | 87489 | 100/100/100 | 96/94/50 | buried_star_temple 50% | — | 100 → 79 |
| 12 gate_of_ascension | 126059 | 100/100/100 | 89/94/25 | trial_of_nine_flames 100% · fallen_heaven_ruins 0% | 88% | 100 → 84 |
| 13 jade_immortal_realm | 162001 | 100/100/100 | 100/81/63 | immortal_peach_garden 100% | — | 100 → 89 |
| 14 golden_palace_of_laws | 203397 | 100/100/100 | 88/56/88 | hall_of_verdicts 25% · ten_thousand_laws_hall 0% | 88% | 100 → 89 |
| 15 throne_of_the_immortal_emperor | 305840 | 100/100/88 | 89/56/50 | hall_of_five_elements 50% · primordial_chaos_abyss 0% | 50% | 100 → 98 |

## Geared archetype after (normal / elite / boss, mega dungeons)

| region | CP | n/e/b | megas |
|---|---|---|---|
| 1 | 1236 | 100/100/100 | — |
| 2 | 2663 | 100/100/100 | — |
| 3 | 4825 | 100/100/100 | ember_forge_ruins 100% |
| 4 | 8167 | 100/100/100 | — |
| 5 | 13872 | 100/100/100 | — |
| 6 | 20665 | 100/100/100 | — |
| 7 | 29720 | 100/100/100 | — |
| 8 | 50127 | 100/100/100 | abyss_of_the_nine_heavens 75% · sunken_star_palace 100% |
| 9 | 69190 | 100/100/100 | — |
| 10 | 91660 | 100/100/100 | dragon_king_palace 75% |
| 11 | 121470 | 100/100/100 | — |
| 12 | 156133 | 100/100/100 | fallen_heaven_ruins 100% |
| 13 | 194500 | 100/100/100 | — |
| 14 | 284087 | 100/100/100 | ten_thousand_laws_hall 25% |
| 15 | 415845 | 100/100/100 | primordial_chaos_abyss 25% |

## Why the baseline looked fine and was not

The baseline's 100 % everywhere for *fitted* came from four defects, not from balance:

1. Percentage stats on gear scaled like flat stats (×50 at ilvl 120): evasion 96 %, crit > 100 %, speed 460 vs enemy 20–40.
2. Freeze set speed to −100 %, so a frozen unit's turn (and therefore the status' expiry) never came (P1).
3. Stun/freeze had no diminishing returns: two 30–40 % stun techniques locked any boss forever.
4. Tower floors scaled hp/atk/def but not speed, so a region-9 player cleared floor 100 (power 324k) with 46k CP.

Fixes: `bounded_stats` gear scaling, combat caps, speed compression and per-region enemy speed, control immunity,
tower speed scaling, then the enemy curve was re-derived from the measured player curve (`CP_BASE`, `BOSS_MULT`).

## Economy (after)

| region | stones/day (battle nodes) | weapon +10 | days for 8 slots +10 |
|---|---|---|---|
| mortal_plains | 1943 | 220 | 0.9 |
| azure_bamboo_forest | 3603 | 2691 | 6 |
| blazing_mountain | 15229 | 5555 | 2.9 |
| frozen_lotus_valley | 23216 | 8622 | 3 |
| ancient_sword_tomb | 36276 | 17880 | 3.9 |
| demon_territory | 45707 | 22900 | 4 |
| celestial_mountains | 62210 | 28061 | 3.6 |
| nine_heavens | 72228 | 50010 | 5.5 |
| thunderclap_wastes | 91415 | 58089 | 5.1 |
| sunken_dragon_sea | 101574 | 66306 | 5.2 |
| starfall_desert | 122903 | 111247 | 7.2 |
| gate_of_ascension | 132968 | 123855 | 7.5 |
| jade_immortal_realm | 156056 | 136625 | 7 |
| golden_palace_of_laws | 165902 | 149543 | 7.2 |
| throne_of_the_immortal_emperor | 190451 | 162598 | 6.8 |

Before: 178 days (region 1) → 6 days (region 15), because enhancement cost was flat per rarity while income grows ×100.

## Cultivation (after; provisional pacing)

| realm | idle hours | optimised hours | 12 h offline covers |
|---|---|---|---|
| qi_condensation | 3.3 | 1 | 290% |
| foundation_establishment | 4.7 | 1.5 | 206% |
| core_formation | 6.4 | 2 | 150% |
| nascent_soul | 8.8 | 2.8 | 109% |
| soul_transformation | 11.7 | 3.7 | 82% |
| spirit_severing | 15.3 | 4.8 | 63% |
| dao_integration | 19.4 | 6.1 | 50% |
| tribulation_transcendence | 25.8 | 8.1 | 37% |
| mahayana | 32.1 | 10.1 | 30% |
| immortal_ascension | 41.2 | 13 | 23% |
| earth_immortal | 49.3 | 15.5 | 19% |
| heavenly_immortal | 61.1 | 19.3 | 16% |
| golden_immortal | 71.8 | 22.6 | 13% |
| immortal_king | 86.9 | 27.4 | 11% |
| immortal_emperor | 99.5 | 31.3 | 10% |

Before: 253 h idle in total (realm 15 = 34 h). After: ≈ 540 h idle, ≈ 170 h optimised. Marked provisional.

## Breakthrough materials

Every major breakthrough requirement has at least one farmable source (region boss 16–40 %/clear, mega dungeon
guaranteed 3, tribulation rewards, tower milestones). Dao Insight Crystals needed per realm: 2 → 13; expected boss
clears per realm ≈ 10–40 at the region boss alone.

## Tournaments (after)

Round CPs raised (outer 1200→2400, inner 3500→6500, core 15k→30k) and duelist speed follows the player curve;
fitted players at the entry region win the outer bracket, about a third of inner runs, and need to be geared for core.

## Other measurements

- Idle archetype (cultivation + techniques, starting gear) cannot clear region 3+ normals: gear is mandatory by design;
  the fitted archetype only assumes drops from the previous region.
- Battles last 4–20 rounds for fitted players, 2–7 for geared; no timeouts in the after run.
- No run reached the 60-round limit except the baseline tower (stun-lock).
