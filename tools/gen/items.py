from common import *

def item(prefix, key, name, desc, rarity, sell, sub, cn=None, extra=None, tags=None, stack=999):
    d = {"id": f"{prefix}.{key}", **named(name, desc, cn), "rarity": rarity, "sell_value": sell, "stack_limit": stack, "tags": tags or [],
         "art": {"icon": icon(f"items/{sub}/{key}", f"{desc}", rarity)}}
    d.update(extra or {})
    return d

def materials():
    M = lambda key, name, desc, rarity, sell, subtype, tier, cn=None, extra=None: item("mat", key, name, desc, rarity, sell, "materials", cn, {"subtype": subtype, "tier": tier, **(extra or {})})
    return [
        M("spirit_grass", "Spirit Grass", "a tuft of luminous green spirit grass with dew on its blades", "common", 4, "herb", 1, "灵草"),
        M("peach_blossom", "Peach Blossom", "a sprig of soft pink peach blossoms glowing faintly", "common", 5, "flower", 1, "桃花"),
        M("crane_feather", "Crane Feather", "a long white crane feather tipped with pale blue light", "common", 6, "monster", 1, "鹤羽"),
        M("wolf_fang", "Wolf Fang", "a curved ivory wolf fang on a leather cord", "common", 6, "monster", 1, "狼牙"),
        M("boar_tusk", "Boar Tusk", "a thick yellowed boar tusk, chipped at the tip", "common", 5, "monster", 1, "野猪獠牙"),
        M("river_pebble", "River Pebble", "a smooth grey river pebble streaked with quartz", "common", 2, "ore", 1, "河卵石"),
        M("spirit_monkey_fur", "Spirit Monkey Fur", "a tuft of silver-grey monkey fur crackling with faint qi", "common", 6, "monster", 1, "灵猴毛"),
        M("spirit_iron_ore", "Spirit Iron Ore", "a dark blue iron ore nugget shot through with glowing cyan veins", "uncommon", 12, "ore", 2, "灵铁矿"),
        M("frost_beast_core", "Frost Beast Core", "a fist-sized pale blue crystal core radiating cold mist", "uncommon", 30, "crystal", 2, "寒兽核"),
        M("azure_wolf_pelt", "Azure Wolf Pelt", "a folded blue-grey wolf pelt with a white ruff", "uncommon", 18, "monster", 2, "苍狼皮"),
        M("bamboo_spirit_shoot", "Bamboo Spirit Shoot", "a tender jade-green bamboo shoot wrapped in pale leaves", "uncommon", 10, "herb", 2, "灵竹笋"),
        M("jade_bamboo_segment", "Jade Bamboo Segment", "a short segment of translucent jade-green bamboo", "uncommon", 14, "herb", 2, "翠竹节"),
        M("green_viper_venom", "Green Viper Venom", "a small vial of glowing green viper venom", "uncommon", 16, "monster", 2, "青蛇毒"),
        M("cloud_silk_bolt", "Cloud Silk Bolt", "a rolled bolt of shimmering white cloud-silk", "rare", 40, "treasure", 2, "云丝"),
        M("lesser_enhancement_stone", "Lesser Enhancement Stone", "a rough grey whetstone with a faint golden sheen", "common", 8, "enhancement", 1, "炼器石", {"enhances": ["common", "uncommon", "rare", "epic"]}),
        M("spirit_enhancing_stone", "Spirit Enhancing Stone", "a polished octagonal stone pulsing with golden light", "rare", 60, "enhancement", 2, "灵炼石", {"enhances": RARITY_ORDER}),
        M("refining_stone", "Refining Stone", "a deep violet crystal shard used to refine equipment rarity", "rare", 80, "refining", 2, "精炼石"),
        M("reforging_sand", "Reforging Sand", "a pouch of glittering silver-blue sand", "uncommon", 50, "refining", 2, "重铸砂"),
        M("awakening_crystal", "Awakening Crystal", "a tall red-gold crystal with a flame trapped inside", "legendary", 600, "awakening", 4, "觉醒晶"),
        M("glacier_iron_ore", "Glacier Iron Ore", "a chunk of icy white ore veined with pale blue", "rare", 45, "ore", 3, "冰铁矿"),
        M("rime_crystal", "Rime Crystal", "a spiky hexagonal crystal of eternal frost", "rare", 55, "crystal", 3, "霜晶"),
        M("frost_wyrm_heart_core", "Frost Wyrm Heart-Core", "a heart-shaped crystal of deep blue ice, faintly beating", "epic", 400, "monster", 4, "冰蛟心核"),
        M("bamboo_dragon_scale", "Bamboo Dragon Scale", "a palm-sized jade-green dragon scale with bamboo-leaf veining", "epic", 250, "monster", 3, "竹龙鳞"),
        M("flame_lotus", "Flame Lotus", "a lotus flower of living orange flame on a black stem", "rare", 120, "flower", 3, "焰莲"),
        M("dao_insight_crystal", "Dao Insight Crystal", "a floating white crystal etched with shifting dao script", "legendary", 1500, "breakthrough", 5, "悟道晶"),
        M("sword_rain_fragment", "Sword Rain Fragment", "a torn page of a sword manual, the ink forming falling blades", "epic", 100, "fragment", 3, "剑雨残页", {"fragment_of": {"tech": "tech.ult.heavenly_sword_rain", "count": 10}}),
        M("abyss_serpent_fang", "Abyss Serpent Fang", "a black fang as long as a forearm, dripping dark water", "mythic", 2500, "monster", 6, "渊蛇牙"),
    ]

