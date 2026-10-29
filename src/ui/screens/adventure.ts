/** Adventure tab (mockup "world_regions"): region cards with lock state. Nodes, battles and dungeons come with the combat engine. */
import { h, fmt } from "../core/dom.ts";
import { icon } from "../core/icons.ts";
import { header, subbar } from "../core/kit.ts";
import type { App } from "../../app.ts";
import { checkUnlock } from "../../engine/unlock.ts";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];

export function adventureScreen(app: App) {
  const s = app.game.state, c = app.content;
  const regions = c.byPrefix<any>("region").slice().sort((a, b) => a.order - b.order);
  const discovered = Object.keys(s.progress.regions).length;
  return [
    header(app),
    subbar({ title: "World Regions", cn: "天下", sub: `${discovered} of ${regions.length} open · battles arrive with the combat engine` }),
    h("div", { class: "region-grid" }, regions.map((r) => {
      const open = !!s.progress.regions[r.id] || checkUnlock(s, c, r.unlock).ok;
      const nodes = c.nodesOf(r.id).length;
      const cleared = Object.keys(s.progress.regions[r.id]?.nodes ?? {}).length;
      return h("button", { class: ["region-card glass", !open && "locked"], onClick: () => app.router.toast(open ? `${r.name}: the map opens with the combat engine` : (checkUnlock(s, c, r.unlock).reasons[0] ?? "Locked")) },
        h("div", { class: "rc-art", style: { backgroundImage: app.img(c.art(r.id, "card")) } }, h("span", { class: "rc-num" }, ROMAN[r.order - 1]), !open && h("span", { class: "rc-lock" }, icon("lock", 18))),
        h("div", { class: "rc-body" },
          h("div", { class: "rc-name" }, r.name, r.name_cn && h("span", { class: "cn" }, ` ${r.name_cn}`)),
          h("div", { class: "muted" }, `${c.get<any>(r.realm_range.min).name}${r.realm_range.max !== r.realm_range.min ? ` – ${c.get<any>(r.realm_range.max).name}` : ""}`),
          h("div", { class: "muted" }, open ? `${cleared} / ${nodes} places` : "Locked")));
    })),
    h("div", { class: "muted center", style: { padding: "6px" } }, `${fmt.int(regions.reduce((n, r) => n + c.nodesOf(r.id).length, 0))} places to explore across ${regions.length} regions`),
  ];
}
