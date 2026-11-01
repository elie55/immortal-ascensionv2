/**
 * Peek cards (core/peek.ts): what a long press shows for a technique, an item, a piece of gear, a status effect, an
 * enemy or a recipe. Each builder returns the card's content; screens wrap their elements with `peekable(...)`.
 */
import { h, fmt, type Child } from "./core/dom.ts";
import { icon } from "./core/icons.ts";
import { RARITY_LABEL, ELEMENT_LABEL, attrLabel, attrValue } from "./core/kit.ts";
import type { App } from "../app.ts";
import type { Combatant, Skill } from "../engine/combat/types.ts";
import type { Battle } from "../engine/combat/battle.ts";
import type { GearInstance } from "../engine/state.ts";
import { techPreview } from "../engine/combat/preview.ts";
import { masteryLevel } from "../engine/stats.ts";
import { gearStats } from "../engine/inventory.ts";
import { alchemyStatus, alchemyChance, furnaces } from "../engine/crafting.ts";
import { CATEGORY, gearName } from "./screens/items.ts";

const el = (id: string) => ELEMENT_LABEL[id.split(".")[1] ?? ""] ?? (id.endsWith("none") ? "Neutral" : id.split(".")[1] ?? id);
const pct = (x: number) => `${Math.round(x * 100)}%`;

function head(app: App, o: { art?: string; fallback?: string; name: Child; cn?: string; sub: string; rarity?: string }) {
  return h("div", { class: "pk-head" },
    h("span", { class: ["pk-art", o.rarity && `rt-${o.rarity}`], style: o.art ? { backgroundImage: app.img(o.art) } : undefined }, !o.art && icon(o.fallback ?? "info", 20)),
    h("div", { class: "grow" }, h("div", { class: ["pk-name", o.rarity && `rt-${o.rarity}`] }, o.name, o.cn && h("span", { class: "cn muted" }, ` ${o.cn}`)), h("div", { class: "pk-sub" }, o.sub)));
}
const row = (k: string, v: Child) => h("div", { class: "pk-row" }, h("span", { class: "muted" }, k), h("b", null, v));
const hint = (t: string) => h("div", { class: "pk-hint" }, t);

const TARGETING: Record<string, string> = { single: "one enemy", all_enemies: "all enemies", self: "yourself", ally: "an ally", all_allies: "the whole party", lowest_hp_enemy: "the weakest enemy", highest_cp_enemy: "the strongest enemy", random: "a random enemy" };

