/**
 * Adventure tab: region cards (mockup "world_regions"), the region node map (mockup "region_node_map")
 * and node interaction sheets (mockup "node_interactions"). Battles open the battle screen.
 */
import { h, fmt } from "../core/dom.ts";
import { visit } from "../../engine/progression.ts";
import { shopScreen } from "./shop.ts";
import { icon } from "../core/icons.ts";
import { header, subbar, section, bar, powerTone } from "../core/kit.ts";
import type { Screen } from "../core/router.ts";
import type { App } from "../../app.ts";
import type { MapNode, Region, Dungeon } from "../../content/index.ts";
import { checkUnlock } from "../../engine/unlock.ts";
import { nodeState, regionProgress, gather, openChest, meditateAt, resolveEvent, energyLeft, type NodeState } from "../../engine/nodes.ts";
import { energyMax } from "../../engine/cultivation.ts";
import { canStart, Encounter, type EncounterSource } from "../../engine/encounter.ts";
import { computeStats } from "../../engine/stats.ts";
import { battleScreen } from "./battle.ts";
import { gearName } from "./items.ts";
import { dungeonHubScreen, realmScreen } from "./delves.ts";
import { canEnterRealm, realmRun } from "../../engine/delves.ts";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];
const KIND: Record<string, { label: string; icon: string; color: string }> = {
  battle: { label: "Combat", icon: "sword", color: "#ff6b6b" }, elite: { label: "Elite", icon: "sword", color: "#ffa64d" }, boss: { label: "Boss", icon: "fame", color: "#ff4f8a" },
  gather: { label: "Gathering", icon: "lotus", color: "#5fe08f" }, chest: { label: "Treasure", icon: "gem", color: "#ffd27a" }, event: { label: "Event", icon: "sparkle", color: "#c99bff" },
  cultivation: { label: "Cultivation", icon: "qi", color: "#7fd0ff" }, merchant: { label: "Merchant", icon: "pouch", color: "#f5a3c7" }, hidden: { label: "Hidden", icon: "info", color: "#9aa3bf" },
  secret_realm: { label: "Secret Realm", icon: "map", color: "#b8fff7" }, story: { label: "Story", icon: "scroll", color: "#fff2c2" },
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

export function adventureScreen(app: App) {
  const s = app.game.state, c = app.content;
  const regions = c.byPrefix<Region>("region").slice().sort((a, b) => a.order - b.order);
  const discovered = Object.keys(s.progress.regions).length;
  const now = app.now();
  return [
    header(app),
    subbar({ title: "World Regions", cn: "天下", sub: `${discovered} of ${regions.length} regions open`, end: energyChip(app, now) }),
    h("div", { class: "chips glass" }, h("button", { class: "chip on" }, "Regions"), h("button", { class: "chip", onClick: () => app.router.push(dungeonHubScreen(app)) }, "Dungeons")),
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
  return {
    id: `region:${regionId}`, bg: () => app.ui("ui.backdrop", "sky"),
    render: () => {
      const s = app.game.state, c = app.content, now = app.now();
      const r = c.get<Region>(regionId);
      const nodes = c.nodesOf(regionId);
      const prog = regionProgress(s, c, regionId);
      const cp = computeStats(s, c).cp;
      const bossNode = nodes.find((n) => n.kind === "boss");
      const sel = selected ? nodes.find((n) => n.id === selected) : undefined;
      const pos = (n: MapNode) => ({ left: `${n.position[0] * 100}%`, top: `${n.position[1] * 100}%` });
      return [
        header(app),
        subbar({ help: { app, key: "region" }, title: r.name, cn: r.name_cn, sub: `${c.get<any>(r.realm_range.min).name} · ${prog.cleared} / ${prog.total} places · ${bossNode ? (s.progress.regions[regionId]?.nodes[bossNode.id]?.clears ? "boss defeated" : "boss awaits") : ""}`, backTo: "Regions", onBack: () => app.router.back(), end: h("span", { class: "cp-chip" }, icon("cp", 13), h("span", null, h("span", { class: "lbl" }, "Your CP"), h("b", null, fmt.int(cp)))) }),
        h("div", { class: "chips glass legend" }, Object.entries(KIND).filter(([k]) => nodes.some((n) => n.kind === k)).map(([k, v]) => h("span", { class: "chip", style: { color: `color-mix(in srgb, ${v.color} 65%, #fff)` } }, icon(v.icon, 11), v.label))),
        h("div", { class: "node-map", style: { backgroundImage: app.img(c.art(regionId, "map")) } },
          h("svg", { class: "node-links", viewBox: "0 0 100 100", preserveAspectRatio: "none" }, nodes.flatMap((n) => n.connections.filter((k) => k > n.id).map((k) => {
            const m = nodes.find((x) => x.id === k); if (!m) return null;
            const lit = nodeState(s, c, n) === "cleared" || nodeState(s, c, m) === "cleared";
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", String(n.position[0] * 100)); line.setAttribute("y1", String(n.position[1] * 100)); line.setAttribute("x2", String(m.position[0] * 100)); line.setAttribute("y2", String(m.position[1] * 100));
            line.setAttribute("class", lit ? "lit" : ""); return line;
          }))),
          nodes.map((n, i) => {
            const st = nodeState(s, c, n);
            const k = KIND[n.kind] ?? KIND.battle!;
            const here = s.character.location === n.id;
            const art = st === "hidden" ? undefined : nodeArt(app, n);
            return h("button", { class: ["node-pin", `k-${n.kind}`, `st-${st}`, n.kind === "boss" && "boss", n.kind === "elite" && "elite", art && "has-art", selected === n.id && "sel"], style: { ...pos(n), "--k": k.color }, onClick: () => { selected = n.id; app.router.refresh(); }, "aria-label": n.name },
              h("span", { class: "np-ico", style: art ? { backgroundImage: app.img(art) } : { background: st === "locked" || st === "hidden" ? undefined : k.color } }, !art && icon(st === "locked" ? "lock" : st === "hidden" ? "info" : k.icon, n.kind === "boss" ? 18 : 14)),
              h("span", { class: "np-num" }, String(i + 1)),
              st === "locked" && art && h("span", { class: "np-lock" }, icon("lock", 10)),
              st === "cleared" && h("span", { class: "np-done" }, "✓"),
              h("span", { class: "np-label" }, st === "hidden" ? "???" : n.name),
              here && h("span", { class: "np-here" }, "You are here"));
          })),
        sel ? nodeCard(app, sel, () => app.router.refresh()) : h("div", { class: "glass panel center muted" }, "Tap a place on the map"),
      ];
    },
  };
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

function nodeCard(app: App, n: MapNode, refresh: () => void) {
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
  const head = h("div", { class: "row" },
    nodeArt(app, n) ? h("span", { class: "np-ico big art", style: { backgroundImage: app.img(nodeArt(app, n)), borderColor: k.color } }) : h("span", { class: "np-ico big", style: { background: k.color } }, icon(k.icon, 20)),
    h("div", { class: "grow" }, h("div", { class: "muted up", style: { color: `color-mix(in srgb, ${k.color} 55%, #fff)` } }, `${k.label} · ${st === "cleared" ? `cleared ×${rec?.clears}` : st}`), h("div", { class: "title", style: { fontSize: "calc(16rem / 15)" } }, n.name)),
    n.rec_cp > 0 && h("span", { class: ["tag", powerTone(cp, n.rec_cp)] }, `Rec. CP ${fmt.int(n.rec_cp)}`));
  body.push(head, h("div", { class: "dim", style: { fontSize: "calc(12.5rem / 15)", margin: "6px 0 8px" } }, n.description));
  if (st === "locked") body.push(h("div", { class: "muted" }, icon("lock", 12), " Clear a neighbouring place to reach it."));
  else if (st === "hidden") body.push(h("div", { class: "muted" }, icon("info", 12), ` Something is hidden here. ${n.hidden?.condition ?? ""}`));
  else if (n.waves?.length) {
    body.push(enemyChips(app, n.waves.flat()), h("div", { class: "muted", style: { margin: "6px 0" } }, `${n.waves.length} wave${n.waves.length > 1 ? "s" : ""} · ${n.energy_cost} energy${rec?.clears ? " · replayable, drops only" : " · first clear rewards"}`));
    if (!rec?.clears && n.first_clear && Object.keys(n.first_clear).length) body.push(rewardsLine(app, n.first_clear as any));
    body.push(h("div", { class: "grid-2" },
      h("button", { class: "btn", onClick: () => { app.game.state.combat.manual = !app.game.state.combat.manual; app.game.dirty = true; refresh(); } }, icon(s.combat.manual ? "person" : "auto", 14), s.combat.manual ? "Manual" : "Auto"),
      h("button", { class: "btn gold", onClick: () => start({ kind: "node", id: n.id }) }, icon("sword", 14), n.kind === "boss" ? "Challenge" : "Fight")));
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
