/**
 * Spirit Forge (mockups "forge_refine", "forge_reforge", "forge_awaken", "forge_craft"): tab row
 * (Enhance · Refine · Reforge · Awaken · Craft), Master Gu's advice line, a gear chooser (equipped first), the
 * selected piece with its attributes, the tab's preview, the cost block and the action button.
 */
import { h, fmt } from "../core/dom.ts";
import { icon } from "../core/icons.ts";
import { header, subbar, section, needRow, cta, stepper, RARITY_LABEL, attrLabel, attrValue, npcAvatar } from "../core/kit.ts";
import type { Screen } from "../core/router.ts";
import type { App } from "../../app.ts";
import type { GearInstance } from "../../engine/state.ts";
import { EQUIP_SLOTS, equippedSlotOf, itemCount, gearStats, gearPlace } from "../../engine/inventory.ts";
import { enhance, enhanceMany, enhanceCost, refine, refineCost, reforge, reforgeCost, awaken, awakenInfo, craftGear, forgeStatus, studyBlueprint } from "../../engine/crafting.ts";
import { gearTile, gearName, gearCp, gearArt } from "./items.ts";
import { SLOT_ICON } from "../core/icons.ts";
import { rewardsLine } from "./adventure.ts";

type Tab = "enhance" | "refine" | "reforge" | "awaken" | "craft";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "enhance", label: "Enhance", icon: "sparkle" }, { id: "refine", label: "Refine", icon: "gem" }, { id: "reforge", label: "Reforge", icon: "update" },
  { id: "awaken", label: "Awaken", icon: "bolt" }, { id: "craft", label: "Craft", icon: "sword" },
];
const GU: Record<Tab, string> = {
  enhance: "Heat, hammer, patience. Past +9 the steel starts to argue back.",
  refine: "Refining doesn't add power. It makes what's already there the best it can be.",
  reforge: "Lock what you like. The rest goes back in the fire.",
  awaken: "Some blades sleep. Feed them the right ore and they wake.",
  craft: "Bring me the materials and the pattern, and I'll show you how it's done.",
};

let enhTarget = 10;

export function forgeScreen(app: App, backTo: string, start: Tab = "enhance"): Screen {
  let tab: Tab = start;
  let uid: number | undefined;
  let locks: number[] = [];
  let recipe: string | undefined;
  return {
    id: "forge", bg: () => app.content.art("sectloc.spirit_forge", "background"),
    render: () => {
      const s = app.game.state, c = app.content;
      const owned = Object.keys(s.inventory.gear).map(Number).filter((u) => gearPlace(s, u) !== "depot" && gearPlace(s, u) !== "pouch");
      const equipped = EQUIP_SLOTS.map((k) => s.equipped[k]).filter((u): u is number => u !== undefined);
      const bag = owned.filter((u) => !equipped.includes(u)).sort((a, b) => gearCp(app, s.inventory.gear[b]!) - gearCp(app, s.inventory.gear[a]!));
      if (uid === undefined || !s.inventory.gear[uid]) { uid = equipped[0] ?? bag[0]; locks = []; }
      const g = uid !== undefined ? s.inventory.gear[uid] : undefined;
      return [
        header(app),
        subbar({ help: { app, key: "forge" }, title: "Spirit Forge", cn: "灵器坊", sub: `Master Smith Gu · ${TABS.find((t) => t.id === tab)!.label}`, backTo, onBack: () => app.router.back() }),
        h("div", { class: "forge-tabs" }, TABS.map((t) => h("button", { class: ["ftab", t.id === tab && "on"], onClick: () => { tab = t.id; locks = []; app.router.refresh(); } }, app.ui("ui.forge", t.id) ? h("span", { class: "ftab-art", style: { backgroundImage: app.img(app.ui("ui.forge", t.id)) } }) : icon(t.icon, 18), h("span", null, t.label)))),
        tab === "craft" ? craftPanel(app, () => recipe, (r) => { recipe = r; app.router.refresh(); }) : [
          g ? forgeHero(app, g, tab) : h("div", { class: "glass panel center muted" }, "You have no gear to work on."),
          owned.length > 0 && h("div", { class: "glass forge-strip" },
            h("div", { class: "gear-strip" }, [...equipped, ...bag].map((u) => h("div", { class: "gs-cell" }, gearTile(app, u, { selected: u === uid, onClick: () => { uid = u; locks = []; app.router.refresh(); } }), equippedSlotOf(s, u) && h("span", { class: "gs-eq", title: "Equipped" }, "E")))),
            h("div", { class: "fs-count muted" }, `${owned.length} piece${owned.length === 1 ? "" : "s"} · equipped first`)),
          g && tabPanel(app, tab, uid!, g, locks, (l) => { locks = l; app.router.refresh(); }),
        ],
      ];
    },
  };
}

