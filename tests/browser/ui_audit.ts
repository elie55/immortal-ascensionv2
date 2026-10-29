/**
 * Automated UI checks run on the screen currently shown in a Playwright page (see docs/qa/UX_CHECKLIST.md).
 * Used by tests/browser/screens.ts when IA_AUDIT=1; tests/browser/audit.ts runs that tour at several phone
 * sizes and writes the report.
 *
 * Checks, on the top layer only (open sheet > open modal > screen + nav), at every scroll page of the screen:
 *   offscreen      element sticks out of the viewport (and is not inside a horizontal scroller)
 *   clipped        text or control cut by a parent that does not scroll
 *   text-cut       text overflows its own box without an ellipsis (truncated or spilling)
 *   ellipsis       text shortened with "…" (info: fine for long names, bad for prices/costs)
 *   font-size      text under 10 px (error) or 11 px (warning)
 *   contrast       text colour vs the actual pixels behind it (WCAG ratio)
 *   tap-size       buttons/controls smaller than 24 px (error) or 32 px (warning)
 *   tap-overlap    two controls overlapping
 *   covered        a control or text hidden under another element
 *   text-overlap   two texts drawn on top of each other
 *   nav-clearance  the bottom of a scrolled-to-the-end screen still sits under the nav bar
 *   placeholder    fallback icon shown where art should be (info while the art run is going)
 */
import type { Page } from "playwright";
import { createRequire } from "node:module";
// pngjs as bundled with Playwright (decodes the screenshots for the contrast pass)
const { PNG } = createRequire(import.meta.url)("playwright-core/lib/utilsBundle") as { PNG: { sync: { read(b: Buffer): { width: number; height: number; data: Uint8Array } } } };

export type Severity = "error" | "warning" | "info";
export interface Finding { screen: string; check: string; severity: Severity; where: string; text: string; detail: string }

