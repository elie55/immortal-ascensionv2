from common import *
import regions as RG

# ---------------- Shops ----------------
def shops():
    S = lambda id, price, cur="spirit_stones", qty=None, unlock=None: {"id": id, "price": price, "currency": cur, **({"qty": qty} if qty else {}), "unlock": unlock or {}}
    G = lambda base, rarity, ilvl, price, qty=1, unlock=None: {"gear": {"base": f"gear.{base}", "rarity": rarity, "ilvl": ilvl}, "price": price, "currency": "spirit_stones", "qty": qty, "unlock": unlock or {}}
    return [
        {"id": "shop.merchant_pavilion", **named("Merchant Pavilion", "Tang Xiaoman's stock. Better goods with higher Sect Fame.", "百宝阁"), "owner": "npc.tang_xiaoman", "restock": "daily",
         "affinity_discount": {"npc": "npc.tang_xiaoman", "pct_per_level": 3}, "fame_discount_pct_per_500": 5, "buys_items": True,
         "stock": [S("cons.qi_gathering_pill", 38), S("cons.blossom_healing_pill", 55), S("cons.spirit_condensing_pill", 114, unlock={"sect_fame": 500}), S("cons.spirit_tea", 25),
                   S("mat.spirit_grass", 5, qty=20), S("mat.spirit_iron_ore", 57, qty=10), S("mat.lesser_enhancement_stone", 30), S("mat.spirit_enhancing_stone", 400, qty=10, unlock={"sect_fame": 800}), S("mat.refining_stone", 200, qty=5, unlock={"sect_fame": 500}), S("mat.reforging_sand", 150, qty=10, unlock={"sect_fame": 500}),
                   G("bamboo_sword", "common", 3, 60), G("bamboo_robe", "common", 3, 80), G("reed_hat", "common", 3, 50), G("cloudstep_boots", "common", 3, 143), G("jade_pendant", "common", 3, 90), G("azure_iron_war_ring", "common", 3, 70), G("cloud_talisman", "common", 3, 65),
                   G("azure_iron_sword", "uncommon", 6, 171, unlock={"sect_fame": 300}), G("azure_cloud_robe", "uncommon", 6, 190, unlock={"sect_fame": 300}),
                   S("gift.candied_hawthorn", 15), S("gift.osmanthus_cake", 20), S("gift.sword_polish_cloth", 40), S("gift.fine_ledger_book", 120, unlock={"sect_fame": 500})]},
        {"id": "shop.scripture_pavilion", **named("Scripture Pavilion", "Techniques and methods, floor by floor. Higher floors need Fame and rank.", "藏经阁"), "owner": "npc.elder_feng", "restock": "none", "buys_items": False,
         "stock": [S("tech.active.flame_palm", 260), S("tech.active.earth_guardian", 380), S("tech.passive.sword_mastery", 300), S("tech.passive.iron_body", 300), S("tech.passive.spiritual_regeneration", 300),
                   S("tech.active.frozen_lotus", 700, unlock={"sect_fame": 1000}), S("tech.active.thunder_palm", 900, unlock={"sect_fame": 1000}),
                   S("tech.active.swallow_return_sword", 1200, unlock={"sect_fame": 2000, "rank": "rank.inner_disciple"}), S("tech.passive.critical_insight", 1500, unlock={"sect_fame": 2000}), S("tech.passive.elemental_harmony", 1500, unlock={"sect_fame": 2000}),
                   S("method.heavenly_dragon_art", 3000, unlock={"rank": "rank.inner_disciple"}), S("method.primordial_chaos_scripture", 8000, unlock={"rank": "rank.core_disciple"})] + RG.pavilion_stock()},
        {"id": "shop.tang_caravan", **named("Tang's Caravan", "A smaller stock on the road, with a few forest specialities.", "唐家商队"), "owner": "npc.tang_xiaoman", "restock": "per_visit", "buys_items": True,
         "stock": [S("cons.qi_gathering_pill", 42), S("cons.blossom_healing_pill", 60), S("mat.lesser_enhancement_stone", 32), S("bfood.spirit_fruit", 8), S("bfood.dried_fish", 7), S("gift.candied_hawthorn", 15)]},
        {"id": "shop.beast_garden", **named("Beast Garden Supplies", "Food and trinkets for spirit beasts.", "灵兽园"), "owner": "npc.qin", "restock": "daily", "buys_items": False,
         "stock": [S("bfood.spirit_fruit", 6), S("bfood.dried_fish", 5), S("bfood.spirit_meat", 10), S("gift.beast_bell", 35)]},
        {"id": "shop.origin_realm_merchant", **named("Hidden Merchant of the Origin", "A masked trader who appears only inside the Origin Secret Realm.", "本源隐商"), "restock": "per_visit", "buys_items": False,
         "stock": [S("gift.frost_plum_wine", 300, qty=1), S("mat.glacier_iron_ore", 120, qty=6), S("mat.rime_crystal", 150, qty=4), S("mat.spirit_enhancing_stone", 180, qty=3)]},
    ]

