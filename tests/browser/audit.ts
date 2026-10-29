/**
 * UI audit: plays the screen tour (tests/browser/screens.ts) at three phone sizes with the automated UI
 * checks on (tests/browser/ui_audit.ts), then writes .tmp/audit/report.md and .tmp/audit/findings.json.
 *   npm run test:ui            → build, audit, fail on any error-level finding
 *   node tests/browser/audit.ts --no-build --keep   (reuse dist/, never fail: for review sessions)
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const OUT = join(ROOT, ".tmp/audit");
const args = process.argv.slice(2);
/** Phone sizes; "@large" also turns on the Large text setting. */
const VIEWPORTS = (args.find((a) => a.startsWith("--vp="))?.slice(5) ?? "360x640,390x844,412x915,360x640@large").split(",");
/** Findings accepted on purpose (decorative or deliberate), as "check|where-substring". Keep this short and explained. */
const ACCEPTED: { key: string; why: string }[] = JSON.parse(readFileSync(join(import.meta.dirname, "ui_audit_accepted.json"), "utf8"));

const run = (cmd: string, a: string[], env: Record<string, string> = {}) => new Promise<number>((res) => {
  const p = spawn(cmd, a, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  p.stdout.on("data", (d) => (log += d)); p.stderr.on("data", (d) => (log += d));
  p.on("close", (code) => { if (env.IA_OUT) writeFileSync(join(ROOT, env.IA_OUT, "tour.log"), log); else if (code) process.stderr.write(log); res(code ?? 1); });
});

if (!args.includes("--no-build")) { const c = await run("node", ["tools/build.ts"]); if (c) process.exit(c); }
rmSync(OUT, { recursive: true, force: true });
const codes = await Promise.all(VIEWPORTS.map((vp) => { const dir = `.tmp/audit/${vp}`; mkdirSync(join(ROOT, dir), { recursive: true }); return run("node", ["tests/browser/screens.ts"], { IA_VP: vp.split("@")[0]!, IA_TEXT: vp.split("@")[1] ?? "", IA_OUT: dir, IA_AUDIT: "1" }); }));

type F = { screen: string; check: string; severity: string; where: string; text: string; detail: string };
const all: (F & { vp: string })[] = [];
VIEWPORTS.forEach((vp, i) => {
  const f = join(OUT, vp, "findings.json");
  if (!existsSync(f)) { console.error(`${vp}: tour failed before the end (exit ${codes[i]}), see .tmp/audit/${vp}/tour.log`); return; }
  for (const x of JSON.parse(readFileSync(f, "utf8")).findings as F[]) all.push({ ...x, vp });
});
const accepted = (f: F) => ACCEPTED.some((a) => { const [c, w] = a.key.split("|"); return c === f.check && f.where.includes(w!); });
// group the same finding across phone sizes
const groups = new Map<string, { f: F; vps: string[]; details: string[] }>();
for (const f of all) {
  const k = `${f.severity}|${f.check}|${f.screen}|${f.where}|${f.text}`;
  const g = groups.get(k) ?? { f, vps: [], details: [] };
  g.vps.push(f.vp); g.details.push(`${f.vp}: ${f.detail}`); groups.set(k, g);
}
const list = [...groups.values()].filter((g) => !accepted(g.f));
const order = { error: 0, warning: 1, info: 2 } as Record<string, number>;
list.sort((a, b) => order[a.f.severity]! - order[b.f.severity]! || a.f.check.localeCompare(b.f.check) || a.f.screen.localeCompare(b.f.screen));
const count = (s: string) => list.filter((g) => g.f.severity === s).length;
const byCheck = new Map<string, number>();
for (const g of list) if (g.f.severity !== "info") byCheck.set(`${g.f.severity} ${g.f.check}`, (byCheck.get(`${g.f.severity} ${g.f.check}`) ?? 0) + 1);

const md = [`# UI audit — ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`, "",
  `Phone sizes: ${VIEWPORTS.join(", ")}. Screens: ${new Set(all.map((f) => f.screen)).size}. Tours: ${codes.map((c, i) => `${VIEWPORTS[i]} ${c ? "FAILED" : "ok"}`).join(", ")}.`, "",
  `**${count("error")} errors, ${count("warning")} warnings, ${count("info")} info** (${ACCEPTED.length} accepted patterns in tests/browser/ui_audit_accepted.json)`, "",
  ...[...byCheck].sort().map(([k, v]) => `- ${k}: ${v}`), "",
  "| sev | check | screen | where | text | detail |", "|---|---|---|---|---|---|",
  ...list.map((g) => `| ${g.f.severity} | ${g.f.check} | ${g.f.screen} | \`${g.f.where.replace(/\|/g, "/")}\` | ${g.f.text.replace(/\|/g, "/")} | ${g.vps.length === VIEWPORTS.length ? "all sizes: " + g.f.detail : g.details.join("; ")} |`)].join("\n");
writeFileSync(join(OUT, "report.md"), md + "\n");
writeFileSync(join(OUT, "findings.json"), JSON.stringify(list.map((g) => ({ ...g.f, viewports: g.vps, details: g.details })), null, 1));
console.log(`UI audit: ${count("error")} errors, ${count("warning")} warnings, ${count("info")} info → .tmp/audit/report.md`);
for (const [k, v] of [...byCheck].sort()) console.log(`  ${k}: ${v}`);
if (codes.some((c) => c)) { console.error("a tour failed: see .tmp/audit/<size>/tour.log"); process.exitCode = 1; }
if (!args.includes("--keep") && count("error")) process.exitCode = 1;
