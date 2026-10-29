"""
Generate regions 3–15 and the endgame (mega dungeons, tribulations, tournaments, cultivation quests)
from region_data.REGIONS. Writes *_regions.json files next to the hand-seeded ones.
Run: python3 tools/gen/regions.py   (from repo root or anywhere)
"""
from common import *
from region_data import REGIONS

REALMS = ["qi_condensation", "foundation_establishment", "core_formation", "nascent_soul", "soul_transformation", "spirit_severing",
          "dao_integration", "tribulation_transcendence", "mahayana", "immortal_ascension", "earth_immortal", "heavenly_immortal",
          "golden_immortal", "immortal_king", "immortal_emperor"]
REALM_BASE_QI = [120, 4_000, 60_000, 900_000, 1.2e7, 1.5e8, 1.8e9, 2.0e10, 2.2e11, 2.4e12, 2.6e13, 2.8e14, 3.0e15, 3.2e16, 3.4e17]
FAME = [0, 0, 600, 1000, 1500, 2500, 4000, 6000, 9000, 12000, 16000, 20000, 26000, 34000, 45000]
R = RARITY_ORDER

def band(n):
    lo = 8 * (n - 1) + 1
    return lo, lo + 11

def cp_base(n): return round(130 * 2.05 ** (n - 1))

