# Demos

Kept visual demos that illustrate a change or an algorithm behavior — the raw material for future docs, PRs and the
README. Each demo is a small **generator** (`*.ts`, importing the real `@vectorizer/*` packages) plus its **rendered
output** (`*.html`, self-contained). Both are committed so a demo can be re-rendered as the code evolves and dropped into
documentation without rebuilding it from memory.

## Convention

- When you build a visual demo or before/after comparison to explain a change, **save it here** — generator + rendered
  output — rather than leaving it in a scratch/temp directory. (Root [`AGENTS.md`](../../AGENTS.md) → _Documentation_.)
- Name both files after the feature: `docs/demos/<feature>.ts` → `docs/demos/<feature>.html`.
- The generator writes its `.html` next to itself and prints a small summary; keep it deterministic (it drives the real
  tracer, so it already is).

## Running

From the repo root:

```bash
npx tsx docs/demos/<feature>.ts     # regenerates <feature>.html
```

The output is a standalone page (open it directly, or embed its SVGs in a doc).

## Index

| Demo                                        | Shows                                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`adaptive-corners`](adaptive-corners.ts)   | Closed-ring corner handling with vs. without the angle/scale `cornerThreshold` (spline). |
| [`subpixel-boundary`](subpixel-boundary.ts) | Anti-aliased edges traced with vs. without the sub-pixel `coverage` field.               |
