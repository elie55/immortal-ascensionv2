# UI premium pass (2026-10-30)

The owner asked for a more premium, professional look. The review (published to the owner as a page) rated each
screen and proposed global changes G1–G7 and screen reworks S1–S10. This file records what was built, where, and how
to check it. Styles live at the end of `src/ui/theme.css` under "PREMIUM LAYER", grouped by item.

## Global (phase 1)

| Item | What changed | Where |
|---|---|---|
| G1 Chrome | Slimmer header, sub-bar and tracked-quest chip (one line, Go ▸). First-visit tips are a slim coach bubble under the title bar, in the flow (it never covers a control); the first tap anywhere retires it. | `help.ts` `hintBar`, `navigate.ts` `trackerChip` |
| G2 Toasts | One toast at a time in a lane above the nav bar, repeats merged, "+N" waiting, milestones in gold. Never tappable. | `core/router.ts` |
| G3 Surfaces | Panel gradient with an inner light, blur only on header, sub-bar, sheets and modals; gold corner frames (`.hero-frame`), ornamental divider (`.orn-div`). | theme.css |
| G4 Nav | Gold top edge, lifted selected tab with a jade underlight; painted icons supported (`.ico.painted`). | theme.css |
| G6 Type | Noto Sans for text, Marcellus for buttons, chips and section titles (gold, uppercase, diamond), Ma Shan Zheng for brush calligraphy. Fonts are subset WOFF2 in `src/ui/fonts/` (OFL, see `CREDITS.md`). Tabular numerals everywhere. | theme.css |
| G7 Motion | Press feedback, a sheen on gold CTAs, screens enter with a short stagger. | theme.css |

## Screens (phase 2)

