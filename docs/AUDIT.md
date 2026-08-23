# Vectorization pipeline audit — efficiency & accuracy

A full-pipeline review of the vectorization process (August 2026, at `a3e85c5`): where time goes, what is
redundant, where accuracy is lost, and — measured against the commercial state of the art — what closes the gap.
Findings are ranked inside each section; the [prioritized roadmap](#prioritized-roadmap) at the end orders them by
impact ÷ effort. Numbers come from the opt-in bench added with this audit
(`AUDIT_BENCH=1 npx vitest run packages/engine/test/audit-bench`, writes `e2e-artifacts/audit-bench.txt`).

## Status: P0 implemented

The four **P0** items below are implemented on this branch (the tables in _The measured baseline_ are the pre-P0
figures; the deltas here are measured against them on the same scene):

- **A1.1 — edge-aware clustering sample** ✅ `detectEdges` + `quantize` `sampleMask`. Anti-aliased boundary pixels are
  kept out of the k-means training set. Palette purity on the 10-color scene: **k=16 10/16 → 10/10**, **k=10 8/10 → 10/10**
  (the blue+purple hue collapse is gone); k=10/16/32 now converge. Stacked output: **paths 561 → 45**, **bytes 108,524 →
  75,606** (k16); k32 bytes **132,958 → 75,606**.
- **A1.2 — standalone two-sided relabel** — _not shipped by design._ Once A1.1 cleans the palette, mixture pixels already
  resolve to a real side (no intermediate centroid, so no halo worms); a separate "reassign to nearest pure neighbor" pass
  is either a no-op (nearest-palette is already the global nearest) or, in its aggressive form, **erases 1px lines** (whose
  pixels are entirely boundary). The safe residual is handled by A1.1 + the existing `mergeSmallRegions`; a topology-aware
  version is left to P2 (A5-adjacent).
- **A2 — sub-pixel refinement for cutout + adaptive bw** ✅ Generalized the signed-field vertex refinement (previously fed
  only in bw global threshold) via a `SignedField` sampler + `pairwiseField` color-boundary field, plus `signedAdaptiveField`
  for adaptive bw. Cutout loops/curved chains snap onto the true anti-aliased edge (verified: an enclosed region traces onto
  its true (5.3, 4.4) edge instead of the (5, 4) lattice), seam-free and deterministic. Refinement **repositions** vertices
  (the accuracy win); it does not reduce their count — a straight junction-to-junction edge has no interior vertex to move,
  so the cutout node count is unchanged. That count is junction fragmentation, addressed below.
- **A4 — omitBackground border-connectivity** ✅ `clearBorderLabel` clears only the border-connected background; enclosed
  same-color regions (white text inside a banner) survive.
- **A3 — cutout cleanup** ◐ Removed the dead `TraceCutoutOptions.minArea`. The chain-merge-through-junctions node
  reduction is **deferred**: merging chains across a 3-region junction moves the shared junction anchor, which breaks the
  seam-free guarantee this package exists to provide. The safe form (shared junction tangents / a partition-preserving
  merge) is a follow-up, tracked in A3 below. With A1/A2 in, the cutout diagnostic still shows ~24.6k `L` — confirming the
  node load is fragmentation, not the palette/jitter A1/A2 fixed.

Everything stays deterministic and byte-identical when the new paths are inactive (no `sampleMask`, no `colorField`, no
adaptive `coverage`): the classical trace tests are unchanged.

## Status: P1 implemented

The efficiency/interactivity tier is implemented on this branch. All items are byte-identical to the prior output
(pure optimizations) except A9, which adds per-stroke width to centerline output:

- **E2 — memoized final label assignment** ✅ `quantize` caches RGB24 → label, so the full-image pass runs one k-way
  search per distinct color instead of per pixel. **21.5× faster** on a 1600×1600 image with 200 repeated colors
  (915ms → 43ms); byte-identical.
- **E3 — worker stage caching** ✅ `VectorizerClient` assigns each working-image object a stable id; the worker reuses
  the preprocessed image and the quantized/cleaned label map when only trace settings change. **1.9× faster** on a
  trace-only re-run (673ms → 352ms), more on quantize-heavy inputs; disabled while an edge hint is present; five
  invalidation tests.
- **E1 — incremental stacked layer masks** ✅ each layer's union mask is the previous minus the label that dropped out
  (bucket once, peel per layer): O(k·n) rescan → O(n). Byte-identical (asserted against a full rescan); **layer-mask
  build 543ms → 49ms at 2400×2400, k=48** (invisible on small images, where `traceMask` dominates).
- **E5 — empty fit stage removed** ✅ curve fitting runs inside the trace stage; the zero-length fit stage and its
  progress-bar jump are gone (budget folded into trace).
- **A9 — per-stroke centerline width** ✅ `traceCenterline` takes an optional chamfer `distanceField` and reports each
  stroke's own median width, so varying line weight is preserved instead of one global average.
- **Deferred (risk > "low" gain):** the Zhang–Suen iteration cap (would corrupt legitimately thick strokes; capping by
  chamfer distance doesn't bound the pathological solid-region case anyway) and the `opticurve`/`crack` scratch reuse and
  `mergeSmallRegions` round-restriction (correctness-sensitive hot loops). **E4** (worker pool) and the structural stacked
  rewrite remain open.

## The measured baseline

Synthetic anti-aliased illustration (60 blobs, 10 exact colors, 1px AA rims) at 1536×1536, Node 22,
single-threaded, default settings unless noted:

| Run                      | total  | paths | nodes  | bytes   | palette | segment | trace  |
| ------------------------ | ------ | ----- | ------ | ------- | ------- | ------- | ------ |
| color stacked k16        | 1449ms | 561   | 2,718  | 108,524 | 535ms   | 210ms   | 600ms  |
| color cutout k16         | 912ms  | 16    | 12,869 | 72,347  | 462ms   | 176ms   | 223ms  |
| color cutout k10 (=true) | 952ms  | 10    | 11,567 | 66,776  | 416ms   | 241ms   | 251ms  |
| color stacked k10        | 797ms  | 230   | 2,349  | 70,392  | 253ms   | 128ms   | 371ms  |
| color stacked k32        | 1619ms | 955   | 2,630  | 132,958 | 683ms   | 186ms   | 685ms  |
| bw auto                  | 283ms  | 3     | 598    | 13,140  | —       | 89ms    | 59ms   |
| centerline               | 2276ms | 1     | 368    | 8,514   | —       | 77ms    | 2063ms |

Three headline facts fall out of this table and the bench diagnostics:

1. **Quantization and tracing split the cost of a color run roughly evenly** (~500ms each at k16); everything
   else is noise. Optimization effort belongs to those two stages.
2. **Anti-aliasing corrupts the color pipeline before the tracer ever runs.** On a 10-color source, k=16 wastes
   6 of 16 palette entries on AA rim mixtures (`#9fb6b0 #ead4a9 #9e97be #ebb07d #668385 #dc857f`); at k=10 the
   rim mass _steals a centroid_ and two true hues collapse into one (`#696eb9` ← blue + purple), a
   seed-dependent instability. The label map ends up with 143 components where ~62 regions were painted.
3. **Cutout output is line-dominated where it should be curves**: 26,099 `L` vs 518 `C` commands at k10 —
   4–5× the nodes of stacked mode for identical input. The AA-jittered label boundaries get chopped at
   junctions into short chains that the open-chain fitter can only render as corners and stubs.

## Accuracy findings

### A1 — Anti-aliased boundaries are the single biggest accuracy loss (color modes) · **critical**

Every color-mode boundary is produced by hard nearest-centroid labeling (`raster/src/quantize.ts` →
`assignNearest`). An anti-aliased pixel is a _mixture_ of the two adjacent region colors, so it either snaps to
whichever side is nearer (boundary jitter of ±1px, different on every edge) or — worse — lands on a third
palette entry that happens to sit between the two in Oklab (halo worms along edges, the rim entries measured
above). Consequences ripple through the whole pipeline: contaminated palettes, fragmented label maps,
jittered crack networks, corner misclassification, node bloat, and boundaries systematically off by up to half
a pixel. The commercial state of the art explicitly reads anti-aliasing _as signal_ — boundary position is
placed sub-pixel from the mixing ratios. We currently throw that signal away in every color mode.

Fixes, in composable order:

1. **Edge-aware k-means sampling.** Exclude (or strongly down-weight) high-gradient pixels from the k-means
   sample so mixtures can never claim a centroid. One Sobel/neighbor-difference pass over the working image;
   the sample builder already exists. Cheap, kills palette contamination and the k=10 hue-collapse.
2. **Two-sided boundary assignment.** After clustering, assign high-gradient pixels only to the best of the
   labels present in their low-gradient neighborhood (not to any of the k colors). Removes halo worms and
   most fragmentation. This is a small post-pass over boundary pixels.
3. **Sub-pixel boundary refinement from color mixing ratios — see A2.** With 1–2 in place the boundary sits
   within ±0.5px on the correct side; 3 places it exactly.

Literature anchor: Subpixel Deblurring of Anti-Aliased Raster Clip-Art (Yang et al., CGF 2023) solves exactly
this recovery problem (region topology + palette from AA rasters) and is the reference for where the ceiling
is; the steps above are the classical 80% of it.

### A2 — Sub-pixel refinement exists but only for one mode-path · **critical**

`trace/src/refine.ts` (`refineRingToField`) de-staircases ring vertices against a signed coverage field — and
it demonstrably works — but it is only fed in **bw mode with a global threshold** (`engine/src/native.ts`
builds `signedThresholdField` only there). Not for adaptive threshold, not for stacked color, not for cutout.
So the flagship color modes trace the integer staircase while the simplest mode gets sub-pixel edges.

The generalization is cheap because the field never needs to be materialized image-wide:

- **Cutout (`trace/src/boundary.ts`):** every chain already knows its `left`/`right` labels. Refine each chain
  vertex against the _pairwise_ signed field
  `s(p) = (‖lab(p) − c_right‖ − ‖lab(p) − c_left‖) / (2‖c_left − c_right‖)`
  sampled bilinearly from the 4 pixels around the vertex (Oklab buffer already exists from quantization).
  Zero crossing = perceptual 50% mix = the true edge. O(1) per vertex, deterministic, and the seam-free
  guarantee is preserved automatically because the _chain_ is refined once and shared by both regions.
  Junction endpoints stay pinned.
- **Stacked (`engine` per-layer `traceMask`):** at each ring vertex the in-layer/out-layer labels are known
  from the label map on either side of the crack; the same pairwise field applies. Alternatively track
  best/second-best distance during `assignNearest` (one extra compare) and build a margin field per layer.
- **bw adaptive:** the local-mean threshold surface is already computed per pixel in `adaptiveBinarize`;
  emitting `gray − (localMean − bias)` as the signed field is a few lines and gives adaptive mode the same
  refinement global threshold has.

This single work item (with A1) is the visible difference between "traced" and "commercial" output on real
anti-aliased input: edges land on the true contour instead of the pixel grid, and node counts drop because
the polygon/curve stages see smooth geometry instead of jitter.

### A3 — Cutout chain fitting degrades to polylines · **high**

Measured: cutout emits 26,099 `L` / 518 `C` on the bench scene. Causes, in `trace/src/boundary.ts`:

- Chains are fitted **junction-to-junction**; every junction cut costs two pinned lattice endpoints plus two
  `L` stubs (`fitOpenChain` emits `L` to the first edge midpoint and `L` from the last), and prevents
  `opticurve` from merging across the cut. Fragmented boundary networks (A1) multiply this.
- On short jittered chains, the optimal-polygon vertices sit 2–4px apart at sharp mutual angles, so
  `smoothOpen` + `isCorner` (with the engine's default `cornerThreshold: 100°`) classifies them as corners —
  each corner is two more `L`s.
- No **tangent continuity through junctions**: two chains of the same visual contour meeting at a 2-valence
  junction (after a third region ends) are fitted independently with free tangents → visible kinks. The
  commercial bar includes explicit tangent matching between adjacent shapes.

Fixes: A1/A2 first (they remove the fragmentation and jitter at the source — expect the `L` count to collapse);
then (a) merge degree-2 junction pairs into single chains before fitting, exactly like
`centerline.ts` already merges the straightest continuations through junctions — the code pattern exists in
this repo; (b) estimate shared tangents at surviving junctions and pass them to the open-chain fit so
adjacent chains meet G1; (c) delete the dead `TraceCutoutOptions.minArea` (declared in `boundary.ts:13`,
never read — the merge upstream is the real filter) or implement it; today it is API noise.

### A4 — `omitBackground` erases interior regions of the background color · **high, bug-class**

`engine/src/native.ts` (`nearestPaletteLabel` + the `labels.data[i] === backgroundLabel → -1` loop) removes
the background _label everywhere in the image_. A white page background plus white text inside a blue banner
loses the text. Restrict the removal to the connected components that touch the image border (one flood fill
from border pixels of that label); interior same-color regions must survive.

### A5 — Corners are threshold-based, not perception-based · **medium**

`potrace/smooth.ts` decides corner vs smooth from α plus a fixed interior-angle threshold (default 100°) and a
fixed `MIN_CORNER_EDGE = 1.5px`. This is a good classical heuristic (and the angle/scale-aware refinement is
already better than stock Potrace), but it is resolution-sensitive and produces the A3 corner cascades on
noisy polygons. The reference work — Perception-Driven Semi-Structured Boundary Vectorization (Hoshyari et
al., SIGGRAPH 2018) and PolyFit (Dominici et al., SIGGRAPH 2020) — decides corners _jointly with the fit_
(does a corner-free fit explain the raster within tolerance?) rather than pointwise. A tractable middle
ground: after A2's refinement, re-test each candidate corner by attempting a smooth local fit against the
refined polyline and keeping the corner only when the smooth fit exceeds tolerance. Also consider making
`MIN_CORNER_EDGE` scale with the effective sampling density rather than a fixed 1.5px.

### A6 — No primitive/arc vocabulary inside paths · **medium**

`svg/src/primitive.ts` detects full loops that are rects / rounded-rects / circles / ellipses / regular
polygons — good, and already ahead of most open tracers. Missing relative to the commercial bar:

- **Circular/elliptical arc segments (`A`) inside mixed paths** (a rounded corner on an otherwise straight
  contour, a pie slice) — the README roadmap item. Natural place: a post-pass over fitted cubic runs testing
  arc substitution within `optTolerance` (biarc / arc-spline fitting).
- **Partial-shape regularization**: axis-align nearly-axis-aligned edges, equalize nearly-equal radii,
  snap nearly-parallel tangents — the "computational geometry framework" class of cleanup.
- **Symmetry detection** (mirror/rotational) to fit once and mirror exactly. Bigger build; highest polish.

### A7 — Gradients are outside the model · **medium, strategic**

Flat fills are the only paint. Photographic and soft-shaded input can only posterize, which is the main
reason "photo" output looks stylized next to the commercial tools. The tractable first step is **linear
gradient detection per region**: after quantization, test each large region for a linear (or radial) Oklab
ramp (PCA of position→color residuals); if a merged super-region is better explained by one gradient than by
its 3–6 posterized slices, emit `<linearGradient>`. Image vectorization via linear-gradient layer
decomposition (SIGGRAPH 2023) is the full treatment. This changes the fidelity ceiling for a whole input
class, and the settings/serializer model would need paint extensions — plan it as a feature, not a patch.

### A8 — Small inputs are traced at native resolution · **medium**

`resizeToFit` never upscales, so a 100px logo is traced from ~100 samples per edge with 1px AA rims carrying
most of the signal — exactly the regime the Subpixel Deblurring paper targets. With A1/A2 much of the signal
is recovered; still, for inputs under ~300px a 2–4× deterministic upscale (or the already-specced
`CleanupEnhancer` / super-resolution Tier-2 pass, `docs/CLEANUP_PREPASS.md`) before tracing measurably
improves fidelity. Cheap heuristic: `if (maxSide < 256) upscale ×2` behind a setting.

### A9 — Centerline quality and cost · **medium**

- Zhang–Suen produces the known staircase-biased skeletons and, being iterative erosion, costs
  O(n × stroke-radius): the bench's solid-region worst case runs **2.06s of a 2.28s total**. A
  distance-transform-guided thinning (ridge of the already-implemented `chamferDistance`) or a guard that
  caps iterations by the estimated stroke width (also already implemented) bounds both cost and bias.
- Stroke width is a single global median (`estimateStrokeWidth`); real drawings vary width per stroke.
  Per-chain width (median chamfer along that chain's pixels) is nearly free and visibly better for plotter
  output. Variable-width strokes are the literature frontier (polyvector flow); not needed for the current
  targets.

### A10 — Quantization details · **low**

- `autoK` merge threshold is a fixed Oklab 0.03; consider scaling with measured image contrast.
- Lloyd's runs a fixed `8 + 3×quality` iterations on up to 220k samples; convergence typically lands earlier —
  fine — but the final `assignNearest` full-image pass is exact O(n·k) (see E2).
- Empty clusters keep their centroid position (dead entries are compacted afterwards — correct but a re-seed
  of an empty cluster at the farthest sample would use the budget better).
- Grayscale mode quantizes desaturated RGB in 3-D Oklab where 1-D L would do the same work at a third of the
  distance cost.

## Efficiency findings

### E1 — Stacked mode re-traces the accumulated union per layer · **high**

`colorPipeline` builds, for each of k layers, a full-resolution mask (`position[l] >= i`) and runs a full
`traceMask` over it: O(k·n) mask building plus tracing boundary length that _grows_ toward the bottom layers.
Measured: stacked trace 600ms vs cutout 223ms on identical input (k16), and 108KB vs 72KB output (overdraw
also costs bytes and editor performance — 561 paths, most of them fully hidden). Options:

- Keep semantics, cut constant: per-label pixel lists once (O(n)), then build layer masks incrementally
  bottom-up and only re-scan the changed bounding box per layer.
- The bigger structural option: trace the label map's boundary graph **once** (the cutout machinery) and
  _derive_ stacked shapes from the region adjacency/containment tree — each region's stacked shape is its own
  outline plus the outlines of regions it must extend under. One trace pass, both layerings, and stacked
  inherits cutout's shared exact boundaries (today the two modes can disagree sub-pixel on the same edge).

### E2 — `assignNearest` is exact O(n·k) with no memoization · **high**

At 4096²×k64 that is ~10⁹ distance evaluations. Real images — especially after median/bilateral denoise —
carry far fewer distinct RGB values than pixels. Memoize `RGB24 → label` in a `Map`/flat LUT during the final
pass (and during fixed-palette assignment); typical hit rates make the pass nearly O(n). The k-means sample
loop itself is SIMD-friendly and a natural first WASM candidate, but the memo is 10 lines and pays first.

### E3 — No stage caching across settings changes · **high (UX)**

`appStore.runVectorize` → worker runs the entire pipeline on every settings change. Tuning `smoothing` or
`optTolerance` re-runs resize, denoise, quantization and segmentation (~700ms of the 1.4s bench run) to
produce byte-identical labels. The worker is already stateful per image; keying stages by the slice of
settings they consume (preprocess: maxDimension/denoise/blur/background; palette: +palette settings;
trace: curve settings) and caching the last `QuantizeResult`/mask makes curve-tuning interactive at ~200ms.
The settings schema already groups fields this way — the cache key derivation is mechanical.

### E4 — Single worker, single thread · **medium**

Stacked layers, cutout chain fitting, and per-shape `opticurve` are embarrassingly parallel; a small worker
pool (navigator.hardwareConcurrency-capped) on the layer/chain granularity would cut color-mode latency
2–4× on typical hardware without touching determinism (work partition is deterministic; merge order fixed).

### E5 — Assorted hot-loop notes · **low**

- `mergeSmallRegions` re-floods the _entire_ image up to 8 rounds; restricting rounds 2+ to components
  adjacent to prior merges would cap the tail. Measured 115–241ms.
- `opticurve.tryMerge` allocates sample arrays per attempt and re-derives arc-length parameterization;
  hoisting scratch buffers out of the loop is mechanical. `MAX_MERGE=24` with descending-j greedy means up to
  ~23 failed fits per run start; trying a binary search on j (mergeability is near-monotone in run length)
  would cut fit calls ~4×.
- `crack.ts` `xorFlip` builds `number[][]` row toggles + sorts per ring; a typed scratch keyed by row with
  insertion into sorted position (toggles per row are tiny) avoids the allocation churn on speckly masks.
- `analyzeSvg` regex-parses the multi-MB string the serializer just built, to recover counts the shape model
  already knows. Compute stats during serialization; keep `analyzeSvg` for foreign SVGs.
- `fidelity.ts` runs 2× full-image `rgbToOklab` on the main thread (chunked); move to the worker and reuse
  the engine's Oklab buffer for the reference side.
- The `fit` stage exists in `STAGE_BUDGET` (0.06) but every pipeline calls `run.stage('fit'); run.progress(1)`
  — it never contains work, so the progress bar jumps and the stage timing is always 0. Fold it into `trace`
  or move open-path fitting under it.

### E6 — `maxDimension` default 1600 silently caps fidelity · **note**

A 4000px source is quarter-sampled before anything runs. That is the right default _today_ (see the timing
table) but it is an accuracy ceiling users don't see; after E1–E4 land, the default deserves revisiting
(2400–3200), and the "Large source" assist rationale should say that detail is being traded away.

## Redundancy inventory

| What                                                                      | Where                                 | Action                                                                                                                                           |
| ------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TraceCutoutOptions.minArea` declared, never read                         | `trace/src/boundary.ts:13`            | delete or implement (A3)                                                                                                                         |
| Double speck filtering: despeckle/merge upstream **and** tracer `minArea` | `engine/src/native.ts` both pipelines | intentional layering — document; the `preserveDetails`/hint interplay already forces `minArea:1`, showing the tracer filter is the redundant one |
| Per-layer full-image mask rebuild                                         | `engine/src/native.ts` stacked loop   | E1                                                                                                                                               |
| Label counts recomputed after merge (quantize already returns `counts`)   | `engine/src/native.ts`                | fine (merge invalidates) — but `mergeSmallRegions` could return updated counts for free                                                          |
| `analyzeSvg` re-parse of own serializer output                            | `engine/src/native.ts` svg stage      | E5                                                                                                                                               |
| Empty `fit` stage                                                         | `engine/src/native.ts`                | E5                                                                                                                                               |
| Grayscale: 3-D Oklab distances over 1-D data                              | `quantize` via `colorPipeline`        | A10                                                                                                                                              |

## What already meets the bar (don't touch)

- The Potrace chain itself is faithful to Selinger 2003 and numerically careful (integer lattice invariants,
  prefix-moment conditioning, exact `ddenom` L1 form). The clean-room discipline is intact.
- The seam-free boundary graph is a genuine differentiator — most open tracers (and some commercial output
  modes) leave hairline gaps; the shared-chain design with pinned junctions is the right architecture, and
  A2/A3 build _on_ it rather than replacing it.
- Deterministic k-means++ with exact-palette and fixed-palette paths; the exact path is why pixel art is
  lossless. Palette colors as exact cluster RGB means (not feature-space back-projection) is correct.
- The SVG layer: grid-exact path optimization, drift-free relative deltas, exact `<rect>`/primitive
  detection, same-paint merging — output hygiene is better than typical.
- The two-tier ML determinism contract (`docs/ML_STRATEGY.md`) and the edge/cleanup pre-pass scaffolding are
  the right shape; this audit's classical items (A1/A2) are complementary, not competing — they fix clean
  inputs, the ML tier fixes degraded ones.

## Prioritized roadmap

**P0 — the accuracy step-change (implemented on this branch; see [Status](#status-p0-implemented)):**

1. ✅ A1.1 edge-aware k-means sampling. A1.2 standalone relabel **not shipped** — subsumed by A1.1 +
   `mergeSmallRegions`; the aggressive form erases 1px lines (see Status).
2. ✅ A2 pairwise sub-pixel refinement for cutout chains + bw adaptive. Stacked ring refinement is deferred
   (the per-layer union boundary is not a clean two-label field); stacked already benefits from A1's cleaner
   labels.
3. ✅ A4 `omitBackground` border-connectivity fix.
4. ◐ A3 — dead-param cleanup done; chain merging through junctions **deferred** as seam-unsafe (moving a shared
   junction anchor breaks the partition). Shared junction tangents / a partition-preserving merge is the
   follow-up.

Measured effect (10-color scene): palette purity 10/10 at every k, stacked paths 561 → 45 and bytes −30–43%,
cutout boundaries land sub-pixel on the true edge. Cutout node count is unchanged — it is junction
fragmentation (the deferred A3 merge), not the palette/jitter A1/A2 removed; the earlier "26k `L`s are almost
all A1/A3 artifacts" estimate was optimistic on the A1 share. Determinism is unchanged.

**P1 — efficiency and interactivity:**

5. E3 stage caching in the worker (the single biggest perceived-speed win in the studio).
6. E2 assignment memoization; E1 stacked restructuring (or at least incremental masks).
7. E5 grab-bag (opticurve scratch reuse, merge-round restriction, serializer stats).
8. A9 centerline: iteration cap + per-chain stroke width.

**P2 — the commercial-polish tier:**

9. A6 arc fitting inside paths, then partial-shape regularization; A5 fit-based corner re-test.
10. A8 small-input upscale path; ship the cleanup/edge pre-pass models (already specced).
11. A7 linear-gradient regions (feature-level: settings, serializer paint model, UI).
12. A6 symmetry detection; E4 worker pool.

## Measure it or it didn't happen

The repo has the pieces of a quality harness but not the loop: `fidelity.ts` (Oklab ΔE score) is browser-only,
the showcase generator is visual-only, and no metric is tracked over time. Recommended: a dev-dependency SVG
rasterizer (e.g. `resvg-js`) behind an opt-in Vitest bench — like the audit bench — that renders traced output
for a fixed corpus (the bundled samples + a dozen curated real-world inputs: AA logo, JPEG photo, scan,
pixel art, line art) and reports **mean ΔE, max ΔE, node count, bytes, ms** per mode. Every P0 item above
should land with its before/after row. ΔE-vs-nodes is a Pareto frontier — track both, because half the items
trade one for the other and the frontier moving outward is the actual goal.

## References for this audit

Works consulted that are not yet in `REFERENCES.md` (they move there if/when implemented):

- **J. Yang, N. Vining, S. Kheradmand, N. Carr, L. Sigal, A. Sheffer, "Subpixel Deblurring of Anti-Aliased
  Raster Clip-Art", _Computer Graphics Forum_ 42(2), 2023.** Recovering region topology, palette and sub-pixel
  boundaries from anti-aliased rasters — the reference problem statement for A1/A2/A8.
- **S. Hoshyari, E. A. Dominici, A. Sheffer, N. Carr, D. Ceylan, Z. Wang, I. Shen, "Perception-Driven
  Semi-Structured Boundary Vectorization", _ACM TOG (SIGGRAPH)_ 37(4), 2018.** Joint corner detection +
  spline fitting driven by a learned perceptual metric — the reference for A5.
- **E. A. Dominici, N. Schertler, J. Griffin, S. Hoshyari, L. Sigal, A. Sheffer, "PolyFit: Perception-Aligned
  Vectorization of Raster Clip-Art via Intermediate Polygonal Fitting", _ACM TOG (SIGGRAPH)_ 39(4), 2020.**
  Coarse perceptual polygon first, curves second; preferred 3:1 over prior art in user studies — corner and
  primitive-choice reference for A5/A6.
- **Z. Du et al., "Image Vectorization and Editing via Linear Gradient Layer Decomposition", _ACM TOG
  (SIGGRAPH)_ 42(4), 2023.** Region decomposition into linear-gradient layers — the full treatment of A7.
- Already in `REFERENCES.md` and load-bearing here: Selinger 2003 (the chain), VTracer (the O(n) color
  framework E1 gestures at), Kopf & Lischinski 2011 (pixel-art), LIVE/DiffVG (offline refinement oracle,
  `docs/ML_STRATEGY.md`).
