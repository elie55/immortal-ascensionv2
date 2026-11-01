/**
 * Sweeps: spend banked energy on a place already cleared, fought instantly with the auto-battle rules (the offline
 * report's "while you were away" choice, and the Sweep button on a cleared node). Every run is a real encounter —
 * energy, loot, first-clear bookkeeping, quest counters, mastery — only the animation is skipped. A defeat ends the
 * sweep (HP is restored as after any defeat); the summary says how many runs were won and what they brought.
 */
import type { ContentIndex, MapNode } from "../content/index.ts";
import type { GameState } from "./state.ts";
import type { DomainEvent } from "./events.ts";
import type { ActionResult } from "./actions.ts";
import { Encounter, canStart, type EncounterSource } from "./encounter.ts";
import { energyNow } from "./cultivation.ts";
import { nodeState } from "./nodes.ts";
import { mergeDrops, type Drops } from "./loot.ts";
import { buildPlayer } from "./combat/build.ts";
import { Battle } from "./combat/battle.ts";
import { buildEnemy } from "./combat/build.ts";
import { seedRng } from "./rng.ts";

export const SWEEP_MAX_RUNS = 20;

export interface SweepOption { node: MapNode; region: string; cost: number; runs: number; winChance: number }

/** Cleared, replayable battle places in the discovered regions (latest region first), with how many runs the energy allows. */
export function sweepOptions(s: GameState, c: ContentIndex, now: number, limit = 8): SweepOption[] {
  const energy = energyNow(s, c, now);
  const regions = c.byPrefix<any>("region").filter((r) => s.progress.regions[r.id]).sort((a, b) => b.order - a.order);
  const out: SweepOption[] = [];
  for (const r of regions) {
    for (const n of c.nodesOf(r.id)) {
      if (!n.waves?.length || n.replayable === false || n.kind === "boss") continue;
      if (nodeState(s, c, n) !== "cleared") continue;
      const runs = Math.min(SWEEP_MAX_RUNS, Math.floor(energy / Math.max(1, n.energy_cost)));
      out.push({ node: n, region: r.id, cost: n.energy_cost, runs, winChance: probe(s, c, n) });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** A quick estimate (two silent fights on copies) of the auto rules beating this place. */
function probe(s: GameState, c: ContentIndex, n: MapNode): number {
  let wins = 0; const N = 2;
  for (let i = 0; i < N; i++) {
    const copy: GameState = structuredClone(s); copy.rng = seedRng(1000 + i);
    const rules = (copy.combat.presets[copy.combat.active] ?? copy.combat.presets[0]!).rules as any;
    let won = true;
    for (const wave of n.waves!) {
      const b = new Battle(c, [buildPlayer(copy, c), ...wave.map((id) => buildEnemy(c, id))], copy.rng, rules, { isBossFight: false });
      b.start(); if (b.run() !== "victory") { won = false; break; }
    }
    if (won) wins++;
  }
  return wins / N;
}

export interface SweepResult { runs: number; wins: number; drops: Drops; gearUids: number[]; masteryXp: number; stoppedBy: "done" | "defeat" | "energy" }

export function sweep(s: GameState, c: ContentIndex, now: number, nodeId: string, runs: number): ActionResult<SweepResult> {
  const n = c.get<MapNode>(nodeId);
  if (!n.waves?.length || n.replayable === false) return { ok: false, reason: "This place cannot be swept" };
  if (nodeState(s, c, n) !== "cleared") return { ok: false, reason: "Clear it once by hand first" };
  const src: EncounterSource = { kind: "node", id: nodeId };
  const events: DomainEvent[] = [];
  let drops: Drops = { items: [], gear: [], spirit_stones: 0, sect_fame: 0, mastery_xp: 0 };
  const gearUids: number[] = []; let wins = 0, done = 0, masteryXp = 0; let stoppedBy: SweepResult["stoppedBy"] = "done";
  for (let i = 0; i < Math.min(SWEEP_MAX_RUNS, Math.max(1, runs)); i++) {
    const can = canStart(s, c, src, now);
    if (!can.ok) { stoppedBy = "energy"; break; }
    const st = Encounter.start(s, c, src, now);
    if (!st.ok) { stoppedBy = "energy"; break; }
    const enc = st.encounter;
    while (!enc.done) {
      enc.battle!.run();
      const wr = enc.settleWave(now);
      if (wr.summary.result !== "victory") break;
      if (enc.hasNextWave) enc.nextWave();
    }
    events.push(...enc.drainEvents());
    done++;
    if (enc.done?.won) { wins++; drops = mergeDrops(drops, enc.done.total); gearUids.push(...enc.done.waves.flatMap((w) => w.gearUids)); masteryXp += enc.done.masteryXp; }
    else { stoppedBy = "defeat"; break; }
  }
  if (done === 0) return { ok: false, reason: "Not enough energy" };
  events.push({ type: "sweep", node: nodeId, runs: done, wins });
  return { ok: true, events, runs: done, wins, drops, gearUids, masteryXp, stoppedBy };
}
