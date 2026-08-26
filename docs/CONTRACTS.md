# Package contracts

Authoritative API surface each package must export. `@trazor/core` (already
implemented — read it first) defines the shared vocabulary: `RasterImage`,
`GrayImage`, `BinaryMask`, `LabelMap`, `PathCommand`, `VectorizeSettings`,
`VectorizeResult`, `TrazorEngine`, color/geometry helpers, `mulberry32`.

Rules that apply to every package:

- Pure TypeScript, strict mode, ESM, no runtime dependencies beyond what the
  package.json already declares. No DOM APIs outside `@trazor/ml` and
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

## @trazor/core — settings import/export

```ts
// settings-io.ts — portable, versioned settings snapshots (studio import/export).
// Bumped when the shape changes incompatibly; readers accept any version and
// drop unknown fields, so a newer minor-version document still imports.
export const SETTINGS_EXPORT_VERSION: number

export interface SettingsExport {
  app: 'trazor'
  kind: 'settings'
  version: number
  settings: VectorizeSettings
  activeProfileId: ProfileId | null
  profileModified: boolean
}
export interface ImportedSettings {
  settings: VectorizeSettings
  activeProfileId: ProfileId | null
  profileModified: boolean
}

export function createSettingsExport(
  settings: VectorizeSettings,
  activeProfileId?: ProfileId | null,
  profileModified?: boolean,
): SettingsExport
// Indented JSON (trailing newline) for a file or the clipboard.
export function serializeSettings(
  settings: VectorizeSettings,
  activeProfileId?: ProfileId | null,
  profileModified?: boolean,
): string
// Accepts the export wrapper or a bare settings object. Keeps only fields the
// schema defines (derived from DEFAULT_SETTINGS), clamps via normalizeSettings,
// and validates the profile id. Throws an Error with a readable message when the
// input is not usable (invalid JSON, not an object, no recognizable settings).
export function parseSettingsImport(input: string): ImportedSettings
```

## @trazor/core — gradient paint model

```ts
// paint.ts — gradient fills (mesh-free: standard SVG paint servers). Coordinates
// are user space (the viewBox pixel space the paths use), so the serializer
// emits gradientUnits="userSpaceOnUse".
export interface GradientStop {
  offset: number // 0..1 along the ramp
  color: string // '#rrggbb'
}
export interface LinearGradientPaint {
  kind: 'linear'
  x1: number
  y1: number
  x2: number
  y2: number
  stops: GradientStop[]
}
export interface RadialGradientPaint {
  kind: 'radial'
  cx: number
  cy: number
  r: number
  stops: GradientStop[]
}
export type GradientPaint = LinearGradientPaint | RadialGradientPaint
```

## @trazor/raster

