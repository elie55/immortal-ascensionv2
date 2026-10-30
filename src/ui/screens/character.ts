/**
 * Character tab (mockup "character_screen" + "stat_details"): realm and root chips, full-body art framed by
 * eight equipment slots, Combat Power banner, attribute grid and the advanced statistics sheet.
 */
import { h, fmt } from "../core/dom.ts";
import { icon, SLOT_ICON } from "../core/icons.ts";
import { header, section, attrLabel, attrValue, ATTR_INFO, ELEMENT_LABEL } from "../core/kit.ts";
import type { App } from "../../app.ts";
import { computeStats } from "../../engine/stats.ts";
import { EQUIP_SLOTS, type EquipSlot } from "../../engine/inventory.ts";
import { slotOpen } from "../../engine/unlock.ts";
import { gearPlace } from "../../engine/inventory.ts";
import { hintBar, helpButton } from "../help.ts";
import { equipBest } from "../../engine/actions.ts";
import { gearTile, gearDetail, gearName, gearCp } from "./items.ts";
import { techniquesScreen, autoBattleScreen } from "./techniques.ts";

const SLOT_LABEL: Record<EquipSlot, string> = { weapon: "Weapon", armor: "Armor", helmet: "Helmet", boots: "Boots", necklace: "Necklace", ring_1: "Ring 1", ring_2: "Ring 2", artifact: "Artifact" };
const LEFT: EquipSlot[] = ["weapon", "armor", "helmet", "boots"];
const RIGHT: EquipSlot[] = ["necklace", "ring_1", "ring_2", "artifact"];
const CORE = ["hp", "atk", "def", "spd", "crit", "crit_dmg", "sp_power", "sp_energy"];
const ATTR_COLOR: Record<string, string> = { hp: "#5fe08f", atk: "#ff7b6b", def: "#f2c45e", spd: "#7fd0ff", crit: "#ff7fb0", crit_dmg: "#ffa25e", sp_power: "#b48cff", sp_energy: "#62b6ff" };

/** A faint silhouette for an empty slot: the art of the slot's most common base piece. */
const ghostCache = new Map<string, string | undefined>();
function ghostArt(app: App, slot: string): string | undefined {
  const k = slot.startsWith("ring") ? "ring" : slot;
  if (!ghostCache.has(k)) {
    const c = app.content;
    const fileOf = (g: any) => Object.values<any>(g.rarities ?? {}).map((r) => r.art?.icon).find((a) => a && a.status !== "planned")?.file as string | undefined;
    const b = c.byPrefix<any>("gear").filter((g) => g.slot === k && fileOf(g)).sort((a, b) => a.main_value - b.main_value)[0];
    ghostCache.set(k, b ? fileOf(b) : undefined);
  }
  return ghostCache.get(k);
}

export function characterScreen(app: App) {
  const s = app.game.state, c = app.content;
  const stats = computeStats(s, c);
  const realm = c.get<any>(s.character.realm);
  const root = c.get<any>(s.character.root);
  const slot = (k: EquipSlot) => {
    const uid = s.equipped[k];
    const open = slotOpen(s, c, k);
    const inner = !open.ok
      ? h("div", { class: "tile r-common slot-locked" }, h("div", { class: "in" }, icon("lock", 24)))
      : uid !== undefined ? gearTile(app, uid, { onClick: () => slotSheet(app, k) })
      : h("button", { class: "tile r-common slot-empty", onClick: () => slotSheet(app, k), "aria-label": SLOT_LABEL[k] }, h("div", { class: "in" }, ghostArt(app, k) ? h("div", { class: "art ghost", style: { backgroundImage: app.img(ghostArt(app, k)) } }) : icon(SLOT_ICON[k]!, 26), h("span", { class: "slot-plus" }, icon("plus", 12))));
    return h("div", { class: "eq-slot" }, inner, h("div", { class: "eq-lbl" }, SLOT_LABEL[k]), !open.ok && h("div", { class: "eq-lock" }, open.reasons[0]!.replace(/^Unlocks at /, "")));
  };
  return [
    header(app),
    hintBar(app, "character"),
    h("div", { class: "row char-chips" },
      h("span", { class: "glass chip-pill" }, icon("qi", 14), `${realm.name} · Stage ${s.character.stage}`),
      h("span", { class: "glass chip-pill" }, icon("root", 14), root.name), helpButton(app, "character")),
    h("div", { class: "char-stage" },
      h("div", { class: "eq-col" }, LEFT.map(slot)),
      h("div", { class: "char-figure", style: { backgroundImage: app.img(c.artAny(s.character.npc, "full_body")) } }, h("div", { class: "char-aura" })),
      h("div", { class: "eq-col" }, RIGHT.map(slot))),
    h("div", { class: "cp-row" },
      h("div", { class: "cp-banner" }, icon("cp", 16), h("span", { class: "cp-lbl" }, "Combat Power"), h("span", { class: "cp-val" }, fmt.int(stats.cp))),
      h("button", { class: ["btn sm cp-best", app.betterGear() && "gold"], "aria-label": "Equip best gear", onClick: () => {
        const r = app.game.run("equip", app.now(), (st, ct) => equipBest(st, ct));
        if (!r.ok) app.router.toast(r.reason, "info"); else app.router.toast(`Equipped ${(r as any).changed} piece${(r as any).changed > 1 ? "s" : ""} · CP +${fmt.int((r as any).cpGain)}`, "good");
      } }, icon("sparkle", 14), "Best", app.betterGear() && h("span", { class: "badge" }, "!"))),
    h("div", { class: "grid-2" },
      h("button", { class: "btn", onClick: () => app.router.push(techniquesScreen(app, "Character")) }, icon("scroll", 15), "Techniques"),
      h("button", { class: "btn", onClick: () => app.router.push(autoBattleScreen(app, "Character")) }, icon("auto", 15), "Auto-battle")),
    section("Attributes", h("button", { class: "tag", onClick: () => statsSheet(app, null) }, "Tap a stat for details"),
      h("div", { class: "attr-grid" }, CORE.map((k) => h("button", { class: "attr", onClick: () => statsSheet(app, k) },
        h("span", { class: "attr-ico", style: { background: ATTR_COLOR[k] } }, icon(ATTR_INFO[k]!.icon, 13)),
        h("span", { class: "grow" }, ATTR_INFO[k]!.label), h("b", { class: "tnum" }, attrValue(k, stats.total[k] ?? 0)), icon("info", 12))))),
  ];
}

