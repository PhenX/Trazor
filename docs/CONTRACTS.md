# Package contracts

Authoritative API surface each package must export. `@vectorizer/core` (already
implemented — read it first) defines the shared vocabulary: `RasterImage`,
`GrayImage`, `BinaryMask`, `LabelMap`, `PathCommand`, `VectorizeSettings`,
`VectorizeResult`, `VectorizerEngine`, color/geometry helpers, `mulberry32`.

Rules that apply to every package:

- Pure TypeScript, strict mode, ESM, no runtime dependencies beyond what the
  package.json already declares. No DOM APIs outside `@vectorizer/ml` and
  `apps/web` (everything else must run in Node for tests and in workers).
- Determinism: identical inputs ⇒ identical outputs. Any randomness must come
  from `mulberry32` with a caller-provided or fixed seed. Never `Math.random()`.
- Performance: hot loops over pixels use typed arrays and indices, no per-pixel
  closures/objects/allocations. Images can be 4096×4096.
- Coordinates: raster pixel space, y down. Crack (boundary) coordinates are
  integers at pixel corners in `[0..w] × [0..h]`; pixel centers are at `+0.5`.
- Tests live in `packages/<name>/test/*.test.ts`, run with
  `npx vitest run packages/<name>`. Use explicit `import { describe, it, expect } from 'vitest'`.
- Literature: every citable algorithm, paper or model a package relies on must
  be recorded. `docs/REFERENCES.md` is the curated index (single writer — the
  main agent); package authors add entries to `docs/references/<package>.md`
  (created by them, merged later) in the same citation style, including what
  the reference is used for and the implementing file.

## @vectorizer/raster

```ts
// resize.ts — area-averaged box downscale. Returns input object unchanged when
// maxDimension is 0 or the image already fits. Never upscales.
export function resizeToFit(image: RasterImage, maxDimension: number): RasterImage

// filters.ts — all return new images, alpha handled sensibly (blur blurs it,
// median/bilateral preserve it).
export function gaussianBlur(image: RasterImage, radius: number): RasterImage // separable, sigma = radius / 2
export function medianFilter(image: RasterImage, radius: number): RasterImage // radius 1 ⇒ 3×3 window, per-channel
export function bilateralFilter(
  image: RasterImage,
  radius: number, // window radius px
  sigmaSpace: number, // px
  sigmaRange: number, // 0..255 RGB euclidean
): RasterImage

// background.ts
export interface FlattenResult {
  image: RasterImage // RGB composited over white (transparent) or backgroundColor (custom)
  opaque: BinaryMask | null // null when fully opaque handling; else 1 = alpha >= alphaThreshold
}
// background 'auto': behaves as 'transparent' if any pixel alpha < 250, else fully opaque.
// 'custom': composite over settings.backgroundColor, opaque = null.
export function flattenImage(
  image: RasterImage,
  settings: Pick<VectorizeSettings, 'background' | 'backgroundColor' | 'alphaThreshold'>,
): FlattenResult
// Most common color among the 1px border frame (for omitBackground detection).
export function borderDominantColor(image: RasterImage): [number, number, number]

// convert.ts
export function toOklabBuffer(image: RasterImage): Float32Array // length w*h*3
export function toGrayscale(image: RasterImage): GrayImage // Oklab L, [0,1]

// quantize.ts
export interface QuantizeOptions {
  k: number // 2..64
  colorSpace: 'oklab' | 'rgb'
  quality: number // 1..10
  seed: number
  mask?: BinaryMask | null // null ⇒ all pixels participate
  autoK?: boolean // merge near-duplicate centroids afterwards
  /**
   * Non-empty ⇒ skip clustering: palette is exactly these '#rrggbb' colors in
   * order (invalid entries dropped; all invalid ⇒ fall back to clustering);
   * pixels labeled by nearest entry in `colorSpace`; `k`/`autoK` ignored;
   * zero-count entries keep their label slot (indices must match).
   */
  fixedPalette?: string[] | null
}
export interface QuantizeResult {
  labels: LabelMap // -1 for masked-out pixels; count = final palette size
  paletteHex: string[] // length count
  paletteRgb: Uint8Array // count*3
  counts: Uint32Array // pixels per label, length count
}
export function quantize(image: RasterImage, opts: QuantizeOptions): QuantizeResult
```

`quantize` requirements:

