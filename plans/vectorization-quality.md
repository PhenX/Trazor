# Vectorization Quality Plan — Status & Roadmap

A living plan for improving vectorization quality, corrected against the actual
codebase and updated as work lands. It replaces an earlier externally-authored
proposal that was written against a generic Potrace/CIELAB vectorizer; the
corrections (Oklab metric, determinism contract, seam-free cutout mechanism) are
folded in below.

Branch for this work: `claude/plan-review-b49kxy`.

---

## Status snapshot

| Workstream | State | Notes |
| --- | --- | --- |
| **A — SVG output optimization** | **Done** | relative/H·V, collinear removal, `<rect>`/`<circle>`/`<ellipse>`, path merging by fill. Verified in a real browser. |
| **B — curve continuity / adaptive corners** | **Verified, no change needed** | The Potrace midpoint chain already gives G1 at smooth joins and per-vertex corner decisions. Pinned by a regression test. |
| **C1 — contrast-aware detail preservation** | **Done** | `preserveDetails` keeps small high-contrast regions; opt-in (default off). |
| **C2 — coverage-based palette pruning** | **Assessed → skipped** | Largely covered already by `mergeSmallRegions` + `autoK`. Marginal net value. |
| **C3 — edge/saliency-weighted quantization** | **Assessed → deferred** | Real but subtle; `quantize.ts` is an exactly-tested hot path, so invasive for the payoff. |
| **D — sub-pixel boundaries** | **Not started (large)** | Needs a second, contour-based tracer path (marching squares → closed-polyline fit). Cutout is a separate spike. |
| **E — fidelity-driven refinement / auto-tuning** | **Not started (gated)** | Blocked on building a deterministic in-engine rasterizer (its own project). |

### Measured result of A (real-browser render check, precision 2)

| sample | bytes saved | render diff vs. un-optimized |
| --- | --- | --- |
| sprite (pixel art) | ~12% | maxΔ=1 level, 0.000% of pixels |
| badge (color) | ~26% | meanΔ 0.008, 0.016% of pixels |

Traced-fixture microbench (`OPTIMIZE_BENCH=1 npx vitest run packages/engine/test/optimize-bench`):
path data −35%, whole document −24% (a circle collapses to `<circle>`, −63%).

---

## How to continue (handoff)

- **Run everything:** `npm run check` (lint + fmt + typecheck + test). All green.
- **Real-SVG render equivalence:** `npm run build && npm run test:render` — traces the
  bundled samples in Chromium, renders optimized vs. baseline, diffs pixels. This is
  the safety net for any output-affecting change; run it whenever you touch the
  serializer, the curve chain, or segmentation.
- **New settings** (in `packages/core/src/settings.ts`): `optimizeSvg` (default true),
  `preserveDetails` (default false). Both have UI toggles in
  `apps/web/src/components/SettingsPanel.vue`.
- **New svg modules:** `optimize.ts` (path-data compaction), `clean.ts` (collinear
  removal), `primitive.ts` (`<rect>`/`<circle>`/`<ellipse>` detection). Serializer
  gained `SerializeOptions.optimizePaths` and `roundPrimitives`.
- **Do not redo B.** G1 continuity and adaptive corners already hold; see the finding
  under Workstream B. `packages/trace/test/continuity.test.ts` pins it.
- **Next best step:** if you want more quality, **D** (sub-pixel) is the biggest visual
  win but a real pilot — start with bw/grayscale, defer cutout. Everything else is
  marginal or gated.

---

## Non-negotiable invariants (acceptance gate for every change)

- **Byte-identical determinism** end to end. New randomness draws from `mulberry32`
  with a fixed/caller seed. No `Date.now()`/`new Date()` in output.
