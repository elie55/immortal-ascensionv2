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


def char_ref(job):
    """Characters seen in the mockups are drawn from their mockup crop; every other portrait/expression/battle
    sprite is drawn from that NPC's own full-body render once it exists."""
    m0 = re.match(r"assets/npcs/([^/]+)/full_body\.webp", job["file"])
    if m0 and m0.group(1) in MOCKUP_CHARS:
        return f"ia_style/{MOCKUP_CHARS[m0.group(1)]}"
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


def entry(job, variant="ref", tag=""):
    w, h = job["size"]
    gw, gh = gen_size(w, h)
    cref = char_ref(job)
    sref = None if variant == "noref" else style_ref(job, "all" if variant == "allref" else "chars")
    if cref:
        prompt, ref = CHAR_REF_PROMPT + job["prompt"], cref
    elif sref:
        prompt, ref = STYLE_REF_PROMPT + job["prompt"], f"ia_style/{sref}"
    else:
        prompt, ref = job["prompt"], None
    if job.get("transparent"):
        prompt += " Plain flat light-grey background."
    rel = os.path.splitext(job["file"][len("assets/"):])[0]
    seed = int(hashlib.sha1(job["file"].encode()).hexdigest()[:8], 16)
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
    a = ap.parse_args()
    jobs = json.load(open(os.path.join(ROOT, ".tmp/art-jobs.json")))["jobs"]
    ids = set(filter(None, a.ids.split(","))); files = set(filter(None, a.files.split(",")))
    prefixes = tuple(filter(None, a.prefix.split(","))); keys = set(filter(None, a.keys.split(",")))
    sel = [j for j in jobs if (not ids or j["entity"] in ids) and (not files or j["file"] in files)
           and (not prefixes or j["file"][len("assets/"):].startswith(prefixes)) and (not keys or j["key"] in keys)
           and not (a.skip_existing and os.path.exists(os.path.join(ROOT, j["file"])))]
    if a.limit: sel = sel[:a.limit]
    q = [entry(j, a.variant, a.tag) for j in sel]
    os.makedirs(os.path.join(ROOT, ".tmp/queues"), exist_ok=True)
    path = os.path.join(ROOT, ".tmp/queues", f"{a.name}.json")
    json.dump(q, open(path, "w"), ensure_ascii=False)
    print(f"{len(q)} jobs -> {path}")


if __name__ == "__main__":
    main()