# ---------------- Loot ----------------
def loot():
    def L(id, entries, stones=(0, 0), guaranteed=None, fame=0, xp=0, mode="independent", rolls=1, ilvl=None, gear=None):
        ents = [{"id": i, "chance": c, "qty": list(qt)} for i, c, qt in entries] + (gear or [])
        d = {"id": id, "mode": mode, "rolls": rolls, "entries": ents, "guaranteed": guaranteed or [], "spirit_stones": list(stones), "sect_fame": fame, "mastery_xp": xp}
        if ilvl: d["ilvl"] = list(ilvl)
        return d
    E = lambda i, c, a=1, b=1: (i, c, (a, b))
    GB = lambda base, chance, **w: {"gear": {"base": f"gear.{base}"}, "rarity_weights": w, "chance": chance}
    GP = lambda chance, tags=None, slot=None, **w: {"gear": {"pool": {**({"tags": tags} if tags else {}), **({"slot": slot} if slot else {})}}, "rarity_weights": w, "chance": chance}
    enemies = [
        L("loot.enemy.field_bandit", [E("junk.cheap_junk_loot", 0.4), E("gift.counterfeit_coin", 0.15), E("mat.lesser_enhancement_stone", 0.1), E("junk.broken_blade", 0.2)], (8, 16), ilvl=(1, 6), gear=[GP(0.04, ["plains"], common=85, uncommon=15)]),
        L("loot.enemy.wild_boar", [E("mat.boar_tusk", 0.6, 1, 2), E("mat.spirit_grass", 0.2)], (6, 12)),
        L("loot.enemy.spirit_monkey", [E("mat.spirit_monkey_fur", 0.6, 1, 2), E("mat.spirit_grass", 0.3), E("mat.peach_blossom", 0.2)], (8, 14)),
        L("loot.enemy.grey_wolf", [E("mat.wolf_fang", 0.6, 1, 2), E("mat.lesser_enhancement_stone", 0.12)], (10, 18), ilvl=(3, 9), gear=[GP(0.05, ["plains"], common=70, uncommon=28, rare=2)]),
        L("loot.enemy.azure_bamboo_wolf", [E("mat.wolf_fang", 0.5), E("mat.azure_wolf_pelt", 0.35), E("mat.lesser_enhancement_stone", 0.15)], (14, 24), ilvl=(9, 15), gear=[GP(0.05, ["forest"], uncommon=75, rare=23, epic=2)]),
        L("loot.enemy.bamboo_spirit_sprite", [E("mat.jade_bamboo_segment", 0.5, 1, 2), E("mat.bamboo_spirit_shoot", 0.3)], (12, 22)),
        L("loot.enemy.green_viper", [E("mat.green_viper_venom", 0.5), E("mat.spirit_grass", 0.2)], (14, 24)),
        L("loot.enemy.cloud_silk_spider", [E("mat.cloud_silk_bolt", 0.3), E("mat.lesser_enhancement_stone", 0.2)], (16, 28)),
        L("loot.enemy.rime_bamboo_lynx", [E("mat.frost_beast_core", 0.55), E("mat.glacier_iron_ore", 0.3), E("mat.rime_crystal", 0.2), E("mat.spirit_enhancing_stone", 0.1)], (40, 70), ilvl=(13, 19), gear=[GP(0.12, ["forest"], uncommon=40, rare=50, epic=10)]),
        L("loot.enemy.whispering_reed_witch", [E("book.crescent_wind_blade_manual", 0.05), E("mat.cloud_silk_bolt", 0.3), E("mat.frost_beast_core", 0.3)], (60, 100), fame=10, ilvl=(15, 20),
          gear=[GB("reed_witchs_whisper_ring", 0.08, epic=1), GB("whispering_reed_flute", 0.12, rare=80, epic=20), GP(0.1, ["forest"], rare=70, epic=30)]),
        L("loot.enemy.abyss_spawn", [E("mat.spirit_enhancing_stone", 0.4), E("mat.refining_stone", 0.2), E("mat.reforging_sand", 0.3)], (120, 200)),
        L("loot.enemy.thunder_wisp", [E("mat.spirit_enhancing_stone", 0.3), E("mat.sword_rain_fragment", 0.1)], (100, 160)),
    ]
    bosses = [
        L("loot.boss.plains_bandit_chief", [E("gift.ancient_spirit_coin", 0.3), E("gift.spirit_stone_pouch", 0.4), E("mat.lesser_enhancement_stone", 0.8, 2, 4)], (120, 200), fame=20, xp=40, ilvl=(8, 12),
          gear=[GP(0.5, ["plains"], uncommon=70, rare=30), GB("azure_iron_sword", 0.15, uncommon=60, rare=40)]),
        L("loot.boss.thousand_node_bamboo_dragon", [E("mat.bamboo_dragon_scale", 0.6), E("blueprint.rimeglass_spear", 0.2), E("book.verdant_vine_bind_manual", 0.15), E("mat.spirit_enhancing_stone", 0.8, 2, 3), E("mat.dao_insight_crystal", 0.03)], (400, 700), fame=50, xp=120, ilvl=(18, 22),
          gear=[GB("cloud_veil_crown", 0.25, rare=65, epic=30, legendary=5), GP(0.6, ["forest"], rare=55, epic=40, legendary=5)]),
        L("loot.boss.guardian_of_the_origin", [E("mat.frost_wyrm_heart_core", 0.5), E("mat.awakening_crystal", 0.1), E("gift.rare_treasure_map", 0.4), E("mat.glacier_iron_ore", 0.9, 3, 6)], (900, 1400), fame=80, xp=200, ilvl=(24, 30), gear=[GP(0.7, ["forest"], epic=70, legendary=30)]),
        L("loot.boss.tribulation_thunder_spirit", [E("mat.dao_insight_crystal", 0.5), E("mat.spirit_enhancing_stone", 1.0, 5, 8)], (2000, 3000), fame=200, xp=400),
        L("loot.boss.nine_headed_abyss_serpent", [E("mat.abyss_serpent_fang", 0.7), E("mat.awakening_crystal", 0.5, 1, 2), E("mat.dao_insight_crystal", 0.8, 2, 4), E("tech.ult.soul_devouring_art", 0.1)], (8000, 12000), fame=500, xp=1200, ilvl=(66, 70), gear=[GP(0.8, ["sect"], legendary=100)]),
        L("loot.boss.tower_warden", [E("mat.spirit_enhancing_stone", 1.0, 3, 5), E("mat.refining_stone", 0.6, 1, 3), E("mat.sword_rain_fragment", 0.3)], (600, 1000), fame=40, xp=150, ilvl=(10, 100), gear=[GP(0.5, ["sect"], rare=40, epic=40, legendary=20)]),
    ]
    places = [
        L("loot.chest.plains_cache", [E("gift.counterfeit_coin", 0.3)], (80, 120), [q("mat.lesser_enhancement_stone", 3), q("cons.qi_gathering_pill", 2)], ilvl=(4, 8), gear=[GP(1.0, ["plains"], uncommon=80, rare=20)]),
        L("loot.chest.forest_hollow", [E("gift.rare_treasure_map", 0.2)], (150, 250), [q("qitem.caravan_manifest", 1), q("mat.spirit_iron_ore", 4), q("gift.ancient_spirit_coin", 1)], ilvl=(12, 16), gear=[GP(1.0, ["forest"], rare=75, epic=25)]),
        L("loot.chest.origin_vault", [E("egg.flame_fox", 0.5), E("gift.rare_treasure_map", 0.5)], (500, 800), [q("mat.flame_lotus", 1), q("mat.glacier_iron_ore", 5), q("mat.refining_stone", 3)], ilvl=(24, 30), gear=[GP(1.0, ["forest"], epic=80, legendary=20)]),
        L("loot.dungeon.granary_wave", [E("mat.lesser_enhancement_stone", 0.3)], (30, 50)),
        L("loot.dungeon.granary_clear", [E("gift.spirit_stone_pouch", 0.3), E("cons.qi_gathering_pill", 0.5, 1, 2)], (200, 300), [q("mat.lesser_enhancement_stone", 2)]),
        L("loot.dungeon.mine_wave", [E("mat.lesser_enhancement_stone", 0.5), E("mat.reforging_sand", 0.2)], (40, 60)),
        L("loot.dungeon.mine_clear", [E("mat.refining_stone", 0.5), E("mat.spirit_enhancing_stone", 0.3)], (300, 450), [q("mat.reforging_sand", 2), q("mat.spirit_iron_ore", 3)]),
        L("loot.dungeon.labyrinth_wave", [E("mat.jade_bamboo_segment", 0.5), E("mat.cloud_silk_bolt", 0.2)], (60, 90)),
        L("loot.dungeon.labyrinth_clear", [E("mat.rime_crystal", 0.6, 1, 2), E("mat.spirit_enhancing_stone", 0.6, 1, 2)], (400, 600), fame=20, ilvl=(14, 20), gear=[GB("dragonbone_pendant", 0.05, epic=90, legendary=10), GP(0.4, ["forest"], rare=50, epic=45, legendary=5)]),
        L("loot.dungeon.tower_floor", [E("mat.spirit_enhancing_stone", 0.2), E("mat.lesser_enhancement_stone", 0.5, 1, 2)], (50, 90), ilvl=(4, 100), gear=[GP(0.08, ["sect"], uncommon=40, rare=40, epic=17, legendary=3)]),
        L("loot.dungeon.origin_clear", [E("mat.frost_wyrm_heart_core", 0.3), E("mat.rime_crystal", 0.8, 2, 4), E("gift.frost_plum_wine", 0.2)], (1200, 1800), fame=50, ilvl=(24, 30), gear=[GP(0.5, ["forest"], epic=75, legendary=25)]),
        L("loot.dungeon.abyss_wave", [E("mat.spirit_enhancing_stone", 0.8, 2, 4), E("mat.refining_stone", 0.5, 1, 2)], (500, 800)),
        L("loot.dungeon.abyss_clear", [E("mat.awakening_crystal", 0.6, 1, 2), E("mat.dao_insight_crystal", 1.0, 3, 5)], (15000, 25000), fame=300, ilvl=(68, 72),
          gear=[GB("dragon_abyss_sword", 0.02, divine=1), GB("demonbane_fan", 0.05, immortal=1), GB("ninefold_hairpin_crown", 0.05, immortal=1), GP(1.0, ["sect"], legendary=100)]),
        L("loot.tribulation.core_formation", [E("mat.dao_insight_crystal", 0.3)], (3000, 5000), [q("mat.spirit_enhancing_stone", 5)], fame=300),
    ]
    # resource dungeon tiers II–V reuse the tier-I clear table with scaled numbers (see common.tier_loot)
    for base_id in ["loot.dungeon.granary_clear", "loot.dungeon.mine_clear"]:
        places += tier_loots(next(x for x in places if x["id"] == base_id))
    return enemies, bosses, places

