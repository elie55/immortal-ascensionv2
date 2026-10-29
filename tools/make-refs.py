#!/usr/bin/env python3
"""
Cut the approved mockup boards into the named reference crops that content/*.json `art.references` point at.

Usage:  python3 tools/make-refs.py refs/originals
Expects the six original mockup boards in that folder with these names:
  mockup_core.jpg        (talk / inventory / cultivation / sect map / arena / character)   1288x1420
  mockup_prologue.png    (4 prologue scenes)                                              1536x794
  mockup_sect.png        (sect locations batch 1, 3x2)                                   1226x1536
  mockup_battle.png      (battle / adventure / inventory batch 3, 6x2)                    1536x1007
  mockup_tang.png        (NPC talk · Tang Xiaoman)                                        1215x1536
  mockup_systems.png     (Set 2 · systems, forge, character tabs, 5x3)                    1346x1536
Outputs PNGs into refs/mockups/. Boxes are (left, top, right, bottom) in source pixels.
"""
import os, sys
from PIL import Image

CROPS = {
    "mockup_core.jpg": {
        "tang_talk": (10, 20, 392, 700), "inventory_icons": (455, 20, 838, 700), "cultivation_screen": (903, 20, 1286, 700),
        "sect_map": (10, 735, 392, 1412), "arena_bracket": (455, 735, 838, 1412), "character_screen": (903, 735, 1286, 1412),
    },
    "mockup_prologue.png": {
        "prologue": (25, 95, 380, 720), "prologue_elder_wen": (400, 95, 755, 720), "prologue_welcome": (780, 95, 1135, 720), "prologue_bai": (1155, 95, 1510, 720),
    },
    "mockup_sect.png": {
        "mission_hall": (20, 75, 400, 735), "scripture_pavilion": (420, 75, 805, 735), "meditation_waterfall": (825, 75, 1205, 735),
        "waterfall_active": (20, 790, 400, 1450), "merchant_pavilion": (420, 790, 805, 1450), "alchemy_hall": (825, 790, 1205, 1450),
        "sect_locations": (0, 0, 1226, 1536),
    },
    "mockup_battle.png": {
        "victory": (15, 60, 250, 490), "defeat": (270, 60, 505, 490), "auto_battle": (520, 60, 760, 490), "world_regions": (775, 60, 1015, 490),
        "region_node_map": (1030, 60, 1270, 490), "node_interactions": (1285, 60, 1525, 490),
        "dungeon_hub": (15, 530, 250, 965), "secret_realm_map": (270, 530, 505, 965), "inventory_full": (520, 530, 760, 965),
        "equipment_compare": (775, 530, 1015, 965), "battle_screen": (1030, 530, 1270, 965), "fame_milestone": (1285, 530, 1525, 965),
    },
    "mockup_tang.png": {
        "tang_chat": (25, 75, 390, 735), "ask_about_her": (415, 75, 790, 735), "gift_picker": (815, 75, 1190, 735),
        "duel_spar": (230, 790, 590, 1450), "spar_result": (625, 790, 985, 1450),
    },
    "mockup_systems.png": {
        "tribulation": (25, 70, 265, 495), "forge_refine": (290, 70, 530, 495), "forge_reforge": (555, 70, 795, 495), "forge_awaken": (820, 70, 1060, 495), "forge_craft": (1085, 70, 1325, 495),
        "spirit_root": (25, 560, 265, 985), "spirit_beasts": (290, 560, 530, 985), "achievements": (555, 560, 795, 985), "settings": (820, 560, 1060, 985), "save_slots": (1085, 560, 1325, 985),
        "main_menu": (25, 1050, 265, 1475), "offline_gains": (290, 1050, 530, 1475), "clock_moved_back": (555, 1050, 795, 1475), "stat_details": (820, 1050, 1060, 1475), "rarity_frames": (1085, 1050, 1325, 1475),
    },
}

def main(src: str, out: str = "refs/mockups") -> int:
    os.makedirs(out, exist_ok=True)
    missing = 0
    for fname, boxes in CROPS.items():
        p = os.path.join(src, fname)
        if not os.path.exists(p):
            print(f"!! missing {p}"); missing += 1; continue
        im = Image.open(p).convert("RGB")
        for name, box in boxes.items():
            im.crop(box).save(os.path.join(out, f"{name}.png"))
        print(f"{fname}: {len(boxes)} crops")
    return 1 if missing else 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "refs/originals"))
