# Combat engine

Implemented in `src/engine/combat/` (pure, deterministic) and driven by `src/engine/encounter.ts`
(nodes, dungeons, tribulations, duels). Every tunable lives in `content/meta/combat_rules.json`.
`tests/combat.test.ts` is the executable specification; `docs/ARCHITECTURE.md` covers the layering.

## Turn order

Each combatant has a turn gauge that fills by its effective Speed every tick; the first to reach the
threshold acts (ties → lower uid). Faster units therefore act first *and more often*. Speed debuffs
(Slow −30 %, Freeze −100 %) slow the gauge; a frozen or stunned unit skips its action when its turn
comes. A "round" is one player turn; battles time out after `turn.max_rounds`.

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

## AI

- **Player and allies**: a priority list of rules (`combat.presets[active].rules`), each
  `{slot, when, value, target}`. Slots are loadout positions (`a0`–`a3`, `ultimate`, `beast`) or roles
  (`heal`, `shield`, `damage`, `debuff`, `basic`); conditions `always | hp_below | sp_above | boss_only |
  no_shield | enemies_at_least | never`; targets `default | lowest_hp | highest_cp | weakest | strongest`.
  The first rule whose condition holds and whose slot has a usable technique acts. Default preset:
  ultimate → heal under 50 % HP → shield when unshielded → strongest damage technique on the lowest-HP
  enemy → basic attack.
- **Manual mode**: the battle pauses on the player's turn (`Battle.pending`); the UI calls `act()`.
- **Enemies** by strategy: aggressive (strongest technique on the lowest-HP target), berserker (highest
  attack target), defensive (heal/shield under 50 %/70 %), support (heal hurt allies, shield bare ones),
  trickster (debuffs targets lacking them, random targets), caster (highest-CP target), guardian (shield
  self first). Enemies with ultimates use them when charged.

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

## Balance baseline (starting gear, Battle sim in tests)

A fresh Lin beats one Field Bandit ≥ 80 % of the time and never a Core Formation boss. At each region's
realm (stage 5) with starting gear she wins 50–100 % against that region's normal enemies, which leaves
room for gear and technique upgrades to matter. Tuning happens in `combat_rules.json` and the content
generators, not in code.