/** Last forge result, drawn as a burst over the hero piece (sparks on success, cracks and smoke on failure). */
let fx: { ok: boolean; at: number } | null = null;
function flash(app: App, ok: boolean) { const at = Date.now(); fx = { ok, at }; setTimeout(() => { if (fx?.at === at) { fx = null; app.router.refresh(); } }, 1500); }

/** The piece being worked, large on the glowing anvil plate, with Master Gu's word for the tab (UI review S1). */
function forgeHero(app: App, g: GearInstance, tab: Tab) {
  const c = app.content;
  const base = c.get<any>(g.base);
  const st = gearStats(c, g);
  const art = gearArt(app, g);
  return h("div", { class: `glass forge-hero hero-frame r-${g.rarity}` },
    h("div", { class: "fh-top" },
      h("div", { class: "fh-anvil" },
        h("div", { class: "fh-plate" }),
        h("div", { class: "fh-piece", style: { backgroundImage: art ? app.img(art) : undefined } }, !art && icon(SLOT_ICON[base.slot] ?? "sword", 46)),
        g.enhance > 0 && h("span", { class: "fh-plus" }, `+${g.enhance}`),
        fx && h("div", { class: ["forge-fx", fx.ok ? "ok" : "fail"], dataset: { key: `fx${fx.at}` }, "aria-hidden": "true" }, Array.from({ length: 10 }, (_, i) => h("i", { style: { "--i": String(i) } as any })))),
      h("div", { class: "fh-info" },
        h("div", { class: `fh-rar rt-${g.rarity}` }, `${RARITY_LABEL[g.rarity]} · ${base.slot}`),
        h("div", { class: `fh-name rt-${g.rarity}` }, gearName(app, g), g.enhance > 0 && h("span", { class: "gold-t" }, ` +${g.enhance}`)),
        h("div", { class: "fh-main" }, h("span", null, attrLabel(g.main.stat)), h("b", null, attrValue(g.main.stat, st[g.main.stat] ?? 0))),
        h("div", { class: "fh-tags" }, h("span", { class: "tag" }, `Lv ${g.ilvl}`), g.awakened && h("span", { class: "tag gold" }, "Awakened"), base.set && h("span", { class: "tag jade" }, c.get<any>(base.set).name)),
        h("div", { class: "fh-cp" }, icon("cp", 16), h("span", null, "CP"), h("b", null, fmt.int(gearCp(app, g)))))),
    h("div", { class: "fh-gu" }, npcAvatar(app, "npc.master_gu", 26), h("span", null, `“${GU[tab]}”`)));
}

function costRows(app: App, stones: number, items: { id: string; qty: number }[]) {
  const s = app.game.state;
  return h("div", { class: "rows" }, items.map((q) => needRow(app, q.id, q.qty, itemCount(s, q.id))),
    h("div", { class: ["need", s.resources.spirit_stones < stones && "short"] }, h("span", { class: "tile-mini stone-mini" }, icon("gem", 16)), h("span", { class: "grow" }, "Spirit Stones"), h("b", { class: "tnum" }, `${fmt.int(s.resources.spirit_stones)} / ${fmt.int(stones)}`)));
}
/** One panel per tab: what changes, then the cost under an ornament (was two separate cards). */
function forgePanel(app: App, title: string, hint: string | null, preview: any, stones: number, items: { id: string; qty: number }[], costNote?: string) {
  return h("section", { class: "glass panel forge-panel" },
    h("div", { class: "sec-h" }, h("h3", null, title), hint ? h("span", { class: "hint" }, hint) : null),
    preview,
    h("div", { class: "orn-div" }),
    h("div", { class: "sec-h" }, h("h3", null, "Cost"), costNote ? h("span", { class: "hint" }, costNote) : null),
    costRows(app, stones, items));
}

