/**
 * Sect tab (mockup "sect_map"): sect banner with fame progress toward the next rank, and the illustrated map
 * with a label for every location (lock state, NPC avatars). Tapping a location opens its screen.
 */
import { h, fmt, type Child } from "../core/dom.ts";
import { icon } from "../core/icons.ts";
import { header, subbar, section, bar } from "../core/kit.ts";
import type { Screen } from "../core/router.ts";
import type { App } from "../../app.ts";
import { locationOpen } from "../../engine/unlock.ts";
import { setLocation } from "../../engine/actions.ts";
import { locationQiMult, qiRate, activeMeditation, meditationMaxMinutes, meditationCost, startMeditation, endMeditation } from "../../engine/cultivation.ts";
import { visit, questStatus } from "../../engine/progression.ts";
import { affinityLevel } from "../../engine/unlock.ts";
import { computeStats } from "../../engine/stats.ts";
import { npcScreen } from "./npc.ts";
import { shopScreen } from "./shop.ts";
import { missionHallScreen } from "./quests.ts";
import { alchemyScreen } from "./alchemy.ts";
import { forgeScreen } from "./forge.ts";
import { arenaScreen } from "./tournament.ts";
import { beastsScreen } from "./beasts.ts";
import { depotScreen } from "./inventory.ts";
import { depotUsed, depotCapacity } from "../../engine/inventory.ts";
import type { App as AppT } from "../../app.ts";

/** Open a sect location (records the visit for quests and story triggers). */
export function openLocation(app: AppT, id: string): void {
  app.game.run("visit", app.now(), (st) => visit(st, id), false);
  app.router.push(locationScreen(app, id));
}

/** What each activity does when tapped (null = not available yet). */
function activity(app: AppT, f: string, loc: any): { go?: () => void; tag: string; note?: string } {
  const back = loc.name;
  switch (f) {
    case "missions": return { go: () => app.router.push(missionHallScreen(app, loc.id)), tag: "Open" };
    case "pavilion": return { go: () => app.router.push(shopScreen(app, loc.shop ?? "shop.scripture_pavilion", back)), tag: "Browse" };
    case "merchant": return { go: () => app.router.push(shopScreen(app, loc.shop ?? "shop.merchant_pavilion", back)), tag: "Shop" };
    case "alchemy": return { go: () => app.router.push(alchemyScreen(app, back)), tag: "Refine" };
    case "forge": return { go: () => app.router.push(forgeScreen(app, back)), tag: "Forge" };
    case "tournament": return { go: () => app.router.push(arenaScreen(app, back)), tag: "Enter" };
    case "duels": { const n = (loc.npcs as string[]).find((x) => app.content.get<any>(x).duel?.enabled); return n ? { go: () => app.router.push(npcScreen(app, n, back)), tag: "Spar", note: `Spar with ${app.content.get<any>(n).name}` } : { tag: "Soon" }; }
    case "beasts": return { go: () => app.router.push(beastsScreen(app, back)), tag: "Open", note: "Hatch eggs, raise and evolve your beasts" };
    case "storage": return { go: () => app.router.push(depotScreen(app, back)), tag: "Open", note: `Depot ${depotUsed(app.game.state)} / ${depotCapacity(app.game.state, app.content)} slots · keep what you do not carry` };
    case "rest": return { go: () => { app.game.run("rest", app.now(), (st) => { delete st.character.hp; return { ok: true, events: [] }; }, false); app.router.toast("You rest and recover fully", "good"); }, tag: "Rest", note: "Recover all HP" };
    default: return { tag: "Soon" };
  }
}

const FEATURE: Record<string, { label: string; icon: string; note: string }> = {
  duels: { label: "Friendly duels", icon: "sword", note: "Spar with sect disciples" }, missions: { label: "Mission board", icon: "scroll", note: "Requests that earn Fame" },
  pavilion: { label: "Scripture stacks", icon: "scroll", note: "Techniques and methods" }, meditation: { label: "Meditate here", icon: "lotus", note: "Cultivate faster at this spot" },
  merchant: { label: "Merchant", icon: "gem", note: "Buy and sell goods" }, alchemy: { label: "Alchemy furnace", icon: "cauldron", note: "Refine pills" },
  forge: { label: "Spirit forge", icon: "sword", note: "Forge, enhance and refine gear" }, beasts: { label: "Beast garden", icon: "paw", note: "Hatch and raise spirit beasts" },
  quarters: { label: "Your quarters", icon: "temple", note: "Rest and decorate" }, storage: { label: "Storage chest", icon: "pouch", note: "Personal storage" }, rest: { label: "Rest", icon: "clock", note: "Recover HP" },
  tournament: { label: "Tournaments", icon: "fame", note: "Climb the sect rankings" },
};

