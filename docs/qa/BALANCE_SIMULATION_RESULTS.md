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

## Journey (whole-game simulation, 2026-11-01)

`node tools/balance/journey.ts --seeds 1 --days 30` (tools/balance/out/journey.md): a bot that plays two hours a day
with the real engine — cultivation (offline between sessions), breakthroughs, quests, shops and the Contribution
Exchange, alchemy and furnace upgrades, enhancement, dungeons, tournaments, secret realms, bag keeping, and material
farming for whatever the next step needs — after the economy, mechanics and crystal/alchemy passes:

| region | arrive day | boss day | realm · stage on leaving | CP | waited for |
|---|---|---|---|---|---|
| 1 mortal_plains | 0 | 0 | Qi Condensation 9 | 528 | herbs |
| 2 azure_bamboo_forest | 0 | 1 | Qi Condensation 9 | 799 | materials, energy |
| 3 blazing_mountain | 1 | 1 | Foundation 6 | 2025 | — |
| 4 frozen_lotus_valley | 1 | 1 | Foundation 9 | 3168 | — |
| 5 ancient_sword_tomb | 2 | 2 | Core Formation 9 | 7777 | realm 50′ |
| 6 demon_territory | 2 | 3 | Nascent Soul 9 | 15333 | tribulation 595′, realm 273′, energy |
| 7 celestial_mountains | 8 | 8 | Soul Transformation 9 | 23444 | — |
| 8 nine_heavens | 9 | 9 | Dao Integration 3 | 40207 | — |
| 9 thunderclap_wastes | 9 | 10 | Dao Integration 9 | 56670 | — |
| 10 sunken_dragon_sea | 10 | 10 | Tribulation Transcendence 9 | 76192 | — |
| 11 starfall_desert | 11 | 11 | Mahayana 9 | 108989 | — |
| 12 gate_of_ascension | 12 | 12 | Immortal Ascension 9 | 153492 | — |
| 13 jade_immortal_realm | 13 | 13 | Earth Immortal 9 | 195033 | — |
| 14 golden_palace_of_laws | 14 | 14 | Golden Immortal 9 | 289671 | realm 55′ |
| 15 throne_of_the_immortal_emperor | 16 | 16 | Immortal King 3 | 317823 | — |

The Qi clock is the pacing from region 7 on: each realm takes about a day of (mostly offline) cultivation and the
bot leaves every region at stage 9 of the realm it needs next. The Soul Transformation tribulation is the one hard
gate (five days at region 6 until the probe said it was winnable). A perfect player on two hours a day finishes the
15 regions in **16 days**; the realm pacing ("realm 15 ≈ 100 h idle") remains the owner's lever (`REALM_DEFS` qi
base/growth in tools/gen/world.py) if the game should run longer.

What the journey found and what was changed:
- **Core Formation wall** — Core Condensing Pill asked for alchemy proficiency 600 with no recipe ladder below it
  (regional pills 300–600 use region 7–15 herbs) → 200; the Merchant Pavilion stocks Peach Blossom and Crane Feather.
- **Boss slain before its quest** — the Sovereign quests open at a realm stage the player may reach after the first
  kill and counted only kills after acceptance, so the main quest (and the next region) could stall until the player
  re-fought the boss → boss defeats now count from zero (`progression.ts`, test in sect.test.ts).
- **Enhancement glut** — see Economy below (+10 in half a day, 866k stones banked by day 20) → cost curve retuned.
- Bot-side policies the journey needed (map exploration, proficiency grinding, re-fighting a boss a quest asks for,
  bag keeping — a full bag sends new drops to the overflow pouch, which stalled early runs for weeks on a material
  that was sitting there) are now in journey.ts; `--verbose` dumps needs, wanted items, recipe status, main-quest statuses every 10 days and
  `IA_WATCH=<item id>` logs every change of that item's count with what caused it.

## Combat mechanics pass (2026-11-01)

Signature mechanics on every region sovereign, tempo (turn push/delay), Surge, counter stances and the smarter AI
(docs/COMBAT.md) changed boss fights; bosses were re-calibrated with `BOSS_MULT` (9: 2.0 → 1.5, 14: 1.4 → 1.1,
3: 1.15 → 1.08), Law Chain's stun 0.35 → 0.2, and the mark / curse / measure / tide signatures softened until the
fitted archetype landed back in the 25–75 % first-try window. `node tools/balance/sim.ts --seeds 8`
(tools/balance/out/after_mechanics.md), fitted normal / elite / boss, geared boss:

