import { h, fmt } from "../core/dom.ts";
import type { App } from "../../app.ts";
import type { OfflineReport } from "../../engine/cultivation.ts";
import { breakThroughAll } from "../../engine/actions.ts";

export function topbar(app: App) {
  const s = app.game.state;
  const realm = app.content.get<any>(s.character.realm);
  const rank = app.content.get<any>(s.character.rank);
  return h("header", { class: "topbar" },
    h("div", { class: "portrait", style: { backgroundImage: app.img(app.content.artAny(s.character.npc, "portrait", "full_body")) } }),
    h("div", null, h("div", { class: "name" }, s.character.name), h("div", { class: "sub" }, `Azure Cloud Sect · ${rank.name} · ${realm.name} ${fmt.roman(s.character.stage)}`)),
    h("div", { class: "pill" }, "◈ ", fmt.int(s.resources.spirit_stones)));
}

export function placeholderScreen(app: App, title: string, note: string) {
  return [topbar(app), h("section", { class: "panel" }, h("h2", null, title), h("p", { class: "muted" }, note))];
}

/** Offline rewards dialog (foundation version of the mockup's "Offline gains" screen). */
export function offlineModal(app: App, r: OfflineReport) {
  return {
    id: "offline", dismissible: false,
    render: (close: () => void) => h("div", null,
      h("h2", null, r.clockMovedBack ? "The clock moved back" : "Welcome back"),
      r.clockMovedBack
        ? h("p", { class: "muted center" }, "Your device clock is earlier than your last session, so no cultivation could be counted. Time will be credited normally from now on.")
        : h("dl", { class: "kv" },
            h("dt", null, "Time away"), h("dd", null, fmt.duration(r.elapsedMs)),
            h("dt", null, "Cultivation counted"), h("dd", null, fmt.duration(r.creditedMs), r.capped ? h("span", { class: "muted" }, " (capped)") : null),
            h("dt", null, "Qi gained"), h("dd", { class: "jade" }, `+${fmt.compact(r.qiGained)}`),
            h("dt", null, "Breakthroughs ready"), h("dd", { class: r.stagesAvailable ? "gold" : "" }, String(r.stagesAvailable), r.majorAvailable ? " + major" : "")),
      h("div", { class: "grid-2", style: { marginTop: "14px" } },
        h("button", { class: "btn", onClick: close }, "Continue"),
        h("button", { class: "btn primary", disabled: r.stagesAvailable === 0, onClick: () => { const x = app.game.run("offline breakthroughs", app.now(), (s, c) => breakThroughAll(s, c, { now: app.now() })); if (x.ok) app.router.toast(`${x.count} stages gained`, "good"); close(); } }, `Break through ×${r.stagesAvailable}`))),
  };
}
