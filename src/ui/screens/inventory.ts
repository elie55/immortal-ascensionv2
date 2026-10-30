/**
 * Inventory tab (mockup "inventory_icons"/"inventory_full"): category chips, rarity filter and sort dropdowns, the
 * bag drawn as pages of 24 slots (6 × 4; empty slots visible, so capacity means something), the overflow pouch when
 * drops did not fit, bag expansions, and the selected item's detail docked at the bottom (Lock / Compare / Equip or Use).
 * The depot (Your Quarters) has its own screen: depotScreen.
 */
import { h, fmt } from "../core/dom.ts";
import { icon } from "../core/icons.ts";
import { header, subbar, pagedGrid, capacityMeter, seg, confirmModal, RARITY_LABEL } from "../core/kit.ts";
import type { App } from "../../app.ts";
import type { Screen } from "../core/router.ts";
import { RARITIES } from "../../../schema/common.ts";
import { computeStats } from "../../engine/stats.ts";
import { gearPlace, bagCapacity, bagUsed, depotCapacity, depotUsed, pouchCount, expansionCost } from "../../engine/inventory.ts";
import { claimOverflow, buyExpansion, storeItem, takeItem, storeGear, takeGear } from "../../engine/actions.ts";
import { gearTile, stackTile, gearDetail, stackDetail, gearName, gearCp } from "./items.ts";

type Cat = "all" | "gear" | "mat" | "pill" | "gift" | "quest";
const CATS: { id: Cat; label: string }[] = [{ id: "all", label: "All" }, { id: "gear", label: "Gear" }, { id: "mat", label: "Materials" }, { id: "pill", label: "Pills" }, { id: "gift", label: "Gifts" }, { id: "quest", label: "Quest" }];
const catOf = (id: string): Cat => { const p = id.split(".")[0]; return p === "mat" ? "mat" : p === "cons" ? "pill" : p === "gift" ? "gift" : p === "qitem" ? "quest" : "mat"; };

export type Entry = { key: string; kind: "gear"; uid: number; rarity: string; name: string; score: number } | { key: string; kind: "stack"; id: string; qty: number; rarity: string; name: string; score: number };

const ui = { cat: "all" as Cat, sort: "rarity" as "rarity" | "name" | "cp", rarity: "all" as string, selected: null as string | null, page: 0 };
const SORTS = { rarity: "Rarity", cp: "Value", name: "Name" } as const;

/** Entries of the bag or the depot, sorted. */
export function entriesOf(app: App, where: "bag" | "depot"): Entry[] {
  const s = app.game.state, c = app.content;
  const entries: Entry[] = [];
  const gearUids = where === "bag" ? Object.keys(s.inventory.gear).map(Number).filter((u) => gearPlace(s, u) === "bag") : s.inventory.depot.gear;
  for (const u of gearUids) { const g = s.inventory.gear[u]!; entries.push({ key: `g${u}`, kind: "gear", uid: u, rarity: g.rarity, name: gearName(app, g), score: gearCp(app, g) }); }
  const stacks = where === "bag" ? s.inventory.stacks : s.inventory.depot.stacks;
  for (const [id, q] of Object.entries(stacks)) if (q > 0) { const d = c.get<any>(id); entries.push({ key: id, kind: "stack", id, qty: q, rarity: d.rarity ?? "common", name: d.name, score: d.sell_value ?? 0 }); }
  return entries;
}
export function sortEntries(entries: Entry[], sort: "rarity" | "name" | "cp") {
  const rIdx = (r: string) => RARITIES.indexOf(r as any);
  entries.sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "cp" ? b.score - a.score : rIdx(b.rarity) - rIdx(a.rarity) || (a.kind === b.kind ? 0 : a.kind === "gear" ? -1 : 1) || a.name.localeCompare(b.name));
  return entries;
}
const filterCat = (entries: Entry[], cat: Cat) => entries.filter((e) => cat === "all" || (cat === "gear" ? e.kind === "gear" : e.kind === "stack" && catOf(e.id) === cat));