def consumables():
    C = lambda key, name, desc, rarity, sell, subtype, grade, effects, cn=None, battle=False: item("cons", key, name, desc, rarity, sell, "consumables", cn, {"subtype": subtype, "grade": grade, "effects": effects, "usable_in_battle": battle, "cooldown_min": 0})
    return [
        C("qi_gathering_pill", "Qi Gathering Pill", "a small round pale-green pill in a wisp of qi", "uncommon", 15, "pill", 1, {"qi": 600}, "聚气丹"),
        C("blossom_healing_pill", "Blossom Healing Pill", "a pink pill shaped like a closed peach blossom", "uncommon", 20, "pill", 1, {"hp_pct": 40}, "桃花疗伤丹", True),
        C("spirit_condensing_pill", "Spirit Condensing Pill", "a golden pill with a swirl of white cloud inside", "rare", 45, "pill", 2, {"qi": 2500, "cultivation_boost": {"mult": 1.2, "minutes": 60}}, "凝神丹"),
        C("foundation_pill", "Foundation Pill", "a heavy amber pill wrapped in golden runes", "epic", 200, "pill", 3, {"breakthrough_chance_bonus": 0.10, "qi": 8000}, "筑基丹"),
        C("frost_heart_elixir", "Frost Heart Elixir", "a slender vial of pale blue elixir frosting over", "epic", 260, "elixir", 4, {"permanent": {"elem_res.water": 3, "sp_energy": 10}}, "冰心露"),
        C("core_condensing_pill", "Core Condensing Pill", "a white pill with a golden core visible through it", "legendary", 900, "pill", 5, {"breakthrough_chance_bonus": 0.15, "qi": 40000}, "结丹丹"),
        C("spirit_tea", "Spirit Tea", "a steaming cup of jade-green tea on a bamboo saucer", "common", 8, "food", 1, {"sp_pct": 30, "buff": {"status": "status.regen", "chance": 1, "turns": 3}}, "灵茶", True),
    ]