| region | fitted normal | fitted elite | fitted boss | geared boss | signature |
|---|---|---|---|---|---|
| 3 blazing_mountain | 79 % | 94 % | 25 % | 100 % | Rising Fury |
| 4 frozen_lotus_valley | 89 % | 100 % | 38 % | 100 % | Lotus Ice Armor |
| 5 ancient_sword_tomb | 98 % | 88 % | 38 % | 100 % | Sword Intent Riposte |
| 6 demon_territory | 91 % | 100 % | 63 % | 100 % | Blood Moon Feast |
| 7 celestial_mountains | 73 % | 69 % | 50 % | 100 % | Mirror Stair |
| 8 nine_heavens | 96 % | 100 % | 25 % | 100 % | Gate Tremor |
| 9 thunderclap_wastes | 96 % | 94 % | 38 % | 88 % | Thunder Brand |
| 10 sunken_dragon_sea | 80 % | 88 % | 38 % | 100 % | Tidal Rhythm |
| 11 starfall_desert | 95 % | 94 % | 25 % | 100 % | Pharaoh's Curse |
| 12 gate_of_ascension | 98 % | 100 % | 38 % | 88 % | Vermilion Rebirth |
| 13 jade_immortal_realm | 96 % | 100 % | 63 % | 88 % | White Tiger Rend |
| 14 golden_palace_of_laws | 89 % | 50 % | 38 % | 100 % | Law of Measure |
| 15 throne_of_the_immortal_emperor | 93 % | 81 % | 50 % | 100 % | Sovereign's Answer |

Regression: `tests/balance.test.ts` (16 seeds, regions 3/6/9/12/15: fitted boss 17/67/33/33/50 %, geared 83–100 %).

### AI evaluation (`node tools/balance/ai_eval.ts --seeds 16`, tools/balance/out/ai_eval.md)

Player rules × enemy AI, fitted archetype on 45 nodes (an elite, the boss and the hardest normal node per region):
legacy × legacy 69 %, **new × legacy 70 %**, legacy × new 70 %, **new × new 70 %**. The new default preset wins
the same share overall; its gains are where finishing blows and the held ultimate matter (Sword Tomb boss
22 → 47 % at 32 seeds) and it loses nothing on farming nodes. The enemy pass (focus fire, element-aware technique
choice, ultimate timing) does not change a fight against a lone cultivator with a beast — the legacy AI already hit
the cultivator with its best art — and shows only where enemies have several elements or several real targets; a
first version that spent turns killing the spirit beast lost 10 points and was corrected (enemies no longer count a
beast as a kill worth a turn while the cultivator stands).

## Economy (after the 500-energy / 1.2-min regen change, 2026-11-01)

Income per day = a full bar plus a day of regeneration (1700 energy) spent on the region's battle nodes. Enhancement
`ilvl_cost` retuned from (ref 103, exp 1.14) to (ref 60, exp 1.5); refinement stones ×2.5 and scaled by item level.

| region | stones/day | set +10 (days) | set +15 (days) | refine one step (common, stones) |
|---|---|---|---|---|
| mortal_plains | 9.7k | 0.1 (fitted weapon: 1.5) | 0.4 | 281 |
| azure_bamboo_forest | 18k | 1.1 | 5.8 | 281 |
| blazing_mountain | 76k | 0.7 | 3.5 | 281 |
| frozen_lotus_valley | 116k | 0.8 | 4.1 | 303 |
| ancient_sword_tomb | 181k | 1.2 | 6.1 | 693 |
| demon_territory | 229k | 1.3 | 6.7 | 960 |
| celestial_mountains | 311k | 1.3 | 6.4 | 1255 |
| nine_heavens | 361k | 2.1 | 10.4 | 2361 |
| thunderclap_wastes | 457k | 2.0 | 10.0 | 2875 |
| sunken_dragon_sea | 508k | 2.1 | 10.7 | 3422 |
| starfall_desert | 615k | 3.1 | 15.4 | — |
| gate_of_ascension | 665k | 3.3 | 16.4 | — |
| jade_immortal_realm | 780k | 3.2 | 15.9 | — |
| golden_palace_of_laws | 830k | 3.4 | 16.9 | — |
| throne_of_the_immortal_emperor | 952k | 3.3 | 16.4 | — |

With the old curve the ×5 energy made +10 a 0.2–1.5-day affair and +15 one week at most; the journey run banked
866k unspent stones by day 20 in region 3. Regression: `tests/balance.test.ts` "economy".

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

Journey run (`tools/balance/journey.ts`, 1 seed, 120 days) found the Core Formation wall: the Core Condensing Pill needed
alchemy proficiency 600 while every recipe between 300 and 600 uses region 7–15 herbs, so a region-3 player (proficiency
≈ 300) could never form a core. Fixed: Core Condensing Pill proficiency 600 → 200 (foundation 150 → core 200 → regional
pills 120…600 by region 3…15), and the Merchant Pavilion now stocks Peach Blossom (12) and Crane Feather (18), the two
starter-pill herbs that only grew at region-1 gather spots on a 30–40 min cooldown.

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