# ---------------- Recipes ----------------
def alchemy():
    A = lambda key, name, cn, desc, out, qty, ings, stones, grade, succ, prof, xp, unlock, furnace=1, byproduct="gift.bitter_medicine": {
        "id": f"alchemy.{key}", **named(name, desc, cn), "output": {"id": out, "qty": list(qty)}, "ingredients": ings, "cost_stones": stones, "grade": grade, "success_base": succ,
        "furnace_min": furnace, "proficiency_min": prof, "proficiency_xp": xp, "unlock": unlock, "failure": {"return_pct": 0.3, "byproduct": byproduct}}
    return [
        A("qi_gathering_pill", "Qi Gathering Pill", "聚气丹", "Restores focus and grants +600 Qi. A staple of every outer disciple.", "cons.qi_gathering_pill", (1, 2), [q("mat.spirit_grass", 2), q("mat.peach_blossom", 1), q("mat.crane_feather", 1)], 10, 1, 0.7, 0, 20, {"type": "known"}),
        A("blossom_healing_pill", "Blossom Healing Pill", "桃花疗伤丹", "Heals 40% HP. Sweet, and faintly floral.", "cons.blossom_healing_pill", (1, 2), [q("mat.peach_blossom", 3), q("mat.spirit_grass", 1)], 12, 1, 0.75, 0, 20, {"type": "known"}),
        A("spirit_condensing_pill", "Spirit Condensing Pill", "凝神丹", "Grade II. Condenses spirit energy and quickens cultivation for an hour.", "cons.spirit_condensing_pill", (1, 1), [q("mat.bamboo_spirit_shoot", 3), q("mat.spirit_grass", 4), q("mat.frost_beast_core", 1)], 40, 2, 0.6, 50, 45, {"type": "sect_fame", "fame": 300}, 1),
        A("foundation_pill", "Foundation Pill", "筑基丹", "Grade III. Required to establish a Foundation. Unlocked at 500 Sect Fame.", "cons.foundation_pill", (1, 1), [q("mat.spirit_grass", 10), q("mat.jade_bamboo_segment", 4), q("mat.frost_beast_core", 2), q("mat.boar_tusk", 2)], 200, 3, 0.45, 150, 120, {"type": "sect_fame", "fame": 500}, 2),
        A("frost_heart_elixir", "Frost Heart Elixir", "冰心露", "Grade IV. Permanently raises water resistance and spiritual energy.", "cons.frost_heart_elixir", (1, 1), [q("mat.frost_beast_core", 3), q("mat.rime_crystal", 2), q("mat.peach_blossom", 5)], 350, 4, 0.5, 300, 200, {"type": "blueprint", "id": "blueprint.frost_heart_elixir"}, 2),
        A("core_condensing_pill", "Core Condensing Pill", "结丹丹", "Grade V. Needed to form a Golden Core.", "cons.core_condensing_pill", (1, 1), [q("mat.flame_lotus", 1), q("mat.green_viper_venom", 5), q("mat.bamboo_dragon_scale", 1), q("mat.jade_bamboo_segment", 10)], 1500, 5, 0.4, 600, 500, {"type": "rank", "id": "rank.inner_disciple"}, 3),
    ]

