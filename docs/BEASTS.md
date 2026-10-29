# Spirit beasts and Dao companions

Engine: `src/engine/beasts.ts`, `src/engine/companions.ts`. Tunables: `cultivation_rules.beasts` and
`cultivation_rules.dao`. Spec: `tests/beasts.test.ts`. Screen: Cultivate → Spirit Beasts, or the Spirit Beast
Garden in the sect (mockup `spirit_beasts`).

## Eggs

An egg goes into one of `incubators` (2). It hatches after `hatch_wins` battles won (adventure nodes, events,
dungeons), never from waiting (mockup rule). Eggs may require a realm or items. A new disciple starts with
YunYun's egg (4 wins). The first hatched beast becomes the active companion.

## Growth

| Activity | Effect |
|---|---|
| Feed | food XP (×`preferred_food_mult` for favourite food or matching element) and food bond points |
| Play | +`play.bond` bond, once per `play.cooldown_min` per beast |
| Train | spends `train.energy` adventure energy for `train.xp_pct` % of the next level |
| Battle won | active beast gets `battle_xp_share` × the battle's mastery XP (min 5) and `battle_bond` |
| Evolve | at the next stage's `level_required`, with its materials and stones |

XP to the next level = `xp_base · level^xp_exp`. A beast cannot level past the next stage's required level
until it evolves (last stage: `max_level`); extra XP is banked for one level and flows on after evolving.
Bond level L → L+1 costs `bond_per_level · (L+1)` points; the beast's `bond.milestones` add stats to the
player while it is active. The active beast also adds its stage passive and its `cultivation_bonus` to Qi.

## Dao companions

NPCs with `dao_companion.eligible` can be asked once the relationship reaches level
`dao.affinity_level` (4, "Dao Companion"). Bonded companions give ×`dao.qi_mult` dual cultivation. Up to 2
are active; they join adventure nodes and events (1 slot) and dungeons that allow a party
(`entry.party.max_companions`, mega dungeons 2). Tribulations, duels and tournaments are faced alone.
Companion stats keep their content profile's ratios, scaled so their HP is `dao.stat_scale` × the player's;
their AI follows their role (dps aggressive, support, tank guardian, control trickster).
