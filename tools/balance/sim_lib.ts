/** Player archetypes shared by the balance simulator and its diagnostics. */
import type { ContentIndex, Region, Realm } from "../../src/content/index.ts";
import { newGameState, type GameState } from "../../src/engine/state.ts";
import { grantGear, EQUIP_SLOTS } from "../../src/engine/inventory.ts";
import { RARITIES } from "../../schema/common.ts";

export const T0 = Date.UTC(2026, 9, 29, 12, 0, 0);
export type Arch = "bare" | "fitted" | "geared" | "idle";
export const rIdx = (r: string) => RARITIES.indexOf(r as any);
export const band = (n: number): [number, number] => { const lo = 8 * (n - 1) + 1; return [lo, lo + 11]; };
export const rrange = (n: number): [string, string] => n <= 4 ? ["uncommon", "legendary"] : n <= 7 ? ["rare", "mythic"] : n <= 10 ? ["epic", "immortal"] : ["legendary", "immortal"];

export const regionsOf = (c: ContentIndex) => c.byPrefix<Region>("region").slice().sort((a, b) => a.order - b.order);

/** One droppable base per slot (median main_value) for rolled "expected" gear. */
/** Drop tags a region's loot pools use (regions.py / places.py). */
export const regionTags = (reg: Region) => reg.order === 1 ? ["plains", "starter"] : reg.order === 2 ? ["forest", "sect"] : [reg.id.split(".")[1]!];

/** One base per slot that actually drops in region n (falling back to earlier regions), median main_value. */
const basesOf = (c: ContentIndex, n: number) => {
  const regions = regionsOf(c);
  const out: Record<string, string> = {};
  for (const slot of ["weapon", "armor", "helmet", "boots", "necklace", "ring", "artifact"]) {
    for (let k = n; k >= 1 && !out[slot]; k--) {
      const tags = regionTags(regions[k - 1]!);
      const list = c.byPrefix<any>("gear").filter((b) => b.slot === slot && b.droppable && !b.unique && b.drop_tags.some((t: string) => tags.includes(t))).sort((a, b) => a.main_value - b.main_value);
      if (list.length) out[slot] = list[Math.floor(list.length / 2)]!.id;
    }
  }
  return out;
};

const FAME = [0, 0, 600, 1000, 1500, 2500, 4000, 6000, 9000, 12000, 16000, 20000, 26000, 34000, 45000];
/** Provisional: the sect rank a fitted player holds while in region n. */
export const rankAt = (n: number) => n <= 3 ? 1 : n <= 6 ? 2 : n <= 9 ? 3 : n <= 12 ? 4 : n <= 14 ? 5 : 6;

