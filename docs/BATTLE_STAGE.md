# Battle stage (portrait, Epic Seven style)

Decision record for the second battle screen. The owner asked for fights that feel like the Epic Seven clip:
one shared battlefield, characters that dash to their target and strike, a turn-order strip, ultimates with a
full-screen close-up and a burst of numbers, a hit counter and floating status words. Portrait for now.

Status: **built, on trial.** Settings → Battle stage switches every fight between Classic and Arena;
Settings → Arena test fight → Try it starts the test fight on any save (§7). The owner judges it on the phone
before the cast is converted. What was built:

| Part | Where |
|---|---|
| Field, formations, strike points | `src/ui/battle/field.ts` |
| Beats and shot plans | `src/ui/battle/choreo.ts` |
| Procedural effects (slash, pierce, burst, beam, wave, pillar, rain, ring, glow; dash trail) | `src/ui/battle/vfx.ts` |
| Arena layout, dash and return, camera, hit counter, close-up, flurry numbers | `src/ui/screens/battle.ts` (`arena`, `playShot`) |
| Figures without a rig drawn on the puppet canvas as still puppets (one depth order, shared clips) | `src/ui/anim/stage.ts: addStill` |
| The test fight source (`kind: "showcase"`): free, Lin and Bai against two Field Bandits, Heavenly Sword Rain charged, nothing settled | `src/engine/encounter.ts: SHOWCASE` |
| Checks | `tests/battle-stage.test.ts`, the tour's arena step, `node tests/browser/lab.ts arena` (`IA_REGION=2` adds a spirit beast) |

Presentation choices made while building: the acting unit is drawn in front of everyone during its action;
an ultimate's damage is shown as six numbers (a heavy art's as three) that add up to the real hit, and the
hit counter counts them; the focused-foe panel is only kept for bosses.

## 1. What stays

The combat engine (`src/engine/combat/`) is unchanged: speed-gauge turn order, techniques, statuses, bosses,
Auto battle, the 1×/2×/3× speed, lessons (practice), tribulations, tower and tournament sources. The screen
keeps consuming the same `BattleEvent[]` stream. The puppet layer (`src/ui/anim/`, docs/ANIMATION.md) stays
the way figures move; new clips (dash, land, recover) are added to the same procedural library.

So nothing in balance, saves or content has to change for the new stage, and the old stage can stay selectable
during the test (Settings → Battle stage: Classic / Arena) until the owner approves the new one.

## 2. The field: two bands on one floor

