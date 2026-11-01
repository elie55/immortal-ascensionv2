/** Sweep sheet (engine/sweep.ts): pick a cleared place and how many runs, fight them instantly, see what came of it. */
import { h, fmt } from "../core/dom.ts";
import { icon } from "../core/icons.ts";
import { stepper } from "../core/kit.ts";
import type { App } from "../../app.ts";
import { sweepOptions, sweep, SWEEP_MAX_RUNS, type SweepResult } from "../../engine/sweep.ts";
import { energyNow } from "../../engine/cultivation.ts";
import { gearTile, gearName } from "./items.ts";
import { peekable } from "../core/peek.ts";
import { itemPeek } from "../peeks.ts";

export function sweepSheet(app: App, nodeId?: string) {
  let picked = nodeId; let runs = 0;
  app.router.open({ id: "sweep", kind: "sheet", render: (close) => {
    const s = app.game.state, c = app.content;
    const options = sweepOptions(s, c, app.now());
    const opt = options.find((o) => o.node.id === picked) ?? (nodeId ? options.find((o) => o.node.id === nodeId) : options[0]);
    if (opt && picked !== opt.node.id) { picked = opt.node.id; runs = 0; }
    if (opt && runs === 0) runs = Math.max(1, Math.min(opt.runs, 10));
    const energy = energyNow(s, c, app.now());
    const go = () => {
      if (!opt) return;
      const r = app.game.run("sweep", app.now(), (st, cc) => sweep(st, cc, app.now(), opt.node.id, runs));
      if (!r.ok) { app.router.toast(r.reason, "bad"); return; }
      close(); resultSheet(app, opt.node.name, r);
    };
    return h("div", { class: "stack" },
      h("div", { class: "sec-h" }, h("h3", null, "Sweep"), h("span", { class: "hint" }, `${fmt.int(energy)} energy banked`)),
      h("div", { class: "muted" }, "Fight a place you already cleared, instantly, with your auto-battle rules. Every run costs its energy and pays its drops; a defeat stops the sweep."),
      options.length ? h("div", { class: "rows" }, options.map((o) => h("button", { class: ["setrow", o.node.id === opt?.node.id && "on"], onClick: () => { picked = o.node.id; runs = 0; app.router.refresh(); } },
        icon(o.node.kind === "elite" ? "star" : "sword", 16),
        h("div", { class: "grow" }, h("div", { class: "lbl" }, o.node.name, h("span", { class: "muted" }, ` · ${c.get<any>(o.region).name}`)), h("div", { class: "desc" }, `${o.cost} energy a run · up to ${o.runs} runs · ${Math.round(o.winChance * 100)}% expected`)),
        o.node.id === opt?.node.id && h("span", { class: "tag jade" }, icon("check", 10)))))
        : h("div", { class: "muted center" }, "Clear a place by hand first; sweeping repeats what you have already beaten."),
      opt && h("div", { class: "glass panel" },
        h("div", { class: "row between" }, h("span", { class: "muted up" }, "Runs"), stepper(runs, 1, Math.max(1, Math.min(SWEEP_MAX_RUNS, opt.runs)), (v) => { runs = v; app.router.refresh(); })),
        h("div", { class: "row between muted", style: { marginTop: "6px" } }, h("span", null, `Costs ${fmt.int(runs * opt.cost)} energy`), h("span", null, opt.winChance < 0.5 ? "Risky: the auto rules lost a test fight" : "Looks safe")),
        h("button", { class: "btn gold block", style: { marginTop: "8px" }, disabled: opt.runs < 1, onClick: go }, opt.runs < 1 ? "Not enough energy" : `Sweep ×${runs}`)));
  } });
}

function resultSheet(app: App, place: string, r: SweepResult) {
  app.router.open({ id: "sweep-result", kind: "sheet", render: (close) => {
    const s = app.game.state, c = app.content;
    return h("div", { class: "stack" },
      h("div", { class: "sec-h" }, h("h3", null, `${place} · swept`), h("span", { class: "hint" }, `${r.wins} / ${r.runs} won${r.stoppedBy === "defeat" ? " · stopped by a defeat" : r.stoppedBy === "energy" ? " · energy ran out" : ""}`)),
      h("div", { class: "row", style: { justifyContent: "center", flexWrap: "wrap", gap: "6px" } },
        r.drops.spirit_stones > 0 && h("span", { class: "tag gold" }, icon("gem", 10), ` +${fmt.int(r.drops.spirit_stones)}`), r.drops.sect_fame > 0 && h("span", { class: "tag" }, icon("fame", 10), ` +${r.drops.sect_fame} Fame`), r.masteryXp > 0 && h("span", { class: "tag jade" }, `Mastery +${r.masteryXp}`)),
      (r.drops.items.length || r.gearUids.length) ? h("div", { class: "drop-grid" },
        ...r.gearUids.filter((u) => s.inventory.gear[u]).map((u) => h("div", { class: "drop" }, gearTile(app, u), h("div", { class: "tile-name" }, gearName(app, s.inventory.gear[u]!)))),
        ...r.drops.items.map((it) => { const def = c.get<any>(it.id); const art = c.art(it.id, "icon"); return peekable(h("div", { class: "drop" }, h("div", { class: `tile r-${def.rarity ?? "common"}` }, h("div", { class: "in" }, art ? h("div", { class: "art", style: { backgroundImage: app.img(art) } }) : icon("sparkle", 20)), h("span", { class: "qty" }, `×${it.qty}`)), h("div", { class: "tile-name" }, def.name)), app.router, () => itemPeek(app, it.id, it.qty)); }))
        : h("div", { class: "muted center" }, "Nothing but stones this time."),
      h("button", { class: "btn gold block", onClick: close }, "Done"));
  } });
}
