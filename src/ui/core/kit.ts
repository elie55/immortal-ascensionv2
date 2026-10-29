/** Shared UI components built from the mockups' vocabulary. */
import { h, fmt, type Child } from "./dom.ts";
import { icon } from "./icons.ts";
import type { App } from "../../app.ts";

/** Top bar: portrait, name, sect/rank line, spirit stones. */
export function header(app: App, opts: { sub?: string } = {}) {
  const s = app.game.state;
  const rank = app.content.get<any>(s.character.rank);
  return h("header", { class: "hdr glass" },
    h("div", { class: "avatar", style: { backgroundImage: app.img(app.content.artAny(s.character.npc, "portrait", "full_body")) } }),
    h("div", { class: "who" }, h("div", { class: "name" }, s.character.name), h("div", { class: "sub" }, opts.sub ?? `Azure Cloud Sect · ${rank.name}`)),
    stones(s.resources.spirit_stones));
}

export function stones(n: number) {
  return h("div", { class: "stones" }, icon("gem", 22), h("div", null, h("span", { class: "lbl" }, "Spirit Stones"), h("span", { class: "val tnum" }, fmt.int(n))));
}

/** Sub-header with a back chip, title (+ Chinese), subtitle and optional trailing element. */
export function subbar(o: { title: string; cn?: string; sub?: string; backTo?: string; onBack?: () => void; end?: Child }) {
  return h("div", { class: "subbar glass" },
    o.onBack && h("button", { class: "back", onClick: o.onBack, "aria-label": "Back" }, icon("back", 14), h("span", null, "Back to", h("b", null, o.backTo ?? "Back"))),
    h("div", { class: "grow" }, h("div", { class: "t" }, o.title, o.cn && h("span", { class: "cn" }, o.cn)), o.sub && h("div", { class: "s" }, o.sub)),
    o.end && h("div", { class: "end" }, o.end));
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
export function tile(o: { rarity: string; art?: string; fallbackIcon?: string; qty?: number; plus?: number; name?: string; selected?: boolean; isNew?: boolean; onClick?: () => void; img: (f?: string) => string }) {
  const t = h("button", { class: ["tile", `r-${o.rarity}`, o.selected && "sel"], onClick: o.onClick, "aria-label": o.name ?? "item" },
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