def gifts():
    G = lambda key, name, desc, rarity, sell, base, tags, cn=None: item("gift", key, name, desc, rarity, sell, "gifts", cn, {"base_affinity": base, "gift_tags": tags})
    return [
        G("candied_hawthorn", "Candied Hawthorn", "a skewer of glossy red candied hawthorns", "common", 5, 5, ["snack", "sweet"], "糖葫芦"),
        G("osmanthus_cake", "Osmanthus Cake", "a square of pale yellow osmanthus cake on a leaf", "common", 8, 6, ["snack", "sweet", "refined"], "桂花糕"),
        G("ancient_spirit_coin", "Ancient Spirit Coin", "a large square-holed bronze coin engraved with a cloud dragon", "rare", 60, 10, ["coin", "antique", "treasure"], "古灵钱"),
        G("rare_treasure_map", "Rare Treasure Map", "a rolled yellowed map with a red-inked route", "rare", 80, 10, ["map", "treasure"], "藏宝图"),
        G("spirit_stone_pouch", "Spirit Stone Pouch", "a small embroidered pouch bulging with spirit stones", "uncommon", 50, 8, ["coin", "treasure"], "灵石袋"),
        G("fine_ledger_book", "Fine Ledger Book", "a leather-bound ledger with gilded edges", "uncommon", 40, 8, ["ledger", "refined"], "精装账本"),
        G("counterfeit_coin", "Counterfeit Coin", "a cheap tin coin badly stamped to imitate a spirit coin", "common", 1, -5, ["fake", "junk_gift"], "假币"),
        G("bitter_medicine", "Bitter Medicine", "a bowl of black, bitter herbal medicine", "common", 2, -3, ["medicine", "bitter"], "苦药"),
        G("frost_plum_wine", "Frost Plum Wine", "a frosted blue porcelain bottle of plum wine", "rare", 90, 10, ["wine", "refined", "frost"], "霜梅酒"),
        G("sword_polish_cloth", "Sword Polish Cloth", "a folded white silk cloth with a whetstone and oil vial", "uncommon", 25, 6, ["sword_care", "practical"], "拭剑布"),
        G("beast_bell", "Beast Bell", "a small golden bell on a red tassel that spirit beasts adore", "uncommon", 35, 8, ["beast", "practical"], "兽铃"),
    ]

def books():
    B = lambda key, name, desc, rarity, sell, teaches, cn=None: item("book", key, name, desc, rarity, sell, "books", cn, {"teaches": teaches}, stack=5)
    return [
        B("crescent_wind_blade_manual", "Crescent Wind Blade Manual", "a green silk-bound manual with a crescent moon on the cover", "epic", 300, "tech.active.crescent_wind_blade", "新月风刃秘籍"),
        B("ripple_mending_scroll", "Ripple Mending Scroll", "a water-blue scroll tied with a white ribbon", "rare", 150, "tech.active.ripple_mending", "涟漪回春卷"),
        B("nine_yang_scripture", "Nine Yang Scripture", "a red lacquered book edged in gold with nine suns on the cover", "rare", 400, "method.nine_yang_scripture", "九阳真经"),
        B("verdant_vine_bind_manual", "Verdant Vine Bind Manual", "a manual bound in living vine with a thorn clasp", "rare", 200, "tech.active.verdant_vine_bind", "青藤缚秘籍"),
        B("iron_wall_stance_manual", "Iron Wall Stance Manual", "a heavy stone-slab book bound with iron rings", "epic", 500, "tech.active.iron_wall_stance", "铁壁式秘籍"),
    ]

def blueprints():
    P = lambda key, name, desc, rarity, sell, unlocks, cn=None: item("blueprint", key, name, desc, rarity, sell, "blueprints", cn, {"unlocks": unlocks}, stack=1)
    return [
        P("rimeglass_spear", "Blueprint: Rimeglass Spear", "a frost-blue blueprint scroll showing a crystal spear", "epic", 500, "forge.rimeglass_spear", "霜玻璃枪图纸"),
        P("frost_heart_elixir", "Recipe: Frost Heart Elixir", "an icy recipe slip with a heart-shaped seal", "epic", 400, "alchemy.frost_heart_elixir", "冰心露方"),
        P("demonbane_fan", "Blueprint: Demonbane Fan", "a crimson blueprint scroll edged with black feathers", "legendary", 2000, "forge.demonbane_fan", "斩魔扇图纸"),
    ]

def quest_items():
    Q = lambda key, name, desc, cn=None: item("qitem", key, name, desc, "uncommon", 0, "quest", cn, {}, stack=1)
    return [
        Q("caravan_manifest", "Caravan Manifest", "a water-stained caravan manifest listing missing crates", "商队货单"),
        Q("elder_wen_token", "Elder Wen's Token", "a small jade token carved with a cloud, proof of passing the Elder's Trial", "温长老令牌"),
    ]

