# Release readiness — balance pass (build 0.3.x, commit after this pass)

**Scope of this pass:** global balancing across all 15 realms with the QA method (baseline → defects → fixes → re-measure),
plus the combat and gear defects the simulation exposed. Everything else is reported as found, not re-tested.

## Coverage
- Unit/integration: 104 tests passing (`npm test`), content validator OK, browser tour 26 checks passing at 390×844 with no console errors.
- Simulation: 15 regions × 3 archetypes × every battle node, dungeons, tribulations, tower ladder; economy and cultivation tables.
- Not covered: Android runtime, performance on devices, animation/audio (not implemented), rapid-tap/interruption tests in the UI.

## Fixed in this pass (details in `QA_DEFECT_LOG.md`)
P1: freeze lock (D-01), stun-lock (D-02), percentage-stat scaling and missing caps (D-03), unbeatable last tribulation (D-04),
tower scaling (D-05), enemy curve (D-06), boss pre-waves (D-07), tribulation damage (D-08), enhancement economy (D-09).
P2: tournaments, mega bosses, Frozen Lotus Valley kit, cultivation pacing (provisional).

## Open
| Sev | Item |
|---|---|
| P2 | Balance numbers are simulator-derived with 8–16 seeds (±15 pt); needs human playtesting of regions 1–4 before public release |
| P2 | Idle-only players (no gear farming) stall at region 3; intended, but the game should tell them (defeat advice already says "equip gear") |
| P2 | Save compatibility: gear rolled before this pass keeps its old (higher) percentage affix values until re-rolled; caps make this harmless in combat |
| P3 | Art: many icons/battle sprites still placeholders until the render queue finishes |
| — | Android packaging, animations, audio: pending by owner's plan |

## Go / no-go
Internal playtest build: **GO** (core loop, saves and all systems pass automated checks; balance within provisional targets).
Public release: **NO-GO** until Android runtime tests, art completion and a human balance pass on the first four regions.
