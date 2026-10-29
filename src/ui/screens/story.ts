/**
 * Visual novel player (mockup board "prologue"): full-screen CG, speaker art, dialogue window with nameplate,
 * narration box, choices, Auto / Skip / Log, new-character introductions, and an unlock card at the end of a
 * scene that grants something. Owns its DOM so typing animations survive shell re-renders.
 */
import { h, replaceChildren } from "../core/dom.ts";
import { icon } from "../core/icons.ts";
import type { Screen } from "../core/router.ts";
import type { App } from "../../app.ts";
import type { StoryScene, Npc } from "../../content/index.ts";
import { completeScene } from "../../engine/story.ts";

const NUMERALS = ["壹", "貳", "叁", "肆", "伍"];
const CHAPTER_TITLES: Record<string, string> = { prologue: "Prologue · The Path Begins", forest: "Chapter I · The Azure Bamboo Forest", tang: "Side Story · Tang's Caravan", regions: "Journey" };

interface LogLine { who: string; text: string }

export function storyScreen(app: App, startId: string, done: () => void): Screen {
  const c = app.content;
  let scene = c.get<StoryScene>(startId);
  let sceneIndex = 1;
  let line = 0, shown = 0, timer: number | undefined, autoTimer: number | undefined;
  let phase: "lines" | "choices" | "card" = "lines";
  let auto = false;
  const log: LogLine[] = [];
  const met = new Set<string>(Object.keys(app.game.state.relations));
  const reduce = () => app.settings.reducedMotion;
  const root = h("div", { class: "vn" });

  const speakerName = (sp: string) => sp === "narration" ? "" : sp === "player" ? app.game.state.character.name : c.get<Npc>(sp).name;
  const artFor = (sp: string, expr?: string) => {
    if (sp === "narration") return undefined;
    const npc = sp === "player" ? app.game.state.character.npc : sp;
    return (expr && c.art(npc, `expression_${expr}`)) || c.artAny(npc, "full_body", "portrait");
  };

  const stopTimers = () => { if (timer) clearInterval(timer); if (autoTimer) clearTimeout(autoTimer); timer = autoTimer = undefined; };

  function startLine() {
    stopTimers();
    const ln = scene.lines[line]!;
    log.push({ who: speakerName(ln.speaker) || "Narration", text: ln.text });
    shown = reduce() ? ln.text.length : 0;
    if (!reduce()) timer = window.setInterval(() => { shown += 2; if (shown >= ln.text.length) { shown = ln.text.length; clearInterval(timer); timer = undefined; scheduleAuto(); } draw(); }, 22);
    else scheduleAuto();
    draw();
  }
  function scheduleAuto() {
    if (!auto || phase !== "lines") return;
    autoTimer = window.setTimeout(() => advance(), 1400 + scene.lines[line]!.text.length * 18);
  }

  function advance() {
    if (phase !== "lines") return;
    const ln = scene.lines[line]!;
    if (shown < ln.text.length) { shown = ln.text.length; stopTimers(); scheduleAuto(); draw(); return; }
    if (ln.speaker !== "narration" && ln.speaker !== "player") met.add(ln.speaker);
    if (line + 1 < scene.lines.length) { line++; startLine(); return; }
    endLines();
  }

  function endLines() {
    stopTimers();
    if (scene.choices?.length) { phase = "choices"; draw(); return; }
    finish(null);
  }

  function finish(choice: number | null) {
    const r = app.game.run("story", app.now(), (s, ct) => completeScene(s, ct, scene.id, choice, app.now()));
    if (!r.ok) { app.router.toast(r.reason, "bad"); return; }
    if (choice !== null) log.push({ who: app.game.state.character.name, text: scene.choices![choice]!.text });
    const grants = scene.unlocks.filter((u) => c.has(u));
    if (grants.length && phase !== "card") { phase = "card"; pendingNext = r.next; draw(); return; }
    goNext(r.next);
  }
  let pendingNext: string | undefined;

  function goNext(next?: string) {
    if (next) { scene = c.get<StoryScene>(next); sceneIndex++; line = 0; phase = "lines"; startLine(); }
    else { stopTimers(); done(); }
  }

  function skip() {
    if (!scene.skippable) return;
    stopTimers();
    for (let i = line; i < scene.lines.length; i++) if (i > line || shown < scene.lines[i]!.text.length) log.push({ who: speakerName(scene.lines[i]!.speaker) || "Narration", text: scene.lines[i]!.text });
    line = scene.lines.length - 1; shown = scene.lines[line]!.text.length;
    endLines();
  }

  function openLog() {
    app.router.open({ id: "vn-log", kind: "sheet", render: () => h("div", null,
      h("div", { class: "sec-h" }, h("h3", null, "Dialogue history"), h("span", { class: "hint" }, `${log.length} lines`)),
      h("div", { class: "rows" }, log.map((l) => h("div", { class: "setrow", style: { display: "block" } }, h("div", { class: "lbl gold-t" }, l.who), h("div", { class: "dim", style: { fontSize: "13px" } }, l.text))))) });
  }

  function topBar() {
    return h("div", { class: "vn-top glass" },
      h("div", { class: "vn-emblem" }, icon("scroll", 18)),
      h("div", { class: "grow" }, h("div", { class: "vn-chapter" }, CHAPTER_TITLES[scene.chapter] ?? scene.chapter), h("div", { class: "muted" }, `Scene ${sceneIndex} · ${scene.name}`)),
      h("button", { class: ["vn-chip", auto && "on"], onClick: (e: Event) => { e.stopPropagation(); auto = !auto; if (auto) scheduleAuto(); else stopTimers(); draw(); } }, icon("play", 10), "Auto"),
      scene.skippable && h("button", { class: "vn-chip", onClick: (e: Event) => { e.stopPropagation(); skip(); } }, icon("skip", 12), "Skip"),
      h("button", { class: "vn-chip", onClick: (e: Event) => { e.stopPropagation(); openLog(); } }, icon("log", 12), "Log"));
  }

  function draw() {
    const ln = scene.lines[Math.min(line, scene.lines.length - 1)]!;
    const npcId = ln.speaker === "narration" ? undefined : ln.speaker === "player" ? app.game.state.character.npc : ln.speaker;
    const npc = npcId ? c.get<Npc>(npcId) : undefined;
    const isNew = !!npc && ln.speaker !== "player" && !met.has(ln.speaker) && phase === "lines";
    const art = artFor(ln.speaker, ln.expression);
    const text = phase === "lines" ? ln.text.slice(0, shown) : ln.text;
    const typing = phase === "lines" && shown < ln.text.length;
    const rel = npc ? app.game.state.relations[npc.id] : undefined;
    const levels = npc?.affinity_levels ?? [];
    const level = levels.filter((l: any) => (rel?.affinity ?? 0) >= l.threshold).pop();

    const body: any[] = [];
    if (phase === "card") {
      const grants = scene.unlocks.filter((u) => c.has(u)).map((u) => c.get<any>(u));
      body.push(h("div", { class: "vn-card" },
        ...(() => {
          const m = /^Welcome to (the )?(.+)$/.exec(scene.name);
          return [h("div", { class: "vn-card-pre" }, m ? `Welcome to ${m[1] ?? ""}`.trim() : "Unlocked"), h("div", { class: "vn-card-title" }, m ? m[2] : scene.name)];
        })(),
        scene.name_cn && h("div", { class: "cn vn-card-cn" }, scene.name_cn.split("").join(" ")),
        h("div", { class: "vn-seal" }, icon("qi", 54)),
        scene.chapter === "prologue" && h("div", { class: "vn-ribbon" }, h("div", { class: "vn-ribbon-pre" }, "✦ Rank granted ✦"), h("div", { class: "vn-ribbon-t" }, c.get<any>(app.game.state.character.rank).name)),
        h("div", { class: "dim center", style: { fontSize: "12.5px", margin: "10px 0" } }, scene.lines[0]!.text),
        h("div", { class: "row", style: { justifyContent: "center", flexWrap: "wrap", gap: "8px" } }, grants.map((g) => h("div", { class: "vn-grant" },
          h("span", { class: "vn-grant-i" }, icon(g.id.startsWith("method.") ? "qi" : g.id.startsWith("sectloc.") ? "temple" : "scroll", 15)),
          h("span", null, h("span", { class: "muted up" }, g.id.startsWith("method.") ? "Method granted" : g.id.startsWith("sectloc.") ? "New area" : "Received"), h("b", null, g.name))))),
        h("div", { class: "vn-tap" }, "Tap to continue")));
    } else {
      if (art) body.push(h("div", { class: ["vn-figure", isNew && "intro"], style: { backgroundImage: app.img(art) } }));
      if (isNew && npc) body.push(h("div", { class: "vn-intro" },
        h("span", { class: "tag gold" }, "✦ New character"),
        npc.name_cn && h("div", { class: "vn-intro-cn" }, npc.name_cn.split("").map((ch: string) => h("span", null, ch))),
        h("div", { class: "vn-intro-name" }, npc.name), npc.title && h("div", { class: "vn-intro-title" }, npc.title),
        h("div", { class: "row", style: { gap: "4px", marginTop: "6px" } }, (npc.elements ?? []).map((e: string) => h("span", { class: "tag" }, c.get<any>(e).name)))));
      if (scene.choices?.length) body.push(h("div", { class: "vn-titlecard" }, scene.name_cn && h("div", { class: "cn" }, scene.name_cn), h("div", { class: "t" }, scene.name)));
      if (phase === "choices") {
        body.push(h("div", { class: "vn-bottom" },
          h("div", { class: "vn-dialog glass gold" }, nameplate(), h("div", { class: "vn-text" }, ln.text)),
          h("div", { class: "vn-choices" }, scene.choices!.map((ch, i) => h("button", { class: "vn-choice glass", onClick: (e: Event) => { e.stopPropagation(); finish(i); } },
            h("span", { class: "vn-num" }, NUMERALS[i] ?? String(i + 1)), h("span", { class: "grow" }, ch.text), icon("chevron", 16))),
            h("div", { class: "vn-tap" }, "✦ Choose your answer · every path is heard ✦"))));
      } else if (ln.speaker === "narration") {
        body.push(h("div", { class: "vn-narr glass gold" }, h("div", { class: "vn-narr-lbl" }, "Narration"), h("div", { class: "vn-narr-text" }, text, typing && h("span", { class: "vn-caret" }, "|")), !typing && h("div", { class: "vn-next" }, icon("chevron", 14))));
      } else {
        body.push(h("div", { class: "vn-dialog glass gold" }, nameplate(), h("div", { class: "vn-text" }, text, typing && h("span", { class: "vn-caret" }, "|")), !typing && h("div", { class: "vn-next" }, icon("chevron", 14))));
      }
    }

    function nameplate() {
      if (!npc) return null;
      return h("div", { class: "vn-plate" },
        h("div", { class: "avatar", style: { backgroundImage: app.img(c.artAny(npc.id, "portrait", "full_body")) } }),
        h("div", { class: "vn-plate-band" }, h("div", { class: "vn-plate-name" }, ln.speaker === "player" ? app.game.state.character.name : npc.name, npc.name_cn && h("span", { class: "cn" }, ` ${npc.name_cn}`)), npc.title && h("div", { class: "vn-plate-title" }, npc.title)),
        ln.speaker !== "player" && level && h("span", { class: "vn-aff" }, "♥ ", level.name));
    }

    replaceChildren(root, h("div", { class: "vn-bg", style: { backgroundImage: app.img(c.art(scene.id, "cg")) } }), h("div", { class: "vn-shade" }), topBar(), ...body);
  }

  root.addEventListener("click", () => {
    if (phase === "lines") { stopTimers(); advance(); }
    else if (phase === "card") goNext(pendingNext);
  });

  startLine();
  return { id: "story", nav: false, bg: () => c.art(scene.id, "cg"), render: () => root, onLeave: stopTimers };
}