const affordable = (app: App, stones: number, items: { id: string; qty: number }[]) => app.game.state.resources.spirit_stones >= stones && items.every((q) => itemCount(app.game.state, q.id) >= q.qty);
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** "Attack  10 → 11  +1" with the gain in jade. */
function deltaRow(label: string, from: number, to: number, f: (v: number) => string) {
  const d = to - from;
  return h("div", { class: "cmp-row" }, h("span", { class: "grow" }, label), h("span", { class: "tnum dim" }, f(from)), h("span", { class: "cr-arrow" }, icon("chevron", 10)), h("b", { class: "tnum" }, f(to)), Math.abs(d) > 1e-9 && h("span", { class: ["cr-d tnum", d > 0 ? "up" : "down"] }, `${d > 0 ? "+" : "−"}${f(Math.abs(d))}`));
}
function chanceRow(chance: number, note: string | null) {
  return h("div", { class: "chance-row" },
    h("div", { class: "row between" }, h("span", { class: "muted" }, "Success chance"), h("b", { class: ["tnum", chance < 1 ? "gold-t" : "jade-t"] }, pct(chance))),
    h("div", { class: "bar thin gold" }, h("i", { style: { width: `${Math.round(chance * 100)}%` } })),
    note && h("div", { class: "muted" }, note));
}

