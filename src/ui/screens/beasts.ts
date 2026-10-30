/**
 * Spirit Beasts (mockup "spirit_beasts"): the active companion card (art, stage and level bar, bond hearts,
 * skill and passive, Feed · Play · Train · Evolve), the evolution track, the beast grid with incubating eggs
 * and silhouettes of beasts not found yet, and the Dao companions who may fight beside you.
 */
import { h, fmt } from "../core/dom.ts";
import { icon } from "../core/icons.ts";
import { header, subbar, section, bar, tile, needRow, npcAvatar, toggle, RARITY_LABEL } from "../core/kit.ts";
import type { Screen } from "../core/router.ts";
import type { App } from "../../app.ts";
import { stageOf, levelCap, xpToNext, bondInfo, feed, foodXp, play, playReadyAt, train, trainXp, evolve, evolveCheck, incubate, incubateCheck, hatch, setActiveBeast, renameBeast, beastsFound } from "../../engine/beasts.ts";
import { setCompanionActive, canBond, MAX_ACTIVE } from "../../engine/companions.ts";
import { affinityLevel } from "../../engine/unlock.ts";
import { energyNow } from "../../engine/cultivation.ts";
import { itemCount } from "../../engine/inventory.ts";
import type { BeastInstance } from "../../engine/state.ts";
import { npcScreen } from "./npc.ts";
import { questStatus } from "../../engine/progression.ts";
import { missionHallScreen } from "./quests.ts";
import type { Quest } from "../../content/index.ts";

const ELEM: Record<string, string> = { "elem.wood": "Wood", "elem.fire": "Fire", "elem.earth": "Earth", "elem.metal": "Metal", "elem.water": "Water" };

function beastArt(app: App, b: BeastInstance): string | undefined { return app.content.artAny(b.beast, `battle_${b.stage}`, "icon"); }

export function beastsScreen(app: App, backTo: string): Screen {
  let sel: number | null = null;
  return {
    id: "beasts", bg: () => app.content.art("sectloc.spirit_beast_garden", "background"),
    render: () => {
      const s = app.game.state, c = app.content;
      const owned = Object.values(s.beasts.owned).sort((a, b) => (a.uid === s.beasts.active ? -1 : b.uid === s.beasts.active ? 1 : b.level - a.level));
      if (sel === null || !s.beasts.owned[sel]) sel = s.beasts.active ?? owned[0]?.uid ?? null;
      const b = sel !== null ? s.beasts.owned[sel] : undefined;
      const all = c.byPrefix<any>("beast");
      const found = beastsFound(s);
      return [
        header(app),
        subbar({ help: { app, key: "beasts" }, title: "Spirit Beasts", cn: "灵兽", sub: `Companions · ${s.beasts.active !== null ? "1 fights beside you" : "none active"}`, backTo, onBack: () => app.router.back(),
          end: h("div", { class: "found" }, h("div", { class: "muted" }, "Found"), h("b", { class: "gold-t" }, `${found.size} / ${all.length}`)) }),
        b ? activeCard(app, b) : h("div", { class: "glass panel center" }, icon("paw", 26), h("div", { class: "lbl", style: { marginTop: "6px" } }, "No spirit beast yet"), h("div", { class: "muted" }, "Place an egg in an incubator below. Eggs hatch from battles you win."), eggQuestHint(app)),
        b && evolutionTrack(app, b),
        section("Your beasts", h("span", null, "Tap to view · set active"), h("div", { class: "beast-grid" },
          owned.map((x) => {
            const st = stageOf(c, x).stage;
            return h("button", { class: ["glass beast-cell", x.uid === sel && "on"], onClick: () => { sel = x.uid; app.router.refresh(); } },
              x.uid === s.beasts.active && h("span", { class: "bc-badge" }, icon("paw", 10)),
              tile({ rarity: c.get<any>(x.beast).rarity, art: beastArt(app, x), fallbackIcon: "paw", img: (f) => app.img(f) }),
              h("div", { class: "bc-n" }, x.name), h("div", { class: "muted" }, `Lv ${x.level} · ${st.name}`));
          }),
          s.beasts.incubating.map((inc, i) => {
            const egg = c.get<any>(inc.egg);
            const ready = inc.wins >= inc.need;
            return h("button", { class: ["glass beast-cell egg", ready && "ready"], onClick: () => { if (!ready) { app.router.toast(`${inc.need - inc.wins} more victories to hatch`); return; } const r = app.game.run("hatch", app.now(), (st2, cc) => hatch(st2, cc, i, app.now())); if (r.ok) { sel = r.uid; hatchModal(app, r.uid); } else app.router.toast(r.reason, "bad"); } },
              tile({ rarity: egg.rarity, art: c.art(inc.egg, "icon"), fallbackIcon: "paw", img: (f) => app.img(f) }),
              h("div", { class: "bc-n" }, egg.name), h("div", { class: ready ? "jade-t" : "muted" }, ready ? "Ready to hatch!" : `Hatching · ${inc.wins} / ${inc.need} wins`),
              bar(inc.wins / inc.need, { cls: "thin gold" }));
          }),
          Array.from({ length: Math.max(0, c.rules.beasts.incubators - s.beasts.incubating.length) }, () => h("button", { class: "glass beast-cell empty", onClick: () => eggSheet(app) }, h("span", { class: "egg-slot" }, icon("plus", 20)), h("div", { class: "bc-n" }, "Incubator"), h("div", { class: "muted" }, "Place an egg"))),
          all.filter((d) => !found.has(d.id)).slice(0, 3).map((d) => h("div", { class: "glass beast-cell unknown" }, h("span", { class: `tile r-${d.rarity}` }, h("div", { class: "in" }, "?")), h("div", { class: "bc-n" }, "???"), h("div", { class: "muted" }, "Not found yet")))),
          h("div", { class: "muted", style: { marginTop: "6px" } }, icon("info", 11), " Eggs hatch from Adventure battles you win, never from waiting.")),
        companionsPanel(app),
      ];
    },
  };
}

