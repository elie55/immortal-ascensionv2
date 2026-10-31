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

# Region map art is painted over a guide (tools/art/map_guides.py): the old art blurred, with the road through every place
# in map order, a clearing at each place and dotted trails to side places. refs/maps/<region>_guide.png is image 1.
MAP_GUIDE_PROMPT = ("Image 1 is a rough draft of an illustrated top-down fantasy adventure map for a mobile game: a painted landscape with a road "
    "sketched over it and round clearings marked along the road. Repaint it as one finished, polished, luminous illustration in the same "
    "art style, palette, season and scenery ({scene}). The road must follow exactly the sketched road from the bottom edge to the top, "
    "made of whatever suits this land (dirt road, stone path, steps, snow trail, sand track, bridges or cloud paths), with a small natural "
    "open clearing exactly where each round marker is, and faint narrow side trails where the thin dotted lines are. Keep the composition, "
    "the landmarks and the exact position of every clearing. Remove every glowing lantern, post, pin, marker, icon, symbol, circle outline "
    "and any text: the game draws its own markers on top. No characters.")


def art(file, prompt, size=(256, 256), transparent=True, refs=None, negative=NEG):
    # Shipped art is lossy WebP (alpha kept): ~10x smaller than PNG, native on Android.
    if file.endswith(".png"): file = file[:-4] + ".webp"
    return {"file": file, "size": list(size), "transparent": transparent, "prompt": prompt,
            "negative": negative, "references": refs or [], "status": art_status(file)}

# Art prompts never quote a name or numbers: the model letters them onto the picture (pilot: medals, quest emblems).
NOTXT = "a purely pictorial emblem with no letters, characters, numbers or writing anywhere"

# Icons whose description led the model astray (a throne under a scroll, crossed sticks for a web, lettering in a coin rain):
# the picture to draw instead, keyed by the entity's short key.
ICON_LOOK = {
    "web_snare": "a square technique icon of a glistening web of silver spider silk stretched between bamboo stalks, green glow",
    "immortal_emperor_canon": "a cultivation-method scroll emblem: an imperial jade scroll case with a golden dragon clasp, crimson aura",
    "ten_thousand_gold_rain": "a square technique icon of a torrent of gold coins pouring down from a violet sky onto the ground",
}

def anim_block(entity):
    """Attach the animation rig (assets/anim/<id>/rig.json) when tools/anim/build.py has produced one."""
    rig = os.path.join(ROOT, "assets", "anim", entity["id"], "rig.json")
    if not os.path.exists(rig): entity.pop("anim", None); return entity
    r = json.load(open(rig))
    key = r.get("art") or ("battle" if "battle" in entity.get("art", {}) else "full_body")
    entity["anim"] = {"rig": f"assets/anim/{entity['id']}/rig.json", "art": key, "archetype": r["archetype"]}
    return entity

ELEMENT_COLOR = {"elem.wood": "#5fe39a", "elem.fire": "#ff7b4a", "elem.earth": "#f0c060", "elem.metal": "#f2f5ff", "elem.water": "#6fd0ff", "elem.none": "#d6c9ff"}
MELEE_WEAPONS = ("sword", "saber", "spear", "palm")

def vfx_block(t):
    """Derive how a technique / beast ability looks on the battle stage (docs/BATTLE_STAGE.md §4).
    A block written by hand in a generator wins; passives get none."""
    kind = t.get("kind")
    if kind == "passive": t.pop("vfx", None); return t
    if "vfx" in t: return t
    power = t.get("power", 0) or 0
    targeting = t.get("targeting", "single")
    weapon = t.get("weapon_affinity", "any")
    ult = kind == "ultimate"
    damaging = power > 0
    friendly = targeting in ("self", "ally", "all_allies")
    many = targeting in ("all_enemies", "all_allies", "random")
    heals = bool(t.get("heal_pct")); shields = bool(t.get("shield_pct_max_hp"))
    beast = str(t.get("id", "")).startswith("btech.")
    # techniques without a weapon affinity: the name says whether the blow is struck up close or sent across
    name = str(t.get("name", "")).lower()
    import re as _re
    melee_words = _re.search(r"\b(strike|slash|cut|cleave|claw|bite|fang|palm|fist|kick|sword|blade|saber|spear|thrust|lunge|pounce|charge|maul|gore|tusk|stomp|crush|smash|hoof|horn|tail)", name)
    pierce_words = _re.search(r"\b(spear|thrust|pierce|lance|fang|horn|tusk|needle|sting)", name)
    if weapon == "any" and damaging and melee_words:
        weapon = "spear" if pierce_words else "palm" if _re.search(r"\b(palm|fist|kick|stomp|crush|smash|hoof|maul|pounce|charge)", name) else "sword"
    if not damaging or friendly:
        shape = "glow" if heals else "ring"
    elif ult:
        shape = "rain" if many else "pillar"
    elif many:
        shape = "wave" if weapon in MELEE_WEAPONS else "rain"
    elif weapon in ("sword", "saber"): shape = "slash"
    elif weapon == "spear": shape = "pierce"
    elif weapon == "palm" or beast: shape = "burst"
    elif weapon in ("staff", "fan"): shape = "beam"
    else: shape = "burst"
    approach = "dash" if damaging and not many and not ult and (weapon in MELEE_WEAPONS or beast) else "none"
    impact = "heavy" if ult or power >= 220 else "medium" if power >= 120 or shields else "light"
    camera = "zoom" if ult else "push" if approach == "dash" or impact == "heavy" else "none"
    t["vfx"] = {"approach": approach, "shape": shape, "impact": impact, "camera": camera, "color": ELEMENT_COLOR.get(t.get("element"), "#d6c9ff")}
    return t

