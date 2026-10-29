# Immortal Ascension — working rules for Claude

Offline Android xianxia cultivation RPG (JavaScript/TypeScript + Capacitor).
Specs, checklist and mockups are provided by the owner (Elie).

## Model and effort switching (owner's standing instruction)

The owner switches model/effort manually; Claude cannot. Claude MUST tell the owner
**before starting a task** when a switch is needed, then wait for a reply before starting:

> **Next: <task>. Switch to <model> + <effort>, then say "go".**

Also say when it is fine to switch back down, so Fable usage is not wasted.
If a task gets stuck (same bug survives 2+ attempts), stop and suggest switching up.

**Use Fable 5.1 only when it is the most pertinent.** Default is Opus 5.5.

| Work | Model + effort |
|---|---|
| Architecture, database/schema design, save system design | Fable 5.1 + High |
| Combat engine core, progression/balancing math across realms | Fable 5.1 + High |
| Hard bugs Opus could not fix after 2 attempts | Fable 5.1 + High |
| Normal feature code, screens matching mockups, systems integration | Opus 5.5 + High |
| Bulk content entries in an established format, art batch runs, small fixes | Opus 5.5 + Medium |

Owner is on the Max 20x plan; still avoid unnecessary Fable usage.

## Art pipeline

- ComfyUI Desktop on the owner's PC (RTX 3080 10 GB, 32 GB RAM).
- Main model: **Qwen-Image-Edit 2511** (fp8, Lightning 4-step merged), chosen after a side-by-side
  test vs Animagine XL 4.0 and GuoFeng 4.2 XL. Use it for all game art, using mockup crops as references.
- Every database entry carries an art block (file path, prompt, reference images, status);
  art is generated from the database, never ad hoc.