def forge():
    F = lambda key, name, cn, desc, out, ings, stones, fame, unlock: {"id": f"forge.{key}", **named(name, desc, cn), "output": out, "ingredients": ings, "cost_stones": stones, "fame_required": fame, "unlock": unlock}
    return [
        F("azure_iron_sword", "Azure Iron Sword", "苍铁剑", "A refined-grade Azure Iron Sword forged from spirit iron.", {"base": "gear.azure_iron_sword", "rarity": "rare", "ilvl": 8}, [q("mat.spirit_iron_ore", 5), q("mat.wolf_fang", 2), q("mat.boar_tusk", 1), q("mat.river_pebble", 3)], 400, 0, {"type": "known"}),
        F("rimeglass_spear", "Rimeglass Spear", "霜玻璃枪", "Blueprint required. Glacier iron, rime crystal and a Frost Wyrm heart-core.", {"base": "gear.rimeglass_spear", "rarity": "epic", "ilvl": 24}, [q("mat.glacier_iron_ore", 3), q("mat.frost_wyrm_heart_core", 1), q("mat.rime_crystal", 2), q("mat.jade_bamboo_segment", 6)], 3000, 1500, {"type": "blueprint", "id": "blueprint.rimeglass_spear"}),
        F("rimeglass_robe", "Rimeglass Robe", "霜玻璃袍", "Frost-silk robe threaded with rime crystal.", {"base": "gear.rimeglass_robe", "rarity": "epic", "ilvl": 24}, [q("mat.cloud_silk_bolt", 4), q("mat.rime_crystal", 3), q("mat.azure_wolf_pelt", 4)], 2600, 1500, {"type": "sect_fame", "fame": 1500}),
        F("rimeglass_boots", "Rimeglass Boots", "霜玻璃靴", "Boots soled with frost-glass.", {"base": "gear.rimeglass_boots", "rarity": "epic", "ilvl": 24}, [q("mat.glacier_iron_ore", 2), q("mat.rime_crystal", 2), q("mat.bamboo_dragon_scale", 1), q("mat.azure_wolf_pelt", 2)], 2200, 1500, {"type": "sect_fame", "fame": 1500}),
        F("demonbane_fan", "Demonbane Fan", "斩魔扇", "Blueprint required. Feathers from the Abyss and a serpent's fang.", {"base": "gear.demonbane_fan", "rarity": "legendary", "ilvl": 60}, [q("mat.abyss_serpent_fang", 1), q("mat.awakening_crystal", 1), q("mat.glacier_iron_ore", 10), q("mat.cloud_silk_bolt", 6)], 20000, 4000, {"type": "blueprint", "id": "blueprint.demonbane_fan"}),
    ]

