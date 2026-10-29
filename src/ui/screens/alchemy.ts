/**
 * Alchemy Hall (mockup "alchemy_hall"): furnace chip, success ring with its breakdown (base, furnace,
 * proficiency), recipe list (known / locked with reason), selected recipe with ingredients, batch stepper,
 * fire fee and the Refine button; a result modal; furnace upgrade sheet.
 */
import { h, fmt } from "../core/dom.ts";
import { icon } from "../core/icons.ts";
import { header, subbar, needRow, stepper, cta, RARITY_LABEL } from "../core/kit.ts";
import type { Screen } from "../core/router.ts";
import type { App } from "../../app.ts";
import { itemCount } from "../../engine/inventory.ts";
import { alchemyChance, alchemyStatus, refinePills, furnaceOf, furnaces, upgradeFurnace, type AlchemyRun } from "../../engine/crafting.ts";

export function alchemyScreen(app: App, backTo: string): Screen {
  let sel: string | undefined;
  let batch = 1;
  return {
    id: "alchemy", bg: () => app.content.art("sectloc.alchemy_hall", "background"),
    render: () => {
      const s = app.game.state, c = app.content;
      const recipes = c.byPrefix<any>("alchemy").map((r) => ({ r, st: alchemyStatus(s, c, r) })).sort((a, b) => Number(b.st.unlocked) - Number(a.st.unlocked) || a.r.grade - b.r.grade);
      const cur = recipes.find((x) => x.r.id === sel) ?? recipes.find((x) => x.st.unlocked) ?? recipes[0]!;
      const r = cur.r;
      const out = c.get<any>(r.output.id);
      const f = furnaceOf(s, c);
      const chance = alchemyChance(s, c, r);
      const profBonus = Math.max(0, chance - r.success_base - f.success_bonus);
      const max = Math.max(1, cur.st.maxBatch);
      batch = Math.min(Math.max(1, batch), max);
      const art = c.art(r.output.id, "icon");
      const effects = out.effects ? Object.entries(out.effects).map(([k, v]: any) => k === "qi" ? `+${fmt.compact(v)} Qi` : k === "hp_pct" ? `heals ${v}% HP` : k === "breakthrough_chance_bonus" ? `+${Math.round(v * 100)}% breakthrough` : k === "cultivation_boost" ? `×${v.mult} Qi for ${v.minutes} min` : k === "permanent" ? "permanent attributes" : k).join(" · ") : "";
      return [
        header(app),
        subbar({ title: "Alchemy Hall", cn: "丹药房", sub: "Refine pills from your materials", backTo, onBack: () => app.router.back() }),
        h("div", { class: "alch-top" },
          h("button", { class: "glass chip-pill", onClick: () => furnaceSheet(app) }, icon("cauldron", 14), `${f.name}`, h("span", { class: "tag gold" }, `Grade ${fmt.roman(f.grade)}`)),
          h("div", { class: "alch-ring", style: { "--p": `${Math.round(chance * 100)}` } as any }, h("div", null, h("div", { class: "muted up" }, "Success"), h("b", null, `${Math.round(chance * 100)}%`), h("div", { class: "muted" }, "per load"))),
          h("div", { class: "alch-break" },
            h("div", { class: "glass" }, h("span", null, "Base"), h("b", null, `${Math.round(r.success_base * 100)}%`)),
            h("div", { class: "glass" }, h("span", null, f.name.split(" ")[0]), h("b", null, `+${Math.round(f.success_bonus * 100)}%`)),
            h("div", { class: "glass" }, h("span", null, `Proficiency ${fmt.int(s.progress.crafting.proficiency)}`), h("b", null, `+${Math.round(profBonus * 100)}%`)))),
        h("div", { class: "alch-space" }),
        h("div", { class: "glass panel alch-panel" },
          h("div", { class: "alch-cols" },
            h("div", { class: "alch-list" }, h("div", { class: "muted up" }, "Recipes"), recipes.map((x) => {
              const ia = c.art(x.r.output.id, "icon");
              return h("button", { class: ["glass alch-rec", x.r.id === r.id && "on", !x.st.unlocked && "dim-card"], onClick: () => { sel = x.r.id; batch = 1; app.router.refresh(); } },
                h("span", { class: `tile-mini r-${c.get<any>(x.r.output.id).rarity ?? "common"}`, style: { backgroundImage: ia ? app.img(ia) : undefined } }, !ia && icon(x.st.unlocked ? "cauldron" : "lock", 14)),
                h("span", { class: "grow" }, h("span", { class: "lbl" }, c.get<any>(x.r.output.id).name), h("span", { class: "desc" }, x.st.unlocked ? `Grade ${fmt.roman(x.r.grade)} · Known` : x.st.reason)));
            })),
            h("div", { class: "alch-detail" },
              h("div", { class: "row", style: { alignItems: "flex-start" } },
                h("span", { class: `tile-mini big r-${out.rarity ?? "common"}`, style: { backgroundImage: art ? app.img(art) : undefined } }, !art && icon("cauldron", 22)),
                h("div", { class: "grow" }, h("div", { class: "title", style: { fontSize: "16px" } }, out.name),
                  h("div", { class: "row", style: { gap: "4px", flexWrap: "wrap" } }, h("span", { class: `tag rt-${out.rarity ?? "common"}` }, RARITY_LABEL[out.rarity ?? "common"]), h("span", { class: "tag" }, `Grade ${fmt.roman(r.grade)}`), h("span", { class: "tag" }, `Yield ${r.output.qty[0]}–${r.output.qty[1]}`)))),
              h("div", { class: "dim", style: { fontSize: "12px", margin: "6px 0" } }, out.description, effects && h("div", { class: "jade-t" }, effects)),
              h("div", { class: "muted up" }, "Ingredients"),
              h("div", { class: "rows" }, r.ingredients.map((q: any) => needRow(app, q.id, q.qty * batch, itemCount(s, q.id)))),
              r.failure.return_pct > 0 && h("div", { class: "muted", style: { marginTop: "4px" } }, `A failed load returns ${Math.round(r.failure.return_pct * 100)}% of the herbs${r.failure.byproduct ? ` and leaves ${c.get<any>(r.failure.byproduct).name}` : ""}.`))),
          h("div", { class: "row between", style: { marginTop: "10px" } }, stepper(batch, 1, max, (v) => { batch = v; app.router.refresh(); }), h("span", { class: "muted" }, `Max ${cur.st.maxBatch}`), h("span", { class: "muted" }, "Fire fee ", icon("gem", 11), ` ${fmt.int(r.cost_stones * batch)}`)),
          cta("Refine", cur.st.unlocked ? (cur.st.maxBatch ? `${batch} load${batch > 1 ? "s" : ""} · ${Math.round(chance * 100)}% each` : "Missing ingredients") : cur.st.reason ?? "Locked", () => {
            const res = app.game.run("alchemy", app.now(), (st, cc) => refinePills(st, cc, r.id, batch));
            if (!res.ok) { app.router.toast(res.reason, "bad"); return; }
            resultModal(app, r, res as AlchemyRun & { ok: true });
          }, { disabled: !cur.st.unlocked || cur.st.maxBatch < 1 })),
      ];
    },
  };
}