- First count distinct opaque colors (cap the scan at 1 << 16 distinct). If
  distinct ≤ k: exact palette, direct label assignment (pixel-art fidelity).
- Otherwise k-means++ seeded by `mulberry32(seed)` on a deterministic pixel
  sample (`min(pixels, 20000 + quality * 20000)`), iterations `8 + 3 * quality`,
  early exit when max centroid movement < 1e-4. Distances in `colorSpace`
  (oklab: convert via core; rgb: normalized [0,1] channels).
- Final pass labels every in-mask pixel by nearest centroid.
- `autoK`: after convergence, greedily merge centroid pairs with Oklab distance
  < 0.03 (weighted average), relabel.
- Palette ordered by pixel count descending. Hex via core `rgbToHex`.

```ts
// threshold.ts
export function otsuThreshold(gray: GrayImage, mask?: BinaryMask | null): number // in [0,1], 256-bin
export function binarize(
  gray: GrayImage,
  threshold01: number,
  invert: boolean,
  mask?: BinaryMask | null, // out-of-mask pixels ⇒ 0
): BinaryMask // ink = 1 where gray < threshold (dark on light), XOR invert
export function adaptiveBinarize(
  gray: GrayImage,
  radius: number,
  bias01: number, // subtracted from local mean (settings.adaptiveBias / 255)
  invert: boolean,
  mask?: BinaryMask | null,
): BinaryMask // integral-image local mean, clamped windows at edges

// regions.ts
// 4-connected components of equal label; components smaller than minArea are
// absorbed into the most frequent 4-neighbor label (repeat until stable, max 8
// rounds). -1 stays -1. Mutates and returns `labels`.
export function mergeSmallRegions(labels: LabelMap, minArea: number): LabelMap
export function extractLabelMask(labels: LabelMap, label: number): BinaryMask
export function maskArea(mask: BinaryMask): number

// morphology.ts — square structuring element, radius in px.
export function dilate(mask: BinaryMask, radius: number): BinaryMask
export function erode(mask: BinaryMask, radius: number): BinaryMask
// Remove 8-connected foreground specks < minArea AND fill 4-connected background
// holes < minArea (holes = background components not touching the border).
export function despeckleMask(mask: BinaryMask, minArea: number): BinaryMask

// thin.ts
export function zhangSuenThin(mask: BinaryMask): BinaryMask // classic two-pass thinning
export function chamferDistance(mask: BinaryMask): Float32Array // 3-4 chamfer / 3 ⇒ ~px to background, 0 outside
// Median of 2 × chamferDistance over skeleton pixels; 1 if skeleton empty.
export function estimateStrokeWidth(mask: BinaryMask, skeleton: BinaryMask): number
```

Test expectations (non-exhaustive): quantize on a two-color image returns the
exact two colors; salt-and-pepper noise is removed by `medianFilter`; Otsu on a
bimodal histogram lands between the modes; `zhangSuenThin` reduces a 5px-thick
line to a connected 1px path; `mergeSmallRegions` removes single-pixel speckles;
`resizeToFit` halves cleanly and preserves mean color within 1/255.

## @vectorizer/svg

```ts
export interface SvgShape {
  commands: PathCommand[] // may contain several M…Z subpaths
  fill?: string // '#rrggbb' | 'none'
  fillRule?: 'nonzero' | 'evenodd'
  stroke?: string
  strokeWidth?: number
  strokeLinecap?: 'butt' | 'round' | 'square'
  strokeLinejoin?: 'miter' | 'round' | 'bevel'
  id?: string
}
export interface SvgDocument {
  width: number // px viewBox size
  height: number
  unit: 'px' | 'mm'
  widthMm?: number // when unit 'mm'; 0/undefined ⇒ derive at 96 dpi (px / 96 * 25.4)
  title?: string
  desc?: string
  shapes: SvgShape[]
}
export interface SerializeOptions {
  precision: number // decimals 0..4
  pretty?: boolean // newline per path when true; default compact
  // relative/H/V `d`, collinear-point removal, exact <rect> detection
  // (never larger, same geometry); default false
  optimizePaths?: boolean
  // also emit <circle>/<ellipse> for near-round loops (sub-pixel); keep off for
  // cutout mode, where a neighbor still traces the Bézier edge; default false
  roundPrimitives?: boolean
}
export function serializeSvg(doc: SvgDocument, opts: SerializeOptions): string
export function buildPathData(commands: readonly PathCommand[], precision: number): string
// Shortest `d` for the same geometry as buildPathData: per-command absolute vs
// relative vs H/V selection, quantized on the output grid (drift-free deltas).
export function optimizePathData(commands: readonly PathCommand[], precision: number): string
// Lossless geometry cleanup: exact collinear-vertex removal on the output grid.
export function cleanCommands(commands: readonly PathCommand[], precision: number): PathCommand[]
export type Primitive =
  | { kind: 'rect'; x: number; y: number; width: number; height: number }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
// The primitive a single closed subpath represents, or null. `allowRound` gates
// the sub-pixel circle/ellipse matches; rectangles are always exact.
export function detectPrimitive(
  commands: readonly PathCommand[],
  precision: number,
  allowRound: boolean,
): Primitive | null
export interface SvgAnalysis {
  pathCount: number
  nodeCount: number // draw-command letters [MLHVQCTSAmlhvqctsa] excluding Z/z
  colorCount: number
  palette: string[] // distinct fills+strokes, hex-normalized, no 'none'
  byteLength: number // UTF-8
  width: number | null
  height: number | null // from viewBox
}
export function analyzeSvg(svg: string): SvgAnalysis
```