def eggs():
    E = lambda key, name, desc, rarity, sell, beast, minutes, cn=None: item("egg", key, name, desc, rarity, sell, "eggs", cn, {"hatches_into": beast, "hatch_minutes": minutes, "hatch_requirements": {}}, stack=5)
    return [
        E("cloud_fox", "Cloud Fox Egg", "a round white egg wrapped in soft cloud wisps, faintly warm", "uncommon", 100, "beast.yunyun", 30, "云狐蛋"),
        E("flame_fox", "Flame Fox Egg", "a red-orange egg with ember cracks glowing along its shell", "rare", 400, "beast.flame_fox", 120, "焰狐蛋"),
    ]

def beast_food():
    F = lambda key, name, desc, rarity, sell, xp, els, cn=None: item("bfood", key, name, desc, rarity, sell, "beast_food", cn, {"xp": xp, "bond": 1, "preferred_elements": [f"elem.{e}" for e in els]})
    return [
        F("spirit_fruit", "Verdant Spirit Fruit", "a plump pale-green fruit glowing with gentle qi", "common", 6, 40, ["wood", "water"], "翠灵果"),
        F("dried_fish", "Dried Spirit Fish", "a bundle of small silver dried fish tied with straw", "common", 5, 35, ["water", "fire"], "灵鱼干"),
    ]

def junk():
    return [item("junk", "cheap_junk_loot", "Cheap Junk Loot", "a jumble of bent nails, torn cloth and a cracked cup", "common", 3, "junk", "破烂"),
            item("junk", "broken_blade", "Broken Blade", "a snapped rusty saber blade", "common", 6, "junk", "断刃")]

def titles():
    return [
        {"id": "title.path_of_the_cultivator", **named("Path of the Cultivator", "Granted on completing Foundation Establishment.", "修行之路"), "bonuses": {"sp_energy": 10}},
        {"id": "title.outer_sect_champion", **named("Outer Sect Champion", "Victor of the Outer Sect Tournament.", "外门魁首"), "bonuses": {"atk": 20}},
    ]

# ---------------- Equipment (docs/GEAR.md) ----------------
MAIN_VALUE = {"weapon": 10, "armor": 60, "helmet": 30, "boots": 8, "necklace": 20, "ring": 6, "artifact": 25}

def base(key, name, cn, slot, desc, rng, look, wtype=None, atype=None, elem=None, sset=None, sig=None, droppable=True, tags=None,
         unique=False, specials=None, awaken=None, realm=None, lore=None, main=None):
    lo, hi = RARITY_ORDER.index(rng[0]), RARITY_ORDER.index(rng[1])
    rar = {r: {"art": {"icon": icon(f"equipment/{slot}/{key}_{r}", look, r, ["refs/mockups/inventory_icons.png", "refs/mockups/rarity_frames.png"])}} for r in RARITY_ORDER[lo:hi + 1]}
    d = {"id": f"gear.{key}", **named(name, desc, cn, lore), "slot": slot, "main_value": main or MAIN_VALUE[slot], "rarity_range": list(rng),
         "droppable": droppable, "drop_tags": tags or [], "unique": unique, "special_effects": specials or [], "requirements": {"realm": realm} if realm else {}, "rarities": rar}
    if wtype: d["weapon_type"] = wtype
    if atype: d["armor_type"] = atype
    if elem: d["element"] = f"elem.{elem}"
    if sset: d["set"] = sset
    if sig: d["signature_affix"] = sig
    if awaken: d["awakening"] = awaken
    return d

