/** Trace one node battle for an archetype: node tools/balance/trace.ts <region> <arch> <kind> [v] */
import { join } from "node:path";
import { loadDatabase } from "../lib/load.ts";
import { ContentIndex, type ContentBundle } from "../../src/content/index.ts";
import { Encounter } from "../../src/engine/encounter.ts";
import { makePlayer, T0 } from "./sim_lib.ts";
const db = loadDatabase(join(import.meta.dirname, "../..")); const entities: Record<string, any> = {}; for (const [id, e] of db.registry) entities[id] = e.data;
const c = new ContentIndex({ version: 1, builtAt: "x", entities, singletons: db.singletons } as ContentBundle);
const n = Number(process.argv[2] ?? 4), arch = (process.argv[3] ?? "fitted") as any, kind = process.argv[4] ?? "battle", verbose = process.argv[5] === "v";
const reg = c.byPrefix<any>("region").find((r) => r.order === n)!;
const node = c.nodesOf(reg.id).find((x) => x.kind === kind && x.waves?.length)!;
const s = makePlayer(c, n, arch, 3);
const st = Encounter.start(s, c, { kind: "node", id: node.id }, T0); if (!st.ok) throw new Error(st.reason);
const enc = st.encounter;
for (let wave = 0; wave < 4; wave++) {
  const b = enc.battle!;
  const nm = (uid: number) => b.units.find((u) => u.uid === uid)?.name ?? "?";
  console.log("--- wave", wave + 1, b.units.map((u) => `${u.name} hp${Math.round(u.hp)}/${u.maxHp} atk${Math.round(u.base.atk!)} def${Math.round(u.base.def!)} spd${Math.round(u.base.spd!)}${u.boss ? ` phases:${u.boss.phases.map((p) => `${p.name}@${p.hp_threshold}${p.summons.length ? " summons " + p.summons.map((x) => x.count + "x" + x.enemy).join("+") : ""}${p.shield_pct ? " shield" + p.shield_pct : ""}${p.enrage ? " enrage" : ""}${p.charged_attack ? " charged" : ""}`).join("; ")}` : ""}`).join("\n    "));
  const counts: Record<string, number> = {};
  const bump = (k: string) => { counts[k] = (counts[k] ?? 0) + 1; };
  for (let i = 0; i < 600 && !b.result; i++) {
    b.step();
    for (const e of b.drain()) {
      if (e.t === "action") { bump(`${nm(e.actor)}:${(e as any).name}`); if (verbose) console.log(`  ${nm(e.actor)} uses ${(e as any).name} → ${e.targets.map(nm).join(",")}`); }
      if (e.t === "hit" && verbose) console.log(`     hit ${nm(e.target)} ${e.amount}${e.crit ? " CRIT" : ""}${(e as any).dodged ? " dodged" : ""} (hp ${Math.round(b.units.find((u) => u.uid === e.target)!.hp)})`);
      if (e.t === "status") bump(`status ${(e as any).status}:${(e as any).result} on ${nm((e as any).target)}`);
      if (e.t === "summon" || e.t === "phase") bump(`${e.t} ${(e as any).name ?? ""}`);
      if (e.t === "skip") bump(`${nm(e.actor)} skips`);
    }
  }
  console.log("   ", JSON.stringify(counts));
  const sum = b.summary();
  console.log("   result", b.result, "rounds", sum.rounds, "player hp", Math.round(b.player.hp), "dealt", sum.dealt, "taken", sum.taken);
  const wr = enc.settleWave(T0);
  if (wr.summary.result !== "victory" || !enc.hasNextWave) break;
  enc.nextWave();
}
console.log("won", enc.done?.won);
