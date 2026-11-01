/**
 * Today's board (engine/daily.ts) on the Cultivate page: five tasks as pips, the claim when four are done, and a
 * sheet with the details and a Go button per task.
 */
import { h, fmt } from "../core/dom.ts";
import { icon } from "../core/icons.ts";
import type { App } from "../../app.ts";
import { dailyTasks, dailyReward, dailyClaimed, dailyDone, claimDaily, DAILY_NEED, type DailyTask } from "../../engine/daily.ts";
import { missionHallScreen } from "./quests.ts";
import { dungeonHubScreen } from "./delves.ts";
import { arenaScreen } from "./tournament.ts";
import { openLocation } from "./sect.ts";
import { peekable } from "../core/peek.ts";

function goTo(app: App, t: DailyTask) {
  const c = app.content;
  app.router.close();
  switch (t.go) {
    case "missions": app.router.setTab("sect"); app.router.push(missionHallScreen(app)); break;
    case "adventure": case "gather": app.router.setTab("adventure"); break;
    case "dungeons": app.router.setTab("adventure"); app.router.push(dungeonHubScreen(app, "dungeons")); break;
    case "tournament": { app.router.setTab("sect"); const loc = c.byPrefix<any>("sectloc").find((l) => (l.features ?? []).includes("tournament")); if (loc) openLocation(app, loc.id); app.router.push(arenaScreen(app, loc?.name ?? "Sect")); break; }
  }
}

export function todayPanel(app: App) {
  const s = app.game.state, c = app.content;
  const tasks = dailyTasks(s, c);
  const done = dailyDone(s, c), claimed = dailyClaimed(s);
  const canClaim = !claimed && done >= DAILY_NEED;
  const rw = dailyReward(s, c);
  return peekable(h("button", { class: ["glass panel today", canClaim && "ready", claimed && "claimed"], onClick: () => todaySheet(app), "aria-label": `Today's board: ${done} of ${tasks.length} done` },
    h("div", { class: "row between" },
      h("div", { class: "row", style: { gap: "8px" } }, h("span", { class: "td-ico" }, icon("clock", 14)), h("b", { class: "td-title" }, "Today"), h("span", { class: "muted" }, `${done} / ${tasks.length}`)),
      claimed ? h("span", { class: "tag jade" }, icon("check", 10), " Claimed") : canClaim ? h("span", { class: "tag gold" }, "Claim reward") : h("span", { class: "muted" }, `${DAILY_NEED} for the reward`)),
    h("div", { class: "td-pips" }, tasks.map((t) => h("span", { class: ["td-pip", t.done && "done"], title: t.label }, icon(t.icon, 13), h("i", null, `${t.have}/${t.need}`))))),
    app.router, () => h("div", null, h("div", { class: "pk-name" }, "Today's board"), h("div", { class: "pk-desc" }, `Finish ${DAILY_NEED} of the ${tasks.length} tasks for ${fmt.int(rw.spirit_stones)} stones, ${rw.contribution} Contribution and ${rw.items[0]!.qty} refining stones. Resets at midnight (UTC).`)));
}

export function todaySheet(app: App) {
  app.router.open({ id: "today", kind: "sheet", render: (close) => {
    const s = app.game.state, c = app.content;
    const tasks = dailyTasks(s, c);
    const done = dailyDone(s, c), claimed = dailyClaimed(s);
    const rw = dailyReward(s, c);
    const claim = () => { const r = app.game.run("daily", app.now(), (st, cc) => claimDaily(st, cc)); if (!r.ok) app.router.toast(r.reason, "bad"); else { app.router.toast("Today's reward claimed", "good"); close(); } };
    return h("div", { class: "stack" },
      h("div", { class: "sec-h" }, h("h3", null, "Today"), h("span", { class: "hint" }, `${done} / ${tasks.length} done · resets at midnight UTC`)),
      h("div", { class: "rows" }, tasks.map((t) => h("div", { class: ["setrow", t.done && "on"] }, h("span", { class: "df-way-ico" }, icon(t.icon, 16)),
        h("div", { class: "grow" }, h("div", { class: "lbl" }, t.label), h("div", { class: "desc" }, t.done ? "Done" : `${t.have} / ${t.need}`)),
        t.done ? h("span", { class: "tag jade" }, icon("check", 10)) : h("button", { class: "btn sm", onClick: () => goTo(app, t) }, "Go")))),
      h("div", { class: "glass panel" }, h("div", { class: "muted up" }, "Reward"),
        h("div", { class: "row", style: { flexWrap: "wrap", gap: "5px", margin: "4px 0 8px" } }, h("span", { class: "tag gold" }, icon("gem", 10), ` ${fmt.int(rw.spirit_stones)}`), h("span", { class: "tag jade" }, icon("scroll", 10), ` ${rw.contribution} Contribution`), rw.items.map((q) => h("span", { class: "tag" }, `${q.qty}× ${c.get<any>(q.id).name}`))),
        h("button", { class: ["btn block", !claimed && done >= DAILY_NEED && "gold"], disabled: claimed || done < DAILY_NEED, onClick: claim }, claimed ? "Claimed today" : done >= DAILY_NEED ? "Claim" : `Finish ${DAILY_NEED - done} more`)));
  } });
}
