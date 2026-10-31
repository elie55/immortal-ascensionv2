import re
from common import *
from region_data import REGIONS

def stats(hp, atk, df, spd, crit=5, acc=90, eva=5, spp=0, spe=100):
    return {"hp": hp, "atk": atk, "def": df, "spd": spd, "crit": crit, "crit_dmg": 150, "acc": acc, "eva": eva, "sp_power": spp, "sp_energy": spe}

def enemy(key, name, cn, kind, elem, realm, stage, st, cp, techs, strat, desc, look, region):
    return {"id": f"enemy.{key}", **named(name, desc, cn), "kind": kind, "element": f"elem.{elem}", "realm": {"id": f"realm.{realm}", "stage": stage},
            "stats": st, "cp": cp, "techniques": techs, "ai": {"strategy": strat, "rules": []}, "resistances": {}, "loot": f"loot.enemy.{key}", "mastery_xp": 10 + cp // 50,
            "art": {"icon": icon(f"enemies/{region}/{key}_icon", f"the {'head' if kind == 'beast' else 'head and shoulders'} of {look}", None, ["refs/mockups/battle_screen.png"], (256, 256)),
                    "battle": battle(f"enemies/{region}/{key}_battle", f"{look}", refs=["refs/mockups/battle_screen.png"], creature=kind == "beast")}}

def enemies():
    P, F = "mortal_plains", "azure_bamboo_forest"
    return [
        enemy("field_bandit", "Field Bandit", "野匪", "human", "metal", "qi_condensation", 1, stats(320, 38, 18, 10), 110, ["tech.active.bandit_slash"], "aggressive",
              "A desperate mortal turned bandit, armed with a chipped saber.", "a scruffy bandit in patched brown leathers and a red headscarf holding a chipped saber", P),
        enemy("wild_boar", "Wild Boar", "野猪", "beast", "earth", "qi_condensation", 1, stats(420, 34, 28, 7), 120, ["tech.active.stone_shell", "tech.active.savage_bite"], "berserker",
              "A thick-skulled boar that charges anything that moves.", "a large bristly brown wild boar with yellow tusks and glowing orange eyes", P),
        enemy("spirit_monkey", "Spirit Monkey", "灵猴", "beast", "wood", "qi_condensation", 2, stats(300, 44, 14, 16, eva=15), 150, ["tech.active.crescent_wind_blade"], "trickster",
              "A silver-furred monkey that has tasted spirit fruit and learned to throw wind.", "a nimble silver-grey monkey with jade-green eyes crouched on a branch, wind swirling around its paws", P),
        enemy("grey_wolf", "Grey Plains Wolf", "灰狼", "beast", "metal", "qi_condensation", 2, stats(380, 48, 20, 14), 170, ["tech.active.savage_bite"], "aggressive",
              "Hunts in threes across the plains at dusk.", "a lean grey wolf with pale yellow eyes and bared fangs, mid-snarl", P),
        enemy("azure_bamboo_wolf", "Azure Bamboo Wolf", "苍竹狼", "beast", "wood", "qi_condensation", 3, stats(620, 66, 30, 16), 280, ["tech.active.savage_bite", "tech.active.bamboo_spike"], "aggressive",
              "A blue-grey wolf whose fur grows bamboo-leaf patterns.", "a sleek blue-grey wolf with bamboo-leaf markings and a white ruff, jade light in its eyes", F),
        enemy("bamboo_spirit_sprite", "Bamboo Spirit Sprite", "竹灵", "construct", "wood", "qi_condensation", 3, stats(500, 58, 40, 12), 260, ["tech.active.bamboo_spike", "tech.active.stone_shell"], "defensive",
              "A knot of living bamboo animated by forest qi.", "a small humanoid figure made of green bamboo segments and leaves with glowing hollow eyes", F),
        enemy("green_viper", "Green Viper", "青蛇", "beast", "wood", "qi_condensation", 4, stats(540, 72, 24, 18, eva=12), 300, ["tech.active.venom_fang"], "trickster",
              "A bright green viper whose bite rots the meridians.", "a large emerald-scaled spirit viper rearing up in an S-curve with a hooded head, slit golden eyes, long dripping fangs, jade-patterned scales and a faint green venom mist, realistic serpent anatomy", F),
        enemy("cloud_silk_spider", "Cloud Silk Spider", "云丝蛛", "beast", "wood", "qi_condensation", 5, stats(700, 70, 36, 11), 340, ["tech.active.web_snare", "tech.active.venom_fang"], "trickster",
              "Spins silk as white as cloud and twice as strong.", "a large pale-white spider with cloud-like silk and blue markings on its back", F),
        enemy("rime_bamboo_lynx", "Rime Bamboo Lynx", "霜竹猞猁", "beast", "water", "qi_condensation", 6, stats(900, 92, 44, 20, crit=12), 480, ["tech.active.frost_breath", "tech.active.savage_bite"], "aggressive",
              "An elite lynx of the deep forest; frost crackles along its fur.", "a powerful pale-blue lynx with frost-crystal fur tufts and icy breath, tufted ears", F),
        enemy("whispering_reed_witch", "Whispering Reed Witch", "苇巫", "demonic", "water", "qi_condensation", 7, stats(1100, 98, 40, 17, spp=120), 560, ["tech.active.reed_whisper_curse", "tech.active.frozen_lotus"], "caster",
              "A demonic cultivator who hides among the reeds and sings travellers to sleep.", "a gaunt pale woman in tattered green-black robes woven from reeds, long wet hair, holding a reed flute, eerie teal glow", F),
        enemy("abyss_spawn", "Abyss Spawn", "渊裔", "demonic", "water", "foundation_establishment", 3, stats(4200, 260, 120, 22), 1800, ["tech.active.frost_breath", "tech.active.venom_fang"], "aggressive",
              "A serpent-headed thing birthed by the Abyss.", "a hunched black-scaled humanoid with a serpent head, dark water dripping from its claws", "special"),
        # the Sword Grounds practice post (prologue lesson, story.prologue.first_sword_art): barely hits back, drops nothing
        enemy("training_construct", "Training Construct", "木人桩", "construct", "wood", "qi_condensation", 1, stats(2400, 6, 30, 4), 40, ["tech.active.stone_shell"], "defensive",
              "A wooden practice post of the Sword Grounds, talismans pasted to its chest. It never hits back hard.",
              "a wooden martial-arts training dummy construct on a round stone base: a sturdy carved post with three short wooden arms, yellow paper talismans pasted on its chest, faint jade runes glowing in the grain", "special"),
        enemy("thunder_wisp", "Thunder Wisp", "雷灵", "celestial", "metal", "foundation_establishment", 5, stats(2600, 300, 80, 30, eva=20), 1700, ["tech.active.heavenly_bolt"], "caster",
              "A fragment of tribulation lightning given form.", "a crackling violet-white wisp of lightning shaped like a small floating spirit with a crown of sparks", "special"),
    ]