export function sectScreen(app: App) {
  const s = app.game.state, c = app.content;
  const rank = c.get<any>(s.character.rank);
  const ranks = c.byPrefix<any>("rank").slice().sort((a, b) => a.order - b.order);
  const nextRank = ranks.find((r) => r.order === rank.order + 1);
  const fame = s.resources.sect_fame;
  const locs = c.byPrefix<any>("sectloc");
  return [
    header(app),
    h("div", { class: "glass panel sect-banner" },
      h("div", { class: "row" },
        app.ui("ui.icons", "sect_emblem") ? h("span", { class: "sect-emblem art", style: { backgroundImage: app.img(app.ui("ui.icons", "sect_emblem")) } }) : h("span", { class: "sect-emblem" }, icon("qi", 26)),
        h("div", { class: "grow" },
          h("div", { class: "row between" }, h("div", { class: "title", style: { fontSize: "calc(15rem / 15)", fontVariant: "small-caps" } }, "Azure Cloud Sect", h("span", { class: "cn", style: { fontSize: "calc(12rem / 15)", marginLeft: "6px" } }, "青云宗")), h("span", { class: "tag gold" }, rank.name)),
          h("div", { style: { margin: "6px 0 3px" } }, bar(nextRank ? Math.min(1, fame / nextRank.fame_required) : 1, { cls: "gold thin" })),
          h("div", { class: "row between muted" }, h("span", { class: "nowrap" }, nextRank ? `Next: ${nextRank.name}` : "Highest rank"), h("span", { class: "nowrap gold-t" }, nextRank ? `${fmt.int(fame)} / ${fmt.int(nextRank.fame_required)} Fame` : `${fmt.int(fame)} Fame`)),
          h("div", { class: "muted" }, "Complete requests to earn Fame")))),
    h("div", { class: "sect-map" }, locs.map((l) => {
      const open = locationOpen(s, c, l.id);
      const [x, y] = l.map_position ?? [0.5, 0.5];
      const npc = (l.npcs ?? [])[0];
      return h("button", { class: ["sect-pin glass", !open.ok && "locked"], style: { left: `${x * 100}%`, top: `${y * 100}%` }, onClick: () => openLocation(app, l.id) },
        h("span", { class: "pin-ico" }, icon(open.ok ? (FEATURE[l.features?.[0]]?.icon ?? "temple") : "lock", 13)),
        h("span", null, h("span", { class: "pin-name" }, l.name), !open.ok && h("span", { class: "pin-req" }, open.reasons[0])),
        npc && open.ok && h("span", { class: "pin-npc", style: { backgroundImage: app.img(c.artAny(npc, "portrait", "full_body")) } }));
    })),
  ];
}

// ---------- Meditation Waterfall sessions (mockups meditation_waterfall, waterfall_active) ----------
let medMinutes = 30;
const clock = (ms: number) => { const t = Math.max(0, Math.ceil(ms / 1000)); const hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60; return hh ? `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${mm}:${String(ss).padStart(2, "0")}`; };
const minLabel = (m: number) => m % 60 === 0 ? `${m / 60} h` : m > 60 ? `${Math.floor(m / 60)} h ${m % 60}` : `${m} min`;

