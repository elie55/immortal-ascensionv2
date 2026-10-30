/**
 * Screen tour: boots dist/ at 390×844, plays a new journey through the prologue and visits every screen,
 * saving screenshots to .tmp/screens/tour-*.png. Fails on page errors or broken flows.
 *   node tools/build.ts && node tests/browser/screens.ts
 * IA_VP=360x640 picks the phone size, IA_TEXT=large turns on the Large text setting, IA_OUT the screenshot folder, IA_AUDIT=1 runs the UI checks of
 * tests/browser/ui_audit.ts on every screen (findings.json in the output folder; see tests/browser/audit.ts).
 */
import { chromium, type Page } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, statSync, rmSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const DIST = join(ROOT, "dist");
const OUT = process.env.IA_OUT ? join(ROOT, process.env.IA_OUT) : join(ROOT, ".tmp/screens");
const [VW, VH] = (process.env.IA_VP ?? "390x844").split("x").map(Number) as [number, number];
const AUDIT = process.env.IA_AUDIT === "1";
const { auditScreen } = AUDIT ? await import("./ui_audit.ts") : { auditScreen: null };
const findings: any[] = [];
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
const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errors.push(m.text()); });
let n = 0;
const failed: string[] = [];
page.on("response", (r) => { if (r.status() >= 400) failed.push(r.url().replace(url, "")); });
const shot = async (name: string) => {
  await page.waitForTimeout(350);
  const file = `tour-${String(++n).padStart(2, "0")}-${name}`;
  await page.screenshot({ path: join(OUT, `${file}.png`) });
  if (auditScreen) {
    findings.push(...await auditScreen(page, name, { shotPath: (i) => join(OUT, `${file}-p${i + 1}.png`) }));
    for (const f of failed.splice(0)) findings.push({ screen: name, check: "missing-file", severity: "error", where: f, text: "", detail: "request failed" });
  }
};
/** waitForSelector that leaves FAILED.png in the output folder when the flow breaks. */
const need = async (sel: string, opts: Parameters<Page["waitForSelector"]>[1] = {}) => { try { return await page.waitForSelector(sel, opts); } catch (e) { await page.screenshot({ path: join(OUT, "FAILED.png") }).catch(() => {}); throw e; } };
/** Close every celebration screen on top (achievements, unlocks, ranks), screenshotting the first one under `name`. */
const dismissCelebrations = async (name?: string) => {
  for (let i = 0; i < 6; i++) {
    const m = page.locator(".modal-backdrop[data-key='ov:celebrate'], .modal-backdrop[data-key='ov:rank-up']");
    if (!(await m.count())) return;
    if (name && i === 0) await shot(name);
    await m.locator(".btn", { hasText: /^(Later|Continue|Accept the honour)$/ }).first().click();
    await page.waitForTimeout(250);
  }
};
const check = (cond: unknown, msg: string) => { if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else console.log("ok  ", msg); };
const screen = (p: Page) => p.locator("main.screen").getAttribute("data-screen");
const ia = <T>(fn: string) => page.evaluate(fn) as Promise<T>;

await page.goto(url);
await need('[data-screen="menu"]');
if (process.env.IA_TEXT === "large") await page.evaluate(() => (window as any).__ia.app.setSettings({ textSize: "large" }));
await shot("main-menu-empty");
check(await page.getByText("Begin your journey").count() === 1, "fresh install offers Begin your journey");