def boss(key, name, cn, kind, elem, realm, stage, st, cp, techs, phases, strat, desc, look, weak, region):
    return {"id": f"boss.{key}", **named(name, desc, cn), "kind": kind, "element": f"elem.{elem}", "realm": {"id": f"realm.{realm}", "stage": stage},
            "stats": st, "cp": cp, "techniques": techs, "ai": {"strategy": strat, "rules": []}, "resistances": {}, "loot": f"loot.boss.{key}", "mastery_xp": 40 + cp // 40,
            "phases": phases, "weaknesses": [f"elem.{w}" for w in weak],
            "art": {"icon": icon(f"bosses/{region}/{key}_icon", f"the head of {look}", None, ["refs/mockups/battle_screen.png"], (256, 256)),
                    "battle": battle(f"bosses/{region}/{key}_battle", f"{look}", (1024, 1024), ["refs/mockups/battle_screen.png"]),
                    "intro": art(f"assets/bosses/{region}/{key}_intro.png", f"{STYLE}. Dramatic boss introduction splash of {look}, low angle, swirling elemental energy, dark vignette, no text.", (1080, 1350), False, ["refs/mockups/battle_screen.png"])}}

def bosses():
    ph = lambda name, hp, techs, summons=None, enrage=None, shield=None, charged=None: {"name": name, "hp_threshold": hp, "techniques": techs, "summons": summons or [], **({"enrage": enrage} if enrage else {}), **({"shield_pct": shield} if shield else {}), **({"charged_attack": charged} if charged else {})}
    return [
        boss("plains_bandit_chief", "Bandit Chief Hu", "匪首胡", "region", "metal", "qi_condensation", 3, stats(1800, 90, 40, 13), 480, ["tech.active.bandit_slash", "tech.active.swallow_return_sword"],
             [ph("Bluster", 1.0, ["tech.active.bandit_slash"]), ph("Cornered", 0.5, ["tech.active.swallow_return_sword", "tech.active.bandit_slash"], [{"enemy": "enemy.field_bandit", "count": 2}], {"atk_mult": 1.3, "spd_mult": 1.1})],
             "aggressive", "Leader of the plains bandits. Once a failed sect applicant.", "a burly scarred bandit chief in a fur-collared coat with two sabers, gold tooth, torn sect robe beneath", ["wood"], "mortal_plains"),
        boss("thousand_node_bamboo_dragon", "Thousand-Node Bamboo Dragon", "千节竹龙", "region", "wood", "qi_condensation", 9, stats(6000, 150, 70, 15), 1100, ["tech.active.bamboo_spike", "tech.active.verdant_vine_bind", "tech.active.stone_shell"],
             [ph("Rooted", 1.0, ["tech.active.bamboo_spike", "tech.active.stone_shell"]), ph("Grove Awakens", 0.6, ["tech.active.verdant_vine_bind", "tech.active.bamboo_spike"], [{"enemy": "enemy.bamboo_spirit_sprite", "count": 2}]), ph("Thousand Nodes", 0.25, ["tech.active.bamboo_spike"], None, {"atk_mult": 1.5, "spd_mult": 1.3})],
             "guardian", "The ancient dragon-shaped bamboo at the heart of the forest. Its scales are living leaves; it is weak to Metal.", "an enormous serpentine dragon made of jade-green bamboo segments and leaves, with glowing amber eyes and moss antlers", ["metal"], "azure_bamboo_forest"),
        boss("guardian_of_the_origin", "Guardian of the Origin", "本源守卫", "secret_realm", "earth", "foundation_establishment", 2, stats(9000, 210, 140, 12), 1900, ["tech.active.stone_shell", "tech.active.thunder_palm", "tech.active.mirror_scale"],
             [ph("Sentinel", 1.0, ["tech.active.stone_shell", "tech.active.thunder_palm"]), ph("Mirror Form", 0.5, ["tech.active.mirror_scale", "tech.active.thunder_palm"], None, None, 20)],
             "guardian", "A stone sentinel that has guarded the Origin Secret Realm since before the sect.", "a towering stone golem carved with ancient runes, moss and gold cracks glowing, mirror-like plates on its arms", ["wood"], "special"),
        boss("tribulation_thunder_spirit", "Tribulation Thunder Spirit", "劫雷之灵", "tribulation", "metal", "core_formation", 1, stats(14000, 320, 150, 25), 3400, ["tech.active.heavenly_bolt", "tech.active.thunder_judgment"],
             [ph("Wave I", 1.0, ["tech.active.heavenly_bolt"]), ph("Wave II", 0.7, ["tech.active.heavenly_bolt"], [{"enemy": "enemy.thunder_wisp", "count": 2}]), ph("Wave III", 0.4, ["tech.active.thunder_judgment", "tech.active.heavenly_bolt"], None, {"atk_mult": 1.4, "spd_mult": 1.2}, None, {"tech": "tech.active.thunder_judgment", "turns_to_charge": 2})],
             "caster", "The will of heaven given a crackling violet form. Survive it to form your core.", "a colossal humanoid spirit of violet lightning with a crown of thunderclouds and eyes of white fire", ["earth"], "special"),
        boss("nine_headed_abyss_serpent", "Nine-Headed Abyss Serpent", "九首渊蛇", "mega", "water", "spirit_severing", 9, stats(569600, 49840, 23140, 26, crit=18, acc=98, eva=9, spp=35600, spe=180), 178000, ["tech.active.abyssal_torrent", "tech.active.frost_breath", "tech.active.venom_fang"],
             [ph("Rising Tide", 1.0, ["tech.active.frost_breath", "tech.active.venom_fang"]), ph("Nine Mouths", 0.66, ["tech.active.abyssal_torrent", "tech.active.venom_fang"], [{"enemy": "enemy.abyss_cultist", "count": 3}], None, 15), ph("Abyssal Fury", 0.33, ["tech.active.abyssal_torrent", "tech.active.frost_breath"], None, {"atk_mult": 1.6, "spd_mult": 1.3}, None, {"tech": "tech.active.abyssal_torrent", "turns_to_charge": 2})],
             "berserker", "Lord of the Abyss of the Nine Heavens. Only Dao Companions standing together have ever returned.", "a gigantic nine-headed black-blue sea serpent rising from dark water, each head crowned with coral and lightning", ["wood"], "special"),
        boss("tower_warden", "Warden of the Heaven-Piercing Tower", "通天塔守", "dungeon", "metal", "foundation_establishment", 5, stats(12000, 300, 160, 20), 3000, ["tech.active.swallow_return_sword", "tech.active.mirror_scale"],
             [ph("Vigil", 1.0, ["tech.active.swallow_return_sword"]), ph("Mirror Vigil", 0.5, ["tech.active.mirror_scale", "tech.active.swallow_return_sword"])],
             "defensive", "An armoured spirit bound to guard every tenth floor of the tower.", "a tall armoured spirit knight in silver-white plate with a mirrored visor and a floating sword, surrounded by rings of light", ["fire"], "special"),
    ]