/** In-page part: geometry, fonts, overlap. Returns findings plus text boxes for the pixel contrast pass. */
function inPage(arg: { pageIdx: number }) {
  const out: { check: string; severity: "error" | "warning" | "info"; where: string; text: string; detail: string }[] = [];
  const vw = window.innerWidth, vh = window.innerHeight;
  const appEl = document.querySelector(".app") as HTMLElement | null;
  const appRect = appEl ? appEl.getBoundingClientRect() : new DOMRect(0, 0, vw, vh);
  const sheets = [...document.querySelectorAll<HTMLElement>(".sheet")];
  const modals = [...document.querySelectorAll<HTMLElement>(".modal-backdrop .modal")];
  const vn = document.querySelector<HTMLElement>(".vn");
  const nav = document.querySelector<HTMLElement>("nav.nav");
  let roots: HTMLElement[];
  if (sheets.length) roots = [sheets[sheets.length - 1]!];
  else if (modals.length) roots = [modals[modals.length - 1]!];
  else if (vn) roots = [vn];
  else roots = [document.querySelector<HTMLElement>("main.screen"), nav].filter(Boolean) as HTMLElement[];
  const navRect = !sheets.length && !modals.length && nav ? nav.getBoundingClientRect() : null;

  const name = (el: Element): string => {
    const parts: string[] = [];
    let e: Element | null = el;
    for (let i = 0; e && i < 3 && !e.matches("main.screen, body"); i++, e = e.parentElement) {
      const cls = [...e.classList].filter((c) => !/^(on|sel|ready|glass|gold|hi)$/.test(c)).slice(0, 2).join(".");
      parts.unshift(e.tagName.toLowerCase() + (cls ? "." + cls : ""));
    }
    return parts.join(" > ");
  };
  const textOf = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) return false;
    }
    return true;
  };
  const opacityOf = (el: Element): number => { let o = 1; for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
  /** Nearest ancestors that clip; returns the visible rect and whether the clipper scrolls on that axis. */
  const clipInfo = (el: Element) => {
    let r = el.getBoundingClientRect();
    let vis = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    let scrollX = false, scrollY = false, clipped = false;
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const ox = cs.overflowX, oy = cs.overflowY;
      if (ox === "visible" && oy === "visible") continue;
      const pr = e.getBoundingClientRect();
      if (ox !== "visible") { if (ox === "auto" || ox === "scroll") scrollX = true; else if (r.left < pr.left - 1 || r.right > pr.right + 1) clipped = true; vis.l = Math.max(vis.l, pr.left); vis.r = Math.min(vis.r, pr.right); }
      if (oy !== "visible") { if (oy === "auto" || oy === "scroll") scrollY = true; else if (r.top < pr.top - 1 || r.bottom > pr.bottom + 1) clipped = true; vis.t = Math.max(vis.t, pr.top); vis.b = Math.min(vis.b, pr.bottom); }
    }
    return { vis, scrollX, scrollY, clipped };
  };
  const isDecor = (el: Element) => !!el.closest("[aria-hidden=true], .bt-fx, .toasts, .burst-ring, svg");

  // ---------- collect ----------
  const texts: HTMLElement[] = [];
  const controls: HTMLElement[] = [];
  for (const root of roots) {
    for (const el of root.querySelectorAll<HTMLElement>("*")) {
      if (isDecor(el)) continue;
      if (el.matches("button, a[href], input, select, textarea, [role=button], [role=switch], [role=radio]")) { if (visible(el)) controls.push(el); }
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim().length > 0);
      if (own && visible(el)) texts.push(el);
    }
  }
  const inView = (r: DOMRect) => r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;

  // ---------- per text ----------
  const lineBoxes: { el: HTMLElement; rects: DOMRect[] }[] = [];
  const contrastJobs: { id: number; where: string; text: string; rects: { x: number; y: number; w: number; h: number }[]; color: string; alpha: number; large: boolean; shadow: boolean; size: number }[] = [];
  texts.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    if (!inView(r)) return;
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    const where = name(el), text = textOf(el);
    // font size (Chinese glyphs are legible a little smaller; badges/counters may be 10)
    // Uppercase / small-caps labels and short counters ("3", "+12", "4/10") read fine at 10 px; running text needs 11.
    const label = cs.textTransform === "uppercase" || cs.fontVariantCaps === "small-caps" || /^[\d\s+×x%/.,:·−-]{1,7}$/.test(text);
    if (fs < 10) out.push({ check: "font-size", severity: "error", where, text, detail: `${fs}px` });
    else if (fs < 11 && !label) out.push({ check: "font-size", severity: "warning", where, text, detail: `${fs}px` });
    // own overflow
    const ow = el.scrollWidth - el.clientWidth, oh = el.scrollHeight - el.clientHeight;
    const hidesX = cs.overflowX !== "visible", clamp = cs.webkitLineClamp && cs.webkitLineClamp !== "none";
    if (el.clientWidth > 0 && ow > 1) {
      if (cs.textOverflow === "ellipsis" && hidesX) out.push({ check: "ellipsis", severity: "info", where, text, detail: `shortened by ${ow}px` });
      else if (hidesX && ow > 3) out.push({ check: "text-cut", severity: "error", where, text, detail: `cut by ${ow}px (no ellipsis)` }); // ≤3px is glyph side-bearing
      else if (cs.whiteSpace === "nowrap" || cs.display.includes("inline") === false) out.push({ check: "text-cut", severity: "warning", where, text, detail: `spills ${ow}px out of its box` });
    }
    if (clamp && oh > 2) out.push({ check: "ellipsis", severity: "info", where, text, detail: `line-clamped` });
    const ci = clipInfo(el);
    if (ci.clipped && !ci.scrollX && !ci.scrollY) out.push({ check: "clipped", severity: "error", where, text, detail: "cut by a parent box" });
    if ((r.right > appRect.right + 1 || r.left < appRect.left - 1) && !ci.scrollX && !ci.clipped) out.push({ check: "offscreen", severity: "error", where, text, detail: `x ${Math.round(r.left)}–${Math.round(r.right)} of ${Math.round(appRect.width)}` });
    // line boxes for overlap + contrast
    const range = document.createRange();
    const rects: DOMRect[] = [];
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent!.trim()) { range.selectNodeContents(n); for (const rr of range.getClientRects()) if (rr.width > 2 && rr.height > 2) rects.push(rr); }
    const visRects = rects.map((rr) => ({ x: Math.max(rr.left, ci.vis.l), y: Math.max(rr.top, ci.vis.t), r: Math.min(rr.right, ci.vis.r), b: Math.min(rr.bottom, ci.vis.b) }))
      .filter((v) => v.r - v.x > 2 && v.b - v.y > 2 && v.y >= 0 && v.b <= vh && (!navRect || v.b <= navRect.top || v.y >= navRect.bottom || roots.length === 1 || el.closest("nav")));
    // glyphs fill roughly the middle 70% of a line box; neighbours with tight line-height touch otherwise
    const vrect = (rr: DOMRect) => { const t = Math.max(rr.top + rr.height * 0.15, ci.vis.t), b = Math.min(rr.bottom - rr.height * 0.15, ci.vis.b); return new DOMRect(Math.max(rr.left, ci.vis.l), t, Math.min(rr.right, ci.vis.r) - Math.max(rr.left, ci.vis.l), b - t); };
    lineBoxes.push({ el, rects: rects.map(vrect).filter((v) => v.width > 1 && v.height > 1) });
    const transparentText = cs.color === "rgba(0, 0, 0, 0)" || cs.webkitTextFillColor === "rgba(0, 0, 0, 0)" || /text/.test(cs.backgroundClip) || /text/.test((cs as any).webkitBackgroundClip ?? "");
    const disabled = !!el.closest("button[disabled], [aria-disabled=true]"); // WCAG exempts inactive controls
    if (!transparentText && !disabled && visRects.length) {
      const m = cs.color.match(/rgba?\(([^)]+)\)/); const parts = m ? m[1]!.split(",").map((x) => parseFloat(x)) : [255, 255, 255, 1];
      const bold = parseInt(cs.fontWeight) >= 700;
      contrastJobs.push({ id: i, where, text, rects: visRects.map((v) => ({ x: v.x, y: v.y, w: v.r - v.x, h: v.b - v.y })), color: `${parts[0]},${parts[1]},${parts[2]}`, alpha: (parts[3] ?? 1) * opacityOf(el),
        large: fs >= 24 || (bold && fs >= 18.66), shadow: cs.textShadow !== "none", size: fs });
    }
  });

  // ---------- text over text ----------
  const area = (a: { left: number; top: number; right: number; bottom: number }) => Math.max(0, a.right - a.left) * Math.max(0, a.bottom - a.top);
  const inter = (a: DOMRect, b: DOMRect) => area({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) });
  for (let i = 0; i < lineBoxes.length; i++) for (let j = i + 1; j < lineBoxes.length; j++) {
    const A = lineBoxes[i]!, B = lineBoxes[j]!;
    if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
    if (!!A.el.closest("nav") !== !!B.el.closest("nav")) continue; // content scrolling under the nav bar
    for (const a of A.rects) for (const b of B.rects) {
      const ov = inter(a, b);
      if (ov > 0.25 * Math.min(area(a), area(b)) && ov > 12) {
        if (getComputedStyle(A.el).visibility === "hidden" || getComputedStyle(B.el).visibility === "hidden") continue;
        out.push({ check: "text-overlap", severity: "error", where: `${name(A.el)}  ×  ${name(B.el)}`, text: `${textOf(A.el)} × ${textOf(B.el)}`, detail: `${Math.round(ov)}px²` });
        j = lineBoxes.length; break;
      }
    }
  }

  // ---------- controls ----------
  const ctrlRects = controls.map((el) => { const r = el.getBoundingClientRect(), v = clipInfo(el).vis; return { el, r, v: new DOMRect(v.l, v.t, Math.max(0, v.r - v.l), Math.max(0, v.b - v.t)) }; });
  for (const { el, r } of ctrlRects) {
    if (!inView(r)) continue;
    const where = name(el), text = textOf(el) || el.getAttribute("aria-label") || "";
    const ci = clipInfo(el);
    const small = Math.min(r.width, r.height);
    if (!el.matches("input[type=range]")) {
      if (small < 24) out.push({ check: "tap-size", severity: "error", where, text, detail: `${Math.round(r.width)}×${Math.round(r.height)}` });
      else if (small < 32) out.push({ check: "tap-size", severity: "warning", where, text, detail: `${Math.round(r.width)}×${Math.round(r.height)}` });
    }
    if (ci.clipped && !ci.scrollX && !ci.scrollY) out.push({ check: "clipped", severity: "error", where, text, detail: "control cut by a parent box" });
    if ((r.right > appRect.right + 1 || r.left < appRect.left - 1) && !ci.scrollX) out.push({ check: "offscreen", severity: "error", where, text, detail: `x ${Math.round(r.left)}–${Math.round(r.right)}` });
    // covered: sample the centre (inside the visible part, away from the nav)
    const cx = (Math.max(r.left, ci.vis.l) + Math.min(r.right, ci.vis.r)) / 2, cy = (Math.max(r.top, ci.vis.t) + Math.min(r.bottom, ci.vis.b)) / 2;
    if (cx < 0 || cy < 0 || cx > vw || cy > vh) continue;
    if (navRect && !el.closest("nav") && cy > navRect.top - 2) continue;
    if (Math.min(r.right, ci.vis.r) - Math.max(r.left, ci.vis.l) < 4 || Math.min(r.bottom, ci.vis.b) - Math.max(r.top, ci.vis.t) < 4) continue;
    const hit = document.elementFromPoint(cx, cy);
    if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) out.push({ check: "covered", severity: "error", where, text, detail: `under ${name(hit)}` });
  }
  for (let i = 0; i < ctrlRects.length; i++) for (let j = i + 1; j < ctrlRects.length; j++) {
    const A = ctrlRects[i]!, B = ctrlRects[j]!;
    if (A.el.contains(B.el) || B.el.contains(A.el) || !inView(A.v) || !inView(B.v)) continue;
    if (!!A.el.closest("nav") !== !!B.el.closest("nav")) continue; // content scrolling under the nav bar
    const ov = inter(A.v, B.v);
    if (ov > 16) out.push({ check: "tap-overlap", severity: "error", where: `${name(A.el)}  ×  ${name(B.el)}`, text: `${textOf(A.el)} × ${textOf(B.el)}`, detail: `${Math.round(ov)}px²` });
  }

  // ---------- placeholders ----------
  let ph = 0;
  for (const root of roots) ph += root.querySelectorAll(".tile > .in > svg, .tile > .in > .ico, .bt-sprite-ph, .avatar > svg, .beast-art > svg, .tech-ico > svg").length;
  if (ph) out.push({ check: "placeholder", severity: "info", where: "*", text: "", detail: `${ph} fallback icon(s) instead of art` });

  // ---------- nav clearance (last page only) ----------
  const main = document.querySelector<HTMLElement>("main.screen");
  if (navRect && main && main.scrollHeight > main.clientHeight + 2 && Math.abs(main.scrollTop + main.clientHeight - main.scrollHeight) < 3) {
    let maxB = 0; let lastEl: Element | null = null;
    for (const el of main.querySelectorAll("*")) { const rr = el.getBoundingClientRect(); if (rr.height < 1 || rr.width < 1 || !visible(el) || getComputedStyle(el).position === "fixed") continue; const vb = Math.min(rr.bottom, clipInfo(el).vis.b); if (vb > maxB) { maxB = vb; lastEl = el; } }
    if (maxB > navRect.top - 2 && lastEl) out.push({ check: "nav-clearance", severity: "error", where: name(lastEl), text: textOf(lastEl), detail: `ends ${Math.round(maxB - navRect.top)}px under the nav` });
  }
  return { out, contrastJobs };
}