/** Earliest region (order) where a technique/method can be acquired, by walking its sources. 99 = never. */
const availCache = new WeakMap<ContentIndex, Map<string, number>>();
export function availableAt(c: ContentIndex, id: string): number {
  let m = availCache.get(c);
  if (!m) { m = buildAvailability(c); availCache.set(c, m); }
  return m.get(id) ?? 99;
}
function buildAvailability(c: ContentIndex): Map<string, number> {
  const regions = regionsOf(c);
  const regionOfNode = new Map<string, number>();
  for (const r of regions) for (const nd of c.nodesOf(r.id)) regionOfNode.set(nd.id, r.order);
  const enemyRegion = new Map<string, number>();
  for (const r of regions) for (const nd of c.nodesOf(r.id)) for (const e of nd.waves?.flat() ?? []) enemyRegion.set(e, Math.min(enemyRegion.get(e) ?? 99, r.order));
  const dungeonRegion = (d: any): number => { const es = (d.waves ?? []).flatMap((w: any) => w.enemies).concat((d.realm_nodes ?? []).flatMap((n: any) => n.waves?.flat() ?? [])); const rs = es.map((e: string) => enemyRegion.get(e) ?? 99); return rs.length ? Math.min(...rs) : 99; };
  const lootRegion = new Map<string, number>();
  const bump = (id: string, n: number) => lootRegion.set(id, Math.min(lootRegion.get(id) ?? 99, n));
  for (const e of [...c.byPrefix<any>("enemy"), ...c.byPrefix<any>("boss")]) if (e.loot) bump(e.loot, enemyRegion.get(e.id) ?? 99);
  for (const nd of c.byPrefix<any>("node")) if (nd.chest) bump(nd.chest, regionOfNode.get(nd.id) ?? 99);
  for (const d of c.byPrefix<any>("dungeon")) { const n = dungeonRegion(d); if (d.rewards.per_wave) bump(d.rewards.per_wave, n); bump(d.rewards.clear, n); for (const rn of d.realm_nodes ?? []) if (rn.chest) bump(rn.chest, n); }
  for (const t of c.byPrefix<any>("tribulation")) { const r = c.get<any>(t.realm); const reg = regions.find((x) => c.get<any>(x.realm_range.max).order >= r.order); bump(t.rewards, reg?.order ?? 99); }
  const itemRegion = new Map<string, number>();
  const give = (id: string, n: number) => itemRegion.set(id, Math.min(itemRegion.get(id) ?? 99, n));
  for (const lt of c.byPrefix<any>("loot")) { const n = lootRegion.get(lt.id) ?? 99; for (const e of lt.entries) if (e.id) give(e.id, n); for (const g of lt.guaranteed) give(g.id, n); }
  const fameRegion = (f: number) => { const i = FAME.findIndex((x) => x >= f); return i < 0 ? 99 : i + 1; };
  const rankRegion = (rankId?: string) => { if (!rankId) return 1; const o = c.get<any>(rankId).order; for (let n = 1; n <= 15; n++) if (rankAt(n) >= o) return n; return 99; };
  for (const sh of c.byPrefix<any>("shop")) {
    const owner = sh.owner ? c.get<any>(sh.owner) : null;
    const base = owner?.location?.startsWith("node.") ? regionOfNode.get(owner.location) ?? 99 : sh.id === "shop.origin_realm_merchant" ? 3 : 1;
    for (const e of sh.stock) if (e.id) give(e.id, Math.max(base, fameRegion(e.unlock?.sect_fame ?? 0), rankRegion(e.unlock?.rank), e.unlock?.realm ? regions.find((x) => c.get<any>(x.realm_range.min).order >= c.get<any>(e.unlock.realm.id).order)?.order ?? 99 : 1));
  }
  const questRegion = (q: any): number => {
    let n = 1;
    for (const r of q.prereqs?.regions ?? []) n = Math.max(n, regions.find((x) => x.id === r)?.order ?? 99);
    if (q.prereqs?.realm) n = Math.max(n, regions.find((x) => c.get<any>(x.realm_range.max).order >= c.get<any>(q.prereqs.realm.id).order)?.order ?? 99);
    if (q.giver?.startsWith("npc.")) { const loc = c.get<any>(q.giver).location; if (loc?.startsWith("node.")) n = Math.max(n, regionOfNode.get(loc) ?? 99); }
    return n;
  };
  for (const q of c.byPrefix<any>("quest")) { const n = questRegion(q); for (const it of q.rewards.items ?? []) give(it.id, n); for (const t of q.rewards.techniques ?? []) give(t, n); }
  for (const t of c.byPrefix<any>("tournament")) { const n = Math.max(rankRegion(t.entry.rank), fameRegion(t.entry.sect_fame ?? 0)); for (const x of t.champion_rewards.techniques ?? []) give(x, n); for (const it of t.champion_rewards.items ?? []) give(it.id, n); }
  for (const a of c.byPrefix<any>("ach")) for (const t of a.rewards.techniques ?? []) give(t, 3);
  // tower milestones: reachable once the floor's power is about the fitted CP of a region (≈ cp_base(n)·3)
  for (const d of c.byPrefix<any>("dungeon")) if (d.kind === "tower") for (const m of d.tower.milestones) {
    const power = d.rec_cp * Math.pow(d.tower.cp_growth_per_floor, m.floor - 1);
    let n = 1; while (n < 15 && 130 * Math.pow(2.05, n - 1) * 3 < power) n++;
    for (const it of m.rewards.items ?? []) give(it.id, n); for (const g of m.rewards.gear ?? []) give(g.base, n);
  }
  for (const sc of c.byPrefix<any>("story")) for (const u of sc.unlocks ?? []) if (u.startsWith("tech.") || u.startsWith("method.")) give(u, 1);
  const ss = c.starting; for (const t of ss.techniques) give(t, 1); give(ss.method, 1);
  // books teach techniques
  for (const b of c.byPrefix<any>("book")) { const n = itemRegion.get(b.id); if (n !== undefined) give(b.teaches, n); }
  return itemRegion;
}

function learnable(c: ContentIndex, s: GameState, kind: string, n: number) {
  const realmOrder = (id: string) => c.get<Realm>(id).order;
  const ro = realmOrder(s.character.realm);
  return c.byPrefix<any>("tech").filter((t) => t.kind === kind && !t.enemy_only && availableAt(c, t.id) <= n && (!t.requirements?.realm || realmOrder(t.requirements.realm.id) < ro || (realmOrder(t.requirements.realm.id) === ro && (t.requirements.realm.stage ?? 1) <= s.character.stage)));
}
const dmgScore = (t: any) => t.power * t.hits * (t.targeting === "all_enemies" ? 1.6 : 1) + (t.heal_pct ?? 0) * 2 + (t.shield_pct_max_hp ?? 0) * 2;
const masteryMax = (t: any) => (t.mastery?.max_level ?? 10) * (t.mastery?.xp_per_level ?? 100);

