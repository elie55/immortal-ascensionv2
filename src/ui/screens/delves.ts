/**
 * Dungeon hub (mockup "dungeon_hub"): the Endless Tower hero card, then Resource, Challenge, Secret Realm and
 * Mega dungeon sections. Tower screen: floors around your best, milestones, Climb. Secret realm (mockup
 * "secret_realm_map"): the realm map with trial pins, a status bar (trials, hidden rooms, HP), the selected
 * node's card with its action, run loot, and "Leave · progress saved".
 */
import { h, fmt } from "../core/dom.ts";
import { icon } from "../core/icons.ts";
import { header, subbar, section, bar, cta, powerTone } from "../core/kit.ts";
import type { Screen } from "../core/router.ts";
import type { App } from "../../app.ts";
import type { Dungeon } from "../../content/index.ts";
import { canStart, tierCheck, tierCleared } from "../../engine/encounter.ts";
import { computeStats } from "../../engine/stats.ts";
import { towerFloor, bestFloor, canEnterRealm, enterRealm, realmRun, realmNodeState, realmInteract, realmSummary, abandonRealm, type RealmNodeState } from "../../engine/delves.ts";
import { startEncounter } from "./battle.ts";
import { shopScreen } from "./shop.ts";
import { rewardsLine } from "./adventure.ts";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const cpChip = (app: App) => h("span", { class: "cp-chip" }, icon("sword", 13), h("span", null, h("span", { class: "lbl" }, "Your CP"), h("b", null, fmt.int(computeStats(app.game.state, app.content).cp))));

// ---------- hub ----------

/** Selected tier per resource dungeon (UI only). */
const tierPick = new Map<string, number>();