The first version placed units on a perspective floor from formation templates; on the owner's phone the
figures and their HP bars overlapped (a spirit beast stood on Lin's head, foe bars crossed other figures).
It was replaced by a line-up solver (`field.ts: layout`) that works in px for the real stage size:

- The enemies stand across the upper band (feet at 52% of the stage), the party across the lower band (93%).
- Each side is packed from its figures' visible width (60% of the box height; neighbours may overlap 14%),
  so the figure height is the tallest that lets the whole line fit (capped at 30% / 38% of the stage).
- The lead (the player, a boss) stands in the middle and in front; its neighbours alternate a step back.
  A beast stands at the end of the party, smaller; a boss is 1.22× and an elite 1.06× a normal foe.
- Party bars sit under the feet, enemy bars above the heads, each as wide as the body (64% of the box), so
  neighbours' bars never meet. The target mark sits beside the focused foe's bar.
- A dash ends beside the target on the attacker's side, at the target's depth, at a size between the two
  bands (`strikeBox`); the camera aims between the pair (`focusOf`).

`tests/battle-stage.test.ts` checks every party (1–4, with or without a beast) against every enemy group
(1–5, with a boss) on six stage sizes from a 360×380 phone stage to a 560×700 tablet stage: figures inside
the width, same-side overlap ≤ a third, no bar on another figure's body or bar, the party below the enemies.

## 3. Choreography: events → beats → shots

`animate()` in battle.ts plays events one by one with fixed waits. The new screen first groups the stream
into **beats** (`choreo.ts: beats`): an `action` and everything it causes until the next `action`/`turn`
(hits, heals, shields, statuses, deaths, phase, summon, sp). Events outside an action (turn, skip,
telegraph, charge, hazard, end…) are beats of their own.

Each action beat gets a **shot plan** (`choreo.ts: plan`) from the technique's `vfx` block and the hits:

| Stage | Melee (`approach: dash`) | Ranged / spell (`approach: none`) | Ultimate |
|---|---|---|---|
| 1 approach | actor travels to the strike point (220 ms), camera pushes in on the pair | — | darken, full-screen close-up of the caster (900 ms), name and 漢字 |
| 2 strike | rig `attack` clip; at contact: `shape` effect on the target(s), hit numbers | rig `cast` clip; at contact the effect travels or covers the targets | rig `ult`; big `shape` over all targets, numbers cascade, hit counter |
| 3 aftermath | deaths (defeat clip), statuses float, hit counter fades | same | screen settles, camera back |
| 4 return | actor travels back (260 ms), camera relaxes | — | — |

Durations are at speed 1× and are divided by the battle speed like today. `hits` from the technique and
multiple targets drive the hit counter ("8 Hits!" grows with every landed hit of the beat).

The plan is pure data (no DOM), so it is unit-tested in Node (`tests/battle-stage.test.ts`) and the stage
code only has to execute it.

## 4. Effects are content: the `vfx` block

Every technique (`tech.*`) and beast ability (`btech.*`) carries a `vfx` block, like the art block, so the
renderer never guesses and the validator checks it:

```jsonc
"vfx": { "approach": "dash", "shape": "slash", "impact": "medium", "camera": "push", "color": "#7fd0ff" }
```

| Field | Values | Default (derived in `tools/gen/common.py: vfx_block`) |
|---|---|---|
| approach | `dash`, `none` | dash for single-target damage with a melee weapon affinity (sword, saber, spear, palm) or an unarmed basic strike; none otherwise |
| shape | `slash`, `pierce`, `burst`, `beam`, `wave`, `pillar`, `ring`, `rain`, `glow` | slash (sword/saber), pierce (spear), burst (palm/fist, single), beam (staff/fan single), wave (row/all with a weapon), rain (all, spells), pillar (ultimate single), ring (buffs/shields on allies), glow (heals) |
| impact | `light`, `medium`, `heavy` | by power: < 120 light, < 220 medium, else heavy; ultimates heavy |
| camera | `none`, `push`, `zoom` | push for dashes and heavy hits, zoom for ultimates, none otherwise |
| color | hex | the element's colour (`ELEMENT_COLOR`) |

The renderer (`src/ui/battle/vfx.ts`, to build) has one procedural effect per shape, tinted by `color` and
sized by `impact`; later, painted effect sprites from the art pipeline can replace any shape by adding an art
file to the block (`"sprite": "assets/vfx/…"`), without touching code. A hand-written block in a generator wins
over the derived default.

## 5. Camera

The camera is a CSS transform on `.bt-stage` (`--cam-x`, `--cam-y`, `--cam-s`), eased by the choreographer:
push (scale 1.08 toward the striking pair), zoom (1.18 on the ultimate's targets), shake (the existing
`shake`/`shake-big`). The puppet canvas sits inside the stage, so it is transformed too; its anchor mapping
is now computed as fractions of the stage's own rect (`stage.ts: draw`), which makes it invariant under the
camera transform. Nothing else in the puppet layer changes.

## 6. HUD in portrait

- Top: place, wave and the Manual/Auto · speed · pause bar (unchanged).
- Left edge: the turn-order strip, vertical, portraits top to bottom, the acting unit first (today's horizontal strip moves and grows).
- Field: a small HP bar and status icons under every unit (both sides), replacing the big single-foe panel; the focused enemy keeps a target mark.
- Bottom: the acting ally's card (portrait, name, HP, SE) on the left and the technique buttons on the right, as today; the other allies' cards shrink to portraits with HP.
- Overlays: hit counter top left ("12 Hits!"), floating status words over the unit, the ultimate close-up.

## 7. The test fight

`node tests/browser/lab.ts arena` and, on a phone, `?lab=arena` on the Pages build (dev only): Lin Xueyao and
Bai Lingshuang against two Field Bandits on the Village Road, with Azure Strike as a real slash effect and
Bai's ultimate with its close-up. The owner judges it on the phone; only then does the rest of the cast get
its rig parts in overnight ComfyUI batches (`docs/ANIMATION.md`).

## 8. Out of scope for the test

Landscape mode, new mechanics (turn push, soul burn, counters, PvP timer), hand-animated or AI-video
close-ups, and sound. Each is a separate decision once the stage is approved.