function activeCard(app: App, b: BeastInstance) {
  const s = app.game.state, c = app.content;
  const { def, stage, next } = stageOf(c, b);
  const cap = levelCap(c, b);
  const need = xpToNext(c, b.level);
  const bond = bondInfo(c, b);
  const act = c.get<any>(stage.active), pas = c.get<any>(stage.passive);
  const isActive = s.beasts.active === b.uid;
  const now = app.now();
  const playReady = playReadyAt(c, b) <= now;
  const atCap = b.level >= cap && b.xp >= need;
  const run = (label: string, fn: () => any, msg: (r: any) => string) => { const r = app.game.run(label, app.now(), fn); app.router.toast(r.ok ? msg(r) : r.reason, r.ok ? "good" : "bad"); };
  const passiveText = Object.entries(pas.passive_bonuses ?? {}).map(([k, v]) => `+${v}${["crit", "eva", "acc", "crit_dmg", "dmg_red", "life_steal"].includes(k) || k.startsWith("elem_") ? "%" : ""} ${k.replace(/_/g, " ")}`).join(" · ");
  return h("section", { class: "glass panel beast-card" },
    h("div", { class: "sec-h" }, h("h3", null, isActive ? "Active Companion" : "Spirit Beast"), h("span", { class: "hint" }, isActive ? "Joins every battle · 1 slot" : h("button", { class: "btn jade sm", onClick: () => app.game.run("beast", app.now(), (st) => setActiveBeast(st, b.uid)) }, "Set active"))),
    h("div", { class: "row", style: { alignItems: "stretch", gap: "12px" } },
      h("div", { class: ["beast-art", `r-${def.rarity}`], style: { backgroundImage: app.img(beastArt(app, b)) } }, !beastArt(app, b) && icon("paw", 40), isActive && h("span", { class: "tag jade beast-in" }, "In battle")),
      h("div", { class: "grow", style: { minWidth: 0 } },
        h("button", { class: "beast-name", onClick: () => renameModal(app, b) }, b.name, " ", icon("brush", 12)),
        h("div", { class: "muted" }, `${def.species}${def.name_cn ? ` ${def.name_cn}` : ""}`),
        h("div", { class: "row", style: { gap: "4px", flexWrap: "wrap", margin: "5px 0" } }, h("span", { class: `tag rt-${def.rarity}` }, RARITY_LABEL[def.rarity]), h("span", { class: "tag" }, ELEM[def.element] ?? def.element), def.cultivation_bonus > 0 && h("span", { class: "tag gold" }, `Qi +${Math.round(def.cultivation_bonus * 100)}%`)),
        h("div", { class: "row between muted" }, h("span", null, `${stage.name} · Lv ${b.level} / ${cap}`), h("span", { class: "tnum" }, atCap ? (next ? "Ready to evolve" : "Peak") : `XP ${fmt.int(b.xp)} / ${fmt.int(need)}`)),
        bar(atCap ? 1 : b.xp / need, { cls: "jade" }),
        h("div", { class: "row between", style: { marginTop: "6px" } }, h("span", { class: "muted" }, `Bond ${bond.level} / ${bond.max}`), h("span", { class: "muted" }, bond.level < bond.max ? `${bond.into} / ${bond.need}` : "Complete")),
        h("div", { class: "hearts" }, Array.from({ length: bond.max }, (_, i) => h("i", { class: i < bond.level && "on" }, "♥"))))),
    h("div", { class: "grid-2", style: { marginTop: "10px" } },
      h("div", { class: "glass skill-box" }, h("div", { class: "muted up" }, `Skill · ${act.name}`), h("div", { class: "dim" }, act.description)),
      h("div", { class: "glass skill-box" }, h("div", { class: "muted up" }, `Passive · ${pas.name}`), h("div", { class: "jade-t" }, passiveText || pas.description), h("div", { class: "muted" }, "Applies to you while active"))),
    h("div", { class: "beast-actions" },
      h("button", { class: "btn jade", onClick: () => foodSheet(app, b.uid) }, icon("paw", 14), "Feed"),
      h("button", { class: "btn", disabled: bond.level >= bond.max, onClick: () => run("play", () => play(app.game.state, c, b.uid, app.now()), (r) => `${b.name} loved that (+${r.bond} bond)`) }, "♥ ", playReady ? "Play" : `Play ${Math.ceil((playReadyAt(c, b) - now) / 60_000)}m`),
      h("button", { class: "btn", disabled: atCap, onClick: () => run("train", () => train(app.game.state, c, b.uid, app.now()), (r) => `Training: +${r.xp} XP`) }, icon("sword", 13), h("span", null, "Train", h("span", { class: "cta-s" }, `${c.rules.beasts.train.energy}⚡`))),
      h("button", { class: ["btn", evolveCheck(s, c, b).ok && "gold"], disabled: !next, onClick: () => evolveSheet(app, b.uid) }, "Evolve", next && h("span", { class: "cta-s" }, `Lv ${next.level_required}`))));
}

