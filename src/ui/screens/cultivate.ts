/**
 * Cultivate tab (mockup "cultivation_screen"): realm title with stage pips over the meditation art, the
 * Breakthrough button, the method panel with the Qi bar and rate, and shortcut tiles.
 */
import { h, fmt } from "../core/dom.ts";
import { icon } from "../core/icons.ts";
import { header, bar, section } from "../core/kit.ts";
import type { App } from "../../app.ts";
import { qiRate, qiForNextStage, stageProgress, etaToNextStage, majorRequirements, majorChance, isFinalStage, countAffordableStages, energyNow, energyMax, isBreakthroughItem } from "../../engine/cultivation.ts";
import { computeStats, masteryLevel, type StatBlock } from "../../engine/stats.ts";
import { breakThrough, breakThroughAll, useConsumable, switchMethod, type ActionResult } from "../../engine/actions.ts";
import { attrLabel, attrValue } from "../core/kit.ts";
import { settingsScreen } from "./menu.ts";

const CN_NUM = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

export function cultivateScreen(app: App) {
  const { game, content: c } = app;
  const s = game.state;
  const now = app.now();
  const realm = c.get<any>(s.character.realm);
  const next = c.nextRealm(realm.id);
  const rate = qiRate(s, c, now);
  const need = qiForNextStage(s, c);
  const prog = stageProgress(s, c);
  const final = isFinalStage(s);
  const reqs = final ? majorRequirements(s, c) : [];
  const ready = final ? reqs.every((r) => r.met) : prog >= 1;
  const chance = final ? majorChance(s, c) : null;
  const affordable = countAffordableStages(s, c);
  const method = c.get<any>(s.character.method);
  const mastery = masteryLevel(s.character.methodMastery[method.id] ?? 0, method.mastery);
  const root = c.get<any>(s.character.root);

  const pips = h("div", { class: "pips" }, [...Array(9).keys()].map((i) => h("i", { class: [i < s.character.stage - 1 && "done", i === s.character.stage - 1 && "cur"] })));
  const btSub = final
    ? (ready ? `Success chance ${Math.round(chance!.total * 100)}%${chance!.parts.map((p) => ` · ${p.label} +${Math.round(p.bonus * 100)}%`).join("")}` : `Major breakthrough · ${reqs.filter((r) => !r.met).length} requirement${reqs.filter((r) => !r.met).length === 1 ? "" : "s"} missing`)
    : (ready ? (affordable > 1 ? `${affordable} stages ready · Success 100%` : "Success 100%") : `Next stage in ${fmt.duration(etaToNextStage(s, c, now))}`);

  return [
    header(app),
    h("div", { class: "cult-title" },
      h("div", { class: "cn cult-cn" }, `${realm.name_cn ?? ""} · 第${CN_NUM[s.character.stage]}层`),
      h("div", { class: "cult-realm" }, realm.name),
      h("div", { class: "cult-stage glass" }, `Stage ${s.character.stage} / 9`, pips)),
    h("div", { class: "cult-space", onClick: () => openRateSheet(app) }),
    h("button", { class: ["btn gold block cult-bt", ready && "ready"], onClick: () => (final ? openMajorSheet(app) : doMinor(app, affordable)) },
      h("span", { class: "stack", style: { gap: "1px" } }, h("span", { class: "cult-bt-t" }, final ? "Breakthrough" : "Breakthrough"), h("span", { class: "cult-bt-s" }, btSub))),
    h("button", { class: "glass panel cult-method", onClick: () => openRateSheet(app) },
      h("div", { class: "row" },
        h("span", { class: "m-ico" }, icon("qi", 22)),
        h("div", { class: "grow", style: { textAlign: "left" } },
          h("div", { class: "title", style: { fontSize: "14px", fontVariant: "small-caps" } }, method.name),
          h("div", { class: "muted" }, `${method.element ? c.get<any>(method.element).name + " · " : ""}${method.grade[0].toUpperCase() + method.grade.slice(1)}-grade · Mastery ${Math.round((mastery / method.mastery.max_level) * 100)}%`)),
        h("div", { style: { textAlign: "right" } }, h("div", { class: "jade-t", style: { fontWeight: 800, fontSize: "17px" } }, `+${fmt.num(rate.perSecond, rate.perSecond < 10 ? 2 : 1)} Qi/s`), h("div", { class: "muted" }, `${root.name.replace(/ Root$/, "")} ×${root.qi_mult}`))),
      h("div", { style: { margin: "8px 0 4px" } }, bar(Math.min(1, prog), { cls: "thick", label: `${fmt.int(Math.min(s.character.qi, need))} / ${fmt.int(need)} Qi` })),
      h("div", { class: "row between muted" },
        h("span", null, prog >= 1 ? (final && !ready ? "✦ Bottleneck: complete the requirements" : "✦ Bottleneck reached — Qi is full") : `${fmt.pct(prog * 100, 1)} of this stage`),
        h("span", null, final ? (next ? `Next: ${next.name}` : "Summit reached") : `Next: Stage ${s.character.stage + 1} · ${fmt.compact(c.get<any>(realm.id).qi.base * Math.pow(realm.qi.stage_growth, s.character.stage))} Qi`))),
    h("div", { class: "grid-4 cult-tiles" },
      shortcut(app, "cauldron", "Alchemy", 0, () => app.router.toast("The Alchemy Hall opens with the sect systems")),
      shortcut(app, "paw", "Spirit Beasts", Object.keys(s.inventory.stacks).filter((k) => k.startsWith("egg.")).length, () => app.router.toast("Spirit beasts arrive with the companion systems")),
      shortcut(app, "scroll", "Quests", 0, () => app.router.toast("The quest log arrives with the quest systems")),
      shortcut(app, "gear", "Settings", 0, () => app.router.push(settingsScreen(app, "Cultivate")))),
  ];
}

