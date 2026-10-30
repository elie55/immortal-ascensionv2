/**
 * Save file encoding: versioned envelope + checksum + schema validation + migrations.
 * decode() never throws on bad data: it returns a typed failure with the reason.
 */
import { z } from "zod";
import { GameStateSchema, STATE_VERSION, type GameState } from "../engine/state.ts";

export const SaveFileSchema = z.object({
  kind: z.literal("ia-save"),
  v: z.number().int().min(1),
  slot: z.number().int().min(0),
  savedAt: z.number(),
  checksum: z.string(),
  state: z.unknown(),
});
export type SaveFile = z.infer<typeof SaveFileSchema>;

/** Stable JSON: object keys sorted, so the checksum does not depend on insertion order. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const o: Record<string, unknown> = {};
      for (const k of Object.keys(v).sort()) o[k] = (v as any)[k];
      return o;
    }
    return v;
  });
}

/** FNV-1a 32-bit over UTF-16 code units; cheap and good enough to detect truncation/corruption. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Migrations: index = version being upgraded FROM. Each takes the raw state object and returns the next.
 * Keep them pure and additive; never delete a migration once shipped.
 */
export const migrations: Record<number, (raw: any) => any> = {
  // 1 → 2: combat presets and the unlock list
  1: (st) => ({
    ...st,
    progress: { ...st.progress, unlocks: st.progress?.unlocks ?? [] },
    combat: st.combat ?? { presets: [{ name: "Balanced", rules: [{ slot: "ultimate", when: "always", target: "default" }, { slot: "heal", when: "hp_below", value: 50, target: "default" }, { slot: "shield", when: "no_shield", target: "default" }, { slot: "damage", when: "always", target: "lowest_hp" }, { slot: "basic", when: "always", target: "default" }] }], active: 0, manual: false, speed: 1 },
  }),
  // 2 → 3: crafting (furnace, proficiency) and shop restock periods
  2: (st) => ({ ...st, progress: { ...st.progress, crafting: st.progress?.crafting ?? { furnace: 1, proficiency: 0 }, shopPeriods: st.progress?.shopPeriods ?? {} } }),
  // 3 → 4: egg incubators, beast uids, Dao companions
  3: (st) => {
    const owned = st.beasts?.owned ?? {};
    const maxUid = Math.max(0, ...Object.values(owned).map((b: any) => b.uid ?? 0));
    return { ...st, beasts: { owned, active: st.beasts?.active ?? null, incubating: st.beasts?.incubating ?? [], nextUid: st.beasts?.nextUid ?? maxUid + 1 }, companions: st.companions ?? { bonded: [], active: [] } };
  },
  // 4 → 5: saved secret realm runs
  4: (st) => ({ ...st, progress: { ...st.progress, realmRuns: st.progress?.realmRuns ?? {} } }),
  // 5 → 6: bag capacity, depot, overflow pouch, expansions; tracked quest; dungeon tiers; hints seen
  5: (st) => ({
    ...st,
    inventory: { ...st.inventory, depot: st.inventory?.depot ?? { stacks: {}, gear: [] }, pouch: st.inventory?.pouch ?? { stacks: {}, gear: [] }, bagExpansions: st.inventory?.bagExpansions ?? 0, depotExpansions: st.inventory?.depotExpansions ?? 0 },
    progress: { ...st.progress, quests: { ...st.progress?.quests, tracked: st.progress?.quests?.tracked ?? null }, hintsSeen: st.progress?.hintsSeen ?? [] },
  }),
  // 6 → 7: root history
  6: (st) => ({ ...st, character: { ...st.character, rootHistory: st.character?.rootHistory ?? [{ root: st.character?.root, at: st.meta?.createdAt ?? 0, source: "origin" }] } }),
};

export function encode(state: GameState, slot: number, savedAt: number): string {
  const file: SaveFile = { kind: "ia-save", v: state.meta.version, slot, savedAt, checksum: fnv1a(canonical(state)), state };
  return JSON.stringify(file);
}

export type DecodeResult =
  | { ok: true; state: GameState; savedAt: number; slot: number; migratedFrom?: number }
  | { ok: false; reason: string; stage: "parse" | "envelope" | "checksum" | "migrate" | "validate" };

/** `target` exists for tests; production always migrates to STATE_VERSION. */
export function decode(text: string, target: number = STATE_VERSION): DecodeResult {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) { return { ok: false, stage: "parse", reason: `not JSON: ${(e as Error).message}` }; }
  const env = SaveFileSchema.safeParse(raw);
  if (!env.success) return { ok: false, stage: "envelope", reason: env.error.issues[0]?.message ?? "bad envelope" };
  const f = env.data;
  if (fnv1a(canonical(f.state)) !== f.checksum) return { ok: false, stage: "checksum", reason: "checksum mismatch (file damaged)" };
  let state: any = f.state;
  let v = f.v;
  const from = v;
  try {
    while (v < target) {
      const m = migrations[v];
      if (!m) return { ok: false, stage: "migrate", reason: `no migration from v${v}` };
      state = m(state); v++;
      state.meta.version = v;
    }
  } catch (e) { return { ok: false, stage: "migrate", reason: `migration failed: ${(e as Error).message}` }; }
  if (v > target) return { ok: false, stage: "migrate", reason: `save is from a newer version (v${v})` };
  const parsed = GameStateSchema.safeParse(state);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { ok: false, stage: "validate", reason: `${i?.path.join(".")}: ${i?.message}` };
  }
  return { ok: true, state: parsed.data, savedAt: f.savedAt, slot: f.slot, migratedFrom: from !== v ? from : undefined };
}