def flavor(desc):
    """The sentences of a description that carry imagery (no numbers), for art prompts."""
    import re
    parts = [p.strip() for p in re.split(r"(?<=[.!?])\s+", desc or "") if p.strip() and not re.search(r"\d", p)]
    return " ".join(parts).rstrip(".")

def icon(path, desc, rarity=None, refs=None, size=(256, 256)):
    look = (f", {RARITY_LOOK[rarity]}" if path.startswith("equipment/") else f", with {RARITY_GLOW[rarity]}") if rarity else ""
    return art(f"assets/{path}.png", f"{STYLE}. Game inventory icon of {desc}{look}. Centered single object, "
               f"three-quarter view, subtle glow, isolated on plain background, no text.", size, True,
               refs or ["refs/mockups/inventory_icons.png"])

def bg(path, desc, size=(1080, 1920), refs=None):
    return art(f"assets/{path}.png", f"{STYLE}. Full-screen vertical background: {desc}. Painterly depth, "
               f"atmospheric light, no characters, no text.", size, False, refs or ["refs/mockups/sect_map.png"])

# Creatures must not turn into people: "head to feet" made the model add riders, fairies and humans to animals.
CREATURE = "the whole animal in frame from head to tail, a lone creature with no humans, riders or people"

# How a combat sprite is turned. Foes stand at the top of the battle screen and face the player, who is in front of
# them (owner, 2026-10-30: "make them look in front of them"); the player's party faces right, toward the foes.
FACING = {
    "front": "in a three-quarter front view, body turned toward the viewer, head and eyes looking straight at the viewer as if facing an opponent standing right in front of it",
    "right": "in three-quarter view facing right",
    "left": "in three-quarter view facing left",
}

def battle(path, desc, size=(768, 1024), refs=None, creature=False, facing="front"):
    """Combat sprite (see FACING). The weapon is held clearly away from the body so the animation rig can cut it out."""
    body = CREATURE if creature else "complete figure head to feet"
    weapon = "" if creature else ", any weapon held ready and clearly visible away from the body"
    return art(f"assets/{path}.png", f"{STYLE}. Full-body combat illustration of {desc}, dynamic ready pose {FACING[facing]}, "
               f"{body}{weapon}, isolated on plain background, no text.", size, True, refs or [])

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

# ---------- region map order ----------
SIDE_KINDS = ("hidden", "merchant", "secret_realm")
COMBAT_KINDS = ("battle", "elite", "boss")