# ---------------- Quests ----------------
def quests():
    def Q(key, typ, name, cn, desc, giver, turn_in, objectives, rewards, hint, prereqs=None, nxt=None, diff=1, cp=None, repeat=None):
        d = {"id": f"quest.{typ}.{key}", **named(name, desc, cn), "type": typ, "giver": giver, "turn_in": turn_in, "prereqs": prereqs or {}, "objectives": objectives, "rewards": rewards,
             "difficulty": diff, "hint": hint, "art": {"icon": icon(f"quests/{typ}_{key}", f"a round quest emblem with a small pictorial scene evoking {name.lower()}, a purely pictorial emblem with no letters, characters or writing anywhere", "rare", ["refs/mockups/mission_hall.png"])}}
        if nxt: d["next"] = f"quest.{nxt}"
        if cp: d["rec_cp"] = cp
        if repeat: d["repeatable"] = {"cooldown_min": repeat}
        return d
    MH, BAI, TANG = "sectloc.mission_hall", "npc.bai_lingshuang", "npc.tang_xiaoman"
    return [
        Q("the_path_begins", "main", "The Path Begins", "仙途伊始", "Climb the Thousand Steps and pass the Elder's Trial.", "system", "auto",
          [{"type": "story", "scene": "story.prologue.senior_sister"}], {"spirit_stones": 100, "sect_fame": 20}, "Prologue · follow the story", None, "main.senior_sister"),
        Q("senior_sister", "main", "Senior Sister", "师姐", "Present Elder Wen's token to Bai Lingshuang at the Sword Grounds.", BAI, BAI,
          [{"type": "deliver", "item": "qitem.elder_wen_token", "count": 1, "to": BAI}], {"sect_fame": 20, "items": [q("cons.blossom_healing_pill", 2)], "affinity": [{"npc": BAI, "delta": 20}]},
          "Sect · Sword Grounds · Bai Lingshuang", {"quests": ["quest.main.the_path_begins"]}, "main.first_breath"),
        Q("first_breath", "main", "First Breath", "初次吐纳", "Cultivate Azure Cloud Breathing until you reach Qi Condensation Stage 2.", BAI, BAI,
          [{"type": "reach_realm", "realm": "realm.qi_condensation", "stage": 2}], {"spirit_stones": 150, "items": [q("cons.qi_gathering_pill", 3)]}, "Cultivate tab · Break through to Stage 2", {"quests": ["quest.main.senior_sister"]}, "main.first_hunt"),
        Q("first_hunt", "main", "First Hunt", "初猎", "Prove your blade on the Mortal Plains: defeat three Wild Boars.", BAI, BAI,
          [{"type": "defeat", "target": "enemy.wild_boar", "count": 3}], {"spirit_stones": 200, "sect_fame": 30, "items": [q("mat.lesser_enhancement_stone", 3)]}, "Adventure · Mortal Plains · Boar Thicket", {"quests": ["quest.main.first_breath"]}, "main.bandit_chief", 2, 130),
        Q("bandit_chief", "main", "The Bandit Chief", "匪首", "Chief Hu has been robbing sect caravans. End it.", BAI, BAI,
          [{"type": "defeat", "target": "boss.plains_bandit_chief", "count": 1}], {"spirit_stones": 300, "sect_fame": 60, "techniques": ["tech.active.earth_guardian"]}, "Adventure · Mortal Plains · Bandit Camp", {"quests": ["quest.main.first_hunt"], "realm": {"id": "realm.qi_condensation", "stage": 3}}, "main.into_the_bamboo", 3, 480),
        Q("into_the_bamboo", "main", "Into the Bamboo", "入竹林", "The Azure Bamboo Forest is open to you. Explore three of its nodes.", BAI, BAI,
          [{"type": "explore", "region": "region.azure_bamboo_forest", "nodes": 3}], {"spirit_stones": 250, "sect_fame": 40}, "Adventure · Azure Bamboo Forest", {"quests": ["quest.main.bandit_chief"], "regions": ["region.azure_bamboo_forest"]}, "main.bamboo_sovereign", 2, 300),
        Q("bamboo_sovereign", "main", "The Bamboo Sovereign", "竹龙", "Something ancient stirs at the heart of the forest. Defeat the Thousand-Node Bamboo Dragon.", BAI, BAI,
          [{"type": "defeat", "target": "boss.thousand_node_bamboo_dragon", "count": 1}], {"spirit_stones": 800, "sect_fame": 200, "items": [q("cons.foundation_pill", 1)]}, "Adventure · Azure Bamboo Forest · Ancient Bamboo Sovereign", {"quests": ["quest.main.into_the_bamboo"], "realm": {"id": "realm.qi_condensation", "stage": 7}}, None, 4, 1100),
        # missions
        Q("frost_beast_cores", "mission", "Frost Beast Cores", "寒兽核", "Senior Sister Bai needs three Frost Beast Cores from the Azure Bamboo Forest.", MH, MH,
          [{"type": "deliver", "item": "mat.frost_beast_core", "count": 3, "to": MH}], {"spirit_stones": 120, "sect_fame": 40, "affinity": [{"npc": BAI, "delta": 3}]}, "Azure Bamboo Forest · Frost Lynx Den", {"regions": ["region.azure_bamboo_forest"]}, None, 2, 400, 1440),
        Q("goods_for_the_caravan", "mission", "Goods for the Caravan", "商队货物", "Tang Xiaoman wants spirit grass and wolf fangs from the Mortal Plains.", MH, MH,
          [{"type": "collect", "item": "mat.spirit_grass", "count": 6}, {"type": "collect", "item": "mat.wolf_fang", "count": 4}], {"spirit_stones": 80, "sect_fame": 20, "affinity": [{"npc": TANG, "delta": 2}]}, "Mortal Plains · Herb Meadow / Wolf Den", {}, None, 1, 250, 1440),
        Q("ore_for_the_armory", "mission", "Ore for the Armory", "军械矿石", "Master Gu needs five Spirit Iron Ore.", MH, MH,
          [{"type": "collect", "item": "mat.spirit_iron_ore", "count": 5}], {"spirit_stones": 200, "sect_fame": 60, "affinity": [{"npc": "npc.master_gu", "delta": 3}]}, "Azure Bamboo Forest · Spirit Iron Vein", {"regions": ["region.azure_bamboo_forest"]}, None, 1, 650, 1440),
        Q("lotus_of_living_flame", "mission", "A Lotus of Living Flame", "焰莲", "The Alchemy Hall elder seeks a Flame Lotus from the Origin Secret Realm.", MH, MH,
          [{"type": "collect", "item": "mat.flame_lotus", "count": 1}], {"spirit_stones": 450, "sect_fame": 120, "items": [q("mat.spirit_enhancing_stone", 2)]}, "Origin Secret Realm · Origin Vault", {"quests": ["quest.main.bamboo_sovereign"]}, None, 4, 1200),
        # npc
        Q("tangs_ledger", "npc", "Tang's Missing Ledger", "唐家失账", "Tang's caravan manifest went missing in the forest. Find it in the Hollow Shrine and bring it back.", TANG, TANG,
          [{"type": "deliver", "item": "qitem.caravan_manifest", "count": 1, "to": TANG}], {"spirit_stones": 100, "techniques": ["tech.active.golden_coin_barrage"], "affinity": [{"npc": TANG, "delta": 40}]}, "Azure Bamboo Forest · Hollow Shrine → Merchant Pavilion", {"affinity": [{"npc": TANG, "level": 1}], "regions": ["region.azure_bamboo_forest"]}, None, 2),
        Q("frost_sword_lesson", "npc", "The Frost Sword Lesson", "霜剑课", "Bai will teach the Frost Blossom Slash once you reach Stage 3 and win a friendly spar against Tang.", BAI, BAI,
          [{"type": "reach_realm", "realm": "realm.qi_condensation", "stage": 3}, {"type": "win_duel", "npc": TANG, "count": 1}], {"techniques": ["tech.active.frost_blossom_slash"], "items": [q("book.ripple_mending_scroll", 1)], "affinity": [{"npc": BAI, "delta": 30}]}, "Sect · Merchant Pavilion · Duel Tang, then Sword Grounds", {"affinity": [{"npc": BAI, "level": 1}]}, None, 2),
        Q("qins_first_companion", "npc", "A First Companion", "初伴", "Qin hands you a warm cloud-fox egg. Hatch it in the Spirit Beast Garden.", "npc.qin", "npc.qin",
          [{"type": "hatch", "beast": "beast.yunyun"}], {"items": [q("bfood.spirit_fruit", 5)], "affinity": [{"npc": "npc.qin", "delta": 20}]}, "Sect · Spirit Beast Garden", {}, "beast.evolve_yunyun"),
        Q("evolve_yunyun", "beast", "YunYun Grows Up", "云云长大", "Raise YunYun to level 10 and evolve her into a Cloud Fox.", "npc.qin", "npc.qin",
          [{"type": "evolve", "beast": "beast.yunyun", "stage": "juvenile"}], {"items": [q("bfood.dried_fish", 5), q("gift.beast_bell", 1)], "affinity": [{"npc": "npc.qin", "delta": 30}]}, "Sect · Spirit Beast Garden · YunYun", {"quests": ["quest.npc.qins_first_companion"]}),
        Q("qi_condensation_five", "cultivation", "Halfway Up the Mountain", "炼气五层", "Reach Qi Condensation Stage 5.", "system", "auto",
          [{"type": "reach_realm", "realm": "realm.qi_condensation", "stage": 5}], {"sect_fame": 50, "items": [q("cons.spirit_condensing_pill", 2)]}, "Cultivate tab", {}),
        Q("first_pill", "alchemy", "First Pill", "第一炉丹", "Refine a Qi Gathering Pill in the Alchemy Hall.", "sectloc.alchemy_hall", "sectloc.alchemy_hall",
          [{"type": "refine", "recipe": "alchemy.qi_gathering_pill", "count": 1}], {"spirit_stones": 50, "items": [q("mat.spirit_grass", 4)]}, "Sect · Alchemy Hall", {}),
        Q("first_enhancement", "forge", "Sharper Than Yesterday", "更利一分", "Enhance any piece of equipment to +3 at the Spirit Forge.", "npc.master_gu", "npc.master_gu",
          [{"type": "enhance", "level": 3}], {"items": [q("mat.lesser_enhancement_stone", 5)], "affinity": [{"npc": "npc.master_gu", "delta": 10}]}, "Sect · Spirit Forge · Enhance", {}),
        Q("green_labyrinth_trial", "dungeon", "Trial of the Green Labyrinth", "青翠试炼", "Elder Feng challenges you to clear the Green Labyrinth.", "npc.elder_feng", "npc.elder_feng",
          [{"type": "clear", "target": "dungeon.green_labyrinth", "count": 1}], {"sect_fame": 150, "spirit_stones": 500, "affinity": [{"npc": "npc.elder_feng", "delta": 20}]}, "Adventure · Dungeons · The Green Labyrinth", {"realm": {"id": "realm.qi_condensation", "stage": 6}}, None, 3, 480),
        Q("tower_five", "combat", "Five Floors", "五层", "Climb to floor 5 of the Heaven-Piercing Tower.", "sectloc.proving_arena", "auto",
          [{"type": "tower_floor", "dungeon": "dungeon.heaven_piercing_tower", "floor": 5}], {"spirit_stones": 200, "sect_fame": 30}, "Adventure · Dungeons · Heaven-Piercing Tower", {"realm": {"id": "realm.qi_condensation", "stage": 5}}, None, 2, 400),
        Q("heart_of_the_grove", "hidden", "Heart of the Grove", "林心", "Find the hidden clearing and face the Frost Hermit's trial.", "system", "auto",
          [{"type": "clear", "target": "node.azure_bamboo_forest.heart_of_the_grove", "count": 1}], {"items": [q("gift.rare_treasure_map", 1)], "sect_fame": 40}, "Azure Bamboo Forest · ???", {"regions": ["region.azure_bamboo_forest"]}, None, 3, 520),
    ]