const SHORTCUT_ART: Record<string, string> = { cauldron: "alchemy", paw: "beasts", scroll: "quests", gear: "settings" };
function shortcut(app: App, ico: string, label: string, badge: number, onClick: () => void) {
  const art = app.content.art("ui.shortcuts", SHORTCUT_ART[ico] ?? "");
  return h("button", { class: "glass cult-tile", onClick }, art ? h("span", { class: "ct-art", style: { backgroundImage: app.img(art) } }) : h("span", { class: "ct-ico" }, icon(ico, 28)), h("span", { class: "ct-lbl" }, label), badge > 0 && h("span", { class: "badge" }, String(badge)));
}

function act<R extends ActionResult<any>>(app: App, label: string, fn: (s: any, c: any) => R): R {
  const r = app.game.run(label, app.now(), fn);
  const rr = r as ActionResult<any>;
  if (!rr.ok) app.router.toast(rr.reason, "bad");
  return r;
}

function doMinor(app: App, affordable: number) {
  if (affordable === 0) { app.router.toast(`Not enough Qi · ${fmt.duration(etaToNextStage(app.game.state, app.content, app.now()))} to go`, "info"); return; }
  const before = computeStats(app.game.state, app.content).total;
  const r = affordable > 1 ? act(app, "breakthrough all", (s, c) => breakThroughAll(s, c, { now: app.now() })) : act(app, "breakthrough", (s, c) => breakThrough(s, c, { now: app.now() }));
  if (r.ok) minorBurst(app, affordable > 1 ? (r as any).count : 1, before);
}

/** Short celebratory overlay for minor breakthroughs: new stage and stat gains. */
export function minorBurst(app: App, count: number, before?: StatBlock) {
  const s = app.game.state;
  const after = computeStats(s, app.content).total;
  const gains = before ? ["hp", "atk", "def", "sp_power"].map((k) => [k, (after[k] ?? 0) - (before[k] ?? 0)] as const).filter(([, d]) => d > 0) : [];
  const id = "burst";
  app.router.open({ id, kind: "modal", cls: "burst",
    render: (close) => h("div", { class: "burst-in", onClick: close },
      h("div", { class: "burst-ring" }),
      h("div", { class: "cn", style: { fontSize: "14px" } }, "突 破"),
      h("div", { class: "m-title" }, count > 1 ? `+${count} Stages` : "Breakthrough"),
      h("div", { class: "m-sub" }, `${app.content.get<any>(s.character.realm).name} · Stage ${s.character.stage}`),
      gains.length > 0 && h("div", { class: "row", style: { justifyContent: "center", flexWrap: "wrap", gap: "6px" } }, gains.map(([k, d]) => h("span", { class: "tag jade" }, `${attrLabel(k)} +${attrValue(k, d)}`)))) });
  setTimeout(() => app.router.close(id), 1900);
}

