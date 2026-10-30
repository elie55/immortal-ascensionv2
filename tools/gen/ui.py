"""UI art that belongs to screens rather than game entities (main menu, sect hub map, cultivate scene, app backdrops)."""
from common import *
LIN = "Lin Xueyao, a young woman with long black hair in a loose half updo with a jade hairpin, light green eyes, calm gentle face, wearing a white hanfu with pale jade-green layered robes, translucent flowing sleeves and a pink sash, a long sword at her side"

LIN_REF = "assets/npcs/lin_xueyao/full_body.webp"

def U(key, name, desc, screen, art_block):
    return {"id": f"ui.{key}", **named(name, desc), "screen": screen, "art": art_block}

def ui():
    return [
        U("main_menu", "Main menu key art", "Lin Xueyao on a cliff above the sea of clouds at sunrise.", "main_menu",
          {"key_art": art("assets/ui/main_menu_key_art.png", f"{STYLE}. Vertical key art for a game title screen: {LIN}, seen from behind three-quarter on a cliff edge, long black hair and jade ribbons flowing in the wind, "
                          "looking over an endless sea of clouds with floating mountains, waterfalls and pagodas, sunrise glowing behind distant peaks, empty sky in the upper third for a title, no text.",
                          (1080, 1920), False, [LIN_REF, "refs/mockups/main_menu.png"])}),
        U("cultivate", "Cultivation scene", "Lin Xueyao meditating in lotus pose among floating islands.", "cultivate",
          {"meditation": art("assets/ui/cultivate_meditation.png", f"{STYLE}. Vertical illustration: {LIN}, seated in lotus meditation pose with eyes closed and hands resting on her knees, floating slightly above a glowing jade lotus platform, "
                             "soft jade-green qi swirling around her, cherry blossom petals, floating islands with pagodas and waterfalls behind, pale morning sky, centered figure in the middle third, no text.",
                             (1080, 1920), False, [LIN_REF, "refs/mockups/cultivation_screen.png"]),
           # cut-out pose for the Meditation Waterfall session (mockups meditation_waterfall, waterfall_active)
           "meditation_pose": art("assets/ui/cultivate_meditation_pose.png", f"{STYLE}. Full-body illustration: {LIN}, seated in lotus meditation pose on a flat mossy stone with eyes closed and hands resting in her lap, "
                                  "long hair and sleeves flowing softly, faint jade-green qi wisps around her, complete figure and stone in frame, isolated on plain background, no text.",
                                  (768, 1024), True, [LIN_REF, "refs/mockups/meditation_waterfall.png"])}),
        U("sect_map", "Azure Cloud Sect map", "Illustrated map of the sect's floating peaks.", "sect",
          {"map": art("assets/ui/sect_map.png", f"{STYLE}. Top-down three-quarter illustrated map of a xianxia sect built on many small floating islands connected by stone bridges and stairs: a red gate, "
                      "training terraces with sword racks, a tall library pagoda, a forge with chimney smoke, an arena, a waterfall pool, a merchant pavilion with lanterns, a garden with spirit beasts, an alchemy hall with a cauldron, "
                      "small living quarters, waterfalls falling into clouds, cherry trees, soft daylight, clear open spaces around each building for labels, no text, no characters.",
                      (1080, 1920), False, ["refs/mockups/sect_map.png"])}),
        U("shortcuts", "Cultivate shortcut tiles", "Illustrated buttons for the Cultivate screen shortcuts.", "cultivate",
          {k: icon(f"ui/shortcut_{k}", d, None, ["refs/mockups/cultivation_screen.png"]) for k, d in [
              ("alchemy", "a bronze alchemy cauldron on three legs with jade-green smoke and a faint golden glow"),
              ("beasts", "a small white spirit fox with a fluffy cyan-tipped tail sitting beside a glowing egg"),
              ("quests", "an unrolled quest scroll with a red wax seal and a brush, soft golden light"),
              ("settings", "an ornate golden cogwheel with jade inlays and a soft glow")]}),
        # Painted icons for resources, map node types and forge actions (replace the line icons where art reads better).
        U("icons", "Interface icons", "Painted icons for resources and actions shown across the screens.", "shell",
          {k: icon(f"ui/icon_{k}", f"{d}, {NOTXT}", None, ["refs/mockups/inventory_icons.png"]) for k, d in [
              ("spirit_stone", "a faceted jade-green spirit crystal glowing softly from within, small sparkles"),
              ("sect_fame", "a round golden sect medallion embossed with clouds and a sword, a red silk tassel hanging below"),
              ("energy", "a crackling azure lightning bolt wrapped in a thin golden ring"),
              ("qi", "a luminous cyan orb of swirling qi with spiralling wisps of light"),
              ("combat_power", "two crossed golden jian swords over a glowing round shield"),
              ("mastery", "an unrolled bamboo scroll with a glowing calligraphy brush resting on it"),
              ("depot", "an ornate red lacquer storage chest with brass corners, lid closed"),
              ("breakthrough", "a radiant golden lotus bursting open with rays of light"),
              ("sect_emblem", "a round azure and white sect crest with a swirling cloud and a slender sword through it, polished gold rim")]}),
        U("nodes", "Map node emblems", "Round painted emblems for each kind of place on a region map.", "adventure",
          {k: icon(f"ui/node_{k}", f"a round game map marker emblem showing {d}, {NOTXT}", None, ["refs/mockups/region_node_map.png"]) for k, d in [
              ("battle", "a crossed sword and saber with a faint red glow"),
              ("elite", "a fierce demon mask with golden horns and an orange glow"),
              ("boss", "a horned dragon skull wreathed in crimson flame"),
              ("gather", "a bundle of glowing green spirit herbs tied with string"),
              ("chest", "a small red lacquer treasure chest with gold fittings, light spilling from the lid"),
              ("event", "a floating paper lantern trailing violet mist"),
              ("cultivation", "a white lotus floating on a glowing pool of light"),
              ("merchant", "a merchant's pack with gold coins and a small oiled-paper parasol"),
              ("hidden", "a swirling violet portal of mist"),
              ("secret_realm", "an ancient stone gate with a glowing blue portal inside"),
              ("story", "an unrolled scroll beside an ink stone and a brush"),
              ("locked", "an ornate bronze padlock with jade inlay")]}),
        U("forge", "Forge action icons", "Painted icons for the Spirit Forge tabs.", "forge",
          {k: icon(f"ui/forge_{k}", f"{d}, {NOTXT}", None, ["refs/mockups/forge_awaken.png"]) for k, d in [
              ("enhance", "a blacksmith hammer striking a glowing blade on an anvil with flying sparks"),
              ("refine", "a glowing gem rising out of a small bronze crucible of molten light"),
              ("reforge", "a sword blade wrapped in swirling blue and orange flames"),
              ("awaken", "a sword hilt with a radiant golden eye-shaped sigil glowing above it"),
              ("craft", "a pattern scroll with tongs and a small hammer laid across it")]}),
        U("backdrop", "App backdrop", "Soft painted sky used behind the tab screens.", "shell",
          {"sky": art("assets/ui/backdrop_sky.png", f"{STYLE}. Full-screen vertical background: dreamy sky above a sea of clouds, distant floating mountains and pagodas in soft blue haze, pale pink cherry blossoms drifting at the edges, "
                      "calm and low-contrast so interface panels stay readable, no characters, no text.", (1080, 1920), False, ["refs/mockups/character_screen.png"]),
           "night": art("assets/ui/backdrop_night.png", f"{STYLE}. Full-screen vertical background: deep navy and violet night sky with stars and a faint aurora above a sea of clouds, distant floating mountains, "
                        "calm and low-contrast so interface panels stay readable, no characters, no text.", (1080, 1920), False, ["refs/mockups/save_slots.png"])}),
    ]

if __name__ == "__main__":
    write("content/ui/ui.json", ui())
