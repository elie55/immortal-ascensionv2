/**
 * Battle screen (mockup "battle_screen"): enemies on top with HP bars and status icons, boss banner with
 * phase and charge warnings, floating damage numbers, the player/beast cards with HP, SP and ultimate gauge,
 * the skill bar with cooldown overlays, Auto/Manual and speed controls. Victory and defeat panels per the
 * "victory" / "defeat" mockups. Owns its DOM and animates the engine's event stream.
 */
import { h, fmt, replaceChildren } from "../core/dom.ts";
import { icon } from "../core/icons.ts";
import { RARITY_LABEL } from "../core/kit.ts";
import type { Screen } from "../core/router.ts";
import type { App } from "../../app.ts";
import { Encounter as EncounterCls, type Encounter } from "../../engine/encounter.ts";
import type { Battle } from "../../engine/combat/battle.ts";
import type { Combatant, BattleEvent, Skill } from "../../engine/combat/types.ts";
import { computeStats } from "../../engine/stats.ts";
import { gearTile, gearName } from "./items.ts";
import { rewardsLine } from "./adventure.ts";

const STATUS_ICON: Record<string, string> = { "status.burning": "🔥", "status.poison": "☠", "status.bleeding": "🩸", "status.freeze": "❄", "status.stun": "✦", "status.silence": "🔇", "status.slow": "🐢", "status.def_down": "🛡↓", "status.atk_down": "⚔↓", "status.shield": "🛡", "status.regen": "❤", "status.reflect": "↩", "status.invuln": "◈" };
const ELEMENT_COLOR: Record<string, string> = { "elem.wood": "#5fd38a", "elem.fire": "#ff7b5c", "elem.earth": "#e0b45e", "elem.metal": "#e8ecf7", "elem.water": "#7fd0ff", "elem.none": "#c9cfe3" };

