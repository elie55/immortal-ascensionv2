import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, basename, relative } from "node:path";
import type { ZodTypeAny } from "zod";
import { COLLECTIONS, SINGLETONS, type Collection } from "../../schema/index.ts";
import { prefixOf, type Prefix } from "../../schema/ids.ts";
import { RARITIES } from "../../schema/common.ts";

export interface Issue { level: "error" | "warning"; rule: string; where: string; message: string }

export interface Entity {
  id: string;
  prefix: Prefix;
  file: string;
  data: any;
  /** For gear rarity variants: the owning family id. */
  family?: string;
}

export interface Database {
  root: string;
  registry: Map<string, Entity>;
  byPrefix: Map<Prefix, Entity[]>;
  singletons: Record<keyof typeof SINGLETONS, any>;
  issues: Issue[];
}

/** Minimal glob: supports `*` within the last path segment only (e.g. dir/*.json, dir/*.techs.json). */
export function expandGlob(root: string, pattern: string): string[] {
  const dir = join(root, dirname(pattern));
  const pat = basename(pattern);
  if (!existsSync(dir)) return [];
  if (!pat.includes("*")) {
    const f = join(dir, pat);
    return existsSync(f) ? [f] : [];
  }
  const re = new RegExp("^" + pat.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
  return readdirSync(dir)
    .filter((f) => re.test(f) && statSync(join(dir, f)).isFile())
    .sort()
    .map((f) => join(dir, f));
}

function readJson(file: string, issues: Issue[]): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    issues.push({ level: "error", rule: "json", where: file, message: `invalid JSON: ${(e as Error).message}` });
    return undefined;
  }
}

function parseWith(schema: ZodTypeAny, value: unknown, where: string, issues: Issue[]): any | undefined {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  for (const iss of r.error.issues) {
    issues.push({ level: "error", rule: "schema", where: `${where} › ${iss.path.join(".") || "(root)"}`, message: iss.message });
  }
  return undefined;
}

export function loadDatabase(root: string): Database {
  const issues: Issue[] = [];
  const registry = new Map<string, Entity>();
  const byPrefix = new Map<Prefix, Entity[]>();
  for (const c of COLLECTIONS) byPrefix.set(c.prefix, []);

  const register = (e: Entity) => {
    const prev = registry.get(e.id);
    if (prev) {
      issues.push({ level: "error", rule: "duplicate-id", where: `${e.file} › ${e.id}`, message: `duplicate ID (also in ${prev.file})` });
      return;
    }
    registry.set(e.id, e);
    byPrefix.get(e.prefix)!.push(e);
  };

  for (const c of COLLECTIONS as Collection[]) {
    for (const file of expandGlob(root, c.files)) {
      const rel = relative(root, file);
      const raw = readJson(file, issues);
      if (raw === undefined) continue;
      if (!Array.isArray(raw)) {
        issues.push({ level: "error", rule: "file-shape", where: rel, message: "content file must be a JSON array" });
        continue;
      }
      raw.forEach((item, i) => {
        const idGuess = typeof item?.id === "string" ? item.id : `#${i}`;
        const data = parseWith(c.schema, item, `${rel} › ${idGuess}`, issues);
        if (!data) return;
        if (prefixOf(data.id) !== c.prefix) {
          issues.push({ level: "error", rule: "wrong-collection", where: `${rel} › ${data.id}`, message: `ID prefix does not match collection ${c.prefix}` });
          return;
        }
        register({ id: data.id, prefix: c.prefix, file: rel, data });
        if (c.prefix === "gear") {
          for (const r of RARITIES) {
            const v = data.rarities[r];
            if (v) register({ id: `${data.id}.${r}`, prefix: "gear", file: rel, data: { ...v, rarity: r, slot: data.slot, family: data.id }, family: data.id });
          }
        }
      });
    }
  }

  const singletons = {} as Record<keyof typeof SINGLETONS, any>;
  for (const [key, s] of Object.entries(SINGLETONS) as [keyof typeof SINGLETONS, { file: string; schema: ZodTypeAny }][]) {
    const file = join(root, s.file);
    if (!existsSync(file)) {
      issues.push({ level: "error", rule: "missing-file", where: s.file, message: "required singleton file is missing" });
      continue;
    }
    const raw = readJson(file, issues);
    if (raw === undefined) continue;
    singletons[key] = parseWith(s.schema, raw, s.file, issues);
  }

  return { root, registry, byPrefix, singletons, issues };
}

export const isFamilyId = (id: string) => id.startsWith("gear.") && id.split(".").length === 2;
export const isGearItemId = (id: string) => id.startsWith("gear.") && id.split(".").length === 3;
