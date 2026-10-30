/**
 * Character → Techniques: cultivation method, 4 active slots, 2 passives and the ultimate, chosen from what
 * you know (mastery shown). Auto-battle (mockup "auto_battle"): presets, the priority list of rules (move up
 * and down, enable, edit condition / threshold / target, delete, add), Auto toggle, reset to the default.
 */
import { h, fmt } from "../core/dom.ts";
import { icon } from "../core/icons.ts";
import { header, subbar, section, seg, toggle, bar } from "../core/kit.ts";
import type { Screen } from "../core/router.ts";
import type { App } from "../../app.ts";
import { setLoadout, switchMethod } from "../../engine/actions.ts";
import { masteryLevel } from "../../engine/stats.ts";
import { defaultCombat } from "../../engine/state.ts";
import { techLine } from "./shop.ts";

const curve = (d: any) => d.mastery ?? { max_level: 10, xp_per_level: 100, per_level_bonus: 0.03 };

/** Techniques (UI review S6): the loadout as a skill bar — four active sockets, two passive and the ultimate, each
 *  with its painted art inside a mastery ring and its element — then the cultivation method. */
export function techniquesScreen(app: App, backTo: string): Screen {
  return {
    id: "techniques",
    render: () => {
      const s = app.game.state, c = app.content;
      const method = c.get<any>(s.character.method);
      const methods = Object.keys(s.character.methodMastery);
      const socket = (kind: "actives" | "passives" | "ultimate", i: number, id: string | null) => {
        const t = id ? c.get<any>(id) : null;
        const art = id ? c.art(id, "icon") : undefined;
        const cv = t ? curve(t) : null;
        const xp = id ? s.techniques.known[id] ?? 0 : 0;
        const lv = t ? masteryLevel(xp, cv) : 0;
        const p = t && cv ? (lv >= cv.max_level ? 1 : (xp % cv.xp_per_level) / cv.xp_per_level) : 0;
        const el = t?.element ? c.find<any>(t.element) : null;
        const empty = kind === "ultimate" ? "Ultimate" : kind === "passives" ? `Passive ${i + 1}` : `Active ${i + 1}`;
        return h("button", { class: ["sk", kind, !t && "empty"], "aria-label": t ? `${t.name}, mastery ${lv}: change` : `${empty}: choose a technique`, onClick: () => pickSheet(app, kind, i) },
          h("span", { class: "sk-ring", style: { "--p": String(Math.round(p * 100)), "--el": el?.color ?? "#7fd0ff" } as any },
            h("span", { class: "sk-art", style: art ? { backgroundImage: app.img(art) } : undefined }, !art && icon(t ? (kind === "passives" ? "shield" : kind === "ultimate" ? "bolt" : "sword") : "plus", t ? 20 : 14)),
            t && h("span", { class: "sk-lv" }, `M${lv}`),
            el && h("span", { class: "sk-el", style: { background: el.color }, title: el.name })),
          h("span", { class: "sk-name" }, t ? t.name : empty),
          t && kind !== "passives" && h("span", { class: "sk-sub" }, [t.sp_cost ? `${t.sp_cost} SP` : kind === "ultimate" ? "Charged" : "Free", t.cooldown ? `CD ${t.cooldown}` : ""].filter(Boolean).join(" · ")));
      };
      const used = s.techniques.actives.filter(Boolean).length + s.techniques.passives.filter(Boolean).length + (s.techniques.ultimate ? 1 : 0);
      return [
        header(app),
        subbar({ help: { app, key: "techniques" }, title: "Techniques", cn: "功法", sub: `${Object.keys(s.techniques.known).length} known · ${used} / 7 equipped`, backTo, onBack: () => app.router.back(),
          end: h("button", { class: "btn gold sm", onClick: () => app.router.push(autoBattleScreen(app, "Techniques")) }, icon("auto", 13), "Auto-battle") }),
        h("section", { class: "glass panel hero-frame loadout" },
          h("div", { class: "sec-h" }, h("h3", null, "Loadout"), h("span", { class: "hint" }, "Tap a socket to change it")),
          h("div", { class: "sk-cap" }, "Active · used by your auto rules"),
          h("div", { class: "sk-bar four" }, s.techniques.actives.map((id, i) => socket("actives", i, id))),
          h("div", { class: "orn-div" }),
          h("div", { class: "sk-low" },
            h("div", null, h("div", { class: "sk-cap" }, "Passive · always on"), h("div", { class: "sk-bar two" }, s.techniques.passives.map((id, i) => socket("passives", i, id)))),
            h("div", { class: "sk-ultcol" }, h("div", { class: "sk-cap" }, "Ultimate"), socket("ultimate", 0, s.techniques.ultimate)))),
        section("Cultivation method", `${methods.length} learned`,
          h("div", { class: "rows" }, methods.map((m) => {
            const d = c.get<any>(m);
            const on = m === method.id;
            const xp = s.character.methodMastery[m] ?? 0, cv = curve(d);
            return h("div", { class: ["setrow", on && "on"] }, icon("qi", 18),
              h("div", { class: "grow" }, h("div", { class: "lbl" }, d.name), h("div", { class: "desc" }, `Qi ×${d.qi_mult} · Mastery ${masteryLevel(xp, cv)}/${cv.max_level}`), h("div", { style: { marginTop: "4px" } }, bar((xp % cv.xp_per_level) / cv.xp_per_level, { cls: "thin jade" }))),
              on ? h("span", { class: "tag jade" }, "Active") : h("button", { class: "btn sm", onClick: () => { const r = app.game.run("method", app.now(), (st, cc) => switchMethod(st, cc, m)); app.router.toast(r.ok ? `Now cultivating ${d.name}` : r.reason, r.ok ? "good" : "bad"); } }, "Switch"));
          }))),
        h("div", { class: "dim center note-pill" }, "Learn more at the Scripture Pavilion, from manuals and from tournaments."),
      ];
    },
  };
}

