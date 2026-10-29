from common import *

# ---------------- Realms (15) ----------------
REALM_DEFS = [
    ("qi_condensation", "Qi Condensation", "炼气", 1, 120, 1.35),
    ("foundation_establishment", "Foundation Establishment", "筑基", 2, 4_000, 1.32),
    ("core_formation", "Core Formation", "金丹", 3, 60_000, 1.30),
    ("nascent_soul", "Nascent Soul", "元婴", 4, 900_000, 1.28),
    ("soul_transformation", "Soul Transformation", "化神", 5, 1.2e7, 1.27),
    ("spirit_severing", "Spirit Severing", "炼虚", 6, 1.5e8, 1.26),
    ("dao_integration", "Dao Integration", "合体", 7, 1.8e9, 1.25),
    ("tribulation_transcendence", "Tribulation Transcendence", "渡劫", 8, 2.0e10, 1.25),
    ("mahayana", "Mahayana", "大乘", 9, 2.2e11, 1.24),
    ("immortal_ascension", "Immortal Ascension", "飞升", 10, 2.4e12, 1.24),
    ("earth_immortal", "Earth Immortal", "地仙", 11, 2.6e13, 1.23),
    ("heavenly_immortal", "Heavenly Immortal", "天仙", 12, 2.8e14, 1.23),
    ("golden_immortal", "Golden Immortal", "金仙", 13, 3.0e15, 1.22),
    ("immortal_king", "Immortal King", "仙王", 14, 3.2e16, 1.22),
    ("immortal_emperor", "Immortal Emperor", "仙帝", 15, 3.4e17, 1.21),
]
REALM_SCENE = {
    1: "a young cultivator seated in lotus pose on a mossy stone above a misty waterfall, pale jade qi rising in soft spirals, cherry petals drifting",
    2: "a cultivator meditating on a floating stone platform as golden foundation runes lock into a circle beneath her, dawn clouds",
    3: "a golden core igniting like a small sun inside swirling cyan qi, storm clouds parting above mountain peaks",
    4: "a translucent infant soul of light hovering above a meditating cultivator, nebula-coloured sky, lotus blooms",
    5: "a cultivator dissolving into motes of starlight above an ancient altar, galaxy reflections on still water",
    6: "sword-like light severing chains of mist around a cultivator, void-dark sky with silver cracks",
    7: "a cultivator merging with a towering phantom of her own form made of clouds and dao script",
    8: "nine layers of purple lightning spiralling down from a vortex sky toward a lone figure on a peak",
    9: "a vast calm sea of clouds under a golden sun, a cultivator standing on a lotus of light",
    10: "a stairway of light climbing from a mountaintop into a rift of white radiance, phoenix silhouettes",
    11: "a serene immortal realm of floating jade islands and waterfalls flowing upward",
    12: "celestial palaces among aurora clouds, cranes in flight, soft white-gold light",
    13: "a figure wreathed in golden flame standing before a cosmic wheel of law",
    14: "a throne of clouds and starlight above endless realms, azure dragons coiling",
    15: "an emperor of light at the apex of heaven, all five elements orbiting as rings",
}

