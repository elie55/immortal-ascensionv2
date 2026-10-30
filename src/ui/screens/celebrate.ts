/**
 * Celebration screens (mockups "fame_milestone", "victory"): a full-width card with a large title, the thing
 * that was earned (art in a glowing seal), what it gives, and one gold call to action that takes the player
 * there. They queue: when several things happen in the same tick (an achievement and a rank, say) they show
 * one after another, never on top of each other.
 */
import { h, type Child } from "../core/dom.ts";
import { icon } from "../core/icons.ts";
import type { App } from "../../app.ts";
import type { DomainEvent } from "../../engine/events.ts";
import { towerFloor } from "../../engine/delves.ts";
import { rewardsLine } from "./adventure.ts";
import { rankUpModal } from "./rank.ts";
import { openLocation } from "./sect.ts";
import { regionScreen } from "./adventure.ts";
import { dungeonHubScreen, realmScreen, towerScreen } from "./delves.ts";
import { beastsScreen } from "./beasts.ts";
import { arenaScreen } from "./tournament.ts";
import { questLogScreen, achievementsScreen } from "./quests.ts";
import { rootSheet } from "./character.ts";

export interface Celebration {
  /** Small label above the title ("Fame milestone", "Evolution"). */
  pre: string;
  title: string; cn?: string;
  /** One line under the title. */
  sub?: string;
  /** Art shown in the seal (asset file) or an icon name when there is no art. */
  art?: string; icon?: string;
  body?: Child;
  rewards?: any;
  cta?: { label: string; go: () => void };
  /** Pre-built overlay instead of the standard card (rank promotion). */
  overlay?: import("../core/router.ts").Overlay;
}

const queue: Celebration[] = [];
let showing = false;

export function celebrate(app: App, c: Celebration) { queue.push(c); pump(app); }
function pump(app: App) {
  if (showing || !queue.length) return;
  const c = queue.shift()!;
  showing = true;
  const done = () => { showing = false; pump(app); };
  if (c.overlay) { const o = c.overlay; app.router.open({ ...o, render: (close) => o.render(() => { close(); done(); }) }); return; }
  app.router.open({ id: "celebrate", kind: "modal", cls: "celebrate cele", dismissible: false, render: (close) => {
    const finish = () => { close(); done(); };
    return h("div", { class: "center cele-in" },
      h("div", { class: "cele-pre" }, "✦ ", c.pre, " ✦"),
      h("div", { class: "cele-title" }, c.title),
      c.cn && h("div", { class: "cn cele-cn" }, c.cn.split("").join(" ")),
      h("div", { class: ["cele-seal", c.art && "has-art"], style: c.art ? { backgroundImage: app.img(c.art) } : undefined }, !c.art && icon(c.icon ?? "sparkle", 54)),
      c.sub && h("div", { class: "dim cele-sub" }, c.sub),
      c.body,
      c.rewards && Object.keys(c.rewards).length > 0 && h("div", { class: "cele-rewards" }, h("div", { class: "muted up" }, "Rewards"), rewardsLine(app, c.rewards)),
      h("div", { class: "cele-actions" },
        c.cta && h("button", { class: "btn gold lg block", onClick: () => { finish(); c.cta!.go(); } }, c.cta.label),
        h("button", { class: ["btn block", !c.cta && "gold"], onClick: finish }, c.cta ? "Later" : "Continue")));
  } });
}

