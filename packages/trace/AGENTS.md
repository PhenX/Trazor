# Tracer — agent guide

Rules for working inside `packages/trace/` (`@vectorizer/trace`) — the tracer, which is the point of this project. Read
[`../../AGENTS.md`](../../AGENTS.md) first for repo-wide conventions, and **[`ARCHITECTURE.md`](ARCHITECTURE.md)** for the
full map: the crack decomposition, the Potrace curve chain stage by stage, the seam-free boundary graph, and centerline
extraction.

## What this package is

Labels/masks in, vector paths out. It never touches pixels' colors and never emits SVG text — it produces
`PathCommand[]` (from `@vectorizer/core`) that the engine wraps in shapes and the `svg` package serializes. Pure
TypeScript, no DOM, deterministic, hot-loop-conscious (images reach 4096²).

## The contracts you can break

1. **Public API** — everything re-exported from `src/index.ts`: `traceMask`, `traceLabelMap`, `traceCenterline` and
   their option/result types, plus the lower-level `decomposeMask`, `optimalPolyline`, `fitOpenPolyline`,
   `simplifyOpen`, `reverseCommands`. The engine calls these; changing a signature is a cross-package change — update
   [`../../docs/CONTRACTS.md`](../../docs/CONTRACTS.md) and the engine in the same commit.
2. **Geometry conventions** — crack/boundary coordinates are integers at pixel corners (`[0..w] × [0..h]`); centerline
   points are pixel centers (`+0.5`). Path coordinates are source-pixel space, y-down. Downstream code and every test
   assume this.
3. **Determinism** — no `Math.random()`, no wall-clock. Same input ⇒ identical `PathCommand[]`, every time. This is what
   lets the app cache and diff results; the `is deterministic` tests pin it.

## Conventions specific to the tracer

- **Implement from the paper, cite the section, port no GPL code.** The curve chain is Selinger 2003 ("Potrace: a
  polygon-based tracing algorithm"); each stage file names the section it implements. Potrace's own source is GPL and was
  not used — keep it that way, and record any new algorithm in [`../../docs/REFERENCES.md`](../../docs/REFERENCES.md).
- **`curveMode` is honored at every entry point**: `spline` (full chain), `polygon` (optimal polygon, no curve fit),
  `pixel` (exact rectilinear lattice paths — no smoothing, no resampling, for pixel art). A new stage must respect all
  three.
- **The seam-free guarantee is sacred.** In `traceLabelMap` (cutout), a boundary edge shared by two regions is fitted
  **once** and reused by both, with junction corners pinned to exact lattice points. Never fit a region's outline
  independently in cutout mode — that reintroduces the hairline gaps this package exists to eliminate. `boundary.test.ts`
  asserts adjacent regions share every interior anchor exactly.
- **Closed rings anchor at a guaranteed corner.** Decomposition starts each ring at a convex corner so the cyclic chain
  can be linearized for the straightness/DP stages; the smoothing and adjustment stages stay cyclic.
- **Numerical care.** Prefix-moment sums (`potrace/sums.ts`) subtract an origin for conditioning; integer offset
  formulas in `crack.ts` are exact for unit directions — keep them integer, don't reintroduce floating divides.

## Workflow

```bash
npx vitest run packages/trace          # this package's tests
npx tsc --noEmit -p tsconfig.packages.json   # typecheck (run from repo root; ignore other packages mid-change)
npx oxlint packages/trace              # lint
npx oxfmt packages/trace               # format (run last)
```

When a tracing bug reproduces, the fastest loop is a tiny synthetic mask/label grid asserted in a test (see the
`maskOf` / `labelsOf` helpers in the existing specs) — add the failing case first, then fix. For visual confidence on
whole shapes, the engine's opt-in showcase generator (`SHOWCASE=1 npx vitest run packages/engine/test/showcase.test.ts`)
writes comparison SVGs to `e2e-artifacts/`.