def realms():
    out = []
    for key, name, cn, order, base, growth in REALM_DEFS:
        rid = f"realm.{key}"
        mb = {"requirements": [], "success_base": 1.0, "unlocks": []}
        if order == 2:
            mb["requirements"] = [q("cons.foundation_pill", 1)]
            mb["unlocks"] = ["sectloc.inner_sect_peak"]
        elif order == 3:
            mb["requirements"] = [q("cons.core_condensing_pill", 1), q("mat.bamboo_dragon_scale", 3)]
            mb["tribulation"] = "tribulation.core_formation"
            mb["success_base"] = 0.9
        elif order >= 4:
            mb["requirements"] = [q("mat.dao_insight_crystal", order - 2)]
            mb["success_base"] = 0.85
            if key in ("soul_transformation", "tribulation_transcendence", "immortal_ascension", "golden_immortal", "immortal_emperor"):
                mb["tribulation"] = f"tribulation.{key}"
                mb["success_base"] = 0.8
        out.append({
            "id": rid, **named(name, f"{name}, the {['first','second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth','eleventh','twelfth','thirteenth','fourteenth','fifteenth'][order-1]} great realm. Nine stages; each stage demands more Qi and grants greater power.", cn),
            "order": order, "stages": 9,
            "qi": {"base": base, "stage_growth": growth},
            "stage_growth": {"hp": 40 * order ** 2, "atk": 6 * order ** 2, "def": 4 * order ** 2, "spd": 1 + order // 3, "sp_power": 8 * order ** 2, "sp_energy": 5 * order},
            "realm_bonus": {"hp": 200 * order ** 2, "atk": 30 * order ** 2, "def": 20 * order ** 2, "crit": 0.5 * order},
            "major_breakthrough": mb,
            "art": {"breakthrough_bg": bg(f"realms/{key}_breakthrough", REALM_SCENE[order], refs=["refs/mockups/cultivation_screen.png"])},
        })
    return out

# ---------------- Elements ----------------
def elements():
    cyc = {"wood": ("earth", "fire"), "fire": ("metal", "earth"), "earth": ("water", "metal"), "metal": ("wood", "water"), "water": ("fire", "wood")}
    meta = {
        "wood": ("Wood", "木", "#5fd38a", ["healing", "regeneration", "poison", "nature", "vines"]),
        "fire": ("Fire", "火", "#ff7a45", ["burst damage", "burning", "destruction"]),
        "earth": ("Earth", "土", "#d9a441", ["defense", "shields", "resilience"]),
        "metal": ("Metal", "金", "#c9d6e3", ["sword damage", "precision", "critical strikes"]),
        "water": ("Water", "水", "#5bb8ff", ["control", "recovery", "freezing", "spiritual energy"]),
    }
    return [{"id": f"elem.{k}", **named(n, f"The {n} element governs {', '.join(t)}.", cn), "overcomes": f"elem.{cyc[k][0]}", "generates": f"elem.{cyc[k][1]}", "color": c, "themes": t}
            for k, (n, cn, c, t) in meta.items()]

# ---------------- Roots ----------------
def roots():
    R = lambda key, name, cn, tier, els, mult, bon, up, desc: {
        "id": f"root.{key}", **named(name, desc, cn), "tier": tier, "elements": [f"elem.{e}" for e in els], "qi_mult": mult,
        "bonuses": bon, "upgrade_to": [f"root.{u}" for u in up], "transform_sources": [],
        "art": {"illustration": art(f"assets/roots/{key}.png", f"{STYLE}. Circular spiritual-root emblem: {desc} Ornate jade and gold ring, glowing elemental symbols, centered, plain background, no text.", (768, 768), True, ["refs/mockups/spirit_root.png"])}}
    return [
        R("faint_mortal", "Faint Mortal Root", "凡根", "single", ["wood"], 0.95, {}, ["wood_water_dual"], "A thin, unremarkable root. Many start here; few stay."),
        R("wood_water_dual", "Wood-Water Dual Root", "木水双灵根", "dual", ["wood", "water"], 1.4, {"elem_dmg.wood": 8, "elem_dmg.water": 8, "heal_bonus": 5}, ["five_elements"], "Wood feeds on water; healing and control flow together. Awakened at Qi Condensation 3."),
        R("fire_earth_dual", "Fire-Earth Dual Root", "火土双灵根", "dual", ["fire", "earth"], 1.4, {"elem_dmg.fire": 8, "elem_res.fire": 8, "def": 30}, ["five_elements"], "Burning resolve on unshakable ground. Burst damage with heavy shields."),
        R("metal_water_dual", "Metal-Water Dual Root", "金水双灵根", "dual", ["metal", "water"], 1.4, {"elem_dmg.metal": 8, "crit": 3, "sp_energy": 20}, ["five_elements"], "Sword edge tempered by ice. Precision and freezing control."),
        R("five_elements", "Five Elements Root", "五行灵根", "five", ["wood", "fire", "earth", "metal", "water"], 2.0, {"elem_dmg.wood": 6, "elem_dmg.fire": 6, "elem_dmg.earth": 6, "elem_dmg.metal": 6, "elem_dmg.water": 6}, [], "All five elements in harmony. A root spoken of only in legends."),
    ]

# ---------------- Status effects ----------------
# Concrete pictures for status icons: an abstract "symbol meaning X" made the model paint a cultivator holding a sigil.
STATUS_LOOK = {
    "burning": "a roaring orange and crimson spirit flame",
    "bleeding": "three crimson blood droplets falling from a bright slash mark",
    "poison": "a green venom droplet dripping from a curved serpent fang in a wisp of toxic mist",
    "freeze": "a pale blue six-pointed ice crystal wrapped in frost",
    "stun": "three small golden stars circling a crackling spark of lightning",
    "silence": "a closed white lotus bud bound tightly with a silver chain",
    "slow": "a bronze hourglass with heavy grey sand trickling slowly",
    "atk_down": "a jade sword snapped in half with its blade pointing down, dim red glow",
    "def_down": "a cracked bronze round shield with shards breaking off, dim red glow",
    "shield": "a translucent cyan hexagon-patterned qi barrier dome",
    "regen": "a sprouting jade-green leaf surrounded by soft healing sparkles",
    "reflect": "a polished round bronze mirror bouncing back a beam of white light",
    "invuln": "a radiant golden temple bell glowing with protective light",
}

def statuses():
    S = lambda key, name, kind, turns, mods, tick, desc, stacking="refresh", mx=1: {
        "id": f"status.{key}", **named(name, desc), "kind": kind, "stacking": stacking, "max_stacks": mx, "default_turns": turns,
        "modifiers": mods, **({"tick": tick} if tick else {}),
        "art": {"icon": art(f"assets/status/{key}.png", f"{STYLE}. Small round game status-effect icon showing a single object and no person, no figure, no face: {STATUS_LOOK[key]}, centred inside a thin glowing round rim, {NOTXT}.", (128, 128), True, ["refs/mockups/battle_screen.png"])}}
    return [
        S("burning", "Burning", "dot", 2, {}, {"pct_atk": 30}, "Takes fire damage each turn.", "stack", 3),
        S("poison", "Poison", "dot", 3, {"heal_bonus": -30}, {"pct_atk": 20}, "Takes nature damage each turn and heals less.", "stack", 5),
        S("bleeding", "Bleeding", "dot", 3, {}, {"pct_max_hp": 4}, "Loses a portion of max HP each turn."),
        S("freeze", "Freeze", "control", 1, {"spd": -25}, None, "Cannot act; moves slower once thawed."),
        S("stun", "Stun", "control", 1, {}, None, "Skips the next turn."),
        S("silence", "Silence", "control", 2, {}, None, "Cannot use techniques; basic attacks only."),
        S("slow", "Slow", "debuff", 2, {"spd": -30}, None, "Speed reduced."),
        S("def_down", "Defense Down", "debuff", 3, {"def": -25}, None, "Defense reduced."),
        S("atk_down", "Attack Down", "debuff", 3, {"atk": -20}, None, "Attack reduced."),
        S("shield", "Shield", "shield", 3, {}, None, "Absorbs damage until depleted."),
        S("regen", "Regeneration", "buff", 3, {}, {"pct_max_hp": -5}, "Restores HP each turn."),
        S("reflect", "Damage Reflection", "buff", 2, {}, None, "Returns part of the damage taken to the attacker."),
        S("invuln", "Invulnerable", "buff", 1, {}, None, "Immune to all damage this turn."),
    ]

# ---------------- Methods ----------------
def methods():
    M = lambda key, name, cn, rarity, grade, elem, mult, bon, req, desc: {
        "id": f"method.{key}", **named(name, desc, cn), "rarity": rarity, "grade": grade, **({"element": f"elem.{elem}"} if elem else {}),
        "qi_mult": mult, "bonuses": bon, "requirements": req, "mastery": {"max_level": 10, "xp_per_level": 60, "per_level_bonus": 0.04},
        "art": {"icon": icon(f"techniques/methods/{key}", f"a cultivation-method scroll emblem evoking {name}{(': ' + flavor(desc)) if flavor(desc) else ''}, {NOTXT}", rarity, ["refs/mockups/cultivation_screen.png"])}}
    return [
        M("azure_cloud_breathing", "Azure Cloud Breathing", "青云吐纳", "uncommon", "earth", None, 1.0, {"sp_energy": 10}, {}, "The Azure Cloud Sect's foundation breathing art. Steady, safe, and endlessly refinable."),
        M("nine_yang_scripture", "Nine Yang Scripture", "九阳真经", "rare", "earth", "fire", 1.35, {"elem_dmg.fire": 10, "hp": 300}, {"realm": {"id": "realm.qi_condensation", "stage": 5}}, "Nine suns circulate through the meridians. Cultivation burns hot and fast."),
        M("heavenly_dragon_art", "Heavenly Dragon Art", "天龙诀", "epic", "heaven", "water", 1.8, {"sp_power": 200, "elem_dmg.water": 12}, {"realm": {"id": "realm.foundation_establishment"}, "rank": "rank.inner_disciple"}, "Qi coils like a dragon through the body. Favoured by the sect's elites."),
        M("primordial_chaos_scripture", "Primordial Chaos Scripture", "混沌经", "legendary", "immortal", None, 2.6, {"sp_power": 600, "crit": 4}, {"realm": {"id": "realm.core_formation"}}, "A scripture older than the sect. Draws Qi from chaos itself."),
    ]

# ---------------- Techniques ----------------
def techs():
    def T(key, kind, name, cn, rarity, elem, desc, power=0, sp=0, cd=0, applies=None, weapon="any", targeting="single", heal=None, shield=None, passive=None, ult=None, req=None, enemy_only=False, hits=1):
        pre = {"active": "active", "passive": "passive", "ultimate": "ult"}[kind]
        d = {"id": f"tech.{pre}.{key}", **named(name, desc, cn), "kind": kind, "rarity": rarity, "element": f"elem.{elem}", "weapon_affinity": weapon,
             "targeting": targeting, "power": power, "hits": hits, "sp_cost": sp, "cooldown": cd, "applies": applies or [], "passive_bonuses": passive or {},
             "requirements": req or {}, "mastery": {"max_level": 10, "xp_per_level": 60, "per_level_bonus": 0.03}, "enemy_only": enemy_only,
             "art": {"icon": icon(f"techniques/{pre}/{key}", f"a square technique icon depicting the {elem}-element art {name} as a glowing martial-art symbol or action{(': ' + flavor(desc)) if flavor(desc) else ''}, {NOTXT}", rarity, ["refs/mockups/battle_screen.png"])}}
        if heal: d["heal_pct"] = heal
        if shield: d["shield_pct_max_hp"] = shield
        if ult: d["ult_charge"] = ult
        return d
    A = lambda s, c=1.0, t=2, p=None: {"status": f"status.{s}", "chance": c, "turns": t, **({"potency": p} if p else {})}
    return [
        # --- player actives ---
        T("azure_strike", "active", "Azure Strike", "青云斩", "rare", "metal", "A swift sword cut wrapped in azure qi. Deals 120% ATK.", 120, 12, 1, weapon="sword"),
        T("flame_palm", "active", "Flame Palm", "烈焰掌", "rare", "fire", "Gather Qi into the palm and release it as a roaring flame. 180% ATK, may Burn.", 180, 20, 3, [A("burning", 0.3, 2)], weapon="palm", req={"realm": {"id": "realm.qi_condensation", "stage": 1}}),
        T("earth_guardian", "active", "Earth Guardian", "厚土护体", "rare", "earth", "A stone shield rises to absorb 25% of max HP in damage.", 0, 18, 4, [A("shield", 1, 3)], targeting="self", shield=25),
        T("thunder_palm", "active", "Thunder Palm", "雷掌", "epic", "metal", "A crackling palm strike. 200% ATK with a 30% chance to Stun.", 200, 24, 3, [A("stun", 0.3, 1)], weapon="palm", req={"realm": {"id": "realm.qi_condensation", "stage": 6}}),
        T("crescent_wind_blade", "active", "Crescent Wind Blade", "新月风刃", "epic", "wood", "Two crescent blades of wind slash every enemy. 110% ATK ×2, may cause Bleeding.", 110, 26, 3, [A("bleeding", 0.4, 3)], targeting="all_enemies", hits=2),
        T("frozen_lotus", "active", "Frozen Lotus", "冰莲绽放", "epic", "water", "A lotus of frost blooms beneath the target. 150% ATK, Slows, 25% chance to Freeze.", 150, 28, 4, [A("slow", 1, 2), A("freeze", 0.25, 1)], req={"realm": {"id": "realm.qi_condensation", "stage": 4}}),
        T("ripple_mending", "active", "Ripple Mending", "涟漪回春", "rare", "water", "Soothing water ripples restore 25% max HP and grant Regeneration.", 0, 22, 4, [A("regen", 1, 3)], targeting="self", heal=25),
        T("verdant_vine_bind", "active", "Verdant Vine Bind", "青藤缚", "rare", "wood", "Vines erupt and bind the target. 90% ATK, Poison and Silence.", 90, 20, 4, [A("poison", 0.8, 3), A("silence", 0.5, 2)]),
        T("swallow_return_sword", "active", "Swallow-Return Sword", "燕返剑", "epic", "metal", "A returning sword arc strikes twice. 95% ATK ×2.", 95, 22, 2, weapon="sword", hits=2, req={"techniques": ["tech.active.azure_strike"]}),
        T("frost_blossom_slash", "active", "Frost Blossom Slash", "霜华斩", "epic", "water", "Bai Lingshuang's signature cut: a bloom of frost along the edge. 170% ATK, may Freeze.", 170, 26, 3, [A("freeze", 0.2, 1)], weapon="sword", req={"realm": {"id": "realm.qi_condensation", "stage": 5}}),
        T("golden_coin_barrage", "active", "Golden Coin Barrage", "金钱雨", "rare", "metal", "A fan of spirit coins pelts the target. 70% ATK ×3, lowers Defense.", 70, 18, 2, [A("def_down", 0.5, 2)], hits=3),
        T("abacus_reckoning", "active", "Abacus Reckoning", "算盘清账", "rare", "earth", "Every debt is counted. 130% ATK, lowers Attack.", 130, 20, 3, [A("atk_down", 0.6, 3)]),
        T("iron_wall_stance", "active", "Iron Wall Stance", "铁壁式", "epic", "earth", "Plant your feet; nothing passes. Invulnerable for one turn.", 0, 30, 6, [A("invuln", 1, 1)], targeting="self", req={"realm": {"id": "realm.foundation_establishment"}}),
        # --- player ultimates ---
        T("heavenly_sword_rain", "ultimate", "Heavenly Sword Rain", "天剑雨", "epic", "metal", "A thousand sword lights fall from the sky. 320% ATK to all enemies, lowers Defense.", 320, 0, 0, [A("def_down", 1, 3)], weapon="sword", targeting="all_enemies", ult=100),
        T("soul_devouring_art", "ultimate", "Soul Devouring Art", "噬魂术", "legendary", "water", "Drain the target's spirit. 280% ATK, heals 30% of damage dealt, Silences.", 280, 0, 0, [A("silence", 1, 2)], ult=100, req={"realm": {"id": "realm.foundation_establishment", "stage": 3}}),
        T("ten_thousand_gold_rain", "ultimate", "Ten Thousand Gold Rain", "万金雨", "epic", "metal", "Tang Xiaoman's ultimate: a deluge of coins buries the field. 260% ATK to all, Stun chance.", 260, 0, 0, [A("stun", 0.4, 1)], targeting="all_enemies", ult=100, enemy_only=True),
        # --- passives ---
        T("sword_mastery", "passive", "Sword Mastery", "剑道精通", "rare", "metal", "Sword techniques deal 15% more damage.", passive={"elem_dmg.metal": 15, "crit": 2}),
        T("iron_body", "passive", "Iron Body", "铁布衫", "rare", "earth", "Defense +12%, damage taken reduced by 5%.", passive={"def": 12, "dmg_red": 5}),
        T("spiritual_regeneration", "passive", "Spiritual Regeneration", "灵息回元", "rare", "water", "Recover 6 Spiritual Energy at the start of each turn.", passive={"sp_energy": 30}),
        T("critical_insight", "passive", "Critical Insight", "破绽洞察", "epic", "metal", "Critical chance +6%, critical damage +20%.", passive={"crit": 6, "crit_dmg": 20}),
        T("elemental_harmony", "passive", "Elemental Harmony", "五行调和", "epic", "wood", "All elemental resistances +8%.", passive={"elem_res.wood": 8, "elem_res.fire": 8, "elem_res.earth": 8, "elem_res.metal": 8, "elem_res.water": 8}),
        # --- enemy-only ---
        T("bamboo_spike", "active", "Bamboo Spike", "竹刺", "common", "wood", "Sharpened bamboo erupts from the ground.", 110, 10, 2, [A("bleeding", 0.3, 2)], enemy_only=True),
        T("reed_whisper_curse", "active", "Reed Whisper Curse", "苇语咒", "rare", "water", "A whisper that steals the voice.", 100, 15, 3, [A("silence", 0.6, 2)], enemy_only=True),
        T("venom_fang", "active", "Venom Fang", "毒牙", "common", "wood", "A poisonous bite.", 100, 8, 2, [A("poison", 0.7, 3)], enemy_only=True),
        T("heavenly_bolt", "active", "Heavenly Bolt", "天雷", "epic", "metal", "A bolt of tribulation lightning.", 220, 0, 1, [A("stun", 0.3, 1)], enemy_only=True),
        T("thunder_judgment", "active", "Thunder Judgment", "雷罚", "legendary", "metal", "The sky passes judgment on all below.", 300, 0, 4, [A("def_down", 1, 2)], targeting="all_enemies", enemy_only=True),
        T("abyssal_torrent", "active", "Abyssal Torrent", "渊潮", "mythic", "water", "The nine heads breathe a flood of black water.", 280, 0, 3, [A("slow", 1, 2), A("freeze", 0.3, 1)], targeting="all_enemies", enemy_only=True),
        T("bandit_slash", "active", "Bandit Slash", "匪刀", "common", "metal", "A crude but heavy saber swing.", 115, 8, 1, enemy_only=True),
        T("savage_bite", "active", "Savage Bite", "撕咬", "common", "metal", "A tearing bite that leaves a bleeding wound.", 105, 6, 1, [A("bleeding", 0.4, 2)], enemy_only=True),
        T("stone_shell", "active", "Stone Shell", "石甲", "uncommon", "earth", "The creature hardens its hide.", 0, 10, 4, [A("shield", 1, 2)], targeting="self", shield=20, enemy_only=True),
        T("frost_breath", "active", "Frost Breath", "霜息", "rare", "water", "A cone of freezing breath.", 140, 12, 3, [A("freeze", 0.3, 1)], targeting="all_enemies", enemy_only=True),
        T("web_snare", "active", "Web Snare", "丝缚", "uncommon", "wood", "Sticky silk slows the prey.", 80, 8, 2, [A("slow", 0.8, 2)], enemy_only=True),
        T("mirror_scale", "active", "Mirror Scale", "镜鳞", "epic", "metal", "Scales turn to mirrors, reflecting harm.", 0, 15, 5, [A("reflect", 1, 2)], targeting="self", enemy_only=True),
    ]

def beast_abilities():
    B = lambda beast, key, name, kind, elem, desc, power=0, applies=None, passive=None, heal=None: {
        "id": f"btech.{beast}.{key}", "beast": f"beast.{beast}", **named(name, desc), "kind": kind, "element": f"elem.{elem}", "power": power,
        **({"heal_pct": heal} if heal else {}), "applies": applies or [], "passive_bonuses": passive or {}, "cooldown": 3,
        "art": {"icon": icon(f"techniques/beast/{beast}_{key}", f"a square spirit-beast ability icon depicting {name}{(': ' + flavor(desc)) if flavor(desc) else ''}, {NOTXT}", "rare", ["refs/mockups/spirit_beasts.png"])}}
    return [
        B("yunyun", "cloud_veil", "Cloud Veil", "active", "water", "YunYun wraps the party in soft cloud, granting a small shield.", 0, [{"status": "status.shield", "chance": 1, "turns": 2}]),
        B("yunyun", "nimble_spirit", "Nimble Spirit", "passive", "water", "Evasion +5%.", passive={"eva": 5}),
        B("flame_fox", "fox_fire", "Fox Fire", "active", "fire", "A burst of fox-fire scorches the target. 90% ATK, may Burn.", 90, [{"status": "status.burning", "chance": 0.5, "turns": 2}]),
        B("flame_fox", "ember_heart", "Ember Heart", "passive", "fire", "Fire damage +6%.", passive={"elem_dmg.fire": 6}),
    ]

if __name__ == "__main__":
    write("content/world/realms.json", realms())
    write("content/world/elements.json", elements())
    write("content/world/roots.json", roots())
    write("content/world/status_effects.json", statuses())
    write("content/techniques/methods.json", methods())
    t = techs()
    write("content/techniques/active.techs.json", [x for x in t if x["kind"] == "active"])
    write("content/techniques/passive.techs.json", [x for x in t if x["kind"] == "passive"])
    write("content/techniques/ultimate.techs.json", [x for x in t if x["kind"] == "ultimate"])
    write("content/techniques/beast_abilities.json", beast_abilities())
