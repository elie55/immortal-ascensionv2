/**
 * NPC screen (mockups "tang_talk", "ask_about_her", "gift_picker", "duel_spar"): full-body art with name card,
 * the affinity bar with its named milestones, action buttons (Chat · Ask · Duel · Gift, plus Shop and
 * Requests when the NPC has them) and a conversation log. Gifts open a picker that previews each item's
 * effect; duels open the spar card with both CPs, the opponent's style and the stakes.
 */
import { h, fmt } from "../core/dom.ts";
import { icon } from "../core/icons.ts";
import { header, subbar, bar, tile, npcAvatar } from "../core/kit.ts";
import type { Screen } from "../core/router.ts";
import type { App } from "../../app.ts";
import { affinityLevel } from "../../engine/unlock.ts";
import { chat, topics, askTopic, giveGift, giftValue, giftable, giftsLeft, type Preference } from "../../engine/social.ts";
import { canStart, buildDuelist } from "../../engine/encounter.ts";
import { computeStats } from "../../engine/stats.ts";
import { questStatus } from "../../engine/progression.ts";
import { ITEM_ICON } from "./items.ts";
import { shopScreen } from "./shop.ts";
import { missionHallScreen } from "./quests.ts";
import { startEncounter } from "./battle.ts";
import { canBond, bondDao } from "../../engine/companions.ts";

type Line = { who: "npc" | "me" | "note"; text: string };
/** Conversation logs live for the session only (never saved). */
const LOGS = new Map<string, Line[]>();
const log = (npc: string) => { let l = LOGS.get(npc); if (!l) LOGS.set(npc, (l = [])); return l; };

const STRATEGY: Record<string, string> = {
  aggressive: "Aggressive. Presses the attack on whoever is weakest.", berserker: "Berserker. Hits hard and ignores defence.",
  defensive: "Defensive. Shields and heals when hurt.", support: "Support. Keeps allies healed and shielded.",
  trickster: "Trickster. Debuffs and unpredictable targets.", caster: "Caster. Heavy techniques on the strongest foe.", guardian: "Guardian. Shields first, strikes later.",
};

