# Vectorizer — architecture map

Whole-repo reference: what exists and where. The **rules** for changing it live in [`AGENTS.md`](AGENTS.md) — read that
before editing. Exact exported signatures live in [`docs/CONTRACTS.md`](docs/CONTRACTS.md); this map describes structure
and intent, not every file.

![How Vectorizer works — the runtime pipeline, the optional on-device edge pre-pass, and the offline training loop that produces its model](docs/how-it-works.svg)

_Raster → clean SVG through the deterministic core; the optional edge pre-pass (Tier 2) is discretized before the tracer,
so output stays byte-identical without it. Animated SVG — open it in a browser to see the flow._

## Shape

```
packages/core     shared vocabulary — everything else depends on it
packages/raster   pixels in, pixels/labels/masks out (preprocess, quantize, threshold, thin)
packages/trace    labels/masks in, vector paths out — the flagship (own ARCHITECTURE.md)
packages/svg      paths in, SVG text (and analysis) out
packages/engine   orchestrates the above per mode; runs in a Web Worker
packages/ml       optional on-device ML that improves the input (bg removal, segment)
packages/assist   image statistics → recommended settings & palettes
apps/web          Vue 3 + Pinia studio UI that drives the engine through a worker client
```

## Dependency direction

```
core ─┬─ raster ─┐
      ├─ trace  ─┼─ engine ─── apps/web
      ├─ svg   ──┘             │
      ├─ ml ──────────────────┤
      └─ assist ──────────────┘
```

`core` depends on nothing. `raster`, `trace`, `svg`, `ml`, `assist` depend only on `core`. `engine` composes
`raster + trace + svg`. `apps/web` depends on `engine`, `core`, `ml`, `assist`. There are no cycles; keep it that way.

## The pipeline

The engine runs one of four modes; every mode ends at the SVG serializer. Stage names (`preprocess`, `palette`,
`segment`, `trace`, `fit`, `svg`) are the progress-reporting units.

```
decode (app)
  → resize → denoise → flatten alpha            [raster]         preprocess
  → color/grayscale:  Oklab k-means++ quantize  [raster]         palette
                      region cleanup             [raster]         segment
                      stacked:  per-layer Potrace chain           trace
                      cutout:   shared boundary graph  [trace]
  → bw:               Otsu/adaptive threshold → despeckle → trace [raster+trace]
  → centerline:       threshold → Zhang-Suen thin → graph walk → Schneider fit [raster+trace]
  → serialize → analyze → warn                  [svg+engine]     svg
```

- **stacked** layering paints regions back-to-front, each layer covering itself plus everything above it, so lower
  shapes extend underneath and edges never crack.
- **cutout** layering is an exact partition: the label-map boundary network is fitted **once** and both adjacent regions
  reuse the identical curve (junction points pinned), so there are no gaps or overlaps. See
  [`packages/trace/ARCHITECTURE.md`](packages/trace/ARCHITECTURE.md).

## Package responsibilities

- **`core`** — `RasterImage`/`GrayImage`/`BinaryMask`/`LabelMap`, the `PathCommand` model, `VectorizeSettings` (schema +
  `normalizeSettings` clamping) and `TARGET_PROFILES`, Oklab color math, geometry helpers, `mulberry32`, and the
  `VectorizerEngine`/`VectorizeResult`/progress/warning types every layer speaks.
- **`raster`** — everything that takes pixels and returns pixels, masks or labels: area-average resize, gaussian/median/
  bilateral filters, alpha flattening, deterministic k-means++ quantization (with exact- and fixed-palette paths),
  Otsu + integral-image adaptive thresholds, connected-component cleanup, morphology, Zhang-Suen thinning, chamfer
  distance / stroke-width estimation.
- **`trace`** — the tracer. Crack-boundary decomposition, the Potrace curve chain, the seam-free boundary graph, and
  centerline extraction. Its own map: [`packages/trace/ARCHITECTURE.md`](packages/trace/ARCHITECTURE.md).
- **`svg`** — `SvgDocument`/`SvgShape` → compact, valid SVG (px/mm units, evenodd holes, gap-fill strokes, metadata),
  plus a regex-based `analyzeSvg` for path/node/color/byte stats.
- **`engine`** — the four mode pipelines, stage timing + progress + cooperative cancellation, result warnings (stencil
  islands, tiny mm features, node counts), and the worker protocol: `installWorkerHandler` (worker side) +
  `VectorizerClient` (main-thread, latest-wins) in [`docs/CONTRACTS.md`](docs/CONTRACTS.md).
- **`ml`** — lazy `onnxruntime-web` (WebGPU → WASM fallback), a Cache-Storage model store, `BackgroundRemover` (U²-Netp)
  and `MagicSegmenter` (SlimSAM). Browser-only; fails soft so the app works without it.
- **`assist`** — one statistics pass over an image (`analyzeImage`) feeding `recommendSettings` (profile + patch +
  rationale) and `suggestPalettes` (data-derived palettes).
- **`apps/web`** — see [`apps/web/AGENTS.md`](apps/web/AGENTS.md).

## Cross-cutting invariants

- **Determinism** end to end (fixed-seed PRNG; no wall-clock in output).
- **Coordinates** are source-image pixel space, y-down. Crack/boundary coordinates are integers at pixel corners
  (`[0..w] × [0..h]`); pixel centers sit at `+0.5`. The SVG serializer applies units and precision last.
- **The worker boundary** carries plain data only: RGBA `ArrayBuffer` + `VectorizeSettings` in, `VectorizeResult`
  (SVG string + stats + warnings) out. No live objects cross it.