function evolutionTrack(app: App, b: BeastInstance) {
  const c = app.content;
  const { def, index } = stageOf(c, b);
  return section("Evolution", h("span", null, `${def.stages.length} stages`), h("div", { class: "evo-track" }, def.stages.map((st, i) => {
    const lo = st.level_required, hi = def.stages[i + 1]?.level_required ?? c.rules.beasts.max_level;
    return [i > 0 && icon("chevron", 12), h("div", { class: ["glass evo-stage", i === index && "on", i < index && "done"] }, h("div", { class: "lbl" }, st.name), h("div", { class: "muted" }, `Lv ${lo}–${hi}${i === index ? " · now" : ""}`))];
  })));
}

function foodSheet(app: App, uid: number) {
  app.router.open({ id: "food", kind: "sheet", render: (close) => {
    const s = app.game.state, c = app.content;
    const b = s.beasts.owned[uid]!;
    const foods = c.byPrefix<any>("bfood");
    return h("div", { class: "stack" },
      h("div", { class: "sec-h" }, h("h3", null, `Feed ${b.name}`), h("span", { class: "hint" }, "Favourite food gives more XP")),
      h("div", { class: "rows" }, foods.map((f) => {
        const n = itemCount(s, f.id);
        const xp = foodXp(c, b, f.id);
        const fav = c.get<any>(b.beast).food.includes(f.id) || f.preferred_elements.includes(c.get<any>(b.beast).element);
        const give = (q: number) => { const r = app.game.run("feed", app.now(), (st, cc) => feed(st, cc, uid, f.id, q)); app.router.toast(r.ok ? `+${fmt.int(r.xp)} XP` : r.reason, r.ok ? "good" : "bad"); };
        return h("div", { class: ["setrow", !n && "dim-card"] },
          h("span", { class: "tile-mini", style: { backgroundImage: c.art(f.id, "icon") ? app.img(c.art(f.id, "icon")) : undefined } }, !c.art(f.id, "icon") && icon("paw", 14)),
          h("div", { class: "grow" }, h("div", { class: "lbl" }, f.name, fav && h("span", { class: "tag pink", style: { marginLeft: "6px" } }, "♥ Favourite")), h("div", { class: "desc" }, `+${xp} XP · +${f.bond} bond · you have ${fmt.int(n)}`)),
          h("button", { class: "btn sm", disabled: !n, onClick: () => give(1) }, "×1"),
          h("button", { class: "btn jade sm", disabled: n < 2, onClick: () => give(Math.min(n, 10)) }, `×${Math.max(2, Math.min(n, 10))}`));
      })),
      h("div", { class: "muted center" }, "Beast food sells at the Spirit Beast Garden and drops in the wild."),
      h("button", { class: "btn ghost block", onClick: close }, "Done"));
  } });
}