function tabPanel(app: App, tab: Tab, uid: number, g: GearInstance, locks: number[], setLocks: (l: number[]) => void) {
  const c = app.content;
  const run = (label: string, fn: () => any, ok: (r: any) => [string, "good" | "bad" | "info"]) => { const r = app.game.run(label, app.now(), fn); if (!r.ok) app.router.toast(r.reason, "bad"); else { const [m, k] = ok(r); flash(app, k !== "bad"); app.router.toast(m, k); } };
  if (tab === "enhance") {
    const cost = enhanceCost(c, g);
    if (!cost) return h("div", { class: "glass panel center gold-t" }, "✦ Maximum enhancement reached (+15)");
    const levels = c.singletons.enhancement.levels;
    const cur = g.enhance ? levels[g.enhance - 1]!.stat_mult : 1, next = levels[g.enhance]!.stat_mult;
    return [
      forgePanel(app, "Enhancement", `+${g.enhance} → +${g.enhance + 1}`, [
        h("div", { class: "rows" }, [g.main, ...g.affixes].map((a) => deltaRow(attrLabel(a.stat), a.value * cur, a.value * next, (v) => attrValue(a.stat, v)))),
        chanceRow(cost.chance, cost.chance < 1 ? "On failure the materials are spent; the level is kept." : null)], cost.stones, cost.items),
      // several attempts in one press: ×5 (stops at the first failure) or up to a target level (keeps going)
      (() => {
        const target = Math.min(15, Math.max(enhTarget, g.enhance + 1));
        const many = (times: number, stopOnFail: boolean, label: string, until = 15) => run("enhance", () => enhanceMany(app.game.state, c, uid, times, stopOnFail, until), (r) => [`${label}: ${r.successes}/${r.attempts} succeeded · now +${r.level} · ${fmt.int(r.stones)} stones spent`, r.successes ? "good" : "bad"]);
        return h("div", { class: "glass panel", style: { padding: "8px 10px" } },
          h("div", { class: "row between" }, h("span", { class: "muted" }, "Several attempts at once"), h("span", { class: "muted" }, "materials are spent on failures too")),
          h("div", { class: "row between", style: { marginTop: "6px", gap: "8px", flexWrap: "wrap" } },
            h("button", { class: "btn sm", onClick: () => many(5, true, "×5") }, "Enhance ×5", h("span", { class: "cta-s" }, "stops on failure")),
            h("div", { class: "row", style: { gap: "6px", flexWrap: "wrap" } }, h("span", { class: "muted" }, "to"), stepper(target, g.enhance + 1, 15, (v) => { enhTarget = v; app.router.refresh(); }), h("button", { class: "btn sm gold", onClick: () => many(60, false, `To +${target}`, target) }, `+${target}`))));
      })(),
      cta(`Enhance to +${g.enhance + 1}`, `${pct(cost.chance)} success`, () => run("enhance", () => enhance(app.game.state, c, uid), (r) => r.success ? [`Enhanced to +${r.level}!`, "good"] : ["The steel resisted. Try again.", "bad"]), { disabled: !affordable(app, cost.stones, cost.items) }),
    ];
  }
  if (tab === "refine") {
    const cost = refineCost(c, g);
    if ("blocked" in cost) return h("div", { class: "glass panel center muted" }, icon("lock", 18), h("div", null, cost.blocked));
    const rr = c.gearRules.rarity[cost.to as keyof typeof c.gearRules.rarity];
    return [
      forgePanel(app, "Refinement", "Rarity up · rolls keep their quality", [
        h("div", { class: "refine-arrow" }, h("span", { class: `rar-seal r-${g.rarity}` }, RARITY_LABEL[g.rarity]), h("span", { class: "ra-arrow" }, icon("chevron", 16)), h("span", { class: `rar-seal r-${cost.to}` }, RARITY_LABEL[cost.to])),
        h("div", { class: "muted center" }, `${rr ? `${rr.affixes} secondary attributes · ` : ""}all stats rise with the rarity. Enhancement is kept.`),
        chanceRow(cost.chance, null)], cost.stones, cost.items, "Spent even on failure"),
      cta("Refine", `${pct(cost.chance)} chance · ${RARITY_LABEL[cost.to]}`, () => run("refine", () => refine(app.game.state, c, uid), (r) => r.success ? [`Refined to ${RARITY_LABEL[r.rarity]}!`, "good"] : ["The refinement failed.", "bad"]), { disabled: !affordable(app, cost.stones, cost.items) }),
    ];
  }
  if (tab === "reforge") {
    if (!g.affixes.length) {
      // a real empty state: why, what to do, and the way there (review 31)
      const withAffixes = Object.entries(app.game.state.inventory.gear).filter(([, x]) => x.affixes.length).map(([u]) => Number(u));
      return h("div", { class: "glass panel empty-state" },
        h("span", { class: "es-ico" }, icon("sparkle", 26)),
        h("div", { class: "es-t" }, "Nothing to reforge on this piece"),
        h("div", { class: "dim" }, "Secondary attributes come with rarity: refine it to Uncommon to gain its first one, then reforge it here."),
        h("div", { class: "row", style: { gap: "8px", justifyContent: "center", marginTop: "10px" } },
          h("button", { class: "btn jade sm", onClick: () => app.router.replace(forgeScreen(app, "Sect", "refine")) }, "Go to Refine"),
          withAffixes.length > 0 && h("span", { class: "muted" }, `${withAffixes.length} of your pieces can be reforged`)));
    }
    const cost = reforgeCost(c, g, locks);
    return [
      forgePanel(app, "Secondary stats", `Lock up to ${cost.maxLocks}`,
        h("div", { class: "rows" }, g.affixes.map((a, i) => {
          const on = locks.includes(i);
          return h("button", { class: ["setrow", on && "on"], onClick: () => setLocks(on ? locks.filter((x) => x !== i) : locks.length < cost.maxLocks ? [...locks, i] : locks) },
            icon(on ? "lock" : "unlock", 16), h("div", { class: "grow", style: { textAlign: "left" } }, h("div", { class: "lbl" }, attrLabel(a.stat)), h("div", { class: "desc" }, `roll ${Math.round(a.roll * 100)}%`)),
            h("b", { class: "tnum" }, `+${attrValue(a.stat, a.value)}`));
        })), cost.stones, cost.items, locks.length ? `${locks.length} locked` : undefined),
      cta("Reforge", `${g.affixes.length - locks.length} attribute${g.affixes.length - locks.length === 1 ? "" : "s"} rerolled`, () => run("reforge", () => reforge(app.game.state, c, uid, locks), () => ["Reforged.", "good"]), { disabled: !affordable(app, cost.stones, cost.items) }),
    ];
  }
  // awaken
  const a = awakenInfo(c, g);
  if (!a) return h("div", { class: "glass panel center muted" }, "This piece has no dormant power. Unique and set pieces from bosses can often be awakened.");
  if (g.awakened) return h("div", { class: "glass panel center gold-t" }, "✦ Awakened: ", a.effect.description);
  return [
    forgePanel(app, "Awakening", null, h("div", { class: "awaken-fx" }, icon("bolt", 18), h("div", null, h("div", { class: "lbl gold-t" }, "Dormant power"), h("div", { class: "dim" }, a.effect.description))), a.cost_stones, a.materials),
    cta("Awaken", "Unlocks the special effect permanently", () => run("awaken", () => awaken(app.game.state, c, uid), () => ["Your gear awakens!", "good"]), { disabled: !affordable(app, a.cost_stones, a.materials) }),
  ];
}

