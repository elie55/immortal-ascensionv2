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
    // locked: a gold seal (UI review S5); empty: a dark socket with the slot's silhouette and a +
    const inner = !open.ok
      ? h("div", { class: "tile slot-locked", title: open.reasons[0] }, h("div", { class: "in" }, h("span", { class: "seal-lock" }, icon("lock", 15))))
      : uid !== undefined ? gearTile(app, uid, { onClick: () => slotSheet(app, k) })
      : h("button", { class: "tile r-common slot-empty", onClick: () => slotSheet(app, k), "aria-label": SLOT_LABEL[k] }, h("div", { class: "in" }, ghostArt(app, k) ? h("div", { class: "art ghost", style: { backgroundImage: app.img(ghostArt(app, k)) } }) : icon(SLOT_ICON[k]!, 26), h("span", { class: "slot-plus" }, icon("plus", 12))));
    return h("div", { class: ["eq-slot", !open.ok && "locked"] }, inner, h("div", { class: "eq-lbl" }, SLOT_LABEL[k]), !open.ok && h("div", { class: "eq-lock" }, open.reasons[0]!.replace(/^Unlocks at /, "")));
  };
  return [
    header(app),
    hintBar(app, "character"),
    h("div", { class: "row char-chips" },
      h("span", { class: "glass chip-pill" }, icon("qi", 14), `${realm.name} · Stage ${s.character.stage}`),
      h("button", { class: "glass chip-pill root-chip", onClick: () => rootSheet(app) }, icon("root", 14), root.name, icon("chevron", 12)), helpButton(app, "character")),
    h("div", { class: "char-stage" },
      h("div", { class: "eq-col" }, LEFT.map(slot)),
      // Combat Power rests at the figure's feet (mockup character_screen), so the attributes fit on the first screen
      h("div", { class: "char-figure", style: { backgroundImage: app.img(c.artAny(s.character.npc, "full_body")) } }, h("div", { class: "char-aura" }),
        h("div", { class: "cp-banner on-stage" }, icon("cp", 15), h("span", { class: "cp-lbl" }, "Combat Power"), h("span", { class: "cp-val tnum" }, fmt.int(stats.cp)))),
      h("div", { class: "eq-col" }, RIGHT.map(slot))),
    h("div", { class: "char-actions" },
      h("button", { class: ["btn sm cp-best", app.betterGear() && "gold"], "aria-label": "Equip best gear", onClick: () => {
        const r = app.game.run("equip", app.now(), (st, ct) => equipBest(st, ct));
        if (!r.ok) app.router.toast(r.reason, "info"); else app.router.toast(`Equipped ${(r as any).changed} piece${(r as any).changed > 1 ? "s" : ""} · CP +${fmt.int((r as any).cpGain)}`, "good");
      } }, icon("sparkle", 14), "Best gear", app.betterGear() && h("span", { class: "badge" }, "!")),
      h("button", { class: "btn sm", onClick: () => app.router.push(techniquesScreen(app, "Character")) }, icon("scroll", 14), "Techniques"),
      h("button", { class: "btn sm", onClick: () => app.router.push(autoBattleScreen(app, "Character")) }, icon("auto", 14), "Auto-battle")),
    section("Attributes", h("button", { class: "tag", onClick: () => statsSheet(app, null) }, "All stats ›"),
      h("div", { class: "attr-grid" }, CORE.map((k) => h("button", { class: "attr", onClick: () => statsSheet(app, k), "aria-label": `${ATTR_INFO[k]!.label}: details` },
        h("span", { class: "attr-ico", style: { background: ATTR_COLOR[k] } }, icon(ATTR_INFO[k]!.icon, 12)),
        h("span", { class: "grow" }, ATTR_INFO[k]!.label), h("b", { class: "tnum" }, attrValue(k, stats.total[k] ?? 0)))))),
  ];
}