/** A technique, with the player's numbers; in battle, the live estimate against the foes on the field. */
export function techPeek(app: App, techId: string, live?: { battle: Battle; actor: Combatant; skill?: Skill }): Child {
  const c = app.content, s = app.game.state;
  const t = c.get<any>(techId);
  const xp = s.techniques.known[techId] ?? 0;
  const lvl = t.mastery ? masteryLevel(xp, t.mastery) : 0;
  const pv = techPreview(s, c, techId);
  const rows: Child[] = [];
  if (t.power > 0) rows.push(row("Power", `${t.power}%${t.hits > 1 ? ` ×${t.hits}` : ""}`));
  if (t.heal_pct) rows.push(row("Heals", `${t.heal_pct}% max HP`));
  if (t.shield_pct_max_hp) rows.push(row("Shield", `${t.shield_pct_max_hp}% max HP`));
  if (t.kind === "ultimate") rows.push(row("Charge", `${t.ult_charge ?? 100}`)); else if (t.kind !== "passive") rows.push(row("Cost", `${t.sp_cost} SE`));
  if (t.cooldown) rows.push(row("Cooldown", `${t.cooldown} turn${t.cooldown === 1 ? "" : "s"}`));
  if (t.turn_shift) rows.push(row("Tempo", t.power > 0 ? `delays ${t.turn_shift}%` : `hastens ${t.turn_shift}%`));
  if (t.kind !== "passive") rows.push(row("Target", TARGETING[t.targeting] ?? t.targeting));
  rows.push(row("Mastery", `Lv ${lvl}${pv.mult > 1 ? ` · ×${pv.mult.toFixed(2)}` : ""}`));
  const live_: Child[] = [];
  if (live && live.skill) {
    const b = live.battle, a = live.actor, sk = live.skill;
    const cd = a.cooldowns[sk.id] ?? 0;
    if (cd > 0) live_.push(h("div", { class: "pk-line" }, "Ready in ", h("b", null, `${cd} turn${cd === 1 ? "" : "s"}`)));
    if (sk.power > 0) {
      const foes = b.alive(a.side === "ally" ? "enemy" : "ally");
      const est = foes.map((f) => ({ f, v: b.estimate(a, f, sk) }));
      if (est.length) { const lo = Math.min(...est.map((x) => x.v)), hi = Math.max(...est.map((x) => x.v)); live_.push(h("div", { class: "pk-line" }, "Now about ", h("b", null, lo === hi || est.length === 1 ? fmt.int(lo) : `${fmt.int(lo)}–${fmt.int(hi)}`), ` damage${sk.targeting === "all_enemies" ? " to each" : ""} before dodge and crit`)); }
      const weak = foes.filter((f) => b.elementMult(a, f, sk.element) > 1.05);
      if (weak.length) live_.push(h("div", { class: "pk-line jade-t" }, `${el(sk.element)} is strong against ${weak.map((f) => f.name).join(", ")}`));
    }
    if (sk.healPct) live_.push(h("div", { class: "pk-line" }, "Heals about ", h("b", null, fmt.int(a.maxHp * sk.healPct / 100 * sk.masteryMult * Math.max(0, 1 + b.eff(a, "heal_bonus") / 100)))));
    if (sk.shieldPct) live_.push(h("div", { class: "pk-line" }, "Shield of about ", h("b", null, fmt.int(a.maxHp * sk.shieldPct / 100 * sk.masteryMult * (1 + b.eff(a, "shield_str") / 100)))));
  } else if (pv.kind !== "none") live_.push(h("div", { class: "pk-line" }, pv.kind === "damage" ? "About " : pv.kind === "heal" ? "Heals about " : "Shield of about ", h("b", null, fmt.int(pv.value)), pv.each ? " each" : "", pv.kind === "damage" ? " before the target's defense" : ""));
  const applies = (t.applies ?? []).map((a: any) => { const st = c.get<any>(a.status); return h("span", { class: "tag" }, `${st.name} ${a.chance < 1 ? pct(a.chance) : ""} · ${a.turns}t`); });
  const passive = Object.entries(t.passive_bonuses ?? {}).map(([k, v]: [string, any]) => h("span", { class: "tag jade" }, `${attrLabel(k)} +${attrValue(k, v)}`));
  return h("div", null,
    head(app, { art: c.art(techId, "icon"), fallback: "sword", name: t.name, cn: t.name_cn, rarity: t.rarity, sub: `${t.kind === "ultimate" ? "Ultimate" : t.kind === "passive" ? "Passive" : "Technique"} · ${el(t.element)}${t.weapon_affinity && t.weapon_affinity !== "any" ? ` · ${t.weapon_affinity}` : ""}` }),
    h("div", { class: "pk-desc" }, t.description),
    h("div", { class: "pk-grid" }, rows), live_,
    (applies.length || passive.length) ? h("div", { class: "pk-chips" }, applies, passive) : null);
}

