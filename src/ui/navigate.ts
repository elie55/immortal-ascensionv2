/**
 * Quest tracking: resolves a quest's next step to a place in the game and takes the player there.
 * The destination comes from the database only (nodes, dungeons, shops, recipes, NPC locations), so it stays
 * right when content changes. The tracked quest is pinned in a HUD chip under the header (see trackerChip).
 */
import { h } from "./core/dom.ts";
import { icon } from "./core/icons.ts";
import type { App } from "../app.ts";
import type { Tab } from "./core/router.ts";
import type { MapNode } from "../content/index.ts";
import { questProgress, questStatus } from "../engine/progression.ts";
import { itemCount } from "../engine/inventory.ts";
import { nextStepTo } from "../engine/nodes.ts";
import { openLocation } from "./screens/sect.ts";
import { npcScreen } from "./screens/npc.ts";
import { regionScreen } from "./screens/adventure.ts";
import { dungeonHubScreen, realmScreen } from "./screens/delves.ts";
import { shopScreen } from "./screens/shop.ts";
import { questLogScreen } from "./screens/quests.ts";

/** `node`: the map place the quest points at (the region map puts a quest marker on it). */
export interface Destination { where: string; tab: Tab; go: () => void; node?: string }

/** Sect location that hosts an NPC (if any). */
function locationOfNpc(app: App, npcId: string): string | undefined {
  return app.content.byPrefix<any>("sectloc").find((l) => (l.npcs ?? []).includes(npcId))?.id;
}
const nodesWith = (app: App, pred: (n: MapNode) => boolean) => app.content.byPrefix<MapNode>("node").filter(pred);
/** Prefer a node in a discovered region; otherwise the earliest region by realm. */
function pickNode(app: App, nodes: MapNode[]): MapNode | undefined {
  const s = app.game.state, c = app.content;
  const order = (n: MapNode) => c.get<any>(c.get<any>(n.region).realm_range.min).order;
  const known = nodes.filter((n) => s.progress.regions[n.region]);
  return (known.length ? known : nodes).slice().sort((a, b) => order(a) - order(b))[0];
}
/** Enemies whose loot table lists an item. */
function enemiesDropping(app: App, item: string): string[] {
  const c = app.content;
  return [...c.byPrefix<any>("enemy"), ...c.byPrefix<any>("boss")].filter((e) => { const l = c.find<any>(e.loot); return l && (l.entries.some((x: any) => x.id === item) || l.guaranteed.some((x: any) => x.id === item)); }).map((e) => e.id);
}

function toTab(app: App, tab: Tab) { app.router.clearGlobal(); app.router.setTab(tab); if (app.router.tab === tab) app.router.store.update((st) => { st.stacks[tab] = []; }); }
const goLocation = (app: App, loc: string): Destination => ({ where: app.content.get<any>(loc).name, tab: "sect", go: () => { toTab(app, "sect"); openLocation(app, loc); } });
const goNpc = (app: App, npcId: string): Destination => {
  const loc = locationOfNpc(app, npcId);
  const npc = app.content.get<any>(npcId);
  return { where: `${npc.name}${loc ? ` · ${app.content.get<any>(loc).name}` : ""}`, tab: "sect", go: () => { toTab(app, "sect"); if (loc) openLocation(app, loc); app.router.push(npcScreen(app, npcId, loc ? app.content.get<any>(loc).name : "Sect")); } };
};
/** A map place: the region opens with the target selected and marked. A locked target stays locked (its card names
 *  the place to clear next, which pulses on the map); the tracker never makes a place playable. */
