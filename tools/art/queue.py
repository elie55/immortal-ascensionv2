"""
Build a compact ComfyUI queue file from .tmp/art-jobs.json.

The browser on the owner's PC loads the queue from ComfyUI's input folder (ia/<name>.json),
turns each entry into a Qwen-Image-Edit 2511 graph (see tools/art/comfy_submit.js) and POSTs it
to the local ComfyUI API. Outputs land in ComfyUI-Shared/output/<prefix>_00001_.png and are
collected back into assets/ by tools/art/collect.py.

Usage:
  python3 tools/art/queue.py --name pilot --ids gear.rimeglass_spear,mat.spirit_iron_ore [--variant noref]
  python3 tools/art/queue.py --name batch01 --prefix enemies/,bosses/ --skip-existing
"""
import argparse, json, math, os, re, hashlib

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_ROOT = "IA"   # ComfyUI output subfolder

STYLE_REF_PROMPT = ("Use image 1 only as an art-style reference: match its rendering, linework, colour palette, lighting and level of "
                    "detail, but do NOT copy its subject, characters, composition, text, frames or interface elements. Draw a completely new image: ")
CHAR_REF_PROMPT = ("Image 1 is the character reference sheet. Keep exactly the same character: same face, hairstyle, hair colour, eye colour, "
                   "outfit, colours and accessories. Draw: ")


def style_ref(job, mode="chars"):
    """Which style anchor (refs/style/*.png) a job is drawn against.
    Pilot 1 showed the anchors barely move the look but leak frames/UI into icons and cost ~50% more time,
    so by default (mode "chars") none is used; character identity comes from char_ref()."""
    f, key = job["file"], job["key"]
    if mode == "chars":
        return None
    if key in ("portrait", "full_body", "battle") and f.startswith("assets/npcs/"):
        return "char_lin.png"
    if key.startswith("expression_"):
        return None  # uses the character's own full-body render, see char_ref()
    if key in ("card",):
        return "region_cards.png"
    if key in ("map", "battle_bg", "cg", "illustration", "background", "intro") or f.startswith("assets/sect/"):
        return "sect_map.png"
    if key == "icon" or max(job["size"]) <= 512:
        return "icons.png"
    return "char_lin.png"  # creatures, bosses, beasts: figure rendering


MOCKUP_CHARS = {"lin_xueyao": "char_lin.png", "bai_lingshuang": "char_bai.png", "elder_wen": "char_elder_wen.png", "tang_xiaoman": "char_tang.png"}


# Prologue CGs are the owner's mockup screenshots (refs/mockups/prologue/) with the interface painted out.
MOCKUP_SCENE = ("Image 1 is a screenshot of the approved game scene, with the game's interface drawn over the painting. Redraw exactly this same painting "
                "as one clean full-screen illustration at high resolution: the same place, the same characters with the same faces, hair, outfits, poses and "
                "held objects, the same colours, light and composition. Remove every interface element: the top bar and its buttons, every label, chip and "
                "name tag, the dialogue or narration box with its frame and text, answer buttons, vertical title text, the rounded gold frame around the "
                "screen and all writing; paint what they covered in the same style, completing the characters' bodies. ")
PROLOGUE_MOCKS = {"entrance_gate": "gate", "elders_trial": "trial_q1", "senior_sister": "senior_sister", "first_method": "first_method", "first_sword_art": "sword_lesson"}

