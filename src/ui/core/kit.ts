/** Shared UI components built from the mockups' vocabulary. */
import { h, fmt, type Child } from "./dom.ts";
import { icon } from "./icons.ts";
import type { App } from "../../app.ts";
import { trackerChip } from "../navigate.ts";
import { hintBar, helpButton } from "../help.ts";

/** Screens that show the tracked-quest strip: the tab roots and the region maps (where its marker is). Sub-screens
 *  keep just the player header and their own screen header (review: the chrome stack ate 35–50% of the screen).
 *  The quest log keeps it too: it is where a quest gets tracked. */
const TRACKER_SCREENS = new Set(["cultivate", "adventure", "character", "inventory", "sect", "quests"]);
const showsTracker = (app: App) => { const id = app.router.current().screen.id; return TRACKER_SCREENS.has(id) || id.startsWith("region:"); };

/** Top bar: portrait, name, sect/rank line, spirit stones. */
export function header(app: App, opts: { sub?: string } = {}) {
  const s = app.game.state;
  const rank = app.content.get<any>(s.character.rank);
  return [h("header", { class: "hdr glass" },
    h("div", { class: "avatar", style: { backgroundImage: app.img(app.content.artAny(s.character.npc, "portrait", "full_body")) } }),
    h("div", { class: "who" }, h("div", { class: "name" }, s.character.name), h("div", { class: "sub" }, opts.sub ?? `Azure Cloud Sect · ${rank.name}`)),
    stones(s.resources.spirit_stones)), showsTracker(app) && trackerChip(app)];
}

export function stones(n: number) {
  return h("div", { class: "stones" }, icon("gem", 22), h("div", null, h("span", { class: "lbl" }, "Spirit Stones"), h("span", { class: "val tnum" }, fmt.int(n))));
}

/** Sub-header with a back chip, title (+ Chinese), subtitle and optional trailing element. */
export function subbar(o: { title: string; cn?: string; sub?: string; backTo?: string; onBack?: () => void; end?: Child; help?: { app: App; key: string } }) {
  const bar = h("div", { class: "subbar glass" },
    o.onBack && h("button", { class: "back", onClick: o.onBack, "aria-label": `Back to ${o.backTo ?? "the previous screen"}`, title: `Back to ${o.backTo ?? "the previous screen"}` }, icon("back", 18)),
    h("div", { class: "grow" }, h("div", { class: "t" }, h("span", { class: "tt" }, o.title), o.cn && h("span", { class: "cn" }, o.cn)), o.sub && h("div", { class: "s" }, o.sub)),
    o.help && helpButton(o.help.app, o.help.key),
    o.end && h("div", { class: "end" }, o.end));
  return o.help ? [bar, hintBar(o.help.app, o.help.key)] : bar;
}

export function section(title: string, hint: Child, ...children: Child[]) {
  return h("section", { class: "glass panel" }, h("div", { class: "sec-h" }, h("h3", null, title), hint ? h("span", { class: "hint" }, hint) : null), ...children);
}

export function toggle(on: boolean, onChange: (v: boolean) => void, label?: string) {
  return h("button", { class: ["toggle", on && "on"], role: "switch", "aria-checked": String(on), "aria-label": label ?? "toggle", onClick: () => onChange(!on) });
}

export function seg<T extends string | number>(value: T, options: { value: T; label: string }[], onChange: (v: T) => void) {
  return h("div", { class: "seg", role: "radiogroup" }, options.map((o) => h("button", { class: o.value === value && "on", role: "radio", "aria-checked": String(o.value === value), onClick: () => onChange(o.value) }, o.label)));
}

export function slider(value: number, onChange: (v: number) => void, label: string) {
  const el = h("input", { class: "slider", type: "range", min: "0", max: "100", value: String(Math.round(value * 100)), "aria-label": label, style: { "--v": `${value * 100}%` } as any });
  el.addEventListener("input", () => { el.style.setProperty("--v", `${el.value}%`); });
  el.addEventListener("change", () => onChange(Number(el.value) / 100));
  return el;
}

export function bar(frac: number, opts: { cls?: string; label?: Child } = {}) {
  const p = Math.max(0, Math.min(1, frac));
  return h("div", { class: ["bar", opts.cls] }, h("i", { style: { width: `${(p * 100).toFixed(2)}%` } }), opts.label !== undefined ? h("span", null, opts.label) : null);
}

/** Settings-style row: icon, label + description, trailing control. */
export function setrow(ico: string, label: string, desc: string | null, end: Child) {
  return h("div", { class: "setrow" }, icon(ico, 18), h("div", { class: "grow" }, h("div", { class: "lbl" }, label), desc && h("div", { class: "desc" }, desc)), end);
}