const goNode = (app: App, n: MapNode): Destination => {
  const step = nextStepTo(app.game.state, app.content, n.id);
  return { where: `${app.content.get<any>(n.region).name} · ${n.name}${step ? ` · next: ${step.name}` : ""}`, tab: "adventure", node: n.id,
    go: () => { toTab(app, "adventure"); app.router.push(regionScreen(app, n.region, n.id)); focusLater(".mp-node.sel"); } };
};
const goRegion = (app: App, region: string): Destination => ({ where: app.content.get<any>(region).name, tab: "adventure", go: () => { toTab(app, "adventure"); app.router.push(regionScreen(app, region)); } });
const goDungeon = (app: App, id: string): Destination => {
  const d = app.content.get<any>(id);
  return { where: `Dungeons · ${d.name}`, tab: "adventure", go: () => { toTab(app, "adventure"); app.router.push(dungeonHubScreen(app)); if (d.kind === "secret_realm") app.router.push(realmScreen(app, id)); else focusLater(`[data-dungeon="${id}"]`); } };
};
const goCultivate = (app: App, where: string): Destination => ({ where, tab: "cultivate", go: () => toTab(app, "cultivate") });
const goFeature = (app: App, feature: string, label: string): Destination => {
  const loc = app.content.byPrefix<any>("sectloc").find((l) => (l.features ?? []).includes(feature));
  return loc ? { ...goLocation(app, loc.id), where: `${loc.name} · ${label}` } : goCultivate(app, label);
};
function goItemSource(app: App, item: string): Destination | null {
  const c = app.content;
  const gather = pickNode(app, nodesWith(app, (n) => !!n.gather?.items.some((q) => q.id === item)));
  if (gather) return goNode(app, gather);
  const drops = enemiesDropping(app, item);
  if (drops.length) {
    const node = pickNode(app, nodesWith(app, (n) => !!n.waves?.some((w) => w.some((e) => drops.includes(e)))));
    if (node) return goNode(app, node);
    const d = c.byPrefix<any>("dungeon").find((x) => (x.waves ?? []).some((w: any) => w.enemies.some((e: string) => drops.includes(e))) || x.tower?.enemy_pool.some((e: string) => drops.includes(e)));
    if (d) return goDungeon(app, d.id);
  }
  const chest = pickNode(app, nodesWith(app, (n) => { const l = n.chest ? c.find<any>(n.chest) : null; return !!l && (l.entries.some((x: any) => x.id === item) || l.guaranteed.some((x: any) => x.id === item)); }));
  if (chest) return goNode(app, chest);
  const shop = c.byPrefix<any>("shop").find((sh) => sh.stock.some((e: any) => e.id === item));
  if (shop) { const loc = c.byPrefix<any>("sectloc").find((l) => l.shop === shop.id); if (loc) return { where: `${loc.name} · buy`, tab: "sect", go: () => { toTab(app, "sect"); openLocation(app, loc.id); app.router.push(shopScreen(app, shop.id, loc.name)); } }; }
  if (c.byPrefix<any>("alchemy").some((r) => r.output.id === item)) return goFeature(app, "alchemy", "refine it");
  if (c.byPrefix<any>("forge").some((r) => r.output?.id === item)) return goFeature(app, "forge", "craft it");
  return null;
}

/** Where an item comes from, as a short place name ("Blazing Mountain", "Mission Hall"), for hints. */
export function itemSourcePlace(app: App, item: string): string | null {
  const d = goItemSource(app, item);
  return d ? d.where.split(" · ")[0]! : null;
}

/** Where to go for one objective. */
export function objectiveDestination(app: App, o: any): Destination | null {
  const c = app.content, s = app.game.state;
  switch (o.type) {
    case "defeat": {
      const node = pickNode(app, nodesWith(app, (n) => !!n.waves?.some((w) => w.includes(o.target))));
      if (node) return goNode(app, node);
      const d = c.byPrefix<any>("dungeon").find((x) => (x.waves ?? []).some((w: any) => w.enemies.includes(o.target)) || x.tower?.boss_pool.includes(o.target) || x.tower?.enemy_pool.includes(o.target) || (x.realm_nodes ?? []).some((n: any) => n.waves?.some((w: string[]) => w.includes(o.target))));
      return d ? goDungeon(app, d.id) : null;
    }
    case "collect": return goItemSource(app, o.item);
    case "deliver": return itemCount(s, o.item) >= o.count ? (o.to.startsWith("npc.") ? goNpc(app, o.to) : goLocation(app, o.to)) : goItemSource(app, o.item);
    case "clear": return o.target.startsWith("node.") ? goNode(app, c.get<MapNode>(o.target)) : goDungeon(app, o.target);
    case "tower_floor": return goDungeon(app, o.dungeon);
    case "explore": return goRegion(app, o.region);
    case "reach_realm": case "meditate": case "story": return goCultivate(app, "Cultivate");
    case "learn": return goFeature(app, "pavilion", "Scripture Pavilion");
    case "win_duel": case "gift": case "affinity": case "talk": return goNpc(app, o.npc);
    case "refine": return goFeature(app, "alchemy", "Alchemy");
    case "craft": case "enhance": return goFeature(app, "forge", "Spirit Forge");
    case "rank": return goFeature(app, "missions", "earn Fame");
    case "tournament": return goFeature(app, "tournament", "Proving Arena");
    case "hatch": case "evolve": return goFeature(app, "beasts", "Spirit Beast Garden");
    case "visit": return o.target.startsWith("region.") ? goRegion(app, o.target) : goLocation(app, o.target);
    default: return null;
  }
}