/** Turn progression events into celebrations. Returns true when the event was taken (no toast needed). */
export function celebrateEvent(app: App, e: DomainEvent): boolean {
  const c = app.content, s = app.game.state;
  const tab = (t: Parameters<typeof app.router.setTab>[0]) => { app.router.clearGlobal(); app.router.setTab(t); if (app.router.tab === t) app.router.store.update((st) => { st.stacks[t] = []; }); };
  switch (e.type) {
    case "rank_up": celebrate(app, { pre: "Promotion", title: c.get<any>(e.rank).name, overlay: rankUpModal(app, e.rank) }); return true;
    case "achievement": {
      const a = c.get<any>(e.id);
      celebrate(app, { pre: "Achievement unlocked", title: a.name, cn: a.name_cn, sub: a.description, art: c.art(a.id, "icon"), icon: "fame", rewards: a.rewards,
        cta: { label: "See achievements", go: () => { tab("cultivate"); app.router.push(questLogScreen(app, "Cultivate")); app.router.push(achievementsScreen(app)); } } });
      return true;
    }
    case "beast_evolved": {
      const b = s.beasts.owned[e.uid]; const def = c.get<any>(e.beast); const stage = def.stages.find((x: any) => x.key === e.stage);
      celebrate(app, { pre: "Evolution", title: b?.name ?? def.name, cn: def.name_cn, sub: `${stage?.name ?? e.stage} · new form, new strength`, art: c.artAny(e.beast, `battle_${e.stage}`, "icon"), icon: "paw",
        body: stage && h("div", { class: "row", style: { justifyContent: "center", gap: "6px", flexWrap: "wrap", margin: "6px 0" } }, Object.entries(stage.stats ?? {}).map(([k, v]) => h("span", { class: "tag jade" }, `${k.toUpperCase()} ${v}`)), stage.active && c.has(stage.active) && h("span", { class: "tag gold" }, c.get<any>(stage.active).name)),
        cta: { label: `See ${b?.name ?? def.name}`, go: () => { tab("cultivate"); app.router.push(beastsScreen(app, "Cultivate")); } } });
      return true;
    }
    case "tournament_won": {
      const t = c.get<any>(e.tournament);
      celebrate(app, { pre: "Champion", title: t.name, cn: t.name_cn, sub: "Every round won. The sect remembers your name.", icon: "fame", rewards: t.champion_rewards,
        cta: { label: "Proving Arena", go: () => { tab("sect"); app.router.push(arenaScreen(app, "Sect")); } } });
      return true;
    }
    case "tower_floor": {
      if (!e.best) return false;
      const d = c.get<any>(e.dungeon); const f = towerFloor(c, d, e.floor);
      if (!f.milestone) return false;
      celebrate(app, { pre: "Tower milestone", title: `Floor ${e.floor}`, cn: d.name_cn, sub: `${d.name} · ${f.boss ? "Warden defeated" : "a new height"}`, art: c.art(d.id, "card"), icon: "temple", rewards: f.milestone.rewards,
        cta: { label: `Climb on · floor ${e.floor + 1}`, go: () => { tab("adventure"); app.router.push(dungeonHubScreen(app)); app.router.push(towerScreen(app, d.id)); } } });
      return true;
    }
    case "place_opened": {
      const p = c.get<any>(e.id);
      const isRealm = e.id.startsWith("dungeon.");
      const u = p.unlock ?? p.entry;
      const pre = e.by === "fame" ? `Fame milestone · ${(u.sect_fame as number).toLocaleString("en-US")} Sect Fame` : e.by === "rank" ? "New rank, new doors" : "Your realm opens the way";
      celebrate(app, { pre, title: p.name, cn: p.name_cn, sub: p.description, art: c.artAny(e.id, "card", "background"), icon: isRealm ? "map" : "temple",
        body: isRealm && h("div", { class: "row", style: { justifyContent: "center", gap: "6px", flexWrap: "wrap", margin: "6px 0" } }, h("span", { class: "tag" }, `Rec. CP ${p.rec_cp.toLocaleString("en-US")}`), h("span", { class: "tag" }, `${(p.realm_nodes ?? []).filter((n: any) => n.waves?.length).length} trials`)),
        cta: { label: isRealm ? "Go to Adventure" : `Visit ${p.name}`, go: () => { if (isRealm) { tab("adventure"); app.router.push(dungeonHubScreen(app)); app.router.push(realmScreen(app, e.id)); } else { tab("sect"); openLocation(app, e.id); } } } });
      return true;
    }
    case "root_awakened": {
      const r = c.get<any>(e.root); const from = c.find<any>(e.from);
      celebrate(app, { pre: "Spirit root awakened", title: r.name, cn: r.name_cn, sub: `${from ? `${from.name} → ` : ""}${r.name} · Qi ×${r.qi_mult.toFixed(2)} · ${r.description}`, art: c.art(r.id, "illustration"), icon: "root",
        body: h("div", { class: "row", style: { justifyContent: "center", gap: "6px", flexWrap: "wrap", margin: "6px 0" } }, (r.elements as string[]).map((el) => { const x = c.get<any>(el); return h("span", { class: "tag", style: { color: x.color, borderColor: x.color } }, x.name); })),
        cta: { label: "See your root", go: () => { tab("character"); rootSheet(app); } } });
      return true;
    }
    case "unlock": {
      if (!e.id.startsWith("region.")) return false;
      const r = c.get<any>(e.id);
      const nodes = c.nodesOf(r.id); const lo = c.get<any>(r.entry_node).rec_cp, hi = Math.max(...nodes.map((n) => n.rec_cp));
      celebrate(app, { pre: "Adventure unlock", title: r.name, cn: r.name_cn, sub: r.description, art: c.art(r.id, "card"), icon: "map",
        body: h("div", { class: "row", style: { justifyContent: "center", gap: "6px", flexWrap: "wrap", margin: "6px 0" } }, h("span", { class: "tag" }, c.get<any>(r.realm_range.min).name), h("span", { class: "tag" }, `Rec. CP ${lo.toLocaleString("en-US")}–${hi.toLocaleString("en-US")}`), h("span", { class: "tag" }, `${nodes.length} places`)),
        cta: { label: "Go to Adventure", go: () => { tab("adventure"); app.router.push(regionScreen(app, r.id)); } } });
      return true;
    }
    default: return false;
  }
}