- **Seam-free cutout** stays exact: in `traceLabelMap`, a shared boundary edge is fitted
  once and reused by both regions, junctions pinned. `boundary.test.ts` guards it. Never
  fit a region outline independently in cutout mode. (This is why `<circle>` detection is
  gated off for cutout — a sub-pixel curve would diverge from the neighbor's Bézier edge.)
- **No DOM APIs** in `core`/`raster`/`trace`/`svg`/`engine`/`assist`.
- **`curveMode` honored** at every entry point (`spline`/`polygon`/`pixel`); `pixel` stays
  pixel-exact.
- **Hot-loop discipline** — typed arrays, precomputed indices (images reach 4096²).
- **Contracts + references** updated in the same commit as any exported-signature change.

---

## ΔE recalibration (this codebase uses Oklab, not CIELAB)

Color difference is `deltaEOk` — Euclidean distance in Oklab (`packages/core/src/color.ts`),
on a **0–1 scale**. A just-noticeable difference ≈ **0.02**; `autoK` merges near-duplicate
centroids at **0.03**; `fidelity.ts` treats **0.25** as full heat. Any perceptual threshold
must be expressed in these units — a CIELAB "ΔE < 5" would merge the whole palette.

| Meaning | Use here (`deltaEOk`) |
| --- | --- |
| just-noticeable difference | 0.02 |
| merge similar clusters | 0.03–0.05 (autoK = 0.03) |
| flag high-error region | 0.04–0.06 |
| "good" mean fidelity | mean ≈ 0.02–0.03 (score ≈ 0.9, since `score = 1 − 4·meanΔ`) |
| keep a high-contrast speck | 0.10–0.15 (`preserveDetails` uses 0.1) |

---

## Workstreams

### A — SVG output optimization · DONE

All under `SerializeOptions.optimizePaths` (engine setting `optimizeSvg`, default on):

- **Relative + `H`/`V` selection**, per command shortest, drift-free via integer grid
  deltas (`optimize.ts`).
- **Collinear-point removal**, exact on the grid (`clean.ts`).
- **Primitive detection** (`primitive.ts`): `<rect>` exact in every mode; `<circle>`/
  `<ellipse>` sub-pixel, gated behind `roundPrimitives` (engine turns it off for cutout).
- **Path merging by fill**: consecutive same-paint shapes fold into one `<path>` (their
  subpaths are disjoint, so the union renders the same — verified ≤1 level in-browser).

Node count drops where primitives fire (a `<circle>` has zero path nodes). Not bit-identical
at the raster level once merging/rounding is on, but "no visible difference" — asserted by
`test:render`.

**Remaining sub-item (optional):** elliptical-arc (`A`) fitting for near-circular arcs
(needs an `A` command in the `PathCommand` model — a cross-package change; low priority).

### B — curve continuity & adaptive corners · VERIFIED, NO CHANGE

The plan proposed adding G1 continuity and per-corner α_max. Reading the actual chain:

- **G1 already holds.** Smooth cubics span edge midpoints; each end tangent runs along the
  shared edge direction, so adjacent pieces are tangent-continuous by construction.
  `opticurve` merges only within smooth runs and refits under fixed end tangents, so merges
  preserve it too. Corners are the intended C0 points.
- **Corner detection is already per-vertex** (`alpha` vs `alphamax` in `smooth.ts`). The only
  extra input the plan wanted — raster contrast — isn't available in the pure trace package,
  and adding it would violate the architecture for marginal gain.

Pinned by `packages/trace/test/continuity.test.ts` (traced circle: all cubics, <2° tangent
deviation at every join, with optimization on and off). **Do not reimplement.**

### C1 — contrast-aware detail preservation · DONE

`mergeSmallRegions(labels, minArea, opts?)` gained an Oklab-contrast mode: a small component
is kept instead of absorbed when its ΔE to the would-be target label ≥ `keepContrast`.
Wired behind `preserveDetails` (default off — no regression). When on, the engine runs the
contrast-aware merge (ΔE ≥ 0.1) and sets the trace `minArea` to 1 so kept specks aren't
re-dropped downstream (the merge is then the sole speck filter).

### C2 — coverage-based palette pruning · SKIPPED (rationale)

Removing low-coverage palette colors is largely already achieved: `mergeSmallRegions`
absorbs scattered speckle-color regions (so the color drops to zero pixels and produces no
layer), and `autoK` merges perceptual near-duplicates. The only distinct case is a color with
a few medium regions but tiny total coverage that is also low-contrast — narrow, and risky to
prune (could drop a meaningful accent). Not worth the complexity now.

### C3 — edge/saliency-weighted quantization · DEFERRED (rationale)

Weighting k-means so boundary colors are represented is a real idea, but `quantize.ts` is a
deterministic, exactly-tested hot path (k-means++ seeding + Lloyd). Threading per-pixel edge
weights through seeding and centroid updates is invasive for a subtle, hard-to-demonstrate
palette shift. Revisit only with a concrete failing case and a benchmark.

### D — sub-pixel boundaries · NOT STARTED (large pilot)

Trace continuous level sets from soft masks (marching squares + bilinear at iso) instead of
bilevel crack contours, for sub-pixel-accurate anti-aliased edges.

- **Why it's a pilot, not a quick change:** the current tracer decomposes a *binary* mask
  into integer crack rings, then runs the Potrace chain. Marching-squares output is arbitrary
  float polylines — a *different* pipeline: soft mask → contours → Douglas-Peucker simplify →
  corner-aware closed fit (reuse `fit.ts`/`simplify.ts`) → hole nesting. That's a second
  tracer path alongside the crack-based one.
- **Scope it:** stacked color layers and bw/grayscale masks first (they tolerate independent
  per-layer outlines). **Cutout is a separate spike** — per-layer marching squares reintroduce
  the hairline gaps `boundary.ts` exists to eliminate; a sub-pixel *shared* boundary network is
  the hard part. Keep exact-pixel decomposition for `pixel` mode and cutout.
- **Acceptance:** anti-aliased circle contour within ~0.25 px; pixel-art and cutout byte-
  identical to today (proves gating); determinism holds.
- Add `@vectorizer/raster` soft-mask output; gate behind a `subpixel` setting (default off).

### E — fidelity-driven refinement / auto-tuning · NOT STARTED (gated)

Use the ΔE fidelity score to refine high-error regions and auto-tune parameters. **Blocked:**
the only rasterizer today is `apps/web/src/lib/fidelity.ts` — main-thread, DOM-bound, and
non-deterministic across platforms, so it cannot run in the worker/engine and must not feed
back into geometry (breaks the determinism invariant).

Pick one before starting:
- **E1 (cheap, safe):** keep it app-side and *advisory only* — surface where error concentrates
  and suggest setting changes the user applies. No new rasterizer, no determinism risk.
- **E2 (large):** build a deterministic pure-TS scanline rasterizer in a package so the engine
  can score and refine in the worker. Estimate and approve separately; only then are the
  refinement loop and quality slider deterministic.

---

## Testing & validation

- **Unit** (Vitest, Node, invariant-style): geometry round-trip for path optimization; primitive
  detection; contrast-aware merge; G1 continuity.
- **Real-browser render equivalence:** `npm run test:render` (`scripts/svg-render-check.mjs`).
- **Microbench:** `OPTIMIZE_BENCH=1 npx vitest run packages/engine/test/optimize-bench`.
- **Metrics to watch:** mean fidelity ΔE (Oklab), node count, SVG bytes, runtime. Report actual
  numbers; assert non-regression, not fixed percentages.