# Jobs drawn from a mockup crop (pose and costume as in the approved mockup), with their own reference prompt.
FILE_REF = {
    **{f"assets/story/prologue_{k}.webp": (f"ia_style/prologue_{m}.png", MOCKUP_SCENE) for k, m in PROLOGUE_MOCKS.items()},
    "assets/ui/sect_map.webp": ("ia_style/sect_map_art.png",
        "Image 1 is the approved reference illustration with game labels on top. Redraw exactly this same floating sect illustration at high resolution with crisp, "
        "clean, luminous painted detail: the same islands, buildings, bridges, waterfalls, trees, clouds, colours and composition, every building in the same place. "
        "Remove every label, plaque, button, badge, icon, portrait and all text: only the painted scenery remains. "),
    "assets/ui/alchemy_cauldron.webp": ("ia_style/alchemy_cauldron.png",
        "Image 1 is a crop of the approved Alchemy Hall mockup. Redraw this same bronze alchemy cauldron on its own: the same shape, three legs, "
        "dragon handles, emerald jade medallion, gold filigree and glowing jade and pink smoke, at high resolution with crisp clean detail. "
        "Remove the shelves, jars, room and any interface: only the cauldron and its smoke remain. Draw: "),
    "assets/ui/cultivate_lotus.webp": ("ia_style/cult_lin.png",
        "Image 1 is the approved reference illustration. Redraw exactly this character in exactly this pose, with the same face, hairstyle, ornaments, outfit, "
        "colours and flowing jade ribbons, at high resolution with crisp clean detail. Remove the background and the gold button under her. Draw: "),
}


# --redraw: the asset's current image is the reference (uploaded as input/ia_cur/<entity>__<key>.png) and the new
# prompt says what changes; identity, outfit and colours come from the image (owner: turn every foe toward the player).
REDRAW_PROMPT = ("Image 1 is the approved design. Keep everything about it exactly the same: the same subject and species, the same anatomy and "
                 "body shape (an animal, serpent, dragon or monster stays exactly that creature, never a human), the same face, outfit, colours, markings, "
                 "weapons and held objects (add none, remove none), the same rider or mount if there is one, the same effects and art style. ")
# what each FACING value asks of a redraw
REDRAW_TURN = {
    # A softer wording ("three-quarter front view ... if it already faces the viewer, keep the pose") left most foes
    # looking sideways (2026-10-30 run): the turn is now stated as a hard requirement, with no way out.
    "front": "Change only its orientation: redraw it facing the viewer head-on. The body is turned squarely toward the viewer "
             "(at most a slight turn) and the face is seen from the front, with both eyes visible and looking straight into the "
             "camera, as if staring down an opponent standing directly in front of it. The head must not be turned to the side "
             "and must not be in profile.",
    "right": "Only turn it to face right in a three-quarter view, toward an opponent on the right. If it already faces right, keep the pose.",
    "left": "Only turn it to face left in a three-quarter view. If it already faces left, keep the pose.",
}


def redraw_ref_name(job):
    return f"ia_cur/{job['entity']}__{job['key']}.png"


def char_ref(job):
    """Characters seen in the mockups are drawn from their mockup crop; every other portrait/expression/battle
    sprite is drawn from that NPC's own full-body render once it exists."""
    m0 = re.match(r"assets/npcs/([^/]+)/full_body\.webp", job["file"])
    if m0 and m0.group(1) in MOCKUP_CHARS:
        return f"ia_style/{MOCKUP_CHARS[m0.group(1)]}"
    for r in job.get("references", []):
        mr = re.match(r"assets/npcs/([^/]+)/full_body\.webp$", r)
        if mr and job["file"] != r and os.path.exists(os.path.join(ROOT, r)):
            return f"ia_chars/{mr.group(1)}.png"
    m = re.match(r"assets/npcs/([^/]+)/(portrait|expression_\w+|battle)\.webp", job["file"])
    if m:
        fb = os.path.join(ROOT, "assets/npcs", m.group(1), "full_body.webp")
        if os.path.exists(fb):
            return f"ia_chars/{m.group(1)}.png"
    return None


def gen_size(w, h, mp=1.05):
    """~1 MP generation size with the target aspect, multiples of 16; final resize happens in collect.py."""
    ar = w / h
    gh = math.sqrt(mp * 1024 * 1024 / ar)
    gw = gh * ar
    return int(round(gw / 16) * 16), int(round(gh / 16) * 16)


