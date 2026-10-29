# Immortal Ascension

Offline Android xianxia cultivation RPG. This repository currently holds the **content database**,
its **schemas** and the **validator**; the game client is built on top of it.

- `docs/DATABASE.md` — the design contract: entity types, ID conventions, art blocks, interconnection rules.
- `docs/GEAR.md` — the gear system: bases, item level, rarity ladders, random affixes, refinement/reforge.
- `docs/ARCHITECTURE.md` — the client: stack, layers, game state, cultivation math, save system, game loop.
- `docs/ART.md` — the art pipeline (ComfyUI / Qwen-Image-Edit) and asset conventions.
- `src/` — the game client: `content/` (typed index), `engine/` (pure rules), `save/`, `ui/`, `app.ts`.
- `schema/` — zod schemas (also the TypeScript types the game imports).
- `content/` — the database: one JSON array per entity type.
- `tools/validate.ts` — referential-integrity + reverse-rule validator. Must pass before any content commit.
- `tools/export-art-jobs.ts` — turns `status: "planned"` art blocks into ComfyUI jobs.
- `tools/make-refs.py` — cuts the approved mockup boards into the reference crops the art blocks point at.
- `tools/gen/` — Python generators that write `content/`. `regions.py` builds regions 3–15 and the endgame from the
  single table in `region_data.py`, so every enemy, drop, recipe, quest and art block is wired together by construction.
- `tests/` — fixture tests proving each validator rule fires.

```bash
npm install           # Node >= 22.18 (runs TypeScript natively)
npm run validate      # → RESULT: OK, plus content-vs-target table
npm test
npm run art:jobs      # → .tmp/art-jobs.json
npm run build         # → dist/ (Capacitor webDir)
npm run dev           # watch + serve on http://localhost:5173
npm run test:browser  # Playwright smoke test of the playable shell
python3 tools/make-refs.py refs/originals   # needs the six mockup boards in refs/originals/
(cd tools/gen && for f in world items actors places progress regions; do PYTHONPATH=. python3 $f.py; done)  # regenerate content
```

Working rules for Claude sessions are in `CLAUDE.md`.
