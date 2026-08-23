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

| #     | Item                                | Fixes                              | Impact                     | Effort | Risk                          |
| ----- | ----------------------------------- | ---------------------------------- | -------------------------- | ------ | ----------------------------- |
| **1** | ΔE-through-tracer eval harness ✅   | selection optimizes a proxy        | unlocks measuring 2–6      | M      | Low                           |
| **2** | Degradation & data realism          | robustness on degraded/real inputs | High (edge + cleanup both) | M–L    | Low                           |
| **3** | Learned signed-field head           | shape fitting _on degraded input_  | High (point-position win)  | L      | Med (geometry / determinism)  |
| **4** | Primitive / arc fitting (classical) | biggest _visible_ quality gap      | High                       | L      | Med (geometry / cutout seams) |
| **5** | Cleanup model capacity              | under-capacity vs its own spec     | Med                        | S      | Low                           |
| **6** | Bounded differentiable refinement   | fidelity ceiling                   | Very high, long-term       | XL     | High                          |

**Sequencing:** Sprint 1 = **1 → 2** (then retrain edge + cleanup, record the new baseline). Sprint 2 = **5** (quick) +
**3**. Sprint 3 = **4**. Later = **6** (offline oracle first). Item 1 comes first because nothing else is trustworthy
without it.

---

## 1. ΔE-through-tracer evaluation & selection harness — **implemented**

Shipped in [`scripts/eval`](../scripts/eval/README.md) (`trace-eval.ts`) + [`scripts/train/predict.py`](../scripts/train/predict.py),
wired as `npm run eval:prepass`. What remains is running it on real trained checkpoints to drive item-2 selection.

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

## 2. Degradation & data realism

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

**Why.** Point-position fidelity comes from the classical sub-pixel refinement (`packages/trace/src/refine.ts`), which
snaps ring vertices onto the zero-contour of a signed field. Today that field is built from the **degraded** working
image (`signedThresholdField`), so on noisy input it tracks a corrupted edge — and the edge model can't help (it only
gates which regions survive). A learned, denoised field makes ML improve **point positions**, the shape-fitting concern.

**How.** Add a generator target: the centered signed coverage field ∈ [−0.5, 0.5], derived from the **clean** shape alpha
(same construction as `signedThresholdField`) — free, sub-pixel, well-localized. Train `TinyUNet` with a `tanh` head
(task `field`). Feed the denoised prediction into `traceMask` / `refineRingToField` as `coverage`. This **writes
geometry**, so it must snap refined coordinates to the serializer precision grid and pin WASM for reproducible mode (the
two-tier contract's differentiable-refinement guidance). Start with the b/w threshold field (single, well-defined
crossing); the color `pairwiseField` is a follow-up.

**Files.** `scripts/dataset/targets.mjs`, `scripts/train/{dataset,model,train}.py`, `packages/ml/src` (field enhancer),
`packages/engine/src/native.ts` (pass as `coverage`), `packages/trace` refinement wiring.

**Acceptance.** On degraded b/w inputs, boundary-position error vs. clean ground truth and ΔE improve over the classical
field; clean inputs unregressed; classical path byte-identical and WASM parity holds (tests).

**Docs.** New `docs/SIGNED_FIELD_PREPASS.md`; a "geometry via a discretization-safe field" note in `ML_STRATEGY.md`;
`REFERENCES.md`.

## 4. Primitive / arc fitting (classical, no training)

**Why.** The biggest _visible_ quality gap and the commercial shape-fitting advantage. A circle currently becomes many
cubic pieces near — but not exactly on — its true center/radius; a true `<circle>` / `<ellipse>` / elliptical-arc `A`
matches the ideal shape exactly with far fewer nodes.

**How.** Detect circle / ellipse / rounded-rect / regular-polygon / arc per region and recover parameters (least-squares
circle fit, **Fitzgibbon direct ellipse fit**, RANSAC to robustify). The serializer's existing `roundPrimitives` is
post-hoc `<circle>`/`<ellipse>` _detection_, off for cutout — extend it to parametric **fit-from-pixels** and to **arc
emission**, with cutout consistency (fit the shared boundary chain once as an arc reused by both neighbors, preserving the
seam-free guarantee). Verify/extend `PathCommand` for `A` (README lists elliptical-arc fitting as a roadmap item, so it is
likely not present yet).

**Files.** `packages/trace` (new fit stage), `packages/svg` (arc emission), `packages/core` (`A` command), tests in each.

**Acceptance.** Circle/ellipse inputs emit true primitives/arcs with sub-pixel parameter error; large node-count drop at
equal-or-better ΔE; determinism and cutout-anchor tests pass.

**Docs.** `packages/trace/ARCHITECTURE.md`, `CONTRACTS.md`, `REFERENCES.md` (Fitzgibbon), flip the README roadmap line to
shipped.

## 5. Cleanup model capacity

**Why.** `pipeline.py` trains cleanup at `base=16`; [`CLEANUP_PREPASS.md`](CLEANUP_PREPASS.md) says restoration wants
**32–48** ("image restoration benefits from capacity more than the sparse boundary task does").

**How.** Give the tasks separate default `--base-channels` (edge 16, cleanup 32); consider a **residual** formulation
(`clean = input + Δ`) for restoration stability. Retrain, measure via item 1, keep int8 < 5 MB.

**Files.** `scripts/train/pipeline.py` (per-task default), `scripts/train/README.md` recipes.

**Acceptance.** PSNR and downstream ΔE improve over base-16 at an acceptable quantized size.

## 6. Bounded differentiable vector refinement (DiffVG / LIVE)

**Why.** The strongest ceiling on "match the original as closely as possible." Anticipated in
[`ML_STRATEGY.md`](ML_STRATEGY.md) already.

**How.**

- **6a — offline oracle (no determinism risk).** A Python DiffVG tool that manufactures high-quality vector targets for a
  "hard" real-raster set and scores/refines candidate traces. Powers eval sets (item 1) and distillation into the item-3
  / item-5 models. Minutes-per-image, offline only.
- **6b — in-app, bounded (later).** A few-iteration WebGPU pass polishing Bézier control points against the source,
  constrained by snapping refined coordinates to the serializer precision grid (WASM for reproducible mode). Tier-1-
  touching and high risk — gate carefully behind reproducible mode.

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

## References

Model families, degradation models, and the differentiable-rasterizer line are cited in
[`ML_STRATEGY.md`](ML_STRATEGY.md#references) and [`REFERENCES.md`](REFERENCES.md).
