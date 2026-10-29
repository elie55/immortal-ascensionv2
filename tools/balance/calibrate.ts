/**
 * Calibrate the per-region enemy power: finds the multiplier m(n) on every enemy's hp/atk/def/sp_power in region n
 * such that the "fitted" archetype wins the region's normal battle nodes about TARGET of the time.
 *   node tools/balance/calibrate.ts [--target 0.9] [--seeds 12] [--regions 3-15]
 * Prints the suggested CP_BASE table for tools/gen/regions.py (current cp_base × m).
 */
import { join } from "node:path";
import { loadDatabase } from "../lib/load.ts";
import { ContentIndex, type ContentBundle, type MapNode } from "../../src/content/index.ts";
import { Encounter } from "../../src/engine/encounter.ts";
import { makePlayer, regionsOf, T0 } from "./sim_lib.ts";

const args = process.argv.slice(2);
const arg = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1]! : d; };
const TARGET = Number(arg("--target", "0.9")), SEEDS = Number(arg("--seeds", "12"));
const [R_LO, R_HI] = arg("--regions", "3-15").split("-").map(Number) as [number, number];
const KIND = arg("--kind", "battle");
const ARCH = arg("--arch", "fitted") as any;
/** Which enemies the multiplier applies to: "all" enemies of the region, "boss" only boss.* ids, "kind" = ids that appear only in nodes of KIND. */
const ONLY = arg("--only", KIND === "battle" ? "all" : KIND === "boss" ? "boss" : "kind");

const db = loadDatabase(join(import.meta.dirname, "../.."));
const entities: Record<string, any> = {}; for (const [id, e] of db.registry) entities[id] = structuredClone(e.data);
const c = new ContentIndex({ version: 1, builtAt: "cal", entities, singletons: db.singletons } as ContentBundle);
const regions = regionsOf(c);
const KEYS = ["hp", "atk", "def", "sp_power"];

function scaleRegion(n: number, m: number) {
  const reg = regions[n - 1]!;
  const nodes = c.nodesOf(reg.id);
  let ids = new Set(nodes.flatMap((nd) => nd.waves?.flat() ?? []));
  if (ONLY === "boss") ids = new Set([...ids].filter((id) => id.startsWith("boss.")));
  else if (ONLY === "kind") { const others = new Set(nodes.filter((nd) => nd.kind !== KIND).flatMap((nd) => nd.waves?.flat() ?? [])); ids = new Set(nodes.filter((nd) => nd.kind === KIND).flatMap((nd) => nd.waves?.flat() ?? []).filter((id) => !others.has(id))); }
  for (const id of ids) { const e = entities[id]; if (!e.__orig) e.__orig = { ...e.stats, cp: e.cp }; for (const k of KEYS) e.stats[k] = e.__orig[k] * m; e.cp = Math.round(e.__orig.cp * m); }
}

function winRate(n: number): number {
  const reg = regions[n - 1]!;
  const nodes = c.nodesOf(reg.id).filter((x) => x.kind === KIND && x.waves?.length) as MapNode[];
  let wins = 0, total = 0;
  for (const node of nodes) for (let seed = 1; seed <= SEEDS; seed++) {
    const s = makePlayer(c, n, ARCH, seed * 31 + node.id.length);
    const st = Encounter.start(s, c, { kind: "node", id: node.id }, T0);
    if (!st.ok) throw new Error(st.reason);
    const enc = st.encounter;
    while (!enc.done) { enc.battle!.run(); const wr = enc.settleWave(T0); if (wr.summary.result !== "victory") break; if (enc.hasNextWave) enc.nextWave(); }
    total++; if (enc.done!.won) wins++;
  }
  return wins / Math.max(1, total);
}

const out: Record<number, { m: number; win: number; cb: number }> = {};
for (let n = R_LO; n <= R_HI; n++) {
  // geometric bisection on m in [0.2, 5]
  let lo = 0.2, hi = 5, best = 1, bestWin = 0;
  for (let it = 0; it < 9; it++) {
    const m = Math.sqrt(lo * hi);
    scaleRegion(n, m);
    const w = winRate(n);
    best = m; bestWin = w;
    if (w > TARGET) lo = m; else hi = m;
  }
  const normal = c.nodesOf(regions[n - 1]!.id).find((x) => x.kind === "battle" && x.waves?.length)!;
  const cbNow = entities[normal.waves![0]![0]!].__orig?.cp ?? entities[normal.waves![0]![0]!].cp;
  out[n] = { m: +best.toFixed(3), win: +bestWin.toFixed(2), cb: Math.round(cbNow * best) };
  console.error(`region ${n}: m=${best.toFixed(3)} win=${bestWin.toFixed(2)} cb≈${Math.round(cbNow * best)}`);
  scaleRegion(n, 1);
}
console.log(JSON.stringify(out));