```ts
// resize.ts — area-averaged box downscale. Returns input object unchanged when
// maxDimension is 0 or the image already fits. Never upscales.
export function resizeToFit(image: RasterImage, maxDimension: number): RasterImage
// Bilinear single-channel resize (e.g. an edge hint → the working resolution).
export function resizeGray(image: GrayImage, width: number, height: number): GrayImage

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
  // Restricts which in-mask pixels train the centroids (1 = eligible); every
  // in-mask pixel is still labeled. Filters anti-aliased boundary pixels out of
  // clustering. Ignored on the exact/fixed paths; dropped when too few pixels
  // remain eligible. Absent ⇒ byte-identical to sampling all in-mask pixels.
  sampleMask?: BinaryMask | null
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
// segment.ts — region-growing alternative to global quantization (flat art)
export interface SegmentOptions {
  flatThreshold?: number // Oklab gradient below which a pixel is a flat-region interior (marker); default 0.02
  mergeThreshold?: number // fold regions whose mean Oklab ΔE is under this; default 0.1
  minRegionArea?: number // regions below this (px) fold into their most similar neighbor; default 16
  maxRegions?: number // soft cap: fold the closest pair (within 2·mergeThreshold) until met; 0 = none
  mask?: BinaryMask | null // only in-mask pixels segmented; others get -1
}
export interface SegmentResult {
  labels: LabelMap // compact 0..count-1; -1 masked-out (mirrors QuantizeResult)
  paletteHex: string[]
  paletteRgb: Uint8Array // count*3
  counts: Uint32Array
}
export function segmentRegions(image: RasterImage, opts?: SegmentOptions): SegmentResult

// gradient.ts — linear + radial color-ramp detection (color/grayscale).
// Adjacent quantized bands that lie on one Oklab ramp are merged into a single
// region (mutating `labels`) and returned as a per-label gradient paint (linear
// for straight ramps, radial for concentric ones). Geometry is unchanged
// (mesh-free) so the tracer and cutout partition are untouched; a run with no
// detectable ramp returns all-null and leaves `labels` unchanged.
export interface GradientOptions {
  minArea?: number // min pixel area of a merged ramp to become a gradient (default 0)
  maxBacktrack?: number // max fraction of the ramp's color path that may run backwards (lower = stricter; keeps flat/reversing neighbors out)
  minColorSpan?: number // min total Oklab color change to qualify (higher = only strong ramps)
  oklab?: Float32Array // interleaved Oklab for `image` (w*h*3); computed if absent
}
export interface GradientResult {
  gradients: (GradientPaint | null)[] // per (rewritten) label; length = labels.count
}
export function fitRegionGradients(
  image: RasterImage,
  labels: LabelMap,
  opts?: GradientOptions,
): GradientResult
```

`segmentRegions` requirements (marker-controlled watershed; Meyer 1991):

- Oklab gradient = max ΔE to any 4-neighbor. Markers are 4-connected components
  of in-mask pixels with gradient < `flatThreshold`, each seeded with its mean.
