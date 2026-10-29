# UX checklist

The rules every screen is audited against, drawn from how well-made modern mobile RPGs (gacha RPGs, idle
cultivation games) keep a dense game easy to use. We borrow interaction patterns only; the look stays the
one in `refs/mockups`.

`tests/browser/audit.ts` checks the rules marked **[auto]** on every screen at three phone sizes;
the rest are checked by reviewing the screenshots. Findings and their fixes are logged in `UI_AUDIT_REPORT.md`.

## 1. Layout and reach
- **[auto]** Nothing scrolls sideways; no element sticks out of the screen.
- **[auto]** Nothing interactive is covered by another element (nav bar, sheet, toast, sibling).
- **[auto]** The last element of a scrolling screen can scroll clear of the bottom nav.
- Main actions sit in the bottom half, within thumb reach; the primary action of a screen is the biggest,
  brightest (gold) button and there is only one per view.
- One idea per card. Sections have a short title; numbers line up (tabular figures).
- Works from a 360 × 640 phone up to a 430 × 932 phone without clipping.

## 2. Readability
- **[auto]** Text contrast on its actual background: ≥ 4.5 : 1 for small text, ≥ 3 : 1 for large/bold text.
- **[auto]** Minimum text size 10 px for tiny labels (badges, counters), 11 px for anything a player reads
  (names, descriptions, values). Body text 12.5 px+.
- **[auto]** Text is never cut mid-word without an ellipsis; important text (names, prices, costs) is never truncated.
- Text over art has a shade, panel or shadow behind it.
- The "Large text" setting scales all text, not just some of it.

## 3. Touch
- **[auto]** Tap targets ≥ 40 × 40 px (≥ 32 px for secondary controls inside a row), not overlapping.
- Every tap gives visible feedback (pressed state, toast, sheet, navigation).
- Back always works: the back chip, the system back button, tapping outside a sheet.
- Selected state is obvious (gold or cyan outline, filled chip).

## 4. Knowing what to do next
- Red-dot badges lead from the tab to the exact item that needs attention, and clear once handled.
- Every challenge shows the recommended power against yours (green / gold / red).
- Quests and missing materials link to where to go ("Go", "Where to get it").
- A first-time screen explains itself in one line; a (?) gives details on complex screens.
- Locked things say exactly what unlocks them.

## 5. Convenience (one-tap actions)
- Claim all, collect all, sell all junk, use ×N / use max, auto-equip best, enhance ×N.
- Battle speed and auto/manual remembered between battles.
- Quick-use from item details; compare against equipped gear with green/red deltas.

## 6. Feedback and rewards
- Results summarise everything gained in one panel (items, stones, XP, affinity).
- Toasts never cover the primary action, never overlap each other, and stack at most three.
- Numbers that change (stones, CP, affinity) show the delta.

## 7. Safety
- Irreversible or expensive actions ask first and show the cost (selling rare+ items, spending rare
  materials, leaving a run, overwriting a save).
- Rare items can be locked against selling; locked items are never sold by "sell all".

## 8. Comfort
- Settings: text size, reduced motion, battle speed default, sound, notifications.
- Reduced motion turns off pulsing and floating effects.
- No screen depends on colour alone (rarity also has a label, red/green deltas also have +/−).
