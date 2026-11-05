# Immortal Ascension — Game Specification

*Offline Android xianxia cultivation RPG · portrait 9:16 · single player · no monetization*

| | |
|---|---|
| Document | Complete specification of the game as designed **and as built** |
| Date | 5 November 2026 (code at commit `951b545`, branch `main`) |
| Origin | The owner's specification (`Immortal_Ascension_Specifications.txt`, sections 1–34) plus every design decision taken since, recorded in `docs/` |
| Numbers | Every table of content and rules in this document is generated from the content database (`content/`), not typed by hand |

**Status marks used throughout**

| Mark | Meaning |
|---|---|
| ✅ | Built, wired into the game and covered by automated tests or the browser tour |
| 🟡 | Built in part, or built but not yet verified on the target (phone / APK) |
| ⏳ | Specified, not built yet |

---

## Contents

1. [Game overview](#1-game-overview)
2. [Visual identity and navigation](#2-visual-identity-and-navigation)
3. [Story](#3-story)
4. [Cultivation](#4-cultivation)
5. [Heavenly tribulations](#5-heavenly-tribulations)
6. [Character attributes and Combat Power](#6-character-attributes-and-combat-power)
7. [Elements and spiritual roots](#7-elements-and-spiritual-roots)
8. [Combat](#8-combat)
9. [Victory and defeat](#9-victory-and-defeat)
10. [Adventure mode](#10-adventure-mode)
11. [Dungeons, tower and secret realms](#11-dungeons-tower-and-secret-realms)
12. [Equipment](#12-equipment)
13. [Spirit Forge](#13-spirit-forge)
14. [Items and materials](#14-items-and-materials)
15. [Cultivation methods and techniques](#15-cultivation-methods-and-techniques)
16. [Spirit beasts](#16-spirit-beasts)
17. [Alchemy](#17-alchemy)
18. [The Azure Cloud Sect](#18-the-azure-cloud-sect)
19. [Sect Fame and ranks](#19-sect-fame-and-ranks)
20. [Tournaments](#20-tournaments)
21. [NPCs, relationships, gifts and Dao companions](#21-npcs-relationships-gifts-and-dao-companions)
22. [Quests](#22-quests)
23. [Achievements and titles](#23-achievements-and-titles)
24. [Economy](#24-economy)
25. [Main menu, saves and settings](#25-main-menu-saves-and-settings)
26. [Art, animation and audio](#26-art-animation-and-audio)
27. [Balance](#27-balance)
28. [Content targets](#28-content-targets)
29. [Technical specification](#29-technical-specification)
30. [Status against the original specification](#30-status-against-the-original-specification)

---

## 1. Game overview

| | |
|---|---|
| Title | Immortal Ascension (仙途) |
| Platform | Android (Capacitor packaging of a web build); playable in the browser at the GitHub Pages build |
| Genre | Xianxia cultivation RPG · idle progression · PvE combat · adventure · character collection |
| Orientation | Portrait 9:16, designed for 360×640 to 412×915 phones |
| Mode | Fully offline, single player. No servers, accounts, ads or purchases |
| Art style | Premium anime xianxia: painterly environments, elegant characters, glowing effects, ornate blue-and-gold interface |

### Core concept

The player is **Lin Xueyao** (林雪瑶), a village girl with a faint mortal root who climbs the Thousand Steps and enters
the **Azure Cloud Sect** as an Outer Disciple. From Qi Condensation stage 1 she cultivates through **15 great realms of
9 stages**, gears up, learns techniques, raises spirit beasts, befriends (and may take as Dao companions) the people of
the sect, explores **15 regions**, clears dungeons, survives heavenly tribulations and finally sits on the Throne of the
Immortal Emperor.

### Core loop

```
Cultivate (Qi, live and offline) ─► Break through (stages, realms, tribulations)
        ▲                                   │
        │                                   ▼
Upgrade gear, techniques, beasts ◄── Fight PvE (map nodes, dungeons, tower, tournaments)
        ▲                                   │
        └──── Earn rewards (stones, materials, gear, Fame, Contribution) ◄┘
                                            │
                                 Unlock new regions and sect areas
```

Idle cultivation sets the long-term clock (each realm takes longer); active play (fights, crafting, quests) supplies
everything the breakthroughs and the next region require. Neither replaces the other: a realm can't be entered without
its pill, crystals and (sometimes) tribulation, and a region can't be entered without the realm.

### Session structure

- **Today board** — five daily tasks; four of them claim a reward (§24.5).
- **Energy** — 500 max, 1 point every 1.2 min (≈ 1,200 a day plus the bar) spent on map fights, dungeons, gathering
  and beast training (§24.2).
- **Offline** — up to 12 h of cultivation at 80 % efficiency is credited on return, with a sweep option for banked
  energy (§4.4, §10.6).

---

## 2. Visual identity and navigation

### 2.1 Art direction ✅

- Palette: deep navy, royal blue, midnight purple, warm gold, jade green, soft cyan, pale pink.
- Panels: dark blue translucent glass with an inner light and gold corner frames; ornamental dividers; blur only on the
  header, sub-bars, sheets and modals.
- Type: **Noto Sans** (text), **Marcellus** (buttons, chips, section titles — gold, uppercase), **Cinzel** (titles),
  **Ma Shan Zheng** (brush calligraphy), **Cormorant Garamond**; tabular numerals everywhere. All OFL, bundled.
- Rarity has its own frame and glow on every tile (8 tiers), and **each rarity of a gear family has its own design**
  (not just a frame colour).
- The approved mockups in `refs/mockups/` are binding; `docs/qa/SCREEN_CHECKLIST.md` records each screen against its
  mockup.

### 2.2 Navigation ✅

Five persistent tabs (glowing when selected, painted icons, badge counters):

| Tab | Root screen | Reached from it |
|---|---|---|
| **Cultivate** | Realm, stage pips, meditating figure, Breakthrough button, method card with Qi/s, Today board | Alchemy Hall, Spirit Beasts, Quest Log, Settings, Qi rate sheet, breakthrough ceremony, tribulation preparation |
| **Adventure** | World regions (painted cards) | Region node map + node card · Dungeons hub (tabs: Regions · Dungeons · Challenge · Secret Realms · Mega Dungeons) · Endless Tower · secret realm map · Sweep |
| **Character** | Equipment sockets around the figure, Combat Power, attributes | Stats sheet, Spirit Root sheet, slot sheet and compare, Techniques, Auto-battle rules |
| **Inventory** | Bag (pages of 24 slots, category tabs, rarity filter, sort, overflow pouch) | Item details, depot (Storage Chest) |
| **Sect** | Floating-island sect map with location plaques | Each location (§18): Mission Hall, Scripture Pavilion, Merchant Pavilion, Forge, Alchemy, Garden, Waterfall, Arena, Quarters… |

A global stack holds the main menu, story scenes and battles. Overlays: modals, bottom sheets, **peeks** and toasts.

**Header** (all tabs, pinned to the top, full width): portrait, name, rank/region line, Combat Power, energy, spirit
stones. **Tracked quest chip** under it: one line, *Go ▸* takes the player to the place where the objective is done, or
to the turn-in when it is complete (§22.3).

### 2.3 Interaction conventions ✅

- **Peeks (long-press tooltips)** — hold any of the following for 0.43 s (right-click on desktop) to get a card beside
  it; any tap closes it, and the tap that ends a long press never triggers the element:
  technique tiles (description, power, cost, cooldown, target, mastery, applied statuses, and **in battle the live
  damage / heal / shield estimate against the foes on the field and element advantage**), the Ultimate and Surge
  buttons (even while unusable), status icons (turns, stacks, modifiers), units on the field and their cards (HP, SE,
  speed, arts, signature, weaknesses, wind-up), victory / sweep loot tiles, inventory / depot / shop tiles (what the item
  is for: recipes, breakthroughs, furnaces, enhancement…), reward tags, enemy chips on node cards (stats, signature,
  drops), alchemy recipes (ingredients owned, odds), technique rows.
- **One-time tips** — taught once per device: the first telegraphed attack, Surge ready, the first tempo shift, each boss
  signature the first time it fires, the hold gesture; outside battle the first Contribution, the first Dao crystal,
  the first pouch overflow.
- **First-visit coach bubbles** under each screen's title; a **?** button opens each screen's help.
- **Toasts**: one at a time above the nav bar, repeats merged ("+N"), milestones in gold, held during battles.
- **Celebrations** (full-screen, queued): rank promotion, unlocks, achievements, root awakening, realm reached.
- Every visible button works; disabled controls say why.

### 2.4 Accessibility ✅

Large text mode, reduced motion (no ambient sway, no flashes; pose changes still happen), animation quality
Low/Medium/High, screen shake toggle, damage numbers toggle, minimum tap sizes checked by the UI audit (0 errors at
360×640, 390×844, 412×915 and large text).

---

## 3. Story

### 3.1 Presentation ✅

Illustrated visual novel (`screens/story.ts`): full-screen CG per scene, place chip, chapter header, narration boxes
with gold corners, dialogue with emblem nameplates and speaker figures, character introductions (tag, vertical Chinese
name, titles, element chip, affinity chip), questions with numbered answers (壹 贰 叁) and the asker's reply, lesson
cards, unlock cards, typing text. Controls: **Auto**, **Skip** (stops at questions, which set affinities), **Dialogue
history**. Toasts wait until the scene ends.

### 3.2 Prologue — *The Path Begins* ✅

| Scene | Content |
|---|---|
| The Entrance Gate | Lin among hundreds of applicants at the Thousand Steps |
| The Elder's Trial | Elder Wen asks three moral questions; each answer moves her affinity (never blocks progress) |
| Welcome | Outer Disciple rank, the sect hub, Azure Cloud Breathing and Elder Wen's token |
| Senior Sister | Bai Lingshuang's introduction (Frost Sword instructor, Inner Disciple) |
| First Method | Elder Feng at the Scripture Pavilion |
| First Sword Art | Bai's lesson: a practice fight against a Training Construct (three casts of Azure Strike, no loot, HP restored) |

### 3.3 Continuing story 🟡

21 scenes: prologue 6, *Chapter I · The Azure Bamboo Forest*, *Side Story · Tang's Caravan*, and one *Journey* scene
per region 3–15 (triggered on entering the region). Scenes trigger on quest completion or acceptance, realm reached,
region entered and affinity level. Regional NPCs (Old Kang, Hermit Shuang, Blind Swordsmith Yu, Defector Lian, …) give
each region a face. **Open:** the main story after region 2 is thin (arrival + sovereign per region); a written arc per
realm/region is still to come.

---

## 4. Cultivation

### 4.1 Realms ✅

15 great realms × 9 stages. The Qi needed for a stage is `qi.base · stage_growth^(stage − 1)`.

| # | Realm | 中文 | Qi stage 1 | ×/stage | Qi for stage 9 | Live min/stage 1 | Major breakthrough needs | Tribulation | Success |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Qi Condensation | 炼气 | 120 | 1.35 | 1324 | 5 | — (start) | — | 100 % |
| 2 | Foundation Establishment | 筑基 | 4000 | 1.32 | 36.9k | 8 | Foundation Pill ×1 | — | 100 % |
| 3 | Core Formation | 金丹 | 60k | 1.3 | 489.4k | 12 | Core Condensing Pill ×1, Bamboo Dragon Scale ×3 | Core Formation Tribulation | 90 % |
| 4 | Nascent Soul | 元婴 | 900k | 1.28 | 6.5M | 18 | Dao Insight Crystal ×2, Frost Lotus Pill ×1 | — | 85 % |
| 5 | Soul Transformation | 化神 | 12M | 1.27 | 81.2M | 25 | Dao Insight Crystal ×3, Sword Marrow Pill ×1 | Soul Transformation Tribulation | 80 % |
| 6 | Spirit Severing | 炼虚 | 150M | 1.26 | 952.9M | 34 | Dao Insight Crystal ×4, Demon-Purge Pill ×1 | — | 85 % |
| 7 | Dao Integration | 合体 | 1.8B | 1.25 | 10.7B | 45 | Dao Insight Crystal ×5, Celestial Peach Pill ×1 | — | 85 % |
| 8 | Tribulation Transcendence | 渡劫 | 20B | 1.25 | 119.2B | 60 | Dao Insight Crystal ×6, Star-Dew Pill ×1 | Great Heavenly Tribulation | 80 % |
| 9 | Mahayana | 大乘 | 220B | 1.24 | 1.2T | 78 | Dao Insight Crystal ×7, Thunder-Tempering Pill ×1 | — | 85 % |
| 10 | Immortal Ascension | 飞升 | 2.4T | 1.24 | 13.4T | 100 | Dao Insight Crystal ×8, Dragon Marrow Pill ×1 | Ascension Tribulation | 80 % |
| 11 | Earth Immortal | 地仙 | 26T | 1.23 | 136.2T | 125 | Dao Insight Crystal ×9, Meteor Core Pill ×1 | — | 85 % |
| 12 | Heavenly Immortal | 天仙 | 280T | 1.23 | 1.5e15 | 155 | Dao Insight Crystal ×10, Phoenix Rebirth Pill ×1 | — | 85 % |
| 13 | Golden Immortal | 金仙 | 3.0e15 | 1.22 | 1.5e16 | 190 | Dao Insight Crystal ×11, Immortal Peach Pill ×1 | Golden Immortal Tribulation | 80 % |
| 14 | Immortal King | 仙王 | 3.2e16 | 1.22 | 1.6e17 | 230 | Dao Insight Crystal ×12, Golden Law Pill ×1 | — | 85 % |
| 15 | Immortal Emperor | 仙帝 | 3.4e17 | 1.21 | 1.6e18 | 275 | Dao Insight Crystal ×13, Emperor Ascension Pill ×1 | Emperor's Tribulation | 80 % |

Realm and stage bonuses are added to the character's base stats:

| Realm | On entering (realm_bonus) | Per stage (stage_growth) |
|---|---|---|
| Qi Condensation | hp +200, atk +30, def +20, crit +0.5 | hp +40, atk +6, def +4, spd +1, sp_power +8, sp_energy +5 |
| Foundation Establishment | hp +800, atk +120, def +80, crit +1 | hp +160, atk +24, def +16, spd +1, sp_power +32, sp_energy +10 |
| Core Formation | hp +1800, atk +270, def +180, crit +1.5 | hp +360, atk +54, def +36, spd +2, sp_power +72, sp_energy +15 |
| Nascent Soul | hp +3200, atk +480, def +320, crit +2 | hp +640, atk +96, def +64, spd +2, sp_power +128, sp_energy +20 |
| Soul Transformation | hp +5000, atk +750, def +500, crit +2.5 | hp +1000, atk +150, def +100, spd +2, sp_power +200, sp_energy +25 |
| Spirit Severing | hp +7200, atk +1080, def +720, crit +3 | hp +1440, atk +216, def +144, spd +3, sp_power +288, sp_energy +30 |
| Dao Integration | hp +9800, atk +1470, def +980, crit +3.5 | hp +1960, atk +294, def +196, spd +3, sp_power +392, sp_energy +35 |
| Tribulation Transcendence | hp +12800, atk +1920, def +1280, crit +4 | hp +2560, atk +384, def +256, spd +3, sp_power +512, sp_energy +40 |
| Mahayana | hp +16200, atk +2430, def +1620, crit +4.5 | hp +3240, atk +486, def +324, spd +4, sp_power +648, sp_energy +45 |
| Immortal Ascension | hp +20000, atk +3000, def +2000, crit +5 | hp +4000, atk +600, def +400, spd +4, sp_power +800, sp_energy +50 |
| Earth Immortal | hp +24200, atk +3630, def +2420, crit +5.5 | hp +4840, atk +726, def +484, spd +4, sp_power +968, sp_energy +55 |
| Heavenly Immortal | hp +28800, atk +4320, def +2880, crit +6 | hp +5760, atk +864, def +576, spd +5, sp_power +1152, sp_energy +60 |
| Golden Immortal | hp +33800, atk +5070, def +3380, crit +6.5 | hp +6760, atk +1014, def +676, spd +5, sp_power +1352, sp_energy +65 |
| Immortal King | hp +39200, atk +5880, def +3920, crit +7 | hp +7840, atk +1176, def +784, spd +5, sp_power +1568, sp_energy +70 |
| Immortal Emperor | hp +45000, atk +6750, def +4500, crit +7.5 | hp +9000, atk +1350, def +900, spd +6, sp_power +1800, sp_energy +75 |

### 4.2 Qi rate ✅

```
base rate (Qi/s) = Qi(realm, stage 1) / (60 · minutes_for_stage1[realm])
rate = base · root × method × rank × location × Π buffs × (1 + beast cultivation bonus) × Dao dual cultivation (×1.1)
```

- `minutes_for_stage1` (live minutes for the first stage of each realm, idle): 5, 8, 12, 18, 25, 34, 45, 60, 78, 100,
  125, 155, 190, 230, 275.
- Method mastery adds to its multiplier while cultivating.
- Location multipliers: sect 1.0, Meditation Waterfall 1.25, Frozen Lotus Valley 1.35, Inner Sect Peak 1.4.
- The rate is shown on the Cultivate screen; tapping it opens the breakdown by factor.
- Qi banks up to the end of the current realm plus one stage of the next (`qi_bank_extra_stages: 1`).

**Pacing (simulated, provisional):** realm 1 ≈ 3.3 h idle / 1 h optimised … realm 15 ≈ 100 h idle / 31 h optimised;
≈ 540 h idle in total (≈ 170 h optimised). The realm Qi curve is the owner's lever for game length.

### 4.3 Breakthroughs ✅

- **Minor** (stage → stage + 1): costs the stage's Qi, always succeeds, can be chained ("Break Through ×N"); a burst
  animation (qi spiral, ring of light, brush 突破, the stage turning over, gains rising).
- **Major** (stage 9 → next realm): Qi + the realm's items (pills and Dao Insight Crystals, table above) + its
  tribulation when it has one. Success chance = `success_base` + pill bonuses (cap +40 %). Failure keeps the realm and
  costs 30 % of the stage's Qi; the items are consumed. Presented as a **full-screen ceremony**: realm seals,
  requirement talismans with *Get it ›* / *Face it ›* / *Go ›* links, success ring, gains, hold-to-break-through; a
  light pillar with the realm in brush on success.
- Entering Foundation Establishment awakens a single root into its dual form (§7).

### 4.4 Offline cultivation ✅

- Credited on return: up to **12 h**, at **80 %** of the live rate, from at least 60 s away. Timed buffs are integrated
  over the part of the absence they covered.
- **"While you were away"** report: time away and time counted, Qi gained, stage progress, stages ready (Break
  Through ×N from the report), sessions and boosts that ran, eggs waiting, and an **energy banked · Sweep** shortcut.
- **Clock guard**: if the device clock is earlier than the last time the game saw it, nothing is credited and the
  "Your clock moved back" screen explains it; in-session ticking uses a monotonic timer so changing the clock mid-session
  creates no Qi.

### 4.5 Meditation Waterfall sessions ✅

Spirit stones buy a timed **+50 % Qi** session (1 stone/min, 15-minute steps, minimum 15 min; longest 45 min, 1 h at
1,000 Fame, 2 h at 2,000 Fame). It keeps running while the player does other things (a "Meditating" pill on Cultivate)
and can be ended early without refund.

---

## 5. Heavenly tribulations

### 5.1 Encounters ✅

Six realms are gated by a tribulation:

| Tribulation | Gates realm | Spirit | Waves (bolts × damage) | On failure |
|---|---|---|---|---|
| Core Formation Tribulation | Core Formation | Tribulation Thunder Spirit | 3×1 Metal · 4×1.4 Metal · 5×2 Metal | −30 % Qi, retry in 120 min |
| Soul Transformation Tribulation | Soul Transformation | Soul Transformation Tribulation Spirit | 2×1 Metal · 2×1.2 Metal · 3×1.4 Metal · 3×1.6 Metal | −30 % Qi, retry in 180 min |
| Great Heavenly Tribulation | Tribulation Transcendence | Great Heavenly Tribulation Spirit | 2×1 Metal · 2×1.2 Metal · 3×1.4 Metal · 3×1.6 Metal | −30 % Qi, retry in 180 min |
| Ascension Tribulation | Immortal Ascension | Ascension Tribulation Spirit | 2×1 Fire · 2×1.2 Fire · 3×1.4 Fire · 3×1.6 Fire · 4×1.8 Fire | −30 % Qi, retry in 180 min |
| Golden Immortal Tribulation | Golden Immortal | Golden Immortal Tribulation Spirit | 2×1 Fire · 2×1.2 Fire · 3×1.4 Fire · 3×1.6 Fire · 4×1.8 Fire | −30 % Qi, retry in 180 min |
| Emperor's Tribulation | Immortal Emperor | Emperor's Tribulation Spirit | 2×1 Water · 2×1.2 Water · 3×1.4 Water · 3×1.6 Water · 4×1.8 Water · 4×2 Water | −30 % Qi, retry in 180 min |

### 5.2 Rules ✅

- One battle against the tribulation spirit, **faced alone** (no companions). Every player round, the current wave's
  bolts strike random allies for `bolt_power` (25 %) of the spirit's attack × the wave multiplier, reduced by that
  element's resistance and the target's defence. The wave escalates every 3 rounds.
- **Win** by surviving `waves × 3` rounds or by felling the spirit. Rewards: the tribulation loot (Dao crystals,
  enhancing stones) and the requirement marked passed.
- **Lose**: −30 % of the stage's Qi and a retry cooldown (2–3 h). Nothing else is lost.
- Manual or Auto, like any battle; the auto-battle "big attack" condition and shields matter most here.

### 5.3 Preparation sheet ✅

Opened from the breakthrough ceremony (*Face it ›*), or announced on the Cultivate button when the tribulation is the
only thing missing: the spirit (element, CP), each wave (bolts, element, estimated damage per bolt), five readiness
checks (full health · a shield technique equipped · a heal equipped · resistance to the tribulation's element ≥ 10 % ·
healing pills usable in battle), the failure cost and attempts so far, then **Techniques** or **Face the heavens**.

Distinct presentation: painted lightning that strikes where the party stands, wave counter, "Endured" result.
**Open (⏳):** tribulation-specific backgrounds per realm, music and modifiers beyond lightning.

---

## 6. Character attributes and Combat Power

### 6.1 Attributes ✅

| Group | Attributes |
|---|---|
| Core (10) | HP, Attack, Defense, Speed, Critical Chance, Critical Damage, Accuracy, Evasion, Spiritual Power, Spiritual Energy |
| Secondary (7) | Armor Penetration, Life Steal, Healing Bonus, Shield Strength, Cooldown Reduction, Damage Reduction, Status Resistance |
| Elemental | Damage bonus and resistance per element (wood, fire, earth, metal, water) |

**Base character:** HP 360, ATK 40, DEF 18, SPD 10, Crit 5 %, Crit Damage 150 %, ACC 95, EVA 5, SP Power 40, SE 100.

**Sources, folded in order:** base → realm bonuses and stage growth → root → elixirs (permanent pills) → method ×
mastery → passive techniques → gear (main + affixes × enhancement) → set bonuses → active beast's passive and bond
milestones → timed buffs → titles.

**Combat caps** (percent stats never exceed, in battle): Crit 75, Crit Damage 400, Evasion 60, Accuracy 150,
Cooldown Reduction 50, Damage Reduction 60, Life Steal 35, Armor Penetration 60, Healing Bonus 100, Shield Strength
100, Status Resistance 75, elemental difference ±60. Speed is compressed in the turn gauge (§8.1).

The **stats sheet** explains every attribute and shows a breakdown card with a bar split by source.

### 6.2 Combat Power ✅

`CP = Σ (stat − baseline) · weight`, baselines Crit 5, Crit Damage 150, Accuracy 90. Weights: HP 0.25, ATK 1, DEF 0.8,
SPD 1, Crit 3, Crit Damage 0.5, ACC 1, EVA 1, SP Power 0.3, SE 0.1, Armor Pen 2, Life Steal 3, Healing 1, Shield 1,
Damage Reduction 3, Status Resistance 1, Cooldown Reduction 4, each elemental point 0.5. The same formula drives the
header, the gear "vs equipped ▲/▼" comparison, recommended CP on nodes and the defeat power check. CP is a guide, not a
guarantee: elements, signatures and technique choice decide many fights (balance target: the reference player's CP is
0.75–2× the region's normal enemies).

---

## 7. Elements and spiritual roots

### 7.1 Five elements ✅

| Element | 中文 | Overcomes | Generates | Themes |
|---|---|---|---|---|
| Wood | 木 | Earth | Fire | healing, regeneration, poison, nature, vines |
| Fire | 火 | Metal | Earth | burst damage, burning, destruction |
| Earth | 土 | Water | Metal | defense, shields, resilience |
| Metal | 金 | Wood | Water | sword damage, precision, critical strikes |
| Water | 水 | Fire | Wood | control, recovery, freezing, spiritual energy |

In combat the attacker's element **overcoming** the defender's adds +25 % damage; the reverse removes 25 %
(§8.2).

### 7.2 Spiritual roots ✅

| Root | 中文 | Tier | Elements | Qi × | Bonuses | Awakens into / obtained from |
|---|---|---|---|---|---|---|
| Faint Mortal Root | 凡根 | single | Wood | 0.95 | — | → Wood-Water Dual Root |
| Wood-Water Dual Root | 木水双灵根 | dual | Wood + Water | 1.4 | elem_dmg.wood +8, elem_dmg.water +8, heal_bonus +5 | → Five Elements Root |
| Fire-Earth Dual Root | 火土双灵根 | dual | Fire + Earth | 1.4 | elem_dmg.fire +8, elem_res.fire +8, def +30 | → Five Elements Root |
| Metal-Water Dual Root | 金水双灵根 | dual | Metal + Water | 1.4 | elem_dmg.metal +8, crit +3, sp_energy +20 | → Five Elements Root |
| Five Elements Root | 五行灵根 | five | Wood + Fire + Earth + Metal + Water | 2 | elem_dmg.wood +6, elem_dmg.fire +6, elem_dmg.earth +6, elem_dmg.metal +6, elem_dmg.water +6 | — |

- The player starts with the Faint Mortal Root; reaching **Foundation Establishment awakens** it into the
  Wood-Water Dual Root.
- Rare **event outcomes** transform the root: *The Blazing Shrine* → Fire-Earth Dual (10 %), *The Frost Hermit's
  Trial* → Metal-Water Dual (15 %), *The Empty Throne* (Throne of the Immortal Emperor) → Five Elements Root (12 %).
- The **Spirit Root sheet** (Character) shows the root's elements, affinities, bonuses, history and the rare
  opportunities still out there. 🟡 *Root transformations work in the engine but have no dedicated automated test.*

---

## 8. Combat

Pure, deterministic engine (`src/engine/combat/`), every tunable in `content/meta/combat_rules.json`.

### 8.1 Turn order ✅

Speed gauge: every tick each unit adds its effective speed; the first to reach 100 acts (ties → lower uid). Faster
units act first **and more often**. Speed is compressed (`1 + (spd − 1)^0.7 · 10^0.3`) so it matters without deciding
every fight. A *round* is one player turn; a battle times out after 60 rounds. At most 5 enemies on the field. The
turn-order strip shows the next six actors and re-sorts when the order changes.

**Tempo** — a technique's `turn_shift` (% of a turn) delays the enemies it hits or hastens the ally / caster it
targets; a gauge never drops below −1 turn. **Surge** — the player always carries Surge: spend **40 ultimate charge** to
act again at once (gauge +100 %); it gives no charge back.

### 8.2 Damage ✅

```
hit chance = clamp((ACC − EVA) / 100, 10 %, 100 %)
raw        = (ATK + SP Power × 0.5) × power % × mastery multiplier × (charged attack ×2)
           × element multiplier × crit (Crit Damage %, default 150 %)
           × ATK / (ATK + DEF × (1 − Armor Pen %) × 0.9)
           × (1 ± 8 % variance) × dungeon modifiers
final      = raw × (1 − Damage Reduction %) → shield absorbs first → HP      (minimum 1 on a landed hit)
```

Element multiplier: overcoming +25 %, overcome −25 %, boss weakness +30 %, plus attacker's elemental damage minus
defender's elemental resistance (±60 % cap). Healing = `heal %` of the caster's max HP × (1 + healing bonuses); shields =
`shield %` of max HP × (1 + Shield Strength), never stacking (the larger stays). Life steal heals a share of damage dealt.

### 8.3 Resources ✅

| Resource | Rule |
|---|---|
| Spiritual Energy (SE) | = the SE stat; techniques cost it; +8 % of max per own turn, +6 per basic attack; Silence allows basic attacks only |
| Cooldowns | count down at the start of the owner's turn; Cooldown Reduction shortens them (min 1) |
| Ultimate charge (0–100) | +12 per action, +40 × (damage taken / max HP), +20 per kill; an ultimate needs its charge (100) and resets it; Surge spends 40 |
| Mastery | every equipped technique (method 100 %, actives 50 %, passives 35 %, ultimate 50 % of the fight's mastery XP) gains XP from won fights; +3 % power per level, up to level 10 |
| HP between fights | carried over between waves and fights; recovers 4 % of max per minute out of battle; Rest at the sect heals fully |

### 8.4 Status effects ✅

Applied with `chance × (1 − Status Resistance)` (resistance cap 75 %) for debuffs, control and damage over time. After
a stun / freeze / silence wears off the unit is immune to control for 2 turns (bosses 3), and bosses take control at
half chance. Freeze or stun on a winding-up enemy cancels its big attack.

| Status | Kind | Stacking | Turns | Effect |
|---|---|---|---|---|
| Burning | dot | stack ×3 | 2 | 30 % of applier ATK / turn · Takes fire damage each turn. |
| Poison | dot | stack ×5 | 3 | heal_bonus -30 % · 20 % of applier ATK / turn · Takes nature damage each turn and heals less. |
| Bleeding | dot | refresh | 3 | −4 % max HP / turn · Loses a portion of max HP each turn. |
| Freeze | control | refresh | 1 | spd -25 % · Cannot act; moves slower once thawed. |
| Stun | control | refresh | 1 | Skips the next turn. |
| Silence | control | refresh | 2 | Cannot use techniques; basic attacks only. |
| Slow | debuff | refresh | 2 | spd -30 % · Speed reduced. |
| Defense Down | debuff | refresh | 3 | def -25 % · Defense reduced. |
| Attack Down | debuff | refresh | 3 | atk -20 % · Attack reduced. |
| Shield | shield | refresh | 3 | Absorbs damage until depleted. |
| Regeneration | buff | refresh | 3 | +5 % max HP / turn · Restores HP each turn. |
| Damage Reflection | buff | refresh | 2 | Returns part of the damage taken to the attacker. |
| Invulnerable | buff | refresh | 1 | Immune to all damage this turn. |
| Counter Stance | buff | refresh | 2 | Every hit taken is answered with a counter-blow. |
| Vulnerable | debuff | refresh | 2 | dmg_red -30 % · Takes 30% more damage. |
| Thunder Brand | debuff | refresh | 3 | Branded: the brand detonates when the timer runs out. A shield absorbs it. |
| Pharaoh's Curse | debuff | refresh | 2 | Cannot be healed. |
| Rend | debuff | stack ×5 | 3 | dmg_red -10 % · Torn open: takes 10% more damage per stack. |
| High Tide | buff | refresh | 4 | spd +25 %, atk +15 % · Borne by the tide: faster and harder-hitting. |
| Low Tide | debuff | refresh | 4 | def -30 %, spd -15 % · Stranded by the tide: softer and slower. |

The last seven are mechanic statuses (stances and boss signatures, §8.6–8.7).

### 8.5 Techniques in battle ✅

Loadout: **basic attack + 4 active slots + 2 passives + 1 ultimate + Surge**, plus the active spirit beast's ability and
the Dao companions' own arts. Counters: a gear *counter* special answers a hit by chance; **Counter Stance** (stance
techniques) answers every hit while it lasts.

Gear special effects in battle: on-hit / on-crit status, on-kill heal, counter, SE restore per turn, heal per turn,
shield at battle start, reflect, cooldown reduction, stat multipliers, elemental damage.

### 8.6 Elites, bosses and telegraphs ✅

- **Telegraphs** — elites and bosses announce a big attack one turn ahead when it would take ≥ 30 % of an ally's max HP:
  red banner ("Blazing Comet · NEXT TURN · ≈34 % of your HP · shield, heal or stun to stop it"), red glow and "!" on the
  enemy, pulse on the threatened ally, "!" in the turn strip. Control interrupts it.
- **Elites** carry a third art: Guard Stance (counter stance) in odd regions, Wind Step (self haste) in even ones.
- **Boss phases** by HP threshold: technique set changes, summons (up to 5 enemies alive), phase shields, enrage
  (ATK/SPD multipliers), charged attacks ("X in N turns", ×2 power, cancelled by stun/freeze), elemental weaknesses.
  A phase change gets a zoom, a burst and a banner; a charged attack plays like an ultimate.

### 8.7 Boss signature mechanics ✅

Every region sovereign (and the Nine-Headed Abyss Serpent) has one rule that changes how its fight is played. It is
named in the boss intro, on the node card and in a banner each time it fires; the defeat screen explains the counter.

| Mechanic | Sovereign (region) | Rule | Counter-play |
|---|---|---|---|
| Thousand-Node Shell · *guarded* | Thousand-Node Bamboo Dragon (2) | −70 % damage taken while a summoned sprite lives | kill the sprites first |
| Rising Fury · *fury* | Molten Ape King (3) | from round 9, +6 % ATK every player round | finish fast |
| Lotus Ice Armor · *break* | Lotus Frost Queen (4) | each phase opens behind ice worth 30 % HP; shattering it delays her a turn and makes her Vulnerable for 2 turns | burst the ice, then the body |
| Sword Intent Riposte · *riposte* | Sword Sovereign's Remnant (5) | every 3rd hit taken is answered at 120 % ATK | few heavy hits beat many light ones |
| Blood Moon Feast · *drain* | Crimson Moon Matriarch (6) | heals 35 % of the damage she deals | shields starve her |
| Mirror Stair · *ward* | Celestial Stair Guardian (7) | attuned to one element, rotating every 3 of its turns; that element heals it | switch elements |
| Gate Tremor · *quake* | Heavenly Gate Keeper (8) | every 3rd turn, an unavoidable blow on the whole party at 90 % ATK | shield for the third turn |
| Thunder Brand · *mark* | Nine-Bolt Thunder Emperor (9) | brands an ally; 3 of its turns later the brand detonates at 120 % ATK unless a shield takes it | shield the branded |
| Tidal Rhythm · *tide* | Drowned Dragon Lord (10) | high tide every 3 rounds (faster, harder-hitting), low tide (−30 % DEF, slower) | burst at low tide |
| Pharaoh's Curse · *curse* | Starfall Pharaoh (11) | every 5th turn, no healing on the party for 2 turns | heal before, shield through |
| Vermilion Rebirth · *rebirth* | Vermilion Gatekeeper (12) | rises once at 30 % HP when slain (the Abyss Serpent at 25 %) | keep something for the end |
| White Tiger Rend · *rend* | White Tiger Sovereign (13) | consecutive hits on the same ally stack Rend (+10 % damage taken, ×5) | make it switch targets |
| Law of Measure · *measure* | Arbiter of Ten Thousand Laws (14) | no single hit takes more than 15 % of its max HP | many strikes, not one |
| Sovereign's Answer · *answer* | Remnant of the First Emperor (15) | whenever an ally uses an ultimate, it acts at once | ultimate when it is delayed or controlled |

### 8.8 Auto-battle and AI ✅

**Player rules** — an ordered priority list per preset (up to **3 presets**: Balanced, Boss, Farming; Reset, Copy to
Boss, rearrange in the rule editor). Each rule = *slot* + *condition* + *target*:

| | Values |
|---|---|
| Slot | a loadout slot (active 1–4, Ultimate, Beast) or a role: Surge, Best heal, Shield, Strongest attack, Debuff, Tempo, Basic attack |
| Condition | Always · My HP below N % · Companion HP below N % · SE above N % · Ult charge above N · No shield · Boss fights · Enemies ≥ N · Big attack coming · Can finish a foe · Element advantage · Never |
| Target | Default · Finish / focus · Weak to element · Lowest HP · Strongest CP · Weakest · Toughest |

Default preset: Surge when a big attack is coming → heal under 45 % HP → heal a companion under 35 % → shield when a
big attack is coming → finish a killable foe → ultimate on bosses or 3+ enemies → shield when unshielded → technique with
the element advantage on the foe weak to it → strongest technique on the focus → basic attack.

**Manual mode** pauses on every player turn (tap a foe, then a technique); Manual/Auto can be switched mid-fight.

**Enemy AI** by strategy (aggressive, berserker, defensive, support, trickster, caster, guardian), with shared habits:
focus fire on one ally until it falls (never wasting turns on a spirit beast while the cultivator stands), the
technique with the best expected damage on the chosen target (element-aware), taking kills, holding the ultimate for an
opening (bosses: a later phase or a bare, wounded target), bracing with a stance when hurt and stepping on the first
turn when they carry those arts.

**Dao companions** fight with the stance the player picks per companion: Guard (heal/shield first), Balanced (their
role: dps, support, tank, control) or Burst (strongest art on the strongest foe).

### 8.9 Battle screen ✅

Portrait **arena** stage (Epic Seven style; Settings can switch to the Classic stage): enemies across the upper band,
the party across the lower band on one floor; vertical turn-order strip; top bar with place, wave, Manual/Auto, speed
(**1× / 2× / 3×**) and pause; party cards (portrait, HP, SE, statuses) and the skill bar (cooldown sweeps, SE costs,
Ultimate ring, Surge chip) at the bottom; boss panel and signature banner on top.

Presentation: melee arts dash to the target and return, spells travel or cover the field, painted effects per shape
(slash, pierce, burst, beam, wave, pillar, ring, rain, glow, bolt) tinted by element, elemental bursts under each hit,
hit-stop, knock-back, camera push/zoom, afterimages and weapon trails, a hit counter ("12 Hits!"), floating damage /
crit / status words, ultimates as a full-screen close-up with the caster's painted cut-in and a flurry of numbers,
statuses drawn on the figure (frost, flames, miasma, stars, shield bubble), boss intro splash, victory beat on the
field. All timing scales with the battle speed.

---

## 9. Victory and defeat

### 9.1 Victory ✅

Gold title over the scene; ribbon with the main foe defeated (and *First clear*); three stat tiles — damage dealt,
highest hit (or damage taken), HP left; spirit stones, Fame and mastery XP; drops revealed one by one with **NEW** and
**▲ upgrade** badges (hold any drop for its details); first-clear rewards; a **best-drop card** comparing the best gear
to what is worn with one-tap Equip; the tracked quest's progress. Buttons: **Map**, **Again**, **Continue ▸** (to the
next place). 🟡 *Healing performed is tracked by the engine but not shown on the panel.*

### 9.2 Defeat ✅

"Defeated — nothing is lost": the foe with the HP it had left, damage dealt this run and its weaknesses; **Power check**
(your CP vs the enemy's, with the gap); **No penalty** (drops kept, HP restored to 30 %, free retry); **What beat you**
(the source and art that did the most damage with its share, each signature mechanic that fired with its counter-play,
turns lost to control, share of damage over time, an element overcoming yours); **Ways to get stronger** with a tap to
go there (break through, equip empty slots, enhance a piece, fill technique slots, add a shield or heal, shield before
the big attack, raise Defense, hatch a beast, hunt an easier place first).

---

## 10. Adventure mode

### 10.1 Regions ✅

15 regions, each with its own painted card, node map, battle background, enemies, materials, gear set, dungeon,
signature boss, NPC, events and story scene. A region opens when the previous sovereign's quest is done **and** the
player has reached the realm it requires; it opens the moment both are true.

| # | Region | 中文 | Realms | Opens after | Places | Sovereign | Signature mechanic | Weak to |
|---|---|---|---|---|---|---|---|---|
| 1 | Mortal Plains | 凡尘平原 | Qi Condensation | start | 10 | Bandit Chief Hu | — | Wood |
| 2 | Azure Bamboo Forest | 苍竹林 | Qi Condensation | The Bandit Chief | 14 | Thousand-Node Bamboo Dragon | Thousand-Node Shell (guarded) | Metal |
| 3 | Blazing Mountain | 炎山 | Foundation Establishment | The Bamboo Sovereign + Foundation Establishment 1 | 15 | Molten Ape King | Rising Fury (fury) | Water |
| 4 | Frozen Lotus Valley | 冰莲谷 | Foundation Establishment → Core Formation | Sovereign of the Blazing Mountain + Foundation Establishment 1 | 15 | Lotus Frost Queen | Lotus Ice Armor (break) | Fire |
| 5 | Ancient Sword Tomb | 古剑冢 | Core Formation | Sovereign of the Frozen Lotus Valley + Core Formation 1 | 15 | Sword Sovereign's Remnant | Sword Intent Riposte (riposte) | Fire |
| 6 | Demon Territory | 魔域 | Nascent Soul | Sovereign of the Ancient Sword Tomb + Nascent Soul 1 | 15 | Crimson Moon Matriarch | Blood Moon Feast (drain) | Water |
| 7 | Celestial Mountains | 天穹山 | Soul Transformation | Sovereign of the Demon Territory + Soul Transformation 1 | 15 | Celestial Stair Guardian | Mirror Stair (ward) | Fire |
| 8 | Nine Heavens | 九天 | Spirit Severing | Sovereign of the Celestial Mountains + Spirit Severing 1 | 15 | Heavenly Gate Keeper | Gate Tremor (quake) | Fire |
| 9 | Thunderclap Wastes | 雷鸣荒原 | Dao Integration | Sovereign of the Nine Heavens + Dao Integration 1 | 15 | Nine-Bolt Thunder Emperor | Thunder Brand (mark) | Earth |
| 10 | Sunken Dragon Sea | 沉龙海 | Tribulation Transcendence | Sovereign of the Thunderclap Wastes + Tribulation Transcendence 1 | 15 | Drowned Dragon Lord | Tidal Rhythm (tide) | Earth |
| 11 | Starfall Desert | 星陨沙海 | Mahayana | Sovereign of the Sunken Dragon Sea + Mahayana 1 | 15 | Starfall Pharaoh | Pharaoh's Curse (curse) | Wood |
| 12 | Gate of Ascension | 飞升门 | Immortal Ascension | Sovereign of the Starfall Desert + Immortal Ascension 1 | 15 | Vermilion Gatekeeper | Vermilion Rebirth (rebirth) | Water |
| 13 | Jade Immortal Realm | 玉仙境 | Earth Immortal | Sovereign of the Gate of Ascension + Earth Immortal 1 | 15 | White Tiger Sovereign | White Tiger Rend (rend) | Fire |
| 14 | Golden Palace of Laws | 金律天宫 | Heavenly Immortal → Golden Immortal | Sovereign of the Jade Immortal Realm + Heavenly Immortal 1 | 15 | Arbiter of Ten Thousand Laws | Law of Measure (measure) | Fire |
| 15 | Throne of the Immortal Emperor | 仙帝座 | Immortal King → Immortal Emperor | Sovereign of the Golden Palace of Laws + Immortal King 1 | 15 | Remnant of the First Emperor | Sovereign's Answer (answer) | Earth |

Bosses by kind: region 15 · dungeon 14 · secret_realm 3 · mega 5 · tribulation 6 (total 43). Enemies: 78 (beast 26, construct 8, demonic 9, human 9, elite 13, guardian 3, celestial 10).

### 10.2 Node map ✅

Illustrated map per region, places numbered along a painted road; clearing a place opens the places connected to it;
hidden, merchant and secret-realm places branch off without gating. Node card: kind, state, recommended CP (coloured by
your CP), description, enemy chips (hold for stats and drops), waves, energy cost, first-clear rewards, the
sovereign's signature, **Fight** / **Challenge**, and **Sweep** once cleared.

Place kinds in the game: battle 97 · elite 29 · gather 18 · hidden 16 · chest 15 · boss 15 · event 13 · cultivation 12 · secret_realm 3 · merchant 1 (total 219)

| Kind | Behaviour |
|---|---|
| battle / elite / boss | waves of enemies; energy 5 + region/2; first-clear rewards once, drops every time; replayable |
| gather | collect the place's herbs/ores for 3–6 energy; regrows after 20–45 min |
| chest | opens once (loot table) |
| event | a choice with weighted outcomes: rewards, a fight, a status, a root transformation |
| cultivation | spend energy for a timed Qi boost (e.g. Moon-Pool Spring: Qi ×1.5 for 30 min, 6 energy) |
| hidden | revealed when its condition holds (an element root or technique equipped, a place cleared…) |
| merchant | a wandering shop (Tang's Caravan) |
| secret_realm | entrance to a secret realm (§11.4) |

Defeated opponents stay replayable; drops come from each enemy's loot table every time.

### 10.3 Item levels ✅

Region *n* drops gear of item level 8n − 7 … 8n + 4 (normal enemies); its sovereign drops at the top of the band (−3 … +2
around 8n + 4); dungeon bosses and clears 8n − 3 … 8n + 6, each resource-dungeon tier +4 more; mega-dungeon bosses
8n + 4 … 8n + 8.

### 10.4 Events ✅

16 events with branching choices (e.g. *The Blazing Shrine*: press your palm — root transformation 10 %, warmth +150
stones 50 %, burning 40 %; search the rubble — an offering box 70 %, a sleeping boar 30 %).

### 10.5 Energy ✅

Max 500 (+10 per rank order), +1 every 1.2 minutes (≈ 1,200 a day). Spent by map fights (5–12), gathering, dungeons
(10–40), secret realms (20–25), beast training (5). The tower, tournaments and duels are free.

### 10.6 Sweeps ✅

A cleared, replayable place (not a sovereign) can be **swept**: up to 20 instant runs with the auto-battle rules. Every
run is a real fight (energy, drops, first-clear bookkeeping, quest kill counters, mastery, daily board); a defeat stops
the sweep. The sheet lists the candidates with a win estimate, a run stepper and the energy cost; the result sheet
lists everything gained. Reached from the node card and from the offline report.

---

## 11. Dungeons, tower and secret realms

The Dungeons hub has tabs **Regions · Dungeons · Challenge · Secret Realms · Mega Dungeons**.

| Dungeon | Kind | Entry | Energy | Daily | Party | Tiers | Rec. CP |
|---|---|---|---|---|---|---|---|
| Old Granary Cellars | resource | Qi Condensation 2 | 10 | 3 | solo | 5 | 300 |
| Heaven-Piercing Tower | tower | Qi Condensation 5 | 0 | — | solo | 100 floors | 400 |
| Spirit Stone Mine | resource | Qi Condensation 4 | 12 | 2 | solo | 5 | 450 |
| The Green Labyrinth | challenge | Qi Condensation 6 | 15 | — | solo | — | 480 |
| Origin Secret Realm | secret_realm | Foundation Establishment 1 · The Bamboo Sovereign | 20 | — | solo | — | 1800 |
| Ember Forge Ruins | resource | Foundation Establishment 3 · Blazing Mountain | 16 | 3 | solo | 5 | 1820 |
| Glacier Caverns | challenge | Foundation Establishment 3 · Frozen Lotus Valley | 18 | — | solo | — | 2340 |
| Hall of Ten Thousand Blades | challenge | Core Formation 3 · Ancient Sword Tomb | 20 | — | solo | — | 4860 |
| Blood River Prison | resource | Nascent Soul 3 · Demon Territory | 22 | 3 | solo | 5 | 10270 |
| Thunder Pine Sanctum | resource | Soul Transformation 3 · Celestial Mountains | 24 | 3 | solo | 5 | 16120 |
| Crimson Moon Secret Realm | secret_realm | Nascent Soul 5 · Sovereign of the Demon Territory | 25 | — | solo | — | 25280 |
| Sunken Star Palace | challenge | Spirit Severing 3 · Nine Heavens | 26 | — | solo | — | 26820 |
| Glass Labyrinth | resource | Dao Integration 3 · Thunderclap Wastes | 28 | 3 | solo | 5 | 40300 |
| Coral Labyrinth | challenge | Tribulation Transcendence 3 · Sunken Dragon Sea | 30 | — | solo | — | 93600 |
| Buried Star Temple | resource | Mahayana 3 · Starfall Desert | 32 | 3 | solo | 5 | 94900 |
| Abyss of the Nine Heavens | mega | Spirit Severing 5 · Core Disciple · Nine Heavens | 40 | — | 2 companions | — | 158000 |
| Sunken Palace of the Dragon King | mega | Tribulation Transcendence 5 · Core Disciple | 40 | — | 2 companions | — | 182000 |
| Trial of Nine Flames | challenge | Immortal Ascension 3 · Gate of Ascension | 34 | — | solo | — | 189000 |
| Immortal Peach Garden | resource | Earth Immortal 3 · Jade Immortal Realm | 36 | 3 | solo | 5 | 195000 |
| Pharaoh's Star Vault | secret_realm | Mahayana 5 · Sovereign of the Starfall Desert | 25 | — | solo | — | 233600 |
| Hall of Verdicts | challenge | Heavenly Immortal 3 · Golden Palace of Laws | 38 | — | solo | — | 243000 |
| Ruins of the Fallen Heaven | mega | Immortal Ascension 5 · Direct Disciple | 40 | — | 2 companions | — | 367500 |
| Hall of Five Elements | challenge | Immortal King 3 · Throne of the Immortal Emperor | 40 | — | solo | — | 468000 |
| Hall of Ten Thousand Laws | mega | Heavenly Immortal 5 · Elder | 40 | — | 2 companions | — | 472500 |
| Primordial Chaos Abyss | mega | Immortal King 5 · Grand Elder | 40 | — | 2 companions | — | 910000 |

### 11.1 Resource dungeons ✅

Daily-limited (2–3 runs, shared across tiers), five tiers I–V. Tier *k* needs the realm *k − 1* steps above the entry
realm and tier *k − 1* cleared; enemies are scaled ×1.5^(k−1); clear loot scales (stones ×1.6^(k−1), more and better
drops, gear rarity one rank up every two tiers) and adds a **tier bundle**: 2·(k−1) refining stones from tier II, an
awakening-crystal chance from tier III, a guaranteed Dao Insight Crystal at tier V. Each tier's first clear pays once.

### 11.2 Challenge dungeons ✅

No daily limit, HP carries over between waves, a dungeon boss at the end. Eight of them: The Green Labyrinth (region 2),
then from region 3 on each region has either a resource or a challenge dungeon, alternating (8 resource, 8 challenge in
all). Some are rank trials (Trial of the Green Labyrinth for Core Disciple).

### 11.3 Endless Tower — Heaven-Piercing Tower ✅

100 floors, entry at Qi Condensation 5, no energy, no daily cap, a defeat costs nothing. Floor *n* power =
400 × 1.091^(n−1), split over 1–3 pool enemies (1 on floors 1–4, 2 to floor 19, 3 beyond); every 10th floor a Warden
holds it alone. Each floor pays its loot and 20·n^1.35 stones; checkpoints at the best floor. Milestones (first time):

| Floor | Reward |
|---|---|
| 5 | 500 stones, 2 Spirit Enhancing Stones |
| 10 | 1,200 stones, 2 Sword Rain Fragments, a rare Whispering Reed Flute |
| 20 | 3,000 stones, Iron Wall Stance manual, 1 Dao Insight Crystal |
| 30 | 6,000 stones, Awakening Crystal, 2 Dao Insight Crystals |
| 50 | 15,000 stones, 4 Dao Insight Crystals, a mythic Starlight Spirit Ring |
| 75 | 60,000 stones, 6 Dao Insight Crystals, 2 Awakening Crystals, 20 enhancing stones |
| 100 | 200,000 stones, 12 Dao Insight Crystals, 4 Awakening Crystals, 40 enhancing stones, title *Tower Conqueror* |

### 11.4 Secret realms ✅

Three branching realms (Origin, Crimson Moon, Pharaoh's Star Vault) with their own map: trials, elite guardians, vaults
(once per run), spirit pools (full heal), events, a **hidden merchant**, hidden rooms that appear when their condition
holds ("water root or water technique equipped"), the realm guardian (unique boss) and the exit. A run is saved: leave
and resume any time; HP carries across the run; abandoning resets the rooms. Entry spends the energy once and may need
a realm and a sovereign quest.

### 11.5 Mega dungeons ✅

Five multi-boss dungeons (Abyss of the Nine Heavens, Sunken Palace of the Dragon King, Ruins of the Fallen Heaven, Hall
of Ten Thousand Laws, Primordial Chaos Abyss), gated by realm stage 5 and a sect rank, 40 energy, **two Dao companions
allowed**, and **the only source of Divine gear** (enforced by the validator). Their bosses drop 2–4 Dao Insight
Crystals and their clear tables 3–5.

---

## 12. Equipment

### 12.1 Slots and rarities ✅

Eight slots: **Weapon, Armor, Helmet, Boots, Necklace, Ring 1, Ring 2, Spiritual Artifact** (the artifact slot opens at
Foundation Establishment; both ring slots take rings). Eight rarities: **Common, Uncommon, Rare, Epic, Legendary,
Mythic, Immortal, Divine**, each with its own frame, glow and **its own design per gear family**.

### 12.2 Bases and instances ✅

A **base** is a kind of item (slot, weapon type, element, set, main stat, allowed rarity range, art per rarity); the
player owns **instances** = base + rarity + item level + rolled stats + enhancement + awakening.

Gear bases: 68 (helmet 9, artifact 8, necklace 8, armor 10, weapon 13, ring 10, boots 10); base × rarity variants: 205; uniques: Chaos-Severing Saber, Cloudwalker Immortal Boots, Dragon Abyss Sword, Dragon King's Scale Armour, Mirror of Heaven, Law-Seal Ring, Ninefold Hairpin Crown, Phoenix Feather Crown, Reed Witch's Whisper Ring, Starlight Spirit Ring, Tide Pearl Necklace.

| Set | Pieces | Bonuses |
|---|---|---|
| Rimeglass Set | Rimeglass Spear, Rimeglass Robe, Rimeglass Boots | 2: elem_dmg.water +10 · 3: def +60 Hits have a 15% chance to Freeze. |
| Blazeforge Set | Blazeforge Saber, Blazeforge Plate, Blazeforge Band | 2: elem_dmg.fire +10 · 3: hp +600 Hits have a 15% chance to Burn. |
| Tombsong Set | Tombsong Sword, Tombsong Talisman, Tombsong Mantle | 2: crit +4 · 3: hp +1000 Critical hits cause Bleeding. |
| Skyward Set | Skyward Staff, Skyward Vestments, Skyward Pendant | 2: sp_power +120 · 3: hp +1400 Technique cooldowns −1 at battle start. |
| Stormcall Set | Stormcall Spear, Stormcall Helm, Stormcall Armor | 2: elem_dmg.metal +12 · 3: hp +1800 Hits have a 10% chance to Stun. |
| Starborn Set | Starborn Fan, Starborn Robe, Starborn Ring | 2: crit +5 · 3: hp +2200 Start battle with a shield of 12% max HP. |
| Jadeclaw Set | Jadeclaw Sword, Jadeclaw Boots, Jadeclaw Ring | 2: atk +300 · 3: hp +2600 Critical hits cause Bleeding. |
| Emperor's Regalia | Emperor's Saber, Emperor's Pendant, Emperor's Stride | 2: atk +500, hp +2000 · 3: hp +3000 Heal 4% max HP each turn. |

### 12.3 Stat formulas ✅

```
scale(L)      = 1 + 0.12·L + 0.0025·L²                     (L = item level, cap 150)
floor(r, L)   = f_r + (0.95 − f_r) · min(1, L/150) · 0.6   (roll floor rises with item level)
roll          ~ uniform[floor, 1]
main stat     = base.main_value · scale(L) · M_r · roll
affix         = pool value · scale(L) · A_r · roll           (percentage stats use 1 + L/150 instead of scale(L))
```

| Rarity | Main stat × | Affix × | Roll floor f_r | Affixes | Special effects |
|---|---|---|---|---|---|
| Common | 1 | 1 | 70 % | 0 | 0 |
| Uncommon | 1.5 | 1.5 | 72 % | 1 | 0 |
| Rare | 2.25 | 2.25 | 74 % | 2 | 0 |
| Epic | 3.4 | 3.4 | 76 % | 3 | 0 |
| Legendary | 5.1 | 5.1 | 78 % | 4 | 0 |
| Mythic | 7.6 | 7.6 | 80 % | 4 | 1 |
| Immortal | 11.4 | 11.4 | 82 % | 5 | 1 |
| Divine | 17.1 | 17.1 | 84 % | 5 | 2 |

Guarantees (checked by the validator for every item level): **the worst roll of a higher rarity beats the best roll of
the rarity below**; a higher rarity never has fewer affixes; item CP is strictly ordered by rarity. Main stat by slot:
weapon ATK, armor HP, helmet DEF, boots SPD, necklace SP Power, ring ATK, artifact SP Power. Affixes are drawn from the
slot's pool without repeats; a base may have a **signature affix** that is always present. Mythic and above roll
special effects (on-hit Burn, counter, SE restore, shield at start…). **Uniques** have one rarity and fixed specials.

### 12.4 Sets ✅

Eight sets of three pieces, bonuses at 2 and 3 pieces (set table in §12.2). Set pieces are normal bases with random
stats.

### 12.5 Comparison and inventory actions ✅

- Item card: rarity, slot, item level, enhancement, stat chips, set, specials, item CP and **▲/▼ vs equipped**.
- **Compare** sheet side by side: increases in green, decreases in red, specials, set bonuses, CP change.
- Actions: Equip, Unequip, **Best** (equips the best set from bag and worn pieces), Compare, **Lock / Unlock** (locked
  pieces can't be sold), Sell, Sort (rarity, name, CP), Filter (category tabs and rarity), Use ×N for stackable pills,
  Read (manuals), Study (blueprints); at the merchant: **Sell all junk**, **Sell all [rarity] gear** (locked and worn
  pieces stay).

### 12.6 Inventory capacity ✅

Counted in slots (one per stack or per piece; worn gear takes none), drawn as pages of 24 (6 × 4):

| | Base | Per rank order | Expansion | Max expansions | Cost of expansion *n* |
|---|---|---|---|---|---|
| Bag | 100 | +10 | +20 | 5 | 500 · 2ⁿ stones |
| Depot (Your Quarters) | 200 | +10 | +20 | 10 | same |

Drops that don't fit go to the **overflow pouch** (never lost; a banner offers *Claim*); quest items can't be stored.

---

## 13. Spirit Forge

All five forge actions run at the Spirit Forge (Master Gu), each on its own tab with a hero stage (the piece, its
rarity, main stat, CP), a from → to preview, costs with owned/needed counts, the chance bar and sparks / smoke on the
result.

### 13.1 Enhancement +1 … +15 ✅

| Level | Stat × | Stones base | Materials | Success |
|---|---|---|---|---|
| +1 | 1.08 | 50 | Lesser Enhancement Stone ×1 | 100 % |
| +2 | 1.16 | 200 | Lesser Enhancement Stone ×2 | 100 % |
| +3 | 1.24 | 450 | Lesser Enhancement Stone ×3 | 100 % |
| +4 | 1.32 | 800 | Lesser Enhancement Stone ×4 | 100 % |
| +5 | 1.4 | 1250 | Lesser Enhancement Stone ×5 | 100 % |
| +6 | 1.48 | 1800 | Spirit Enhancing Stone ×2 | 100 % |
| +7 | 1.56 | 2450 | Spirit Enhancing Stone ×3 | 100 % |
| +8 | 1.64 | 3200 | Spirit Enhancing Stone ×4 | 100 % |
| +9 | 1.72 | 4050 | Spirit Enhancing Stone ×5 | 100 % |
| +10 | 1.8 | 5000 | Spirit Enhancing Stone ×6 | 90 % |
| +11 | 1.88 | 6050 | Spirit Enhancing Stone ×7 | 80 % |
| +12 | 1.96 | 7200 | Spirit Enhancing Stone ×8 | 70 % |
| +13 | 2.04 | 8450 | Spirit Enhancing Stone ×9 | 60 % |
| +14 | 2.12 | 9800 | Spirit Enhancing Stone ×10 | 50 % |
| +15 | 2.2 | 11250 | Spirit Enhancing Stone ×11 | 40 % |

Rarity cost multipliers: common ×1, uncommon ×1.5, rare ×2.25, epic ×3.4, legendary ×5.1, mythic ×7.6, immortal ×11.4, divine ×17.1; item-level factor (ilvl / 60)^1.5.

| Refine from | Chance | Stones (× ilvl factor, min ×0.25) | Materials |
|---|---|---|---|
| common | 80 % | 500 | Refining Stone ×2 |
| uncommon | 60 % | 750 | Refining Stone ×4 |
| rare | 40 % | 1125 | Refining Stone ×6 |
| epic | 25 % | 1700 | Refining Stone ×8 |
| legendary | 10 % | 2550 | Refining Stone ×10 |

Reforge: 112 stones (× ilvl factor), Reforging Sand ×2, +Reforging Sand ×1 per locked stat, up to 3 locks.

A failed attempt keeps the level and consumes the cost. Several attempts in one press: **Enhance ×5** (stops at the
first failure) or **to +N** with a target stepper (keeps going through failures). Target: a
full set to +10 costs 1–5 days of that region's stone income, +15 one to three weeks (the long-term stone sink).

### 13.2 Refinement ✅

One rarity up (never above **Mythic** nor the base's range), keeps base, item level and enhancement, re-rolls every
stat **at the same roll percentile** and rolls the newly unlocked affix. Chances fall with rarity (table above). Cost:
stones × item-level factor + refining stones.

### 13.3 Reforge ✅

Re-rolls the unlocked secondary stats (values, and the type of non-signature affixes) at the same rarity and level; each
locked stat costs extra sand; at least one stat must re-roll.

### 13.4 Awakening ✅

Bases with an `awakening` block: pay its materials (Awakening Crystals and others) and stones once; its special effect
joins the instance's specials.

### 13.5 Crafting ✅

Forge recipes (blueprint, rank, Fame or known) turn materials into a fixed gear grant (base, rarity, item level);
blueprints are studied from the bag; the Craft tab shows recipe cards with the output art, sealed when unknown.

---

## 14. Items and materials

### 14.1 Database rules ✅

Every item has: unique ID, name (and Chinese name), category, rarity, description, icon, **at least one acquisition
source and at least one use** (validator-enforced), sell value, effects and stack limit (999 for materials). Hold any
item to see what it is used for.

| Category | Count | Entries |
|---|---|---|
| Material — herb | 16 | Spirit Grass, Bamboo Spirit Shoot, Jade Bamboo Segment, Fire Bud, Snow Lotus Petal, Sword Grass, Blood Lotus, Celestial Peach, Star-Dew Grass, Thunderroot, Sea-Jade Kelp, Desert Star Flower, Phoenix Lotus, Immortal Peach Blossom, Law Flower, Primordial Lotus |
| Material — flower | 2 | Peach Blossom, Flame Lotus |
| Material — monster | 22 | Crane Feather, Wolf Fang, Boar Tusk, Spirit Monkey Fur, Azure Wolf Pelt, Green Viper Venom, Frost Wyrm Heart-Core, Bamboo Dragon Scale, Abyss Serpent Fang, Salamander Scale, Yeti Fur, Sword Spirit Shard, Demon Horn, Thunder Feather, Jellyfish Silk, Roc Lightning Feather, Kraken Ink, Sand Wyrm Tooth, Phoenix Down, White Tiger Fang, Golden Crow Feather, Azure Dragon Scale |
| Material — ore | 16 | River Pebble, Spirit Iron Ore, Glacier Iron Ore, Magma Iron Ore, Frostsilver Ore, Tomb Iron, Demon Iron, Skystone, Cloud Jade, Storm Glass, Dragonbone Ore, Star Metal, Ascension Gold, Immortal Jade, Heavenly Gold, Emperor Star-Metal |
| Material — crystal | 15 | Frost Beast Core, Rime Crystal, Ember Core, Lotus Ice Heart, Sword Intent Crystal, Crimson Moon Shard, Heaven Pine Amber, Heavenly Star Crystal, Tribulation Core, Dragon Pearl, Meteor Heart, Gate-Light Crystal, Realm-Heart Jade, Law-Wheel Fragment, Primordial Chaos Stone |
| Material — treasure | 1 | Cloud Silk Bolt |
| Material — enhancement | 2 | Lesser Enhancement Stone, Spirit Enhancing Stone |
| Material — refining | 2 | Refining Stone, Reforging Sand |
| Material — awakening | 1 | Awakening Crystal |
| Material — breakthrough | 1 | Dao Insight Crystal |
| Material — fragment | 1 | Sword Rain Fragment |
| Pills & elixirs | 20 | Qi Gathering Pill, Blossom Healing Pill, Spirit Condensing Pill, Foundation Pill, Frost Heart Elixir, Core Condensing Pill, Spirit Tea, Ember Marrow Pill, Frost Lotus Pill, Sword Marrow Pill, Demon-Purge Pill, Celestial Peach Pill, Star-Dew Pill, Thunder-Tempering Pill, Dragon Marrow Pill, Meteor Core Pill, Phoenix Rebirth Pill, Immortal Peach Pill, Golden Law Pill, Emperor Ascension Pill |
| Manuals | 18 | Crescent Wind Blade Manual, Ripple Mending Scroll, Nine Yang Scripture, Verdant Vine Bind Manual, Iron Wall Stance Manual, Red Furnace Sutra, Ice Lotus Heart Art, Sword Burial Scripture, Blood Moon Canon, Nine Heavens Breath, Starlight Canon, Tribulation Thunder Body, Azure Dragon Scripture, Starfall Scripture, Ascension Canon, Jade Immortal Sutra, Ten Thousand Laws Canon, Immortal Emperor Canon |
| Blueprints & recipes | 3 | Blueprint: Rimeglass Spear, Recipe: Frost Heart Elixir, Blueprint: Demonbane Fan |
| Gifts | 11 | Candied Hawthorn, Osmanthus Cake, Ancient Spirit Coin, Rare Treasure Map, Spirit Stone Pouch, Fine Ledger Book, Counterfeit Coin, Bitter Medicine, Frost Plum Wine, Sword Polish Cloth, Beast Bell |
| Spirit beast eggs | 20 | Cloud Fox Egg, Flame Fox Egg, Ember Salamander Egg, Azure Wolf Egg, Snow Crane Egg, Frost Otter Egg, Jade Serpent Egg, Blood-Moon Wolf Egg, Ghost Lantern Moth Egg, Thunder Tiger Egg, Cloud Qilin Egg, Storm Roc Egg, Lightning Eel Egg, Black Tortoise Egg, Sand Dragon Egg, Starlight Deer Egg, Vermilion Bird Egg, White Tiger Egg, Nine-Tailed Fox Egg, Azure Dragon Egg |
| Beast food | 3 | Verdant Spirit Fruit, Dried Spirit Fish, Spirit Meat |
| Quest items | 2 | Caravan Manifest, Elder Wen's Token |
| Junk | 2 | Cheap Junk Loot, Broken Blade |

### 14.2 Materials ✅

Ores, herbs, flowers, monster parts, crystals, technique fragments, enhancement stones (Lesser Enhancement Stone,
Spirit Enhancing Stone), refining stones, reforging sand, awakening crystals and breakthrough materials (Dao Insight
Crystal, Bamboo Dragon Scale, Flame Lotus…). Each region has four signature materials (herb, monster part, ore,
crystal) across rarity tiers, used by its pill, its forge recipe, its missions and its beasts' evolution.

### 14.3 Other items ✅ / 🟡

Pills and elixirs (Qi, healing, SE, breakthrough, permanent attribute elixirs), gifts (11), cultivation and technique
manuals (18), blueprints and recipe scrolls (3), spirit beast eggs (20) and food (3), quest items (2), junk (sell
only). 🟡 **Technique fragments** exist (Sword Rain Fragment, 10 → Heavenly Sword Rain) but combining them is not yet a
player action; the **treasure map** is currently a gift item without a map mechanic; there are no special event items
yet.

---

## 15. Cultivation methods and techniques

### 15.1 Cultivation methods ✅

One method is active at a time. It multiplies the Qi rate, adds stat bonuses and gains mastery from won fights (100 %
share). Methods are learned from manuals (read from the bag), the Scripture Pavilion, quests and tournaments; some need a
realm or a rank.

| Method | Rarity | Grade | Element | Qi × | Bonuses | Requires |
|---|---|---|---|---|---|---|
| Azure Cloud Breathing | uncommon | earth | — | 1 | sp_energy +10 | — |
| Nine Yang Scripture | rare | earth | Fire | 1.35 | elem_dmg.fire +10, hp +300 | Qi Condensation |
| Lotus Heart Scripture | rare | earth | Wood | 1.45 | heal_bonus +8, hp +600 | — |
| Red Furnace Sutra | rare | earth | Fire | 1.5 | elem_dmg.fire +12, hp +400 | Foundation Establishment |
| Ice Lotus Heart Art | epic | heaven | Water | 1.65 | elem_dmg.water +12, sp_energy +20 | Foundation Establishment |
| Heavenly Dragon Art | epic | heaven | Water | 1.8 | sp_power +200, elem_dmg.water +12 | Foundation Establishment, Inner Disciple |
| Sword Burial Scripture | epic | heaven | Metal | 1.9 | crit +4, atk +150 | Core Formation |
| Vajra Body Method | epic | heaven | Earth | 1.9 | def +400, dmg_red +4 | — |
| Five Elements Harmony Art | epic | heaven | — | 2 | elem_res.wood +6, elem_res.fire +6, elem_res.earth +6, elem_res.metal +6, elem_res.water +6 | — |
| Blood Moon Canon | epic | heaven | Fire | 2.1 | life_steal +4, atk +200 | Nascent Soul |
| Nine Heavens Breath | legendary | heaven | Metal | 2.4 | sp_power +500, acc +5 | Soul Transformation |
| Primordial Chaos Scripture | legendary | immortal | — | 2.6 | sp_power +600, crit +4 | Core Formation |
| Starlight Canon | legendary | heaven | Water | 2.8 | sp_power +700, elem_dmg.water +14 | Spirit Severing |
| Tribulation Thunder Body | legendary | immortal | Metal | 3.2 | hp +4000, elem_res.metal +15 | Dao Integration |
| Azure Dragon Scripture | legendary | immortal | Water | 3.6 | hp +5000, elem_dmg.water +16 | Tribulation Transcendence |
| Starfall Scripture | legendary | immortal | Earth | 4 | def +1500, elem_dmg.earth +16 | Mahayana |
| Ascension Canon | mythic | immortal | Fire | 4.5 | sp_power +1200, hp +6000 | Immortal Ascension |
| Jade Immortal Sutra | mythic | immortal | Wood | 5.2 | hp +9000, heal_bonus +15 | Earth Immortal |
| Ten Thousand Laws Canon | mythic | immortal | Metal | 6 | atk +3000, cdr +10 | Heavenly Immortal |
| Immortal Emperor Canon | mythic | immortal | Water | 7.5 | hp +15000, atk +4000, sp_power +3000 | Immortal King |

### 15.2 Techniques ✅

Loadout (Techniques screen): **4 active slots, 2 passive slots, 1 ultimate**; the basic attack and Surge are always
there. Each technique has a unique ID, name, rarity, element, weapon affinity, targeting (single, all enemies, self,
ally, all allies…), power % and hits, SE cost, cooldown, statuses with chances, heal / shield %, tempo (turn shift) and
requirements. **Mastery**: levels up to 10 (default curve 100 XP per level), +3 % power (and heal / shield) per level. Hold a technique
anywhere (battle skill bar, Techniques screen, shop, loot) for its full card: description, damage estimate on the current
target, cooldown, SE cost, effects, mastery.

Sources: the Scripture Pavilion (37 rows, gated by realm, rank or Fame), manuals dropped or bought, main-quest rewards
(each sovereign teaches one art), tournament champion rewards, tower milestones.

**Active techniques the player can learn (33)**

| Technique | Rarity | Element | Weapon | Target | Power | SE / CD | Effects | Requires |
|---|---|---|---|---|---|---|---|---|
| Azure Strike | rare | Metal | sword | single | 120 % | 12 / 1 | — | — |
| Flame Palm | rare | Fire | palm | single | 180 % | 20 / 3 | Burning 30 % | Qi Condensation 1 |
| Earth Guardian | rare | Earth | any | self | — | 18 / 4 | shield 25 %, Shield | — |
| Thunder Palm | epic | Metal | palm | single | 200 % | 24 / 3 | Stun 30 % | Qi Condensation 6 |
| Crescent Wind Blade | epic | Wood | any | all_enemies | 110 % ×2 | 26 / 3 | Bleeding 40 % | — |
| Frozen Lotus | epic | Water | any | single | 150 % | 28 / 4 | delay 35 %, Slow, Freeze 25 % | Qi Condensation 4 |
| Swift Cloud Step | rare | Wood | any | self | — | 14 / 3 | haste 60 % | — |
| Returning Tide Stance | epic | Water | any | self | — | 20 / 4 | Counter Stance | Qi Condensation 5 |
| Gale Spear Step | rare | Wood | spear | self | — | 14 / 3 | haste 50 % | Qi Condensation 3 |
| Saber Guard Stance | rare | Earth | saber | self | — | 18 / 4 | Counter Stance | Qi Condensation 4 |
| Fan of Returning Wind | epic | Wood | fan | all_enemies | 90 % | 26 / 4 | delay 25 % | Foundation Establishment |
| Moon Sweep | rare | Water | staff | single | 120 % | 20 / 3 | delay 40 % | Qi Condensation 3 |
| Mirror Palm Stance | rare | Metal | palm | self | — | 14 / 3 | Counter Stance | Qi Condensation 4 |
| Ripple Mending | rare | Water | any | self | — | 22 / 4 | heal 25 %, Regeneration | — |
| Verdant Vine Bind | rare | Wood | any | single | 90 % | 20 / 4 | Poison 80 %, Silence 50 % | — |
| Swallow-Return Sword | epic | Metal | sword | single | 95 % ×2 | 22 / 2 | — | — |
| Frost Blossom Slash | epic | Water | sword | single | 170 % | 26 / 3 | Freeze 20 % | Qi Condensation 5 |
| Golden Coin Barrage | rare | Metal | any | single | 70 % ×3 | 18 / 2 | Defense Down 50 % | — |
| Abacus Reckoning | rare | Earth | any | single | 130 % | 20 / 3 | Attack Down 60 % | — |
| Iron Wall Stance | epic | Earth | any | self | — | 30 / 6 | Invulnerable | Foundation Establishment |
| Blazing Comet | epic | Fire | any | single | 210 % | 28 / 3 | Burning 60 % | Foundation Establishment |
| Glacial Spear Rain | epic | Water | any | all_enemies | 130 % | 30 / 4 | delay 30 %, Slow 80 % | Foundation Establishment |
| Ten Thousand Swords Return | legendary | Metal | any | single | 260 % | 36 / 4 | Defense Down | Core Formation |
| Crimson Moon Slash | epic | Fire | any | single | 200 % | 30 / 3 | Bleeding 70 % | Nascent Soul |
| Heavenly Thunder Palm | legendary | Metal | any | all_enemies | 250 % | 34 / 4 | Stun 40 % | Soul Transformation |
| Starfall Sword | legendary | Metal | any | all_enemies | 230 % | 40 / 5 | Stun 30 % | Spirit Severing |
| Violet Thunder Spear | legendary | Metal | any | single | 280 % | 38 / 4 | Stun 35 % | Dao Integration |
| Tidal Dragon Fist | legendary | Water | any | all_enemies | 270 % | 42 / 5 | delay 30 %, Slow 80 % | Tribulation Transcendence |
| Meteor Impact | legendary | Earth | any | all_enemies | 290 % | 44 / 5 | Defense Down | Mahayana |
| Vermilion Rebirth | legendary | Fire | any | self | — | 46 / 6 | heal 35 %, Regeneration | Immortal Ascension |
| Jade Tiger Claw | mythic | Wood | any | single | 320 % | 48 / 4 | Bleeding | Earth Immortal |
| Verdict of Heaven | mythic | Metal | any | all_enemies | 330 % | 52 / 5 | Silence 60 % | Heavenly Immortal |
| Emperor's Five-Element Seal | mythic | Earth | any | all_enemies | 360 % | 60 / 6 | Stun 40 % | Immortal King |

**Ultimate techniques the player can learn (2)**

| Technique | Rarity | Element | Weapon | Target | Power | SE / CD | Effects | Requires |
|---|---|---|---|---|---|---|---|---|
| Heavenly Sword Rain | epic | Metal | sword | all_enemies | 320 % | charge 100 | Defense Down | — |
| Soul Devouring Art | legendary | Water | any | single | 280 % | charge 100 | Silence | Foundation Establishment 3 |

**Passive techniques the player can learn (20)**

| Technique | Rarity | Element | Bonuses | Requires |
|---|---|---|---|---|
| Sword Mastery | rare | Metal | elem_dmg.metal +15, crit +2 | — |
| Iron Body | rare | Earth | def +12, dmg_red +5 | — |
| Spiritual Regeneration | rare | Water | sp_energy +30 | — |
| Critical Insight | epic | Metal | crit +6, crit_dmg +20 | — |
| Elemental Harmony | epic | Wood | elem_res.wood +8, elem_res.fire +8, elem_res.earth +8, elem_res.metal +8, elem_res.water +8 | — |
| Fire Heart | rare | Fire | elem_dmg.fire +10 | Foundation Establishment |
| Frost Body | rare | Water | elem_res.water +12, status_res +5 | Foundation Establishment |
| Sword Heart | epic | Metal | crit +5, elem_dmg.metal +10 | Core Formation |
| Demon-Slayer Will | epic | Fire | status_res +10, dmg_red +4 | Nascent Soul |
| Cloud Step | epic | Wood | eva +6, spd +4 | Soul Transformation |
| Star Sight | epic | Metal | acc +8, crit_dmg +15 | Spirit Severing |
| Lightning Reflex | epic | Metal | spd +6, eva +4 | Dao Integration |
| Dragon Scale Skin | legendary | Water | def +15, dmg_red +6 | Tribulation Transcendence |
| Desert Endurance | legendary | Earth | hp +12, heal_bonus +10 | Mahayana |
| Phoenix Heart | legendary | Fire | heal_bonus +15, elem_dmg.fire +12 | Immortal Ascension |
| Immortal Vitality | legendary | Wood | elem_dmg.wood +12, heal_bonus +8 | Earth Immortal |
| Law Insight | mythic | Metal | cdr +10, crit +6 | Heavenly Immortal |
| Emperor's Will | mythic | Earth | status_res +15, atk +5, def +5, hp +5 | Immortal King |
| Battle Focus | rare | Metal | acc +6, crit +2 | — |
| Spirit Shield Art | rare | Earth | shield_str +12 | — |

Enemy-only techniques: 28. Beast abilities: 40.

🟡 Only **two** ultimates are learnable by the player (Heavenly Sword Rain, Soul Devouring Art); the third ultimate in
the database is enemy-only. More player ultimates are a content gap (§30).

---

## 16. Spirit beasts

### 16.1 Collection ✅

20 beasts across 6 rarities (uncommon → immortal), 2–4 evolution stages each, one painted figure per stage. Screen: Cultivate → Spirit
Beasts, or the Spirit Beast Garden (Qin).

| Beast | 中文 | Rarity | Element | Species | Stages (level) | Egg found |
|---|---|---|---|---|---|---|
| YunYun | 云云 | uncommon | Water | Cloud Fox | Cloud Kit (1) → Cloud Fox (10) → Cloud Fox Guardian (25) → Cloud Sovereign Fox (45) | Cloud Fox Egg |
| Flame Fox | 焰狐 | rare | Fire | Flame Fox | Ember Kit (1) → Flame Fox (12) → Blaze Fox (28) | Flame Fox Egg |
| Ember Salamander | 火蜥灵 | uncommon | Fire | Salamander | Ember Salamander Hatchling (1) → Ember Salamander (16) → Elder Ember Salamander (34) | Ember Salamander Egg |
| Azure Wolf | 苍狼 | uncommon | Metal | Wolf | Azure Wolf Hatchling (1) → Azure Wolf (16) → Elder Azure Wolf (34) | Azure Wolf Egg |
| Snow Crane | 雪鹤 | rare | Water | Crane | Snow Crane Hatchling (1) → Snow Crane (18) → Elder Snow Crane (37) | Snow Crane Egg |
| Frost Otter | 霜獭 | uncommon | Water | Otter | Frost Otter Hatchling (1) → Frost Otter (18) → Elder Frost Otter (37) | Frost Otter Egg |
| Jade Serpent | 翠蛇 | rare | Wood | Serpent | Jade Serpent Hatchling (1) → Jade Serpent (20) → Elder Jade Serpent (40) | Jade Serpent Egg |
| Blood-Moon Wolf | 血月狼 | rare | Fire | Wolf | Blood-Moon Wolf Hatchling (1) → Blood-Moon Wolf (22) → Elder Blood-Moon Wolf (43) | Blood-Moon Wolf Egg |
| Ghost Lantern Moth | 鬼灯蛾 | rare | Fire | Moth | Ghost Lantern Moth Hatchling (1) → Ghost Lantern Moth (22) → Elder Ghost Lantern Moth (43) | Ghost Lantern Moth Egg |
| Thunder Tiger | 雷虎 | epic | Metal | Tiger | Thunder Tiger Hatchling (1) → Thunder Tiger (24) → Elder Thunder Tiger (46) → Sovereign Thunder Tiger (66) | Thunder Tiger Egg |
| Cloud Qilin | 云麒麟 | epic | Earth | Qilin | Cloud Qilin Hatchling (1) → Cloud Qilin (26) → Elder Cloud Qilin (49) → Sovereign Cloud Qilin (69) | Cloud Qilin Egg |
| Storm Roc | 雷鹏雏 | epic | Metal | Roc | Storm Roc Hatchling (1) → Storm Roc (28) → Elder Storm Roc (52) → Sovereign Storm Roc (72) | Storm Roc Egg |
| Lightning Eel | 雷鳗 | epic | Water | Eel | Lightning Eel Hatchling (1) → Lightning Eel (28) → Elder Lightning Eel (52) → Sovereign Lightning Eel (72) | Lightning Eel Egg |
| Black Tortoise | 玄武 | legendary | Water | Tortoise | Black Tortoise Hatchling (1) → Black Tortoise (30) → Elder Black Tortoise (55) → Sovereign Black Tortoise (75) | Black Tortoise Egg |
| Sand Dragon | 沙龙 | legendary | Earth | Dragon | Sand Dragon Hatchling (1) → Sand Dragon (32) → Elder Sand Dragon (58) → Sovereign Sand Dragon (78) | Sand Dragon Egg |
| Starlight Deer | 星光鹿 | legendary | Wood | Deer | Starlight Deer Hatchling (1) → Starlight Deer (32) → Elder Starlight Deer (58) → Sovereign Starlight Deer (78) | Starlight Deer Egg |
| Vermilion Bird | 朱雀 | legendary | Fire | Phoenix | Vermilion Bird Hatchling (1) → Vermilion Bird (34) → Elder Vermilion Bird (61) → Sovereign Vermilion Bird (81) | Vermilion Bird Egg |
| White Tiger | 白虎 | mythic | Metal | Tiger | White Tiger Hatchling (1) → White Tiger (36) → Elder White Tiger (64) → Sovereign White Tiger (84) | White Tiger Egg |
| Nine-Tailed Fox | 九尾狐 | mythic | Fire | Fox | Nine-Tailed Fox Hatchling (1) → Nine-Tailed Fox (38) → Elder Nine-Tailed Fox (67) → Sovereign Nine-Tailed Fox (87) | Nine-Tailed Fox Egg |
| Azure Dragon | 青龙 | immortal | Water | Dragon | Azure Dragon Hatchling (1) → Azure Dragon (40) → Elder Azure Dragon (70) → Sovereign Azure Dragon (90) | Azure Dragon Egg |

### 16.2 Eggs and hatching ✅

Two incubators. An egg hatches after a number of **battles won** (4 for YunYun's egg, 8–26 for the others) — never
from waiting. Eggs are found in each region's chests and the secret-realm vaults, and one comes from an NPC quest; some need a realm. The new disciple starts with
YunYun's egg; the first hatched beast becomes the active companion.

### 16.3 Growth ✅

| Activity | Effect |
|---|---|
| Feed | food XP (×1.5 for its favourite food or its element) and bond |
| Play | +2 bond, once every 30 min per beast |
| Train | 5 adventure energy for 15 % of the next level |
| Battle won | the active beast gets 50 % of the fight's mastery XP (min 5) and +1 bond |
| Evolve | at the next stage's level, with its materials and stones; new art, stats and passive |

XP to the next level = 40 · level^1.5. A beast cannot pass the next stage's level until it evolves (extra XP is banked
for one level). Bond level L → L+1 costs 10 · (L+1) points; bond milestones add stats to the player while the beast is
active. The active beast adds its stage passive and its cultivation bonus to the Qi rate.

🟡 *Found while writing this document:* the level cap after the **last** stage is the global `max_level` 60, but 11
beasts reach their last stage at level 66–90, so they stop levelling the moment they evolve. The cap should be
`max(60, last stage level + headroom)` — to fix in a content/rules pass.

### 16.4 In battle ✅

The active beast fights beside the player: stats scale +2.5 % per level from its stage profile, it has its own ability
(40 beast abilities in the database, 3-turn cooldown by default) and the player can make it act through the "Beast"
slot of the auto-battle rules. Enemies don't waste turns on a beast while the cultivator stands.

---

## 17. Alchemy

Alchemy Hall. Recipes list ingredients (owned / needed), stone cost, furnace grade, proficiency and the success chance.

```
success = recipe base + furnace bonus + min(10 %, (proficiency − recipe minimum) / 5000)      (cap 98 %)
```

Each load in a batch (up to **10**) rolls on its own. Success gives the pill (plus one more at the furnace's yield
chance) and full proficiency XP; failure gives a quarter of the XP, returns 30 % of the herbs and leaves a byproduct
(Bitter Medicine). Pills: Qi pills, timed Qi multipliers, healing, breakthrough pills
(+% chance, capped at +40 %), permanent elixirs.

| Furnace | Grade | Success + | Yield + | Upgrade to next |
|---|---|---|---|---|
| Bronze Furnace | 1 | 5 % | — | 2000 stones + Spirit Iron Ore ×20 |
| Iron Furnace | 2 | 10 % | 5 % | 12k stones + Rime Crystal ×5, Glacier Iron Ore ×10 |
| Jade Furnace | 3 | 18 % | 10 % | 400k stones + Dragonbone Ore ×12, Dragon Pearl ×2 |
| Spirit Furnace | 4 | 24 % | 15 % | 4M stones + Immortal Jade ×10, Realm-Heart Jade ×2 |
| Immortal Furnace | 5 | 30 % | 20 % | — |

| Pill | Ingredients | Stones | Success | Furnace | Proficiency (min / +xp) | Unlock | Effect |
|---|---|---|---|---|---|---|---|
| Qi Gathering Pill | Spirit Grass ×2, Peach Blossom ×1, Crane Feather ×1 | 10 | 70 % | 1 | 0 / +20 | known | +600 Qi |
| Blossom Healing Pill | Peach Blossom ×3, Spirit Grass ×1 | 12 | 75 % | 1 | 0 / +20 | known | heal 40 % |
| Spirit Condensing Pill | Bamboo Spirit Shoot ×3, Spirit Grass ×4, Frost Beast Core ×1 | 40 | 60 % | 1 | 50 / +45 | 300 Fame | +2500 Qi, Qi ×1.2 60 min |
| Ember Marrow Pill | Fire Bud ×4, Salamander Scale ×2, Ember Core ×1 | 900 | 50 % | 1 | 120 / +90 | 600 Fame | +2400 Qi, Qi ×1.26 30 min |
| Foundation Pill | Spirit Grass ×10, Jade Bamboo Segment ×4, Frost Beast Core ×2, Boar Tusk ×2 | 200 | 45 % | 2 | 150 / +120 | 500 Fame | +8000 Qi, +10 % breakthrough |
| Frost Lotus Pill | Snow Lotus Petal ×4, Yeti Fur ×2, Lotus Ice Heart ×1 | 1600 | 50 % | 1 | 160 / +120 | 1000 Fame | +2400 Qi, Qi ×1.28 30 min |
| Core Condensing Pill | Flame Lotus ×1, Green Viper Venom ×5, Bamboo Dragon Scale ×1, Jade Bamboo Segment ×10 | 1500 | 40 % | 3 | 200 / +500 | Inner Disciple | +40k Qi, +15 % breakthrough |
| Sword Marrow Pill | Sword Grass ×4, Sword Spirit Shard ×2, Sword Intent Crystal ×1 | 2500 | 50 % | 2 | 200 / +150 | 1500 Fame | +36k Qi, Qi ×1.3 30 min |
| Demon-Purge Pill | Blood Lotus ×4, Demon Horn ×2, Crimson Moon Shard ×1 | 3600 | 50 % | 2 | 240 / +180 | 2500 Fame | +540k Qi, Qi ×1.32 30 min |
| Celestial Peach Pill | Celestial Peach ×4, Thunder Feather ×2, Heaven Pine Amber ×1 | 4900 | 50 % | 2 | 280 / +210 | 4000 Fame | +7.2M Qi, Qi ×1.34 30 min |
| Frost Heart Elixir | Frost Beast Core ×3, Rime Crystal ×2, Peach Blossom ×5 | 350 | 50 % | 2 | 300 / +200 | Recipe: Frost Heart Elixir | permanent elem_res.water +3, sp_energy +10 |
| Star-Dew Pill | Star-Dew Grass ×4, Jellyfish Silk ×2, Heavenly Star Crystal ×1 | 6400 | 50 % | 2 | 320 / +240 | 6000 Fame | +90M Qi, Qi ×1.36 30 min |
| Thunder-Tempering Pill | Thunderroot ×4, Roc Lightning Feather ×2, Tribulation Core ×1 | 8100 | 50 % | 2 | 360 / +270 | 9000 Fame | +1.1B Qi, Qi ×1.38 30 min |
| Dragon Marrow Pill | Sea-Jade Kelp ×4, Kraken Ink ×2, Dragon Pearl ×1 | 10k | 50 % | 3 | 400 / +300 | 12000 Fame | +12B Qi, Qi ×1.4 30 min |
| Meteor Core Pill | Desert Star Flower ×4, Sand Wyrm Tooth ×2, Meteor Heart ×1 | 12.1k | 50 % | 3 | 440 / +330 | 16000 Fame | +132B Qi, Qi ×1.42 30 min |
| Phoenix Rebirth Pill | Phoenix Lotus ×4, Phoenix Down ×2, Gate-Light Crystal ×1 | 14.4k | 50 % | 3 | 480 / +360 | 20000 Fame | +1.4T Qi, Qi ×1.44 30 min |
| Immortal Peach Pill | Immortal Peach Blossom ×4, White Tiger Fang ×2, Realm-Heart Jade ×1 | 16.9k | 50 % | 4 | 520 / +390 | 26000 Fame | +15.6T Qi, Qi ×1.46 30 min |
| Golden Law Pill | Law Flower ×4, Golden Crow Feather ×2, Law-Wheel Fragment ×1 | 19.6k | 50 % | 4 | 560 / +420 | 34000 Fame | +168T Qi, Qi ×1.48 30 min |
| Emperor Ascension Pill | Primordial Lotus ×4, Azure Dragon Scale ×2, Primordial Chaos Stone ×1 | 22.5k | 50 % | 5 | 600 / +450 | 45000 Fame | +1.9e16 Qi, Qi ×1.5 30 min |

Forge recipes: 18 (Azure Iron Sword, Rimeglass Spear, Rimeglass Robe, Rimeglass Boots, Demonbane Fan, Blazeforge Saber, Frostlotus Circlet, Tombsong Sword, Crimson Vow Ring, Skyward Staff, Starward Mirror, Stormcall Spear, Tidecaller Amulet, Starborn Fan, Ascendant Crown, Jadeclaw Sword, Lawbound Robe, Emperor's Saber).

**Breakthrough pills**: Foundation needs the Foundation Pill, Core Formation the Core Condensing Pill, and every realm
from Nascent Soul on consumes the pill of the region with its number (brewed from that region's herb, beast part and
crystal), so every region's alchemy stays useful to the end.

---

## 18. The Azure Cloud Sect

The Sect tab is the floating-island sect map; each location opens its own screen with its NPC, services and art.

| Location | 中文 | Activities | People | Opens |
|---|---|---|---|---|
| Sword Grounds | 剑场 | duels | Bai Lingshuang | start |
| Mission Hall | 任务堂 | missions, exchange | — | start |
| Scripture Pavilion | 藏经阁 | pavilion | Elder Feng Wanqiu | start |
| Meditation Waterfall | 静心瀑 | meditation | — | start |
| Merchant Pavilion | 百宝阁 | merchant | Tang Xiaoman | start |
| Alchemy Hall | 丹药房 | alchemy | — | start |
| Spirit Forge | 炼器坊 | forge | Master Gu | start |
| Spirit Beast Garden | 灵兽园 | beasts | Qin | start |
| Your Quarters | 居所 | quarters, storage, rest | Elder Wen | start |
| Proving Arena | 演武台 | tournament | — | start |
| Inner Sect Peak | 内门峰 | meditation, rest | — | Inner Disciple |
| Frozen Lotus Valley | 冰莲谷 | meditation | — | 800 Fame |

| Location | What happens there |
|---|---|
| Sword Grounds | spar with Bai Lingshuang (duels, no energy) |
| Mission Hall | daily and repeatable requests (17 missions: deliver, hunt, gather) paying stones, Fame and **Contribution**; the Contribution Exchange |
| Scripture Pavilion | buy methods, techniques and manuals; the Dao Insight Crystal row |
| Meditation Waterfall | Qi ×1.25 location; paid meditation sessions (§4.5) |
| Merchant Pavilion | Tang Xiaoman's shop: buy, **sell** (batch sell junk / a rarity), rumours |
| Alchemy Hall | §17 |
| Spirit Forge | §13 (Master Gu) |
| Spirit Beast Garden | beasts, food shop (Qin) |
| Your Quarters | Journal (quests, achievements, story so far), storage chest (depot) and expansions, Rest (full heal), Elder Wen |
| Proving Arena | the three sect tournaments (§20) |
| Inner Sect Peak | Qi ×1.4 location and rest (Inner Disciple) |
| Frozen Lotus Valley | Qi ×1.35 location (800 Fame) |

The player chooses where to cultivate; the location multiplies the Qi rate.

---

## 19. Sect Fame and ranks

**Sect Fame** is earned from quests, bosses, tournaments, achievements and Mission Hall requests, and lost when a
tournament is lost. It unlocks ranks, sect locations, shop rows, alchemy recipes and longer meditation sessions, and
gives a shop discount (−5 % per 500 Fame at the merchant).

| # | Rank | 中文 | Fame | Promotion | Benefits |
|---|---|---|---|---|---|
| 1 | Outer Disciple | 外门弟子 | 0 | — | Qi ×1, shop tier 1 |
| 2 | Inner Disciple | 内门弟子 | 1500 | The Bamboo Sovereign, win Outer Sect Tournament | Qi ×1.1, shop tier 2, Inner Sect Peak |
| 3 | Core Disciple | 核心弟子 | 4000 | Trial of the Green Labyrinth, win Inner Sect Tournament | Qi ×1.2, shop tier 3 |
| 4 | Direct Disciple | 亲传弟子 | 9000 | win Core Sect Tournament | Qi ×1.3, shop tier 4 |
| 5 | Elder | 长老 | 20000 | — | Qi ×1.45, shop tier 5 |
| 6 | Grand Elder | 太上长老 | 50000 | — | Qi ×1.6, shop tier 6 |

Each rank order also adds +10 max energy and +10 bag and depot slots. The rank screen shows the next rank's
requirements with a Go per missing step.

---

## 20. Tournaments

| Tournament | Entry | Rounds (opponent · CP) | Champion |
|---|---|---|---|
| Outer Sect Tournament | Foundation Establishment 1, Outer Disciple, 1000 Fame | Zhao Lie 1200 → Shen Qingxue 1500 → Tie Shanhe 1900 → Mo Lianjue 2400 | 3000 stones, 500 Fame, Foundation Pill ×2, Heavenly Sword Rain, title Outer Sect Champion |
| Inner Sect Tournament | Core Formation 1, Inner Disciple, 4000 Fame | Lu Feiyan 3500 → Su Wanqing 4500 → Han Jinghong 5500 → Mo Lianjue 6500 | 12000 stones, 1500 Fame, Awakening Crystal ×1, Dao Insight Crystal ×2 |
| Core Sect Tournament | Nascent Soul 1, Core Disciple, 9000 Fame | Shen Qingxue 15000 → Han Jinghong 19000 → Gu Xuanming 24000 → Bai Lingshuang 30000 | 50000 stones, 4000 Fame, Dao Insight Crystal ×5 |

One round per entry; the bracket position is saved, so the player can leave between rounds. Each round is a fresh bout
at full HP, alone (no beast's or companion's help), against a duelist built from the NPC at the round's CP; each round
pays its reward. Winning the final grants the champion rewards and records the trial for the rank promotion. Losing
costs Fame and resets the bracket; re-entry needs the entry requirements again.

---

## 21. NPCs, relationships, gifts and Dao companions

| NPC | 中文 | Role | Where | Elements | Dao companion | Duel |
|---|---|---|---|---|---|---|
| Bai Lingshuang | 白凌霜 | senior | Sword Grounds | Water, Metal | yes (dps) | yes |
| Tang Xiaoman | 唐小蛮 | merchant | Merchant Pavilion | Metal, Earth | yes (support) | yes |
| Elder Wen | 温长老 | elder | Your Quarters | Earth, Wood | — | — |
| Elder Feng Wanqiu | 冯万秋长老 | elder | Scripture Pavilion | Metal | — | — |
| Qin | 秦 | beast_keeper | Spirit Beast Garden | Wood, Earth | — | — |
| Master Gu | 顾师傅 | instructor | Spirit Forge | Fire, Metal | — | — |
| Zhao Lie | 赵烈 | opponent | — | Fire | — | yes |
| Shen Qingxue | 沈清雪 | opponent | — | Water | — | yes |
| Tie Shanhe | 铁山河 | opponent | — | Earth | — | yes |
| Mo Lianjue | 墨连珏 | opponent | — | Metal | — | yes |
| Old Kang | 老康 | villager | Ash Foothills | Fire | — | — |
| Hermit Shuang | 霜隐士 | story | Snowgate | Water | — | — |
| Blind Swordsmith Yu | 盲剑匠俞 | instructor | Tomb Gate | Metal | — | — |
| Defector Lian | 叛修莲 | story | Black Pass | Fire | — | — |
| Crane Boy Ming | 鹤童明 | story | Cloud Gate | Metal | — | — |
| Star-Reader Wu | 观星吴 | story | First Heaven | Water | — | — |
| Storm Widow Jin | 雷寡金 | story | Glass Flats | Metal | — | — |
| Fisherwoman Ah-Hai | 渔娘阿海 | villager | Tide Gate | Water | — | — |
| Caravan Princess Zahra | 驼队公主扎赫拉 | story | Caravan Gate | Earth | — | — |
| Immortal Wanderer Qiu | 游仙丘 | story | Trial Gate | Fire | — | — |
| Peach Keeper Mei | 桃守梅 | story | Jade Steps | Wood | — | — |
| Heavenly Clerk Fu | 天吏符 | story | Palace Gate | Metal | — | — |
| Throne Steward Lao | 座前司老 | elder | Cloud Threshold | Water | — | — |
| Lu Feiyan | 陆飞燕 | opponent | — | Wood | — | yes |
| Han Jinghong | 韩惊鸿 | opponent | — | Fire | — | yes |
| Su Wanqing | 苏婉清 | opponent | — | Wood | — | yes |
| Gu Xuanming | 顾玄明 | opponent | — | Metal | — | yes |

### 21.1 Affinity ✅

Levels: **Stranger 0 · Acquaintance 50 · Friend 300 · Confidant 600 · Dao Companion 1000**. Raised by chat (+3 once a
day, a line for the current level), topics (+5 the first time), gifts, quests and story choices. Levels unlock chat
lines, topics, quests, shop discounts (Tang: −3 % per level), duels and story scenes. The NPC screen shows the portrait,
affinity bar, what they like, talk / topics / gift / duel / quests.

### 21.2 Gifts ✅

11 gifts. Value = explicit loved / liked / disliked values, else loved tags ×3, liked tags ×2, neutral ×1 of the gift's
base affinity; the same gift again that day is worth ×0.5 each time; **3 gifts per NPC per day**. The gift sheet shows
each NPC's reaction before giving.

### 21.3 Dao companions ✅

Bai Lingshuang (dps) and Tang Xiaoman (support) can be asked at level 4 (Dao Companion). A bonded companion gives
**dual cultivation ×1.1 Qi**; up to 2 are active. They join adventure places and events (1 slot) and dungeons that allow
a party (mega dungeons 2); tribulations, duels and tournaments are faced alone. Companion stats keep their profile's
ratios scaled so their HP is 75 % of the player's; in battle they follow the player's **stance** for them (Guard /
Balanced / Burst, §8.8).

### 21.4 Duels ✅

Bai, Tang and the tournament opponents can be challenged at the Sword Grounds: no energy, nothing lost on defeat; a win
pays the duel's rewards and mastery XP and counts for quests.

---

## 22. Quests

### 22.1 Types and states ✅

Quests: 113 — main 33, cultivation 15, alchemy 1, forge 1, dungeon 14, combat 14, hidden 1, mission 17, npc 16, beast 1; repeatable: 29.

Objective types in use: deliver 29, defeat 29, reach_realm 17, clear 15, explore 14, collect 4, story 1, refine 1, enhance 1, tower_floor 1, win_duel 1, hatch 1, evolve 1.

| # | Main quest | Needs | Objective | Rewards |
|---|---|---|---|---|
| 1 | The Path Begins | — | story  | 100 stones, 20 Fame |
| 2 | Senior Sister | — | deliver Elder Wen's Token | 20 Fame, Blossom Healing Pill ×2 |
| 3 | First Breath | — | reach_realm Qi Condensation | 150 stones, Qi Gathering Pill ×3 |
| 4 | First Hunt | — | defeat Wild Boar ×3 | 200 stones, 30 Fame, Lesser Enhancement Stone ×3 |
| 5 | The Bandit Chief | Qi Condensation 3 | defeat Bandit Chief Hu | 300 stones, 60 Fame, Earth Guardian |
| 6 | Into the Bamboo | — | explore Azure Bamboo Forest | 250 stones, 40 Fame |
| 7 | The Bamboo Sovereign | Qi Condensation 7 | defeat Thousand-Node Bamboo Dragon | 800 stones, 200 Fame, Foundation Pill ×1 |
| 8 | Into the Blazing Mountain | — | explore Blazing Mountain | 900 stones, 60 Fame |
| 9 | Sovereign of the Blazing Mountain | Foundation Establishment 5 | defeat Molten Ape King | 3600 stones, 240 Fame, Blazing Comet, rare Blazeforge Saber |
| 10 | Into the Frozen Lotus Valley | — | explore Frozen Lotus Valley | 1600 stones, 80 Fame |
| 11 | Sovereign of the Frozen Lotus Valley | Foundation Establishment 5 | defeat Lotus Frost Queen | 6400 stones, 320 Fame, Glacial Spear Rain, rare Frostlotus Circlet |
| 12 | Into the Ancient Sword Tomb | — | explore Ancient Sword Tomb | 2500 stones, 100 Fame |
| 13 | Sovereign of the Ancient Sword Tomb | Core Formation 5 | defeat Sword Sovereign's Remnant | 10k stones, 400 Fame, Ten Thousand Swords Return, epic Tombsong Sword |
| 14 | Into the Demon Territory | — | explore Demon Territory | 3600 stones, 120 Fame |
| 15 | Sovereign of the Demon Territory | Nascent Soul 5 | defeat Crimson Moon Matriarch | 14.4k stones, 480 Fame, Crimson Moon Slash, epic Crimson Vow Ring |
| 16 | Into the Celestial Mountains | — | explore Celestial Mountains | 4900 stones, 140 Fame |
| 17 | Sovereign of the Celestial Mountains | Soul Transformation 5 | defeat Celestial Stair Guardian | 19.6k stones, 560 Fame, Heavenly Thunder Palm, epic Skyward Staff |
| 18 | Into the Nine Heavens | — | explore Nine Heavens | 6400 stones, 160 Fame |
| 19 | Sovereign of the Nine Heavens | Spirit Severing 5 | defeat Heavenly Gate Keeper | 25.6k stones, 640 Fame, Starfall Sword, legendary Starward Mirror |
| 20 | Into the Thunderclap Wastes | — | explore Thunderclap Wastes | 8100 stones, 180 Fame |
| 21 | Sovereign of the Thunderclap Wastes | Dao Integration 5 | defeat Nine-Bolt Thunder Emperor | 32.4k stones, 720 Fame, Violet Thunder Spear, legendary Stormcall Spear |
| 22 | Into the Sunken Dragon Sea | — | explore Sunken Dragon Sea | 10k stones, 200 Fame |
| 23 | Sovereign of the Sunken Dragon Sea | Tribulation Transcendence 5 | defeat Drowned Dragon Lord | 40k stones, 800 Fame, Tidal Dragon Fist, legendary Tidecaller Amulet |
| 24 | Into the Starfall Desert | — | explore Starfall Desert | 12.1k stones, 220 Fame |
| 25 | Sovereign of the Starfall Desert | Mahayana 5 | defeat Starfall Pharaoh | 48.4k stones, 880 Fame, Meteor Impact, mythic Starborn Fan |
| 26 | Into the Gate of Ascension | — | explore Gate of Ascension | 14.4k stones, 240 Fame |
| 27 | Sovereign of the Gate of Ascension | Immortal Ascension 5 | defeat Vermilion Gatekeeper | 57.6k stones, 960 Fame, Vermilion Rebirth, mythic Ascendant Crown |
| 28 | Into the Jade Immortal Realm | — | explore Jade Immortal Realm | 16.9k stones, 260 Fame |
| 29 | Sovereign of the Jade Immortal Realm | Earth Immortal 5 | defeat White Tiger Sovereign | 67.6k stones, 1040 Fame, Jade Tiger Claw, mythic Jadeclaw Sword |
| 30 | Into the Golden Palace of Laws | — | explore Golden Palace of Laws | 19.6k stones, 280 Fame |
| 31 | Sovereign of the Golden Palace of Laws | Heavenly Immortal 5 | defeat Arbiter of Ten Thousand Laws | 78.4k stones, 1120 Fame, Verdict of Heaven, mythic Lawbound Robe |
| 32 | Into the Throne of the Immortal Emperor | — | explore Throne of the Immortal Emperor | 22.5k stones, 300 Fame |
| 33 | Sovereign of the Throne of the Immortal Emperor | Immortal King 5 | defeat Remnant of the First Emperor | 90k stones, 1200 Fame, Emperor's Five-Element Seal, mythic Emperor's Saber |

States: locked → available → active → ready → done (repeatables: cooldown). `system` quests auto-accept;
`turn_in: auto` completes on its own; deliver / collect quests take the items. Counted objectives only count progress
made after accepting. Every reference (enemy, item, NPC, place, technique, realm, quest) is checked by the validator, and
every quest is completable from a reachable state.

### 22.2 Quest journal ✅

Tabs by type, progress per objective, rewards with art, the giver, the recommended CP and a hint.

### 22.3 Tracking and navigation ✅

One quest is tracked: it shows in the header, the victory screen and the map (its place is marked; if that place is
still locked, the next playable place pulses). **Go ▸** on a quest or objective jumps straight to where it is done (the
place on the map, the sect location, the NPC, the forge tab…), and to the turn-in when it is complete.

---

## 23. Achievements and titles

| Achievement | Category | Condition | Rewards |
|---|---|---|---|
| Foundation Laid | cultivation | Reach Foundation Establishment. | 500 stones, title Path of the Cultivator |
| Mortal Plains Charted | exploration | Clear every node in the Mortal Plains. | 300 stones, Refining Stone ×2 |
| Hundred Victories | combat | Defeat 100 enemies. | 400 stones, Spirit Enhancing Stone ×2 |
| Boss Hunter I | combat | Defeat 5 bosses. | 600 stones |
| Hidden Paths | exploration | Discover 3 hidden encounters. | Rare Treasure Map ×1 |
| Beast Friend | beasts | Hatch your first spirit beast. | Verdant Spirit Fruit ×5 |
| Inner Disciple | sect | Win the Outer Sect Tournament and rise to Inner Disciple. | 1000 stones |
| Untouched *(hidden)* | hidden | Reach floor 10 of the Heaven-Piercing Tower. | Sword Rain Fragment ×2 |
| Blazing Mountain Charted | exploration | Explore every place in the Blazing Mountain. | 1800 stones, Ember Core ×2 |
| Frozen Lotus Valley Charted | exploration | Explore every place in the Frozen Lotus Valley. | 3200 stones, Lotus Ice Heart ×2 |
| Ancient Sword Tomb Charted | exploration | Explore every place in the Ancient Sword Tomb. | 5000 stones, Sword Intent Crystal ×2 |
| Demon Territory Charted | exploration | Explore every place in the Demon Territory. | 7200 stones, Crimson Moon Shard ×2 |
| Celestial Mountains Charted | exploration | Explore every place in the Celestial Mountains. | 9800 stones, Heaven Pine Amber ×2 |
| Nine Heavens Charted | exploration | Explore every place in the Nine Heavens. | 12.8k stones, Heavenly Star Crystal ×2 |
| Thunderclap Wastes Charted | exploration | Explore every place in the Thunderclap Wastes. | 16.2k stones, Tribulation Core ×2 |
| Sunken Dragon Sea Charted | exploration | Explore every place in the Sunken Dragon Sea. | 20k stones, Dragon Pearl ×2 |
| Starfall Desert Charted | exploration | Explore every place in the Starfall Desert. | 24.2k stones, Meteor Heart ×2 |
| Gate of Ascension Charted | exploration | Explore every place in the Gate of Ascension. | 28.8k stones, Gate-Light Crystal ×2 |
| Jade Immortal Realm Charted | exploration | Explore every place in the Jade Immortal Realm. | 33.8k stones, Realm-Heart Jade ×2 |
| Golden Palace of Laws Charted | exploration | Explore every place in the Golden Palace of Laws. | 39.2k stones, Law-Wheel Fragment ×2 |
| Throne of the Immortal Emperor Charted | exploration | Explore every place in the Throne of the Immortal Emperor. | 45k stones, Primordial Chaos Stone ×2 |

| Title | Bonus | From |
|---|---|---|
| Path of the Cultivator | sp_energy +10 | Granted on completing Foundation Establishment. |
| Outer Sect Champion | atk +20 | Victor of the Outer Sect Tournament. |
| Tower Conqueror | hp +2000, spd +10 | Reached the summit of the Heaven-Piercing Tower. |

Achievements unlock automatically with a toast and pay stones, items and titles; a title's bonus applies while it is
held. 🟡 The categories requested in the original spec for **equipment, alchemy and relationships** have no achievements
yet (21 in total; mostly one per region charted).

---

## 24. Economy

### 24.1 Currencies ✅

| Currency | Earned from | Spent on |
|---|---|---|
| **Spirit stones** | every fight and chest, quests, sweeps, tower floors, the daily board, selling (gear 40 % of its CP value) | enhancement (+10 / +15 is the long sink), refinement, reforge, awakening, crafting, alchemy, furnaces, shops, meditation, inventory expansions |
| **Sect Fame** | §19 | ranks and unlocks (it is a threshold, not spent — except on a lost tournament) |
| **Contribution** | Mission Hall requests and hunts (10 + 5 × region, daily repeatable), the daily board | the Contribution Exchange (weekly stock) |
| **Energy** | regenerates (§24.2) | map fights, gathering, dungeons, secret realms, beast training |

### 24.2 Energy ✅

500 max (+10 per rank order), +1 every 1.2 minutes, ≈1,200 a day; costs in §10.5. Tower, tournaments and duels are
free; a lost fight costs no extra energy.

### 24.3 Shops ✅

| Shop | Owner | Restock | Stock rows | Notes |
|---|---|---|---|---|
| Merchant Pavilion | Tang Xiaoman | daily | 27 | buys items, 6 rumours, −3 %/affinity level, −5 %/500 Fame, realm-scaled rows |
| Contribution Exchange | Elder Wen | weekly | 5 | priced in Contribution |
| Scripture Pavilion | Elder Feng Wanqiu | none | 37 |  |
| Tang's Caravan | Tang Xiaoman | per_visit | 6 | buys items |
| Beast Garden Supplies | Qin | daily | 4 |  |
| Hidden Merchant of the Origin |  | per_visit | 4 |  |

Entries are unlock-gated (realm, rank, Fame, affinity). Discounts: affinity level × the owner's rate plus the Fame
discount, capped at 30 %. Limited stock resets per period (daily UTC day, weekly, per visit = 6 h). A row with
`scale.per_realm` costs price × factor^(realm − 1): the Pavilion's **Dao Insight Crystal** (1 a day, ×1.7) and bulk
refining stones (×1.5) stay a real sink in every realm.

### 24.4 The crystal loop ✅

Dao Insight Crystals gate every major breakthrough from Nascent Soul on (2 → 13 per realm). Sources: region bosses
(with bad-luck protection: five misses in a row guarantee one), resource dungeon tier V, tribulations (70 %, 1–3), mega-dungeon
bosses (2–4) and clears (3–5), tower milestones, the Inner Sect Tournament, the Contribution Exchange (3 a week) and the Pavilion (1 a day, realm-scaled price).

### 24.5 Today's board ✅

Five daily tasks (reset with the day): turn in 2 Mission Hall requests, win 8 map battles, clear a dungeon, fight a
tournament round, gather 3 times. **Four of five** claim the day's reward: 150 · n² stones, 20 + 5n Contribution and 3
refining stones (n = furthest region opened). The panel sits on the Cultivate page; its sheet has a Go per task.

---

## 25. Main menu, saves and settings

### 25.1 Main menu ✅

Title art; **Continue** (last slot); four save slots with a summary (name, character, realm and stage, rank, regions opened,
quests done, Fame, play time, last save), per slot Load / Save here / Export file / Delete (confirmed); **Import a save
file** (.iasave into the first empty slot); Settings. In game the same menu opens as an overlay.

### 25.2 Saves ✅

- Four slots. Autosave every **30 s** of play, right after important actions (breakthrough, purchase, equip, victory…),
  when the app goes to the background, and on manual save.
- Save file = versioned JSON (state version 7) with checksum (FNV-1a over a canonical form), validated with zod on load.
- Atomic write with a `.bak` copy; a damaged save is repaired or rolled back to the backup automatically.
- Migrations upgrade older saves; export / import as `.iasave` files. Saves never leave the phone unless exported.
- Offline time is computed from the save timestamp with a clock guard against moving the device clock back.

### 25.3 Settings ✅

| Group | Settings |
|---|---|
| Audio | music volume, sound-effect volume (🟡 no audio exists yet, §26.3) |
| Battle | battle speed 1× / 2× / 3×, auto-battle by default, damage numbers, screen shake, battle stage (Arena / Classic) |
| Display & Accessibility | animation quality (low / medium / high), reduced motion, text size, tips (reset seen tips), language |
| Save & Data | save now, export, import, slot management |
| Files & Safety | automatic backup, save upgrades, local-only storage explained |

---

## 26. Art, animation and audio

### 26.1 Art ✅ / 🟡

Every database entry carries an art block (file path, size, transparency, prompt, reference images, status
planned → generated → approved); art is generated from the database, never ad hoc. Model: **Qwen-Image-Edit 2511** (fp8,
4-step Lightning) in ComfyUI Desktop on the owner's PC (RTX 3080 10 GB), RMBG-2.0 for transparency, mockup crops as
identity references. Status today: **1,341 generated, 28 approved, 16 planned** (7 new status icons, 9 new technique
icons). Image generation is **paused** at the owner's request.

### 26.2 Animation 🟡

Layered cutout rigs with a deformable mesh rendered in WebGL2, built from each figure's battle sprite plus four
Qwen-Image-Edit renders (no-weapon body, eyes closed, hair tag, cloth tag); procedural clips per archetype (idle, enter,
attack, cast, ult, hit, dodge, victory, defeat) synchronised to the contact frame; quality low / medium / high; falls
back to the still sprite. **18 rigs built; 402 of 737 renders done** on the PC. Battle effects, camera, hit-stop,
ultimate cut-ins and UI motion are all in place (§8.9).

### 26.3 Audio ⏳

Music, ambient sound and sound effects are specified (sect theme, region themes, battle and boss themes, tribulation
theme, UI and combat SFX) but **none exist yet**; the volume settings are wired and waiting.

---

## 27. Balance

Model: `docs/qa/BALANCE_MODEL.md`; tools: `tools/balance/` (`sim.ts` single fights, `journey.ts` whole-game play-through
simulation, `ai_eval.ts` auto-battle quality); `npm run balance:smoke` runs in CI.

| Measure | Result |
|---|---|
| Cultivation pacing | realm 1 ≈ 3.3 h idle / 1 h optimised … realm 15 ≈ 99.5 h / 31.3 h; whole game ≈ **540 h idle, ≈ 170 h optimised** |
| Journey simulation (2 h a day) | all 15 regions opened by day 16 |
| Sovereign fights, *fitted* build (meets the recommended CP) | 25–63 % first-try win rate; a well-geared build 88–100 % (meant to need preparation, never a wall) |
| Auto-battle AI (player rules × enemy AI, 45 hardest nodes) | 69–70 % wins for the fitted build, old and new AI alike; the new preset gains where finishing blows and the held ultimate matter |
| Gear | worst roll of a rarity > best roll of the rarity below at every item level (validator) |
| Forge | +10 set = 1–5 days of the region's stone income, +15 = 1–3 weeks |

Rules kept by the balance pass: enemies follow the region's realm band; a defeat always explains why and what to do;
every resource has a sink in every realm.

---

## 28. Content targets

Checked by the validator on every build (`Content vs spec targets`):

| Content | Target | In the game |
|---|---|---|
| Realms | 15 | 15 ✓ |
| Regions | 15 | 15 ✓ |
| Encounters | 150 | 170 ✓ |
| Enemies | 60 | 78 ✓ |
| Bosses | 40 | 43 ✓ |
| Dungeons | 20 | 20 ✓ |
| Mega dungeons | 5 | 5 ✓ |
| Secret realms | 3 | 3 ✓ |
| Active techniques | 30 | 60 ✓ (33 learnable by the player) |
| Passive techniques | 20 | 20 ✓ |
| Methods | 20 | 20 ✓ |
| Gear bases | 60 | 68 ✓ |
| Gear items (base × rarity) | 150 | 205 ✓ |
| Gear sets | 8 | 8 ✓ |
| Spirit beasts | 20 | 20 ✓ |
| Quests | 100 | 113 ✓ |
| Tournaments | 3 | 3 ✓ |
| Also: 79 materials, 20 consumables, 28 NPCs, 21 story scenes, 21 achievements, 16 events, 3 ultimates | — | — |

Story scenes: 21 (forest 1, prologue 6, regions 13, tang 1). Events: 16.

Items by category: §14.1.

---

## 29. Technical specification

| Area | Choice |
|---|---|
| Language | TypeScript (Node ≥ 22.18 runs `.ts` directly for tools and tests) |
| Client | framework-free DOM UI (`src/ui`), WebGL2 for rigs, CSS for the rest; built with esbuild into `dist/` |
| Engine | pure, deterministic modules (`src/engine`): state + content + injected time; seeded RNG stored in the save |
| Content | JSON database in `content/`, written by Python generators (`tools/gen`), schema in `schema/` (zod), stable IDs, ID-only cross-references |
| Validator | `npm run validate`: schema, every reference resolves, every item has a source and a use, every enemy appears, every quest is completable, Divine gear only in mega dungeons, art blocks present, content targets — **errors, not warnings**; must pass before any content commit and in CI |
| Saves | `src/save`: versioned, checksummed, migrated, backed-up JSON; localStorage adapter in the browser, Capacitor Preferences adapter for the APK |
| Tests | `npm test` (157 unit / rule tests), `npm run typecheck`, browser tour of every screen (54), UI audit (0 errors), lab scenes, balance smoke; `npm run check` runs them together |
| Android | Capacitor with `webDir: dist`. 🟡 The Capacitor project (`npx cap add android`) is set up on the owner's PC, not in the repository; the APK has not been tested on a phone yet |
| Performance | one rAF loop, DOM for layout and hit-testing, canvas only paints; quality presets; reduced motion |

Architecture details: `docs/ARCHITECTURE.md`; database rules: `docs/DATABASE.md`.

---

## 30. Status against the original specification

Everything in the owner's 34 sections is built **except** the items below.

| Area (original §) | Status | What is missing |
|---|---|---|
| Audio (§29) | ⏳ | no music, ambience or sound effects yet |
| Android build (§1, §33) | 🟡 | APK not produced or tested on a phone; Capacitor project lives on the owner's PC |
| Animation (§29) | 🟡 | 18 rigs of the cast built, 402 / 737 renders done; the rest of the cast uses still sprites with CSS motion |
| Art approval (§28) | 🟡 | 28 of 1,341 assets approved; 16 planned; generation paused |
| Story after region 2 (§3) | 🟡 | each region has an arrival scene, but no continuing chapter-length story past the Azure Bamboo Forest |
| Tribulation presentation (§5) | ⏳ | dedicated backgrounds and music |
| Root transformation (§7) | 🟡 | built and rule-tested; not yet played end-to-end in the browser tour |
| Technique fragments (§14, §15) | ⏳ | fragments drop, but combining them into a technique is not a player action yet |
| Treasure maps (§14) | ⏳ | the Rare Treasure Map exists only as a gift; no map mechanic |
| Special event items (§14) | ⏳ | none |
| Player ultimates (§15) | 🟡 | 2 learnable ultimates |
| Achievements (§24) | 🟡 | no equipment, alchemy or relationship achievements |
| Victory screen (§9) | 🟡 | healing performed is tracked but not shown |
| Spirit beasts (§16) | 🟡 | level cap after the last stage (60) is below the last-stage level of 11 beasts (§16.3) |

---

*Content tables generated from the content database at commit `951b545`, not typed by hand. When content changes,
regenerate them rather than editing them.*
