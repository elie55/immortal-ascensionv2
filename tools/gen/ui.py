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
          {# backdrop only (mockup cultivation_screen): the meditating figure is a separate cut-out layered by the screen
           "meditation": art("assets/ui/cultivate_meditation.png", f"{STYLE}. Full-screen vertical background, bright and airy: a pastel sky of soft white clouds above an endless sea of clouds, "
                             "many floating mountain islands with small waterfalls and green-roofed pagodas fading into blue haze, a large jade-roofed temple on a floating peak in the upper middle distance, "
                             "pink cherry blossom branches framing the upper left and right corners with drifting petals, soft morning light, gentle pastel blues, lavender and pink, "
                             "the centre of the picture kept open and light for a character, no characters, no people, no text.",
                             (1080, 1920), False, ["refs/mockups/cultivation_screen.png"]),
           # the meditating figure drawn from the mockup's crop (tools/art/queue.py FILE_REF)
           "lotus": art("assets/ui/cultivate_lotus.png", f"{STYLE}. Full-body illustration: {LIN.replace(', a long sword at her side', '')}, unarmed with no sword or weapon anywhere, seated cross-legged in lotus meditation pose floating in the air, both eyes fully closed in deep meditation with a calm faint smile, "
                        "hands resting together in her lap, long black hair flowing outward in soft waves, gold and jade hairpins with small flowers, white hanfu with pale jade-green layered robes and a pink sash, "
                        "long translucent jade-green ribbons and sleeves swirling around her in elegant curves, a few pink cherry blossom petals and tiny golden sparkles floating around her, "
                        "complete figure and ribbons in frame, isolated on plain background, no text.",
                        (1024, 1024), True, ["refs/style/cult_lin.png", LIN_REF]),
           # cut-out pose for the Meditation Waterfall session (mockups meditation_waterfall, waterfall_active)
           "meditation_pose": art("assets/ui/cultivate_meditation_pose.png", f"{STYLE}. Full-body illustration: {LIN}, seated in lotus meditation pose on a flat mossy stone with eyes closed and hands resting in her lap, "
                                  "long hair and sleeves flowing softly, faint jade-green qi wisps around her, complete figure and stone in frame, isolated on plain background, no text.",
                                  (768, 1024), True, [LIN_REF, "refs/mockups/meditation_waterfall.png"])}),
        U("sect_map", "Azure Cloud Sect map", "Illustrated map of the sect's floating peaks.", "sect",
          {"map": art("assets/ui/sect_map.png", f"{STYLE}. Three-quarter top-down illustration of the Azure Cloud Sect exactly as in the approved mockup: luminous floating islands among "
                      "pastel clouds and cherry blossoms, the Inner Sect Peak pavilions at the top, a snowy frozen valley top right, the Mission Hall pagoda, sword training terraces, "
                      "the Scripture Pavilion pagoda, the forge island, the proving arena, a pool with a fountain, the merchant pavilion with red lanterns, the spirit beast garden with a pond, "
                      "the alchemy hall with a golden cauldron and small living quarters at the bottom, waterfalls into clouds, stone bridges and stairs, soft bright daylight, no text, no labels, no characters.",
                      (1080, 1384), False, ["refs/style/sect_map_art.png"])}),
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
        # hero furnace of the Alchemy Hall screen (mockup alchemy_hall), a cut-out drawn between the success ring and the panel
        U("alchemy", "Alchemy Hall furnace", "The sect's great bronze pill furnace.", "alchemy",
          {"cauldron": art("assets/ui/alchemy_cauldron.png", f"{STYLE}. A single large ornate antique bronze alchemy cauldron (ding) on three legs, seen from the front slightly above, "
                           "dragon handles, a glowing emerald jade medallion on its belly, gold filigree, soft jade-green and pink spirit smoke rising from the open top, "
                           "warm rim light, the complete cauldron and smoke in frame, isolated on a plain background, no shelves, no room, no text.",
                           (1024, 1024), True, ["refs/style/alchemy_cauldron.png"])}),
        U("backdrop", "App backdrop", "Soft painted sky used behind the tab screens.", "shell",
          {"sky": art("assets/ui/backdrop_sky.png", f"{STYLE}. Full-screen vertical background: dreamy sky above a sea of clouds, distant floating mountains and pagodas in soft blue haze, pale pink cherry blossoms drifting at the edges, "
                      "calm and low-contrast so interface panels stay readable, no characters, no text.", (1080, 1920), False, ["refs/mockups/character_screen.png"]),
           "night": art("assets/ui/backdrop_night.png", f"{STYLE}. Full-screen vertical background: deep navy and violet night sky with stars and a faint aurora above a sea of clouds, distant floating mountains, "
                        "calm and low-contrast so interface panels stay readable, no characters, no text.", (1080, 1920), False, ["refs/mockups/save_slots.png"])}),
    ]

if __name__ == "__main__":
    write("content/ui/ui.json", ui())