/** The session panel: choose a length and begin, or watch the running session's timer. */
export function meditationPanel(app: App): HTMLElement | null {
  const s = app.game.state, c = app.content, r = c.rules.meditation_session, now = app.now();
  if (!r) return null;
  const act = activeMeditation(s, c, now);
  const rate = qiRate(s, c, now).perSecond;
  const cell = (l: string, v: Child, cls = "") => h("div", null, h("span", null, l), h("b", { class: cls }, v));
  if (act) {
    const total = act.expiresAt - (act.startedAt ?? now), left = act.expiresAt - now;
    const gained = Math.max(0, (now - (act.startedAt ?? now)) / 1000) * rate;
    return h("section", { class: "glass panel med active" },
      h("div", { class: "med-ring", style: { "--p": `${(1 - left / Math.max(1, total)) * 100}%` } },
        h("div", { class: "med-in" }, h("span", { class: "up" }, "Remaining"), h("b", { class: "tnum" }, clock(left)), h("span", { class: "muted" }, `of ${clock(total)}`))),
      h("div", { class: "grid-3 med-stats" }, cell("Qi gained", `+${fmt.compact(gained)}`, "jade-t"), cell("Qi gain", `+${r.qi_bonus_pct}%`, "jade-t"), cell("Rate", `${rate.toFixed(rate < 10 ? 2 : 1)} Qi/s`)),
      h("div", { class: "muted center", style: { margin: "8px 0" } }, "The session keeps running while you explore."),
      h("div", { class: "grid-2" },
        h("button", { class: "btn", onClick: () => { const res = app.game.run("meditate_end", app.now(), (st, ct) => endMeditation(st, ct, app.now())); if (res.ok) app.router.toast("Session ended", "info"); } }, "End early"),
        h("button", { class: "btn jade", onClick: () => app.router.back() }, "Back to Sect")));
  }
  const fameMax = meditationMaxMinutes(s, c);
  const top = Math.max(...r.max_minutes_by_fame.map((x) => x[1]));
  medMinutes = Math.max(r.min_minutes, Math.min(medMinutes, fameMax));
  const cost = meditationCost(c, medMinutes);
  const span = top - r.min_minutes;
  const pos = (m: number) => `${((m - r.min_minutes) / span) * 100}%`;
  const range = h("input", { class: "slider med-slider", type: "range", min: String(r.min_minutes), max: String(top), step: String(r.step_minutes), value: String(medMinutes), "aria-label": "Session length",
    style: { "--v": pos(medMinutes), "--lock": pos(fameMax) } as any }) as HTMLInputElement;
  range.addEventListener("input", () => { let v = Number(range.value); if (v > fameMax) { v = fameMax; range.value = String(v); } medMinutes = v; app.router.refresh(); });
  const next = r.max_minutes_by_fame.filter(([fame]) => fame > s.resources.sect_fame);
  const ticks: number[] = [];
  for (let m = r.min_minutes; m <= top; m += r.step_minutes) if (m <= 60 || m === top) ticks.push(m);
  return h("section", { class: "glass panel med" },
    h("div", { class: "sec-h" }, h("h3", null, "Meditation session"), h("span", { class: "hint" }, "Qi gain boosted while you sit")),
    h("div", { class: "row between", style: { alignItems: "baseline" } }, h("div", { class: "med-len" }, minLabel(medMinutes)), h("div", { class: "muted" }, "Max at your Fame: ", h("b", { class: "jade-t" }, minLabel(fameMax)))),
    range,
    h("div", { class: "med-ticks" }, ticks.map((m) => h("span", { class: m > fameMax && "locked", style: { left: pos(m) } }, m > fameMax && icon("lock", 9), m >= 60 && m % 60 === 0 ? `${m / 60}h` : `${m}m`))),
    next.length > 0 && h("div", { class: "med-lock" }, icon("lock", 12), " ", next.map(([fame, m]) => `Max ${minLabel(m)} at ${fmt.int(fame)} Fame`).join(" · ")),
    h("div", { class: "grid-3 med-stats" }, cell("Qi gain", `+${r.qi_bonus_pct}%`, "jade-t"), cell("Expected", `+${fmt.compact(rate * (r.qi_bonus_pct / 100) * medMinutes * 60)} Qi`), cell("Cost", h("span", null, icon("gem", 14), ` ${fmt.int(cost)}`))),
    h("button", { class: "btn gold lg block med-go", disabled: s.resources.spirit_stones < cost, onClick: () => {
      const res = app.game.run("meditate", app.now(), (st, ct) => startMeditation(st, ct, app.now(), medMinutes));
      if (!res.ok) app.router.toast((res as any).reason, "bad"); else app.router.toast(`Meditating for ${minLabel(medMinutes)} · Qi +${r.qi_bonus_pct}%`, "good");
    } }, "Begin", h("span", { class: "cta-s" }, icon("gem", 12), ` ${fmt.int(cost)}`)));
}