/** Pixel pass (in Node, on the screenshot): contrast of each text against the median colour behind it. */
function contrastOf(png: { width: number; height: number; data: Uint8Array }, dpr: number, jobs: ReturnType<typeof inPage>["contrastJobs"]) {
  const lin = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const res: { id: number; ratio: number; bg: string }[] = [];
  for (const j of jobs) {
    const [fr, fg, fb] = j.color.split(",").map(Number) as [number, number, number];
    const px: number[][] = [];
    for (const rc of j.rects) {
      const x0 = Math.floor(rc.x * dpr), y0 = Math.floor(rc.y * dpr), w = Math.max(1, Math.floor(rc.w * dpr)), hh = Math.max(1, Math.floor(rc.h * dpr));
      if (x0 < 0 || y0 < 0 || x0 + w > png.width || y0 + hh > png.height) continue;
      const step = Math.max(1, Math.floor(Math.sqrt((w * hh) / 900)));
      for (let y = 0; y < hh; y += step) for (let x = 0; x < w; x += step) { const k = ((y0 + y) * png.width + x0 + x) * 4; px.push([png.data[k]!, png.data[k + 1]!, png.data[k + 2]!]); }
    }
    if (px.length < 12) continue;
    // background = median of the pixels that are not glyph-coloured
    const far = px.filter((p) => Math.hypot(p[0]! - fr, p[1]! - fg, p[2]! - fb) > 70);
    const pool = far.length > px.length * 0.3 ? far : px;
    const med = (k: number) => { const a = pool.map((p) => p[k]!).sort((x, y) => x - y); return a[a.length >> 1]!; };
    const br = med(0), bgc = med(1), bb = med(2);
    const a = Math.min(1, j.alpha);
    const er = fr * a + br * (1 - a), eg = fg * a + bgc * (1 - a), eb = fb * a + bb * (1 - a);
    res.push({ id: j.id, ratio: ratio(lum(er, eg, eb), lum(br, bgc, bb)), bg: `rgb(${br},${bgc},${bb})` });
  }
  return res;
}