export function npcScreen(app: App, npcId: string, backTo: string): Screen {
  let mode: "chat" | "ask" = "chat";
  return {
    id: `npc:${npcId}`, bg: () => { const n = app.content.get<any>(npcId); return n.location ? app.content.art(n.location, "background") : undefined; },
    render: () => {
      const s = app.game.state, c = app.content;
      const n = c.get<any>(npcId);
      const rel = s.relations[npcId];
      const aff = rel?.affinity ?? 0;
      const lv = affinityLevel(c, npcId, aff);
      const levels = n.affinity_levels as { name: string; threshold: number }[];
      const maxT = levels[levels.length - 1]!.threshold;
      const lines = log(npcId);
      const say = (who: Line["who"], text: string) => lines.push({ who, text });
      const quests = c.byPrefix<any>("quest").filter((q) => (q.giver === npcId || q.turn_in === npcId) && ["available", "active", "ready"].includes(questStatus(s, c, q, app.now())));
      const ready = quests.filter((q) => questStatus(s, c, q, app.now()) === "ready").length;
      const root = n.elements?.[0] ? c.find<any>(n.elements[0]) : null;
      const actions = [
        { id: "chat", label: "Chat", icon: "log", on: mode === "chat", run: () => {
          mode = "chat";
          const r = app.game.run("chat", app.now(), (st, cc) => chat(st, cc, npcId), false);
          if (r.ok) { say("me", greeting(s.character.name, lv.index)); say("npc", r.line); if (r.gained) say("note", `♥ +${r.gained} affinity`); }
        } },
        n.topics.length && { id: "ask", label: n.role === "elder" ? "Ask" : "Ask about them", icon: "info", on: mode === "ask", run: () => { mode = "ask"; app.router.refresh(); } },
        n.duel?.enabled && { id: "duel", label: "Duel", icon: "sword", run: () => sparCard(app, npcId) },
        { id: "gift", label: "Gift", icon: "fame", badge: giftsLeft(s, c, npcId), run: () => giftSheet(app, npcId, say) },
        n.shop && { id: "shop", label: "Shop", icon: "gem", run: () => app.router.push(shopScreen(app, n.shop, n.name)) },
        quests.length && { id: "quests", label: "Requests", icon: "scroll", badge: ready, run: () => app.router.push(missionHallScreen(app, npcId)) },
        canBond(s, c, npcId).ok && { id: "dao", label: "Dao Companion", icon: "fame", on: true, run: () => daoModal(app, npcId, say) },
      ].filter(Boolean) as any[];
      return [
        header(app),
        subbar({ title: n.name, cn: n.name_cn, sub: `Talk · ${n.title ?? n.role}`, backTo, onBack: () => app.router.back() }),
        h("div", { class: "npc-stage" },
          h("div", { class: "npc-figure", style: { backgroundImage: app.img(c.artAny(npcId, "full_body", "portrait")) } }),
          h("div", { class: "npc-name" }, n.name_cn && h("div", { class: "cn" }, n.name_cn), h("div", { class: "npc-n" }, n.name),
            h("div", { class: "row", style: { gap: "5px", flexWrap: "wrap" } }, h("span", { class: "glass tag" }, n.title?.split("·")[0]?.trim() ?? n.role), root && h("span", { class: "glass tag" }, `${root.name} Root`)))),
        h("div", { class: "glass panel aff-panel" },
          h("div", { class: "row" },
            h("span", { class: "aff-heart" }, String(lv.index)),
            h("div", { class: "grow" },
              h("div", { class: "row between" }, h("b", { class: "aff-name" }, lv.name), h("span", { class: "muted tnum" }, `${fmt.int(aff)} / ${fmt.int(maxT)}${lv.next ? ` · ${fmt.int(lv.next.threshold - aff)} to ${lv.next.name}` : ""}`)),
              h("div", { class: "aff-track" }, bar(aff / maxT, { cls: "pink thin" }), levels.slice(1).map((l) => h("span", { class: ["aff-mark", aff >= l.threshold && "on"], style: { left: `${(l.threshold / maxT) * 100}%` } }, h("i", null), h("em", null, l.name))))))),
        h("div", { class: "npc-actions" }, actions.map((a) => h("button", { class: ["glass npc-act", a.on && "on"], onClick: () => { a.run(); app.router.refresh(); } }, icon(a.icon, 18), h("span", null, a.label), a.badge > 0 && h("span", { class: "badge" }, String(a.badge))))),
        mode === "ask" ? askPanel(app, npcId, (q, a) => { say("me", q); say("npc", a); mode = "chat"; }) : chatPanel(app, npcId, lines),
      ];
    },
  };
}

function greeting(name: string, level: number): string {
  return ["Good day.", "Hello again.", "I brought tea.", "I was hoping to see you.", "There you are."][Math.min(4, level)]!;
}

function chatPanel(app: App, npcId: string, lines: Line[]) {
  const shown = lines.slice(-8);
  return h("div", { class: "glass panel chat" },
    h("div", { class: "sec-h" }, h("h3", null, "Chat"), h("span", { class: "hint" }, "Tap Chat to talk · once a day for affinity")),
    shown.length ? shown.map((l) => l.who === "note" ? h("div", { class: "chat-note" }, l.text)
      : h("div", { class: ["chat-line", l.who] }, l.who === "npc" && npcAvatar(app, npcId, 28), h("div", { class: "chat-bubble" }, l.text), l.who === "me" && npcAvatar(app, app.game.state.character.npc, 28)))
      : h("div", { class: "muted center" }, app.content.get<any>(npcId).personality));
}