def gear_bases():
    eff = lambda kind, desc, **kw: {"kind": kind, "description": desc, **kw}
    awaken_frost = {"effect": eff("on_hit_apply", "Hits have a 20% chance to Freeze.", status="status.freeze", chance=0.2), "materials": [q("mat.awakening_crystal", 1), q("mat.frost_wyrm_heart_core", 1)], "cost_stones": 5000}
    awaken_fan = {"effect": eff("counter", "Counterattack when hit, 50% ATK.", value=50, chance=0.35), "materials": [q("mat.awakening_crystal", 2), q("mat.abyss_serpent_fang", 1)], "cost_stones": 8000}
    return [
        # weapons
        base("bamboo_sword", "Bamboo Sword", "竹剑", "weapon", "A practice sword cut from sect bamboo. Light, humble, dependable.", ("common", "rare"), "a slender straight sword carved from pale green bamboo with a cord-wrapped grip", "sword", elem="wood", tags=["plains", "starter"]),
        base("azure_iron_sword", "Azure Iron Sword", "苍铁剑", "weapon", "Forged from spirit iron, the standard blade of outer disciples.", ("uncommon", "legendary"), "a straight double-edged sword of blue-black iron with a cloud-shaped guard", "sword", elem="metal", sig="elem_dmg.metal", tags=["plains", "forest", "sect"]),
        base("rimeglass_spear", "Rimeglass Spear", "霜玻璃枪", "weapon", "A spear of translucent frost-glass that never melts.", ("epic", "mythic"), "a long spear with a translucent pale-blue crystal blade and a dark jade shaft wrapped in white silk", "spear", elem="water", sset="set.rimeglass", sig="elem_dmg.water", droppable=False, tags=["frost"], awaken=awaken_frost, realm="realm.foundation_establishment"),
        base("demonbane_fan", "Demonbane Fan", "斩魔扇", "weapon", "A war fan of crimson feathers and black steel ribs, made to cut what should not exist.", ("legendary", "immortal"), "an open war fan with crimson-black feathers, black steel ribs and golden talismans along the edge", "fan", elem="fire", sig="crit_dmg", droppable=False, awaken=awaken_fan, realm="realm.core_formation"),
        base("dragon_abyss_sword", "Dragon Abyss Sword", "龙渊剑", "weapon", "Drawn from the Abyss of the Nine Heavens. The sea itself bows to it.", ("divine", "divine"), "a magnificent greatsword with a blade of dark blue water-crystal, an azure dragon coiled around the hilt, prismatic light", "sword", elem="water", sig="elem_dmg.water", droppable=False, unique=True,
             specials=[eff("on_hit_apply", "Hits Freeze the target.", status="status.freeze", chance=0.35), eff("sp_restore", "Restore 10 SP per hit.", value=10)], realm="realm.nascent_soul"),
        # armor
        base("bamboo_robe", "Bamboo Robe", "竹布袍", "armor", "A plain disciple's robe of bamboo cloth.", ("common", "rare"), "a simple folded pale-green and white disciple robe with a cloth belt", atype="robe", tags=["plains", "starter"]),
        base("azure_cloud_robe", "Azure Cloud Robe", "青云袍", "armor", "The sect's standard robe, blue-trimmed and reinforced with spirit thread.", ("uncommon", "legendary"), "an elegant blue and white sect robe with cloud embroidery and a silver belt", atype="robe", tags=["plains", "forest", "sect"]),
        base("rimeglass_robe", "Rimeglass Robe", "霜玻璃袍", "armor", "A layered robe of frost-silk threaded with rime crystal.", ("epic", "legendary"), "an elegant layered robe of pale blue frost-silk with crystal-threaded hems and white fur collar", atype="mystic", elem="water", sset="set.rimeglass", sig="shield_str", droppable=False, tags=["frost"], realm="realm.foundation_establishment"),
        # helmets
        base("reed_hat", "Reed Hat", "苇笠", "helmet", "A wide woven reed hat worn by travelling disciples.", ("common", "uncommon"), "a wide conical hat woven from pale reeds with a blue ribbon", tags=["plains", "starter"]),
        base("cloud_veil_crown", "Cloud Veil Crown", "云纱冠", "helmet", "A silver circlet trailing a veil of cloud-silk.", ("rare", "legendary"), "a delicate silver circlet with a drifting veil of white cloud-silk and a jade centre stone", elem="water", sig="sp_power", tags=["forest"]),
        base("ninefold_hairpin_crown", "Ninefold Hairpin Crown", "九重钗冠", "helmet", "Nine hairpins of celestial gold arranged as a crown.", ("immortal", "immortal"), "an ornate crown made of nine golden phoenix hairpins radiating white-gold light", elem="fire", droppable=False, unique=True,
             specials=[eff("heal_on_turn", "Heal 3% max HP each turn.", value=3)], realm="realm.core_formation"),
        # boots
        base("cloudstep_boots", "Cloudstep Boots", "踏云靴", "boots", "Soft boots stitched with a cloud pattern; the feet feel lighter.", ("common", "rare"), "a pair of soft white and blue cloth boots embroidered with cloud swirls", tags=["plains", "starter"]),
        base("windstride_boots", "Windstride Boots", "风行靴", "boots", "Light leather boots favoured by forest scouts.", ("uncommon", "legendary"), "a pair of light green leather boots with wind-swirl stitching and jade clasps", elem="wood", sig="spd", tags=["forest", "sect"]),
        base("rimeglass_boots", "Rimeglass Boots", "霜玻璃靴", "boots", "Boots soled with frost-glass that leaves no footprint.", ("epic", "legendary"), "a pair of tall pale-blue boots with translucent crystal soles and silver clasps", elem="water", sset="set.rimeglass", droppable=False, tags=["frost"], realm="realm.foundation_establishment"),
        # necklaces
        base("jade_pendant", "Jade Pendant", "玉佩", "necklace", "A small jade disc on a red cord, carved with the sect's cloud.", ("common", "rare"), "a round pale-green jade pendant with a carved cloud on a red silk cord", tags=["plains", "starter"]),
        base("dragonbone_pendant", "Dragonbone Pendant", "龙骨坠", "necklace", "A pendant of ancient dragon bone that hums near spirit energy.", ("epic", "legendary"), "an ivory-white carved dragon-bone pendant with gold caps on a black cord", sig="sp_energy", droppable=False),
        # rings
        base("azure_iron_war_ring", "Azure Iron War Ring", "苍铁战戒", "ring", "A heavy iron ring stamped with the sect seal.", ("common", "rare"), "a thick blue-black iron ring stamped with a small cloud seal", elem="metal", tags=["plains", "starter"]),
        base("spirit_jade_ring", "Spirit Jade Ring", "灵玉戒", "ring", "A ring of green spirit jade that warms when Qi flows.", ("uncommon", "legendary"), "a smooth green jade ring with a thin gold band and a tiny cloud carving", elem="wood", tags=["forest", "sect"]),
        base("reed_witchs_whisper_ring", "Reed Witch's Whisper Ring", "苇巫低语戒", "ring", "The ring whispers when danger is near. Taken from the Whispering Reed Witch.", ("epic", "epic"), "a slim ring of green-black reed wood with a glowing teal gem and a tiny bell", elem="water", sig="eva", droppable=False, unique=True,
             specials=[eff("stat_mult", "+4% chance to dodge a telegraphed attack.", attribute="eva", value=4)]),
        base("starlight_spirit_ring", "Starlight Spirit Ring", "星辉灵戒", "ring", "A ring that holds a fallen star. Found only at the tower's heights.", ("mythic", "mythic"), "a dark silver ring set with a swirling star-filled gem trailing stardust", elem="metal", sig="crit", droppable=False, unique=True,
             specials=[eff("cooldown_reduction", "Technique cooldowns −1 every 4th turn.", value=1)]),
        # artifacts
        base("cloud_talisman", "Cloud Talisman", "云符", "artifact", "A paper talisman inked with the sect's cloud seal, carried for luck.", ("common", "rare"), "a folded yellow paper talisman with red cloud calligraphy and a blue tassel", tags=["plains", "starter"]),
        base("whispering_reed_flute", "Whispering Reed Flute", "苇笛", "artifact", "A reed flute whose lullaby dulls the senses of beasts.", ("rare", "epic"), "a slender dark-green reed flute with silver bands and a teal tassel", elem="water", sig="elem_dmg.water", tags=["forest"]),
    ]

