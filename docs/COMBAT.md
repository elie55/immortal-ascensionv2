# Combat engine

Implemented in `src/engine/combat/` (pure, deterministic) and driven by `src/engine/encounter.ts`
(nodes, dungeons, tribulations, duels). Every tunable lives in `content/meta/combat_rules.json`.
`tests/combat.test.ts` is the executable specification; `docs/ARCHITECTURE.md` covers the layering.

## Turn order

Each combatant has a turn gauge that fills by its effective Speed every tick; the first to reach the
threshold acts (ties → lower uid). Faster units therefore act first *and more often*. Speed debuffs
(Slow −30 %, Freeze −100 %) slow the gauge; a frozen or stunned unit skips its action when its turn
comes. A "round" is one player turn; battles time out after `turn.max_rounds`.

### Tempo (turn push and delay)

A technique's `turn_shift` (% of a turn) moves the gauge: enemies it hits are **delayed** by that much
(gauge −), allies or the caster it targets are **hastened** (gauge +); the gauge never goes below −1 turn.
Slow techniques (Frozen Lotus, the regional Tidal Pulse arts) delay 30–35 %; Swift Cloud Step hastens the
caster 60 %. `Battle.shiftTurn` emits `turn_shift` events and the turn-order strip re-sorts.

**Surge**: the player always carries a `surge` skill (`combat_rules.ultimate.surge_cost`, 40 charge) that
spends ultimate charge to act again at once (`surge_push_pct` 100 = a whole turn). It gives no charge
back; the auto rules reach it through the `surge` slot (default: when a big attack is coming, so the next
action can be the shield).

### Counters

A gear `counter` special answers a hit with chance `chance` at `value` % ATK. **Counter Stance**
(`status.counter_stance`, applied by Returning Tide Stance with `potency` = %) answers *every* hit while it
lasts. Counters use the defender's basic element and never trigger reactions themselves.

## Damage

```
hit      = clamp(ACC − EVA, hit_floor, 1)
raw      = (ATK + SP_Power·sp_power_weight) · power% · mastery · charged?
         · element multiplier · crit (crit_dmg%) 
         · ATK / (ATK + DEF·(1 − armor_pen%)·def_factor)
         · (1 ± variance) · side multiplier (dungeon modifiers)
final    = raw · (1 − dmg_red%)  → shield absorbs first → HP
```

Element multiplier: five-element cycle (attacker's element overcomes defender's: +25 %; the reverse:
−25 %), boss weaknesses (+30 %), plus the attacker's `elem_dmg.<x>` minus the defender's `elem_res.<x>`
and enemy `resistances`. Minimum 1 damage on a landed hit; Invulnerable makes it 0.

Healing uses `heal_pct` of the caster's max HP × (1 + heal_bonus of caster and target). Shields use
`shield_pct_max_hp` × (1 + shield_str), and never stack (the larger one stays).

## Resources

- **Spirit Energy (SP)** = `sp_energy` stat. Techniques cost `sp_cost`; +8 % of max per own turn and
  +6 per basic attack (`spirit_energy` rules). Silence allows basic attacks only.
- **Cooldowns** count down at the start of the owner's turn; `cdr` shortens them (min 1).
- **Ultimate gauge** 0–100: +12 per action, +40 × (damage taken / max HP), +20 per kill. An ultimate
  needs `ult_charge` and resets the gauge; it ignores SP and cooldown.
- **Mastery** scales technique power (`1 + level·per_level_bonus`); battles grant mastery XP to the
  method (100 %) and each equipped active technique (50 %).

## Status effects (content/world/status_effects.json)

Applied with `chance · (1 − status_res%)` for debuffs/control/DoTs (resistance capped at 75 %). Stacking
mode is per status: `refresh` resets duration, `stack` adds a stack up to `max_stacks`, `none` makes a
second application fail. DoTs tick at the end of the holder's turn: `pct_atk` × the applier's Attack per
stack, or `pct_max_hp` of the holder (negative = Regeneration heals). Freeze/Stun skip turns and
interrupt a boss's charged attack. Shield marks a shield pool; Reflect returns 20 % (or the status
potency / gear value) of damage taken; Invulnerable negates damage.

## Gear specials (`special_effects` on gear instances)

