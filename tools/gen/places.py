from common import *

def regions():
    R = lambda key, name, cn, order, rmin, rmax, unlock, entry, bossid, mats, desc, scene: {
        "id": f"region.{key}", **named(name, desc, cn), "order": order, "realm_range": {"min": f"realm.{rmin}", "max": f"realm.{rmax}"}, "unlock": unlock,
        "entry_node": f"node.{key}.{entry}", "boss": f"boss.{bossid}", "signature_materials": [f"mat.{m}" for m in mats],
        "art": {"card": art(f"assets/regions/{key}_card.png", f"{STYLE}. Region card illustration, landscape: {scene}. Painterly, wide composition, no text.", (1024, 640), False, ["refs/mockups/world_regions.png"]),
                "map": art(f"assets/regions/{key}_map.png", f"{STYLE}. Top-down illustrated adventure map of {scene}, winding paths between clearings suitable for node markers, soft light, no text, no icons.", (1080, 1620), False, ["refs/mockups/region_node_map.png"]),
                "battle_bg": bg(f"regions/{key}_battle_bg", f"battle backdrop inside {scene}, open ground in the lower third", refs=["refs/mockups/battle_screen.png"])}}
    return [
        R("mortal_plains", "Mortal Plains", "凡尘平原", 1, "qi_condensation", "qi_condensation", {}, "village_road", "plains_bandit_chief", ["spirit_grass", "wolf_fang", "boar_tusk"],
          "Rolling farmland and dirt roads at the foot of the sect mountains. Bandits, boars and the first steps of every disciple.", "golden wheat fields, a dirt road, a distant windmill and village under a soft sunset sky"),
        R("azure_bamboo_forest", "Azure Bamboo Forest", "苍竹林", 2, "qi_condensation", "qi_condensation", {"regions": ["region.mortal_plains"], "quests": ["quest.main.bandit_chief"]}, "forest_edge", "thousand_node_bamboo_dragon",
          ["jade_bamboo_segment", "frost_beast_core", "cloud_silk_bolt", "spirit_iron_ore"],
          "A vast forest of blue-green bamboo threaded with mist, streams and hidden shrines. The Thousand-Node Bamboo Dragon sleeps at its heart.", "a dense misty forest of towering blue-green bamboo with shafts of light, a moonlit pool and mossy stones"),
    ]