function askPanel(app: App, npcId: string, done: (q: string, a: string) => void) {
  const s = app.game.state, c = app.content;
  const list = topics(s, c, npcId);
  return h("div", { class: "glass panel" },
    h("div", { class: "sec-h" }, h("h3", null, "Ask about…"), h("span", { class: "hint" }, `${list.filter((t) => t.heard).length} / ${list.length} heard`)),
    h("div", { class: "rows" }, list.map((t) => h("button", { class: ["setrow", !t.unlocked && "dim-card"], onClick: () => {
      const r = app.game.run("ask", app.now(), (st, cc) => askTopic(st, cc, npcId, t.id), false);
      if (!r.ok) { app.router.toast(r.reason, "bad"); return; }
      done(t.title, r.answer);
      if (r.first) app.router.toast(`${c.get<any>(npcId).name} opened up a little`, "good");
    } }, icon(t.unlocked ? (t.heard ? "log" : "info") : "lock", 16),
      h("div", { class: "grow", style: { textAlign: "left" } }, h("div", { class: "lbl" }, t.title), h("div", { class: "desc" }, t.unlocked ? t.summary : t.reason)),
      t.unlocked && !t.heard && h("span", { class: "tag pink" }, "New")))));
}

const PREF: Record<Preference, { label: string; cls: string; icon: string }> = {
  loved: { label: "Loves", cls: "pink", icon: "♥" }, liked: { label: "Likes", cls: "gold", icon: "♥" }, neutral: { label: "Neutral", cls: "", icon: "○" }, disliked: { label: "Dislikes", cls: "red", icon: "♡" },
};

function giftSheet(app: App, npcId: string, say: (who: Line["who"], text: string) => void) {
  let sel: string | undefined;
  app.router.open({ id: "gift", kind: "sheet", cls: "tall", render: (close) => {
    const s = app.game.state, c = app.content;
    const n = c.get<any>(npcId);
    const items = giftable(s, c, npcId).map((id) => ({ id, ...giftValue(s, c, npcId, id) })).sort((a, b) => b.value - a.value);
    if (!sel || !items.some((x) => x.id === sel)) sel = items[0]?.id;
    const pick = items.find((x) => x.id === sel);
    const aff = s.relations[npcId]?.affinity ?? 0;
    const lv = affinityLevel(c, npcId, aff);
    const after = pick ? Math.max(0, aff + pick.value) : aff;
    const lvAfter = affinityLevel(c, npcId, after);
    const left = giftsLeft(s, c, npcId);
    const names = (list: any[]) => list.map((x) => c.find<any>(x.id)?.name ?? x.id).join(", ");
    return h("div", { class: "stack" },
      h("div", { class: "row" }, npcAvatar(app, npcId, 40), h("div", { class: "grow" }, h("div", { class: "m-title", style: { margin: 0 } }, "Give a Gift"), h("div", { class: "muted" }, `${n.name} · ${left} more today`)), h("button", { class: "icon-btn", onClick: close, "aria-label": "Close" }, icon("close", 14))),
      h("div", { class: "grid-3" },
        h("div", { class: "glass pref pink" }, h("b", null, "♥ Loves"), h("div", { class: "muted" }, names(n.gifts.loved) || n.gifts.loved_tags.join(", ") || "—")),
        h("div", { class: "glass pref gold" }, h("b", null, "♥ Likes"), h("div", { class: "muted" }, names(n.gifts.liked) || n.gifts.liked_tags.join(", ") || "—")),
        h("div", { class: "glass pref" }, h("b", null, "♡ Dislikes"), h("div", { class: "muted" }, names(n.gifts.disliked) || "—"))),
      h("div", { class: "row between muted up" }, h("span", null, "Your gifts"), h("span", null, `${items.length} items`)),
      items.length ? h("div", { class: "gift-grid" }, items.map((x) => {
        const def = c.get<any>(x.id);
        const repeat = (s.daily.counters[`gift:${npcId}:${x.id}`] ?? 0) > 0;
        return h("button", { class: ["glass gift", x.id === sel && "on"], onClick: () => { sel = x.id; app.router.refresh(); } },
          repeat && h("span", { class: "tag gold gift-rep" }, "Repeat"),
          tile({ rarity: def.rarity ?? "common", art: c.art(x.id, "icon"), fallbackIcon: ITEM_ICON[x.id.split(".")[0]!], qty: s.inventory.stacks[x.id], img: (f) => app.img(f) }),
          h("div", { class: "gift-n" }, def.name), h("div", { class: `gift-v ${PREF[x.pref].cls}-t` }, `${PREF[x.pref].icon} ${x.value > 0 ? "+" : ""}${x.value}`));
      })) : h("div", { class: "muted center" }, "You have nothing to give. Gifts drop on adventures and sell at the Merchant Pavilion."),
      pick && h("div", { class: "glass panel" },
        h("div", { class: "row between" }, h("span", { class: "muted up" }, `Affinity preview · ${PREF[pick.pref].label}`), h("b", { class: pick.value >= 0 ? "pink-t" : "red-t" }, `${pick.value >= 0 ? "+" : ""}${pick.value}`)),
        h("div", { class: "aff-track", style: { margin: "8px 0 4px" } }, bar(after / (lv.next?.threshold ?? Math.max(1, after)), { cls: "pink thin" })),
        h("div", { class: "muted" }, `${lv.name} ${aff} → ${after}${lvAfter.index > lv.index ? ` · becomes ${lvAfter.name}!` : lv.next ? ` · ${Math.max(0, lv.next.threshold - after)} more to ${lv.next.name}` : ""}`)),
      h("div", { class: "muted" }, icon("info", 11), ` Repeats give less: each repeat of the same gift today is worth ×${n.gifts.repeat_decay}. Vary gifts for full value.`),
      h("div", { class: "grid-2" },
        h("button", { class: "btn ghost", onClick: close }, "Cancel"),
        h("button", { class: "btn gold", disabled: !pick || left <= 0, onClick: () => {
          const r = app.game.run("gift", app.now(), (st, cc) => giveGift(st, cc, npcId, pick!.id));
          if (!r.ok) { app.router.toast(r.reason, "bad"); return; }
          const def = c.get<any>(pick!.id);
          say("me", `(gives ${def.name})`);
          say("npc", reaction(r.pref));
          say("note", `♥ ${r.delta > 0 ? "+" : ""}${r.delta} affinity`);
          app.router.toast(`${n.name} ${r.pref === "loved" ? "loves it!" : r.pref === "liked" ? "likes it." : r.pref === "disliked" ? "doesn't like that…" : "accepts it."}`, r.delta > 0 ? "good" : "bad");
          close();
        }, style: { flexDirection: "column", gap: "0", lineHeight: 1.15 } }, "Give Gift", pick && h("span", { class: "cta-s", style: { marginLeft: "0" } }, c.get<any>(pick.id).name))));
  } });
}

