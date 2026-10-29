import json, os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
STYLE = ("Immortal Ascension game art, premium anime xianxia illustration, soft painterly rendering, delicate linework, "
         "luminous palette of jade green, pale cyan, soft pink, warm gold and deep navy, gentle rim light, high detail")
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
RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary", "mythic", "immortal", "divine"]

def art(file, prompt, size=(256, 256), transparent=True, refs=None, negative=NEG):
    return {"file": file, "size": list(size), "transparent": transparent, "prompt": prompt,
            "negative": negative, "references": refs or [], "status": "planned"}

def icon(path, desc, rarity=None, refs=None, size=(256, 256)):
    look = f", {RARITY_LOOK[rarity]}" if rarity else ""
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
