/**
 * Adventure tab: region cards (mockup "world_regions"), the region node map (mockup "region_node_map")
 * and node interaction sheets (mockup "node_interactions"). Battles open the battle screen.
 */
import { placeLabels } from "../core/mapLabels.ts";
import { h, fmt } from "../core/dom.ts";
import { visit } from "../../engine/progression.ts";
import { shopScreen } from "./shop.ts";
import { icon } from "../core/icons.ts";
import { header, subbar, section, bar, powerTone } from "../core/kit.ts";
import type { Screen } from "../core/router.ts";
import type { App } from "../../app.ts";
import type { MapNode, Region, Dungeon } from "../../content/index.ts";
import { checkUnlock } from "../../engine/unlock.ts";
import { nodeState, nextStepTo, regionProgress, gather, openChest, meditateAt, resolveEvent, energyLeft, type NodeState } from "../../engine/nodes.ts";
import { trackedNode } from "../navigate.ts";
import { energyMax } from "../../engine/cultivation.ts";
import { canStart, Encounter, type EncounterSource } from "../../engine/encounter.ts";
import { computeStats } from "../../engine/stats.ts";
import { battleScreen } from "./battle.ts";
import { gearName } from "./items.ts";
import { dungeonHubScreen, realmScreen } from "./delves.ts";
import { canEnterRealm, realmRun } from "../../engine/delves.ts";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];
const KIND: Record<string, { label: string; icon: string; color: string }> = {
  battle: { label: "Combat", icon: "sword", color: "#e5484d" }, elite: { label: "Elite", icon: "star", color: "#f59a2f" }, boss: { label: "Boss", icon: "crown", color: "#d6336c" },
  gather: { label: "Gathering", icon: "lotus", color: "#3fbf6a" }, chest: { label: "Treasure", icon: "chest", color: "#e8b53c" }, event: { label: "Event", icon: "sparkle", color: "#9b6cff" },
  cultivation: { label: "Cultivation", icon: "qi", color: "#1fb8b3" }, merchant: { label: "Merchant", icon: "pouch", color: "#d97aa8" }, hidden: { label: "Hidden", icon: "info", color: "#8a93ad" },
  secret_realm: { label: "Secret Realm", icon: "map", color: "#3ccfe0" }, story: { label: "Story", icon: "scroll", color: "#c9a96b" },
};

/** Art for a map pin: the strongest enemy's portrait for fights, the painted node emblem otherwise. */
export function nodeArt(app: App, n: MapNode): string | undefined {
  const c = app.content;
  if (n.waves?.length) {
    const top = n.waves.flat().map((id) => c.find<any>(id)).filter(Boolean).sort((a, b) => b.cp - a.cp)[0];
    const a = top && c.art(top.id, "icon"); if (a) return a;
  }
  return c.art("ui.nodes", n.kind);
}

/** Regions / Dungeons switch, shown on both pages (Dungeons sits one level above the Adventure root). */
export function worldSwitch(app: App, on: "regions" | "dungeons") {
  return h("div", { class: "chips glass world-switch", role: "tablist" },
    h("button", { class: ["chip", on === "regions" && "on"], role: "tab", "aria-selected": String(on === "regions"), onClick: () => { if (on !== "regions") app.router.back(); } }, "Regions"),
    h("button", { class: ["chip", on === "dungeons" && "on"], role: "tab", "aria-selected": String(on === "dungeons"), onClick: () => { if (on !== "dungeons") app.router.push(dungeonHubScreen(app)); } }, "Dungeons"));
}

