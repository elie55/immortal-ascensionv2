import { loadDatabase, type Issue, type Database } from "./load.ts";
import { runRules, contentCounts } from "./rules.ts";

export interface Report {
  db: Database;
  errors: Issue[];
  warnings: Issue[];
  counts: Record<string, number>;
  targets: Record<string, number>;
}

export function validate(root: string): Report {
  const db = loadDatabase(root);
  // Only run semantic rules when the data at least parsed; otherwise cascades hide the real problem.
  const schemaErrors = db.issues.filter((i) => i.level === "error");
  const issues = schemaErrors.length ? db.issues : [...db.issues, ...runRules(db)];
  return {
    db,
    errors: issues.filter((i) => i.level === "error"),
    warnings: issues.filter((i) => i.level === "warning"),
    counts: contentCounts(db),
    targets: db.singletons.content_targets?.targets ?? {},
  };
}

export function formatReport(r: Report, opts: { verbose?: boolean } = {}): string {
  const lines: string[] = [];
  const group = (list: Issue[]) => {
    const m = new Map<string, Issue[]>();
    for (const i of list) { if (!m.has(i.rule)) m.set(i.rule, []); m.get(i.rule)!.push(i); }
    return m;
  };
  if (r.errors.length) {
    lines.push(`\n✖ ${r.errors.length} error(s)`);
    for (const [rule, list] of group(r.errors)) {
      lines.push(`  [${rule}] ×${list.length}`);
      for (const i of list.slice(0, opts.verbose ? list.length : 15)) lines.push(`     ${i.where}: ${i.message}`);
      if (!opts.verbose && list.length > 15) lines.push(`     … ${list.length - 15} more (use --verbose)`);
    }
  }
  if (r.warnings.length) {
    lines.push(`\n⚠ ${r.warnings.length} warning(s)`);
    for (const [rule, list] of group(r.warnings)) {
      lines.push(`  [${rule}] ×${list.length}`);
      for (const i of list.slice(0, opts.verbose ? list.length : 8)) lines.push(`     ${i.where}: ${i.message}`);
      if (!opts.verbose && list.length > 8) lines.push(`     … ${list.length - 8} more (use --verbose)`);
    }
  }
  lines.push("\nContent vs spec targets");
  const keys = new Set([...Object.keys(r.targets), ...Object.keys(r.counts)]);
  for (const k of [...keys].sort()) {
    const have = r.counts[k] ?? 0, want = r.targets[k];
    const bar = want ? (have >= want ? "✓" : `${Math.round((100 * have) / want)}%`) : " ";
    lines.push(`  ${k.padEnd(20)} ${String(have).padStart(5)}${want ? ` / ${want}` : ""}  ${bar}`);
  }
  lines.push(r.errors.length ? "\nRESULT: FAIL" : "\nRESULT: OK");
  return lines.join("\n");
}
