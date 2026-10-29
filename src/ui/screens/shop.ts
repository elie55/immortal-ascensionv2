/**
 * Shops (mockups "merchant_pavilion", "scripture_pavilion"): the keeper's portrait with a greeting bubble and
 * affinity, a Goods grid (tier/discount line, locked and sold-out states), a buy sheet with quantity, and a Sell
 * tab for materials, junk and gear.
 */
import { h, fmt } from "../core/dom.ts";
import { icon, SLOT_ICON } from "../core/icons.ts";
import { header, subbar, seg, bar, tile, stepper, RARITY_LABEL, confirmModal } from "../core/kit.ts";
import type { Screen } from "../core/router.ts";
import type { App } from "../../app.ts";
import { shopRows, buy, discountPct, restockIn, sellGear, gearSellValue, type ShopRow } from "../../engine/shop.ts";
import { sellItem } from "../../engine/actions.ts";
import { equippedSlotOf } from "../../engine/inventory.ts";
import { affinityLevel } from "../../engine/unlock.ts";
import { ITEM_ICON, CATEGORY, gearTile, gearName, gearArt } from "./items.ts";

const GREETING: Record<string, string> = {
  "shop.merchant_pavilion": "Welcome, welcome! Fresh stock from the caravan. Raise your Sect Fame and I'll give you a better price~",
  "shop.scripture_pavilion": "Knowledge is not sold, disciple. It is earned — and the stones keep the lamps lit.",
  "shop.beast_garden": "Food for the little ones. Take what they need, not what you want.",
  "shop.tang_caravan": "The caravan stops for a few hours only! Buy now, regret never.",
  "shop.origin_realm_merchant": "Few find this stall. Fewer leave empty-handed.",
};
const CUR_ICON: Record<string, string> = { spirit_stones: "gem", sect_fame: "fame", contribution: "scroll" };

function rowArt(app: App, r: ShopRow): { art?: string; rarity: string; icon: string; label: string } {
  const c = app.content;
  if ("gear" in r.entry) { const b = c.get<any>(r.entry.gear.base); return { art: gearArt(app, { base: b.id, rarity: r.entry.gear.rarity } as any), rarity: r.entry.gear.rarity, icon: SLOT_ICON[b.slot] ?? "sword", label: "Gear" }; }
  const def = c.get<any>(r.id);
  const p = r.id.split(".")[0]!;
  return { art: c.art(r.id, "icon"), rarity: def.rarity ?? (p === "tech" || p === "method" ? techRarity(def) : "common"), icon: ITEM_ICON[p] ?? (p === "tech" || p === "method" ? "scroll" : "sparkle"), label: p === "tech" ? (def.kind === "passive" ? "Passive" : def.kind === "ultimate" ? "Ultimate" : "Technique") : p === "method" ? "Method" : CATEGORY[p] ?? p };
}
const techRarity = (t: any) => t.rarity ?? (t.kind === "ultimate" ? "legendary" : t.tier >= 3 ? "epic" : t.tier === 2 ? "rare" : "uncommon");