/** The basic attack, Surge, or a beast ability (skills that are not techniques). */
export function skillPeek(app: App, sk: Skill, live?: { battle: Battle; actor: Combatant }): Child {
  const c = app.content;
  if (sk.id.startsWith("tech.")) return techPeek(app, sk.id, live ? { ...live, skill: sk } : undefined);
  if (sk.id === "surge") return h("div", null, head(app, { fallback: "sparkle", name: "Surge", cn: "激涌", sub: "Tempo" }),
    h("div", { class: "pk-desc" }, `Spend ${sk.ultCost} ultimate charge to act again at once: your gauge jumps a whole turn ahead of everyone else's.`),
    h("div", { class: "pk-grid" }, row("Cost", `${sk.ultCost} charge`), row("Gives back", "nothing")), hint("Best before a big attack: Surge, then shield or heal."));
  if (sk.id === "basic") {
    const lines: Child[] = [];
    if (live) { const b = live.battle, a = live.actor; const foes = b.alive(a.side === "ally" ? "enemy" : "ally"); const est = foes.map((f) => b.estimate(a, f, sk)); if (est.length) lines.push(h("div", { class: "pk-line" }, "Now about ", h("b", null, est.length === 1 ? fmt.int(est[0]!) : `${fmt.int(Math.min(...est))}–${fmt.int(Math.max(...est))}`), " damage")); }
    return h("div", null, head(app, { fallback: "sword", name: "Attack", sub: `Basic · ${el(sk.element)}` }), h("div", { class: "pk-desc" }, `A plain strike at ${sk.power}% attack. Costs nothing and restores ${c.combat.spirit_energy.basic_attack_restore} spiritual energy.`), lines);
  }
  if (sk.kind === "beast") {
    const b = c.find<any>(sk.id);
    return h("div", null, head(app, { art: c.art(sk.id, "icon"), fallback: "paw", name: sk.name, sub: `Beast ability · ${el(sk.element)}` }), b?.description && h("div", { class: "pk-desc" }, b.description),
      h("div", { class: "pk-grid" }, sk.power > 0 && row("Power", `${sk.power}%`), sk.healPct && row("Heals", `${sk.healPct}% max HP`), row("Cooldown", `${sk.cooldown} turns`)));
  }
  return h("div", null, head(app, { fallback: "info", name: sk.name, sub: sk.kind }));
}

/** Where an item is needed: recipes, breakthroughs, furnace upgrades, enhancement, forging (at most four lines). */
function usesOf(app: App, id: string): string[] {
  const c = app.content; const out: string[] = [];
  for (const r of c.byPrefix<any>("alchemy")) if (r.ingredients.some((q: any) => q.id === id)) out.push(`${c.get<any>(r.output.id).name} (alchemy)`);
  for (const r of c.byPrefix<any>("forge")) if (r.ingredients.some((q: any) => q.id === id)) out.push(`${c.get<any>(r.output.base).name} (forge)`);
  for (const r of c.byPrefix<any>("realm")) if (r.major_breakthrough?.requirements?.some((q: any) => q.id === id)) out.push(`${r.name} breakthrough`);
  for (const f of furnaces(c)) if (f.upgrade?.materials.some((q: any) => q.id === id)) out.push(`${f.name} upgrade`);
  if (c.singletons.enhancement.levels.some((l: any) => l.materials.some((q: any) => q.id === id))) out.push("gear enhancement");
  if (c.singletons.refinement.steps.some((st: any) => st.materials.some((q: any) => q.id === id))) out.push("gear refinement");
  if (c.singletons.reforge.materials.some((q: any) => q.id === id)) out.push("reforging");
  for (const b of c.byPrefix<any>("beast")) if (b.food?.includes(id)) out.push(`${b.name} eats it`);
  return [...new Set(out)];
}

