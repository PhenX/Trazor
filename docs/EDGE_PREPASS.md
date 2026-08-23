# Learned edge pre-pass

The first on-device conditioning model from [`ML_STRATEGY.md`](ML_STRATEGY.md) — a small network that predicts clean
region **boundaries** from a degraded raster, so the tracer decomposes cleaner cracks on noisy, anti-aliased or
JPEG-crushed input. Its training data is produced by [`../scripts/dataset`](../scripts/dataset/README.md) (the `edge/`
target).

**Status — shipped.** The integration is implemented end to end (`@trazor/ml`'s `EdgeEnhancer`, the engine consumers,
and the studio's **Edge pre-pass (ML)** toggle), and the trained weights are published: `edge-prepass.onnx` (~0.46 MB,
MIT) is attached to the [`models` release](https://github.com/PhenX/Trazor/releases/tag/models). The deploy workflow
fetches it into `apps/web/public/models/` at build time, so the deployed site serves it same-origin (see
[Export & verification](#export--verification)). Weights are not committed, so a plain `npm run dev` still runs
weightless and fails soft until you drop the `.onnx` in locally. Below is both the design record and the shipped model's
spec.

A lower-integration-risk sibling — a **cleanup pre-pass** (image→image restoration) — trains from the same dataset (the
`clean/` target) and is specified in [`CLEANUP_PREPASS.md`](CLEANUP_PREPASS.md).

## Where it sits

A **Tier-2 conditioning stage** under the two-tier determinism contract in [`ML_STRATEGY.md`](ML_STRATEGY.md): optional,
fail-soft, and never writing final geometry. It improves the _input_ to the deterministic classical core; its continuous
output is **discretized before the tracer**, so cross-GPU float noise is absorbed and byte-identical output is preserved
on the WASM backend. It lives in `@trazor/ml` beside `BackgroundRemover` and `MagicSegmenter`.

```
decode → resize → denoise → flatten          [raster]  preprocess
        └─► EdgeEnhancer.run() → boundary map [ml]      (optional, new)
                     │
  bw/centerline: threshold → despeckle ──guided by boundary map──► mask → crack decomposition → trace
  color/stacked: quantize → region cleanup ──boundary map as a merge prior──► per-layer masks → trace
```

## Task

|               |                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| **Input**     | RGB(A) image tile, `H×W×3`, values `[0,1]` (letterboxed like U²-Net / SlimSAM inputs)                  |
| **Output**    | Single-channel boundary probability `H×W×1`, `[0,1]` — high on region/color boundaries and silhouettes |
| **Objective** | Reproduce the _clean_ boundaries of the underlying vector scene from a _degraded_ raster               |

The output is a boundary map (edges between regions), **not** a segmentation mask. Downstream code turns it into cleaner
region boundaries (below).

## Data

Produced by the dataset generator; no manual labeling.

- **Pairs:** `input/` (degraded raster) → `edge/` (soft Sobel boundary map of the clean, pre-degradation scene). The
  generator guarantees pixel alignment because the target is derived before degradation.
- **Augmentation is the degradation pipeline** (blur, resample, noise, JPEG, background compositing, geometric) — that is
  precisely the train/test domain gap the model must close, so it doubles as augmentation.
- **Size** (per [`ML_STRATEGY.md`](ML_STRATEGY.md)): **~20k pairs** to prototype, **50k–200k** for production. Start
  procedural for volume and exact labels; mix in a real SVG corpus (fonts, icon sets) via `--source dir` for realism.
- **Split by source family** (the generator does this) so no font/icon-pack straddles train/val/test.
- **Class imbalance is real:** boundary pixels are sparse — the generator's own samples run ≈5–8% pixels above a mid
  threshold — so the loss must weight them (below).

## Model

Small enough to ship in-browser and run over large images, in the size class of the existing models (u2netp ≈4.6 MB,
SlimSAM ≈10 MB).

- **Architecture:** a compact edge network — PiDiNet-tiny class (~0.1–0.7 M params) or a lightweight encoder–decoder
  U-Net (~1–2 M params) with a single sigmoid boundary head. Deep supervision (side outputs fused, HED-style) helps and
  is cheap.
- **Budget:** target **< 5 MB** quantized ONNX (int8 or fp16), so the extra download stays in line with u2netp. The
  shipped model is **~0.46 MB**, comfortably under.
- **Resolution:** train at **256×256** tiles. At inference, **tile** large images (up to the app's 4096×4096) on a fixed
  overlapping grid (e.g. 512 with 32 px overlap) and stitch — a fixed grid keeps the pass deterministic for a given
  backend.
- **Normalization:** document the exact input scaling and letterbox with the weights (as the repo already does for its
  ONNX models); the runtime must reproduce it byte-for-byte.

## Training

Offline, in PyTorch (not part of the repo's Node/TS build):

- **Loss:** class-balanced binary cross-entropy (HED's β-weighting by the positive-pixel fraction) **+ a Dice/F-measure
  term** to counter boundary sparsity. Soft targets (the 0–1 Sobel map) train directly with BCE on probabilities.
- **Optimizer:** AdamW, cosine decay; standard for this scale.
- **Metrics:** edge F-score (ODS/OIS) on the held-out split, **plus the downstream metric that actually matters** — feed
  predictions through the tracer and compare the app's existing **Oklab ΔE fidelity** and node counts against tracing the
  degraded input with no pre-pass.
- **Selection:** pick the checkpoint that maximizes downstream ΔE improvement on degraded val inputs **without regressing
  clean inputs** (a pre-pass that hurts clean images is a net loss — see success criteria).

## Export & verification

- Export PyTorch → **ONNX** (a widely supported opset), then quantize (int8/fp16) with `onnxruntime`'s tooling.
- **Parity check:** assert the ONNX (WASM EP) output matches PyTorch within tolerance on a fixed sample set before
  shipping weights.
- **Host it as a project asset, not on a third party, and don't commit it.** The weights are **not** in git (`*.onnx` is
  git-ignored). Instead the deploy workflow fetches them from a **GitHub Release** (tag `models`) into
  `apps/web/public/models/edge-prepass.onnx` just before the build, so Vite serves them **same-origin** from the deployed
  site — no CORS, no external host (unlike the third-party `u2netp`/SlimSAM, which are fetched from their upstream
  mirrors), and no multi-MB binary in history. The registry already points at `models/edge-prepass.onnx`; the app resolves
  it against its deploy base at startup with `overrideModelUrl` and `import.meta.env.BASE_URL`. See
  [`apps/web/public/models/README.md`](../apps/web/public/models/README.md) for the publish steps.

## Integration (`@trazor/ml`)

Mirror the existing `BackgroundRemover` surface, plus a reproducible-mode backend option (this is the shipped API):

```ts
// edge-prepass is added to the ModelSpec id union and MODEL_REGISTRY.
export class EdgeEnhancer {
  // preferBackend: 'wasm' pins the deterministic backend (reproducible mode).
  static create(opts?: {
    preferBackend?: MlBackend
    onProgress?: MlProgressFn
  }): Promise<EdgeEnhancer>
  // Boundary probability map ([0,1] GrayImage) at the input resolution; large images are tiled.
  run(image: RasterImage, opts?: { onProgress?: MlProgressFn }): Promise<{ edges: GrayImage }>
  dispose(): void
}
```

- **Backend & cache:** reuse `detectBackend()` (WebGPU → WASM), `ModelStore` (Cache Storage), and the `MlProgress`
  reporting already in the package. Same lazy `import('onnxruntime-web')` inside the factory so the main bundle stays lean.
- **Consumers of the boundary map** (`@trazor/engine`): the hint crosses the worker boundary as an optional Float32
  plane (`WorkerInMessage.edgeHint` → `EngineContext.edgeHint`), is resized to the working resolution and thresholded once
  (the shared `edgeProtectMask` — the discretization boundary), then feeds every mode:
  - **bw / centerline (implemented):** drives `despeckleMaskGuided` so thin real features survive the size filter. In bw
    mode the tracer then keeps them — `minArea` drops to 1 when a hint is present, mirroring `preserveDetails` in color.
  - **color / stacked (implemented):** the same protect mask is passed to `mergeSmallRegions` (`MergeOptions.protect`), so a
    small region with any pixel on a predicted boundary is kept rather than absorbed by the size-based merge; `traceMinArea`
    then drops to 1 so the tracer keeps it too. It composes with `preserveDetails` (contrast keep) — either reason keeps a
    region. With no hint the merge is byte-identical to today's.
- **App wiring (implemented):** the studio's ML tools panel has an **Edge pre-pass (ML)** toggle. When on (in every mode),
  the store runs `EdgeEnhancer` on the working image, caches the result per image, and passes it as the fourth argument to
  `TrazorClient.vectorize`. It is fail-soft: with no weights at
  `apps/web/public/models/edge-prepass.onnx` it toasts and switches itself back off, and tracing proceeds classically.
- **Determinism:** the boundary map is **discretized** (threshold / snap) before it reaches `crack.ts`, so the trace stays
  byte-identical across devices except at knife-edge pixels; a **reproducible mode** pins `EdgeEnhancer` to the WASM
  backend via `create({ preferBackend: 'wasm' })` for a hard cross-device guarantee. The pure classical path (no `EdgeEnhancer` engaged) is unchanged and remains
  the tested, byte-identical baseline.
- **Fail-soft:** if the model is unavailable or `detectBackend()` reports none, skip the stage and trace as today.

## Success criteria

1. **Wins where it should:** measurable Oklab ΔE improvement (and/or lower node count at equal ΔE) when tracing **degraded**
   inputs with the pre-pass vs. without, on the held-out split.
2. **First, do no harm:** no ΔE regression on **clean** inputs beyond a small tolerance.
3. **Budget:** weights < 5 MB; added latency within an interactive budget on a 4096×4096 image (tiled), WebGPU path.
4. **Determinism intact:** classical-only output byte-identical across devices; ML-assisted output byte-identical on WASM.

## Sibling: cleanup pre-pass (same data, lower integration risk)

A small U-Net that predicts the **clean image** (`clean/` target) instead of edges, integrating as a straight replacement
of the preprocessed RGBA before `quantize`/`binarize` — **no changes to the tracer**. It is implemented (`CleanupEnhancer`

- a one-shot studio button + `scripts/train --task cleanup`) and specified in [`CLEANUP_PREPASS.md`](CLEANUP_PREPASS.md).
  The two compose: clean up first, then trace with the edge hint on.

## References

Model families (PiDiNet, DexiNed, HED) and the degradation models (Real-ESRGAN, BSRGAN) are cited in
[`ML_STRATEGY.md`](ML_STRATEGY.md#references). Existing on-device model conventions (ORT setup, model mirroring, Cache
Storage) are in [`REFERENCES.md`](REFERENCES.md) and `packages/ml/`.