// New journey → prologue
await page.getByText("Begin your journey").click();
await need(".vn");
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
await need('[data-screen="cultivate"]', { timeout: 5000 });
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
// Ticks re-render every second: an open sheet must stay the same element (no replayed slide-in, no scroll reset).
await page.evaluate(() => { const s = document.querySelector<HTMLElement>(".sheet")!; (window as any).__sheet = s; s.scrollTop = 40; });
await page.waitForTimeout(2300);
check(await page.evaluate(() => { const s = document.querySelector(".sheet"); return s === (window as any).__sheet && (s as HTMLElement).scrollTop === (s!.scrollHeight > s!.clientHeight + 40 ? 40 : (s as HTMLElement).scrollTop); }), "open sheet survives game ticks (same element, scroll kept)");
await page.locator(".sheet-backdrop").click({ position: { x: 20, y: 20 } });
// A slow tap that spans a tick still lands (press, wait past a re-render, release).
{
  const b = await page.locator(".nav button", { hasText: "Inventory" }).boundingBox();
  await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2); await page.mouse.down(); await page.waitForTimeout(1300); await page.mouse.up();
  check(await page.locator('[data-screen="inventory"]').count() === 1, "a long press across a tick still activates the button");
  await page.locator(".nav button", { hasText: "Cultivate" }).click();
}
// major breakthrough sheet
await page.evaluate(() => { const g = (window as any).__ia.game; g.state.character.stage = 9; g.state.character.qi = 1e6; g.tick(0, Date.now()); });
await page.locator(".cult-bt").click();
await shot("cultivate-major-sheet");
await page.locator(".modal.ceremony .btn", { hasText: "Not yet" }).click();

// character
await page.locator(".nav button", { hasText: "Character" }).click();
await need('[data-screen="character"]');
await shot("character");
await page.locator(".root-chip").click();
await need(".root-hero");
await shot("spirit-root");
check(await page.locator(".root-step").count() >= 1, "spirit root sheet shows the root history");
await page.locator(".sheet-backdrop").click({ position: { x: 20, y: 20 } });
await page.waitForTimeout(300);
await page.locator(".attr").first().click();
await shot("character-stats-sheet");
await page.locator(".sheet-backdrop").click({ position: { x: 20, y: 20 } });
await page.locator(".eq-slot").first().locator("button").click();
await shot("character-slot-sheet");
await page.locator(".sheet-backdrop").click({ position: { x: 20, y: 20 } });

// inventory
await page.evaluate(() => { const ia = (window as any).__ia; const s = ia.game.state; for (const id of ["mat.spirit_grass", "mat.spirit_iron_ore", "cons.spirit_condensing_pill", "gift.candied_hawthorn", "cons.foundation_pill"]) s.inventory.stacks[id] = 3; ia.app.router.refresh(); });
await page.locator(".nav button", { hasText: "Inventory" }).click();
await need('[data-screen="inventory"]');
await shot("inventory");
await page.locator(".inv-tab", { hasText: "Pills" }).click();
await shot("inventory-pills");

// sect
await page.locator(".nav button", { hasText: "Sect" }).click();
await need('[data-screen="sect"]');
await shot("sect");
await page.locator(".sp", { hasText: "Meditation Waterfall" }).click();
await shot("sect-location");
await page.getByText("Cultivate here").click();
check(await page.evaluate(() => (window as any).__ia.game.state.character.location) === "sectloc.meditation_waterfall", "Cultivate here moves cultivation to the waterfall");
// Your Quarters → Storage chest: store a stack, take it back (bag ↔ depot, 24 slots a page)
await page.locator(".nav button", { hasText: "Sect" }).click(); await page.locator(".nav button", { hasText: "Sect" }).click(); await need('[data-screen="sect"]');
await page.locator(".sp", { hasText: "Your Quarters" }).click(); await need('[data-screen^="loc:"]');
await page.locator(".setrow", { hasText: "Storage chest" }).last().click(); await need('[data-screen="depot"]');
await shot("depot");
{
  const tiles = await page.locator(".inv-grid .tile").count(), ph = await page.locator(".slot-empty-ph").count(), pages = await page.locator(".pg").count();
  check(ph < 6 && (tiles > 20 || pages === 0), `the bag shows its items with at most one row of free slots and no pager for one page (${tiles} items, ${ph} free, ${pages} pages)`);
}
await page.locator(".inv-grid .tile").first().click();
await page.locator(".item-detail .btn.gold").click();
check(await ia<number>("Object.keys(window.__ia.game.state.inventory.depot.stacks).length") === 1, "Store all moves a stack into the depot");
await page.locator(".seg button", { hasText: /^Depot/ }).click();
await page.locator(".inv-grid .tile").first().click();
await page.locator(".item-detail .btn.gold").click();
check(await ia<number>("Object.keys(window.__ia.game.state.inventory.depot.stacks).length") === 0, "Take all brings it back to the bag");
await page.locator(".nav button", { hasText: "Sect" }).click();