function pickSheet(app: App, kind: "actives" | "passives" | "ultimate", index: number) {
  app.router.open({ id: "tech-pick", kind: "sheet", render: (close) => {
    const s = app.game.state, c = app.content;
    const want = kind === "actives" ? "active" : kind === "passives" ? "passive" : "ultimate";
    const known = Object.keys(s.techniques.known).filter((id) => c.find<any>(id)?.kind === want);
    const cur = kind === "ultimate" ? s.techniques.ultimate : s.techniques[kind][index];
    const set = (id: string | null) => { const r = app.game.run("loadout", app.now(), (st, cc) => setLoadout(st, cc, kind, index, id)); if (!r.ok) app.router.toast(r.reason, "bad"); close(); };
    return h("div", { class: "stack" },
      h("div", { class: "sec-h" }, h("h3", null, kind === "ultimate" ? "Ultimate" : `${want[0]!.toUpperCase()}${want.slice(1)} slot ${index + 1}`), h("span", { class: "hint" }, `${known.length} known`)),
      known.length ? h("div", { class: "rows" }, known.map((id) => {
        const t = c.get<any>(id);
        const where = kind === "ultimate" ? -1 : s.techniques[kind].indexOf(id);
        return h("button", { class: ["setrow", id === cur && "on"], onClick: () => set(id) }, icon(want === "passive" ? "shield" : want === "ultimate" ? "bolt" : "sword", 16),
          h("div", { class: "grow", style: { textAlign: "left" } }, h("div", { class: "lbl" }, t.name, " ", h("span", { class: "muted" }, `· Mastery ${masteryLevel(s.techniques.known[id] ?? 0, curve(t))}`)), h("div", { class: "desc" }, techLine(app, t))),
          where >= 0 && where !== index ? h("span", { class: "tag" }, `Slot ${where + 1}`) : id === cur ? h("span", { class: "tag jade" }, "Equipped") : null);
      })) : h("div", { class: "muted center" }, "You know no techniques of this kind yet."),
      cur && h("button", { class: "btn ghost block", onClick: () => set(null) }, "Clear slot"));
  } });
}