def nodes():
    out = []
    def N(region, key, name, kind, pos, cp, desc=None, **kw):
        d = {"id": f"node.{region}.{key}", **named(name, desc or name), "region": f"region.{region}", "kind": kind, "position": list(pos), "connections": [], "rec_cp": cp,
             "first_clear": {}, "replayable": kind not in ("chest", "story"), "energy_cost": 5}
        d.update(kw); out.append(d); return d
    def link(a, b):
        a["connections"].append(b["id"]); b["connections"].append(a["id"])
    P = "mortal_plains"
    road = N(P, "village_road", "Village Road", "battle", (0.2, 0.9), 110, "Bandits shake down travellers on the road to the sect.", waves=[["enemy.field_bandit"], ["enemy.field_bandit", "enemy.field_bandit"]], first_clear={"spirit_stones": 40})
    meadow = N(P, "herb_meadow", "Herb Meadow", "gather", (0.4, 0.8), 100, "Spirit grass and peach trees grow wild here.", gather={"items": [q("mat.spirit_grass", 3), q("mat.peach_blossom", 2)], "energy_cost": 4, "cooldown_min": 30})
    river = N(P, "river_crossing", "River Crossing", "gather", (0.6, 0.85), 100, "Smooth pebbles line the ford.", gather={"items": [q("mat.river_pebble", 4)], "energy_cost": 3, "cooldown_min": 20})
    boar = N(P, "boar_thicket", "Boar Thicket", "battle", (0.3, 0.6), 130, "Something large snorts in the brambles.", waves=[["enemy.wild_boar"], ["enemy.wild_boar", "enemy.wild_boar"]], first_clear={"spirit_stones": 60, "items": [q("mat.lesser_enhancement_stone", 2)]})
    crane = N(P, "crane_nest", "Crane Nest", "gather", (0.75, 0.65), 120, "White cranes roost on the cliff; feathers drift down.", gather={"items": [q("mat.crane_feather", 2)], "energy_cost": 4, "cooldown_min": 40})
    monkey = N(P, "monkey_grove", "Monkey Grove", "battle", (0.5, 0.5), 160, "Spirit monkeys pelt intruders with wind.", waves=[["enemy.spirit_monkey", "enemy.spirit_monkey"]], first_clear={"spirit_stones": 80})
    cache = N(P, "roadside_cache", "Roadside Cache", "chest", (0.65, 0.4), 150, "A bandit stash hidden under a milestone.", chest="loot.chest.plains_cache")
    wolf = N(P, "wolf_den", "Wolf Den", "elite", (0.25, 0.35), 220, "Three grey wolves and a lot of bones.", waves=[["enemy.grey_wolf", "enemy.grey_wolf", "enemy.grey_wolf"]], first_clear={"spirit_stones": 120, "items": [q("mat.wolf_fang", 2)]})
    shrine = N(P, "old_shrine", "Old Shrine", "hidden", (0.85, 0.3), 200, "A collapsed shrine to a fire god, warm to the touch.", event="event.blazing_shrine", hidden={"condition": "clear wolf_den and crane_nest", "reveal_chance": 0.35})
    camp = N(P, "bandit_camp", "Bandit Camp", "boss", (0.5, 0.15), 480, "Chief Hu's camp. Smoke, drums and stolen sect banners.", waves=[["enemy.field_bandit", "enemy.field_bandit"], ["boss.plains_bandit_chief"]], first_clear={"spirit_stones": 300, "sect_fame": 60, "items": [q("gift.ancient_spirit_coin", 1)]})
    for a, b in [(road, meadow), (meadow, river), (road, boar), (boar, monkey), (meadow, monkey), (river, crane), (monkey, cache), (crane, cache), (boar, wolf), (wolf, camp), (cache, camp), (crane, shrine)]: link(a, b)

    F = "azure_bamboo_forest"
    edge = N(F, "forest_edge", "Forest Edge", "battle", (0.5, 0.92), 280, "Where the plains end and the blue bamboo begins.", waves=[["enemy.azure_bamboo_wolf"], ["enemy.azure_bamboo_wolf", "enemy.azure_bamboo_wolf"]], first_clear={"spirit_stones": 100})
    herb = N(F, "herb_patch", "Herb Patch", "gather", (0.25, 0.8), 260, "Tender shoots and spirit fruit under the bamboo.", gather={"items": [q("mat.bamboo_spirit_shoot", 3), q("mat.jade_bamboo_segment", 2), q("bfood.spirit_fruit", 1)], "energy_cost": 5, "cooldown_min": 40})
    pool = N(F, "moon_pool_spring", "Moon-Pool Spring", "cultivation", (0.75, 0.8), 260, "Sit by the spring while the moon is up; Qi flows faster.", cultivation={"qi_mult": 1.5, "minutes": 30, "energy_cost": 6})
    viper = N(F, "viper_hollow", "Viper Hollow", "battle", (0.2, 0.62), 300, "Green vipers nest in the hollow logs.", waves=[["enemy.green_viper", "enemy.green_viper"]], first_clear={"spirit_stones": 120})
    vein = N(F, "ore_vein", "Spirit Iron Vein", "gather", (0.8, 0.62), 280, "A vein of spirit iron exposed by a fallen giant bamboo.", gather={"items": [q("mat.spirit_iron_ore", 2)], "energy_cost": 6, "cooldown_min": 45})
    silk = N(F, "silk_strung_grove", "Silk-Strung Grove", "battle", (0.5, 0.68), 340, "Node 10. Cloud silk hangs between every stalk.", waves=[["enemy.cloud_silk_spider"], ["enemy.cloud_silk_spider", "enemy.bamboo_spirit_sprite"]], first_clear={"spirit_stones": 150, "items": [q("mat.cloud_silk_bolt", 1)]})
    caravan = N(F, "caravan_rest", "Caravan Rest", "merchant", (0.65, 0.5), 300, "Tang Xiaoman's caravan camps here between runs.", shop="shop.tang_caravan")
    hollow = N(F, "hollow_shrine", "Hollow Shrine", "chest", (0.35, 0.5), 320, "A shrine hollowed into a bamboo giant. Someone left crates here.", chest="loot.chest.forest_hollow")
    lynx = N(F, "frost_lynx_den", "Frost Lynx Den", "elite", (0.15, 0.4), 480, "Rime crusts the bamboo. The lynx is watching.", waves=[["enemy.rime_bamboo_lynx"]], first_clear={"spirit_stones": 200, "items": [q("mat.frost_beast_core", 1)]})
    whisper = N(F, "whispering_bend", "Whispering Bend", "hidden", (0.5, 0.42), 400, "You hear singing in the reeds.", event="event.hidden_whisper", hidden={"condition": "clear silk_strung_grove", "reveal_chance": 0.4})
    marsh = N(F, "reed_marsh", "Reed Marsh", "elite", (0.8, 0.35), 560, "The Whispering Reed Witch's marsh.", waves=[["enemy.whispering_reed_witch"]], first_clear={"spirit_stones": 260, "sect_fame": 10})
    heart = N(F, "heart_of_the_grove", "Heart of the Grove", "hidden", (0.3, 0.25), 520, "A clearing of silver bamboo and an old hermit's hut.", event="event.frost_hermit_trial", hidden={"condition": "hidden node, 2 of 3 found", "reveal_chance": 0.25})
    rift = N(F, "origin_rift", "Origin Rift", "secret_realm", (0.65, 0.2), 1800, "A seam of light between two ancient stalks. The Origin Secret Realm lies beyond.", secret_realm="dungeon.origin_secret_realm")
    sov = N(F, "ancient_sovereign", "Ancient Bamboo Sovereign", "boss", (0.5, 0.08), 1100, "The dragon's grove. The bamboo here is older than the sect.", waves=[["enemy.bamboo_spirit_sprite", "enemy.bamboo_spirit_sprite"], ["boss.thousand_node_bamboo_dragon"]], first_clear={"spirit_stones": 800, "sect_fame": 200, "items": [q("mat.bamboo_dragon_scale", 2)]})
    for a, b in [(edge, herb), (edge, pool), (edge, silk), (herb, viper), (pool, vein), (silk, caravan), (silk, hollow), (viper, lynx), (hollow, whisper), (caravan, marsh), (lynx, heart), (whisper, heart), (marsh, rift), (heart, sov), (rift, sov), (whisper, sov)]: link(a, b)
    return out

