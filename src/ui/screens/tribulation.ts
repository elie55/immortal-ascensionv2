/**
 * Heavenly tribulation as a set piece (docs/COMBAT.md "Encounters"): the preparation sheet that opens from the
 * breakthrough ceremony — what comes (waves, the spirit), what you bring (HP, shields, heals, resistance, pills), what
 * a failure costs — and the Begin. The fight itself is the battle screen with the lightning hazard; the result panel
 * already says "Endured".
 */
import { h, fmt } from "../core/dom.ts";
import { icon } from "../core/icons.ts";
import { ELEMENT_LABEL } from "../core/kit.ts";
import type { App } from "../../app.ts";
import { canStart } from "../../engine/encounter.ts";
import { computeStats } from "../../engine/stats.ts";
import { startEncounter } from "./battle.ts";
import { techniquesScreen } from "./techniques.ts";

export function tribulationSheet(app: App, tribId: string, backTo = "Cultivate") {
  app.router.open({ id: "tribulation", kind: "sheet", render: (close) => {
    const s = app.game.state, c = app.content;
    const t = c.get<any>(tribId);
    const spirit = c.get<any>(t.spirit);
    const stats = computeStats(s, c).total;
    const rounds = t.waves.length * c.combat.tribulation.turns_per_wave;
    const prog = s.progress.tribulations[tribId];
    const can = canStart(s, c, { kind: "tribulation", id: tribId }, app.now());
    const equipped = s.techniques.actives.filter((x): x is string => !!x).map((id) => c.get<any>(id));
    const shields = equipped.filter((x) => x.shield_pct_max_hp || x.applies?.some((a: any) => a.status === "status.shield" || a.status === "status.invuln"));
    const heals = equipped.filter((x) => x.heal_pct || x.applies?.some((a: any) => a.status === "status.regen"));
    const elems: string[] = [...new Set<string>(t.waves.map((w: any) => w.element as string))];
    const resOf = (e: string) => Math.round(stats[`elem_res.${e.split(".")[1]}`] ?? 0);
    const pills = Object.entries(s.inventory.stacks).filter(([id, q]) => q > 0 && id.startsWith("cons.") && c.get<any>(id).usable_in_battle && (c.get<any>(id).effects?.hp_pct || c.get<any>(id).effects?.sp_pct));
    const hp = s.character.hp ?? stats.hp;
    const bolt = (w: any) => Math.round((spirit.stats.atk ?? 100) * c.combat.tribulation.bolt_power * w.dmg_mult / 100 * Math.max(0.1, 1 - resOf(w.element) / 100));
    const check = (ok: boolean, good: string, bad: string) => h("div", { class: ["setrow", ok ? "on" : ""] }, h("span", { class: ["df-way-ico", !ok && "warn"] }, icon(ok ? "check" : "warning", 15)), h("div", { class: "grow" }, h("div", { class: "lbl" }, ok ? good : bad)));
    return h("div", { class: "stack trib-prep" },
      h("div", { class: "sec-h" }, h("h3", null, t.name), h("span", { class: "hint" }, t.name_cn)),
      h("div", { class: "dim" }, t.description),
      h("div", { class: "glass panel" },
        h("div", { class: "row" }, h("span", { class: "df-art trib-spirit", style: { backgroundImage: app.img(c.artAny(spirit.id, "icon", "battle")) } }),
          h("div", { class: "grow" }, h("div", { class: "muted up" }, `${c.get<any>(spirit.element).name} · CP ${fmt.int(spirit.cp)}`), h("div", { class: "lbl", style: { fontSize: "calc(15rem / 15)" } }, spirit.name), h("div", { class: "muted" }, `Survive ${rounds} rounds, or fell it. You face it alone.`))),
        h("div", { class: "trib-waves" }, t.waves.map((w: any, i: number) => h("div", { class: "trib-wave" }, h("b", null, `Wave ${i + 1}`), h("span", null, `${w.bolts} bolts · ${ELEMENT_LABEL[w.element.split(".")[1]] ?? w.element}`), h("span", { class: "muted" }, `≈ ${fmt.compact(bolt(w))} each`))))),
      h("div", { class: "rows" },
        check(hp >= stats.hp * 0.95, `Full health: ${fmt.compact(hp)} HP`, `Wounded: ${fmt.compact(hp)} / ${fmt.compact(stats.hp)} HP — rest at the sect first`),
        check(shields.length > 0, `Shield ready: ${shields.map((x) => x.name).join(", ")}`, "No shield technique equipped — a shield absorbs a whole wave"),
        check(heals.length > 0, `Heal ready: ${heals.map((x) => x.name).join(", ")}`, "No healing technique equipped"),
        check(elems.every((e) => resOf(e) >= 10), `${elems.map((e) => `${ELEMENT_LABEL[e.split(".")[1]]} resistance ${resOf(e)}%`).join(" · ")}`, `Low ${elems.map((e) => ELEMENT_LABEL[e.split(".")[1]]).join("/")} resistance (${elems.map(resOf).join("/")}%) — gear or Elemental Harmony helps`),
        check(pills.length > 0, `Pills in the bag: ${pills.map(([id, q]) => `${c.get<any>(id).name} ×${q}`).join(", ")}`, "No healing pills usable in battle")),
      h("div", { class: "muted" }, icon("info", 11), ` A failure costs ${Math.round(t.failure.qi_loss_pct * 100)}% of the stage's Qi and ${t.failure.retry_cooldown_min} minutes before the next try${prog?.attempts ? ` · ${prog.attempts} attempt${prog.attempts === 1 ? "" : "s"} so far` : ""}.`),
      h("div", { class: "grid-2" },
        h("button", { class: "btn ghost", onClick: () => { close(); app.router.setTab("character"); app.router.push(techniquesScreen(app, backTo)); } }, icon("sword", 14), "Techniques"),
        h("button", { class: "btn gold", disabled: !can.ok, onClick: () => { close(); startEncounter(app, { kind: "tribulation", id: tribId }); } }, can.ok ? h("span", { class: "stack", style: { gap: "0" } }, h("span", null, "Face the heavens"), h("span", { class: "cta-s" }, "Begin the tribulation")) : can.reason)));
  } });
}
