/**
 * AI evaluation: the smarter auto-battle rules and enemy AI against the previous ones, measured as win rates of the
 * simulator's fitted archetype on real nodes (tools/balance/sim_lib.ts), seeded and deterministic.
 *   node tools/balance/ai_eval.ts [--seeds 12] [--regions 1-15]
 * Four cells per node: player rules {legacy, new} × enemy AI {legacy, new}. "new vs new" is what the game ships;
 * "new player vs legacy enemy" isolates the auto-battle gain, "legacy player vs new enemy" the enemy gain.
 * Writes tools/balance/out/ai_eval.md.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { loadDatabase } from "../lib/load.ts";
import { ContentIndex, type ContentBundle, type MapNode } from "../../src/content/index.ts";
import type { GameState } from "../../src/engine/state.ts";
import { makePlayer, regionsOf, T0 } from "./sim_lib.ts";
import { Encounter, type EncounterSource } from "../../src/engine/encounter.ts";
import { seedRng } from "../../src/engine/rng.ts";

const args = process.argv.slice(2);
const arg = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1]! : d; };
const SEEDS = Number(arg("--seeds", "12"));
const [R_LO, R_HI] = arg("--regions", "1-15").split("-").map(Number) as [number, number];
const ROOT = join(import.meta.dirname, "../..");
const db = loadDatabase(ROOT);
const entities: Record<string, any> = {}; for (const [id, e] of db.registry) entities[id] = e.data;
const c = new ContentIndex({ version: 1, builtAt: "ai_eval", entities, singletons: db.singletons } as ContentBundle);

/** The auto-battle preset before this pass (combat_rules.json auto_default of 2026-10). */
export const LEGACY_RULES = [
  { slot: "ultimate", when: "always", target: "default" }, { slot: "heal", when: "hp_below", value: 50, target: "default" }, { slot: "shield", when: "big_attack", target: "default" },
  { slot: "shield", when: "no_shield", target: "default" }, { slot: "damage", when: "always", target: "lowest_hp" }, { slot: "basic", when: "always", target: "default" },
];
export const NEW_RULES = c.combat.auto_default.map((r) => ({ slot: r.slot, when: r.when, target: r.target, ...(r.value !== undefined ? { value: r.value } : {}) }));

export function fight(s: GameState, src: EncounterSource, legacyEnemy: boolean): { won: boolean; rounds: number } {
  const st = Encounter.start(s, c, src, T0, { legacyAi: legacyEnemy });
  if (!st.ok) throw new Error(`cannot start ${JSON.stringify(src)}: ${st.reason}`);
  const enc = st.encounter; let rounds = 0;
  while (!enc.done) {
    enc.battle!.run(); rounds += enc.battle!.summary().rounds;
    const wr = enc.settleWave(T0);
    if (wr.summary.result !== "victory") break;
    if (enc.hasNextWave) enc.nextWave();
  }
  return { won: !!enc.done?.won, rounds };
}

export function cell(n: number, node: MapNode, legacyPlayer: boolean, legacyEnemy: boolean, seeds = SEEDS): { win: number; rounds: number } {
  let wins = 0, rounds = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const s = makePlayer(c, n, "fitted", seed);
    s.combat.presets = [{ name: legacyPlayer ? "Legacy" : "Balanced", rules: (legacyPlayer ? LEGACY_RULES : NEW_RULES) as any }]; s.combat.active = 0;
    s.rng = seedRng(seed * 1000 + n);
    s.resources.energy.value = 1e6;
    const r = fight(s, { kind: "node", id: node.id }, legacyEnemy);
    if (r.won) wins++; rounds += r.rounds;
  }
  return { win: wins / seeds, rounds: rounds / seeds };
}

if (import.meta.main) {
  const regions = regionsOf(c).filter((r) => r.order >= R_LO && r.order <= R_HI);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const lines = [`# AI evaluation (${SEEDS} seeds · fitted archetype)`, "", "Win % (avg rounds). Columns: player rules × enemy AI.", "",
    "| region | node | legacy × legacy | new × legacy | legacy × new | new × new |", "|---|---|---|---|---|---|"];
  const tot = { ll: 0, nl: 0, ln: 0, nn: 0, k: 0 };
  for (const reg of regions) {
    const nodes = c.nodesOf(reg.id).filter((x) => x.kind !== "chest" && x.kind !== "story" && x.waves?.length);
    const picks = [nodes.find((x) => x.kind === "elite"), nodes.find((x) => x.kind === "boss"), nodes.filter((x) => x.kind === "battle").sort((a, b) => b.rec_cp - a.rec_cp)[0]].filter(Boolean) as MapNode[];
    for (const nd of picks) {
      const ll = cell(reg.order, nd, true, true), nl = cell(reg.order, nd, false, true), ln = cell(reg.order, nd, true, false), nn = cell(reg.order, nd, false, false);
      tot.ll += ll.win; tot.nl += nl.win; tot.ln += ln.win; tot.nn += nn.win; tot.k++;
      lines.push(`| ${reg.order} ${reg.id.split(".")[1]} | ${nd.kind} ${nd.id.split(".")[2]} | ${pct(ll.win)} (${ll.rounds.toFixed(0)}) | ${pct(nl.win)} (${nl.rounds.toFixed(0)}) | ${pct(ln.win)} (${ln.rounds.toFixed(0)}) | ${pct(nn.win)} (${nn.rounds.toFixed(0)}) |`);
      console.log(lines[lines.length - 1]);
    }
  }
  lines.push(`| **mean** | | ${pct(tot.ll / tot.k)} | ${pct(tot.nl / tot.k)} | ${pct(tot.ln / tot.k)} | ${pct(tot.nn / tot.k)} |`);
  console.log(lines[lines.length - 1]);
  const out = join(ROOT, "tools/balance/out/ai_eval.md"); mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, lines.join("\n") + "\n");
}
