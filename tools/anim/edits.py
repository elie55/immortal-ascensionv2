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
Which parts a figure gets comes from tools/anim/cast.json (read from the sprites: body type, armed, eyes): the
weapon parts only for armed figures, tag_cloth only for figures that wear clothes, the eye parts only when there
are eyes to blink; creatures get a "flowing parts" tag (mane, crest, tail tufts, fins) instead of hair.
One rig per art: the battle sprite is `<id>`, any other art key (a beast's stage) is `<id>.<key>`.

Usage:
  python3 tools/anim/edits.py --name proto --ids npc.lin_xueyao,enemy.field_bandit,beast.yunyun#battle_adult [--parts ...] [--reroll N]
  python3 tools/anim/edits.py --name cast --all [--skip-built]      every sprite in tools/anim/cast.json
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


CAST = json.load(open(os.path.join(ROOT, "tools", "anim", "cast.json"))) if os.path.exists(os.path.join(ROOT, "tools", "anim", "cast.json")) else {}
CREATURE_FLOW = (KEEP + "paint only the free-flowing parts that would sway in the wind — mane, crest, long tail and tail tufts, loose fur tufts, whiskers, "
                 "long feathers and wing tips, fins and trailing ribbons of energy — in one flat solid bright magenta colour (#FF00FF) with no shading. "
                 "The head, face, eyes, body, legs and background stay exactly as they are.")
CREATURES = ("quadruped", "flying", "serpent", "large")


def cast_of(f):
    """The recorded look of a sprite (tools/anim/cast.json): arch, armed, eyes."""
    return CAST.get(f) or CAST.get(f.rsplit(".", 1)[0] + ".webp") or {}


def rig_name(c, eid, key=None):
    """Folder / ComfyUI name of a rig: the entity id for its battle sprite, `<id>.<key>` for another art (a beast stage)."""
    k = art_key(c, eid, key)
    return eid if k in ("battle", "full_body") else f"{eid}.{k}"


def parts_for(f, creature):
    """The edit renders a sprite needs, from its recorded look."""
    look = cast_of(f)
    arch = look.get("arch") or ("quadruped" if creature else "humanoid")
    armed = look.get("armed", not creature)
    out = []
    if armed: out += ["noweapon", "tag_weapon", "tag_hands"]
    if look.get("eyes", True): out += ["eyesclosed", "tag_eyes"]
    out += ["tag_hair"]
    if arch in ("humanoid", "humanoid_unarmed", "large"): out += ["tag_cloth"]
    return out


def art_key(c, eid, key=None):
    """The art a rig animates: the given key (a beast's stage, e.g. battle_juvenile), else battle, else full_body."""
    a = (c.get(eid) or {}).get("art", {})
    return key or ("battle" if "battle" in a else "full_body")


def art_file(c, eid, key=None):
    e = c.get(eid)
    if not e: raise SystemExit(f"unknown entity {eid}")
    a = e.get("art", {})
    key = art_key(c, eid, key)
    f = a[key]["file"]
    f = f if os.path.exists(os.path.join(ROOT, f)) else f.rsplit(".", 1)[0] + ".webp"
    if not os.path.exists(os.path.join(ROOT, f)): raise SystemExit(f"{eid}: no rendered {key} art yet ({f})")
    return f, bool(a[key].get("creature")) or e.get("kind") == "beast" or eid.startswith("beast.")


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
    ap.add_argument("--ids", default="", help="entity ids; `id#art_key` picks another art (a beast stage)")
    ap.add_argument("--all", action="store_true", help="every sprite in tools/anim/cast.json")
    ap.add_argument("--skip-built", action="store_true", help="leave out figures whose rig is already built")
    ap.add_argument("--parts", default="", help="only these parts (default: what the sprite needs, see parts_for)")
    ap.add_argument("--reroll", type=int, default=0)
    ap.add_argument("--ver", default="", help="suffix for the uploaded source name (new art → new name, so no stale copy is used)")
    ap.add_argument("--art", default=None, help="art key to rig (a beast stage: battle_juvenile); default battle / full_body")
    a = ap.parse_args()
    c = load_content()
    only = [p for p in a.parts.split(",") if p]
    targets = [(x.split("#")[0], x.split("#")[1] if "#" in x else a.art) for x in filter(None, a.ids.split(","))]
    if a.all: targets += [(v["id"], v["art"]) for v in CAST.values()]
    q, sources, seen = [], [], set()
    for eid, key in targets:
        rig = rig_name(c, eid, key)
        if rig in seen: continue
        seen.add(rig)
        if a.skip_built and os.path.exists(os.path.join(ROOT, "assets", "anim", rig, "rig.json")): continue
        f, creature = art_file(c, eid, key)
        im = Image.open(os.path.join(ROOT, f)).convert("RGBA")
        flat = Image.new("RGB", im.size, GREY); flat.paste(im, mask=im.getchannel("A"))
        d = os.path.join(ROOT, ".tmp", "anim", rig); os.makedirs(d, exist_ok=True)
        src = os.path.join(d, "source.png"); flat.save(src); sources.append((rig, src))
        gw, gh = gen_size(*im.size)
        flowing = (cast_of(f).get("arch") or ("quadruped" if creature else "humanoid")) in CREATURES
        for p in parts_for(f, creature):
            if only and p not in only: continue
            prompt, transparent = PARTS[p]
            if p == "tag_hair" and flowing: prompt = CREATURE_FLOW
            seed = int(hashlib.sha1(f"{rig}/{p}#{a.reroll}".encode()).hexdigest()[:8], 16)
            q.append({"entity": eid, "key": f"anim_{p}", "file": f"assets/anim/{rig}/{p}.png", "prompt": prompt + (" Plain flat light-grey background." if transparent else ""),
                      "ref": f"ia_anim/{rig}{('_' + a.ver) if a.ver else ''}.png", "w": gw, "h": gh, "transparent": transparent, "seed": seed,
                      "prefix": f"IA_anim/{rig}/{p}" + (f"_r{a.reroll}" if a.reroll else "")})
    os.makedirs(os.path.join(ROOT, ".tmp", "queues"), exist_ok=True)
    path = os.path.join(ROOT, ".tmp", "queues", f"anim_{a.name}.json")
    json.dump(q, open(path, "w"), ensure_ascii=False)
    print(f"{len(q)} jobs -> {path}")
    if len(sources) <= 12:
        for rig, s in sources: print(f"source {rig}: {s}  → ComfyUI input/ia_anim/{rig}{('_' + a.ver) if a.ver else ''}.png")
    else: print(f"{len(sources)} sources under .tmp/anim/<rig>/source.png → ComfyUI input/ia_anim/<rig>.png")


if __name__ == "__main__":
    main()
