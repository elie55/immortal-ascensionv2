/** "While you were away" and "Your clock moved back" dialogs (mockup board "systems"). */
import { h, fmt } from "../core/dom.ts";
import { icon } from "../core/icons.ts";
import { bar } from "../core/kit.ts";
import type { Overlay } from "../core/router.ts";
import type { App } from "../../app.ts";
import type { OfflineReport } from "../../engine/cultivation.ts";
import { qiForNextStage, stageProgress } from "../../engine/cultivation.ts";
import { breakThroughAll } from "../../engine/actions.ts";
import { minorBurst } from "./cultivate.ts";

export function offlineModal(app: App, r: OfflineReport): Overlay {
  const c = app.content;
  if (r.clockMovedBack) return {
    id: "offline", kind: "modal", dismissible: false, cls: "offline",
    render: (close) => h("div", null,
      h("div", { class: "cn m-cn" }, "时 序 有 乱"),
      h("div", { class: "m-title" }, "Your clock moved back"),
      h("div", { class: "m-sub" }, `Welcome back, ${app.game.state.character.name}`),
      h("div", { class: "warnbox" }, icon("warning", 26), h("div", null, h("b", null, "Offline time can't be counted this time"),
        h("div", { class: "muted" }, "Your phone's clock is earlier than the last time the game saw it. To keep saves fair, the time away is not counted until the clock catches up again."))),
      h("div", { class: "rows", style: { margin: "10px 0 14px" } },
        h("div", { class: "setrow" }, icon("shield", 18), h("div", { class: "grow" }, h("div", { class: "lbl" }, "Nothing was lost"), h("div", { class: "desc" }, "Your Qi, items and saves are exactly as you left them")), h("span", { class: "tag jade" }, "Safe")),
        h("div", { class: "setrow" }, icon("qi", 18), h("div", { class: "grow" }, h("div", { class: "lbl" }, "Cultivation continues now"), h("div", { class: "desc" }, "Online play counts normally from this moment"))),
        h("div", { class: "setrow" }, icon("globe", 18), h("div", { class: "grow" }, h("div", { class: "lbl" }, "Time zones don't matter"), h("div", { class: "desc" }, "The game uses universal time, so travelling never triggers this")))),
      h("button", { class: "btn jade block", onClick: close }, "Continue")),
  };
  return {
    id: "offline", kind: "modal", dismissible: false, cls: "offline",
    render: (close) => {
      const s = app.game.state;
      const capH = c.rules.offline.cap_hours;
      const method = c.get<any>(s.character.method);
      const need = qiForNextStage(s, c);
      const prog = stageProgress(s, c);
      const full = r.stagesAvailable > 0 || r.majorAvailable;
      return h("div", null,
        h("div", { class: "cn m-cn" }, "闭 关 归 来"),
        h("div", { class: "m-title" }, "While you were away"),
        h("div", { class: "m-sub" }, `You kept cultivating with ${method.name}`),
        h("div", { class: "glass panel", style: { marginBottom: "10px" } },
          h("div", { class: "row between" }, h("span", { class: "dim" }, "Time away"), h("b", { class: "tnum", style: { fontSize: "calc(17rem / 15)" } }, fmt.duration(r.elapsedMs))),
          h("div", { style: { margin: "6px 0 4px" } }, bar(Math.min(1, r.elapsedMs / (capH * 3_600_000)), { cls: "thin" })),
          h("div", { class: "row between muted" }, h("span", null, `Counted: ${fmt.duration(Math.min(r.elapsedMs, capH * 3_600_000))} (${capH} h offline limit)`), r.capped && h("span", null, "The rest isn't counted"))),
        h("div", { class: "glass panel hi qi-gain" },
          h("div", { class: "row" }, h("span", { class: "qi-ico" }, icon("qi", 26)),
            h("div", { class: "grow" }, h("div", { class: "qi-big" }, `+${fmt.compact(r.qiGained)} Qi`),
              h("div", { class: "muted" }, `Stage ${s.character.stage} is ${full ? "full" : fmt.pct(prog * 100, 0)} · ${fmt.compact(s.character.qi)} / ${fmt.compact(need)} Qi`))),
          h("div", { style: { marginTop: "8px" } }, bar(prog, { label: full ? (r.stagesAvailable > 1 ? `${r.stagesAvailable} stages ready` : "Ready to break through") : undefined })),
          full && h("div", { class: "muted", style: { marginTop: "6px" } }, icon("info", 12), " Qi stops at a bottleneck. Break through to keep growing.")),
        h("div", { class: "rows", style: { margin: "10px 0 12px" } },
          h("div", { class: "setrow" }, icon("clock", 18), h("div", { class: "grow" }, h("div", { class: "lbl" }, `Offline efficiency ${Math.round(c.rules.offline.efficiency * 100)}%`), h("div", { class: "desc" }, "Active play cultivates faster than time away")))),
        h("div", { class: "grid-2" },
          h("button", { class: "btn", onClick: close }, "Continue"),
          h("button", { class: "btn gold", disabled: r.stagesAvailable === 0, onClick: () => {
            const x = app.game.run("offline breakthroughs", app.now(), (st, ct) => breakThroughAll(st, ct, { now: app.now() }));
            close();
            if (x.ok) minorBurst(app, x.count);
          } }, h("span", { class: "stack", style: { gap: "0" } }, h("span", null, r.stagesAvailable > 1 ? `Break Through ×${r.stagesAvailable}` : "Break Through"), h("span", { style: { fontSize: "calc(10.5rem / 15)", opacity: ".8" } }, "Success 100%")))),
        h("div", { class: "muted center", style: { marginTop: "8px" } }, icon("shield", 11), " Phone clock checked · everything adds up"));
    },
  };
}
