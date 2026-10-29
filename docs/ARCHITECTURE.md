# Client architecture

Decisions for the game client (29 Oct 2026). The content database and its validator are described in
`docs/DATABASE.md`; gear math in `docs/GEAR.md`; art in `docs/ART.md`.

## 1. Stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) everywhere: schemas, tools, engine, UI | One type system from content JSON to the screen. Node ≥ 22.18 runs it natively for tools and tests. |
| Bundler | **esbuild** (`tools/build.ts`) | One dependency, sub-second builds, no config churn. Output is plain `dist/` (HTML + JS + CSS + assets + `content.json`). |
| UI rendering | **DOM + CSS** for every screen, **Canvas 2D** for the battle stage, map overlays and particle effects | The mockups are panel/list/portrait screens: DOM gives free text layout, scrolling, accessibility and 9:16 responsiveness. The battle scene needs sprites, hit effects and speed scaling: canvas. |
| UI framework | None. `src/ui/core` is a small view layer: `h()` element builder, `Store`, a router (5 tab stacks + a global stack for menu/story, modals, bottom sheets, toasts), a component kit (`kit.ts`) and an inline SVG icon set (`icons.ts`). Fonts (Cinzel, Nunito, Cormorant Garamond, OFL) are bundled in `src/ui/fonts/` | Zero runtime dependencies keeps the APK small and makes every behaviour inspectable. The engine never touches the DOM, so the UI layer can be swapped later without touching game logic. |
| State | One `GameState` object (the save model) owned by `Game`; engine functions mutate it and emit domain events; the UI re-renders the active screen on change | A single unified state is a spec requirement and makes autosave trivial. |
| Persistence | `src/save`: versioned JSON save files with checksum, zod validation, migrations, `.bak` rollback; storage adapter over `localStorage` now, Capacitor `Preferences`/`Filesystem` when packaged | Saves must survive crashes, corrupted writes and schema changes. |
| Tests | `node --test` for engine and save logic (deterministic: injected clock + seeded RNG); Playwright for browser smoke and mobile-viewport screenshots | Gameplay rules are testable without a browser. |
| Android | **Capacitor** (added on the owner's PC: `npm i @capacitor/core @capacitor/cli @capacitor/android && npx cap add android`), `webDir: dist` | Standard WebView packaging; `dist/` is framework-agnostic so nothing in the client changes. |

Runtime dependencies: **none** besides `zod`, which is bundled into `app.js` because save files are validated
with the same schemas the validator uses. Dev dependencies: `esbuild`, `typescript`, `playwright` (browser tests).

> Network note: this workspace cannot reach the npm registry, so dev tools are symlinked from a local
> toolbox. On a normal machine `npm install` is all that is needed.

## 2. Layers

```
content/            JSON database (validated by tools/validate.ts)            ─┐ build time
tools/build.ts      esbuild bundle + content.json + asset copy → dist/        ─┘
src/
  content/          ContentIndex: typed, id-indexed, read-only view of content.json      (runtime)
  engine/           pure game rules. No DOM, no Date.now(), no Math.random(). Testable.
  save/             serialization, validation, migration, storage, autosave
  ui/               screens (DOM), battle stage (canvas), view core
  app.ts            composition root: boot → load content → load/new save → game loop → UI
```

**Dependency rule:** `engine` imports only `schema/` types and `content/`. `save` imports `engine` (for the
state type) and `schema`. `ui` imports everything. Nothing imports `ui`.

## 3. Engine

### 3.1 Game state (`src/engine/state.ts`)

`GameState` is the whole mutable world of one save slot. It is plain data (JSON-safe) so it can be
cloned, diffed, validated and migrated. Shape summary:

```
meta        version, createdAt, playtimeMs, lastTickAt (wall clock), lastSaveAt, clock guard counters
character   name, portrait npc id, realm/stage, qi, root, method (+mastery), rank, titles
techniques  known: {id → mastery xp}, loadout: {actives[4], passives[2], ultimate}
resources   spirit_stones, sect_fame, contribution, energy {value, updatedAt}
inventory   stacks: {itemId → qty}, gear: {uid → GearInstance}, nextUid
equipped    {slot → gear uid}   (ring_1, ring_2 are the two ring slots)
buffs       timed cultivation/stat buffs {id, mult/stats, expiresAt}
beasts      owned: {uid → BeastInstance}, active uid
relations   {npcId → {affinity, giftsToday, lastGiftDay, topicsAsked[]}}
progress    quests {active: {id → objective counters}, completed[]}, achievements[], story seen[],
            regions discovered/cleared nodes, dungeons first-cleared, tournaments, tribulation attempts,
            shop purchases (limited stock), recipes known, counters (kills by enemy, …)
daily       dayKey + per-day counters (dungeon runs, missions, gifts)
rng         seed state (uint32) so loot and battles replay deterministically
settings    (NOT in the slot; stored separately — see save)
```

### 3.2 Actions and events

Every player action is a function `(state, content, ctx) → Event[]` in `src/engine/actions/*`, where
`ctx = { now, rng }` is injected. Actions validate preconditions (energy, items, unlocks), mutate state,
and return domain events (`enemy_defeated`, `item_gained`, `realm_reached`, `node_cleared`, …). The
`Game` class forwards events to the trackers that make the world interconnected at runtime: quest
objectives, achievements, story triggers, NPC affinity milestones. The UI only calls actions; it never
edits state.

### 3.3 Time

The engine never reads the clock. `app.ts` passes `now` (wall-clock ms) into every call. In-session
ticking uses a monotonic timer (`performance.now()` deltas) so a clock change mid-session cannot create
or destroy Qi. Offline progression compares wall clock against `meta.lastTickAt`:

- `now < lastTickAt` → clock moved back: no gain, `meta.clockBackCount++`, the "Clock moved back" screen.
- `elapsed > offline cap` (default 12 h, in `content/meta/cultivation_rules.json`) → capped.
- Offline Qi is earned at `offline_efficiency` (default 80 %) of the live rate.

### 3.4 Cultivation (`src/engine/cultivation.ts`)

```
qiNeeded(realm, stage) = realm.qi.base · realm.qi.stage_growth^(stage−1)
baseRate(realm)        = qiNeeded(realm, 1) / (60 · rules.minutes_for_stage1[realm.order])      (Qi per second)
rate                   = baseRate · root.qi_mult · method.qi_mult · rank.qi_mult
                         · location.qi_mult · Π buff.mult · (1 + beast.cultivation_bonus) · (1 + gear qi%)
```

Qi accumulates while the game runs (1 s ticks) and while it is closed (offline). It is soft-capped at
the Qi needed to finish the current realm plus one stage of the next, so banking is bounded but a long
absence can still carry several stages. **Minor breakthrough** (stage → stage+1) costs `qiNeeded` and
always succeeds. **Major breakthrough** (stage 9 → next realm stage 1) additionally consumes
`realm.major_breakthrough.requirements`, may require a trial (`tribulation`, `dungeon`, `boss` or
`tournament` reference), rolls `success_base` (+ pill bonus), and on failure keeps items but costs
`rules.major_fail_qi_loss_pct` of the Qi. Success applies `realm_bonus`, fires `realm_reached` and the
realm's `unlocks`.

### 3.5 Derived stats (`src/engine/stats.ts`)

`computeStats(state, content)` folds, in order: base character block → realm bonuses (per realm
entered + per stage) → root bonuses → method bonuses (× mastery) → passive techniques → equipped gear
(main + affixes × enhancement mult) → set bonuses (count pieces per set) → active beast bond milestones
→ timed buffs → titles. Percent attributes stay percents. `combatPower(stats)` uses the weights in
`content/equipment/rules.json` so the number shown in the Character tab is the same formula the
validator and inventory comparison use.

### 3.6 Determinism

`src/engine/rng.ts` is a small PCG-style generator stored in `state.rng`. Loot rolls, gear rolls
(`schema/gear-math.ts`), breakthrough rolls and battles draw from it in a fixed order, so a save plus an
action sequence reproduces exactly — this is what the engine tests rely on.

## 4. Save system (`src/save`)

- **File format** `{ kind: "ia-save", v: 1, slot, savedAt, checksum, state }`, `checksum` = FNV-1a of the
  canonical JSON of `state`. `SaveFile` is a zod schema; `GameState` has its own schema for validation.
- **Write path** serialize → validate → write `slot:n:tmp` → verify readback → move the previous good file
  to `slot:n:bak` → write `slot:n`. A crash at any step leaves either the old file or a complete new one.
- **Read path** parse → checksum → validate → migrate (`migrations[v]` chain, each pure) → re-validate. If
  anything fails, the same is tried on `:bak`; if that fails too, the slot is reported as corrupted with
  the reason and the raw text kept for export.
- **Slot index** `slots` stores the summaries the main menu shows (name, realm, playtime, savedAt,
  portrait, progress %), updated on every save so the menu never has to parse full saves.
- **Autosave** every 30 s of play, after any action flagged `important` (breakthrough, battle end,
  purchase, equip), on `visibilitychange → hidden` / Capacitor `pause`, and on manual save.
- **Settings** live in their own key (`settings`), outside the slots, so they persist across journeys.
- **Storage adapters** implement `{get, set, remove, keys}`; `WebStorage` (localStorage) is used in the
  browser and as the baseline; a Capacitor `Preferences` adapter is a drop-in for the APK.

## 5. Game loop (`src/app.ts`)

```
boot → load content.json → ContentIndex
     → load settings → load slot (or New Journey → startingState) → applyOffline(now) → show report
     → every 1000 ms: tick(dtMs) (cultivation, buffs expiry, energy regen) → notify UI
     → requestAnimationFrame only while a canvas scene (battle/map) is mounted
     → autosave policy
```

## 6. Conventions

- Entity ids from content are strings exactly as in the database (`realm.core_formation`).
- Player-owned instances (gear, beasts) get numeric uids from `state.inventory.nextUid`.
- Timestamps are epoch milliseconds; durations are milliseconds; data-file durations are minutes.
- Percent stats are stored as percents (crit 18.5) exactly as in content.
- Every engine function that can fail returns `{ ok: false, reason }` rather than throwing; throwing is
  reserved for programmer errors (missing content id).
- `src/` is executed by Node's type-stripping loader in tests, so it uses erasable TypeScript only: no
  parameter properties (`constructor(private x)`), no enums, no namespaces.
- Art in the content bundle carries its `status`; `ContentIndex.art()` returns a path only when the image
  exists (`generated`/`approved`), so screens never request art that has not been made yet.

## 7. Verification

```bash
npm run check          # validate content, unit tests, typecheck, build
npm run test:browser   # build + Playwright tour (390×844): menu, prologue, every tab and sheet, settings, saves, offline report, clock guard; screenshots in .tmp/screens/
npm run dev            # rebuild on change and serve http://localhost:5173
```

`tests/engine-cultivation.test.ts` and `tests/save.test.ts` are the executable specification of §3–4.
