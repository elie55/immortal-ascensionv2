/** Rank promotion modal (mockup "fame_milestone"): new rank, its benefits and what it opens. */
import { h } from "../core/dom.ts";
import { icon } from "../core/icons.ts";
import type { Overlay } from "../core/router.ts";
import type { App } from "../../app.ts";
import { rewardsLine } from "./adventure.ts";

export function rankUpModal(app: App, rankId: string): Overlay {
  const c = app.content;
  const r = c.get<any>(rankId);
  const b = r.benefits ?? {};
  return { id: "rank-up", kind: "modal", cls: "celebrate", render: (close) => h("div", { class: "center" },
    h("div", { class: "muted up gold-t" }, "Promotion"),
    h("div", { class: "result-title" }, r.name),
    r.name_cn && h("div", { class: "cn", style: { fontSize: "calc(18rem / 15)" } }, r.name_cn),
    h("div", { class: "dim", style: { margin: "8px 0" } }, r.description),
    h("div", { class: "rows", style: { textAlign: "left" } },
      b.qi_mult && b.qi_mult !== 1 && h("div", { class: "setrow" }, icon("qi", 16), h("div", { class: "grow" }, h("div", { class: "lbl" }, `Cultivation ×${b.qi_mult}`), h("div", { class: "desc" }, "Sect resources flow to you"))),
      b.shop_tier > 1 && h("div", { class: "setrow" }, icon("gem", 16), h("div", { class: "grow" }, h("div", { class: "lbl" }, `Shop tier ${b.shop_tier}`), h("div", { class: "desc" }, "Better stock in sect shops"))),
      (b.unlocks ?? []).map((u: string) => h("div", { class: "setrow" }, icon("unlock", 16), h("div", { class: "grow" }, h("div", { class: "lbl" }, c.find<any>(u)?.name ?? u), h("div", { class: "desc" }, "Now open to you"))))),
    b.rewards && rewardsLine(app, b.rewards),
    h("button", { class: "btn gold block", style: { marginTop: "12px" }, onClick: close }, "Accept the honour")) };
}
