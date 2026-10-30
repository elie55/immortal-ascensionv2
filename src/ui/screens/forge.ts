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
import { gearTile, gearName, gearCp } from "./items.ts";
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
        h("div", { class: "forge-tabs" }, TABS.map((t) => h("button", { class: ["glass ftab", t.id === tab && "on"], onClick: () => { tab = t.id; locks = []; app.router.refresh(); } }, app.ui("ui.forge", t.id) ? h("span", { class: "ftab-art", style: { backgroundImage: app.img(app.ui("ui.forge", t.id)) } }) : icon(t.icon, 18), h("span", null, t.label)))),
        h("div", { class: "glass gu-line" }, npcAvatar(app, "npc.master_gu", 28), h("div", null, h("div", { class: "muted" }, "Master Gu"), h("div", { class: "dim" }, `“${GU[tab]}”`))),
        tab === "craft" ? craftPanel(app, () => recipe, (r) => { recipe = r; app.router.refresh(); }) : [
          section("Choose gear", h("span", null, `${owned.length} pieces`),
            h("div", { class: "gear-strip" }, [...equipped, ...bag].map((u) => h("div", { class: "gs-cell" }, gearTile(app, u, { selected: u === uid, onClick: () => { uid = u; locks = []; app.router.refresh(); } }), equippedSlotOf(s, u) && h("span", { class: "gs-eq" }, "E"))))),
          g ? [pieceCard(app, g), tabPanel(app, tab, uid!, g, locks, (l) => { locks = l; app.router.refresh(); })] : h("div", { class: "glass panel center muted" }, "You have no gear to work on."),
        ],
      ];
    },
  };
}

function pieceCard(app: App, g: GearInstance) {
  const c = app.content;
  const base = c.get<any>(g.base);
  const st = gearStats(c, g);
  return h("div", { class: "glass panel piece" },
    h("div", { class: "row" },
      h("div", { style: { width: "58px", flex: "none" } }, gearTile(app, Number(Object.entries(app.game.state.inventory.gear).find(([, x]) => x === g)?.[0]))),
      h("div", { class: "grow" },
        h("div", { class: `item-name rt-${g.rarity}` }, gearName(app, g), g.enhance > 0 && h("span", { class: "gold-t" }, ` +${g.enhance}`)),
        h("div", { class: "row", style: { gap: "5px", flexWrap: "wrap" } }, h("span", { class: `tag rt-${g.rarity}` }, RARITY_LABEL[g.rarity]), h("span", { class: "tag" }, base.slot), h("span", { class: "tag" }, `Lv ${g.ilvl}`), g.awakened && h("span", { class: "tag gold" }, "Awakened"), base.set && h("span", { class: "tag jade" }, c.get<any>(base.set).name))),
      h("div", { class: "center" }, h("div", { class: "muted up" }, "CP"), h("b", { class: "gold-t tnum" }, fmt.int(gearCp(app, g))))),
    h("dl", { class: "kv", style: { marginTop: "8px" } }, h("dt", null, attrLabel(g.main.stat)), h("dd", null, attrValue(g.main.stat, st[g.main.stat] ?? 0))));
}

function costBlock(app: App, stones: number, items: { id: string; qty: number }[], note?: string) {
  const s = app.game.state;
  return section("Cost", note ?? null,
    h("div", { class: "rows" }, items.map((q) => needRow(app, q.id, q.qty, itemCount(s, q.id))),
      h("div", { class: ["need", s.resources.spirit_stones < stones && "short"] }, h("span", { class: "tile-mini stone-mini" }, icon("gem", 16)), h("span", { class: "grow" }, "Spirit Stones"), h("b", { class: "tnum" }, `${fmt.int(s.resources.spirit_stones)} / ${fmt.int(stones)}`))));
}

const affordable = (app: App, stones: number, items: { id: string; qty: number }[]) => app.game.state.resources.spirit_stones >= stones && items.every((q) => itemCount(app.game.state, q.id) >= q.qty);
const pct = (x: number) => `${Math.round(x * 100)}%`;