function resultModal(app: App, r: any, run: AlchemyRun) {
  const c = app.content;
  const out = c.get<any>(r.output.id);
  app.router.open({ id: "alch-result", kind: "modal", render: (close) => h("div", { class: "center" },
    h("div", { class: "m-title" }, run.success ? "Pills refined!" : "The furnace sputters…"),
    h("div", { class: "result-title", style: { fontSize: "34px" } }, run.made ? `${run.made}×` : "0"),
    h("div", { class: "dim" }, out.name),
    h("div", { class: "muted", style: { margin: "8px 0" } }, `${run.success} of ${run.success + run.failed} loads succeeded · +${fmt.int(run.proficiency)} proficiency`),
    run.returned.length > 0 && h("div", { class: "muted" }, "Recovered: ", run.returned.map((q) => `${q.qty}× ${c.get<any>(q.id).name}`).join(", ")),
    run.byproduct > 0 && r.failure.byproduct && h("div", { class: "muted" }, `Byproduct: ${run.byproduct}× ${c.get<any>(r.failure.byproduct).name}`),
    h("button", { class: "btn gold block", style: { marginTop: "12px" }, onClick: close }, "Continue")) });
}

function furnaceSheet(app: App) {
  app.router.open({ id: "furnace", kind: "sheet", render: (close) => {
    const s = app.game.state, c = app.content;
    const cur = furnaceOf(s, c);
    const list = furnaces(c);
    const next = list.find((f) => f.grade === cur.grade + 1);
    return h("div", { class: "stack" },
      h("div", { class: "sec-h" }, h("h3", null, "Furnaces"), h("span", { class: "hint" }, "Better furnaces raise success and yield")),
      h("div", { class: "rows" }, list.map((f) => h("div", { class: ["setrow", f.grade === cur.grade && "on"] }, icon("cauldron", 18),
        h("div", { class: "grow" }, h("div", { class: "lbl" }, f.name, " ", h("span", { class: "muted" }, `Grade ${fmt.roman(f.grade)}`)), h("div", { class: "desc" }, `+${Math.round(f.success_bonus * 100)}% success${f.yield_bonus ? ` · +${Math.round(f.yield_bonus * 100)}% extra pill` : ""} — ${f.description}`)),
        f.grade === cur.grade ? h("span", { class: "tag jade" }, "In use") : f.grade < cur.grade ? h("span", { class: "tag" }, "✓") : h("span", { class: "tag" }, icon("lock", 10))))),
      next && cur.upgrade ? [
        h("div", { class: "muted up" }, `Upgrade to ${next.name}`),
        h("div", { class: "rows" }, cur.upgrade.materials.map((q) => needRow(app, q.id, q.qty, itemCount(s, q.id))),
          h("div", { class: ["need", s.resources.spirit_stones < cur.upgrade.stones && "short"] }, h("span", { class: "tile-mini stone-mini" }, icon("gem", 16)), h("span", { class: "grow" }, "Spirit Stones"), h("b", { class: "tnum" }, `${fmt.int(s.resources.spirit_stones)} / ${fmt.int(cur.upgrade.stones)}`))),
        h("button", { class: "btn gold block", onClick: () => { const r = app.game.run("furnace", app.now(), (st, cc) => upgradeFurnace(st, cc)); app.router.toast(r.ok ? `Your furnace is now ${next.name}` : r.reason, r.ok ? "good" : "bad"); if (r.ok) close(); } }, "Upgrade furnace"),
      ] : h("div", { class: "muted center" }, "This is the finest furnace the hall can offer."));
  } });
}
