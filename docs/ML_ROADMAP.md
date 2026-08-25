# ML & vectorization roadmap

The **prioritized, actionable plan** for improving Trazor's ML and vectorization quality: what to build, in what order,
with impact / effort / risk and acceptance criteria. This is the _what and when_; the _why_ (ML families, the determinism
scope, dataset strategy) lives in [`ML_STRATEGY.md`](ML_STRATEGY.md). Model specs live in
[`EDGE_PREPASS.md`](EDGE_PREPASS.md) and [`CLEANUP_PREPASS.md`](CLEANUP_PREPASS.md); the pipeline the models plug into is
in [`../ARCHITECTURE.md`](../ARCHITECTURE.md) and [`../packages/trace/ARCHITECTURE.md`](../packages/trace/ARCHITECTURE.md).

## Guardrails (apply to every item)

- **Two-tier determinism.** The classical core (`raster` math → `trace` → `svg`) stays byte-identical on every device;
  ML is a Tier-2 conditioning stage that produces an intermediate the classical core **discretizes before tracing**. Any
  item that writes geometry (a learned field, primitive fitting, a refinement pass) must snap to the serializer precision
  grid and offer a WASM reproducible mode. See the [two-tier
  contract](ML_STRATEGY.md#determinism-and-webgpu-a-two-tier-contract).
- **Optional, fail-soft.** The app must stay fully functional, and the classical path byte-identical, with no model
  loaded. Every geometry-touching change ships with a byte-identical-classical-path test and a WASM-parity test.
- **Measure what ships.** The proxy losses (edge BCE/Dice, cleanup PSNR) are not the target — the target is the app's
  Oklab ΔE through the tracer, held out by source family (item 1).

## Shipped baseline

- **Edge pre-pass** (`EdgeEnhancer`) and **cleanup** (`CleanupEnhancer`) are trained and shipped as Tier-2 stages, from
  one seeded dataset generator ([`../scripts/dataset`](../scripts/dataset/README.md)) and one shared `TinyUNet`
  ([`../scripts/train`](../scripts/train/README.md)). The edge map is consumed only as a discretized **protect mask**
  (thin-feature retention), not as geometry.
- This session: `pipeline.py` now accepts multiple `--data` roots like `train.py`; the `@trazor/ml` docs were realigned
  with the four shipped models; `EDGE_PREPASS.md`'s inference grid corrected to 256.

## Priority overview

| #     | Item                                   | Fixes                              | Impact                     | Effort | Risk                          |
| ----- | -------------------------------------- | ---------------------------------- | -------------------------- | ------ | ----------------------------- |
| **1** | ΔE-through-tracer eval harness ✅      | selection optimizes a proxy        | unlocks measuring 2–6      | M      | Low                           |
| **2** | Degradation & data realism ◐           | robustness on degraded/real inputs | High (edge + cleanup both) | M–L    | Low                           |
| **3** | Learned signed-field head ◐            | shape fitting _on degraded input_  | High (point-position win)  | L      | Med (geometry / determinism)  |
| **4** | Primitive / arc fitting (classical) ✅ | biggest _visible_ quality gap      | High                       | L      | Med (geometry / cutout seams) |
| **5** | Cleanup model capacity ✅              | under-capacity vs its own spec     | Med                        | S      | Low                           |
| **6** | Bounded differentiable refinement      | fidelity ceiling                   | Very high, long-term       | XL     | High                          |

**Sequencing:** Sprint 1 = **1 → 2** (then retrain edge + cleanup, record the new baseline). Sprint 2 = **5** (quick) +
**3**. Sprint 3 = **4**. Later = **6** (offline oracle first). Item 1 comes first because nothing else is trustworthy
without it.

---

## 1. ΔE-through-tracer evaluation & selection harness — **implemented**

Shipped in [`scripts/eval`](../scripts/eval/README.md) (`trace-eval.ts`) + [`scripts/train/predict.py`](../scripts/train/predict.py),
wired as `npm run eval:prepass`. What remains is running it on real trained checkpoints to drive item-2 selection,
plus a **metric upgrade**: add SSIM (perceptual) and Hausdorff/IoU (geometric boundary error) to `scripts/eval`
alongside Oklab ΔE, and an SSIM term to the `@trazor/tune` scorer. Boundary-position error is the quantity item 3
claims to improve, so it must be measured directly.

**Why.** [`EDGE_PREPASS.md`](EDGE_PREPASS.md) and [`CLEANUP_PREPASS.md`](CLEANUP_PREPASS.md) both prescribe selecting
checkpoints by downstream Oklab ΔE "without regressing clean inputs," but `scripts/train/train.py` selects on val loss
only. Every item below is unmeasurable until this exists.

**How.** A Python `predict` step runs a checkpoint over a held-out split and writes predictions (edge maps / cleaned
images) for both the degraded `input/` and the clean `clean/` render. A Node harness (`scripts/eval/`) then, per sample:
traces the **baseline** (`input/` with no pre-pass) and the **pre-pass** variant (edge: `input/` + predicted hint;
cleanup: predicted clean image) through `@trazor/engine`, rasterizes each SVG with `resvg`, and reports **mean Oklab ΔE
against the clean ground-truth render** plus node count — bucketed **degraded** (trace `input/`) vs **clean** (trace
`clean/`, the do-no-harm check).

**Files.** `scripts/train/predict.py` (new), `scripts/eval/*` (new, Node), `package.json` (`eval:prepass`), optional
`scripts/train/evaluate.py` orchestrator mirroring `pipeline.py`.

**Acceptance.** `npm run eval:prepass` prints ΔE(off) vs ΔE(on) and node count for clean & degraded splits; a checkpoint
that regresses clean inputs beyond tolerance is flagged.

**Docs.** `scripts/train/README.md` "Reading the run"; the "Selection" bullet in both pre-pass specs → point at the tool
(replace the current aspiration-as-fact wording); new `scripts/eval/README.md`.

## 2. Degradation & data realism — **partially implemented**

**Shipped** (seeded/deterministic): tone (gamma/brightness/contrast), anisotropic blur, windowed-sinc edge ringing,
Gaussian + shot (Poisson) noise, single/double JPEG, Floyd–Steinberg dither, and richer procedural backgrounds
(radial/stripes/fractal/texture) in
`degrade.mjs`; in `render.mjs`'s geometric augmentation (all applied to the shape, so targets stay aligned) a
**projective (perspective) warp**, **radial lens distortion**, and a **multi-scale crop** (render larger, crop a
native-size window — closing the tiling domain gap); **input-side matting halos** (imperfect-cutout rim, applied only to
the input); mild defaults raised (`blurSigmaMax` 2, `noiseStdMax` 18, `jpegQuality.min` 20). Visual: the
[`degradation`](demos/degradation.html) demo. **Still pending:** true photographic-asset backgrounds (real photos) and
`canonicalize()` (flatten transforms / resolve `<use>` for real SVG corpora). Next: retrain the edge and cleanup models
on the richer data, then record the item-1 numbers as the new baseline.

**Why.** `scripts/dataset/degrade.mjs` + `config.mjs` ship a mild subset of the high-order degradation model
[`ML_STRATEGY.md`](ML_STRATEGY.md#the-degradation-pipeline-why-clean-renders-fail) calls for, so the models under-cover
heavily degraded / real-world inputs. This is the root fix for "enough for degraded images," and it lifts edge and
cleanup at once. All additions draw from the generator's seeded RNG (determinism is preserved).

**How.** Add, in randomized order and strength:

- **Backgrounds** — photographic / textured, not just solid/gradient/checker/sine (the strategy calls this "critical").
- **Blur / noise** — anisotropic + sinc (ringing), Poisson/shot noise, chroma subsampling.
- **Compression** — double-JPEG.
- **Matting** — alpha halos / colored fringing (real cutout artifacts).
- **Palette** — real Floyd–Steinberg / ordered dither (today only `posterize`, off by default).
- **Geometric / tone** — perspective/affine + mild lens distortion; gamma / white-balance shifts; paper grain / scanner
  speckle for line art.
- **Multi-scale rendering / random-crop-from-larger** so training feature scale matches the 256-px inference tile on
  4096-px images (closes the tiling domain gap).
- **Implement `canonicalize()`** in `scripts/dataset/sources.mjs` (currently a no-op stub) — flatten transforms, resolve
  `<use>`, expand shorthand — so a real SVG corpus yields valid, engine-matching targets.
- Raise the mild defaults (`blurSigmaMax`, `noiseStdMax`, lower `jpegQuality.min`).

**Files.** `scripts/dataset/degrade.mjs`, `config.mjs`, `render.mjs`, `sources.mjs`, `imageops.mjs`.

**Acceptance.** Unit coverage for each new corruption + a saved before/after montage under
[`../docs/demos/`](demos/); via item 1, a measurable ΔE gain on a held-out _heavily_-degraded set with **no clean-input
regression**. Then retrain edge + cleanup and record the item-1 numbers as the new baseline.

**Docs.** `config.mjs` USAGE, `scripts/dataset/README.md`; mark shipped corruptions in the `ML_STRATEGY.md` degradation
list.

## 3. Learned signed-field head — geometry, not just gating

## 3. Learned signed-field head — geometry, not just gating — **mechanism implemented**

**Shipped & tested.** The bw `coverageHint` path (`EngineContext.coverageHint` → quantized signed field → `traceMask`
`coverage`), worker/client wiring, `FieldEnhancer` (`@trazor/ml`), the `field/` dataset target
(`coverage = 1 − Oklab L` of the clean scene), and the `field` train/predict/eval tasks. Covered by
`packages/engine/test/coverage-hint.test.ts`: no hint is byte-identical; a clean field snaps the traced edge toward the
true position on a hard/degraded input; `pixel` mode ignores it. Spec: [`SIGNED_FIELD_PREPASS.md`](SIGNED_FIELD_PREPASS.md).
**Pending:** silhouette training data (the procedural source is multi-color, not a silhouette — so the ΔE eval isn't
meaningful for it yet), a bw-appropriate eval reference, trained weights, the color `pairwiseField` extension, and the
studio UI toggle.

**Why.** Point-position fidelity comes from the classical sub-pixel refinement (`packages/trace/src/refine.ts`), which
snaps ring vertices onto the zero-contour of a signed field. That field is built from the **degraded** working image
(`signedThresholdField`), so on noisy input it tracks a corrupted edge — and the edge model can't help (it only gates
which regions survive). A learned, denoised field makes ML improve **point positions**, the shape-fitting concern.

**How (as built).** The `field/` target is the clean scene's coverage (`1 − Oklab L`, [0,1]); `TinyUNet` sigmoid head
(task `field`) predicts it; the engine quantizes it (the discretization boundary) and uses it as the bw `coverage`,
so refinement snaps to the clean edge. Tier-1-touching: byte-identical classical path, WASM reproducible mode. Color
`pairwiseField` is a follow-up.

**Acceptance.** On degraded b/w silhouettes, boundary-position error vs. clean ground truth and ΔE improve over the
classical field; clean inputs unregressed; classical path byte-identical and WASM parity holds.

## 4. Primitive / arc fitting (classical, no training) — **implemented** (cutout-arc consistency pending)

**Shipped & tested.** The serializer already detected rect / rounded-rect / circle / ellipse (axis-aligned + rotated) /
regular-polygon / star; the **parameter estimates were heuristics** (centroid + mean-radius for circles; PCA +
bounding-box for ellipses), which bias when the traced boundary samples a shape unevenly — the "match the original
points" gap. Replaced them with least-squares fits in `packages/svg/src/fit.ts`: a **Kåsa** algebraic circle fit and a
**direct conic (Fitzgibbon-class) ellipse fit** (Jacobi eigen-decomposition of the design scatter, points normalized for
conditioning), integrated into `primitive.ts` behind the same accept/reject tolerances. Covered by
`packages/svg/test/fit.test.ts` (exact recovery from uneven sampling, rotated-ellipse angle, noise robustness, non-ellipse
rejection) and two `primitive.test.ts` accuracy tests.

The **elliptical-arc `A` command** also shipped: a new `PathCommand` variant threaded through `core`/`trace`/`svg`. A run
of consecutive cubics that lie on one circle **or ellipse** collapses to a single `A` in `packages/svg/src/arc.ts`
(`fitArcs`) — a least-squares conic fit (Kåsa circle first, then a direct-conic ellipse fit), a simple-arc / sub-360°
check, and an accept test that reconstructs each candidate arc and keeps the one that actually sweeps through every sample
(an analytic on-arc test — each sample transformed into the ellipse's local frame, required on the unit circle and inside
the swept angle range — so minor/major and direction are settled the same way for both conics, exactly at every radius),
with radii/rotation/endpoint snapped to the precision grid. The acceptance tolerance is a fixed **absolute** sub-pixel
budget (0.6px), not radius-scaled — a radius-scaled tolerance let a large, only-roughly-circular run collapse to an arc
that rendered visibly off, and which runs crossed the boundary depended on platform floating-point, so the output diverged
between machines (the render check caught it). Because a spline-traced boundary is one long cubic run (straight
edges and corners smoothed into cubics, not separated by `L`s), `fitArcs` **segments** an embedded arc out of a longer
run rather than only collapsing line-bounded runs — so a pie wedge, half-disc or oval frame from the real tracer loses its
many-cubic curved side. It runs before `optimizePathData`, gated on `roundPrimitives` (a sub-pixel change, so cutout and
the no-round classical path stay byte-identical). `core` computes exact arc bounds via `arcToCenter` (SVG F.6.5), handling
rotation; `geometry.ts` expands `A` back to cubics for the overlay; `reverseCommands` flips the sweep flag. Covered by
`packages/svg/test/arc.test.ts` (circular and rotated-elliptical runs, embedded-arc segmentation), the
[`shape-matching`](demos/shape-matching.html) demo (traced pie wedge / half-disc / elliptical wedge), and verified
pixel-lossless through resvg. `REFERENCES.md`, `CONTRACTS.md`, and the README roadmap line updated.

**Cutout-arc consistency (shipped).** Arc fitting now benefits cutout too, seam-safely. `traceLabelMap` already fits each
shared boundary chain **once** and derives the neighbor's copy by reversal; it now takes an optional `refineChain`
transform applied to that single fitted chain, so both neighbors inherit the identical (reversed) arcs — no seam
divergence. The engine wires `refineChain = fitArcs` for cutout when `optimizeSvg` is on. Junctions stay pinned because
they are integer lattice points and the arc grid-snap preserves integers; `reverseCommands` flips arc sweep so the reverse
matches exactly. Full-shape primitive **elements** (`<circle>`/`<ellipse>`/`<rect rx>`) stay off for cutout — an element
can't be shared with a neighbor's path edge — so `roundPrimitives` remains disabled at serialization; the arcs come from
the chain instead. Covered by `packages/engine/test/cutout-arc.test.ts` (shared boundary collapses to arcs and drops
nodes; every inner anchor appears exactly in the outer region — no gap; byte-identical without `refineChain`; a cutout
disc SVG emits arcs, no `<circle>`, with a lower node count). Rounded-rect corner radius also refined to sub-pixel
(`detectRoundedRect` golden-section search).

**Pending:** RANSAC robustification of the fits is optional; otherwise item 4 is complete.

**Why.** The biggest _visible_ quality gap and the commercial shape-fitting advantage. A circle or partial ring became many
cubic pieces; a true `<circle>` / `<ellipse>` / elliptical-arc `A` matches the ideal shape exactly with far fewer nodes —
and with the least-squares fits, the recovered primitive/arc tracks the original points as closely as the samples allow.

**Files (done).** `packages/svg/src/fit.ts`, `packages/svg/src/arc.ts` (new), `packages/svg/src/primitive.ts`
(least-squares fits + golden-section rrect radius), `packages/core/src/path.ts` (`A` + `arcToCenter`),
`packages/svg/src/{pathdata,optimize,serialize,geometry}.ts`, `packages/trace/src/{paths,boundary}.ts` (`refineChain`),
`packages/engine/src/native.ts` (wire `fitArcs` for cutout), tests, `REFERENCES.md`.

**Acceptance.** Circle/ellipse inputs emit true primitives with sub-pixel parameter error (done); circular- and
elliptical-arc runs collapse to `A` with a node-count drop and no visible render change (done); cutout keeps arcs
seam-consistent (done).

**Docs.** `packages/trace/ARCHITECTURE.md`, `CONTRACTS.md`, `REFERENCES.md` (Kåsa, Fitzgibbon, SVG F.6.5), README roadmap
line flipped to shipped.

## 5. Cleanup model capacity — **implemented** (residual pending)

**Shipped.** `pipeline.py` / `train.py` now default `--base-channels` per task — **16 for edge, 32 for cleanup** (base-32
cleanup is ≈0.5 M params, well under the 5 MB budget); still overridable. **Pending:** the optional **residual**
formulation (`clean = input + Δ`), which needs the export graph to de-normalize and add the input while keeping the
browser contract (normalized in → [0,1] out) — worth it but validate at export parity before shipping.

**Why.** `pipeline.py` trained cleanup at `base=16`; [`CLEANUP_PREPASS.md`](CLEANUP_PREPASS.md) says restoration wants
**32–48** ("image restoration benefits from capacity more than the sparse boundary task does").

**Files.** `scripts/train/pipeline.py`, `scripts/train/train.py` (per-task default), `scripts/train/README.md` recipes.

**Acceptance.** PSNR and downstream ΔE (item 1) improve over base-16 at an acceptable quantized size.

## 6. Bounded differentiable vector refinement (DiffVG / LIVE)

**Why.** The strongest ceiling on "match the original as closely as possible." Anticipated in
[`ML_STRATEGY.md`](ML_STRATEGY.md) already.

**How.**

- **6a — offline oracle (no determinism risk).** A Python DiffVG tool that manufactures high-quality vector targets for a
  "hard" real-raster set and scores/refines candidate traces. Powers eval sets (item 1) and distillation into the item-3
  / item-5 models. Minutes-per-image, offline only.
- **6b — in-app, bounded (later).** A few-iteration WebGPU pass polishing Bézier control points against the source,
  constrained by snapping refined coordinates to the serializer precision grid (WASM for reproducible mode). Tier-1-
  touching and high risk — gate carefully behind reproducible mode. **Prerequisite:** the deterministic in-engine
  rasterizer from [`../plans/vectorization-quality.md`](../plans/vectorization-quality.md) workstream E2 — without it
  the pass cannot be scored or verified; sequence E2 first.

**Docs.** `docs/REFINEMENT_PASS.md` when built.

## Backlog (lower priority)

- **Layer / occlusion ordering** — infer which region sits on top for clean editable `stacked` output (SAM masks →
  object-per-layer SVG). Advances the README's semantic-layering item.
- **Segmentation / quantization priors** — extend SlimSAM magic-select toward automatic object-per-layer proposals.
- **Edge-target alternative** — the current Sobel-magnitude target caps the edge model at "Sobel-on-clean"; a thinned/NMS
  boundary or the classical tracer's own crack boundary (self-supervision) is a stronger target if the edge map ever
  drives geometry. Largely superseded by item 3.
- **Training-loop niceties** — cache decoded tensors / webdataset to speed epochs; optional ODS threshold sweep for the F
  metric; log the edge-pixel fraction to validate the ~5–8% assumption.
- **Salience-aware simplification** — use the shipped edge model's output as a salience map to bias region merging and
  curve tolerance (the CLIPasso principle without CLIP): keep perceptually important detail, drop noise. Generalizes
  `preserveDetails` from contrast to learned salience.
- **Text protect mask** — a TinyUNet stage highlighting lettering, trained on font-synthesized text renders, so text
  stays crisp through quantization/thresholding. Fonts are already the top data source. Tier-2: discretized to a protect
  mask before tracing.
- **Technical-drawing primitive head** — Egiazarian et al. 2020-style line/arc/circle/corner classification (TinyUNet,
  Tier-2) informing corner decisions, centerline mode, and primitive-fitting acceptance; data from fonts + procedural
  CAD-style shapes + the public technical-drawings dataset.

## References

Model families, degradation models, and the differentiable-rasterizer line are cited in
[`ML_STRATEGY.md`](ML_STRATEGY.md#references) and [`REFERENCES.md`](REFERENCES.md).
