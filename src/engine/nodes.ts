/** Adventure map rules: reachability, discovery of new regions, and the non-combat node kinds (gather, chest, event, cultivation). */
import type { ContentIndex, MapNode, Region, GameEvent } from "../content/index.ts";
import type { GameState } from "./state.ts";
import type { DomainEvent } from "./events.ts";
import type { ActionResult } from "./actions.ts";
import { grantRewards } from "./actions.ts";
import { energyNow, spendEnergy } from "./cultivation.ts";
import { checkUnlock } from "./unlock.ts";
import { rollTable, grantDrops } from "./loot.ts";
import { weightedIndex } from "./rng.ts";

const fail = (reason: string) => ({ ok: false as const, reason });

export type NodeState = "locked" | "reachable" | "cleared" | "hidden";

/** A node is reachable when it is the region's entry node or touches a cleared node. Hidden nodes need revealing. */
export function nodeState(s: GameState, c: ContentIndex, n: MapNode): NodeState {
  const reg = s.progress.regions[n.region];
  if (!reg) return "locked";
  const rec = reg.nodes[n.id];
  if (rec?.clears) return "cleared";
  const region = c.get<Region>(n.region);
  const reachable = n.id === region.entry_node || n.connections.some((k) => reg.nodes[k]?.clears);
  if (!reachable) return "locked";
  if (n.kind === "hidden" && !rec?.revealed) return "hidden";
  return "reachable";
}

/** Cleared share of a region's visible nodes. */
export function regionProgress(s: GameState, c: ContentIndex, regionId: string): { cleared: number; total: number } {
  const nodes = c.nodesOf(regionId);
  const reg = s.progress.regions[regionId];
  return { cleared: nodes.filter((n) => reg?.nodes[n.id]?.clears).length, total: nodes.length };
}

/** Discover every region whose unlock is satisfied (called after events that could satisfy one). */
export function discoverRegions(s: GameState, c: ContentIndex, now: number, out: DomainEvent[]): string[] {
  const found: string[] = [];
  for (const r of c.byPrefix<Region>("region")) {
    if (s.progress.regions[r.id]) continue;
    if (checkUnlock(s, c, r.unlock as any).ok) { s.progress.regions[r.id] = { discoveredAt: now, nodes: {} }; found.push(r.id); out.push({ type: "unlock", id: r.id }); }
  }
  return found;
}

/** Try to reveal hidden nodes adjacent to a just-cleared node (chance from content). */
export function revealHidden(s: GameState, c: ContentIndex, clearedId: string, out: DomainEvent[]): string[] {
  const n = c.get<MapNode>(clearedId);
  const reg = s.progress.regions[n.region]!;
  const revealed: string[] = [];
  for (const k of n.connections) {
    const m = c.get<MapNode>(k);
    if (m.kind !== "hidden" || reg.nodes[k]?.revealed) continue;
    const p = m.hidden?.reveal_chance ?? 0.3;
    const roll = (s.rng.a >>> 8) / 0x1000000; // cheap deterministic peek; advance via weightedIndex below
    weightedIndex(s.rng, [1]);
    if (roll < p) { (reg.nodes[k] ??= { clears: 0 }).revealed = true; revealed.push(k); out.push({ type: "unlock", id: k }); }
  }
  return revealed;
}

function requireReachable(s: GameState, c: ContentIndex, id: string) {
  const n = c.get<MapNode>(id);
  const st = nodeState(s, c, n);
  if (st === "locked") return { n, err: "Clear a neighbouring place first" };
  if (st === "hidden") return { n, err: "This place has not been found yet" };
  return { n, err: null, cleared: st === "cleared" };
}

export function gather(s: GameState, c: ContentIndex, now: number, id: string): ActionResult<{ items: { id: string; qty: number }[]; nextAt: number }> {
  const { n, err } = requireReachable(s, c, id);
  if (err) return fail(err);
  if (!n.gather) return fail("Nothing to gather here");
  const reg = s.progress.regions[n.region]!;
  const rec = (reg.nodes[n.id] ??= { clears: 0 });
  const nextAt = (rec.lastAt ?? 0) + n.gather.cooldown_min * 60_000;
  if (nextAt > now) return fail(`Regrows in ${Math.ceil((nextAt - now) / 60000)} min`);
  const sp = spendEnergy(s, c, now, n.gather.energy_cost);
  if (!sp.ok) return fail(sp.reason);
  const events: DomainEvent[] = [{ type: "energy_spent", amount: n.gather.energy_cost }];
  grantRewards(s, c, { items: n.gather.items }, events);
  const first = rec.clears === 0;
  rec.clears++; rec.lastAt = now;
  if (first) { rec.firstClearAt = now; grantRewards(s, c, n.first_clear as any, events); events.push({ type: "node_cleared", node: n.id, region: n.region, first: true }); }
  return { ok: true, events, items: n.gather.items, nextAt: now + n.gather.cooldown_min * 60_000 };
}

