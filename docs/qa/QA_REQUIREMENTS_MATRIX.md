# Requirements → test matrix

Status: **VERIFIED** (implemented, automated test + runtime check) · **DEFECTIVE** · **PARTIAL** · **MISSING** · **BLOCKED** · **NOT TESTED**.
Spec section numbers refer to `Immortal_Ascension_Specifications.txt`. Evidence columns name tests (`tests/*.ts`), the browser tour (`tests/browser/screens.ts`) and sim outputs.

| Spec | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 3 | Visual identity per mockups, five tabs, gold/glass UI | PARTIAL | tour screenshots; art still rendering; animations/audio out of scope |
| 4 | Main menu, 4 save slots, continue/new, settings | VERIFIED | `save.test.ts`, tour |
| 5 | Prologue VN, choices, token, Elder Wen/Bai | VERIFIED | tour (4 scenes, choice affinity) |
| 6 | Cultivation: 15 realms × 9 stages, qi rate factors, minor/major breakthroughs, pills, offline cap | VERIFIED | `engine-cultivation.test.ts`; pacing provisional (`BALANCE_MODEL.md`) |
| 6 | Offline rewards screen, clock moved back | VERIFIED | tour `offline-report`, `clock-moved-back` |
| 7 | Spiritual roots, root transform events | PARTIAL | roots in stats; transform via events implemented (`nodes.ts`), not covered by a test |
| 8 | Character stats (19 attributes), CP, stat sheet | VERIFIED | `stats.ts`, `balance.test.ts` CP band; caps added this pass |
| 9–10 | Combat: speed gauge, elements, crits, statuses, boss phases, auto priorities, manual, speeds, defeat advice | VERIFIED (engine) / PARTIAL (speeds 1×–3× only affect animation timing; no race test) | `combat.test.ts`, tour battle auto+manual |
| 11 | Adventure regions (15), node maps, gather/chest/event/hidden/story nodes | VERIFIED | `delves.test.ts`, tour region map |
| 12 | Resource/challenge dungeons, secret realms, Endless Tower, mega dungeons, Divine only from megas | VERIFIED | `delves.test.ts`, validator divine rule, sim dungeon columns |
| 13 | Eight slots, dual rings, rarities, sets | VERIFIED | `gear-math.test.ts`, `sect.test.ts`, character screen |
| 14 | Forge: enhance +1..+15, refine (≤ Mythic), reforge with locks, awaken, craft | VERIFIED | `sect.test.ts`; cost curve retuned (D-09) |
| 15 | Items & inventory, lock, sell, filters | VERIFIED / PARTIAL | inventory tour; batch actions not implemented |
| 16 | Techniques, mastery, loadout, Scripture Pavilion | VERIFIED | `sect.test.ts`, techniques screen |
| 17 | Spirit beasts: eggs, hatch, feed, train, evolve, bond, active | VERIFIED | `beasts.test.ts`, tour |
| 18 | Alchemy recipes, furnace, proficiency, success | VERIFIED | `sect.test.ts`, tour |
| 19–20 | Sect locations, fame, 6 ranks, promotions | VERIFIED | `sect.test.ts` rank test; Inner Sect Peak unlock |
| 21 | Tournaments (brackets, saved progress, retry rules) | VERIFIED | `sect.test.ts`; difficulty retuned (D-10) |
| 22–23 | NPC relationships, gifts, topics, Dao companions | VERIFIED | `sect.test.ts`, `beasts.test.ts` |
| 24–25 | Quests (all objective types), achievements, story triggers | VERIFIED | `sect.test.ts`, progression sweep |
| 26 | Save/load, migrations v1→v5, corruption recovery, export/import | VERIFIED | `save.test.ts` |
| 27 | Art pipeline from database | PARTIAL | pipeline works; batch rendering in progress on the owner's PC |
| 28 | Animations | MISSING (deferred by owner) | — |
| 29 | Audio | MISSING (deferred by owner) | — |
| 30 | Android packaging (Capacitor) | NOT TESTED | config present; needs the PC |
| QA 21 | Global balancing model & simulations | VERIFIED (provisional targets) | `BALANCE_MODEL.md`, `BALANCE_SIMULATION_RESULTS.md`, `balance.test.ts` |
