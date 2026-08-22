# Model spec: learned cleanup pre-pass

A sibling of the [edge pre-pass](EDGE_PREPASS.md) and the second on-device conditioning model from
[`ML_STRATEGY.md`](ML_STRATEGY.md): a small image→image network that predicts the **clean RGB image** from a degraded
raster (JPEG blocks, resampling ringing, sensor noise, anti-aliasing), so the classical tracer runs on cleaner pixels in
**every mode**. Its training data is produced by [`../scripts/dataset`](../scripts/dataset/README.md) (the `clean/`
target — the same dataset that trains the edge head).

Unlike the edge pre-pass, which emits a boundary _hint_ the tracer consumes, the cleanup model **rewrites the pixels the
tracer sees**. That makes its integration a straight preprocessing swap with the lowest possible risk: nothing in the
tracer changes, and discretization keeps happening downstream at quantize/threshold exactly as today.

## Where it sits

A **Tier-2 conditioning stage** under the two-tier determinism contract in [`ML_STRATEGY.md`](ML_STRATEGY.md): optional,
fail-soft, and never writing final geometry. It improves the _input_ to the deterministic classical core. It lives in
`@vectorizer/ml` beside `BackgroundRemover`, `MagicSegmenter`, and `EdgeEnhancer`.

```
decode → resize → denoise → flatten            [raster]  preprocess
        └─► CleanupEnhancer.run() → clean RGB   [ml]      (optional, one-shot: replaces the working image)
                     │
     any mode: (quantize | binarize) → … → trace   ← runs on the cleaned pixels, unchanged
```

The 8-bit RGB output **is** the discretization boundary: once the cleaned `RasterImage` exists, everything downstream is
the ordinary classical path and is byte-identical for those bytes. Cross-GPU float noise can only move a channel by ±1 at
knife-edge values; **reproducible mode** (`create({ preferBackend: 'wasm' })`) pins the WASM backend for a hard
cross-device guarantee, exactly as for the edge pre-pass.

## Task

|               |                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------- |
| **Input**     | RGB(A) image tile, `H×W×3`, values `[0,1]`, ImageNet-normalized (as `packNchw` produces) |
| **Output**    | Clean RGB image `H×W×3`, values `[0,1]` (the export applies a sigmoid)                   |
| **Objective** | Reconstruct the _clean_ render of the underlying vector scene from a _degraded_ raster   |

The source **alpha is preserved** (copied through), so a cleanup after a background removal / magic cutout keeps the
cutout.

## Data

Produced by the dataset generator; no manual labeling.

- **Pairs:** `input/` (degraded raster) → `clean/` (the pre-degradation render). Pixel-aligned by construction — the
  target is the render the degradation pipeline started from.
- **Augmentation is the degradation pipeline** (blur, resample, noise, JPEG, background compositing, geometric) — the
  exact train/test domain gap the model must close.
- **Size** (per [`ML_STRATEGY.md`](ML_STRATEGY.md)): **~20k pairs** to prototype, **50k–200k** for production. The same
  generated set trains either task, since it carries both the `clean/` and `edge/` targets.
- **Split by source family** (the generator does this) so no font/icon-pack straddles train/val/test.

## Model

Reuses the edge pre-pass network, widened to an RGB head — see [`../scripts/train/model.py`](../scripts/train/model.py).

- **Architecture:** the shared `TinyUNet`, `out_channels=3`. A wider `--base-channels` (32–48) is worth it here; image
  restoration benefits from capacity more than the sparse boundary task does.
- **Budget:** target **< 5 MB** quantized ONNX, in line with u2netp.
- **Resolution:** train at **256×256** tiles; at inference, large images are swept on a fixed overlapping grid (256 with
  32 px overlap) and stitched **per channel** — a fixed grid keeps the pass deterministic for a given backend.
- **Normalization:** ImageNet mean/std on the input (matches `packNchw`); the output is plain `[0,1]` RGB.

## Training