// ---------- sect systems ----------
const toSect = async () => { await page.locator(".nav button", { hasText: "Sect" }).click(); await page.locator(".nav button", { hasText: "Sect" }).click(); await need('[data-screen="sect"]'); };
const openLoc = async (name: string) => { await toSect(); await page.locator(".sp", { hasText: name }).click(); await need('[data-screen^="loc:"]'); };
await page.evaluate(() => { const ia = (window as any).__ia; const s = ia.game.state; s.resources.spirit_stones = 50000; for (const [id, n] of [["mat.lesser_enhancement_stone", 10], ["mat.refining_stone", 10], ["mat.reforging_sand", 10], ["mat.spirit_grass", 20], ["mat.peach_blossom", 10], ["mat.crane_feather", 10], ["gift.ancient_spirit_coin", 2], ["gift.osmanthus_cake", 2]] as const) s.inventory.stacks[id] = n; ia.app.router.refresh(); });
// Mission Hall
await openLoc("Mission Hall");
await page.locator(".setrow", { hasText: "Mission board" }).last().click();
await need(".quest-card");
await shot("mission-hall");
check(await page.locator(".quest-card").count() > 0, "Mission Hall lists requests");
// Sword Grounds → Bai: deliver the token, chat, gift, topics, spar card
await openLoc("Sword Grounds");
await page.locator(".setrow", { hasText: "Bai Lingshuang" }).first().click();
await need('[data-screen="npc:npc.bai_lingshuang"]');
await page.locator(".npc-act", { hasText: "Chat" }).click();
await shot("npc-bai-chat");
check(await page.locator(".chat-bubble").count() >= 2, "chat adds lines to the conversation");
await page.locator(".npc-act", { hasText: "Requests" }).click();
await need(".quest-card");
await shot("npc-requests");
await page.locator(".quest-card .btn.gold", { hasText: "Deliver" }).first().click();
check(await ia<number>("(window.__ia.game.state.progress.quests.completed['quest.main.senior_sister'] ?? 0)") === 1, "delivering Elder Wen's token completes 'Senior Sister'");
check(await page.locator('[data-screen="npc:npc.bai_lingshuang"] .aff-panel').count() === 1, "requests stay inside the NPC screen (portrait, bond and actions kept)");
const aff0 = await ia<number>("window.__ia.game.state.relations['npc.bai_lingshuang'].affinity");
await page.locator(".npc-act", { hasText: "Gift" }).click();
await need(".gift-grid");
await shot("gift-picker");
await page.locator(".sheet .btn.gold", { hasText: "Give Gift" }).click();
check(await ia<number>("window.__ia.game.state.relations['npc.bai_lingshuang'].affinity") > aff0, "a gift raises affinity");
await page.locator(".npc-act", { hasText: /Ask/ }).click();
await shot("npc-ask");
await page.locator(".setrow", { hasText: "The Frost Sword" }).click();
await page.locator(".npc-act", { hasText: "Duel" }).click();
await need(".spar-vs");
await shot("spar-card");
await page.locator(".modal .btn", { hasText: "Not now" }).click();
// Merchant
await openLoc("Merchant Pavilion");
await page.locator(".setrow", { hasText: "Merchant" }).last().click();
await need(".shop-grid");
await shot("merchant-pavilion");
const stones0 = await ia<number>("window.__ia.game.state.resources.spirit_stones");
await page.locator(".goods").first().click();
await page.locator(".sheet .btn.gold").click();
check(await ia<number>("window.__ia.game.state.resources.spirit_stones") < stones0, "buying spends spirit stones");
await page.locator(".seg button", { hasText: "Sell" }).click();
await shot("merchant-sell");
await page.locator(".seg button", { hasText: "Rumours" }).click();
await need(".rumour");
const stonesBefore = await ia<number>("window.__ia.game.state.resources.spirit_stones");
await page.locator(".rumour .btn.gold").first().click();
await page.waitForTimeout(300);
check(await ia<number>("window.__ia.game.state.resources.spirit_stones") < stonesBefore && await page.locator(".rumour.known").count() === 1, "buying a rumour spends stones and reveals the answer");
await shot("merchant-rumours");
await page.locator(".seg button", { hasText: "Sell" }).click();
await page.waitForTimeout(250);
await page.evaluate(() => { const ia = (window as any).__ia; const s = ia.game.state; const b = s.inventory.gear[s.equipped.weapon].base; const { grantGear } = ia.engine; grantGear(s, ia.content, { base: b, rarity: "common", ilvl: 2 }); grantGear(s, ia.content, { base: b, rarity: "common", ilvl: 3 }); ia.app.router.refresh(); });
await page.locator(".btn", { hasText: /^Sell all Common/ }).click();
await page.locator(".modal .btn.danger").click();
check(await ia<number>("(() => { const s = window.__ia.game.state; const worn = new Set(Object.values(s.equipped)); return Object.entries(s.inventory.gear).filter(([u, g]) => g.rarity === 'common' && !worn.has(Number(u))).length; })()") === 0, "Sell all Common sells the spare common pieces (worn ones stay)");
// Scripture Pavilion
await openLoc("Scripture Pavilion");
await page.locator(".setrow", { hasText: "Scripture stacks" }).last().click();
await need(".manual-list");
await shot("scripture-pavilion");
// Spirit Forge
await openLoc("Spirit Forge");
await page.locator(".setrow", { hasText: "Spirit forge" }).last().click();
await need(".forge-tabs");
await shot("forge-enhance");
await page.locator(".cta", { hasText: "Enhance" }).click();
check(await ia<number>("Math.max(...Object.values(window.__ia.game.state.inventory.gear).map(g => g.enhance))") >= 1, "enhancing raises a piece to +1");
await page.locator(".btn", { hasText: "Enhance ×5" }).click();
check(await ia<number>("Math.max(...Object.values(window.__ia.game.state.inventory.gear).map(g => g.enhance))") >= 2, "Enhance ×5 runs several attempts in one press");
for (const t of ["Refine", "Reforge", "Craft"]) { await page.locator(".ftab", { hasText: t }).click(); await shot(`forge-${t.toLowerCase()}`); }
// Alchemy
await openLoc("Alchemy Hall");
await page.locator(".setrow", { hasText: "Alchemy furnace" }).last().click();
await need(".alch-ring");
await shot("alchemy-hall");
await page.locator(".cta", { hasText: "Refine" }).click();
await need(".modal", { timeout: 3000 });
await shot("alchemy-result");
check(await ia<number>("window.__ia.game.state.progress.crafting.proficiency") > 0, "refining pills grows proficiency");
await page.locator(".modal .btn", { hasText: "Continue" }).click();
// Arena
await openLoc("Proving Arena");
await page.locator(".setrow", { hasText: "Tournaments" }).last().click();
await need(".bracket");
await shot("arena-bracket");
// Quest log + achievements
await page.locator(".nav button", { hasText: "Cultivate" }).click();
await page.locator(".cult-tile", { hasText: "Quests" }).click();
await need('[data-screen="quests"]');
await shot("quest-log");
{
  const done0 = await ia<number>("Object.keys(window.__ia.game.state.progress.quests.completed).length");
  if (await page.locator(".btn", { hasText: "Turn in all" }).count()) { await page.locator(".btn", { hasText: "Turn in all" }).click(); check(await ia<number>("Object.keys(window.__ia.game.state.progress.quests.completed).length") > done0, "Turn in all hands in every ready quest from the log"); }
  await page.locator(".quest-card .btn", { hasText: /^Track$/ }).first().click();
  check(await ia<string | null>("window.__ia.game.state.progress.quests.tracked") !== null && await page.locator(".tracker").count() === 1, "Track pins the quest in the tracker under the header");
  await shot("quest-tracked");
  await page.locator(".tracker").first().click();
  await page.waitForTimeout(400);
  check(await screen(page) !== "quests", `the tracker's Go leads to the quest's place (${await screen(page)})`);
  await page.locator(".nav button", { hasText: "Cultivate" }).click(); await page.locator(".nav button", { hasText: "Cultivate" }).click();
  check(await page.locator(".tracker").count() === 1, "the tracker shows on the tab screens");
  await page.locator(".tracker .tr-x").first().click();
  check(await ia<string | null>("window.__ia.game.state.progress.quests.tracked") === null, "× stops tracking");
  await page.locator(".nav button", { hasText: "Cultivate" }).click(); await page.locator(".nav button", { hasText: "Cultivate" }).click();
  await page.locator(".cult-tile", { hasText: "Quests" }).click(); await need('[data-screen="quests"]');
}
await page.locator(".btn", { hasText: "Achievements" }).click();
await shot("achievements");
await page.locator(".nav button", { hasText: "Cultivate" }).click();   // same tab again: back to the tab root
// Techniques + auto-battle
await page.locator(".nav button", { hasText: "Character" }).click();
await page.locator(".nav button", { hasText: "Character" }).click();
await page.locator(".btn", { hasText: "Techniques" }).click();
await need('[data-screen="techniques"]');
await shot("techniques");
await page.locator(".subbar .btn", { hasText: "Auto-battle" }).click();
await page.locator(".rule-main").nth(1).click();
await shot("auto-battle");
await page.locator(".rule-edit .chip", { hasText: "My HP below" }).click();
check(await ia<string>("window.__ia.game.state.combat.presets[0].rules[1].when") === "hp_below", "auto-battle rule condition edits the preset");
await page.locator(".nav button", { hasText: "Character" }).click();