export function dungeonHubScreen(app: App): Screen {
  return {
    id: "dungeons",
    render: () => {
      const s = app.game.state, c = app.content, now = app.now();
      const all = c.byPrefix<Dungeon>("dungeon").slice().sort((a, b) => a.rec_cp - b.rec_cp);
      const cp = computeStats(s, c).cp;
      const tower = all.find((d) => d.kind === "tower");
      const group = (k: string) => all.filter((d) => d.kind === k);
      const card = (d: Dungeon) => {
        const isRealm = d.kind === "secret_realm";
        const rec = s.progress.dungeons[d.id];
        // resource dungeons: tier I–V picker; default to the highest tier that is open
        const tiers = d.tiers ?? [];
        const openTier = (t: number) => t <= 1 ? canStart(s, c, { kind: "dungeon", id: d.id }, now).ok || !!rec?.clears : tierCheck(s, c, d, t).ok;
        if (tiers.length && !tierPick.has(d.id)) tierPick.set(d.id, tiers.filter((t) => openTier(t.tier)).map((t) => t.tier).pop() ?? 1);
        const tierN = tiers.length ? tierPick.get(d.id)! : 1;
        const tier = tiers.find((t) => t.tier === tierN);
        const src = { kind: "dungeon" as const, id: d.id, tier: tierN > 1 ? tierN : undefined };
        const can = isRealm ? canEnterRealm(s, c, d.id, now) : canStart(s, c, src, now);
        const run = isRealm ? realmRun(s, d.id) : undefined;
        const daily = d.entry.daily_limit ? `${Math.max(0, d.entry.daily_limit - (s.daily.counters[`dungeon:${d.id}`] ?? 0))}/${d.entry.daily_limit} today` : "Unlimited";
        const go = () => isRealm ? app.router.push(realmScreen(app, d.id)) : startEncounter(app, src);
        const recCp = tier?.rec_cp ?? d.rec_cp;
        const firstDone = tier ? tierCleared(s, d.id, tierN) : !!rec?.clears;
        const fc = tier ? tier.rewards.first_clear : d.rewards.first_clear;
        return h("div", { class: ["glass dungeon-card", !can.ok && "locked"], dataset: { dungeon: d.id } },
          h("div", { class: "dc-art", style: { backgroundImage: app.img(c.art(d.id, "card")) } }, h("span", { class: "tag", style: { position: "absolute", left: "8px", top: "8px" } }, d.kind.replace("_", " "))),
          h("div", { class: "dc-body" },
            h("div", { class: "row between" }, h("div", { class: "title", style: { fontSize: "calc(14rem / 15)" } }, d.name, tier && tier.tier > 1 && h("span", { class: "cn", style: { marginLeft: "6px", fontSize: "calc(12rem / 15)" } }, tier.name)), h("span", { class: ["tag", powerTone(cp, recCp)] }, `Rec. ${fmt.int(recCp)}`)),
            tiers.length > 0 && h("div", { class: "tier-row" }, tiers.map((t) => {
              const open = openTier(t.tier), done = tierCleared(s, d.id, t.tier);
              return h("button", { class: ["tier", t.tier === tierN && "on", done && "done", !open && "locked"], "aria-label": `Tier ${t.name}`, title: open ? `Rec. CP ${fmt.int(t.rec_cp)}` : (t.tier > 1 ? (tierCheck(s, c, d, t.tier) as any).reason : ""), onClick: () => { tierPick.set(d.id, t.tier); app.router.refresh(); } }, open ? t.name : icon("lock", 11), done && h("i", { class: "tier-done" }, "✓"));
            })),
            h("div", { class: "muted" }, isRealm ? `${d.realm_nodes!.filter((n) => n.waves?.length).length} trials · ${d.realm_nodes!.filter((n) => n.kind === "hidden").length} hidden · ${d.entry.energy_cost} energy per run` : `${d.waves!.length} waves · ${d.entry.energy_cost ? `${d.entry.energy_cost} energy` : "free"} · ${daily}${tier && tier.tier > 1 ? ` · rewards ×${(c.get<any>(tier.rewards.clear).spirit_stones[1] / c.get<any>(d.rewards.clear).spirit_stones[1]).toFixed(1)}` : ""}`),
            rec?.clears ? h("div", { class: "muted" }, `Cleared ×${rec.clears}${tier && tier.tier > 1 ? ` · tier ${tier.name} ×${rec.tierClears?.[tierN] ?? 0}` : ""}`) : null,
            d.entry.party.companions_allowed && h("div", { class: "muted pink-t" }, `♥ Up to ${d.entry.party.max_companions} Dao companions`),
            h("div", { class: "row between", style: { marginTop: "6px" } },
              h("span", { class: "muted" }, can.ok ? (!firstDone && Object.keys(fc ?? {}).length ? "First-clear bonus" : "") : can.reason),
              h("button", { class: ["btn sm", can.ok && "gold"], disabled: !can.ok, onClick: go }, run ? "Resume" : tier && tier.tier > 1 ? `Enter ${tier.name}` : "Enter"))));
      };
      return [
        header(app),
        subbar({ help: { app, key: "dungeons" }, title: "Dungeons", cn: "秘境", sub: "Tower · resource · challenge · secret realms · mega", backTo: "Regions", onBack: () => app.router.back(), end: cpChip(app) }),
        tower && towerHero(app, tower),
        section("Resource", "Farm materials and spirit stones", h("div", { class: "rows" }, group("resource").map(card))),
        section("Challenge", "Multi-wave, HP carries over", h("div", { class: "rows" }, group("challenge").map(card))),
        section("Secret Realms", "Branching rooms · first-clear rewards once", h("div", { class: "rows" }, group("secret_realm").map(card))),
        section("Mega Dungeons", "Party with Dao companions · Divine gear", h("div", { class: "rows" }, group("mega").map(card))),
      ];
    },
  };
}