/** A stackable item: what it is, what it does, what it is for, what it sells for. */
export function itemPeek(app: App, id: string, qty?: number): Child {
  const c = app.content, s = app.game.state;
  const def = c.find<any>(id); if (!def) return null;
  const prefix = id.split(".")[0]!;
  const have = s.inventory.stacks[id] ?? 0;
  const effects: string[] = prefix === "cons" ? Object.entries(def.effects ?? {}).map(([k, v]: [string, any]) => k === "qi" ? `+${fmt.compact(v)} Qi` : k === "hp_pct" ? `Heal ${v}% HP` : k === "sp_pct" ? `Restore ${v}% SE` : k === "cultivation_boost" ? `×${v.mult} Qi rate for ${v.minutes} min` : k === "breakthrough_chance_bonus" ? `+${Math.round(v * 100)}% breakthrough chance` : k === "permanent" ? Object.entries(v).map(([a, n]: any) => `${attrLabel(a)} +${attrValue(a, n)} for good`).join(", ") : k === "buff" ? `Applies ${c.get<any>(v.status).name}` : k) : [];
  const uses = usesOf(app, id);
  const lines: Child[] = [];
  if (prefix === "book" && def.teaches) lines.push(h("div", { class: "pk-line" }, "Teaches ", h("b", null, c.get<any>(def.teaches).name)));
  if (prefix === "blueprint" && def.recipe) lines.push(h("div", { class: "pk-line" }, "Unlocks ", h("b", null, c.find<any>(def.recipe)?.name ?? def.recipe)));
  if (prefix === "egg" && def.beast) lines.push(h("div", { class: "pk-line" }, "Hatches ", h("b", null, c.get<any>(def.beast).name)));
  if (prefix === "gift") lines.push(h("div", { class: "pk-line" }, "A gift: raises an NPC's affinity; some prefer it"));
  if (uses.length) lines.push(h("div", { class: "pk-line" }, "Used for ", h("b", null, uses.slice(0, 4).join(", ")), uses.length > 4 ? ` +${uses.length - 4}` : ""));
  if (prefix === "junk") lines.push(h("div", { class: "pk-line" }, "Only worth selling"));
  return h("div", null,
    head(app, { art: c.art(id, "icon"), fallback: "pouch", name: def.name, cn: def.name_cn, rarity: def.rarity ?? "common", sub: `${RARITY_LABEL[def.rarity ?? "common"]} · ${CATEGORY[prefix] ?? prefix}${def.tier ? ` · Tier ${def.tier}` : ""}${qty !== undefined ? ` · ×${qty}` : ""}` }),
    def.description && h("div", { class: "pk-desc" }, def.description),
    effects.length ? h("div", { class: "pk-chips" }, effects.map((e) => h("span", { class: "tag jade" }, e))) : null,
    lines,
    h("div", { class: "pk-grid" }, row("In bag", fmt.int(have)), def.sell_value !== undefined && row("Sells for", `${fmt.int(def.sell_value)} stones`)));
}

/** A piece of gear: an instance in the bag, or a grant (base + rarity + ilvl) not yet rolled. */
export function gearPeek(app: App, g: GearInstance | { base: string; rarity: string; ilvl: number }, uid?: number): Child {
  const c = app.content, s = app.game.state;
  const base = c.get<any>(g.base);
  const inst = "affixes" in g ? (g as GearInstance) : undefined;
  const stats = inst ? gearStats(c, inst) : null;
  const worn = uid !== undefined && Object.values(s.equipped).includes(uid);
  const rows = stats ? Object.entries(stats).filter(([, v]) => v).slice(0, 8).map(([k, v]) => row(attrLabel(k), attrValue(k, v as number))) : [row("Main stat", attrLabel(base.main_stat ?? "atk"))];
  return h("div", null,
    head(app, { art: c.art(g.base, "icon"), fallback: "sword", name: inst ? gearName(app, inst) : base.name, cn: base.name_cn, rarity: g.rarity, sub: `${RARITY_LABEL[g.rarity]} · ${base.slot} · iLvl ${g.ilvl}${inst ? ` · +${inst.enhance}` : ""}${worn ? " · worn" : ""}` }),
    base.description && h("div", { class: "pk-desc" }, base.description),
    h("div", { class: "pk-grid" }, rows),
    inst?.specials?.length ? h("div", { class: "pk-chips" }, inst.specials.map((e: any) => h("span", { class: "tag gold" }, e.description))) : null,
    base.set && h("div", { class: "pk-line" }, "Set: ", h("b", null, c.get<any>(base.set).name)));
}