/** A short list of choices in a bottom sheet (rarity filter, sort order): tap one to apply. */
function pickSheet(app: App, id: string, title: string, options: { value: string; label: string; count?: number; rarity?: string }[], cur: string, onPick: (v: string) => void) {
  app.router.open({ id, kind: "sheet", render: (close) => h("div", { class: "pick" },
    h("div", { class: "sec-h" }, h("h3", null, title)),
    options.map((o) => h("button", { class: ["pick-row", o.value === cur && "on", o.rarity && `r-${o.rarity}`], disabled: o.count === 0 && o.value !== cur, onClick: () => { onPick(o.value); close(); } },
      o.rarity ? h("i", { class: "pick-dot" }) : null, h("span", { class: ["grow", o.rarity && `rt-${o.rarity}`] }, o.label),
      o.count !== undefined && h("span", { class: "muted tnum" }, String(o.count)), o.value === cur && icon("check", 14)))) });
}

/** Inventory (UI review S4): six columns of slots with no names under them (the dock names the selected item), the
 *  rarity filter and the sort order as two dropdown chips, the bag capacity and its expansion on the same line, and
 *  the selected item's detail docked at the bottom so Lock · Compare · Equip / Use never scroll away. */
export function inventoryScreen(app: App) {
  const s = app.game.state, c = app.content;
  const entries = entriesOf(app, "bag");
  const inCat = filterCat(entries, ui.cat);
  const counts = Object.fromEntries(RARITIES.map((r) => [r, inCat.filter((e) => e.rarity === r).length]));
  if (ui.rarity !== "all" && !counts[ui.rarity]) ui.rarity = "all";
  const shown = sortEntries(inCat.filter((e) => ui.rarity === "all" || e.rarity === ui.rarity), ui.sort);
  if (ui.selected && !shown.some((e) => e.key === ui.selected)) ui.selected = null;
  if (!ui.selected && shown.length) ui.selected = shown[0]!.key;
  const sel = shown.find((e) => e.key === ui.selected);
  const cp = computeStats(s, c).cp;
  const refresh = () => app.router.refresh();
  const cap = bagCapacity(s, c), used = bagUsed(s), pouch = pouchCount(s);
  // the page count follows the capacity when nothing is filtered (every slot is drawn), the filtered list otherwise
  const pageCap = ui.cat === "all" && ui.rarity === "all" ? cap : shown.length;
  const tileOf = (e: Entry) => e.kind === "gear"
    ? gearTile(app, e.uid, { selected: e.key === ui.selected, onClick: () => { ui.selected = e.key; refresh(); } })
    : stackTile(app, e.id, { selected: e.key === ui.selected, onClick: () => { ui.selected = e.key; refresh(); } });
  const full = used >= cap;
  return [
    header(app),
    subbar({ help: { app, key: "inventory" }, title: "Inventory", cn: "行囊", sub: `${entries.length} item${entries.length === 1 ? "" : "s"} in your bag · worn gear is on Character`, end: h("span", { class: "cp-chip" }, icon("cp", 13), h("span", null, h("span", { class: "lbl" }, "Your CP"), h("b", null, fmt.int(cp)))) }),
    pouch > 0 && h("div", { class: "glass panel pouch-bar" }, icon("pouch", 20),
      h("div", { class: "grow" }, h("b", null, `${pouch} drop${pouch > 1 ? "s" : ""} waiting in your overflow pouch`), h("span", null, full ? "Your bag is full: sell, use or store something, then claim them." : "Claim them into your bag.")),
      h("button", { class: ["btn sm", !full && "gold"], onClick: () => { const r = app.game.run("pouch", app.now(), (st, ct) => claimOverflow(st, ct)); app.router.toast(r.ok ? `Claimed ${(r as any).moved} · ${(r as any).left} still waiting` : r.reason, r.ok ? "good" : "bad"); } }, "Claim")),
    h("div", { class: "chips glass" }, CATS.map((ct) => h("button", { class: ["chip", ui.cat === ct.id && "on"], onClick: () => { ui.cat = ct.id; ui.selected = null; ui.page = 0; refresh(); } }, ct.label))),
    h("div", { class: "inv-tools" },
      h("button", { class: ["dd-chip", ui.rarity !== "all" && `r-${ui.rarity} on`], "aria-label": "Filter by rarity", onClick: () => pickSheet(app, "rarity", "Rarity",
          [{ value: "all", label: "All rarities", count: inCat.length }, ...RARITIES.map((r) => ({ value: r, label: RARITY_LABEL[r]!, count: counts[r]!, rarity: r }))], ui.rarity, (v) => { ui.rarity = v; ui.selected = null; ui.page = 0; refresh(); }) },
        ui.rarity === "all" ? h("span", { class: "dd-dots" }, RARITIES.filter((r) => counts[r]).slice(0, 4).map((r) => h("i", { class: `r-${r}` }))) : h("i", { class: "pick-dot" }),
        h("span", null, ui.rarity === "all" ? "All" : RARITY_LABEL[ui.rarity]), h("b", { class: "tnum" }, String(shown.length)), h("span", { class: "dd-car" }, "▾")),
      h("button", { class: "dd-chip", "aria-label": "Sort order", onClick: () => pickSheet(app, "sort", "Sort by", (Object.keys(SORTS) as (keyof typeof SORTS)[]).map((k) => ({ value: k, label: SORTS[k] })), ui.sort, (v) => { ui.sort = v as typeof ui.sort; refresh(); }) },
        icon("sort", 11), h("span", null, SORTS[ui.sort]), h("span", { class: "dd-car" }, "▾")),
      h("span", { class: "grow" }),
      h("span", { class: ["inv-cap", full && "full"], title: "Bag slots used" }, icon("pouch", 12), h("b", { class: "tnum" }, String(used)), h("span", null, `/ ${cap}`)),
      expandButton(app, "bag", true)),
    h("div", { class: "glass panel inv-panel" },
      shown.length === 0 && pageCap === shown.length ? h("div", { class: "muted center", style: { padding: "28px 0" } }, "Nothing here yet.")
        : pagedGrid(app, shown.map(tileOf), pageCap, ui.page, (p) => { ui.page = p; refresh(); })),
    sel && h("div", { class: "inv-dock", dataset: { key: "inv-dock" } }, sel.kind === "gear" ? gearDetail(app, sel.uid, { onChange: refresh }) : stackDetail(app, sel.id, { onChange: refresh })),
  ];
}

