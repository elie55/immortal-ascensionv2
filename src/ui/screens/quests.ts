/**
 * Quests (mockup "mission_hall" + quest log) and achievements (mockup "achievements").
 * Quest cards show giver, difficulty, recommended CP, objectives with live progress, rewards, and one action:
 * Accept / Deliver / Turn in / Track (tells where to go).
 */
import { h, fmt } from "../core/dom.ts";
import { icon } from "../core/icons.ts";
import { header, subbar, section, bar, seg, npcAvatar, confirmModal } from "../core/kit.ts";
import type { Screen } from "../core/router.ts";
import type { App } from "../../app.ts";
import { questDestination, objectiveDestination, setTracked } from "../navigate.ts";
import { questStatus, questProgress, acceptQuest, turnInQuest, abandonQuest, achievementProgress, nextRank, type QuestStatus, turnInAll } from "../../engine/progression.ts";
import { itemCount } from "../../engine/inventory.ts";
import { rewardsLine } from "./adventure.ts";

const TYPE_LABEL: Record<string, string> = { main: "Main", mission: "Mission", npc: "Personal", cultivation: "Cultivation", dungeon: "Trial", combat: "Hunt", alchemy: "Alchemy", forge: "Forge", hidden: "Hidden", beast: "Beast" };

function giverLine(app: App, q: any): string {
  const c = app.content;
  if (q.giver === "system") return TYPE_LABEL[q.type] ?? "Quest";
  const g = c.get<any>(q.giver);
  return q.giver.startsWith("npc.") ? `${g.name}${g.title ? ` · ${g.title.split("·")[0].trim()}` : ""}` : g.name;
}

function stars(n: number) { return h("span", { class: "stars" }, [1, 2, 3, 4, 5].map((i) => h("i", { class: i <= n && "on" }, "★"))); }

/** One quest card. `where` is the giver/turn-in the player is standing at (enables Accept/Turn in). */
export function questCard(app: App, q: any, opts: { where?: string } = {}) {
  const s = app.game.state, c = app.content, now = app.now();
  const st: QuestStatus = questStatus(s, c, q, now);
  const prog = st === "active" || st === "ready" ? questProgress(s, c, q) : q.objectives.map((o: any) => ({ label: objLabel(app, o), have: 0, need: o.count ?? o.nodes ?? o.minutes ?? o.level ?? o.floor ?? o.round ?? 1, done: false }));
  const here = opts.where && (q.giver === opts.where || q.turn_in === opts.where);
  const canTurnIn = st === "ready" && (q.turn_in === "auto" || q.turn_in === opts.where || !opts.where);
  const deliver = q.objectives.some((o: any) => o.type === "deliver");
  // Successes are announced by the app (quest_accepted / quest_completed); only failures toast here.
  const run = (fn: () => any, msg: string) => { const r = app.game.run("quest", app.now(), fn); if (!r.ok) app.router.toast(r.reason, "bad"); else if (msg) app.router.toast(msg, "info"); };
  let action: any = null;
  if (st === "available" && (here || !opts.where)) action = h("button", { class: "btn gold sm", onClick: () => run(() => acceptQuest(app.game.state, c, q.id, app.now()), q.type === "main" ? "" : `Accepted: ${q.name}`) }, "Accept");
  else if (st === "ready" && canTurnIn) action = h("button", { class: "btn gold sm", onClick: () => run(() => turnInQuest(app.game.state, c, q.id, app.now()), "") }, deliver ? "Deliver" : "Turn in");
  else if (st === "active" || st === "ready") {
    const tracked = s.progress.quests.tracked === q.id;
    const dest = questDestination(app, q);
    action = h("div", { class: "row", style: { gap: "6px" } },
      h("button", { class: ["btn ghost sm", tracked && "on-track"], "aria-pressed": String(tracked), onClick: () => { setTracked(app, tracked ? null : q.id); app.router.toast(tracked ? "Stopped tracking" : `Tracking: ${q.name}`, "info"); } }, icon(tracked ? "check" : "map", 13), tracked ? "Tracked" : "Track"),
      dest && h("button", { class: "btn gold sm", onClick: () => { if (!tracked) setTracked(app, q.id); dest.go(); } }, "Go ▸"));
  }
  else if (st === "cooldown") action = h("span", { class: "tag" }, icon("clock", 11), " ", fmt.duration(q.repeatable.cooldown_min * 60_000 - (now - (s.progress.quests.lastCompletedAt[q.id] ?? 0))));
  const total = prog.reduce((n: number, p: any) => n + p.need, 0), have = prog.reduce((n: number, p: any) => n + p.have, 0);
  return h("article", { class: ["glass quest-card", st === "ready" && "ready", q.type === "main" && "main"] },
    h("div", { class: "row" },
      q.giver.startsWith("npc.") ? npcAvatar(app, q.giver, 40) : c.art(q.id, "icon") ? h("span", { class: "q-ico art", style: { backgroundImage: app.img(c.art(q.id, "icon")) } }) : h("span", { class: "q-ico" }, icon(q.type === "main" ? "scroll" : q.type === "combat" ? "sword" : q.type === "dungeon" ? "temple" : "scroll", 18)),
      h("div", { class: "grow" }, h("div", { class: "q-title" }, q.name), h("div", { class: "muted" }, giverLine(app, q))),
      h("div", { class: "q-meta" }, stars(q.difficulty), q.rec_cp ? h("span", { class: "tag" }, icon("sword", 10), ` Rec. CP ${fmt.int(q.rec_cp)}`) : h("span", { class: "tag" }, TYPE_LABEL[q.type] ?? q.type))),
    h("div", { class: "q-objs" }, prog.map((p: any, i: number) => {
      const o = q.objectives[i];
      const item = o.item ? c.find<any>(o.item) : undefined;
      const art = o.item ? c.art(o.item, "icon") : undefined;
      const shown = (o.type === "deliver" || o.type === "collect") ? Math.min(itemCount(s, o.item), o.count) : p.have;
      return h("div", { class: ["q-obj", p.done && "done"] },
        h("span", { class: ["tile-mini", `r-${item?.rarity ?? "common"}`], style: { backgroundImage: art ? app.img(art) : undefined } }, !art && icon(p.done ? "sparkle" : "chevron", 12)),
        h("div", { class: "grow" }, h("div", null, p.label), h("div", { class: "muted" }, (st === "active" || st === "ready") && !p.done ? (objectiveDestination(app, o)?.where ?? q.hint) : o.item ? q.hint : "")),
        h("b", { class: "tnum" }, `${fmt.int(shown)}/${fmt.int(p.need)}`));
    })),
    h("div", { class: "row between q-foot" }, rewardsLine(app, q.rewards), h("div", { class: "row", style: { gap: "6px" } }, total > 1 && (st === "active" || st === "ready") && h("span", { class: "muted nowrap" }, `${fmt.int(have)} / ${fmt.int(total)}`), action)));
}

