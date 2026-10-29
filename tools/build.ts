/**
 * Build the web client into dist/ (Capacitor's webDir).
 *
 *   node tools/build.ts            production build
 *   node tools/build.ts --watch    rebuild on change + serve on http://localhost:5173
 *   node tools/build.ts --content  only regenerate dist/content.json
 *
 * Steps: validate + bundle the content database into dist/content.json, bundle src/app.ts with esbuild,
 * copy src/ui/index.html + theme.css and the assets/ folder (WebP art).
 */
import { mkdirSync, writeFileSync, cpSync, existsSync, rmSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { loadDatabase } from "./lib/load.ts";
import { runRules } from "./lib/rules.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const args = new Set(process.argv.slice(2));

export function buildContent(): { entities: number; bytes: number } {
  const db = loadDatabase(ROOT);
  const issues = [...db.issues, ...runRules(db)];
  const errors = issues.filter((i) => i.level === "error");
  if (errors.length) {
    for (const e of errors.slice(0, 20)) console.error(`  [${e.rule}] ${e.where}: ${e.message}`);
    throw new Error(`content has ${errors.length} error(s); refusing to build`);
  }
  // Compact bundle: strip art prompts/references (the client only needs file + size + transparent).
  const strip = (v: any): any => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === "object") {
      if (typeof v.file === "string" && Array.isArray(v.size) && "prompt" in v) return { file: v.file, size: v.size, transparent: v.transparent, status: v.status };
      const o: any = {};
      for (const [k, x] of Object.entries(v)) o[k] = strip(x);
      return o;
    }
    return v;
  };
  const entities: Record<string, any> = {};
  for (const [id, e] of db.registry) entities[id] = strip(e.data);
  const bundle = { version: 1, builtAt: new Date().toISOString(), entities, singletons: strip(db.singletons) };
  mkdirSync(DIST, { recursive: true });
  const text = JSON.stringify(bundle);
  writeFileSync(join(DIST, "content.json"), text);
  return { entities: db.registry.size, bytes: text.length };
}

function copyStatic() {
  copyFileSync(join(ROOT, "src/ui/index.html"), join(DIST, "index.html"));
  copyFileSync(join(ROOT, "src/ui/theme.css"), join(DIST, "theme.css"));
  const assets = join(ROOT, "assets");
  if (existsSync(assets)) cpSync(assets, join(DIST, "assets"), { recursive: true, filter: (s) => !s.endsWith("APPROVED.txt") });
}

function countFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).reduce((n, f) => n + (statSync(join(dir, f)).isDirectory() ? countFiles(join(dir, f)) : 1), 0);
}

const bundleOptions: esbuild.BuildOptions = {
  entryPoints: [join(ROOT, "src/app.ts")],
  bundle: true,
  format: "esm",
  target: ["es2022", "chrome100"],
  outfile: join(DIST, "app.js"),
  sourcemap: true,
  minify: !args.has("--watch"),
  define: { "process.env.NODE_ENV": JSON.stringify(args.has("--watch") ? "development" : "production") },
  logLevel: "info",
};

async function main() {
  if (!args.has("--watch") && !args.has("--content")) rmSync(DIST, { recursive: true, force: true });
  const t0 = Date.now();
  const c = buildContent();
  console.log(`content.json: ${c.entities} entities, ${(c.bytes / 1024).toFixed(0)} KB`);
  if (args.has("--content")) return;
  copyStatic();
  if (args.has("--watch")) {
    const ctx = await esbuild.context(bundleOptions);
    await ctx.watch();
    const { hosts, port } = await ctx.serve({ servedir: DIST, port: 5173 });
    console.log(`serving http://${hosts[0]}:${port}`);
  } else {
    await esbuild.build(bundleOptions);
    console.log(`dist/ ready in ${Date.now() - t0} ms (${countFiles(join(DIST, "assets"))} asset files)`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e.message); process.exit(1); });
