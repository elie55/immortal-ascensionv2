/** Item presentation shared by Inventory and Character: tiles, names, stat lines, detail panel, compare. */
import { h, fmt } from "../core/dom.ts";
import { readBook, studyBlueprint } from "../../engine/crafting.ts";
import { icon, SLOT_ICON } from "../core/icons.ts";
import { tile, attrLabel, attrValue, RARITY_LABEL } from "../core/kit.ts";
import type { App } from "../../app.ts";
import type { GearInstance } from "../../engine/state.ts";
import { equippedSlotOf, slotKeysFor, gearStats, type EquipSlot } from "../../engine/inventory.ts";
import { instanceCp } from "../../../schema/gear-math.ts";
import { enhanceMult } from "../../engine/inventory.ts";
import { equip, unequip, useConsumable, sellItem } from "../../engine/actions.ts";
import { isBreakthroughItem } from "../../engine/cultivation.ts";

export const ITEM_ICON: Record<string, string> = { mat: "sparkle", cons: "cauldron", gift: "fame", book: "scroll", blueprint: "map", qitem: "scroll", egg: "paw", bfood: "paw", junk: "trash" };
export const CATEGORY: Record<string, string> = { mat: "Material", cons: "Pill", gift: "Gift", book: "Manual", blueprint: "Blueprint", qitem: "Quest item", egg: "Spirit beast egg", bfood: "Beast food", junk: "Junk" };

export function gearArt(app: App, inst: GearInstance): string | undefined {
  const a = app.content.get<any>(inst.base).rarities?.[inst.rarity]?.art?.icon;
  return a && a.status !== "planned" ? a.file : undefined;
}
export function gearName(app: App, inst: GearInstance): string {
  const b = app.content.get<any>(inst.base);
  return b.rarities?.[inst.rarity]?.name ?? b.name;
}
export const gearCp = (app: App, inst: GearInstance) => instanceCp(app.content.gearRules, inst as any, enhanceMult(app.content, inst));

export function gearTile(app: App, uid: number, o: { selected?: boolean; onClick?: () => void; named?: boolean } = {}) {
  const inst = app.game.state.inventory.gear[uid]!;
  const base = app.content.get<any>(inst.base);
  return tile({ rarity: inst.rarity, art: gearArt(app, inst), fallbackIcon: SLOT_ICON[base.slot] ?? "sword", plus: inst.enhance, name: o.named ? gearName(app, inst) : undefined, selected: o.selected, onClick: o.onClick, img: (f) => app.img(f) });
}

export function stackTile(app: App, id: string, o: { selected?: boolean; onClick?: () => void; named?: boolean } = {}) {
  const def = app.content.get<any>(id);
  return tile({ rarity: def.rarity ?? "common", art: app.content.art(id, "icon"), fallbackIcon: ITEM_ICON[id.split(".")[0]!], qty: app.game.state.inventory.stacks[id], name: o.named ? def.name : undefined, selected: o.selected, onClick: o.onClick, img: (f) => app.img(f) });
}

/** "ATK 8 · HP 28 · Crit +2%" style chips for an instance (enhancement applied). */
export function gearChips(app: App, inst: GearInstance, max = 99) {
  const st = gearStats(app.content, inst);
  const keys = [inst.main.stat, ...inst.affixes.map((a) => a.stat)];
  const seen = new Set<string>();
  return keys.filter((k) => !seen.has(k) && seen.add(k)).slice(0, max).map((k) => h("span", { class: "chip-stat" }, `${attrLabel(k)} ${k === inst.main.stat ? "" : "+"}${attrValue(k, st[k] ?? 0)}`));
}

/** Instance currently in the slot this instance would go to (for comparisons). */
export function comparedTo(app: App, inst: GearInstance, uid: number): number | undefined {
  const s = app.game.state;
  const keys = slotKeysFor(app.content.get<any>(inst.base).slot) as EquipSlot[];
  const others = keys.map((k) => s.equipped[k]).filter((u): u is number => u !== undefined && u !== uid);
  if (!others.length) return undefined;
  return others.sort((a, b) => gearCp(app, s.inventory.gear[a]!) - gearCp(app, s.inventory.gear[b]!))[0];
}

