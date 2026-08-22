# Model spec: learned edge pre-pass

The first on-device conditioning model proposed in [`ML_STRATEGY.md`](ML_STRATEGY.md) — a small network that predicts
clean region **boundaries** from a degraded raster, so the tracer decomposes cleaner cracks on noisy, anti-aliased or
JPEG-crushed input. This is a spec, not shipped code. Its training data is produced by
[`../scripts/dataset`](../scripts/dataset/README.md) (the `edge/` target).

A lower-integration-risk sibling — a **cleanup pre-pass** (image→image restoration) — trains from the same dataset (the
`clean/` target) and is described at the end.

## Where it sits

A **Tier-2 conditioning stage** under the two-tier determinism contract in [`ML_STRATEGY.md`](ML_STRATEGY.md): optional,
fail-soft, and never writing final geometry. It improves the _input_ to the deterministic classical core; its continuous
output is **discretized before the tracer**, so cross-GPU float noise is absorbed and byte-identical output is preserved
on the WASM backend. It lives in `@vectorizer/ml` beside `BackgroundRemover` and `MagicSegmenter`.

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
- **Budget:** target **< 5 MB** quantized ONNX (int8 or fp16), so the extra download stays in line with u2netp.
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
- Mirror the weights on a **CORS-enabled host** (Hugging Face `resolve/` URLs) — GitHub release assets lack the headers,
  per the repo's ML troubleshooting note.

## Integration (`@vectorizer/ml`)

Mirror the existing `BackgroundRemover` surface exactly:

```ts
// Add to the model registry union and MODEL_REGISTRY.
export interface ModelSpec {
  id: 'u2netp' | 'slimsam-encoder' | 'slimsam-decoder' | 'edge-prepass'
  url: string
  approxBytes: number
  license: string
}

export class EdgeEnhancer {
  static create(onProgress?: MlProgressFn): Promise<EdgeEnhancer>
  // Returns a boundary probability map aligned to `image`.
  run(
    image: RasterImage,
    opts?: { backend?: MlBackend; tile?: number; onProgress?: MlProgressFn },
  ): Promise<{ edges: GrayImage }>
  dispose(): void
}
```

- **Backend & cache:** reuse `detectBackend()` (WebGPU → WASM), `ModelStore` (Cache Storage), and the `MlProgress`
  reporting already in the package. Same lazy `import('onnxruntime-web')` inside the factory so the main bundle stays lean.
- **Consumers of the boundary map** (`@vectorizer/engine`):
  - **bw / centerline:** after `binarize`/`adaptiveBinarize`, use the boundary map to guide `despeckleMask` and snap the
    mask edge to predicted boundaries (a guided/joint step) → cleaner cracks into `traceMask`.
  - **color / stacked:** pass the boundary map as an extra cost into `mergeSmallRegions` so region boundaries prefer
    predicted edges.
- **Determinism:** the boundary map is **discretized** (threshold / snap) before it reaches `crack.ts`, so the trace stays
  byte-identical across devices except at knife-edge pixels; a **reproducible mode** pins `EdgeEnhancer` to the WASM
  backend for a hard cross-device guarantee. The pure classical path (no `EdgeEnhancer` engaged) is unchanged and remains
  the tested, byte-identical baseline.
- **Fail-soft:** if the model is unavailable or `detectBackend()` reports none, skip the stage and trace as today.

## Success criteria

1. **Wins where it should:** measurable Oklab ΔE improvement (and/or lower node count at equal ΔE) when tracing **degraded**
   inputs with the pre-pass vs. without, on the held-out split.
2. **First, do no harm:** no ΔE regression on **clean** inputs beyond a small tolerance.
3. **Budget:** weights < 5 MB; added latency within an interactive budget on a 4096×4096 image (tiled), WebGPU path.
4. **Determinism intact:** classical-only output byte-identical across devices; ML-assisted output byte-identical on WASM.

## Sibling: cleanup pre-pass (same data, lower integration risk)

A small U-Net that predicts the **clean image** (`clean/` target) instead of edges. It integrates as a straight
replacement of the preprocessed RGBA before `quantize`/`binarize` — **no changes to the tracer**, and discretization still
happens downstream at quantize/threshold exactly as today, so determinism handling is trivial. Same `EdgeEnhancer`-shaped
class (`run` returns `{ image: RasterImage }`), same dataset, same training loop with an L1/L2 + perceptual loss instead of
BCE. Choose this first if integration risk matters more than the extra boundary robustness the edge head brings.

## References

Model families (PiDiNet, DexiNed, HED) and the degradation models (Real-ESRGAN, BSRGAN) are cited in
[`ML_STRATEGY.md`](ML_STRATEGY.md#references). Existing on-device model conventions (ORT setup, model mirroring, Cache
Storage) are in [`REFERENCES.md`](REFERENCES.md) and `packages/ml/`.