/** Rarity-framed item tile. */
export function tile(o: { rarity: string; art?: string; fallbackIcon?: string; qty?: number; plus?: number; name?: string; label?: string; selected?: boolean; isNew?: boolean; onClick?: () => void; img: (f?: string) => string }) {
  const t = h("button", { class: ["tile", `r-${o.rarity}`, o.selected && "sel"], onClick: o.onClick, "aria-label": o.name ?? o.label ?? "item", title: o.name ? undefined : o.label },
    h("div", { class: "in" }, o.art ? h("div", { class: "art", style: { backgroundImage: o.img(o.art) } }) : icon(o.fallbackIcon ?? "sparkle", 26)),
    o.qty && o.qty > 1 ? h("span", { class: "qty" }, String(o.qty)) : null,
    o.plus ? h("span", { class: "plus" }, `+${o.plus}`) : null,
    o.isNew ? h("span", { class: "new" }, "NEW") : null);
  return o.name !== undefined ? h("div", null, t, h("div", { class: "tile-name" }, o.name)) : t;
}

export const RARITY_LABEL: Record<string, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic", legendary: "Legendary", mythic: "Mythic", immortal: "Immortal", divine: "Divine" };

/** Attribute labels and one-line explanations (Advanced Statistics screen). */
export const ATTR_INFO: Record<string, { label: string; short: string; pct?: boolean; icon: string; explain: string }> = {
  hp: { label: "HP", short: "HP", icon: "shield", explain: "Health. At 0 you are defeated." },
  atk: { label: "Attack", short: "ATK", icon: "sword", explain: "Scales basic attacks and most techniques." },
  def: { label: "Defense", short: "DEF", icon: "shield", explain: "Reduces incoming damage; armor penetration ignores part of it." },
  spd: { label: "Speed", short: "SPD", icon: "fast", explain: "Higher speed acts first and more often." },
  crit: { label: "Crit Chance", short: "Crit", pct: true, icon: "sparkle", explain: "Chance for a hit to be critical, dealing Crit Damage instead of 100%." },
  crit_dmg: { label: "Crit Damage", short: "Crit DMG", pct: true, icon: "bolt", explain: "Damage multiplier of critical hits." },
  acc: { label: "Accuracy", short: "ACC", pct: true, icon: "compare", explain: "Hit chance against the target's evasion." },
  eva: { label: "Evasion", short: "EVA", pct: true, icon: "motion", explain: "Chance to dodge an attack entirely." },
  sp_power: { label: "Spiritual Power", short: "SP Power", icon: "qi", explain: "Scales technique damage, healing and shields." },
  sp_energy: { label: "Spirit Energy", short: "SP", icon: "bolt", explain: "Pool spent on active techniques." },
  armor_pen: { label: "Armor Pen.", short: "Pen", pct: true, icon: "sword", explain: "Ignores this share of the target's Defense." },
  life_steal: { label: "Life Steal", short: "LS", pct: true, icon: "qi", explain: "Heals you for this share of damage dealt." },
  heal_bonus: { label: "Healing Bonus", short: "Heal", pct: true, icon: "lotus", explain: "Increases healing received and done." },
  shield_str: { label: "Shield Strength", short: "Shield", pct: true, icon: "shield", explain: "Increases shields you create." },
  cdr: { label: "Cooldown Red.", short: "CDR", pct: true, icon: "clock", explain: "Shortens technique cooldowns." },
  dmg_red: { label: "Damage Red.", short: "DR", pct: true, icon: "shield", explain: "Reduces all damage taken." },
  status_res: { label: "Status Resist", short: "Res", pct: true, icon: "shield", explain: "Chance to resist debuffs and control." },
};
export const ELEMENT_LABEL: Record<string, string> = { wood: "Wood", fire: "Fire", earth: "Earth", metal: "Metal", water: "Water" };
export function attrLabel(k: string): string {
  if (ATTR_INFO[k]) return ATTR_INFO[k]!.label;
  const [kind, el] = k.split(".");
  return `${ELEMENT_LABEL[el!] ?? el} ${kind === "elem_dmg" ? "Damage" : "Resist"}`;
}
export function attrValue(k: string, v: number): string {
  const pct = ATTR_INFO[k]?.pct || k.startsWith("elem_");
  return pct ? `${fmt.num(v, 1)}%` : fmt.int(v);
}

/** Round portrait of an NPC (or an icon fallback). */
export function npcAvatar(app: App, id: string | undefined, size = 40) {
  const art = id ? app.content.artAny(id, "portrait", "full_body") : undefined;
  return h("span", { class: "avatar", style: { width: `${size}px`, height: `${size}px`, backgroundImage: art ? app.img(art) : undefined } }, !art && icon(id?.startsWith("sectloc.") ? "temple" : "person", Math.round(size * 0.5)));
}

