/** Domain events emitted by engine actions. Trackers (quests, achievements, story) subscribe to these. */
export type DomainEvent =
  | { type: "stage_up"; realm: string; stage: number }
  | { type: "realm_reached"; realm: string }
  | { type: "breakthrough_failed"; realm: string; qiLost: number }
  | { type: "unlock"; id: string }
  | { type: "root_awakened"; root: string; from: string; source: string }
  /** A sect location or secret realm became enterable (Fame, rank or realm reached). */
  | { type: "place_opened"; id: string; by: "fame" | "rank" | "realm" }
  | { type: "item_gained"; id: string; qty: number }
  | { type: "item_used"; id: string; qty: number }
  | { type: "gear_gained"; uid: number; base: string; rarity: string; ilvl: number }
  | { type: "equipped"; uid: number; slot: string }
  | { type: "buff_applied"; id: string; expiresAt: number }
  | { type: "buff_expired"; id: string }
  | { type: "currency"; currency: string; delta: number }
  | { type: "offline"; elapsedMs: number; creditedMs: number; qi: number; clockMovedBack: boolean }
  | { type: "energy_spent"; amount: number }
  | { type: "mastery"; id: string; xp: number; level: number }
  | { type: "enemy_defeated"; id: string; boss: boolean }
  | { type: "battle_won"; source: string }
  | { type: "battle_lost"; source: string }
  | { type: "node_cleared"; node: string; region: string; first: boolean }
  | { type: "dungeon_cleared"; dungeon: string; first: boolean }
  | { type: "tribulation_passed"; tribulation: string }
  | { type: "tribulation_failed"; tribulation: string }
  | { type: "quest_accepted"; quest: string }
  | { type: "quest_completed"; quest: string }
  | { type: "quest_ready"; quest: string }
  | { type: "achievement"; id: string }
  | { type: "rank_up"; rank: string }
  | { type: "story_seen"; scene: string }
  | { type: "alchemy"; recipe: string; success: boolean; qty: number }
  | { type: "forge"; recipe: string }
  | { type: "enhanced"; uid: number; level: number; success: boolean }
  | { type: "refined"; uid: number; rarity: string; success: boolean }
  | { type: "reforged"; uid: number }
  | { type: "gift"; npc: string; item: string; delta: number }
  | { type: "affinity_level"; npc: string; level: number; name: string }
  | { type: "talk"; npc: string; topic: string }
  | { type: "visit"; target: string }
  | { type: "duel_won"; npc: string }
  | { type: "purchase"; shop: string; id: string; qty: number }
  | { type: "tournament_round"; tournament: string; round: number; won: boolean }
  | { type: "tournament_won"; tournament: string }
  | { type: "egg_incubated"; egg: string } | { type: "beast_hatched"; uid: number; beast: string } | { type: "beast_level"; uid: number; level: number }
  | { type: "beast_evolved"; uid: number; beast: string; stage: string } | { type: "beast_bond"; uid: number; level: number } | { type: "dao_bonded"; npc: string }
  | { type: "tower_floor"; dungeon: string; floor: number; best: boolean } | { type: "realm_entered"; dungeon: string } | { type: "realm_node"; dungeon: string; node: string; kind: string };

export type EventSink = (e: DomainEvent) => void;
