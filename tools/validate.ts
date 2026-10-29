#!/usr/bin/env node
/**
 * Content database validator.
 *   npm run validate            → validate ./content
 *   node tools/validate.ts DIR  → validate another root (used by tests)
 *   --verbose                   → print every issue
 */
import { resolve } from "node:path";
import { validate, formatReport } from "./lib/validator.ts";

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const root = resolve(args.find((a) => !a.startsWith("--")) ?? ".");

const report = validate(root);
console.log(formatReport(report, { verbose }));
process.exit(report.errors.length ? 1 : 0);