function evolveSheet(app: App, uid: number) {
  app.router.open({ id: "evolve", kind: "sheet", render: (close) => {
    const s = app.game.state, c = app.content;
    const b = s.beasts.owned[uid]!;
    const { stage, next } = stageOf(c, b);
    if (!next) return h("div", { class: "center muted" }, `${b.name} has reached its final form.`);
    const chk = evolveCheck(s, c, b);
    const delta = Object.keys(next.stats).map((k) => h("div", { class: "cmp-row" }, h("span", { class: "grow" }, k.toUpperCase()), h("span", null, fmt.int((stage.stats as any)[k] ?? 0)), icon("chevron", 10), h("b", { class: "jade-t" }, fmt.int((next.stats as any)[k]))));
    return h("div", { class: "stack" },
      h("div", { class: "sec-h" }, h("h3", null, `Evolve into ${next.name}`), h("span", { class: "hint" }, `Requires level ${next.level_required}`)),
      h("div", { class: "rows" }, delta),
      h("div", { class: "rows" }, h("div", { class: ["need", b.level < next.level_required && "short"] }, icon("paw", 16), h("span", { class: "grow" }, "Level"), h("b", null, `${b.level} / ${next.level_required}`)),
        next.evolve_materials.map((q) => needRow(app, q.id, q.qty, itemCount(s, q.id))),
        h("div", { class: ["need", s.resources.spirit_stones < next.evolve_cost_stones && "short"] }, h("span", { class: "tile-mini stone-mini" }, icon("gem", 16)), h("span", { class: "grow" }, "Spirit Stones"), h("b", null, `${fmt.int(s.resources.spirit_stones)} / ${fmt.int(next.evolve_cost_stones)}`))),
      h("button", { class: "btn gold block lg", disabled: !chk.ok, onClick: () => { const r = app.game.run("evolve", app.now(), (st, cc) => evolve(st, cc, uid)); if (r.ok) { close(); app.router.toast(`${b.name} evolved into ${next.name}!`, "good", 3500); } else app.router.toast(r.reason, "bad"); } }, "Evolve"),
      !chk.ok && h("div", { class: "muted center" }, chk.reason));
  } });
}

/** A giver with an egg for the player (a quest that hands one over and is open to take): say who, and go there. */
function eggQuestHint(app: App) {
  const s = app.game.state, c = app.content;
  if (Object.keys(s.inventory.stacks).some((k) => k.startsWith("egg.") && itemCount(s, k) > 0) || s.beasts.incubating.length) return null;
  const q = c.byPrefix<Quest>("quest").find((x) => x.giver.startsWith("npc.") && x.provides?.some((p) => p.id.startsWith("egg.")) && questStatus(s, c, x, app.now()) === "available");
  if (!q) return null;
  const giver = c.get<any>(q.giver);
  return h("div", { class: "egg-hint" }, npcAvatar(app, q.giver, 34), h("div", { class: "grow" }, h("b", null, `${giver.name} has an egg for you`), h("div", { class: "muted" }, `Quest · ${q.name}`)),
    h("button", { class: "btn gold sm", onClick: () => app.router.push(missionHallScreen(app, q.giver)) }, "See quest"));
}

function eggSheet(app: App) {
  app.router.open({ id: "eggs", kind: "sheet", render: (close) => {
    const s = app.game.state, c = app.content;
    const eggs = Object.keys(s.inventory.stacks).filter((id) => id.startsWith("egg.") && itemCount(s, id) > 0);
    return h("div", { class: "stack" },
      h("div", { class: "sec-h" }, h("h3", null, "Place an egg"), h("span", { class: "hint" }, `${s.beasts.incubating.length} / ${c.rules.beasts.incubators} incubators in use`)),
      eggs.length ? h("div", { class: "rows" }, eggs.map((id) => {
        const e = c.get<any>(id);
        const chk = incubateCheck(s, c, id);
        return h("div", { class: "setrow" }, h("span", { class: `tile-mini r-${e.rarity}`, style: { backgroundImage: c.art(id, "icon") ? app.img(c.art(id, "icon")) : undefined } }),
          h("div", { class: "grow" }, h("div", { class: "lbl" }, e.name, h("span", { class: "muted" }, ` ×${itemCount(s, id)}`)), h("div", { class: "desc" }, chk.ok ? `Hatches into ${c.get<any>(e.hatches_into).species} after ${e.hatch_wins} victories` : chk.reason)),
          h("button", { class: "btn gold sm", disabled: !chk.ok, onClick: () => { const r = app.game.run("incubate", app.now(), (st, cc) => incubate(st, cc, id, app.now())); app.router.toast(r.ok ? "The egg is warm in its incubator" : r.reason, r.ok ? "good" : "bad"); if (r.ok) close(); } }, "Incubate"));
      })) : h("div", { class: "muted center" }, "You have no eggs. They come from quests, dungeons, special encounters and rare merchants."));
  } });
}