def achievements():
    # The medal shows a picture, never the achievement's name: quoting it made the model letter it onto the medal.
    EMBLEM = {"foundation_laid": "a white lotus blooming on a solid jade foundation stone", "mortal_plains_charted": "a map of green plains, farm fields and a winding road",
              "hundred_victories": "a fan of many crossed swords radiating like a sunburst", "boss_hunter_i": "a horned demon skull pierced by a single sword",
              "hidden_paths": "a misty forest path leading to a glowing hidden doorway", "beast_friend": "a small fluffy spirit-beast cub curled around a cracked egg",
              "inner_disciple": "a jade sect token carved with a sword and cloud crest", "untouched": "a tall pagoda tower piercing the clouds"}
    A = lambda key, cat, name, cn, desc, cond, rewards, hidden=False: {"id": f"ach.{cat}.{key}", **named(name, desc, cn), "category": cat, "condition": cond, "rewards": rewards, "hidden": hidden,
        "art": {"icon": icon(f"achievements/{cat}_{key}", f"a round achievement medal whose face shows {EMBLEM[key]}, a purely pictorial medal with no letters, characters or writing anywhere", "epic", ["refs/mockups/achievements.png"])}}
    return [
        A("foundation_laid", "cultivation", "Foundation Laid", "筑基", "Reach Foundation Establishment.", {"type": "objective", "objective": {"type": "reach_realm", "realm": "realm.foundation_establishment", "stage": 1}}, {"spirit_stones": 500, "titles": ["title.path_of_the_cultivator"]}),
        A("mortal_plains_charted", "exploration", "Mortal Plains Charted", "踏遍平原", "Clear every node in the Mortal Plains.", {"type": "objective", "objective": {"type": "explore", "region": "region.mortal_plains", "nodes": 10}}, {"spirit_stones": 300, "items": [q("mat.refining_stone", 2)]}),
        A("hundred_victories", "combat", "Hundred Victories", "百胜", "Defeat 100 enemies.", {"type": "counter", "metric": "enemies_defeated", "target": 100}, {"spirit_stones": 400, "items": [q("mat.spirit_enhancing_stone", 2)]}),
        A("boss_hunter_i", "combat", "Boss Hunter I", "猎首", "Defeat 5 bosses.", {"type": "counter", "metric": "bosses_defeated", "target": 5}, {"spirit_stones": 600}),
        A("hidden_paths", "exploration", "Hidden Paths", "隐径", "Discover 3 hidden encounters.", {"type": "counter", "metric": "hidden_found", "target": 3}, {"items": [q("gift.rare_treasure_map", 1)]}),
        A("beast_friend", "beasts", "Beast Friend", "兽友", "Hatch your first spirit beast.", {"type": "counter", "metric": "beasts_hatched", "target": 1}, {"items": [q("bfood.spirit_fruit", 5)]}),
        A("inner_disciple", "sect", "Inner Disciple", "内门", "Win the Outer Sect Tournament and rise to Inner Disciple.", {"type": "objective", "objective": {"type": "rank", "rank": "rank.inner_disciple"}}, {"spirit_stones": 1000}),
        A("untouched", "hidden", "Untouched", "无伤", "Reach floor 10 of the Heaven-Piercing Tower.", {"type": "counter", "metric": "tower_floor", "target": 10}, {"items": [q("mat.sword_rain_fragment", 2)]}, True),
    ]