/** Audit the visible screen at each scroll page (max `pages`). Returns de-duplicated findings. */
export async function auditScreen(page: Page, screen: string, opts: { pages?: number; dpr?: number; shotPath?: (i: number) => string } = {}): Promise<Finding[]> {
  const pages = opts.pages ?? 3, dpr = opts.dpr ?? 2;
  const found = new Map<string, Finding>();
  // The game re-renders every tick; pause the loop so every pass sees the same DOM.
  await page.evaluate(() => { const app = (window as any).__ia?.app; (window as any).__iaLoopWas = app?.timer !== undefined; app?.stopLoop?.(); });
  // Settle entrance animations (fade/rise) so colours are measured at full opacity; looping ones keep running.
  const settle = () => page.evaluate(() => { for (const a of document.getAnimations()) { const t = a.effect?.getTiming(); if (t && t.iterations !== Infinity) a.finish(); } });
  await settle();
  const scrollEl = `(() => { const s = [...document.querySelectorAll(".sheet")].pop(); const m = [...document.querySelectorAll(".modal-backdrop .modal")].pop(); return s ?? m ?? document.querySelector("main.screen"); })()`;
  const scroller = await page.evaluate(`(() => { const el = ${scrollEl}; return el ? { h: el.scrollHeight, c: el.clientHeight, top: el.scrollTop } : null; })()`) as { h: number; c: number; top: number } | null;
  const nPages = scroller ? Math.min(pages, Math.max(1, Math.ceil((scroller.h - 4) / Math.max(1, scroller.c * 0.85)))) : 1;
  for (let i = 0; i < nPages; i++) {
    if (scroller && i > 0) {
      await page.evaluate(`(() => { const el = ${scrollEl}; if (el) el.scrollTop = ${i === nPages - 1 ? "el.scrollHeight" : `el.clientHeight * 0.85 * ${i}`}; })()`);
      await page.waitForTimeout(120); await settle();
    }
    // Battles keep running while we look: measure only when the screenshot and the DOM show the same layers.
    const layers = () => page.evaluate(() => `${document.querySelectorAll(".modal-backdrop, .sheet").length}|${document.querySelector("main.screen")?.getAttribute("data-screen")}`);
    let shot: Buffer, res: ReturnType<typeof inPage>;
    for (let tries = 0; ; tries++) {
      const before = await layers();
      shot = await page.screenshot({ path: i > 0 && opts.shotPath ? opts.shotPath(i) : undefined });
      res = await page.evaluate(inPage, { pageIdx: i });
      if ((await layers()) === before || tries >= 3) break;
      await page.waitForTimeout(400); await settle();
    }
    const { out, contrastJobs } = res;
    const cres = contrastOf(PNG.sync.read(shot), dpr, contrastJobs);
    for (const c of cres) {
      const j = contrastJobs.find((x) => x.id === c.id)!;
      const need = j.large ? 3 : 4.5;
      if (c.ratio >= need) continue;
      const sev: Severity = c.ratio < (j.large ? 2 : 3) && !j.shadow ? "error" : c.ratio < (j.large ? 2 : 3) ? "warning" : j.shadow ? "info" : "warning";
      out.push({ check: "contrast", severity: sev, where: j.where, text: j.text, detail: `${c.ratio.toFixed(2)}:1 (needs ${need}) on ${c.bg}${j.shadow ? ", has text-shadow" : ""}, ${j.size}px` });
    }
    for (const f of out) { const k = `${f.check}|${f.where}|${f.text}`; if (!found.has(k)) found.set(k, { screen, ...f }); }
  }
  if (scroller) await page.evaluate(`(() => { const el = ${scrollEl}; if (el) el.scrollTop = ${scroller.top}; })()`);
  await page.evaluate(() => { if ((window as any).__iaLoopWas) (window as any).__ia.app.startLoop(); });
  return [...found.values()];
}