function tabPanel(app: App, tab: Tab, uid: number, g: GearInstance, locks: number[], setLocks: (l: number[]) => void) {
  const c = app.content;
  const run = (label: string, fn: () => any, ok: (r: any) => [string, "good" | "bad" | "info"]) => { const r = app.game.run(label, app.now(), fn); if (!r.ok) app.router.toast(r.reason, "bad"); else { const [m, k] = ok(r); app.router.toast(m, k); } };
  if (tab === "enhance") {
    const cost = enhanceCost(c, g);
    if (!cost) return h("div", { class: "glass panel center gold-t" }, "✦ Maximum enhancement reached (+15)");
    const levels = c.singletons.enhancement.levels;
    const cur = g.enhance ? levels[g.enhance - 1]!.stat_mult : 1, next = levels[g.enhance]!.stat_mult;
    return [
      section("Enhancement", h("span", null, `+${g.enhance} → +${g.enhance + 1}`),
        h("div", { class: "rows" }, [g.main, ...g.affixes].map((a) => h("div", { class: "cmp-row" }, h("span", { class: "grow" }, attrLabel(a.stat)), h("span", null, attrValue(a.stat, a.value * cur)), icon("chevron", 10), h("b", { class: "jade-t" }, attrValue(a.stat, a.value * next))))),
        h("div", { class: "row between", style: { marginTop: "8px" } }, h("span", { class: "muted" }, "Success chance"), h("b", { class: cost.chance < 1 ? "gold-t" : "jade-t" }, pct(cost.chance))),
        cost.chance < 1 && h("div", { class: "muted" }, "On failure the materials are spent; the level is kept.")),
      costBlock(app, cost.stones, cost.items),
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
      section("Refinement", h("span", null, "Rarity up · rolls keep their quality"),
        h("div", { class: "refine-arrow" }, h("span", { class: `tag rt-${g.rarity}` }, RARITY_LABEL[g.rarity]), icon("chevron", 14), h("span", { class: `tag rt-${cost.to}` }, RARITY_LABEL[cost.to])),
        h("div", { class: "muted center" }, `${rr ? `${rr.affixes} secondary attributes · ` : ""}all stats rise with the rarity. Enhancement is kept.`),
        h("div", { class: "row between", style: { marginTop: "8px" } }, h("span", { class: "muted" }, "Success chance"), h("b", { class: "gold-t" }, pct(cost.chance)))),
      costBlock(app, cost.stones, cost.items, "Spent even on failure"),
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
      section("Secondary stats", h("span", null, `Lock up to ${cost.maxLocks}`),
        h("div", { class: "rows" }, g.affixes.map((a, i) => {
          const on = locks.includes(i);
          return h("button", { class: ["setrow", on && "on"], onClick: () => setLocks(on ? locks.filter((x) => x !== i) : locks.length < cost.maxLocks ? [...locks, i] : locks) },
            icon(on ? "lock" : "unlock", 16), h("div", { class: "grow", style: { textAlign: "left" } }, h("div", { class: "lbl" }, attrLabel(a.stat)), h("div", { class: "desc" }, `roll ${Math.round(a.roll * 100)}%`)),
            h("b", { class: "tnum" }, `+${attrValue(a.stat, a.value)}`));
        }))),
      costBlock(app, cost.stones, cost.items, locks.length ? `${locks.length} locked` : undefined),
      cta("Reforge", `${g.affixes.length - locks.length} attribute${g.affixes.length - locks.length === 1 ? "" : "s"} rerolled`, () => run("reforge", () => reforge(app.game.state, c, uid, locks), () => ["Reforged.", "good"]), { disabled: !affordable(app, cost.stones, cost.items) }),
    ];
  }
  // awaken
  const a = awakenInfo(c, g);
  if (!a) return h("div", { class: "glass panel center muted" }, "This piece has no dormant power. Unique and set pieces from bosses can often be awakened.");
  if (g.awakened) return h("div", { class: "glass panel center gold-t" }, "✦ Awakened: ", a.effect.description);
  return [
    section("Awakening", null, h("div", { class: "glass awaken-fx" }, icon("bolt", 18), h("div", null, h("div", { class: "lbl gold-t" }, "Dormant power"), h("div", { class: "dim" }, a.effect.description)))),
    costBlock(app, a.cost_stones, a.materials),
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
    section("Recipes", h("span", null, `${recipes.filter((x) => x.st.unlocked).length} known`),
      h("div", { class: "recipe-list" }, recipes.map((x) => h("button", { class: ["setrow", x.r.id === r.id && "on", !x.st.unlocked && "dim-card"], onClick: () => set(x.r.id) },
        h("span", { class: `tile-mini r-${x.r.output.rarity}` }, icon(x.st.unlocked ? "sword" : "lock", 14)),
        h("div", { class: "grow", style: { textAlign: "left" } }, h("div", { class: "lbl" }, c.get<any>(x.r.output.base).name), h("div", { class: "desc" }, x.st.unlocked ? `${RARITY_LABEL[x.r.output.rarity]} · Lv ${x.r.output.ilvl}` : x.st.reason)),
        x.st.affordable && h("span", { class: "tag jade" }, "Ready"))))),
    section(base.name, h("span", { class: `rt-${r.output.rarity}` }, `${RARITY_LABEL[r.output.rarity]} · Lv ${r.output.ilvl}`),
      h("div", { class: "dim", style: { fontSize: "calc(12.5rem / 15)", marginBottom: "6px" } }, base.description),
      h("div", { class: "rows" }, r.ingredients.map((q: any) => needRow(app, q.id, q.qty, itemCount(s, q.id))),
        h("div", { class: ["need", s.resources.spirit_stones < r.cost_stones && "short"] }, h("span", { class: "tile-mini stone-mini" }, icon("gem", 16)), h("span", { class: "grow" }, "Spirit Stones"), h("b", { class: "tnum" }, `${fmt.int(s.resources.spirit_stones)} / ${fmt.int(r.cost_stones)}`)))),
    cta("Craft", sel.st.unlocked ? "Stats are rolled when forged" : sel.st.reason ?? "Locked", () => {
      const res = app.game.run("craft", app.now(), (st, cc) => craftGear(st, cc, r.id));
      app.router.toast(res.ok ? `Forged ${base.name}!` : res.reason, res.ok ? "good" : "bad");
    }, { disabled: !sel.st.unlocked || !sel.st.affordable }),
  ];
}

export { rewardsLine };
