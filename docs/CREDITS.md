# Credits and licences

## Fonts (bundled in `src/ui/fonts/`, SIL Open Font License 1.1)

| Font | Use | Authors | Source |
|---|---|---|---|
| Cinzel | titles, headings | Natanael Gama | Google Fonts |
| Nunito | body text | Vernon Adams, Jacques Le Bailly, Manvel Shmavonyan, Alexei Vanyashin | Google Fonts |
| Cormorant Garamond (italic) | story narration | Christian Thalmann (Catharsis Fonts) | Google Fonts |

Latin subsets only. Chinese text uses the device's system CJK font (Noto CJK on Android).

## Art

All game art is generated locally with Qwen-Image-Edit 2511 from the prompts in the content database
(see `docs/ART.md`), using the owner's mockups as references.

## Icons

UI icons in `src/ui/core/icons.ts` are drawn for this project.

### Added in the UI premium pass (2026-10-30), same licence (SIL OFL 1.1), from the google/fonts repository

| Font | Use | Authors | Source |
|---|---|---|---|
| Noto Sans (variable) | interface text and numbers (tabular figures) | Google, Monotype | Google Fonts |
| Marcellus | buttons, labels, panel headings | Brian J. Bonislawsky (Astigmatic) | Google Fonts |
| Ma Shan Zheng | large Chinese brush titles (realm names) | Ma Shan Zheng | Google Fonts |

Ma Shan Zheng is cut down to the Chinese characters the game uses (605 of 608; 槃, 鮟 and 鱇 are not in the font and fall back to
the system face). Re-run `python3 tools/fonts/subset_brush.py MaShanZheng-Regular.ttf` when new Chinese text is added.