// ---------- auto-battle ----------

const WHEN: { v: string; label: string; value?: [number, number, number] }[] = [
  { v: "always", label: "Always" }, { v: "hp_below", label: "My HP below", value: [10, 90, 50] }, { v: "sp_above", label: "SP above", value: [10, 90, 50] },
  { v: "no_shield", label: "No shield" }, { v: "boss_only", label: "Boss fights" }, { v: "enemies_at_least", label: "Enemies ≥", value: [2, 5, 2] },
  { v: "big_attack", label: "Big attack coming" },
];
const TARGET: { v: string; label: string }[] = [
  { v: "default", label: "Default" }, { v: "lowest_hp", label: "Lowest HP" }, { v: "highest_cp", label: "Strongest CP" }, { v: "weakest", label: "Weakest" }, { v: "strongest", label: "Toughest" },
];
const ROLE: Record<string, { label: string; icon: string; desc: string }> = {
  ultimate: { label: "Ultimate", icon: "bolt", desc: "Your ultimate when charged" }, heal: { label: "Best heal", icon: "lotus", desc: "Strongest healing technique ready" },
  shield: { label: "Shield", icon: "shield", desc: "Any shield technique ready" }, damage: { label: "Strongest attack", icon: "sword", desc: "Highest-damage technique ready" },
  debuff: { label: "Debuff", icon: "warning", desc: "A technique that weakens the target" }, basic: { label: "Basic attack", icon: "sword", desc: "Free, restores SP" }, beast: { label: "Beast ability", icon: "paw", desc: "Your companion's skill" },
};

function ruleLabel(app: App, slot: string): { label: string; icon: string; desc: string; art?: string } {
  const s = app.game.state, c = app.content;
  const m = /^a(\d)$/.exec(slot);
  if (m) { const id = s.techniques.actives[Number(m[1])]; return id ? { label: c.get<any>(id).name, icon: "sword", desc: `Active slot ${Number(m[1]) + 1}`, art: c.art(id, "icon") } : { label: `Active slot ${Number(m[1]) + 1}`, icon: "sword", desc: "Empty slot" }; }
  if (slot === "ultimate" && s.techniques.ultimate) return { label: c.get<any>(s.techniques.ultimate).name, icon: "bolt", desc: "Ultimate · when charged", art: c.art(s.techniques.ultimate, "icon") };
  // role rules show the equipped technique that currently answers them
  const eq = s.techniques.actives.filter((x): x is string => !!x).map((id) => c.get<any>(id));
  const pick = slot === "heal" ? eq.filter((t) => t.heal_pct).sort((a, b) => b.heal_pct - a.heal_pct)[0] : slot === "shield" ? eq.find((t) => t.shield_pct_max_hp) : slot === "damage" ? eq.filter((t) => t.power > 0).sort((a, b) => b.power * b.hits - a.power * a.hits)[0] : undefined;
  const r = ROLE[slot] ?? { label: slot, icon: "sword", desc: "" };
  return pick ? { ...r, art: c.art(pick.id, "icon"), desc: `${r.desc} · now ${pick.name}` } : r;
}

function whenText(r: { when: string; value?: number }): string {
  const w = WHEN.find((x) => x.v === r.when);
  if (r.when === "never") return "Disabled";
  if (!w) return r.when;
  return w.value ? `${w.label} ${r.value ?? w.value[2]}${r.when === "enemies_at_least" ? "" : "%"}` : w.label;
}