function towerHero(app: App, d: Dungeon) {
  const s = app.game.state, c = app.content;
  const best = bestFloor(s, d.id);
  const next = Math.min(best + 1, d.tower!.floors);
  const nf = towerFloor(c, d, next);
  const bossFloor = Math.ceil(next / d.tower!.boss_every) * d.tower!.boss_every;
  const bf = towerFloor(c, d, bossFloor);
  const ms = d.tower!.milestones.find((m) => m.floor > best);
  const can = canStart(s, c, { kind: "tower", id: d.id, floor: next }, app.now());
  const cp = computeStats(s, c).cp;
  return h("div", { class: "glass gold tower-hero", style: { backgroundImage: app.img(c.art(d.id, "card")) } },
    h("div", { class: "th-shade" }),
    h("div", { class: "th-body" },
      h("div", { class: "muted up gold-t" }, "Endless Tower"),
      h("button", { class: "th-title", onClick: () => app.router.push(towerScreen(app, d.id)) }, d.name, d.name_cn && h("span", { class: "cn" }, ` ${d.name_cn}`)),
      h("div", { class: "th-stats" },
        h("div", { class: "glass" }, h("span", null, "Best floor"), h("b", null, String(best))),
        h("div", { class: "glass" }, h("span", null, `Next · floor ${next}`), h("b", { class: `${powerTone(cp, nf.power)}-t` }, `Rec. ${fmt.int(nf.power)}`)),
        h("div", { class: "glass" }, h("span", null, `Boss · floor ${bossFloor}`), h("b", { class: `${powerTone(cp, bf.power)}-t` }, `Rec. ${fmt.int(bf.power)}`))),
      h("div", { class: "row between", style: { marginTop: "8px", gap: "8px" } },
        h("span", { class: "muted" }, ms ? `Floor ${ms.floor} first clear: ` : "All milestones claimed", ms && rewardsLine(app, ms.rewards)),
        h("button", { class: "btn gold", disabled: !can.ok, onClick: () => startEncounter(app, { kind: "tower", id: d.id, floor: next }) }, best >= d.tower!.floors ? "Summit" : `Climb › Floor ${next}`)),
      !can.ok && h("div", { class: "muted" }, can.reason)));
}

// ---------- tower ----------

export function towerScreen(app: App, id: string): Screen {
  return {
    id: "tower", bg: () => app.content.art(id, "battle_bg"),
    render: () => {
      const s = app.game.state, c = app.content;
      const d = c.get<Dungeon>(id);
      const best = bestFloor(s, id);
      const cp = computeStats(s, c).cp;
      const from = Math.min(d.tower!.floors, best + 3), to = Math.max(1, best - 2);
      const floors: number[] = []; for (let f = from; f >= to; f--) floors.push(f);
      const can = canStart(s, c, { kind: "tower", id, floor: best + 1 }, app.now());
      return [
        header(app),
        subbar({ help: { app, key: "tower" }, title: d.name, cn: d.name_cn, sub: `Best floor ${best} / ${d.tower!.floors} · no energy, no daily cap`, backTo: "Dungeons", onBack: () => app.router.back(), end: cpChip(app) }),
        h("div", { class: "tower-floors" }, floors.map((f) => {
          const tf = towerFloor(c, d, f);
          const state = f <= best ? "done" : f === best + 1 ? "next" : "locked";
          return h("div", { class: ["glass tf", state, tf.boss && "boss"] },
            h("span", { class: "tf-n" }, String(f)),
            h("div", { class: "grow" }, h("div", { class: "lbl" }, tf.boss ? c.get<any>(tf.enemies[0]!).name : tf.enemies.map((e) => c.get<any>(e).name).join(" · ")),
              h("div", { class: "muted" }, `${tf.boss ? "Warden floor · " : ""}${fmt.int(tf.stones)} stones${tf.milestone ? " · milestone" : ""}`)),
            h("span", { class: ["tag", cp >= tf.power ? "jade" : "red"] }, `CP ${fmt.int(tf.power)}`),
            state === "done" && h("span", { class: "tag jade" }, "✓"));
        })),
        section("Milestones", "Paid the first time you clear the floor", h("div", { class: "rows" }, d.tower!.milestones.map((m) => h("div", { class: ["setrow", best >= m.floor && "on"] },
          h("b", { class: "tf-n" }, String(m.floor)), h("div", { class: "grow" }, rewardsLine(app, m.rewards)), best >= m.floor ? h("span", { class: "tag jade" }, "Claimed") : h("span", { class: "tag" }, `${m.floor - best} to go`))))),
        cta(best >= d.tower!.floors ? "Summit reached" : `Climb floor ${best + 1}`, can.ok ? `Rec. CP ${fmt.int(towerFloor(c, d, Math.min(best + 1, d.tower!.floors)).power)} · your CP ${fmt.int(cp)}` : can.reason, () => startEncounter(app, { kind: "tower", id, floor: best + 1 }), { disabled: !can.ok }),
      ];
    },
  };
}