export function shopScreen(app: App, shopId: string, backTo: string): Screen {
  let tab: "goods" | "sell" = "goods";
  let sellSel: string | number | null = null;
  return {
    id: `shop:${shopId}`, bg: () => { const sh = app.content.get<any>(shopId); const loc = sh.owner ? app.content.get<any>(sh.owner).location : undefined; return loc ? app.content.art(loc, "background") : undefined; },
    render: () => {
      const s = app.game.state, c = app.content, now = app.now();
      const shop = c.get<any>(shopId);
      const owner = shop.owner ? c.get<any>(shop.owner) : null;
      const rows = shopRows(s, c, shopId, now);
      const disc = discountPct(s, c, shop);
      const restock = restockIn(shop, now);
      const aff = owner ? affinityLevel(c, owner.id, s.relations[owner.id]?.affinity ?? 0) : null;
      const affVal = owner ? s.relations[owner.id]?.affinity ?? 0 : 0;
      return [
        header(app),
        subbar({ title: shop.name, cn: shop.name_cn, sub: owner ? `${owner.name} · ${owner.title ?? owner.role}` : shop.description, backTo, onBack: () => app.router.back() }),
        owner && h("div", { class: "keeper" },
          h("div", { class: "keeper-art", style: { backgroundImage: app.img(c.artAny(owner.id, "full_body", "portrait")) } }),
          h("div", { class: "glass bubble" }, h("div", { class: "bubble-n" }, owner.name), h("div", null, GREETING[shopId] ?? shop.description),
            aff && h("div", { class: "row", style: { gap: "6px", marginTop: "6px" } }, h("span", { class: "pink-t", style: { fontSize: "calc(11rem / 15)", fontWeight: 700 } }, `♥ ${aff.name}`), h("div", { class: "grow" }, bar(aff.next ? affVal / aff.next.threshold : 1, { cls: "thin pink" })), h("span", { class: "muted tnum" }, aff.next ? `${affVal} / ${aff.next.threshold}` : `${affVal}`)))),
        h("div", { class: "glass panel shop-panel" },
          seg(tab, [{ value: "goods", label: "Goods" }, { value: "sell", label: "Sell" }], (v) => { tab = v; sellSel = null; app.router.refresh(); }),
          tab === "goods" ? [
            h("div", { class: "row between shop-meta" },
              h("span", { class: "muted" }, restock === null ? "Limited stock never returns" : `Restocks in ${fmt.duration(restock)}`),
              disc > 0 ? h("span", { class: "tag gold" }, icon("fame", 10), ` −${disc}%`) : shop.fame_discount_pct_per_500 ? h("span", { class: "muted" }, `−${shop.fame_discount_pct_per_500}% per 500 Fame`) : null),
            h("div", { class: "shop-grid" }, rows.map((r) => goodsCard(app, shopId, r))),
          ] : sellPanel(app, () => sellSel, (v) => { sellSel = v; app.router.refresh(); }),
        ),
      ];
    },
  };
}

function goodsCard(app: App, shopId: string, r: ShopRow) {
  const c = app.content;
  const a = rowArt(app, r);
  const name = "gear" in r.entry ? c.get<any>(r.entry.gear.base).name : c.get<any>(r.id).name;
  const soldOut = r.left === 0;
  const orig = r.entry.price;
  return h("button", { class: ["glass goods", (r.locked || soldOut || r.owned) && "dim-card"], onClick: () => buySheet(app, shopId, r.index) },
    h("div", { class: "row between" }, h("span", { class: `g-cat rt-${a.rarity}` }, a.label), r.left !== null ? h("span", { class: "g-left" }, soldOut ? "Sold out" : `×${r.left}`) : null),
    h("div", { class: "g-art" }, tile({ rarity: a.rarity, art: a.art, fallbackIcon: a.icon, img: (f) => app.img(f) })),
    h("div", { class: "g-name" }, name, "gear" in r.entry && h("span", { class: "muted" }, ` Lv${r.entry.gear.ilvl}`)),
    r.owned ? h("div", { class: "g-price jade-t" }, "Learned")
      : r.locked ? h("div", { class: "g-price muted" }, icon("lock", 10), " ", r.locked)
      : h("div", { class: "g-price" }, orig !== r.price && h("s", { class: "muted" }, fmt.int(orig)), icon(CUR_ICON[r.currency] ?? "gem", 11), h("b", null, fmt.int(r.price))));
}

