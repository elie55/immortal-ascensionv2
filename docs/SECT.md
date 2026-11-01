# Sect systems

Engine modules are pure and deterministic (state + content + injected `now`, RNG from the save).
`tests/sect.test.ts` is the executable specification; the browser tour visits every screen below.

## Progression (`src/engine/progression.ts`)

- **Counters.** Every countable event increments `progress.counters` (`kills:<enemy>`, `clears:<node|dungeon>`,
  `gifts:<npc>`, `refines:<recipe>`, `talk:<npc>:<topic>`, `visits:<place>`, `meditation_minutes`, totals such
  as `enemies_defeated`). A quest stores each counter's value when accepted, so only progress made after
  accepting counts. Live objectives (realm, items in the bag, rank, explored nodes, affinity) are evaluated
  on demand.
- **Quests.** Status: locked → available → active → ready → done (or cooldown for repeatables). Givers
  `system` auto-accept; `turn_in: auto` completes automatically; deliver/collect(consume) take the items;
  `next` chains accept the follow-up.
- **Sweep.** After every batch of events `Game` runs a sweep: auto-accept and auto-turn-in, announce ready
  quests once, unlock achievements, promote ranks, queue story scenes whose trigger is met
  (`quest_complete`, `quest_accept`, `realm_reached`, `region_enter` via visits, `affinity`). Quiet ticks
  sweep every 5 s. The UI plays queued scenes when nothing is on top of a tab.
- **Ranks.** Next rank needs its fame, its promotion quests and its trial (tournament or dungeon).

## Today's board (`engine/daily.ts`, `screens/today.ts`)

Five daily tasks counted from `daily.counters` (`d:*`, reset with the day): turn in 2 Mission Hall requests, win 8
map battles, clear a dungeon, fight a tournament round, gather 3 times. Four of five claim the day's reward:
`150·n²` stones, `20 + 5n` Contribution and 3 refining stones, n the furthest region opened. The systems bump the
counters themselves (`bumpDaily` in progression.ts, encounter.ts, nodes.ts). The panel sits on the Cultivate page;
its sheet has a Go per task.

## Meditation Waterfall sessions (`cultivation.ts`)

`cultivation_rules.meditation_session`: spirit stones buy a timed Qi boost (`qi_bonus_pct`, 50 %) for 15 minutes
or more in steps of `step_minutes`; the longest allowed session comes from `max_minutes_by_fame`
([fame, minutes]: 45 min from the start, 1 h at 1,000 Fame, 2 h at 2,000). Cost `stones_per_minute` × minutes.
The session is a Qi buff keyed by the waterfall's location id with `startedAt`, so it keeps running while the
player explores (the Cultivate screen shows a "Meditating" pill) and can be ended early without refund. Offline
cultivation integrates every timed buff over the part of the absence it covered (cut at each buff's expiry).
Screens follow the mockups meditation_waterfall (length slider, locked range, Qi gain / expected / cost, Begin)
and waterfall_active (timer ring, Qi gained, rate, End early, Back to Sect).

## Shops (`shop.ts`)

Entries are unlock-gated. Discounts: affinity level × `pct_per_level` with the owner, plus
`fame_discount_pct_per_500`, capped at 30 %. Limited stock resets per period: daily (UTC day), weekly,
per_visit (6 h), none. Techniques and methods are learned on purchase (once). Gear sells for 40 % of its CP.
A row with `scale.per_realm` costs `price × per_realm^(realm order − 1)`: the Pavilion's Dao Insight Crystal
(1 a day, ×1.7) and bulk refining stones (×1.5) stay a real sink in every realm.

**Contribution** (`resources.contribution`) is earned from Mission Hall requests and hunts (`rewards.contribution`,
10 + 5 × region, repeatable daily) and spent at the **Contribution Exchange** (`shop.sect_exchange`, Mission Hall,
weekly stock): Dao Insight Crystals ×3, refining stones, spirit-enhancing stones, reforging sand, one awakening
crystal (Inner Disciple). Region bosses also carry bad-luck protection on crystals (`pity: 5` on the loot entry: a miss
streak of five ends in a guaranteed drop; the counter lives in `progress.counters` per table and item).

## Spirit Forge and Alchemy (`crafting.ts`)

| Action | Rule |
|---|---|
| Enhance +1…+15 | `enhancement.levels[n]` stones × `rarity_cost_mult`, materials, success chance; failure keeps the level |
| Refine | one rarity up with `refinement.steps` chance; capped at Mythic and at the base's `rarity_range`; roll quality and enhancement are kept |
| Reforge | rerolls unlocked secondary stats at the same rarity/level; each lock costs `lock_cost_per_stat`; at least one stat must reroll |
| Awaken | bases with `awakening`: pay materials + stones once, the effect joins the specials |
| Craft | recipe unlock (known, blueprint, rank, quest, fame, NPC affinity) + `fame_required`; blueprints are studied from the bag |
| Alchemy | per-load roll: `success_base` + furnace bonus + up to +10 % from proficiency above the recipe minimum; failures return `return_pct` of herbs and a byproduct; batches up to 10; five furnace grades (Bronze → Iron → Jade → Spirit → Immortal) upgrade with materials and stones (2k, 12k, 400k, 4M) |
| Breakthrough pills | Foundation needs the Foundation Pill, Core Formation the Core Condensing Pill, and every realm from Nascent Soul on consumes the pill of the region with its number (brewed from that region's herb, beast part and crystal; regions 13–15 need the Spirit/Immortal furnaces) |

Manuals (`book.*`) are read from the bag to learn their technique or method.

## Relationships (`social.ts`)

Affinity levels are the NPC's `affinity_levels`; unlock requirements and story triggers use the level
index (1 = Acquaintance). Chat: a line from `chat` at the current level, +3 affinity once a day. Topics:
+5 the first time. Gifts: explicit loved/liked/disliked values win, else loved tags ×3 / liked tags ×2 /
neutral ×1 of `base_affinity`; repeats of the same item that day × `repeat_decay` each; `daily_limit` gifts
per NPC per day.

## Tournaments (`encounter.ts`)

One round per entry; the bracket position is saved (`progress.tournaments[id].round`). Each round is a fresh
bout at full HP against `buildDuelist(npc, round.cp)` and pays its round rewards. Winning the final grants the
champion rewards and records the trial (rank promotion). Losing costs `loss.sect_fame` and resets the
bracket; a new run needs the entry requirements and `reentry.sect_fame_required`.
