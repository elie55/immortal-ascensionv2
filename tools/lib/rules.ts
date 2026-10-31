import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Database, type Entity, type Issue } from "./load.ts";
import { looksLikeId, prefixOf, ITEM_PREFIXES, type Prefix } from "../../schema/ids.ts";
import { RARITIES, REFINE_CAP, rarityIndex, SLOTS, type Rarity } from "../../schema/common.ts";
import { checkRules as checkGearRules, regionBand } from "../../schema/gear-math.ts";

type Ctx = { db: Database; err: (rule: string, where: string, msg: string) => void; warn: (rule: string, where: string, msg: string) => void };

const ITEM = new Set<string>(ITEM_PREFIXES);
const isItem = (id: string) => ITEM.has(prefixOf(id) ?? "");
const gearKey = (base: string, rarity: string) => `${base}|${rarity}`;

// ------------------------------------------------------------------ helpers

/** Walk any JSON value; call fn(string, path) for every string. Skips `art` subtrees. */
function walkStrings(v: unknown, fn: (s: string, path: string) => void, path = ""): void {
  if (typeof v === "string") fn(v, path);
  else if (Array.isArray(v)) v.forEach((x, i) => walkStrings(x, fn, `${path}[${i}]`));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      if (k === "art") continue;
      walkStrings(x, fn, path ? `${path}.${k}` : k);
    }
  }
}

function addAll<T>(set: Map<string, Set<string>>, key: string, who: string) {
  if (!set.has(key)) set.set(key, new Set());
  set.get(key)!.add(who);
}

function rewardIds(r: any): string[] {
  if (!r) return [];
  const out: string[] = [];
  for (const q of r.items ?? []) out.push(q.id);
  for (const t of r.techniques ?? []) out.push(t);
  for (const b of r.beasts ?? []) out.push(b);
  for (const t of r.titles ?? []) out.push(t);
  return out;
}