function buySheet(app: App, shopId: string, index: number) {
  let qty = 1;
  app.router.open({ id: "buy", kind: "sheet", render: (close) => {
    const s = app.game.state, c = app.content;
    const r = shopRows(s, c, shopId, app.now())[index]!;
    const a = rowArt(app, r);
    const isGear = "gear" in r.entry;
    const def = isGear ? c.get<any>((r.entry as any).gear.base) : c.get<any>(r.id);
    const single = isGear || r.id.startsWith("tech.") || r.id.startsWith("method.");
    const afford = Math.floor(s.resources[r.currency] / r.price);
    const max = single ? 1 : Math.max(1, Math.min(99, afford, r.left ?? 99));
    qty = Math.min(qty, max);
    const extra = r.id.startsWith("tech.") ? techLine(app, def) : r.id.startsWith("method.") ? `Qi ×${def.qi_mult} · ${def.description}` : isGear ? `${RARITY_LABEL[(r.entry as any).gear.rarity]} · item level ${(r.entry as any).gear.ilvl} · stats rolled on purchase` : def.description;
    return h("div", { class: "stack" },
      h("div", { class: "row", style: { alignItems: "flex-start" } },
        h("div", { style: { width: "64px", flex: "none" } }, tile({ rarity: a.rarity, art: a.art, fallbackIcon: a.icon, img: (f) => app.img(f) })),
        h("div", { class: "grow" }, h("div", { class: `muted up rt-${a.rarity}`, style: { fontWeight: 800 } }, a.label), h("div", { class: `item-name rt-${a.rarity}` }, def.name), h("div", { class: "dim", style: { fontSize: "calc(12.5rem / 15)" } }, extra),
          !isGear && !single && h("div", { class: "muted", style: { marginTop: "4px" } }, `You have ${fmt.int(s.inventory.stacks[r.id] ?? 0)}`))),
      r.locked ? h("div", { class: "warnbox" }, icon("lock", 14), r.locked)
        : r.owned ? h("div", { class: "muted center" }, "You already know this.")
        : [
          !single && h("div", { class: "row between" }, h("span", { class: "muted" }, r.left !== null ? `${r.left} left this restock` : "In stock"), stepper(qty, 1, max, (v) => { qty = v; app.router.refresh(); })),
          h("button", { class: "btn gold block lg", disabled: afford < qty || r.left === 0, onClick: () => {
            const res = app.game.run("buy", app.now(), (st, cc) => buy(st, cc, shopId, index, qty, app.now()));
            app.router.toast(res.ok ? `Bought ${single ? def.name : `${qty}× ${def.name}`}` : res.reason, res.ok ? "good" : "bad");
            if (res.ok) close();
          } }, r.id.startsWith("tech.") || r.id.startsWith("method.") ? "Learn" : "Buy", h("span", { class: "cta-s" }, icon(CUR_ICON[r.currency] ?? "gem", 12), ` ${fmt.int(r.price * qty)}`)),
          afford < qty && h("div", { class: "muted center red-t" }, "Not enough " + (r.currency === "spirit_stones" ? "spirit stones" : r.currency.replace("_", " "))),
        ]);
  } });
}

export function techLine(app: App, t: any): string {
  const bits: string[] = [];
  if (t.power) bits.push(`${t.power}% power`);
  if (t.heal_pct) bits.push(`heal ${t.heal_pct}%`);
  if (t.shield_pct_max_hp) bits.push(`shield ${t.shield_pct_max_hp}% HP`);
  if (t.sp_cost) bits.push(`${t.sp_cost} SP`);
  if (t.cooldown) bits.push(`CD ${t.cooldown}`);
  if (t.element) bits.push(app.content.find<any>(t.element)?.name ?? "");
  return [bits.filter(Boolean).join(" · "), t.description].filter(Boolean).join(" — ");
}