function reaction(p: Preference): string {
  return { loved: "…For me? This is exactly what I wanted. Thank you.", liked: "Oh, that's thoughtful. Thank you.", neutral: "Thank you. I'll find a use for it.", disliked: "…I'll pretend I didn't see this." }[p];
}

function sparCard(app: App, npcId: string) {
  app.router.open({ id: "spar", kind: "modal", cls: "wide", render: (close) => {
    const s = app.game.state, c = app.content;
    const n = c.get<any>(npcId);
    const me = computeStats(s, c).cp;
    const foe = buildDuelist(c, npcId).cp ?? n.cp ?? 0;
    const can = canStart(s, c, { kind: "duel", npc: npcId }, app.now());
    const diff = foe - me;
    const verdict = diff > me * 0.3 ? "Very tough" : diff > 0 ? `Tough · +${fmt.int(diff)} CP` : diff > -me * 0.2 ? "Even match" : "Favourable";
    const realm = (r: any) => r ? `${c.get<any>(r.id).name} ${fmt.roman(r.stage ?? 1)}` : "";
    const stake = (r: any) => [r.affinity?.find((a: any) => a.npc === npcId)?.delta ? `Affinity +${r.affinity.find((a: any) => a.npc === npcId).delta}` : null, r.mastery_xp ? `Mastery XP +${r.mastery_xp}` : null, r.spirit_stones ? `${r.spirit_stones} stones` : null].filter(Boolean) as string[];
    return h("div", null,
      h("div", { class: "spar-ribbon" }, icon("sword", 14), "Friendly Spar", h("span", { class: "cn" }, "切磋")),
      h("div", { class: "spar-vs" },
        h("div", { class: "center" }, npcAvatar(app, s.character.npc, 64), h("div", { class: "lbl" }, s.character.name), h("div", { class: "muted" }, `${c.get<any>(s.character.realm).name} ${s.character.stage}`), h("span", { class: "tag" }, `CP ${fmt.int(me)}`)),
        h("div", { class: "center" }, h("div", { class: "vs" }, "VS"), h("span", { class: ["tag", diff > 0 ? "red" : "jade"] }, verdict)),
        h("div", { class: "center" }, npcAvatar(app, npcId, 64), h("div", { class: "lbl" }, n.name), h("div", { class: "muted" }, realm(n.realm)), h("span", { class: "tag" }, `CP ${fmt.int(foe)}`))),
      h("div", { class: "glass panel" }, h("b", null, STRATEGY[n.duel.strategy]?.split(".")[0] ?? n.duel.strategy), h("span", { class: "dim" }, ` ${STRATEGY[n.duel.strategy]?.split(".").slice(1).join(".") ?? ""}`),
        h("div", { class: "row", style: { gap: "4px", flexWrap: "wrap", marginTop: "6px" } }, n.duel.loadout.map((t: string) => h("span", { class: "tag" }, c.get<any>(t).name)))),
      h("div", { class: "row", style: { gap: "5px", flexWrap: "wrap", margin: "8px 0" } }, ["No Fame loss", "Nothing lost on defeat", "HP restored after"].map((t) => h("span", { class: "tag jade" }, "✓ ", t))),
      h("div", { class: "grid-2" },
        h("div", { class: "glass panel" }, h("div", { class: "muted up" }, "If you win"), stake(n.duel.win).map((x) => h("div", null, x))),
        h("div", { class: "glass panel" }, h("div", { class: "muted up" }, "If you lose"), stake(n.duel.lose).map((x) => h("div", null, x)))),
      !can.ok && h("div", { class: "warnbox" }, icon("clock", 14), can.reason),
      h("div", { class: "grid-2", style: { marginTop: "10px" } },
        h("button", { class: "btn ghost", onClick: close }, "Not now"),
        h("button", { class: "btn gold", disabled: !can.ok, onClick: () => { close(); const hp = s.character.hp; startEncounter(app, { kind: "duel", npc: npcId }, () => { app.game.state.character.hp = hp; }); } }, "Spar!")));
  } });
}

