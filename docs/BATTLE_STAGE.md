# Battle stage (portrait, Epic Seven style)

Decision record for the second battle screen. The owner asked for fights that feel like the Epic Seven clip:
one shared battlefield, characters that dash to their target and strike, a turn-order strip, ultimates with a
full-screen close-up and a burst of numbers, a hit counter and floating status words. Portrait for now.

Status: **design + core modules (this document, `src/ui/battle/field.ts`, `src/ui/battle/choreo.ts`, the
`vfx` block on techniques)**. The stage itself, the effect renderer, the ultimate close-up, the HUD and the
test fight are the next build step (Opus 5.5 + High), then one test fight is judged on the owner's phone
before the cast is converted.

## 1. What stays

The combat engine (`src/engine/combat/`) is unchanged: speed-gauge turn order, techniques, statuses, bosses,
Auto battle, the 1×/2×/3× speed, lessons (practice), tribulations, tower and tournament sources. The screen
keeps consuming the same `BattleEvent[]` stream. The puppet layer (`src/ui/anim/`, docs/ANIMATION.md) stays
the way figures move; new clips (dash, land, recover) are added to the same procedural library.

So nothing in balance, saves or content has to change for the new stage, and the old stage can stay selectable
during the test (Settings → Battle stage: Classic / Arena) until the owner approves the new one.

## 2. The field: one ground plane in portrait

Both sides stand on the same floor, seen from a low three-quarter angle: the party at the front left, the
enemies at the back right, facing each other along the diagonal. Each unit has a **field position** `(fx, fy)`,
`fx` across the floor (0 left → 1 right) and `fy` into the depth (0 front → 1 back). The screen position,
scale and z-order come from one projection (`field.ts: project`):

```
x = lerp(inset(fy), 1 - inset(fy), fx)     inset grows with depth → the floor narrows toward the back
y = horizon + (1 - fy) · (floorBottom - horizon)   (fraction of the stage height, feet line)
scale = far + (1 - fy) · (near - far)        near 1.0 at the front, far 0.62 at the back
z = round((1 - fy) · 100)                    front units draw over back ones
```

Formations are templates per side and head count (`FORMATIONS`): 1–4 allies in a slanted line front left,
1–5 enemies in a slanted line back right, with the boss/focus deepest in the enemy line so it reads as the big
one. The templates are data, not CSS, so the choreographer can compute travel paths and the puppet canvas can
be transform-invariant (see §5).

Field coordinates are also what effects aim at: a projectile goes from `project(actor)` to `project(target)`;
a dash moves the actor to `strikePoint(actor, target)`, one unit width short of the target along the line
between them, on the actor's side.

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