/** Bottom sheet for a slot: the equipped piece and every bag piece that fits. */
function slotSheet(app: App, k: EquipSlot) {
  let selected: number | undefined = app.game.state.equipped[k];
  app.router.open({ id: "slot", kind: "sheet", render: () => {
    const s = app.game.state, c = app.content;
    const want = k.startsWith("ring") ? "ring" : k;
    const options = Object.entries(s.inventory.gear).map(([u, g]) => [Number(u), g] as const).filter(([u, g]) => c.get<any>(g.base).slot === want && (gearPlace(s, u) === "bag" || gearPlace(s, u) === "worn")).sort((a, b) => gearCp(app, b[1]) - gearCp(app, a[1]));
    if (selected === undefined && options.length) selected = options[0]![0];
    return h("div", { class: "stack" },
      h("div", { class: "sec-h" }, h("h3", null, SLOT_LABEL[k]), h("span", { class: "hint" }, `${options.length} piece${options.length === 1 ? "" : "s"} owned`)),
      options.length === 0 ? h("div", { class: "muted center", style: { padding: "20px 0" } }, "Nothing for this slot yet. Adventure drops, the Merchant Pavilion and the Spirit Forge all provide gear.")
        : h("div", { class: "inv-grid" }, options.map(([u]) => h("div", null, gearTile(app, u, { selected: u === selected, onClick: () => { selected = u; app.router.refresh(); } }), h("div", { class: "tile-name" }, s.equipped[k] === u ? "Equipped" : gearName(app, s.inventory.gear[u]!))))),
      selected !== undefined && gearDetail(app, selected, { onChange: () => app.router.refresh() }));
  } });
}

/** Advanced statistics: focus card for one attribute + every attribute grouped, with explanations. */
function statsSheet(app: App, focus: string | null) {
  let current = focus ?? "crit";
  app.router.open({ id: "stats", kind: "sheet", render: () => {
    const s = app.game.state, c = app.content;
    const b = computeStats(s, c);
    const realm = c.get<any>(s.character.realm);
    const info = ATTR_INFO[current];
    const contrib = b.sources.map((src) => [src.label, src.stats[current] ?? 0] as const).filter(([, v]) => v !== 0);
    const cell = (k: string) => h("button", { class: ["stat-cell", k === current && "on"], onClick: () => { current = k; app.router.refresh(); } }, h("span", { class: "grow" }, h("div", { class: "lbl" }, attrLabel(k)), ATTR_INFO[k] && h("div", { class: "desc" }, ATTR_INFO[k]!.explain)), h("b", { class: "tnum" }, attrValue(k, b.total[k] ?? 0)));
    const elems = Object.keys(ELEMENT_LABEL);
    return h("div", { class: "stack" },
      h("div", { class: "sec-h" }, h("h3", null, "Attributes"), h("span", { class: "tag" }, `${realm.name} ${s.character.stage} · CP ${fmt.int(b.cp)}`)),
      h("div", { class: "glass panel hi" },
        h("div", { class: "row between" }, h("div", { class: "title", style: { fontSize: "calc(15rem / 15)" } }, attrLabel(current)), h("div", { class: "gold-t", style: { fontWeight: 900, fontSize: "calc(22rem / 15)" } }, attrValue(current, b.total[current] ?? 0))),
        h("div", { class: "dim", style: { fontSize: "calc(12rem / 15)", margin: "4px 0 8px" } }, info?.explain ?? (current.startsWith("elem_dmg") ? "Bonus damage with techniques of this element." : "Reduces damage taken from this element.")),
        h("div", { class: "grid-4 src-grid" }, contrib.length ? contrib.map(([l, v]) => h("div", null, h("span", null, l), h("b", null, `${v > 0 ? "+" : ""}${attrValue(current, v)}`))) : h("div", { class: "muted" }, "No sources yet"))),
      section("Primary", "Tap any stat for details", h("div", { class: "stat-grid" }, CORE.concat(["acc", "eva"]).map(cell))),
      section("Element damage & resistance", "From your root, method and gear",
        h("div", { class: "stat-grid" }, elems.flatMap((e) => [cell(`elem_dmg.${e}`), cell(`elem_res.${e}`)]))),
      section("Advanced", "Mostly from gear and techniques", h("div", { class: "stat-grid" }, ["armor_pen", "life_steal", "heal_bonus", "shield_str", "cdr", "dmg_red", "status_res"].map(cell))));
  } });
}
