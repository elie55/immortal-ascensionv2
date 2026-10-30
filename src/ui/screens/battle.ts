/**
 * Battle screen (mockup "battle_screen"). Layout, top to bottom:
 *   title bar (encounter, wave, round, pause) · Manual/Auto and speed · the focused enemy's panel with a full-width
 *   HP bar (damage trail, shield, statuses, boss phases) · the big-attack warning when an elite or boss winds up
 *   stage: enemies in the middle (the focused one large and centred, others smaller to the sides), the party in
 *   front, a turn-order strip on the left, floating numbers and hit effects
 *   dock: party cards (portrait, HP, SP, statuses) · techniques with cooldowns and costs · the Ultimate ring.
 * Units keep their DOM nodes for the whole battle (bars animate, idle loops never restart); the engine's event
 * stream drives the animation. Victory and defeat panels follow the "victory" / "defeat" mockups.
 */
import { h, fmt, replaceChildren, keep } from "../core/dom.ts";
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
import { questProgress } from "../../engine/progression.ts";

const ELEMENT_COLOR: Record<string, string> = { "elem.wood": "#5fe39a", "elem.fire": "#ff7b4a", "elem.earth": "#f0c060", "elem.metal": "#f2f5ff", "elem.water": "#6fd0ff", "elem.none": "#d6c9ff" };
const ROLE_LABEL: Record<string, string> = { dps: "Damage", tank: "Guardian", support: "Support", healer: "Healer" };

/** Positions of enemies on the stage by count: x (%), scale, lift (px), depth. The first slot is the focus. */
const FOE_SLOTS: Record<number, { x: number; s: number; y: number; z: number }[]> = {
  1: [{ x: 50, s: 1, y: 0, z: 5 }],
  2: [{ x: 33, s: 0.86, y: 0, z: 5 }, { x: 70, s: 0.78, y: 14, z: 4 }],
  3: [{ x: 50, s: 0.9, y: 0, z: 5 }, { x: 18, s: 0.66, y: 18, z: 3 }, { x: 82, s: 0.66, y: 18, z: 3 }],
  4: [{ x: 38, s: 0.8, y: 0, z: 5 }, { x: 66, s: 0.72, y: 8, z: 4 }, { x: 13, s: 0.6, y: 22, z: 3 }, { x: 88, s: 0.6, y: 22, z: 3 }],
  5: [{ x: 50, s: 0.8, y: 0, z: 5 }, { x: 25, s: 0.64, y: 14, z: 4 }, { x: 75, s: 0.64, y: 14, z: 4 }, { x: 9, s: 0.52, y: 28, z: 3 }, { x: 91, s: 0.52, y: 28, z: 3 }],
};
/** Party positions: the player in the middle, companions to the sides, the beast in front. */
const ALLY_SLOTS = (n: number, hasBeast: boolean) => {
  const people = n - (hasBeast ? 1 : 0);
  const p = people === 1 ? [{ x: 50, s: 1, z: 3 }] : people === 2 ? [{ x: 38, s: 1, z: 3 }, { x: 72, s: 0.92, z: 2 }] : [{ x: 50, s: 1, z: 3 }, { x: 19, s: 0.9, z: 2 }, { x: 81, s: 0.9, z: 2 }];
  return { people: p, beast: { x: people === 1 ? 78 : people === 2 ? 14 : 66, s: 0.5, z: 4 } };
};

interface HpBar { el: HTMLElement; set(hp: number, max: number, shield: number): void }
/** HP bar with a damage trail: the fill drops at once, a pale trail follows a moment later; heals jump. */
function hpBar(cls: string, text = true): HpBar {
  const trail = h("u"), fill = h("i"), sh = h("b", { class: "sh" }), label = h("span");
  const el = h("div", { class: `bar hp ${cls}` }, trail, fill, sh, text && label);
  let last = -1;
  return {
    el,
    set(hp, max, shield) {
      const pct = Math.max(0, Math.min(100, hp / Math.max(1, max) * 100));
      fill.style.width = `${pct.toFixed(2)}%`;
      if (pct >= last) { trail.style.transition = "none"; trail.style.width = `${pct.toFixed(2)}%`; void trail.offsetWidth; trail.style.transition = ""; }
      else trail.style.width = `${pct.toFixed(2)}%`;
      last = pct;
      sh.style.width = shield > 0 ? `${Math.min(100, shield / Math.max(1, max) * 100).toFixed(2)}%` : "0";
      if (text) label.textContent = `${fmt.int(hp)} / ${fmt.int(max)}${shield > 0 ? `  ·  ${fmt.compact(shield)} shield` : ""}`;
    },
  };
}

