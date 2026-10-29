# UI audit — pass 1 (with the art available on 2026-10-29)

**Scope:** every screen of the screen tour (57 screens plus their sheets and modals, scrolled page by page).
- Phone sizes: 360 × 640, 390 × 844, 412 × 915, plus 360 × 640 with the Large text setting.
- Checked against [`UX_CHECKLIST.md`](UX_CHECKLIST.md) and the mockups.

A second pass is due once the art run has finished; placeholders are still on screen for art that has not been generated yet.

**How to re-run:** `npm run test:ui` builds the game, plays `tests/browser/screens.ts` at the four sizes with the automated checks of `tests/browser/ui_audit.ts`, and writes `.tmp/audit/report.md`. The command fails on any error-level finding. Patterns accepted on purpose are listed with their reason in `tests/browser/ui_audit_accepted.json`.

## Result

| | Errors | Warnings | Notes |
|---|---|---|---|
| First run (before fixes) | 1,132 | 871 | many came from the root bug D-15 and from the detector's first version |
| Final run | **0** | 184 (38 contrast, 127 font size, 17 text overflow by a few px, 2 tap size) | see "Remaining warnings" |

The screen tour also passes at all four sizes. It now includes two regression checks for D-15:
- an open sheet survives game ticks;
- a slow tap that spans a tick still lands.

## What was wrong and is fixed

Defects D-15 to D-27 are listed in [`QA_DEFECT_LOG.md`](QA_DEFECT_LOG.md). The most important ones:

1. **The screen was rebuilt from scratch every second** (D-15). Every game tick replaced the whole DOM, which caused four problems:
   - open sheets and modals slid in again;
   - lists inside sheets jumped back to the top;
   - text being typed was wiped;
   - a tap held across a tick did nothing.

   The router now patches the page in place (`morph()` in `src/ui/core/dom.ts`). Story typing had the same problem: the character art restarted its fade-in every 22 ms.
2. **Large text did almost nothing** (D-17), and 70+ text styles were under 10 px (D-18). All font sizes now follow the setting, with a 10 px floor for labels and 11 px+ for text a player reads.
3. **Toasts covered the buttons you need** on small phones (D-19), including Breakthrough, Enter, Welcome! and story choices. Toasts now appear at the top, two at a time and queued, and duplicates are merged.
4. **Taps that hit the wrong thing:**
   - the merchant's picture covered the Back chip (D-20);
   - Auto/Skip/Log sat under the unlock card;
   - sect map labels hid each other at 360 px (D-22);
   - eleven controls were too small to tap reliably (D-24).
5. **Readability:**
   - text over bright art without a shade;
   - locked rows and pins too faded;
   - a gold-on-gold Chinese label;
   - the story nameplate wrapping into the dialogue (D-21, D-25).
6. **Layout under Large text:** grids pushed cards off the screen (D-23). Some rows crushed names into one word per line (D-26).

## Convenience features added (from modern mobile RPGs)

- **Best gear button** next to Combat Power on the Character screen. It equips the highest-CP loadout from the bag (rings and sets included). The Character tab shows a red dot when your bag holds better gear. Engine: `bestLoadout` / `equipBest` in `src/engine/actions.ts`, with a test.
- **Use ×N** for stackable pills (Qi, permanent stats, mastery). It never uses more Qi than your bank can hold.
- **Recommended power in colour** on nodes, dungeons, the tower and secret-realm rooms: green = ready, gold = close (≥ 80 %), red = too strong.
- **Confirmation before** selling a rare-or-better or enhanced piece, and before abandoning a quest. Pieces can already be locked against selling.
- Toasts merge "New quest" and "Quest ready" for the same quest into one.

## Remaining warnings (by design or minor)

- **Font size:** uppercase tags and labels at 10–10.5 px are excluded from the warning. What remains is listed in `.tmp/audit/report.md` after each run.
- **Contrast warnings** (ratio 3–4.5 : 1) are mostly muted secondary text on lighter glass, and labels with a text shadow over art. None is unreadable.
- **Ellipsis notes** mark long names shortened in tight spots (skill names in the battle bar, NPC titles in the story nameplate). Tapping shows the full name.

## Flow changes (approved and built in v0.5.0)

1. **Turn in all** ready quests from the Quest Log (`turnInAll`).
2. **Enhance ×5** (stops at the first failure) and **Enhance to +N** at the Spirit Forge (`enhanceMany`).
3. **Sell all Common / Uncommon / Rare** gear at the Merchant; locked and worn pieces never included; confirmation first.
4. Item names under the tiles in the Merchant's Sell grid.
5. A one-line **first-time hint** on every system screen (remembered in the save) and a **(?)** help sheet in the title bar (`src/ui/help.ts`).

Also in v0.5.0: quest **tracking** with a HUD chip and *Go ▸* that leads to the place (`src/ui/navigate.ts`),
**celebration screens** for evolution, tournament, achievements, tower milestones, Fame/realm unlocks and new regions
(`src/ui/screens/celebrate.ts`), the battle screen's ally cards filling the width (solo = one wide card) with the
Ultimate charge on its button, resource dungeon **tiers I–V**, and the **100-slot bag / 200-slot depot** with 20-slot
pages (`docs/INVENTORY.md`).

## Still to check

- Repeat this audit after the art run (icons at their real size, cut-outs on the battle screen).
- Check on a real Android phone after packaging: WebView fonts, safe areas, the system back button, and touch feel.