export function gearDetail(app: App, uid: number, opts: { onChange?: () => void } = {}) {
  const s = app.game.state, c = app.content;
  const inst = s.inventory.gear[uid];
  if (!inst) return null;
  const base = c.get<any>(inst.base);
  const cp = gearCp(app, inst);
  const vsUid = comparedTo(app, inst, uid);
  const vsCp = vsUid !== undefined ? gearCp(app, s.inventory.gear[vsUid]!) : 0;
  const worn = equippedSlotOf(s, uid);
  const locked = s.inventory.lockedGear.includes(uid);
  const set = base.set ? c.get<any>(base.set) : undefined;
  const run = (fn: () => any, msg?: string) => { const r = fn(); if (r && r.ok === false) app.router.toast(r.reason, "bad"); else { if (msg) app.router.toast(msg, "good"); opts.onChange?.(); } };
  return h("div", { class: "glass panel item-detail" },
    h("div", { class: "row", style: { alignItems: "flex-start" } },
      h("div", { style: { width: "64px", flex: "none" } }, gearTile(app, uid)),
      h("div", { class: "grow" },
        h("div", { class: `muted up rt-${inst.rarity}`, style: { fontWeight: 800 } }, `${RARITY_LABEL[inst.rarity]} · ${base.slot} · iLvl ${inst.ilvl} · +${inst.enhance}`),
        h("div", { class: `item-name rt-${inst.rarity}` }, gearName(app, inst)),
        h("div", { class: "row", style: { flexWrap: "wrap", gap: "4px", marginTop: "4px" } }, gearChips(app, inst)),
        set && h("div", { class: "muted", style: { marginTop: "4px" } }, `Set: ${set.name}`),
        inst.specials.map((e: any) => h("div", { class: "muted gold-t", style: { marginTop: "2px" } }, `✦ ${e.description}`))),
      h("div", { style: { textAlign: "right", flex: "none" } },
        h("div", { class: "muted up" }, "Item CP"), h("div", { style: { fontWeight: 900, fontSize: "20px" } }, fmt.int(cp)),
        !worn && h("div", { class: "muted up" }, "vs equipped"),
        !worn && h("div", { class: cp >= vsCp ? "jade-t" : "red-t", style: { fontWeight: 800 } }, `${cp >= vsCp ? "▲" : "▼"} ${fmt.int(Math.abs(cp - vsCp))}`))),
    h("div", { class: "grid-3", style: { marginTop: "10px" } },
      h("button", { class: "btn ghost", onClick: () => run(() => { const L = s.inventory.lockedGear; const i = L.indexOf(uid); if (i >= 0) L.splice(i, 1); else L.push(uid); app.game.dirty = true; return { ok: true }; }) }, icon(locked ? "lock" : "unlock", 14), locked ? "Locked" : "Lock"),
      h("button", { class: "btn ghost", disabled: vsUid === undefined || !!worn, onClick: () => compareSheet(app, uid, vsUid!) }, "Compare"),
      worn
        ? h("button", { class: "btn", onClick: () => run(() => app.game.run("unequip", app.now(), (st, ct) => unequip(st, ct, worn)), "Unequipped") }, "Unequip")
        : h("button", { class: "btn gold", onClick: () => run(() => app.game.run("equip", app.now(), (st, ct) => equip(st, ct, uid)), `Equipped ${gearName(app, inst)}`) }, "Equip")));
}