def beasts():
    def B(key, name, cn, rarity, elem, species, desc, look, stages, food, cult):
        d = {"id": f"beast.{key}", **named(name, desc, cn), "rarity": rarity, "element": f"elem.{elem}", "species": species, "stages": stages, "food": food,
             "bond": {"max": 10, "milestones": [{"level": 3, "bonus": {"hp": 50}}, {"level": 6, "bonus": {"atk": 15}}, {"level": 10, "bonus": {"crit": 2, "spd": 2}}]},
             "cultivation_bonus": cult,
             "art": {"icon": icon(f"beasts/{key}_icon", f"the face of {look}, floating free with no circle, ring or badge behind it", rarity, ["refs/mockups/spirit_beasts.png"])}}
        for s in stages:
            d["art"][f"battle_{s['key']}"] = beast_stage(f"beasts/{key}_{s['key']}", look, s["key"], s["name"])
        return d
    st = lambda key, name, lvl, mats, stones, hp, atk, df, spd, act, pas: {"key": key, "name": name, "level_required": lvl, "evolve_materials": mats, "evolve_cost_stones": stones,
                                                                           "stats": {"hp": hp, "atk": atk, "def": df, "spd": spd}, "active": act, "passive": pas}
    return [
        B("yunyun", "YunYun", "云云", "uncommon", "water", "Cloud Fox", "A small cloud fox and the player's first companion. Curious, loyal, fond of spirit fruit.",
          "a small fluffy white cloud fox with pale blue ear tips, big teal eyes and a cloud-like tail", [
              st("hatchling", "Cloud Kit", 1, [], 0, 120, 10, 8, 6, "btech.yunyun.cloud_veil", "btech.yunyun.nimble_spirit"),
              st("juvenile", "Cloud Fox", 10, [q("mat.spirit_monkey_fur", 5), q("mat.spirit_grass", 10)], 500, 400, 30, 20, 10, "btech.yunyun.cloud_veil", "btech.yunyun.nimble_spirit"),
              st("adult", "Cloud Fox Guardian", 25, [q("mat.jade_bamboo_segment", 8), q("mat.cloud_silk_bolt", 2)], 3000, 1200, 80, 55, 16, "btech.yunyun.cloud_veil", "btech.yunyun.nimble_spirit"),
              st("sovereign", "Cloud Sovereign Fox", 45, [q("mat.bamboo_dragon_scale", 2), q("mat.rime_crystal", 5)], 15000, 4000, 220, 150, 24, "btech.yunyun.cloud_veil", "btech.yunyun.nimble_spirit"),
          ], ["bfood.spirit_fruit", "bfood.dried_fish"], 0.05),
        B("flame_fox", "Flame Fox", "焰狐", "rare", "fire", "Flame Fox", "A fox whose tail burns with fox-fire. Hatched from an egg found in the Origin Secret Realm.",
          "a sleek orange-red fox with a flaming tail, golden eyes and ember marks on its fur", [
              st("hatchling", "Ember Kit", 1, [], 0, 110, 14, 6, 8, "btech.flame_fox.fox_fire", "btech.flame_fox.ember_heart"),
              st("juvenile", "Flame Fox", 12, [q("mat.flame_lotus", 1), q("mat.green_viper_venom", 4)], 800, 380, 42, 16, 13, "btech.flame_fox.fox_fire", "btech.flame_fox.ember_heart"),
              st("adult", "Blaze Fox", 28, [q("mat.bamboo_dragon_scale", 1), q("mat.glacier_iron_ore", 6)], 4000, 1150, 110, 45, 20, "btech.flame_fox.fox_fire", "btech.flame_fox.ember_heart"),
          ], ["bfood.dried_fish", "bfood.spirit_fruit"], 0.04),
    ]