export function openChest(s: GameState, c: ContentIndex, now: number, id: string): ActionResult<{ gearUids: number[]; drops: ReturnType<typeof rollTable> }> {
  const { n, err, cleared } = requireReachable(s, c, id);
  if (err) return fail(err);
  if (!n.chest) return fail("No chest here");
  if (cleared) return fail("Already opened");
  const sp = spendEnergy(s, c, now, n.energy_cost);
  if (!sp.ok) return fail(sp.reason);
  const events: DomainEvent[] = [];
  const drops = rollTable(s, c, n.chest);
  const { gearUids } = grantDrops(s, c, drops, events);
  const rec = (s.progress.regions[n.region]!.nodes[n.id] ??= { clears: 0 });
  rec.clears = 1; rec.firstClearAt = now;
  grantRewards(s, c, n.first_clear as any, events);
  events.push({ type: "node_cleared", node: n.id, region: n.region, first: true });
  return { ok: true, events, gearUids, drops };
}

/** Cultivation nodes: become the character's cultivation spot (qi multiplier applies while she stays). */
export function meditateAt(s: GameState, c: ContentIndex, now: number, id: string): ActionResult {
  const { n, err } = requireReachable(s, c, id);
  if (err) return fail(err);
  if (!n.cultivation) return fail("Not a cultivation spot");
  const events: DomainEvent[] = [];
  const rec = (s.progress.regions[n.region]!.nodes[n.id] ??= { clears: 0 });
  if (rec.clears === 0) { rec.clears = 1; rec.firstClearAt = now; grantRewards(s, c, n.first_clear as any, events); events.push({ type: "node_cleared", node: n.id, region: n.region, first: true }); }
  s.character.location = id;
  return { ok: true, events };
}

export interface EventOutcome { text: string; battle?: string[]; rewards?: Record<string, unknown> }

/** Resolve an event choice: picks an outcome by chance, grants rewards; a battle outcome is returned for the caller to start. */
export function resolveEvent(s: GameState, c: ContentIndex, now: number, nodeId: string, choice: number): ActionResult<{ outcome: EventOutcome }> {
  const { n, err } = requireReachable(s, c, nodeId);
  if (err) return fail(err);
  if (!n.event) return fail("Nothing happens here");
  const ev = c.get<GameEvent>(n.event);
  const ch = ev.choices[choice];
  if (!ch) return fail("Choose an option");
  const rec = (s.progress.regions[n.region]!.nodes[n.id] ??= { clears: 0 });
  if (rec.clears && !n.replayable) return fail("Already resolved");
  const sp = spendEnergy(s, c, now, n.energy_cost);
  if (!sp.ok) return fail(sp.reason);
  const i = weightedIndex(s.rng, ch.outcomes.map((o) => o.chance));
  const o = ch.outcomes[Math.max(0, i)]!;
  const events: DomainEvent[] = [];
  if (o.rewards) grantRewards(s, c, o.rewards as any, events);
  if (o.status) { /* battle-only statuses are informational outside combat */ }
  if (o.root_transform && c.has(o.root_transform)) { s.character.root = o.root_transform; events.push({ type: "unlock", id: o.root_transform }); }
  const first = rec.clears === 0;
  if (!o.battle) { rec.clears++; rec.lastAt = now; if (first) { rec.firstClearAt = now; grantRewards(s, c, n.first_clear as any, events); events.push({ type: "node_cleared", node: n.id, region: n.region, first: true }); } }
  return { ok: true, events, outcome: { text: o.text, battle: o.battle, rewards: o.rewards as any } };
}

/** Mark an event node cleared after its battle outcome was won. */
export function finishEventBattle(s: GameState, c: ContentIndex, now: number, nodeId: string, out: DomainEvent[]): void {
  const n = c.get<MapNode>(nodeId);
  const rec = (s.progress.regions[n.region]!.nodes[n.id] ??= { clears: 0 });
  const first = rec.clears === 0;
  rec.clears++; rec.lastAt = now;
  if (first) { rec.firstClearAt = now; grantRewards(s, c, n.first_clear as any, out); out.push({ type: "node_cleared", node: n.id, region: n.region, first: true }); }
}

export const energyLeft = (s: GameState, c: ContentIndex, now: number) => Math.floor(energyNow(s, c, now));