def sets():
    return [{"id": "set.rimeglass", **named("Rimeglass Set", "Frost-glass armaments forged for the Frozen Lotus Valley.", "霜玻璃套装"),
             "pieces": ["gear.rimeglass_spear", "gear.rimeglass_robe", "gear.rimeglass_boots"],
             "bonuses": [{"pieces": 2, "stats": {"elem_dmg.water": 10}}, {"pieces": 3, "stats": {"def": 60}, "effect": {"kind": "on_hit_apply", "status": "status.freeze", "chance": 0.15, "description": "Hits have a 15% chance to Freeze."}}],
             "source_hint": "Forged at the Spirit Forge (blueprint from the Thousand-Node Bamboo Dragon); later drops in Frozen Lotus Valley."}]

def gear_rules():
    E = lambda e: [{"stat": f"elem_dmg.{x}", "value": e} for x in ["wood", "fire", "earth", "metal", "water"]]
    R = lambda e: [{"stat": f"elem_res.{x}", "value": e} for x in ["wood", "fire", "earth", "metal", "water"]]
    A = lambda **kw: [{"stat": k, "value": v} for k, v in kw.items()]
    rar = {"common": (1.0, 0.70, 0, 0), "uncommon": (1.5, 0.72, 1, 0), "rare": (2.25, 0.74, 2, 0), "epic": (3.4, 0.76, 3, 0),
           "legendary": (5.1, 0.78, 4, 0), "mythic": (7.6, 0.80, 4, 1), "immortal": (11.4, 0.82, 5, 1), "divine": (17.1, 0.84, 5, 2)}
    eff = lambda kind, desc, **kw: {"kind": kind, "description": desc, **kw}
    return {
        "ilvl_cap": 150,
        "scale": {"a": 0.12, "b": 0.0025},
        "floor_ilvl_bonus": 0.6,
        "rarity": {k: {"main_mult": m, "affix_mult": m, "floor": f, "affixes": a, "specials": sp} for k, (m, f, a, sp) in rar.items()},
        "main_stat_by_slot": {"weapon": "atk", "armor": "hp", "helmet": "def", "boots": "spd", "necklace": "sp_power", "ring": "atk", "artifact": "sp_power"},
        "affix_pools": {
            "weapon": A(crit=1.0, crit_dmg=3, acc=1.5, atk=3, armor_pen=1, life_steal=0.5, spd=0.5) + E(1.5),
            "armor": A(hp=20, **{"def": 3}, dmg_red=0.5, shield_str=1, status_res=1, eva=0.5) + R(1.0),
            "helmet": A(**{"def": 2}, hp=12, sp_power=6, acc=1, status_res=1, crit=0.5) + R(0.8),
            "boots": A(spd=1, eva=1, hp=10, **{"def": 1.5}, cdr=0.3, acc=1),
            "necklace": A(sp_power=8, sp_energy=4, heal_bonus=1, cdr=0.3, crit=0.5) + E(1.0),
            "ring": A(atk=2, crit=0.8, crit_dmg=2, life_steal=0.4, eva=0.5, hp=8, armor_pen=0.6),
            "artifact": A(sp_power=10, crit_dmg=2.5, cdr=0.4, heal_bonus=1, shield_str=1) + E(1.2),
        },
        "special_pool": [
            eff("on_hit_apply", "Hits have a 15% chance to Burn.", status="status.burning", chance=0.15),
            eff("on_hit_apply", "Hits have a 10% chance to Freeze.", status="status.freeze", chance=0.10),
            eff("on_crit_apply", "Critical hits cause Bleeding.", status="status.bleeding", chance=0.3),
            eff("on_hit_apply", "Hits have a 15% chance to Poison.", status="status.poison", chance=0.15),
            eff("counter", "25% chance to counterattack for 40% ATK.", value=40, chance=0.25),
            eff("sp_restore", "Restore 5 SP per turn.", value=5),
            eff("cooldown_reduction", "Technique cooldowns −1 on battle start.", value=1),
            eff("heal_on_turn", "Heal 2% max HP each turn.", value=2),
            eff("shield_on_battle_start", "Start battle with a shield of 8% max HP.", value=8),
            eff("reflect", "Reflect 10% of damage taken.", status="status.reflect", value=10),
        ],
        "cp_weights": {"main": 1.0, "special": 40, "affix": {"crit": 15, "crit_dmg": 5, "acc": 6, "eva": 8, "spd": 10, "cdr": 20, "life_steal": 12, "armor_pen": 10, "dmg_red": 12,
                                                              "heal_bonus": 6, "shield_str": 8, "status_res": 6, "hp": 0.4, "atk": 2, "def": 2, "sp_power": 0.8, "sp_energy": 1,
                                                              **{f"elem_dmg.{x}": 6 for x in ["wood", "fire", "earth", "metal", "water"]}, **{f"elem_res.{x}": 4 for x in ["wood", "fire", "earth", "metal", "water"]}}},
        "content_bands": {"region_per_order": 8, "region_span": 11, "tower_base": 3, "mega_min": 90},
    }