export function battleScreen(app: App, enc: Encounter, onExit: () => void): Screen {
  const c = app.content;
  const root = keep(h("div", { class: "battle" }));
  let battle: Battle = enc.battle!;
  let speed = app.game.state.combat.speed || app.settings.battleSpeed || 1;
  let timer: number | undefined;
  let playing = true;
  let selectedTarget: number | undefined;
  let phaseBanner: { text: string; until: number } | null = null;
  let caption = "";

  const name = (uid: number) => battle.units.find((u) => u.uid === uid)?.name ?? "?";
  const unit = (uid: number) => battle.units.find((u) => u.uid === uid);
  const dur = (ms: number) => ms / speed;
  const portrait = (u: Combatant) => u.side === "enemy" ? c.art(u.id, "icon") : u.kind === "beast" ? c.art(u.id, "icon") : c.artAny(u.id, "portrait", "battle");

  // ---------- static layout ----------
  const topbar = h("div", { class: "bt-topbar glass" });
  const modes = h("div", { class: "bt-controls" });
  const foePanel = h("div", { class: "bt-foe glass" });
  const warnSlot = h("div", { class: "bt-warn-slot" });
  const hud = h("div", { class: "bt-hud" }, topbar, modes, foePanel, warnSlot);
  const foes = h("div", { class: "bt-foes" });
  const party = h("div", { class: "bt-party" });
  const order = h("div", { class: "bt-order", "aria-label": "Turn order" });
  const banner = h("div", { class: "bt-banner" });
  const fx = h("div", { class: "bt-fx", "aria-hidden": "true" });
  const stage = h("div", { class: "bt-stage" }, foes, party, order, banner, fx);
  const prompt = h("div", { class: "bt-prompt-slot" });
  const cards = h("div", { class: "bt-cards" });
  const actions = h("div", { class: "bt-actions" });
  const dock = h("div", { class: "bt-dock" }, prompt, cards, actions);
  const danger = h("div", { class: "bt-danger", "aria-hidden": "true" });
  const flash = h("div", { class: "bt-flash", "aria-hidden": "true" });
  root.append(h("div", { class: "bt-bg", style: { backgroundImage: app.img(enc.bg) } }), h("div", { class: "bt-vignette" }), danger, hud, stage, dock, flash);

  // ---------- per-unit views (created once, updated in place) ----------
  interface View { uid: number; sprite: HTMLElement; spriteArt: HTMLElement; mini?: HpBar; card?: HTMLElement; cardBar?: HpBar; spBar?: HTMLElement; status?: HTMLElement; gone?: boolean }
  const views = new Map<number, View>();
  const foeBar = hpBar("big");

  function statusIcons(u: Combatant, big = false) {
    return u.statuses.map((s) => {
      const def = c.get<any>(s.id); const art = c.art(s.id, "icon");
      return h("span", { class: ["bt-st", big && "big", def.kind === "buff" || def.kind === "shield" ? "good" : "bad"], title: `${def.name} · ${s.turns} turn${s.turns === 1 ? "" : "s"}` },
        h("span", { class: "st-art", style: art ? { backgroundImage: app.img(art) } : undefined }, !art && def.name.slice(0, 1)),
        s.stacks > 1 && h("i", { class: "stk" }, `×${s.stacks}`), h("i", { class: "trn" }, String(s.turns)));
    });
  }

  function makeView(u: Combatant): View {
    const art = h("div", { class: "spr", style: { backgroundImage: app.img(u.art) } }, !u.art && h("span", { class: "bt-sprite-ph" }, icon(u.side === "ally" ? "person" : "sword", 40)));
    if (u.side === "enemy") {
      const mini = hpBar("mini", false);
      const sprite = h("div", { class: ["bt-foe-u", u.kind, u.elite && "elite"], dataset: { uid: String(u.uid) }, onClick: () => { if (u.alive) { selectedTarget = u.uid; renderUnits(); } } },
        h("div", { class: "aura" }), art, h("div", { class: "fu-mini" }, h("b", null, u.name), mini.el), h("div", { class: "fu-mark" }), h("div", { class: "fu-warn" }, "!"));
      foes.appendChild(sprite);
      return { uid: u.uid, sprite, spriteArt: art, mini };
    }
    const sprite = h("div", { class: ["bt-ally-u", u.kind], dataset: { uid: String(u.uid) } }, h("div", { class: "aura" }), art, h("div", { class: "fu-warn" }, "!"));
    party.appendChild(sprite);
    const cardBar = hpBar("card");
    const spBar = h("div", { class: "bar sp" }, h("i"));
    const status = h("div", { class: "bc-status" });
    const role = u.kind === "player" ? `${c.get<any>(u.element).name} · You` : u.kind === "beast" ? "Spirit beast" : `${c.get<any>(u.element).name} · ${ROLE_LABEL[c.get<any>(u.id).dao_companion?.role ?? "dps"] ?? "Companion"}`;
    const card = h("div", { class: ["bt-card", u.kind], dataset: { uid: String(u.uid) } },
      h("div", { class: "bc-por", style: { backgroundImage: app.img(portrait(u)) } }),
      h("div", { class: "bc-body" },
        h("div", { class: "bc-top" }, h("b", { class: "bc-name" }, u.name), h("span", { class: "bc-role" }, role)),
        cardBar.el, u.maxSp > 0 && spBar, status));
    cards.appendChild(card);
    return { uid: u.uid, sprite, spriteArt: art, card, cardBar, spBar, status };
  }

  /** Focused enemy for the top panel: the chosen target, else the boss, else the first one standing. */
  function focusFoe(): Combatant | undefined {
    const alive = battle.units.filter((u) => u.side === "enemy" && u.alive);
    return alive.find((u) => u.uid === selectedTarget) ?? alive.find((u) => u.kind === "boss") ?? alive[0];
  }

  function renderUnits() {
    // views for new units (summons, next wave) and removal of gone ones
    for (const u of battle.units) if (!views.has(u.uid)) views.set(u.uid, makeView(u));
    for (const [uid, v] of views) if (!battle.units.some((u) => u.uid === uid)) { v.sprite.remove(); v.card?.remove(); views.delete(uid); }
    const focus = focusFoe();
    const threats = new Set(battle.units.filter((u) => u.side === "enemy" && u.alive && u.telegraph).flatMap((u) => u.telegraph!.targets));
    const charging = battle.units.find((u) => u.side === "enemy" && u.alive && u.boss?.charging && u.boss.charging.turnsLeft <= 1);
    if (charging) for (const a of battle.units) if (a.side === "ally" && a.alive) threats.add(a.uid);

    // enemies: the focus in the first slot
    const standing = battle.units.filter((u) => u.side === "enemy" && (u.alive || !views.get(u.uid)?.gone));
    const ordered = [...standing].sort((a, b) => (b === focus ? 1 : 0) - (a === focus ? 1 : 0) || a.uid - b.uid);
    const slots = FOE_SLOTS[Math.min(5, Math.max(1, ordered.length))]!;
    ordered.forEach((u, i) => {
      const v = views.get(u.uid)!; const sl = slots[Math.min(i, slots.length - 1)]!;
      v.sprite.style.setProperty("--x", `${sl.x}%`); v.sprite.style.setProperty("--s", String(sl.s)); v.sprite.style.setProperty("--y", `${sl.y}px`); v.sprite.style.zIndex = String(sl.z);
      v.sprite.classList.toggle("focus", u === focus && ordered.length > 1);
      v.sprite.classList.toggle("multi", ordered.length > 1);
      v.sprite.classList.toggle("winding", !!u.telegraph || (!!u.boss?.charging && u.boss.charging.turnsLeft <= 1));
      v.sprite.classList.toggle("dead", !u.alive);
      v.mini!.set(u.hp, u.maxHp, u.shield);
    });

    // party
    const allies = battle.units.filter((u) => u.side === "ally");
    const beast = allies.find((u) => u.kind === "beast");
    const sl = ALLY_SLOTS(allies.length, !!beast);
    const people = allies.filter((u) => u.kind !== "beast").sort((a, b) => (a.kind === "player" ? -1 : b.kind === "player" ? 1 : a.uid - b.uid));
    people.forEach((u, i) => { const v = views.get(u.uid)!; const p = sl.people[Math.min(i, sl.people.length - 1)]!; v.sprite.style.setProperty("--x", `${p.x}%`); v.sprite.style.setProperty("--s", String(p.s)); v.sprite.style.zIndex = String(p.z); });
    if (beast) { const v = views.get(beast.uid)!; v.sprite.style.setProperty("--x", `${sl.beast.x}%`); v.sprite.style.setProperty("--s", String(sl.beast.s)); v.sprite.style.zIndex = String(sl.beast.z); }
    cards.className = `bt-cards n${Math.min(4, allies.length)}`;
    for (const u of [...people, ...(beast ? [beast] : [])]) cards.appendChild(views.get(u.uid)!.card!); // keep card order
    for (const u of allies) {
      const v = views.get(u.uid)!;
      v.cardBar!.set(u.hp, u.maxHp, u.shield);
      (v.spBar!.firstChild as HTMLElement).style.width = `${(u.sp / Math.max(1, u.maxSp) * 100).toFixed(1)}%`;
      replaceChildren(v.status!, statusIcons(u));
      const t = threats.has(u.uid) && u.alive;
      v.card!.classList.toggle("threat", t); v.sprite.classList.toggle("threat", t);
      v.card!.classList.toggle("dead", !u.alive); v.sprite.classList.toggle("dead", !u.alive);
    }
    danger.classList.toggle("on", threats.has(battle.player.uid));

    renderFoePanel(focus);
    renderWarn();
    renderOrder();
    replaceChildren(banner, phaseBanner && Date.now() < phaseBanner.until ? h("div", { class: "bt-phase" }, phaseBanner.text) : null);
  }

  function renderFoePanel(f: Combatant | undefined) {
    const enemies = battle.units.filter((u) => u.side === "enemy" && u.alive);
    if (!f) { foePanel.classList.add("cleared"); replaceChildren(foePanel, h("div", { class: "ff-name" }, "Wave cleared")); return; }
    foePanel.classList.remove("cleared");
    foeBar.set(f.hp, f.maxHp, f.shield);
    const b = f.boss;
    const el = c.find<any>(f.element);
    replaceChildren(foePanel,
      h("div", { class: "ff-row" },
        h("span", { class: "ff-por", style: { backgroundImage: app.img(c.art(f.id, "icon")) } }),
        h("div", { class: "ff-name" }, f.name),
        f.kind === "boss" ? h("span", { class: "tag ff-rank boss" }, "Boss") : f.elite ? h("span", { class: "tag ff-rank elite" }, "Elite") : null),
      foeBar.el,
      h("div", { class: "ff-row2" },
        h("div", { class: "ff-status" }, h("span", { class: "ff-el", style: { "--el": ELEMENT_COLOR[f.element] } }, el?.name ?? ""), statusIcons(f, true)),
        b ? h("div", { class: "ff-pips", title: b.phases[b.phase]!.name }, h("span", null, b.phases[b.phase]!.name), b.phases.map((_, i) => h("i", { class: i < b.phase ? "done" : i === b.phase ? "cur" : "" })))
          : enemies.length > 1 ? h("div", { class: "ff-count" }, `${enemies.length} foes · tap one to target`) : h("div", { class: "ff-count" }, `Wave ${enc.wave + 1} / ${enc.waves.length}`)));
  }

  /** The big-attack warning: the most dangerous announced attack (an elite/boss wind-up or a boss charge). */
  function renderWarn() {
    const p = battle.player;
    type W = { who: Combatant; skill: string; when: string; pct: number; targets: string; charge: boolean };
    const list: W[] = [];
    for (const u of battle.units) {
      if (u.side !== "enemy" || !u.alive) continue;
      if (u.telegraph) {
        const tg = u.telegraph; const t = tg.targets.map((id) => unit(id)).filter((x): x is Combatant => !!x && x.alive);
        const who = t.length > 1 ? "your party" : t[0]?.kind === "player" ? "you" : t[0]?.name ?? "you";
        list.push({ who: u, skill: tg.name, when: "next turn", pct: tg.pct, targets: who, charge: false });
      }
      if (u.boss?.charging) {
        const sk = u.skills.find((s) => s.id === u.boss!.charging!.tech);
        const pct = sk ? Math.round(battle.estimate(u, p, sk, c.combat.damage.charged_attack_mult) / Math.max(1, p.maxHp) * 100) : 0;
        const left = Math.max(1, u.boss.charging.turnsLeft);
        list.push({ who: u, skill: sk?.name ?? c.get<any>(u.boss.charging.tech).name, when: left <= 1 ? "next turn" : `in ${left} turns`, pct, targets: "your party", charge: left > 1 });
      }
    }
    if (!list.length) { replaceChildren(warnSlot); return; }
    const w = list.sort((a, b) => (a.when === "next turn" ? 0 : 1) - (b.when === "next turn" ? 0 : 1) || b.pct - a.pct)[0]!;
    const counter = battle.units.some((u) => u.side === "ally" && u.alive && u.skills.some((s) => s.applies.some((a) => ["status.stun", "status.freeze", "status.silence"].includes(a.status))));
    replaceChildren(warnSlot, h("div", { class: ["bt-warn", w.charge && "charge"], role: "alert" },
      h("span", { class: "bw-ico" }, icon("warning", 18)),
      h("div", { class: "grow" },
        h("div", { class: "bw-t" }, h("b", null, w.skill), h("span", { class: "bw-when" }, w.when)),
        h("div", { class: "bw-sub" }, `${w.who.name} · ≈${w.pct}% of ${w.targets === "you" ? "your" : w.targets === "your party" ? "each target's" : `${w.targets}'s`} HP · ${counter ? "shield, heal or stun to stop it" : "shield up or heal"}`))));
  }

  function renderOrder() {
    const ids = [...(battle.pending ? [battle.pending.uid] : []), ...battle.previewOrder(battle.pending ? 4 : 5)];
    replaceChildren(order, h("span", { class: "bo-l" }, "Next"), ids.map((id, i) => {
      const u = unit(id); if (!u) return null;
      return h("span", { class: ["bo-u", u.side, u.kind, i === 0 && "now", u.telegraph && "warn"], title: u.name, style: { backgroundImage: app.img(portrait(u)) } }, u.telegraph && h("i", null, "!"));
    }));
  }

  function renderTop() {
    replaceChildren(topbar,
      h("div", { class: "grow" },
        h("div", { class: "bt-title" }, enc.name),
        h("div", { class: "bt-sub" }, `Wave ${enc.wave + 1}/${enc.waves.length} · Round ${battle.round}${battle.opts.surviveRounds ? ` / ${battle.opts.surviveRounds}` : ""}${caption ? ` · ${caption}` : ""}`)),
      h("button", { class: "icon-btn bt-pause", "aria-label": playing ? "Pause" : "Resume", onClick: () => { playing = !playing; renderTop(); root.classList.toggle("paused", !playing); if (playing) loop(); } }, icon(playing ? "pause" : "play", 16)));
  }

  function renderModes() {
    const manual = battle.manual;
    replaceChildren(modes,
      h("div", { class: "seg" }, h("button", { class: manual && "on", onClick: () => setManual(true) }, "Manual"), h("button", { class: !manual && "on", onClick: () => setManual(false) }, icon("auto", 12), " Auto")),
      h("div", { class: "seg" }, [1, 2, 3].map((x) => h("button", { class: speed === x && "on", "aria-label": `Speed ${x}×`, onClick: () => { speed = x; app.game.state.combat.speed = x as 1 | 2 | 3; app.game.dirty = true; renderModes(); } }, `${x}×`))));
  }

  function renderSkills() {
    const p = battle.player;
    const manual = battle.manual;
    const waiting = battle.needsInput;
    const skills = p.skills.filter((s) => s.kind !== "basic");
    const ult = skills.find((s) => s.kind === "ultimate");
    const tile = (s: Skill, cls = "") => {
      const cd = p.cooldowns[s.id] ?? 0;
      const usable = battle.canUse(p, s);
      const art = s.id === "basic" ? undefined : c.art(s.id, "icon");
      const lacksSp = cd === 0 && s.kind !== "basic" && s.kind !== "ultimate" && p.sp < s.spCost;
      return h("button", { class: ["bt-skill", cls, usable && waiting && manual && "ready", !usable && "off", cd > 0 && "cooling", lacksSp && "nosp"], style: { "--el": ELEMENT_COLOR[s.element] }, disabled: !(manual && waiting && usable), onClick: () => choose(s),
        title: `${s.name}${s.spCost ? ` · ${s.spCost} SP` : ""}${s.cooldown ? ` · cooldown ${s.cooldown}` : ""}` },
        h("span", { class: "sk-name" }, s.name),
        h("span", { class: "sk-art", style: art ? { backgroundImage: app.img(art) } : undefined }, !art && icon("sword", 22)),
        cd > 0 && h("span", { class: "sk-cd" }, String(cd)),
        s.kind === "basic" ? h("span", { class: "sk-cost free" }, "+SE") : s.spCost > 0 && h("span", { class: "sk-cost" }, `${s.spCost} SE`));
    };
    const actives = skills.filter((s) => s.kind !== "ultimate");
    const empty = Math.max(0, 4 - actives.length);
    const ultBtn = ult ? (() => {
      const usable = battle.canUse(p, ult); const pct = Math.min(100, p.ult);
      const art = c.art(ult.id, "icon");
      return h("button", { class: ["bt-ultbtn", pct >= 100 && "charged", usable && waiting && manual && "ready"], style: { "--ult": `${pct}%` }, disabled: !(manual && waiting && usable), onClick: () => choose(ult), title: ult.name, "aria-label": `Ultimate: ${ult.name}` },
        h("span", { class: "ub-ring" }), h("span", { class: "ub-art", style: art ? { backgroundImage: app.img(art) } : undefined }, !art && icon("sparkle", 26)),
        h("span", { class: "ub-tag" }, "Ultimate"), h("span", { class: "ub-pct" }, pct >= 100 ? "READY" : `${Math.floor(pct)}%`));
    })() : h("div", { class: "bt-ultbtn empty", title: "No ultimate equipped" }, h("span", { class: "ub-ring" }), h("span", { class: "ub-art" }, icon("lock", 20)), h("span", { class: "ub-tag" }, "Ultimate"));
    replaceChildren(actions,
      h("div", { class: "bt-skillrow" }, tile(p.skills[0]!, "basic"), ...actives.map((s) => tile(s)), ...Array.from({ length: empty }, () => h("div", { class: "bt-skill empty", title: "Empty technique slot" }, h("span", { class: "sk-name" }, "Empty"), h("span", { class: "sk-art" }, icon("lock", 14))))),
      h("div", { class: "bt-ult" }, ult && h("span", { class: "sk-name ult-name" }, ult.name), ultBtn));
    const several = battle.units.filter((u) => u.side === "enemy" && u.alive).length > 1;
    replaceChildren(prompt, waiting && manual ? h("div", { class: "bt-prompt" }, icon("sword", 14), " Your move", h("span", null, several ? " · tap a foe, then a technique" : " · tap a technique")) : null);
  }

  function setManual(m: boolean) {
    battle.manual = m; app.game.state.combat.manual = m; app.game.dirty = true;
    renderModes(); renderSkills();
    if (!m) loop();
  }

  function choose(s: Skill) {
    if (!battle.needsInput) return;
    const ok = battle.act({ skill: s.id, target: selectedTarget });
    if (!ok) { app.router.toast("Cannot use that now", "bad"); return; }
    renderSkills();
    loop();
  }

  // ---------- effects ----------
  function centerOf(uid: number): { x: number; y: number } | null {
    const v = views.get(uid); if (!v) return null;
    const r = v.spriteArt.getBoundingClientRect(), s = stage.getBoundingClientRect();
    return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height * (unit(uid)?.side === "enemy" ? 0.45 : 0.4) };
  }
  function float(uid: number, text: string, cls: string, pre?: string) {
    const p = centerOf(uid); if (!p) return;
    const f = h("div", { class: ["bt-float", cls], style: { left: `${p.x + (Math.random() * 36 - 18)}px`, top: `${p.y - 10}px` } }, pre && h("small", null, pre), text);
    fx.appendChild(f); setTimeout(() => f.remove(), dur(1300) + 200);
  }
  function slash(uid: number, element: string, big = false) {
    const p = centerOf(uid); if (!p) return;
    const el = h("div", { class: ["bt-slash", big && "big"], style: { left: `${p.x}px`, top: `${p.y}px`, "--el": ELEMENT_COLOR[element] ?? "#fff", "--rot": `${-35 + Math.random() * 70}deg` } }, h("i"), h("b"));
    fx.appendChild(el); setTimeout(() => el.remove(), 520);
  }
  function hitFlash(uid: number) { const v = views.get(uid); if (!v) return; v.spriteArt.classList.remove("hit"); void v.spriteArt.offsetWidth; v.spriteArt.classList.add("hit"); }
  function screenFlash(kind: "red" | "gold" | "white") { flash.className = "bt-flash"; void flash.offsetWidth; flash.className = `bt-flash ${kind}`; }
  function shake(big = false) {
    if (app.settings.reducedMotion || !app.settings.screenShake) return;
    stage.classList.remove("shake", "shake-big"); void stage.offsetWidth; stage.classList.add(big ? "shake-big" : "shake");
    if (big) try { navigator.vibrate?.(35); } catch { /* not supported */ }
  }
  function showSkillName(text: string, kind: "" | "foe" | "heavy" | "ult" = "") { fx.querySelectorAll(".bt-skillname").forEach((x) => x.remove()); const el = h("div", { class: ["bt-skillname", kind] }, text); fx.appendChild(el); setTimeout(() => el.remove(), dur(1000) + 100); }

  async function animate(events: BattleEvent[]) {
    for (const e of events) {
      switch (e.t) {
        case "turn": renderTop(); renderOrder(); break;
        case "action": {
          const a = unit(e.actor); const v = views.get(e.actor);
          v?.sprite.classList.add("acting"); setTimeout(() => v?.sprite.classList.remove("acting"), dur(420));
          if (e.heavy || e.charged) { showSkillName(e.name, "heavy"); screenFlash("red"); await wait(520); }
          else if (a?.side === "ally" && a.kind === "player" && a.skills.find((s) => s.id === e.skill)?.kind === "ultimate") { showSkillName(e.name, "ult"); screenFlash("gold"); await wait(560); }
          else if (e.skill !== "basic" && e.skill !== "counter") { showSkillName(e.name, a?.side === "enemy" ? "foe" : ""); await wait(360); }
          else await wait(200);
          if (e.skill !== "basic" && e.skill !== "counter") { caption = `${name(e.actor)}: ${e.name}`; renderTop(); }
          break;
        }
        case "hit": {
          if (e.dodged) float(e.target, "Miss", "miss");
          else {
            const big = e.amount >= (unit(e.target)?.maxHp ?? 1) * 0.25;
            float(e.target, fmt.int(e.amount), e.crit ? "dmg crit" : e.kind === "dot" ? "dmg dot" : unit(e.target)?.side === "ally" ? "dmg taken" : "dmg", e.crit ? "CRITICAL!" : undefined);
            if (e.absorbed) float(e.target, `${fmt.int(e.absorbed)} blocked`, "shield");
            if (e.kind !== "dot") { slash(e.target, e.element, e.crit || big); hitFlash(e.target); }
            if (e.crit || big) shake(big && unit(e.target)?.side === "ally");
          }
          renderUnits(); await wait(e.crit ? 280 : 170); break;
        }
        case "heal": float(e.target, `+${fmt.int(e.amount)}`, "heal"); renderUnits(); await wait(160); break;
        case "shield": float(e.target, `Shield ${fmt.int(e.amount)}`, "shield"); renderUnits(); await wait(160); break;
        case "status": if (e.result === "applied" || e.result === "stacked") float(e.target, c.get<any>(e.status).name, "status"); else if (e.result === "resisted") float(e.target, "Resisted", "miss"); else if (e.result === "immune" && c.get<any>(e.status).kind === "control") float(e.target, "Immune", "miss"); renderUnits(); await wait(110); break;
        case "death": {
          const v = views.get(e.target);
          v?.sprite.classList.add("dying"); v?.card?.classList.add("dead");
          caption = `${name(e.target)} is defeated`; renderTop();
          await wait(500);
          if (v && unit(e.target)?.side === "enemy") v.gone = true;
          if (selectedTarget === e.target) selectedTarget = undefined;
          renderUnits(); break;
        }
        case "phase": phaseBanner = { text: `${name(e.actor)} · ${e.name}`, until: Date.now() + 2200 }; screenFlash("white"); renderUnits(); await wait(800); break;
        case "summon": renderUnits(); caption = `${name(e.actor)} calls reinforcements`; renderTop(); await wait(500); break;
        case "charge": renderUnits(); float(e.actor, "Gathering power", "warnf"); await wait(500); break;
        case "telegraph": renderUnits(); float(e.actor, "!", "warnf big"); await wait(520); break;
        case "interrupt": float(e.actor, "Interrupted!", "interrupt"); renderUnits(); await wait(380); break;
        case "skip": float(e.actor, e.reason === "frozen" ? "Frozen" : "Stunned", "miss"); await wait(250); break;
        case "hazard": showSkillName(`${e.name} · wave ${e.wave}/${e.waves}`, "heavy"); screenFlash("white"); shake(true); await wait(320); break;
        case "ult_ready": renderUnits(); break;
        default: break;
      }
    }
    renderSkills();
  }
  const wait = (ms: number) => new Promise((r) => setTimeout(r, dur(ms)));

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
      if (battle.needsInput) { renderOrder(); renderSkills(); }
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
    app.router.open({ id: "wave", kind: "modal", dismissible: false, cls: "wave-clear", render: (close) => h("div", { class: "center" },
      h("div", { class: "cn m-cn" }, "小 胜"), h("div", { class: "m-title" }, `Wave ${enc.wave} cleared`),
      h("div", { class: "m-sub" }, `${enc.waves.length - enc.wave} wave${enc.waves.length - enc.wave > 1 ? "s" : ""} to go · HP ${fmt.int(wr.summary.playerHp)}`),
      dropsBlock(wr.drops, wr.gearUids),
      h("button", { class: "btn gold block", style: { marginTop: "12px" }, onClick: () => { close(); battle = enc.nextWave(); selectedTarget = undefined; for (const v of views.values()) { v.sprite.remove(); v.card?.remove(); } views.clear(); renderAll(); loop(); } }, "Continue ▸ Next wave")) });
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
    const tracked = trackedLine();
    if (r.won) { root.classList.add("won"); return app.router.open({ id: "result", kind: "modal", dismissible: false, cls: "victory", render: (close) => h("div", { class: "center" },
      h("div", { class: "res-head" },
        h("div", { class: "res-rays", "aria-hidden": "true" }),
        h("div", { class: "result-title win" }, "Victory"),
        h("div", { class: "cn res-cn" }, "大 胜"),
        h("div", { class: "res-ribbon" }, mainEnemy && h("span", { class: "res-foe", style: { backgroundImage: app.img(c.art(mainEnemy.id, "icon")) } }, h("i", null, "Defeated")), h("span", null, `${mainEnemy?.name ?? enc.name} defeated`), r.firstClear && h("span", { class: "tag gold" }, "First clear"))),
      h("div", { class: "res-panel glass" },
        h("div", { class: "grid-3 res-stats" }, stat("Damage dealt", fmt.compact(sum.dealt)), stat("Damage taken", fmt.compact(sum.taken)), stat("HP left", `${fmt.int(lastWave.summary.playerHp)} / ${fmt.int(computeStats(s, c).total.hp ?? 0)}`)),
        h("div", { class: "sec-h", style: { marginTop: "12px" } }, h("h3", null, "Rewards"), h("span", { class: "hint" }, `${r.masteryXp ? `Mastery +${r.masteryXp} XP` : ""}`)),
        dropsBlock(r.total, r.waves.flatMap((w) => w.gearUids)),
        r.firstClear && Object.keys(r.firstClear).length > 0 && h("div", { class: "res-first" }, h("span", { class: "muted up" }, "First clear"), rewardsLine(app, r.firstClear)),
        bestGear && h("div", { class: "res-best" }, icon("sparkle", 14), h("span", null, "Best drop: ", h("b", { class: `rt-${bestGear.rarity}` }, `${RARITY_LABEL[bestGear.rarity]} ${c.get<any>(bestGear.base).name}`), ` · iLvl ${bestGear.ilvl}`)),
        tracked,
        h("div", { class: "grid-2", style: { marginTop: "12px" } },
          h("button", { class: "btn", onClick: () => { close(); onExit(); } }, icon("back", 14), "Map"),
          h("button", { class: "btn gold", onClick: again }, "Fight again")))) }); }
    app.router.open({ id: "result", kind: "modal", dismissible: false, cls: "defeat", render: (close) => h("div", { class: "center" },
      h("div", { class: "result-title lose" }, "Defeated"),
      h("div", { class: "cn res-cn" }, "败 退"),
      h("div", { class: "m-sub" }, "You were driven back — nothing is lost."),
      h("div", null,
            mainEnemy && h("div", { class: "glass panel", style: { textAlign: "left", marginBottom: "8px" } }, h("div", { class: "row" }, h("span", { class: "ec-ico lg", style: { backgroundImage: app.img(c.art(mainEnemy.id, "icon")) } }), h("div", { class: "grow" }, h("div", { class: "title", style: { fontSize: "calc(14rem / 15)" } }, mainEnemy.name), h("div", { class: "muted" }, `${c.get<any>(mainEnemy.element).name} · ${c.get<any>(mainEnemy.realm.id).name} ${mainEnemy.realm.stage}`)), h("div", null, h("div", { class: "muted up" }, "Power check"), h("div", { class: r.playerCp >= r.enemyCp ? "jade-t" : "red-t", style: { fontWeight: 900 } }, `${r.playerCp >= r.enemyCp ? "+" : ""}${fmt.int(r.playerCp - r.enemyCp)} CP`)))),
            h("div", { class: "grid-3 res-stats" }, stat("Damage dealt", fmt.compact(sum.dealt)), stat("Rounds", String(first.rounds)), stat("Healing", fmt.compact(sum.healed))),
            h("div", { class: "glass panel", style: { textAlign: "left", marginTop: "8px" } }, h("div", { class: "row" }, icon("shield", 16), h("div", { class: "grow" }, h("b", null, "No penalty"), h("div", { class: "muted" }, "Drops from this run are kept · HP restored partly")))),
            r.recommendations.length > 0 && h("div", { style: { textAlign: "left", marginTop: "8px" } }, h("div", { class: "sec-h" }, h("h3", null, "Ways to get stronger")), h("div", { class: "rows" }, r.recommendations.map((t) => h("div", { class: "setrow" }, icon("sparkle", 14), h("span", { style: { fontSize: "calc(12.5rem / 15)" } }, t)))))),
      tracked,
      h("div", { class: "grid-2", style: { marginTop: "14px" } },
        h("button", { class: "btn", onClick: () => { close(); onExit(); } }, icon("back", 14), "Map"),
        h("button", { class: "btn gold", onClick: again }, "Retry"))) });
  }
  /** The tracked quest's progress, so a fight that advanced it says so on the result screen. */
  function trackedLine() {
    const s = app.game.state; const id = s.progress.quests.tracked;
    if (!id || !c.has(id) || !s.progress.quests.active[id]) return null;
    const q = c.get<any>(id); const prog = questProgress(s, c, q);
    const i = prog.findIndex((p) => !p.done); const cur = i >= 0 ? prog[i]! : null;
    return h("div", { class: "res-track" }, icon("map", 13), h("span", { class: "grow" }, h("b", null, q.name), cur ? ` · ${cur.label} ${cur.have}/${cur.need}` : " · ready to turn in"),
      cur && h("div", { class: "bar gold thin" }, h("i", { style: { width: `${Math.min(100, cur.have / Math.max(1, cur.need) * 100)}%` } })));
  }
  const stat = (l: string, v: string) => h("div", null, h("span", null, l), h("b", null, v));

  function renderAll() { renderTop(); renderModes(); renderUnits(); renderSkills(); }
  renderAll();
  // start after mount so effect positions resolve
  timer = window.setTimeout(() => loop(), 350);

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
