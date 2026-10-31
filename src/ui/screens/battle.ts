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
import { h, fmt, replaceChildren, keep, type Child } from "../core/dom.ts";
import { icon } from "../core/icons.ts";
import { AnimStage } from "../anim/stage.ts";
import { layout, strikeBox, focusOf, type Box } from "../battle/field.ts";
import { beats as toBeats, plan as planShot, cameraFor, type ActionBeat, type Vfx } from "../battle/choreo.ts";
import { play as playVfx, dashTrail, dust, embers, gather, castArray, bolt, type VfxCtx, type Sprite } from "../battle/vfx.ts";
import type { RigDef } from "../anim/rig.ts";
import { RARITY_LABEL } from "../core/kit.ts";
import type { Screen } from "../core/router.ts";
import type { App } from "../../app.ts";
import { Encounter as EncounterCls, type Encounter } from "../../engine/encounter.ts";
import type { Battle } from "../../engine/combat/battle.ts";
import type { Combatant, BattleEvent, Skill } from "../../engine/combat/types.ts";
import { gearTile, gearName, gearCp, gearChips, comparedTo } from "./items.ts";
import { equip } from "../../engine/actions.ts";
import { equippedSlotOf } from "../../engine/inventory.ts";
import { rewardsLine, regionScreen } from "./adventure.ts";
import { nodeState } from "../../engine/nodes.ts";
import { questProgress } from "../../engine/progression.ts";
import { affinityLevel } from "../../engine/unlock.ts";
import { openLocation } from "./sect.ts";
import { autoBattleScreen } from "./techniques.ts";
import type { EncounterResult as EncounterResultT } from "../../engine/encounter.ts";

/** What sparring partners say after a bout (mockup spar_result). */
const SPAR_WIN: Record<string, string> = {
  default: "Well struck. Again tomorrow — I will not be so gentle.",
  "npc.bai_lingshuang": "Your stance held. Good. Tomorrow we work on your footwork.",
  "npc.tang_xiaoman": "Ow, ow! Fine, you win, boss. Snacks are on me… at a small discount.",
  "npc.zhao_lie": "Ha! My fist didn't even warm up. Again!",
  "npc.shen_qingxue": "Clean. You read the spear before it moved.",
  "npc.tie_shanhe": "Amitabha. Even iron bends to a steady hand.",
  "npc.mo_lianjue": "…Noted. Do not expect that to happen twice.",
  "npc.lu_feiyan": "You dance better than you dress. A compliment, mostly.",
  "npc.han_jinghong": "Tch. Keep that edge; the Blood Saber remembers.",
  "npc.su_wanqing": "No poison this time. Next time, no promises~",
  "npc.gu_xuanming": "Your sword has a heart in it now. Keep it there.",
};
const SPAR_LOSE: Record<string, string> = {
  default: "Rest, then come back. Losing teaches faster than winning.",
  "npc.bai_lingshuang": "Breathe when I say. Your guard dropped on the third exchange.",
  "npc.tang_xiaoman": "Hehe, the abacus wins again! Buy a pill, you'll feel better.",
  "npc.zhao_lie": "Too slow! Eat more, train more, come back.",
  "npc.shen_qingxue": "The spear is patient. So should you be.",
  "npc.tie_shanhe": "Fall seven times. Stand eight.",
  "npc.mo_lianjue": "As expected. Come back when it is not.",
};

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
/** Party sprite scale by party size (each character stands above its own card, see .bt-ally-u in theme.css). */
const ALLY_SCALE = (n: number, beast: boolean) => beast ? (n <= 2 ? 0.62 : 0.56) : n === 1 ? 1 : n === 2 ? 0.96 : 0.9;

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
      if (text) label.textContent = cls === "big" ? `${fmt.int(hp)} / ${fmt.int(max)}${shield > 0 ? `  ·  ${fmt.compact(shield)} shield` : ""}` : `${fmt.compact(hp)} / ${fmt.compact(max)}${shield > 0 ? ` +${fmt.compact(shield)}` : ""}`;
    },
  };
}