/** "+20 slots · cost" button; disabled at the maximum. */
function expandButton(app: App, which: "bag" | "depot", mini = false) {
  const s = app.game.state, c = app.content;
  const cost = expansionCost(s, c, which);
  if (cost === null) return mini ? null : h("span", { class: "tag" }, "Max size");
  if (mini) return h("button", { class: "icon-btn inv-exp", "aria-label": `Expand your ${which}: +${c.rules.inventory.expansion_slots} slots for ${fmt.int(cost)} spirit stones`, title: `+${c.rules.inventory.expansion_slots} slots · ${fmt.int(cost)} stones`, onClick: () => confirmModal(app, { title: `Expand your ${which}?`, body: `+${c.rules.inventory.expansion_slots} slots for ${fmt.int(cost)} spirit stones. Permanent.`, ok: "Expand" }, () => {
    const r = app.game.run("expand", app.now(), (st, ct) => buyExpansion(st, ct, which)); app.router.toast(r.ok ? `+${(r as any).slots} slots` : r.reason, r.ok ? "good" : "bad");
  }) }, icon("plus", 13));
  return h("button", { class: "btn sm ghost", onClick: () => confirmModal(app, { title: `Expand your ${which}?`, body: `+${c.rules.inventory.expansion_slots} slots for ${fmt.int(cost)} spirit stones. Permanent.`, ok: "Expand" }, () => {
    const r = app.game.run("expand", app.now(), (st, ct) => buyExpansion(st, ct, which)); app.router.toast(r.ok ? `+${(r as any).slots} slots` : r.reason, r.ok ? "good" : "bad");
  }) }, icon("plus", 12), `+${c.rules.inventory.expansion_slots}`, h("span", { class: "cta-s" }, icon("gem", 10), ` ${fmt.int(cost)}`));
}

// ---------- depot (Your Quarters) ----------
const dui = { side: "bag" as "bag" | "depot", cat: "all" as Cat, selected: null as string | null, page: 0 };

