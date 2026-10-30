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
  for (const sc of c.byPrefix<any>("story")) s.progress.storySeen[sc.id] = T0;
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
  await page.waitForTimeout(650);
  await shot(`${name}-0-intro`);
  await page.waitForSelector(".bt-skill.ready", { timeout: 30_000 });
  await page.waitForTimeout(500);
  await shot(`${name}-1-start`);
  let warned = false, hit = false;
  for (let t = 0; t < (opts.turns ?? 14); t++) {
    const ready = await page.waitForSelector(".bt-skill.ready", { timeout: 30_000 }).then(() => true).catch(() => false);
    if (!ready) break;
    await page.waitForTimeout(300);
    if (!warned && await page.locator(".bt-warn").count()) { warned = true; await shot(`${name}-2-warning`); }
    if (t === 2) await page.evaluate(() => { const b = (window as any).__ia.enc.battle; b.player.ult = 100; }); // charge the ultimate for the cut-in shot
    if (t === 2) { await page.locator(".bt-skill.basic.ready").first().click(); await page.waitForTimeout(100); continue; }
    const ultb = page.locator(".bt-ultbtn.ready");
    if (await ultb.count()) { await ultb.click(); await page.waitForTimeout(450); await shot(`${name}-3b-ultimate`); await page.waitForTimeout(900); await shot(`${name}-3c-ultimate-hit`); continue; }
    const tech = page.locator(".bt-skill.ready:not(.basic)").first();
    if (!hit && await tech.count()) { await tech.click(); await page.waitForTimeout(420); await shot(`${name}-3-hit`); hit = true; continue; }
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
/** A screen in a mid-game state: `go` runs in the page after loading (window.__ia available). */
async function screen(name: string, n: number, go: string, opts: { arch?: "fitted" | "geared"; tab?: string; mutate?: (s: GameState) => void } = {}) {
  const st = labState(n, opts.arch ?? "fitted"); opts.mutate?.(st);
  await boot(st, opts.tab ?? "cultivate");
  await dismiss();
  await page.evaluate(go);
  await page.waitForTimeout(900);
  await shot(name);
}

/** Auto-play to the wave that holds the boss and screenshot its intro. */
async function bossIntro(name: string, n: number, src: any) {
  await boot(labState(n, "geared", ["npc.bai_lingshuang"]));
  await dismiss();
  await page.evaluate(() => { const st = (window as any).__ia.game.state; st.combat.speed = 1; st.combat.manual = false; });
  await page.evaluate((s) => (window as any).__ia.dev.fight(s), src);
  await page.waitForSelector(".battle");
  for (let i = 0; i < 4; i++) {
    await page.waitForSelector(".modal-backdrop", { timeout: 120_000 });
    const next = page.locator(".modal-backdrop .btn", { hasText: "Next wave" });
    if (!(await next.count())) break;
    await next.click();
    await page.waitForTimeout(900); await shot(`${name}-intro-a`);
    await page.waitForTimeout(1200); await shot(`${name}-intro-b`);
    await page.waitForTimeout(2500); await shot(`${name}-fight`);
  }
  await shot(`${name}-end`);
}

/** Mid-game sweep: every system screen with real content (region 6, geared), one screenshot each. */
async function sweep() {
  const st = labState(6, "geared", ["npc.bai_lingshuang", "npc.tang_xiaoman"]);
  st.resources.sect_fame = 2500; st.resources.spirit_stones = 48_000;
  // some bag content, a beast and a few achievements
  await boot(st, "sect");
  await dismiss();
  await page.evaluate(() => {
    const ia = (window as any).__ia; const s = ia.game.state; const c = ia.content;
    for (const id of ["mat.spirit_grass", "mat.spirit_iron_ore", "cons.qi_gathering_pill", "cons.foundation_pill", "mat.frost_beast_core", "gift.osmanthus_cake", "junk.cheap_junk_loot"]) if (c.has(id)) s.inventory.stacks[id] = (s.inventory.stacks[id] ?? 0) + 7;
    const egg = c.byPrefix("egg")[0]; if (egg) s.inventory.stacks[egg.id] = 2;
    ia.app.router.refresh();
  });
  const sect = async (name: string, loc: string, activity: string | null, sel: string) => {
    await page.locator(".nav button", { hasText: "Sect" }).click(); await page.waitForTimeout(300);
    await page.locator(".nav button", { hasText: "Sect" }).click(); await page.waitForTimeout(300);
    await page.locator(".sect-pin", { hasText: loc }).click(); await page.waitForTimeout(500);
    if (activity) { await page.locator(".setrow:not(.glass)", { hasText: activity }).last().click(); await page.waitForSelector(sel, { timeout: 10_000 }); }
    await page.waitForTimeout(600); await shot(name);
  };
  await sect("sw-forge-enhance", "Spirit Forge", "Spirit forge", ".forge-tabs");
  for (const t of ["Refine", "Reforge", "Awaken", "Craft"]) { await page.locator(".ftab", { hasText: t }).click(); await page.waitForTimeout(500); await shot(`sw-forge-${t.toLowerCase()}`); }
  await sect("sw-alchemy", "Alchemy Hall", "Alchemy furnace", ".alch-ring");
  await sect("sw-arena", "Proving Arena", "Tournaments", ".bracket");
  await sect("sw-beasts", "Spirit Beast Garden", "Beast garden", ".beast-grid");
  await sect("sw-merchant", "Merchant Pavilion", "Merchant", ".shop-grid");
  await sect("sw-scripture", "Scripture Pavilion", "Scripture stacks", ".manual-list");
  await sect("sw-missions", "Mission Hall", "Mission board", ".quest-card, .board-head");
  await sect("sw-quarters", "Your Quarters", null, "");
  for (const [tab, name] of [["Cultivate", "sw-cultivate"], ["Character", "sw-character"], ["Inventory", "sw-inventory"], ["Adventure", "sw-adventure"]] as const) {
    await page.locator(".nav button", { hasText: tab }).click(); await page.waitForTimeout(300); await page.locator(".nav button", { hasText: tab }).click(); await page.waitForTimeout(600); await shot(name);
  }
  await page.locator(".region-card").nth(5).click(); await page.waitForTimeout(700); await shot("sw-region6");
  await page.locator(".node-pin").nth(3).click({ force: true }); await page.waitForTimeout(500); await shot("sw-node-card");
  await page.locator(".back").click(); await page.waitForTimeout(400);
  await page.locator(".chips .chip", { hasText: "Dungeons" }).click(); await page.waitForTimeout(600); await shot("sw-dungeons");
  await page.locator(".nav button", { hasText: "Character" }).click(); await page.waitForTimeout(300);
  await page.locator(".btn", { hasText: "Techniques" }).click(); await page.waitForTimeout(500); await shot("sw-techniques");
  await page.locator(".nav button", { hasText: "Cultivate" }).click(); await page.waitForTimeout(300);
  await page.locator(".cult-tile", { hasText: "Quests" }).click(); await page.waitForTimeout(500); await shot("sw-quests");
  await page.locator(".btn", { hasText: "Achievements" }).click(); await page.waitForTimeout(500); await shot("sw-achievements");
}

/** Tribulation: the fitted player at stage 9 faces the realm's lightning. */
async function tribulation() {
  const st = labState(3, "geared"); st.character.stage = 9;
  await boot(st, "cultivate"); await dismiss();
  const id = await page.evaluate(() => { const ia = (window as any).__ia; const t = ia.content.byPrefix("tribulation").find((x: any) => x.realm === ia.content.nextRealm(ia.game.state.character.realm)?.id) ?? ia.content.byPrefix("tribulation")[0]; return t.id; });
  await page.evaluate((tid) => { const ia = (window as any).__ia; const s = ia.game.state; s.combat.manual = false; s.combat.speed = 1; s.progress.tribulations[tid] = { attempts: 0 }; ia.dev.fight({ kind: "tribulation", id: tid }); }, id);
  await page.waitForSelector(".battle");
  await page.waitForTimeout(900); await shot("trib-0-intro");
  await page.waitForSelector(".bt-lightning", { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(120); await shot("trib-1-bolts");
  await page.waitForTimeout(2500); await shot("trib-2-mid");
  await page.waitForSelector(".modal-backdrop", { timeout: 180_000 }).catch(() => {});
  await page.waitForTimeout(700); await shot("trib-3-end");
}

/** Defeat: a bare player sent against a much stronger place. */
async function defeat() {
  const st = labState(1, "fitted"); st.character.stage = 1; st.techniques.actives = [st.techniques.actives[0] ?? null, null, null, null];
  await boot(st, "adventure"); await dismiss();
  await page.evaluate(() => { const ia = (window as any).__ia; const s = ia.game.state; s.combat.manual = false; s.combat.speed = 3; const n = ia.content.byPrefix("node").find((x: any) => x.region === "region.blazing_mountain" && x.kind === "boss"); s.progress.regions["region.blazing_mountain"] ??= { discoveredAt: 0, nodes: {} }; s.progress.regions["region.azure_bamboo_forest"] ??= { discoveredAt: 0, nodes: {} }; ia.dev.fight({ kind: "node", id: n.id }); });
  await page.waitForSelector(".battle");
  for (let i = 0; i < 5; i++) {
    await page.waitForSelector(".modal-backdrop", { timeout: 180_000 });
    const next = page.locator(".modal-backdrop .btn", { hasText: "Next wave" });
    if (await next.count()) { await next.click(); await page.waitForTimeout(500); continue; }
    break;
  }
  await page.waitForTimeout(700); await shot("defeat-1");
  await page.evaluate(() => document.querySelector(".modal")!.scrollTo(0, 9999)); await page.waitForTimeout(300); await shot("defeat-2");
}

const SCEN: Record<string, () => Promise<void>> = {
  defeat,
  tribulation,
  sweep,
  bossintro: () => bossIntro("bossintro", 1, { kind: "node", id: nodeOf(1, "boss") }),
  waterfall: () => screen("waterfall", 2, `(async () => { const m = await import("./app.js").catch(() => null); })()`, { tab: "sect", mutate: (s) => { s.resources.sect_fame = 600; } }).then(async () => {
    await page.locator(".sect-pin", { hasText: "Meditation Waterfall" }).click(); await page.waitForTimeout(700); await page.locator(".med").scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await shot("waterfall-setup");
    await page.locator(".med-go").click(); await page.waitForTimeout(1200); await page.locator(".med").scrollIntoViewIfNeeded(); await shot("waterfall-active");
    await page.locator(".nav button", { hasText: "Cultivate" }).click(); await page.waitForTimeout(700); await shot("waterfall-cultivate-pill");
  }),
  solo: () => fight("solo", 2, { kind: "node", id: nodeOf(2, "battle") }),
  chief: () => fight("chief", 1, { kind: "node", id: nodeOf(1, "boss") }, { arch: "geared", companions: ["npc.bai_lingshuang"] }),
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
