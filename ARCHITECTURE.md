# Trazor — architecture map

Whole-repo reference: what exists and where. The **rules** for changing it live in [`AGENTS.md`](AGENTS.md) — read that
before editing. Exact exported signatures live in [`docs/CONTRACTS.md`](docs/CONTRACTS.md); this map describes structure
and intent, not every file.

![How Trazor works — the runtime pipeline, the optional on-device edge pre-pass, and the offline training loop that produces its model](docs/how-it-works.svg)

_Raster → clean SVG through the deterministic core; the optional edge pre-pass (Tier 2) is discretized before the tracer,
so output stays byte-identical without it. Animated SVG — open it in a browser to see the flow._

## Shape

```
packages/core     shared vocabulary — everything else depends on it
packages/raster   pixels in, pixels/labels/masks out (preprocess, quantize, threshold, thin)
packages/trace    labels/masks in, vector paths out — the flagship (own ARCHITECTURE.md)
packages/svg      paths in, SVG text (and analysis) out
packages/engine   orchestrates the above per mode; runs in a Web Worker (+ TrazorPool for batch search)
packages/ml       optional on-device ML that improves the input (bg removal, segment, edge pre-pass, cleanup)
packages/assist   image statistics → recommended settings & palettes
packages/tune     automatic settings search: weighted objectives + adaptive parameter descent (pure, no DOM)
```