export function stackDetail(app: App, id: string, opts: { onChange?: () => void } = {}) {
  const s = app.game.state, c = app.content;
  const def = c.get<any>(id);
  const qty = s.inventory.stacks[id] ?? 0;
  if (!qty) return null;
  const prefix = id.split(".")[0]!;
  const usable = prefix === "cons" && !isBreakthroughItem(c, id);
  const effects = prefix === "cons" ? Object.entries(def.effects).map(([k, v]: [string, any]) => k === "qi" ? `+${fmt.compact(v)} Qi` : k === "hp_pct" ? `Heal ${v}% HP` : k === "sp_pct" ? `Restore ${v}% SP` : k === "cultivation_boost" ? `×${v.mult} Qi rate for ${v.minutes} min` : k === "breakthrough_chance_bonus" ? `+${Math.round(v * 100)}% breakthrough chance` : k === "permanent" ? Object.entries(v).map(([a, n]: any) => `${attrLabel(a)} +${attrValue(a, n)} permanently`).join(", ") : k === "buff" ? `Applies ${c.get<any>(v.status).name}` : `${k}`) : [];
  const run = (fn: () => any, msg?: string) => { const r = fn(); if (r && r.ok === false) app.router.toast(r.reason, "bad"); else { if (msg) app.router.toast(msg, "good"); opts.onChange?.(); } };
  return h("div", { class: "glass panel item-detail" },
    h("div", { class: "row", style: { alignItems: "flex-start" } },
      h("div", { style: { width: "64px", flex: "none" } }, stackTile(app, id)),
      h("div", { class: "grow" },
        h("div", { class: `muted up rt-${def.rarity ?? "common"}`, style: { fontWeight: 800 } }, `${RARITY_LABEL[def.rarity ?? "common"]} · ${CATEGORY[prefix] ?? prefix}${def.tier ? ` · Tier ${def.tier}` : ""}`),
        h("div", { class: `item-name rt-${def.rarity ?? "common"}` }, def.name, h("span", { class: "muted" }, `  ×${qty}`)),
        h("div", { class: "dim", style: { fontSize: "12px", marginTop: "2px" } }, def.description),
        effects.length > 0 && h("div", { class: "row", style: { flexWrap: "wrap", gap: "4px", marginTop: "6px" } }, effects.map((e) => h("span", { class: "chip-stat" }, e))),
        isBreakthroughItem(c, id) && h("div", { class: "muted gold-t", style: { marginTop: "4px" } }, "✦ Used automatically by your breakthrough")),
      def.sell_value !== undefined && h("div", { style: { textAlign: "right", flex: "none" } }, h("div", { class: "muted up" }, "Sells for"), h("div", { style: { fontWeight: 800 } }, icon("gem", 12), ` ${fmt.int(def.sell_value)}`))),
    h("div", { class: "grid-2", style: { marginTop: "10px" } },
      h("button", { class: "btn ghost", disabled: def.sell_value === undefined || prefix === "qitem", onClick: () => run(() => app.game.run("sell", app.now(), (st, ct) => sellItem(st, ct, id, 1)), `Sold 1 ${def.name}`) }, "Sell 1"),
      usable
        ? h("button", { class: "btn gold", onClick: () => run(() => app.game.run("use", app.now(), (st, ct) => useConsumable(st, ct, { now: app.now() }, id)), `Used ${def.name}`) }, "Use")
        : prefix === "book" ? h("button", { class: "btn gold", onClick: () => run(() => app.game.run("read", app.now(), (st, ct) => readBook(st, ct, id)), `Learned ${c.get<any>(def.teaches).name}`) }, "Read")
        : prefix === "blueprint" ? h("button", { class: "btn gold", onClick: () => run(() => app.game.run("study", app.now(), (st, ct) => studyBlueprint(st, ct, id)), "Recipe learned") }, "Study")
        : h("button", { class: "btn", disabled: true }, prefix === "gift" ? "Give to someone" : prefix === "egg" ? "Hatch at the Garden" : prefix === "mat" ? "For crafting" : "Keep")));
}

function compareSheet(app: App, a: number, b: number) {
  app.router.open({ id: "compare", kind: "sheet", render: () => {
    const s = app.game.state;
    const A = s.inventory.gear[a]!, B = s.inventory.gear[b]!;
    const sa = gearStats(app.content, A), sb = gearStats(app.content, B);
    const keys = [...new Set([...Object.keys(sb), ...Object.keys(sa)])];
    return h("div", null,
      h("div", { class: "m-title" }, "Compare"),
      h("div", { class: "grid-2", style: { marginBottom: "10px" } },
        h("div", { class: "center" }, h("div", { style: { width: "64px", margin: "0 auto" } }, gearTile(app, b)), h("div", { class: `item-name rt-${B.rarity}`, style: { fontSize: "13px" } }, gearName(app, B)), h("div", { class: "muted" }, "Equipped")),
        h("div", { class: "center" }, h("div", { style: { width: "64px", margin: "0 auto" } }, gearTile(app, a)), h("div", { class: `item-name rt-${A.rarity}`, style: { fontSize: "13px" } }, gearName(app, A)), h("div", { class: "muted" }, "Selected"))),
      h("dl", { class: "kv cmp" }, ...keys.flatMap((k) => {
        const d = (sa[k] ?? 0) - (sb[k] ?? 0);
        return [h("dt", null, attrLabel(k)), h("dd", null, `${attrValue(k, sb[k] ?? 0)} → ${attrValue(k, sa[k] ?? 0)} `, h("span", { class: d >= 0 ? "jade-t" : "red-t" }, `${d >= 0 ? "▲" : "▼"}${attrValue(k, Math.abs(d))}`))];
      }), h("dt", { class: "gold-t" }, "Item CP"), h("dd", { class: "gold-t" }, `${fmt.int(gearCp(app, B))} → ${fmt.int(gearCp(app, A))}`)));
  } });
}