export function battleScreen(app: App, enc: Encounter, onExit: () => void): Screen {
  const c = app.content;
  const root = h("div", { class: "battle" });
  let battle: Battle = enc.battle!;
  let speed = app.game.state.combat.speed || app.settings.battleSpeed || 1;
  let timer: number | undefined;
  let playing = true;
  let selectedTarget: number | undefined;
  let phaseBanner: { text: string; until: number } | null = null;
  let chargeWarn: { text: string; turns: number } | null = null;
  const unitEls = new Map<number, HTMLElement>();
  const log: string[] = [];

  const name = (uid: number) => battle.units.find((u) => u.uid === uid)?.name ?? "?";
  const dur = (ms: number) => ms / speed;

  // ---------- layout ----------
  const top = h("div", { class: "bt-top glass" });
  const stage = h("div", { class: "bt-stage" });
  const enemyRow = h("div", { class: "bt-enemies" });
  const allyRow = h("div", { class: "bt-allies" });
  const banner = h("div", { class: "bt-banner" });
  const fx = h("div", { class: "bt-fx" });
  const bottom = h("div", { class: "bt-bottom" });
  const skillBar = h("div", { class: "bt-skills" });
  const controls = h("div", { class: "bt-controls glass" });
  stage.append(enemyRow, banner, allyRow, fx);
  bottom.append(skillBar, controls);
  root.append(h("div", { class: "bt-bg", style: { backgroundImage: app.img(enc.bg) } }), h("div", { class: "bt-shade" }), top, stage, bottom);

  function unitCard(u: Combatant): HTMLElement {
    const isAlly = u.side === "ally";
    const el = h("div", { class: ["bt-unit", isAlly ? "ally" : "enemy", u.kind, !u.alive && "dead", selectedTarget === u.uid && "target"], dataset: { uid: String(u.uid) }, onClick: () => { if (!isAlly && u.alive) { selectedTarget = u.uid; renderUnits(); } } },
      h("div", { class: "bt-sprite", style: { backgroundImage: app.img(u.art) } }, !u.art && h("span", { class: "bt-sprite-ph" }, icon(isAlly ? "person" : "sword", 36))),
      h("div", { class: "bt-plate" },
        h("div", { class: "bt-name" }, u.kind === "boss" && h("span", { class: "tag gold" }, "Boss"), u.name),
        h("div", { class: "bar thin hp" }, h("i", { style: { width: `${(u.hp / u.maxHp * 100).toFixed(1)}%` } }), u.shield > 0 && h("b", { class: "sh", style: { width: `${Math.min(100, u.shield / u.maxHp * 100).toFixed(1)}%` } })),
        isAlly && u.maxSp > 0 && h("div", { class: "bar thin sp" }, h("i", { style: { width: `${(u.sp / u.maxSp * 100).toFixed(1)}%` } })),
        h("div", { class: "bt-nums" }, h("span", null, `${fmt.compact(u.hp)} / ${fmt.compact(u.maxHp)}`), u.shield > 0 && h("span", { class: "cyan-t" }, `🛡 ${fmt.compact(u.shield)}`)),
        h("div", { class: "bt-status" }, u.statuses.map((s) => h("span", { class: "bt-st", title: c.get<any>(s.id).name }, STATUS_ICON[s.id] ?? "•", s.stacks > 1 && h("i", null, String(s.stacks)), h("i", { class: "turns" }, String(s.turns)))))));
    unitEls.set(u.uid, el);
    return el;
  }

  function renderUnits() {
    unitEls.clear();
    replaceChildren(enemyRow, battle.units.filter((u) => u.side === "enemy" && (u.alive || u.kind === "boss")).map(unitCard));
    replaceChildren(allyRow, battle.units.filter((u) => u.side === "ally").map(unitCard));
    const boss = battle.units.find((u) => u.kind === "boss");
    const p = battle.player;
    replaceChildren(banner,
      boss && boss.alive ? h("div", { class: "bt-bossbar glass gold" },
        h("div", { class: "row between" }, h("span", { class: "title", style: { fontSize: "13px" } }, boss.name), h("span", { class: "tag" }, `${boss.boss!.phases[boss.boss!.phase]!.name} · P${boss.boss!.phase + 1}/${boss.boss!.phases.length}`)),
        h("div", { class: "bar thick hp" }, h("i", { style: { width: `${(boss.hp / boss.maxHp * 100).toFixed(1)}%` } }), h("span", null, `${fmt.int(boss.hp)} / ${fmt.int(boss.maxHp)}`)),
        chargeWarn && h("div", { class: "bt-charge" }, icon("warning", 12), ` ${chargeWarn.text}`)) : null,
      phaseBanner && Date.now() < phaseBanner.until ? h("div", { class: "bt-phase" }, phaseBanner.text) : null,
      h("div", { class: "bt-ultgauge" }, h("i", { style: { width: `${p.ult}%` } }), h("span", null, p.ult >= 100 ? "ULTIMATE READY" : `Ultimate ${Math.floor(p.ult)}%`)));
  }

  function renderTop() {
    replaceChildren(top,
      h("div", { class: "grow" }, h("div", { class: "title", style: { fontSize: "13px" } }, enc.name), h("div", { class: "muted" }, `Wave ${enc.wave + 1} / ${enc.waves.length} · Round ${battle.round}${battle.opts.surviveRounds ? ` / ${battle.opts.surviveRounds}` : ""}`)),
      h("button", { class: "icon-btn", "aria-label": playing ? "Pause" : "Play", onClick: () => { playing = !playing; renderTop(); if (playing) loop(); } }, icon(playing ? "close" : "play", 16)));
  }

  function renderSkills() {
    const p = battle.player;
    const manual = battle.manual;
    const waiting = battle.needsInput;
    const skills = p.skills.filter((s) => s.kind !== "basic");
    const ult = skills.find((s) => s.kind === "ultimate");
    const cell = (s: Skill, cls = "") => {
      const cd = p.cooldowns[s.id] ?? 0;
      const usable = battle.canUse(p, s);
      const art = s.id === "basic" ? undefined : c.art(s.id, "icon");
      return h("button", { class: ["bt-skill", cls, usable && waiting && "ready", !usable && "off"], disabled: !(manual && waiting && usable), onClick: () => choose(s),
        title: `${s.name}${s.spCost ? ` · ${s.spCost} SP` : ""}${s.cooldown ? ` · CD ${s.cooldown}` : ""}` },
        h("span", { class: "sk-art", style: { backgroundImage: app.img(art), borderColor: ELEMENT_COLOR[s.element] } }, !art && icon(s.kind === "ultimate" ? "sparkle" : "sword", 20)),
        cd > 0 && h("span", { class: "sk-cd" }, String(cd)),
        s.kind === "ultimate" ? h("span", { class: "sk-cost" }, `${Math.floor(p.ult)}%`) : s.spCost > 0 && h("span", { class: "sk-cost" }, `${s.spCost} SE`),
        h("span", { class: "sk-name" }, s.name));
    };
    replaceChildren(skillBar,
      h("div", { class: "bt-skillrow" }, cell(p.skills[0]!, "basic"), ...skills.filter((s) => s.kind !== "ultimate").map((s) => cell(s)), ...Array.from({ length: Math.max(0, 4 - skills.filter((s) => s.kind !== "ultimate").length) }, () => h("div", { class: "bt-skill empty" }, icon("lock", 14)))),
      ult ? h("div", { class: "bt-ult" }, cell(ult, "ult")) : null);
    replaceChildren(controls,
      h("div", { class: "seg" }, h("button", { class: !manual && "on", onClick: () => setManual(false) }, "Auto"), h("button", { class: manual && "on", onClick: () => setManual(true) }, "Manual")),
      waiting && manual ? h("span", { class: "gold-t", style: { fontSize: "12px", fontWeight: 800 } }, "Your move · tap a technique") : h("span", { class: "muted" }, log[log.length - 1] ?? ""),
      h("div", { class: "seg" }, [1, 2, 3].map((x) => h("button", { class: speed === x && "on", onClick: () => { speed = x; app.game.state.combat.speed = x as 1 | 2 | 3; app.game.dirty = true; renderSkills(); } }, `${x}×`))));
  }

  function setManual(m: boolean) {
    battle.manual = m; app.game.state.combat.manual = m; app.game.dirty = true;
    
    renderSkills();
    if (!m) loop();
  }

  function choose(s: Skill) {
    if (!battle.needsInput) return;
    const ok = battle.act({ skill: s.id, target: selectedTarget });
    if (!ok) { app.router.toast("Cannot use that now", "bad"); return; }
    renderSkills();
    loop();
  }

  // ---------- animation ----------
  function float(uid: number, text: string, cls: string) {
    const el = unitEls.get(uid); if (!el) return;
    const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
    const f = h("div", { class: ["bt-float", cls], style: { left: `${r.left - s.left + r.width / 2 + (Math.random() * 30 - 15)}px`, top: `${r.top - s.top + r.height * 0.35}px` } }, text);
    fx.appendChild(f); setTimeout(() => f.remove(), 1100);
    el.classList.remove("hitflash"); void el.offsetWidth; if (cls.includes("dmg")) el.classList.add("hitflash");
  }

  async function animate(events: BattleEvent[]) {
    for (const e of events) {
      switch (e.t) {
        case "turn": renderTop(); break;
        case "action": {
          const el = unitEls.get(e.actor); el?.classList.add("acting"); setTimeout(() => el?.classList.remove("acting"), dur(400));
          if (e.skill !== "basic" && e.skill !== "counter") { log.push(`${name(e.actor)} uses ${e.name}${e.charged ? " (charged!)" : ""}`); showSkillName(e.name, e.charged); }
          await wait(e.skill === "basic" ? 220 : 380); break; }
        case "hit": {
          if (e.dodged) float(e.target, "Miss", "miss");
          else { float(e.target, `${e.crit ? "CRITICAL! " : ""}${fmt.int(e.amount)}${e.absorbed ? ` (${fmt.int(e.absorbed)} 🛡)` : ""}`, e.crit ? "dmg crit" : e.kind === "dot" ? "dmg dot" : "dmg"); if (e.crit && app.settings.screenShake) shake(); }
          renderUnits(); await wait(e.crit ? 260 : 160); break; }
        case "heal": float(e.target, `+${fmt.int(e.amount)}`, "heal"); renderUnits(); await wait(160); break;
        case "shield": float(e.target, `Shield ${fmt.int(e.amount)}`, "shield"); renderUnits(); await wait(160); break;
        case "status": if (e.result === "applied" || e.result === "stacked") { float(e.target, c.get<any>(e.status).name, "status"); } else if (e.result === "resisted") float(e.target, "Resisted", "miss"); renderUnits(); await wait(120); break;
        case "death": { const el = unitEls.get(e.target); el?.classList.add("dying"); log.push(`${name(e.target)} is defeated`); await wait(450); renderUnits(); break; }
        case "phase": phaseBanner = { text: `${name(e.actor)} · ${e.name}`, until: Date.now() + 2200 }; chargeWarn = null; renderUnits(); await wait(700); break;
        case "summon": renderUnits(); log.push(`${name(e.actor)} summons reinforcements`); await wait(500); break;
        case "charge": chargeWarn = { text: `${c.get<any>(e.skill).name} in ${e.turns} turns`, turns: e.turns }; renderUnits(); await wait(400); break;
        case "interrupt": chargeWarn = null; float(e.actor, "Interrupted!", "status"); renderUnits(); await wait(300); break;
        case "skip": float(e.actor, e.reason === "frozen" ? "Frozen" : "Stunned", "miss"); await wait(250); break;
        case "hazard": showSkillName(`${e.name} · wave ${e.wave}/${e.waves}`, true); if (app.settings.screenShake) shake(); await wait(300); break;
        case "ult_ready": renderUnits(); break;
        case "end": break;
        default: break;
      }
    }
    renderSkills();
  }
  const wait = (ms: number) => new Promise((r) => setTimeout(r, dur(ms)));
  function showSkillName(text: string, big?: boolean) { const el = h("div", { class: ["bt-skillname", big && "big"] }, text); fx.appendChild(el); setTimeout(() => el.remove(), dur(900)); }
  function shake() { if (app.settings.reducedMotion) return; stage.classList.remove("shake"); void stage.offsetWidth; stage.classList.add("shake"); }

  // ---------- loop ----------
  let busy = false;
  async function loop() {
    if (busy) return; busy = true;
    try {
      while (playing && !battle.result && !battle.needsInput) {
        battle.step();
        await animate(battle.drain());
        renderUnits(); renderSkills();
      }
      if (battle.result) await finishWave();
    } finally { busy = false; }
  }

  async function finishWave() {
    await wait(500);
    const wr = enc.settleWave(app.now());
    app.game.dirtyImportant = true;
    app.game.run("battle", app.now(), () => ({ ok: true, events: enc.drainEvents() }));
    if (enc.done) showResult(); else showWaveClear(wr);
  }

  function showWaveClear(wr: ReturnType<Encounter["settleWave"]>) {
    app.router.open({ id: "wave", kind: "modal", dismissible: false, render: (close) => h("div", { class: "center" },
      h("div", { class: "cn m-cn" }, "小 胜"), h("div", { class: "m-title" }, `Wave ${enc.wave} cleared`),
      h("div", { class: "m-sub" }, `${enc.waves.length - enc.wave} wave${enc.waves.length - enc.wave > 1 ? "s" : ""} to go · HP ${fmt.int(wr.summary.playerHp)}`),
      dropsBlock(wr.drops, wr.gearUids),
      h("button", { class: "btn gold block", style: { marginTop: "12px" }, onClick: () => { close(); battle = enc.nextWave(); selectedTarget = undefined; chargeWarn = null; renderAll(); loop(); } }, "Continue ▸ Next wave")) });
  }

  function dropsBlock(d: { items: { id: string; qty: number }[]; spirit_stones: number; sect_fame: number }, gearUids: number[]) {
    const s = app.game.state;
    return h("div", null,
      h("div", { class: "row", style: { justifyContent: "center", flexWrap: "wrap", gap: "6px" } },
        d.spirit_stones > 0 && h("span", { class: "tag gold" }, icon("gem", 10), ` +${fmt.int(d.spirit_stones)}`), d.sect_fame > 0 && h("span", { class: "tag" }, icon("fame", 10), ` +${d.sect_fame} Fame`)),
      (d.items.length > 0 || gearUids.length > 0) && h("div", { class: "drop-grid" },
        ...gearUids.map((u) => h("div", null, gearTile(app, u), h("div", { class: "tile-name" }, gearName(app, s.inventory.gear[u]!)))),
        ...d.items.map((it) => { const def = c.get<any>(it.id); return h("div", null, h("div", { class: `tile r-${def.rarity ?? "common"}` }, h("div", { class: "in" }, c.art(it.id, "icon") ? h("div", { class: "art", style: { backgroundImage: app.img(c.art(it.id, "icon")) } }) : icon("sparkle", 20)), h("span", { class: "qty" }, `×${it.qty}`)), h("div", { class: "tile-name" }, def.name)); })));
  }

  function showResult() {
    const r = enc.done!;
    const s = app.game.state;
    const sum = r.waves.reduce((a, w) => ({ dealt: a.dealt + w.summary.dealt, taken: a.taken + w.summary.taken, healed: a.healed + w.summary.healed }), { dealt: 0, taken: 0, healed: 0 });
    const first = r.waves[0]!.summary;
    const lastWave = r.waves[r.waves.length - 1]!;
    const mainEnemy = enc.waves.flat().map((id) => c.find<any>(id)).filter(Boolean).sort((a, b) => b.cp - a.cp)[0];
    const bestGear = r.total.gear.length ? r.total.gear.slice().sort((a, b) => ["common", "uncommon", "rare", "epic", "legendary", "mythic", "immortal", "divine"].indexOf(b.rarity) - ["common", "uncommon", "rare", "epic", "legendary", "mythic", "immortal", "divine"].indexOf(a.rarity))[0] : undefined;
    const again = () => { app.router.close("result"); const src = enc.src; onExit(); const re = EncounterCls.start(s, c, src, app.now()); if (!re.ok) { app.router.toast(re.reason, "bad"); return; } app.router.pushGlobal(battleScreen(app, re.encounter, () => { app.router.popGlobal(); app.router.refresh(); })); };
    app.router.open({ id: "result", kind: "modal", dismissible: false, cls: r.won ? "victory" : "defeat", render: (close) => h("div", { class: "center" },
      h("div", { class: ["result-title", r.won ? "win" : "lose"] }, r.won ? "Victory" : "Defeated"),
      h("div", { class: "cn" }, r.won ? "大 胜" : "败 退"),
      h("div", { class: "m-sub" }, r.won ? `${mainEnemy?.name ?? enc.name} defeated${r.firstClear ? " · First clear" : ""}` : "You were driven back — nothing is lost."),
      r.won
        ? h("div", null,
            h("div", { class: "grid-3 res-stats" }, stat("Damage dealt", fmt.compact(sum.dealt)), stat("Damage taken", fmt.compact(sum.taken)), stat("HP left", `${fmt.int(lastWave.summary.playerHp)} / ${fmt.int(computeStats(s, c).total.hp ?? 0)}`)),
            h("div", { class: "sec-h", style: { marginTop: "10px" } }, h("h3", null, "Rewards"), h("span", { class: "hint" }, `${r.masteryXp ? `Mastery +${r.masteryXp} XP` : ""}`)),
            dropsBlock(r.total, r.waves.flatMap((w) => w.gearUids)),
            r.firstClear && Object.keys(r.firstClear).length > 0 && h("div", null, h("div", { class: "muted up", style: { marginTop: "8px" } }, "First clear"), rewardsLine(app, r.firstClear)),
            bestGear && h("div", { class: "muted", style: { marginTop: "6px" } }, `Best drop: ${RARITY_LABEL[bestGear.rarity]} ${c.get<any>(bestGear.base).name} (iLvl ${bestGear.ilvl})`))
        : h("div", null,
            mainEnemy && h("div", { class: "glass panel", style: { textAlign: "left", marginBottom: "8px" } }, h("div", { class: "row" }, h("span", { class: "ec-ico lg", style: { backgroundImage: app.img(c.art(mainEnemy.id, "icon")) } }), h("div", { class: "grow" }, h("div", { class: "title", style: { fontSize: "14px" } }, mainEnemy.name), h("div", { class: "muted" }, `${c.get<any>(mainEnemy.element).name} · ${c.get<any>(mainEnemy.realm.id).name} ${mainEnemy.realm.stage}`)), h("div", null, h("div", { class: "muted up" }, "Power check"), h("div", { class: r.playerCp >= r.enemyCp ? "jade-t" : "red-t", style: { fontWeight: 900 } }, `${r.playerCp >= r.enemyCp ? "+" : ""}${fmt.int(r.playerCp - r.enemyCp)} CP`)))),
            h("div", { class: "grid-3 res-stats" }, stat("Damage dealt", fmt.compact(sum.dealt)), stat("Rounds", String(first.rounds)), stat("Healing", fmt.compact(sum.healed))),
            h("div", { class: "glass panel", style: { textAlign: "left", marginTop: "8px" } }, h("div", { class: "row" }, icon("shield", 16), h("div", { class: "grow" }, h("b", null, "No penalty"), h("div", { class: "muted" }, "Drops from this run are kept · HP restored partly")))),
            r.recommendations.length > 0 && h("div", { style: { textAlign: "left", marginTop: "8px" } }, h("div", { class: "sec-h" }, h("h3", null, "Ways to get stronger")), h("div", { class: "rows" }, r.recommendations.map((t) => h("div", { class: "setrow" }, icon("sparkle", 14), h("span", { style: { fontSize: "12.5px" } }, t)))))),
      h("div", { class: "grid-2", style: { marginTop: "12px" } },
        h("button", { class: "btn", onClick: () => { close(); onExit(); } }, icon("back", 14), r.won ? "Map" : "Map"),
        h("button", { class: "btn gold", onClick: again }, r.won ? "Fight again" : "Retry"))) });
  }
  const stat = (l: string, v: string) => h("div", null, h("span", null, l), h("b", null, v));

  function renderAll() { renderTop(); renderUnits(); renderSkills(); }
  renderAll();
  // start after mount so float positions resolve
  timer = window.setTimeout(() => loop(), 50);

  return { id: "battle", nav: false, bg: () => enc.bg, render: () => root, onLeave: () => { playing = false; if (timer) clearTimeout(timer); } };
}


/** Start an encounter and open the battle screen; toasts the reason when it cannot start. */
export function startEncounter(app: App, src: Parameters<typeof EncounterCls.start>[2], onDone?: () => void): boolean {
  const r = EncounterCls.start(app.game.state, app.content, src, app.now());
  if (!r.ok) { app.router.toast(r.reason, "bad"); return false; }
  app.game.dirtyImportant = true;
  app.router.pushGlobal(battleScreen(app, r.encounter, () => { app.router.popGlobal(); onDone?.(); app.router.refresh(); }));
  return true;
}
