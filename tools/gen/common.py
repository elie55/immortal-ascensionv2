import json, os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
STYLE = ("Immortal Ascension game art: polished anime xianxia illustration in the style of a premium Chinese mobile RPG, "
         "soft cel shading with smooth painterly gradients, thin delicate lineart without thick outlines, luminous glowing highlights, "
         "atmospheric lighting, colours that suit the subject, highly detailed")
NEG = "text, watermark, signature, logo, UI, frame, border, blurry, lowres, deformed, extra fingers, bad anatomy, cropped"
RARITY_LOOK = {
    "common": "plain bamboo wood and rough undyed cloth, muted natural colours, no ornament",
    "uncommon": "polished bronze fittings with small green jade accents, faint glow",
    "rare": "silvered steel and blue-green jade, soft cyan glow, simple engraved cloud pattern",
    "epic": "violet-blue enchanted glow, ornate carvings, trailing spirit mist",
    "legendary": "golden filigree, flame-like golden aura, intricate phoenix and cloud motifs",
    "mythic": "crimson and black lacquer with silver starlight runes, swirling dark-red aura",
    "immortal": "white-gold radiance, celestial clouds, feathered light, translucent crystal",
    "divine": "prismatic dragon-pearl light, azure dragon motifs, rainbow halo, overwhelming divine aura",
}
RARITY_GLOW = {
    "common": "no glow", "uncommon": "a faint green glow", "rare": "a soft cyan glow", "epic": "a violet glow with drifting spirit mist",
    "legendary": "a radiant golden glow", "mythic": "a crimson aura with silver starlight sparks", "immortal": "a white-gold celestial radiance",
    "divine": "a prismatic rainbow halo of overwhelming divine light",
}
RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary", "mythic", "immortal", "divine"]

_APPROVED_PATH = os.path.join(ROOT, "assets", "APPROVED.txt")
APPROVED = set(l.strip() for l in open(_APPROVED_PATH, encoding="utf-8")) if os.path.exists(_APPROVED_PATH) else set()

def art_status(file):
    """planned → generated (file exists in assets/) → approved (listed in assets/APPROVED.txt by the owner)."""
    if not os.path.exists(os.path.join(ROOT, file)): return "planned"
    return "approved" if file in APPROVED else "generated"

def art(file, prompt, size=(256, 256), transparent=True, refs=None, negative=NEG):
    # Shipped art is lossy WebP (alpha kept): ~10x smaller than PNG, native on Android.
    if file.endswith(".png"): file = file[:-4] + ".webp"
    return {"file": file, "size": list(size), "transparent": transparent, "prompt": prompt,
            "negative": negative, "references": refs or [], "status": art_status(file)}

def icon(path, desc, rarity=None, refs=None, size=(256, 256)):
    look = (f", {RARITY_LOOK[rarity]}" if path.startswith("equipment/") else f", with {RARITY_GLOW[rarity]}") if rarity else ""
    return art(f"assets/{path}.png", f"{STYLE}. Game inventory icon of {desc}{look}. Centered single object, "
               f"three-quarter view, subtle glow, isolated on plain background, no text.", size, True,
               refs or ["refs/mockups/inventory_icons.png"])

def bg(path, desc, size=(1080, 1920), refs=None):
    return art(f"assets/{path}.png", f"{STYLE}. Full-screen vertical background: {desc}. Painterly depth, "
               f"atmospheric light, no characters, no text.", size, False, refs or ["refs/mockups/sect_map.png"])

def battle(path, desc, size=(768, 1024), refs=None):
    return art(f"assets/{path}.png", f"{STYLE}. Full-body combat illustration of {desc}, dynamic idle pose facing left, "
               f"complete figure head to feet, isolated on plain background, no text.", size, True, refs or [])

def portrait(path, desc, refs=None):
    return art(f"assets/{path}.png", f"{STYLE}. Bust portrait of {desc}, facing slightly left, soft expression, "
               f"plain background, no text.", (512, 512), True, refs or [])

def full_body(path, desc, refs=None):
    return art(f"assets/{path}.png", f"{STYLE}. Full-body standing illustration of {desc}, complete figure head to feet, "
               f"elegant pose, isolated on plain background, no text.", (1024, 1536), True, refs or [])

def expression(path, desc, mood, refs=None):
    return art(f"assets/{path}.png", f"{STYLE}. Bust portrait of {desc}, {mood} expression, same face and outfit as the "
               f"reference, plain background, no text.", (512, 512), True, refs or [])

def named(name, desc, cn=None, lore=None):
    d = {"name": name, "description": desc}
    if cn: d["name_cn"] = cn
    if lore: d["lore"] = lore
    return d

def q(i, n): return {"id": i, "qty": n}

def write(rel, data):
    p = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print("wrote", rel, len(data) if isinstance(data, list) else "")