Serializer requirements:

- Root: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H" width=… height=…>`.
  px unit ⇒ unitless width/height equal to viewBox. mm ⇒ `width="120mm"` style,
  height keeps aspect. Include `<title>` when non-empty (XML-escaped).
- Numbers: `toFixed(precision)` then strip trailing zeros and trailing dot;
  `-0` becomes `0`. Path data uses single spaces, omits the space before a
  negative number, repeats no command letter for runs (`L 1 2 3 4` style is NOT
  required — emitting the letter each time is fine, but no redundant
  whitespace).
- Skip empty-command shapes. Escape title/desc. Output must parse as XML.
- `analyzeSvg` is regex-based (no DOM) and must work on our own serializer
  output; treat both `fill="…"` attributes and `fill:#…` style declarations.

Tests: golden small document; precision edge cases (0.5 → ".5"? No: "0.5" is
fine, just no trailing zeros); mm height keeps aspect ratio; analyzeSvg
round-trips path/node/color counts of a serialized document.

## @vectorizer/ml

Browser-only package (the app imports it lazily). `onnxruntime-web` must be
loaded via dynamic `import()` inside the factory functions so the main bundle
stays lean. Public surface:

```ts
export type MlBackend = 'webgpu' | 'wasm'
export interface MlAvailability {
  available: boolean
  backend: MlBackend | null
  reason?: string
}
export function detectBackend(): Promise<MlAvailability>

export interface ModelSpec {
  id: 'u2netp' | 'slimsam-encoder' | 'slimsam-decoder'
  url: string
  approxBytes: number
  license: string
}
export const MODEL_REGISTRY: Record<ModelSpec['id'], ModelSpec>
export function overrideModelUrl(id: ModelSpec['id'], url: string): void

export type MlProgress =
  | { phase: 'download'; id: string; loaded: number; total: number }
  | { phase: 'compile' }
  | { phase: 'run' }
export type MlProgressFn = (p: MlProgress) => void

export class ModelStore {
  // Cache Storage 'vectorizer-models-v1'
  fetch(spec: ModelSpec, onProgress?: MlProgressFn): Promise<ArrayBuffer>
  usage(): Promise<{ models: number; bytes: number }>
  clear(): Promise<void>
}

export class BackgroundRemover {
  static create(onProgress?: MlProgressFn): Promise<BackgroundRemover>
  run(
    image: RasterImage,
    opts?: { threshold?: number; feather?: number; onProgress?: MlProgressFn },
  ): Promise<{ image: RasterImage; matte: GrayImage }>
  dispose(): void
}

export class MagicSegmenter {
  static create(onProgress?: MlProgressFn): Promise<MagicSegmenter>
  setImage(image: RasterImage, onProgress?: MlProgressFn): Promise<void>
  segment(points: ReadonlyArray<{ x: number; y: number; label: 0 | 1 }>): Promise<{
    mask: BinaryMask
    score: number
  }>
  dispose(): void
}
```

Implementation notes:

