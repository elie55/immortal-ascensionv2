/** Domain events emitted by engine actions. Trackers (quests, achievements, story) subscribe to these. */
export type DomainEvent =
  | { type: "stage_up"; realm: string; stage: number }
  | { type: "realm_reached"; realm: string }
  | { type: "breakthrough_failed"; realm: string; qiLost: number }
  | { type: "unlock"; id: string }
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
  | { type: "tribulation_failed"; tribulation: string };

export type EventSink = (e: DomainEvent) => void;
