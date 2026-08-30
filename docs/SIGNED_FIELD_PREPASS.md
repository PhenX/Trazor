# Model spec: learned signed-field pre-pass

The third on-device conditioning model from [`ML_STRATEGY.md`](ML_STRATEGY.md) and roadmap item 3 in
[`ML_ROADMAP.md`](ML_ROADMAP.md): a small image→image network that predicts a **clean signed-coverage field** from a
degraded raster, which the **bw tracer consumes as the sub-pixel `coverage` for ring refinement** — so traced vertices
snap to the _clean_ edge even when the input is noisy. This is the one pre-pass that **improves point-position fidelity**
(shape fitting), where the edge pre-pass only gates detail retention.

## Where it sits, and why it is different

`EdgeEnhancer` and `CleanupEnhancer` are pure Tier-2 stages: their output is discretized (a protect mask / 8-bit image)
before the deterministic core, so the classical trace stays byte-identical. The signed field is **Tier-1-touching**: it
feeds `refineRingToField` (`packages/trace/src/refine.ts`), which _moves geometry_ sub-pixel. Per the [two-tier
contract](ML_STRATEGY.md#determinism-and-webgpu-a-two-tier-contract) it is therefore handled like the roadmap's
differentiable-refinement pass:

- The field is **quantized to 1/256 steps** before the tracer (the discretization boundary), and the serializer already
  snaps output coordinates to its precision grid, so cross-GPU float noise below that grid vanishes.
- For a hard cross-device guarantee, pin the WASM backend (`create({ preferBackend: 'wasm' })`) — reproducible mode.
- With **no hint** (or in `pixel` curve mode) the classical field is used and output is **byte-identical** to today.

```
decode → resize → denoise → flatten                 [raster]  preprocess
        └─► FieldEnhancer.run() → coverage [0,1]     [ml]      (optional)
                     │  quantize → signed field [-0.5,0.5]
  bw: threshold → despeckle → mask → traceMask(coverage = learned field) → refine to the clean edge
```

## Task

|               |                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------ |
| **Input**     | RGB(A) image tile, `H×W×3`, `[0,1]`, ImageNet-normalized (as `packNchw` produces)          |
| **Output**    | Single-channel coverage `H×W×1`, `[0,1]` — 1 inside (ink), 0 outside, **0.5 the boundary** |
| **Objective** | Reproduce the _clean_ scene's sub-pixel coverage from a _degraded_ raster                  |

The engine maps the `[0,1]` coverage back to the signed field `coverage − 0.5 ∈ [-0.5, 0.5]` the refiner expects.

## Data

Produced by the dataset generator (the `field/` target, [`../scripts/dataset`](../scripts/dataset/README.md)):
`coverage = 1 − Oklab L` of the **clean composite** (matching `@trazor/raster` `toGrayscale`) at a mid (0.5) threshold —
its anti-aliased edge values carry the sub-pixel boundary. Pixel-aligned by construction (derived before degradation).

> **Data caveat.** The coverage field is a **bw-silhouette** target, but the built-in procedural source renders _opaque,
> multi-color_ scenes — not ideal training data for a silhouette model, and the ΔE eval (which compares against the color
> ground truth) is not meaningful for it. The effective data story is **single-subject / matte-style samples** (roadmap
> item 2's matting work + a silhouette procedural mode) and a bw reference for the eval. Until then the model trains, but
> measure it on silhouette inputs.

## Model, training, export

- **Model:** the shared `TinyUNet`, `out_channels=1`, sigmoid head (coverage in `[0,1]`) — `base-channels` 16.
- **Loss:** `field_loss` = L1 + `0.25·(1 − SSIM)` on the sigmoid'd field vs the clean coverage
  ([`../scripts/train/losses.py`](../scripts/train/losses.py)); the boundary values feed refinement, so local structure
  matters alongside absolute accuracy.
- **Train / export:** `python scripts/train/pipeline.py --task field …` → `signed-field.onnx` (SigmoidWrapper, torch/onnx
  parity asserted). Ships same-origin from the `models` release, like the other two.

## Integration (`@trazor/ml` → `@trazor/engine`)

```ts
export class FieldEnhancer {
  static create(opts?: {
    preferBackend?: MlBackend
    onProgress?: MlProgressFn
  }): Promise<FieldEnhancer>
  // Coverage field ([0,1] GrayImage, 0.5 = boundary) at the input resolution; large images are tiled.
  run(image: RasterImage, opts?: { onProgress?: MlProgressFn }): Promise<{ field: GrayImage }>
  dispose(): void
}
```

- **Consumer:** the field crosses the worker boundary as `WorkerInMessage.coverageHint` → `EngineContext.coverageHint`,
  and in bw mode `native.ts` quantizes it to a signed field and passes it to `traceMask` as `coverage` — replacing the
  field derived from the (degraded) input. `TrazorClient.vectorize(image, settings, onProgress, edgeHint, coverageHint)`.
- **Modes:** bw only (silhouette refinement). Color `cutout` uses the pairwise Oklab `ColorField` instead — a separate,
  later extension.
- **Fail-soft:** no weights at `public/models/signed-field.onnx` ⇒ `create()` rejects and the tracer uses the
  classical field.

## Status

- **Implemented & tested:** the engine/trace mechanism (bw `coverageHint`), worker/client wiring, `FieldEnhancer`, the
  `field/` dataset target, and the `field` training/predict/eval tasks. The mechanism is covered by
  `packages/engine/test/coverage-hint.test.ts` — no hint is byte-identical; a clean field snaps the traced edge toward the
  true position on a hard/degraded input; `pixel` mode ignores it.
- **Pending:** silhouette training data (see the caveat), trained weights, a bw-appropriate eval reference, and the studio
  UI toggle.

## Success criteria

1. On **degraded bw silhouettes**, lower boundary-position error / ΔE vs. tracing with the classical field.
2. **Do no harm:** clean silhouettes not regressed; classical-only output byte-identical across devices; ML-assisted
   output byte-identical on WASM.
3. **Budget:** weights < 5 MB; interactive latency on a tiled 4096×4096 image.

## References

Model families and the degradation models are cited in [`ML_STRATEGY.md`](ML_STRATEGY.md#references); the sub-pixel
refinement it feeds is [`../packages/trace/ARCHITECTURE.md`](../packages/trace/ARCHITECTURE.md) (`refine.ts`).