- Models: u2netp from
  `https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx`
  (~4.6 MB, Apache-2.0); SlimSAM quantized encoder/decoder from
  `https://huggingface.co/Xenova/slimsam-77-uniform/resolve/main/onnx/vision_encoder_quantized.onnx`
  and `…/onnx/prompt_encoder_mask_decoder_quantized.onnx` (Apache-2.0).
- ORT env: import `onnxruntime-web`; set `env.wasm.wasmPaths` from
  `import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url'`
  and the matching `.mjs?url` (shape `{ wasm: …, mjs: … }` — note the package's
  export map exposes these WITHOUT a `dist/` prefix);
  `env.wasm.numThreads = 1` unless `crossOriginIsolated`. Execution providers:
  try `['webgpu']`, fall back to `['wasm']`; report the chosen backend.
- u2netp: bilinear resize to 320×320, `x = (c/255 / max) − mean) / std` with
  ImageNet mean/std (match rembg preprocessing: divide by the max channel value
  first), NCHW float32. Output `d0` → min-max normalize → bilinear upsample to
  source size → matte. Alpha = smoothstep around `threshold` (default 0.5) with
  `feather` (default 0.05) half-width; output image keeps RGB, alpha ×= matte.
- SlimSAM: SAM preprocessing (longest side → 1024 bilinear, ImageNet-style SAM
  mean `[123.675, 116.28, 103.53]` / std `[58.395, 57.12, 57.375]`, pad
  bottom/right to 1024×1024). Introspect `session.inputNames`/`outputNames` at
  runtime and wire by name, so encoder outputs (`image_embeddings`, possibly
  `image_positional_embeddings`) flow into the decoder along with
  `input_points` `[1,1,N,2]` float32 in 1024-space and `input_labels` `[1,1,N]`
  (try int64 BigInt64Array, fall back to float32 if the model rejects it).
  Decoder output `pred_masks` `[1,1,3,256,256]` + `iou_scores`: pick the best
  channel, bilinear upsample to 1024, crop the padded region, resize to source
  size, threshold at 0 → BinaryMask.
- Everything must fail soft with a typed error message (offline, blocked CDN,
  no WebAssembly) — the app shows `reason` and continues without ML.
- Unit-test the pure helpers (resize/normalize/smoothstep/argmax and the
  letterbox coordinate mapping) in Node with fabricated tensors; do NOT try to
  run ORT in tests.

## @vectorizer/engine (for reference — implemented by the main agent)

Worker protocol used by the app:

```ts
export type WorkerInMessage =
  | {
      type: 'vectorize'
      id: number
      width: number
      height: number
      buffer: ArrayBuffer
      settings: VectorizeSettings
    }
  | { type: 'cancel'; id: number }
export type WorkerOutMessage =
  | { type: 'progress'; id: number; stage: StageId; overall: number }
  | { type: 'result'; id: number; result: VectorizeResult }
  | { type: 'error'; id: number; message: string; cancelled: boolean }

export function installWorkerHandler(scope: {
  addEventListener(type: 'message', fn: (ev: { data: unknown }) => void): void
  postMessage(msg: unknown, transfer?: Transferable[]): void
}): void

export class VectorizerClient {
  constructor(createWorker: () => Worker)
  /** Latest-wins: starting a new run cancels the pending one (rejects CancelledError). */
  vectorize(
    image: RasterImage,
    settings: VectorizeSettings,
    onProgress?: (stage: StageId, overall: number) => void,
  ): Promise<VectorizeResult>
  dispose(): void
}
export function createNativeEngine(): VectorizerEngine
export function vectorize(
  image: RasterImage,
  settings: VectorizeSettings,
  ctx?: EngineContext,
): Promise<VectorizeResult>
```

## @vectorizer/assist (reference — implemented by the main agent)

```ts
export interface ImageAnalysis {
  /* see packages/assist/src */
}
export function analyzeImage(image: RasterImage): ImageAnalysis
export function recommendSettings(
  a: ImageAnalysis,
  goal?: ProfileId | 'auto',
): {
  profileId: ProfileId
  patch: Partial<VectorizeSettings>
  rationale: string[]
}
export interface PaletteSuggestion {
  id: string
  label: string
  colors: string[]
  description: string
}
/** Candidate palettes derived from image statistics (adaptive sizes, vivid,
 *  muted, mono ramp, exact colors when few). Synchronous, ~100-300ms. */
export function suggestPalettes(image: RasterImage, analysis?: ImageAnalysis): PaletteSuggestion[]
```