export function battleScreen(app: App, enc: Encounter, onExit: () => void): Screen {
  const c = app.content;
  // the arena stage (docs/BATTLE_STAGE.md): Settings → Battle stage, and always for the arena test fight
  const arena = app.settings.battleStage === "arena" || enc.src.kind === "showcase";
  const root = keep(h("div", { class: ["battle", enc.src.kind === "tribulation" && "trib", arena && "arena"] }));
  let battle: Battle = enc.battle!;
  let speed = app.game.state.combat.speed || app.settings.battleSpeed || 1;
  let timer: number | undefined;
  let playing = true;
  let selectedTarget: number | undefined;
  let phaseBanner: { text: string; until: number } | null = null;
  let caption = "";

  const name = (uid: number) => battle.units.find((u) => u.uid === uid)?.name ?? "?";
  const unit = (uid: number) => battle.units.find((u) => u.uid === uid);
  /** Slow motion (a finishing blow): the screen's clock runs at this rate, the figures' clock too (AnimStage.timeScale). */
  let timeK = 1;
  const dur = (ms: number) => ms / speed / timeK;
  const portrait = (u: Combatant) => u.side === "enemy" ? c.art(u.id, "icon") : u.kind === "beast" ? c.art(u.id, "icon") : c.artAny(u.id, "portrait", "battle");

  // ---------- static layout ----------
  const topbar = h("div", { class: "bt-topbar glass" });
  const modes = h("div", { class: "bt-controls" });
  const foePanel = h("div", { class: "bt-foe glass" });
  const warnSlot = h("div", { class: "bt-warn-slot" });
  // one top line (UI review S7): place and wave, then Manual/Auto, speed and pause on the same bar
  const hud = h("div", { class: "bt-hud" }, topbar, foePanel, warnSlot);
  const foes = h("div", { class: "bt-foes" });
  const party = h("div", { class: "bt-party" });
  const order = h("div", { class: "bt-order", "aria-label": "Turn order" });
  const banner = h("div", { class: "bt-banner" });
  const fx = h("div", { class: "bt-fx", "aria-hidden": "true" });
  // the camera moves this layer (arena push/zoom); the turn strip and banners stay put, the stage itself shakes
  const cam = h("div", { class: "bt-cam" }, foes, party, fx);
  const stage = h("div", { class: "bt-stage" }, cam, order, banner);
  // rigged figures are painted on a canvas over the stage (docs/ANIMATION.md); the .spr boxes keep layout and taps
  const puppets = new AnimStage(cam, { quality: app.settings.animationQuality, reducedMotion: app.settings.reducedMotion, img: (f) => `./${f}`, shadows: arena });
  // the canvas draws every figure with its own contact shadow: the DOM ground marks would show while textures load
  if (arena && puppets.ok) root.classList.add("gl");
  const prompt = h("div", { class: "bt-prompt-slot" });
  const cards = h("div", { class: "bt-cards" });
  const actions = h("div", { class: "bt-actions" });
  const dock = h("div", { class: "bt-dock" }, prompt, cards, actions);
  const danger = h("div", { class: "bt-danger", "aria-hidden": "true" });
  const flash = h("div", { class: "bt-flash", "aria-hidden": "true" });
  const intro = h("div", { class: "bt-intro", "aria-hidden": "true" });
  const combo = h("div", { class: "bt-combo", "aria-hidden": "true" });
  const closeup = h("div", { class: "bt-closeup", "aria-hidden": "true" });
  const mainFoe = enc.waves.flat().map((id) => c.find<any>(id)).filter(Boolean).sort((a, b) => b.cp - a.cp)[0];
  const tone = ELEMENT_COLOR[mainFoe?.element ?? "elem.none"] ?? "#c9cfe3";
  root.style.setProperty("--tone", tone);
  root.append(
    h("div", { class: "bt-bg", style: { backgroundImage: app.img(enc.bg) } }),
    h("div", { class: "bt-light", "aria-hidden": "true" }),
    h("div", { class: "bt-fog", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
    h("div", { class: "bt-motes", "aria-hidden": "true" }, Array.from({ length: 18 }, (_, i) => h("i", { style: { "--i": String(i), left: `${(i * 37 + 11) % 100}%`, "--d": `${7 + (i * 1.7) % 6}s`, "--s": `${3 + (i * 5) % 5}px`, "--dl": `${-(i * 1.3) % 9}s` } }))),
    h("div", { class: "bt-vignette" }), danger, hud, stage, dock, intro, combo, closeup, flash);

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

  /** Puppet for a unit whose art has a rig: loaded once per rig, attached when the textures are ready. */
  function attachRig(u: Combatant, art: HTMLElement, sprite: HTMLElement, z: number) {
    if (!puppets.ok || !u.art) return;
    const block = c.animFor(u.art);
    const toward: [number, number] | undefined = arena ? (u.side === "ally" ? [0.78, -0.62] : [-0.78, 0.62]) : undefined;
    // the arena turns everyone toward their foes: the party looks right, the enemies left (mirrored when drawn the other way)
    const face: 1 | -1 | undefined = arena ? (u.side === "ally" ? 1 : -1) : undefined;
    const looks = ({ left: -1, right: 1, front: 0 } as const)[c.facingOf(u.art)];
    if (!block) {
      // the arena paints every figure on the canvas (one depth order, shared clips); rigless ones as still puppets
      if (arena) puppets.addStill(u.uid, u.art, art, sprite, z, glowRgb(u.element), u.side, toward, (c.bodyOf(u.art) as any) ?? (u.kind === "beast" ? "quadruped" : u.kind === "boss" ? "large" : "humanoid_unarmed"), looks, face)
        .then(() => { if (puppets.has(u.uid) && u.alive) puppets.play(u.uid, "enter", speed); }).catch(() => { /* the still sprite stays */ });
      return;
    }
    loadRig(block.rig).then((def) => { if (def && views.get(u.uid)?.spriteArt === art) return puppets.add(u.uid, def, art, sprite, z, glowRgb(u.element), u.side, toward, face); })
      .then(() => { if (puppets.has(u.uid) && u.alive) puppets.play(u.uid, "enter", speed); })
      .catch(() => { /* no rig: the still sprite stays */ });
  }
  const rigCache = new Map<string, Promise<RigDef | null>>();
  function loadRig(path: string): Promise<RigDef | null> {
    let p = rigCache.get(path);
    if (!p) { p = fetch(`./${path}`).then((r) => (r.ok ? r.json() : null)).catch(() => null); rigCache.set(path, p); }
    return p;
  }
  const glowRgb = (el: string): [number, number, number] => { const hex = (ELEMENT_COLOR[el] ?? "#ffe9a8").replace("#", ""); const n = parseInt(hex.length === 3 ? hex.split("").map((ch) => ch + ch).join("") : hex, 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
  const rigged = (uid: number) => puppets.has(uid);

  function makeView(u: Combatant): View {
    const art = h("div", { class: "spr", style: { backgroundImage: app.img(u.art) } }, !u.art && h("span", { class: "bt-sprite-ph" }, icon(u.side === "ally" ? "person" : "sword", 40)));
    if (u.side === "enemy") {
      const mini = hpBar("mini", false);
      const sprite = h("div", { class: ["bt-foe-u", u.kind, u.elite && "elite"], dataset: { uid: String(u.uid) }, onClick: () => { if (u.alive) { selectedTarget = u.uid; renderUnits(); } } },
        h("div", { class: "ground" }), h("div", { class: "aura" }), art, h("div", { class: "fu-mini" }, h("b", null, u.name), mini.el, h("div", { class: "fu-st" })), h("div", { class: "fu-mark" }), h("div", { class: "fu-warn" }, "!"));
      sprite.classList.add("enter"); setTimeout(() => sprite.classList.remove("enter"), 900);
      foes.appendChild(sprite);
      attachRig(u, art, sprite, 5);
      return { uid: u.uid, sprite, spriteArt: art, mini };
    }
    const mini = hpBar("mini", false);
    const sprite = h("div", { class: ["bt-ally-u", u.kind], dataset: { uid: String(u.uid) } }, h("div", { class: "ground" }), h("div", { class: "aura" }), art, h("div", { class: "fu-mini" }, h("b", null, u.kind === "player" ? "You" : u.name.split(" ")[0]), mini.el), h("div", { class: "fu-warn" }, "!"));
    sprite.classList.add("enter"); setTimeout(() => sprite.classList.remove("enter"), 900);
    party.appendChild(sprite);
    attachRig(u, art, sprite, u.kind === "player" ? 14 : 13);
    const cardBar = hpBar("card");
    const spBar = h("div", { class: "bar se", role: "meter", "aria-label": "Spiritual energy" }, h("i"));   // not "sp": that is the sect map plaque
    const status = h("div", { class: "bc-status" });
    const role = u.kind === "player" ? `${c.get<any>(u.element).name} · You` : u.kind === "beast" ? "Spirit beast" : `${c.get<any>(u.element).name} · ${ROLE_LABEL[c.get<any>(u.id).dao_companion?.role ?? "dps"] ?? "Companion"}`;
    const card = h("div", { class: ["bt-card", u.kind], dataset: { uid: String(u.uid) } },
      h("div", { class: "bc-por", style: { backgroundImage: app.img(portrait(u)) } }),
      h("div", { class: "bc-body" },
        h("div", { class: "bc-top" }, h("b", { class: "bc-name" }, u.name), h("span", { class: "bc-role" }, role)),
        cardBar.el, u.maxSp > 0 && spBar, status));
    cards.appendChild(card);
    return { uid: u.uid, sprite, spriteArt: art, mini, card, cardBar, spBar, status };
  }

  /**
   * Statuses shown on the figure itself on the arena (they used to be icons only): ice crystals at the feet of a frozen
   * unit, flames licking a burning one, miasma around the poisoned, circling stars over the stunned, a bubble while
   * shielded, rising motes while regenerating. Rebuilt only when the set changes, so the loops never restart.
   */
  const STATUS_FX: Record<string, string> = { "status.freeze": "frost", "status.burning": "flame", "status.poison": "miasma", "status.stun": "stun", "status.regen": "regen", "status.bleeding": "bleed" };
  function statusFx(v: View, u: Combatant) {
    if (!arena) return;
    let box = v.sprite.querySelector<HTMLElement>(":scope > .st-fx");
    if (!box) { box = h("div", { class: "st-fx", "aria-hidden": "true" }); v.sprite.appendChild(box); }
    const want = u.alive ? [...new Set(u.statuses.map((x) => STATUS_FX[x.id]).filter((x): x is string => !!x))] : [];
    if (u.alive && u.shield > 0) want.push("shield");
    const key = want.sort().join(",");
    if (box.dataset.k === key) return;
    box.dataset.k = key;
    replaceChildren(box, ...want.map((k) => {
      const art = k === "frost" || k === "flame" || k === "miasma" ? vctx.sprite(k as Sprite) : undefined;
      return h("i", { class: `sf-${k}`, style: art ? { "--img": art } as any : undefined },
        k === "flame" && h("i"), k === "stun" && [h("b"), h("b"), h("b")], k === "regen" && [h("b"), h("b"), h("b"), h("b")]);
    }));
  }

  /** Focused enemy for the top panel: the chosen target, else the boss, else the first one standing. */
  function focusFoe(): Combatant | undefined {
    const alive = battle.units.filter((u) => u.side === "enemy" && u.alive);
    return alive.find((u) => u.uid === selectedTarget) ?? alive.find((u) => u.kind === "boss") ?? alive[0];
  }

  function renderUnits() {
    // views for new units (summons, next wave) and removal of gone ones
    for (const u of battle.units) if (!views.has(u.uid)) views.set(u.uid, makeView(u));
    for (const [uid, v] of views) if (!battle.units.some((u) => u.uid === uid)) { v.sprite.remove(); v.card?.remove(); views.delete(uid); puppets.remove(uid); }
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
      v.sprite.style.setProperty("--x", `${sl.x}%`); v.sprite.style.setProperty("--s", String(sl.s)); v.sprite.style.setProperty("--y", `${sl.y}px`); v.sprite.style.zIndex = String(sl.z); puppets.setZ(u.uid, sl.z);
      v.sprite.classList.toggle("focus", u === focus && ordered.length > 1);
      v.sprite.classList.toggle("multi", ordered.length > 1);
      v.sprite.classList.toggle("winding", !!u.telegraph || (!!u.boss?.charging && u.boss.charging.turnsLeft <= 1));
      v.sprite.classList.toggle("dead", !u.alive);
      v.mini!.set(u.hp, u.maxHp, u.shield);
      if (arena) { const st = v.sprite.querySelector<HTMLElement>(".fu-st"); if (st) replaceChildren(st, statusIcons(u)); statusFx(v, u); }
    });

    // party
    const allies = battle.units.filter((u) => u.side === "ally");
    const beast = allies.find((u) => u.kind === "beast");
    const people = allies.filter((u) => u.kind !== "beast").sort((a, b) => (a.kind === "player" ? -1 : b.kind === "player" ? 1 : a.uid - b.uid));
    // one column per ally, in card order: each character stands above its own card
    const order = [...people, ...(beast ? [beast] : [])];
    const nCols = Math.min(4, order.length);
    party.style.setProperty("--n", String(nCols));
    order.forEach((u, i) => { const v = views.get(u.uid)!; v.sprite.style.setProperty("--i", String(Math.min(i, nCols - 1))); v.sprite.style.setProperty("--s", String(ALLY_SCALE(order.length, u === beast))); v.sprite.style.zIndex = String(u.kind === "player" ? 4 : 3); });
    cards.className = `bt-cards n${nCols}`;
    for (const u of order) cards.appendChild(views.get(u.uid)!.card!); // keep card order
    for (const u of allies) {
      const v = views.get(u.uid)!;
      v.cardBar!.set(u.hp, u.maxHp, u.shield); v.mini?.set(u.hp, u.maxHp, u.shield);
      (v.spBar!.firstChild as HTMLElement).style.width = `${(u.sp / Math.max(1, u.maxSp) * 100).toFixed(1)}%`;
      v.spBar!.setAttribute("aria-valuenow", String(Math.round(u.sp))); v.spBar!.setAttribute("aria-valuemax", String(u.maxSp)); v.spBar!.title = `Spiritual energy ${Math.round(u.sp)} / ${u.maxSp}`;
      replaceChildren(v.status!, statusIcons(u));
      statusFx(v, u);
      const t = threats.has(u.uid) && u.alive;
      v.card!.classList.toggle("threat", t); v.sprite.classList.toggle("threat", t);
      v.card!.classList.toggle("dead", !u.alive); v.sprite.classList.toggle("dead", !u.alive);
    }
    danger.classList.toggle("on", threats.has(battle.player.uid));
    if (arena) arenaLayout();

    renderFoePanel(focus);
    renderWarn();
    renderOrder();
    replaceChildren(banner, phaseBanner && Date.now() < phaseBanner.until ? h("div", { class: "bt-phase" }, phaseBanner.text) : null);
  }

  function renderFoePanel(f: Combatant | undefined) {
    const enemies = battle.units.filter((u) => u.side === "enemy" && u.alive);
    if (!f) { foePanel.classList.add("cleared"); replaceChildren(foePanel, h("div", { class: "ff-name" }, "Wave cleared")); return; }
    foePanel.classList.remove("cleared");
    foePanel.classList.toggle("boss-panel", f.kind === "boss");   // the arena keeps this panel only for bosses
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

  const trib = enc.src.kind === "tribulation";
  function renderTop() {
    const hz = battle.opts.hazard;
    const hzWave = hz ? Math.min(hz.waves.length, Math.floor(Math.max(0, battle.round - 1) / hz.turnsPerWave) + 1) : 0;
    replaceChildren(topbar,
      h("div", { class: "grow" },
        h("div", { class: "bt-title" }, enc.name),
        trib && hz
          ? h("div", { class: "bt-sub row", style: { gap: "6px" } }, h("span", null, `Wave ${hzWave} / ${hz.waves.length}`), h("span", { class: "trib-pips" }, hz.waves.map((_, i) => h("i", { class: i < hzWave - 1 ? "done" : i === hzWave - 1 ? "cur" : "" }))), h("span", null, `· survive ${Math.max(0, (battle.opts.surviveRounds ?? 0) - battle.round + 1)} more`))
          : practice ? h("div", { class: "bt-sub" }, `${c.get<any>(practice.tech).name} casts ${Math.min(practiceCasts, practice.count)} / ${practice.count} · Practice restores HP; no loot`)
          : enc.src.kind === "showcase" ? h("div", { class: "bt-sub" }, `Arena test · Round ${battle.round} · nothing is spent or won`)
          : h("div", { class: "bt-sub" }, `Wave ${enc.wave + 1}/${enc.waves.length} · Round ${battle.round}${battle.opts.surviveRounds ? ` / ${battle.opts.surviveRounds}` : ""}${caption ? ` · ${caption}` : ""}`)),
      modes,
      h("button", { class: "icon-btn bt-pause", "aria-label": playing ? "Pause" : "Resume", onClick: () => { playing = !playing; renderTop(); root.classList.toggle("paused", !playing); if (playing) loop(); } }, icon(playing ? "pause" : "play", 16)));
  }

  function renderModes() {
    const manual = battle.manual;
    replaceChildren(modes,
      h("div", { class: "seg" }, h("button", { class: manual && "on", onClick: () => setManual(true) }, "Manual"), h("button", { class: !manual && "on", onClick: () => setManual(false) }, icon("auto", 12), " Auto")),
      h("button", { class: "bt-speed", "aria-label": `Speed ${speed}×, tap to change`, onClick: () => { speed = speed >= 3 ? 1 : speed + 1; app.game.state.combat.speed = speed as 1 | 2 | 3; app.game.dirty = true; renderModes(); } }, `${speed}×`));
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
        cd > 0 && h("span", { class: "sk-sweep", "aria-hidden": "true", style: { "--cd": String(Math.min(1, cd / Math.max(1, s.cooldown))) } }),
        cd > 0 && h("span", { class: "sk-cd" }, String(cd)),
        s.kind === "basic" ? h("span", { class: "sk-cost free" }, "+SE") : s.spCost > 0 && h("span", { class: "sk-cost" }, `${s.spCost} SE`));
    };
    const actives = skills.filter((s) => s.kind !== "ultimate");
    // unused slots are hidden in battle (UI review G5); the Techniques screen says what can be equipped
    const empty = 0;
    const ultBtn = ult ? (() => {
      const usable = battle.canUse(p, ult); const pct = Math.min(100, p.ult);
      const art = c.art(ult.id, "icon");
      return h("button", { class: ["bt-ultbtn", pct >= 100 && "charged", usable && waiting && manual && "ready"], style: { "--ult": `${pct}%` }, disabled: !(manual && waiting && usable), onClick: () => choose(ult), title: ult.name, "aria-label": `Ultimate: ${ult.name}` },
        h("span", { class: "ub-ring" }), h("span", { class: "ub-art", style: art ? { backgroundImage: app.img(art) } : undefined }, !art && icon("sparkle", 26)),
        h("span", { class: "ub-tag" }, "Ultimate"), h("span", { class: "ub-pct" }, pct >= 100 ? "READY" : `${Math.floor(pct)}%`));
    })() : null;
    replaceChildren(actions,
      h("div", { class: "bt-skillrow" }, tile(p.skills[0]!, "basic"), ...actives.map((s) => tile(s)), ...Array.from({ length: empty }, () => h("div", { class: "bt-skill empty", title: "Free technique slot: equip one in Techniques" }, h("span", { class: "sk-name" }, "Free slot"), h("span", { class: "sk-art" }, icon("plus", 14))))),
      ultBtn && h("div", { class: "bt-ult" }, h("span", { class: "sk-name ult-name" }, ult!.name), ultBtn));
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
  /** A unit's chest in the effect layer's own pixels (the camera layer may be scaled: undo it). */
  function centerOf(uid: number): { x: number; y: number } | null {
    const v = views.get(uid); if (!v) return null;
    const r = v.spriteArt.getBoundingClientRect(), s = cam.getBoundingClientRect();
    const k = cam.offsetWidth / Math.max(1, s.width);
    return { x: (r.left - s.left + r.width / 2) * k, y: (r.top - s.top + r.height * (unit(uid)?.side === "enemy" ? 0.45 : 0.4)) * k };
  }
  /** Height of a unit's figure in the effect layer's pixels. */
  function heightOf(uid: number): number {
    const v = views.get(uid); if (!v) return 120;
    return v.spriteArt.getBoundingClientRect().height * cam.offsetWidth / Math.max(1, cam.getBoundingClientRect().width);
  }
  function float(uid: number, text: string, cls: string, pre?: string, stack?: number) {
    const p = centerOf(uid); if (!p) return;
    // a flurry's numbers climb in a zigzag so none covers the one before it
    const dx = stack !== undefined ? (stack % 2 ? 22 : -22) + (Math.random() * 8 - 4) : Math.random() * 36 - 18;
    const dy = stack !== undefined ? -stack * 15 : 0;
    const f = h("div", { class: ["bt-float", cls], style: { left: `${p.x + dx}px`, top: `${p.y - 10 + dy}px` } }, pre && h("small", null, pre), text);
    fx.appendChild(f); setTimeout(() => f.remove(), dur(1300) + 200);
  }
  function slash(uid: number, element: string, big = false) {
    const p = centerOf(uid); if (!p) return;
    const el = h("div", { class: ["bt-slash", big && "big"], style: { left: `${p.x}px`, top: `${p.y}px`, "--el": ELEMENT_COLOR[element] ?? "#fff", "--rot": `${-35 + Math.random() * 70}deg` } }, h("i"), h("b"));
    fx.appendChild(el); setTimeout(() => el.remove(), 520);
  }
  const hitTimers = new Map<number, number>();
  function hitFlash(uid: number, big = false) {
    const v = views.get(uid); if (!v) return;
    if (rigged(uid)) { puppets.play(uid, big ? "hitBig" : "hit", speed); return; }
    v.spriteArt.classList.remove("hit", "hit-big"); void v.spriteArt.offsetWidth; v.spriteArt.classList.add(big ? "hit-big" : "hit");
    // the flash is a one-shot: drop the class once it has played so nothing can replay it later
    clearTimeout(hitTimers.get(uid)); hitTimers.set(uid, window.setTimeout(() => v.spriteArt.classList.remove("hit", "hit-big"), 520));
  }
  function screenFlash(kind: "red" | "gold" | "white" | "soft") { flash.className = "bt-flash"; void flash.offsetWidth; flash.className = `bt-flash ${kind}`; }
  function shake(big = false) {
    if (app.settings.reducedMotion || !app.settings.screenShake) return;
    stage.classList.remove("shake", "shake-big"); void stage.offsetWidth; stage.classList.add(big ? "shake-big" : "shake");
    if (big) try { navigator.vibrate?.(35); } catch { /* not supported */ }
  }
  function showSkillName(text: string, kind: "" | "foe" | "heavy" | "ult" = "") { fx.querySelectorAll(".bt-skillname").forEach((x) => x.remove()); const el = h("div", { class: ["bt-skillname", kind] }, text); fx.appendChild(el); setTimeout(() => el.remove(), dur(1000) + 100); }

  // ---------- skill presentation ----------
  function castRing(uid: number, element: string) {
    const v = views.get(uid); if (!v) return;
    v.sprite.style.setProperty("--el", ELEMENT_COLOR[element] ?? "#fff");
    v.sprite.classList.remove("casting"); void v.sprite.offsetWidth; v.sprite.classList.add("casting");
    setTimeout(() => v.sprite.classList.remove("casting"), dur(700));
  }
  /** A glowing bolt from the actor to the target (single-target techniques). */
  function projectile(from: number, to: number, element: string): Promise<void> {
    const a = centerOf(from), b = centerOf(to); if (!a || !b) return Promise.resolve();
    const el = h("div", { class: "bt-bolt", style: { left: `${a.x}px`, top: `${a.y}px`, "--el": ELEMENT_COLOR[element] ?? "#fff", "--dx": `${b.x - a.x}px`, "--dy": `${b.y - a.y}px`, "--rot": `${Math.atan2(b.y - a.y, b.x - a.x)}rad`, animationDuration: `${dur(320)}ms` } }, h("i"), h("b"));
    fx.appendChild(el);
    return new Promise((r) => setTimeout(() => { el.remove(); r(); }, dur(300)));
  }
  /** An element-coloured shockwave over one side of the field (area techniques). */
  function wave(side: "ally" | "enemy", element: string) {
    const el = h("div", { class: ["bt-wave", side], style: { "--el": ELEMENT_COLOR[element] ?? "#fff" } }, h("i"), h("i"), h("i"));
    fx.appendChild(el); setTimeout(() => el.remove(), dur(700) + 50);
  }
  function sparkles(uid: number, kind: "heal" | "shield") {
    const p = centerOf(uid); if (!p) return;
    const el = h("div", { class: ["bt-spark", kind], style: { left: `${p.x}px`, top: `${p.y}px` } }, Array.from({ length: kind === "heal" ? 9 : 1 }, (_, i) => h("i", { style: { "--i": String(i), "--a": `${(i * 40 + 20) % 360}deg` } })));
    fx.appendChild(el); setTimeout(() => el.remove(), dur(900) + 50);
  }
  /** Heavenly lightning: jagged bolts from the top of the sky onto the party. */
  function lightning() {
    // the arena strikes the party with painted bolts where they stand; the classic stage keeps its drawn ones
    if (arena && vfxArt("lightning")) {
      const targets = battle.units.filter((u) => u.side === "ally" && u.alive);
      targets.forEach((u, i) => setTimeout(() => { const ft = feetOf(u.uid); if (ft) bolt(vctx, { x: ft.x + (Math.random() - 0.5) * 20, y: ft.y }, "#c9a0ff", heightOf(u.uid) * 0.55); }, dur(i * 90)));
      punch(0.03);
      return;
    }
    const el = h("div", { class: "bt-lightning" }, Array.from({ length: 3 }, (_, i) => h("svg", { viewBox: "0 0 100 400", preserveAspectRatio: "none", style: { left: `${18 + i * 30 + Math.random() * 12}%`, animationDelay: `${i * 70}ms` } }, (() => { const pl = document.createElementNS("http://www.w3.org/2000/svg", "polyline"); let x = 50, d = ""; for (let y = 0; y <= 400; y += 40) { d += `${x},${y} `; x = Math.max(10, Math.min(90, x + (Math.random() * 50 - 25))); } pl.setAttribute("points", d.trim()); return pl; })())));
    fx.appendChild(el); setTimeout(() => el.remove(), 600);
  }

  /** Ultimate cut-in: the caster's portrait sweeps across a gold band. */
  function cutIn(u: Combatant, skillName: string): Promise<void> {
    const el = h("div", { class: ["bt-cutin", u.side], style: { "--el": ELEMENT_COLOR[u.element] ?? "#fff" } },
      h("div", { class: "ci-band" }), h("div", { class: "ci-por", style: { backgroundImage: app.img(u.side === "ally" ? c.artAny(u.id, "battle", "full_body", "portrait") : u.art) } }),
      h("div", { class: "ci-text" }, h("span", { class: "ci-pre" }, u.side === "ally" ? "Ultimate" : "Devastating art"), h("b", null, skillName), h("span", { class: "ci-who" }, u.name)));
    fx.appendChild(el); screenFlash("gold");
    return new Promise((r) => setTimeout(() => { el.remove(); r(); }, dur(1250)));
  }
  /** Wave start: a sweeping band with the foes' names; bosses get their intro art. */
  function showIntro(): Promise<void> {
    const foesNow = battle.units.filter((u) => u.side === "enemy" && u.alive);
    const boss = foesNow.find((u) => u.kind === "boss");
    const bossArt = boss && c.artAny(boss.id, "intro", "battle");
    const names = [...new Map(foesNow.map((u) => [u.id, u])).values()].map((u) => `${u.name}${foesNow.filter((x) => x.id === u.id).length > 1 ? ` ×${foesNow.filter((x) => x.id === u.id).length}` : ""}`).join(" · ");
    replaceChildren(intro, boss
      ? h("div", { class: "bi-boss" }, h("div", { class: "bi-art", style: { backgroundImage: app.img(bossArt) } }), h("div", { class: "bi-veil" }),
          h("div", { class: "bi-text" }, h("span", { class: "bi-pre" }, trib ? "Heavenly Tribulation" : enc.src.kind === "tower" ? "Tower warden" : enc.src.kind === "tournament" ? "Your opponent" : enc.wave + 1 < enc.waves.length ? "Guardian" : "Sovereign of this place"), h("b", null, boss.name), c.get<any>(boss.id).name_cn && h("span", { class: "cn bi-cn" }, c.get<any>(boss.id).name_cn), h("span", { class: "bi-sub" }, `${c.get<any>(boss.element).name} · ${boss.boss!.phases.length} phases`)))
      : h("div", { class: "bi-wave" }, h("span", { class: "bi-pre" }, `Wave ${enc.wave + 1} / ${enc.waves.length}`), h("b", null, names)));
    intro.classList.add("on");
    const ms = boss ? 2300 : 1250;
    return new Promise((r) => setTimeout(() => { intro.classList.remove("on"); setTimeout(() => replaceChildren(intro), 400); r(); }, dur(ms)));
  }

  /** One engine event on screen (the classic stage plays every event this way; the arena plays lone events). */
  async function playEvent(e: BattleEvent) {
    {
      switch (e.t) {
        case "turn": renderTop(); renderOrder(); break;
        case "action": {
          const a = unit(e.actor); const v = views.get(e.actor);
          const sk = a?.skills.find((s) => s.id === e.skill);
          const element = sk?.element ?? a?.element ?? "elem.none";
          const isUlt = sk?.kind === "ultimate";
          const tech = e.skill !== "basic" && e.skill !== "counter";
          const puppet = rigged(e.actor);
          if (!puppet) { v?.sprite.classList.add("acting"); setTimeout(() => v?.sprite.classList.remove("acting"), dur(420)); }
          if (tech) castRing(e.actor, element);
          if (a && isUlt) await cutIn(a, e.name);
          else if (e.heavy || e.charged) { showSkillName(e.name, "heavy"); screenFlash("red"); if (!puppet) await wait(520); }
          else if (tech) { showSkillName(e.name, a?.side === "enemy" ? "foe" : ""); if (!puppet) await wait(300); }
          else if (!puppet) await wait(160);
          let swung = false;
          if (puppet && a) {
            // the rig's own timing: a swing for strikes, a casting pose for spells, heals and shields; the effect leaves at contact
            const armed = c.animFor(a.art ?? "")?.archetype === "humanoid";
            const clip = isUlt ? "ult" : sk && sk.power > 0 && (!tech || armed) ? "attack" : "cast";
            swung = clip === "attack";
            puppets.setGlow(e.actor, glowRgb(element));
            await puppets.play(e.actor, clip, speed).contact;
          }
          // travel: a bolt to a single target, a wave over several
          const hostile = e.targets.filter((t) => unit(t)?.side !== a?.side);
          if (a && sk && sk.power > 0 && hostile.length) {
            if (swung) { /* a melee swing: the blow lands at the contact frame, nothing flies */ }
            else if (hostile.length === 1 && !isUlt) await projectile(e.actor, hostile[0]!, element);
            else { wave(a.side === "ally" ? "enemy" : "ally", element); await wait(260); }
          }
          if (tech) { caption = `${name(e.actor)}: ${e.name}`; renderTop(); }
          break;
        }
        case "hit": {
          if (e.dodged) { float(e.target, "Miss", "miss"); if (rigged(e.target)) puppets.play(e.target, "dodge", speed); }
          else {
            const big = e.amount >= (unit(e.target)?.maxHp ?? 1) * 0.25;
            float(e.target, fmt.int(e.amount), e.crit ? "dmg crit" : e.kind === "dot" ? "dmg dot" : unit(e.target)?.side === "ally" ? "dmg taken" : "dmg", e.crit ? "CRITICAL!" : undefined);
            if (e.absorbed) float(e.target, `${fmt.int(e.absorbed)} blocked`, "shield");
            if (e.kind !== "dot") { slash(e.target, e.element, e.crit || big); hitFlash(e.target, e.crit || big); }
            if (e.crit || big) shake(big && unit(e.target)?.side === "ally");
          }
          renderUnits(); await wait(e.crit ? 280 : 170); break;
        }
        case "heal": if (e.kind === "heal") sparkles(e.target, "heal"); float(e.target, `+${fmt.int(e.amount)}`, "heal"); renderUnits(); await wait(e.kind === "heal" ? 260 : 140); break;
        case "shield": sparkles(e.target, "shield"); float(e.target, `Shield ${fmt.int(e.amount)}`, "shield"); renderUnits(); await wait(240); break;
        case "status": if ((e.result === "applied" || e.result === "stacked") && e.status !== "status.shield") float(e.target, c.get<any>(e.status).name, "status"); else if (e.result === "resisted") float(e.target, "Resisted", "miss"); else if (e.result === "immune" && c.get<any>(e.status).kind === "control") float(e.target, "Immune", "miss"); renderUnits(); await wait(110); break;
        case "death": {
          const v = views.get(e.target);
          v?.card?.classList.add("dead");
          caption = `${name(e.target)} is defeated`; renderTop();
          if (arena) { const p = centerOf(e.target); if (p) embers(vctx, p, heightOf(e.target)); puppets.setDecal(e.target, null); }
          if (rigged(e.target)) await puppets.play(e.target, "defeat", speed).done;
          else { v?.sprite.classList.add("dying"); await wait(500); }
          if (v && unit(e.target)?.side === "enemy") v.gone = true;
          if (selectedTarget === e.target) selectedTarget = undefined;
          renderUnits(); break;
        }
        case "phase": {
          phaseBanner = { text: `${name(e.actor)} · ${e.name}`, until: Date.now() + 2200 }; screenFlash("white"); renderUnits();
          if (arena) {
            // the arena turns to the boss as it changes: a zoom, a burst of its element, a shock ring at its feet, a roar
            const b = unit(e.actor); const hb = home.get(e.actor); const ch = centerOf(e.actor); const ft = feetOf(e.actor);
            if (hb) camera("zoom", focusOf([hb]), 360);
            if (rigged(e.actor)) puppets.play(e.actor, "charge", speed);
            if (b) puppets.setGlow(e.actor, glowRgb(b.element));
            const col = ELEMENT_COLOR[b?.element ?? ""] ?? "#ffd27a";
            if (ch && ft) { gather(vctx, ch, ft.y, heightOf(e.actor), col, 600); setTimeout(() => { playVfx(vctx, { shape: "burst", color: col, impact: "heavy", from: ch, to: [ch], size: heightOf(e.actor), ground: ft.y, element: b?.element }); shake(true); }, dur(620)); }
            await wait(1300); camera("none"); if (rigged(e.actor)) puppets.play(e.actor, "idle", speed);
          } else await wait(800);
          break;
        }
        case "summon": {
          renderUnits(); caption = `${name(e.actor)} calls reinforcements`; renderTop();
          if (arena) for (const id of e.spawned) { const ft = feetOf(id); const ch = centerOf(id); if (ft && ch) { castArray(vctx, ft, heightOf(id), "#c79bff", 900); ring_(ft, "#c79bff", heightOf(id) * 0.6); } }
          await wait(arena ? 700 : 500); break;
        }
        case "charge": renderUnits(); float(e.actor, "Gathering power", "warnf"); await wait(500); break;
        case "telegraph": renderUnits(); float(e.actor, "!", "warnf big"); await wait(520); break;
        case "interrupt": float(e.actor, "Interrupted!", "interrupt"); renderUnits(); await wait(380); break;
        case "skip": float(e.actor, e.reason === "frozen" ? "Frozen" : "Stunned", "miss"); await wait(250); break;
        case "hazard": lightning(); showSkillName(`${e.name} · wave ${e.wave}/${e.waves}`, "heavy"); screenFlash(arena ? "soft" : "white"); shake(true); await wait(arena ? 620 : 420); break;
        case "ult_ready": renderUnits(); break;
        default: break;
      }
    }
  }

  async function animate(events: BattleEvent[]) {
    if (!arena) for (const e of events) await playEvent(e);
    else for (const b of toBeats(events)) { if (b.kind === "lone") await playEvent(b.event); else await playShot(b); }
    renderSkills();
  }

  // ---------- arena (docs/BATTLE_STAGE.md) ----------
  /** Each unit's box in the line-up (field.ts); a dashing unit is away from it until it returns. */
  const home = new Map<number, Box>();
  const dashing = new Set<number>();
  const stageSize = () => ({ w: cam.offsetWidth || 360, h: cam.offsetHeight || 480 });
  function place(u: Combatant, b: Box, ms = 0) {
    const v = views.get(u.uid); if (!v) return;
    const st = v.sprite.style;
    st.transition = ms ? ["left", "top", "width", "height"].map((k) => `${k} ${Math.round(ms)}ms cubic-bezier(.3,.75,.25,1)`).join(", ") + ", opacity .5s" : "opacity .5s";
    st.left = `${(b.x - b.w / 2).toFixed(1)}px`; st.top = `${(b.feet - b.h).toFixed(1)}px`; st.width = `${b.w.toFixed(1)}px`; st.height = `${b.h.toFixed(1)}px`;
    // the figures are painted on the canvas in depth order; the DOM boxes only carry the bars and marks
    st.zIndex = String(1 + Math.round(Math.min(100, b.z) / 25)); puppets.setZ(u.uid, 10 + b.z);
  }
  /** Line-up: the enemies across the upper band, the party across the lower one; a changed place slides there. */
  function arenaLayout() {
    const present = battle.units.filter((u) => u.side === "ally" || u.alive || !views.get(u.uid)?.gone);
    const boxes = layout(present.map((u) => ({ uid: u.uid, side: u.side, kind: u.side === "enemy" ? (u.kind === "boss" ? "boss" : "enemy") : u.kind === "player" ? "player" : u.kind === "beast" ? "beast" : "companion", elite: u.elite })), stageSize());
    for (const u of present) {
      const b = boxes.get(u.uid); if (!b) continue;
      const prev = home.get(u.uid); home.set(u.uid, b);
      if (dashing.has(u.uid)) continue;
      const moved = prev && (Math.abs(prev.x - b.x) > 1 || Math.abs(prev.feet - b.feet) > 1 || Math.abs(prev.h - b.h) > 1);
      if (!prev || moved) place(u, b, prev ? dur(450) : 0);
    }
  }
  new ResizeObserver(() => { if (arena) { home.clear(); arenaLayout(); } }).observe(cam);

  /** Camera: push toward the striking pair, zoom on an ultimate's targets, relax after (CSS transform on the camera layer). */
  function camera(kind: "none" | "push" | "zoom", at?: { x: number; y: number }, ms = 320) {
    if (kind === "none" || !at || app.settings.reducedMotion) { cam.style.transition = `transform ${Math.round(dur(380))}ms cubic-bezier(.3,.7,.2,1)`; cam.style.transform = ""; return; }
    const W = cam.offsetWidth, H = cam.offsetHeight;
    const sc = kind === "zoom" ? 1.14 : 1.06;
    const tx = (W / 2 - at.x) * 0.3, ty = (H * 0.5 - at.y) * 0.22;
    cam.style.transformOrigin = `${at.x.toFixed(0)}px ${at.y.toFixed(0)}px`;
    cam.style.transition = `transform ${Math.round(dur(ms))}ms cubic-bezier(.3,.7,.2,1)`;
    cam.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${sc})`;
  }

  /** Hit counter: grows with every landed hit of a beat ("12 Hits!"), fades after. */
  let comboN = 0, comboT: number | undefined;
  function comboStep() {
    comboN++; if (comboN < 2) return;
    replaceChildren(combo, h("b", null, String(comboN)), h("span", null, "Hits!"));
    combo.classList.remove("pop"); void combo.offsetWidth; combo.classList.add("on", "pop");
  }
  function comboEnd() { clearTimeout(comboT); comboT = window.setTimeout(() => { combo.classList.remove("on"); comboN = 0; }, dur(900)); }

  /**
   * Ultimate close-up (Epic Seven reference): letterbox bars close in, the world goes dark behind speed lines in the
   * art's colour, the caster's painted cut-in sweeps across (her full-body art when no cut-in is painted), the art's
   * name in gold and in brush calligraphy; a white flash cuts back to the field.
   */
  function showCloseup(u: Combatant, skillName: string, skillCn: string | undefined, color: string): Promise<void> {
    const cut = u.side === "ally" ? c.art(u.id, "cutin") : undefined;
    const art = cut ?? (u.side === "ally" ? c.artAny(u.id, "expression_stern", "full_body", "battle", "portrait") : c.artAny(u.id, "intro", "battle") ?? u.art);
    const ms = 1500;
    replaceChildren(closeup,
      h("div", { class: "cu-lines" }),
      h("div", { class: "cu-bar top" }), h("div", { class: "cu-bar bottom" }),
      h("div", { class: ["cu-art", cut && "cutin"], style: { backgroundImage: app.img(art) } }),
      skillCn && h("div", { class: "cu-cn" }, skillCn),
      h("div", { class: "cu-text" }, h("span", { class: "cu-pre" }, u.side === "ally" ? "Ultimate" : "Devastating art"), h("b", null, skillName), h("span", { class: "cu-who" }, u.name)),
      h("div", { class: "cu-flash" }));
    closeup.style.setProperty("--c", color); closeup.style.setProperty("--d", `${Math.round(dur(ms))}ms`);
    closeup.classList.remove("on"); void closeup.offsetWidth; closeup.classList.add("on");
    try { navigator.vibrate?.(20); } catch { /* not supported */ }
    return new Promise((r) => setTimeout(() => { closeup.classList.remove("on"); r(); }, dur(ms)));
  }

  /** A landed or dodged hit inside a shot (the effect already played): numbers, flash, hit-stop, knockback, shake. */
  function arenaHit(e: Extract<BattleEvent, { t: "hit" }>, o: { tick?: number; dir?: 1 | -1; heavy?: boolean } = {}) {
    if (e.dodged) { float(e.target, "Miss", "miss"); if (rigged(e.target)) puppets.play(e.target, "dodge", speed); return; }
    const big = e.amount >= (unit(e.target)?.maxHp ?? 1) * 0.25;
    const strong = e.crit || big || !!o.heavy;
    if (o.tick !== undefined) float(e.target, fmt.int(e.amount), e.crit ? "dmg crit tick" : "dmg tick", undefined, o.tick);
    else float(e.target, fmt.int(e.amount), e.crit ? "dmg crit" : e.kind === "dot" ? "dmg dot" : unit(e.target)?.side === "ally" ? "dmg taken" : "dmg", e.crit ? "CRITICAL!" : undefined);
    if (e.absorbed) float(e.target, `${fmt.int(e.absorbed)} blocked`, "shield");
    hitFlash(e.target, strong);
    // the blow lands: every figure holds for a beat while the struck one trembles, then it is pushed back
    puppets.hitStop(e.crit ? 120 : strong ? 90 : 60, e.target, e.crit ? 7 : strong ? 5 : 3);
    knock(e.target, o.dir ?? (unit(e.target)?.side === "enemy" ? 1 : -1), e.crit ? 16 : strong ? 12 : 7);
    punch(e.crit ? 0.03 : strong ? 0.02 : 0.01);
    if (e.crit || big) shake(big && unit(e.target)?.side === "ally");
    renderUnits();
  }
  /** Push a figure back along the blow (its box moves; the puppet follows), then it settles. */
  function knock(uid: number, dir: 1 | -1, px: number) {
    const v = views.get(uid); if (!v || app.settings.reducedMotion) return;
    v.sprite.animate([{ translate: "0 0" }, { translate: `${dir * px}px ${-dir * px * 0.35}px`, offset: 0.22 }, { translate: "0 0" }], { duration: dur(360), easing: "cubic-bezier(.2,.8,.3,1)" });
  }
  /** A small camera punch on impact. */
  function punch(k: number) { if (app.settings.reducedMotion) return; cam.animate([{ scale: "1" }, { scale: String(1 + k), offset: 0.3 }, { scale: "1" }], { duration: dur(180), easing: "ease-out" }); }
  /** Slow motion for a finishing blow (wall-clock length). */
  function slowMo(k: number, ms: number) {
    if (app.settings.reducedMotion) return;
    timeK = k; puppets.timeScale = k;
    setTimeout(() => { timeK = 1; puppets.timeScale = 1; }, ms);
  }

  const vfxOf = (id: string): Vfx | undefined => c.find<any>(id)?.vfx;
  const infoOf = (uid: number) => { const u = unit(uid); return u ? { side: u.side, alive: u.alive } : undefined; };
  const vfxArt = (k: Sprite) => app.ui("ui.vfx", k);
  const vctx: VfxCtx = { layer: fx, dur, reduced: app.settings.reducedMotion, sprite: (k) => { const f = vfxArt(k); return f ? app.img(f) : undefined; } };
  const ring_ = (at: { x: number; y: number }, color: string, r: number) => playVfx(vctx, { shape: "ring", color, impact: "medium", from: at, to: [{ x: at.x, y: at.y - r }], size: r * 1.6, ground: at.y });
  /** A unit's feet in the effect layer's pixels. */
  function feetOf(uid: number): { x: number; y: number } | null {
    const v = views.get(uid); if (!v) return null;
    const r = v.spriteArt.getBoundingClientRect(), s0 = cam.getBoundingClientRect(); const k = cam.offsetWidth / Math.max(1, s0.width);
    return { x: (r.left - s0.left + r.width / 2) * k, y: (r.bottom - s0.top) * k - r.height * k * 0.03 };
  }
  /** The ring under the unit whose turn it is (gold for the party, red for foes, jade while it waits for you). */
  const TURN_RGB: Record<string, [number, number, number]> = { ally: [1, 0.82, 0.45], enemy: [1, 0.35, 0.4], wait: [0.45, 1, 0.8] };
  function turnRing(uid: number | null, kind: "ally" | "enemy" | "wait" = "ally") {
    if (!arena) return;
    for (const u of battle.units) if (u.uid !== uid) puppets.setDecal(u.uid, null);
    const f = vfxArt("array");
    if (uid !== null && f) puppets.setDecal(uid, f, TURN_RGB[kind], kind === "wait" ? 0.95 : 0.85);
  }

  /** One action on the arena: approach, strike with its effect, numbers and hit counter, aftermath, return. */
  async function playShot(beat: ActionBeat) {
    const e = beat.action; const a = unit(e.actor); if (!a) return;
    const v = views.get(a.uid);
    const sk = a.skills.find((x) => x.id === e.skill);
    // an ultimate, or a boss's charged art (the one it telegraphs for turns), gets the full treatment: close-up and flurry
    const isUlt = sk?.kind === "ultimate" || (!!e.charged && a.kind === "boss");
    const shot = planShot(beat, infoOf, vfxOf, isUlt);
    const element = sk?.element ?? a.element;
    // the basic strike and counters take the striker's element colour; techniques carry their own
    const color = e.skill === "basic" || e.skill === "counter" ? ELEMENT_COLOR[element] ?? "#f2f5ff" : shot.vfx.color;
    const tech = e.skill !== "basic" && e.skill !== "counter";
    const dir: 1 | -1 = a.side === "ally" ? 1 : -1;
    if (tech) { caption = `${a.name}: ${e.name}`; renderTop(); }
    comboN = 0;
    turnRing(a.uid, a.side);
    // the actor is drawn in front of everyone while it acts (a dash can end behind another figure's depth)
    puppets.setZ(a.uid, 999); if (v) v.sprite.style.zIndex = "60";
    const homeP = home.get(a.uid);
    const firstT = shot.strikes[0] ? home.get(shot.strikes[0].target) : undefined;
    const tgtBoxes = shot.strikes.map((x) => home.get(x.target)).filter((p): p is Box => !!p);
    const sp = shot.vfx.approach === "dash" && homeP && firstT ? strikeBox(homeP, firstT, a.side, stageSize()) : undefined;

    // 1. announce: an ultimate gathers its power, then the close-up; heavy arts flash red; techniques show their name
    if (isUlt && homeP) {
      root.classList.add("ult-dark");
      camera("zoom", focusOf([homeP]), 420);
      puppets.setGlow(a.uid, glowRgb(element));
      if (rigged(a.uid)) puppets.play(a.uid, "charge", speed);
      const ch = centerOf(a.uid), ft = feetOf(a.uid);
      if (ch && ft) gather(vctx, ch, ft.y, heightOf(a.uid) * 0.9, color, 720);
      await wait(760);
      await showCloseup(a, e.name, c.find<any>(e.skill)?.name_cn, color);
      screenFlash("white");
    } else if (e.heavy || e.charged) { showSkillName(e.name, "heavy"); screenFlash("red"); }
    else if (tech) showSkillName(e.name, a.side === "enemy" ? "foe" : "");

    // 2. approach: a crouch, then the dash with afterimages and dust; the camera pushes in on the pair
    camera(cameraFor(shot), focusOf(isUlt ? tgtBoxes : sp && firstT ? [sp, firstT] : homeP ? [homeP, ...tgtBoxes] : tgtBoxes), isUlt ? 420 : 300);
    if (sp && homeP) {
      if (rigged(a.uid)) puppets.play(a.uid, "dash", speed);
      await wait(90);
      const from = feetOf(a.uid);
      dashing.add(a.uid);
      puppets.setTrail(a.uid, 1);
      place(a, sp, dur(shot.timing.approach));
      if (from) dashTrail(vctx, from, { x: sp.x, y: sp.feet }, color);
      await wait(shot.timing.approach);
      puppets.setTrail(a.uid, 0);
      const land = feetOf(a.uid); if (land) dust(vctx, land, heightOf(a.uid) * 0.5, -dir);
    } else if (tech && !isUlt) {
      castRing(e.actor, element);
      const ft = feetOf(a.uid); if (ft) castArray(vctx, ft, heightOf(a.uid) * 0.9, color, 900);
    }

    // 3. strike: the rig's swing or cast; the effect leaves at contact
    if (rigged(a.uid)) { puppets.setGlow(a.uid, glowRgb(element)); await puppets.play(a.uid, shot.clip, speed).contact; }
    else if (v) { v.sprite.classList.remove("acting"); void v.sprite.offsetWidth; v.sprite.classList.add("acting"); setTimeout(() => v.sprite.classList.remove("acting"), dur(460)); await wait(isUlt ? 260 : 170); }
    const targets = shot.strikes.length ? shot.strikes.map((x) => x.target) : shot.friendly;
    const at = targets.map((t) => centerOf(t)).filter((p): p is { x: number; y: number } => !!p);
    const from = centerOf(a.uid) ?? at[0];
    // the numbers: every hit of the actor; an ultimate or a heavy art lands as a flurry whose numbers add up to the
    // real hit (presentation only; the engine's hits are unchanged), and the hit counter counts every one
    const mine = beat.effects.filter((x): x is Extract<BattleEvent, { t: "hit" }> => x.t === "hit" && x.actor === a.uid);
    const ticks = isUlt ? 6 : shot.vfx.impact === "heavy" ? 3 : 1;
    const queue: { e: Extract<BattleEvent, { t: "hit" }>; tick?: number }[] = [];
    for (const x of mine) {
      if (x.dodged || ticks === 1 || x.amount < ticks * 4) { queue.push({ e: x }); continue; }
      const w = Array.from({ length: ticks }, () => 0.75 + Math.random() * 0.5); const sum = w.reduce((p, q) => p + q, 0);
      let left = x.amount;
      for (let k = 0; k < ticks; k++) {
        const amt = k === ticks - 1 ? left : Math.max(1, Math.round(x.amount * w[k]! / sum)); left -= amt;
        queue.push({ e: { ...x, amount: amt, absorbed: k === ticks - 1 ? x.absorbed : 0 }, tick: k === ticks - 1 ? undefined : k });
      }
    }
    const next = () => { const q = queue.shift(); if (!q) return; arenaHit(q.e, { tick: q.tick, dir, heavy: isUlt || shot.vfx.impact === "heavy" }); if (!q.e.dodged) comboStep(); };
    if (at.length && from) {
      const ground = Math.max(...targets.map((t) => feetOf(t)?.y ?? 0));
      // a rain lands its numbers with its blades; other shapes land them all at contact
      const onLand = shot.vfx.shape === "rain" ? () => { next(); if (!app.settings.reducedMotion) cam.animate([{ translate: "0 0" }, { translate: `${(Math.random() * 2 - 1) * 3}px 3px` }, { translate: "0 0" }], { duration: 120 }); } : undefined;
      await playVfx(vctx, { shape: shot.vfx.shape, color, impact: shot.vfx.impact, from, to: at, size: heightOf(targets[0]!), ground, element, onLand });
    }
    while (queue.length) { next(); if (queue.length) await wait(isUlt ? 80 : 100); }
    if (isUlt) { shake(true); puppets.hitStop(150, targets[0], 8); punch(0.04); }
    if (mine.length) await wait(isUlt ? 300 : 180);

    // 4. aftermath: heals, shields, statuses, energy, phases (and reflected or countered blows), then the fallen in slow motion
    for (const x of beat.effects) if (x.t !== "death" && !(x.t === "hit" && x.actor === a.uid)) await playEvent(x);
    const deaths = beat.effects.filter((x) => x.t === "death");
    if (deaths.length) { slowMo(0.35, 650); screenFlash("soft"); }
    for (const x of deaths) await playEvent(x);

    // 5. return: a hop home with afterimages, a landing
    if (dashing.has(a.uid)) {
      dashing.delete(a.uid);
      if (homeP && a.alive) {
        if (rigged(a.uid)) puppets.play(a.uid, "hop", speed);
        puppets.setTrail(a.uid, 0.6);
        place(a, home.get(a.uid) ?? homeP, dur(shot.timing.back + 60));
        await wait(shot.timing.back + 60);
        puppets.setTrail(a.uid, 0);
        if (rigged(a.uid)) puppets.play(a.uid, "land", speed);
        const ft = feetOf(a.uid); if (ft) dust(vctx, ft, heightOf(a.uid) * 0.45, dir);
      }
    }
    camera("none");
    root.classList.remove("ult-dark");
    comboEnd();
    turnRing(null);
    const hp = home.get(a.uid); if (hp && a.alive) place(a, hp);   // back in its depth order
  }
  const wait = (ms: number) => new Promise((r) => setTimeout(r, dur(ms)));

  // ---------- loop ----------
  let busy = false;
  /** Biggest single blow of the encounter (all waves), for the victory stats. */
  let bestHit = { v: 0, crit: false };
  /** A lesson (story practice): the casts of its technique so far; it ends at `count` (no settling: no loot, HP untouched). */
  const practice = enc.src.kind === "practice" ? enc.src : null;
  let practiceCasts = 0;
  // A call while the loop runs (Auto pressed, a manual move) is remembered and replayed when it ends: the running
  // loop may already have decided to stop for manual input, and dropping the call left the fight frozen.
  let loopAgain = false;
  async function loop() {
    if (busy) { loopAgain = true; return; }
    busy = true; loopAgain = false;
    try {
      // Show whatever the engine already produced (a manual action may have ended the battle by itself), then
      // keep stepping; a turn waiting for manual input only stops the loop in Manual (Auto plays it).
      for (;;) {
        const pending = battle.drain();
        for (const e of pending) if (e.t === "hit" && !e.dodged && unit(e.actor)?.side === "ally" && e.amount + e.absorbed > bestHit.v) bestHit = { v: e.amount + e.absorbed, crit: e.crit };
        if (practice) for (const e of pending) if (e.t === "action" && e.actor === battle.player.uid && e.skill === practice.tech) { practiceCasts++; renderTop(); }
        if (pending.length) { await animate(pending); renderUnits(); renderSkills(); }
        if (practice && practiceCasts >= practice.count) { playing = false; showPracticeDone(); return; }
        if (!playing || battle.result || (battle.manual && battle.needsInput)) break;
        battle.step();
      }
      if (battle.manual && battle.needsInput) { renderOrder(); renderSkills(); if (battle.pending) turnRing(battle.pending.uid, "wait"); }
      if (battle.result) await finishWave();
    } finally {
      busy = false;
      if (loopAgain && playing && !battle.result) { loopAgain = false; queueMicrotask(() => loop()); }
    }
  }

  /** The arena's last blow is followed by a victory beat on the field: the party cheers, gold motes rise, a 胜 banner. */
  async function arenaVictory() {
    if (!arena || battle.result !== "victory") return;
    const allies = battle.units.filter((u) => u.side === "ally" && u.alive);
    root.classList.add("won"); combo.classList.remove("on");
    cheer();
    camera("push", focusOf(allies.map((u) => home.get(u.uid)).filter((b): b is Box => !!b)), 700);
    for (const u of allies) { const ch = centerOf(u.uid); if (ch) embers(vctx, ch, heightOf(u.uid), "#ffe08a"); }
    const el = h("div", { class: "bt-victory" }, h("i", { class: "bv-rays" }), h("div", { class: "bv-cn" }, "胜"), h("b", null, "Victory"), h("i", { class: "bv-rule" }));
    root.appendChild(el);
    try { navigator.vibrate?.([15, 60, 25]); } catch { /* not supported */ }
    await wait(1700);
    el.classList.add("out"); camera("none");
    setTimeout(() => el.remove(), 400);
  }

  async function finishWave() {
    await wait(500);
    if (enc.wave + 1 >= enc.waves.length) await arenaVictory();   // the last wave only; between waves the panel follows at once
    if (practice) { showPracticeDone(); return; }
    if (enc.src.kind === "showcase") { showShowcaseDone(); return; }
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
      h("button", { class: "btn gold block", style: { marginTop: "12px" }, onClick: async () => { close(); battle = enc.nextWave(); selectedTarget = undefined; for (const [uid, v] of views) { v.sprite.remove(); v.card?.remove(); puppets.remove(uid); } views.clear(); renderAll(); await showIntro(); loop(); } }, "Continue ▸ Next wave")) });
  }

  function dropsBlock(d: { items: { id: string; qty: number }[]; spirit_stones: number; sect_fame: number }, gearUids: number[]) {
    const s = app.game.state;
    let k = 0;
    const upgrade = (u: number) => { const inst = s.inventory.gear[u]; if (!inst || equippedSlotOf(s, u)) return false; const vs = comparedTo(app, inst, u); return vs === undefined || gearCp(app, inst) > gearCp(app, s.inventory.gear[vs]!); };
    return h("div", null,
      h("div", { class: "row res-cur", style: { justifyContent: "center", flexWrap: "wrap", gap: "6px" } },
        d.spirit_stones > 0 && h("span", { class: "tag gold" }, icon("gem", 10), ` +${fmt.int(d.spirit_stones)}`), d.sect_fame > 0 && h("span", { class: "tag" }, icon("fame", 10), ` +${d.sect_fame} Fame`)),
      (d.items.length > 0 || gearUids.length > 0) && h("div", { class: "drop-grid" },
        ...gearUids.filter((u) => s.inventory.gear[u]).map((u) => h("div", { class: "drop", style: { "--i": String(k++) } as any }, gearTile(app, u), upgrade(u) && h("span", { class: "drop-up", title: "Better than what you wear" }, "▲"), h("div", { class: "tile-name" }, gearName(app, s.inventory.gear[u]!)))),
        ...d.items.map((it) => { const def = c.get<any>(it.id); const fresh = (s.inventory.stacks[it.id] ?? 0) <= it.qty;
          return h("div", { class: "drop", style: { "--i": String(k++) } as any }, h("div", { class: `tile r-${def.rarity ?? "common"}` }, h("div", { class: "in" }, c.art(it.id, "icon") ? h("div", { class: "art", style: { backgroundImage: app.img(c.art(it.id, "icon")) } }) : icon("sparkle", 20)), h("span", { class: "qty" }, `×${it.qty}`), fresh && h("span", { class: "new" }, "NEW")), h("div", { class: "tile-name" }, def.name)); })));
  }

  /** The best gear of the run against what is worn in its slot, with a one-tap Equip (mockup victory: highlighted drop). */
  function bestDropCard(uids: number[]) {
    const s = app.game.state;
    const R = ["common", "uncommon", "rare", "epic", "legendary", "mythic", "immortal", "divine"];
    const live = uids.filter((u) => s.inventory.gear[u]);
    if (!live.length) return null;
    const uid = live.sort((a, b) => R.indexOf(s.inventory.gear[b]!.rarity) - R.indexOf(s.inventory.gear[a]!.rarity) || gearCp(app, s.inventory.gear[b]!) - gearCp(app, s.inventory.gear[a]!))[0]!;
    const inst = s.inventory.gear[uid]!; const base = c.get<any>(inst.base);
    const cp = gearCp(app, inst); const vs = comparedTo(app, inst, uid); const vsCp = vs !== undefined ? gearCp(app, s.inventory.gear[vs]!) : 0;
    const worn = equippedSlotOf(s, uid);
    return h("div", { class: ["res-bestcard", `r-${inst.rarity}`] },
      h("div", { class: "rb-tile" }, gearTile(app, uid)),
      h("div", { class: "grow rb-info" },
        h("div", { class: "rb-tag" }, icon("sparkle", 11), ` Best drop · ${RARITY_LABEL[inst.rarity]} ${base.slot}`),
        h("div", { class: `rb-name rt-${inst.rarity}` }, gearName(app, inst)),
        h("div", { class: "rb-chips" }, gearChips(app, inst, 3))),
      h("div", { class: "rb-cp" },
        h("span", { class: "muted up" }, "CP"), h("b", { class: "tnum" }, fmt.int(cp)),
        worn ? h("span", { class: "jade-t rb-d" }, icon("check", 11), " Worn")
          : h("span", { class: ["rb-d", cp >= vsCp ? "jade-t" : "red-t"] }, vs === undefined ? "Empty slot" : `${cp >= vsCp ? "▲" : "▼"} ${fmt.int(Math.abs(cp - vsCp))}`),
        !worn && cp > vsCp && h("button", { class: "btn gold sm rb-eq", onClick: () => { const r = app.game.run("equip", app.now(), (st, ct) => equip(st, ct, uid)); if (r && (r as any).ok === false) app.router.toast((r as any).reason, "bad"); else app.router.toast(`Equipped ${gearName(app, inst)}`, "good"); } }, "Equip")));
  }

  /** Friendly spar result (mockup spar_result): the opponent's reaction, the spar rewards, Rematch / Back to talk. */
  function showSparResult(r: EncounterResultT) {
    const s = app.game.state;
    const npcId = (enc.src as any).npc as string; const n = c.get<any>(npcId);
    const stake = r.won ? n.duel.win : n.duel.lose;
    const line = (r.won ? SPAR_WIN[npcId] ?? SPAR_WIN.default : SPAR_LOSE[npcId] ?? SPAR_LOSE.default)!;
    const expr = c.artAny(npcId, r.won ? "expression_pout" : "expression_grin", r.won ? "expression_grumble" : "expression_pleased", "expression_neutral", "full_body");
    const rel = s.relations[npcId]; const lvl = affinityLevel(c, npcId, rel?.affinity ?? 0);
    const rows: [string, string][] = [];
    if (r.masteryXp) rows.push(["Technique mastery", `+${r.masteryXp} XP`]);
    for (const a of (stake.affinity ?? []) as { npc: string; delta: number }[]) rows.push([`${c.get<any>(a.npc).name} · affinity`, `${a.delta >= 0 ? "+" : ""}${a.delta}`]);
    if (stake.sect_fame) rows.push(["Sect Fame", `+${stake.sect_fame}`]);
    if (stake.spirit_stones) rows.push(["Spirit Stones", `+${fmt.int(stake.spirit_stones)}`]);
    root.classList.add("won"); cheer();
    app.router.open({ id: "result", kind: "modal", dismissible: false, cls: "victory spar", render: (close) => h("div", { class: "center" },
      h("div", { class: "res-head" }, h("div", { class: "res-rays", "aria-hidden": "true" }), h("div", { class: ["result-title", r.won ? "win" : "lose"] }, r.won ? "Victory" : "Defeated"), h("div", { class: "cn res-cn" }, r.won ? "切磋 · 胜" : "切磋 · 负"),
        h("div", { class: "res-ribbon" }, h("span", null, `Friendly spar · vs ${n.name}`))),
      h("div", { class: "res-gap", "aria-hidden": "true" }),
      h("div", { class: "res-panel glass" },
        h("div", { class: "spar-say" }, h("span", { class: "spar-face", style: { backgroundImage: app.img(expr) } }), h("div", { class: "spar-bubble" }, h("span", { class: "bubble-n" }, n.name), h("div", null, line))),
        h("div", { class: "row", style: { gap: "8px", margin: "10px 0 4px" } }, h("span", { class: "pink-t", style: { fontWeight: 800, fontSize: "calc(11.5rem / 15)" } }, `♥ ${lvl.name}`), h("div", { class: "grow bar thin pink" }, h("i", { style: { width: `${lvl.next ? Math.min(100, (rel?.affinity ?? 0) / lvl.next.threshold * 100) : 100}%` } })), h("span", { class: "muted tnum" }, lvl.next ? `${rel?.affinity ?? 0} / ${lvl.next.threshold}` : `${rel?.affinity ?? 0}`)),
        h("div", { class: "sec-h", style: { marginTop: "8px" } }, h("h3", null, "Spar rewards"), h("span", { class: "hint" }, "Nothing was risked")),
        h("div", { class: "rows" }, rows.length ? rows.map(([k, v]) => h("div", { class: "setrow" }, h("span", { class: "grow lbl" }, k), h("b", { class: "jade-t" }, v))) : h("div", { class: "muted" }, "Practice only · no stakes today")),
        h("div", { class: "grid-2", style: { marginTop: "12px" } },
          h("button", { class: "btn", onClick: () => { close(); onExit(); } }, "Back to talk"),
          h("button", { class: "btn gold", onClick: () => { app.router.close("result"); onExit(); startEncounter(app, enc.src); } }, "Rematch")))) });
  }

  function showResult() {
    const r = enc.done!;
    if (enc.src.kind === "duel") return showSparResult(r);
    const s = app.game.state;
    const sum = r.waves.reduce((a, w) => ({ dealt: a.dealt + w.summary.dealt, taken: a.taken + w.summary.taken, healed: a.healed + w.summary.healed }), { dealt: 0, taken: 0, healed: 0 });
    const first = r.waves[0]!.summary;
    const lastWave = r.waves[r.waves.length - 1]!;
    const mainEnemy = enc.waves.flat().map((id) => c.find<any>(id)).filter(Boolean).sort((a, b) => b.cp - a.cp)[0];
    const bestGear = r.total.gear.length ? r.total.gear.slice().sort((a, b) => ["common", "uncommon", "rare", "epic", "legendary", "mythic", "immortal", "divine"].indexOf(b.rarity) - ["common", "uncommon", "rare", "epic", "legendary", "mythic", "immortal", "divine"].indexOf(a.rarity))[0] : undefined;
    const again = () => { app.router.close("result"); const src = enc.src; onExit(); const re = EncounterCls.start(s, c, src, app.now()); if (!re.ok) { app.router.toast(re.reason, "bad"); return; } app.router.pushGlobal(battleScreen(app, re.encounter, () => { app.router.popGlobal(); app.router.refresh(); })); };
    // overlays re-render every tick: their content must be built inside render, never a node made once and reused
    // (a reused node is moved out of the live modal by the next render and morph leaves an empty shell behind)
    // the next place to play in this region (mockup victory: "Continue ▸ Next node" is the gold primary)
    const nextPlace = r.won && enc.src.kind === "node" ? (() => { const here = c.get<any>((enc.src as any).id); return c.nodesOf(here.region).find((x) => !["hidden", "merchant", "secret_realm"].includes(x.kind) && nodeState(s, c, x) === "reachable"); })() : undefined;
    const goNext = () => { app.router.close("result"); onExit(); if (!nextPlace) return; const scr = regionScreen(app, nextPlace.region, nextPlace.id); if (app.router.current().screen.id === `region:${nextPlace.region}`) app.router.replace(scr); else app.router.push(scr); };
    if (r.won) { root.classList.add("won"); cheer(); return app.router.open({ id: "result", kind: "modal", dismissible: false, cls: "victory", render: (close) => h("div", { class: "center" },
      h("div", { class: "res-head" },
        h("div", { class: "res-rays", "aria-hidden": "true" }),
        h("div", { class: "result-title win" }, trib ? "Tribulation passed" : "Victory"),
        h("div", { class: "cn res-cn" }, trib ? "渡 劫 成 功" : "大 胜"),
        h("div", { class: "res-ribbon" }, mainEnemy && h("span", { class: "res-foe", style: { backgroundImage: app.img(c.art(mainEnemy.id, "icon")) } }, h("i", null, trib ? "Endured" : "Defeated")), h("span", null, trib ? "The heavens relent. Break through when you are ready." : `${mainEnemy?.name ?? enc.name} defeated`), r.firstClear && h("span", { class: "tag gold" }, "First clear"))),
      h("div", { class: "res-gap", "aria-hidden": "true" }),
      h("div", { class: "res-panel glass" },
        h("div", { class: "grid-3 res-stats" },
          stat("sword", "Damage dealt", fmt.compact(sum.dealt)),
          bestHit.v > 0 ? stat("bolt", "Highest hit", fmt.compact(bestHit.v), bestHit.crit ? "crit" : undefined) : stat("shield", "Damage taken", fmt.compact(sum.taken)),
          stat("shield", "HP left", [hpNum(Math.min(lastWave.summary.playerHp, battle.player.maxHp)), h("small", null, `/ ${hpNum(battle.player.maxHp)}`)], undefined, Math.min(1, lastWave.summary.playerHp / Math.max(1, battle.player.maxHp)))),
        h("div", { class: "sec-h", style: { marginTop: "12px" } }, h("h3", null, "Rewards"), h("span", { class: "hint" }, `${r.masteryXp ? `Mastery +${r.masteryXp} XP` : ""}`)),
        dropsBlock(r.total, r.waves.flatMap((w) => w.gearUids)),
        r.firstClear && Object.keys(r.firstClear).length > 0 && h("div", { class: "res-first" }, h("span", { class: "muted up" }, "First clear"), rewardsLine(app, r.firstClear)),
        bestGear && bestDropCard(r.waves.flatMap((w) => w.gearUids)),
        trackedLine(),
        nextPlace ? h("div", { class: "res-btns3", style: { marginTop: "12px" } },
            h("button", { class: "btn ghost", onClick: () => { close(); onExit(); } }, icon("back", 14), "Map"),
            h("button", { class: "btn ghost", onClick: again }, "Again"),
            h("button", { class: "btn gold", onClick: goNext }, h("span", null, "Continue ▸"), h("span", { class: "cta-s" }, nextPlace.name)))
          : h("div", { class: "grid-2", style: { marginTop: "12px" } },
            h("button", { class: "btn", onClick: () => { close(); onExit(); } }, icon("back", 14), "Map"),
            h("button", { class: "btn gold", onClick: again }, "Fight again")))) }); }
    // Defeat (mockup defeat): the foe with HP left and the power check, no penalty, ways to get stronger
    const lastFoe = battle.units.filter((u) => u.side === "enemy").sort((a, b) => b.maxHp - a.maxHp)[0];
    const foeDef = lastFoe ? c.find<any>(lastFoe.id) ?? mainEnemy : mainEnemy;
    const dealtHere = battle.units.filter((u) => u.side === "ally").reduce((n, u) => n + u.stats.dealt, 0);
    const gap = r.playerCp - r.enemyCp;
    const goTo: Record<string, () => void> = {
      cultivate: () => { app.router.clearGlobal(); app.router.setTab("cultivate"); },
      character: () => { app.router.clearGlobal(); app.router.setTab("character"); },
      inventory: () => { app.router.clearGlobal(); app.router.setTab("inventory"); },
      adventure: () => { app.router.clearGlobal(); app.router.setTab("adventure"); },
      forge: () => { app.router.clearGlobal(); app.router.setTab("sect"); const loc = c.byPrefix<any>("sectloc").find((l) => (l.features ?? []).includes("forge")); if (loc) openLocation(app, loc.id); },
      pavilion: () => { app.router.clearGlobal(); app.router.setTab("sect"); const loc = c.byPrefix<any>("sectloc").find((l) => (l.features ?? []).includes("pavilion")); if (loc) openLocation(app, loc.id); },
      beasts: () => { app.router.clearGlobal(); app.router.setTab("sect"); const loc = c.byPrefix<any>("sectloc").find((l) => (l.features ?? []).includes("beasts")); if (loc) openLocation(app, loc.id); },
      autobattle: () => { app.router.clearGlobal(); app.router.setTab("character"); app.router.push(autoBattleScreen(app, "Character")); },
    };
    app.router.open({ id: "result", kind: "modal", dismissible: false, cls: "defeat", render: (close) => h("div", { class: "center" },
      h("div", { class: "result-title lose" }, "Defeated"),
      h("div", { class: "cn res-cn" }, "败 退"),
      h("div", { class: "m-sub" }, "You were driven back — ", h("b", null, "nothing is lost"), "."),
      foeDef && h("div", { class: "glass panel df-foe" },
        h("span", { class: "df-art", style: { backgroundImage: app.img(c.artAny(foeDef.id, "icon", "battle")) } }),
        h("div", { class: "grow", style: { minWidth: 0 } },
          h("div", { class: "muted up", style: { color: "#ffb3bd" } }, `${foeDef.phases ? "Boss" : foeDef.kind === "elite" ? "Elite" : (foeDef.kind ?? "enemy")[0].toUpperCase() + (foeDef.kind ?? "enemy").slice(1)} · ${c.get<any>(foeDef.element).name} · ${c.get<any>(foeDef.realm.id).name} ${foeDef.realm.stage}`),
          h("div", { class: "df-name" }, foeDef.name),
          h("div", { class: "muted" }, enc.name),
          lastFoe && h("div", { class: "bar hp", style: { marginTop: "6px", height: "14px" } }, h("i", { style: { width: `${(lastFoe.hp / lastFoe.maxHp * 100).toFixed(1)}%` } }), h("span", null, `${fmt.compact(lastFoe.hp)} / ${fmt.compact(lastFoe.maxHp)} HP left (${Math.round(lastFoe.hp / lastFoe.maxHp * 100)}%)`)),
          h("div", { class: "muted", style: { marginTop: "4px" } }, `You dealt ${fmt.compact(Math.max(sum.dealt, dealtHere))} damage this run`, foeDef.weaknesses?.length ? ` · weak to ${foeDef.weaknesses.map((w: string) => c.get<any>(w).name).join(", ")}` : ""))),
      h("div", { class: "glass panel df-power" },
        h("div", { class: "sec-h" }, h("h3", null, "Power check"), h("span", { class: "hint" }, "Combat Power")),
        h("div", { class: "df-cp" },
          h("div", { class: "df-cpbox" }, h("span", null, icon("cp", 12), " Your CP"), h("b", null, fmt.int(r.playerCp))),
          h("div", { class: "df-gap" }, h("b", { class: gap >= 0 ? "jade-t" : "red-t" }, `${gap >= 0 ? "+" : "−"}${fmt.int(Math.abs(gap))}`), h("span", { class: "muted up" }, gap >= 0 ? "above the enemy" : "below the enemy")),
          h("div", { class: "df-cpbox" }, h("span", null, "Enemy"), h("b", null, fmt.int(r.enemyCp)))),
        h("div", { class: "df-track" }, h("i", { style: { width: `${Math.min(100, r.playerCp / Math.max(1, Math.max(r.playerCp, r.enemyCp)) * 100)}%` } }), h("b", { style: { left: `${Math.min(100, r.enemyCp / Math.max(1, Math.max(r.playerCp, r.enemyCp)) * 100)}%` } }))),
      h("div", { class: "glass panel df-nopen" }, h("span", { class: "df-check" }, icon("check", 16)), h("div", { class: "grow" }, h("b", null, "No penalty"), h("div", { class: "muted" }, `Drops from this run are kept · HP restored to ${c.combat.defeat.hp_pct_after_defeat}% · retry for free`)),
        r.total.items.slice(0, 2).map((it) => h("span", { class: "tile-mini", style: { backgroundImage: app.img(c.art(it.id, "icon")) } }))),
      r.recommendations.length > 0 && h("div", { class: "glass panel df-ways" },
        h("div", { class: "sec-h" }, h("h3", null, "Ways to get stronger"), h("span", { class: "hint" }, "Tap to go there")),
        h("div", { class: "rows" }, r.recommendations.map((a) => h("button", { class: "setrow df-way", onClick: () => { close(); onExit(); goTo[a.go]?.(); } },
          h("span", { class: "df-way-ico" }, icon(a.icon, 18)), h("div", { class: "grow" }, h("div", { class: "lbl" }, a.title), h("div", { class: "desc" }, a.detail)), h("b", { class: "jade-t df-gain" }, a.gain))))),
      trackedLine(),
      h("div", { class: "grid-3 df-actions" },
        h("button", { class: "btn", onClick: () => { close(); onExit(); } }, icon("back", 14), "Map"),
        h("button", { class: "btn", onClick: () => { app.game.state.combat.manual = false; app.game.dirty = true; again(); } }, icon("auto", 14), "Auto"),
        h("button", { class: "btn gold", onClick: again }, "Retry"))) });
  }
  /** End of a lesson: the technique was cast enough times (or the post fell). Nothing is settled: no loot, HP as before. */
  let practiceShown = false;
  function showPracticeDone() {
    if (!practice || practiceShown) return;
    practiceShown = true; root.classList.add("won"); cheer();
    const tech = c.get<any>(practice.tech);
    app.router.open({ id: "result", kind: "modal", dismissible: false, cls: "practice-done", render: (close) => h("div", { class: "center" },
      h("div", { class: "cn m-cn" }, "习 成"), h("div", { class: "m-title" }, "Lesson learned"),
      h("div", { class: "m-sub" }, `${tech.name} cast ${Math.min(practiceCasts, practice.count)} / ${practice.count} · practice restores HP; no loot`),
      h("button", { class: "btn gold cta block", onClick: () => { close(); onExit(); } }, "Back to the lesson ›")) });
  }

  /** End of the arena test fight: nothing was settled; fight it again or go back. */
  function showShowcaseDone() {
    const won = battle.result === "victory";
    if (won) { root.classList.add("won"); cheer(); }
    app.router.open({ id: "result", kind: "modal", dismissible: false, cls: "practice-done showcase-done", render: (close) => h("div", { class: "center" },
      h("div", { class: "cn m-cn" }, won ? "试 阵 · 胜" : "试 阵 · 负"), h("div", { class: "m-title" }, won ? "Arena test won" : "Arena test lost"),
      h("div", { class: "m-sub" }, "Nothing was spent or won. Tell Claude what to change, or switch the stage in Settings → Battle stage."),
      h("div", { class: "grid-2", style: { marginTop: "12px" } },
        h("button", { class: "btn", onClick: () => { close(); onExit(); } }, icon("back", 14), "Back"),
        h("button", { class: "btn gold", onClick: () => { close(); onExit(); startEncounter(app, { kind: "showcase" }); } }, "Again"))) });
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
  const hpNum = (n: number) => n < 100_000 ? fmt.int(n) : fmt.compact(n);
  const stat = (ic: string, l: string, v: Child, tag?: string, frac?: number) => h("div", { class: "rs-tile" },
    h("span", { class: "rs-l" }, icon(ic, 11), l), h("b", { class: "tnum" }, v, tag && h("i", { class: "rs-tag" }, tag)),
    frac !== undefined && h("div", { class: "rs-bar" }, h("i", { style: { width: `${(frac * 100).toFixed(1)}%` } })));

  function cheer() { for (const u of battle.units) if (u.side === "ally" && u.alive && rigged(u.uid)) puppets.play(u.uid, "victory", 1); }
  function renderAll() { renderTop(); renderModes(); renderUnits(); renderSkills(); }
  renderAll();
  if ((globalThis as any).__ia) { (globalThis as any).__ia.enc = enc; (globalThis as any).__ia.anim = puppets; } // test lab hooks
  // start after mount so effect positions resolve
  timer = window.setTimeout(async () => { await showIntro(); loop(); }, 250);

  return { id: "battle", nav: false, bg: () => enc.bg, render: () => root, onLeave: () => { playing = false; if (timer) clearTimeout(timer); puppets.dispose(); } };
}


/** Start an encounter and open the battle screen; toasts the reason when it cannot start. */
export function startEncounter(app: App, src: Parameters<typeof EncounterCls.start>[2], onDone?: () => void): boolean {
  const r = EncounterCls.start(app.game.state, app.content, src, app.now());
  if (!r.ok) { app.router.toast(r.reason, "bad"); return false; }
  app.game.dirtyImportant = true;
  app.router.pushGlobal(battleScreen(app, r.encounter, () => { app.router.popGlobal(); onDone?.(); app.router.refresh(); }));
  return true;
}