/** Collect "grants" (who can give what) and "uses" (who consumes/needs what) across the database. */
export function buildGraph(db: Database) {
  const sources = new Map<string, Set<string>>();   // id → set of giver descriptions
  const uses = new Map<string, Set<string>>();      // id → set of consumer descriptions
  const appears = new Map<string, Set<string>>();   // enemy/boss/npc/event/story/shop/loot/dungeon → places
  const lootOwners = new Map<string, Set<string>>();
  /** (base|rarity) → who grants it. Gear is never an item ref; see docs/GEAR.md. */
  const gearSources = new Map<string, Set<string>>();
  /** Every concrete gear grant/drop seen, for rarity-range and divine checks. */
  const gearGrants: { base: string; rarity: string; who: string; where: string; viaLoot?: string; fromPool?: boolean }[] = [];
  /** Pool entries: for each weighted rarity, how many matching bases can actually be that rarity. */
  const poolChecks: { where: string; filter: any; rarity: string; matches: number }[] = [];

  const grant = (id: string, who: string) => addAll(sources, id, who);
  const gearGrant = (base: string, rarity: string, who: string, where: string, viaLoot?: string, fromPool = false) => {
    gearGrants.push({ base, rarity, who, where, viaLoot, fromPool });
    addAll(gearSources, gearKey(base, rarity), who);
  };
  const inRange = (base: Entity, rarity: string) => {
    const [lo, hi] = base.data.rarity_range as [Rarity, Rarity];
    const i = rarityIndex(rarity as Rarity);
    return i >= rarityIndex(lo) && i <= rarityIndex(hi);
  };
  /** Resolve a loot gear selector to base ids. */
  const resolveSelector = (sel: any): string[] => {
    if (sel.base) return [sel.base];
    const f = sel.pool ?? {};
    return [...db.registry.values()].filter((e) => e.prefix === "gear" && e.data.droppable
      && (!f.slot || e.data.slot === f.slot) && (!f.set || e.data.set === f.set)
      && (!f.tags || f.tags.every((t: string) => e.data.drop_tags.includes(t)))).map((e) => e.id);
  };
  const use = (id: string, who: string) => addAll(uses, id, who);
  const appear = (id: string, who: string) => addAll(appears, id, who);

  const all = [...db.registry.values()];
  const ss = db.singletons.starting_state;
  if (ss) {
    for (const q of ss.inventory) grant(q.id, "starting_state");
    for (const t of ss.techniques) grant(t, "starting_state");
    grant(ss.method, "starting_state");
    for (const [slot, g] of Object.entries<any>(ss.equipped)) gearGrant(g.base, g.rarity, "starting_state", `starting_state.equipped.${slot}`);
    appear(ss.character, "starting_state");
    appear(ss.region, "starting_state");
    appear(ss.root, "starting_state");
  }

  // loot owners first
  for (const e of all) {
    const d = e.data;
    switch (e.prefix) {
      case "enemy": case "boss": addAll(lootOwners, d.loot, e.id); break;
      case "node": if (d.chest) addAll(lootOwners, d.chest, e.id); break;
      case "dungeon":
        if (d.rewards.per_wave) addAll(lootOwners, d.rewards.per_wave, e.id);
        addAll(lootOwners, d.rewards.clear, e.id);
        for (const t of d.tiers ?? []) addAll(lootOwners, t.rewards.clear, e.id);
        for (const n of d.realm_nodes ?? []) if (n.chest) addAll(lootOwners, n.chest, e.id);
        break;
      case "tribulation": addAll(lootOwners, d.rewards, e.id); break;
    }
  }

  for (const e of all) {
    const d = e.data;
    switch (e.prefix) {
      case "loot":
        if (lootOwners.has(e.id)) {
          for (const en of d.entries) {
            if ("gear" in en) {
              const bases = resolveSelector(en.gear);
              for (const [r, w] of Object.entries<number>(en.rarity_weights)) {
                if (!(w > 0)) continue;
                if (en.gear.base) { gearGrant(en.gear.base, r, `loot:${e.id}`, `${e.id}.entries`, e.id); continue; }
                const ok = bases.filter((b) => inRange(db.registry.get(b)!, r));
                poolChecks.push({ where: `${e.id}.entries`, filter: en.gear.pool, rarity: r, matches: ok.length });
                for (const b of ok) gearGrant(b, r, `loot:${e.id}`, `${e.id}.entries`, e.id, true);
              }
            } else grant(en.id, `loot:${e.id}`);
          }
          for (const g of d.guaranteed) grant(g.id, `loot:${e.id}`);
          for (const g of d.guaranteed_gear) gearGrant(g.base, g.rarity, `loot:${e.id}`, `${e.id}.guaranteed_gear`, e.id);
        }
        for (const o of lootOwners.get(e.id) ?? []) appear(e.id, o);
        break;
      case "shop":
        for (const [i, s] of d.stock.entries()) {
          if (s.gear) gearGrant(s.gear.base, s.gear.rarity, `shop:${e.id}`, `${e.id}.stock[${i}]`);
          else { grant(s.id, `shop:${e.id}`); use(s.id, `shop:${e.id}`); }
        }
        if (d.owner) appear(d.owner, `shop:${e.id}`);
        break;
      case "alchemy":
        grant(d.output.id, `alchemy:${e.id}`);
        for (const q of d.ingredients) use(q.id, `alchemy:${e.id}`);
        if (d.failure?.byproduct) grant(d.failure.byproduct, `alchemy:${e.id}`);
        if (d.unlock.type === "blueprint") use(d.unlock.id, `alchemy:${e.id}`);
        if (d.unlock.type === "npc") appear(d.unlock.id, `alchemy:${e.id}`);
        break;
      case "forge":
        gearGrant(d.output.base, d.output.rarity, `forge:${e.id}`, `${e.id}.output`);
        for (const q of d.ingredients) use(q.id, `forge:${e.id}`);
        if (d.unlock.type === "blueprint") use(d.unlock.id, `forge:${e.id}`);
        if (d.unlock.type === "npc") appear(d.unlock.id, `forge:${e.id}`);
        break;
      case "quest":
        for (const id of rewardIds(d.rewards)) grant(id, `quest:${e.id}`);
        for (const p of d.provides ?? []) grant(p.id, `quest:${e.id}:provides`);
        if (d.giver !== "system") appear(d.giver, `quest:${e.id}`);
        if (d.turn_in !== "auto") appear(d.turn_in, `quest:${e.id}`);
        for (const o of d.objectives) {
          if (o.type === "collect" || o.type === "deliver") use(o.item, `quest:${e.id}`);
          if (o.type === "deliver") appear(o.to, `quest:${e.id}`);
          if (o.type === "defeat") appear(o.target, `quest:${e.id}`);
          if (["win_duel", "gift", "affinity", "talk"].includes(o.type)) appear(o.npc, `quest:${e.id}`);
          if (o.type === "clear") appear(o.target, `quest:${e.id}`);
          if (o.type === "tower_floor") appear(o.dungeon, `quest:${e.id}`);
          if (o.type === "story") appear(o.scene, `quest:${e.id}`);
          if (o.type === "learn") use(o.target, `quest:${e.id}`);
        }
        for (const a of d.prereqs.affinity ?? []) appear(a.npc, `quest:${e.id}`);
        for (const q of d.prereqs.items ?? []) use(q.id, `quest:${e.id}`);
        break;
      case "ach":
        for (const id of rewardIds(d.rewards)) grant(id, `ach:${e.id}`);
        break;
      case "node":
        if (d.gather) for (const q of d.gather.items) grant(q.id, `node:${e.id}`);
        for (const id of rewardIds(d.first_clear)) grant(id, `node:${e.id}`);
        for (const w of d.waves ?? []) for (const en of w) appear(en, `node:${e.id}`);
        if (d.event) appear(d.event, `node:${e.id}`);
        if (d.shop) appear(d.shop, `node:${e.id}`);
        if (d.secret_realm) appear(d.secret_realm, `node:${e.id}`);
        if (d.story) appear(d.story, `node:${e.id}`);
        break;
      case "event":
        for (const c of d.choices) for (const o of c.outcomes) {
          for (const id of rewardIds(o.rewards)) grant(id, `event:${e.id}`);
          if (o.root_transform) grant(o.root_transform, `event:${e.id}`);
          if (o.status) use(o.status, `event:${e.id}`);
          for (const b of o.battle ?? []) appear(b, `event:${e.id}`);
        }
        break;
      case "dungeon":
        for (const id of rewardIds(d.rewards.first_clear)) grant(id, `dungeon:${e.id}`);
        for (const t of d.tiers ?? []) { for (const id of rewardIds(t.rewards.first_clear)) grant(id, `dungeon:${e.id}:t${t.tier}`); use(t.realm.id, `dungeon:${e.id}:t${t.tier}`); }
        for (const w of d.waves ?? []) for (const en of w.enemies) appear(en, `dungeon:${e.id}`);
        if (d.tower) {
          for (const en of d.tower.enemy_pool) appear(en, `dungeon:${e.id}`);
          for (const b of d.tower.boss_pool) appear(b, `dungeon:${e.id}`);
          for (const m of d.tower.milestones) for (const id of rewardIds(m.rewards)) grant(id, `dungeon:${e.id}`);
        }
        for (const n of d.realm_nodes ?? []) {
          for (const w of n.waves ?? []) for (const en of w) appear(en, `dungeon:${e.id}`);
          if (n.event) appear(n.event, `dungeon:${e.id}`);
          if (n.shop) appear(n.shop, `dungeon:${e.id}`);
        }
        for (const dc of d.entry.dungeons_cleared ?? []) appear(dc, `dungeon:${e.id}`);
        for (const q of d.entry.items ?? []) use(q.id, `dungeon:${e.id}`);
        break;
      case "tribulation":
        appear(d.spirit, `tribulation:${e.id}`);
        break;
      case "boss":
        for (const p of d.phases) for (const s of p.summons) appear(s.enemy, `boss:${e.id}`);
        for (const t of d.techniques) use(t, `boss:${e.id}`);
        break;
      case "enemy":
        for (const t of d.techniques) use(t, `enemy:${e.id}`);
        break;
      case "region":
        appear(d.boss, `region:${e.id}`);
        for (const r of d.unlock.regions ?? []) appear(r, `region:${e.id}`);
        break;
      case "sectloc":
        for (const n of d.npcs) appear(n, `sectloc:${e.id}`);
        if (d.shop) appear(d.shop, `sectloc:${e.id}`);
        break;
      case "npc":
        for (const g of [...d.gifts.loved, ...d.gifts.liked, ...d.gifts.disliked]) use(g.id, `npc:${e.id}`);
        if (d.shop) appear(d.shop, `npc:${e.id}`);
        if (d.duel) { for (const id of rewardIds(d.duel.win)) grant(id, `npc:${e.id}`); for (const t of d.duel.loadout) use(t, `npc:${e.id}`); }
        for (const q of d.quests) appear(q, `npc:${e.id}`);
        for (const t of d.dao_companion.techniques ?? []) use(t, `npc:${e.id}`);
        break;
      case "tournament":
        for (const r of d.rounds) { appear(r.opponent, `tournament:${e.id}`); for (const id of rewardIds(r.rewards)) grant(id, `tournament:${e.id}`); }
        for (const id of rewardIds(d.champion_rewards)) grant(id, `tournament:${e.id}`);
        break;
      case "story":
        for (const u of d.unlocks) grant(u, `story:${e.id}`);
        for (const l of d.lines) {
          if (l.speaker.startsWith("npc.")) appear(l.speaker, `story:${e.id}`);
          // a line can be a question (each answer may grant something) or start a practice fight
          for (const c of l.choices ?? []) { for (const id of rewardIds(c.effects)) grant(id, `story:${e.id}`); if (c.next) appear(c.next, `story:${e.id}`); }
          if (l.practice) appear(l.practice.enemy, `story:${e.id}`);
        }
        if (d.tag) appear(d.tag.npc, `story:${e.id}`);
        for (const c of d.choices ?? []) { for (const id of rewardIds(c.effects)) grant(id, `story:${e.id}`); if (c.next) appear(c.next, `story:${e.id}`); }
        if (d.next) appear(d.next, `story:${e.id}`);
        if (d.trigger.on !== "chained") appear(e.id, `trigger:${d.trigger.on}`);
        if (d.trigger.on === "affinity") appear(d.trigger.npc, `story:${e.id}`);
        break;
      case "rank":
        for (const id of rewardIds(d.benefits.rewards)) grant(id, `rank:${e.id}`);
        for (const u of d.benefits.unlocks) grant(u, `rank:${e.id}`);
        for (const q of d.promotion.quests) appear(q, `rank:${e.id}`);
        if (d.promotion.trial) appear(d.promotion.trial, `rank:${e.id}`);
        break;
      case "realm":
        for (const q of d.major_breakthrough.requirements) use(q.id, `realm:${e.id}`);
        if (d.major_breakthrough.tribulation) appear(d.major_breakthrough.tribulation, `realm:${e.id}`);
        if (d.major_breakthrough.trial) appear(d.major_breakthrough.trial, `realm:${e.id}`);
        for (const u of d.major_breakthrough.unlocks) grant(u, `realm:${e.id}`);
        break;
      case "root":
        for (const r of d.upgrade_to) grant(r, `root:${e.id}`);
        break;
      case "beast":
        for (const s of d.stages) { for (const q of s.evolve_materials) use(q.id, `beast:${e.id}`); use(s.active, `beast:${e.id}`); use(s.passive, `beast:${e.id}`); }
        for (const f of d.food) use(f, `beast:${e.id}`);
        break;
      case "egg":
        grant(d.hatches_into, `egg:${e.id}`);
        for (const q of d.hatch_requirements.items ?? []) use(q.id, `egg:${e.id}`);
        break;
      case "book": use(d.teaches, `book:${e.id}`); grant(d.teaches, `book:${e.id}`); break;
      case "blueprint": appear(d.unlocks, `blueprint:${e.id}`); break;
      case "mat": if (d.fragment_of) grant(d.fragment_of.tech, `fragments:${e.id}`); break;
      case "tech": case "btech":
        for (const a of d.applies) use(a.status, `${e.prefix}:${e.id}`);
        break;
      case "cons":
        if (d.effects.buff) use(d.effects.buff.status, `cons:${e.id}`);
        break;
      case "set":
        for (const p of d.pieces) use(p, `set:${e.id}`);
        for (const b of d.bonuses) if (b.effect?.status) use(b.effect.status, `set:${e.id}`);
        break;
    }
    if (e.prefix === "gear") {
      for (const ef of d.special_effects) if (ef.status) use(ef.status, `gear:${e.id}`);
      if (d.awakening) { for (const q of d.awakening.materials) use(q.id, `gear:${e.id}`); if (d.awakening.effect.status) use(d.awakening.effect.status, `gear:${e.id}`); }
    }
    // Any Rewards block anywhere in this entity may hand out gear.
    walkGearGrants(d, (gg, path) => gearGrant(gg.base, gg.rarity, `${e.prefix}:${e.id}`, `${e.id} › ${path}`), e.prefix === "loot" || e.prefix === "shop" || e.prefix === "forge");
  }
  for (const se of db.singletons.gear_rules?.special_pool ?? []) if (se.status) use(se.status, "gear_rules.special_pool");

  // singleton tables consume materials
  const sg = db.singletons;
  for (const l of sg.enhancement?.levels ?? []) for (const q of l.materials) use(q.id, "enhancement");
  for (const s of sg.refinement?.steps ?? []) for (const q of s.materials) use(q.id, "refinement");
  if (sg.reforge) { for (const q of sg.reforge.materials) use(q.id, "reforge"); for (const q of sg.reforge.lock_cost_per_stat) use(q.id, "reforge"); }
  for (const f of sg.furnaces ?? []) for (const q of f.upgrade?.materials ?? []) use(q.id, "furnace");

  return { sources, uses, appears, lootOwners, gearSources, gearGrants, poolChecks };
}