def dungeons():
    D = lambda key, name, cn, kind, desc, cp, entry, rewards, scene, **kw: {
        "id": f"dungeon.{key}", **named(name, desc, cn), "kind": kind, "entry": entry, "rec_cp": cp, "modifiers": [], "rewards": rewards, "checkpoints": kind in ("tower", "mega"), "persistent_hp": True, **kw,
        **({"tiers": make_tiers(entry["realm"]["id"], entry["realm"]["stage"], cp, rewards["clear"], rewards.get("first_clear", {}))} if kind == "resource" else {}),
        "art": {"card": art(f"assets/dungeons/{key}_card.png", f"{STYLE}. Dungeon card illustration: {scene}. Wide painterly composition, no text.", (1024, 640), False, ["refs/mockups/dungeon_hub.png"]),
                "battle_bg": bg(f"dungeons/{key}_battle_bg", f"battle backdrop inside {scene}", refs=["refs/mockups/battle_screen.png"]),
                **({"map": art(f"assets/dungeons/{key}_map.png", f"{STYLE}. Top-down illustrated branching map of {scene}, floating platforms connected by light paths, no text, no icons.", (1080, 1620), False, ["refs/mockups/secret_realm_map.png"])} if kind == "secret_realm" else {})}}
    W = lambda *ens: {"enemies": list(ens)}
    return [
        D("old_granary_cellars", "Old Granary Cellars", "旧粮仓地窖", "resource", "Bandits hoard spirit stones under the plains granary. Clear it daily.", 300,
          {"realm": {"id": "realm.qi_condensation", "stage": 2}, "energy_cost": 10, "daily_limit": 3},
          {"per_wave": "loot.dungeon.granary_wave", "clear": "loot.dungeon.granary_clear", "first_clear": {"spirit_stones": 300}},
          "a torch-lit stone cellar stacked with grain sacks and stolen chests",
          waves=[W("enemy.field_bandit", "enemy.field_bandit"), W("enemy.field_bandit", "enemy.grey_wolf"), W("enemy.field_bandit", "enemy.field_bandit", "enemy.field_bandit")]),
        D("spirit_stone_mine", "Spirit Stone Mine", "灵石矿", "resource", "An abandoned mine where enhancement and refining materials can still be dug out—if the boars let you.", 450,
          {"realm": {"id": "realm.qi_condensation", "stage": 4}, "energy_cost": 12, "daily_limit": 2},
          {"per_wave": "loot.dungeon.mine_wave", "clear": "loot.dungeon.mine_clear", "first_clear": {"spirit_stones": 500, "items": [q("mat.refining_stone", 2)]}},
          "a glowing crystal mine with blue spirit-stone veins and mine-cart rails",
          waves=[W("enemy.wild_boar", "enemy.wild_boar"), W("enemy.bamboo_spirit_sprite", "enemy.bamboo_spirit_sprite"), W("enemy.wild_boar", "enemy.bamboo_spirit_sprite", "enemy.cloud_silk_spider")]),
        D("green_labyrinth", "The Green Labyrinth", "青翠迷宫", "challenge", "Three waves of forest guardians. Rec. CP 480. First clear rewards the Dragonbone Pendant.", 480,
          {"realm": {"id": "realm.qi_condensation", "stage": 6}, "energy_cost": 15},
          {"per_wave": "loot.dungeon.labyrinth_wave", "clear": "loot.dungeon.labyrinth_clear", "first_clear": {"spirit_stones": 1000, "sect_fame": 150, "items": [q("book.nine_yang_scripture", 1)], "gear": [{"base": "gear.dragonbone_pendant", "rarity": "epic", "ilvl": 18}]}},
          "a maze of towering green bamboo walls with glowing moss floors and shafts of light",
          waves=[W("enemy.azure_bamboo_wolf", "enemy.azure_bamboo_wolf", "enemy.green_viper"), W("enemy.cloud_silk_spider", "enemy.rime_bamboo_lynx"), W("enemy.whispering_reed_witch", "enemy.bamboo_spirit_sprite")]),
        D("heaven_piercing_tower", "Heaven-Piercing Tower", "通天塔", "tower", "Endless floors of ever-stronger foes. Every tenth floor a Warden waits. Milestones grant rare materials.", 400,
          {"realm": {"id": "realm.qi_condensation", "stage": 5}, "energy_cost": 0},
          {"per_wave": "loot.dungeon.tower_floor", "clear": "loot.dungeon.tower_floor", "first_clear": {}},
          "a colossal white tower spiralling into the clouds, floors of jade and gold",
          tower={"floors": 100, "enemy_pool": ["enemy.field_bandit", "enemy.grey_wolf", "enemy.azure_bamboo_wolf", "enemy.green_viper", "enemy.cloud_silk_spider", "enemy.rime_bamboo_lynx", "enemy.whispering_reed_witch", "enemy.thunder_wisp", "enemy.abyss_spawn"],
                 "boss_pool": ["boss.tower_warden", "boss.plains_bandit_chief", "boss.thousand_node_bamboo_dragon"], "boss_every": 10, "cp_growth_per_floor": 1.091,
                 "milestones": [{"floor": 5, "rewards": {"spirit_stones": 500, "items": [q("mat.spirit_enhancing_stone", 2)]}},
                                {"floor": 10, "rewards": {"spirit_stones": 1200, "items": [q("mat.sword_rain_fragment", 2)], "gear": [{"base": "gear.whispering_reed_flute", "rarity": "rare", "ilvl": 13}]}},
                                {"floor": 20, "rewards": {"spirit_stones": 3000, "items": [q("book.iron_wall_stance_manual", 1), q("mat.dao_insight_crystal", 1)]}},
                                {"floor": 30, "rewards": {"spirit_stones": 6000, "items": [q("mat.awakening_crystal", 1), q("mat.dao_insight_crystal", 2)]}},
                                {"floor": 50, "rewards": {"spirit_stones": 15000, "items": [q("mat.dao_insight_crystal", 4)], "gear": [{"base": "gear.starlight_spirit_ring", "rarity": "mythic", "ilvl": 53}]}},
                                {"floor": 75, "rewards": {"spirit_stones": 60000, "items": [q("mat.dao_insight_crystal", 6), q("mat.awakening_crystal", 2), q("mat.spirit_enhancing_stone", 20)]}},
                                {"floor": 100, "rewards": {"spirit_stones": 200000, "items": [q("mat.dao_insight_crystal", 12), q("mat.awakening_crystal", 4), q("mat.spirit_enhancing_stone", 40)], "titles": ["title.tower_conqueror"]}}]}),
        D("origin_secret_realm", "Origin Secret Realm", "本源秘境", "secret_realm", "A branching realm sealed in the forest's Origin Rift. Rare treasures, a hidden merchant, and the Guardian of the Origin.", 1800,
          {"realm": {"id": "realm.foundation_establishment", "stage": 1}, "quests": ["quest.main.bamboo_sovereign"], "energy_cost": 20},
          {"clear": "loot.dungeon.origin_clear", "first_clear": {"spirit_stones": 2500, "sect_fame": 300, "items": [q("blueprint.frost_heart_elixir", 1)]}},
          "a surreal realm of floating stone platforms, mirror pools and an altar of ember under a violet sky",
          realm_nodes=[
              {"key": "gate", "name": "Realm Gate", "kind": "battle", "position": [0.5, 0.92], "connections": ["sword_pillar", "mirror_pool"], "waves": [["enemy.bamboo_spirit_sprite", "enemy.bamboo_spirit_sprite"]]},
              {"key": "sword_pillar", "name": "Sword Pillar", "kind": "elite", "position": [0.25, 0.7], "connections": ["gate", "vault", "merchant"], "waves": [["enemy.rime_bamboo_lynx", "enemy.green_viper"]]},
              {"key": "mirror_pool", "name": "Mirror Pool", "kind": "cultivation", "position": [0.75, 0.7], "connections": ["gate", "merchant", "weeping_falls"]},
              {"key": "vault", "name": "Origin Vault", "kind": "chest", "position": [0.2, 0.45], "connections": ["sword_pillar", "altar"], "chest": "loot.chest.origin_vault"},
              {"key": "merchant", "name": "Hidden Merchant", "kind": "merchant", "position": [0.5, 0.5], "connections": ["sword_pillar", "mirror_pool", "altar"], "shop": "shop.origin_realm_merchant"},
              {"key": "weeping_falls", "name": "Weeping Falls", "kind": "hidden", "position": [0.8, 0.4], "connections": ["mirror_pool", "altar"], "event": "event.hidden_whisper", "hidden": {"condition": "wood root or wood technique equipped"}},
              {"key": "altar", "name": "Altar of Ember", "kind": "boss", "position": [0.5, 0.15], "connections": ["vault", "merchant", "weeping_falls", "exit"], "waves": [["boss.guardian_of_the_origin"]]},
              {"key": "exit", "name": "Exit", "kind": "exit", "position": [0.5, 0.04], "connections": ["altar"]}]),
        D("abyss_of_the_nine_heavens", "Abyss of the Nine Heavens", "九天之渊", "mega", "A mega dungeon beneath the sea of clouds. Bring Dao Companions. The first of the five Divine-bearing mega dungeons.", 158000,
          {"realm": {"id": "realm.spirit_severing", "stage": 5}, "rank": "rank.core_disciple", "regions": ["region.nine_heavens"], "energy_cost": 40, "party": {"companions_allowed": True, "max_companions": 2}},
          {"per_wave": "loot.dungeon.abyss_wave", "clear": "loot.dungeon.abyss_clear", "first_clear": {"spirit_stones": 50000, "sect_fame": 2000, "items": [q("blueprint.demonbane_fan", 1)]}},
          "a vast abyss of black water and violet lightning beneath floating islands, a nine-headed serpent silhouette",
          waves=[W("enemy.cloud_jellyfish", "enemy.cloud_jellyfish", "enemy.cloud_jellyfish"), W("enemy.heaven_eagle", "enemy.abyss_cultist", "enemy.heaven_eagle"), W("boss.star_palace_regent"), W("enemy.abyss_cultist", "enemy.abyss_cultist", "enemy.fallen_immortal", "enemy.fallen_immortal"), W("boss.nine_headed_abyss_serpent")]),
    ]