export function adventureScreen(app: App) {
  const s = app.game.state, c = app.content;
  const regions = c.byPrefix<Region>("region").slice().sort((a, b) => a.order - b.order);
  const discovered = Object.keys(s.progress.regions).length;
  const now = app.now();
  return [
    header(app),
    subbar({ title: "World Regions", cn: "天下", sub: `${discovered} of ${regions.length} regions open`, end: energyChip(app, now) }),
    worldSwitch(app, "regions"),
    h("div", { class: "region-grid" }, regions.map((r) => {
      const open = !!s.progress.regions[r.id];
      const u = checkUnlock(s, c, r.unlock as any);
      const prog = regionProgress(s, c, r.id);
      const cleared = prog.cleared === prog.total && prog.total > 0;
      return h("button", { class: ["region-card glass", !open && "locked"], onClick: () => { if (!open) { app.router.toast(u.reasons[0] ?? "Locked"); return; } app.game.run("visit", app.now(), (st) => visit(st, r.id), false); app.router.push(regionScreen(app, r.id)); } },
        h("div", { class: "rc-art", style: { backgroundImage: app.img(c.art(r.id, "card")) } }, h("span", { class: "rc-num" }, ROMAN[r.order - 1]), !open && h("span", { class: "rc-lock" }, icon("lock", 18)),
          open && h("span", { class: ["rc-state", cleared && "done"] }, cleared ? "Cleared" : s.character.location?.startsWith(`node.${r.id.split(".")[1]}.`) ? "You are here" : `${prog.cleared}/${prog.total}`)),
        h("div", { class: "rc-body" },
          h("div", { class: "rc-name" }, r.name), r.name_cn && h("div", { class: "cn rc-cn" }, r.name_cn),
          h("div", { class: "muted" }, `${c.get<any>(r.realm_range.min).name}${r.realm_range.max !== r.realm_range.min ? ` – ${c.get<any>(r.realm_range.max).name}` : ""}`),
          h("div", { class: "muted" }, open ? `Rec. ${fmt.int(c.get<any>(c.get<Region>(r.id).entry_node).rec_cp)}–${fmt.int(Math.max(...c.nodesOf(r.id).map((n) => n.rec_cp)))} CP` : (u.reasons[0] ?? "Locked"))));
    })),
  ];
}

function energyChip(app: App, now: number) {
  const s = app.game.state, c = app.content;
  return h("span", { class: "cp-chip" }, icon("bolt", 13), h("span", null, h("span", { class: "lbl" }, "Energy"), h("b", null, `${energyLeft(s, c, now)} / ${energyMax(s, c)}`)));
}

export function regionScreen(app: App, regionId: string, select?: string): Screen {
  let selected: string | null = select ?? null;
  let centred = false;
  return {
    id: `region:${regionId}`, bg: () => app.ui("ui.backdrop", "sky"),
    render: () => {
      const s = app.game.state, c = app.content, now = app.now();
      const r = c.get<Region>(regionId);
      const nodes = c.nodesOf(regionId);
      const prog = regionProgress(s, c, regionId);
      const cp = computeStats(s, c).cp;
      const bossNode = nodes.find((n) => n.kind === "boss");
      // nothing tapped yet: the place to play next is selected, so the docked card always offers the next step
      const playable = nodes.find((n) => !SIDE_KINDS.has(n.kind) && nodeState(s, c, n) === "reachable");
      const sel = (selected ? nodes.find((n) => n.id === selected) : undefined) ?? playable;
      // on arrival the selected place is centred above the docked card (the first places sit at the map's bottom)
      if (!centred && sel) { centred = true; requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector<HTMLElement>(".mp-node.sel")?.scrollIntoView({ block: "center" }))); }
      const pos = (n: MapNode) => ({ left: `${n.position[0] * 100}%`, top: `${n.position[1] * 100}%` });
      // the tracked quest marks its place; if that place is still locked, the place to play next pulses
      const quest = trackedNode(app);
      const questHere = quest && nodes.some((n) => n.id === quest) ? quest : undefined;
      const step = questHere ? nextStepTo(s, c, questHere) : null;
      const number = (n: MapNode) => nodes.indexOf(n) + 1;
      return [
        header(app),
        subbar({ help: { app, key: "region" }, title: r.name, cn: r.name_cn, sub: `${c.get<any>(r.realm_range.min).name} · ${prog.cleared} / ${prog.total} places · ${bossNode ? (s.progress.regions[regionId]?.nodes[bossNode.id]?.clears ? "boss defeated" : "boss awaits") : ""}`, backTo: "Regions", onBack: () => app.router.back(), end: h("span", { class: "cp-chip" }, icon("cp", 13), h("span", null, h("span", { class: "lbl" }, "Your CP"), h("b", null, fmt.int(cp)))) }),
        h("div", { class: "chips glass legend" }, Object.entries(KIND).filter(([k]) => nodes.some((n) => n.kind === k)).map(([k, v]) => h("span", { class: "chip" }, h("i", { class: "lg-dot", style: { "--k": v.color } }), v.label))),
        regionMap(app, regionId, nodes, { selected: sel?.id ?? null, questHere, step, select: (id) => { selected = id; app.router.refresh(); } }),
        // the card docks above the nav (mockup region_node_map): the map scrolls under it
        h("div", { class: "node-dock" }, sel ? nodeCard(app, sel, () => app.router.refresh(), { number, quest: questHere === sel.id, select: (id) => { selected = id; app.router.refresh(); } }) : h("div", { class: "glass panel center muted" }, "Tap a place on the map")),
      ];
    },
  };
}

