/**
 * Cultivate tab — functional foundation version. Shows live Qi, rate breakdown, ETA, breakthrough
 * controls and major-breakthrough requirements. The mockup-faithful layout replaces this view later;
 * everything it needs is already exposed by the engine calls used here.
 */
import { h, fmt } from "../core/dom.ts";
import type { App } from "../../app.ts";
import { qiRate, qiForNextStage, stageProgress, etaToNextStage, majorRequirements, isFinalStage, countAffordableStages, energyNow, energyMax } from "../../engine/cultivation.ts";
import { computeStats } from "../../engine/stats.ts";
import { breakThrough, breakThroughAll, useConsumable, type ActionResult } from "../../engine/actions.ts";
import { topbar } from "./shared.ts";

export function cultivateScreen(app: App) {
  const { game, content } = app;
  const s = game.state;
  const now = app.now();
  const realm = content.get<any>(s.character.realm);
  const rate = qiRate(s, content, now);
  const need = qiForNextStage(s, content);
  const prog = stageProgress(s, content);
  const final = isFinalStage(s);
  const reqs = final ? majorRequirements(s, content) : [];
  const canMajor = final && reqs.every((r) => r.met);
  const affordable = countAffordableStages(s, content);
  const stats = computeStats(s, content);
  const pills = content.byPrefix<any>("cons").filter((c) => c.effects.qi || c.effects.cultivation_boost).filter((c) => (s.inventory.stacks[c.id] ?? 0) > 0);

  const act = <R extends ActionResult<any>>(label: string, fn: (st: typeof s, c: typeof content) => R): R => {
    const r = game.run(label, app.now(), fn);
    const rr = r as ActionResult<any>;
    if (!rr.ok) app.router.toast(rr.reason, "bad");
    return r;
  };

  return [
    topbar(app),
    h("section", { class: "panel center" },
      h("div", { class: "muted" }, `${realm.name} · Stage ${s.character.stage}`),
      h("div", { class: "big-number" }, fmt.compact(s.character.qi), h("span", { class: "muted", style: { fontSize: "13px" } }, ` / ${fmt.compact(need)} Qi`)),
      h("div", { class: "bar qi", style: { marginTop: "8px" } }, h("i", { style: { width: `${(prog * 100).toFixed(1)}%` } }), h("span", null, fmt.pct(prog * 100))),
      h("div", { class: "row", style: { marginTop: "8px" } },
        h("span", { class: "jade" }, `+${fmt.num(rate.perSecond * 60, 1)} Qi/min`),
        h("span", { class: "muted" }, prog >= 1 ? "Ready to break through" : `Next stage in ${fmt.duration(etaToNextStage(s, content, now))}`)),
      final
        ? h("button", { class: "btn primary block", style: { marginTop: "12px" }, disabled: !canMajor, onClick: () => {
            const r = act("major breakthrough", (st, c) => breakThrough(st, c, { now: app.now() }));
            if (r.ok) app.router.toast(r.success ? `Breakthrough! Welcome to ${content.get<any>(game.state.character.realm).name}` : `The heavens resist… (${Math.round((r.chance ?? 0) * 100)}% chance)`, r.success ? "good" : "bad", 3500);
          } }, `Major Breakthrough → ${content.nextRealm(realm.id)?.name ?? "—"}`)
        : h("div", { class: "grid-2", style: { marginTop: "12px" } },
            h("button", { class: "btn primary", disabled: prog < 1, onClick: () => { const r = act("breakthrough", (st, c) => breakThrough(st, c, { now: app.now() })); if (r.ok) app.router.toast(`Stage ${game.state.character.stage} reached`, "good"); } }, "Break Through"),
            h("button", { class: "btn", disabled: affordable < 2, onClick: () => { const r = act("breakthrough all", (st, c) => breakThroughAll(st, c, { now: app.now() })); if (r.ok) app.router.toast(`${r.count} stages gained`, "good"); } }, `Break Through ×${affordable}`)),
    ),
    final && h("section", { class: "panel" },
      h("h3", null, "Major breakthrough requirements"),
      h("dl", { class: "kv" }, reqs.flatMap((r) => [h("dt", null, r.label), h("dd", { class: r.met ? "jade" : "danger" }, r.kind === "qi" ? `${fmt.compact(r.have)} / ${fmt.compact(r.need)}` : `${r.have} / ${r.need}`)]))),
    h("section", { class: "panel" },
      h("h3", null, "Qi generation"),
      h("dl", { class: "kv" },
        h("dt", null, "Base rate"), h("dd", null, `${fmt.num(rate.base * 60, 1)} /min`),
        ...rate.factors.flatMap((f) => [h("dt", null, f.label), h("dd", { class: f.mult >= 1 ? "jade" : "danger" }, `×${f.mult.toFixed(2)}`)]),
        h("dt", { class: "gold" }, "Total"), h("dd", { class: "gold" }, `${fmt.num(rate.perSecond * 60, 1)} /min`))),
    pills.length > 0 && h("section", { class: "panel" },
      h("h3", null, "Pills"),
      h("div", { class: "list" }, pills.map((p) => h("div", { class: "item" },
        h("div", { class: "icon", style: { backgroundImage: app.img(content.art(p.id, "icon")) } }),
        h("div", { class: "grow" }, h("div", { class: "title" }, p.name, h("span", { class: "muted" }, ` ×${s.inventory.stacks[p.id]}`)), h("div", { class: "muted" }, p.effects.qi ? `+${fmt.compact(p.effects.qi)} Qi` : `×${p.effects.cultivation_boost.mult} Qi rate for ${p.effects.cultivation_boost.minutes} min`)),
        h("button", { class: "btn small", onClick: () => { const r = act("use pill", (st, c) => useConsumable(st, c, { now: app.now() }, p.id)); if (r.ok) app.router.toast(`Used ${p.name}`, "good"); } }, "Use"))))),
    h("section", { class: "panel" },
      h("h3", null, "Combat power"),
      h("div", { class: "row" }, h("span", { class: "big-number", style: { fontSize: "22px" } }, fmt.int(stats.cp)),
        h("span", { class: "muted" }, `HP ${fmt.int(stats.total.hp!)} · ATK ${fmt.int(stats.total.atk!)} · DEF ${fmt.int(stats.total.def!)}`)),
      h("div", { class: "muted", style: { marginTop: "6px" } }, `Energy ${Math.floor(energyNow(s, content, now))} / ${energyMax(s, content)} · ${fmt.int(s.resources.spirit_stones)} spirit stones · Fame ${fmt.int(s.resources.sect_fame)}`)),
  ];
}
