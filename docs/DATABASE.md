# Immortal Ascension — Content Database Design

This document is the contract for every piece of game content. The code that loads,
validates and renders content follows it; content authors (human or Claude) follow it;
`npm run validate` enforces it.

## 1. Principles

1. **Data, not code.** All content lives in JSON under `content/`. Game rules read it; nothing is
   hard-coded in screens.
2. **Stable IDs.** Every entity has a unique, permanent ID. Saves, quests, loot and art all point at
   IDs. Renaming an entity never changes its ID.
3. **Fully referential.** Any reference must resolve to an existing entity of the right type
   (forward rule) and every entity must be reachable and useful (reverse rule). Violations are
   build errors.
4. **Art is part of the record.** Every visible entity carries an `art` block describing the image(s)
   it needs, the prompt, the reference images and the production status. Art is generated from
   the database, never ad hoc.
5. **One schema, two uses.** The same zod schemas type-check the data at build time and in the
   validator; the game imports the inferred TypeScript types.

## 2. ID conventions

Format: `<prefix>.<segment>(.<segment>)*`, lowercase `a-z0-9_`, dot-separated.
The first segment is the entity type and decides which registry the ID lives in.

| Prefix | Entity | Example |
|---|---|---|
| `realm.` | Cultivation realm (9 stages each) | `realm.qi_condensation` |
| `elem.` | Element | `elem.fire` |
| `root.` | Spiritual root | `root.wood_water_dual` |
| `status.` | Combat status effect | `status.burning` |
| `method.` | Cultivation method (passive Qi) | `method.azure_cloud_breathing` |
| `tech.` | Combat technique (`tech.active.*`, `tech.passive.*`, `tech.ult.*`) | `tech.active.azure_strike` |
| `btech.` | Spirit-beast ability | `btech.yunyun.cloud_fox_howl` |
| `mat.` | Material (ore, herb, flower, monster part, crystal, fragment, enhancement, breakthrough) | `mat.spirit_iron_ore` |
| `cons.` | Consumable (pill, elixir, food) | `cons.qi_gathering_pill` |
| `gift.` | Gift item | `gift.candied_hawthorn` |
| `book.` | Manual that teaches a technique/method | `book.flame_palm_manual` |
| `blueprint.` | Forge blueprint / alchemy recipe scroll | `blueprint.rimeglass_spear` |
| `qitem.` | Quest item | `qitem.elder_wen_token` |
| `egg.` | Spirit-beast egg | `egg.flame_fox` |
| `bfood.` | Spirit-beast food | `bfood.spirit_fruit` |
| `junk.` | Sell-only item (no use required) | `junk.cheap_junk_loot` |
| `gear.` | Equipment **base** (kind of item; instances roll stats — see `docs/GEAR.md`) | `gear.rimeglass_spear` |
| `set.` | Equipment set | `set.rimeglass` |
| `enemy.` | Normal/elite enemy | `enemy.azure_bamboo_wolf` |
| `boss.` | Boss | `boss.thousand_node_bamboo_dragon` |
| `beast.` | Spirit-beast companion species (with evolution stages) | `beast.yunyun` |
| `npc.` | Named character (incl. tournament opponents) | `npc.tang_xiaoman` |
| `region.` | Adventure region | `region.azure_bamboo_forest` |
| `node.` | Adventure node: `node.<region>.<name>` | `node.azure_bamboo_forest.silk_strung_grove` |
| `dungeon.` | Any dungeon (kind: resource / challenge / secret_realm / mega / tower / tribulation) | `dungeon.heaven_piercing_tower` |
| `tribulation.` | Heavenly tribulation encounter | `tribulation.foundation_establishment` |
| `sectloc.` | Sect location | `sectloc.mission_hall` |
| `rank.` | Sect rank | `rank.outer_disciple` |
| `shop.` | Shop / merchant inventory | `shop.merchant_pavilion` |
| `loot.` | Loot table | `loot.enemy.azure_bamboo_wolf` |
| `alchemy.` | Alchemy recipe | `alchemy.qi_gathering_pill` |
| `forge.` | Forge crafting recipe (blueprint output) | `forge.rimeglass_spear` |
| `quest.` | Quest (any type) | `quest.mission.frost_beast_cores` |
| `ach.` | Achievement | `ach.cultivation.foundation_laid` |
| `tournament.` | Tournament definition | `tournament.outer_sect_1` |
| `story.` | Story scene: `story.<chapter>.<scene>` | `story.prologue.entrance_gate` |
| `event.` | Random/hidden event | `event.moon_pool_spring` |
| `title.` | Cosmetic title (achievement reward) | `title.path_of_the_cultivator` |