/** Side places (merchants, secret-realm gates, hidden places) hang off the path instead of being on it. */
const SIDE_KINDS = new Set(["hidden", "merchant", "secret_realm"]);

const medalPx = (n: MapNode) => n.kind === "boss" ? 64 : n.kind === "elite" ? 52 : 46;
let measureCtx: CanvasRenderingContext2D | null = null;
/** Width of a map name plate (number bubble + name) at the current text size. */
function plateWidth(text: string): number {
  // number bubble + gap + padding + border around the measured name
  if (typeof document === "undefined") return 33 + text.length * 6.1;
  measureCtx ??= document.createElement("canvas").getContext("2d");
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 15;
  const px = 10.5 * rem / 15;
  if (!measureCtx) return 33 + text.length * px * 0.58;
  measureCtx.font = `800 ${px}px ${getComputedStyle(document.body).fontFamily}`;
  return 31 + px * 1.5 + measureCtx.measureText(text).width;
}

/**
 * The illustrated region map (mockup region_node_map): the art keeps its 2:3 shape so places stay where the
 * painting puts them; a trail runs through the places in number order (bright where cleared, flowing toward
 * the next place, faint beyond); each place is a medallion coloured by its kind; Lin's token marks where she is.
 */
function regionMap(app: App, regionId: string, nodes: MapNode[], o: { selected: string | null; questHere?: string; step: MapNode | null; select: (id: string) => void }) {
  const s = app.game.state, c = app.content;
  const SVG = "http://www.w3.org/2000/svg";
  const P = (n: MapNode): [number, number] => [n.position[0] * 100, n.position[1] * 150];
  const st = new Map(nodes.map((n) => [n.id, nodeState(s, c, n)] as const));
  const main = nodes.filter((n) => !SIDE_KINDS.has(n.kind));
  // where Lin stands: her cultivation spot if it is here, else the furthest cleared place, else the entrance
  const cleared = main.filter((n) => st.get(n.id) === "cleared");
  const here = nodes.find((n) => n.id === s.character.location) ?? cleared[cleared.length - 1] ?? main[0];
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "mp-trail"); svg.setAttribute("viewBox", "0 0 100 150"); svg.setAttribute("preserveAspectRatio", "none");
  const seg = (a: [number, number], b: [number, number], pa: [number, number], pb: [number, number], cls: string) => {
    // Catmull-Rom → cubic Bézier through the neighbours for a smooth road
    const c1 = [a[0] + (b[0] - pa[0]) / 6, a[1] + (b[1] - pa[1]) / 6], c2 = [b[0] - (pb[0] - a[0]) / 6, b[1] - (pb[1] - a[1]) / 6];
    const d = `M${a[0].toFixed(2)},${a[1].toFixed(2)} C${c1[0]!.toFixed(2)},${c1[1]!.toFixed(2)} ${c2[0]!.toFixed(2)},${c2[1]!.toFixed(2)} ${b[0].toFixed(2)},${b[1].toFixed(2)}`;
    for (const layer of ["glow", "core"]) { const p = document.createElementNS(SVG, "path"); p.setAttribute("d", d); p.setAttribute("class", `${layer} ${cls}`); svg.appendChild(p); }
  };
  // the painted road already shows the way ahead: the trail only lights the legs walked and the next one
  for (let i = 0; i + 1 < main.length; i++) {
    const a = main[i]!, b = main[i + 1]!, sa = st.get(a.id), sb = st.get(b.id);
    if (sa !== "cleared") continue;
    seg(P(a), P(b), P(main[i - 1] ?? a), P(main[i + 2] ?? b), sb === "cleared" ? "done" : "next");
  }
  for (const n of nodes.filter((x) => SIDE_KINDS.has(x.kind))) {
    const anchor = nodes.find((x) => n.connections.includes(x.id)); if (!anchor) continue;
    const sn = st.get(n.id);
    if (sn === "hidden") continue;
    seg(P(anchor), P(n), P(anchor), P(n), `side ${sn === "cleared" ? "done" : sn === "reachable" ? "next" : "ahead"}`);
  }
  const portrait = c.artAny(s.character.npc, "portrait", "full_body");
  const secretOf = (n: MapNode) => n.kind === "hidden" && st.get(n.id) !== "cleared" && !s.progress.regions[regionId]?.nodes[n.id]?.revealed;
  const screenW = (typeof document !== "undefined" && document.querySelector<HTMLElement>(".screen")?.clientWidth) || Math.min(typeof innerWidth === "number" ? innerWidth : 390, 520);
  // names go first to what matters now; a place with no clean spot for its name shows its number on the medallion
  const order = [o.selected, o.questHere, o.step?.id, here?.id, ...nodes.filter((n) => n.kind === "boss").map((n) => n.id),
    ...nodes.filter((n) => st.get(n.id) === "reachable").map((n) => n.id)].filter((x): x is string => !!x);
  const plates = placeLabels(nodes.map((n, i) => ({ id: n.id, x: n.position[0], y: n.position[1], size: medalPx(n), text: `${i + 1} ${secretOf(n) ? "???" : n.name}`, you: here === n })), screenW - 16, plateWidth, order);
  return h("div", { class: "node-map", style: { backgroundImage: app.img(c.art(regionId, "map")) } },
    svg,
    nodes.map((n, i) => {
      const state = st.get(n.id)!; const k = KIND[n.kind] ?? KIND.battle!;
      // a hidden place keeps its secret (name, kind) until it has been revealed
      const secret = secretOf(n);
      const x = n.position[0];
      const plate = plates.get(n.id);
      const bossArt = n.kind === "boss" && state !== "hidden" ? nodeArt(app, n) : undefined;
      return h("button", { class: ["mp-node", `k-${n.kind}`, `st-${state}`, secret && "secret", n.kind === "boss" && "boss", n.kind === "elite" && "elite", o.selected === n.id && "sel", o.questHere === n.id && "quest", o.step?.id === n.id && "next-step", x < 0.2 && "edge-l", x > 0.8 && "edge-r"],
        style: { left: `${x * 100}%`, top: `${n.position[1] * 100}%`, "--k": k.color }, onClick: () => o.select(n.id),
        "aria-label": `${i + 1}. ${secret ? "Undiscovered place" : n.name} · ${k.label} · ${state}${o.questHere === n.id ? " · quest target" : ""}${o.step?.id === n.id ? " · next step" : ""}` },
        o.questHere === n.id && h("span", { class: "np-quest", title: "Quest target" }, icon("scroll", 11)),
        h("span", { class: "mp-disc" }, bossArt ? h("span", { class: "mp-art", style: { backgroundImage: app.img(bossArt) } }) : secret ? h("b", { class: "mp-q" }, "?") : icon(k.icon, n.kind === "elite" ? 22 : 20)),
        state === "locked" && h("span", { class: "mp-badge lock" }, icon("lock", 10)),
        state === "cleared" && h("span", { class: "mp-badge done" }, icon("check", 10)),
        plate ? h("span", { class: "mp-label", style: { left: `${plate.left.toFixed(1)}px`, top: `${plate.top.toFixed(1)}px` } }, h("b", null, String(i + 1)), secret ? "???" : n.name)
          : h("span", { class: "mp-num" }, String(i + 1)),
        here === n && h("span", { class: "mp-you", style: portrait ? { backgroundImage: app.img(portrait) } : undefined }, h("i", null, "You")));
    }));
}