def tournaments():
    return [{"id": "tournament.outer_sect", **named("Outer Sect Tournament", "Four rounds in the Proving Arena. Win all four to become an Inner Disciple. Lose any round: −200 Fame; re-enter at 1,000 Fame.", "内门大比"),
             "entry": {"rank": "rank.outer_disciple", "sect_fame": 1000, "realm": {"id": "realm.foundation_establishment", "stage": 1}},
             "rounds": [{"opponent": "npc.zhao_lie", "cp": 1200, "rewards": {"spirit_stones": 200, "items": [q("mat.sword_rain_fragment", 3)]}},
                        {"opponent": "npc.shen_qingxue", "cp": 1500, "rewards": {"spirit_stones": 300, "items": [q("mat.sword_rain_fragment", 3)]}},
                        {"opponent": "npc.tie_shanhe", "cp": 1900, "rewards": {"spirit_stones": 400, "items": [q("mat.sword_rain_fragment", 2), q("gift.fine_ledger_book", 1)]}},
                        {"opponent": "npc.mo_lianjue", "cp": 2400, "rewards": {"spirit_stones": 600, "items": [q("mat.sword_rain_fragment", 2)]}}],
             "champion_rewards": {"spirit_stones": 3000, "sect_fame": 500, "items": [q("cons.foundation_pill", 2)], "techniques": ["tech.ult.heavenly_sword_rain"], "titles": ["title.outer_sect_champion"]},
             "loss": {"sect_fame": -200}, "reentry": {"sect_fame_required": 1000}, "repeatable": True}]