def tribulations():
    return [{"id": "tribulation.core_formation", **named("Core Formation Tribulation", "Three waves of heavenly lightning test those who would form a Golden Core. Earth resists it; Water conducts it.", "结丹天劫"),
             "realm": "realm.core_formation", "spirit": "boss.tribulation_thunder_spirit",
             "waves": [{"bolts": 3, "dmg_mult": 1.0, "element": "elem.metal"}, {"bolts": 4, "dmg_mult": 1.4, "element": "elem.metal"}, {"bolts": 5, "dmg_mult": 2.0, "element": "elem.metal"}],
             "modifiers": [], "failure": {"qi_loss_pct": 0.3, "retry_cooldown_min": 120}, "rewards": "loot.tribulation.core_formation",
             "art": {"battle_bg": bg("tribulations/core_formation_bg", "a mountain peak under a vortex of purple storm clouds with lightning tearing down, golden sunset rim", refs=["refs/mockups/tribulation.png"])}}]

def sect_locations():
    L = lambda key, name, cn, desc, feats, pos, scene, unlock=None, npcs=None, shop=None: {
        "id": f"sectloc.{key}", **named(name, desc, cn), "unlock": unlock or {}, "features": feats, "npcs": npcs or [], **({"shop": shop} if shop else {}), "map_position": list(pos),
        "art": {"background": bg(f"sect/{key}", scene, refs=["refs/mockups/sect_locations.png"])}}
    return [
        # map positions: one pin per height band (~0.07 of the map apart), so no two labels can overlap on any phone width or text size
        L("sword_grounds", "Sword Grounds", "剑场", "Open training terraces where Bai Lingshuang drills the Frost Sword. Friendly duels and technique practice.", ["duels"], (0.26, 0.325), "sunlit stone training terraces with sword racks and cherry trees above clouds", npcs=["npc.bai_lingshuang"]),
        L("mission_hall", "Mission Hall", "任务堂", "Request board of masters and seniors. Deliver materials, earn Sect Fame.", ["missions"], (0.56, 0.255), "a grand hall with a tall request board covered in paper slips, red lanterns"),
        L("scripture_pavilion", "Scripture Pavilion", "藏经阁", "Five floors of manuals guarded by Elder Feng. Buy techniques and methods with Spirit Stones and Fame.", ["pavilion"], (0.68, 0.395), "a towering pagoda library with endless shelves of scrolls and floating lanterns", npcs=["npc.elder_feng"], shop="shop.scripture_pavilion"),
        L("meditation_waterfall", "Meditation Waterfall", "静心瀑", "Sit beneath the falls for a temporary cultivation boost.", ["meditation"], (0.42, 0.605), "a tall misty waterfall with a flat meditation stone and a rainbow in the spray"),
        L("merchant_pavilion", "Merchant Pavilion", "百宝阁", "Tang Xiaoman's shop. Pills, materials, gear and gossip.", ["merchant"], (0.7, 0.675), "a cosy merchant shop crammed with jars, scrolls, pill bottles and hanging lanterns", npcs=["npc.tang_xiaoman"], shop="shop.merchant_pavilion"),
        L("alchemy_hall", "Alchemy Hall", "丹药房", "Refine pills from gathered herbs in the sect furnaces.", ["alchemy"], (0.66, 0.815), "an alchemy hall with a huge bronze cauldron glowing green, shelves of herbs and pills"),
        L("spirit_forge", "Spirit Forge", "炼器坊", "Master Gu's forge. Enhance, refine, reforge, awaken and craft equipment.", ["forge"], (0.22, 0.465), "a mountain forge with a glowing anvil, hanging weapons and molten light", npcs=["npc.master_gu"]),
        L("spirit_beast_garden", "Spirit Beast Garden", "灵兽园", "Qin's garden. Hatch eggs, feed, train and evolve spirit beasts.", ["beasts"], (0.3, 0.745), "a lush garden with glowing flowers, small ponds and nests under a giant willow", npcs=["npc.qin"], shop="shop.beast_garden"),
        L("your_quarters", "Your Quarters", "居所", "Rest, store items and receive visitors.", ["quarters", "storage", "rest"], (0.24, 0.885), "a modest wooden disciple's room with a window onto clouds, a bed, a desk and a tea set", npcs=["npc.elder_wen"]),
        L("proving_arena", "Proving Arena", "演武台", "Sect tournaments are held on this floating stage.", ["tournament"], (0.72, 0.535), "a circular stone arena floating among clouds with banners and spectator stands"),
        L("inner_sect_peak", "Inner Sect Peak", "内门峰", "The inner sect's cloud peak. Requires Inner Disciple rank.", ["meditation", "rest"], (0.56, 0.08), "a high peak with elegant pavilions above a sea of clouds at dawn", unlock={"rank": "rank.inner_disciple"}),
        L("frozen_lotus_valley", "Frozen Lotus Valley", "冰莲谷", "A frozen valley where ice lotuses bloom; advanced cultivation grounds. Requires 800 Sect Fame.", ["meditation"], (0.72, 0.17), "a snowy valley with a frozen lake and glowing blue ice lotus flowers", unlock={"sect_fame": 800}),
    ]