/** Find GearGrant-shaped objects ({base, rarity, ilvl}) inside `rewards`/`first_clear`/`win`… blocks. */
function walkGearGrants(v: unknown, fn: (g: any, path: string) => void, skip = false, path = ""): void {
  if (skip || !v || typeof v !== "object") return;
  if (Array.isArray(v)) { v.forEach((x, i) => walkGearGrants(x, fn, false, `${path}[${i}]`)); return; }
  const o = v as Record<string, unknown>;
  if (typeof o.base === "string" && typeof o.rarity === "string" && typeof o.ilvl === "number") { fn(o, path); return; }
  for (const [k, x] of Object.entries(o)) { if (k === "art") continue; walkGearGrants(x, fn, false, path ? `${path}.${k}` : k); }
}

// ------------------------------------------------------------------ rules

export function runRules(db: Database): Issue[] {
  const issues: Issue[] = [];
  const err = (rule: string, where: string, message: string) => issues.push({ level: "error", rule, where, message });
  const warn = (rule: string, where: string, message: string) => issues.push({ level: "warning", rule, where, message });
  const ctx: Ctx = { db, err, warn };
  const strict = !!db.singletons.content_targets?.strict;
  const cov = strict ? err : warn;

  const all = [...db.registry.values()];
  const by = (p: Prefix) => db.byPrefix.get(p) ?? [];
  const get = (id: string) => db.registry.get(id);

  // 1. Dangling references (generic sweep over every string shaped like an ID with a known prefix).
  for (const e of all) {
    walkStrings(e.data, (s, path) => {
      if (!looksLikeId(s) || !prefixOf(s)) return;
      if (!db.registry.has(s)) err("dangling-ref", `${e.id} › ${path}`, `references missing ${s}`);
    });
  }
  for (const [key, v] of Object.entries(db.singletons)) {
    walkStrings(v, (s, path) => {
      if (!looksLikeId(s) || !prefixOf(s)) return;
      if (!db.registry.has(s)) err("dangling-ref", `${key} › ${path}`, `references missing ${s}`);
    });
  }

  const g = buildGraph(db);

  // 2. Gear grants: base exists & rarity inside the base's range; divine only from mega-dungeon loot.
  const megaLoot = new Set<string>();
  for (const l of by("loot")) {
    const owners = [...(g.lootOwners.get(l.id) ?? [])];
    if (owners.length && owners.every((o) => get(o)?.prefix === "dungeon" && get(o)!.data.kind === "mega")) megaLoot.add(l.id);
  }
  for (const gg of g.gearGrants) {
    const base = get(gg.base);
    if (!base) continue; // dangling-ref already reported
    const [lo, hi] = base.data.rarity_range as [Rarity, Rarity];
    if (!gg.fromPool && (rarityIndex(gg.rarity as Rarity) < rarityIndex(lo) || rarityIndex(gg.rarity as Rarity) > rarityIndex(hi)))
      err("gear-rarity-range", gg.where, `${gg.base} cannot be ${gg.rarity} (range ${lo}–${hi})`);
    if (gg.rarity === "divine" && !(gg.viaLoot && megaLoot.has(gg.viaLoot)))
      err("divine-source", gg.where, "divine gear may only come from loot tables owned exclusively by mega dungeons");
  }
  for (const pc of g.poolChecks) if (pc.matches === 0)
    err("gear-pool-empty", pc.where, `pool ${JSON.stringify(pc.filter)} has no droppable base that can be ${pc.rarity}`);

  // 3. Gear bases: every rarity in range obtainable (directly or by refinement from the rarity below);
  //    signature affix in slot pool; slot×rarity coverage; rules.json ordering guarantees.
  const gr = db.singletons.gear_rules;
  if (gr) {
    for (const v of checkGearRules(gr)) err("gear-math", "equipment/rules.json", v);
  }
  const coverage = new Map<string, number>();
  for (const base of by("gear")) {
    const [lo, hi] = base.data.rarity_range as [Rarity, Rarity];
    let prevSourced = false;
    for (let i = rarityIndex(lo); i <= rarityIndex(hi); i++) {
      const r = RARITIES[i];
      coverage.set(`${base.data.slot}/${r}`, (coverage.get(`${base.data.slot}/${r}`) ?? 0) + 1);
      const direct = g.gearSources.has(gearKey(base.id, r));
      const viaRefine: boolean = prevSourced && i <= rarityIndex(REFINE_CAP);
      if (!direct && !viaRefine) err("no-source", `${base.id} (${r})`, "no acquisition source: loot/shop/forge/reward/starting, or refinement from the rarity below");
      prevSourced = direct || viaRefine;
    }
    if (gr && base.data.signature_affix && !gr.affix_pools[base.data.slot].some((a: any) => a.stat === base.data.signature_affix))
      err("gear-affix", base.id, `signature_affix ${base.data.signature_affix} is not in the ${base.data.slot} affix pool`);
    if (base.data.set && !get(base.data.set)?.data.pieces.includes(base.id)) err("set-pieces", base.id, `declares ${base.data.set} but the set does not list it`);
  }
  for (const slot of SLOTS) for (const r of RARITIES) if (!coverage.get(`${slot}/${r}`)) cov("rarity-coverage", `${slot}/${r}`, `no ${slot} base can be ${r}`);

  // 3b. Item-level bands: loot owned by things placed in a region should match the region's band (warning).
  if (gr) {
    const regionOfNode = new Map<string, string>();
    for (const n of by("node")) regionOfNode.set(n.id, n.data.region);
    const enemyRegions = new Map<string, Set<string>>();
    for (const n of by("node")) for (const en of (n.data.waves ?? []).flat()) addAll(enemyRegions, en, n.data.region);
    for (const l of by("loot")) {
      if (!l.data.ilvl) continue;
      const regions = new Set<string>();
      for (const o of g.lootOwners.get(l.id) ?? []) {
        const oe = get(o);
        if (oe?.prefix === "node") regions.add(oe.data.region);
        if (oe?.prefix === "enemy" || oe?.prefix === "boss") for (const r of enemyRegions.get(o) ?? []) regions.add(r);
      }
      for (const rid of regions) {
        const order = get(rid)?.data.order;
        if (!order) continue;
        const [lo, hi] = regionBand(gr, order);
        const [a, b] = l.data.ilvl;
        if (a < lo - 2 || b > hi + 4) warn("ilvl-band", l.id, `ilvl ${a}–${b} but ${rid} (order ${order}) band is ${lo}–${hi}`);
      }
    }
  }

  // 4. Refinement table sanity.
  const ref = db.singletons.refinement;
  if (ref) {
    const froms = ref.steps.map((s: any) => s.from as Rarity);
    for (const f of froms) if (rarityIndex(f) >= rarityIndex(REFINE_CAP)) err("refine-cap", "refinement", `step from ${f} would exceed the ${REFINE_CAP} cap`);
    for (let i = 0; i < rarityIndex(REFINE_CAP); i++) if (!froms.includes(RARITIES[i])) err("refine-cap", "refinement", `missing refinement step from ${RARITIES[i]}`);
  }

  // 5. Realms ordered 1..N contiguous; ranks ordered.
  const realmOrders = by("realm").map((e) => e.data.order).sort((a, b) => a - b);
  realmOrders.forEach((o, i) => { if (o !== i + 1) err("realm-order", "realms", `realm orders must be contiguous from 1 (found ${realmOrders.join(",")})`); });
  const ranks = by("rank").sort((a, b) => a.data.order - b.data.order);
  ranks.forEach((r, i) => { if (r.data.order !== i + 1) err("rank-order", r.id, "rank orders must be contiguous from 1"); });
  for (let i = 1; i < ranks.length; i++) if (ranks[i].data.fame_required <= ranks[i - 1].data.fame_required) err("rank-order", ranks[i].id, "fame_required must increase with rank");

  // 6. Nodes: same-region connections, symmetric, reachable from entry; region boss placed.
  const nodesByRegion = new Map<string, Entity[]>();
  for (const n of by("node")) addToList(nodesByRegion, n.data.region, n);
  for (const r of by("region")) {
    const nodes = nodesByRegion.get(r.id) ?? [];
    const ids = new Set(nodes.map((n) => n.id));
    if (nodes.length === 0) { err("region-empty", r.id, "region has no nodes"); continue; }
    if (!ids.has(r.data.entry_node)) err("region-entry", r.id, `entry_node ${r.data.entry_node} is not in this region`);
    for (const n of nodes) for (const c of n.data.connections) {
      if (!ids.has(c)) { if (get(c)) err("node-link", n.id, `connects to ${c} in another region`); continue; }
      if (!get(c)!.data.connections.includes(n.id)) err("node-link", n.id, `connection to ${c} is not symmetric`);
    }
    // reachability
    const seen = new Set<string>([r.data.entry_node]);
    const stack = [r.data.entry_node];
    while (stack.length) { const cur = stack.pop()!; for (const c of get(cur)?.data.connections ?? []) if (ids.has(c) && !seen.has(c)) { seen.add(c); stack.push(c); } }
    for (const n of nodes) if (!seen.has(n.id)) err("node-unreachable", n.id, "not reachable from the region entry node");
    const bossPlaced = nodes.some((n) => (n.data.waves ?? []).some((w: string[]) => w.includes(r.data.boss)));
    if (!bossPlaced) err("region-boss", r.id, `region boss ${r.data.boss} is not placed in any node of the region`);
    // signature materials actually obtainable in region
    for (const m of r.data.signature_materials) {
      const obtainable = nodes.some((n) =>
        (n.data.gather?.items ?? []).some((q: any) => q.id === m) ||
        (n.data.waves ?? []).flat().some((en: string) => lootHas(db, get(en)?.data.loot, m)) ||
        lootHas(db, n.data.chest, m));
      if (!obtainable) warn("region-materials", r.id, `signature material ${m} does not drop anywhere in the region`);
    }
    // enemy realm vs region range
    const lo = get(r.data.realm_range.min)?.data.order ?? 0, hi = get(r.data.realm_range.max)?.data.order ?? 99;
    for (const n of nodes) for (const en of (n.data.waves ?? []).flat()) {
      const ro = get(get(en)?.data.realm?.id)?.data.order;
      if (ro !== undefined && (ro < lo || ro > hi)) warn("region-balance", n.id, `${en} realm is outside the region's realm range`);
    }
  }

  // 7. Quests: acyclic prerequisites/next, reachable, objectives sane.
  const quests = by("quest");
  const qmap = new Map(quests.map((q) => [q.id, q]));
  const color = new Map<string, number>();
  const visit = (id: string, path: string[]): void => {
    const c = color.get(id) ?? 0;
    if (c === 1) { err("quest-cycle", id, `prerequisite cycle: ${[...path, id].join(" → ")}`); return; }
    if (c === 2) return;
    color.set(id, 1);
    for (const p of qmap.get(id)?.data.prereqs.quests ?? []) if (qmap.has(p)) visit(p, [...path, id]);
    color.set(id, 2);
  };
  for (const q of quests) visit(q.id, []);
  for (const q of quests) {
    if (q.data.next && q.data.next === q.id) err("quest-cycle", q.id, "quest cannot chain to itself");
    if (q.data.next && qmap.get(q.data.next)?.data.prereqs.quests?.includes(q.id) === false)
      warn("quest-chain", q.id, `next quest ${q.data.next} does not list ${q.id} as prerequisite`);
    for (const o of q.data.objectives) {
      if (o.type === "reach_realm" && o.stage > 9) err("objective", q.id, "realm stage > 9");
      if (o.type === "defeat" && !g.appears.has(o.target)) err("objective", q.id, `${o.target} never appears in the world, quest is impossible`);
      if (o.type === "collect" && !g.sources.has(o.item)) err("objective", q.id, `${o.item} has no acquisition source, quest is impossible`);
      if (o.type === "deliver" && !g.sources.has(o.item)) err("objective", q.id, `${o.item} has no acquisition source, quest is impossible`);
    }
    if (q.data.giver !== "system" && q.data.giver.startsWith("npc.") && !get(q.data.giver)?.data.quests.includes(q.id))
      warn("quest-giver", q.id, `giver ${q.data.giver} does not list this quest in npc.quests`);
  }

  // 8. Story chains acyclic; chained scenes must be referenced.
  const scenes = by("story");
  for (const s of scenes) {
    const seen = new Set<string>();
    let cur: string | undefined = s.id;
    while (cur) {
      if (seen.has(cur)) { err("story-cycle", s.id, `story chain loops at ${cur}`); break; }
      seen.add(cur);
      cur = get(cur)?.data.next;
    }
    if (s.data.trigger.on === "chained" && !g.appears.has(s.id)) err("story-orphan", s.id, "chained scene is never referenced by another scene or node");
    for (const l of s.data.lines) if (l.expression && l.speaker.startsWith("npc.") && !get(l.speaker)?.data.expressions.includes(l.expression))
      err("story-expression", s.id, `${l.speaker} has no expression "${l.expression}"`);
  }

  // 9. Reverse rules: sources / uses / appearances.
  for (const e of all) {
    const d = e.data;
    const p = e.prefix;
    if (isItem(e.id)) {
      if (!g.sources.has(e.id)) err("no-source", e.id, "item has no acquisition source");
      if (p !== "junk" && !hasUse(e, g)) err("no-use", e.id, "item has no gameplay use");
    }
    if ((p === "tech" || p === "method") && !d.enemy_only && !g.sources.has(e.id)) err("no-source", e.id, "technique/method cannot be acquired anywhere");
    if (p === "tech" && d.enemy_only && !g.uses.has(e.id)) err("orphan", e.id, "enemy-only technique is not used by any enemy or boss");
    if (p === "beast" && !g.sources.has(e.id)) err("no-source", e.id, "beast cannot be obtained (needs egg, reward or event)");
    if ((p === "enemy" || p === "boss") && !g.appears.has(e.id)) err("orphan", e.id, "never appears in any node, dungeon, tribulation or summon");
    if (p === "npc" && !g.appears.has(e.id)) err("orphan", e.id, "NPC is not placed anywhere (sect location, node, quest, story, tournament)");
    if (p === "shop" && !g.appears.has(e.id)) err("orphan", e.id, "shop is not attached to any location, node or NPC");
    if (p === "loot" && !g.lootOwners.has(e.id)) err("orphan", e.id, "loot table is not used by any enemy, boss, node, dungeon or tribulation");
    if (p === "status" && !g.uses.has(e.id)) err("orphan", e.id, "status effect is never applied by anything");
    if (p === "event" && !g.appears.has(e.id)) err("orphan", e.id, "event is not placed on any node or dungeon");
    if (p === "story" && !g.appears.has(e.id) && d.trigger.on === "chained") { /* handled above */ }
    if (p === "title" && !g.sources.has(e.id)) err("orphan", e.id, "title is never rewarded");
    if (p === "tribulation" && !g.appears.has(e.id)) err("orphan", e.id, "tribulation is not attached to any realm breakthrough");
    if (p === "dungeon" && d.kind === "secret_realm" && !g.appears.has(e.id)) err("orphan", e.id, "secret realm has no entrance node");
    if (p === "root" && !g.appears.has(e.id) && !g.sources.has(e.id)) err("orphan", e.id, "root is neither the starting root nor obtainable by upgrade/transform");
    if (p === "btech") { const beast = get(d.beast); if (beast && !beast.data.stages.some((s: any) => s.active === e.id || s.passive === e.id)) err("orphan", e.id, `beast ability is not used by any stage of ${d.beast}`); }
    if (p === "qitem" && !g.uses.has(e.id)) err("no-use", e.id, "quest item is not required by any quest");
    if (p === "bfood" && !g.uses.has(e.id)) err("no-use", e.id, "no beast eats this food");
    if (p === "alchemy" || p === "forge") {
      if (d.unlock.type === "blueprint" && get(d.unlock.id)?.data.unlocks !== e.id) err("recipe-unlock", e.id, `blueprint ${d.unlock.id} does not unlock this recipe`);
    }
    if (p === "blueprint" && get(d.unlocks)?.data.unlock?.id !== e.id) err("recipe-unlock", e.id, `recipe ${d.unlocks} does not list this blueprint as its unlock`);
    if (p === "egg" && !get(d.hatches_into)) { /* dangling handled */ }
  }

  // 10. Gift tags: every gift should be loved/liked by someone.
  for (const gift of by("gift")) {
    const tags = new Set<string>(gift.data.gift_tags);
    const listed = by("npc").some((n) => [...n.data.gifts.loved_tags, ...n.data.gifts.liked_tags].some((t: string) => tags.has(t))
      || [...n.data.gifts.loved, ...n.data.gifts.liked, ...n.data.gifts.disliked].some((x: any) => x.id === gift.id));
    if (!listed) warn("gift-unloved", gift.id, "no NPC has an opinion about this gift (loved/liked/disliked)");
  }

  // 11. Region reachability from the starting region through unlock.regions.
  const ss = db.singletons.starting_state;
  if (ss) {
    const reach = new Set<string>([ss.region]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const r of by("region")) {
        if (reach.has(r.id)) continue;
        const req: string[] = r.data.unlock.regions ?? [];
        if (req.length === 0 || req.every((x) => reach.has(x))) { reach.add(r.id); changed = true; }
      }
    }
    for (const r of by("region")) if (!reach.has(r.id)) err("region-unreachable", r.id, "unlock.regions chain does not lead back to the starting region");
    for (const [slot, gid] of Object.entries(ss.equipped as Record<string, string>)) {
      const ge = get(gid);
      if (ge && ge.data.slot !== slot.replace(/_\d$/, "")) err("starting-state", `starting_state.equipped.${slot}`, `${gid} is a ${ge.data.slot}, not a ${slot}`);
    }
  }

  // 12. Beasts: btech belongs to the beast; food exists; stage levels increase.
  for (const b of by("beast")) {
    let last = 0;
    for (const s of b.data.stages) {
      for (const k of ["active", "passive"]) { const t = get(s[k]); if (t && t.data.beast !== b.id) err("beast-ability", b.id, `${s[k]} belongs to ${t.data.beast}`); }
      if (s.level_required <= last && last !== 0) err("beast-stages", b.id, "stage level_required must increase");
      last = s.level_required;
    }
  }

  // 13. Sets: pieces are families with distinct slots; bonuses.pieces ≤ piece count.
  for (const s of by("set")) {
    const slots = s.data.pieces.map((p: string) => get(p)?.data.slot).filter(Boolean);
    if (new Set(slots).size !== slots.length) warn("set-slots", s.id, "set has two pieces in the same slot");
    for (const p of s.data.pieces) if (get(p) && get(p)!.data.set !== s.id) err("set-pieces", s.id, `${p} does not declare set ${s.id}`);
    for (const b of s.data.bonuses) if (b.pieces > s.data.pieces.length) err("set-pieces", s.id, `bonus needs ${b.pieces} pieces but set has ${s.data.pieces.length}`);
  }

  // 14. Art: files exist when generated/approved; references exist; no two assets share a file.
  const files = new Map<string, string>();
  for (const e of all) {
    for (const [key, asset] of Object.entries<any>(e.data.art ?? {})) checkArt(ctx, `${e.id}.art.${key}`, asset, files);
    if (e.data.anim) checkAnim(ctx, e);
    // a painted stage effect must exist (docs/BATTLE_STAGE.md §4); the procedural shapes need no file
    if (e.data.vfx?.sprite && !existsSync(join(ctx.db.root, e.data.vfx.sprite))) ctx.err("vfx-missing", `${e.id}.vfx.sprite`, `${e.data.vfx.sprite} does not exist`);
    if (e.prefix === "gear") for (const [r, v] of Object.entries<any>(e.data.rarities)) for (const [key, asset] of Object.entries<any>(v.art)) checkArt(ctx, `${e.id}.${r}.art.${key}`, asset, files);
  }

  // 15. Content targets.
  const ct = db.singletons.content_targets;
  if (ct) {
    const counts = contentCounts(db);
    for (const [k, target] of Object.entries<number>(ct.targets)) {
      const have = counts[k] ?? 0;
      if (have < target) cov("content-target", k, `${have}/${target}`);
    }
  }

  return issues;
}