/** Personal storage: move stacks and gear between the bag and the depot. Both are paged like the inventory. */
export function depotScreen(app: App, backTo: string): Screen {
  return { id: "depot", render: () => {
    const s = app.game.state, c = app.content;
    const refresh = () => app.router.refresh();
    const entries = sortEntries(filterCat(entriesOf(app, dui.side), dui.cat), "rarity");
    if (dui.selected && !entries.some((e) => e.key === dui.selected)) dui.selected = null;
    const sel = entries.find((e) => e.key === dui.selected);
    const cap = dui.side === "bag" ? bagCapacity(s, c) : depotCapacity(s, c), used = dui.side === "bag" ? bagUsed(s) : depotUsed(s);
    const run = (fn: () => any, msg: string) => { const r = fn(); app.router.toast(r.ok ? msg : r.reason, r.ok ? "good" : "bad"); };
    const move = (e: Entry, all: boolean) => {
      if (e.kind === "gear") run(() => app.game.run("depot", app.now(), (st, ct) => dui.side === "bag" ? storeGear(st, ct, e.uid) : takeGear(st, ct, e.uid)), dui.side === "bag" ? "Stored" : "Taken");
      else { const n = all ? e.qty : 1; run(() => app.game.run("depot", app.now(), (st, ct) => dui.side === "bag" ? storeItem(st, ct, e.id, n) : takeItem(st, ct, e.id, n)), `${dui.side === "bag" ? "Stored" : "Took"} ${n} × ${e.name}`); }
    };
    const tileOf = (e: Entry) => e.kind === "gear"
      ? gearTile(app, e.uid, { named: true, selected: e.key === dui.selected, onClick: () => { dui.selected = e.key; refresh(); } })
      : stackTile(app, e.id, { named: true, selected: e.key === dui.selected, onClick: () => { dui.selected = e.key; refresh(); } });
    const bulk = (what: "mat" | "all") => {
      let n = 0;
      for (const e of entriesOf(app, "bag")) {
        if (e.kind !== "stack") continue;
        if (what === "mat" && catOf(e.id) !== "mat") continue;
        if (catOf(e.id) === "quest") continue;
        const r = app.game.run("depot", app.now(), (st, ct) => storeItem(st, ct, e.id, e.qty), false); if (r.ok) n++;
      }
      app.router.toast(n ? `Stored ${n} stack${n > 1 ? "s" : ""}` : "Nothing to store (or the depot is full)", n ? "good" : "info");
    };
    return [
      header(app),
      subbar({ help: { app, key: "depot" }, title: "Storage Chest", cn: "储物箱", sub: "Safe storage for what you do not carry", backTo, onBack: () => app.router.back() }),
      h("div", { class: "row between glass", style: { padding: "6px 8px", borderRadius: "999px" } },
        seg(dui.side, [{ value: "bag", label: `Bag ${bagUsed(s)}/${bagCapacity(s, c)}` }, { value: "depot", label: `Depot ${depotUsed(s)}/${depotCapacity(s, c)}` }], (v) => { dui.side = v; dui.selected = null; dui.page = 0; refresh(); }),
        expandButton(app, dui.side)),
      h("div", { class: "chips glass" }, CATS.filter((x) => x.id !== "quest").map((ct) => h("button", { class: ["chip", dui.cat === ct.id && "on"], onClick: () => { dui.cat = ct.id; dui.selected = null; dui.page = 0; refresh(); } }, ct.label))),
      h("div", { class: "glass panel" },
        h("div", { class: "row between", style: { marginBottom: "6px" } }, capacityMeter(used, cap, dui.side === "bag" ? "Bag" : "Depot"),
          dui.side === "bag" && h("button", { class: "btn sm ghost", onClick: () => bulk("mat") }, "Store all materials")),
        entries.length === 0 && dui.cat !== "all" ? h("div", { class: "muted center", style: { padding: "28px 0" } }, "Nothing here.")
          : pagedGrid(app, entries.map(tileOf), dui.cat === "all" ? cap : entries.length, dui.page, (p) => { dui.page = p; refresh(); })),
      sel && h("div", { class: "glass panel item-detail" },
        h("div", { class: "row" },
          h("div", { style: { width: "56px", flex: "none" } }, sel.kind === "gear" ? gearTile(app, sel.uid) : stackTile(app, sel.id)),
          h("div", { class: "grow" }, h("div", { class: `muted up rt-${sel.rarity}`, style: { fontWeight: 800 } }, RARITY_LABEL[sel.rarity]), h("div", { class: `item-name rt-${sel.rarity}` }, sel.name, sel.kind === "stack" && h("span", { class: "muted" }, `  ×${sel.qty}`)))),
        h("div", { class: "grid-2", style: { marginTop: "10px" } },
          sel.kind === "stack" && sel.qty > 1 ? h("button", { class: "btn", onClick: () => move(sel, false) }, dui.side === "bag" ? "Store 1" : "Take 1") : h("span"),
          h("button", { class: "btn gold", onClick: () => move(sel, true) }, dui.side === "bag" ? (sel.kind === "stack" && sel.qty > 1 ? `Store all (${sel.qty})` : "Store") : (sel.kind === "stack" && sel.qty > 1 ? `Take all (${sel.qty})` : "Take")))),
    ];
  } };
}