def entry(job, variant="ref", tag="", reroll=0, redraw=False):
    w, h = job["size"]
    gw, gh = gen_size(w, h)
    cref = char_ref(job)
    sref = None if variant == "noref" else style_ref(job, "all" if variant == "allref" else "chars")
    if redraw:
        turn = "right" if "facing right" in job["prompt"] else "left" if "facing left" in job["prompt"] else "front"
        prompt, ref = REDRAW_PROMPT + REDRAW_TURN[turn] + " The complete figure stays in frame, same scale.", redraw_ref_name(job)
    elif job["file"] in FILE_REF:
        ref, pre = FILE_REF[job["file"]]
        prompt = pre + job["prompt"]
    elif cref:
        prompt, ref = CHAR_REF_PROMPT + job["prompt"], cref
    elif sref:
        prompt, ref = STYLE_REF_PROMPT + job["prompt"], f"ia_style/{sref}"
    else:
        prompt, ref = job["prompt"], None
    if job.get("transparent"):
        prompt += " Plain flat light-grey background."
    rel = os.path.splitext(job["file"][len("assets/"):])[0]
    # Same file → same seed, so a render is reproducible; --reroll N draws a different one with the same prompt.
    seed = int(hashlib.sha1((job["file"] + (f"#{reroll}" if reroll else "")).encode()).hexdigest()[:8], 16)
    return {"entity": job["entity"], "key": job["key"], "file": job["file"], "prompt": prompt, "ref": ref,
            "w": gw, "h": gh, "transparent": bool(job.get("transparent")), "seed": seed,
            "prefix": (f"{OUT_ROOT}/{rel}" if variant == "ref" else f"{OUT_ROOT}_{variant}/{rel}") + (f"_{tag}" if tag else "")}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--ids", default="", help="comma-separated entity ids (all their art keys)")
    ap.add_argument("--files", default="", help="comma-separated asset files")
    ap.add_argument("--prefix", default="", help="comma-separated asset path prefixes after assets/")
    ap.add_argument("--keys", default="", help="only these art keys")
    ap.add_argument("--variant", default="ref", choices=["ref", "noref", "allref"])
    ap.add_argument("--skip-existing", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--tag", default="", help="suffix for output names (pilot rounds)")
    ap.add_argument("--reroll", type=int, default=0, help="new seed for the same prompt (bad draw: frame, stray object, bad cut-out)")
    ap.add_argument("--redraw", action="store_true", help="draw from the asset's current image (identity kept, the prompt's pose applied); writes the reference PNGs to .tmp/redraw_refs/")
    ap.add_argument("--exclude", default="", help="comma-separated entity ids to leave out")
    a = ap.parse_args()
    jobs = json.load(open(os.path.join(ROOT, ".tmp/art-jobs.json")))["jobs"]
    ids = set(filter(None, a.ids.split(","))); files = set(filter(None, a.files.split(",")))
    prefixes = tuple(filter(None, a.prefix.split(","))); keys = set(filter(None, a.keys.split(",")))
    sel = [j for j in jobs if (not ids or j["entity"] in ids) and (not files or j["file"] in files)
           and (not prefixes or j["file"][len("assets/"):].startswith(prefixes)) and (not keys or j["key"] in keys)
           and not (a.skip_existing and os.path.exists(os.path.join(ROOT, j["file"])))]
    excl = set(filter(None, a.exclude.split(",")))
    sel = [j for j in sel if j["entity"] not in excl]
    if a.limit: sel = sel[:a.limit]
    if a.redraw:
        from PIL import Image
        out = os.path.join(ROOT, ".tmp", "redraw_refs"); os.makedirs(os.path.join(out, "ia_cur"), exist_ok=True)
        for j in sel:
            im = Image.open(os.path.join(ROOT, j["file"])).convert("RGBA")
            flat = Image.new("RGB", im.size, (217, 217, 217)); flat.paste(im, mask=im.getchannel("A"))
            flat.save(os.path.join(out, redraw_ref_name(j)))
    q = [entry(j, a.variant, a.tag, a.reroll, a.redraw) for j in sel]
    os.makedirs(os.path.join(ROOT, ".tmp/queues"), exist_ok=True)
    path = os.path.join(ROOT, ".tmp/queues", f"{a.name}.json")
    json.dump(q, open(path, "w"), ensure_ascii=False)
    print(f"{len(q)} jobs -> {path}")


if __name__ == "__main__":
    main()