/** Spirit Root sheet (mockup spirit_root): the root with its art, Qi multiplier, elements, history and rare opportunities. */
export function rootSheet(app: App) {
  app.router.open({ id: "root", kind: "sheet", cls: "tall", render: () => {
    const s = app.game.state, c = app.content;
    const root = c.get<any>(s.character.root);
    const art = c.art(root.id, "illustration");
    const elems = (root.elements as string[]).map((e) => c.get<any>(e));
    const tierLabel: Record<string, string> = { single: "Single root", dual: "Dual root", five: "Five Elements" };
    const history = s.character.rootHistory;
    const srcLabel = (src: string) => src === "origin" ? "Where you started" : src.startsWith("breakthrough:") ? `Awakened at ${c.get<any>(src.slice(13)).name}` : src.startsWith("event:") ? `${c.find<any>(src.slice(6))?.name ?? "A rare encounter"}` : src.startsWith("realm:") ? `${c.find<any>(src.slice(6))?.name ?? "Secret realm"}` : src;
    // rare opportunities: every event in the world that can transform a root; revealed once its place is discovered
    const opps = c.byPrefix<any>("event").flatMap((ev) => ev.choices.flatMap((ch: any) => ch.outcomes.filter((o: any) => o.root_transform).map((o: any) => ({ ev, root: o.root_transform, chance: o.chance }))));
    const whereOf = (evId: string) => { const n = c.byPrefix<any>("node").find((x) => x.event === evId); return n ? { node: n, known: !!s.progress.regions[n.region]?.nodes[n.id] || (!!s.progress.regions[n.region] && n.kind !== "hidden") } : { known: false }; };
    const known = opps.filter((o) => whereOf(o.ev.id).known).length;
    return h("div", { class: "stack" },
      h("div", { class: "glass panel root-hero" },
        h("div", { class: "root-art", style: art ? { backgroundImage: app.img(art) } : undefined }, !art && icon("root", 40)),
        h("div", { class: "grow" },
          h("div", { class: "muted up" }, "Your spirit root"),
          h("div", { class: "root-name" }, root.name), root.name_cn && h("div", { class: "cn" }, root.name_cn),
          h("div", { class: "row", style: { gap: "5px", flexWrap: "wrap", margin: "6px 0" } }, h("span", { class: "tag jade" }, tierLabel[root.tier] ?? root.tier), history.length > 1 && h("span", { class: "tag gold" }, "Awakened")),
          h("div", { class: "root-mult" }, h("b", null, `×${root.qi_mult.toFixed(2)}`), h("span", { class: "muted" }, " Qi speed")),
          Object.entries(root.bonuses ?? {}).map(([k, v]) => h("div", { class: "root-bonus" }, h("span", { class: "grow" }, attrLabel(k)), h("b", { class: "jade-t" }, `+${v}${/^(elem|crit|eva|acc)/.test(k) ? "%" : ""}`))))),
      h("p", { class: "dim", style: { margin: "0 2px", fontSize: "calc(12.5rem / 15)" } }, root.description),
      section("Your elements", `+${Math.round(c.combat.damage.element_advantage * 100)}% vs the element you overcome`, h("div", { class: ["grid-2", elems.length === 1 && "one"] }, elems.map((e) => h("div", { class: "glass root-el", style: { "--el": e.color } },
        h("div", { class: "row" }, h("span", { class: "el-dot" }), h("b", null, e.name), h("span", { class: "cn" }, e.name_cn)),
        h("div", { class: "muted" }, e.themes.slice(0, 3).map((t: string) => t[0]!.toUpperCase() + t.slice(1)).join(", ") + " techniques."),
        h("div", { class: "row", style: { gap: "4px", marginTop: "5px", flexWrap: "wrap" } }, h("span", { class: "tag jade" }, `Strong vs ${c.get<any>(e.overcomes).name}`), h("span", { class: "tag red" }, `Weak to ${c.byPrefix<any>("elem").find((x) => x.overcomes === e.id)?.name ?? "—"}`)))))),
      section("Root history", "Old roots are kept, never lost", h("div", { class: "root-hist" }, history.map((hst, i) => { const r = c.get<any>(hst.root); return [i > 0 && h("span", { class: "root-arrow" }, "›"), h("div", { class: ["glass root-step", i === history.length - 1 && "on"] }, h("span", { class: "root-mini", style: c.art(r.id, "illustration") ? { backgroundImage: app.img(c.art(r.id, "illustration")) } : undefined }), h("div", null, h("b", null, r.name), h("div", { class: "muted" }, srcLabel(hst.source)), h("div", { class: "muted" }, `×${r.qi_mult.toFixed(2)} Qi`)))]; }))),
      section("Rare root opportunities", `${known} of ${opps.length} discovered`, h("div", { class: "rows" }, opps.map((o) => { const w = whereOf(o.ev.id); const r = c.get<any>(o.root); const done = s.character.root === o.root || history.some((x) => x.root === o.root);
        return h("div", { class: ["setrow", !w.known && "off"] }, icon(w.known ? (done ? "check" : "map") : "lock", 16), h("div", { class: "grow" }, h("div", { class: "lbl" }, w.known ? o.ev.name : "???"), h("div", { class: "desc" }, w.known ? `${c.get<any>(w.node!.region).name} · ${w.node!.name}` : "Not discovered yet")), h("span", { class: ["tag", done ? "jade" : "gold"] }, w.known ? `${r.name.replace(" Root", "")} ×${r.qi_mult}` : "???")); }))));
  } });
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

/** Advanced statistics (mockup stat_details, UI review S5): the tapped stat on top with its explanation and where it
 *  comes from (a bar split by source), then every stat as a compact two-column table. */
const SRC_COLORS = ["#7fd0ff", "#ffd27a", "#5fe08f", "#ff94aa", "#b48cff", "#ffa25e", "#62b6ff", "#c9cfe3"];
function statsSheet(app: App, focus: string | null) {
  let current = focus ?? "crit";
  app.router.open({ id: "stats", kind: "sheet", cls: "tall", render: () => {
    const s = app.game.state, c = app.content;
    const b = computeStats(s, c);
    const realm = c.get<any>(s.character.realm);
    const info = ATTR_INFO[current];
    const elems = Object.keys(ELEMENT_LABEL);
    const elColor = (k: string) => { const e = k.split(".")[1]; return e ? c.find<any>(`elem.${e}`)?.color : undefined; };
    const colorOf = (k: string) => ATTR_COLOR[k] ?? elColor(k) ?? "#8d98c4";
    const contrib = b.sources.map((src) => [src.label, src.stats[current] ?? 0] as const).filter(([, v]) => v !== 0);
    const pos = contrib.filter(([, v]) => v > 0); const posSum = pos.reduce((n, [, v]) => n + v, 0);
    const cell = (k: string) => h("button", { class: ["stat-cell", k === current && "on"], onClick: () => { current = k; app.router.refresh(); } },
      h("span", { class: "sc-dot", style: { background: colorOf(k) } }), h("span", { class: "grow lbl" }, attrLabel(k)), h("b", { class: "tnum" }, attrValue(k, b.total[k] ?? 0)));
    return h("div", { class: "stack" },
      h("div", { class: "sec-h" }, h("h3", null, "Attributes"), h("span", { class: "tag" }, `${realm.name} ${s.character.stage} · CP ${fmt.int(b.cp)}`)),
      h("div", { class: "glass panel stat-focus", dataset: { key: "stat-focus" } },
        h("div", { class: "sf-head" },
          h("span", { class: "attr-ico", style: { background: colorOf(current) } }, icon(info?.icon ?? "sparkle", 14)),
          h("div", { class: "grow sf-name" }, attrLabel(current)), h("b", { class: "sf-val tnum" }, attrValue(current, b.total[current] ?? 0))),
        h("div", { class: "sf-explain" }, info?.explain ?? (current.startsWith("elem_dmg") ? "Bonus damage with techniques of this element." : current.startsWith("elem_res") ? "Reduces damage taken from this element." : "")),
        posSum > 0 && h("div", { class: "sf-bar", "aria-hidden": "true" }, pos.map(([l, v], i) => h("i", { title: l, style: { flex: String(v), background: SRC_COLORS[contrib.findIndex(([x]) => x === l) % SRC_COLORS.length] } }))),
        h("div", { class: "sf-src" }, contrib.length ? contrib.map(([l, v], i) => h("div", null, h("span", null, h("i", { style: { background: SRC_COLORS[i % SRC_COLORS.length] } }), l), h("b", { class: "tnum" }, `${v > 0 ? "+" : ""}${attrValue(current, v)}`))) : h("div", { class: "muted" }, "No sources yet"))),
      section("Primary", "Tap a stat for its sources", h("div", { class: "stat-grid" }, CORE.concat(["acc", "eva"]).map(cell))),
      section("Elements", "Damage · resistance", h("div", { class: "stat-grid" }, elems.flatMap((e) => [cell(`elem_dmg.${e}`), cell(`elem_res.${e}`)]))),
      section("Advanced", "Mostly from gear and techniques", h("div", { class: "stat-grid" }, ["armor_pen", "life_steal", "heal_bonus", "shield_str", "cdr", "dmg_red", "status_res"].map(cell))));
  } });
}
