/**
 * Test lab: screenshots of any screen in a mid-game state, without playing the journey.
 *   node tools/build.ts && node tests/browser/lab.ts [scenario ...]
 * A state is built in Node by the balance simulator's archetypes (region n, "fitted" or "geared"), encoded as a save,
 * loaded through window.__ia.dev.load, then the scenario drives the page (start a fight, open a screen…).
 * Screenshots go to .tmp/lab/<scenario>-*.png. IA_VP=360x640 picks the phone size.
 */
import { chromium, type Page } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { loadDatabase } from "../../tools/lib/load.ts";
import { ContentIndex, type ContentBundle } from "../../src/content/index.ts";
import { makePlayer, regionsOf, T0 } from "../../tools/balance/sim_lib.ts";
import { encode } from "../../src/save/codec.ts";
import type { GameState } from "../../src/engine/state.ts";

const ROOT = join(import.meta.dirname, "../..");
const DIST = join(ROOT, "dist");
const OUT = join(ROOT, process.env.IA_OUT ?? ".tmp/lab");
const [VW, VH] = (process.env.IA_VP ?? "390x844").split("x").map(Number) as [number, number];
mkdirSync(OUT, { recursive: true });

const db = loadDatabase(ROOT);
const entities: Record<string, any> = {}; for (const [id, e] of db.registry) entities[id] = e.data;
const c = new ContentIndex({ version: 1, builtAt: "lab", entities, singletons: db.singletons } as ContentBundle);
const regions = regionsOf(c);

/** A mid-game save: region n archetype, story seen, optional Dao companions. */
export function labState(n: number, arch: "fitted" | "geared" = "geared", companions: string[] = []): GameState {
  const s = makePlayer(c, n, arch, 1);
  for (const sc of c.byPrefix<any>("scene")) s.progress.storySeen[sc.id] = T0;
  s.companions.bonded = [...companions]; s.companions.active = [...companions];
  s.progress.hintsSeen = Object.keys((globalThis as any).HELP ?? {});
  return s;
}

const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2", ".map": "application/json" };
const server = createServer((req, res) => {
  const p = join(DIST, decodeURIComponent((req.url ?? "/").split("?")[0]!).replace(/^\/+/, "") || "index.html");
  if (!existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream" }); res.end(readFileSync(p));
});
await new Promise<void>((r) => server.listen(0, r));
const url = `http://127.0.0.1:${(server.address() as any).port}/`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errors.push(m.text()); });

async function boot(state: GameState, tab = "cultivate") {
  await page.goto(url);
  await page.waitForSelector('[data-screen="menu"]');
  await page.evaluate(([text, t]) => (window as any).__ia.dev.load(text, t), [encode(state, 0, T0), tab] as const);
  await page.waitForTimeout(400);
}
const shot = (name: string) => page.screenshot({ path: join(OUT, `${name}.png`) });
const pause = () => page.evaluate(() => (document.querySelector(".bt-pause") as HTMLElement | null)?.click());

/** Close celebration screens and other modals left by loading a mid-game save. */
async function dismiss() {
  for (let i = 0; i < 10; i++) {
    const m = page.locator(".modal-backdrop");
    if (!(await m.count())) break;
    const btn = m.locator(".btn", { hasText: /^(Later|Continue|Accept the honour|Got it|Close)$/ }).first();
    if (!(await btn.count())) break;
    await btn.click(); await page.waitForTimeout(250);
  }
  await page.waitForTimeout(3600); // toasts fade
}

/**
 * Start a fight in manual mode (the screen holds still on every player turn) and take screenshots:
 * the opening, the first big-attack warning, a hit in flight, and the result after switching to auto.
 */
async function fight(name: string, n: number, src: any, opts: { companions?: string[]; arch?: "fitted" | "geared"; turns?: number } = {}) {
  await boot(labState(n, opts.arch ?? "fitted", opts.companions ?? []));
  await dismiss();
  await page.evaluate(() => { const st = (window as any).__ia.game.state; st.combat.speed = 1; st.combat.manual = true; });
  await page.evaluate((s) => (window as any).__ia.dev.fight(s), src);
  await page.waitForSelector(".battle");
  await page.waitForSelector(".bt-skill.ready", { timeout: 30_000 });
  await page.waitForTimeout(500);
  await shot(`${name}-1-start`);
  let warned = false, hit = false;
  for (let t = 0; t < (opts.turns ?? 14); t++) {
    const ready = await page.waitForSelector(".bt-skill.ready", { timeout: 30_000 }).then(() => true).catch(() => false);
    if (!ready) break;
    await page.waitForTimeout(300);
    if (!warned && await page.locator(".bt-warn").count()) { warned = true; await shot(`${name}-2-warning`); }
    const tech = page.locator(".bt-skill.ready:not(.basic)").first();
    if (!hit && await tech.count()) { await tech.click(); await page.waitForTimeout(650); await shot(`${name}-3-hit`); hit = true; continue; }
    await page.locator(".bt-skill.basic.ready").first().click();
    if (await page.locator(".modal-backdrop").count()) break;
  }
  await page.locator(".bt-controls .seg button", { hasText: "Auto" }).click().catch(() => {});
  await page.evaluate(() => { (window as any).__ia.game.state.combat.speed = 3; });
  for (let i = 0; i < 6; i++) {
    await page.waitForSelector(".modal-backdrop", { timeout: 120_000 }).catch(() => {});
    await page.waitForTimeout(700);
    const next = page.locator(".modal-backdrop .btn", { hasText: "Next wave" });
    if (await next.count()) { await shot(`${name}-4-wave`); await next.click(); continue; }
    break;
  }
  await shot(`${name}-5-end`);
}

const nodeOf = (n: number, kind: string) => c.nodesOf(regions[n - 1]!.id).find((x) => x.kind === kind && x.waves?.length)!.id;
const SCEN: Record<string, () => Promise<void>> = {
  solo: () => fight("solo", 2, { kind: "node", id: nodeOf(2, "battle") }),
  elite: () => fight("elite", 3, { kind: "node", id: nodeOf(3, "elite") }),
  boss: () => fight("boss", 2, { kind: "node", id: nodeOf(2, "boss") }, { companions: ["npc.bai_lingshuang"] }),
  party: () => fight("party", 5, { kind: "node", id: nodeOf(5, "boss") }, { companions: ["npc.bai_lingshuang", "npc.tang_xiaoman"] }),
  multi: () => fight("multi", 4, { kind: "node", id: c.nodesOf(regions[3]!.id).filter((x) => x.kind === "battle" && x.waves?.length).sort((a, b) => b.waves![0]!.length - a.waves![0]!.length)[0]!.id }),
};

const want = process.argv.slice(2);
for (const k of want.length ? want : Object.keys(SCEN)) {
  if (!SCEN[k]) { console.error("unknown scenario", k); continue; }
  try { await SCEN[k]!(); console.log("ok  ", k); } catch (e) { console.error("FAIL", k, (e as Error).message); await shot(`${k}-FAILED`).catch(() => {}); process.exitCode = 1; }
}
if (errors.length) { console.error("page errors:", errors.slice(0, 5)); process.exitCode = 1; }
await browser.close(); server.close();