function daoModal(app: App, npcId: string, say: (who: Line["who"], text: string) => void) {
  app.router.open({ id: "dao", kind: "modal", cls: "celebrate", render: (close) => {
    const c = app.content;
    const n = c.get<any>(npcId);
    return h("div", { class: "center" },
      h("div", { class: "muted up pink-t" }, "道侣 · Dao Companion"),
      h("div", { style: { margin: "10px auto", width: "max-content" } }, npcAvatar(app, npcId, 84)),
      h("div", { class: "result-title", style: { fontSize: "calc(26rem / 15)" } }, n.name),
      h("div", { class: "dim", style: { margin: "8px 0" } }, `Ask ${n.name} to walk the path to immortality at your side. Dao companions cultivate with you (×${c.rules.dao.qi_mult} Qi) and fight beside you in adventures and great dungeons.`),
      h("div", { class: "grid-2" },
        h("button", { class: "btn ghost", onClick: close }, "Not yet"),
        h("button", { class: "btn gold", onClick: () => {
          const r = app.game.run("dao", app.now(), (st, cc) => bondDao(st, cc, npcId));
          if (!r.ok) { app.router.toast(r.reason, "bad"); return; }
          say("me", "Will you walk the path with me?"); say("npc", "…I was waiting for you to ask."); say("note", "道侣 · You are now Dao companions");
          close();
        } }, "Ask")));
  } });
}