function enemyChips(app: App, ids: string[]) {
  const c = app.content;
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return h("div", { class: "row", style: { flexWrap: "wrap", gap: "6px" } }, [...counts].map(([id, n]) => {
    const e = c.get<any>(id);
    return h("span", { class: "enemy-chip" }, h("span", { class: "ec-ico", style: { backgroundImage: app.img(c.art(id, "icon")) } }), h("span", null, h("b", null, e.name), n > 1 ? ` ×${n}` : "", h("span", { class: "muted" }, ` · ${c.get<any>(e.element).name} · CP ${fmt.int(e.cp)}`)));
  }));
}

interface CardCtx { number: (n: MapNode) => number; quest: boolean; select: (id: string) => void }
function nodeCard(app: App, n: MapNode, refresh: () => void, ctx?: CardCtx) {
  const s = app.game.state, c = app.content, now = app.now();
  const st = nodeState(s, c, n);
  const k = KIND[n.kind] ?? KIND.battle!;
  const rec = s.progress.regions[n.region]?.nodes[n.id];
  const cp = computeStats(s, c).cp;
  const act = <T extends { ok: boolean }>(label: string, fn: (st: any, ct: any) => T, okMsg?: string | ((r: any) => string)) => {
    const r = app.game.run(label, app.now(), fn as any) as any;
    if (!r.ok) app.router.toast(r.reason, "bad"); else if (okMsg) app.router.toast(typeof okMsg === "function" ? okMsg(r) : okMsg, "good");
    refresh(); return r;
  };
  const start = (src: EncounterSource) => {
    const can = canStart(s, c, src, now);
    if (!can.ok) { app.router.toast(can.reason, "bad"); return; }
    const r = Encounter.start(s, c, src, now);
    if (!r.ok) { app.router.toast(r.reason, "bad"); return; }
    app.game.dirtyImportant = true;
    app.router.pushGlobal(battleScreen(app, r.encounter, () => { app.router.popGlobal(); refresh(); }));
  };
  const body: any[] = [];
  // an unrevealed hidden place shows nothing of itself
  const secret = n.kind === "hidden" && st !== "cleared" && !rec?.revealed;
  if (secret) {
    body.push(h("div", { class: "row" }, h("span", { class: "np-ico big", style: { background: "#5a6078" } }, h("b", { class: "mp-q" }, "?")),
      h("div", { class: "grow" }, h("div", { class: "muted up" }, "Undiscovered"), h("div", { class: "title", style: { fontSize: "calc(16rem / 15)" } }, "???"))),
      h("div", { class: "muted", style: { marginTop: "6px" } }, icon("info", 12), ` Something may be hidden here. ${n.hidden?.condition ?? ""}`));
    return h("div", { class: "glass panel gold node-card" }, ...body);
  }
  const head = h("div", { class: "row" },
    nodeArt(app, n) ? h("span", { class: "np-ico big art", style: { backgroundImage: app.img(nodeArt(app, n)), borderColor: k.color } }) : h("span", { class: "np-ico big", style: { background: k.color } }, icon(k.icon, 20)),
    h("div", { class: "grow" }, h("div", { class: "muted up", style: { color: `color-mix(in srgb, ${k.color} 55%, #fff)` } }, `${k.label} · ${st === "cleared" ? `cleared ×${rec?.clears}` : st}`), h("div", { class: "title", style: { fontSize: "calc(16rem / 15)" } }, n.name)),
    n.rec_cp > 0 && h("span", { class: ["tag", powerTone(cp, n.rec_cp)] }, `Rec. CP ${fmt.int(n.rec_cp)}`));
  body.push(head, h("div", { class: "dim", style: { fontSize: "calc(12.5rem / 15)", margin: "6px 0 8px" } }, n.description));
  if (ctx?.quest) body.push(h("div", { class: "np-questline" }, icon("scroll", 12), st === "locked" ? " Your quest leads here, but the way is not open yet." : " Your quest leads here."));
  if (st === "locked") {
    const step = nextStepTo(s, c, n.id);
    body.push(step
      ? h("div", { class: "np-next" }, icon("lock", 12), h("span", { class: "grow" }, " Locked · clear the places before it. Next: ", h("b", null, `${ctx ? `${ctx.number(step)}. ` : ""}${step.name}`)),
          ctx && h("button", { class: "btn sm jade", onClick: () => ctx.select(step.id) }, "Show"))
      : h("div", { class: "muted" }, icon("lock", 12), " Clear the place before it to reach it."));
  }
  else if (st === "hidden") body.push(h("div", { class: "muted" }, icon("info", 12), ` Something is hidden here. ${n.hidden?.condition ?? ""}`));
  else if (n.waves?.length) {
    body.push(enemyChips(app, n.waves.flat()), h("div", { class: "muted", style: { margin: "6px 0" } }, `${n.waves.length} wave${n.waves.length > 1 ? "s" : ""} · ${n.energy_cost} energy${rec?.clears ? " · replayable, drops only" : " · first clear rewards"}`));
    if (!rec?.clears && n.first_clear && Object.keys(n.first_clear).length) body.push(rewardsLine(app, n.first_clear as any));
    // one clear action: Manual/Auto is chosen on the battle screen itself (and remembered), not here
    body.push(h("button", { class: "btn gold block node-fight", onClick: () => start({ kind: "node", id: n.id }) }, icon("sword", 15), n.kind === "boss" ? "Challenge" : "Fight"));
  } else if (n.kind === "gather") {
    const nextAt = (rec?.lastAt ?? 0) + n.gather!.cooldown_min * 60_000;
    body.push(rewardsLine(app, { items: n.gather!.items }), h("div", { class: "muted", style: { margin: "6px 0" } }, `${n.gather!.energy_cost} energy · regrows every ${n.gather!.cooldown_min} min`),
      h("button", { class: "btn gold block", disabled: nextAt > now, onClick: () => act("gather", (st2, ct) => gather(st2, ct, app.now(), n.id), (r) => `Gathered ${r.items.map((i: any) => `${i.qty}× ${c.get<any>(i.id).name}`).join(", ")}`) }, nextAt > now ? `Regrows in ${fmt.duration(nextAt - now)}` : "Gather"));
  } else if (n.kind === "chest") {
    body.push(h("div", { class: "muted", style: { margin: "6px 0" } }, st === "cleared" ? "Opened." : `A sealed cache. ${n.energy_cost} energy.`),
      h("button", { class: "btn gold block", disabled: st === "cleared", onClick: () => { const r = act("chest", (st2, ct) => openChest(st2, ct, app.now(), n.id)); if (r.ok) lootToast(app, r.drops, r.gearUids); } }, st === "cleared" ? "Empty" : "Open"));
  } else if (n.kind === "cultivation") {
    const here = s.character.location === n.id;
    body.push(h("div", { class: "muted", style: { margin: "6px 0" } }, `Qi ×${n.cultivation!.qi_mult} while you meditate here`),
      h("button", { class: ["btn block", here ? "" : "gold"], onClick: () => act("meditate", (st2, ct) => meditateAt(st2, ct, app.now(), n.id), here ? undefined : `Meditating at ${n.name}`) }, here ? "Meditating here" : "Meditate"));
  } else if (n.kind === "event" || n.kind === "hidden") {
    const ev = c.get<any>(n.event!);
    body.push(h("div", { class: "glass panel", style: { padding: "10px 12px", marginBottom: "8px", background: "rgba(4,10,34,.45)" } }, h("div", { class: "title", style: { fontSize: "calc(13rem / 15)" } }, ev.name), h("div", { class: "dim", style: { fontSize: "calc(12.5rem / 15)", fontStyle: "italic" } }, ev.text)),
      st === "cleared" && !n.replayable ? h("div", { class: "muted" }, "Resolved.") : h("div", { class: "rows" }, ev.choices.map((ch: any, i: number) => h("button", { class: "setrow", onClick: () => {
        const r = act("event", (st2, ct) => resolveEvent(st2, ct, app.now(), n.id, i));
        if (!r.ok) return;
        app.router.open({ id: "event-outcome", kind: "modal", render: (close) => h("div", null, h("div", { class: "m-title" }, ev.name), h("p", { class: "dim center", style: { fontSize: "calc(14rem / 15)" } }, r.outcome.text),
          r.outcome.rewards && rewardsLine(app, r.outcome.rewards),
          h("button", { class: "btn gold block", style: { marginTop: "10px" }, onClick: () => { close(); if (r.outcome.battle) start({ kind: "event", node: n.id, enemies: r.outcome.battle }); } }, r.outcome.battle ? "To battle!" : "Continue")) });
      } }, icon("chevron", 14), h("span", { class: "grow", style: { textAlign: "left", fontSize: "calc(13rem / 15)" } }, ch.text)))));
  } else if (n.kind === "secret_realm") {
    const d = c.get<Dungeon>(n.secret_realm!);
    const can = canEnterRealm(s, c, d.id, app.now());
    body.push(h("div", { class: "muted", style: { margin: "6px 0" } }, d.description), h("button", { class: ["btn block", can.ok && "gold"], onClick: () => app.router.push(realmScreen(app, d.id)) }, realmRun(s, d.id) ? "Resume the realm" : can.ok ? "Approach the rift" : `Sealed · ${can.reason}`));
  } else if (n.kind === "merchant" && (n as any).shop) body.push(h("button", { class: "btn gold block", onClick: () => { app.game.run("visit", app.now(), (st) => visit(st, n.id), false); app.router.push(shopScreen(app, (n as any).shop, c.get<any>(n.region).name)); } }, icon("gem", 14), "Trade"));
  else if (n.kind === "story") body.push(h("button", { class: "btn gold block", onClick: () => app.playStory(n.story!, () => { app.game.run("story node", app.now(), (st2) => { const rec2 = (st2.progress.regions[n.region]!.nodes[n.id] ??= { clears: 0 }); if (!rec2.clears) { rec2.clears = 1; } return { ok: true, events: [{ type: "node_cleared", node: n.id, region: n.region, first: true }] }; }); refresh(); }) }, "Play scene"));
  return h("div", { class: "glass panel gold node-card" }, ...body);
}