function sellPanel(app: App, get: () => string | number | null, set: (v: string | number | null) => void) {
  const s = app.game.state, c = app.content;
  const stacks = Object.entries(s.inventory.stacks).filter(([id, n]) => n > 0 && !id.startsWith("qitem.") && typeof c.find<any>(id)?.sell_value === "number" && c.get<any>(id).sell_value > 0).map(([id]) => id)
    .sort((a, b) => Number(b.startsWith("junk.")) - Number(a.startsWith("junk.")));
  const gear = Object.keys(s.inventory.gear).map(Number).filter((u) => !equippedSlotOf(s, u) && !s.inventory.lockedGear.includes(u));
  const sel = get();
  const junk = stacks.filter((id) => id.startsWith("junk."));
  const junkValue = junk.reduce((n, id) => n + c.get<any>(id).sell_value * (s.inventory.stacks[id] ?? 0), 0);
  return [
    junk.length > 0 && h("button", { class: "btn block", onClick: () => { let total = 0; for (const id of junk) { const r = app.game.run("sell", app.now(), (st, cc) => sellItem(st, cc, id, st.inventory.stacks[id] ?? 0)); if (r.ok) total += (r as any).stones; } app.router.toast(`Sold junk for ${fmt.int(total)} stones`, "good"); } }, icon("trash", 14), `Sell all junk`, h("span", { class: "cta-s" }, icon("gem", 11), ` ${fmt.int(junkValue)}`)),
    h("div", { class: "muted up", style: { margin: "8px 2px 4px" } }, "Gear (not equipped or locked)"),
    gear.length ? h("div", { class: "inv-grid" }, gear.map((u) => gearTile(app, u, { selected: sel === u, onClick: () => set(u) }))) : h("div", { class: "muted" }, "No spare gear."),
    h("div", { class: "muted up", style: { margin: "10px 2px 4px" } }, "Items"),
    stacks.length ? h("div", { class: "inv-grid" }, stacks.map((id) => tile({ rarity: c.get<any>(id).rarity ?? "common", art: c.art(id, "icon"), fallbackIcon: ITEM_ICON[id.split(".")[0]!], qty: s.inventory.stacks[id], selected: sel === id, onClick: () => set(id), img: (f) => app.img(f) }))) : h("div", { class: "muted" }, "Nothing to sell."),
    sel !== null && sellBar(app, sel, () => set(null)),
  ];
}

function sellBar(app: App, sel: string | number, clear: () => void) {
  const s = app.game.state, c = app.content;
  if (typeof sel === "number") {
    const g = s.inventory.gear[sel];
    if (!g) return null;
    const v = gearSellValue(c, sel, s);
    return h("div", { class: "glass panel sell-bar" }, h("div", { class: "grow" }, h("div", { class: `item-name rt-${g.rarity}`, style: { fontSize: "calc(13rem / 15)" } }, gearName(app, g)), h("div", { class: "muted" }, `Sells for ${fmt.int(v)} stones`)),
      h("button", { class: "btn gold sm", onClick: () => {
        const sell = () => { const r = app.game.run("sell", app.now(), (st, cc) => sellGear(st, cc, [sel])); app.router.toast(r.ok ? `Sold for ${fmt.int(v)} stones` : r.reason, r.ok ? "good" : "bad"); clear(); };
        // rare and better pieces (or enhanced ones) ask first: selling cannot be undone
        if (g.rarity !== "common" && g.rarity !== "uncommon" || g.enhance > 0) confirmModal(app, { title: "Sell this piece?", body: `${gearName(app, g)} (${RARITY_LABEL[g.rarity]}${g.enhance ? `, +${g.enhance}` : ""}) for ${fmt.int(v)} stones. This cannot be undone. Lock pieces you want to keep.`, ok: "Sell", danger: true }, sell);
        else sell();
      } }, "Sell"));
  }
  const def = c.get<any>(sel);
  const n = s.inventory.stacks[sel] ?? 0;
  if (!n) return null;
  return h("div", { class: "glass panel sell-bar" }, h("div", { class: "grow" }, h("div", { class: "item-name", style: { fontSize: "calc(13rem / 15)" } }, def.name, h("span", { class: "muted" }, ` ×${n}`)), h("div", { class: "muted" }, `${fmt.int(def.sell_value)} stones each`)),
    h("button", { class: "btn sm", onClick: () => { app.game.run("sell", app.now(), (st, cc) => sellItem(st, cc, sel, 1)); } }, "Sell 1"),
    n > 1 && h("button", { class: "btn gold sm", onClick: () => { app.game.run("sell", app.now(), (st, cc) => sellItem(st, cc, sel, n)); app.router.toast(`Sold ${n}× ${def.name}`, "good"); clear(); } }, `All (${fmt.int(def.sell_value * n)})`));
}