- A priority flood (binary min-heap keyed by Oklab distance to the claiming
  marker's mean; ties by pixel index) grows markers over the remaining
  edge/ramp pixels — an anti-aliased ramp splits between its two neighbors, so
  no third color is ever created on a boundary.
- A region-adjacency-graph merge folds adjacent pairs under `mergeThreshold` and
  regions under `minRegionArea` (closest first), then consolidates non-adjacent
  near-duplicates globally; `maxRegions` folds the closest pair only within a
  perceptual ceiling, so a budget never collapses genuinely different hues.
- Fully deterministic (fixed scan/neighbor order, index tie-break, sorted merge
  candidates). Result mirrors `QuantizeResult` so the engine consumes it
  identically. Selected by `VectorizeSettings.segmentation === 'regions'`.

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
export function signedThresholdField(
  gray: GrayImage,
  threshold01: number,
  invert: boolean,
): GrayImage // centered coverage in [-0.5, 0.5]: +inside/−outside, 0 at the crossing; feeds trace `coverage`
export function signedAdaptiveField(
  gray: GrayImage,
  radius: number,
  bias01: number,
  invert: boolean,
): GrayImage // signedThresholdField with the per-pixel adaptive level (local mean − bias); feeds trace `coverage` in adaptive bw mode

// regions.ts
// 4-connected components of equal label; components smaller than minArea are
// absorbed into the most frequent 4-neighbor label (repeat until stable, max 8
// rounds). -1 stays -1. Mutates and returns `labels`.
export interface MergeOptions {
  oklab?: Float32Array // palette colors in Oklab, length count*3, indexed by label
  keepContrast?: number // keep a small region when its Oklab ΔE to the target ≥ this (needs oklab)
  protect?: BinaryMask // 1 = keep this pixel's small region even below minArea (edge hint)
}
// With opts, small regions are kept instead of absorbed when high-contrast
// (keepContrast+oklab) or on a protected edge pixel (protect).
export function mergeSmallRegions(labels: LabelMap, minArea: number, opts?: MergeOptions): LabelMap
// Dissolve 1px mislabeled boundary bands (an anti-aliased/JPEG rim quantized to a
// third color) into the dominant neighbor region over `rounds` simultaneous
// passes. Ties resolve to the smallest label id; `protect` pixels and -1 are
// never moved; rounds <= 0 is a no-op. Opt-in via the `dissolveBands` setting
// (default 0). Mutates and returns `labels`.
export function dissolveThinBands(labels: LabelMap, rounds: number, protect?: BinaryMask): LabelMap
// Spatially-coherent label relaxation (ICM over a Potts MRF): re-assign each pixel
// to the label minimizing squared-Oklab color cost + `lambda` * disagreeing
// 8-neighbors, over `rounds` simultaneous passes. Candidates are the pixel's own
// label plus its neighbors', so the palette is untouched and rim mixtures join a
// real neighboring region instead of a third color. `imageOklab` is n*3,
// `paletteOklab` count*3; `protect` pixels and -1 never move; `lambda`<=0 or
// `rounds`<=0 is a no-op. Opt-in via the `colorCoherence` setting. Mutates `labels`.
export function smoothLabelsSpatial(
  labels: LabelMap,
  imageOklab: Float32Array,
  paletteOklab: Float32Array,
  lambda: number,
  rounds: number,
  protect?: BinaryMask,
): LabelMap
// Set to -1 the components of `label` connected (4-connected) to the image
// border; interior same-color regions survive. Mutates labels, returns the
// count cleared. Used by omitBackground so enclosed same-color shapes are kept.
export function clearBorderLabel(labels: LabelMap, label: number): number
export function extractLabelMask(labels: LabelMap, label: number): BinaryMask
export function maskArea(mask: BinaryMask): number
export interface EnclosedComponent {
  label: number // the component's own label
  surround: number // the single label that fully surrounds it
  pixels: Int32Array // pixel indices, row-major
}
// 4-connected components fully enclosed by a single other label — every outside
// neighbor is that one label, and the component touches neither the image border
// nor a -1 pixel (an eye's pupil, a dot in a field). A connective outline is not
// enclosed, so never returned. Deterministic (row-major discovery order).
export function findEnclosedComponents(labels: LabelMap): EnclosedComponent[]

// edges.ts — 1 where the L1 RGB difference to any 4-neighbor is ≥ threshold
// (0..765). Brackets both sides of an anti-aliased boundary; feeds quantize's
// sampleMask so rim mixtures stay out of the palette. Deterministic.
export function detectEdges(image: RasterImage, threshold: number): BinaryMask

// morphology.ts — square structuring element, radius in px.
export function dilate(mask: BinaryMask, radius: number): BinaryMask
export function erode(mask: BinaryMask, radius: number): BinaryMask
// Remove 8-connected foreground specks < minArea AND fill 4-connected background
// holes < minArea (holes = background components not touching the border).
export function despeckleMask(mask: BinaryMask, minArea: number): BinaryMask
// As despeckleMask, but a component overlapping `protect` (1 = protected) is kept
// even below minArea; `protect` null reproduces despeckleMask byte-for-byte.
export function despeckleMaskGuided(
  mask: BinaryMask,
  minArea: number,
  protect: BinaryMask | null,
): BinaryMask

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

## @trazor/svg

```ts
export interface SvgShape {
  commands: PathCommand[] // may contain several M…Z subpaths
  fill?: string // '#rrggbb' | 'none' | 'url(#id)' (a doc.defs gradient)
  fillRule?: 'nonzero' | 'evenodd'
  stroke?: string
  strokeWidth?: number
  strokeLinecap?: 'butt' | 'round' | 'square'
  strokeLinejoin?: 'miter' | 'round' | 'bevel'
  id?: string
  layerId?: number // stacking layer (paint order); groups a cut layer under groupByLayer
}
// A gradient paint server plus the id a shape references it by (fill: 'url(#id)').
export type SvgGradient = GradientPaint & { id: string }
export interface SvgDocument {
  width: number // px viewBox size
  height: number
  unit: 'px' | 'mm'
  widthMm?: number // when unit 'mm'; 0/undefined ⇒ derive at 96 dpi (px / 96 * 25.4)
  title?: string
  desc?: string
  defs?: SvgGradient[] // gradient paint servers referenced by shape fills (emitted in <defs>)
  shapes: SvgShape[]
}
export interface SerializeOptions {
  precision: number // decimals 0..4
  pretty?: boolean // newline per path when true; default compact
  // relative/H/V `d`, collinear-point removal, exact <rect> detection, and
  // merging consecutive same-paint paths (never larger, same geometry); default false
  optimizePaths?: boolean
  // also emit <circle>/<ellipse> for near-round loops and collapse near-circular
  // Bézier runs to `A` arcs (both sub-pixel); keep off for cutout mode, where a
  // neighbor still traces the Bézier edge; default false
  roundPrimitives?: boolean
  // wrap each paint color's shapes in its own <g id="layer-N"><title>#hex</title>
  // (first-appearance order) so cut/print tools read one layer per color; default false
  groupByColor?: boolean
  // wrap each stacking layer (a run of shapes sharing layerId) in its own <g>, in
  // paint order — keeps a color that recurs at two heights (a base outline and a
  // pupil island above it) as separate layers. Takes precedence over groupByColor.
  groupByLayer?: boolean
}
export function serializeSvg(doc: SvgDocument, opts: SerializeOptions): string
export function buildPathData(commands: readonly PathCommand[], precision: number): string
// Shortest `d` for the same geometry as buildPathData: per-command absolute vs
// relative vs H/V selection, quantized on the output grid (drift-free deltas).
export function optimizePathData(commands: readonly PathCommand[], precision: number): string
// Lossless geometry cleanup: exact collinear-vertex removal on the output grid.
export function cleanCommands(commands: readonly PathCommand[], precision: number): PathCommand[]
// Collapse every run of ≥2 consecutive cubics that lie on one circle or ellipse
// into a single `A` arc (radii/rotation/endpoint snapped to the precision grid);
// non-arc runs pass through. serializeSvg applies this when roundPrimitives is set.
export function fitArcs(commands: readonly PathCommand[], precision: number): PathCommand[]
export type Primitive =
  | { kind: 'rect'; x: number; y: number; width: number; height: number }
  | { kind: 'rrect'; x: number; y: number; width: number; height: number; r: number } // circular corners → <rect rx>
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; angle?: number } // angle (deg) ⇒ rotated, emitted as <ellipse> + rotate transform
  | { kind: 'polygon'; points: { x: number; y: number }[] } // regularized regular polygon / star → <polygon>
// The primitive a single closed subpath represents, or null. `allowRound` gates
// the sub-pixel circle/ellipse and regular-polygon/star matches; rectangles are always exact.
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
export type SvgElementKind =
  'path' | 'rect' | 'circle' | 'ellipse' | 'line' | 'polyline' | 'polygon'
export interface SvgGeometryShape {
  kind: SvgElementKind // source element, so an overlay can tint primitives apart
  commands: PathCommand[] // absolute M/L/Q/C/Z for this element
  fill: string | null // authored fill ('#rrggbb' | 'none' | …); null if absent
  stroke: string | null // authored stroke; null if absent
  id: string | null // id attribute; null if absent
}
export interface SvgGeometry {
  width: number | null // viewBox size (overlay coordinate space)
  height: number | null
  shapes: SvgGeometryShape[] // one per drawable element, in document order
}
// Decode SVG text back into the absolute path model for inspection overlays
// (anchor points, Bézier handles, outlines). Regex-based, no DOM; exact on our
// serializer output, best-effort on foreign SVGs. Paths resolve relative/H/V/S/T
// shorthands to absolute M/L/Q/C/Z (arcs `A` expand to cubics); rect/circle/
// ellipse/line/polyline/polygon convert to equivalent commands (round primitives
// via the 4-Bézier kappa arc); a `rotate(a [cx cy])` transform (what the
// serializer emits) is applied.
export function extractGeometry(svg: string): SvgGeometry
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

## @trazor/ml

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
  id: 'u2netp' | 'slimsam-encoder' | 'slimsam-decoder' | 'edge-prepass' | 'cleanup'
  url: string // absolute https for third-party models; project-relative for edge-prepass/cleanup (same-origin)
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
  // Cache Storage 'trazor-models-v1'
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

export class EdgeEnhancer {
  // Optional Tier-2 edge/boundary pre-pass (docs/EDGE_PREPASS.md).
  // preferBackend 'wasm' pins the deterministic backend (reproducible mode).
  static create(opts?: {
    preferBackend?: MlBackend
    onProgress?: MlProgressFn
  }): Promise<EdgeEnhancer>
  // Boundary probability map ([0,1]) at the input resolution; large images are tiled.
  run(image: RasterImage, opts?: { onProgress?: MlProgressFn }): Promise<{ edges: GrayImage }>
  dispose(): void
}

export class CleanupEnhancer {
  // Optional Tier-2 image→image cleanup pre-pass (docs/CLEANUP_PREPASS.md).
  // preferBackend 'wasm' pins the deterministic backend (reproducible mode).
  static create(opts?: {
    preferBackend?: MlBackend
    onProgress?: MlProgressFn
  }): Promise<CleanupEnhancer>
  // Cleaned RGB at the input resolution (source alpha preserved); large images are tiled.
  run(image: RasterImage, opts?: { onProgress?: MlProgressFn }): Promise<{ image: RasterImage }>
  dispose(): void
}

export class FieldEnhancer {
  // Optional signed-coverage pre-pass (docs/SIGNED_FIELD_PREPASS.md). Tier-1-touching
  // (feeds sub-pixel refinement); preferBackend 'wasm' pins reproducible mode.
  static create(opts?: {
    preferBackend?: MlBackend
    onProgress?: MlProgressFn
  }): Promise<FieldEnhancer>
  // Coverage field ([0,1] GrayImage, 0.5 = boundary) at the input resolution; large images are tiled.
  run(image: RasterImage, opts?: { onProgress?: MlProgressFn }): Promise<{ field: GrayImage }>
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

## @trazor/engine (for reference — implemented by the main agent)

Each `VectorizeResult.warning` (`@trazor/core`) carries a stable `code`, an English `message`, and an
optional `params: Record<string, string | number>` — the values interpolated into `message`, so a UI can
localize it from `code` + `params` (the studio does; `message` stays the fallback).

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
      edgeHint?: ArrayBuffer // optional Float32 plane, width×height, transferred
      coverageHint?: ArrayBuffer // optional learned coverage field ([0,1]), Float32 plane, transferred
      imageId?: number // stable per working-image identity; lets the worker reuse cached preprocess/palette work
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

export class TrazorClient {
  constructor(createWorker: () => Worker)
  /** Latest-wins: starting a new run cancels the pending one (rejects CancelledError). */
  vectorize(
    image: RasterImage,
    settings: VectorizeSettings,
    onProgress?: (stage: StageId, overall: number) => void,
    edgeHint?: GrayImage, // optional boundary hint, same dimensions as `image`
    coverageHint?: GrayImage, // optional learned coverage field (bw sub-pixel refinement), same dimensions
  ): Promise<VectorizeResult>
  dispose(): void
}
export function createNativeEngine(): TrazorEngine
export function vectorize(
  image: RasterImage,
  settings: VectorizeSettings,
  // ctx.edgeHint (GrayImage, optional) is an on-device boundary hint honored in
  // bw/color modes to protect detail; ctx.coverageHint (GrayImage [0,1], optional)
  // is a learned signed-coverage field used as the bw sub-pixel `coverage`
  // (Tier-1-touching). Absent, tracing is byte-identical to the classical path.
  ctx?: EngineContext,
  // Optional worker-side reuse of preprocess/palette intermediates across runs.
  // The worker owns a single StageCache and passes a stable imageId; reuse is
  // byte-identical to recomputation (deterministic stages, complete keys) and is
  // disabled while an edge hint is present. Omit for a stateless run.
  opts?: { imageId?: number; cache?: StageCache },
): Promise<VectorizeResult>
// StageCache is an opaque worker-owned holder: one preprocessed-image entry plus
// a small LRU of palette/label entries (keyed internally by imageId + settings
// slices), so alternating palettes on one worker stay warm. Instantiate as `{}`.
// `stats` exposes hit/miss counters for measuring cache/affinity effectiveness.
export interface StageCache {
  /* engine-internal fields */ stats?: StageCacheStats
}
export interface StageCacheStats {
  preHits: number
  preMisses: number
  palHits: number
  palMisses: number
}

// pool.ts — a fixed worker pool for throughput work (the settings search).
// Unlike TrazorClient (latest-wins), every run() is queued and resolved
// independently; a freed worker prefers the next queued job matching its last
// affinityKey (its StageCache stays warm), else FIFO. Each worker keeps its own
// cache; jobs for the same image object carry a stable imageId internally.
export interface PoolJobOptions {
  /** Preprocess+palette settings slice — the pool routes matching jobs to a warm worker. */
  affinityKey?: string
  onProgress?: (stage: StageId, overall: number) => void
  edgeHint?: GrayImage
  coverageHint?: GrayImage
}
export class TrazorPool {
  constructor(createWorker: () => Worker, size: number)
  readonly size: number
  /** Queue a candidate; resolves with its result, independent of other jobs. */
  run(
    image: RasterImage,
    settings: VectorizeSettings,
    opts?: PoolJobOptions,
  ): Promise<VectorizeResult>
  /** Reject every queued and in-flight job with CancelledError. */
  cancelAll(): void
  dispose(): void
}
```

## @trazor/tune

The automatic settings search (the "Auto-optimize" studio tool). Pure
TypeScript, depends only on `@trazor/core`, no DOM — the caller (the app) traces
candidates in a worker pool and feeds metrics back, so the strategy is
deterministic and unit-testable in Node. Determinism is two-tier, like the ML
stages: the trace of any settings is byte-identical everywhere, but the fidelity
_scores_ depend on the browser's SVG rasterizer, so the chosen winner can differ
across browsers (the same standing as the fidelity score in the stats bar).

The search runs round-based: round 0 seeds (baseline + assist/profile seeds +
each suggested palette + a Latin-hypercube fill), then adaptive coordinate
descent over the incumbent — probe one parameter at a time, expand the step on
success and shrink on failure, with a palette swap, recombination, and (on
stagnation) a seeded restart. Descent order is seeded from per-parameter
sensitivity measured across the seed round.

```ts
// score.ts — objectives mapped to 0..1 utilities.
export type ObjectiveId = 'fidelity' | 'simplicity' | 'fileSize' | 'colorEconomy' | 'cleanliness'
export const OBJECTIVE_IDS: readonly ObjectiveId[]
export type TuneWeights = Record<ObjectiveId, number> // 0 = don't care; normalized internally
export interface CandidateMetrics {
  meanDeltaE: number // mean Oklab ΔE of the rendered SVG vs the source
  nodeCount: number
  pathCount: number
  byteLength: number
  colorCount: number
  warnings: readonly VectorizeWarning[]
  durationMs: number
}
export function fidelityUtility(meanDeltaE: number): number // clamp(1 − 4·ΔE, 0, 1)
export function cleanlinessUtility(warnings: readonly VectorizeWarning[]): number
export function isEmptyResult(metrics: CandidateMetrics): boolean
export function utilitiesOf(m: CandidateMetrics, baseline: CandidateMetrics): Record<ObjectiveId, number>
// The weight-normalized sum of the utilities. Fidelity is absolute; the
// "fewer is better" axes anchor at 0.5 for the baseline candidate.
export function scoreCandidate(
  metrics: CandidateMetrics,
  baseline: CandidateMetrics,
  weights: TuneWeights,
): { score: number; utilities: Record<ObjectiveId, number> }

// params.ts — the tunable parameter space (metadata, not hardcoded loops).
export interface ParamSpec {
  key: TunableKey
  kind: 'number' | 'int' | 'bool' | 'enum'
  min?: number
  max?: number
  scale?: 'linear' | 'log' // step arithmetic domain; log needs min > 0
  values?: readonly string[] // enum choices
  modes?: readonly VectorizeMode[] // absent ⇒ every mode
  group: 'preprocess' | 'palette' | 'binarize' | 'curve' | 'output' // cost tier a change invalidates
  when?: (s: VectorizeSettings) => boolean // only meaningful under these settings
  optIn?: boolean // held unless listed in TuneOptions.free
}
export type TunableKey = /* keyof VectorizeSettings minus identity/cosmetic fields */
export const TUNABLE_PARAMS: readonly ParamSpec[]
export const DEFAULT_FREE: readonly TunableKey[] // the non-opt-in keys
export function specFor(key: TunableKey): ParamSpec
export function applicableParams(keys: readonly TunableKey[], mode: VectorizeMode, s: VectorizeSettings): ParamSpec[]
export function toUnit(spec: ParamSpec, value: number): number // value → [0,1] search coord
export function fromUnit(spec: ParamSpec, unit: number): number // [0,1] → valid value
export function settingsKey(s: VectorizeSettings): string // canonical dedup key (normalized)

// resolution.ts — px-scaling for the draft pre-screen (large-image search).
// Scale a settings object's resolution-dependent fields for a trace whose long
// side changes by `factor`: pixel lengths (blur/radius/prune/tolerances) ×factor,
// the area threshold minRegionArea ×factor²; angles, levels, counts, ratios,
// enums and booleans untouched. Re-normalized. Lets a search run at a cheap draft
// resolution and re-trace the winners at full size with equivalent parameters.
export function scaleSettingsForResolution(settings: VectorizeSettings, factor: number): VectorizeSettings

// search.ts — the deterministic, round-based state machine.
export type CandidateOrigin =
  'baseline' | 'assist' | 'profile' | 'sample' | 'step' | 'recombine' | 'restart' | 'palette'
export interface TuneCandidate { id: number; settings: VectorizeSettings; origin: CandidateOrigin; tweaked?: TunableKey }
export interface ScoredCandidate extends TuneCandidate {
  metrics: CandidateMetrics
  utilities: Record<ObjectiveId, number>
  score: number
  rejected?: 'empty' | 'fidelity-floor'
  svg?: string // the traced SVG, carried through for the results wall (opaque to the search)
}
export interface CandidateResult { id: number; metrics: CandidateMetrics; svg?: string }
export interface SeedPatch { patch: Partial<VectorizeSettings>; origin?: CandidateOrigin }
export interface TuneOptions {
  weights: TuneWeights
  iterations: number // budget: novel candidates to evaluate
  seed: number // whole search is deterministic in it
  roundSize: number // candidates per round (≈ 2 × workers)
  free?: readonly TunableKey[] // defaults to DEFAULT_FREE
  minFidelity?: number // reject candidates below this fidelity utility
  seeds?: readonly SeedPatch[] // extra round-0 starts (assist / profiles)
  palettes?: readonly (readonly string[])[] // suggested fixed palettes as a categorical choice (color mode)
}
export class TuneSearch {
  constructor(base: VectorizeSettings, opts: TuneOptions)
  nextRound(): TuneCandidate[] // next novel batch; [] when spent or converged
  report(results: readonly CandidateResult[]): void // barrier: the full emitted round
  best(): ScoredCandidate | null
  results(): readonly ScoredCandidate[] // every scored candidate (the comparison wall)
  paretoFront(): readonly ScoredCandidate[] // non-dominated over fidelity/simplicity/colorEconomy
  progress(): { evaluated: number; total: number; converged: boolean }
}
export function latinHypercube(n: number, dims: number, rand: () => number): number[][]
```

## @trazor/assist (reference — implemented by the main agent)

```ts
export interface ImageAnalysis {
  /* see packages/assist/src */
}
export function analyzeImage(image: RasterImage): ImageAnalysis
// A machine-readable reason: a stable `code` plus any numeric values it
// interpolates, so a UI can localize it (the app translates `code` + `params`).
export interface RationaleKey {
  code: string
  params?: Record<string, number>
}
export function recommendSettings(
  a: ImageAnalysis,
  goal?: ProfileId | 'auto',
): {
  profileId: ProfileId
  patch: Partial<VectorizeSettings>
  rationale: string[] // English sentences (non-UI callers, tests)
  rationaleKeys: RationaleKey[] // same reasons as codes+params, for localization
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
