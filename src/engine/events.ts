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
  | { type: "mastery"; id: string; xp: number; level: number };

export type EventSink = (e: DomainEvent) => void;