function objLabel(app: App, o: any): string {
  const n = (id: string) => app.content.find<any>(id)?.name ?? id;
  switch (o.type) {
    case "defeat": return `Defeat ${n(o.target)}`; case "deliver": return `Bring ${n(o.item)}`; case "collect": return `Collect ${n(o.item)}`;
    case "clear": return `Clear ${n(o.target)}`; case "reach_realm": return `Reach ${n(o.realm)}`; case "explore": return `Explore ${n(o.region)}`;
    default: return o.type.replace(/_/g, " ");
  }
}

// ---------- Mission Hall ----------

export function missionHallScreen(app: App, giver = "sectloc.mission_hall"): Screen {
  return {
    id: `board:${giver}`,
    render: () => {
      const s = app.game.state, c = app.content, now = app.now();
      const loc = c.get<any>(giver);
      const list = c.byPrefix<any>("quest").filter((q) => q.giver === giver || q.turn_in === giver)
        .map((q) => ({ q, st: questStatus(s, c, q, now) })).filter((x) => x.st !== "locked" && x.st !== "done");
      const order: Record<string, number> = { ready: 0, active: 1, available: 2, cooldown: 3 };
      list.sort((a, b) => order[a.st]! - order[b.st]! || a.q.difficulty - b.q.difficulty);
      const rank = nextRank(s, c);
      const taken = list.filter((x) => x.st === "active" || x.st === "ready").length;
      const later = c.byPrefix<any>("quest").filter((q) => q.giver === giver && questStatus(s, c, q, now) === "locked").length;
      // Fame lives in the screen header (mockup mission_hall); the hall art is a band behind the board title
      const fame = rank && h("div", { class: "sb-fame" }, h("div", { class: "row between" }, h("span", null, "Sect Fame"), h("b", { class: "tnum" }, `${fmt.int(s.resources.sect_fame)} / ${fmt.int(rank.rank.fame_required)}`)),
        bar(Math.min(1, s.resources.sect_fame / rank.rank.fame_required), { cls: "gold thin" }));
      return [
        header(app),
        subbar({ help: { app, key: "missions" }, title: loc.name, cn: loc.name_cn, sub: "Masters' requests", backTo: "Sect", onBack: () => app.router.back(), end: fame }),
        h("div", { class: "board-hero", style: { backgroundImage: app.img(c.art(giver, "background")) } },
          h("div", { class: "board-t" }, "Request Board", h("span", { class: "cn" }, "悬赏榜")),
          h("div", { class: "row between", style: { alignItems: "flex-end", gap: "8px" } },
            h("div", { class: "board-sub" }, "Deliver materials from your adventures to earn Fame"),
            list.length > 0 && h("div", { class: "board-pips", "aria-label": `${taken} of ${list.length} requests taken` }, h("span", null, `Taken ${taken}/${list.length}`),
              h("span", { class: "pips" }, list.slice(0, 8).map((_x, i) => h("i", { class: i < taken && "on" })))))),
        list.length ? list.map((x) => questCard(app, x.q, { where: giver })) : h("div", { class: "glass panel center muted" }, "No requests right now."),
        h("div", { class: "board-more muted" }, icon("scroll", 12), later ? ` ${later} more request${later > 1 ? "s" : ""} will be pinned here as you explore new regions and rise in rank.` : " New requests are pinned here as you explore and rise in rank."),
      ];
    },
  };
}