// ---------- spirit beasts & Dao companions ----------
await page.locator(".nav button", { hasText: "Cultivate" }).click();
await page.locator(".cult-tile", { hasText: "Spirit Beasts" }).click();
await need('[data-screen="beasts"]');
await shot("beasts-empty");
check(await ia<number>("window.__ia.game.state.inventory.stacks['egg.cloud_fox'] ?? 0") === 0, "a new disciple has no egg");
// the empty garden points at Qin, who hands over the egg with her quest
await page.locator(".egg-hint .btn", { hasText: "See quest" }).click();
await page.locator(".btn", { hasText: /^Accept$/ }).first().click();
await page.waitForTimeout(300);
check(await ia<number>("window.__ia.game.state.inventory.stacks['egg.cloud_fox'] ?? 0") === 1, "Qin's quest hands over the cloud-fox egg");
await page.locator(".subbar .back, .subbar button").first().click();
await need('[data-screen="beasts"]');
await page.locator(".beast-cell.empty").first().click();
await page.locator(".sheet .btn", { hasText: "Incubate" }).first().click();
check(await ia<number>("window.__ia.game.state.beasts.incubating.length") === 1, "Qin's egg goes into an incubator");
await page.evaluate(() => { const ia = (window as any).__ia; for (const inc of ia.game.state.beasts.incubating) inc.wins = inc.need; ia.app.router.refresh(); });
await page.locator(".beast-cell.egg.ready").click();
await need(".modal.celebrate");
await shot("beast-hatched");
await page.locator(".modal .btn", { hasText: "Welcome" }).click();
await dismissCelebrations("celebration-achievement");
check(await page.evaluate(() => (window as any).__ia.game.state.progress.achievements["ach.beasts.beast_friend"] > 0), "hatching unlocks Beast Friend (celebration shown)");
check(await ia<string>("window.__ia.game.state.beasts.owned[window.__ia.game.state.beasts.active]?.beast") === "beast.yunyun", "YunYun hatches and becomes the active companion");
await shot("beasts");
await page.evaluate(() => { const ia = (window as any).__ia; ia.game.state.inventory.stacks["bfood.spirit_fruit"] = 30; ia.app.router.refresh(); });
await page.locator(".beast-actions .btn", { hasText: "Feed" }).click();
await shot("beast-feed");
await page.locator(".sheet .setrow", { hasText: "Spirit Fruit" }).locator(".btn.jade").click();
check(await ia<number>("window.__ia.game.state.beasts.owned[window.__ia.game.state.beasts.active].level") > 1, "feeding levels the beast up");
await page.locator(".sheet .btn", { hasText: "Done" }).click();
await page.locator(".beast-actions .btn", { hasText: "Evolve" }).click();
await shot("beast-evolve");
await page.locator(".sheet-backdrop").click({ position: { x: 20, y: 20 } });
await page.locator(".nav button", { hasText: "Cultivate" }).click();   // same tab: back to its root
await page.evaluate(() => { const ia = (window as any).__ia; ia.game.state.relations["npc.bai_lingshuang"].affinity = 1000; ia.app.router.refresh(); });
await openLoc("Sword Grounds");
await page.locator(".setrow", { hasText: "Bai Lingshuang" }).first().click();
await page.locator(".npc-act", { hasText: "Dao Companion" }).click();
await shot("dao-proposal");
await page.locator(".modal .btn.gold", { hasText: "Ask" }).click();
check(await ia<boolean>("window.__ia.game.state.companions.bonded.includes('npc.bai_lingshuang')"), "Bai Lingshuang becomes a Dao companion");
await page.locator(".nav button", { hasText: "Character" }).click();