export function makePlayer(c: ContentIndex, n: number, arch: Arch, seed: number, stageOverride?: number): GameState {
  const regions = regionsOf(c);
  const realmOrder = (id: string) => c.get<Realm>(id).order;
  const reg = regions[n - 1]!;
  const s = newGameState(c, T0, { seed });
  const realmId = arch === "geared" || arch === "idle" ? reg.realm_range.max : reg.realm_range.min;
  const ro = realmOrder(realmId);
  s.character.realm = realmId;
  s.character.stage = stageOverride ?? (arch === "geared" || arch === "idle" ? 9 : 5);
  s.progress.realmsEntered = c.realms.filter((r) => r.order <= ro).map((r) => r.id);
  for (const r of regions) if (r.order <= n) s.progress.regions[r.id] ??= { discoveredAt: T0, nodes: {} };
  s.resources.energy.value = 100; s.resources.spirit_stones = 1e9;
  if (arch === "bare") return s;
  // gear (the idle archetype keeps its starting gear: cultivation and techniques only)
  if (arch !== "idle") {
  const gn = arch === "fitted" ? Math.max(1, n - 1) : n;
  const BASES = basesOf(c, gn);
  const [blo, bhi] = band(gn);
  const [rlo, rhi] = rrange(gn);
  const rarity = arch === "fitted" ? RARITIES[Math.min(rIdx(rlo) + 1, rIdx(rhi))]! : RARITIES[Math.max(rIdx(rlo), rIdx(rhi) - 1)]!;
  const ilvl = arch === "fitted" ? Math.round((blo + bhi) / 2) : bhi;
  const plus = arch === "fitted" ? 4 : 10;
  s.equipped = {};
  for (const slot of EQUIP_SLOTS) {
    if (slot === "artifact" && ro < 2) continue;
    const base = BASES[slot.startsWith("ring") ? "ring" : slot];
    if (!base) continue;
    const b = c.get<any>(base);
    const r = RARITIES[Math.min(Math.max(rIdx(rarity), rIdx(b.rarity_range[0])), rIdx(b.rarity_range[1]))]!;
    const uid = grantGear(s, c, { base, rarity: r, ilvl });
    s.inventory.gear[uid]!.enhance = plus;
    s.equipped[slot] = uid;
  }
  }
  // techniques
  const xpFor = (t: any) => arch === "geared" ? masteryMax(t) : 3 * (t.mastery?.xp_per_level ?? 100);
  const actives = learnable(c, s, "active", n).sort((a, b) => dmgScore(b) - dmgScore(a));
  const heal = actives.find((t) => t.heal_pct), shield = actives.find((t) => t.shield_pct_max_hp);
  const picks: any[] = [];
  for (const t of [heal, shield, ...actives]) if (t && !picks.includes(t) && picks.length < 4) picks.push(t);
  s.techniques.known = {};
  picks.forEach((t, i) => { s.techniques.known[t.id] = xpFor(t); s.techniques.actives[i] = t.id; });
  const passives = learnable(c, s, "passive", n).sort((a, b) => Object.values(b.passive_bonuses).reduce((x: number, y: any) => x + y, 0) - Object.values(a.passive_bonuses).reduce((x: number, y: any) => x + y, 0)).slice(0, 2);
  passives.forEach((t, i) => { s.techniques.known[t.id] = xpFor(t); s.techniques.passives[i] = t.id; });
  const ult = learnable(c, s, "ultimate", n).sort((a, b) => dmgScore(b) - dmgScore(a))[0];
  if (ult) { s.techniques.known[ult.id] = xpFor(ult); s.techniques.ultimate = ult.id; }
  // method: best learnable by qi_mult
  const methods = c.byPrefix<any>("method").filter((m) => availableAt(c, m.id) <= n).filter((m) => !m.requirements?.realm || realmOrder(m.requirements.realm.id) <= ro).filter((m) => !m.requirements?.rank || c.get<any>(m.requirements.rank).order <= rankAt(n));
  const method = methods.sort((a, b) => b.qi_mult - a.qi_mult)[0];
  if (method) { s.character.method = method.id; s.character.methodMastery[method.id] = arch === "geared" ? masteryMax(method) : 300; }
  // root: fitted keeps faint mortal; geared has a dual root
  if (arch === "geared") s.character.root = "root.wood_water_dual";
  // beast
  if (n >= 2 && arch !== "idle") {
    const stage = arch === "geared" ? "adult" : "juvenile", level = arch === "geared" ? 25 : 10;
    s.beasts.owned[1] = { uid: 1, beast: "beast.yunyun", name: "YunYun", stage, level, xp: 0, bond: arch === "geared" ? 10 + 20 + 30 + 40 + 50 + 60 : 10 + 20 + 30, hatchedAt: T0 };
    s.beasts.active = 1; s.beasts.nextUid = 2;
  }
  return s;
}