def stats_for(cp, n, crit_bonus=0, eva_bonus=0):
    return {"hp": round(cp * 3.2), "atk": round(cp * 0.28), "def": round(cp * 0.13), "spd": 10 + 2 * n, "crit": 5 + n + crit_bonus, "crit_dmg": 150 + 5 * n,
            "acc": 90 + n, "eva": 5 + n // 2 + eva_bonus, "sp_power": round(cp * 0.2), "sp_energy": 100 + 10 * n}

def rrange(n):
    if n <= 4: return ("uncommon", "legendary")
    if n <= 7: return ("rare", "mythic")
    if n <= 10: return ("epic", "immortal")
    return ("legendary", "immortal")

def weights(n, offsets_weights):
    lo, hi = rrange(n)
    li, hi_i = R.index(lo), R.index(hi)
    w = {}
    for off, wt in offsets_weights:
        i = li + off
        if i <= hi_i: w[R[i]] = wt
    return w

def realm_id(k): return f"realm.{k}"
def q2(i, n): return {"id": i, "qty": n}
eff = lambda kind, desc, **kw: {"kind": kind, "description": desc, **kw}

ELEM_ACTIVE = {"fire": ("Flame Burst", "status.burning"), "water": ("Tidal Pulse", "status.slow"), "wood": ("Thorn Lash", "status.poison"),
               "metal": ("Steel Talon", "status.bleeding"), "earth": ("Stone Rampart", "status.shield")}

out = {k: [] for k in ["materials", "consumables", "eggs", "books", "enemies", "bosses", "loot", "regions", "events", "dungeons", "tribulations",
                       "gear", "sets", "beasts", "btech", "npcs", "techs_active", "techs_passive", "methods", "alchemy", "forge", "quests",
                       "achievements", "story", "nodes"]}
pavilion = []   # extra stock entries for shop.scripture_pavilion

NODE_TEMPLATE = [
    # idx, slot-name, kind, position
    (0, "entry", "battle", (0.5, 0.93)), (1, "gathering", "gather", (0.22, 0.82)), (2, "outskirts", "battle", (0.78, 0.82)),
    (3, "west_path", "battle", (0.18, 0.66)), (4, "cache", "chest", (0.5, 0.72)), (5, "east_path", "battle", (0.82, 0.66)),
    (6, "lair", "elite", (0.14, 0.5)), (7, "crossroads", "event", (0.46, 0.53)), (8, "ridge", "battle", (0.76, 0.5)),
    (9, "deep_path", "battle", (0.3, 0.36)), (10, "sanctum", "cultivation", (0.66, 0.36)), (11, "den", "elite", (0.2, 0.2)),
    (12, "hidden_grove", "hidden", (0.84, 0.22)), (13, "approach", "battle", (0.55, 0.24)), (14, "throne", "boss", (0.5, 0.07)),
]
NODE_EDGES = [(0, 1), (0, 2), (1, 3), (1, 4), (2, 4), (2, 5), (3, 6), (4, 7), (5, 8), (6, 9), (7, 9), (7, 10), (8, 10), (9, 11), (10, 12), (10, 13), (12, 13), (11, 14), (13, 14)]
NODE_NAMES = {"entry": "Border", "gathering": "Gathering Grounds", "outskirts": "Outskirts", "west_path": "Western Trail", "cache": "Hidden Cache",
              "east_path": "Eastern Trail", "lair": "Lair", "crossroads": "Crossroads", "ridge": "Ridge", "deep_path": "Deep Path", "sanctum": "Sanctum",
              "den": "Den", "hidden_grove": "Secret Place", "approach": "Approach", "throne": "Throne"}


def region(rd, prev):
    n = rd["order"]; key = rd["key"]; rmin, rmax = rd["realms"]
    blo, bhi = band(n); cb = cp_base(n)
    lo_r, hi_r = rrange(n)
    herb, ore, mon, cry = [m[0] for m in rd["mats"]]
    M = lambda k: f"mat.{k}"

    # ---------- materials ----------
    subs = ["herb", "ore", "monster", "crystal"]
    tier = min(8, 2 + n // 2)
    rar = ["rare", "rare", "epic", "epic"] if n <= 6 else (["epic", "epic", "legendary", "legendary"] if n <= 10 else ["legendary", "legendary", "mythic", "mythic"])
    for (k, name, cn, look), sub, rr in zip(rd["mats"], subs, rar):
        out["materials"].append({"id": M(k), **named(name, f"{look[0].upper()}{look[1:]}. Found in the {rd['name']}.", cn), "rarity": rr,
                                 "sell_value": int(8 * n * n * (1 + subs.index(sub))), "stack_limit": 999, "tags": [key], "subtype": sub, "tier": tier,
                                 "art": {"icon": icon(f"items/materials/{k}", look, rr)}})

    # ---------- techniques ----------
    tk, tname, tcn, telem, trar, tdesc, tpow, tsp, tcd, tstat, tch = rd["tech"]
    tech = {"id": f"tech.active.{tk}", **named(tname, tdesc, tcn), "kind": "active", "rarity": trar, "element": f"elem.{telem}", "weapon_affinity": "any",
            "targeting": "self" if tpow == 0 else ("all_enemies" if "all" in tdesc.lower() else "single"), "power": tpow, "hits": 1, "sp_cost": tsp, "cooldown": tcd,
            "applies": [{"status": f"status.{tstat}", "chance": tch, "turns": 2}], "passive_bonuses": {}, "requirements": {"realm": {"id": realm_id(rmin)}},
            "mastery": {"max_level": 10, "xp_per_level": 60 + 20 * n, "per_level_bonus": 0.03}, "enemy_only": False,
            "art": {"icon": icon(f"techniques/active/{tk}", f"a square technique icon for '{tname}' ({telem} element): {tdesc}", trar, ["refs/mockups/battle_screen.png"])}}
    if tpow == 0: tech["heal_pct"] = 35
    out["techs_active"].append(tech)
    ek, ename, ecn, eelem, edesc, epow, estat, ech = rd["etech"]
    out["techs_active"].append({"id": f"tech.active.{ek}", **named(ename, edesc, ecn), "kind": "active", "rarity": "rare", "element": f"elem.{eelem}", "weapon_affinity": "any",
                                "targeting": "single", "power": epow, "hits": 1, "sp_cost": 10, "cooldown": 2, "applies": [{"status": f"status.{estat}", "chance": ech, "turns": 2}],
                                "passive_bonuses": {}, "requirements": {}, "mastery": {"max_level": 10, "xp_per_level": 60, "per_level_bonus": 0.03}, "enemy_only": True,
                                "art": {"icon": icon(f"techniques/active/{ek}", f"a square technique icon for the enemy art '{ename}': {edesc}", "rare", ["refs/mockups/battle_screen.png"])}})
    pk, pname, pcn, pelem, prar, pdesc, pbon = rd["passive"]
    out["techs_passive"].append({"id": f"tech.passive.{pk}", **named(pname, pdesc, pcn), "kind": "passive", "rarity": prar, "element": f"elem.{pelem}", "weapon_affinity": "any",
                                 "targeting": "self", "power": 0, "hits": 1, "sp_cost": 0, "cooldown": 0, "applies": [], "passive_bonuses": pbon,
                                 "requirements": {"realm": {"id": realm_id(rmin)}}, "mastery": {"max_level": 10, "xp_per_level": 80, "per_level_bonus": 0.03}, "enemy_only": False,
                                 "art": {"icon": icon(f"techniques/passive/{pk}", f"a square passive-technique icon for '{pname}': {pdesc}", prar, ["refs/mockups/battle_screen.png"])}})
    pavilion.append({"id": f"tech.passive.{pk}", "price": 300 * n * n, "currency": "spirit_stones", "unlock": {"sect_fame": FAME[n - 1]}})
    mk, mname, mcn, melem, mrar, mgrade, mmult, mbon, mdesc = rd["method"]
    out["methods"].append({"id": f"method.{mk}", **named(mname, mdesc, mcn), "rarity": mrar, "grade": mgrade, "element": f"elem.{melem}", "qi_mult": mmult, "bonuses": mbon,
                           "requirements": {"realm": {"id": realm_id(rmin)}}, "mastery": {"max_level": 10, "xp_per_level": 100 + 30 * n, "per_level_bonus": 0.04},
                           "art": {"icon": icon(f"techniques/methods/{mk}", f"a cultivation-method scroll emblem for '{mname}': {mdesc}", mrar, ["refs/mockups/cultivation_screen.png"])}})
    out["books"].append({"id": f"book.{mk}", **named(mname, f"The scripture of the {mname}.", mcn), "rarity": mrar, "sell_value": 200 * n, "stack_limit": 5, "tags": [key],
                         "teaches": f"method.{mk}", "art": {"icon": icon(f"items/books/{mk}", f"an ornate cultivation manual titled {mname}, {melem} themed cover", mrar)}})

    # ---------- enemies ----------
    ens = rd["enemies"]
    roles = ["normal", "normal", "normal", "elite", "special"]
    generic = {"beast": "tech.active.savage_bite", "human": "tech.active.bandit_slash", "demonic": "tech.active.bandit_slash"}
    eids = []
    for i, ((k, name, cn, kind, el, look, desc), role) in enumerate(zip(ens, roles)):
        mult = {"normal": 1 + 0.15 * i, "elite": 1.9, "special": 1.5}[role]
        cp = round(cb * mult)
        stage = {"normal": 2 + i, "elite": 6, "special": 5}[role]
        techs = [f"tech.active.{ek}", generic.get(kind, "tech.active.stone_shell")]
        if role == "elite": techs = [f"tech.active.{ek}", f"tech.active.{tk}"]
        eid = f"enemy.{k}"; eids.append(eid)
        out["enemies"].append({"id": eid, **named(name, desc, cn), "kind": kind, "element": f"elem.{el}", "realm": {"id": realm_id(rmin), "stage": stage},
                               "stats": stats_for(cp, n, 5 if role == "elite" else 0), "cp": cp, "techniques": techs,
                               "ai": {"strategy": {"normal": "aggressive", "elite": "berserker", "special": "trickster"}[role], "rules": []}, "resistances": {}, "loot": f"loot.enemy.{k}", "mastery_xp": 10 + cp // 50,
                               "art": {"icon": icon(f"enemies/{key}/{k}_icon", f"the head and shoulders of {look}", None, ["refs/mockups/battle_screen.png"]),
                                       "battle": battle(f"enemies/{key}/{k}_battle", look, refs=["refs/mockups/battle_screen.png"])}})
        P = lambda c, offs: {"gear": {"pool": {"tags": [key]}}, "rarity_weights": weights(n, offs), "chance": c}
        if role == "normal":
            ents = [{"id": M(mon), "chance": 0.45, "qty": [1, 2]}, {"id": M(herb), "chance": 0.15, "qty": [1, 1]}, P(0.05, [(0, 85), (1, 15)])]
            stones = (5 * n * n, 9 * n * n)
        elif role == "elite":
            ents = [{"id": M(cry), "chance": 0.4, "qty": [1, 1]}, {"id": M(mon), "chance": 0.7, "qty": [2, 3]}, {"id": "mat.spirit_enhancing_stone", "chance": 0.3, "qty": [1, 2]}, P(0.15, [(0, 50), (1, 40), (2, 10)])]
            stones = (15 * n * n, 25 * n * n)
        else:
            ents = [{"id": M(ore), "chance": 0.35, "qty": [1, 2]}, {"id": M(mon), "chance": 0.3, "qty": [1, 1]}, {"id": "mat.reforging_sand", "chance": 0.15, "qty": [1, 1]}, P(0.07, [(0, 80), (1, 20)])]
            stones = (10 * n * n, 18 * n * n)
        out["loot"].append({"id": f"loot.enemy.{k}", "mode": "independent", "rolls": 1, "ilvl": [blo, bhi], "entries": ents, "guaranteed": [], "spirit_stones": list(stones), "sect_fame": 0, "mastery_xp": 0})

    # ---------- region boss ----------
    bk, bname, bcn, bel, blook, bdesc, bweak = rd["boss"]
    bcp = round(cb * 4.2)
    boss_id = f"boss.{bk}"
    phases = [{"name": "Awakening", "hp_threshold": 1.0, "techniques": [f"tech.active.{ek}"], "summons": []},
              {"name": "Wrath", "hp_threshold": 0.6, "techniques": [f"tech.active.{ek}", f"tech.active.{tk}"], "summons": [{"enemy": eids[0], "count": 2}]},
              {"name": "Last Stand", "hp_threshold": 0.25, "techniques": [f"tech.active.{tk}"], "summons": [], "enrage": {"atk_mult": 1.5, "spd_mult": 1.25},
               "charged_attack": {"tech": f"tech.active.{ek}", "turns_to_charge": 2}}]
    out["bosses"].append(boss_entry(bk, bname, bcn, "region", bel, rmax, 9, bcp, n, [f"tech.active.{ek}", f"tech.active.{tk}"], phases, bdesc, blook, bweak, key))
    out["loot"].append({"id": f"loot.boss.{bk}", "mode": "independent", "rolls": 1, "ilvl": [bhi - 3, bhi + 2],
                        "entries": [{"id": M(cry), "chance": 0.8, "qty": [2, 3]}, {"id": f"book.{mk}", "chance": 0.3, "qty": [1, 1]}, {"id": "mat.dao_insight_crystal", "chance": 0.1 + 0.02 * n, "qty": [1, 1]},
                                    {"id": "mat.refining_stone", "chance": 0.6, "qty": [1, 3]}, {"id": "mat.awakening_crystal", "chance": 0.05 + 0.01 * n, "qty": [1, 1]},
                                    {"gear": {"pool": {"tags": [key]}}, "rarity_weights": weights(n, [(1, 55), (2, 35), (3, 10)]), "chance": 0.7}],
                        "guaranteed": [q2(M(mon), 3)], "spirit_stones": [60 * n * n, 100 * n * n], "sect_fame": 20 * n, "mastery_xp": 40 * n})

    # ---------- gear + set ----------
    gids = []
    for gk, gname, gcn, slot, typ, look, sig in rd["gear"]:
        lo, hi = R.index(lo_r), R.index(hi_r)
        d = {"id": f"gear.{gk}", **named(gname, f"{gname}, crafted from the materials of the {rd['name']}.", gcn), "slot": slot, "main_value": {"weapon": 10, "armor": 60, "helmet": 30, "boots": 8, "necklace": 20, "ring": 6, "artifact": 25}[slot],
             "rarity_range": [lo_r, hi_r], "droppable": True, "drop_tags": [key], "unique": False, "special_effects": [], "requirements": {"realm": realm_id(rmin)},
             "rarities": {r: {"art": {"icon": icon(f"equipment/{slot}/{gk}_{r}", look, r, ["refs/mockups/inventory_icons.png", "refs/mockups/rarity_frames.png"])}} for r in R[lo:hi + 1]},
             "element": f"elem.{rd['elem']}"}
        if sig: d["signature_affix"] = sig
        if slot == "weapon": d["weapon_type"] = typ
        if slot == "armor": d["armor_type"] = typ
        if rd["set"]: d["set"] = f"set.{rd['set'][0]}"
        out["gear"].append(d); gids.append(d["id"])
    if rd["set"]:
        sk, sname, scn, sdesc, b2, (ekind, estatus, echance, edesc) = rd["set"]
        e3 = {"kind": ekind, "description": edesc, **({"status": estatus} if estatus else {}), **({"chance": echance} if echance else {}), **({"value": 1} if ekind in ("cooldown_reduction",) else {}),
              **({"value": 12} if ekind == "shield_on_battle_start" else {}), **({"value": 4} if ekind == "heal_on_turn" else {})}
        out["sets"].append({"id": f"set.{sk}", **named(sname, sdesc, scn), "pieces": gids, "bonuses": [{"pieces": 2, "stats": b2}, {"pieces": 3, "stats": {"hp": 200 * n}, "effect": e3}],
                            "source_hint": f"Drops throughout the {rd['name']}; the weapon can also be forged."})

    # ---------- beasts ----------
    beast_eggs = []
    all_beasts = list(rd["beasts"]) + ([rd["secret_realm"][5]] if rd.get("secret_realm") else [])
    for bi, (bk2, bn, bcn2, brar, bel2, species, look, desc) in enumerate(all_beasts):
        aname, astat = ELEM_ACTIVE[bel2]
        act, pas = f"btech.{bk2}.{aname.lower().replace(' ', '_')}", f"btech.{bk2}.{bel2}_affinity"
        ri = R.index(brar)
        out["btech"].append({"id": act, "beast": f"beast.{bk2}", **named(f"{bn}'s {aname}", f"{bn} unleashes a {aname.lower()}.", None), "kind": "active", "element": f"elem.{bel2}",
                             "power": 0 if astat == "status.shield" else 80 + 15 * ri, "applies": [{"status": astat, "chance": 0.5 if astat != "status.shield" else 1, "turns": 2}],
                             "passive_bonuses": {}, "cooldown": 3, "art": {"icon": icon(f"techniques/beast/{bk2}_active", f"a spirit-beast ability icon: {bn} using {aname}", brar, ["refs/mockups/spirit_beasts.png"])}})
        out["btech"].append({"id": pas, "beast": f"beast.{bk2}", **named(f"{bel2.capitalize()} Affinity", f"{bel2.capitalize()} damage +{6 + 2 * ri}%.", None), "kind": "passive", "element": f"elem.{bel2}",
                             "power": 0, "applies": [], "passive_bonuses": {f"elem_dmg.{bel2}": 6 + 2 * ri}, "cooldown": 3,
                             "art": {"icon": icon(f"techniques/beast/{bk2}_passive", f"a spirit-beast passive icon of {bn}'s {bel2} affinity", brar, ["refs/mockups/spirit_beasts.png"])}})
        keys = ["hatchling", "juvenile", "adult"] + (["sovereign"] if ri >= 3 else [])
        stage_names = {"hatchling": f"{bn} Hatchling", "juvenile": bn, "adult": f"Elder {bn}", "sovereign": f"Sovereign {bn}"}
        mats = {"hatchling": [], "juvenile": [q2(M(mon), 6), q2(M(herb), 10)], "adult": [q2(M(cry), 3), q2(M(ore), 8)], "sovereign": [q2(M(cry), 6), q2("mat.dao_insight_crystal", 1)]}
        lv = {"hatchling": 1, "juvenile": 10 + 2 * n, "adult": 25 + 3 * n, "sovereign": 45 + 3 * n}
        sm = {"hatchling": 1, "juvenile": 3, "adult": 8, "sovereign": 20}
        stages = [{"key": s, "name": stage_names[s], "level_required": lv[s], "evolve_materials": mats[s], "evolve_cost_stones": 0 if s == "hatchling" else 200 * n * sm[s],
                   "stats": {"hp": round(cb * 0.6 * sm[s]), "atk": round(cb * 0.06 * sm[s]), "def": round(cb * 0.04 * sm[s]), "spd": 8 + n + sm[s]}, "active": act, "passive": pas} for s in keys]
        b = {"id": f"beast.{bk2}", **named(bn, desc, bcn2), "rarity": brar, "element": f"elem.{bel2}", "species": species, "stages": stages,
             "food": ["bfood.spirit_fruit", "bfood.dried_fish"] if bel2 in ("water", "wood") else ["bfood.spirit_meat", "bfood.dried_fish"],
             "bond": {"max": 10, "milestones": [{"level": 3, "bonus": {"hp": 50 * n}}, {"level": 6, "bonus": {"atk": 8 * n}}, {"level": 10, "bonus": {"crit": 2, "spd": 2}}]},
             "cultivation_bonus": round(0.02 + 0.01 * ri, 2), "art": {"icon": icon(f"beasts/{bk2}_icon", f"the face of {look}", brar, ["refs/mockups/spirit_beasts.png"])}}
        for s in keys: b["art"][f"battle_{s}"] = beast_stage(f"beasts/{bk2}_{s}", look, s, stage_names[s])
        out["beasts"].append(b)
        egg = {"id": f"egg.{bk2}", **named(f"{bn} Egg", f"An egg that will hatch into a {bn}.", None), "rarity": brar, "sell_value": 100 * n * (ri + 1), "stack_limit": 5, "tags": [key],
               "hatches_into": f"beast.{bk2}", "hatch_wins": max(3, round(30 * (ri + 1) / 8)), "hatch_requirements": {"realm": realm_id(rmin)},
               "art": {"icon": icon(f"items/eggs/{bk2}", f"a spirit-beast egg of the {bn}: {bel2}-themed shell with markings hinting at {look}", brar)}}
        out["eggs"].append(egg)
        is_secret = rd.get("secret_realm") and bk2 == rd["secret_realm"][5][0]
        if not is_secret: beast_eggs.append(egg["id"])

    # ---------- chest, event, npc, story ----------
    out["loot"].append({"id": f"loot.chest.{key}", "mode": "independent", "rolls": 1, "ilvl": [blo + 2, bhi],
                        "entries": [{"id": e, "chance": 0.25, "qty": [1, 1]} for e in beast_eggs] + [{"gear": {"pool": {"tags": [key]}}, "rarity_weights": weights(n, [(0, 60), (1, 40)]), "chance": 1.0}],
                        "guaranteed": [q2(M(herb), 3), q2(M(ore), 2)], "spirit_stones": [20 * n * n, 35 * n * n], "sect_fame": 0, "mastery_xp": 0})
    evk, evname, evcn, evtext, evscene, ca, cb_ = rd["event"]
    out["events"].append({"id": f"event.{evk}", **named(evname, evtext, evcn), "text": evtext,
                          "choices": [{"text": ca, "outcomes": [{"chance": 0.5, "text": "Fortune favours you.", "rewards": {"items": [q2(M(cry), 1)], "spirit_stones": 30 * n * n}},
                                                                {"chance": 0.5, "text": "Something was waiting for you.", "battle": [eids[4]]}]},
                                      {"text": cb_, "outcomes": [{"chance": 1.0, "text": "You leave with a small reward and your wits intact.", "rewards": {"items": [q2(M(herb), 3)], "sect_fame": 5 * n}}]}],
                          "art": {"illustration": art(f"assets/events/{evk}.png", f"{STYLE}. Event illustration: {evscene}. Painterly, atmospheric, no text.", (1024, 768), False, ["refs/mockups/node_interactions.png"])}})
    nk, nname, ncn, nrole, nlook, npers, nback, nline = rd["npc"]
    entry = f"node.{key}.entry"
    npc_q = f"quest.npc.{nk}_request"
    out["npcs"].append({"id": f"npc.{nk}", **named(nname, nback, ncn), "role": nrole, "location": entry, "personality": npers, "backstory": nback, "elements": [f"elem.{rd['elem']}"],
                        "realm": {"id": realm_id(rmin), "stage": 5}, "affinity_levels": [{"name": "Stranger", "threshold": 0}, {"name": "Acquaintance", "threshold": 50}, {"name": "Friend", "threshold": 300},
                        {"name": "Confidant", "threshold": 600}, {"name": "Dao Companion", "threshold": 1000}], "gifts": {"loved": [], "liked": [], "disliked": [], "loved_tags": [], "liked_tags": ["refined"], "repeat_decay": 0.5, "daily_limit": 3},
                        "topics": [{"id": "home", "title": f"The {rd['name']}", "summary": f"What {nname.split()[-1]} knows of this land.", "unlock": {}, "answer": rd["desc"]}],
                        "quests": [npc_q], "dao_companion": {"eligible": False}, "expressions": [],
                        "art": {"portrait": portrait(f"npcs/{nk}/portrait", nlook), "full_body": full_body(f"npcs/{nk}/full_body", nlook)}})
    out["story"].append({"id": f"story.regions.{key}_arrival", **named(f"Arrival: {rd['name']}", rd["desc"], rd["cn"]), "chapter": "regions",
                         "trigger": {"on": "region_enter", "region": f"region.{key}"}, "lines": [{"speaker": "narration", "text": rd["desc"]}, {"speaker": f"npc.{nk}", "text": nline}],
                         "unlocks": [], "skippable": True, "art": {"cg": art(f"assets/story/regions_{key}_arrival.png", f"{STYLE}. Full-screen visual novel background illustration: {rd['scene']}. Cinematic, no characters in the foreground, no text.", (1080, 1920), False, ["refs/mockups/prologue.png"])}})

    # ---------- dungeon ----------
    dk, dname, dcn, dkind, dscene, (dbk, dbname, dbcn, dbel, dblook, dbweak) = rd["dungeon"]
    dbcp = round(cb * 3.2)
    out["bosses"].append(boss_entry(dbk, dbname, dbcn, "dungeon", dbel, rmax, 7, dbcp, n, [f"tech.active.{ek}", "tech.active.stone_shell"],
                                    [{"name": "Guardian", "hp_threshold": 1.0, "techniques": [f"tech.active.{ek}"], "summons": []},
                                     {"name": "Fury", "hp_threshold": 0.4, "techniques": [f"tech.active.{ek}", "tech.active.stone_shell"], "summons": [], "enrage": {"atk_mult": 1.35, "spd_mult": 1.15}}],
                                    f"The master of the {dname}.", dblook, dbweak, key))
    out["loot"].append({"id": f"loot.boss.{dbk}", "mode": "independent", "rolls": 1, "ilvl": [blo + 4, bhi + 2], "entries": [{"id": M(cry), "chance": 0.6, "qty": [1, 2]}, {"gear": {"pool": {"tags": [key]}}, "rarity_weights": weights(n, [(0, 30), (1, 50), (2, 20)]), "chance": 0.5}],
                        "guaranteed": [], "spirit_stones": [40 * n * n, 70 * n * n], "sect_fame": 10 * n, "mastery_xp": 30 * n})
    wave_loot, clear_loot = f"loot.dungeon.{dk}_wave", f"loot.dungeon.{dk}_clear"
    if dkind == "resource":
        out["loot"].append({"id": wave_loot, "mode": "independent", "rolls": 1, "entries": [{"id": M(ore), "chance": 0.6, "qty": [1, 3]}, {"id": "mat.spirit_enhancing_stone", "chance": 0.4, "qty": [1, 2]}], "guaranteed": [], "spirit_stones": [20 * n * n, 40 * n * n], "sect_fame": 0, "mastery_xp": 0})
        out["loot"].append({"id": clear_loot, "mode": "independent", "rolls": 1, "entries": [{"id": "mat.refining_stone", "chance": 0.6, "qty": [1, 2]}, {"id": "mat.reforging_sand", "chance": 0.6, "qty": [1, 3]}], "guaranteed": [q2(M(ore), 5), q2(M(herb), 5)], "spirit_stones": [150 * n * n, 250 * n * n], "sect_fame": 0, "mastery_xp": 0})
    else:
        out["loot"].append({"id": wave_loot, "mode": "independent", "rolls": 1, "entries": [{"id": M(mon), "chance": 0.6, "qty": [1, 2]}], "guaranteed": [], "spirit_stones": [20 * n * n, 40 * n * n], "sect_fame": 0, "mastery_xp": 0})
        out["loot"].append({"id": clear_loot, "mode": "independent", "rolls": 1, "ilvl": [blo + 4, bhi + 2], "entries": [{"id": M(cry), "chance": 0.7, "qty": [1, 2]}, {"gear": {"pool": {"tags": [key]}}, "rarity_weights": weights(n, [(1, 60), (2, 30), (3, 10)]), "chance": 0.6}],
                            "guaranteed": [], "spirit_stones": [150 * n * n, 250 * n * n], "sect_fame": 15 * n, "mastery_xp": 0})
    out["dungeons"].append({"id": f"dungeon.{dk}", **named(dname, f"A {dkind} dungeon of the {rd['name']}. Its master guards the final hall.", dcn), "kind": dkind,
                            "entry": {"realm": {"id": realm_id(rmin), "stage": 3}, "regions": [f"region.{key}"], "energy_cost": 10 + 2 * n, **({"daily_limit": 3} if dkind == "resource" else {}),
                                      "party": {"companions_allowed": False, "max_companions": 0}},
                            "rec_cp": round(cb * 2.5), "waves": [{"enemies": [eids[0], eids[1]]}, {"enemies": [eids[1], eids[2], eids[0]]}, {"enemies": [eids[3], eids[4]]}, {"enemies": [f"boss.{dbk}"]}],
                            "modifiers": [], "rewards": {"per_wave": wave_loot, "clear": clear_loot, "first_clear": {"spirit_stones": 300 * n * n, "sect_fame": 30 * n, "gear": [{"base": gids[1], "rarity": R[R.index(lo_r) + 1], "ilvl": bhi}]}},
                            "checkpoints": False, "persistent_hp": True,
                            "art": {"card": art(f"assets/dungeons/{dk}_card.png", f"{STYLE}. Dungeon card illustration: {dscene}. Wide painterly composition, no text.", (1024, 640), False, ["refs/mockups/dungeon_hub.png"]),
                                    "battle_bg": bg(f"dungeons/{dk}_battle_bg", f"battle backdrop inside {dscene}", refs=["refs/mockups/battle_screen.png"])}})

    # ---------- secret realm ----------
    sr = rd.get("secret_realm")
    if sr:
        sk2, sname, scn, sscene, (sbk, sbname, sbcn, sbel, sblook, sbweak), sbeast = sr
        sbcp = round(cb * 5)
        out["bosses"].append(boss_entry(sbk, sbname, sbcn, "secret_realm", sbel, rmax, 9, sbcp, n, [f"tech.active.{ek}", f"tech.active.{tk}"],
                                        [{"name": "Watcher", "hp_threshold": 1.0, "techniques": [f"tech.active.{ek}"], "summons": []},
                                         {"name": "Devourer", "hp_threshold": 0.5, "techniques": [f"tech.active.{ek}", f"tech.active.{tk}"], "summons": [{"enemy": eids[3], "count": 1}], "shield_pct": 15}],
                                        f"Guardian of the {sname}.", sblook, sbweak, key))
        out["loot"].append({"id": f"loot.boss.{sbk}", "mode": "independent", "rolls": 1, "ilvl": [bhi, bhi + 4], "entries": [{"id": M(cry), "chance": 1.0, "qty": [2, 4]}, {"id": "mat.awakening_crystal", "chance": 0.3, "qty": [1, 1]},
                            {"gear": {"pool": {"tags": [key]}}, "rarity_weights": weights(n, [(2, 60), (3, 40)]), "chance": 0.8}], "guaranteed": [], "spirit_stones": [100 * n * n, 160 * n * n], "sect_fame": 30 * n, "mastery_xp": 60 * n})
        out["loot"].append({"id": f"loot.chest.{sk2}_vault", "mode": "independent", "rolls": 1, "ilvl": [bhi, bhi + 4], "entries": [{"id": f"egg.{sbeast[0]}", "chance": 0.35, "qty": [1, 1]},
                            {"gear": {"pool": {"tags": [key]}}, "rarity_weights": weights(n, [(1, 70), (2, 30)]), "chance": 1.0}], "guaranteed": [q2(M(cry), 2), q2("mat.refining_stone", 2)], "spirit_stones": [80 * n * n, 120 * n * n], "sect_fame": 0, "mastery_xp": 0})
        out["loot"].append({"id": f"loot.dungeon.{sk2}_clear", "mode": "independent", "rolls": 1, "entries": [{"id": "mat.dao_insight_crystal", "chance": 0.5, "qty": [1, 2]}], "guaranteed": [q2(M(cry), 2)], "spirit_stones": [200 * n * n, 300 * n * n], "sect_fame": 40 * n, "mastery_xp": 0})
        out["dungeons"].append({"id": f"dungeon.{sk2}", **named(sname, f"A secret realm hidden in the {rd['name']}. Branching paths, a sealed vault and a guardian.", scn), "kind": "secret_realm",
                                "entry": {"realm": {"id": realm_id(rmin), "stage": 5}, "quests": [f"quest.main.{key}_sovereign"], "energy_cost": 25, "party": {"companions_allowed": False, "max_companions": 0}},
                                "rec_cp": round(cb * 4), "modifiers": [], "rewards": {"clear": f"loot.dungeon.{sk2}_clear", "first_clear": {"spirit_stones": 500 * n * n, "sect_fame": 60 * n}},
                                "checkpoints": False, "persistent_hp": True,
                                "realm_nodes": [
                                    {"key": "gate", "name": "Realm Gate", "kind": "battle", "position": [0.5, 0.92], "connections": ["left", "right"], "waves": [[eids[0], eids[1]]]},
                                    {"key": "left", "name": "Trial Path", "kind": "elite", "position": [0.25, 0.68], "connections": ["gate", "vault"], "waves": [[eids[3]]]},
                                    {"key": "right", "name": "Still Pool", "kind": "cultivation", "position": [0.75, 0.68], "connections": ["gate", "whisper"]},
                                    {"key": "vault", "name": "Sealed Vault", "kind": "chest", "position": [0.22, 0.4], "connections": ["left", "altar"], "chest": f"loot.chest.{sk2}_vault"},
                                    {"key": "whisper", "name": "Whispering Hollow", "kind": "event", "position": [0.78, 0.4], "connections": ["right", "altar"], "event": f"event.{evk}"},
                                    {"key": "altar", "name": "Guardian's Altar", "kind": "boss", "position": [0.5, 0.15], "connections": ["vault", "whisper", "exit"], "waves": [[f"boss.{sbk}"]]},
                                    {"key": "exit", "name": "Exit", "kind": "exit", "position": [0.5, 0.04], "connections": ["altar"]}],
                                "art": {"card": art(f"assets/dungeons/{sk2}_card.png", f"{STYLE}. Dungeon card illustration: {sscene}. Wide painterly composition, no text.", (1024, 640), False, ["refs/mockups/dungeon_hub.png"]),
                                        "battle_bg": bg(f"dungeons/{sk2}_battle_bg", f"battle backdrop inside {sscene}", refs=["refs/mockups/battle_screen.png"]),
                                        "map": art(f"assets/dungeons/{sk2}_map.png", f"{STYLE}. Top-down illustrated branching map of {sscene}, floating platforms connected by light paths, no text, no icons.", (1080, 1620), False, ["refs/mockups/secret_realm_map.png"])}})

    # ---------- nodes ----------
    nodes = {}
    for idx, slot, kind, pos in NODE_TEMPLATE:
        if idx == 10 and sr: kind = "secret_realm"
        nid = f"node.{key}.{slot}"
        rec = round(cb * {"battle": 1.0, "elite": 1.9, "boss": 4.2}.get(kind, 1.1) * (1 + idx * 0.04))
        d = {"id": nid, **named(f"{rd['name']} {NODE_NAMES[slot]}", f"{NODE_NAMES[slot]} of the {rd['name']}."), "region": f"region.{key}", "kind": kind, "position": list(pos),
             "connections": [], "rec_cp": rec, "first_clear": {}, "replayable": kind not in ("chest", "story"), "energy_cost": 5 + n // 2}
        if kind == "battle":
            combos = [[eids[0]], [eids[0], eids[1]], [eids[1], eids[2]], [eids[2], eids[0]], [eids[4]], [eids[1], eids[4]], [eids[2], eids[2]]]
            d["waves"] = [combos[idx % len(combos)], combos[(idx + 3) % len(combos)]]
            d["first_clear"] = {"spirit_stones": 15 * n * n}
        elif kind == "elite":
            d["waves"] = [[eids[3]]] if idx == 6 else [[eids[0], eids[1]], [eids[3]]]
            d["first_clear"] = {"spirit_stones": 40 * n * n, "items": [q2(M(cry), 1)]}
        elif kind == "boss":
            d["waves"] = [[eids[2], eids[3]], [boss_id]]
            d["first_clear"] = {"spirit_stones": 150 * n * n, "sect_fame": 40 * n}
        elif kind == "gather":
            d["gather"] = {"items": [q2(M(herb), 3), q2(M(ore), 2)], "energy_cost": 5, "cooldown_min": 45}
        elif kind == "chest":
            d["chest"] = f"loot.chest.{key}"
        elif kind == "event":
            d["event"] = f"event.{evk}"
        elif kind == "hidden":
            d["event"] = f"event.{evk}"
            d["hidden"] = {"condition": "clear the region boss", "reveal_chance": 0.3}
        elif kind == "cultivation":
            d["cultivation"] = {"qi_mult": round(1.4 + 0.05 * n, 2), "minutes": 30, "energy_cost": 6}
        elif kind == "secret_realm":
            d["secret_realm"] = f"dungeon.{sr[0]}"
        nodes[idx] = d
    for a, b in NODE_EDGES:
        nodes[a]["connections"].append(nodes[b]["id"]); nodes[b]["connections"].append(nodes[a]["id"])
    out["nodes"].append((key, [nodes[i] for i in range(len(NODE_TEMPLATE))]))

    # ---------- region ----------
    prev_key, prev_q = prev
    out["regions"].append({"id": f"region.{key}", **named(rd["name"], rd["desc"], rd["cn"]), "order": n, "realm_range": {"min": realm_id(rmin), "max": realm_id(rmax)},
                           "unlock": {"regions": [f"region.{prev_key}"], "quests": [prev_q], "realm": {"id": realm_id(rmin), "stage": 1}}, "entry_node": entry, "boss": boss_id,
                           "signature_materials": [M(herb), M(ore), M(mon), M(cry)],
                           "art": {"card": art(f"assets/regions/{key}_card.png", f"{STYLE}. Region card illustration, landscape: {rd['scene']}. Painterly, wide composition, no text.", (1024, 640), False, ["refs/mockups/world_regions.png"]),
                                   "map": art(f"assets/regions/{key}_map.png", f"{STYLE}. Top-down illustrated adventure map of {rd['scene']}, winding paths between clearings suitable for node markers, soft light, no text, no icons.", (1080, 1620), False, ["refs/mockups/region_node_map.png"]),
                                   "battle_bg": bg(f"regions/{key}_battle_bg", f"battle backdrop inside {rd['scene']}, open ground in the lower third", refs=["refs/mockups/battle_screen.png"])}})

    # ---------- alchemy & forge ----------
    pk2, pname2, pcn2, plook, pdesc2 = rd["pill"]
    out["consumables"].append({"id": f"cons.{pk2}", **named(pname2, pdesc2, pcn2), "rarity": rar[2], "sell_value": 30 * n * n, "stack_limit": 999, "tags": [key], "subtype": "pill",
                               "grade": min(9, 2 + n // 2), "effects": {"qi": int(REALM_BASE_QI[REALMS.index(rmin)] * 0.6), "cultivation_boost": {"mult": round(1.2 + 0.02 * n, 2), "minutes": 30}},
                               "usable_in_battle": False, "cooldown_min": 0, "art": {"icon": icon(f"items/consumables/{pk2}", plook, rar[2])}})
    out["alchemy"].append({"id": f"alchemy.{pk2}", **named(pname2, pdesc2, pcn2), "output": {"id": f"cons.{pk2}", "qty": [1, 2]}, "ingredients": [q2(M(herb), 4), q2(M(mon), 2), q2(M(cry), 1)],
                           "cost_stones": 100 * n * n, "grade": min(9, 2 + n // 2), "success_base": 0.5, "furnace_min": min(3, 1 + n // 5), "proficiency_min": 40 * n, "proficiency_xp": 30 * n,
                           "unlock": {"type": "sect_fame", "fame": max(1, FAME[n - 1])}, "failure": {"return_pct": 0.3, "byproduct": "gift.bitter_medicine"}})
    fk = rd["gear"][0][0]
    out["forge"].append({"id": f"forge.{fk}", **named(rd["gear"][0][1], f"Forge a {rd['gear'][0][1]} from the materials of the {rd['name']}.", rd["gear"][0][2]),
                         "output": {"base": gids[0], "rarity": lo_r, "ilvl": bhi}, "ingredients": [q2(M(ore), 8), q2(M(cry), 2), q2(M(mon), 5)], "cost_stones": 500 * n * n,
                         "fame_required": FAME[n - 1], "unlock": {"type": "sect_fame", "fame": max(1, FAME[n - 1])}})

    # ---------- quests & achievement ----------
    arrival, sovereign = f"quest.main.{key}_arrival", f"quest.main.{key}_sovereign"
    qicon = lambda typ, k, name: {"icon": icon(f"quests/{typ}_{k}", f"a quest emblem for '{name}' in the {rd['name']}", "rare", ["refs/mockups/mission_hall.png"])}
    out["quests"] += [
        {"id": arrival, **named(f"Into the {rd['name']}", f"Reach the {rd['name']} and explore three of its places.", None), "type": "main", "giver": "system", "turn_in": "auto",
         "prereqs": {"quests": [prev_q], "regions": [f"region.{key}"]}, "objectives": [{"type": "explore", "region": f"region.{key}", "nodes": 3}],
         "rewards": {"spirit_stones": 100 * n * n, "sect_fame": 20 * n}, "next": sovereign, "difficulty": min(5, 1 + n // 4), "rec_cp": cb, "hint": f"Adventure · {rd['name']}", "art": qicon("main", f"{key}_arrival", rd["name"])},
        {"id": sovereign, **named(f"Sovereign of the {rd['name']}", f"Defeat {bname}, master of the {rd['name']}.", None), "type": "main", "giver": "system", "turn_in": "auto",
         "prereqs": {"quests": [arrival], "realm": {"id": realm_id(rmin), "stage": 5}}, "objectives": [{"type": "defeat", "target": boss_id, "count": 1}],
         "rewards": {"spirit_stones": 400 * n * n, "sect_fame": 80 * n, "techniques": [f"tech.active.{tk}"], "gear": [{"base": gids[0], "rarity": R[R.index(lo_r) + 1], "ilvl": bhi}]},
         "difficulty": min(5, 2 + n // 4), "rec_cp": bcp, "hint": f"Adventure · {rd['name']} · Throne", "art": qicon("main", f"{key}_sovereign", rd["name"])},
        {"id": f"quest.mission.{key}_{mon}", **named(f"{rd['mats'][2][1]} Requisition", f"The Mission Hall needs five {rd['mats'][2][1]} from the {rd['name']}.", None), "type": "mission",
         "giver": "sectloc.mission_hall", "turn_in": "sectloc.mission_hall", "prereqs": {"regions": [f"region.{key}"]}, "objectives": [{"type": "deliver", "item": M(mon), "count": 5, "to": "sectloc.mission_hall"}],
         "rewards": {"spirit_stones": 60 * n * n, "sect_fame": 15 * n}, "repeatable": {"cooldown_min": 1440}, "difficulty": min(5, 1 + n // 4), "rec_cp": cb, "hint": f"{rd['name']} · enemies drop it", "art": qicon("mission", f"{key}_{mon}", rd["name"])},
        {"id": f"quest.combat.{key}_elite_hunt", **named(f"Hunt: {ens[3][1]}", f"Defeat three {ens[3][1]}s in the {rd['name']}.", None), "type": "combat",
         "giver": "sectloc.mission_hall", "turn_in": "sectloc.mission_hall", "prereqs": {"regions": [f"region.{key}"]}, "objectives": [{"type": "defeat", "target": eids[3], "count": 3}],
         "rewards": {"spirit_stones": 80 * n * n, "sect_fame": 20 * n, "items": [q2("mat.spirit_enhancing_stone", 2)]}, "repeatable": {"cooldown_min": 1440}, "difficulty": min(5, 2 + n // 4), "rec_cp": round(cb * 1.9),
         "hint": f"{rd['name']} · Lair / Den", "art": qicon("combat", f"{key}_elite_hunt", rd["name"])},
        {"id": f"quest.dungeon.{key}_{dk}", **named(f"Trial: {dname}", f"Elder Feng wants proof you can clear the {dname}.", None), "type": "dungeon",
         "giver": "npc.elder_feng", "turn_in": "npc.elder_feng", "prereqs": {"regions": [f"region.{key}"], "realm": {"id": realm_id(rmin), "stage": 3}}, "objectives": [{"type": "clear", "target": f"dungeon.{dk}", "count": 1}],
         "rewards": {"spirit_stones": 200 * n * n, "sect_fame": 30 * n, "affinity": [{"npc": "npc.elder_feng", "delta": 10}]}, "difficulty": min(5, 2 + n // 4), "rec_cp": round(cb * 2.5), "hint": f"Adventure · Dungeons · {dname}", "art": qicon("dungeon", f"{key}_{dk}", dname)},
        {"id": npc_q, **named(f"{nname}'s Request", f"{nname} asks for eight {rd['mats'][0][1]}.", None), "type": "npc", "giver": f"npc.{nk}", "turn_in": f"npc.{nk}",
         "prereqs": {"regions": [f"region.{key}"]}, "objectives": [{"type": "deliver", "item": M(herb), "count": 8, "to": f"npc.{nk}"}],
         "rewards": {"spirit_stones": 50 * n * n, "items": [q2(f"cons.{pk2}", 2), q2(M(cry), 1)], "affinity": [{"npc": f"npc.{nk}", "delta": 40}]}, "difficulty": 1, "hint": f"{rd['name']} · {NODE_NAMES['gathering']}", "art": qicon("npc", nk, nname)},
    ]
    out["achievements"].append({"id": f"ach.exploration.{key}_charted", **named(f"{rd['name']} Charted", f"Explore every place in the {rd['name']}.", None), "category": "exploration",
                                "condition": {"type": "objective", "objective": {"type": "explore", "region": f"region.{key}", "nodes": len(NODE_TEMPLATE)}}, "rewards": {"spirit_stones": 200 * n * n, "items": [q2(M(cry), 2)]}, "hidden": False,
                                "art": {"icon": icon(f"achievements/exploration_{key}_charted", f"an achievement medal showing a map of the {rd['name']}", "epic", ["refs/mockups/achievements.png"])}})
    return key, sovereign


def boss_entry(k, name, cn, kind, el, realm, stage, cp, n, techs, phases, desc, look, weak, region_key):
    return {"id": f"boss.{k}", **named(name, desc, cn), "kind": kind, "element": f"elem.{el}", "realm": {"id": realm_id(realm), "stage": stage},
            "stats": stats_for(cp, n, 5), "cp": cp, "techniques": techs, "ai": {"strategy": "guardian" if kind != "region" else "berserker", "rules": []}, "resistances": {},
            "loot": f"loot.boss.{k}", "mastery_xp": 40 + cp // 40, "phases": phases, "weaknesses": [f"elem.{w}" for w in weak],
            "art": {"icon": icon(f"bosses/{region_key}/{k}_icon", f"the head of {look}", None, ["refs/mockups/battle_screen.png"]),
                    "battle": battle(f"bosses/{region_key}/{k}_battle", look, (1024, 1024), ["refs/mockups/battle_screen.png"]),
                    "intro": art(f"assets/bosses/{region_key}/{k}_intro.png", f"{STYLE}. Dramatic boss introduction splash of {look}, low angle, swirling elemental energy, dark vignette, no text.", (1080, 1350), False, ["refs/mockups/battle_screen.png"])}}


# ====================================================================== endgame
MEGAS = [
    # region order, key, name, cn, rank, scene, boss(k, name, cn, el, look, weak), uniques [(k, name, cn, slot, type, look, sig, effects)]
    (10, "dragon_king_palace", "Sunken Palace of the Dragon King", "龙王沉宫", "core_disciple", "a vast palace of coral and pearl on the sea floor, dragon statues and drowned treasure",
     ("dragon_king_ao", "Dragon King Ao", "龙王敖", "water", "a colossal azure dragon king in coral armour with a pearl crown and a trident of tides", ["earth"]),
     [("dragon_king_scale_armor", "Dragon King's Scale Armour", "龙王鳞甲", "armor", "heavy", "magnificent azure dragon-scale armour with pearl inlays and a dragon-head pauldron", "dmg_red",
       [eff("shield_on_battle_start", "Start battle with a shield of 20% max HP.", value=20), eff("reflect", "Reflect 15% of damage taken.", status="status.reflect", value=15)]),
      ("tide_pearl_necklace", "Tide Pearl Necklace", "潮珠链", "necklace", None, "a necklace of nine glowing sea pearls around a great dragon pearl", "sp_energy",
       [eff("sp_restore", "Restore 12 SP per turn.", value=12), eff("heal_on_turn", "Heal 3% max HP each turn.", value=3)])]),
    (12, "fallen_heaven_ruins", "Ruins of the Fallen Heaven", "坠天遗墟", "direct_disciple", "the burning ruins of a heavenly city fallen through the Gate of Ascension, golden rubble and phoenix fire",
     ("fallen_heaven_lord", "Fallen Heaven Lord", "坠天之主", "fire", "a fallen celestial lord with burning broken wings, a cracked golden crown and a sword of phoenix fire", ["water"]),
     [("phoenix_feather_crown", "Phoenix Feather Crown", "凤羽冠", "helmet", None, "a radiant crown of living phoenix feathers with a ruby flame at the centre", "status_res",
       [eff("heal_on_turn", "Heal 4% max HP each turn.", value=4), eff("on_hit_apply", "Hits have a 20% chance to Burn.", status="status.burning", chance=0.2)]),
      ("cloudwalker_immortal_boots", "Cloudwalker Immortal Boots", "踏云仙履", "boots", None, "a pair of white and gold boots trailing clouds and tiny phoenix sparks", "spd",
       [eff("stat_mult", "Evasion +8%.", attribute="eva", value=8), eff("cooldown_reduction", "Technique cooldowns −1 at battle start.", value=1)])]),
    (14, "ten_thousand_laws_hall", "Hall of Ten Thousand Laws", "万律大殿", "elder", "an infinite golden hall where every pillar is a written law and great law-wheels turn overhead",
     ("law_sovereign", "Law Sovereign", "律尊", "metal", "a gigantic golden sovereign whose body is made of turning law-wheels and chains of light", ["fire"]),
     [("law_seal_ring", "Law-Seal Ring", "律印戒", "ring", None, "a heavy golden ring with a tiny turning law-wheel set in its face", "crit",
       [eff("cooldown_reduction", "Technique cooldowns −1 every 3rd turn.", value=1), eff("on_crit_apply", "Critical hits Silence the target.", status="status.silence", chance=0.3)]),
      ("heaven_mirror", "Mirror of Heaven", "天镜", "artifact", None, "a large round mirror of white gold reflecting a perfect starry heaven", "cdr",
       [eff("reflect", "Reflect 20% of damage taken.", status="status.reflect", value=20), eff("shield_on_battle_start", "Start battle with a shield of 15% max HP.", value=15)])]),
    (15, "primordial_chaos_abyss", "Primordial Chaos Abyss", "混沌深渊", "grand_elder", "a swirling abyss of primordial chaos beneath the Immortal Emperor's throne, all five elements tearing at each other",
     ("chaos_progenitor", "Chaos Progenitor", "混沌始祖", "earth", "a vast faceless titan of swirling chaos with five elemental hearts and a crown of black stars", ["wood"]),
     [("chaos_severing_saber", "Chaos-Severing Saber", "断混沌刀", "weapon", "saber", "a saber whose blade is a sliver of night sky edged with five elemental lights", "atk",
       [eff("on_hit_apply", "Hits lower Defense.", status="status.def_down", chance=0.4), eff("on_kill", "Restore 15% HP on kill.", value=15)])]),
]
TRIBS = [(5, "soul_transformation", "Soul Transformation Tribulation", "化神天劫", "metal"), (8, "tribulation_transcendence", "Great Heavenly Tribulation", "渡劫大劫", "metal"),
         (10, "immortal_ascension", "Ascension Tribulation", "飞升劫", "fire"), (13, "golden_immortal", "Golden Immortal Tribulation", "金仙劫", "fire"),
         (15, "immortal_emperor", "Emperor's Tribulation", "帝劫", "water")]
NEW_OPPONENTS = [
    ("lu_feiyan", "Lu Feiyan", "陆飞燕", "Wind-Fan Dancer · Inner Disciple", "wood", "Lu Feiyan, a graceful young woman with long brown hair in a braid, green and white dancer robes, twin steel war fans", ["tech.active.crescent_wind_blade", "tech.active.verdant_vine_bind", "tech.passive.cloud_step"], "trickster",
     "Playful, competitive, never misses a chance to show off.", "Learned the war fan from a travelling troupe before joining the sect."),
    ("han_jinghong", "Han Jinghong", "韩惊鸿", "Blood Saber · Inner Disciple", "fire", "Han Jinghong, a tall grim young man with a scarred jaw, black and crimson robes, a heavy blood-red saber", ["tech.active.flame_palm", "tech.active.crimson_moon_slash", "tech.passive.critical_insight"], "berserker",
     "Grim, intense, respects only strength.", "A former demonic-sect captive who escaped and swore to beat every orthodox disciple."),
    ("su_wanqing", "Su Wanqing", "苏婉清", "Poison Alchemist · Inner Disciple", "wood", "Su Wanqing, a soft-spoken young woman with dark green hair in a bun, pale robes with herb pouches, holding a jade vial", ["tech.active.verdant_vine_bind", "tech.active.ripple_mending", "tech.passive.spiritual_regeneration"], "support",
     "Polite, patient, quietly terrifying.", "The Alchemy Hall's prodigy. Her pills cure; her vials do not."),
    ("gu_xuanming", "Gu Xuanming", "顾玄明", "Core Disciple · Sword Prodigy", "metal", "Gu Xuanming, a composed young man with long black hair, white and silver core-disciple robes, a plain sword on his back", ["tech.active.swallow_return_sword", "tech.active.ten_thousand_sword_return", "tech.passive.sword_heart"], "aggressive",
     "Composed, polite, utterly confident.", "Master Gu's grandson and the sect's strongest core disciple. Has never lost a tournament."),
]
EXTRA_METHODS = [("five_elements_harmony", "Five Elements Harmony Art", "五行和合功", None, "epic", "heaven", 2.0, {"elem_res.wood": 6, "elem_res.fire": 6, "elem_res.earth": 6, "elem_res.metal": 6, "elem_res.water": 6}, "Balance the five elements in the meridians.", 4000),
                 ("lotus_heart_scripture", "Lotus Heart Scripture", "莲心经", "wood", "rare", "earth", 1.45, {"heal_bonus": 8, "hp": 600}, "A gentle scripture that steadies the heart like a lotus on water.", 1500),
                 ("vajra_body_method", "Vajra Body Method", "金刚体法", "earth", "epic", "heaven", 1.9, {"def": 400, "dmg_red": 4}, "Make the body indestructible as vajra.", 6000)]
EXTRA_PASSIVES = [("battle_focus", "Battle Focus", "战意凝", "metal", "rare", "Accuracy +6, crit +2%.", {"acc": 6, "crit": 2}, 800),
                  ("spirit_shield_art", "Spirit Shield Art", "灵盾诀", "earth", "rare", "Shield strength +12%.", {"shield_str": 12}, 1200)]


def endgame():
    # ---- extra methods / passives (pavilion) ----
    for k, name, cn, el, rar, grade, mult, bon, desc, fame in EXTRA_METHODS:
        out["methods"].append({"id": f"method.{k}", **named(name, desc, cn), "rarity": rar, "grade": grade, **({"element": f"elem.{el}"} if el else {}), "qi_mult": mult, "bonuses": bon, "requirements": {},
                               "mastery": {"max_level": 10, "xp_per_level": 120, "per_level_bonus": 0.04}, "art": {"icon": icon(f"techniques/methods/{k}", f"a cultivation-method scroll emblem for '{name}': {desc}", rar, ["refs/mockups/cultivation_screen.png"])}})
        pavilion.append({"id": f"method.{k}", "price": fame * 2, "currency": "spirit_stones", "unlock": {"sect_fame": fame}})
    for k, name, cn, el, rar, desc, bon, fame in EXTRA_PASSIVES:
        out["techs_passive"].append({"id": f"tech.passive.{k}", **named(name, desc, cn), "kind": "passive", "rarity": rar, "element": f"elem.{el}", "weapon_affinity": "any", "targeting": "self", "power": 0, "hits": 1,
                                     "sp_cost": 0, "cooldown": 0, "applies": [], "passive_bonuses": bon, "requirements": {}, "mastery": {"max_level": 10, "xp_per_level": 80, "per_level_bonus": 0.03}, "enemy_only": False,
                                     "art": {"icon": icon(f"techniques/passive/{k}", f"a square passive-technique icon for '{name}': {desc}", rar, ["refs/mockups/battle_screen.png"])}})
        pavilion.append({"id": f"tech.passive.{k}", "price": fame, "currency": "spirit_stones", "unlock": {"sect_fame": fame}})

    regmap = {r["order"]: r for r in REGIONS}
    # ---- mega dungeons ----
    for n, k, name, cn, rank, scene, (bk, bn, bcn, bel, blook, bweak), uniques in MEGAS:
        rd = regmap[n]; key = rd["key"]; rmin, rmax = rd["realms"]; cb = cp_base(n); blo, bhi = band(n)
        eids = [f"enemy.{e[0]}" for e in rd["enemies"]]
        bcp = round(cb * 9)
        out["bosses"].append(boss_entry(bk, bn, bcn, "mega", bel, rmax, 9, bcp, n, [f"tech.active.{rd['etech'][0]}", f"tech.active.{rd['tech'][0]}", "tech.active.stone_shell"],
                                        [{"name": "Dominion", "hp_threshold": 1.0, "techniques": [f"tech.active.{rd['etech'][0]}"], "summons": []},
                                         {"name": "Cataclysm", "hp_threshold": 0.66, "techniques": [f"tech.active.{rd['etech'][0]}", f"tech.active.{rd['tech'][0]}"], "summons": [{"enemy": eids[3], "count": 2}], "shield_pct": 15},
                                         {"name": "Annihilation", "hp_threshold": 0.33, "techniques": [f"tech.active.{rd['tech'][0]}", "tech.active.stone_shell"], "summons": [], "enrage": {"atk_mult": 1.6, "spd_mult": 1.3},
                                          "charged_attack": {"tech": f"tech.active.{rd['tech'][0]}", "turns_to_charge": 2}}],
                                        f"Master of the {name}. Only Dao Companions standing together have a chance.", blook, bweak, "special"))
        out["loot"].append({"id": f"loot.boss.{bk}", "mode": "independent", "rolls": 1, "ilvl": [bhi, bhi + 4], "entries": [{"id": "mat.awakening_crystal", "chance": 0.6, "qty": [1, 2]}, {"id": "mat.dao_insight_crystal", "chance": 0.8, "qty": [2, 4]},
                            {"gear": {"pool": {"tags": [key]}}, "rarity_weights": weights(n, [(2, 60), (3, 40)]), "chance": 0.8}], "guaranteed": [], "spirit_stones": [400 * n * n, 700 * n * n], "sect_fame": 100 * n, "mastery_xp": 200 * n})
        ub = []
        for uk, un, ucn, slot, typ, look, sig, effects in uniques:
            d = {"id": f"gear.{uk}", **named(un, f"A divine treasure of the {name}.", ucn), "slot": slot, "main_value": {"weapon": 10, "armor": 60, "helmet": 30, "boots": 8, "necklace": 20, "ring": 6, "artifact": 25}[slot],
                 "rarity_range": ["divine", "divine"], "droppable": False, "drop_tags": [], "unique": True, "special_effects": effects, "requirements": {"realm": realm_id(rmin)}, "signature_affix": sig,
                 "rarities": {"divine": {"art": {"icon": icon(f"equipment/{slot}/{uk}_divine", look, "divine", ["refs/mockups/inventory_icons.png", "refs/mockups/rarity_frames.png"])}}}}
            if slot == "weapon": d["weapon_type"] = typ
            if slot == "armor": d["armor_type"] = typ
            out["gear"].append(d); ub.append(d["id"])
        out["loot"].append({"id": f"loot.dungeon.{k}_wave", "mode": "independent", "rolls": 1, "entries": [{"id": "mat.spirit_enhancing_stone", "chance": 0.9, "qty": [3, 6]}, {"id": "mat.refining_stone", "chance": 0.6, "qty": [1, 3]}],
                            "guaranteed": [], "spirit_stones": [100 * n * n, 200 * n * n], "sect_fame": 0, "mastery_xp": 0})
        out["loot"].append({"id": f"loot.dungeon.{k}_clear", "mode": "independent", "rolls": 1, "ilvl": [bhi, bhi + 4],
                            "entries": [{"gear": {"base": b}, "rarity_weights": {"divine": 1}, "chance": 0.03} for b in ub] + [{"gear": {"pool": {"tags": [key]}}, "rarity_weights": weights(n, [(2, 60), (3, 40)]), "chance": 1.0},
                                        {"id": "mat.awakening_crystal", "chance": 0.8, "qty": [1, 3]}], "guaranteed": [q2("mat.dao_insight_crystal", 3)], "spirit_stones": [1000 * n * n, 1600 * n * n], "sect_fame": 150 * n, "mastery_xp": 0})
        out["dungeons"].append({"id": f"dungeon.{k}", **named(name, f"A mega dungeon of the {rd['name']}. Bring Dao Companions. Divine treasures sleep here.", cn), "kind": "mega",
                                "entry": {"realm": {"id": realm_id(rmin), "stage": 5}, "rank": f"rank.{rank}", "energy_cost": 40, "party": {"companions_allowed": True, "max_companions": 2}},
                                "rec_cp": round(cb * 8), "waves": [{"enemies": [eids[0], eids[1], eids[2]]}, {"enemies": [eids[3], eids[4], eids[3]]}, {"enemies": [f"boss.{rd['dungeon'][5][0]}"]},
                                                                   {"enemies": [eids[3], eids[3], eids[4], eids[4]]}, {"enemies": [f"boss.{bk}"]}],
                                "modifiers": [{"id": "abyssal_pressure", "name": "Overwhelming Pressure", "description": "All enemies deal 15% more damage.", "effect": {"enemy_dmg_mult": 1.15}}],
                                "rewards": {"per_wave": f"loot.dungeon.{k}_wave", "clear": f"loot.dungeon.{k}_clear", "first_clear": {"spirit_stones": 2000 * n * n, "sect_fame": 300 * n}},
                                "checkpoints": True, "persistent_hp": True,
                                "art": {"card": art(f"assets/dungeons/{k}_card.png", f"{STYLE}. Mega dungeon card illustration: {scene}. Epic wide painterly composition, no text.", (1024, 640), False, ["refs/mockups/dungeon_hub.png"]),
                                        "battle_bg": bg(f"dungeons/{k}_battle_bg", f"battle backdrop inside {scene}", refs=["refs/mockups/battle_screen.png"])}})

    # ---- tribulations ----
    for n, realm, name, cn, el in TRIBS:
        cb = cp_base(n + 1); bk = f"{realm}_tribulation_spirit"
        out["bosses"].append(boss_entry(bk, f"{name} Spirit", None, "tribulation", el, realm, 1, round(cb * 5), n + 1, ["tech.active.heavenly_bolt", "tech.active.thunder_judgment"],
                                        [{"name": "First Wave", "hp_threshold": 1.0, "techniques": ["tech.active.heavenly_bolt"], "summons": []},
                                         {"name": "Final Wave", "hp_threshold": 0.4, "techniques": ["tech.active.thunder_judgment", "tech.active.heavenly_bolt"], "summons": [], "enrage": {"atk_mult": 1.5, "spd_mult": 1.2},
                                          "charged_attack": {"tech": "tech.active.thunder_judgment", "turns_to_charge": 2}}],
                                        f"The heavens' judgement for those entering {realm.replace('_', ' ').title()}.", f"a colossal humanoid spirit of {el}-tinged heavenly lightning with a crown of storm clouds, larger and fiercer than any before", ["earth"], "special"))
        out["loot"].append({"id": f"loot.tribulation.{realm}", "mode": "independent", "rolls": 1, "entries": [{"id": "mat.dao_insight_crystal", "chance": 0.7, "qty": [1, 3]}, {"id": "mat.awakening_crystal", "chance": 0.4, "qty": [1, 1]}],
                            "guaranteed": [q2("mat.spirit_enhancing_stone", 10)], "spirit_stones": [800 * n * n, 1200 * n * n], "sect_fame": 100 * n, "mastery_xp": 0})
        out["loot"].append({"id": f"loot.boss.{bk}", "mode": "independent", "rolls": 1, "entries": [{"id": "mat.dao_insight_crystal", "chance": 0.5, "qty": [1, 2]}], "guaranteed": [], "spirit_stones": [300 * n * n, 500 * n * n], "sect_fame": 0, "mastery_xp": 100 * n})
        out["tribulations"].append({"id": f"tribulation.{realm}", **named(name, f"Waves of heavenly lightning test those who would enter {realm.replace('_', ' ').title()}.", cn), "realm": realm_id(realm), "spirit": f"boss.{bk}",
                                    "waves": [{"bolts": 3 + i, "dmg_mult": round(1 + 0.4 * i, 2), "element": f"elem.{el}"} for i in range(3 + n // 5)], "modifiers": [],
                                    "failure": {"qi_loss_pct": 0.3, "retry_cooldown_min": 180}, "rewards": f"loot.tribulation.{realm}",
                                    "art": {"battle_bg": bg(f"tribulations/{realm}_bg", f"a peak under a vast vortex of {el}-coloured storm clouds with lightning tearing down, grander than any previous tribulation", refs=["refs/mockups/tribulation.png"])}})

    # ---- tournament opponents ----
    for k, name, cn, title, el, look, loadout, strat, pers, back in NEW_OPPONENTS:
        d = {"id": f"npc.{k}", **named(name, back, cn), "role": "opponent", "title": title, "personality": pers, "backstory": back, "elements": [f"elem.{el}"],
             "realm": {"id": "realm.core_formation", "stage": 5}, "cp": 3000, "affinity_levels": [{"name": "Stranger", "threshold": 0}, {"name": "Acquaintance", "threshold": 50}, {"name": "Friend", "threshold": 300}, {"name": "Confidant", "threshold": 600}, {"name": "Dao Companion", "threshold": 1000}],
             "gifts": {"loved": [], "liked": [], "disliked": [], "loved_tags": [], "liked_tags": [], "repeat_decay": 0.5, "daily_limit": 3}, "topics": [], "quests": [],
             "duel": {"enabled": True, "loadout": loadout, "strategy": strat, "win": {"mastery_xp": 60}, "lose": {"mastery_xp": 20}, "cooldown_min": 60},
             "dao_companion": {"eligible": False}, "expressions": ["neutral"],
             "art": {"portrait": portrait(f"npcs/{k}/portrait", look), "full_body": full_body(f"npcs/{k}/full_body", look), "expression_neutral": expression(f"npcs/{k}/expression_neutral", look, "neutral"),
                     "battle": battle(f"npcs/{k}/battle", f"{name} in combat stance, {look}")}}
        out["npcs"].append(d)

    # ---- cultivation quests ----
    for i, realm in enumerate(REALMS[1:], start=2):
        out["quests"].append({"id": f"quest.cultivation.reach_{realm}", **named(f"Realm: {realm.replace('_', ' ').title()}", f"Break through to {realm.replace('_', ' ').title()}.", None), "type": "cultivation",
                              "giver": "system", "turn_in": "auto", "prereqs": {}, "objectives": [{"type": "reach_realm", "realm": realm_id(realm), "stage": 1}],
                              "rewards": {"spirit_stones": 200 * i * i, "sect_fame": 50 * i, "items": [q2("mat.dao_insight_crystal", max(1, i - 3))] if i >= 4 else [q2("cons.spirit_condensing_pill", 3)]},
                              "difficulty": min(5, 1 + i // 3), "hint": "Cultivate tab · Break through",
                              "art": {"icon": icon(f"quests/cultivation_reach_{realm}", f"a quest emblem celebrating the {realm.replace('_', ' ')} realm", "epic", ["refs/mockups/cultivation_screen.png"])}})


def tournaments():
    return [
        {"id": "tournament.inner_sect", **named("Inner Sect Tournament", "Four rounds among the Inner Disciples. Win to become a Core Disciple.", "核心大比"),
         "entry": {"rank": "rank.inner_disciple", "sect_fame": 4000, "realm": {"id": "realm.core_formation", "stage": 1}},
         "rounds": [{"opponent": "npc.lu_feiyan", "cp": 2600, "rewards": {"spirit_stones": 1500}}, {"opponent": "npc.su_wanqing", "cp": 2900, "rewards": {"spirit_stones": 2000}},
                    {"opponent": "npc.han_jinghong", "cp": 3400, "rewards": {"spirit_stones": 2500, "items": [q2("mat.refining_stone", 3)]}}, {"opponent": "npc.mo_lianjue", "cp": 3900, "rewards": {"spirit_stones": 3000}}],
         "champion_rewards": {"spirit_stones": 12000, "sect_fame": 1500, "items": [q2("mat.awakening_crystal", 1), q2("mat.dao_insight_crystal", 2)]},
         "loss": {"sect_fame": -400}, "reentry": {"sect_fame_required": 4000}, "repeatable": True},
        {"id": "tournament.core_sect", **named("Core Sect Tournament", "The core disciples' grand contest. The champion becomes a Direct Disciple of an elder.", "亲传大比"),
         "entry": {"rank": "rank.core_disciple", "sect_fame": 9000, "realm": {"id": "realm.nascent_soul", "stage": 1}},
         "rounds": [{"opponent": "npc.shen_qingxue", "cp": 9000, "rewards": {"spirit_stones": 6000}}, {"opponent": "npc.han_jinghong", "cp": 10500, "rewards": {"spirit_stones": 8000}},
                    {"opponent": "npc.gu_xuanming", "cp": 12500, "rewards": {"spirit_stones": 10000, "items": [q2("mat.awakening_crystal", 1)]}}, {"opponent": "npc.bai_lingshuang", "cp": 14000, "rewards": {"spirit_stones": 12000}}],
         "champion_rewards": {"spirit_stones": 50000, "sect_fame": 4000, "items": [q2("mat.dao_insight_crystal", 5)]},
         "loss": {"sect_fame": -800}, "reentry": {"sect_fame_required": 9000}, "repeatable": True},
    ]


def pavilion_stock():
    if not pavilion: build()
    return list(pavilion)


_built = False
def build():
    global _built
    if _built: return out
    _built = True
    prev = ("azure_bamboo_forest", "quest.main.bamboo_sovereign")
    for rd in REGIONS:
        prev = region(rd, prev)
    # chain sovereigns to next arrival
    sov = [q for q in out["quests"] if q["id"].endswith("_sovereign")]
    arr = [q for q in out["quests"] if q["id"].endswith("_arrival")]
    for s, a in zip(sov, arr[1:]): s["next"] = a["id"]
    endgame()
    return out


def bfood_extra():
    return [{"id": "bfood.spirit_meat", **named("Spirit Meat", "a slab of glowing red spirit-beast meat wrapped in a leaf", "灵兽肉"), "rarity": "uncommon", "sell_value": 12, "stack_limit": 999, "tags": [],
             "xp": 60, "bond": 1, "preferred_elements": ["elem.fire", "elem.earth", "elem.metal"], "art": {"icon": icon("items/beast_food/spirit_meat", "a slab of glowing red spirit-beast meat wrapped in a leaf", "uncommon")}}]


if __name__ == "__main__":
    o = build()
    W = lambda path, k: write(path, o[k])
    W("content/items/materials_regions.json", "materials"); W("content/items/consumables_regions.json", "consumables"); W("content/items/eggs_regions.json", "eggs")
    W("content/items/books_regions.json", "books"); write("content/items/beast_food_regions.json", bfood_extra())
    W("content/enemies/regions.enemies.json", "enemies"); W("content/enemies/regions.bosses.json", "bosses"); W("content/economy/loot/regions.json", "loot")
    W("content/adventure/regions_regions.json", "regions"); W("content/adventure/events_regions.json", "events")
    for key, ns in o["nodes"]: write(f"content/adventure/nodes/{key}.json", ns)
    W("content/dungeons/dungeons_regions.json", "dungeons"); W("content/dungeons/tribulations_regions.json", "tribulations")
    for g in o["gear"]: write(f"content/equipment/bases/{g['id'].split('.')[1]}.json", [g])
    W("content/equipment/sets_regions.json", "sets"); W("content/beasts/beasts_regions.json", "beasts"); W("content/techniques/beast_abilities_regions.json", "btech")
    W("content/npcs/npcs_regions.json", "npcs"); W("content/techniques/regions_active.techs.json", "techs_active"); W("content/techniques/regions_passive.techs.json", "techs_passive")
    W("content/techniques/methods_regions.json", "methods"); W("content/economy/recipes/alchemy_regions.json", "alchemy"); W("content/economy/recipes/forge_regions.json", "forge")
    W("content/quests/regions.json", "quests"); W("content/achievements/achievements_regions.json", "achievements"); W("content/story/regions.json", "story")
    write("content/sect/tournaments_regions.json", tournaments())
