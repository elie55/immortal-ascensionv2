/**
 * Screen tour: boots dist/ at 390×844, plays a new journey through the prologue and visits every screen,
 * saving screenshots to .tmp/screens/tour-*.png. Fails on page errors or broken flows.
 *   node tools/build.ts && node tests/browser/screens.ts
 */
import { chromium, type Page } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, statSync, rmSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const DIST = join(ROOT, "dist");
const OUT = join(ROOT, ".tmp/screens");
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2", ".map": "application/json" };
const server = createServer((req, res) => {
  const p = join(DIST, decodeURIComponent((req.url ?? "/").split("?")[0]!).replace(/^\/+/, "") || "index.html");
  if (!existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream" }); res.end(readFileSync(p));
});
await new Promise<void>((r) => server.listen(0, r));
const url = `http://127.0.0.1:${(server.address() as any).port}/`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errors.push(m.text()); });
let n = 0;
const shot = async (name: string) => { await page.waitForTimeout(350); await page.screenshot({ path: join(OUT, `tour-${String(++n).padStart(2, "0")}-${name}.png`) }); };
const check = (cond: unknown, msg: string) => { if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else console.log("ok  ", msg); };
const screen = (p: Page) => p.locator("main.screen").getAttribute("data-screen");

await page.goto(url);
await page.waitForSelector('[data-screen="menu"]');
await shot("main-menu-empty");
check(await page.getByText("Begin your journey").count() === 1, "fresh install offers Begin your journey");

// New journey → prologue
await page.getByText("Begin your journey").click();
await page.waitForSelector(".vn");
await shot("prologue-gate");
const clickVN = async (times: number) => { for (let i = 0; i < times; i++) { await page.locator(".vn").click({ position: { x: 195, y: 400 } }); await page.waitForTimeout(120); } };
/** Tap through the story until `sel` appears (each tap completes typing or advances). */
const tapUntil = async (sel: string, max = 30) => { for (let i = 0; i < max; i++) { if (await page.locator(sel).count()) return true; await page.locator(".vn").click({ position: { x: 195, y: 300 } }); await page.waitForTimeout(120); } return (await page.locator(sel).count()) > 0; };
await tapUntil(".vn-choice");
await shot("prologue-trial-choices");
await page.locator(".vn-choice").nth(1).click();
await page.waitForTimeout(300);
check(await tapUntil(".vn-card"), "welcome scene ends with the unlock card");
await shot("prologue-welcome-card");
await clickVN(1);
await page.waitForTimeout(500);
await shot("prologue-senior-sister");
await tapUntil('[data-screen="cultivate"]', 40);
await page.waitForSelector('[data-screen="cultivate"]', { timeout: 5000 });
check(true, "prologue ends in the Cultivate tab");
const st = await page.evaluate(() => { const s = (window as any).__ia.game.state; return { seen: Object.keys(s.progress.storySeen).length, aff: s.relations["npc.elder_wen"]?.affinity ?? 0, token: s.inventory.stacks["qitem.elder_wen_token"] ?? 0 }; });
check(st.seen === 4 && st.aff === 15 && st.token === 1, `prologue recorded: 4 scenes, choice affinity +15, token received (${JSON.stringify(st)})`);
await shot("cultivate");

// cultivate: breakthrough
await page.evaluate(() => { const g = (window as any).__ia.game; g.state.character.qi = 1e5; g.tick(0, Date.now()); });
await page.locator(".cult-bt").click();
await page.waitForTimeout(250);
await shot("cultivate-burst");
check(await page.evaluate(() => (window as any).__ia.game.state.character.stage) > 1, "Breakthrough button advances stages");
await page.waitForTimeout(2000);
await page.locator(".cult-method").click();
await shot("cultivate-rate-sheet");
await page.locator(".sheet-backdrop").click({ position: { x: 20, y: 20 } });
// major breakthrough sheet
await page.evaluate(() => { const g = (window as any).__ia.game; g.state.character.stage = 9; g.state.character.qi = 1e6; g.tick(0, Date.now()); });
await page.locator(".cult-bt").click();
await shot("cultivate-major-sheet");
await page.locator(".sheet-backdrop").click({ position: { x: 20, y: 20 } });

// character
await page.locator(".nav button", { hasText: "Character" }).click();
await page.waitForSelector('[data-screen="character"]');
await shot("character");
await page.locator(".attr").first().click();
await shot("character-stats-sheet");
await page.locator(".sheet-backdrop").click({ position: { x: 20, y: 20 } });
await page.locator(".eq-slot").first().locator("button").click();
await shot("character-slot-sheet");
await page.locator(".sheet-backdrop").click({ position: { x: 20, y: 20 } });

// inventory
await page.evaluate(() => { const ia = (window as any).__ia; const s = ia.game.state; for (const id of ["mat.spirit_grass", "mat.spirit_iron_ore", "cons.spirit_condensing_pill", "gift.candied_hawthorn", "cons.foundation_pill"]) s.inventory.stacks[id] = 3; ia.app.router.refresh(); });
await page.locator(".nav button", { hasText: "Inventory" }).click();
await page.waitForSelector('[data-screen="inventory"]');
await shot("inventory");
await page.locator(".chip", { hasText: "Pills" }).click();
await shot("inventory-pills");

// sect
await page.locator(".nav button", { hasText: "Sect" }).click();
await page.waitForSelector('[data-screen="sect"]');
await shot("sect");
await page.locator(".sect-pin", { hasText: "Meditation Waterfall" }).click();
await shot("sect-location");
await page.getByText("Cultivate here").click();
check(await page.evaluate(() => (window as any).__ia.game.state.character.location) === "sectloc.meditation_waterfall", "Cultivate here moves cultivation to the waterfall");

// adventure
await page.locator(".nav button", { hasText: "Adventure" }).click();
await shot("adventure");

// settings + save slots from Cultivate
await page.locator(".nav button", { hasText: "Cultivate" }).click();
await page.locator(".cult-tile", { hasText: "Settings" }).click();
await shot("settings");
await page.locator(".seg button", { hasText: "3×" }).click();
check(await page.evaluate(() => (window as any).__ia.app.settings.battleSpeed) === 3, "settings change persists in memory");
await page.locator(".btn", { hasText: "Save slots" }).click();
await shot("save-slots");

// back to the menu, then continue with time away
await page.evaluate(() => (window as any).__ia.app.toMenu());
await page.waitForSelector('[data-screen="menu"]');
await shot("main-menu-continue");
await page.evaluate(() => localStorage.setItem("ia:test:offset", String(5 * 3600 * 1000)));
await page.addInitScript(() => { (window as any).__ia = { clockOffset: Number(localStorage.getItem("ia:test:offset") ?? 0) }; });
await page.reload();
await page.waitForSelector('[data-screen="menu"]');
check(await page.evaluate(() => (window as any).__ia.app.settings.battleSpeed) === 3, "settings persist across reloads");
await page.locator(".menu-continue").click();
await page.waitForSelector(".modal.offline");
await shot("offline-report");
await page.locator(".modal .btn", { hasText: "Continue" }).click();
await page.evaluate(() => localStorage.setItem("ia:test:offset", String(-8 * 3600 * 1000)));
await page.evaluate(() => (window as any).__ia.app.save(false));
await page.reload();
await page.locator(".menu-continue").click();
await page.waitForSelector(".modal.offline");
await shot("clock-moved-back");

check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
await browser.close(); server.close();