`on_hit_apply`, `on_crit_apply` (status with chance), `on_kill` (heal % max HP), `counter` (chance to
strike back for value % ATK), `sp_restore` (per own turn), `heal_on_turn` (% max HP per own turn),
`shield_on_battle_start` (% max HP), `reflect` (% reflected), `cooldown_reduction` (−N turns on every
cooldown), `stat_mult` / `elem_dmg` (folded into the combatant's stats).

## Bosses

Phases are sorted by `hp_threshold`; when a boss's HP ratio falls under the next threshold it enters that
phase: its preferred techniques switch, `summons` spawn (up to `turn.max_enemies` alive), `shield_pct` adds
a shield, `enrage` multiplies ATK/SPD, and `charged_attack` starts a telegraphed charge: the UI shows
"X in N turns"; after N boss turns the technique lands at `charged_attack_mult` power. A stun or freeze
cancels the charge. `weaknesses` add damage from those elements.

### Signature mechanics (`boss.signature`, schema/actors.ts `BossSignature`)

Every region sovereign (and the mega serpent) has one rule that changes how its fight is played; the arena
announces it by `name` (`signature` events), the node card and the boss intro show it, and `description`
tells the player the counter-play. Statuses a signature applies are forced (no resistance roll).

| kind | boss | rule | counter-play |
|---|---|---|---|
| guarded | Thousand-Node Bamboo Dragon | −70 % damage taken while a summon lives | kill the sprites first |
| fury | Molten Ape King | from round 8, +8 % ATK every player round | finish fast |
| break | Lotus Frost Queen | 30 % HP ice shield each phase; shattering it delays her a turn and leaves her Vulnerable (+30 % dmg taken) 2 turns | burst the shield, then the body |
| riposte | Sword Sovereign's Remnant | every 3rd hit taken answered at 120 % ATK | few heavy hits, not multi-hit flurries |
| drain | Crimson Moon Matriarch | heals 35 % of damage dealt | shields starve her |
| ward | Celestial Stair Guardian | attuned element rotates every 3 of its turns; that element heals it (50 % of the raw hit) | switch elements |
| quake | Heavenly Gate Keeper | every 3rd turn opens with 90 % ATK on the whole party | keep shields up for the third turn |
| mark | Nine-Bolt Thunder Emperor | brands one ally; 3 boss turns later it detonates at 120 % ATK (a shield absorbs it) | shield the branded (the auto rules treat a brand as a big attack) |
| tide | Drowned Dragon Lord | High Tide (+25 SPD, +15 ATK) / Low Tide (−30 DEF, −15 SPD) alternate every 3 rounds | burst at low tide |
| curse | Starfall Pharaoh | every 5th turn: no healing on the party for 2 turns | heal before, shield through |
| rebirth | Vermilion Gatekeeper (and the Abyss Serpent, 25 %) | rises once at 30 % HP | keep an ultimate for the end |
| rend | White Tiger Sovereign | consecutive hits on one ally stack Rend (+10 % dmg taken, ×5) | make it switch targets (shields, taunts) |
| measure | Arbiter of Ten Thousand Laws | no hit takes more than 12 % of its max HP | many strikes beat one |
| answer | Remnant of the First Emperor | an ally's ultimate gives it a turn at once (gauge +100 %) | ult when it is delayed or controlled |

The validator knows which statuses each kind applies (`tools/lib/rules.ts` SIGNATURE_STATUSES).

## Big-attack warnings (telegraphs)

Elites (enemy `kind: "elite"`) and bosses announce their big attacks one turn ahead, the "intent" way
(`combat_rules.telegraph`). At battle start and at the end of each of their turns, `Battle.planNext` asks the
enemy AI what it would do at the start of its next turn (cooldowns one lower, spirit energy regenerated). When
that move is a technique whose expected damage (`Battle.estimate`: no variance, crit averaged, defence, damage
reduction and multipliers applied, before shields) reaches `heavy_pct` (30 %) of the max HP of the player or a
Dao companion it targets (spirit beasts are not judged: their small pool would flag everything), it is locked
in as `Combatant.telegraph` and a `telegraph` event is emitted. On the enemy's next turn the locked move lands
as planned (`action.heavy = true`). Because the move is the one the AI would have picked anyway and lands on
the same turn, the warning changes nothing in the balance (simulator: mean win-rate change −0.1 point, within
seed noise). Stun, freeze or silence on the enemy cancels it (`interrupt` event), like a boss charge.

The battle screen shows a red banner under the enemy panel ("Blazing Comet · NEXT TURN · ≈34 % of your HP ·
shield, heal or stun to stop it"), a red glow and "!" on the enemy, a red pulse on the threatened ally and its
card, red screen edges when the player is targeted and a "!" in the turn-order strip. The auto-battle condition
`big_attack` ("Big attack coming") is true while any enemy has a telegraph or a boss charge lands next turn; the
default preset raises a shield then.

## AI

- **Player and allies**: a priority list of rules (`combat.presets[active].rules`), each
  `{slot, when, value, target}`. Slots are loadout positions (`a0`–`a3`, `ultimate`, `beast`, `surge`) or roles
  (`heal`, `shield`, `damage`, `debuff`, `tempo`, `basic`); conditions `always | hp_below | ally_hp_below | sp_above |
  ult_above | boss_only | no_shield | enemies_at_least | big_attack | can_finish | element_edge | never`; targets
  `default | lowest_hp | highest_cp | weakest | strongest | focus | weak_to`. `can_finish` holds when a damaging
  technique can kill an enemy this turn (estimate ≥ HP + shield) and `focus` aims at that enemy; `element_edge`
  holds when a technique has the element advantage on a living enemy and `weak_to` aims at it. The first rule whose
  condition holds and whose slot has a usable technique acts. Default preset: surge when a big attack is coming →
  heal under 45 % HP → heal a companion under 35 % → shield when a big attack is coming → finish a killable enemy →
  ultimate on bosses or 3+ enemies (held otherwise, so it is there for the boss wave) → shield when unshielded →
  element-advantaged technique on the enemy weak to it → strongest technique on the focus → basic attack.
- **Manual mode**: the battle pauses on the player's turn (`Battle.pending`); the UI calls `act()`.
- **Companion stances** (`companions.stance[npc]`, set from the Dao Companions list): guard plays the support
  strategy, burst the caster strategy, balanced the companion's own role (`companions.ts` STANCE_AI).
- **Elites** carry a third art — Guard Stance (counter stance) in odd regions, Wind Step (self haste) in even ones —
  and every strategy braces when hurt and steps on its first turn when it has those arts (`ai.ts` attack()).
- **Defeat lessons**: the battle screen tallies what hurt the party (source × art, signature firings, control turns,
  damage over time, element) and the defeat panel says what beat you and the counter-play ("What beat you").
- **Enemies** by strategy, with three shared habits: **focus fire** (the side keeps hitting the ally it started
  on, the most fragile non-beast, until it falls: `Battle.focus`), **element-aware choice** (the technique with the
  highest expected damage on the chosen target, AoE summed over the party), and **ultimate timing** (a boss holds its
  ultimate until a later phase or an unshielded target under 70 % HP; others fire when a target is bare). Strategies:
  aggressive (focus), berserker (highest attack target), defensive (heal/shield under 50 %/70 %), support (heal an
  ally under 55 %, shield the most hurt bare ally), trickster (debuffs targets lacking them, random targets, but
  finishes a killable one), caster/guardian (highest-CP target; guardian shields itself first). Every strategy takes a
  kill when a technique can finish a non-beast target. `BattleOptions.legacyAi` keeps the previous behaviour for
  `tools/balance/ai_eval.ts`, which measures both (tools/balance/out/ai_eval.md): on the fitted archetype the
  new rules win ≈ the same share of fights overall (70 % vs 69 % on 45 nodes) with clear gains where finishing and
  holding the ultimate matter (Sword Tomb boss 22 → 47 % on 32 seeds); the enemy pass changes no single-target fight
  and only shows where enemies have several elements or allies to pick from.

## Encounters

| Source | Waves | Costs / limits | On victory | On defeat |
|---|---|---|---|---|
| Node (battle/elite/boss) | `node.waves` | `energy_cost`; locked until a neighbour is cleared | enemy loot tables, first-clear rewards, hidden-node reveal, region discovery, `node_cleared` | HP set to 30 %, nothing lost |
| Dungeon (resource/challenge/mega) | `dungeon.waves` | entry unlock, `energy_cost`, `daily_limit` | per-wave loot, clear loot, first-clear rewards, `trialsCleared` | same |
| Tribulation | 1 battle vs the spirit, lightning each round, wave escalates every `turns_per_wave` rounds | cooldown after failure | survive all waves (or defeat the spirit): `passedAt`, rewards | Qi loss %, retry cooldown |
| Duel (NPC) | 1 | `cooldown_min` | `duel.win` rewards | `duel.lose` rewards |
| Event battle | outcome's enemies | event energy | event node cleared | — |

HP, SP and ultimate carry between waves; loot is granted after each wave so a quit mid-dungeon keeps it.
Outside battle HP recovers `recovery.hp_pct_per_min` per minute.

## Caps, speed and control (balance pass)

Every percentage stat is capped in combat (`combat_rules.caps`: crit 75, eva 60, acc 150, cdr 50, dmg_red 60,
life steal 35, armor pen 60, elemental difference ±60 …). Speed is compressed in the turn gauge
(`1 + (spd − 1)^0.7 · 10^0.3`) and enemies' speed follows the player's curve per region, so speed matters without
deciding fights. After a stun/freeze/silence wears off the unit is immune to control for 2 turns (bosses 3), and
bosses resist control at ×0.5 chance. Freeze skips the turn and slows the thawed unit by 25 % (it no longer
zeroes speed).

## Balance

Targets, archetypes and results: `docs/qa/BALANCE_MODEL.md` and `docs/qa/BALANCE_SIMULATION_RESULTS.md`.
`tests/balance.test.ts` guards them; `node tools/balance/sim.ts` prints the full tables.
