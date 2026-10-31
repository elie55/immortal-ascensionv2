# Battle stage (portrait, Epic Seven style)

Decision record for the second battle screen. The owner asked for fights that feel like the Epic Seven clip:
one shared battlefield, characters that dash to their target and strike, a turn-order strip, ultimates with a
full-screen close-up and a burst of numbers, a hit counter and floating status words. Portrait for now.

Status: **approved, the default stage** (owner, 2026-10-31). Every fight plays on the arena; Settings → Battle stage
still offers Classic. Older settings are moved to the arena once (`slots.ts: stageVersion`). Settings → Arena test
fight → Try it keeps the free test fight (§7). What was built:

| Part | Where |
|---|---|
| Field, formations, strike points | `src/ui/battle/field.ts` |
| Beats and shot plans | `src/ui/battle/choreo.ts` |
| Effects (slash, pierce, burst, beam, wave, pillar, rain, ring, glow; dash trail): painted sprites with procedural sparks, CSS fallbacks | `src/ui/battle/vfx.ts` |
| Arena layout, dash and return, camera, hit counter, close-up, flurry numbers | `src/ui/screens/battle.ts` (`arena`, `playShot`) |
| Figures without a rig drawn on the puppet canvas as still puppets (one depth order, shared clips) | `src/ui/anim/stage.ts: addStill` |
| The test fight source (`kind: "showcase"`): free, Lin, Bai and YunYun (juvenile) against two Field Bandits, Heavenly Sword Rain charged, nothing settled | `src/engine/encounter.ts: SHOWCASE` |
| Checks | `tests/battle-stage.test.ts`, the tour's arena step, `node tests/browser/lab.ts arena` (`IA_REGION=2` adds a spirit beast) |

Presentation choices made while building: the acting unit is drawn in front of everyone during its action;
an ultimate's damage is shown as six numbers (a heavy art's as three) that add up to the real hit, and the
hit counter counts them; the focused-foe panel is only kept for bosses.

### Roll-out to the whole cast

| Part | Where |
|---|---|
| Facing and body type of all 204 battle sprites (enemies, bosses, companions, sect rivals, every beast stage), read from contact sheets | `tools/art/facing.json`, `tools/anim/cast.json` → art blocks `facing` / `body` |
| One rig per art: `assets/anim/<id>/` for the battle sprite, `assets/anim/<id>.<art key>/` for a beast's stages; `anim` is a list | `tools/anim/edits.py` (`rig_name`, `parts_for`), `tools/gen/common.py: anim_block`, `tools/lib/rules.ts: checkAnim` |
| Figures without a rig yet move by their recorded body type (still puppets) | `battle.ts: attachRig` (`content.bodyOf`) |
| Element bursts (fire, water, wood, earth) under every hit of that element; falling rocks (earth), falling fire (fire), shards (water), blades (metal) for rains | `vfx.ts: impact`, `rain`; `ui.vfx` `burst_*`, `rock`, `flame` |
| Thunder arts strike from the sky (`bolt` shape); judgement arts are columns; a comet falls | `tools/gen/common.py: vfx_block` (by name), `vfx.ts: boltFx` |
| Statuses drawn on the figure: frost at the feet, flames, miasma, circling stars, a shield bubble, rising motes; enemy status icons under their bars | `battle.ts: statusFx`, `theme.css .st-fx` |
| Bosses: alone they get a bigger band; a phase change zooms on them with a burst; summons arrive through an array; a boss's charged art plays like an ultimate (close-up, flurry) | `field.ts` (`lone`), `battle.ts` phase / summon / `isUlt` |
| Tribulation lightning is painted and strikes where the party stands | `battle.ts: lightning`, `vfx.ts: bolt` |
| Close-up cut-ins for every fighter (companions and sect rivals) | `tools/gen/common.py: cutin_art`, art key `cutin` |
| Victory beat after the last wave of any fight | `battle.ts: arenaVictory` |

`node tests/browser/lab.ts auto2 auto5 auto8` plays whole fights on Auto (`IA_VIDEO=1` to record),
`IA_STAGE=classic` runs any scene on the old stage.

### Polish round 2 (test fight only)

The owner asked for: no small HP bars under the party (the cards below carry them), everyone facing their foes,
figures standing on the ground, and much richer motion. Done for the test cast only (Lin, Bai, YunYun, Field
Bandit); the rest of the cast waits for the owner's verdict.

| Part | Where |
|---|---|
| Which way a sprite looks, recorded per art file (`facing: left/right/front`), test cast only | `tools/art/facing.json` → art blocks; `content.facingOf` |
| Mirroring on the canvas so the party looks right and the foes left | `stage.ts: add/addStill` (`face`), `mappingMirrored` |
| Contact shadows under every figure (shrinking with a jump) and the acting unit's spinning array (gold party, red foe, jade while it waits for you) | `stage.ts: draw` ground pass, `setDecal`; `battle.ts: turnRing` |
| Hit-stop, knock-back, camera punch, afterimages and weapon trails, crouch → dash → hop → land clips, dust | `stage.ts: hitStop/setTrail`, `rig.ts` clips `dash/hop/land/charge`, `battle.ts: arenaHit/playShot` |
| Painted effects (`ui.vfx`, 12 paintings on black, alpha from light): slash arc and cross, impact, spirit blade, ice shard, ring, pillar, bagua array, flare, swirl, wind, dust | `tools/gen/ui.py` (`FX`), `src/ui/battle/vfx.ts` (`painted`) |
| Ultimate: charge (zoom, swirl, array), Lin's painted cut-in with letterbox and 天剑雨, white cut, blades raining with a number per blade, slow-motion finisher, embers | `battle.ts: showCloseup`, `vfx.ts: gather/rain`, `npc.lin_xueyao` art `cutin` |
| Victory beat on the field before the panel: the party cheers, gold motes, 胜 / VICTORY ribbon | `battle.ts: arenaVictory` |
| Bai and YunYun rigs (sword, blink, cloth and hair) | `assets/anim/{npc.bai_lingshuang,beast.yunyun}` |

Rig builder fixes found on the way (`tools/anim/build.py`): edits were registered with the inverse transform (the
shift was applied backwards; harmless at 1–2 px, broke YunYun at 12 px), so `align` now tries identity, ORB,
silhouette boxes and their ECC refinements and keeps the best match; a creature's eyes are searched in the top
half of its box (ears and tails reach higher); blink patches are colour-matched to the sprite along their rim.
`IA_LONG=1 IA_VIDEO=1 node tests/browser/lab.ts arena` records a showreel where every unit acts (lab-only: the
bandits get triple HP and the party's speed).

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
