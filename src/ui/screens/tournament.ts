/**
 * Proving Arena (mockup "arena_bracket"): tournament picker, the bracket from final (top) to round 1 (bottom)
 * with opponents' portraits, CP and state (Won / Next / Locked), the rules, champion rewards and the
 * "Enter round N" button. One round per entry; the bracket position is saved.
 */
import { h, fmt } from "../core/dom.ts";
import { icon } from "../core/icons.ts";
import { header, subbar, section, npcAvatar, seg, cta } from "../core/kit.ts";
import type { Screen } from "../core/router.ts";
import type { App } from "../../app.ts";
import { canStart } from "../../engine/encounter.ts";
import { checkUnlock } from "../../engine/unlock.ts";
import { computeStats } from "../../engine/stats.ts";
import { rewardsLine } from "./adventure.ts";
import { startEncounter } from "./battle.ts";

export function arenaScreen(app: App, backTo: string): Screen {
  let pick: string | undefined;
  return {
    id: "arena", bg: () => app.content.art("sectloc.proving_arena", "background"),
    render: () => {
      const s = app.game.state, c = app.content;
      const all = c.byPrefix<any>("tournament");
      const firstOpen = all.find((t) => !s.progress.trialsCleared[t.id] && checkUnlock(s, c, t.entry).ok) ?? all.find((t) => !s.progress.trialsCleared[t.id]) ?? all[0]!;
      const t = all.find((x) => x.id === pick) ?? firstOpen;
      const p = s.progress.tournaments[t.id];
      const round = p?.round ?? 0;
      const can = canStart(s, c, { kind: "tournament", id: t.id }, app.now());
      const entry = checkUnlock(s, c, t.entry);
      const champion = !!s.progress.trialsCleared[t.id];
      const cp = computeStats(s, c).cp;
      const opp = t.rounds[round];
      const label = (i: number) => i === t.rounds.length - 1 ? "Final" : `Round ${i + 1}`;
      return [
        header(app),
        subbar({ title: "Sect Tournament", cn: "宗门大比", sub: "Proving Arena · progress saved", backTo, onBack: () => app.router.back() }),
        all.length > 1 && seg(t.id, all.map((x) => ({ value: x.id, label: x.name.replace(" Tournament", "") })), (v) => { pick = v; app.router.refresh(); }),
        h("div", { class: "bracket" }, t.rounds.map((r: any, i: number) => ({ r, i })).reverse().map(({ r, i }: { r: any; i: number }) => {
          const n = c.get<any>(r.opponent);
          const state = champion && round === 0 ? "won" : i < round ? "won" : i === round ? "next" : "locked";
          return h("div", { class: ["br-row", state] },
            h("span", { class: "br-node" }, i === t.rounds.length - 1 ? icon("fame", 14) : String(i + 1)),
            h("div", { class: ["glass br-card", state === "next" && "gold"] },
              npcAvatar(app, r.opponent, 44),
              h("div", { class: "grow" }, h("div", { class: "muted up" }, label(i), state === "next" && " · Now"), h("div", { class: "lbl" }, n.name), h("div", { class: "muted" }, `${n.title?.split("·")[0]?.trim() ?? ""}${n.realm ? ` · ${c.get<any>(n.realm.id).name.split(" ")[0]} ${fmt.roman(n.realm.stage)}` : ""}`)),
              h("div", { class: "center" }, h("span", { class: ["tag", r.cp > cp ? "red" : "jade"] }, icon("sword", 10), ` CP ${fmt.int(r.cp)}`), h("div", { class: "muted", style: { marginTop: "3px" } }, state === "won" ? "✓ Won" : state === "next" ? "Next" : "Locked"))));
        })),
        section("Tournament rules", null, h("ul", { class: "rules" },
          h("li", null, `Win all ${t.rounds.length} rounds to become champion. One round per entry; your place in the bracket is saved.`),
          h("li", null, `Lose any round: ${fmt.int(t.loss.sect_fame)} Fame and the bracket resets. Re-enter at ${fmt.int(t.reentry.sect_fame_required)} Fame.`),
          !entry.ok && round === 0 && h("li", { class: "red-t" }, `Entry: ${entry.reasons.join(" · ")}`))),
        section("Champion rewards", champion ? h("span", { class: "jade-t" }, `✓ Champion ×${p?.wins ?? 1}`) : "Granted after the Final", rewardsLine(app, t.champion_rewards),
          t.rounds.some((r: any) => Object.keys(r.rewards ?? {}).length) && h("div", { class: "muted", style: { marginTop: "4px" } }, "Each round also pays its own purse.")),
        opp && cta(champion && !t.repeatable ? "Champion" : `Enter ${label(round)}`, `vs ${c.get<any>(opp.opponent).name} · your CP ${fmt.int(cp)}`, () => startEncounter(app, { kind: "tournament", id: t.id }), { disabled: !can.ok }),
        !can.ok && h("div", { class: "muted center" }, can.reason),
      ];
    },
  };
}