// ---------- Quest log ----------

export function questLogScreen(app: App, backTo: string): Screen {
  let tab: "active" | "available" | "done" = "active";
  return {
    id: "quests",
    render: () => {
      const s = app.game.state, c = app.content, now = app.now();
      const all = c.byPrefix<any>("quest").map((q) => ({ q, st: questStatus(s, c, q, now) }));
      const groups = {
        // Milestone quests the system tracks on its own (realm goals) show only the next one, not all fourteen.
        active: all.filter((x) => x.st === "active" || x.st === "ready").filter((x, _i, arr) => !(x.q.giver === "system" && x.q.type === "cultivation" && x.st === "active") || arr.find((y) => y.q.giver === "system" && y.q.type === "cultivation" && y.st === "active") === x).sort((a, b) => (a.st === "ready" ? -1 : 0) - (b.st === "ready" ? -1 : 0) || (a.q.type === "main" ? -1 : 1)),
        available: all.filter((x) => x.st === "available" && x.q.giver !== "system"),
        done: all.filter((x) => x.st === "done" || x.st === "cooldown"),
      };
      const shown = groups[tab];
      return [
        header(app),
        subbar({ help: { app, key: "quests" }, title: "Quest Log", cn: "任务", sub: `${groups.active.length} in progress · ${Object.keys(s.progress.quests.completed).length} completed`, backTo, onBack: () => app.router.back(),
          end: h("button", { class: "btn ghost sm", onClick: () => app.router.push(achievementsScreen(app)) }, icon("fame", 13), "Achievements") }),
        h("div", { class: "row between", style: { flexWrap: "wrap", rowGap: "6px" } },
          seg(tab, [{ value: "active", label: `Active (${groups.active.length})` }, { value: "available", label: `Available (${groups.available.length})` }, { value: "done", label: "Completed" }], (v) => { tab = v; app.router.refresh(); }),
          (() => { const ready = groups.active.filter((x) => x.st === "ready").length; return ready > 0 && h("button", { class: "btn gold sm", style: { marginLeft: "auto" }, onClick: () => { const r = app.game.run("quest", app.now(), (st, cc) => turnInAll(st, cc, app.now())); app.router.toast(r.ok ? `Turned in ${(r as any).count} quest${(r as any).count > 1 ? "s" : ""}` : r.reason, r.ok ? "good" : "bad"); } }, icon("check", 13), `Turn in all (${ready})`); })()),
        shown.length ? shown.map((x) => h("div", { class: "stack" }, questCard(app, x.q, tab === "active" ? { where: x.q.turn_in } : {}),
          tab === "active" && x.q.type !== "main" && h("button", { class: "link-btn", onClick: () => confirmModal(app, { title: "Abandon this quest?", body: `${x.q.name}: its progress is lost. You can take it again from ${x.q.giver.startsWith("sectloc.") || x.q.giver.startsWith("npc.") ? c.get<any>(x.q.giver).name : "its giver"}.`, ok: "Abandon", danger: true }, () => { const r = app.game.run("quest", app.now(), (st, cc) => abandonQuest(st, cc, x.q.id)); app.router.toast(r.ok ? "Quest abandoned" : r.reason, r.ok ? "info" : "bad"); }) }, "Abandon"),
          tab === "available" && h("div", { class: "muted", style: { padding: "0 8px" } }, icon("map", 11), ` Offered by ${x.q.giver.startsWith("sectloc.") || x.q.giver.startsWith("npc.") ? c.get<any>(x.q.giver).name : "—"}`)))
          : h("div", { class: "glass panel center muted" }, tab === "active" ? "No quests in progress. Visit the Mission Hall." : tab === "available" ? "Nothing offered right now." : "No completed quests yet."),
      ];
    },
  };
}

// ---------- Achievements ----------

const CAT_ICON: Record<string, string> = { cultivation: "lotus", combat: "sword", exploration: "map", equipment: "gear", alchemy: "cauldron", beasts: "paw", sect: "temple", relationships: "fame", hidden: "lock" };