export function rewardsLine(app: App, r: any) {
  const c = app.content;
  const parts: any[] = [];
  if (r.spirit_stones) parts.push(h("span", { class: "tag gold" }, icon("gem", 10), ` ${fmt.int(r.spirit_stones)}`));
  if (r.sect_fame) parts.push(h("span", { class: "tag" }, icon("fame", 10), ` ${fmt.int(r.sect_fame)} Fame`));
  for (const it of r.items ?? []) parts.push(h("span", { class: "tag" }, `${it.qty}× ${c.get<any>(it.id).name}`));
  for (const g of r.gear ?? []) parts.push(h("span", { class: `tag rt-${g.rarity}` }, c.get<any>(g.base).name));
  for (const t of r.techniques ?? []) parts.push(h("span", { class: "tag jade" }, c.get<any>(t).name));
  return parts.length ? h("div", { class: "row", style: { flexWrap: "wrap", gap: "5px", margin: "4px 0" } }, parts) : null;
}

function lootToast(app: App, drops: any, gearUids: number[]) {
  const c = app.content;
  const bits = [drops.spirit_stones ? `${drops.spirit_stones} stones` : "", ...drops.items.map((i: any) => `${i.qty}× ${c.get<any>(i.id).name}`), ...gearUids.map((u) => gearName(app, app.game.state.inventory.gear[u]!))].filter(Boolean);
  app.router.toast(`Found: ${bits.join(", ")}`, "good", 4000);
}
