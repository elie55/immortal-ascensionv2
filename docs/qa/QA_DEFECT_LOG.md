# QA defect log

Severity: P0 data loss/crash/exploit/blocker · P1 broken core progression/combat/economy · P2 balance/systemic UX · P3 polish.
Evidence for balance items: `tools/balance/out/baseline.md` (before) vs `after.md` (after); repro commands given.

| # | Sev | Area | Defect | Root cause | Fix | Retest |
|---|---|---|---|---|---|---|
| D-01 | P1 | Combat | Freeze made the frozen unit effectively permanent: a frozen player never got another turn (`node tools/balance/trace.ts 4 fitted battle v` before fix: 4 skips, 0 player turns) | `status.freeze` modifier spd −100 % → speed clamped to 1; status ticks only on the holder's turn | freeze = skip turn + spd −25 % (`tools/gen/world.py`) | calibrate region 4 now converges (m 0.56); `tests/balance.test.ts` |
| D-02 | P1 | Combat | Stun-lock: two 30–40 % stun techniques kept any boss from acting (floor-100 Warden acted 3× in 51 rounds) | no diminishing returns on control | control immunity 2 turns after expiry (bosses 3), boss control chance ×0.5 (`combat_rules.status`) | trace shows bosses act every 2–4 rounds; `tests/combat.test.ts` |
| D-03 | P1 | Gear/Combat | Percentage stats scaled like flat stats: eva 96, crit 84, acc 190, spd 482 at region 15 → enemies never hit, player acted 15× more often | single `scale(L)` for all affixes; no combat caps | `bounded_stats` (gentle ilvl ramp), `combat_rules.caps`, speed compression `spd_exp 0.7` | `tests/gear-math.test.ts`, sim after tables |
| D-04 | P1 | Progression | Immortal Emperor tribulation unbeatable (0 % geared): spirit used `cp_base(16)` from the old formula (6.2 M cp) | table lookup fell back to `130·2.05^(n−1)` | explicit `CP_BASE[16]`; tribulation spirit 1.5×, bolts 25 % | after: fitted 50 %, geared 75 % |
| D-05 | P1 | Tower | Region-9 player cleared all 100 floors (power 324 k) | tower scaling left enemy speed at 10–30 | spd × mult^0.45; growth 1.07 → 1.091; milestones 75/100 | stall ladder 18 → 98 across regions |
| D-06 | P1 | Balance | Enemy curve diverged from the player curve (ratio fitted CP / enemy cp from 6.0 at region 1 to 0.10 at region 15) | `cp_base = 130·2.05^(n−1)` vs player growth ≈ ×1.45/region | per-region `CP_BASE` derived by calibration | normals 84–100 % fitted everywhere |
| D-07 | P1 | Balance | Boss nodes: first wave was the strongest normal + the elite; fitted lost before the boss (0 % in 11 regions) | wave composition | pre-wave = two weakest normals; `BOSS_MULT` per region | bosses 25–88 % fitted, 100 % geared |
| D-08 | P1 | Balance | Tribulations unwinnable from Soul Transformation on (bolts = 90 % spirit atk × 3–7 per round ≈ 80 % max HP per round) | hazard numbers | bolt 25 %, 2–4 bolts, ×1.0→2.0, spirit 1.5× | 50–100 % fitted |
| D-09 | P1 | Economy | Full set +10 took 178 days of farming in region 1 and 6 days in region 15 | enhancement stones flat per rarity while income grows ×100 | `ilvl_cost` factor `(L/103)^1.14`; Spirit Enhancing Stones sold at the Pavilion (fame 800, 10/day) | 1–7.5 days every region |
| D-10 | P2 | Balance | Tournaments trivial (8/8 full runs for a fitted entrant even at the core bracket) | round CPs below region normals; duelist speed 12+log2 | round CPs ×1.4–2; duelist spd follows player curve | outer 8/8, inner 3/8, core 0/8 for fitted (geared intended) |
| D-11 | P2 | Balance | Mega dungeons 0 % for geared + companion at regions 10 and 14 | mega boss 4×cb with enrage 1.6 + charged ×2 one-shots | boss 3.2×, enrage 1.3, lighter waves | 25–100 % geared |
| D-12 | P2 | Content | Frozen Lotus Valley normals too hard for the enemy kit (freeze 35 %) | region-specific kit | freeze chance 0.2; `CP_BASE[4]` 1300 | 84 % fitted |
| D-13 | P2 | Balance | Cultivation pacing: 253 h idle to Immortal Emperor | `minutes_for_stage1` | late realms stretched (provisional) | 540 h idle / 170 h optimised |
| D-14 | P3 | Content | `tech.active.iron_wall_stance` and `tech.ult.soul_devouring_art` have sources the availability model did not see (tower milestone; Demon Territory) | sim heuristic | tower milestones mapped by floor power; soul_devouring_art left as is | sim `avail techs` list |

Open (not fixed in this pass): see `QA_RELEASE_READINESS_REPORT.md`.