function openMajorSheet(app: App) {
  app.router.open({ id: "major", kind: "sheet", render: (close) => {
    const s = app.game.state, c = app.content;
    const realm = c.get<any>(s.character.realm), next = c.nextRealm(realm.id);
    if (!next) return h("div", { class: "center" }, h("div", { class: "m-title" }, "The summit"), h("p", { class: "dim" }, "There is no realm above the Immortal Emperor."));
    const reqs = majorRequirements(s, c);
    const ch = majorChance(s, c);
    const ready = reqs.every((r) => r.met);
    const gains = Object.entries(next.realm_bonus as Record<string, number>);
    return h("div", null,
      h("div", { class: "cn center", style: { fontSize: "13px" } }, `${realm.name_cn ?? ""} → ${next.name_cn ?? ""}`),
      h("div", { class: "m-title" }, `Ascend to ${next.name}`),
      h("div", { class: "m-sub" }, next.description),
      section("Requirements", ready ? "All requirements met" : "Gather what is missing",
        h("div", { class: "rows" }, reqs.map((r) => h("div", { class: "setrow" },
          icon(r.kind === "qi" ? "qi" : r.kind === "item" ? "cauldron" : r.kind === "tribulation" ? "bolt" : "sword", 18),
          h("div", { class: "grow" }, h("div", { class: "lbl" }, r.label), h("div", { class: "desc" }, r.kind === "qi" ? `${fmt.compact(r.have)} / ${fmt.compact(r.need)}` : r.kind === "tribulation" ? "Survive the heavenly lightning (combat)" : r.kind === "trial" ? "Clear the trial first" : `${r.have} / ${r.need} in your bag`)),
          h("span", { class: ["tag", r.met ? "jade" : ""] }, r.met ? "Ready" : "Missing"))))),
      section("Success chance", `${Math.round(ch.total * 100)}%`,
        h("dl", { class: "kv" }, h("dt", null, "Base"), h("dd", null, `${Math.round(ch.base * 100)}%`), ...ch.parts.flatMap((p) => [h("dt", null, p.label), h("dd", { class: "jade-t" }, `+${Math.round(p.bonus * 100)}%`)])),
        ch.total < 1 && h("div", { class: "muted", style: { marginTop: "6px" } }, `On failure you keep your realm and lose ${Math.round(c.rules.major_breakthrough.fail_qi_loss_pct * 100)}% of the stage's Qi. Required pills are consumed.`)),
      gains.length > 0 && section("You will gain", null, h("div", { class: "row", style: { flexWrap: "wrap", gap: "6px" } }, gains.map(([k, v]) => h("span", { class: "tag gold" }, `${attrLabel(k)} +${attrValue(k, v)}`)))),
      h("div", { class: "grid-2", style: { marginTop: "4px" } },
        h("button", { class: "btn", onClick: close }, "Not yet"),
        h("button", { class: "btn gold", disabled: !ready, onClick: () => {
          close();
          const r = act(app, "major breakthrough", (st, ct) => breakThrough(st, ct, { now: app.now() }));
          if (r.ok) majorResult(app, r.success, r.chance ?? 0, realm.id);
        } }, "Break Through")));
  } });
}

function majorResult(app: App, success: boolean, chance: number, _fromRealm: string) {
  const c = app.content, s = app.game.state;
  const realm = c.get<any>(s.character.realm);
  app.router.open({ id: "major-result", kind: "modal", cls: ["major-result", success ? "win" : "lose"].join(" "), dismissible: false,
    render: (close) => h("div", null,
      success && h("div", { class: "major-bg", style: { backgroundImage: app.img(c.art(realm.id, "breakthrough_bg")) } }),
      h("div", { class: "burst-ring big" }),
      h("div", { class: "cn center", style: { fontSize: "16px" } }, success ? `${realm.name_cn ?? ""} · 大境界突破` : "天 意 难 违"),
      h("div", { class: "m-title", style: { fontSize: "26px" } }, success ? realm.name : "The heavens resist"),
      h("div", { class: "m-sub" }, success ? realm.description : `Your foundation shook (${Math.round(chance * 100)}% chance). Steady your Qi and try again.`),
      success && h("div", { class: "row", style: { justifyContent: "center", flexWrap: "wrap", gap: "6px", marginBottom: "12px" } },
        Object.entries(realm.realm_bonus as Record<string, number>).map(([k, v]) => h("span", { class: "tag gold" }, `${attrLabel(k)} +${attrValue(k, v)}`)),
        ...((realm.major_breakthrough.unlocks ?? []) as string[]).filter((u) => c.has(u)).map((u) => h("span", { class: "tag jade" }, `Unlocked: ${c.get<any>(u).name}`))),
      h("button", { class: ["btn block", success ? "gold" : ""], onClick: close }, "Continue")) });
}

