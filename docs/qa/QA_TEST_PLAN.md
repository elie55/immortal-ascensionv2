# QA test plan

| Layer | Command | What it proves | Status |
|---|---|---|---|
| Content integrity | `npm run validate` (also in CI) | every id resolves, every item has a source and a use, rarity leaks, Divine only from megas, quests completable, art blocks present | 104 rules, passing |
| Deterministic unit | `npm test` → `tests/engine-cultivation.test.ts` (16) | qi rate, stages, bank cap, offline cap/efficiency/clock-back, breakthroughs, energy, buffs, Game trackers | passing |
| | `tests/combat.test.ts` (16) | turn order, damage/element/def, statuses, boss phases, hazards, auto rules, manual mode, ultimate, determinism | passing |
| | `tests/gear-math.test.ts` (5) | rarity ordering invariants, ilvl monotonicity, refinement, CP | passing |
| | `tests/sect.test.ts` (17) | quests, achievements, ranks, story triggers, shops, forge, alchemy, gifts/topics, tournaments | passing |
| | `tests/beasts.test.ts` (10) | eggs/hatching, feeding, bond, evolution, Dao companions, save migration v3→v4 | passing |
| | `tests/delves.test.ts` (4) | tower floors/milestones, secret realm runs | passing |
| | `tests/save.test.ts` (10) | atomic save/backup, corrupt recovery, migrations, export/import | passing |
| | `tests/balance.test.ts` (6) | provisional balance targets on sampled regions (normals, bosses, CP, tribulations, tower, economy) | passing |
| Simulation | `node tools/balance/sim.ts` / `calibrate.ts` / `trace.ts` | full 15-region tables, calibration, battle traces | run on demand; outputs in `tools/balance/out/` |
| Browser (Playwright, 390×844, touch) | `npm run test:browser` | new journey → prologue → every tab and screen (sect systems, beasts, tower, realm, battle auto+manual, settings, save slots, offline, clock-back); console errors fail the run; screenshots in `.tmp/screens/` | 26 checks passing |
| Android | — | APK/AAB packaging and device runtime | NOT TESTED (needs the owner's PC with Android Studio; Capacitor config present) |
| Manual visual | screenshot contact sheets vs `refs/mockups` | mockup fidelity, art integration | reviewed per feature by the owner; art still rendering |

Fixtures used by tests: fresh account (`newGameState`), rich/strong (`strong()` in delves tests), near-tribulation (`makePlayer(..., 9)`), corrupted save (`save.test.ts`), returning offline player (`engine-cultivation.test.ts`, tour), archetypes in `tools/balance/sim_lib.ts`.

Not yet covered: rapid repeated taps / interrupted transactions in the browser, text scaling and other viewport sizes, reduced-motion review, audio (not implemented), performance profiling on devices.
