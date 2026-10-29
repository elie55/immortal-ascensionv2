/**
 * Browser smoke test: serves dist/ on a local port, boots the game in a 390×844 viewport, verifies the
 * cultivation loop, a breakthrough, persistence across reload and the offline report. Takes screenshots.
 *   node tools/build.ts && node tests/browser/smoke.ts
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const DIST = join(ROOT, "dist");
const OUT = join(ROOT, ".tmp/screens");
mkdirSync(OUT, { recursive: true });
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".map": "application/json" };

const server = createServer((req, res) => {
  const p = join(DIST, decodeURIComponent((req.url ?? "/").split("?")[0]!).replace(/^\/+/, "") || "index.html");
  if (!existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as any).port;
const url = `http://127.0.0.1:${port}/`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errors.push(m.text()); });   // missing art (not yet generated) is not a code error
page.on("requestfailed", (r) => { if (!r.url().includes("/assets/")) errors.push(`request failed: ${r.url()}`); });

const check = (cond: unknown, msg: string) => { if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else console.log("ok  ", msg); };

await page.goto(url);
await page.waitForSelector('[data-screen="cultivate"]');
await page.screenshot({ path: join(OUT, "01-cultivate.png") });
const qi0 = await page.evaluate(() => (window as any).__ia.game.state.character.qi);
await page.waitForTimeout(2300);
const qi1 = await page.evaluate(() => (window as any).__ia.game.state.character.qi);
check(qi1 > qi0, `Qi ticks up live (${qi0.toFixed(2)} → ${qi1.toFixed(2)})`);
check(await page.locator(".tabbar .tab").count() === 5, "five navigation tabs");

// give enough Qi for a breakthrough through the dev hook, click the button, expect stage 2
await page.evaluate(() => { const g = (window as any).__ia.game; g.state.character.qi = 1e6; g.tick(0, Date.now()); });
await page.getByRole("button", { name: /^Break Through$/ }).click();
await page.waitForTimeout(200);
check(await page.evaluate(() => (window as any).__ia.game.state.character.stage) === 2, "breakthrough button advances to stage 2");
await page.screenshot({ path: join(OUT, "02-after-breakthrough.png") });

// autosave after an important action, then reload: state persists
await page.waitForTimeout(300);
const saved = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("ia:")));
check(saved.includes("ia:slot:0"), `slot written to storage (${saved.join(", ")})`);
await page.reload();
await page.waitForSelector('[data-screen="cultivate"]');
check(await page.evaluate(() => (window as any).__ia.game.state.character.stage) === 2, "stage 2 survives a reload");

// offline: pretend 3 hours passed by offsetting the clock before reload
await page.evaluate(() => localStorage.setItem("ia:test:offset", String(3 * 3600 * 1000)));
await page.addInitScript(() => { (window as any).__ia = { clockOffset: Number(localStorage.getItem("ia:test:offset") ?? 0) }; });
await page.reload();
await page.waitForSelector(".modal");
const modalText = await page.locator(".modal").innerText();
check(/Welcome back/.test(modalText) && /3h/.test(modalText), "offline report shows 3h away");
await page.screenshot({ path: join(OUT, "03-offline-report.png") });
const stagesBtn = page.locator(".modal button", { hasText: /Break through ×/ });
const label = await stagesBtn.innerText();
await stagesBtn.click();
await page.waitForTimeout(200);
const stage = await page.evaluate(() => (window as any).__ia.game.state.character.stage);
check(stage > 2, `offline breakthroughs applied (${label} → stage ${stage})`);

// clock moved back
await page.evaluate(() => localStorage.setItem("ia:test:offset", String(-6 * 3600 * 1000)));
await page.reload();
await page.waitForSelector(".modal");
check(/clock moved back/i.test(await page.locator(".modal").innerText()), "clock-moved-back notice");
await page.screenshot({ path: join(OUT, "04-clock-back.png") });

check(errors.length === 0, `no console/page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
await browser.close();
server.close();