Offline, in PyTorch (not part of the repo's Node/TS build). One flag switches the scaffold to this task:

```
python scripts/train/pipeline.py --task cleanup --count 20000 --quantize
```

- **Loss:** a mix of **L1 + (1 − SSIM)** on the sigmoid'd RGB vs. the clean target
  ([`losses.py`](../scripts/train/losses.py) `cleanup_loss`). L1 keeps colors/edges accurate; SSIM (a self-contained,
  differentiable window statistic — no VGG/LPIPS weights) rewards local structure/contrast that L1 alone misses. Blend
  with `--ssim-weight` (default 0.5; 0 = pure L1).
- **Optimizer:** AdamW, cosine decay.
- **Metrics:** PSNR on the held-out split, **plus the downstream metric that matters** — feed cleaned images through the
  tracer and compare the app's **Oklab ΔE fidelity** and node counts against tracing the degraded input directly.
- **Selection:** maximize downstream ΔE improvement on degraded val inputs **without regressing clean inputs**.

## Export & verification

Identical to the edge pre-pass, task-aware ([`export_onnx.py`](../scripts/train/export_onnx.py)):

- Export PyTorch → **ONNX**, verify torch/onnxruntime parity within tolerance, then quantize (int8/fp16).
- Output shape is asserted `[1, 3, size, size]`.
- **Host it as a project asset, not on a third party, and don't commit it.** `*.onnx` is git-ignored; the deploy workflow
  fetches the weights from a **GitHub Release** (tag `models`) into `apps/web/public/models/cleanup.onnx` at build time, so
  Vite serves them **same-origin** (no CORS, no external host — unlike the third-party `u2netp`/SlimSAM, which keep
  fetching from their upstream mirrors) with no binary in git history. The registry points at `models/cleanup.onnx`; the
  app resolves it against its deploy base with `overrideModelUrl` and `import.meta.env.BASE_URL`. See
  [`apps/web/public/models/README.md`](../apps/web/public/models/README.md) for the publish steps.

## Integration (`@vectorizer/ml`)

Mirrors `BackgroundRemover` (a one-shot that returns a new image), plus the reproducible-mode backend option:

```ts
// cleanup is added to the ModelSpec id union and MODEL_REGISTRY.
export class CleanupEnhancer {
  // preferBackend: 'wasm' pins the deterministic backend (reproducible mode).
  static create(opts?: {
    preferBackend?: MlBackend
    onProgress?: MlProgressFn
  }): Promise<CleanupEnhancer>
  // Cleaned RGB image at the input resolution (source alpha preserved); large images are tiled.
  run(image: RasterImage, opts?: { onProgress?: MlProgressFn }): Promise<{ image: RasterImage }>
  dispose(): void
}
```

- **Backend & cache:** reuses `detectBackend()` (WebGPU → WASM), `ModelStore` (Cache Storage), and `MlProgress`
  reporting, with the same lazy `import('onnxruntime-web')` inside the factory.
- **App wiring (implemented):** the studio's ML tools panel has a **Clean up (ML)** one-shot button (beside Remove
  background). It runs `CleanupEnhancer` on the working image and **replaces the working image** with the result, so the
  next trace — in any mode — runs on the cleaned pixels. Undo via **Restore original**. Fail-soft: with no weights at
  `apps/web/public/models/cleanup.onnx` it toasts and leaves the image untouched.
- **Consumer:** none in the tracer — the cleaned image is just the raster the pipeline already expected, so no engine
  changes and no new determinism handling beyond the 8-bit output boundary above.

## Cleanup vs. edge pre-pass

Both train from one generated dataset; pick per need (or ship both — they compose: clean up first, then trace with the
edge hint on).

|                  | Cleanup pre-pass                      | Edge pre-pass                             |
| ---------------- | ------------------------------------- | ----------------------------------------- |
| Output           | Clean RGB image                       | Boundary probability map                  |
| Integration      | Replaces the working image (one-shot) | Hint consumed inside the tracer (per-run) |
| Tracer changes   | None                                  | Guided despeckle / guarded region merge   |
| Modes            | All (it is just cleaner pixels)       | All                                       |
| Integration risk | Lowest                                | Low                                       |
| Best at          | Denoise / deblock / de-ring           | Thin-feature recall on noisy input        |

## Success criteria

1. **Wins where it should:** measurable Oklab ΔE improvement (and/or lower node count at equal ΔE) when tracing
   **degraded** inputs cleaned first vs. traced directly, on the held-out split.
2. **First, do no harm:** no ΔE regression on **clean** inputs beyond a small tolerance.
3. **Budget:** weights < 5 MB; added latency within an interactive budget on a 4096×4096 image (tiled), WebGPU path.
4. **Determinism intact:** classical-only output byte-identical across devices; ML-assisted output byte-identical on WASM.

## References

Degradation models (Real-ESRGAN, BSRGAN) and restoration backbones are cited in
[`ML_STRATEGY.md`](ML_STRATEGY.md#references). On-device model conventions (ORT setup, model mirroring, Cache Storage) are
in [`REFERENCES.md`](REFERENCES.md) and `packages/ml/`.