/** A status effect, with the instance's turns and stacks when on a unit. */
export function statusPeek(app: App, statusId: string, inst?: { turns: number; stacks: number; potency?: number }): Child {
  const c = app.content; const def = c.get<any>(statusId);
  const mods = Object.entries(def.modifiers ?? {}).filter(([, v]) => v).map(([k, v]: [string, any]) => `${attrLabel(k)} ${v > 0 ? "+" : ""}${v}${def.stacking === "stack" ? " per stack" : ""}`);
  const tick = def.tick?.pct_atk ? `${def.tick.pct_atk}% of the applier's ATK each turn` : def.tick?.pct_max_hp ? `${Math.abs(def.tick.pct_max_hp)}% max HP ${def.tick.pct_max_hp > 0 ? "lost" : "restored"} each turn` : null;
  const KIND: Record<string, string> = { buff: "Buff", debuff: "Debuff", control: "Control", dot: "Damage over time", shield: "Shield", special: "Special" };
  return h("div", null,
    head(app, { art: c.art(statusId, "icon"), fallback: "warning", name: def.name, cn: def.name_cn, sub: `${KIND[def.kind] ?? def.kind}${def.stacking === "stack" ? ` · stacks to ${def.max_stacks}` : ""}` }),
    h("div", { class: "pk-desc" }, def.description),
    (mods.length || tick) ? h("div", { class: "pk-chips" }, mods.map((m) => h("span", { class: "tag" }, m)), tick && h("span", { class: "tag" }, tick)) : null,
    inst && h("div", { class: "pk-grid" }, row("Turns left", String(inst.turns)), inst.stacks > 1 && row("Stacks", String(inst.stacks)), inst.potency !== undefined && row("Potency", `${inst.potency}%`)),
    def.kind === "control" && hint("Control cannot land again for a few turns after it wears off."));
}

/** A unit on the field: who it is, how it stands, what it carries. */
export function unitPeek(app: App, u: Combatant, b: Battle): Child {
  const c = app.content;
  const def = c.find<any>(u.id);
  const sig = u.boss?.signature;
  const KIND: Record<string, string> = { player: "You", beast: "Spirit beast", companion: "Dao companion", enemy: u.elite ? "Elite" : "Enemy", boss: "Sovereign", summon: "Summon" };
  const sts = u.statuses.map((st) => h("span", { class: ["tag", c.get<any>(st.id).kind === "buff" || c.get<any>(st.id).kind === "shield" ? "jade" : "red"] }, `${c.get<any>(st.id).name} ${st.turns}t${st.stacks > 1 ? ` ×${st.stacks}` : ""}`));
  const weak = u.boss?.weaknesses.map((e) => el(e)).join(", ");
  const arts = u.skills.filter((sk) => sk.kind !== "basic" && !sk.ultCost).map((sk) => sk.name);
  return h("div", null,
    head(app, { art: c.art(u.id, "icon") ?? u.art, fallback: u.side === "ally" ? "lotus" : "sword", name: u.name, cn: def?.name_cn, sub: `${KIND[u.kind] ?? u.kind} · ${el(u.element)}${u.cp ? ` · CP ${fmt.int(u.cp)}` : ""}` }),
    h("div", { class: "pk-grid" }, row("HP", `${fmt.int(u.hp)} / ${fmt.int(u.maxHp)}`), u.shield > 0 && row("Shield", fmt.int(u.shield)), u.maxSp > 0 && row("SE", `${fmt.int(u.sp)} / ${fmt.int(u.maxSp)}`), row("Speed", fmt.int(b.eff(u, "spd"))), u.ult > 0 && row("Charge", `${Math.floor(u.ult)}%`)),
    u.telegraph && h("div", { class: "pk-line red-t" }, "Winding up ", h("b", null, u.telegraph.name), ` · about ${u.telegraph.pct}% of the target's HP`),
    sig && h("div", { class: "pk-line" }, h("b", null, `${sig.name}: `), sig.description),
    weak && h("div", { class: "pk-line" }, "Weak to ", h("b", null, weak)),
    arts.length ? h("div", { class: "pk-line" }, "Arts: ", h("b", null, arts.slice(0, 4).join(", "))) : null,
    sts.length ? h("div", { class: "pk-chips" }, sts) : null);
}