def road_layout(nodes, key):
    """Place a region's places along one winding road, bottom (entry) to top (boss), evenly spaced in number order
    (owner: maps must read in number order and the painted road must run through every place). Side places
    (hidden, merchant, secret-realm gate) sit just off the road beside their anchor. Shape varies per region
    (turns, amplitude, phase, mirror) from a hash of its key. Positions are fractions of the 2:3 map art."""
    import math, hashlib
    h = int(hashlib.sha1(key.encode()).hexdigest()[:8], 16)
    turns = 1.15 + (h % 7) * 0.08              # 1.15 … 1.63 S-bends
    amp = 0.31 + ((h >> 3) % 4) * 0.012          # horizontal swing
    phase = ((h >> 7) % 100) / 100 * 0.5 - 0.25
    mirror = -1 if (h >> 11) % 2 else 1
    main = [d for d in nodes if d["kind"] not in SIDE_KINDS]
    side = [d for d in nodes if d["kind"] in SIDE_KINDS]
    def curve(s):  # s 0 → 1 bottom → top
        return 0.5 + mirror * amp * math.sin(2 * math.pi * (turns * s + phase)), 0.93 - 0.85 * s
    pts = [curve(i / 600) for i in range(601)]
    seg = [math.hypot(pts[i + 1][0] - pts[i][0], (pts[i + 1][1] - pts[i][1]) * 1.5) for i in range(600)]
    total = sum(seg); acc = [0.0]
    for l in seg: acc.append(acc[-1] + l)
    def at(frac):
        target = frac * total
        i = next((k for k in range(600) if acc[k + 1] >= target), 599)
        f = (target - acc[i]) / max(1e-9, seg[i])
        return (pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f)
    for i, d in enumerate(main):
        x, y = at(i / max(1, len(main) - 1))
        d["position"] = [round(x, 3), round(y, 3)]
    placed = [tuple(d["position"]) for d in main]
    def free(p):
        return min(math.hypot(p[0] - q[0], (p[1] - q[1]) * 1.5) for q in placed)
    for d in side:
        # anchor = the main place before it in map order
        idx = nodes.index(d); anchor = next((m for m in reversed(nodes[:idx]) if m["kind"] not in SIDE_KINDS), main[0])
        ax, ay = anchor["position"]
        best = None
        for dx in (0.18, -0.18, 0.22, -0.22, 0.26, -0.26, 0.3, -0.3, 0.34, -0.34):
            for dy in (0.0, -0.03, 0.03, -0.06, 0.06, -0.09):
                p = (min(0.88, max(0.12, ax + dx)), min(0.9, max(0.1, ay + dy)))
                score = free(p) - (0.15 if abs(p[0] - 0.5) < 0.12 else 0)
                if best is None or score > best[0]: best = (score, p)
        d["position"] = [round(best[1][0], 3), round(best[1][1], 3)]; placed.append(best[1])
    return nodes

def chain_links(nodes):
    """Region maps open strictly in number order (owner's rule, 2026-10-30): the n-th place on the map links only to the
    previous and next main places, so clearing place n opens place n+1 and nothing further. Side places branch off
    without gating the path: merchants and secret-realm gates open with the place before them, hidden places hang off
    the last battle before them (hidden places are found by winning there). `nodes` is in map-number order."""
    for d in nodes: d["connections"] = []
    def link(a, b):
        a["connections"].append(b["id"]); b["connections"].append(a["id"])
    prev = prev_fight = None
    for d in nodes:
        if d["kind"] == "hidden":
            anchor = prev_fight or prev
            assert anchor, f"{d['id']}: a hidden place cannot come first"
            link(anchor, d)
            d["hidden"] = {**d.get("hidden", {}), "condition": f"Win at {anchor['name']} to search for it"}
        elif d["kind"] in SIDE_KINDS:
            assert prev, f"{d['id']}: a side place cannot come first"
            link(prev, d)
        else:
            if prev: link(prev, d)
            prev = d
            if d["kind"] in COMBAT_KINDS: prev_fight = d
    return nodes

# Which way battle sprites look, read from contact sheets (the arena test cast for now: docs/BATTLE_STAGE.md)
LOOKS = json.load(open(os.path.join(ROOT, "tools", "art", "facing.json"))) if os.path.exists(os.path.join(ROOT, "tools", "art", "facing.json")) else {}

def facing_block(entity):
    """Record which way battle sprites look (tools/art/facing.json, read from contact sheets): the arena mirrors figures to face their foes."""
    for a in (entity.get("art") or {}).values():
        if isinstance(a, dict) and a.get("file") in LOOKS: a["facing"] = LOOKS[a["file"]]
    return entity

def write(rel, data):
    p = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    if isinstance(data, list):  # combatants get their animation rig when one has been built
        for e in data:
            if isinstance(e, dict) and str(e.get("id", "")).split(".")[0] in ("enemy", "boss", "npc", "beast"): anim_block(e)
            if isinstance(e, dict) and str(e.get("id", "")).split(".")[0] in ("tech", "btech"): vfx_block(e)  # stage effect (docs/BATTLE_STAGE.md)
            if isinstance(e, dict) and str(e.get("id", "")).split(".")[0] in ("enemy", "boss", "npc", "beast"): facing_block(e)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print("wrote", rel, len(data) if isinstance(data, list) else "")

# Spirit beast evolution stages must read as clearly different forms of the same creature. No stage adds horns,
# legs or a human shape the species does not have (pilot: moths and eels turned into winged people).
BEAST_STAGE_LOOK = {
    "hatchling": "as a tiny newly hatched young creature with chibi proportions, oversized head and big round shiny eyes, soft fluffy body, stubby legs, small nubs instead of horns, playful and cute, small in frame",
    "juvenile": "as a young adolescent creature, slender and lanky, half-grown features of its kind, curious alert expression, medium size",
    "adult": "as a fully grown powerful adult creature, strong and majestic, fully developed features of its kind, confident stance, filling the frame",
    "sovereign": "as an enormous legendary sovereign form, larger and more ornate than the adult, a glowing crown-like crest, flowing ethereal light, radiant elemental aura and floating runes around it, regal awe-inspiring presence",
}

