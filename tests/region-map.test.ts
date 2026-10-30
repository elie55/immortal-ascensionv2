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

test("map name plates never cover a medallion or each other, stay inside the map, and most places get one", async () => {
  const { placeLabels, PLATE_H, PLATE_MAX } = await import("../src/ui/core/mapLabels.ts");
  const width = (t: string) => 31 + 15.75 + t.length * 6.3;   // a little wider than the real font: errs toward collisions
  let named = 0, total = 0;
  for (const r of c.byPrefix<Region>("region")) {
    const nodes = c.nodesOf(r.id);
    for (const mw of [344, 374, 504]) {
      const items = nodes.map((n, i) => ({ id: n.id, x: n.position[0], y: n.position[1], size: n.kind === "boss" ? 64 : n.kind === "elite" ? 52 : 46, text: `${i + 1} ${n.name}`, you: i === 3 }));
      const boss = nodes.find((n) => n.kind === "boss")!.id;
      const out = placeLabels(items, mw, width, [nodes[5]!.id, boss]);
      assert.ok(out.get(nodes[5]!.id), `${r.id} @${mw}px: the first place in the order (the selected one) always gets its name`);
      const boxes: [string, number, number, number][] = [];
      for (const it of items) {
        total++; const p = out.get(it.id); if (!p) continue; named++;
        if (it.id === nodes[5]!.id) continue;   // the selected place's plate may sit over a neighbour (drawn on top)
        const w = Math.min(PLATE_MAX, width(it.text));
        const x0 = it.x * mw - it.size / 2 + p.left, y0 = it.y * mw * 1.5 - it.size / 2 + p.top;
        assert.ok(x0 >= 0 && x0 + w <= mw && y0 >= 0 && y0 + PLATE_H <= mw * 1.5, `${it.id} @${mw}px: plate inside the map`);
        for (const o of items) {
          if (o === it) continue;
          const cx = o.x * mw, cy = o.y * mw * 1.5, f = o.size / 2 - 4;
          assert.ok(!(x0 < cx + f && x0 + w > cx - f && y0 < cy + f && y0 + PLATE_H > cy - f), `${it.id} @${mw}px: plate covers ${o.id}`);
        }
        for (const [id, bx, by, bw] of boxes) assert.ok(!(x0 < bx + bw && x0 + w > bx && y0 < by + PLATE_H && y0 + PLATE_H > by), `${it.id} @${mw}px: plate overlaps ${id}'s`);
        boxes.push([it.id, x0, y0, w]);
      }
    }
  }
  assert.ok(named / total > 0.6, `only ${named}/${total} places got a name plate`);
});

test("sect map plaques: one per height band, so no two overlap on a phone", () => {
  const ys = c.byPrefix<any>("sectloc").map((l) => [l.id, l.map_position[1]] as const).sort((a, b) => a[1] - b[1]);
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i]![1] - ys[i - 1]![1] >= 0.075, `${ys[i - 1]![0]} and ${ys[i]![0]} are ${(ys[i]![1] - ys[i - 1]![1]).toFixed(3)} apart`);
  for (const l of c.byPrefix<any>("sectloc")) assert.ok(l.map_position[1] >= 0.04 && l.map_position[1] <= 0.94, `${l.id} plaque inside the map`);
});
