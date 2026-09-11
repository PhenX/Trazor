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

**Silhouette source (`--source silhouette`).** The coverage field is a **bw-silhouette** target, so the training data
is the dataset generator's `silhouette` source: one dark ink on a light paper ground — glyph-like marks with counters,
strokes of varying width, holes, and thin features at several scales — run through the full degradation pipeline
(blur, noise, JPEG, tone, dither, geometric warp). On these scenes the clean composite _is_ a bw silhouette, so the
`field/` coverage target is ~1 on ink and ~0 on paper, and the `eval:prepass --task field` ΔE (against the clean
composite) becomes a **bw-appropriate reference** rather than the meaningless color-truth comparison the multi-color
`procedural` source produced. Generate with a light ground so a geometric-warp corner reads as paper:

```sh
npm run dataset -- --source silhouette --count 11000 --targets clean,field --no-background --seed 1
```

Fonts are the strongest silhouette source ([`ML_STRATEGY.md`](ML_STRATEGY.md)); the `silhouette` synthesizer covers the
same structure (counters, thin strokes, corners, several scales) procedurally, and a font-derived SVG corpus can be
mixed in through `--source dir` when one is available.

## Model, training, export

- **Model:** the shared `TinyUNet`, `out_channels=1`, sigmoid head (coverage in `[0,1]`) — `base-channels` 16.
- **Loss:** `field_loss` = L1 + `0.25·(1 − SSIM)` on the sigmoid'd field vs the clean coverage
  ([`../scripts/train/losses.py`](../scripts/train/losses.py)); the boundary values feed refinement, so local structure
  matters alongside absolute accuracy.
- **Train / export:** `python scripts/train/pipeline.py --task field …` → `signed-field.onnx` (SigmoidWrapper, torch/onnx
  parity asserted). Served same-origin under `models/` by the deploying app, like the other two.

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
  `field/` dataset target, the `field` training/predict/eval tasks, the **`silhouette` dataset source** (with unit
  tests, `scripts/dataset/silhouette.test.ts`), and a **bw-appropriate eval reference** — `eval:prepass --task field`
  now also reports a symmetric boundary-displacement error against the clean silhouette (`lib.ts` `boundaryError`), so
  the gate reads boundary error and ΔE. The trace mechanism is covered by `packages/engine/test/coverage-hint.test.ts` —
  no hint is byte-identical; a clean field snaps the traced edge toward the true position on a hard/degraded input;
  `pixel` mode ignores it.
- **Pending:** the color `pairwiseField` extension and the studio UI toggle. (Trained weights and the panel proof are
  produced by the private Session-8 study, `docs/studies/ml-signed-field.md` in the studio repo — no `.onnx` is
  committed to the engine.)

## Success criteria

1. On **degraded bw silhouettes**, lower boundary-position error / ΔE vs. tracing with the classical field.
2. **Do no harm:** clean silhouettes not regressed; classical-only output byte-identical across devices; ML-assisted
   output byte-identical on WASM.
3. **Budget:** weights < 5 MB; interactive latency on a tiled 4096×4096 image.

## References

Model families and the degradation models are cited in [`ML_STRATEGY.md`](ML_STRATEGY.md#references); the sub-pixel
refinement it feeds is [`../packages/trace/ARCHITECTURE.md`](../packages/trace/ARCHITECTURE.md) (`refine.ts`).