| Item | What changed | Where |
|---|---|---|
| S1 Spirit Forge | Tab plaques; a hero stage (anvil, the piece, rarity, main stat, CP, Master Gu's line) with sparks on success and smoke on failure; preview and cost in one panel with from → to rows and a chance bar; Craft as a grid of recipe cards with output art, sealed when unknown. | `screens/forge.ts` |
| S2 Breakthroughs | Minor: qi spiral, ring of light, brush 突破, the stage turning over, gains rising. Major: a full-screen ceremony (realm seals, talisman requirements, success ring, gains, hold to break through) and a light pillar with the realm in brush on success. | `screens/cultivate.ts` |
| S3 Victory | Solid gold title with a light sweep over the sky, the party in the clear, three framed stat tiles (damage dealt, highest hit, HP left), drops revealed one by one with NEW and ▲ upgrade badges, and a best-drop card against what you wear with one-tap Equip. | `screens/battle.ts` |
| S4 Inventory | Six columns × four rows a page (rules.inventory.page_size = 24), no names under tiles (the dock names the selection), rarity filter and sort as dropdown chips, bag capacity and expansion on the toolbar line, the selected item docked at the bottom. After the owner's review: categories, filters and slots in one bag panel, the categories as a tab strip (icon, label, gold underline). | `screens/inventory.ts` |
| S5 Character | Equipment sockets (dashed ring and silhouette when empty, a gold seal when locked), Combat Power at the figure's feet, Best gear · Techniques · Auto-battle in one row so the attributes show on the first screen; the stats sheet is a compact table under a breakdown card with a bar split by source. | `screens/character.ts` |

## Phase 3

| Item | What changed | Where |
|---|---|---|
| S6 Techniques | The loadout as a skill bar: four active sockets, two passive and the ultimate, each with its art inside a mastery ring, its element and SP/CD; empty sockets small and dashed. Auto-battle rules are compact rows (number, art, name, condition, toggle); moving a rule up or down lives in its editor; Reset · Copy to Boss · Save preset. | `screens/techniques.ts` |
| S7 Battle HUD | One top bar (place, wave, Manual/Auto, speed as one cycling button, pause); cooldowns drawn as a sweep over the technique; unused technique slots hidden in battle. | `screens/battle.ts` |
| S8 Spirit Beasts | No beast yet: an empty nest with the first egg and who gives it. Incubators are glowing nests; undiscovered beasts are silhouettes with where their egg is found (`itemSourcePlace` in `navigate.ts`). | `screens/beasts.ts` |
| S9 Quests | Quest cards: one meta line (giver, difficulty, CP), a progress bar per objective, rewards as icons and numbers without boxes, MAIN the only badge. Mission Hall: paper notices pinned on a wooden board, the next locked requests as sealed notices with what opens them. | `screens/quests.ts` |
| S10 Sheets | One sheet style: gold top edge, sections divided by an ornament instead of boxes, rows without boxes; result modals reveal their lines one after the other. | theme.css |
| G5 Empty/locked | Locked slots get a gold seal, undiscovered beasts a silhouette and a hint, empty battle slots are hidden, empty technique sockets are quiet. | — |
| G7 Motion | Reduce motion hides the decorative layers (qi spiral, light pillar, forge sparks, ceremony array); Low animation quality stops the idle loops (CTA sheen, rotating rays and arrays). | `app.ts` (`anim-low` class), theme.css |

## Phase 4 (every other screen against its mockup)

| Screen | What changed | Where |
|---|---|---|
| World Regions | Painted region cards, full-bleed art with the text on a dark foot, numeral and lock/state chips on top (the forge's recipe-card styles had leaked into them and shrunk the art to a thumbnail; they are now scoped to `.recipe-card`). | `adventure.ts`, theme.css |
| Scripture Pavilion | Five floor plaques (1F Foundations → 5F Sanctum, coloured by rarity, "n to learn"); the list shows one floor, by default the first with something left to learn. | `shop.ts` |
| Dungeons | The tower painting shows through its card; no repeated kind tag on the art; Rec. on one line; Enter wraps under the text on small phones with large text. | `delves.ts` |
| While you were away | Lists what else was going on: sessions and boosts (finished or time left) and eggs waiting in their nests (they hatch from wins, not time). | `offline.ts` |
| Storage Chest | Tiles without names, like the bag (the dock names the selection). | `inventory.ts` |
| Achievements, NPC requests, tower | Reward chips shorten with "…"; the Requests header stays legible over the portrait; the tower's sub-line fits one line. | `quests.ts`, `npc.ts`, `delves.ts` |

## Prologue (new game, built from the owner's 11 mockups in `refs/mockups/prologue/`)

| Scene | What it shows | Where |
|---|---|---|
| The Entrance Gate | Painted CG, place chip (The Thousand Steps · Azure Cloud Sect), the player's name tag in the crowd, narration box with gold corners. | `story.prologue.entrance_gate` |
| The Elder's Trial | Title card 入门考验 with "Question n of 3" and pips; Elder Wen's nameplate (emblem + gold ribbon); three numbered answers (壹 贰 叁); her reply, then "Your answer" with Review question and Continue. Each answer moves her affinity. | `story.prologue.elders_trial` |
| Welcome | Rank granted card (Outer Disciple), new area, method and token. | `story.prologue.welcome` |
| Senior Sister | "New character" introduction: vertical 白凌霜, name, titles, Ice · Sword chip, affinity chip (on the nameplate on wide screens, under the introduction on phones). | `story.prologue.senior_sister` |
| Scripture Pavilion · First Method | Elder Feng's introduction, the manual card (Manual acquired → Studied), Visit Scripture Pavilion. | `story.prologue.first_method` |
| Sword Grounds · First Sword Art | Bai's lesson card (Azure Strike · Lesson ready), "Learn Azure Strike from Bai" opens a practice fight against the Training Construct (three casts, HP restored, no loot), then "Lesson learned". | `story.prologue.first_sword_art`, `encounter.ts` (`practice`) |

The story screen (`screens/story.ts`) reads all of this from content: `intro`, `card`, `cta`, `practice`, per-line
`choices` with `reply`, and per-scene `setting`, `tag`, `progress`, `place` and `cast` (short name, Chinese name,
titles, chip). Lines keep their final size while they type (the rest is laid out invisibly), the introduction steps
down (Chinese name in a row → name only → tag only) when a short phone would put it under the dialogue, and toasts
wait until the story ends.

## Checking

- `node tests/browser/screens.ts` (tour, 51 checks, including the whole prologue) and `npm run test:ui` (audit at four phone sizes, must report 0 errors).
- `node tests/browser/lab.ts gearwin` forces a gear drop to show the best-drop card and the ▲ badge.
- The audit skips what scrolls under a sticky dock (`.dock-cta`, `.inv-dock`), as it already did for the nav bar, and
  hides toasts while measuring (they are transient).