def ranks():
    R = lambda key, name, cn, order, fame, desc, promo=None, benefits=None: {"id": f"rank.{key}", **named(name, desc, cn), "order": order, "fame_required": fame, "promotion": promo or {}, "benefits": benefits or {}}
    return [
        R("outer_disciple", "Outer Disciple", "外门弟子", 1, 0, "The first rank of the Azure Cloud Sect."),
        R("inner_disciple", "Inner Disciple", "内门弟子", 2, 1500, "Granted to tournament champions. Opens the Inner Sect Peak and higher-tier stock.", {"quests": ["quest.main.bamboo_sovereign"], "trial": "tournament.outer_sect"}, {"unlocks": ["sectloc.inner_sect_peak"], "qi_mult": 1.1, "shop_tier": 2, "rewards": {"spirit_stones": 3000}}),
        R("core_disciple", "Core Disciple", "核心弟子", 3, 4000, "Win the Inner Sect Tournament to become a Core Disciple.", {"quests": ["quest.dungeon.green_labyrinth_trial"], "trial": "tournament.inner_sect"}, {"qi_mult": 1.2, "shop_tier": 3, "rewards": {"spirit_stones": 10000}}),
        R("direct_disciple", "Direct Disciple", "亲传弟子", 4, 9000, "Win the Core Sect Tournament and an elder takes you as a direct student.", {"trial": "tournament.core_sect"}, {"qi_mult": 1.3, "shop_tier": 4}),
        R("elder", "Elder", "长老", 5, 20000, "A seat on the elders' council.", {}, {"qi_mult": 1.45, "shop_tier": 5}),
        R("grand_elder", "Grand Elder", "太上长老", 6, 50000, "Second only to the Sect Master.", {}, {"qi_mult": 1.6, "shop_tier": 6}),
    ]

