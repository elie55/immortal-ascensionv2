/**
 * Inventory tab (mockup "inventory_icons"/"inventory_full"): category chips, rarity counts, sort, a 6-column
 * grid of rarity-framed tiles, and the selected item's detail panel with Lock / Compare / Equip or Use.
 */
import { h, fmt } from "../core/dom.ts";
import { icon } from "../core/icons.ts";
import { header, subbar } from "../core/kit.ts";
import type { App } from "../../app.ts";
import { RARITIES } from "../../../schema/common.ts";
import { computeStats } from "../../engine/stats.ts";
import { equippedSlotOf } from "../../engine/inventory.ts";
import { gearTile, stackTile, gearDetail, stackDetail, gearName, gearCp } from "./items.ts";

type Cat = "all" | "gear" | "mat" | "pill" | "gift" | "quest";
const CATS: { id: Cat; label: string }[] = [{ id: "all", label: "All" }, { id: "gear", label: "Gear" }, { id: "mat", label: "Materials" }, { id: "pill", label: "Pills" }, { id: "gift", label: "Gifts" }, { id: "quest", label: "Quest" }];
const catOf = (id: string): Cat => { const p = id.split(".")[0]; return p === "mat" ? "mat" : p === "cons" ? "pill" : p === "gift" ? "gift" : p === "qitem" ? "quest" : "mat"; };

type Entry = { key: string; kind: "gear"; uid: number; rarity: string; name: string; score: number } | { key: string; kind: "stack"; id: string; rarity: string; name: string; score: number };

const ui = { cat: "all" as Cat, sort: "rarity" as "rarity" | "name" | "cp", selected: null as string | null };

export function inventoryScreen(app: App) {
  const s = app.game.state, c = app.content;
  const entries: Entry[] = [];
  for (const [u, g] of Object.entries(s.inventory.gear)) {
    if (equippedSlotOf(s, Number(u))) continue; // the Character tab shows what you wear
    entries.push({ key: `g${u}`, kind: "gear", uid: Number(u), rarity: g.rarity, name: gearName(app, g), score: gearCp(app, g) });
  }
  for (const [id, q] of Object.entries(s.inventory.stacks)) if (q > 0) { const d = c.get<any>(id); entries.push({ key: id, kind: "stack", id, rarity: d.rarity ?? "common", name: d.name, score: d.sell_value ?? 0 }); }
  const counts = Object.fromEntries(RARITIES.map((r) => [r, entries.filter((e) => e.rarity === r).length]));
  const shown = entries.filter((e) => ui.cat === "all" || (ui.cat === "gear" ? e.kind === "gear" : e.kind === "stack" && catOf(e.id) === ui.cat));
  const rIdx = (r: string) => RARITIES.indexOf(r as any);
  shown.sort((a, b) => ui.sort === "name" ? a.name.localeCompare(b.name) : ui.sort === "cp" ? b.score - a.score : rIdx(b.rarity) - rIdx(a.rarity) || (a.kind === b.kind ? 0 : a.kind === "gear" ? -1 : 1) || a.name.localeCompare(b.name));
  if (ui.selected && !shown.some((e) => e.key === ui.selected)) ui.selected = null;
  if (!ui.selected && shown.length) ui.selected = shown[0]!.key;
  const sel = shown.find((e) => e.key === ui.selected);
  const cp = computeStats(s, c).cp;
  const refresh = () => app.router.refresh();
  const total = entries.length;

  return [
    header(app),
    subbar({ title: "Inventory", cn: "行囊", sub: `${total} item${total === 1 ? "" : "s"} · Character tab shows what you wear`, end: h("span", { class: "cp-chip" }, icon("sword", 13), h("span", null, h("span", { class: "lbl" }, "Your CP"), h("b", null, fmt.int(cp)))) }),
    h("div", { class: "chips glass" }, CATS.map((ct) => h("button", { class: ["chip", ui.cat === ct.id && "on"], onClick: () => { ui.cat = ct.id; ui.selected = null; refresh(); } }, ct.label))),
    h("div", { class: "row inv-counts" },
      RARITIES.map((r) => h("span", { class: `rc r-${r}`, title: r }, h("i", null), String(counts[r]))),
      h("button", { class: "tag", style: { marginLeft: "auto" }, onClick: () => { ui.sort = ui.sort === "rarity" ? "cp" : ui.sort === "cp" ? "name" : "rarity"; refresh(); } }, icon("sort", 11), ui.sort === "rarity" ? "Rarity" : ui.sort === "cp" ? "Value" : "Name")),
    h("div", { class: "glass panel" },
      shown.length === 0 ? h("div", { class: "muted center", style: { padding: "28px 0" } }, "Nothing here yet.")
        : h("div", { class: "inv-grid" }, shown.map((e) => e.kind === "gear"
          ? gearTile(app, e.uid, { named: true, selected: e.key === ui.selected, onClick: () => { ui.selected = e.key; refresh(); } })
          : stackTile(app, e.id, { named: true, selected: e.key === ui.selected, onClick: () => { ui.selected = e.key; refresh(); } })))),
    sel && (sel.kind === "gear" ? gearDetail(app, sel.uid, { onChange: refresh }) : stackDetail(app, sel.id, { onChange: refresh })),
  ];
}
