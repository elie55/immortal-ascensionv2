# Immortal Ascension

Offline Android xianxia cultivation RPG. This repository currently holds the **content database**,
its **schemas** and the **validator**; the game client is built on top of it.

- `docs/DATABASE.md` — the design contract: entity types, ID conventions, art blocks, interconnection rules.
- `schema/` — zod schemas (also the TypeScript types the game imports).
- `content/` — the database: one JSON array per entity type.
- `tools/validate.ts` — referential-integrity + reverse-rule validator. Must pass before any content commit.
- `tools/export-art-jobs.ts` — turns `status: "planned"` art blocks into ComfyUI jobs.
- `tools/make-refs.py` — cuts the approved mockup boards into the reference crops the art blocks point at.
- `tests/` — fixture tests proving each validator rule fires.

```bash
npm install           # Node >= 22.18 (runs TypeScript natively)
npm run validate      # → RESULT: OK, plus content-vs-target table
npm test
npm run art:jobs      # → .tmp/art-jobs.json
python3 tools/make-refs.py refs/originals   # needs the six mockup boards in refs/originals/
```

Working rules for Claude sessions are in `CLAUDE.md`.