// ---------- secret realm ----------

const NODE_ICON: Record<string, string> = { battle: "sword", elite: "sword", boss: "fame", chest: "gem", event: "sparkle", cultivation: "qi", merchant: "pouch", hidden: "info", exit: "back" };
const NODE_LABEL: Record<string, string> = { battle: "Trial", elite: "Elite trial", boss: "Guardian", chest: "Vault", event: "Encounter", cultivation: "Spirit pool", merchant: "Merchant", hidden: "Hidden room", exit: "Exit" };

export function realmScreen(app: App, id: string): Screen {
  let sel: string | null = null;
  return {
    id: `realm:${id}`, bg: () => app.content.art(id, "battle_bg"),
    render: () => {
      const s = app.game.state, c = app.content, now = app.now();
      const d = c.get<Dungeon>(id);
      const run = realmRun(s, id);
      const sum = realmSummary(s, c, id);
      const nodes = d.realm_nodes!;
      const st = (k: string): RealmNodeState => realmNodeState(s, c, id, k);
      if (!sel || st(sel) === "hidden") sel = nodes.find((n) => st(n.key) === "open")?.key ?? run?.at ?? nodes[0]!.key;
      const can = canEnterRealm(s, c, id, now);
      const maxHp = computeStats(s, c).total.hp ?? 1;
      const hp = run?.hp ?? s.character.hp ?? maxHp;
      // trial numbering from the gate upwards
      const trials = nodes.filter((n) => n.waves?.length).sort((a, b) => b.position[1] - a.position[1]);
      const num = (k: string) => { const i = trials.findIndex((t) => t.key === k); return i >= 0 ? ROMAN[i] : null; };
      const line = (a: { position: [number, number] | number[] }, b: { position: [number, number] | number[] }, on: boolean) => h("i", { class: ["rl", on && "on"], style: lineStyle(a.position as number[], b.position as number[]) });
      const drawn = new Set<string>();
      return [
        header(app),
        subbar({ help: { app, key: "realm" }, title: d.name, cn: d.name_cn, sub: `${run ? "Run in progress" : "Branching realm"} · replayable · first-clear rewards once`, backTo: "Dungeons", onBack: () => app.router.back(), end: cpChip(app) }),
        h("div", { class: "glass realm-status" },
          h("span", null, icon("temple", 13), ` Trials ${sum.trialsDone} / ${sum.trials}`),
          sum.hidden > 0 && h("span", null, icon("info", 13), ` Hidden rooms ${sum.hiddenFound} / ${sum.hidden}`),
          h("span", null, "♥ HP ", h("b", null, `${fmt.int(Math.min(hp, maxHp))} / ${fmt.int(maxHp)}`))),
        h("div", { class: "realm-map", style: { backgroundImage: app.img(c.art(id, "map") ?? c.art(id, "card")) } },
          nodes.flatMap((n) => n.connections.map((k) => {
            const key = [n.key, k].sort().join("|"); if (drawn.has(key)) return null; drawn.add(key);
            const o = nodes.find((x) => x.key === k)!;
            if (st(n.key) === "hidden" || st(o.key) === "hidden") return null;
            return line(n, o, !!run && (run.cleared.includes(n.key) || run.cleared.includes(o.key)));
          })),
          nodes.map((n) => {
            const ns = st(n.key);
            const label = num(n.key);
            return h("button", { class: ["rpin", `k-${n.kind}`, `st-${ns}`, sel === n.key && "sel"], style: { left: `${n.position[0] * 100}%`, top: `${n.position[1] * 100}%` }, "aria-label": n.name, onClick: () => { sel = n.key; app.router.refresh(); } },
              ns === "hidden" ? "?" : label ? h("span", { class: "rp-num" }, label) : icon(NODE_ICON[n.kind] ?? "sparkle", 16),
              ns === "cleared" && h("span", { class: "np-done" }, "✓"), ns === "locked" && h("span", { class: "rp-lock" }, icon("lock", 9)),
              run?.at === n.key && h("span", { class: "np-here" }, "You"));
          })),
        sel && nodeCard(app, id, sel, (k) => { sel = k; }),
        run && (run.stones || run.items.length || run.gear.length) ? h("div", { class: "glass realm-loot" }, h("span", { class: "muted up" }, "Run loot"),
          run.stones > 0 && h("span", { class: "tag gold" }, icon("gem", 10), ` ${fmt.int(run.stones)}`),
          run.items.slice(0, 6).map((it) => h("span", { class: "tag" }, `${it.qty}× ${c.get<any>(it.id).name}`)), run.gear.length > 0 && h("span", { class: "tag jade" }, `${run.gear.length} gear`)) : null,
        run ? h("div", { class: "grid-2" },
            h("button", { class: "btn ghost", onClick: () => { app.router.toast("Progress saved — come back any time", "info"); app.router.back(); } }, "Leave · progress saved"),
            h("button", { class: "btn ghost red-t", onClick: () => confirmAbandon(app, id) }, "Abandon run"))
          : cta(can.ok ? "Enter the realm" : "Sealed", can.ok ? `${d.entry.energy_cost} energy · rec. CP ${fmt.int(d.rec_cp)}` : can.reason, () => { const r = app.game.run("realm", app.now(), (st2, cc) => enterRealm(st2, cc, id, app.now())); if (!r.ok) app.router.toast(r.reason, "bad"); }, { disabled: !can.ok }),
      ];
    },
  };
}