def story():
    cg = lambda key, scene: art(f"assets/story/{key}.png", f"{STYLE}. Full-screen visual novel background illustration: {scene}. Cinematic, no characters in the foreground, no text.", (1080, 1920), False, ["refs/mockups/prologue.png"])
    S = lambda key, chapter, title, cn, desc, trigger, lines, scene, choices=None, unlocks=None, nxt=None: {
        "id": f"story.{chapter}.{key}", **named(title, desc, cn), "chapter": chapter, "trigger": trigger, "lines": lines, **({"choices": choices} if choices else {}),
        "unlocks": unlocks or [], **({"next": nxt} if nxt else {}), "skippable": True, "art": {"cg": cg(f"{chapter}_{key}", scene)}}
    n = lambda t: {"speaker": "narration", "text": t}
    p = lambda t: {"speaker": "player", "text": t}
    s = lambda who, t, e=None: {"speaker": f"npc.{who}", "text": t, **({"expression": e} if e else {})}
    return [
        S("entrance_gate", "prologue", "The Entrance Gate", "入门", "Lin Xueyao climbs the Thousand Steps.", {"on": "new_game"},
          [n("Hundreds climb the Thousand Steps each spring. Few pass the gate."), n("Today, Lin Xueyao climbs among them."), p("…One more step.")],
          "a vast stone staircase climbing into clouds toward a red-and-gold sect gate, floating mountains, waterfalls, cherry blossoms, crowds of hopeful applicants", nxt="story.prologue.elders_trial"),
        S("elders_trial", "prologue", "The Elder's Trial", "考验", "Elder Wen asks a question with no wrong answer.", {"on": "chained"},
          [s("elder_wen", "A thirsty villager and a wounded fox both reach for your last waterskin. What do you do?", "thoughtful")],
          "a serene elder's study with scrolls, a wooden staff and morning light through paper windows, cherry branches",
          choices=[{"text": "Give it to the villager. A person's life comes first.", "effects": {"affinity": [{"npc": "npc.elder_wen", "delta": 10}]}},
                   {"text": "Share it. Half for each, and we search for a stream together.", "effects": {"affinity": [{"npc": "npc.elder_wen", "delta": 15}, {"npc": "npc.bai_lingshuang", "delta": 5}]}},
                   {"text": "Bind the fox's wound first, then give the water to whoever needs it most.", "effects": {"affinity": [{"npc": "npc.bai_lingshuang", "delta": 15}, {"npc": "npc.qin", "delta": 10}]}}],
          nxt="story.prologue.welcome"),
        S("welcome", "prologue", "Welcome to the Azure Cloud Sect", "青云宗", "Lin Xueyao is granted the rank of Outer Disciple.", {"on": "chained"},
          [n("Lin Xueyao has passed the Elder's Trial."), s("elder_wen", "Rank granted: Outer Disciple. Take this token to the Sword Grounds. Someone is waiting.", "warm_smile"), n("New area: Sword Grounds. Method granted: Azure Cloud Breathing.")],
          "a breathtaking view of the Azure Cloud Sect: floating islands, pagodas, bridges and waterfalls in golden morning light",
          unlocks=["sectloc.sword_grounds", "method.azure_cloud_breathing", "qitem.elder_wen_token"], nxt="story.prologue.senior_sister"),
        S("senior_sister", "prologue", "Senior Sister", "师姐", "Bai Lingshuang introduces herself.", {"on": "chained"},
          [s("bai_lingshuang", "Lin Xueyao. I am Bai Lingshuang. From today, you train under me.", "stern"), s("bai_lingshuang", "Straighten your back, breathe when I say, and do not waste my time.", "neutral"), p("Yes, Senior Sister.")],
          "sunlit sword-training terraces above clouds with frost-blue banners and a single plum tree"),
        S("first_steps", "forest", "Blue Bamboo", "苍竹", "Tang's caravan waits at the forest edge.", {"on": "region_enter", "region": "region.azure_bamboo_forest"},
          [s("tang_xiaoman", "Boss! You made it out of the plains! My caravan's camped up ahead—come buy something before the wolves do.", "grin"), p("The wolves buy things?"), s("tang_xiaoman", "The wolves take things. Big difference. Keep an eye out for a missing manifest, would you?", "wink")],
          "the edge of a misty blue bamboo forest with a small merchant caravan and lanterns among the stalks"),
        S("confidant_secret", "tang", "Why She Needs the Money", "缘由", "Tang finally answers the question she always laughs off.", {"on": "affinity", "npc": "npc.tang_xiaoman", "level": 3},
          [s("tang_xiaoman", "…Fine. My sisters are still on the plains. Foundation Pills cost more than a goat. Don't tell anyone.", "pout"), p("I won't."), s("tang_xiaoman", "Here. Abacus Reckoning. Count your enemies' debts properly.", "grin")],
          "the Merchant Pavilion at night, lanterns low, an abacus and a worn family portrait on the counter",
          unlocks=["tech.active.abacus_reckoning"]),
    ]

def meta():
    starting = {"character": "npc.lin_xueyao", "realm": {"id": "realm.qi_condensation", "stage": 1}, "root": "root.faint_mortal", "rank": "rank.outer_disciple", "region": "region.mortal_plains",
                "method": "method.azure_cloud_breathing", "techniques": ["tech.active.azure_strike"],
                "inventory": [q("cons.qi_gathering_pill", 3), q("egg.cloud_fox", 1), q("mat.lesser_enhancement_stone", 5)],
                "equipped": {"weapon": {"base": "gear.bamboo_sword", "rarity": "common", "ilvl": 1}, "armor": {"base": "gear.bamboo_robe", "rarity": "common", "ilvl": 1}, "ring_1": {"base": "gear.azure_iron_war_ring", "rarity": "common", "ilvl": 1}},
                "spirit_stones": 340, "sect_fame": 120}
    targets = {"strict": False, "targets": {"realms": 15, "regions": 15, "dungeons": 20, "mega_dungeons": 5, "encounters": 150, "bosses": 40, "active_techniques": 30, "passive_techniques": 20,
                                            "methods": 20, "gear_items": 150, "gear_bases": 60, "gear_sets": 8, "enemies": 60, "beasts": 20, "quests": 100, "tournaments": 3, "secret_realms": 3}}
    return starting, targets

if __name__ == "__main__":
    write("content/economy/shops.json", shops())
    en, bo, pl = loot()
    write("content/economy/loot/enemies.json", en)
    write("content/economy/loot/bosses.json", bo)
    write("content/economy/loot/places.json", pl)
    write("content/economy/recipes/alchemy.json", alchemy())
    write("content/economy/recipes/forge.json", forge())
    qs = quests()
    write("content/quests/main.json", [x for x in qs if x["type"] == "main"])
    write("content/quests/missions.json", [x for x in qs if x["type"] == "mission"])
    write("content/quests/npc.json", [x for x in qs if x["type"] in ("npc", "beast")])
    write("content/quests/misc.json", [x for x in qs if x["type"] not in ("main", "mission", "npc", "beast")])
    write("content/achievements/achievements.json", achievements())
    write("content/sect/tournaments.json", tournaments())
    st = story()
    for ch in ["prologue", "forest", "tang"]:
        write(f"content/story/{ch}.json", [x for x in st if x["chapter"] == ch])
    s, t = meta()
    write("content/meta/starting_state.json", s)
    write("content/meta/content_targets.json", t)