function craftPanel(app: App, get: () => string | undefined, set: (r: string) => void) {
  const s = app.game.state, c = app.content;
  const recipes = c.byPrefix<any>("forge").map((r) => ({ r, st: forgeStatus(s, c, r) })).sort((a, b) => Number(b.st.unlocked) - Number(a.st.unlocked) || a.r.output.ilvl - b.r.output.ilvl);
  const sel = recipes.find((x) => x.r.id === get()) ?? recipes.find((x) => x.st.unlocked) ?? recipes[0]!;
  const blueprints = Object.keys(s.inventory.stacks).filter((id) => id.startsWith("blueprint.") && (s.inventory.stacks[id] ?? 0) > 0);
  const r = sel.r;
  const base = c.get<any>(r.output.base);
  return [
    blueprints.length > 0 && section("Blueprints", null, h("div", { class: "rows" }, blueprints.map((id) => h("div", { class: "setrow" }, icon("map", 16), h("div", { class: "grow" }, h("div", { class: "lbl" }, c.get<any>(id).name), h("div", { class: "desc" }, `Teaches ${c.get<any>(c.get<any>(id).unlocks).name}`)),
      h("button", { class: "btn sm jade", onClick: () => { const res = app.game.run("study", app.now(), (st, cc) => studyBlueprint(st, cc, id)); app.router.toast(res.ok ? "Recipe learned" : res.reason, res.ok ? "good" : "bad"); } }, "Study"))))),
    section("Recipes", h("span", null, `${recipes.filter((x) => x.st.unlocked).length} of ${recipes.length} known`),
      h("div", { class: "recipe-grid" }, recipes.map((x) => {
        const art = c.get<any>(x.r.output.base).rarities?.[x.r.output.rarity]?.art?.icon;
        const file = art && art.status !== "planned" ? art.file : undefined;
        return h("button", { class: ["recipe-card", `r-${x.r.output.rarity}`, x.r.id === r.id && "sel", !x.st.unlocked && "sealed"], onClick: () => set(x.r.id), "aria-label": c.get<any>(x.r.output.base).name },
          h("span", { class: "rc-art", style: { backgroundImage: file ? app.img(file) : undefined } }, !file && icon("sword", 22)),
          !x.st.unlocked && h("span", { class: "rc-seal" }, icon("lock", 12)),
          x.st.unlocked && x.st.affordable && h("span", { class: "rc-ready" }, "Ready"),
          h("span", { class: `rc-name rt-${x.r.output.rarity}` }, c.get<any>(x.r.output.base).name),
          h("span", { class: "rc-sub" }, x.st.unlocked ? `${RARITY_LABEL[x.r.output.rarity]} · Lv ${x.r.output.ilvl}` : x.st.reason));
      }))),
    (() => {
      const art = base.rarities?.[r.output.rarity]?.art?.icon;
      const file = art && art.status !== "planned" ? art.file : undefined;
      return h("div", { class: `glass forge-hero hero-frame r-${r.output.rarity}` },
        h("div", { class: "fh-top" },
          h("div", { class: "fh-anvil" }, h("div", { class: "fh-plate" }), h("div", { class: ["fh-piece", !sel.st.unlocked && "sealed"], style: { backgroundImage: file ? app.img(file) : undefined } }, !file && icon("sword", 46))),
          h("div", { class: "fh-info" },
            h("div", { class: `fh-rar rt-${r.output.rarity}` }, `${RARITY_LABEL[r.output.rarity]} · Lv ${r.output.ilvl}`),
            h("div", { class: `fh-name rt-${r.output.rarity}` }, base.name),
            h("div", { class: "fh-desc dim" }, base.description))),
        h("div", { class: "orn-div" }),
        h("div", { class: "sec-h" }, h("h3", null, "Materials"), h("span", { class: "hint" }, sel.st.unlocked ? "Stats are rolled when forged" : sel.st.reason)),
        h("div", { class: "rows" }, r.ingredients.map((q: any) => needRow(app, q.id, q.qty, itemCount(s, q.id))),
          h("div", { class: ["need", s.resources.spirit_stones < r.cost_stones && "short"] }, h("span", { class: "tile-mini stone-mini" }, icon("gem", 16)), h("span", { class: "grow" }, "Spirit Stones"), h("b", { class: "tnum" }, `${fmt.int(s.resources.spirit_stones)} / ${fmt.int(r.cost_stones)}`))));
    })(),
    cta("Craft", sel.st.unlocked ? "Stats are rolled when forged" : sel.st.reason ?? "Locked", () => {
      const res = app.game.run("craft", app.now(), (st, cc) => craftGear(st, cc, r.id));
      if (res.ok) flash(app, true);
      app.router.toast(res.ok ? `Forged ${base.name}!` : res.reason, res.ok ? "good" : "bad");
    }, { disabled: !sel.st.unlocked || !sel.st.affordable }),
  ];
}

export { rewardsLine };
