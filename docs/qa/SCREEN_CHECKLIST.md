# Screen checklist (overhaul pass, 2026-10-30)

How each screen was checked: opened in the running build with Playwright (`npm run test:browser` for the new-journey
tour, `npm run lab <scenario>` for mid-game states: `sweep`, `solo`, `elite`, `boss`, `party`, `multi`, `bossintro`,
`tribulation`, `defeat`, `waterfall`), screenshotted at 390 × 844 (and 360 × 640, 412 × 915, Large text by
`npm run test:ui`), compared side by side with its mockup, fixed, re-shot. "Buttons" means every control on the
screen is exercised by the tour or the lab and does what its label says.

Legend: ✔ matches its mockup / the art direction · ◐ close, small differences noted · mockup "—" = none, follows the
established language.

| Screen | Mockup | State checked | Result | Notes |
|---|---|---|---|---|
| Main menu (empty / continue) | main_menu | tour 01, 61 | ✔ | gold title, Continue card, key art |
| Prologue gate, trial, welcome card, senior sister | prologue, prologue_elder_wen, prologue_welcome, prologue_bai | tour 02–05 | ✔ | gold-framed dialogue; welcome card uses the sect emblem art |
| Cultivate (idle, burst, rate sheet, major sheet) | cultivation_screen, waterfall_active, meditation_waterfall | tour 06–09, lab waterfall | ✔ | meditating pill while a session runs |
| Character + stats sheet + slot sheet | character_screen, stat_details, equipment_compare | tour 10–13, lab sweep | ✔ | empty slots show a silhouette; Best button |
| Spirit Root sheet | spirit_root | tour 11 | ✔ | new: history, elements, rare opportunities |
| Inventory (bag, pills, depot) | inventory_icons, inventory_full | tour 14–15, 18 | ◐ | 20-slot pages instead of one long grid (owner's decision) |
| Sect map | sect_map | tour 16 | ✔ | sect emblem art on the banner |
| Sect location (each) | sect_locations | tour 17, lab sweep | ✔ | Journal activity in Your Quarters |
| Meditation Waterfall session (setup / active) | meditation_waterfall, waterfall_active | lab waterfall | ✔ | new feature |
| Mission Hall | mission_hall | tour 19, lab sweep | ✔ | fame beside the board title |
| NPC talk / chat / requests / ask / gifts | tang_talk, tang_chat, ask_about_her, gift_picker | tour 20–23 | ✔ | |
| Spar card / spar result | duel_spar, spar_result | tour 24, lab | ✔ | new result screen with the partner's reaction |
| Merchant Pavilion (goods / sell / rumours) | merchant_pavilion | tour 25–27 | ✔ | Rumours tab added |
| Scripture Pavilion | scripture_pavilion | tour 28 | ✔ | floors by rarity, manual rows |
| Spirit Forge enhance / refine / reforge / awaken / craft | forge_awaken, forge_refine, forge_reforge, forge_craft | tour 29–32, lab sweep | ✔ | painted tab icons |
| Alchemy Hall + result | alchemy_hall | tour 33–34, lab sweep | ✔ | |
| Proving Arena bracket | arena_bracket | tour 35, lab sweep | ✔ | |
| Quest Log / tracked / achievements | achievements | tour 36–38, lab sweep | ✔ | progress hero on achievements |
| Techniques + auto-battle | auto_battle | tour 39–40 | ✔ | rule rows show the technique and a condition chip |
| Spirit Beasts (empty, hatched, feed, evolve) | spirit_beasts | tour 41–46, lab sweep | ✔ | |
| Dao proposal | — | tour 47 | ✔ | |
| World regions | world_regions | tour 48, lab sweep | ✔ | Chinese name on its own line |
| Region map + node card | region_node_map, node_interactions | tour 49–50, lab sweep | ✔ | painted pins with names; generated regions renamed |
| Battle (solo, party, multi, elite warning, boss, manual) | battle_screen | tour 51–53, lab solo/elite/boss/party/multi/bossintro | ✔ | full redesign; intros, effects, cut-in, warnings |
| Victory | victory | tour 52, lab | ✔ | title over the scene, framed rewards |
| Defeat | defeat | lab defeat | ✔ | foe card, power check, ways to get stronger |
| Tribulation | tribulation | lab tribulation | ✔ | wave pips, lightning, "Tribulation passed" |
| Dungeon hub, tower, secret realm | dungeon_hub, secret_realm_map | tour 54–58, lab sweep | ✔ | |
| Celebrations (achievement, unlock, rank, root) | fame_milestone | tour 43, 56 | ✔ | gold frame |
| Settings | settings | tour 59 | ✔ | |
| Save slots | save_slots | tour 60 | ✔ | |
| Offline report / clock moved back | offline_gains, clock_moved_back | tour 62–63 | ✔ | |
| Rarity frames | rarity_frames | tiles everywhere | ✔ | 8 tiers, tile glow per rarity |

Automated: `npm run test:ui` → 0 errors at 360 × 640, 390 × 844, 412 × 915 and Large text (remaining warnings are
10–10.5 px captions and contrast estimates on titles over art). The tour exercises 60+ controls with assertions
(buy, sell, rumour, enhance, refine, reforge, craft, refine pills, feed, evolve, track, turn in, spar, fight, climb…).