export function autoBattleScreen(app: App, backTo: string): Screen {
  let open: number | null = null;
  const mutate = (fn: (rules: any[], st: any) => void) => app.game.run("auto", app.now(), (st) => { const p = st.combat.presets[st.combat.active]!; fn(p.rules, st); return { ok: true, events: [] }; }, true);
  /** Copies the active preset's rules into another preset (made if missing, three at most). */
  const copyTo = (name: string) => {
    const r = app.game.run("preset", app.now(), (st) => {
      const src = st.combat.presets[st.combat.active]!;
      let k = st.combat.presets.findIndex((p) => p.name === name);
      if (k < 0) { if (st.combat.presets.length >= 3) return { ok: false, reason: "Three presets at most" }; st.combat.presets.push({ name, rules: [] }); k = st.combat.presets.length - 1; }
      st.combat.presets[k]!.rules = src.rules.map((x) => ({ ...x }));
      return { ok: true, events: [] };
    });
    app.router.toast(r.ok ? `Copied to ${name}` : (r as any).reason, r.ok ? "good" : "bad");
  };
  return {
    id: "auto",
    render: () => {
      const s = app.game.state;
      const preset = s.combat.presets[s.combat.active] ?? s.combat.presets[0]!;
      const rules = preset.rules;
      return [
        header(app),
        subbar({ help: { app, key: "autobattle" }, title: "Auto-Battle", cn: "自动战斗", sub: "Highest ready rule fires first", backTo, onBack: () => app.router.back() }),
        h("div", { class: "row between glass", style: { padding: "5px 8px", borderRadius: "999px" } },
          seg(s.combat.active, s.combat.presets.map((p, i) => ({ value: i, label: p.name })), (v) => { app.game.run("preset", app.now(), (st) => { st.combat.active = v; return { ok: true, events: [] }; }); open = null; }),
          s.combat.presets.length < 3 && h("button", { class: "icon-btn", "aria-label": "New preset", onClick: () => { app.game.run("preset", app.now(), (st) => { const names = ["Balanced", "Boss", "Farming"]; const name = names.find((n) => !st.combat.presets.some((p) => p.name === n)) ?? `Preset ${st.combat.presets.length + 1}`; st.combat.presets.push({ name, rules: preset.rules.map((r) => ({ ...r })) }); st.combat.active = st.combat.presets.length - 1; return { ok: true, events: [] }; }); app.router.toast("Preset copied — edit it for its purpose", "good"); } }, icon("plus", 14)),
          h("div", { class: "row", style: { gap: "6px" } }, h("span", { class: "dim" }, "Auto"), toggle(!s.combat.manual, (v) => app.game.run("manual", app.now(), (st) => { st.combat.manual = !v; return { ok: true, events: [] }; })))),
        section("Technique priority", `${rules.filter((r) => r.when !== "never").length} / ${rules.length} active`,
          h("div", { class: "rule-list" }, rules.map((r, i) => {
            const L = ruleLabel(app, r.slot);
            const on = r.when !== "never";
            return h("div", { class: ["glass rule", open === i && "open", !on && "off"] },
              h("div", { class: "rule-row" },
                h("span", { class: "rule-n" }, String(i + 1)),
                h("button", { class: "grow rule-main", "aria-expanded": open === i ? "true" : "false", onClick: () => { open = open === i ? null : i; app.router.refresh(); } },
                  L.art ? h("span", { class: "tech-ico", style: { backgroundImage: app.img(L.art) } }) : h("span", { class: "tech-ico" }, icon(L.icon, 16)),
                  h("span", { class: "rule-txt" }, h("span", { class: "lbl" }, L.label), h("span", { class: "desc" }, h("span", { class: ["rule-when", r.when !== "always" && r.when !== "never" && "cond"] }, whenText(r)), r.target !== "default" ? ` · ${TARGET.find((t) => t.v === r.target)?.label}` : ""))),
                toggle(on, (v) => mutate((rs) => { rs[i].when = v ? "always" : "never"; delete rs[i].value; }), "Enable rule")),
              open === i && h("div", { class: "rule-edit" },
                h("div", { class: "row rule-order" }, h("span", { class: "muted up grow" }, `Priority ${i + 1} of ${rules.length}`),
                  h("button", { class: "btn sm ghost", disabled: i === 0, onClick: () => { mutate((rs) => { [rs[i - 1], rs[i]] = [rs[i], rs[i - 1]]; }); open = i - 1; } }, "▲ Up"),
                  h("button", { class: "btn sm ghost", disabled: i === rules.length - 1, onClick: () => { mutate((rs) => { [rs[i + 1], rs[i]] = [rs[i], rs[i + 1]]; }); open = i + 1; } }, "▼ Down")),
                h("div", { class: "muted up" }, "Use when…"),
                h("div", { class: "chips" }, WHEN.map((w) => h("button", { class: ["chip", r.when === w.v && "on"], onClick: () => mutate((rs) => { rs[i].when = w.v; if (w.value) rs[i].value = rs[i].value ?? w.value[2]; else delete rs[i].value; }) }, w.label))),
                (() => { const w = WHEN.find((x) => x.v === r.when); if (!w?.value) return null; const [lo, hi] = w.value; const v = r.value ?? w.value[2];
                  return h("div", { class: "row", style: { gap: "8px" } }, h("span", { class: "muted" }, `${lo}`), h("input", { class: "slider", type: "range", min: String(lo), max: String(hi), step: r.when === "enemies_at_least" ? "1" : "5", value: String(v), style: { "--v": `${((v - lo) / (hi - lo)) * 100}%` } as any, onChange: (e: Event) => mutate((rs) => { rs[i].value = Number((e.target as HTMLInputElement).value); }) }), h("span", { class: "muted" }, `${hi}`), h("b", { class: "gold-t" }, `${v}${r.when === "enemies_at_least" ? "" : "%"}`)); })(),
                h("div", { class: "muted up" }, "Target"),
                h("div", { class: "chips" }, TARGET.map((t) => h("button", { class: ["chip", r.target === t.v && "on"], onClick: () => mutate((rs) => { rs[i].target = t.v; }) }, t.label))),
                h("button", { class: "link-btn red-t", onClick: () => { mutate((rs) => { rs.splice(i, 1); }); open = null; } }, icon("trash", 12), " Remove rule")));
          })),
          h("button", { class: "btn ghost block", style: { marginTop: "8px" }, onClick: () => addRuleSheet(app, (slot) => { mutate((rs) => { rs.splice(Math.max(0, rs.length - 1), 0, { slot, when: "always", target: "default" }); }); }) }, icon("plus", 14), "Add rule")),
        h("div", { class: "muted", style: { padding: "0 6px" } }, icon("info", 11), " The basic attack is always the last resort. Put shields and heals above damage so they fire when needed."),
        h("div", { class: "grid-3 auto-actions" },
          h("button", { class: "btn ghost", onClick: () => { mutate((rs) => { rs.splice(0, rs.length, ...defaultCombat(app.content).presets[0]!.rules); }); open = null; app.router.toast("Preset reset to the default", "info"); } }, "Reset"),
          h("button", { class: "btn ghost", onClick: () => copyTo(preset.name === "Boss" ? "Balanced" : "Boss") }, `Copy to ${preset.name === "Boss" ? "Balanced" : "Boss"}`),
          h("button", { class: "btn gold", onClick: () => { app.router.toast("Preset saved", "good"); app.router.back(); } }, "Save preset")),
      ];
    },
  };
}

function addRuleSheet(app: App, add: (slot: string) => void) {
  app.router.open({ id: "add-rule", kind: "sheet", render: (close) => {
    const s = app.game.state;
    const slots = [...s.techniques.actives.map((id, i) => (id ? `a${i}` : null)).filter((x): x is string => !!x), "ultimate", "heal", "shield", "damage", "debuff", "beast", "basic"];
    return h("div", { class: "stack" }, h("div", { class: "sec-h" }, h("h3", null, "Add a rule"), h("span", { class: "hint" }, "A technique slot or a role")),
      h("div", { class: "rows" }, slots.map((sl) => { const L = ruleLabel(app, sl); return h("button", { class: "setrow", onClick: () => { add(sl); close(); } }, icon(L.icon, 16), h("div", { class: "grow", style: { textAlign: "left" } }, h("div", { class: "lbl" }, L.label), h("div", { class: "desc" }, L.desc))); })));
  } });
}

export { fmt };