// adventure → region map → first battle (auto), victory panel, then a manual turn
await page.locator(".nav button", { hasText: "Adventure" }).click();
await shot("adventure");
await page.locator(".region-card").first().click();
await need(".node-map");
await shot("region-map");
await page.locator(".mp-node").first().click();
await need(".node-card");
await shot("node-card");
await page.evaluate(() => { const ia = (window as any).__ia; ia.game.state.combat.manual = false; ia.game.state.combat.speed = 3; ia.app.router.refresh(); });
await page.evaluate(() => { const ia = (window as any).__ia; ia.game.state.combat.speed = 1; });
await page.locator(".node-card .btn.gold").click();
await need(".battle");
await page.waitForTimeout(1500);
await shot("battle");
/** Finish a battle: click through wave dialogs until the result panel shows. */
const untilResult = async () => { for (let i = 0; i < 12; i++) { const r = await Promise.race([page.waitForSelector(".modal.victory, .modal.defeat", { timeout: 60000 }).then(() => "end"), page.waitForSelector(".modal .btn:has-text('Next wave')", { timeout: 60000 }).then(() => "wave")]); if (r === "end") return; await page.locator(".modal .btn", { hasText: "Next wave" }).click(); await page.waitForTimeout(300); } };
await untilResult();
const won = (await page.locator(".modal.victory").count()) === 1;
check(true, `battle finished (${won ? "victory" : "defeat"})`);
await shot(won ? "victory" : "defeat");
const cleared = await page.evaluate(() => { const s = (window as any).__ia.game.state; const reg = Object.values(s.progress.regions)[0] as any; return Object.values(reg.nodes).some((n: any) => n.clears > 0); });
check(cleared === won, "node cleared iff won");
await page.locator(".modal .btn", { hasText: /Map/ }).click();
await need(".node-map");
// manual mode: start the same node, wait for input, pick a technique
await page.evaluate(() => { const ia = (window as any).__ia; ia.game.state.combat.manual = true; ia.game.state.resources.energy.value = 100; ia.app.router.refresh(); });
await page.locator(".mp-node").first().click();
await page.locator(".node-card .btn.gold").click();
await need(".bt-skill.ready", { timeout: 20000 });
await shot("battle-manual");
const readyName = await page.locator(".bt-skill.ready").first().locator(".sk-name").innerText();
await page.locator(".bt-skill.ready").first().click();
await page.waitForTimeout(600);
check(await page.evaluate(() => (window as any).__ia.game.state.combat.manual) === true, `manual turn accepted (${readyName})`);
// the manual move may have ended the wave: switch to auto from whatever comes next
for (let i = 0; i < 4 && !(await page.locator(".modal-backdrop[data-key='ov:result']").count()); i++) {
  const next = page.locator(".modal-backdrop[data-key='ov:wave'] .btn");
  if (await next.count()) { await next.click(); await page.waitForTimeout(300); continue; }
  await page.locator(".bt-controls .seg button", { hasText: "Auto" }).click(); break;
}
await untilResult();
await page.locator(".modal .btn", { hasText: /Map/ }).click();
await page.evaluate(() => { const ia = (window as any).__ia; ia.game.state.combat.manual = false; });
await page.locator(".back").click();