/** An enemy or boss from content (outside battle: node cards, bestiary chips). */
export function enemyPeek(app: App, id: string): Child {
  const c = app.content; const e = c.find<any>(id); if (!e) return null;
  const loot = e.loot ? c.find<any>(e.loot) : null;
  const notable = loot ? [...(loot.guaranteed ?? []).map((q: any) => `${c.get<any>(q.id).name} ×${q.qty}`), ...(loot.entries ?? []).filter((x: any) => x.id && !x.id.startsWith("junk.")).sort((a: any, b: any) => b.chance - a.chance).slice(0, 3).map((x: any) => `${c.get<any>(x.id).name} ${pct(x.chance)}`)] : [];
  const arts = (e.techniques ?? []).map((t: string) => c.get<any>(t).name);
  return h("div", null,
    head(app, { art: c.art(id, "icon"), fallback: "sword", name: e.name, cn: e.name_cn, sub: `${e.phases ? "Sovereign" : e.kind === "elite" ? "Elite" : "Enemy"} · ${el(e.element)} · CP ${fmt.int(e.cp)}` }),
    e.description && h("div", { class: "pk-desc" }, e.description),
    h("div", { class: "pk-grid" }, row("HP", fmt.int(e.stats.hp)), row("Attack", fmt.int(e.stats.atk)), row("Defense", fmt.int(e.stats.def)), row("Speed", fmt.int(e.stats.spd))),
    e.signature && h("div", { class: "pk-line" }, h("b", null, `${e.signature.name}: `), e.signature.description),
    e.weaknesses?.length ? h("div", { class: "pk-line" }, "Weak to ", h("b", null, e.weaknesses.map(el).join(", "))) : null,
    arts.length ? h("div", { class: "pk-line" }, "Arts: ", h("b", null, arts.join(", "))) : null,
    notable.length ? h("div", { class: "pk-line" }, "Drops: ", h("b", null, notable.join(" · "))) : null);
}

/** An alchemy recipe: output, ingredients you have, odds at your furnace and proficiency. */
export function recipePeek(app: App, recipeId: string): Child {
  const c = app.content, s = app.game.state;
  const r = c.get<any>(recipeId); const out = c.get<any>(r.output.id);
  const st = alchemyStatus(s, c, r);
  const ings = r.ingredients.map((q: any) => { const have = s.inventory.stacks[q.id] ?? 0; return h("span", { class: ["tag", have >= q.qty ? "jade" : "red"] }, `${c.get<any>(q.id).name} ${have}/${q.qty}`); });
  return h("div", null,
    head(app, { art: c.art(r.output.id, "icon"), fallback: "cauldron", name: out.name, cn: out.name_cn, rarity: out.rarity, sub: `Recipe · grade ${r.grade} · yields ${r.output.qty[0]}${r.output.qty[1] !== r.output.qty[0] ? `–${r.output.qty[1]}` : ""}` }),
    h("div", { class: "pk-desc" }, out.description),
    h("div", { class: "pk-chips" }, ings),
    h("div", { class: "pk-grid" }, row("Success", st.unlocked ? pct(alchemyChance(s, c, r)) : pct(r.success_base)), row("Cost", `${fmt.int(r.cost_stones)} stones`), row("Furnace", `grade ${r.furnace_min}+`), row("Proficiency", `${r.proficiency_min}+ · +${r.proficiency_xp} xp`)),
    !st.unlocked && h("div", { class: "pk-line red-t" }, st.reason));
}
