/**
 * Region maps open strictly in map-number order (owner's rule, 2026-10-30), and quest tracking only marks a place:
 * it never opens one the player has not reached.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { testContent } from "./helpers/content.ts";
import { newGameState } from "../src/engine/state.ts";
import { nodeState, nextStepTo } from "../src/engine/nodes.ts";
import type { MapNode, Region } from "../src/content/index.ts";

const c = testContent();
const T0 = Date.UTC(2026, 9, 30, 8, 0, 0);
const SIDE = new Set(["hidden", "merchant", "secret_realm"]);
const clear = (s: any, n: MapNode) => { (s.progress.regions[n.region].nodes[n.id] ??= { clears: 0 }).clears = 1; };

test("every region opens one numbered place at a time; side places never gate the path", () => {
  for (const r of c.byPrefix<Region>("region")) {
    const nodes = c.nodesOf(r.id);
    assert.equal(nodes[0]!.id, r.entry_node, `${r.id}: place 1 is the entry`);
    const main = nodes.filter((n) => !SIDE.has(n.kind));
    const s = newGameState(c, T0, { seed: 1 }); s.progress.regions[r.id] = { discoveredAt: T0, nodes: {} };
    for (let i = 0; i < main.length; i++) {
      const open = main.filter((n) => nodeState(s, c, n) === "reachable");
      assert.deepEqual(open.map((n) => n.id), [main[i]!.id], `${r.id}: only place ${nodes.indexOf(main[i]!) + 1} is open after clearing the ones before it`);
      clear(s, main[i]!);
    }
    for (const n of nodes.filter((x) => SIDE.has(x.kind))) {
      const anchors = n.connections.map((k) => c.get<MapNode>(k));
      assert.equal(anchors.length, 1, `${n.id}: a side place hangs off exactly one place`);
      assert.ok(nodes.indexOf(anchors[0]!) < nodes.indexOf(n), `${n.id}: it opens with a place numbered before it`);
      if (n.kind === "hidden") assert.ok(["battle", "elite", "boss"].includes(anchors[0]!.kind), `${n.id}: hidden places are found by winning a battle next to them`);
    }
  }
});

test("a quest target that is not reached yet stays locked; the tracker points at the next place to clear", () => {
  const s = newGameState(c, T0, { seed: 1 });
  const nodes = c.nodesOf("region.mortal_plains");
  s.progress.regions["region.mortal_plains"] ??= { discoveredAt: T0, nodes: {} };
  clear(s, nodes[0]!); // Village Road
  const boar = c.get<MapNode>("node.mortal_plains.boar_thicket");
  assert.equal(nodes.indexOf(boar) + 1, 4);
  assert.equal(nodeState(s, c, boar), "locked", "Boar Thicket (4) needs Herb Meadow (2) and River Crossing (3) first");
  assert.equal(nextStepTo(s, c, boar.id)?.id, "node.mortal_plains.herb_meadow");
  clear(s, nodes[1]!);
  assert.equal(nextStepTo(s, c, boar.id)?.id, "node.mortal_plains.river_crossing");
  clear(s, nodes[2]!);
  assert.equal(nodeState(s, c, boar), "reachable");
  assert.equal(nextStepTo(s, c, boar.id), null, "nothing left in the way");
});