def npcs():
    def N(key, name, cn, role, title, loc, personality, backstory, els, realm, cp, look, exprs, extra=None, refs=None):
        d = {"id": f"npc.{key}", **named(name, backstory[:160] + ("…" if len(backstory) > 160 else ""), cn), "role": role, **({"title": title} if title else {}),
             **({"location": loc} if loc else {}), "personality": personality, "backstory": backstory, "elements": [f"elem.{e}" for e in els],
             **({"realm": realm} if realm else {}), **({"cp": cp} if cp else {}), "expressions": exprs,
             "art": {"portrait": portrait(f"npcs/{key}/portrait", look, refs), "full_body": full_body(f"npcs/{key}/full_body", look, refs)}}
        for e in exprs:
            d["art"][f"expression_{e}"] = expression(f"npcs/{key}/expression_{e}", look, e.replace("_", " "), refs)
        d.update(extra or {})
        return d
    LIN = "Lin Xueyao, a young woman with long black hair in a loose half updo with a jade hairpin, light green eyes, calm gentle face, wearing a white hanfu with pale jade-green layered robes, translucent flowing sleeves and a pink sash, a long sword at her side"
    BAI = "Bai Lingshuang, a tall elegant young woman with long silver-white hair in a high ponytail, cool blue eyes, pale skin, wearing white and ice-blue layered robes with silver frost embroidery, holding a slender crystal-blue sword"
    TANG = "Tang Xiaoman, a cheerful young merchant girl with short wavy chestnut hair, large amber eyes, a wide grin, wearing a cream and red merchant hanfu with a coin-patterned sash, a bronze abacus and coin pouches at her belt"
    WEN = "Elder Wen, a kind elderly woman with silver hair in a bun, gentle wrinkles, warm brown eyes, wearing pale blue and white elder robes with a cloud-embroidered shawl, holding a wooden staff"
    FENG = "Elder Feng, a stern middle-aged man with a long black beard streaked grey, sharp eyes, wearing dark navy scholar robes with gold trim, holding a scroll"
    QIN = "Qin, a calm androgynous young cultivator with long dark green hair tied low, half-lidded grey eyes, wearing earthy green robes with leaf patterns, a small fox resting on their shoulder"
    GU = "Master Gu, a broad bald blacksmith with a grey goatee, burn-scarred forearms, leather apron over brown robes, a glowing hammer at his belt"
    duel = lambda loadout, strat: {"enabled": True, "loadout": loadout, "strategy": strat, "win": {"affinity": [], "mastery_xp": 40}, "lose": {"mastery_xp": 15}, "cooldown_min": 60}
    return [
        N("lin_xueyao", "Lin Xueyao", "林雪瑶", "protagonist", None, None, "Kind, persistent, graceful, quietly determined.",
          "A village girl with a faint mortal root who climbed the Thousand Steps anyway. She enters the Azure Cloud Sect as an Outer Disciple and sets her eyes on the path to immortality.",
          ["wood", "water"], {"id": "realm.qi_condensation", "stage": 1}, 120, LIN, ["neutral", "smile", "determined", "surprised", "sad"],
          {"art_extra": None, "dao_companion": {"eligible": False}}, ["refs/mockups/character_screen.png", "refs/mockups/cultivation_screen.png"]),
        N("bai_lingshuang", "Bai Lingshuang", "白凌霜", "senior", "Senior Sister · Frost Sword Instructor", "sectloc.sword_grounds", "Disciplined, elegant, reserved, highly talented. Softens slowly.",
          "An Inner Disciple who teaches the Frost Sword at the Sword Grounds. She took Lin Xueyao under her wing on the day of the trial, though she would never say why.",
          ["water", "metal"], {"id": "realm.foundation_establishment", "stage": 4}, 1700, BAI, ["neutral", "stern", "faint_smile", "surprised"],
          {"gifts": {"loved": [{"id": "gift.frost_plum_wine", "affinity": 40}], "liked": [{"id": "gift.sword_polish_cloth", "affinity": 15}, {"id": "gift.osmanthus_cake", "affinity": 12}, {"id": "cons.spirit_tea", "affinity": 8}],
                     "disliked": [{"id": "gift.counterfeit_coin", "affinity": -20}], "loved_tags": ["frost"], "liked_tags": ["sword_care", "refined"], "repeat_decay": 0.5, "daily_limit": 3},
           "topics": [{"id": "frost_sword", "title": "The Frost Sword", "summary": "Why she chose the sword of ice.", "unlock": {}, "answer": "Ice does not hesitate. Neither should a blade."},
                      {"id": "the_trial", "title": "The day of the trial", "summary": "Why she noticed you.", "unlock": {"affinity": 300}, "answer": "You gave the water to the fox first. Most do not even see the fox."},
                      {"id": "frozen_lotus_valley", "title": "Frozen Lotus Valley", "summary": "The valley where she trained.", "unlock": {"affinity": 600}, "answer": "There is a lotus there that blooms once a decade. I was born the year it last bloomed."}],
           "quests": ["quest.main.senior_sister", "quest.main.first_breath", "quest.main.first_hunt", "quest.main.bandit_chief", "quest.main.into_the_bamboo", "quest.main.bamboo_sovereign", "quest.npc.frost_sword_lesson"],
           "duel": duel(["tech.active.frost_blossom_slash", "tech.active.azure_strike", "tech.active.frozen_lotus", "tech.passive.sword_mastery"], "aggressive"),
           "dao_companion": {"eligible": True, "role": "dps", "stats": stats(5200, 420, 180, 22, crit=18, spp=300), "techniques": ["tech.active.frost_blossom_slash", "tech.active.frozen_lotus", "tech.active.swallow_return_sword"]}},
          ["refs/mockups/prologue_bai.png"]),
        N("tang_xiaoman", "Tang Xiaoman", "唐小蛮", "merchant", "Travelling Merchant", "sectloc.merchant_pavilion", "Cheerful, lively, clever, obsessed with profitable transactions.",
          "Runs the Merchant Pavilion and a caravan that travels the Azure Bamboo Forest. She has a metal root and a sharper tongue. She needs money for a reason she always laughs off.",
          ["metal", "earth"], {"id": "realm.qi_condensation", "stage": 6}, 420, TANG, ["neutral", "grin", "wink", "pout", "shocked"],
          {"gifts": {"loved": [{"id": "gift.ancient_spirit_coin", "affinity": 40}], "liked": [{"id": "gift.rare_treasure_map", "affinity": 15}, {"id": "gift.spirit_stone_pouch", "affinity": 15}, {"id": "gift.fine_ledger_book", "affinity": 15}, {"id": "gift.candied_hawthorn", "affinity": 15}, {"id": "gift.osmanthus_cake", "affinity": 10}],
                     "disliked": [{"id": "gift.counterfeit_coin", "affinity": -20}, {"id": "gift.bitter_medicine", "affinity": -20}, {"id": "junk.cheap_junk_loot", "affinity": -20}], "loved_tags": ["antique"], "liked_tags": ["coin", "ledger", "map", "snack"], "repeat_decay": 0.5, "daily_limit": 3},
           "topics": [{"id": "her_stall", "title": "Her stall", "summary": "What sells, what doesn't, and why.", "unlock": {}, "answer": "Pills sell. Hope sells better. I sell pills."},
                      {"id": "prices_caravans", "title": "Prices & caravans", "summary": "Why goods from Blazing Mountain cost more.", "unlock": {}, "answer": "Every caravan that crosses the Blazing Mountain loses a cart. You pay for the cart."},
                      {"id": "haggling", "title": "Haggling tips", "summary": "How to get a better price out of her.", "unlock": {"affinity": 50}, "answer": "Raise your Sect Fame. I give discounts to people who can protect my caravans."},
                      {"id": "sect_rumours", "title": "Sect rumours", "summary": "Harmless gossip about everyone in the sect.", "unlock": {"affinity": 300}, "answer": "Senior Sister Bai polishes her sword at midnight. Every midnight. Make of that what you will."},
                      {"id": "mortal_plains", "title": "Life on the Mortal Plains", "summary": "Where she grew up.", "unlock": {"affinity": 300}, "answer": "Three sisters, one goat, no money. The goat was the smart one."},
                      {"id": "why_money", "title": "Why she needs so much money", "summary": "The question she always laughs off.", "unlock": {"affinity": 600, "quest": "quest.npc.tangs_ledger"}, "answer": "…My sisters are still on the plains. Foundation Pills are expensive. Don't tell anyone."},
                      {"id": "lucky_coin", "title": "Her lucky coin", "summary": "The first coin she ever stole—earned.", "unlock": {"affinity": 1000}, "answer": "I earned it. Mostly. Here—hold it. No, you can keep it."}],
           "quests": ["quest.mission.goods_for_the_caravan", "quest.npc.tangs_ledger"],
           "duel": duel(["tech.active.golden_coin_barrage", "tech.active.abacus_reckoning", "tech.ult.ten_thousand_gold_rain"], "trickster"),
           "shop": "shop.merchant_pavilion",
           "dao_companion": {"eligible": True, "role": "support", "stats": stats(4200, 300, 150, 20, spp=380), "techniques": ["tech.active.golden_coin_barrage", "tech.active.abacus_reckoning", "tech.ult.ten_thousand_gold_rain"]}},
          ["refs/mockups/tang_talk.png", "refs/mockups/merchant_pavilion.png"]),
        N("elder_wen", "Elder Wen", "温长老", "elder", "Gate Elder", "sectloc.your_quarters", "Wise, compassionate, patient; asks questions instead of giving answers.",
          "Keeper of the Entrance Gate for forty years. Every disciple remembers her trial; she remembers every answer.",
          ["earth", "wood"], {"id": "realm.core_formation", "stage": 7}, 9000, WEN, ["neutral", "warm_smile", "thoughtful"],
          {"quests": ["quest.main.the_path_begins"], "gifts": {"liked": [{"id": "cons.spirit_tea", "affinity": 10}, {"id": "gift.osmanthus_cake", "affinity": 10}], "liked_tags": ["refined"]}},
          ["refs/mockups/prologue_elder_wen.png"]),
        N("elder_feng", "Elder Feng Wanqiu", "冯万秋长老", "elder", "Keeper of the Scripture Pavilion", "sectloc.scripture_pavilion", "Authoritative, exacting, secretly proud of diligent students.",
          "Guards the sect's manuals and decides who is worthy to read them. Issues advancement challenges to promising disciples.",
          ["metal"], {"id": "realm.core_formation", "stage": 3}, 7000, FENG, ["neutral", "stern", "approving"],
          {"quests": ["quest.dungeon.green_labyrinth_trial"] + [f"quest.dungeon.{r['key']}_{r['dungeon'][0]}" for r in REGIONS], "gifts": {"liked": [{"id": "gift.fine_ledger_book", "affinity": 10}], "liked_tags": ["ledger", "antique"]}}),
        N("qin", "Qin", "秦", "beast_keeper", "Keeper of the Spirit Beast Garden", "sectloc.spirit_beast_garden", "Calm, mysterious, speaks more to beasts than people.",
          "Tends the Spirit Beast Garden. Nobody knows Qin's family name or realm; the beasts obey without a word.",
          ["wood", "earth"], {"id": "realm.foundation_establishment", "stage": 9}, 2600, QIN, ["neutral", "soft_smile"],
          {"quests": ["quest.npc.qins_first_companion", "quest.beast.evolve_yunyun"], "shop": "shop.beast_garden",
           "gifts": {"loved": [{"id": "gift.beast_bell", "affinity": 40}], "liked": [{"id": "bfood.spirit_fruit", "affinity": 8}, {"id": "bfood.dried_fish", "affinity": 8}], "loved_tags": ["beast"], "liked_tags": []}}),
        N("master_gu", "Master Gu", "顾师傅", "instructor", "Master Smith of the Spirit Forge", "sectloc.spirit_forge", "Gruff, practical, honest to a fault; respects anyone who brings good ore.",
          "Has run the Spirit Forge since before most elders were disciples. Refuses to forge anything he considers ugly.",
          ["fire", "metal"], {"id": "realm.foundation_establishment", "stage": 7}, 2400, GU, ["neutral", "grumble", "pleased"],
          {"quests": ["quest.mission.ore_for_the_armory", "quest.forge.first_enhancement"], "gifts": {"liked": [{"id": "mat.spirit_iron_ore", "affinity": 6}, {"id": "mat.glacier_iron_ore", "affinity": 12}], "liked_tags": ["practical"]}}),
        N("zhao_lie", "Zhao Lie", "赵烈", "opponent", "Blazing Fist · Outer Disciple", None, "Loud, hot-headed, generous in defeat.", "An outer disciple famous for a fire root and a louder voice. First round of every tournament.",
          ["fire"], {"id": "realm.foundation_establishment", "stage": 2}, 980, "Zhao Lie, a muscular young man with spiky red-brown hair and a headband, bare arms wrapped in bandages, orange and black martial robes, fists wreathed in flame",
          ["neutral", "fierce"], {"duel": duel(["tech.active.flame_palm", "tech.active.thunder_palm"], "berserker"), "art_extra": None}),
        N("shen_qingxue", "Shen Qingxue", "沈清雪", "opponent", "Frost Spear · Outer Disciple", None, "Quiet, precise, admires Bai Lingshuang.", "A spear user who studied the Frost Sword from afar and adapted it to the spear.",
          ["water"], {"id": "realm.foundation_establishment", "stage": 3}, 1010, "Shen Qingxue, a slender young woman with blue-black hair in twin loops, pale blue eyes, light blue and white robes, holding a long ice-crystal spear",
          ["neutral", "focused"], {"duel": duel(["tech.active.frozen_lotus", "tech.active.azure_strike", "tech.passive.spiritual_regeneration"], "caster")}),
        N("tie_shanhe", "Tie Shanhe", "铁山河", "opponent", "Iron Body Monk · Outer Disciple", None, "Serene, immovable, speaks in proverbs.", "A former temple monk whose Iron Body has never been broken in the Proving Arena.",
          ["earth"], {"id": "realm.foundation_establishment", "stage": 4}, 1560, "Tie Shanhe, a bald broad-shouldered monk with prayer beads, grey and saffron robes, stone-like skin glowing with earthy runes",
          ["neutral", "serene"], {"duel": duel(["tech.active.earth_guardian", "tech.active.iron_wall_stance", "tech.passive.iron_body"], "defensive")}),
        N("mo_lianjue", "Mo Lianjue", "墨连珏", "opponent", "Top Outer Disciple", None, "Cold, ambitious, condescending until proven wrong.", "The strongest outer disciple of his generation. Expects to become an Inner Disciple this year; you are in his way.",
          ["metal"], {"id": "realm.foundation_establishment", "stage": 6}, 1700, "Mo Lianjue, a handsome young man with long black hair tied with a silver ribbon, dark eyes, black and silver robes, a sleek black sword floating behind him",
          ["neutral", "disdain", "respect"], {"duel": duel(["tech.active.swallow_return_sword", "tech.active.azure_strike", "tech.passive.critical_insight", "tech.passive.sword_mastery"], "aggressive")}),
    ]