/** Where to go next for a quest: its first unfinished objective, or the turn-in once everything is done. */
export function questDestination(app: App, q: any): Destination | null {
  const s = app.game.state, c = app.content;
  const st = questStatus(s, c, q, app.now());
  if (st === "ready") {
    if (q.turn_in === "auto") return null;
    return q.turn_in.startsWith("npc.") ? { ...goNpc(app, q.turn_in), where: `Turn in · ${goNpc(app, q.turn_in).where}` } : goLocation(app, q.turn_in);
  }
  if (st === "available") return q.giver === "system" ? goCultivate(app, "Quest Log") : q.giver.startsWith("npc.") ? goNpc(app, q.giver) : goLocation(app, q.giver);
  const prog = questProgress(s, c, q);
  const i = prog.findIndex((p) => !p.done);
  return i >= 0 ? objectiveDestination(app, q.objectives[i]) : null;
}

/** The map place the tracked quest points at, if any (region maps put the quest marker on it). */
export function trackedNode(app: App): string | undefined {
  const id = app.game.state.progress.quests.tracked;
  if (!id || !app.content.has(id)) return undefined;
  return questDestination(app, app.content.get<any>(id))?.node;
}

/** After the next render, scroll the highlighted element into view (map pin, dungeon card). */
export function focusLater(selector: string) {
  requestAnimationFrame(() => requestAnimationFrame(() => { const el = document.querySelector<HTMLElement>(selector); el?.scrollIntoView({ block: "center", behavior: "smooth" }); el?.classList.add("track-pulse"); }));
}

export function setTracked(app: App, id: string | null) {
  app.game.run("track", app.now(), (st) => { st.progress.quests.tracked = id; return { ok: true, events: [] }; }, false);
}

/** Tracked-quest chip under the header: name, current objective and progress; tap = go there, × = untrack. */
export function trackerChip(app: App) {
  const s = app.game.state, c = app.content;
  const id = s.progress.quests.tracked;
  if (!id || !c.has(id)) return null;
  const q = c.get<any>(id);
  const st = questStatus(s, c, q, app.now());
  if (st === "done" || st === "cooldown" || st === "locked") return null;
  const prog = st === "active" || st === "ready" ? questProgress(s, c, q) : [];
  const i = prog.findIndex((p) => !p.done);
  const cur = i >= 0 ? prog[i]! : null;
  const dest = questDestination(app, q);
  // One slim line (UI review G1): quest name, then the step or "Ready" in the quest colour; where it happens is in Go's label.
  return h("button", { class: ["tracker", st === "ready" && "ready"], title: dest?.where, onClick: () => { if (dest) dest.go(); else { toTab(app, "cultivate"); app.router.push(questLogScreen(app, "Cultivate")); } } },
    h("span", { class: "tr-i" }, icon(st === "ready" ? "sparkle" : "map", 13)),
    h("span", { class: "grow tr-line" },
      h("b", null, q.name),
      h("span", { class: "tr-sub" }, st === "ready" ? "Ready to turn in" : cur ? `${cur.label} ${cur.have}/${cur.need}` : (dest?.where ?? ""))),
    h("span", { class: "tr-go" }, "Go ▸"),
    h("span", { class: "icon-btn tr-x", role: "button", "aria-label": "Stop tracking", onClick: (e: Event) => { e.stopPropagation(); setTracked(app, null); } }, icon("close", 12)));
}