export function locationScreen(app: App, id: string): Screen {
  return {
    id: `loc:${id}`, bg: () => app.content.art(id, "background"),
    render: () => {
      const s = app.game.state, c = app.content;
      const l = c.get<any>(id);
      const open = locationOpen(s, c, id);
      const here = s.character.location === id;
      const canMeditate = (l.features ?? []).includes("meditation");
      return [
        header(app),
        subbar({ title: l.name, cn: l.name_cn, sub: open.ok ? (l.features ?? []).map((f: string) => FEATURE[f]?.label ?? f).join(" · ") : open.reasons.join(" · "), backTo: "Sect", onBack: () => app.router.back() }),
        open.ok && c.rules.meditation_session?.location === id && activeMeditation(s, c, app.now()) && h("div", { class: "med-pill" }, icon("lotus", 13), ` Meditating · +${c.rules.meditation_session.qi_bonus_pct}% Qi`),
        open.ok && c.rules.meditation_session?.location === id && app.ui("ui.cultivate", "meditation_pose")
          ? h("div", { class: ["med-stage", activeMeditation(s, c, app.now()) && "on"] }, h("div", { class: "med-glow" }), h("div", { class: "med-figure", style: { backgroundImage: app.img(app.ui("ui.cultivate", "meditation_pose")) } }))
          : h("div", { class: "loc-space" }),
        open.ok && c.rules.meditation_session?.location === id ? meditationPanel(app) : null,
        h("div", { class: "glass panel" }, h("div", { class: "dim", style: { fontSize: "calc(13rem / 15)", lineHeight: 1.5 } }, l.description)),
        open.ok && (l.npcs ?? []).length > 0 && section("Here now", null, h("div", { class: "rows" }, (l.npcs as string[]).map((n) => {
          const npc = c.get<any>(n);
          const rel = s.relations[n];
          const ready = c.byPrefix<any>("quest").some((q) => q.turn_in === n && questStatus(s, c, q, app.now()) === "ready");
          const offer = c.byPrefix<any>("quest").some((q) => q.giver === n && questStatus(s, c, q, app.now()) === "available");
          return h("button", { class: "setrow", onClick: () => app.router.push(npcScreen(app, n, l.name)) }, h("span", { class: "avatar", style: { backgroundImage: app.img(c.artAny(n, "portrait", "full_body")), width: "40px", height: "40px" } }),
            h("div", { class: "grow", style: { textAlign: "left" } }, h("div", { class: "lbl" }, npc.name, npc.name_cn && h("span", { class: "cn", style: { fontSize: "calc(11rem / 15)", marginLeft: "6px" } }, npc.name_cn)), h("div", { class: "desc" }, npc.title ?? npc.role),
              h("div", { class: "row", style: { gap: "5px", marginTop: "4px", flexWrap: "wrap" } },
                ready ? h("span", { class: "tag gold" }, "! Report") : offer ? h("span", { class: "tag jade" }, "! Request") : null,
                h("span", { class: "tag pink" }, "♥ ", affinityLevel(c, n, rel?.affinity ?? 0).name))),
            icon("chevron", 16));
        }))),
        open.ok && section("Activities", `Now cultivating at ${here ? l.name : s.character.location ? c.get<any>(s.character.location).name : "Your Quarters"} · Qi ×${locationQiMult(s, c).toFixed(2)}`, h("div", { class: "rows" },
          canMeditate && h("button", { class: "setrow", onClick: () => { app.game.run("location", app.now(), (st, ct) => setLocation(st, ct, here ? undefined : id)); app.router.toast(here ? "Back to your usual spot" : `Cultivating at ${l.name}`, "good"); } },
            icon("lotus", 18), h("div", { class: "grow", style: { textAlign: "left" } }, h("div", { class: "lbl" }, here ? "Cultivating here" : "Cultivate here"), h("div", { class: "desc" }, `Qi ×${(c.rules.location_qi_mult[id.split(".")[1]!] ?? 1).toFixed(2)} while you meditate here`)), h("span", { class: ["tag", here && "jade"] }, here ? "Active" : "Move")),
          ...(l.features ?? []).filter((f: string) => f !== "meditation").map((f: string) => { const a = activity(app, f, l); return h("button", { class: "setrow", onClick: () => a.go ? a.go() : app.router.toast(`${FEATURE[f]?.label ?? f} arrives in a later update`) },
            icon(FEATURE[f]?.icon ?? "temple", 18), h("div", { class: "grow", style: { textAlign: "left" } }, h("div", { class: "lbl" }, FEATURE[f]?.label ?? f), h("div", { class: "desc" }, a.note ?? FEATURE[f]?.note ?? "")), h("span", { class: ["tag", a.go && "jade"] }, a.tag)); }))),
        open.ok && l.shop && !(l.features ?? []).some((f: string) => f === "pavilion" || f === "merchant") && h("button", { class: "setrow glass", onClick: () => app.router.push(shopScreen(app, l.shop, l.name)) }, icon("gem", 18), h("div", { class: "grow", style: { textAlign: "left" } }, h("div", { class: "lbl" }, c.get<any>(l.shop).name), h("div", { class: "desc" }, c.get<any>(l.shop).description)), h("span", { class: "tag jade" }, "Shop")),
        !open.ok && h("div", { class: "glass panel center" }, icon("lock", 22), h("div", { class: "dim", style: { marginTop: "6px" } }, open.reasons.join(" · "))),
      ];
    },
  };
}
