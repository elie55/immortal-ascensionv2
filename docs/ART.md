# Art pipeline

All game art is generated from the database: every entity's art block (file, size, transparency,
prompt, references, status) is the single source of truth. Nothing is drawn ad hoc.

## Model

ComfyUI Desktop on the owner's PC (RTX 3080 10 GB). **Qwen-Image-Edit 2511**, fp8 with the 4-step
Lightning merge, `qwen_2.5_vl_7b_fp8_scaled` text encoder, `qwen_image_vae`, ModelSamplingAuraFlow 3.1,
KSampler 4 steps / cfg 1 / euler / simple. Transparent assets go through **RMBG-2.0** (ComfyUI-RMBG).
Measured: ~20 s per icon, ~45 s per full-screen image.

## Flow

```
content/ (art blocks)
  └─ npm run art:jobs ─────────────► .tmp/art-jobs.json          every planned asset
       └─ tools/art/queue.py ───────► .tmp/queues/<name>.json    selection → compact entries
            └─ copied to ComfyUI-Shared/input/ia/<name>.json  (on the PC)
                 └─ tools/art/comfy_submit.js, run in the browser pane at http://127.0.0.1:8188,
                    builds one graph per entry and POSTs it to /prompt
                      └─ ComfyUI-Shared/output/IA/<path>_00001_.png
                           └─ staged back, tools/art/collect.py ─► assets/<path>.webp (final size, alpha kept)
                                └─ re-run tools/gen/*: art status planned → generated
```

Status: `planned` (no file) → `generated` (file exists in `assets/`) → `approved` (path listed in
`assets/APPROVED.txt`). Generators compute it, so regenerating content never loses it.

## Style

- Global style text (`STYLE` in `tools/gen/common.py`): polished anime xianxia, soft cel shading with
  painterly gradients, thin lineart, luminous highlights. No fixed palette: pilot 1 showed a shared
  palette tints everything (pink lava).
- Rarity wording: gear icons describe materials per rarity (`RARITY_LOOK`); every other icon only
  gets a rarity glow (`RARITY_GLOW`). The game draws the rarity frame, so icons have plain backgrounds.
- Style anchors (`refs/style/`) are art-only crops cut from the mockup boards. Pilot 1 showed that
  using them as a general style reference barely changes the look, leaks tile frames into icons and
  costs ~50% more time, so they are used only for **character identity**:
  - characters seen in the mockups (Lin Xueyao, Bai Lingshuang, Elder Wen) are drawn from their crop;
  - every other NPC's `full_body` is drawn first; once approved, it is copied to `input/ia_chars/<npc>.png`
    and becomes the reference for that NPC's portrait, expressions and battle sprite.

## Interface art

`ui.icons`, `ui.nodes` and `ui.forge` (tools/gen/ui.py) hold painted icons generated like any other art:
spirit stones, Sect Fame, energy, combat power, sect emblem, map node emblems and the Spirit Forge actions.
`icons.ts` swaps the line icons `gem`, `fame`, `bolt` and `cp` for them at 12 px and up (`setPainted`).
Prompts that led the model astray are overridden by `ICON_LOOK` in `tools/gen/common.py` (keyed by the
entity's short key); status icons describe a concrete object (`STATUS_LOOK` in tools/gen/world.py).

## Order of generation

1. Character sheets (`full_body`) for every NPC → owner approval.
2. NPC portraits, expressions, battle sprites (referencing approved sheets).
3. Everything else, batched by folder (enemies, bosses, beasts, equipment, items, techniques,
   regions, dungeons, story, UI emblems), reviewed as contact sheets.

## Storage

Shipped art is lossy WebP (quality 90, alpha kept): about a tenth of PNG, native on Android.
Raw ComfyUI PNGs stay on the PC in `ComfyUI-Shared/output/IA/`.

## Animation layers

Combat rigs (docs/ANIMATION.md) need, per figure, six small edits of its battle sprite: `noweapon`, `tag_weapon`,
`tag_hands`, `eyesclosed`, `tag_eyes`, `tag_hair`, `tag_cloth` (queued by `tools/anim/edits.py`, same submit script,
outputs in `output/IA_anim/<id>/`). `tools/anim/build.py` registers each edit onto the sprite and cuts the layers
into `assets/anim/<id>/`; generators then attach the entity's `anim` block. The protagonist's `battle` art faces right
(the player's side); enemies face left.