/** "−/qty/+" stepper. */
export function stepper(value: number, min: number, max: number, onChange: (v: number) => void) {
  return h("div", { class: "stepper" },
    h("button", { class: "icon-btn", disabled: value <= min, onClick: () => onChange(Math.max(min, value - 1)), "aria-label": "less" }, "−"),
    h("b", { class: "tnum" }, String(value)),
    h("button", { class: "icon-btn", disabled: value >= max, onClick: () => onChange(Math.min(max, value + 1)), "aria-label": "more" }, "+"));
}

/** Material requirement row: tile name, have/need (red when short). */
export function needRow(app: App, id: string, need: number, have: number) {
  const def = app.content.find<any>(id);
  const art = app.content.art(id, "icon");
  return h("div", { class: ["need", have < need && "short"] },
    h("span", { class: ["tile-mini", `r-${def?.rarity ?? "common"}`], style: { backgroundImage: art ? app.img(art) : undefined } }, !art && icon("sparkle", 14)),
    h("span", { class: "grow" }, def?.name ?? id),
    h("b", { class: "tnum" }, `${fmt.int(have)} / ${fmt.int(need)}`));
}

/** Primary call-to-action button (gold), with an optional second line. */
export function cta(label: string, sub: string | null, onClick: () => void, opts: { disabled?: boolean; cls?: string } = {}) {
  return h("button", { class: ["btn gold cta", opts.cls], disabled: !!opts.disabled, onClick }, h("span", { class: "cta-l" }, label), sub && h("span", { class: "cta-s" }, sub));
}

/** Colour class for a recommended power against yours: green = ready, gold = close (≥ 80%), red = too strong. */
export function powerTone(cp: number, rec: number): "jade" | "gold" | "red" {
  return cp >= rec ? "jade" : cp >= rec * 0.8 ? "gold" : "red";
}

/** Ask before an action that cannot be undone. */
export function confirmModal(app: App, o: { title: string; body: string; ok: string; danger?: boolean }, onOk: () => void) {
  app.router.open({ id: "confirm", kind: "modal", render: (close) => h("div", { class: "center" },
    h("div", { class: "m-title" }, o.title), h("p", { class: "dim", style: { margin: "6px 0 14px" } }, o.body),
    h("div", { class: "grid-2" },
      h("button", { class: "btn", onClick: close }, "Cancel"),
      h("button", { class: ["btn", o.danger ? "danger" : "gold"], onClick: () => { close(); onOk(); } }, o.ok))) });
}

/**
 * Grid of fixed-size pages (rules.inventory.page_size slots each), only as many pages as the items need. Free room
 * shows as at most one row of dashed slots after the last item (the capacity meter above gives the full count), and
 * the page tabs only appear when there is more than one page. `capacity` = total slots, so no placeholder is drawn
 * beyond it.
 */
export function pagedGrid(app: App, tiles: Child[], capacity: number, page: number, onPage: (p: number) => void, opts: { cols?: number } = {}) {
  const size = app.content.rules.inventory.page_size, cols = opts.cols ?? 6;
  const pages = Math.max(1, Math.ceil(tiles.length / size));
  const cur = Math.min(page, pages - 1);
  const slice = tiles.slice(cur * size, cur * size + size);
  const free = Math.max(0, capacity - tiles.length);
  const room = cur === pages - 1 ? Math.min(free, size - slice.length, (cols - (slice.length % cols)) % cols || (slice.length ? 0 : cols)) : 0;
  return h("div", { class: "paged" },
    h("div", { class: "inv-grid", style: { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } }, slice, Array.from({ length: room }, () => h("div", { class: "slot-empty-ph", "aria-hidden": "true" }))),
    pages > 1 && h("div", { class: "pager" },
      h("button", { class: "icon-btn", disabled: cur === 0, "aria-label": "Previous page", onClick: () => onPage(cur - 1) }, icon("back", 14)),
      h("div", { class: "pager-nums" }, Array.from({ length: pages }, (_, i) => h("button", { class: ["pg", i === cur && "on"], onClick: () => onPage(i) }, String(i + 1)))),
      h("button", { class: "icon-btn", disabled: cur >= pages - 1, "aria-label": "Next page", onClick: () => onPage(cur + 1) }, icon("chevron", 14))));
}

/** "used / capacity slots" meter. */
export function capacityMeter(used: number, cap: number, label: string) {
  const full = used >= cap;
  return h("div", { class: ["cap-meter", full && "full"] },
    h("span", { class: "muted" }, label), bar(cap ? used / cap : 0, { cls: full ? "thin pink" : "thin" }), h("b", { class: ["tnum", full && "red-t"] }, `${used} / ${cap}`));
}