def enhancement():
    levels = []
    for lv in range(1, 16):
        mats = [q("mat.lesser_enhancement_stone", lv)] if lv <= 5 else [q("mat.spirit_enhancing_stone", lv - 4)]
        levels.append({"level": lv, "stat_mult": round(1 + lv * 0.08, 2), "stones_base": 50 * lv * lv, "materials": mats, "success": 1.0 if lv <= 9 else round(1 - (lv - 9) * 0.1, 2)})
    rm = {"common": 1, "uncommon": 1.5, "rare": 2.25, "epic": 3.4, "legendary": 5.1, "mythic": 7.6, "immortal": 11.4, "divine": 17.1}
    return {"levels": levels, "rarity_cost_mult": rm}

def refinement():
    ch = {"common": 0.8, "uncommon": 0.6, "rare": 0.4, "epic": 0.25, "legendary": 0.1}
    rm = {"common": 1, "uncommon": 1.5, "rare": 2.25, "epic": 3.4, "legendary": 5.1}
    return {"steps": [{"from": r, "chance": c, "stones": int(200 * rm[r]), "materials": [q("mat.refining_stone", 2 * (i + 1))]} for i, (r, c) in enumerate(ch.items())]}

def reforge():
    return {"stones_base": 112, "materials": [q("mat.reforging_sand", 2)], "lock_cost_per_stat": [q("mat.reforging_sand", 1)], "max_secondary_stats": 3}