function hatchModal(app: App, uid: number) {
  app.router.open({ id: "hatched", kind: "modal", cls: "celebrate", render: (close) => {
    const b = app.game.state.beasts.owned[uid]!;
    const def = app.content.get<any>(b.beast);
    return h("div", { class: "center" },
      h("div", { class: "muted up gold-t" }, "The egg hatches!"),
      h("div", { class: ["beast-art big", `r-${def.rarity}`], style: { backgroundImage: app.img(beastArt(app, b)), margin: "10px auto" } }, !beastArt(app, b) && icon("paw", 48)),
      h("div", { class: "result-title", style: { fontSize: "calc(30rem / 15)" } }, def.name),
      h("div", { class: "dim" }, def.description),
      h("div", { class: "muted", style: { margin: "6px 0" } }, `${RARITY_LABEL[def.rarity]} ${def.species} · ${ELEM[def.element] ?? ""}`),
      h("button", { class: "btn gold block", onClick: close }, "Welcome!"));
  } });
}

function renameModal(app: App, b: BeastInstance) {
  app.router.open({ id: "rename", kind: "modal", render: (close) => {
    const input = h("input", { class: "text-input", value: b.name, maxLength: 16, "aria-label": "Beast name" });
    return h("div", { class: "stack" }, h("div", { class: "m-title" }, "Name your companion"), input,
      h("div", { class: "grid-2" }, h("button", { class: "btn ghost", onClick: close }, "Cancel"),
        h("button", { class: "btn gold", onClick: () => { const r = app.game.run("rename", app.now(), (st) => renameBeast(st, b.uid, input.value), false); if (r.ok) close(); else app.router.toast(r.reason, "bad"); } }, "Save")));
  } });
}

function companionsPanel(app: App) {
  const s = app.game.state, c = app.content;
  const eligible = c.byPrefix<any>("npc").filter((n) => n.dao_companion?.eligible);
  if (!eligible.length) return null;
  const need = c.rules.dao.affinity_level;
  return section("Dao Companions", h("span", null, `${s.companions.active.length} / ${MAX_ACTIVE} fight beside you`),
    h("div", { class: "rows" }, eligible.map((n) => {
      const bonded = s.companions.bonded.includes(n.id);
      const aff = s.relations[n.id]?.affinity ?? 0;
      const lv = affinityLevel(c, n.id, aff);
      const target = n.affinity_levels[need]?.threshold ?? 1000;
      const can = canBond(s, c, n.id);
      return h("div", { class: ["setrow", bonded && "on"] }, npcAvatar(app, n.id, 38),
        h("div", { class: "grow" }, h("div", { class: "lbl" }, n.name, bonded && h("span", { class: "tag pink", style: { marginLeft: "6px" } }, "道侣")),
          bonded ? h("div", { class: "desc" }, `${n.dao_companion.role ?? "dps"} · joins adventure battles and allowed dungeons`)
            : [h("div", { class: "desc" }, `${lv.name} · ${fmt.int(aff)} / ${fmt.int(target)}`), h("div", { style: { marginTop: "3px" } }, bar(aff / target, { cls: "thin pink" }))]),
        bonded ? toggle(s.companions.active.includes(n.id), (v) => { const r = app.game.run("companion", app.now(), (st) => setCompanionActive(st, n.id, v)); if (!r.ok) app.router.toast(r.reason, "bad"); }, `${n.name} fights beside you`)
          : h("button", { class: ["btn sm", can.ok && "gold"], onClick: () => app.router.push(npcScreen(app, n.id, "Spirit Beasts")) }, can.ok ? "Ask" : "Visit"));
    })),
    h("div", { class: "muted", style: { marginTop: "6px" } }, icon("info", 11), ` Bonded companions add ×${c.rules.dao.qi_mult} dual cultivation. Tribulations, duels and tournaments are faced alone.`));
}
