/**
 * Visual novel player, drawn to the owner's prologue mockups (refs/mockups/prologue/): a header with the chapter and
 * the scene (or the place), a full-screen CG that may paint the speakers itself (`figure: false`), a location chip and a
 * name tag over the painted character, a narration box, dialogue with an emblem nameplate and the affinity chip,
 * introduction blocks (tag, vertical Chinese name, title, element chip), questions with Elder Wen's reply and
 * "Your answer", lesson cards with a button (a practice fight for a technique), and the unlock card at the end of a
 * scene that grants something. Owns its DOM so typing animations survive shell re-renders.
 */
import { h, morph, keep, type Child } from "../core/dom.ts";
import { icon } from "../core/icons.ts";
import type { Screen } from "../core/router.ts";
import type { App } from "../../app.ts";
import type { StoryScene, Npc } from "../../content/index.ts";
import { completeScene } from "../../engine/story.ts";
import { startEncounter } from "./battle.ts";

const NUMERALS = ["壹", "贰", "叁", "肆", "伍"];
/** The intro tag of a first meeting; only then does the nameplate show the affinity chip (as in the mockups). */
const NEW_CHARACTER = "New character";
const CHAPTER_TITLES: Record<string, string> = { prologue: "Prologue · The Path Begins", forest: "Chapter I · The Azure Bamboo Forest", tang: "Side Story · Tang's Caravan", regions: "Journey" };
/** Nameplate emblem per speaker (mockups: the sect's hall in blue for Elder Wen, in gold for Elder Feng, a snowflake for Bai). */
const EMBLEM: Record<string, { icon: string; tone: "blue" | "gold" | "ice" }> = {
  "npc.elder_wen": { icon: "temple", tone: "blue" }, "npc.elder_feng": { icon: "temple", tone: "gold" }, "npc.bai_lingshuang": { icon: "snow", tone: "ice" },
};

type StoryLineT = StoryScene["lines"][number];
interface LogLine { who: string; text: string }

/** "**word**" → gold emphasis; "\n" → line break. Only the characters in [from, to) are kept (typing). */
function rich(text: string, to = Infinity, from = 0): Child[] {
  const out: Child[] = []; let pos = 0;
  text.split(/(\*\*[^*]+\*\*)/).forEach((part) => {
    if (!part) return;
    const em = part.startsWith("**") && part.endsWith("**");
    const body = em ? part.slice(2, -2) : part;
    const a = Math.max(0, from - pos), b = Math.min(body.length, to - pos); pos += body.length;
    if (b <= a) return;
    const bits: Child[] = body.slice(a, b).split("\n").flatMap((l, i) => (i ? [h("br"), l] : [l]));
    out.push(em ? h("b", { class: "vn-em" }, bits) : bits);
  });
  return out;
}
const plain = (t: string) => t.replace(/\*\*/g, "");
/** Gold filigree in the four corners of a story box (mockups). */
const corners = () => ["tl", "tr", "bl", "br"].map((k) => h("span", { class: `vn-orn ${k}`, "aria-hidden": "true" }));