def furnaces():
    return [
        {**named("Bronze Furnace", "The Alchemy Hall's starter furnace.", "青铜炉"), "grade": 1, "success_bonus": 0.05, "upgrade": {"materials": [q("mat.spirit_iron_ore", 20)], "stones": 2000}},
        {**named("Iron Furnace", "Holds heat evenly; fewer wasted herbs.", "铁炉"), "grade": 2, "success_bonus": 0.10, "yield_bonus": 0.05, "upgrade": {"materials": [q("mat.rime_crystal", 5), q("mat.glacier_iron_ore", 10)], "stones": 12000}},
        {**named("Jade Furnace", "A furnace of spirit jade used by inner-sect alchemists.", "玉炉"), "grade": 3, "success_bonus": 0.18, "yield_bonus": 0.10},
    ]

if __name__ == "__main__":
    write("content/items/materials.json", materials())
    write("content/items/consumables.json", consumables())
    write("content/items/gifts.json", gifts())
    write("content/items/books.json", books())
    write("content/items/blueprints.json", blueprints())
    write("content/items/quest_items.json", quest_items())
    write("content/items/eggs.json", eggs())
    write("content/items/beast_food.json", beast_food())
    write("content/items/junk.json", junk())
    write("content/items/titles.json", titles())
    for b in gear_bases():
        write(f"content/equipment/bases/{b['id'].split('.')[1]}.json", [b])
    write("content/equipment/sets.json", sets())
    write("content/equipment/rules.json", gear_rules())
    write("content/equipment/enhancement.json", enhancement())
    write("content/equipment/refinement.json", refinement())
    write("content/equipment/reforge.json", reforge())
    write("content/economy/furnaces.json", furnaces())
