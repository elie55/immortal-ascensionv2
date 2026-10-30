"""
Animation layer edits: the renders a rig needs besides the figure's battle sprite (see docs/ANIMATION.md).

For one figure (an entity id whose battle art exists) this writes:
  .tmp/anim/<id>/source.png                 the sprite flattened on light grey (ComfyUI input: ia_anim/<id>.png)
  .tmp/queues/anim_<name>.json              queue entries in the tools/art/queue.py format (run by comfy_submit.js)

Edits (image 1 = the source sprite; Qwen-Image-Edit keeps the rest of the picture):
  noweapon    the figure without its weapon, hand empty          → body layer (transparent)
  tag_weapon  weapon painted flat magenta                        → weapon layer mask (cut from the sprite)
  tag_hands   the gripping hand(s) painted flat magenta          → which end of the weapon is the grip (pivot)
  eyesclosed  the same picture with both eyes closed             → blink patch
  tag_eyes    eyes painted flat magenta                          → the eye rectangle the blink patch covers
  tag_hair    hair painted flat magenta                          → flutter weights (hair)
  tag_cloth   loose fabric painted flat magenta                  → flutter weights (ribbons, sashes, sleeves, hems)
Unarmed figures (creatures) skip noweapon; `--parts` picks a subset.

Usage:
  python3 tools/anim/edits.py --name proto --ids npc.lin_xueyao,enemy.field_bandit [--parts noweapon,eyesclosed,tag_hair,tag_cloth] [--reroll N]
"""
import argparse, hashlib, json, os, sys
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "art"))
from queue import gen_size  # noqa: E402

GREY = (217, 217, 217)
KEEP = ("Image 1 is the source illustration. Output the very same picture: identical character, pose, outfit, colours, lineart, "
        "lighting, framing and plain flat light-grey background. The only change: ")
PARTS = {
    "noweapon": (KEEP + "remove the weapon completely. The hand that held it is empty and relaxed in the same place; draw the body, "
                 "clothing and background that the weapon covered. No weapon, no blade, no handle anywhere in the picture.", True),
    "eyesclosed": (KEEP + "both eyes are fully closed, as in a calm blink: eyelids shut, lashes down. Nothing else changes.", False),
    "tag_hair": (KEEP + "paint ALL of the hair (every strand, bangs, ponytail, loose locks) in one flat solid bright magenta colour (#FF00FF) with "
                 "no shading, as a flat silhouette. Hair ornaments, skin, clothes, weapon and background stay exactly as they are.", False),
    "tag_weapon": (KEEP + "paint the whole weapon (blade, guard, handle and pommel, every part of it) in one flat solid bright magenta colour (#FF00FF) "
                   "with no shading, as a flat silhouette. The hand holding it, the body, clothes, hair and background stay exactly as they are.", False),
    "tag_hands": (KEEP + "paint the hand or hands that hold the weapon (fingers, palm and wrist of each gripping hand) in one flat solid bright "
                  "magenta colour (#FF00FF). The weapon itself, the other hand, body, clothes and background stay exactly as they are.", False),
    "tag_eyes": (KEEP + "paint both eyes (the whole eye opening: iris, pupil, white, lashes, upper and lower eyelid edge) in one flat solid bright "
                 "magenta colour (#FF00FF). Nothing else changes.", False),
    "tag_cloth": (KEEP + "paint only the loose, free-hanging fabric — ribbons, sash ends, scarf and headband tails, wide hanging sleeves, "
                  "skirt and robe hems that could sway in the wind — in one flat solid bright magenta colour (#FF00FF) with no shading. "
                  "The body, face, hair, fitted clothing, armour, weapon and background stay exactly as they are.", False),
}


def art_file(c, eid):
    e = c.get(eid)
    if not e: raise SystemExit(f"unknown entity {eid}")
    a = e.get("art", {})
    key = "battle" if "battle" in a else "full_body"
    f = a[key]["file"]
    f = f if os.path.exists(os.path.join(ROOT, f)) else f.rsplit(".", 1)[0] + ".webp"
    if not os.path.exists(os.path.join(ROOT, f)): raise SystemExit(f"{eid}: no rendered {key} art yet ({f})")
    return f, bool(a[key].get("creature")) or e.get("kind") == "beast"


def load_content():
    import glob
    out = {}
    for f in glob.glob(os.path.join(ROOT, "content", "**", "*.json"), recursive=True):
        d = json.load(open(f))
        L = d if isinstance(d, list) else d.get("entries", []) if isinstance(d, dict) else []
        for e in L if isinstance(L, list) else []:
            if isinstance(e, dict) and "id" in e: out[e["id"]] = e
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--ids", required=True)
    ap.add_argument("--parts", default=",".join(PARTS))
    ap.add_argument("--reroll", type=int, default=0)
    a = ap.parse_args()
    c = load_content()
    parts = [p for p in a.parts.split(",") if p]
    q, sources = [], []
    for eid in filter(None, a.ids.split(",")):
        f, creature = art_file(c, eid)
        im = Image.open(os.path.join(ROOT, f)).convert("RGBA")
        flat = Image.new("RGB", im.size, GREY); flat.paste(im, mask=im.getchannel("A"))
        d = os.path.join(ROOT, ".tmp", "anim", eid); os.makedirs(d, exist_ok=True)
        src = os.path.join(d, "source.png"); flat.save(src); sources.append((eid, src))
        gw, gh = gen_size(*im.size)
        for p in parts:
            if p in ("noweapon", "tag_weapon", "tag_hands") and creature: continue
            prompt, transparent = PARTS[p]
            seed = int(hashlib.sha1(f"{eid}/{p}#{a.reroll}".encode()).hexdigest()[:8], 16)
            q.append({"entity": eid, "key": f"anim_{p}", "file": f"assets/anim/{eid}/{p}.png", "prompt": prompt + (" Plain flat light-grey background." if transparent else ""),
                      "ref": f"ia_anim/{eid}.png", "w": gw, "h": gh, "transparent": transparent, "seed": seed,
                      "prefix": f"IA_anim/{eid}/{p}" + (f"_r{a.reroll}" if a.reroll else "")})
    os.makedirs(os.path.join(ROOT, ".tmp", "queues"), exist_ok=True)
    path = os.path.join(ROOT, ".tmp", "queues", f"anim_{a.name}.json")
    json.dump(q, open(path, "w"), ensure_ascii=False)
    print(f"{len(q)} jobs -> {path}")
    for eid, s in sources: print(f"source {eid}: {s}  → ComfyUI input/ia_anim/{eid}.png")


if __name__ == "__main__":
    main()
