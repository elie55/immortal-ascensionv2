"""UI art that belongs to screens rather than game entities (main menu, sect hub map, cultivate scene, app backdrops)."""
from common import *
LIN = "Lin Xueyao, a young woman with long black hair in a loose half updo with a jade hairpin, light green eyes, calm gentle face, wearing a white hanfu with pale jade-green layered robes, translucent flowing sleeves and a pink sash, a long sword at her side"

LIN_REF = "assets/npcs/lin_xueyao/full_body.webp"
FX = "Isolated visual effect on a pure solid black background (#000000), glowing light only, no characters, no people, no creatures, no objects, no ground, no scenery, no text, no letters, no frame. "
FX_STYLE = "Anime game visual effect, bright clean glowing light. "

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
        # painted battle effects for the arena stage (docs/BATTLE_STAGE.md): light on black, drawn with screen blending
        U("vfx", "Battle effects", "Painted light effects used by the arena stage: slashes, impacts, blades, rings, pillars, arrays.", "battle", {
            "slash_arc": art("assets/vfx/slash_arc.png", f"{FX_STYLE}{FX}A single wide crescent sword slash arc sweeping from lower left to upper right, a razor-thin brilliant white core with soft pale cyan glow, tapering to sharp points at both ends, fine motion streaks and a few tiny sparks along its edge, anime action effect.", (1024, 512), False),
            "slash_cross": art("assets/vfx/slash_cross.png", f"{FX_STYLE}{FX}Two crossing crescent sword slashes forming an X, brilliant white cores with pale cyan glow, sharp tapered ends, a bright flash where they cross, tiny sparks, anime action effect.", (768, 768), False),
            "impact": art("assets/vfx/impact.png", f"{FX_STYLE}{FX}A radial hit impact burst: an intense white star flash at the exact centre, long sharp light rays shooting outward in every direction, a thin expanding shockwave ring, scattered tiny sparks, anime hit effect.", (768, 768), False),
            "blade": art("assets/vfx/blade.png", f"{FX_STYLE}{FX}A single ethereal spirit sword made entirely of white and pale blue light, pointing straight down, a slender glowing translucent blade with a simple guard, a long fading light trail above it, centred, vertical, on a completely flat pure black background with no pattern, no checkerboard, no grid.", (384, 1024), False),
            "shard": art("assets/vfx/shard.png", f"{FX_STYLE}{FX}A single sharp glowing ice crystal shard pointing straight down, translucent cyan and white facets, cold mist trailing above it, centred, vertical.", (384, 768), False),
            "ring": art("assets/vfx/ring.png", f"{FX_STYLE}{FX}A wide flat elliptical shockwave ring of light seen from a low angle as if lying on the ground, a thin brilliant rim, faint inner glow, a few sparks flying off the rim, centred.", (1024, 512), False),
            "pillar": art("assets/vfx/pillar.png", f"{FX_STYLE}{FX}A vertical column of heavenly light descending from the top edge to the bottom edge, a blinding white core, soft gold and white glow around it, light motes rising, centred.", (512, 1024), False),
            "array": art("assets/vfx/array.png", f"{FX_STYLE}{FX}A glowing golden Taoist bagua array seen from straight above: concentric circles, an octagon of eight trigram symbols made of short broken and unbroken bars, a small yin-yang disc at the centre, thin bright gold lines on black, centred, symmetrical, no stars, no pentagrams, no hexagrams, no letters.", (1024, 1024), False),
            "flare": art("assets/vfx/flare.png", f"{FX_STYLE}{FX}A bright four-pointed star lens flare: a white core with long thin horizontal and vertical spikes and a soft round halo, centred.", (512, 512), False),
            "swirl": art("assets/vfx/swirl.png", f"{FX_STYLE}{FX}A spiralling vortex of spiritual energy: thin glowing white and pale jade ribbons of light swirling inward to a bright centre, small sparkles, centred.", (768, 768), False),
            "wind": art("assets/vfx/wind.png", f"{FX_STYLE}{FX}A horizontal gust of wind made only of long thin white and pale cyan streaks of light flowing from left to right, with curling wisps at the ends, centred; no sword, no blade, no weapon, no object, only streaks of light.", (1024, 384), False),
            # element variants (vfx.ts picks `<shape>_<element>` when painted, else the plain shape tinted)
            "burst_fire": art("assets/vfx/burst_fire.png", f"{FX_STYLE}{FX}An explosive burst of fire: a blinding yellow-white centre, curling tongues of orange and red flame bursting outward in every direction, glowing embers flying, anime fire effect, centred.", (768, 768), False),
            "burst_water": art("assets/vfx/burst_water.png", f"{FX_STYLE}{FX}A splash burst of glowing water: a bright white-cyan centre, a crown of luminous cyan water splashes and droplets spraying outward in every direction, thin spray streaks, anime water effect, centred.", (768, 768), False),
            "burst_wood": art("assets/vfx/burst_wood.png", f"{FX_STYLE}{FX}A burst of glowing spirit wood energy: a bright pale-green centre, luminous jade-green leaves and curling vine tendrils of light radiating outward in every direction, small sparkles, anime nature magic effect, centred.", (768, 768), False),
            "burst_earth": art("assets/vfx/burst_earth.png", f"{FX_STYLE}{FX}An explosion of earth energy: a bright golden centre, jagged rock fragments glowing with molten amber cracks and streaks of golden dust bursting outward in every direction, anime earth impact effect, centred.", (768, 768), False),
            "rock": art("assets/vfx/rock.png", f"{FX_STYLE}{FX}A single jagged boulder falling straight down, its cracks glowing bright molten amber and gold, a trail of glowing golden dust streaking above it, centred, vertical.", (384, 768), False),
            "flame": art("assets/vfx/flame.png", f"{FX_STYLE}{FX}A single tall flickering tongue of fire rising upward: a bright yellow-white base, orange and red flame tapering to a curling tip, a few embers, centred, vertical.", (384, 768), False),
            "lightning": art("assets/vfx/lightning.png", f"{FX_STYLE}{FX}A single jagged bolt of lightning striking straight down from the top edge to the bottom edge, a brilliant white core with violet and pale blue glow, thin forking branches, centred, vertical.", (512, 1024), False),
            "frost": art("assets/vfx/frost.png", f"{FX_STYLE}{FX}A cluster of jagged glowing ice crystals growing upward from the bottom edge, translucent cyan and white facets, cold mist, centred, wide and low.", (768, 512), False),
            "miasma": art("assets/vfx/miasma.png", f"{FX_STYLE}{FX}A swirling cloud of glowing toxic miasma: luminous acid-green and violet vapour wisps and small glowing bubbles, centred.", (768, 768), False),
            "dust": art("assets/vfx/dust.png", f"{STYLE}. A soft low cloud of light brown dust and a few small pebbles kicked up from the ground, seen from the side, wide and flat, only dust and pebbles, nobody in the picture: no person, no girl, no figure, no character, isolated on a plain background, no ground line, no text.", (768, 384), True),
        }),
        U("backdrop", "App backdrop", "Soft painted sky used behind the tab screens.", "shell",
          {"sky": art("assets/ui/backdrop_sky.png", f"{STYLE}. Full-screen vertical background: dreamy sky above a sea of clouds, distant floating mountains and pagodas in soft blue haze, pale pink cherry blossoms drifting at the edges, "
                      "calm and low-contrast so interface panels stay readable, no characters, no text.", (1080, 1920), False, ["refs/mockups/character_screen.png"]),
           "night": art("assets/ui/backdrop_night.png", f"{STYLE}. Full-screen vertical background: deep navy and violet night sky with stars and a faint aurora above a sea of clouds, distant floating mountains, "
                        "calm and low-contrast so interface panels stay readable, no characters, no text.", (1080, 1920), False, ["refs/mockups/save_slots.png"])}),
    ]

if __name__ == "__main__":
    write("content/ui/ui.json", ui())