// ---------- dungeon hub, tower, secret realm ----------
await page.evaluate(() => { const ia = (window as any).__ia; const s = ia.game.state; s.character.permanent = { atk: 50000, hp: 900000, def: 20000, spd: 120 }; s.resources.energy.value = 100; delete s.character.hp; ia.app.router.refresh(); });
await page.locator(".nav button", { hasText: "Adventure" }).click();
await page.locator(".nav button", { hasText: "Adventure" }).click();
await page.locator(".chips .chip", { hasText: "Dungeons" }).click();
await need(".tower-hero");
await shot("dungeon-hub");
check(await page.locator(".world-switch .chip.on", { hasText: "Dungeons" }).count() === 1, "the Regions/Dungeons switch stays on the Dungeons page");
await page.locator(".world-switch .chip", { hasText: "Regions" }).click();
await need(".region-grid");
check(await page.locator(".world-switch .chip.on", { hasText: "Regions" }).count() === 1, "Regions switches back to the region list");
await page.locator(".world-switch .chip", { hasText: "Dungeons" }).click();
await need(".tower-hero");
check(await page.locator(".dungeon-card").first().locator(".tier").count() === 5 && await page.locator(".dungeon-card").first().locator(".tier.locked").count() === 4, "resource dungeons show tiers I–V, higher tiers locked until the one below is cleared");
await page.locator(".tower-hero .btn.gold").click();
await need(".battle");
await untilResult();
await page.locator(".modal .btn", { hasText: /Map/ }).click();
check(await ia<number>("window.__ia.game.state.progress.dungeons['dungeon.heaven_piercing_tower']?.bestFloor ?? 0") === 1, "climbing the tower records floor 1");
await page.locator(".th-title").click();
await need(".tw-spine");
await shot("tower");
await page.locator(".back").click();
await page.evaluate(() => { const ia = (window as any).__ia; const s = ia.game.state; s.progress.quests.completed["quest.main.bamboo_sovereign"] = 1; if (!s.progress.realmsEntered.includes("realm.foundation_establishment")) s.progress.realmsEntered.push("realm.foundation_establishment"); s.character.realm = "realm.foundation_establishment"; s.character.stage = 3; ia.app.router.refresh(); });
await page.evaluate(() => { const ia = (window as any).__ia; ia.game.settle(Date.now()); }); // sweep: realm reached → achievement + "Origin Secret Realm opened" celebrations
await page.waitForTimeout(300);
await dismissCelebrations("celebration-unlock");
check(await page.evaluate(() => (window as any).__ia.game.state.progress.unlocks.includes("opened:dungeon.origin_secret_realm")), "reaching the realm announces the secret realm once");
await page.locator(".dungeon-card", { hasText: "Origin Secret Realm" }).locator(".btn").click();
await need(".realm-map");
await page.locator(".cta", { hasText: "Enter the realm" }).click();
await shot("secret-realm");
await page.locator(".realm-card .btn.gold", { hasText: "Enter" }).click();
await need(".battle");
await untilResult();
await page.locator(".modal .btn", { hasText: /Map/ }).click();
await dismissCelebrations();
await need(".realm-map");
check(await ia<boolean>("window.__ia.game.state.progress.realmRuns['dungeon.origin_secret_realm'].cleared.includes('gate')"), "winning the gate trial opens the realm's branches");
await shot("secret-realm-progress");
await page.locator(".nav button", { hasText: "Adventure" }).click();

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
await need('[data-screen="menu"]');
await shot("main-menu-continue");
await page.evaluate(() => localStorage.setItem("ia:test:offset", String(5 * 3600 * 1000)));
await page.addInitScript(() => { (window as any).__ia = { clockOffset: Number(localStorage.getItem("ia:test:offset") ?? 0) }; });
await page.reload();
await need('[data-screen="menu"]');
check(await page.evaluate(() => (window as any).__ia.app.settings.battleSpeed) === 3, "settings persist across reloads");
await page.locator(".menu-continue").click();
await need(".modal.offline");
await shot("offline-report");
await page.locator(".modal .btn", { hasText: "Continue" }).click();
await page.evaluate(() => localStorage.setItem("ia:test:offset", String(-8 * 3600 * 1000)));
await page.evaluate(() => (window as any).__ia.app.save(false));
await page.reload();
await page.locator(".menu-continue").click();
await need(".modal.offline");
await shot("clock-moved-back");

check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
if (AUDIT) writeFileSync(join(OUT, "findings.json"), JSON.stringify({ viewport: `${VW}x${VH}`, findings }, null, 1));
await browser.close(); server.close();
