/** Build a ContentIndex straight from content/ for engine tests (same path tools/build.ts uses). */
import { loadDatabase } from "../../tools/lib/load.ts";
import { ContentIndex, type ContentBundle } from "../../src/content/index.ts";
import { join } from "node:path";

let cached: ContentIndex | undefined;
export function testContent(): ContentIndex {
  if (cached) return cached;
  const db = loadDatabase(join(import.meta.dirname, "../.."));
  const errors = db.issues.filter((i) => i.level === "error");
  if (errors.length) throw new Error(`content errors: ${errors[0]!.where} ${errors[0]!.message}`);
  const entities: Record<string, any> = {};
  for (const [id, e] of db.registry) entities[id] = e.data;
  cached = new ContentIndex({ version: 1, builtAt: "test", entities, singletons: db.singletons } as ContentBundle);
  return cached;
}
