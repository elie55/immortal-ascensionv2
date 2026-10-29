# Immortal Ascension — working rules for Claude

Offline Android xianxia cultivation RPG (JavaScript/TypeScript + Capacitor).
Specs, checklist and mockups are provided by the owner (Elie).

## Model and effort switching (owner's standing instruction)

The owner switches model/effort manually; Claude cannot. Claude MUST tell the owner
**before starting a task** when a switch is needed, then wait for a reply before starting:

> **Next: <task>. Switch to <model> + <effort>, then say "go".**

Also say when it is fine to switch back down, so Fable usage is not wasted.
If a task gets stuck (same bug survives 2+ attempts), stop and suggest switching up.

**Use Fable 5.1 only when it is the most pertinent.** Default is Opus 5.5.

| Work | Model + effort |
|---|---|
| Architecture, database/schema design, save system design | Fable 5.1 + High |
| Combat engine core, progression/balancing math across realms | Fable 5.1 + High |
| Hard bugs Opus could not fix after 2 attempts | Fable 5.1 + High |
| Normal feature code, screens matching mockups, systems integration | Opus 5.5 + High |
| Bulk content entries in an established format, art batch runs, small fixes | Opus 5.5 + Medium |

Owner is on the Max 20x plan; still avoid unnecessary Fable usage.

## Database: everything must be interconnected (owner's standing instruction)

The content database is fully referential. Nothing may point to something that does not exist,
and nothing may exist without a purpose and a way to obtain it.

- Every entity has a stable unique ID (e.g. `item.ore.spirit_iron`, `enemy.azure_bamboo_wolf`).
  Cross-references use IDs only, never names.
- **Quests** may only reference existing enemies, items/materials, NPCs, locations, techniques,
  realms and other quests (prerequisites/chains).
- **Crafting / alchemy / forging recipes** may only use existing materials and produce existing items;
  every recipe must have an existing unlock source (blueprint, NPC, rank...).
- **Loot tables** (enemies, bosses, dungeons, chests, nodes) may only drop existing materials and gear,
  and only gear of rarities allowed there (Divine: Mega Dungeons only).
- **Shops, gifts, rewards, achievements, spirit beast evolution, sect promotions, dungeon unlocks,
  technique requirements, breakthrough requirements, NPC relationship requirements** — same rule.
- Reverse rule: every item/material must have at least one acquisition source AND at least one use
  (crafting, quest, gift, consumption, selling counts only for junk). Every enemy appears somewhere.
  Every quest is completable from a reachable state.
- Every entry has an art block (file path, prompt, reference images, status).
- A validator script checks all of the above and must pass before any commit that changes content
  (run in CI too). Broken or orphaned references are build errors, not warnings.

## Art pipeline

- ComfyUI Desktop on the owner's PC (RTX 3080 10 GB, 32 GB RAM).
- Main model: **Qwen-Image-Edit 2511** (fp8, Lightning 4-step merged), chosen after a side-by-side
  test vs Animagine XL 4.0 and GuoFeng 4.2 XL. Use it for all game art, using mockup crops as references.
- Every database entry carries an art block (file path, prompt, reference images, status);
  art is generated from the database, never ad hoc.
