#!/usr/bin/env node
/**
 * Export every art asset that still needs generating as a job list for the ComfyUI batch runner.
 *   npm run art:jobs                → writes .tmp/art-jobs.json (status "planned" only)
 *   node tools/export-art-jobs.ts --all --out jobs.json
 * Each job carries everything the runner needs: output path, size, transparency, prompt, negative,
 * reference images and the owning entity, so the runner never has to look at the database.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadDatabase } from "./lib/load.ts";

const args = process.argv.slice(2);
const all = args.includes("--all");
const out = resolve(args[args.indexOf("--out") + 1] && args.includes("--out") ? args[args.indexOf("--out") + 1] : ".tmp/art-jobs.json");

export interface ArtJob {
  entity: string; key: string; file: string; size: [number, number]; transparent: boolean;
  prompt: string; negative?: string; references: string[]; status: string;
}

const db = loadDatabase(resolve("."));
const jobs: ArtJob[] = [];
for (const e of db.registry.values()) {
  const push = (entity: string, art: Record<string, any> | undefined) => {
    for (const [key, a] of Object.entries(art ?? {})) {
      if (!all && a.status !== "planned") continue;
      jobs.push({ entity, key, file: a.file, size: a.size, transparent: a.transparent, prompt: a.prompt, negative: a.negative, references: a.references, status: a.status });
    }
  };
  push(e.id, e.data.art);
  if (e.prefix === "gear") for (const [r, v] of Object.entries<any>(e.data.rarities)) push(`${e.id}.${r}`, v.art);
}

// Stable order: backgrounds first (slow, few), then characters, then icons (fast, many).
const weight = (j: ArtJob) => (j.transparent ? 1 : 0) + (j.size[0] * j.size[1] < 300_000 ? 1 : 0);
jobs.sort((a, b) => weight(a) - weight(b) || a.file.localeCompare(b.file));

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ generated_at: new Date().toISOString(), count: jobs.length, jobs }, null, 1));

const byDir = new Map<string, number>();
for (const j of jobs) { const d = j.file.split("/").slice(1, 3).join("/"); byDir.set(d, (byDir.get(d) ?? 0) + 1); }
console.log(`${jobs.length} art job(s) → ${out}`);
for (const [d, n] of [...byDir].sort()) console.log(`  ${d.padEnd(28)} ${n}`);