**Item IDs** (stackable) = any of `mat. cons. gift. book. blueprint. qitem. egg. bfood. junk.`
**Gear** is never referenced as an item: it is granted as `{base, rarity, ilvl}` (a *GearGrant*) or dropped
from a loot *gear entry* (base or pool + rarity weights + the table's ilvl band). See `docs/GEAR.md`.
**Rewards** = `items[]` + `gear[]` + `techniques[]` + `beasts[]` + `titles[]` + currencies.

## 3. Shared blocks

### 3.1 Rarity (8, ordered)
`common < uncommon < rare < epic < legendary < mythic < immortal < divine`
- Refinement may raise rarity only up to **mythic**.
- **divine** gear may appear only in loot tables of `dungeon` entries with `kind: "mega"`.

### 3.2 Attributes
`hp atk def spd crit crit_dmg acc eva sp_power sp_energy` (core)
`armor_pen life_steal heal_bonus shield_str cdr dmg_red status_res` (secondary)
`elem_dmg.<elem> elem_res.<elem>` (per element)

### 3.3 Art block
```json
"art": {
  "icon": {
    "file": "assets/items/mat/spirit_iron_ore.png",
    "size": [256, 256],
    "transparent": true,
    "prompt": "…",
    "negative": "…",
    "references": ["refs/mockups/inventory_icons.png"],
    "status": "planned"            // planned | generated | approved
  }
}
```
Required art keys per entity type:

| Type | Keys |
|---|---|
| item (all item prefixes) | `icon` |
| gear base | `rarities.<r>.art.icon` for every rarity in `rarity_range` (distinct design per rarity) |
| tech / method / btech | `icon` |
| status | `icon` |
| enemy | `icon`, `battle` (full body, transparent) |
| boss | `icon`, `battle`, `intro` (boss intro splash) |
| beast | `icon`, `battle` per evolution stage (`battle_<stage>`), `egg` via `egg.` item |
| npc | `portrait`, `full_body`, `expression_<name>` for each listed expression; `battle` if duelable |
| region | `card`, `map` (node map background), `battle_bg` |
| node (optional) | `thumb` |
| dungeon | `card`, `battle_bg` (+ `map` for secret realms) |
| sectloc | `background` |
| realm | `breakthrough_bg` |
| root | `illustration` |
| story scene | `cg` (full-screen illustration) |
| ach / quest | `icon` |
| set | none (uses member gear) |

The art job exporter turns every `status: "planned"` asset into a ComfyUI job.

### 3.4 Localised text
All player-facing strings are plain English in the data for now (`name`, `description`, `lore`),
plus an optional `name_cn` (decorative Chinese used in mockup headers). A later pass can move them
to `i18n/en.json` keyed by ID; the schema already keeps text in dedicated fields to allow that.

## 4. Entity schemas (fields that carry references)

Only reference-carrying and rule-carrying fields are listed; see `schema/*.ts` for full shapes.

| Entity | Reference fields |
|---|---|
| **realm** | `major_breakthrough.requirements[]` → items (with qty), `tribulation?` → `tribulation.`, `trial?` → `dungeon.`/`boss.`; `unlocks[]` → any |
| **root** | `elements[]` → `elem.`; `transform_opportunities[]` → `event.`/`dungeon.`/`quest.` |
| **status** | none out; must be used by ≥1 tech/gear effect/enemy/boss |
| **method** | `requirements.realm` → `realm.`, `requirements.rank?` → `rank.`, `requirements.root_elements?` → `elem.`; `sources[]` (see §5) |
| **tech** | `element` → `elem.`, `applies[]` → `status.`, `requirements` as method; `sources[]` |
| **btech** | `beast` → `beast.`, `applies[]` → `status.` |
| **items** | `effects?` (consumable) → `status.`/attribute; `teaches` (book) → `tech.`/`method.`; `unlocks` (blueprint) → `forge.`/`alchemy.`; `hatches_into` (egg) → `beast.`; `feeds` (bfood) → beast element filter |
| **gear base** | `slot`, `set?` → `set.`, `main_value`, `signature_affix` (must be in the slot's affix pool), `rarity_range`, `droppable`/`drop_tags` (pool filters), `unique` + `special_effects[]` (→ `status.`), `awakening` (materials → items), `rarities{}` → art only. Stats come from `equipment/rules.json`. |
| **set** | `pieces[]` → 3–5 `gear.` bases (each must declare the set), bonuses → `status.`/attributes |
| **enemy / boss** | `element` → `elem.`, `techniques[]` → `tech.`, `loot` → `loot.`, boss: `phases[].techniques[]`, `summons[]` → `enemy.` |
| **beast** | `element` → `elem.`, `stages[]` each: `evolve_materials[]` → items, `active` → `btech.`, `passive` → `btech.`; `food[]` → `bfood.`; `sources[]` |
| **npc** | `location?` → `sectloc.`/`node.`, `gifts.{loved,liked,disliked}[]` → items, `topics[].unlock` (affinity level), `quests[]` → `quest.`, `duel.loadout[]` → `tech.`, `shop?` → `shop.`, `dao_companion` (bool + `battle` art) |
| **region** | `unlock` → `region.`/`quest.`/`realm.`/`sect_fame`, `nodes[]` → `node.`, `boss` → `boss.`, `materials[]` → `mat.` (regional drops summary; validated against actual loot) |
| **node** | `region` → `region.`, `kind`, `connections[]` → `node.` (same region), `enemies[]` / `boss` / `gather[]` → items, `chest` → `loot.`, `event` → `event.`, `shop` → `shop.`, `secret_realm` → `dungeon.`, `story` → `story.`, `cultivation_bonus` |
| **dungeon** | `kind`, `entry` (→ `realm.`/`rank.`/`quest.`/`region.`), `floors[]`/`waves[]`/`nodes[]` → `enemy.`/`boss.`, `rewards` → `loot.`, `first_clear` → rewards, `modifiers[]`, `companions_allowed` (mega) |
| **tribulation** | `realm` → `realm.`, `waves[]` (lightning stats), `failure` consequence, `rewards` → `loot.` |
| **sectloc** | `unlock` → `rank.`/`sect_fame`, `npcs[]` → `npc.`, `shop?` → `shop.`, `actions[]` (recipes/quests boards) |
| **rank** | `order`, `fame_required`, `promotion.quests[]` → `quest.`, `promotion.trial?` → `dungeon.`/`tournament.`, `benefits` |
| **shop** | `stock[]` → `{id}` items/techs or `{gear: GearGrant}` with price + `unlock`, `owner?` → `npc.` |
| **loot** | `ilvl: [min,max]` band; `entries[]` → item entries `{id, chance, qty}` or gear entries `{gear: {base}｜{pool}, rarity_weights, chance}`; `guaranteed[]`, `guaranteed_gear[]`; currency ranges |
| **alchemy** | `ingredients[]` → `mat.`/`cons.`, `output` → `cons.`, `unlock` → `blueprint.`/`rank.`/`npc.`/`quest.`/`known`, `furnace_min`, `proficiency_min` |
| **forge** | `ingredients[]` → `mat.`, `output` → GearGrant `{base, rarity, ilvl}`, `unlock` as alchemy, `fame_required` |
| **quest** | `type`, `giver?` → `npc.`/`sectloc.`, `prereqs` (→ `quest.`/`realm.`/`rank.`/npc affinity), `objectives[]` (typed, see below), `rewards` → rewards, `next?` → `quest.`, `turn_in` → `npc.`/`sectloc.`/screen route |
| **ach** | `condition` (typed; refs as objectives), `rewards` |
| **tournament** | `entry` (rank/fame), `rounds[]` → `npc.` opponents with `loadout[]` → `tech.`, `round_rewards`, `champion_rewards`, `loss_penalty`, `reentry` |
| **story scene** | `chapter`, `trigger` (quest/realm/region), `speakers[]` → `npc.`, `choices[].effects` (affinity → `npc.`, rewards), `unlocks[]` → any, `next?` → `story.` |
| **event** | `where[]` → `node.`/`dungeon.`, `outcomes[]` → rewards/`status.`/root transform |

### Quest objective types
`defeat(enemy|boss, count)` · `collect(item, count)` · `deliver(item, count, to npc|sectloc)` ·
`reach_realm(realm, stage)` · `learn(tech|method)` · `win_duel(npc)` · `refine(alchemy, count)` ·
`craft(forge, count)` · `clear(dungeon|node)` · `explore(region, nodes)` · `gift(npc)` ·
`affinity(npc, level)` · `rank(rank)` · `tournament(tournament, round)` · `hatch(beast)` ·
`evolve(beast, stage)` · `meditate(minutes)` · `visit(sectloc)`

Each objective type maps to a **screen route** so "tap tracked quest → correct screen" is data-driven
(`routes.ts` in the game maps objective type + target to a navigation target).

## 5. Acquisition sources (how the reverse rule is satisfied)

An entity "has a source" if at least one of these references it:

| Entity | Counts as a source |
|---|---|
| item | `loot.` entry (where that loot table is itself referenced), `shop.` stock, `alchemy` output, `quest.rewards`, `ach.rewards`, `node.gather`, `event.outcomes`, `tournament` rewards, `story.unlocks`, `rank.benefits`, `starting_inventory` |
| gear (base × rarity) | a GearGrant anywhere (shop, forge, any `rewards.gear`, starting equipment), a loot gear entry naming the base or a pool it matches, **or refinement** from the rarity below (≤ mythic). Immortal/divine therefore always need a direct source. |
| tech / method | `sectloc` pavilion stock (shop with tech entries), `book.teaches`, `quest.rewards`, `loot.` (as drop), `story.unlocks`, `npc` training, `rank.benefits` |
| beast | `egg.hatches_into` (egg must have a source), `quest.rewards`, `event.outcomes`, `loot.` |
| enemy / boss | appears in ≥1 `node`, `dungeon`, `tribulation` (lightning spirit), or boss summon list |
| npc | referenced by ≥1 `sectloc`, `node`, `quest`, `story`, `tournament` |
| region | start region, or unlock chain from a reachable region/quest/realm |
| dungeon | referenced by `node.secret_realm`, dungeon hub list (`kind` ≠ secret_realm), or rank/quest unlock |
| quest | prerequisites all reachable (graph acyclic, roots have no prereq or realm/rank-only prereq) |
| recipe | `unlock` resolves to a reachable blueprint/rank/npc/quest or `known` |
| shop / loot | referenced by ≥1 owner |
| status | used by ≥1 tech/btech/gear effect/boss phase |

An item "has a use" if at least one of: recipe ingredient, quest objective (collect/deliver),
listed in any NPC gift preference (or category `gift.` is accepted by all NPCs as neutral),
consumable with effects, equipable gear, book/blueprint/egg/bfood by nature, breakthrough
requirement, beast evolution material, enhancement material (declared via `enhancement_tier`),
or prefix `junk.`.

## 6. Semantic rules (beyond references)

- Rarity order respected everywhere; `divine` gear only in loot tables owned exclusively by `mega` dungeons
  (never shops, forge, rewards). Every GearGrant's rarity lies inside its base's `rarity_range`.
- A loot pool must have, for every weighted rarity, at least one droppable base that can be that rarity.
- `equipment/rules.json` must satisfy the ordering guarantees in `docs/GEAR.md` (checked for every ilvl).
- Loot ilvl bands should match the owning region's band (warning).
- Every slot has at least one base at every rarity (coverage; strict mode only).
- Realm stages are 1–9; `reach_realm` objectives respect that; realms are strictly ordered 1–15.
- Node connections are intra-region and symmetric; every node is reachable from the region entry.
- Quest prerequisite graph and story `next` chains are acyclic.
- Tournament rounds reference distinct opponents with CP that rises per round.
- Shop prices > 0; sell values ≤ buy prices; stack limits positive.
- Enhancement +1…+15 costs table exists for each rarity; refinement success table ends at mythic.
- Loot table weights > 0; drop chances in (0, 1].
- Every entity has all required art keys; `generated`/`approved` assets must exist on disk.

## 7. Validation report

`npm run validate` prints: errors (fail), warnings, and a **content-targets table** comparing counts
to the spec targets (15 realms, 15 regions, 20+ dungeons, 5+ mega dungeons, 150+ encounters,
40+ bosses, 30+ active techs, 20+ passives, 20+ methods, 150+ gear items, 60+ enemy types,
20+ beasts, 100+ quests). Targets are informational until the content-fill phase closes them.

## 8. File layout

```
content/
  world/        realms.json elements.json roots.json status_effects.json
  techniques/   methods.json active.json passive.json ultimate.json beast_abilities.json
  items/        materials.json consumables.json gifts.json books.json blueprints.json
                quest_items.json eggs.json beast_food.json junk.json
  equipment/    bases/*.json  sets.json  rules.json  enhancement.json  refinement.json  reforge.json
  enemies/      <region>.json (enemies+bosses grouped by region) tribulation.json
  beasts/       beasts.json
  npcs/         npcs.json
  adventure/    regions.json  nodes/<region>.json  events.json
  dungeons/     dungeons.json tribulations.json
  sect/         locations.json ranks.json tournaments.json
  economy/      shops.json loot/*.json  recipes/alchemy.json recipes/forge.json
  quests/       main.json missions.json npc.json adventure.json cultivation.json ... 
  achievements/ achievements.json
  story/        <chapter>.json
  meta/         starting_state.json content_targets.json
schema/         zod schemas + inferred types (imported by game and validator)
tools/          validate.ts  export-art-jobs.ts
tests/          validator fixtures
```