function openRateSheet(app: App) {
  app.router.open({ id: "rate", kind: "sheet", render: () => {
    const s = app.game.state, c = app.content, now = app.now();
    const rate = qiRate(s, c, now);
    const methods = Object.keys(s.character.methodMastery).map((id) => c.get<any>(id));
    const pills = c.byPrefix<any>("cons").filter((p) => (s.inventory.stacks[p.id] ?? 0) > 0 && (p.effects.qi || p.effects.cultivation_boost) && !isBreakthroughItem(c, p.id));
    const st = computeStats(s, c);
    return h("div", { class: "stack" },
      section("Qi generation", `${fmt.num(rate.perSecond, 2)} Qi/s · ${fmt.compact(rate.perSecond * 3600)} per hour`,
        h("dl", { class: "kv" }, h("dt", null, `${c.get<any>(s.character.realm).name} base`), h("dd", null, `${fmt.num(rate.base, 2)}/s`),
          ...rate.factors.flatMap((f) => [h("dt", null, f.label), h("dd", { class: f.mult >= 1 ? "jade-t" : "red-t" }, `×${f.mult.toFixed(2)}`)]))),
      section("Cultivation method", "Switch any time",
        h("div", { class: "rows" }, methods.map((m) => h("button", { class: ["setrow", m.id === s.character.method && "on"], onClick: () => { const r = act(app, "method", (st2, ct) => switchMethod(st2, ct, m.id)); if (r.ok) app.router.toast(`Now cultivating ${m.name}`, "good"); } },
          icon("qi", 18), h("div", { class: "grow", style: { textAlign: "left" } }, h("div", { class: "lbl" }, m.name), h("div", { class: "desc" }, `×${m.qi_mult} Qi · ${m.grade}-grade`)), m.id === s.character.method ? h("span", { class: "tag jade" }, "Active") : h("span", { class: "tag" }, "Use"))))),
      section("Pills", pills.length ? "Tap to use" : "None in your bag",
        h("div", { class: "rows" }, pills.map((p) => h("div", { class: "setrow" },
          h("span", { class: "tile-mini", style: { backgroundImage: app.img(c.art(p.id, "icon")) } }),
          h("div", { class: "grow" }, h("div", { class: "lbl" }, `${p.name} ×${s.inventory.stacks[p.id]}`), h("div", { class: "desc" }, [p.effects.qi && `+${fmt.compact(p.effects.qi)} Qi`, p.effects.cultivation_boost && `×${p.effects.cultivation_boost.mult} rate for ${p.effects.cultivation_boost.minutes} min`].filter(Boolean).join(" · "))),
          h("button", { class: "btn sm gold", onClick: () => { const r = act(app, "pill", (st2, ct) => useConsumable(st2, ct, { now: app.now() }, p.id)); if (r.ok) app.router.toast(`Used ${p.name}`, "good"); } }, "Use"))))),
      section("Status", null,
        h("dl", { class: "kv" },
          h("dt", null, "Combat Power"), h("dd", { class: "gold-t" }, fmt.int(st.cp)),
          h("dt", null, "Energy"), h("dd", null, `${Math.floor(energyNow(s, c, now))} / ${energyMax(s, c)}`),
          h("dt", null, "Sect Fame"), h("dd", null, fmt.int(s.resources.sect_fame)),
          ...s.buffs.flatMap((b) => [h("dt", null, b.label), h("dd", { class: "jade-t" }, `${fmt.duration(b.expiresAt - now)} left`)]))));
  } });
}
