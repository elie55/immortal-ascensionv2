/** Main menu, save slots and settings (mockup board "systems": main_menu, save_slots, settings). */
import { h, fmt } from "../core/dom.ts";
import { icon } from "../core/icons.ts";
import { header, subbar, section, toggle, seg, slider, setrow } from "../core/kit.ts";
import type { Screen } from "../core/router.ts";
import type { App } from "../../app.ts";
import { VERSION } from "../../app.ts";
import { SLOT_COUNT, type SlotSummary } from "../../save/slots.ts";

const realmLine = (app: App, s: SlotSummary) => `${app.content.get<any>(s.realm).name} ${s.stage} · ${app.content.get<any>(s.rank).name}`;
const lastSaved = (t: number, now: number) => {
  const d = new Date(t), n = new Date(now);
  const hm = d.toTimeString().slice(0, 5);
  if (d.toDateString() === n.toDateString()) return `Today ${hm}`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

export function mainMenuScreen(app: App): Screen {
  return {
    id: "menu", nav: false, bg: () => app.ui("ui.main_menu", "key_art"),
    render: () => {
      const last = app.settings.lastSlot;
      const cont = last !== null ? app.slots[last] : Object.values(app.slots).sort((a, b) => b.savedAt - a.savedAt)[0];
      const firstEmpty = [...Array(SLOT_COUNT).keys()].find((i) => !app.slots[i]);
      return h("div", { class: "menu" },
        h("div", { class: "menu-title" },
          h("div", { class: "cn menu-cn" }, "飞 升 仙 途"),
          h("div", { class: "menu-t1" }, "Immortal"),
          h("div", { class: "menu-t2" }, "Ascension"),
          h("div", { class: "menu-tag" }, "A cultivation journey")),
        h("div", { class: "menu-actions" },
          cont
            ? h("button", { class: "btn gold block menu-continue", onClick: () => app.continueSlot(cont.slot) },
                h("span", { class: "avatar", style: { backgroundImage: app.img(app.content.artAny(cont.npc, "portrait", "full_body")) } }),
                h("span", { class: "grow", style: { textAlign: "left" } }, h("span", { class: "mc-t" }, "Continue"), h("span", { class: "mc-s" }, `Slot ${cont.slot + 1} · ${cont.name} · ${realmLine(app, cont)}`)),
                icon("play", 18))
            : h("button", { class: "btn gold block menu-continue", onClick: () => app.newJourney(0) }, h("span", { class: "grow center mc-t" }, "Begin your journey"), icon("play", 18)),
          cont && h("button", { class: "btn block", onClick: () => (firstEmpty !== undefined ? confirmNew(app, firstEmpty) : app.router.pushGlobal(saveSlotsScreen(app, "Menu"))) }, icon("plus", 16), "New Journey"),
          h("div", { class: "grid-2" },
            h("button", { class: "btn", onClick: () => app.router.pushGlobal(saveSlotsScreen(app, "Menu")) }, icon("save", 16), "Save Slots"),
            h("button", { class: "btn", onClick: () => app.router.pushGlobal(settingsScreen(app, "Menu")) }, icon("gear", 16), "Settings")),
          h("div", { class: "menu-foot" },
            h("div", { class: "row", style: { justifyContent: "center", gap: "6px" } }, h("span", { class: "tag" }, "Fully offline"), h("span", { class: "tag" }, "No stamina"), h("span", { class: "tag" }, "No purchases")),
            h("div", { class: "muted center" }, `Version ${VERSION} · Your saves stay on this phone`))));
    },
  };
}

function confirmNew(app: App, slot: number) {
  app.router.open({
    id: "confirm-new", kind: "modal",
    render: (close) => h("div", null,
      h("div", { class: "m-title" }, "New Journey"),
      h("div", { class: "m-sub" }, `A new journey begins in Slot ${slot + 1}. Your other saves are kept.`),
      h("div", { class: "grid-2" }, h("button", { class: "btn", onClick: close }, "Cancel"), h("button", { class: "btn gold", onClick: () => { close(); void app.newJourney(slot); } }, "Begin"))),
  });
}

function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function pickFile(onText: (t: string) => void) {
  const input = h("input", { type: "file", accept: ".iasave,.json,application/json" }) as HTMLInputElement;
  input.addEventListener("change", async () => { const f = input.files?.[0]; if (f) onText(await f.text()); });
  input.click();
}

export function saveSlotsScreen(app: App, backTo: string): Screen {
  return {
    id: "save-slots", nav: app.inGame, bg: () => app.ui("ui.backdrop", "night"),
    render: () => {
      const now = app.now();
      const doExport = async (slot: number) => {
        const t = await app.saves.exportSlot(slot);
        if (t) { download(`immortal-ascension-slot${slot + 1}.iasave`, t); app.router.toast("Save exported", "good"); }
      };
      const doImport = (slot: number) => pickFile(async (text) => {
        const r = await app.saves.importSlot(slot, text, app.now());
        await app.refreshSlots();
        app.router.toast(r.ok ? `Imported into Slot ${slot + 1}` : `Import failed: ${r.empty ? "empty" : r.reason}`, r.ok ? "good" : "bad");
        app.router.refresh();
      });
      const cards = [...Array(SLOT_COUNT).keys()].map((i) => {
        const s = app.slots[i];
        const playing = app.inGame && app.slot === i;
        if (!s) return h("div", { class: "glass panel slot empty" },
          h("div", { class: "row" },
            h("div", { class: "slot-plus" }, icon("plus", 22)),
            h("div", { class: "grow" }, h("div", { class: "muted up" }, `Slot ${i + 1}`), h("div", { class: "slot-name" }, "Empty"), h("div", { class: "muted" }, "Start a new journey or import a save here")),
            h("div", { class: "stack", style: { gap: "6px" } },
              h("button", { class: "btn gold sm", onClick: () => confirmNew(app, i) }, "New Journey"),
              h("button", { class: "btn sm ghost", onClick: () => doImport(i) }, "Import here"))));
        return h("div", { class: ["glass panel slot", playing && "hi"] },
          h("div", { class: "row" },
            h("div", { class: "avatar lg", style: { backgroundImage: app.img(app.content.artAny(s.npc, "portrait", "full_body")) } }),
            h("div", { class: "grow" },
              h("div", { class: "muted up" }, `Slot ${i + 1}${playing ? " · Playing now" : ""}`),
              h("div", { class: "slot-name" }, s.name),
              h("div", { class: "dim", style: { fontSize: "calc(11.5rem / 15)" } }, realmLine(app, s))),
            app.backups[i] && h("span", { class: "tag" }, icon("shield", 11), "Backup OK")),
          h("div", { class: "grid-3 slot-stats" },
            h("div", null, h("span", null, "Sect Fame"), h("b", null, fmt.int(s.sectFame ?? 0))),
            h("div", null, h("span", null, "Play Time"), h("b", null, fmt.duration(s.playtimeMs))),
            h("div", null, h("span", null, "Last Saved"), h("b", null, lastSaved(s.savedAt, now)))),
          playing
            ? h("div", { class: "grid-2" }, h("button", { class: "btn jade", onClick: () => app.save() }, icon("save", 15), "Save here"), h("button", { class: "btn", onClick: () => doExport(i) }, icon("export", 15), "Export file"))
            : h("div", { class: "row" },
                h("button", { class: "btn grow", onClick: () => app.continueSlot(i) }, icon("play", 13), "Load"),
                h("button", { class: "btn grow", onClick: () => doExport(i) }, icon("export", 15), "Export file"),
                h("button", { class: "icon-btn", "aria-label": "Delete", onClick: () => app.router.open({
                  id: "confirm-del", kind: "modal",
                  render: (close) => h("div", null, h("div", { class: "m-title" }, `Delete Slot ${i + 1}?`), h("div", { class: "m-sub" }, `${s.name} · ${realmLine(app, s)}. This cannot be undone.`),
                    h("div", { class: "grid-2" }, h("button", { class: "btn", onClick: close }, "Keep"), h("button", { class: "btn", style: { borderColor: "var(--red)" }, onClick: async () => { close(); await app.saves.delete(i); await app.refreshSlots(); app.router.refresh(); app.router.toast(`Slot ${i + 1} deleted`); } }, "Delete"))),
                }) }, icon("trash", 16))));
      });
      return h("div", { class: "stack" },
        app.inGame && header(app),
        subbar({ title: "Save Slots", cn: "存档", sub: `${SLOT_COUNT} slots · each one keeps a backup`, backTo, onBack: () => app.router.back() }),
        ...cards,
        section("Files & Safety", "Saves never leave your phone unless you export them",
          h("div", { class: "rows" },
            h("button", { class: "setrow", onClick: () => { const free = [...Array(SLOT_COUNT).keys()].find((k) => !app.slots[k]); if (free === undefined) app.router.toast("All slots are used: delete one first", "bad"); else doImport(free); } },
              icon("import", 18), h("div", { class: "grow", style: { textAlign: "left" } }, h("div", { class: "lbl" }, "Import a save file"), h("div", { class: "desc" }, "Load an .iasave file into the first empty slot")), icon("chevron", 16)),
            setrow("shield", "Automatic backup", "If a save is damaged, the backup is restored for you", h("span", { class: "tag jade" }, "On")),
            setrow("update", "Survives game updates", "Older saves are upgraded automatically", h("span", { class: "tag" }, "v1")))));
    },
  };
}

export function settingsScreen(app: App, backTo: string): Screen {
  return {
    id: "settings", nav: app.inGame, bg: () => app.ui("ui.backdrop", "night"),
    render: () => {
      const st = app.settings;
      const set = (patch: Partial<typeof st>) => void app.setSettings(patch);
      return h("div", { class: "stack" },
        app.inGame && header(app),
        subbar({ title: "Settings", cn: "设置", sub: "Saved on this phone · no account needed", backTo, onBack: () => app.router.back() }),
        section("Audio", "Music and effects are separate",
          h("div", { class: "rows" },
            setrow("music", "Music", null, h("div", { class: "row", style: { width: "55%" } }, slider(st.musicVolume, (v) => set({ musicVolume: v }), "Music volume"), h("span", { class: "muted tnum", style: { width: "32px" } }, `${Math.round(st.musicVolume * 100)}%`))),
            setrow("speaker", "Sound Effects", null, h("div", { class: "row", style: { width: "55%" } }, slider(st.sfxVolume, (v) => set({ sfxVolume: v }), "Sound effects volume"), h("span", { class: "muted tnum", style: { width: "32px" } }, `${Math.round(st.sfxVolume * 100)}%`))))),
        section("Battle", "Defaults for new battles",
          h("div", { class: "rows" },
            setrow("fast", "Default speed", "You can change it in any battle", seg(st.battleSpeed, [{ value: 1, label: "1×" }, { value: 2, label: "2×" }, { value: 3, label: "3×" }], (v) => set({ battleSpeed: v as 1 | 2 | 3 }))),
            setrow("auto", "Start in Auto mode", "Techniques follow your priority list", toggle(st.autoBattle, (v) => set({ autoBattle: v }), "Auto battle")),
            setrow("numbers", "Damage numbers", null, toggle(st.damageNumbers, (v) => set({ damageNumbers: v }), "Damage numbers")),
            setrow("shake", "Screen shake on big hits", "With a short vibration on phones", toggle(st.screenShake, (v) => set({ screenShake: v }), "Screen shake")),
            setrow("sparkle", "Animation quality", "Lower saves battery", seg(st.animationQuality, [{ value: "low", label: "Low" }, { value: "medium", label: "Med" }, { value: "high", label: "High" }], (v) => set({ animationQuality: v as any }))))),
        section("Display & Accessibility", null,
          h("div", { class: "rows" },
            setrow("text", "Text size", null, seg(st.textSize, [{ value: "normal", label: "M" }, { value: "large", label: "L" }], (v) => set({ textSize: v as any }))),
            setrow("motion", "Reduce motion", "Calmer effects, no flashing lightning", toggle(st.reducedMotion, (v) => set({ reducedMotion: v }), "Reduce motion")),
            setrow("globe", "Language", null, h("span", { class: "dim", style: { fontSize: "calc(12rem / 15)" } }, "English")))),
        section("Save & Data", app.inGame ? "Autosaves every 30 seconds and after important moments" : null,
          h("div", { class: "row" },
            app.inGame && h("button", { class: "btn grow", onClick: () => app.save() }, icon("save", 15), "Save now"),
            h("button", { class: "btn jade grow", onClick: () => (app.inGame ? app.router.push(saveSlotsScreen(app, "Settings")) : app.router.pushGlobal(saveSlotsScreen(app, "Settings"))) }, "Save slots")),
          app.inGame && h("button", { class: "btn block ghost", style: { marginTop: "8px" }, onClick: () => app.toMenu() }, "Return to main menu")),
        h("div", { class: "muted center", style: { padding: "4px 0 8px" } }, `Immortal Ascension ${VERSION} · Fully offline · No ads · No purchases`));
    },
  };
}
