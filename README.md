# Trazor

**A client-side raster → SVG vectorization engine.** Trazor turns PNG/JPEG/WebP/GIF/BMP/AVIF images into clean,
editable, cuttable SVG — deterministically, with no server and no dependencies in the algorithm packages. This
repository is the open-source **engine**: the `@trazor/*` TypeScript packages.

The engine powers the **Trazor studio**, a fully client-side web app hosted at **[trazor.studio](https://trazor.studio)**
(drag in an image, tune, preview and download — nothing is uploaded). The studio itself is a separate product and is
not part of this repository; what lives here is the vectorizer it is built on.

## Why another vectorizer?

Because the tracing algorithm is the product. Trazor implements a full **Potrace-class curve chain** (from Peter
Selinger's 2003 paper — clean-room, no GPL code) and applies it **per color layer**, not just to black & white:

- **Crack-boundary decomposition** with turn policies, exact pixel geometry.
- **Optimal polygon** via penalty-minimizing dynamic programming — staircase noise becomes deliberate straight lines.
- **Least-squares vertex adjustment** — sub-pixel accurate corners.
- **Corner-aware smoothing (α_max)** — circles come out round, squares stay sharp, on the same image.
- **Curve-run optimization** — adjacent Béziers merge while staying within tolerance, so node counts stay low.
- **Gradient detection** — posterized ramps become one linear or radial gradient, each fit verified on the pixels
  against the flat bands it replaces; a transparent source's fades keep their opacity, and a glow or vignette over a
  ramp becomes an opacity gradient stacked over it.

On top of that, three things most tracers don't do:

- **Seam-free cutout mode.** In `cutout` layering the color segmentation's boundary network is fitted **once** —
  every edge shared by two regions is a single curve reused by both (junction points pinned exactly). Adjacent shapes
  are mathematically identical along their shared border: **no hairline gaps, no overlaps**, ever.
- **Centerline tracing.** For pen plotters and engraving, strokes follow the _middle_ of drawn lines (Zhang-Suen
  skeleton → graph walk → junction merging → Schneider Bézier fitting), with automatic stroke-width estimation.
- **Honest fidelity scoring.** Every result is re-rasterized and compared to the source with a mean ΔE in Oklab.

See [`docs/REFERENCES.md`](docs/REFERENCES.md) for the literature behind each stage.

## Packages

npm-workspaces monorepo, strict TypeScript, **zero runtime dependencies** in the algorithm packages. Packages export
their TypeScript source directly (`"exports": "./src/index.ts"`) — a consumer's bundler (Vite, etc.) or `tsx`
compiles them, so there is **no per-package build step**.

| Package          | Role                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `@trazor/core`   | Shared types, settings schema + profiles, Oklab color math, geometry, deterministic PRNG                                             |
| `@trazor/raster` | Resize, denoise, background flattening, k-means++ quantization, Otsu/adaptive thresholds, morphology, Zhang-Suen thinning, gradients |
| `@trazor/trace`  | The tracer: crack decomposition, Potrace-chain fitting, shared boundary graph (seam-free cutout), centerline extraction              |
| `@trazor/svg`    | Compact SVG serialization (px/mm, evenodd holes, gap-fill strokes) + output analysis                                                 |
| `@trazor/engine` | Mode pipelines, staging/progress/cancellation, warnings, worker protocol + client, and `TrazorPool` for batch search                 |
| `@trazor/ml`     | Optional on-device ML (background removal, click-to-segment, learned edge/cleanup pre-passes) on ONNX Runtime Web                    |
| `@trazor/assist` | Image statistics → recommended settings & suggested palettes                                                                         |
| `@trazor/tune`   | Automatic settings search: weighted objectives + adaptive parameter descent                                                          |

Dependency direction (no cycles): `core` depends on nothing; `raster`/`trace`/`svg`/`ml`/`assist`/`tune` depend only
on `core`; `engine` composes `raster + trace + svg`. Whole-repo map: [`ARCHITECTURE.md`](ARCHITECTURE.md); the
tracer's own map: [`packages/trace/ARCHITECTURE.md`](packages/trace/ARCHITECTURE.md); exact API surface:
[`docs/CONTRACTS.md`](docs/CONTRACTS.md).

## Usage

The engine works in a browser, a Web Worker, or Node — the packages are DOM-free (except `@trazor/ml`, which guards
browser access behind functions). Decode your image to RGBA however you like, then:

```ts
import { vectorize } from '@trazor/engine'
import { normalizeSettings } from '@trazor/core'
import type { RasterImage } from '@trazor/core'

// RGBA pixels (Uint8ClampedArray) from a canvas, `pngjs`, `sharp`, …
const image: RasterImage = { width, height, data }

const settings = normalizeSettings({ mode: 'color', paletteSize: 12, layering: 'cutout' })
const result = await vectorize(image, settings)

result.svg // → the SVG string
result.palette // → hex colors in paint order
result.stats // → node/path/byte counts, fidelity, per-stage timings
```

`normalizeSettings` merges a partial patch over `DEFAULT_SETTINGS` and clamps every field; `TARGET_PROFILES`
(illustration, logo, vinyl cut, laser, pen plotter, stencil, …) provide machine-aware presets. For long-running or
batched work, `@trazor/engine` also ships a Web Worker protocol (`installWorkerHandler` + `TrazorClient`) and
`TrazorPool`; see [`docs/CONTRACTS.md`](docs/CONTRACTS.md).

**Pipeline**: decode → resize → denoise → flatten alpha → _(color)_ Oklab k-means++ → region cleanup → _(opt)_
gradient detection → per-layer Potrace chain (stacked) or shared boundary graph (cutout) → _(bw)_ threshold →
despeckle → trace → _(centerline)_ threshold → thin → graph → fit → serialize → analyze → warn. Every stage is
deterministic: the same image + settings ⇒ byte-identical SVG.

## Development

```sh
npm install
npm test           # vitest — unit tests across all packages
npm run typecheck  # tsc over the packages
npm run lint       # oxlint
npm run fmt        # oxfmt
npm run check      # lint + fmt:check + typecheck + test (the CI gate)
```

The `scripts/` tooling (dataset generation, corpus fetch, tracer evaluation) supports algorithm work; see
`scripts/eval/README.md`.

## Notes on licensing

- This repository is **MIT**. The tracing algorithms are implemented from their published papers; no GPL code (e.g.
  the Potrace reference implementation) was used or linked.
- `@trazor/ml` ships **no model weights**. They keep their own licenses (u2netp and SlimSAM, both Apache-2.0) and are
  downloaded at runtime, not distributed with this repository. Weights the project trains itself are served
  same-origin under `models/` by the app that deploys them.

## Roadmap

- Plotter niceties: pen-travel path ordering, SVG → HPGL/G-code hints
- Kerf/offset compensation (polygon offsetting) for cutting
- Semantic layering with SAM masks (object-per-layer SVG)
- Differentiable refinement pass (WebGPU) against the source image

Shipped recently: an opt-in step-tracer hook on the engine (`EngineContext.onTrace`) that streams per-stage
snapshots and metrics for pipeline inspection — see [`docs/CONTRACTS.md`](docs/CONTRACTS.md).

The ML strategy behind several of these — shape/primitive fitting, semantic layering, the differentiable refinement
pass — and how determinism is scoped so WebGPU stays allowed, is written up in [`docs/ML_STRATEGY.md`](docs/ML_STRATEGY.md).
