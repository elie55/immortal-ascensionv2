# Combat animation

Decision record and pipeline for character animation (spec §30 "Animation and audio" and the
"Professional Animation Production" checklist). Status: **prototype** (Lin Xueyao vs the Field Bandit).

## The decision

**Layered cutout rigs with a deformable mesh, rendered in WebGL, built automatically from each figure's
existing battle sprite plus four Qwen-Image-Edit renders.** Clips are procedural (deformer curves on a
shared skeleton), so one clip library animates every figure of an archetype; frames are never hand-made.

Why not the alternatives:

| Approach | Verdict |
|---|---|
| Frame-by-frame generated sprite sheets (one render per frame) | Identity and registration drift frame to frame, flicker; ~10 000 renders for the cast. Rejected. |
| AI video (image-to-video) cut into frames | Real frames, but needs a 15–30 GB video model on the PC, matting of every frame, and 2–5 min per clip (≈1 400 clips). Kept as an **optional upgrade** for hero characters and bosses once the rig pipeline is in place. |
| CSS tweens on a still image (what we had) | Explicitly not accepted by the spec. |
| **Cutout rig + mesh (chosen)** | Breathing, blinking, hair and cloth motion, wind-up/strike/follow-through, hit, dodge, cast, victory, defeat from the art we already have; 4 renders per figure (≈3 min of PC time); deterministic, testable in Node; speed-scales exactly. |

The spec's examples ("spritesheets, layered cutout rigs, or equivalent") list cutout rigs as a valid form.

## Assets per figure (`assets/anim/<entity id>/`)

| File | Made from | Use |
|---|---|---|
| `body.webp` | the `noweapon` edit (or the battle sprite itself for unarmed figures) | the mesh texture |
| `weapon.webp` + `rig.json.weapon` | battle sprite × weapon mask (difference sprite ⟷ `noweapon`), pivot at the grip end | rigid layer rotated around the hand |
| `blink.webp` + `rig.json.blink` | eye rectangle of the `eyesclosed` edit (difference with the sprite, inside the head band) | eyelid patch cross-faded every 3–6 s |
| `weights.png` | `tag_hair` and `tag_cloth` edits (magenta threshold) → R = flutter weight, G = hair | per-vertex flutter amplitude; falls back to a geometric field |
| `rig.json` | measurements: size, ground anchor, hip/chest/head heights, archetype | drives the deformers |

Renders are queued by `tools/anim/edits.py`, collected by `tools/anim/build.py`, and listed in the
entity's `anim` block (generators add it when the folder exists), so the database stays the source of truth.

## Runtime (`src/ui/anim/`)

- `rig.ts` — pure math, no DOM: the mesh (cols × rows over the sprite), **deformers** (breath, bob, lean,
  squash/stretch, head tilt, flutter wave with lag, weapon angle, flash, dissolve, alpha), the **clip library**
  per archetype (idle, enter, attack, cast, ult, hit, dodge, victory, defeat), and the **state machine**
  (interrupt rules, blending back to idle, speed scaling). Every value is a function of time, so a clip at 3×
  is the same curve sampled three times faster.
- `gl.ts` — WebGL2 renderer: one canvas over the battle stage, textured triangle meshes, the weapon quad with a
  3-ghost motion trail, blink patch, flash/dissolve in the fragment shader. Falls back to the still sprite when
  WebGL is unavailable.
- `stage.ts` — `AnimStage`: owns the rAF loop, one `Puppet` per unit, measures each unit's layout box from the
  existing `.spr` element (the DOM keeps layout, hit-testing and effect anchors; the canvas only paints),
  exposes `play(uid, clip)` returning `{ contact, done }` promises for the battle screen to sync projectiles,
  damage numbers and shake to the **contact frame**.

Settings: `animationQuality` low = still sprites with the old CSS motion, medium = 8×12 mesh, high = 16×24 mesh
with blink and flutter. `reducedMotion` = no ambient sway, no flash, pose changes still happen (as cuts).

## Event sync

| Battle event | Clip | Sync point |
|---|---|---|
| `action` (basic / technique) | `attack` or `cast` | projectile/wave leaves at `contact`; the engine's hit events are animated after it |
| ultimate | `ult` (with the cut-in) | `contact` after the cut-in |
| `hit` | `hit` (interrupts idle/victory, never attack before contact or defeat) | immediately |
| `dodged` | `dodge` | immediately |
| `death` | `defeat` → dissolve | `done` → unit removed |
| battle won | `victory` loop | — |
| wave start / summon | `enter` | — |

## Production order

1. Prototype: Lin (new right-facing combat stance) and the Field Bandit, approved in motion by the owner.
2. Batch: all enemies, bosses, companions, duel NPCs and beasts (archetypes: humanoid-armed, humanoid-unarmed,
   quadruped, flying, serpent, large-boss). ~3 min of PC render per figure.
3. Optional: image-to-video key clips for Lin and the region bosses.