def events():
    E = lambda key, name, cn, desc, text, choices, scene: {"id": f"event.{key}", **named(name, desc, cn), "text": text, "choices": choices,
        "art": {"illustration": art(f"assets/events/{key}.png", f"{STYLE}. Event illustration: {scene}. Painterly, atmospheric, no text.", (1024, 768), False, ["refs/mockups/node_interactions.png"])}}
    return [
        E("blazing_shrine", "The Blazing Shrine", "焚祠", "A collapsed fire shrine still warm with old qi.", "Embers glow in the cracked altar. A warmth presses against your meridians, asking a question.",
          [{"text": "Press your palm to the altar.", "outcomes": [{"chance": 0.1, "text": "Fire and Earth answer. Your root transforms!", "root_transform": "root.fire_earth_dual"}, {"chance": 0.5, "text": "Warmth floods your meridians.", "rewards": {"spirit_stones": 150}}, {"chance": 0.4, "text": "The heat burns you.", "status": "status.burning"}]},
           {"text": "Search the rubble.", "outcomes": [{"chance": 0.7, "text": "You find an old offering box.", "rewards": {"items": [q("gift.ancient_spirit_coin", 1)]}}, {"chance": 0.3, "text": "A boar was sleeping here.", "battle": ["enemy.wild_boar"]}]}],
          "a half-collapsed red shrine in golden grass, embers glowing in a cracked altar at sunset"),
        E("frost_hermit_trial", "The Frost Hermit's Trial", "霜隐士之试", "An old hermit of ice offers a test of the blade.", "The hermit does not look up. 'Cut the falling leaf without touching the frost on it.'",
          [{"text": "Attempt the cut.", "outcomes": [{"chance": 0.15, "text": "The leaf parts; the frost holds. Metal and Water awaken in you.", "root_transform": "root.metal_water_dual"}, {"chance": 0.55, "text": "'Close.' He gives you a bottle.", "rewards": {"items": [q("gift.frost_plum_wine", 1)]}}, {"chance": 0.3, "text": "The frost shatters. He sighs and feeds you.", "rewards": {"items": [q("cons.spirit_tea", 2)]}}]},
           {"text": "Bow and leave.", "outcomes": [{"chance": 1.0, "text": "He nods once. The clearing is quiet.", "rewards": {"sect_fame": 5}}]}],
          "a clearing of silver bamboo with a small snow-dusted hut and an old man in white meditating on a stone"),
        E("hidden_whisper", "Whisper in the Reeds", "苇间低语", "Someone is singing in the reeds. Something is listening.", "A low song drifts through the reeds. The water is very still.",
          [{"text": "Follow the song.", "outcomes": [{"chance": 0.6, "text": "The Reed Witch!", "battle": ["enemy.whispering_reed_witch"]}, {"chance": 0.4, "text": "You find a drowned traveller's pack.", "rewards": {"items": [q("mat.cloud_silk_bolt", 1), q("gift.spirit_stone_pouch", 1)]}}]},
           {"text": "Plug your ears and back away.", "outcomes": [{"chance": 1.0, "text": "The song fades. You keep your wits.", "rewards": {"spirit_stones": 30}}]}],
          "a misty reed marsh at night with teal lights under the water and a shadowy figure among the reeds"),
    ]

if __name__ == "__main__":
    write("content/adventure/regions.json", regions())
    ns = nodes()
    for r in ["mortal_plains", "azure_bamboo_forest"]:
        write(f"content/adventure/nodes/{r}.json", [n for n in ns if n["region"] == f"region.{r}"])
    write("content/adventure/events.json", events())
    write("content/dungeons/dungeons.json", dungeons())
    write("content/dungeons/tribulations.json", tribulations())
    write("content/sect/locations.json", sect_locations())
    write("content/sect/ranks.json", ranks())