function lineStyle(a: number[], b: number[]) {
  // the map is 1:1.4 (width:height); compute in px-like units then convert back to %
  const W = 100, H = 140;
  const ax = a[0]! * W, ay = a[1]! * H, bx = b[0]! * W, by = b[1]! * H;
  const len = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
  return { left: `${a[0]! * 100}%`, top: `${a[1]! * 100}%`, width: `${(len / W) * 100}%`, transform: `rotate(${ang}rad)` };
}

function nodeCard(app: App, id: string, key: string, select: (k: string) => void) {
  const s = app.game.state, c = app.content;
  const d = c.get<Dungeon>(id);
  const n = d.realm_nodes!.find((x) => x.key === key)!;
  const state = realmNodeState(s, c, id, key);
  const run = realmRun(s, id);
  const cp = computeStats(s, c).cp;
  const enemies = n.waves?.flat() ?? [];
  const enemyCp = enemies.reduce((sum, e) => sum + (c.get<any>(e).cp ?? 0), 0) / Math.max(1, n.waves?.length ?? 1);
  const act = (choice = 0) => {
    const r = app.game.run("realm", app.now(), (st, cc) => realmInteract(st, cc, id, key, app.now(), choice));
    if (!r.ok) { app.router.toast(r.reason, "bad"); return; }
    if (r.shop) { app.router.push(shopScreen(app, r.shop, d.name)); return; }
    if (r.battle) { app.router.open({ id: "realm-ev", kind: "modal", render: (close) => h("div", null, h("p", { class: "dim center" }, r.text), h("button", { class: "btn gold block", onClick: () => { close(); startEncounter(app, { kind: "realm", id, node: key, enemies: r.battle }); } }, "To battle!")) }); return; }
    if (r.finished) { app.router.open({ id: "realm-done", kind: "modal", cls: "celebrate", render: (close) => h("div", { class: "center" }, h("div", { class: "result-title win" }, "Realm cleared"), h("p", { class: "dim" }, r.text), h("button", { class: "btn gold block", onClick: () => { close(); app.router.back(); } }, "Return")) }); return; }
    if (r.text) app.router.toast(r.text, "good", 3200);
    const next = d.realm_nodes!.find((x) => realmNodeState(app.game.state, c, id, x.key) === "open");
    if (next) select(next.key);
  };
  const ev = n.event ? c.get<any>(n.event) : null;
  const head = h("div", { class: "row" },
    h("div", { class: "grow" }, h("div", { class: "muted up" }, `${NODE_LABEL[n.kind] ?? n.kind}${state === "cleared" ? " · ✓" : state === "locked" ? " · locked" : run?.at === key ? " · you are here" : ""}`),
      h("div", { class: "title", style: { fontSize: "calc(16rem / 15)" } }, state === "hidden" ? "???" : n.name)),
    enemies.length > 0 && h("span", { class: ["tag", powerTone(cp, enemyCp)] }, `Rec. ${fmt.int(enemyCp)}`));
  let body: any = null;
  if (state === "hidden") body = h("div", { class: "muted" }, n.hidden ? `Something is sealed here… (${n.hidden.condition})` : "Something is sealed here…");
  else if (state === "locked") body = h("div", { class: "muted" }, n.kind === "exit" ? "Defeat the guardian to open the way out." : "Clear a connected room first.");
  else if (state === "cleared") body = h("div", { class: "muted" }, n.kind === "merchant" ? h("button", { class: "btn sm", onClick: () => app.router.push(shopScreen(app, n.shop!, d.name)) }, "Trade again") : "Done for this run.");
  else if (!run) body = h("div", { class: "muted" }, "Enter the realm to begin.");
  else if (enemies.length) body = [h("div", { class: "row", style: { gap: "4px", flexWrap: "wrap" } }, [...new Set(enemies)].map((e) => h("span", { class: "tag" }, c.get<any>(e).name))),
    h("div", { class: "row between", style: { marginTop: "8px" } }, h("span", { class: "muted" }, `${n.waves!.length} wave${n.waves!.length > 1 ? "s" : ""} · HP carries over`), h("button", { class: "btn gold", onClick: () => startEncounter(app, { kind: "realm", id, node: key }) }, "Enter"))];
  else if (ev) body = [h("div", { class: "dim", style: { fontStyle: "italic", margin: "4px 0 8px" } }, ev.text), h("div", { class: "rows" }, ev.choices.map((ch: any, i: number) => h("button", { class: "setrow", onClick: () => act(i) }, icon("chevron", 14), h("span", { class: "grow", style: { textAlign: "left" } }, ch.text))))];
  else body = h("div", { class: "row between" }, h("span", { class: "muted" }, n.kind === "chest" ? "A sealed vault hums with qi." : n.kind === "cultivation" ? "Rest here to restore your health." : n.kind === "merchant" ? "A hooded merchant waits." : n.kind === "exit" ? "Leave and claim the realm's rewards." : ""),
    h("button", { class: "btn gold", onClick: () => act() }, n.kind === "chest" ? "Open" : n.kind === "cultivation" ? "Rest" : n.kind === "merchant" ? "Trade" : n.kind === "exit" ? "Leave & claim" : "Explore"));
  return h("div", { class: ["glass panel realm-card", state === "open" && "gold"] }, head, body);
}

function confirmAbandon(app: App, id: string) {
  app.router.open({ id: "abandon", kind: "modal", render: (close) => h("div", { class: "center" },
    h("div", { class: "m-title" }, "Abandon this run?"), h("p", { class: "dim" }, "Loot you found stays with you. The rooms reset and a new run costs energy again."),
    h("div", { class: "grid-2" }, h("button", { class: "btn ghost", onClick: close }, "Keep exploring"),
      h("button", { class: "btn", onClick: () => { app.game.run("realm", app.now(), (st) => abandonRealm(st, id)); close(); } }, "Abandon"))) });
}

export { bar };
