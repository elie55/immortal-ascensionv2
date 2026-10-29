# Balance model

Machine-readable inputs live in content; this page states the formulas, the levers and the **provisional
targets** the simulator checks. Targets are proposals measured against, not designer canon — change them
here and in `tests/balance.test.ts` together.

## Formulas (where they live)

| System | Formula | Source of truth |
|---|---|---|
| Qi per second | `qi(realm, stage 1) / (60 · minutes_for_stage1[realm])` × root × method × rank × location × beast × dual cultivation × buffs | `cultivation_rules.json`, `src/engine/cultivation.ts` |
| Qi for a stage | `realm.qi.base · stage_growth^(stage−1)` | `realms.json` |
| Character stats | base + Σ realm_bonus + Σ stage_growth·steps + root + elixirs + method·mastery + passives + gear + sets + beast bond + buffs + title | `src/engine/stats.ts` |
| Combat Power | Σ (stat − baseline) · cp_weights | `cultivation_rules.cp_weights` |
| Gear flat stat | `value · (1 + 0.12L + 0.0025L²) · rarity_mult · roll` | `equipment/rules.json`, `schema/gear-math.ts` |
| Gear percentage stat | `value · (1 + L/150) · rarity_mult · roll` (`bounded_stats`) | same |
| Enhancement stones | `stones_base[level] · rarity_cost_mult · (L/103)^1.14` | `enhancement.json`, `crafting.ts` |
| Hit, crit, caps | hit = clamp(floor, 1, (acc − eva)/100); every percentage stat is capped in combat (`combat_rules.caps`) | `combat/battle.ts` |
| Turn order | gauge += `1 + (spd − 1)^0.7 · 10^0.3` per tick (compressed speed) | `combat_rules.caps.spd_exp` |
| Control | stun/freeze/silence → after expiry `control_immunity_turns` (2, bosses 3) of immunity; bosses take control at ×0.5 chance | `combat_rules.status` |
| Enemy stats | hp 3.2·cp, atk 0.28·cp, def 0.13·cp, sp_power 0.2·cp, spd `ENEMY_SPD[region]`; cp = `CP_BASE[region]` × role multiplier | `tools/gen/regions.py` |
| Role multipliers | normal 1.0–1.3, special 1.5, elite 1.6, region boss `BOSS_MULT[region]` (0.8–2.0), resource-dungeon boss 1.2, challenge boss 1.5, secret-realm boss 3.5, mega boss 3.2, tribulation spirit 1.5·cp_base(next) | same |
| Tower floor | power = 400 · 1.091^(floor−1), split over 1–3 pool enemies scaled to it (spd × mult^0.45) | `places.py`, `delves.ts` |
| Tribulation | `bolt_power` 25 % of the spirit's attack per bolt; bolts 2–4 per wave, ×1.0→2.0; survive `waves · 3` rounds | `combat_rules.tribulation`, `regions.py` |

## Archetypes (tools/balance/sim_lib.ts)

| Archetype | Realm/stage | Gear | Techniques | Beast | Meaning |
|---|---|---|---|---|---|
| bare | region's first realm, stage 5 | starting gear | starting technique | none | reference only (cultivation alone) |
| idle | region's last realm, stage 9 | starting gear | best obtainable by then, mastery 3 | none | cultivates and buys techniques, never farms gear |
| fitted | first realm, stage 5 | previous region's band, that band's second rarity, +4 | best obtainable, mastery 3 | YunYun juvenile 10 | **the reference player** entering the region |
| geared | last realm, stage 9 | this region's band, band's high rarity, +10 | best obtainable, max mastery, best method, dual root | YunYun adult 25 | an optimised player finishing the region |

"Obtainable by region n" is derived from sources (shops by fame/rank, quests by prerequisite region, loot
by the enemies' region, tournaments by rank, tower milestones by floor power).

## Provisional targets (measured by `node tools/balance/sim.ts`)

| Metric | Target | Why |
|---|---|---|
| fitted vs normal node | 85–100 % win, battles 5–20 rounds | farming should be reliable but not free |
| fitted vs elite node | 50–100 % | elites are the "come back a bit stronger" content |
| fitted vs region boss (first try) | 25–75 %; geared ≥ 90 % | bosses gate the main quest; a few attempts with better gear |
| fitted vs resource dungeon | ≥ 70 % | daily material loop |
| fitted vs challenge dungeon | 25–100 % | optional, HP carries over |
| geared + Dao companion vs mega dungeon | 25–100 % | hardest content, only Divine source |
| fitted stage 9 vs tribulation | 30–95 %; geared ≥ 70 % | failure costs 30 % Qi + cooldown, must stay beatable |
| tower stall floor (fitted) | rises every region; floor 100 ≈ geared region 14–15 | long-term ladder |
| Combat Power | fitted CP within 0.75–2× of the region's normal cp | CP informative, not a guarantee |
| full set +10 | 1–10 days of that region's stone income | upgrades need choices, not endless farming |
| cultivation | realm 1 ≈ 3 h idle, realm 15 ≈ 100 h idle; ≈ 540 h total idle, ≈ 170 h optimised | long-term pacing (provisional, owner's call) |

## Levers, in order of preference

1. `CP_BASE`, `BOSS_MULT`, `ENEMY_SPD` in `tools/gen/regions.py` (then `python3 tools/gen/regions.py`).
2. Role multipliers and wave compositions in `regions.py`.
3. `combat_rules.json` caps / tribulation; `equipment/rules.json` scaling; `enhancement.json` `ilvl_cost`.
4. `minutes_for_stage1` and realm `qi` in content.

Re-derive tables with `node tools/balance/calibrate.ts [--kind boss --target 0.45]` after changing player power
(gear rules, realms, techniques); re-run `node tools/balance/sim.ts` and the balance tests.