export function storyScreen(app: App, startId: string, done: () => void): Screen {
  const c = app.content;
  let scene = c.get<StoryScene>(startId);
  let sceneIndex = 1;
  let line = 0, shown = 0, timer: number | undefined, autoTimer: number | undefined;
  /** lines: typing/reading · choices: answers on screen · reply: the speaker answers the choice · card: unlock card */
  let phase: "lines" | "choices" | "reply" | "card" = "lines";
  let answers: number[] = [];
  let reviewing = false;
  let practiceCasts = 0;
  let auto = false;
  const log: LogLine[] = [];
  const met = new Set<string>(Object.keys(app.game.state.relations));
  const reduce = () => app.settings.reducedMotion;
  const root = keep(h("div", { class: "vn" }));

  const cur = () => scene.lines[Math.min(line, scene.lines.length - 1)]!;
  const speakerName = (sp: string) => sp === "narration" ? "" : sp === "player" ? app.game.state.character.name : c.get<Npc>(sp).name;
  const artFor = (sp: string, expr?: string) => {
    if (sp === "narration") return undefined;
    const npc = sp === "player" ? app.game.state.character.npc : sp;
    return (expr && c.art(npc, `expression_${expr}`)) || c.artAny(npc, "full_body", "portrait");
  };
  /** The text being typed: the line, or the speaker's reply to the answer just chosen. */
  const typedText = () => { const ln = cur(); return phase === "reply" && ln.choices ? ln.choices[answers[answers.length - 1]!]!.reply ?? "" : ln.text; };
  const plainLen = () => plain(typedText()).length;

  const stopTimers = () => { if (timer) clearInterval(timer); if (autoTimer) clearTimeout(autoTimer); timer = autoTimer = undefined; };

  function type() {
    stopTimers();
    const n = plainLen();
    shown = reduce() ? n : 0;
    if (!reduce()) timer = window.setInterval(() => { shown += 2; if (shown >= n) { shown = n; clearInterval(timer); timer = undefined; afterTyped(); } draw(); }, 22);
    else afterTyped();
    draw();
  }
  function startLine() {
    const ln = cur();
    log.push({ who: speakerName(ln.speaker) || "Narration", text: plain(ln.text) });
    type();
  }
  /** Typing finished: a question shows its answers; plain lines may auto-advance. */
  function afterTyped() {
    const ln = cur();
    if (phase === "lines" && ln.choices) { phase = "choices"; draw(); return; }
    if (auto && phase === "lines" && !ln.cta) autoTimer = window.setTimeout(() => advance(), 1400 + plain(ln.text).length * 18);
  }

  /** Tap: finish the typing, else go on (lines that wait on a button or an answer ignore taps). */
  function advance() {
    if (shown < plainLen()) { shown = plainLen(); stopTimers(); afterTyped(); draw(); return; }
    if (phase !== "lines") return;
    const ln = cur();
    if (ln.cta || ln.choices) return;
    nextLine();
  }
  function nextLine() {
    const ln = cur();
    if (ln.speaker !== "narration" && ln.speaker !== "player") met.add(ln.speaker);
    reviewing = false;
    if (line + 1 < scene.lines.length) { line++; phase = "lines"; startLine(); return; }
    endLines();
  }

  function answer(i: number) {
    const ln = cur();
    answers.push(i);
    log.push({ who: app.game.state.character.name, text: ln.choices![i]!.text });
    if (ln.choices![i]!.reply) { phase = "reply"; log.push({ who: speakerName(ln.speaker), text: ln.choices![i]!.reply! }); type(); }
    else nextLine();
  }

  function endLines() {
    stopTimers();
    if (scene.choices?.length) { phase = "choices"; draw(); return; }
    finish(scene.lines.some((l) => l.choices) ? answers : null);
  }

  function finish(choice: number | number[] | null) {
    const r = app.game.run("story", app.now(), (s, ct) => completeScene(s, ct, scene.id, choice, app.now()));
    if (!r.ok) { app.router.toast(r.reason, "bad"); return; }
    if (typeof choice === "number") log.push({ who: app.game.state.character.name, text: scene.choices![choice]!.text });
    const grants = scene.unlocks.filter((u) => c.has(u));
    if (grants.length && phase !== "card") { phase = "card"; pendingNext = r.next; draw(); return; }
    goNext(r.next);
  }
  let pendingNext: string | undefined;

  function goNext(next?: string) {
    if (next) { scene = c.get<StoryScene>(next); if (!scene.place) sceneIndex++; line = 0; answers = []; practiceCasts = 0; phase = "lines"; startLine(); }
    else { stopTimers(); done(); }
  }

  function skip() {
    if (!scene.skippable) return;
    stopTimers();
    // questions still need answers (they set affinities): skip types out the current line and stops at the next question
    for (;;) {
      const ln = cur();
      if (ln.choices && (phase === "lines" || phase === "choices")) { shown = plainLen(); phase = "choices"; draw(); return; }
      if (ln.cta?.action === "practice") { shown = plainLen(); draw(); return; }
      if (line + 1 >= scene.lines.length) break;
      line++; phase = "lines"; log.push({ who: speakerName(cur().speaker) || "Narration", text: plain(cur().text) });
    }
    shown = plainLen(); reviewing = false;
    endLines();
  }

  /** A lesson button: a practice fight first, then the story goes on. */
  function onCta(ln: StoryLineT) {
    if (ln.cta?.action === "practice" && ln.practice) {
      const p = ln.practice;
      stopTimers();
      startEncounter(app, { kind: "practice", enemy: p.enemy, tech: p.tech, count: p.count }, () => { practiceCasts = p.count; nextLine(); });
      return;
    }
    nextLine();
  }

  function openLog() {
    app.router.open({ id: "vn-log", kind: "sheet", render: () => h("div", null,
      h("div", { class: "sec-h" }, h("h3", null, "Dialogue history"), h("span", { class: "hint" }, `${log.length} lines`)),
      h("div", { class: "rows" }, log.map((l) => h("div", { class: "setrow", style: { display: "block" } }, h("div", { class: "lbl gold-t" }, l.who), h("div", { class: "dim", style: { fontSize: "calc(13rem / 15)" } }, l.text))))) });
  }

  function topBar() {
    const sub = scene.place ? `${c.get<any>(scene.place).name} · ${scene.name}` : `Scene ${sceneIndex} · ${scene.name}`;
    return h("div", { class: "vn-top glass" },
      h("div", { class: "vn-emblem" }, icon("temple", 20)),
      h("div", { class: "grow" }, h("div", { class: "vn-chapter" }, CHAPTER_TITLES[scene.chapter] ?? scene.chapter), h("div", { class: "vn-sub" }, sub)),
      h("button", { class: ["vn-chip", auto && "on"], "aria-label": "Auto", onClick: (e: Event) => { e.stopPropagation(); auto = !auto; if (auto) afterTyped(); else stopTimers(); draw(); } }, h("span", { class: "vn-chip-i" }, "▸"), h("span", { class: "vn-chip-l" }, "Auto")),
      scene.skippable && h("button", { class: "vn-chip", "aria-label": "Skip", onClick: (e: Event) => { e.stopPropagation(); skip(); } }, h("span", { class: "vn-chip-i" }, "▸▸"), h("span", { class: "vn-chip-l" }, "Skip")),
      h("button", { class: "vn-chip", "aria-label": "Log", onClick: (e: Event) => { e.stopPropagation(); openLog(); } }, h("span", { class: "vn-chip-i" }, "≡"), h("span", { class: "vn-chip-l" }, "Log")));
  }

  function draw() {
    const ln = cur();
    const npcId = ln.speaker === "narration" ? undefined : ln.speaker === "player" ? app.game.state.character.npc : ln.speaker;
    const npc = npcId ? c.get<Npc>(npcId) : undefined;
    const cast = npcId ? scene.cast?.[npcId] : undefined;
    const typing = (phase === "lines" || phase === "reply") && shown < plainLen();
    const firstMeet = !!npc && ln.speaker !== "player" && !met.has(ln.speaker) && phase === "lines";
    const introTag = ln.intro ?? (firstMeet && scene.figure ? NEW_CHARACTER : undefined);
    const rel = npc ? app.game.state.relations[npc.id] : undefined;
    const levels = npc?.affinity_levels ?? [];
    const lvIdx = levels.reduce((k: number, l: any, i: number) => ((rel?.affinity ?? 0) >= l.threshold ? i : k), -1);
    const level = lvIdx >= 0 ? levels[lvIdx] : undefined;
    const nextLv = levels[lvIdx + 1];
    const questions = scene.lines.filter((l) => l.choices);
    /** Affinity with a character met for the first time: on the nameplate (as in the mockups) where there is room,
     *  in the introduction block on phones (CSS shows one of the two). */
    const affChip = () => introTag === NEW_CHARACTER && level && h("span", { class: "vn-aff" }, h("span", { class: "vn-aff-h" }, "♡"), h("span", { class: "vn-aff-l" }, level.name),
      h("span", { class: "vn-aff-pips" }, Array.from({ length: 5 }, (_x, i) => h("i", { class: nextLv ? ((rel?.affinity ?? 0) - level.threshold) / Math.max(1, nextLv.threshold - level.threshold) * 5 > i && "on" : "on" }))));

    const body: Child[] = [];
    if (phase === "card") {
      const grants = scene.unlocks.filter((u) => c.has(u)).map((u) => c.get<any>(u));
      body.push(h("div", { class: "vn-card" },
        ...(() => {
          const m = /^Welcome to (the )?(.+)$/.exec(scene.name);
          return [h("div", { class: "vn-card-pre" }, m ? `Welcome to ${m[1] ?? ""}`.trim() : "Unlocked"), h("div", { class: "vn-card-title" }, m ? m[2] : scene.name)];
        })(),
        scene.name_cn && h("div", { class: "cn vn-card-cn" }, scene.name_cn.split("").join(" ")),
        app.ui("ui.icons", "sect_emblem") ? h("div", { class: "vn-seal art", style: { backgroundImage: app.img(app.ui("ui.icons", "sect_emblem")) } }) : h("div", { class: "vn-seal" }, icon("qi", 54)),
        scene.chapter === "prologue" && h("div", { class: "vn-ribbon" }, h("div", { class: "vn-ribbon-pre" }, "✦ Rank granted ✦"), h("div", { class: "vn-ribbon-t" }, c.get<any>(app.game.state.character.rank).name)),
        h("div", { class: "dim center", style: { fontSize: "calc(12.5rem / 15)", margin: "10px 0" } }, plain(scene.lines[0]!.text)),
        h("div", { class: "row", style: { justifyContent: "center", flexWrap: "wrap", gap: "8px" } }, grants.map((g) => h("div", { class: "vn-grant" },
          h("span", { class: "vn-grant-i" }, icon(g.id.startsWith("method.") ? "qi" : g.id.startsWith("sectloc.") ? "temple" : "scroll", 15)),
          h("span", null, h("span", { class: "muted up" }, g.id.startsWith("method.") ? "Method granted" : g.id.startsWith("sectloc.") ? "New area" : "Received"), h("b", null, g.name))))),
        h("div", { class: "vn-tap" }, "Tap to continue")));
    } else {
      const art = scene.figure ? artFor(ln.speaker, ln.expression) : undefined;
      if (art) body.push(h("div", { class: ["vn-figure", introTag && "intro"], dataset: { key: art }, style: { backgroundImage: app.img(art) } }));
      if (scene.setting) body.push(h("div", { class: "vn-setting" }, icon("temple", 16), h("b", null, scene.setting.name), scene.setting.sub && h("span", null, `· ${scene.setting.sub}`)));
      if (scene.tag) { const t = scene.tag; body.push(h("div", { class: "vn-tag", style: { left: `${t.x}%`, top: `${t.y}%` } }, h("span", { class: "avatar", style: { backgroundImage: app.img(c.artAny(t.npc, "portrait", "full_body")) } }), c.get<Npc>(t.npc).name)); }
      if (introTag && npc && ln.speaker !== "player") body.push(h("div", { class: "vn-intro", dataset: { fit: introFit } },
        h("span", { class: "vn-intro-tag" }, `✦ ${introTag}`),
        h("div", { class: "vn-intro-cn" }, (cast?.cn ?? npc.name_cn ?? "").split("").map((ch: string) => h("span", null, ch))),
        h("div", { class: "vn-intro-name" }, cast?.name ?? npc.name),
        h("div", { class: "vn-intro-title" }, (cast?.intro_title ?? npc.title ?? "").split(/\s*·\s*/).map((t: string) => h("div", null, t))),
        cast?.chip ? h("span", { class: "vn-intro-chip" }, icon(cast.chip_icon ?? "sparkle", 13), cast.chip) : h("div", { class: "row", style: { gap: "4px", marginTop: "6px" } }, (npc.elements ?? []).map((e: string) => h("span", { class: "tag" }, c.get<any>(e).name))),
        affChip()));
      if (questions.length || (scene.choices?.length && !scene.figure)) {
        const qi = Math.max(0, questions.indexOf(ln));
        body.push(h("div", { class: "vn-titlecard" }, scene.name_cn && h("div", { class: "cn" }, scene.name_cn.split("").join(" ")), h("div", { class: "t" }, scene.name),
          scene.progress && questions.length > 1 && h("div", { class: "vn-steps" }, h("span", null, `${scene.progress} ${qi + 1} of ${questions.length}`),
            h("span", { class: "vn-pips" }, questions.map((_q, i) => h("i", { class: i < answers.length || i === qi ? "on" : "" }))))));
      }
      const tap = !typing && phase === "lines" && !ln.cta && !ln.choices && h("div", { class: "vn-tapcue" }, "Tap to continue");
      if (ln.speaker === "narration") {
        body.push(h("div", { class: "vn-narr glass gold" }, corners(), h("div", { class: "vn-narr-lbl" }, "Narration"), h("div", { class: "vn-narr-text" }, rich(ln.text, typing ? shown : Infinity), typing && h("span", { class: "vn-caret", "aria-hidden": "true" }, "|"), typing && h("span", { class: "vn-ghost", "aria-hidden": "true" }, rich(ln.text, Infinity, shown))), tap));
      } else {
        const text = phase === "reply" && !reviewing ? typedText() : ln.text;   // "Review question" shows the question again
        const dialog = h("div", { class: ["vn-dialog glass gold", ln.card && "has-card"] }, corners(), nameplate(),
          // the untyped rest is laid out but invisible, so the box keeps its final size while the line types
          h("div", { class: "vn-text" }, rich(text, typing ? shown : Infinity), typing && h("span", { class: "vn-caret", "aria-hidden": "true" }, "|"), typing && h("span", { class: "vn-ghost", "aria-hidden": "true" }, rich(text, Infinity, shown))),
          // the card and the call to action show from the start (as in the mockups), so the box never jumps
          ln.card && itemCard(ln.card.id, ln.card.status),
          ln.cta && h("button", { class: "btn gold cta vn-cta", onClick: (e: Event) => { e.stopPropagation(); onCta(ln); } }, ln.cta.label),
          ln.cta?.action === "practice" && ln.practice && h("div", { class: "vn-note" }, `${c.get<any>(ln.practice.tech).name} casts ${practiceCasts} / ${ln.practice.count} · Practice restores HP; no loot`),
          tap);
        if (phase === "choices" || (phase === "reply" && reviewing)) {
          const chosen = phase === "reply" ? answers[answers.length - 1] : undefined;
          const list = (ln.choices ?? scene.choices ?? []);
          body.push(h("div", { class: "vn-bottom" }, dialog,
            h("div", { class: "vn-choices" }, list.map((ch, i) => h("button", { class: ["vn-choice glass", chosen === i && "picked"], disabled: chosen !== undefined, onClick: (e: Event) => { e.stopPropagation(); if (ln.choices) answer(i); else finish(i); } },
              h("span", { class: "vn-num" }, NUMERALS[i] ?? String(i + 1)), h("span", { class: "grow" }, ch.text), chosen === i ? icon("check", 16) : icon("chevron", 16))),
              chosen !== undefined && h("button", { class: "link-btn vn-review", onClick: (e: Event) => { e.stopPropagation(); reviewing = false; draw(); } }, "Back to the answer"))));
        } else if (phase === "reply") {
          body.push(h("div", { class: "vn-bottom" }, dialog,
            !typing && h("div", { class: "vn-answer glass" },
              h("div", { class: "vn-answer-l" }, "Your answer"),
              h("div", { class: "vn-answer-t" }, ln.choices![answers[answers.length - 1]!]!.text),
              h("button", { class: "link-btn vn-review", onClick: (e: Event) => { e.stopPropagation(); reviewing = true; draw(); } }, "Review question"),
              h("button", { class: "btn gold cta vn-cta", onClick: (e: Event) => { e.stopPropagation(); nextLine(); } }, ln.continue ?? "Continue ›"))));
        } else body.push(dialog);
      }
    }

    function nameplate() {
      if (!npc) return null;
      const em = npcId ? EMBLEM[npcId] : undefined;
      const title = cast?.title ?? npc.title;
      return h("div", { class: "vn-plate" },
        em ? h("span", { class: ["vn-plate-em", em.tone] }, icon(em.icon, 22)) : h("div", { class: "avatar", style: { backgroundImage: app.img(c.artAny(npc.id, "portrait", "full_body")) } }),
        h("div", { class: "vn-plate-band" },
          h("div", { class: "vn-plate-name" }, ln.speaker === "player" ? app.game.state.character.name : cast?.name ?? npc.name, " ", (cast?.cn ?? npc.name_cn) && h("span", { class: "cn" }, cast?.cn ?? npc.name_cn)),
          title && h("div", { class: "vn-plate-title" }, title)),
        affChip());
    }

    // Patched, not replaced: typing redraws every 22 ms and must not restart the figure's entrance.
    morph(root, h("div", { class: "vn-bg", style: { backgroundImage: app.img(c.art(scene.id, "cg")) } }), h("div", { class: ["vn-shade", !scene.figure && "painted"] }), topBar(), ...body);
    fitIntro();
  }

  /** The introduction block steps down (full → Chinese name in a row → name only → tag only) until it clears the
   *  dialogue, so short phones and large text never stack it under the box. Measured once per line and size. */
  let introFit = "", fitKey = "";
  function fitIntro() {
    const intro = root.querySelector<HTMLElement>(".vn-intro");
    const key = `${scene.id}|${line}|${phase}|${reviewing}|${innerWidth}x${innerHeight}|${document.documentElement.style.fontSize}`;
    if (!intro || key === fitKey) return;
    fitKey = key;
    const limit = Math.min(...[".vn-plate", ".vn-bottom", ".vn-dialog"].map((q) => root.querySelector(q)?.getBoundingClientRect().top ?? Infinity)) - 6;
    for (const f of ["", "tight", "tighter", "min"]) { introFit = f; intro.dataset.fit = f; if (intro.getBoundingClientRect().bottom <= limit) break; }
  }

  /** A method, technique or item shown in a lesson, with its status ("Manual acquired", "Studied", "Lesson ready"). */
  function itemCard(id: string, status: string) {
    const d = c.get<any>(id);
    const sub = id.startsWith("method.") ? `Cultivation ×${(d.qi_mult ?? 1).toFixed(1)} · ${d.grade ? `${d.grade[0].toUpperCase()}${d.grade.slice(1)}-grade` : "Method"}`
      : id.startsWith("tech.") ? [d.sp_cost ? `${d.sp_cost} SE` : "Free", d.cooldown ? `Cooldown ${d.cooldown} turn${d.cooldown > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ")
      : d.description;
    const art = c.art(id, "icon");
    return h("div", { class: "vn-item" },
      h("span", { class: "vn-item-art", style: art ? { backgroundImage: app.img(art) } : undefined }, !art && icon(id.startsWith("method.") ? "qi" : "sword", 20)),
      h("span", { class: "grow" }, h("b", null, d.name), h("span", null, sub)),
      h("span", { class: "vn-item-st" }, status));
  }

  root.addEventListener("click", () => {
    if (phase === "lines" || phase === "reply") { stopTimers(); advance(); }
    else if (phase === "card") goNext(pendingNext);
  });

  startLine();
  return { id: "story", nav: false, bg: () => c.art(scene.id, "cg"), render: () => root, onLeave: stopTimers };
}