The Trazor studio (hosted at [trazor.studio](https://trazor.studio)) is the reference consumer — a separate product,
not part of this repository.

## Dependency direction

```
core ─┬─ raster ─┐
      ├─ trace  ─┼─ engine
      ├─ svg   ──┘
      ├─ ml
      ├─ assist
      └─ tune
```

`core` depends on nothing. `raster`, `trace`, `svg`, `ml`, `assist`, `tune` depend only on `core`. `engine` composes
`raster + trace + svg`. There are no cycles; keep it that way.

`tune` is the settings search: it never traces — a consumer runs each candidate through the `engine` worker pool
(`TrazorPool`), scores it, and feeds metrics back — so `tune` stays a pure, DOM-free strategy. Its API surface is in
[`docs/CONTRACTS.md`](docs/CONTRACTS.md).

## The pipeline

The engine runs one of four modes; every mode ends at the SVG serializer. Stage names (`preprocess`, `palette`,
`segment`, `trace`, `fit`, `svg`) are the progress-reporting units.

```
decode (consumer)
  → resize → denoise → flatten alpha            [raster]         preprocess
  → color/grayscale:  Oklab k-means++ quantize, or region growing [raster]     palette
                      region cleanup             [raster]         segment
                      gradients: merge ramp bands → linear/radial gradient paint [raster] (opt-in)
                      stacked:  per-layer Potrace chain           trace
                      cutout:   shared boundary graph  [trace]
  → bw:               Otsu/adaptive threshold → despeckle → trace [raster+trace]
                      (global threshold also builds a signed coverage field → sub-pixel edge refinement)
  → centerline:       threshold → Zhang-Suen thin → graph walk → Schneider fit [raster+trace]
  → serialize → analyze → warn                  [svg+engine]     svg
```

- **stacked** layering paints regions back-to-front, each layer covering itself plus everything above it, so lower
  shapes extend underneath and edges never crack. The most connective color — the one whose regions have the largest
  total perimeter, i.e. that borders the most other regions — is pinned to the bottom as the full-silhouette base (the
  standard layered-vinyl build: a cartoon's black outline or a flat design's backdrop shows between the colors stacked
  on it); the rest stack by descending area. Paint order sets only which sheet is the base — never the rendered pixels.
  A region fully enclosed by one other color and buried **two or more** sheets below that surround (a base-colored
  pupil under the eye white and the face) is relabeled into its surround for the solid base layers, then repainted on
  top as its own island layer — so the layers below stay whole instead of each carrying a floating hole that would
  drift out of alignment. A pocket with only one sheet over it keeps its single hole (it weeds and aligns fine). Because
  a color can then recur (base outline + pupil island), grouped stacked output groups by paint **layer**, not by color,
  so the two stay separate, correctly-ordered cut layers.
- **cutout** layering is an exact partition: the label-map boundary network is fitted **once** and both adjacent regions
  reuse the identical curve (junction points pinned), so there are no gaps or overlaps. See
  [`packages/trace/ARCHITECTURE.md`](packages/trace/ARCHITECTURE.md).

## Package responsibilities

- **`core`** — `RasterImage`/`GrayImage`/`BinaryMask`/`LabelMap`, the `PathCommand` model, `VectorizeSettings` (schema +
  `normalizeSettings` clamping) and `TARGET_PROFILES`, Oklab color math, geometry helpers, `mulberry32`, and the
  `TrazorEngine`/`VectorizeResult`/progress/warning types every layer speaks.
- **`raster`** — everything that takes pixels and returns pixels, masks or labels: area-average resize, gaussian/median/
  bilateral filters, alpha flattening, deterministic k-means++ quantization (with exact- and fixed-palette paths),
  Otsu + integral-image adaptive thresholds, connected-component cleanup, morphology, Zhang-Suen thinning, chamfer
  distance / stroke-width estimation, and marker-controlled **region-growing** segmentation (an alternative to global
  quantization for flat art — soft edges split between neighbors instead of inventing a rim color), and
  **gradient detection** (`gradient.ts`) that merges posterized ramp bands into one region painted with a single
  `<linearGradient>` or `<radialGradient>` — mesh-free, so the geometry (and the cutout partition) is untouched.
- **`trace`** — the tracer. Crack-boundary decomposition, the Potrace curve chain, the seam-free boundary graph, and
  centerline extraction. Its own map: [`packages/trace/ARCHITECTURE.md`](packages/trace/ARCHITECTURE.md).
- **`svg`** — `SvgDocument`/`SvgShape` → compact, valid SVG (px/mm units, evenodd holes, gap-fill strokes,
  `<defs>` gradient paint servers, metadata), plus a regex-based `analyzeSvg` for path/node/color/byte stats.
- **`engine`** — the four mode pipelines, stage timing + progress + cooperative cancellation, result warnings (stencil
  islands, tiny mm features, node counts), and the worker protocol: `installWorkerHandler` (worker side) +
  `TrazorClient` (main-thread, latest-wins) in [`docs/CONTRACTS.md`](docs/CONTRACTS.md).
- **`ml`** — lazy `onnxruntime-web` (WebGPU → WASM fallback), a Cache-Storage model store, `BackgroundRemover` (U²-Netp),
  `MagicSegmenter` (SlimSAM), and the conditioning pre-passes `EdgeEnhancer` (boundary hint), `CleanupEnhancer`
  (denoise/de-JPEG) and `FieldEnhancer` (sub-pixel coverage). Browser-only; fails soft so a consumer works without it.
- **`assist`** — one statistics pass over an image (`analyzeImage`) feeding `recommendSettings` (profile + patch +
  rationale) and `suggestPalettes` (data-derived palettes).
- **`tune`** — the automatic settings search: the tunable parameter space (`TUNABLE_PARAMS`), objective scoring
  (`scoreCandidate`, weighting fidelity / simplicity / file size / color economy / cleanliness), and the deterministic
  round-based `TuneSearch` (seed round → adaptive coordinate descent). Pure and DOM-free; a consumer pairs it with the
  engine's `TrazorPool` to trace and score candidates. Exact API: [`docs/CONTRACTS.md`](docs/CONTRACTS.md).

## Cross-cutting invariants

- **Determinism** end to end (fixed-seed PRNG; no wall-clock in output).
- **Coordinates** are source-image pixel space, y-down. Crack/boundary coordinates are integers at pixel corners
  (`[0..w] × [0..h]`); pixel centers sit at `+0.5`. The SVG serializer applies units and precision last.
- **The worker boundary** carries plain data only: RGBA `ArrayBuffer` + `VectorizeSettings` in, `VectorizeResult`
  (SVG string + stats + warnings) out. No live objects cross it.
