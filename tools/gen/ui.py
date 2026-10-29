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
                             (1080, 1920), False, [LIN_REF, "refs/mockups/cultivation_screen.png"])}),
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
        U("backdrop", "App backdrop", "Soft painted sky used behind the tab screens.", "shell",
          {"sky": art("assets/ui/backdrop_sky.png", f"{STYLE}. Full-screen vertical background: dreamy sky above a sea of clouds, distant floating mountains and pagodas in soft blue haze, pale pink cherry blossoms drifting at the edges, "
                      "calm and low-contrast so interface panels stay readable, no characters, no text.", (1080, 1920), False, ["refs/mockups/character_screen.png"]),
           "night": art("assets/ui/backdrop_night.png", f"{STYLE}. Full-screen vertical background: deep navy and violet night sky with stars and a faint aurora above a sea of clouds, distant floating mountains, "
                        "calm and low-contrast so interface panels stay readable, no characters, no text.", (1080, 1920), False, ["refs/mockups/save_slots.png"])}),
    ]

if __name__ == "__main__":
    write("content/ui/ui.json", ui())