function addToList<T>(m: Map<string, T[]>, k: string, v: T) { if (!m.has(k)) m.set(k, []); m.get(k)!.push(v); }

function lootHas(db: Database, lootId: string | undefined, item: string): boolean {
  const l = lootId ? db.registry.get(lootId) : undefined;
  if (!l) return false;
  return l.data.entries.some((x: any) => x.id === item) || l.data.guaranteed.some((x: any) => x.id === item);
}

function hasUse(e: Entity, g: ReturnType<typeof buildGraph>): boolean {
  switch (e.prefix) {
    case "cons": case "book": case "blueprint": case "egg": case "gift": return true; // use by nature
    case "mat":
      if (e.data.subtype === "fragment" && e.data.fragment_of) return true;
      return [...(g.uses.get(e.id) ?? [])].some((u) => !u.startsWith("shop:"));
    default:
      return [...(g.uses.get(e.id) ?? [])].some((u) => !u.startsWith("shop:"));
  }
}

/**
 * Every rig must be built for this very entity and art (assets/anim/<id>/ for the battle sprite, assets/anim/<id>.<key>/
 * for another art such as a beast stage), animate one of its generated art keys, and have all its layers on disk.
 */
function checkAnim(ctx: Ctx, e: Entity) {
  const list = e.data.anim as any[];
  const keys = new Set<string>();
  for (const [i, a] of list.entries()) {
    const where = `${e.id}.anim[${i}]`;
    const primary = a.art === "battle" || a.art === "full_body";
    const want = primary ? `assets/anim/${e.id}/rig.json` : `assets/anim/${e.id}.${a.art}/rig.json`;
    if (a.rig !== want) ctx.err("anim-rig", where, `rig path must be ${want}`);
    if (keys.has(a.art)) ctx.err("anim-rig", where, `a second rig for art "${a.art}"`);
    keys.add(a.art);
    const art = e.data.art?.[a.art];
    if (!art) ctx.err("anim-art", where, `animates art key "${a.art}" which the entity does not have`);
    else if (art.status === "planned") ctx.err("anim-art", where, `animates "${a.art}" but that image is not generated`);
    const path = join(ctx.db.root, a.rig);
    if (!existsSync(path)) { ctx.err("anim-missing", where, `${a.rig} does not exist`); continue; }
    let rig: any;
    try { rig = JSON.parse(readFileSync(path, "utf8")); } catch { ctx.err("anim-rig", where, `${a.rig} is not valid JSON`); continue; }
    for (const f of [rig.body, rig.weapon?.file, rig.blink?.file, rig.weights].filter(Boolean) as string[]) if (!existsSync(join(ctx.db.root, f))) ctx.err("anim-missing", where, `layer ${f} does not exist`);
    if (rig.archetype !== a.archetype) ctx.err("anim-rig", where, `archetype ${a.archetype} differs from the rig's ${rig.archetype}`);
    if (rig.art && rig.art !== a.art) ctx.err("anim-rig", where, `the rig animates "${rig.art}", the block says "${a.art}"`);
    if (!Array.isArray(rig.bbox) || !Array.isArray(rig.ground) || !rig.size) ctx.err("anim-rig", where, "rig lacks size/bbox/ground");
  }
}

