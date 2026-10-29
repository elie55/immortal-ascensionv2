# Inventory, depot and overflow pouch

Capacity is counted in **slots**: one slot per item stack (any quantity up to its `stack_limit`) or per piece of gear.
Worn gear takes no slot. Numbers live in `content/meta/cultivation_rules.json → inventory` (engine: `src/engine/inventory.ts`).

| | Base | Per rank order | Expansion | Max expansions |
|---|---|---|---|---|
| Bag | 100 | +10 | +20 slots | 5 |
| Depot (Your Quarters) | 200 | +10 | +20 slots | 10 |

Expansion *n* costs `500 · 2^n` spirit stones (`expand`, `expansionCost`). Both are drawn as **pages of 20 slots**
(`pagedGrid`), empty slots included, so the capacity is visible.

## Where things live
- **Bag** (`inventory.stacks`, gear not listed elsewhere): the only place crafting, selling, using and equipping read.
- **Depot** (`inventory.depot`): personal storage opened from *Your Quarters → Storage chest* (`depotScreen`). Move
  stacks and gear with `deposit / withdraw / depositGear / withdrawGear`; "Store all materials" moves every material
  stack. Quest items cannot be stored.
- **Overflow pouch** (`inventory.pouch`): what did not fit when a drop arrived (no free slot, or over the stack
  limit). Nothing is lost: the Inventory shows a banner with *Claim*, which moves everything that fits (`claimPouch`).
  Pouch gear cannot be worn until claimed.

Unequipping into a full bag is refused; equipping from the bag never needs a slot (the piece it replaces takes the
freed one). `bestLoadout` only considers the bag and worn pieces.

## Save format
`STATE_VERSION 6` adds `depot`, `pouch`, `bagExpansions`, `depotExpansions`; migration `5 → 6` in `src/save/codec.ts`.