# Small talk by minimum affinity level (0 Stranger … 4 Dao Companion). The engine picks the best unlocked line
# the player has not heard today, so dialogue changes as the relationship grows.
CHAT = {
    "bai_lingshuang": [
        (0, "Your stance is too wide. Again."), (0, "If you came to talk, you can talk while you practise."),
        (1, "You held the form a breath longer today. Do not let it go to your head."),
        (2, "I brewed too much tea. …Sit, if you like."), (2, "Most disciples stop coming after the first month. You did not."),
        (3, "When you break through, tell me first. I would rather not hear it from Tang."),
        (4, "The frost in my sword is quieter when you are near. I do not know what that means yet."),
    ],
    "tang_xiaoman": [
        (0, "Browsing is free! Breathing near the pills is one stone."), (0, "New stock from the caravan — buy before the inner disciples hear."),
        (1, "Oh, it's you! My favourite customer. Top three, at least."),
        (2, "I saved you the good batch. Don't tell the others, they'll want discounts too."),
        (3, "Sometimes I count the coins twice just so I have an excuse to stay up. …Forget I said that."),
        (4, "You know what's worth more than a lucky coin? Nothing. Except, maybe, you. Don't make me say it twice."),
    ],
    "elder_wen": [
        (0, "Have you eaten? Cultivation on an empty stomach makes for a short road."),
        (1, "What did you learn this week that you did not expect to learn?"),
        (2, "Every disciple remembers their trial. You remember the fox. That is why you are here."),
        (3, "One day you will stand at a gate and decide who may pass. Remember how it felt to be on the other side."),
    ],
    "elder_feng": [
        (0, "The Pavilion is for study, not conversation. Be brief."),
        (1, "You returned the last manual on time. Few do."),
        (2, "Your notes in the margins of the Qi Gathering Art were… not wrong."),
        (3, "I have watched three generations climb. Yours may yet be the one I write about."),
    ],
    "qin": [
        (0, "…The beasts noticed you before I did."), (1, "Yunyun likes you. That is rare. Do not make her regret it."),
        (2, "Sit. Be still. Let them come to you. That is all the secret there is."),
        (3, "People ask my family name. The beasts never do. Perhaps that is why I prefer them."),
    ],
    "master_gu": [
        (0, "Bring ore or bring nothing. Talk does not temper steel."), (1, "Hmph. Your last piece held its edge. Decent work keeping it oiled."),
        (2, "Most disciples want shiny. You want sound. Good."),
        (3, "I forged my first blade for a girl who never came back from the Tomb. Every blade since has been for her."),
    ],
}