function checkArt(ctx: Ctx, where: string, asset: any, files: Map<string, string>) {
  const prev = files.get(asset.file);
  if (prev && prev !== where) ctx.err("art-file-clash", where, `art file ${asset.file} is also used by ${prev}`);
  files.set(asset.file, where);
  if (asset.status !== "planned" && !existsSync(join(ctx.db.root, asset.file))) ctx.err("art-missing", where, `status ${asset.status} but ${asset.file} does not exist`);
  for (const r of asset.references) if (!existsSync(join(ctx.db.root, r))) ctx.warn("art-reference", where, `reference image ${r} not found`);
}

export function contentCounts(db: Database): Record<string, number> {
  const by = (p: Prefix) => db.byPrefix.get(p) ?? [];
  const techs = by("tech");
  return {
    realms: by("realm").length,
    regions: by("region").length,
    dungeons: by("dungeon").filter((d) => d.data.kind !== "mega").length,
    mega_dungeons: by("dungeon").filter((d) => d.data.kind === "mega").length,
    encounters: by("node").filter((n) => ["battle", "elite", "boss", "event", "hidden"].includes(n.data.kind)).length,
    bosses: by("boss").length,
    active_techniques: techs.filter((t) => t.data.kind === "active").length,
    passive_techniques: techs.filter((t) => t.data.kind === "passive").length,
    ultimate_techniques: techs.filter((t) => t.data.kind === "ultimate").length,
    methods: by("method").length,
    gear_bases: by("gear").length,
    gear_items: by("gear").reduce((n, b) => n + (rarityIndex(b.data.rarity_range[1]) - rarityIndex(b.data.rarity_range[0]) + 1), 0),
    gear_sets: by("set").length,
    enemies: by("enemy").length,
    beasts: by("beast").length,
    quests: by("quest").length,
    npcs: by("npc").length,
    tournaments: by("tournament").length,
    secret_realms: by("dungeon").filter((d) => d.data.kind === "secret_realm").length,
    materials: by("mat").length,
    consumables: by("cons").length,
    achievements: by("ach").length,
    story_scenes: by("story").length,
  };
}
