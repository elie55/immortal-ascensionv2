/** Print the stat blocks the simulator fights with. node tools/balance/diag.ts <region> <arch> */
import { loadDatabase } from "../lib/load.ts";
import { ContentIndex, type ContentBundle } from "../../src/content/index.ts";
import { computeStats } from "../../src/engine/stats.ts";
import { buildPlayer, buildEnemy, buildBeast } from "../../src/engine/combat/build.ts";
import { towerFloor } from "../../src/engine/delves.ts";
import { join } from "node:path";
const ROOT = join(import.meta.dirname, "../..");
const db = loadDatabase(ROOT); const entities: Record<string, any> = {}; for (const [id, e] of db.registry) entities[id] = e.data;
const c = new ContentIndex({ version: 1, builtAt: "sim", entities, singletons: db.singletons } as ContentBundle);
const { makePlayer, availableAt } = await import("./sim_lib.ts");
const n = Number(process.argv[2] ?? 1), arch = (process.argv[3] ?? "fitted") as any;
const s = makePlayer(c, n, arch, 1);
const b = computeStats(s, c);
console.log("CP", b.cp); for (const src of b.sources) console.log("  ", src.label, JSON.stringify(Object.fromEntries(Object.entries(src.stats).map(([k, v]) => [k, Math.round(v as number)]))));
console.log("total", JSON.stringify(Object.fromEntries(Object.entries(b.total).map(([k, v]) => [k, Math.round(v as number)]))));
const p = buildPlayer(s, c); console.log("avail techs", c.byPrefix<any>("tech").filter((t) => !t.enemy_only).map((t) => `${t.id.split(".").slice(1).join(".")}@${availableAt(c, t.id)}`).sort((a, b) => Number(a.split("@")[1]) - Number(b.split("@")[1])).join(" "));
console.log("skills", p.skills.map((k) => `${k.name} ${k.power}%x${k.hits} cd${k.cooldown} sp${k.spCost} ${k.healPct ? `heal${k.healPct}` : ""}${k.shieldPct ? `sh${k.shieldPct}` : ""}`).join(" | "));
const beast = buildBeast(s, c); if (beast) console.log("beast", beast.name, JSON.stringify(Object.fromEntries(Object.entries(beast.base).map(([k, v]) => [k, Math.round(v as number)]))));
const reg = c.byPrefix<any>("region").find((r) => r.order === n)!;
for (const nd of c.nodesOf(reg.id).filter((x) => x.waves?.length).slice(0, 3)) for (const e of nd.waves![0]!) { const en = buildEnemy(c, e); console.log(nd.kind, e, "cp", en.cp, JSON.stringify(Object.fromEntries(Object.entries(en.base).map(([k, v]) => [k, Math.round(v as number)]))), en.skills.map((k) => `${k.name} ${k.power}%`).join("|")); }
const tower = c.byPrefix<any>("dungeon").find((d) => d.kind === "tower")!;
for (const f of [10, 30, 46, 60]) { const tf = towerFloor(c, tower, f); const en = buildEnemy(c, tf.enemies[0], { statMult: tf.statMult }); console.log("floor", f, "power", tf.power, tf.enemies.length, "x", tf.enemies[0], JSON.stringify(Object.fromEntries(Object.entries(en.base).map(([k, v]) => [k, Math.round(v as number)])))); }