def finalize_npcs(lst):
    for n in lst:
        key = n["id"].split(".")[1]
        if key in CHAT: n["chat"] = [{"min_level": lv, "text": t} for lv, t in CHAT[key]]
        n.pop("art_extra", None)
        if n["role"] == "protagonist" or n.get("duel") or n.get("dao_companion", {}).get("eligible"):
            # the protagonist and Dao companions fight on the player's side (facing right); duel-only opponents face the player
            ally = n["role"] == "protagonist" or n.get("dao_companion", {}).get("eligible")
            n["art"]["battle"] = battle(f"npcs/{n['id'].split('.')[1]}/battle", f"{n['name']} in combat stance, same design as the reference, sword drawn", refs=n["art"]["full_body"]["references"], facing="right" if ally else "front")
        if n["id"] == "npc.lin_xueyao":
            # the ultimate's full-screen close-up on the arena stage (docs/BATTLE_STAGE.md: the test fight)
            n["art"]["cutin"] = art("assets/npcs/lin_xueyao/cutin.png", f"{STYLE}. Dramatic anime action cut-in illustration, upper body and face filling the frame from a low dynamic angle: "
                                    "Lin Xueyao, a young woman with long black hair in a loose half updo with a jade hairpin, light green eyes, wearing a white hanfu with pale jade-green layered robes and translucent flowing sleeves, "
                                    "raising her long sword diagonally before her face with both hands, the blade glowing white-blue, intense focused determined eyes glowing faint jade, "
                                    "hair and sleeves whipping sideways in a strong wind, swirling sword light, wind streaks and a few cherry blossom petals around her, "
                                    "strong rim light, high contrast, cinematic, the complete head, both hands and the sword in frame, isolated on a plain background, no text.",
                                    (1024, 1280), True, ["assets/npcs/lin_xueyao/full_body.webp", "assets/npcs/lin_xueyao/battle.webp"])
        elif "battle" in n["art"]:
            # every other fighter's ultimate close-up: the same framing as Lin's, drawn from their own references
            look = re.search(r"illustration of (.*?), complete figure", n["art"]["full_body"]["prompt"])
            who = look.group(1) if look else n["name"]
            key = n["id"].split(".")[1]
            n["art"]["cutin"] = cutin_art(key, who)
    return lst

if __name__ == "__main__":
    e = enemies()
    for region in ["mortal_plains", "azure_bamboo_forest", "special"]:
        write(f"content/enemies/{region}.enemies.json", [x for x in e if x["art"]["icon"]["file"].split("/")[2] == region])
    write("content/enemies/world.bosses.json", bosses())
    write("content/beasts/beasts.json", beasts())
    write("content/npcs/npcs.json", finalize_npcs(npcs()))