def beast_stage(path, look, stage, stage_name):
    return battle(path, f"{look}, shown {BEAST_STAGE_LOOK[stage]} ({stage_name})", (768, 768), ["refs/mockups/spirit_beasts.png"], creature=True)

# ---------- resource dungeon tiers ----------
# A resource dungeon has five tiers (I–V). Tier k needs the realm k−1 steps above the entry realm and the tier
# below cleared once; its enemies carry TIER_STAT_MULT^(k−1) on hp/atk/def/sp_power (speed follows the realm's
# enemy curve) and its clear table is the tier-I table with TIER_REWARD_MULT^(k−1) stones and bigger quantities,
# chances and gear rarity weights. Item ids never change, so every tier stays inside the interconnected database.
# Provisional balance: the multipliers are placeholders until a simulation pass measures them.
REALM_ORDER = ["qi_condensation", "foundation_establishment", "core_formation", "nascent_soul", "soul_transformation", "spirit_severing",
               "dao_integration", "tribulation_transcendence", "mahayana", "immortal_ascension", "earth_immortal", "heavenly_immortal",
               "golden_immortal", "immortal_king", "immortal_emperor"]
TIERS = 5
TIER_STAT_MULT = 1.5
TIER_REWARD_MULT = 1.6
TIER_NAMES = ["I", "II", "III", "IV", "V"]
RAR_STEPS = ["common", "uncommon", "rare", "epic", "legendary", "mythic", "immortal"]  # divine: mega dungeons only

def _shift_weights(w, steps):
    """Move rarity weight mass up by `steps` ranks (never into divine)."""
    out = {}
    for r, v in w.items():
        i = min(len(RAR_STEPS) - 1, RAR_STEPS.index(r) + steps)
        out[RAR_STEPS[i]] = out.get(RAR_STEPS[i], 0) + v
    return out

def tier_loot(base, k):
    """Clear table of tier k (k ≥ 2) derived from the tier-I table `base`."""
    f = TIER_REWARD_MULT ** (k - 1)
    q = 1 + 0.5 * (k - 1)
    ents = []
    for e in base["entries"]:
        e2 = dict(e)
        if "chance" in e2: e2["chance"] = round(min(1.0, e2["chance"] * (1.15 ** (k - 1))), 3)
        if "qty" in e2: e2["qty"] = [max(1, round(e2["qty"][0] * q)), max(1, round(e2["qty"][1] * q))]
        if "rarity_weights" in e2: e2["rarity_weights"] = _shift_weights(e2["rarity_weights"], (k - 1) // 2)
        ents.append(e2)
    d = {**base, "id": f"{base['id']}_t{k}", "entries": ents,
         "guaranteed": [{"id": g["id"], "qty": max(1, round(g["qty"] * q))} for g in base.get("guaranteed", [])],
         "spirit_stones": [round(base["spirit_stones"][0] * f), round(base["spirit_stones"][1] * f)],
         "sect_fame": round(base.get("sect_fame", 0) * f), "mastery_xp": round(base.get("mastery_xp", 0) * f)}
    if "ilvl" in base: d["ilvl"] = [base["ilvl"][0] + 4 * (k - 1), base["ilvl"][1] + 4 * (k - 1)]
    return d

def make_tiers(entry_realm_id, entry_stage, base_cp, clear_loot_id, first_clear):
    """Tier list for a resource dungeon. first_clear stones/fame scale with the tier (items stay the same)."""
    o = REALM_ORDER.index(entry_realm_id.split(".")[1])
    tiers = []
    for k in range(1, TIERS + 1):
        ro = min(len(REALM_ORDER) - 1, o + k - 1)
        fc = {kk: (round(v * TIER_REWARD_MULT ** (k - 1)) if isinstance(v, (int, float)) else v) for kk, v in first_clear.items()} if k > 1 else first_clear
        tiers.append({"tier": k, "name": TIER_NAMES[k - 1], "realm": {"id": f"realm.{REALM_ORDER[ro]}", "stage": entry_stage if k == 1 else 1},
                      "stat_mult": round(TIER_STAT_MULT ** (k - 1), 3), "rec_cp": round(base_cp * TIER_STAT_MULT ** (k - 1)),
                      "rewards": {"clear": clear_loot_id if k == 1 else f"{clear_loot_id}_t{k}", "first_clear": fc}})
    return tiers

def tier_loots(base):
    """Clear tables of tiers II–V derived from the tier-I table."""
    return [tier_loot(base, k) for k in range(2, TIERS + 1)]
