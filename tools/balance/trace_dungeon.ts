/** Trace a dungeon run: node tools/balance/trace_dungeon.ts <dungeon id> <region> <arch> */
import { join } from "node:path";
import { loadDatabase } from "../lib/load.ts";
import { ContentIndex, type ContentBundle } from "../../src/content/index.ts";
import { Encounter } from "../../src/engine/encounter.ts";
import { makePlayer, T0 } from "./sim_lib.ts";
const db = loadDatabase(join(import.meta.dirname, "../..")); const entities: Record<string, any> = {}; for (const [id, e] of db.registry) entities[id] = e.data;
const c = new ContentIndex({ version: 1, builtAt: "x", entities, singletons: db.singletons } as ContentBundle);
const id = process.argv[2]!, n = Number(process.argv[3] ?? 10), arch = (process.argv[4] ?? "geared") as any;
const d = c.get<any>(id);
const s = makePlayer(c, n, arch, 68);
for (const q of d.entry.quests ?? []) s.progress.quests.completed[q] = 1;
if (d.entry.rank) s.character.rank = d.entry.rank; if (d.entry.sect_fame) s.resources.sect_fame = d.entry.sect_fame;
for (const dd of d.entry.dungeons_cleared ?? []) s.progress.dungeons[dd] = { clears: 1 };
if (d.entry.party.companions_allowed) { s.relations["npc.bai_lingshuang"] = { affinity: 1000, giftsToday: 0, topics: [] }; s.companions.bonded = ["npc.bai_lingshuang"]; s.companions.active = ["npc.bai_lingshuang"]; }
const st = Encounter.start(s, c, { kind: "dungeon", id }, T0); if (!st.ok) throw new Error(st.reason);
const enc = st.encounter;
for (let wave = 0; wave < 8; wave++) {
  const b = enc.battle!;
  console.log("--- wave", wave + 1, b.units.map((u) => `${u.name}${u.kind === "companion" ? "(C)" : ""} hp${Math.round(u.hp)}/${u.maxHp} atk${Math.round(u.base.atk!)} def${Math.round(u.base.def!)} spd${Math.round(u.base.spd!)}`).join(" | "));
  b.run();
  const sum = b.summary();
  console.log("   ", sum.result, "rounds", sum.rounds, "player hp", Math.round(b.player.hp), "dealt", sum.dealt, "taken", sum.taken, "killed", sum.killed.join(","));
  const wr = enc.settleWave(T0);
  if (wr.summary.result !== "victory" || !enc.hasNextWave) break;
  enc.nextWave();
}
console.log("won", enc.done?.won);