/** One compact reward chip for a row (mockup achievements): the main reward, "+N" when there are more. */
function rewardChip(app: App, r: any) {
  const c = app.content;
  const bits: { el: any; title: string }[] = [];
  if (r.spirit_stones) bits.push({ el: [icon("gem", 10), ` ${fmt.int(r.spirit_stones)}`], title: `${fmt.int(r.spirit_stones)} Spirit Stones` });
  for (const it of r.items ?? []) bits.push({ el: `${c.get<any>(it.id).name} ×${it.qty}`, title: `${it.qty}× ${c.get<any>(it.id).name}` });
  if (r.sect_fame) bits.push({ el: [icon("fame", 10), ` ${fmt.int(r.sect_fame)}`], title: `${fmt.int(r.sect_fame)} Sect Fame` });
  for (const t of r.techniques ?? []) bits.push({ el: c.get<any>(t).name, title: c.get<any>(t).name });
  for (const g of r.gear ?? []) bits.push({ el: c.get<any>(g.base).name, title: c.get<any>(g.base).name });
  if (!bits.length) return null;
  return h("span", { class: "tag ach-chip", title: bits.map((b) => b.title).join(", ") }, bits[0]!.el, bits.length > 1 && h("i", null, ` +${bits.length - 1}`));
}

export function achievementsScreen(app: App): Screen {
  let cat = "all";
  return {
    id: "achievements",
    render: () => {
      const s = app.game.state, c = app.content;
      const list = c.byPrefix<any>("ach");
      const cats = ["all", ...new Set(list.map((a) => a.category))];
      const got = (a: any) => !!s.progress.achievements[a.id];
      // closest to done first, earned ones last (they are history), hidden ones at the very end
      const pct = (a: any) => { const p = achievementProgress(s, c, a); return p.have / Math.max(1, p.need); };
      const shown = list.filter((a) => cat === "all" || a.category === cat)
        .sort((a, b) => Number(got(a)) - Number(got(b)) || Number(!!a.hidden) - Number(!!b.hidden) || pct(b) - pct(a));
      const done = list.filter(got).length;
      const share = done / Math.max(1, list.length);
      return [
        header(app),
        subbar({ title: "Achievements", cn: "成就", sub: "Milestones · rewards are granted when earned", backTo: "Quests", onBack: () => app.router.back(),
          end: h("div", { class: "sb-count" }, h("span", null, "Earned"), h("b", { class: "tnum" }, `${done} / ${list.length}`)) }),
        h("div", { class: "glass panel ach-hero" },
          h("span", { class: "ach-trophy", style: app.ui("ui.icons", "sect_fame") ? { backgroundImage: app.img(app.ui("ui.icons", "sect_fame")) } : undefined }, !app.ui("ui.icons", "sect_fame") && icon("fame", 26)),
          h("div", { class: "grow" }, h("div", { class: "ach-hero-t" }, "Path of the Cultivator"), h("div", { class: "muted" }, `${done} earned · ${list.length - done} to go`),
            h("div", { class: "ach-bar" }, bar(share, { cls: "thin gold" }), h("b", { class: "tnum" }, `${Math.round(share * 100)}%`)))),
        h("div", { class: "chips scroll-x ach-cats" }, cats.map((k) => {
          const inCat = list.filter((a) => k === "all" || a.category === k);
          return h("button", { class: ["chip", k === cat && "on"], onClick: () => { cat = k; app.router.refresh(); } }, k === "all" ? "All" : k[0]!.toUpperCase() + k.slice(1), h("i", { class: "ach-n" }, `${inCat.filter(got).length}/${inCat.length}`));
        })),
        h("div", { class: "rows" }, shown.map((a) => {
          const when = s.progress.achievements[a.id];
          const p = achievementProgress(s, c, a);
          const secret = a.hidden && !when;
          const art = c.art(a.id, "icon");
          return h("div", { class: ["glass ach", when && "got", secret && "secret"] },
            h("span", { class: "ach-ico", style: { backgroundImage: art && !secret ? app.img(art) : undefined } }, (!art || secret) && icon(secret ? "lock" : CAT_ICON[a.category] ?? "fame", 20)),
            h("div", { class: "grow ach-body" },
              h("div", { class: "ach-top" }, h("div", { class: "lbl" }, secret ? "???" : a.name), when ? h("span", { class: "tag jade ach-chip" }, icon("check", 10), " Earned") : secret ? h("span", { class: "tag ach-chip" }, "???") : rewardChip(app, a.rewards)),
              h("div", { class: "desc" }, secret ? "Hidden achievement · keep exploring" : a.description),
              !when && !secret && p.need > 1 && h("div", { class: "ach-bar" }, bar(p.have / p.need, { cls: "thin" }), h("b", { class: "tnum" }, `${fmt.int(Math.min(p.have, p.need))} / ${fmt.int(p.need)}`))));
        })),
      ];
    },
  };
}

export { section };
