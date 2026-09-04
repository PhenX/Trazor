import {
  CancelledError,
  DEFAULT_SETTINGS,
  deltaEOkSq,
  hexToRgb,
  mmPerPx,
  normalizeSettings,
  nowMs,
  rgbToOklab,
} from '@trazor/core'
import type {
  BinaryMask,
  EngineContext,
  GradientPaint,
  GrayImage,
  LabelMap,
  PathCommand,
  RasterImage,
  StageId,
  StageTiming,
  TurnPolicy,
  VectorizeMode,
  VectorizeResult,
  VectorizeSettings,
  VectorizeWarning,
  TrazorEngine,
  TraceChart,
  TraceStep,
  VectorDocument,
  VectorGradient,
  VectorShape,
} from '@trazor/core'
import {
  luminanceHistogram,
  maskFraction,
  nodesPerColorBars,
  nodesPerShapeHistogram,
  nonEmptyLabelCount,
  palettePopulationBars,
  rasterFromImage,
  rasterFromLabels,
  rasterFromMask,
  regionAreaHistogram,
  totalNodes,
} from './trace'
import {
  adaptiveBinarize,
  bilateralFilter,
  binarize,
  borderDominantColor,
  chamferDistance,
  clearBorderLabel,
  detectEdges,
  despeckleMaskGuided,
  dissolveThinBands,
  estimateStrokeWidth,
  findEnclosedComponents,
  fitRegionGradients,
  flattenImage,
  gaussianBlur,
  medianFilter,
  mergeSmallRegions,
  otsuThreshold,
  quantize,
  resizeGray,
  resizeToFit,
  segmentRegions,
  signedAdaptiveField,
  signedThresholdField,
  smoothLabelsSpatial,
  toGrayscale,
  toOklabBuffer,
  zhangSuenThin,
} from '@trazor/raster'
import {
  assembleRegions,
  decomposeMask,
  extractChains,
  ringPolygon,
  shapesFromPaths,
  traceCenterline,
  traceLabelMap,
} from '@trazor/trace'
import type { ChainFit, CrackPath, FlatPoints, RegionShape, TracedShape } from '@trazor/trace'
import { analyzeSvg, fitArcs, serializeSvg } from '@trazor/svg'
import type { ShapeOut, SvgGradient, SvgShape } from '@trazor/svg'
import type { HelperPool, StackPlanPayload } from './helper-pool'
import type {
  HelperCurveOptions,
  HelperSerializeOptions,
  HelperShapeMeta,
  HelperUnitPaint,
} from './protocol'

const QUANTIZE_SEED = 0x02f6e2b1

/** Oklab ΔE above which a small region counts as a keep-worthy detail. */
const DETAIL_CONTRAST = 0.1

/**
 * Stacked layering lifts an enclosed pocket onto its own top layer only when at
 * least this many sheets would otherwise stack over it (each with a hole cut for
 * the pocket). One sheet's single hole weeds and aligns fine; two or more drift.
 */
const MIN_LIFT_DEPTH = 2

/** Coherence relaxation strength (squared-Oklab per disagreeing neighbor) at colorCoherence 1. */
const COHERENCE_LAMBDA = 0.03
/** Coherence relaxation passes. */
const COHERENCE_ROUNDS = 4

/** Boundary-map probability above which a pixel counts as a protected edge. */
const EDGE_PROTECT_THRESHOLD = 0.5

/**
 * Most intermediate trace snapshots to stream while stacked layers accumulate, so
 * the studio timeline can replay the shapes building up with real per-batch
 * timing. Throttles the emit so a many-layer image does not flood the stream.
 */
const TRACE_SNAPSHOTS = 10

/**
 * L1 RGB gradient (0..765) at or above which a pixel is treated as an
 * anti-aliased boundary and kept out of the color-clustering training sample,
 * so rim mixtures cannot claim a palette entry.
 */
const CLUSTER_EDGE_THRESHOLD = 40

/**
 * Oklab ΔE below which region-growing segmentation folds two regions into one
 * color. Perceptual-distance gated, so it merges near-duplicates and splits of
 * one color but never collapses genuinely different hues together.
 */
const SEGMENT_MERGE_THRESHOLD = 0.1

/**
 * Size-aware merge strength for region growing (Nock & Nielsen 2004). The merge
 * tolerance shrinks with region area, so a small anti-alias sliver still folds
 * into its neighbor while two large regions merge only when near-identical —
 * close-but-distinct dominant colors are kept apart instead of averaged into one.
 */
const SEGMENT_SIZE_BIAS = 0.8

/**
 * Minimum pixel area of a merged ramp before it is painted as a gradient. Small
 * regions posterize fine and a gradient there costs more than it saves; scaled
 * up by the user's own region-size floor.
 */
const GRADIENT_MIN_AREA = 64

/**
 * Discretize an edge hint into a protect mask at the working resolution: resize
 * to (width, height) when needed, then threshold. The threshold is the
 * determinism boundary — a fixed cutoff, so upstream (possibly WebGPU) float
 * noise in the hint cannot change the discrete mask the tracer consumes.
 */
function edgeProtectMask(
  hint: GrayImage | undefined,
  width: number,
  height: number,
): BinaryMask | null {
  if (!hint) return null
  const g = hint.width === width && hint.height === height ? hint : resizeGray(hint, width, height)
  const data = new Uint8Array(width * height)
  for (let i = 0; i < data.length; i++) data[i] = g.data[i] > EDGE_PROTECT_THRESHOLD ? 1 : 0
  return { width, height, data }
}

/**
 * Learned coverage hint ([0,1] GrayImage, 0.5 = boundary) → a signed coverage
 * field ([-0.5, 0.5]) at the working resolution, quantized to 1/256 steps. The
 * quantization is the discretization boundary that keeps the (possibly WebGPU)
 * hint from perturbing geometry below the trace's sub-pixel sensitivity.
 */
function coverageHintField(
  hint: GrayImage | undefined,
  width: number,
  height: number,
): GrayImage | null {
  if (!hint) return null
  const g = hint.width === width && hint.height === height ? hint : resizeGray(hint, width, height)
  const data = new Float32Array(width * height)
  for (let i = 0; i < data.length; i++) {
    const v = g.data[i] - 0.5
    data[i] = Math.round(v * 256) / 256
  }
  return { width, height, data }
}

// Cumulative progress budget per stage (sums to 1). Curve fitting happens
// inside the trace stage, so `fit` carries no separate work or budget — the
// stage id is retained only for downstream compatibility.
const STAGE_BUDGET: Record<StageId, number> = {
  preprocess: 0.12,
  palette: 0.2,
  segment: 0.08,
  trace: 0.48,
  fit: 0,
  svg: 0.12,
}
const STAGE_ORDER: StageId[] = ['preprocess', 'palette', 'segment', 'trace', 'svg']

/** What a caller supplies to {@link Run.emitStep}; the Run fills in index/stage/timing. */
type TraceStepInput = Pick<TraceStep, 'code' | 'label'> &
  Partial<Pick<TraceStep, 'notes' | 'metrics' | 'rasters' | 'charts'>>

class Run {
  private timings: StageTiming[] = []
  private stageStart = 0
  private currentStage: StageId | null = null
  private stepIndex = 0
  private lastMark = 0

  constructor(private ctx?: EngineContext) {}

  /** True when a tracer is attached; guard snapshot work behind it. */
  get tracing(): boolean {
    return this.ctx?.onTrace !== undefined
  }

  /** Enter a stage, closing the previous one's timing. */
  stage(stage: StageId): void {
    this.closeStage()
    this.currentStage = stage
    this.stageStart = nowMs()
    this.lastMark = this.stageStart
    this.progress(0)
  }

  /**
   * Record one trace step (no-op without a tracer). `build` runs only when
   * tracing, so snapshot construction stays off the hot path; its `startMs`
   * spans from the previous mark, so consecutive steps tile the stage's time.
   */
  emitStep(build: () => TraceStepInput): void {
    const onTrace = this.ctx?.onTrace
    if (!onTrace || !this.currentStage) return
    const startMs = this.lastMark
    const endMs = nowMs()
    this.lastMark = endMs
    const s = build()
    onTrace({
      index: this.stepIndex++,
      stage: this.currentStage,
      startMs,
      endMs,
      code: s.code,
      label: s.label,
      notes: s.notes,
      metrics: s.metrics,
      rasters: s.rasters,
      charts: s.charts,
    })
  }

  progress(fractionInStage: number): void {
    if (!this.currentStage || !this.ctx?.onProgress) return
    let overall = 0
    for (const s of STAGE_ORDER) {
      if (s === this.currentStage) break
      overall += STAGE_BUDGET[s]
    }
    overall += STAGE_BUDGET[this.currentStage] * Math.min(1, Math.max(0, fractionInStage))
    this.ctx.onProgress(this.currentStage, Math.min(1, overall))
  }

  checkCancel(): void {
    if (this.ctx?.shouldCancel?.()) throw new CancelledError()
  }

  /** Yield to the event loop (lets `cancel` messages interleave) + cancel check. */
  async tick(): Promise<void> {
    this.checkCancel()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    this.checkCancel()
  }

  finish(): StageTiming[] {
    this.closeStage()
    return this.timings
  }

  private closeStage(): void {
    if (this.currentStage) {
      this.timings.push({ stage: this.currentStage, ms: nowMs() - this.stageStart })
      this.currentStage = null
    }
  }
}

/** A cleaned label map + palette for one palette settings slice (LRU value). */
interface PaletteEntry {
  labels: LabelMap
  paletteHex: string[]
  paletteRgb: Uint8Array
  counts: Uint32Array
  /** Palette length when autoPaletteSize clamped it, else undefined (for the warning). */
  paletteClampedTo?: number
  /** Per-label gradient paint (label ⇒ ramp fill, or null for a flat fill); absent when gradients are off. */
  gradients?: (GradientPaint | null)[]
  /** Per label, the label painted beneath it with the same geometry (an overlay's base), or -1; absent with `gradients`. */
  underlays?: Int32Array
  /** Stacked layer rings for one ring key; a key change replaces the whole set. */
  rings?: LayerRings
  /**
   * The stacked layering plan (base label map, paint order, lifted islands),
   * which follows from this entry's labels and counts alone. Retained alongside
   * the rings so a re-run — sequential or across helpers — skips the enclosed-
   * component scan and the stacking sort.
   */
  stack?: StackPlan
}

/**
 * How stacked layering paints a label map: the label map painted for the base
 * layers (each lifted island's pixels folded into its surround), those layers'
 * paint order, and the island layers that follow them on top. Derived from the
 * labels and their counts, so it is byte-identical to recomputation.
 */
interface StackPlan {
  stackLabels: Int32Array
  /** Size of the label space (the palette length) the labels index into. */
  labelCount: number
  /** Base-layer paint order (layer index ⇒ label). */
  order: number[]
  /** Island layers in paint order after the base layers. */
  islands: { label: number; pixels: number[] }[]
}

/** One stacked layer: the label whose paint it carries and its decomposed rings. */
interface RingLayer {
  label: number
  paths: CrackPath[]
}

/**
 * Decomposed rings for every stacked layer, in paint order (base layers, then
 * the lifted island layers) — the array index is the layer id. `key` covers
 * everything the rings depend on beyond the palette entry that holds them, so a
 * mismatch means recompute.
 *
 * `polygons[i]` holds the adjusted optimal polygons of `layers[i].paths` (same
 * order), absent until a non-`pixel` run builds them. A polygon depends on its
 * ring and the sub-pixel field only, and stacked color tracing passes no field,
 * so polygons stored here stay valid for exactly as long as the rings do.
 */
interface LayerRings {
  key: string
  layers: RingLayer[]
  polygons?: (FlatPoints | null)[][]
}

/**
 * The binarized ink mask (after despeckle) and its sub-pixel field for one
 * threshold slice, plus the rings decomposed from that mask under `ringKey` and
 * their adjusted polygons. The polygons are built against this entry's own
 * `coverage` (its threshold slice pins the field, and a coverage hint disables
 * caching), so they are valid whenever the rings they came from are.
 */
interface InkEntry {
  key: string
  mask: BinaryMask
  coverage?: GrayImage
  ringKey?: string
  rings?: CrackPath[]
  polygons?: (FlatPoints | null)[]
}

/**
 * Reusable intermediates the worker keeps across runs so that tuning trace-only
 * settings does not re-run preprocessing, quantization and boundary
 * decomposition. One preprocess entry keyed by the client's image id plus the
 * preprocess settings slice; a small LRU of palette entries keyed by the palette
 * slice — so a search that alternates palettes on one worker (e.g. an
 * oscillating incumbent) keeps recent ones warm instead of thrashing a single
 * slot; one ink entry for the bw/centerline mask. A palette entry also carries
 * the stacked layers' decomposed rings and their adjusted polygons, so a
 * curve-only change replays only smoothing and curve optimization. A new image
 * or changed preprocess setting clears the whole cache. Reuse is byte-identical
 * to recomputation (deterministic stages, complete keys).
 *
 * Rings dominate the footprint — every layer's lattice boundary as a `number[]`,
 * 7.4 M coordinates (~59 MB) for a 4096×2731 photo over its 28 stacked layers,
 * with the polygons adding 1.3 M more (~10 MB) — so only the newest palette
 * entry keeps a set (and its stacked plan); the others hold labels only.
 *
 * With a helper pool the per-layer rings and polygons live in the helper that
 * owns each unit, so `ringHits`/`ringMisses` then cover only the coordinator's
 * own share (the bw ring decomposition) and no polygons are counted here at
 * all; the stacked plan's own counters are unaffected.
 */
export interface StageCache {
  imageId?: number
  preKey?: string
  workImage?: RasterImage
  opaque?: BinaryMask | null
  /** Source alpha per pixel when `opaque` is set (transparent handling), else null. */
  alpha?: Uint8Array | null
  /** LRU of palette entries (valid for the current image + preKey); newest last. */
  palette?: Map<string, PaletteEntry>
  /** Ink mask + coverage field + rings for the current image + preKey (bw/centerline). */
  ink?: InkEntry
  /** Reuse counters, for measuring affinity/cache effectiveness. */
  stats?: StageCacheStats
}

/**
 * Cache hit/miss counters: preprocess, palette, the stacked layering plan, the
 * decomposed rings and their polygons, and the ink mask.
 */
export interface StageCacheStats {
  preHits: number
  preMisses: number
  palHits: number
  palMisses: number
  stackHits: number
  stackMisses: number
  ringHits: number
  ringMisses: number
  polyHits: number
  polyMisses: number
  inkHits: number
  inkMisses: number
}

/** Palette entries retained per worker; caps memory while covering an oscillating incumbent. */
const PALETTE_CACHE_SIZE = 4

function cacheStats(cache: StageCache): StageCacheStats {
  return (cache.stats ??= {
    preHits: 0,
    preMisses: 0,
    palHits: 0,
    palMisses: 0,
    stackHits: 0,
    stackMisses: 0,
    ringHits: 0,
    ringMisses: 0,
    polyHits: 0,
    polyMisses: 0,
    inkHits: 0,
    inkMisses: 0,
  })
}

/** LRU get: returns the entry and moves it to newest, or undefined on a miss. */
function paletteGet(cache: StageCache, palKey: string): PaletteEntry | undefined {
  const map = cache.palette
  if (!map) return undefined
  const entry = map.get(palKey)
  if (entry) {
    map.delete(palKey)
    map.set(palKey, entry)
  }
  return entry
}

/** LRU put: inserts as newest and evicts the oldest beyond {@link PALETTE_CACHE_SIZE}. */
function palettePut(cache: StageCache, palKey: string, entry: PaletteEntry): void {
  const map = (cache.palette ??= new Map())
  map.delete(palKey)
  map.set(palKey, entry)
  while (map.size > PALETTE_CACHE_SIZE) {
    const oldest = map.keys().next().value
    if (oldest === undefined) break
    map.delete(oldest)
  }
}

export interface VectorizeRunOptions {
  /** Stable per-image identity (new working image ⇒ new id); enables the cache. */
  imageId?: number
  cache?: StageCache
  /**
   * Helper workers to trace and serialize across. Absent (or empty) runs the
   * whole pipeline on this thread — the default, and the only path a consumer
   * without workers needs. With helpers, the parallel unit is a stacked layer, a
   * bw shape, or a cutout boundary chain; results are placed by unit index, so
   * the SVG text and the shapes are byte-identical to a sequential run.
   */
  helpers?: HelperPool
  /**
   * Attach the raw pre-serialization geometry to the result as `document`, for
   * consumers that emit alternate formats (PDF, DXF, …) without re-parsing the
   * SVG. Off by default (a batch search never needs it); the interactive client
   * requests it.
   */
  withDocument?: boolean
}

/** Build the structured document from the shapes/gradients the serializer received. */
function buildDocument(
  shapes: SvgShape[],
  defs: SvgGradient[],
  width: number,
  height: number,
  settings: VectorizeSettings,
): VectorDocument {
  const gradients: VectorGradient[] = defs.map((g) => ({
    id: g.id,
    kind: g.kind,
    stops: g.stops.map((s) =>
      s.opacity === undefined
        ? { offset: s.offset, color: s.color }
        : { offset: s.offset, color: s.color, opacity: s.opacity },
    ),
  }))
  const outShapes: VectorShape[] = shapes.map((s) => ({
    commands: s.commands,
    fill: s.fill,
    fillRule: s.fillRule,
    stroke: s.stroke,
    strokeWidth: s.strokeWidth,
    layerId: s.layerId,
  }))
  return {
    width,
    height,
    unit: settings.unit,
    widthMm: settings.unit === 'mm' ? settings.widthMm : undefined,
    shapes: outShapes,
    gradients: gradients.length > 0 ? gradients : undefined,
  }
}

/** Settings that change the preprocessed working image. */
function preKeyOf(s: VectorizeSettings): string {
  return [
    s.maxDimension,
    s.denoise,
    s.blurRadius,
    s.background,
    s.backgroundColor,
    s.alphaThreshold,
    s.mode === 'grayscale' ? 'g' : 'c',
  ].join('|')
}

/** Settings that change the quantized + cleaned label map. */
function palKeyOf(s: VectorizeSettings): string {
  return [
    s.segmentation,
    s.paletteSize,
    s.autoPaletteSize,
    s.colorSpace,
    s.quantizeQuality,
    s.palette ? s.palette.join(',') : '-',
    s.minRegionArea,
    s.preserveDetails,
    s.dissolveBands,
    s.colorCoherence,
    s.omitBackground,
    s.gradients ? 'g' : '-',
    s.gradients ? s.gradientStrength : 0,
    s.gradients ? s.gradientMinArea : 0,
    s.gradients ? s.gradientMaxDimension : 0,
    s.curveMode === 'pixel' ? 'px' : '-',
  ].join('|')
}

/**
 * Settings that change the stacked layers' decomposed rings, beyond the label
 * map they are cut from (the palette entry's own key). The layer masks follow
 * from the labels and counts alone — the stacking order, the lifted islands and
 * the per-layer union flood are all derived from them — so only the tracer's own
 * decomposition inputs are left. `traceMinArea` already folds in
 * `preserveDetails`; an edge hint disables caching altogether.
 */
function ringKeyOf(s: VectorizeSettings, traceMinArea: number): string {
  return [s.layering, s.turnPolicy, traceMinArea].join('|')
}

/** Settings that change the binarized ink mask and its sub-pixel coverage field. */
function inkKeyOf(s: VectorizeSettings): string {
  return [
    s.thresholdMode,
    s.threshold,
    s.adaptiveRadius,
    s.adaptiveBias,
    s.invert,
    s.minRegionArea,
    s.curveMode === 'pixel' ? 'px' : '-',
  ].join('|')
}

/**
 * Distinguishes one run's helper payloads from another's when the run is not
 * cacheable (no image id, or a hint that disables reuse): a fresh serial makes
 * every key a miss, so a helper never reads a payload from a different image or
 * a different label map. It never reaches the output.
 */
let runSerial = 0

/**
 * The native vectorization pipeline:
 * preprocess → (palette | binarize) → segment cleanup → trace/fit → SVG.
 */
export async function vectorize(
  source: RasterImage,
  settingsIn: VectorizeSettings,
  ctx?: EngineContext,
  opts?: VectorizeRunOptions,
): Promise<VectorizeResult> {
  const settings = normalizeSettings(settingsIn)
  const started = nowMs()
  const run = new Run(ctx)
  const warnings: VectorizeWarning[] = []

  const cache = opts?.cache
  const imageId = opts?.imageId
  const cacheable = cache !== undefined && imageId !== undefined
  const helpers = opts?.helpers !== undefined && opts.helpers.size > 0 ? opts.helpers : undefined
  const serial = ++runSerial

  // ---- preprocess (reused across runs when the image + preprocess key match) ----
  run.stage('preprocess')
  const preKey = preKeyOf(settings)
  let image: RasterImage
  let opaque: BinaryMask | null
  let alpha: Uint8Array | null
  if (cacheable && cache.imageId === imageId && cache.preKey === preKey && cache.workImage) {
    image = cache.workImage
    opaque = cache.opaque ?? null
    alpha = cache.alpha ?? null
    cacheStats(cache).preHits++
    run.progress(1)
  } else {
    let img = resizeToFit(source, settings.maxDimension)
    run.progress(0.3)
    if (settings.denoise === 'median') img = medianFilter(img, 1)
    else if (settings.denoise === 'bilateral') img = bilateralFilter(img, 2, 2, 35)
    if (settings.blurRadius > 0) img = gaussianBlur(img, settings.blurRadius)
    run.progress(0.7)
    const flat = flattenImage(img, settings)
    img = flat.image
    opaque = flat.opaque
    alpha = flat.alpha
    if (settings.mode === 'grayscale') desaturateInPlace(img)
    image = img
    if (cacheable) {
      cacheStats(cache).preMisses++
      // New image or preprocess ⇒ every palette and ink entry depended on it.
      cache.imageId = imageId
      cache.preKey = preKey
      cache.workImage = image
      cache.opaque = opaque
      cache.alpha = alpha
      cache.palette = new Map()
      cache.ink = undefined
    }
  }
  const { width, height } = image
  await run.tick()

  if (run.tracing) {
    run.emitStep(() => {
      const notes: string[] = []
      if (width !== source.width || height !== source.height) {
        notes.push(`Resized ${source.width}×${source.height} → ${width}×${height}.`)
      }
      if (settings.denoise !== 'none') notes.push(`Denoise: ${settings.denoise}.`)
      if (settings.blurRadius > 0) notes.push(`Blur radius ${settings.blurRadius}.`)
      if (settings.mode === 'grayscale') notes.push('Desaturated for grayscale tracing.')
      return {
        code: 'preprocess',
        label: 'Preprocess',
        rasters: [
          rasterFromImage(source, 'Source'),
          rasterFromImage(image, settings.mode === 'grayscale' ? 'Working (gray)' : 'Working'),
        ],
        charts: [luminanceHistogram(image)],
        metrics: {
          sourceWidth: source.width,
          sourceHeight: source.height,
          workWidth: width,
          workHeight: height,
          scalePercent: Math.round((width / source.width) * 100),
        },
        notes: notes.length > 0 ? notes : undefined,
      }
    })
  }

  // ---- per-mode tracing into SVG shapes ----
  const shapes: SvgShape[] = []
  const defs: SvgGradient[] = []
  let palette: string[] = []
  // Per-shape SVG a helper already produced, index-parallel to `shapes`. Only
  // stacked layers serialize in a helper (a shape belongs to exactly one layer);
  // every other path leaves this empty and the serializer does the per-shape
  // half itself.
  const shapeParts: (ShapeOut | null)[] = []
  // Full-shape primitive substitution (<circle>/<ellipse>/<rect rx>) stays off
  // for cutout — an element can't be shared with a neighbor's path edge. Arc
  // fitting for cutout happens seam-safely per shared chain instead (the
  // `refineChain` passed to the tracer).
  const roundPrimitives = settings.optimizeSvg && settings.layering !== 'cutout'
  // Exactly the per-shape settings the serializer would apply, so a helper's
  // output drops into the document unchanged.
  const shapeSerialize: HelperSerializeOptions = {
    precision: settings.precision,
    optimize: settings.optimizeSvg,
    roundPrimitives,
  }
  // Helper payloads are keyed by the same identities the StageCache uses, so a
  // warm run finds its rings and polygons in the helper that owns those units.
  const helperScope = cacheable ? `${imageId}|${preKey}` : `#${serial}`

  if (settings.mode === 'color' || settings.mode === 'grayscale') {
    await colorPipeline(
      run,
      image,
      opaque,
      alpha,
      settings,
      shapes,
      shapeParts,
      defs,
      warnings,
      (p) => (palette = p),
      ctx?.edgeHint,
      cacheable ? cache : undefined,
      imageId,
      { helpers, scope: helperScope, serial, serialize: shapeSerialize },
    )
  } else {
    await inkPipeline(
      run,
      image,
      opaque,
      settings,
      shapes,
      warnings,
      (p) => (palette = p),
      ctx?.edgeHint,
      ctx?.coverageHint,
      cacheable ? cache : undefined,
      imageId,
      { helpers, scope: helperScope, serial, serialize: shapeSerialize },
    )
  }

  if (run.tracing) {
    run.emitStep(() => ({
      code: 'trace',
      label: 'Trace & fit',
      charts: [nodesPerColorBars(shapes)],
      metrics: {
        shapes: shapes.length,
        nodes: totalNodes(shapes),
        gradients: defs.length,
      },
      notes: [
        settings.mode === 'centerline'
          ? 'Centerline strokes fitted from the skeleton.'
          : `Layering: ${settings.layering}; curves: ${settings.curveMode}.`,
      ],
    }))
  }

  // ---- svg ----
  run.stage('svg')
  const grouped =
    settings.groupByColor && (settings.mode === 'color' || settings.mode === 'grayscale')
  const svg = serializeSvg(
    {
      width,
      height,
      unit: settings.unit,
      widthMm: settings.unit === 'mm' ? settings.widthMm : undefined,
      title: settings.svgTitle || undefined,
      defs: defs.length > 0 ? defs : undefined,
      shapes,
    },
    {
      precision: settings.precision,
      optimizePaths: settings.optimizeSvg,
      roundPrimitives,
      // One <g> per cut layer (color layers only). Cutout is a color partition,
      // so group by color; stacked paints in layer order and a color can recur
      // at two heights (a base outline and a pupil island above it), so group by
      // paint layer to keep those separate and correctly ordered.
      groupByColor: grouped && settings.layering === 'cutout',
      groupByLayer: grouped && settings.layering !== 'cutout',
    },
    shapeParts.length === shapes.length ? shapeParts : undefined,
  )
  run.progress(0.6)
  const analysis = analyzeSvg(svg)

  if (run.tracing) {
    run.emitStep(() => ({
      code: 'serialize',
      label: 'Serialize SVG',
      charts: [nodesPerShapeHistogram(shapes)],
      metrics: {
        paths: analysis.pathCount,
        nodes: analysis.nodeCount,
        colors: analysis.colorCount,
        bytes: analysis.byteLength,
      },
      notes: [settings.optimizeSvg ? 'Path optimization on.' : 'Path optimization off.'],
    }))
  }

  if (shapes.length === 0) {
    warnings.push({
      code: 'empty-result',
      severity: 'warning',
      message: 'No shapes were produced — check threshold/background settings.',
    })
  }
  if (analysis.nodeCount > 20000) {
    warnings.push({
      code: 'node-count',
      severity: 'info',
      message: `${analysis.nodeCount.toLocaleString()} nodes — consider more smoothing or a smaller max size for editing/cutting.`,
      params: { count: analysis.nodeCount },
    })
  }
  if (settings.unit === 'mm') {
    warnTinyFeatures(shapes, width, settings, warnings)
  }
  if (defs.length > 0 && (settings.unit === 'mm' || settings.groupByColor)) {
    warnings.push({
      code: 'gradient-spot-color',
      severity: 'info',
      message: `${defs.length} gradient fill${defs.length === 1 ? '' : 's'} won't reproduce on spot-color cutters/printers — turn off gradient detection for those outputs.`,
      params: { count: defs.length },
    })
  }

  const timings = run.finish()
  return {
    svg,
    width,
    height,
    palette,
    stats: {
      pathCount: analysis.pathCount,
      nodeCount: analysis.nodeCount,
      colorCount: analysis.colorCount,
      byteLength: analysis.byteLength,
      durationMs: nowMs() - started,
      stages: timings,
    },
    warnings,
    document: opts?.withDocument ? buildDocument(shapes, defs, width, height, settings) : undefined,
  }
}

/** What the pipelines need to farm parallel units out to helper workers. */
interface HelperContext {
  helpers: HelperPool | undefined
  /** Image-level key prefix: the image id + preprocess slice, or a per-run serial. */
  scope: string
  /** Unique per run — keys a payload this run must not share with another. */
  serial: number
  serialize: HelperSerializeOptions
}

async function colorPipeline(
  run: Run,
  image: RasterImage,
  opaque: BinaryMask | null,
  alpha: Uint8Array | null,
  settings: VectorizeSettings,
  shapes: SvgShape[],
  shapeParts: (ShapeOut | null)[],
  defs: SvgGradient[],
  warnings: VectorizeWarning[],
  setPalette: (p: string[]) => void,
  edgeHint: GrayImage | undefined,
  cache: StageCache | undefined,
  imageId: number | undefined,
  helperCtx: HelperContext,
): Promise<void> {
  run.stage('palette')
  // The palette + cleaned label map are reused when the image and every setting
  // that shapes them are unchanged. An edge hint feeds the merge, so caching is
  // disabled while one is present (correctness over speed).
  const canCachePal = cache !== undefined && imageId !== undefined && edgeHint === undefined
  const palKey = canCachePal ? palKeyOf(settings) : undefined
  // Edge hint (if any) protects thin features from the size merge and from the
  // tracer's speck filter; null when no hint (and always null when caching).
  const protect = edgeProtectMask(edgeHint, image.width, image.height)

  let labels: LabelMap
  let paletteHex: string[]
  let paletteRgb: Uint8Array
  let counts: Uint32Array
  let paletteClampedTo: number | undefined
  let gradients: (GradientPaint | null)[] | undefined
  let underlays: Int32Array | undefined

  const cached =
    canCachePal && cache && cache.imageId === imageId && palKey !== undefined
      ? paletteGet(cache, palKey)
      : undefined
  // The entry the stacked rings hang off, whether it came from the cache or is
  // stored below; undefined when this run does not cache.
  let paletteEntry: PaletteEntry | undefined = cached
  if (cached) {
    labels = cached.labels
    paletteHex = cached.paletteHex
    paletteRgb = cached.paletteRgb
    counts = cached.counts
    paletteClampedTo = cached.paletteClampedTo
    gradients = cached.gradients
    underlays = cached.underlays
    cacheStats(cache!).palHits++
    await run.tick()
    run.stage('segment')
    await run.tick()
  } else if (settings.segmentation === 'regions' && settings.palette === null) {
    if (canCachePal) cacheStats(cache!).palMisses++
    // Region growing (marker-controlled watershed): no global palette, so an
    // anti-aliased edge is split between its two neighbors instead of inventing
    // a third rim color. `paletteSize` is a budget (soft cap), not an exact
    // count; autoPaletteSize lets the merge thresholds decide the count.
    const seg = segmentRegions(image, {
      mergeThreshold: SEGMENT_MERGE_THRESHOLD,
      mergeSizeBias: SEGMENT_SIZE_BIAS,
      minRegionArea: settings.minRegionArea,
      maxRegions: settings.autoPaletteSize ? 0 : settings.paletteSize,
      mask: opaque,
    })
    await run.tick()
    run.stage('segment')
    await run.tick()
    labels = seg.labels
    paletteHex = seg.paletteHex
    paletteRgb = seg.paletteRgb
    counts = seg.counts
    const backgroundLabel = settings.omitBackground ? nearestPaletteLabel(image, paletteHex) : -1
    if (backgroundLabel >= 0) {
      const cleared = clearBorderLabel(labels, backgroundLabel)
      counts[backgroundLabel] = Math.max(0, counts[backgroundLabel] - cleared)
    }
    const fitted = applyGradients(image, labels, paletteHex, paletteRgb, alpha, settings)
    if (fitted) {
      ;({ labels, paletteHex, paletteRgb } = fitted)
      gradients = fitted.gradients
      underlays = fitted.underlays
      counts = countLabels(labels)
    }
    if (canCachePal && palKey !== undefined) {
      paletteEntry = {
        labels,
        paletteHex,
        paletteRgb,
        counts,
        paletteClampedTo,
        gradients,
        underlays,
      }
      palettePut(cache!, palKey, paletteEntry)
    }
  } else {
    if (canCachePal) cacheStats(cache!).palMisses++
    // Keep anti-aliased boundary pixels out of the k-means training sample so
    // rim mixtures cannot capture a palette entry (no effect on the exact and
    // fixed-palette paths, which quantize resolves without clustering).
    const edges = detectEdges(image, CLUSTER_EDGE_THRESHOLD)
    const clusterSample: BinaryMask = {
      width: image.width,
      height: image.height,
      data: new Uint8Array(image.width * image.height),
    }
    for (let i = 0; i < clusterSample.data.length; i++) {
      clusterSample.data[i] = edges.data[i] === 0 ? 1 : 0
    }
    const quantOpts = {
      k: settings.paletteSize,
      colorSpace: settings.colorSpace,
      quality: settings.quantizeQuality,
      seed: QUANTIZE_SEED,
      mask: opaque,
      sampleMask: clusterSample,
      autoK: settings.autoPaletteSize,
      fixedPalette: settings.palette,
    }
    const q = quantize(image, quantOpts)
    paletteClampedTo =
      settings.autoPaletteSize && q.paletteHex.length < settings.paletteSize
        ? q.paletteHex.length
        : undefined
    await run.tick()

    run.stage('segment')
    // Spatial color coherence: re-assign each pixel by balancing palette-color
    // distance against neighbor agreement, so a rim mixture joins a real
    // neighboring region instead of a globally-nearest third color (fewer
    // invented seam hues). A protected edge pixel is never moved; 0 is byte-identical.
    if (settings.colorCoherence > 0) {
      smoothLabelsSpatial(
        q.labels,
        toOklabBuffer(image),
        paletteToOklab(q.paletteRgb),
        settings.colorCoherence * COHERENCE_LAMBDA,
        COHERENCE_ROUNDS,
        protect ?? undefined,
      )
    }
    // Dissolve thin mislabeled rim bands (a wrong color wedged between two
    // regions) into the region they border, before the size merge. A protected
    // edge pixel is never moved; 0 rounds is byte-identical to the classic path.
    if (settings.dissolveBands > 0) {
      dissolveThinBands(q.labels, settings.dissolveBands, protect ?? undefined)
    }
    // `protect` (hoisted above) lets an edge hint keep small regions on a
    // predicted boundary; with no hint this is byte-identical to the plain merge.
    if (settings.preserveDetails) {
      const oklab = new Float32Array(q.paletteHex.length * 3)
      for (let i = 0; i < q.paletteHex.length; i++) {
        const [L, a, b] = rgbToOklab(
          q.paletteRgb[i * 3] / 255,
          q.paletteRgb[i * 3 + 1] / 255,
          q.paletteRgb[i * 3 + 2] / 255,
        )
        oklab[i * 3] = L
        oklab[i * 3 + 1] = a
        oklab[i * 3 + 2] = b
      }
      mergeSmallRegions(q.labels, settings.minRegionArea, {
        oklab,
        keepContrast: DETAIL_CONTRAST,
        protect: protect ?? undefined,
      })
    } else if (protect) {
      mergeSmallRegions(q.labels, settings.minRegionArea, { protect })
    } else {
      mergeSmallRegions(q.labels, settings.minRegionArea)
    }
    labels = q.labels
    paletteHex = q.paletteHex
    paletteRgb = q.paletteRgb
    counts = new Uint32Array(labels.count)
    for (let i = 0; i < labels.data.length; i++) {
      const l = labels.data[i]
      if (l >= 0) counts[l]++
    }
    const backgroundLabel = settings.omitBackground ? nearestPaletteLabel(image, paletteHex) : -1
    if (backgroundLabel >= 0) {
      // Drop only the border-connected background; identically-colored regions
      // enclosed by other shapes (white text inside a banner) are kept.
      const cleared = clearBorderLabel(labels, backgroundLabel)
      counts[backgroundLabel] = Math.max(0, counts[backgroundLabel] - cleared)
    }
    // Merge posterized bands that form one ramp into a gradient region (mutates
    // labels; relabeled bands need a fresh count). Off ⇒ undefined,
    // byte-identical to the flat-fill path.
    const fitted = applyGradients(image, labels, paletteHex, paletteRgb, alpha, settings)
    if (fitted) {
      ;({ labels, paletteHex, paletteRgb } = fitted)
      gradients = fitted.gradients
      underlays = fitted.underlays
      counts = countLabels(labels)
    }
    await run.tick()

    if (canCachePal && palKey !== undefined) {
      paletteEntry = {
        labels,
        paletteHex,
        paletteRgb,
        counts,
        paletteClampedTo,
        gradients,
        underlays,
      }
      palettePut(cache!, palKey, paletteEntry)
    }
  }

  if (paletteClampedTo !== undefined) {
    warnings.push({
      code: 'palette-clamped',
      severity: 'info',
      message: `Palette reduced to ${paletteClampedTo} colors (near-duplicates merged).`,
      params: { count: paletteClampedTo },
    })
  }

  // Resolve each label's paint once: a solid hex, or a gradient referenced by
  // `url(#id)` whose <defs> entry is collected here. Ids are assigned in label
  // order for stable, deterministic output. `paletteColorsFor` holds the flat
  // colors each label contributes to `VectorizeResult.palette` (a gradient's
  // stop colors, so the studio's palette still shows real swatches).
  const fillFor: string[] = new Array(paletteHex.length)
  const paletteColorsFor: string[][] = new Array(paletteHex.length)
  for (let l = 0; l < paletteHex.length; l++) {
    const g = gradients?.[l]
    if (g) {
      const id = `g${defs.length}`
      defs.push({ id, ...g })
      fillFor[l] = `url(#${id})`
      paletteColorsFor[l] = g.stops.map((s) => s.color)
    } else {
      fillFor[l] = paletteHex[l]
      paletteColorsFor[l] = [paletteHex[l]]
    }
  }
  // A semi-transparent overlay composites over its base: the base's paint is
  // emitted first with the overlay's own geometry, then the overlay on top. The
  // underlay may overlap a same-paint sheet beneath it, so it is never folded
  // into one even-odd path with it.
  const underOf = (l: number): number => underlays?.[l] ?? -1

  if (run.tracing) {
    run.emitStep(() => {
      const charts: TraceChart[] = [palettePopulationBars(paletteHex, counts)]
      const rh = regionAreaHistogram(counts)
      if (rh) charts.push(rh)
      return {
        code: 'segment',
        label: 'Palette & regions',
        rasters: [rasterFromLabels(labels, paletteHex, 'Label map')],
        charts,
        metrics: {
          colors: paletteHex.length,
          regions: nonEmptyLabelCount(counts),
          gradients: gradients ? gradients.filter(Boolean).length : 0,
        },
        notes: [`Segmentation: ${settings.segmentation}; min region ${settings.minRegionArea}px.`],
      }
    })
  }

  run.stage('trace')
  // The curve slice alone: what a re-fit depends on, and what a helper job carries.
  const curveOpts: HelperCurveOptions = {
    curveMode: settings.curveMode,
    smoothing: settings.smoothing,
    curveOptimize: settings.curveOptimize,
    optTolerance: settings.optTolerance,
    cornerThreshold: settings.cornerThreshold,
  }
  // With detail preservation or an edge hint, the merge above is the sole speck
  // filter — the tracer must not drop the small regions it deliberately kept.
  const traceMinArea = settings.preserveDetails || protect ? 1 : Math.max(1, settings.minRegionArea)
  const usedPalette: string[] = []
  const helpers = helperCtx.helpers
  // Payload identity for anything derived from this run's label map. A palette
  // key means the labels are cache-pinned and a helper may reuse what it holds;
  // without one (an edge hint disables palette caching) the run's serial makes
  // every helper key a miss.
  const labelScope = palKey !== undefined ? `${helperCtx.scope}|${palKey}` : `#${helperCtx.serial}`

  if (settings.layering === 'cutout') {
    // Sub-pixel color-boundary refinement: each shared chain is snapped onto the
    // true anti-aliased edge between its two region colors. Skipped in pixel
    // mode (exact lattice) and when the palette is degenerate.
    const refinesColor = settings.curveMode !== 'pixel' && paletteHex.length > 1
    // Collapse circular/elliptical Bézier runs to `A` arcs per shared chain
    // (fitted once, reused reversed) so cutout gets the node reduction without
    // seam divergence. Full-shape primitives stay off for cutout (an element
    // can't be shared with a neighbour's path), which is why `roundPrimitives`
    // is disabled at serialization.
    const arcPrecision = settings.optimizeSvg ? settings.precision : undefined
    let regions: RegionShape[]
    if (helpers) {
      regions = await fitCutoutInHelpers(
        run,
        helpers,
        labels,
        image,
        refinesColor ? paletteToOklab(paletteRgb) : undefined,
        curveOpts,
        arcPrecision,
        helperCtx,
        labelScope,
      )
    } else {
      regions = traceLabelMap(labels, {
        ...curveOpts,
        colorField: refinesColor
          ? { oklab: toOklabBuffer(image), paletteOklab: paletteToOklab(paletteRgb) }
          : undefined,
        refineChain: arcPrecision === undefined ? undefined : (cmds) => fitArcs(cmds, arcPrecision),
      })
    }
    regions.sort((a, b) => b.area - a.area)
    // Trap width in viewBox px. An mm-unit output carries a physical millimetre
    // trap: convert it through the document's mm-per-px so the overlap means the
    // same on press at any trace resolution; a px-unit trap is already viewBox px.
    const trapScale = mmPerPx(image.width, settings.widthMm)
    const trapPx =
      settings.gapFill <= 0
        ? 0
        : settings.unit === 'mm'
          ? trapScale > 0
            ? settings.gapFill / trapScale
            : 0
          : settings.gapFill
    for (const region of regions) {
      const under = underOf(region.label)
      for (const label of under >= 0 ? [under, region.label] : [region.label]) {
        const fill = fillFor[label]
        addColors(usedPalette, paletteColorsFor[label])
        shapes.push({
          commands: region.commands,
          fill,
          fillRule: 'evenodd',
          ...(label === under ? { unfoldable: true } : {}),
          ...(trapPx > 0
            ? { stroke: fill, strokeWidth: trapPx, strokeLinejoin: 'round' as const }
            : {}),
        })
      }
    }
    run.progress(1)
  } else {
    // Stacked layers are decomposed once per ring key and re-fitted on every
    // run, so changing only the curve settings skips the layer floods, the crack
    // decomposition and the polygon stages, and replays smoothing and curve
    // optimization over the cached rings and polygons.
    const ringKey = ringKeyOf(settings, traceMinArea)
    const reusable = paletteEntry?.rings
    const cachedLayers =
      reusable !== undefined && reusable.key === ringKey ? reusable.layers : undefined
    // `pixel` curveMode emits the exact lattice ring and never reads a polygon.
    const wantPolygons = settings.curveMode !== 'pixel'
    const cachedPolygons = cachedLayers && wantPolygons ? reusable?.polygons : undefined

    // Layer bookkeeping shared by the cached and the computed path: layers are
    // painted in order and the running count is each layer's own id.
    let done = 0
    let totalLayers = 0
    // Stream a snapshot of the shapes as they accumulate (throttled), so the
    // timeline can replay the geometry building up. `shapes` is in push order, so
    // its running length is all the studio needs to redraw the state at each stop.
    let traceStride = 1
    const emitTraceSnapshot = (): void =>
      run.emitStep(() => ({
        code: 'trace',
        label: `Trace layer ${done}/${totalLayers}`,
        metrics: {
          shapes: shapes.length,
          nodes: totalNodes(shapes),
          layer: done,
          layersTotal: totalLayers,
        },
      }))
    const startLayers = (total: number): void => {
      totalLayers = total
      traceStride = Math.max(1, Math.ceil(total / TRACE_SNAPSHOTS))
    }
    /** The paints a layer's shapes carry, for a helper to serialize them with. */
    const layerPaint = (label: number, layerId: number): HelperUnitPaint => {
      const under = underOf(label)
      const own: HelperShapeMeta = { fill: fillFor[label], fillRule: 'evenodd', layerId }
      if (under < 0) return { own }
      return {
        own,
        under: { fill: fillFor[under], fillRule: 'evenodd', layerId, unfoldable: true },
      }
    }
    /**
     * Place one layer's traced shapes, then report progress and yield. A layer
     * whose color sits over an underlay emits its geometry twice — the base's
     * paint first, then the layer's own on top — so `parts`, when a helper
     * serialized them, carries the underlay copy of every shape followed by the
     * layer's own copies, in that order.
     */
    const paintShapes = async (
      label: number,
      layerShapes: readonly PathCommand[][],
      parts: readonly (ShapeOut | null)[] | undefined,
    ): Promise<void> => {
      const under = underOf(label)
      const layerId = done
      let at = 0
      for (const l of under >= 0 ? [under, label] : [label]) {
        if (layerShapes.length > 0) addColors(usedPalette, paletteColorsFor[l])
        for (const commands of layerShapes) {
          shapes.push({
            commands,
            fill: fillFor[l],
            fillRule: 'evenodd',
            layerId,
            ...(l === under ? { unfoldable: true } : {}),
          })
          if (parts) shapeParts.push(parts[at] ?? null)
          at++
        }
      }
      done++
      run.progress(done / totalLayers)
      if (run.tracing && done < totalLayers && done % traceStride === 0) emitTraceSnapshot()
      // Yields the worker event loop between layers, so cancel messages
      // interleave with the computation.
      await run.tick()
    }
    /** Fit one layer's rings into shapes on this thread. */
    const paintLayer = (
      label: number,
      paths: CrackPath[],
      polygons: (FlatPoints | null)[] | undefined,
    ): Promise<void> =>
      paintShapes(
        label,
        shapesFromPaths(paths, curveOpts, polygons).map((t) => t.commands),
        undefined,
      )

    if (helpers) {
      // Each layer is an independent unit: the helper rebuilds the layer's union
      // flood from the shared plan, decomposes it, fits the curve chain and
      // serializes its shapes. Units come back in layer order, so the paint
      // order — and with it every `layerId` and the SVG text — is unchanged.
      const plan = stackPlanFor(labels, counts, paletteEntry, canCachePal ? cache : undefined)
      const labelOf = (unit: number): number =>
        unit < plan.order.length ? plan.order[unit] : plan.islands[unit - plan.order.length].label
      const total = plan.order.length + plan.islands.length
      const stackKey = `${labelScope}|${ringKey}`
      helpers.setStackPlan(stackKey, stackPayload(labels, plan, settings.turnPolicy, traceMinArea))
      startLayers(total)
      for await (const out of helpers.dispatch({
        kind: 'trace-layers',
        total,
        stateKey: stackKey,
        curve: curveOpts,
        meta: (unit) => layerPaint(labelOf(unit), unit),
        serialize: helperCtx.serialize,
      })) {
        // oxlint-disable-next-line no-await-in-loop
        await paintShapes(labelOf(out.unit), out.shapes, out.svg)
      }
    } else if (cachedLayers) {
      cacheStats(cache!).ringHits++
      if (wantPolygons) {
        if (cachedPolygons) cacheStats(cache!).polyHits++
        else cacheStats(cache!).polyMisses++
      }
      // Rings without polygons (a `pixel` run stored them): rebuild and keep them.
      const rebuilt: (FlatPoints | null)[][] | undefined =
        wantPolygons && !cachedPolygons ? [] : undefined
      startLayers(cachedLayers.length)
      for (let i = 0; i < cachedLayers.length; i++) {
        const layer = cachedLayers[i]
        let polygons = cachedPolygons?.[i]
        if (rebuilt) {
          polygons = layerPolygons(layer.paths)
          rebuilt.push(polygons)
        }
        // oxlint-disable-next-line no-await-in-loop
        await paintLayer(layer.label, layer.paths, polygons)
      }
      if (rebuilt && reusable) reusable.polygons = rebuilt
    } else {
      if (canCachePal) {
        cacheStats(cache!).ringMisses++
        if (wantPolygons) cacheStats(cache!).polyMisses++
      }
      // Rings and polygons are retained only when there is a cache to hold them.
      const layers: RingLayer[] | undefined = canCachePal ? [] : undefined
      const polygonSets: (FlatPoints | null)[][] | undefined =
        layers && wantPolygons ? [] : undefined
      await decomposeStackedLayers(
        labels,
        stackPlanFor(labels, counts, paletteEntry, canCachePal ? cache : undefined),
        settings.turnPolicy,
        traceMinArea,
        startLayers,
        async (label, paths) => {
          const polygons = wantPolygons ? layerPolygons(paths) : undefined
          layers?.push({ label, paths })
          if (polygonSets && polygons) polygonSets.push(polygons)
          await paintLayer(label, paths, polygons)
        },
      )
      if (layers && paletteEntry) {
        // One ring set at a time: the older entries keep their labels (cheap to
        // re-decompose from) but drop rings, which are the bulk of the cache.
        for (const other of cache!.palette?.values() ?? []) {
          if (other !== paletteEntry) other.rings = undefined
        }
        paletteEntry.rings = { key: ringKey, layers, polygons: polygonSets }
      }
    }
  }
  setPalette(usedPalette)
  run.progress(1)
}

/**
 * Adjusted optimal polygons for one stacked layer's rings, parallel to `paths`.
 * Stacked layering traces flat label masks with no sub-pixel field, so the
 * polygons depend on the rings alone.
 */
function layerPolygons(paths: CrackPath[]): (FlatPoints | null)[] {
  return paths.map((p) => ringPolygon(p.points))
}

/**
 * How stacked layering will paint a label map (Selinger-independent bookkeeping):
 * the base layers' order, the label map they are cut from, and the enclosed
 * pockets lifted onto their own top layers.
 *
 * Each layer covers itself plus the sheets above that its own color actually
 * reaches, so lower shapes extend underneath their neighbours and edges cannot
 * crack — without dragging in far regions already covered by their own sheets
 * (see the per-layer flood in {@link decomposeStackedLayers}). The most
 * connective color — the one whose regions have the largest total perimeter,
 * i.e. that borders the most other regions — is pinned to the bottom as the
 * base, so it reads as the outline/backdrop showing between the colors stacked
 * on top: the standard layered-vinyl build (a cartoon's black outline, a flat
 * design's background). A thin outline threading between regions outscores a
 * compact blob of the same color, and a tiny dark speck never wins. The rest
 * stack by descending area (large fields low, small details on top). Order sets
 * only which sheet is the full base and the layer/group order — never the
 * rendered pixels, since each pixel's topmost layer is its own.
 *
 * An enclosed island whose color sits below its surround punches a floating
 * hole in every layer stacked over it. Because the island is ringed by a single
 * color, the count of those layers is exactly its stack depth below the
 * surround: each level from just above the island up to the surround still has
 * that ring, so each carries a hole. Lift a pocket only when two or more sheets
 * stack over it — one sheet's single hole weeds and aligns cleanly, but two or
 * more drift and let the middle sheets peek through. Lifting relabels the island
 * into its surround for the solid base layers, then repaints it on top as its
 * own island layer; its mask is exactly its own pixels, so nested regions still
 * show through and the rendered pixels are unchanged — only the cut layers get
 * cleaner.
 */
function stackPlan(labels: LabelMap, counts: Uint32Array): StackPlan {
  const order0 = stackingOrder(labels, counts)
  const position0 = new Int32Array(counts.length).fill(-1)
  order0.forEach((l, i) => (position0[l] = i))
  const enclosed = findEnclosedComponents(labels).filter((c) => {
    const depth = position0[c.surround] - position0[c.label]
    return position0[c.label] >= 0 && position0[c.surround] >= 0 && depth >= MIN_LIFT_DEPTH
  })

  // The label map painted for the base layers: island pixels take their
  // surrounding label so nothing beneath them is punched out. With no islands
  // this is the original map and order (no extra work).
  let stackLabels = labels.data
  let order = order0
  if (enclosed.length > 0) {
    const painted = new Int32Array(labels.data)
    for (const c of enclosed) for (const p of c.pixels) painted[p] = c.surround
    const stackCounts = new Uint32Array(counts.length)
    for (let i = 0; i < painted.length; i++) {
      const l = painted[i]
      if (l >= 0) stackCounts[l]++
    }
    stackLabels = painted
    order = stackingOrder(
      { width: labels.width, height: labels.height, data: painted, count: labels.count },
      stackCounts,
    )
  }

  // Islands of different colors are disjoint pixel sets, so their paint order is
  // free; ascending label id keeps it deterministic.
  const byColor = new Map<number, number[]>()
  for (const c of enclosed) {
    let arr = byColor.get(c.label)
    if (arr === undefined) {
      arr = []
      byColor.set(c.label, arr)
    }
    for (const p of c.pixels) arr.push(p)
  }
  const islands = [...byColor.keys()]
    .toSorted((a, b) => a - b)
    .map((label) => ({ label, pixels: byColor.get(label) as number[] }))

  return { stackLabels, labelCount: counts.length, order, islands }
}

/** The stacked plan for this label map, from the palette entry when it holds one. */
function stackPlanFor(
  labels: LabelMap,
  counts: Uint32Array,
  entry: PaletteEntry | undefined,
  cache: StageCache | undefined,
): StackPlan {
  const held = entry?.stack
  if (held) {
    if (cache) cacheStats(cache).stackHits++
    return held
  }
  if (cache) cacheStats(cache).stackMisses++
  const plan = stackPlan(labels, counts)
  if (entry) {
    // One plan at a time, like the rings: the older entries keep their labels
    // (cheap to re-plan from) but drop the base label map, which is the bulk.
    for (const other of cache?.palette?.values() ?? []) {
      if (other !== entry) other.stack = undefined
    }
    entry.stack = plan
  }
  return plan
}

/** The stacked plan as the flat, transferable payload the helpers cache. */
function stackPayload(
  labels: LabelMap,
  plan: StackPlan,
  turnPolicy: TurnPolicy,
  minArea: number,
): StackPlanPayload {
  const islandOffsets = new Int32Array(plan.islands.length + 1)
  for (let i = 0; i < plan.islands.length; i++) {
    islandOffsets[i + 1] = islandOffsets[i] + plan.islands[i].pixels.length
  }
  const islandLabels = new Int32Array(plan.islands.length)
  const islandPixels = new Int32Array(islandOffsets[plan.islands.length])
  for (let i = 0; i < plan.islands.length; i++) {
    islandLabels[i] = plan.islands[i].label
    islandPixels.set(plan.islands[i].pixels, islandOffsets[i])
  }
  return {
    width: labels.width,
    height: labels.height,
    labelCount: plan.labelCount,
    stackLabels: plan.stackLabels,
    order: new Int32Array(plan.order),
    islandLabels,
    islandPixels,
    islandOffsets,
    turnPolicy,
    minArea,
  }
}

/**
 * Stacked layering: build each cut layer's mask from `plan` and decompose it
 * into boundary rings, handing them to `onLayer` in paint order (base layers
 * bottom-up, then the lifted island layers). `startLayers` reports the layer
 * total first, so a caller can drive progress; `onLayer` is awaited, so the
 * caller controls where the loop yields.
 */
async function decomposeStackedLayers(
  labels: LabelMap,
  plan: StackPlan,
  turnPolicy: TurnPolicy,
  minArea: number,
  startLayers: (total: number) => void,
  onLayer: (label: number, paths: CrackPath[]) => Promise<void>,
): Promise<void> {
  const floor = Math.max(1, minArea)
  const stackData = plan.stackLabels
  const order = plan.order

  // Pixel indices bucketed by label (one O(n) pass) so each layer is built
  // from the previous one by removing just the label that dropped out — the
  // union masks are the same bits as a per-layer full rescan, at O(n) total
  // instead of O(k·n).
  const nPix = stackData.length
  const labelCount = plan.labelCount
  const stackCounts = new Uint32Array(labelCount)
  for (let p = 0; p < nPix; p++) {
    const l = stackData[p]
    if (l >= 0) stackCounts[l]++
  }
  const offset = new Int32Array(labelCount + 1)
  for (let l = 0; l < labelCount; l++) offset[l + 1] = offset[l] + stackCounts[l]
  const bucket = new Int32Array(offset[labelCount])
  const cursor = offset.slice(0, labelCount)
  for (let p = 0; p < nPix; p++) {
    const l = stackData[p]
    if (l >= 0) bucket[cursor[l]++] = p
  }

  const unionMask: BinaryMask = {
    width: labels.width,
    height: labels.height,
    data: new Uint8Array(nPix),
  }
  const union = unionMask.data
  // Layer 0's union is every labeled pixel (all layers stacked); higher layers
  // peel off. The union is only the running membership test for the flood
  // below — it is never traced directly.
  for (let p = 0; p < nPix; p++) union[p] = stackData[p] >= 0 ? 1 : 0

  // A lower layer extends under the sheets above it so their shared edges
  // cannot crack — but only where its own color actually reaches. The raw
  // union also drags in far regions that sit entirely above this layer and
  // are already fully covered by their own sheets: redundant underlay this
  // layer's color never touches, so it backs none of this layer's seams and
  // only adds area to weed. Keep just the union components the layer's own
  // color reaches — flood 4-connected from its pixels through the union — so
  // those disconnected islands drop out of the cut. The region directly below
  // a dropped island still backs it, so no seam is lost; and the base, whose
  // color threads the whole silhouette, still floods to one full solid.
  const cutMask: BinaryMask = {
    width: labels.width,
    height: labels.height,
    data: new Uint8Array(nPix),
  }
  const cut = cutMask.data
  const flood = new Int32Array(nPix)
  const w = labels.width

  // The paint order is the base layers followed by the island layers on top.
  startLayers(order.length + plan.islands.length)
  for (let i = 0; i < order.length; i++) {
    const label = order[i]
    // Seed the flood from this layer's own pixels, then grow through the
    // union; `cut` ends up as exactly the union components its color reaches.
    cut.fill(0)
    let sp = 0
    for (let k = offset[label]; k < offset[label + 1]; k++) {
      const p = bucket[k]
      if (cut[p] === 0) {
        cut[p] = 1
        flood[sp++] = p
      }
    }
    while (sp > 0) {
      const p = flood[--sp]
      const x = p - ((p / w) | 0) * w
      if (x > 0 && union[p - 1] === 1 && cut[p - 1] === 0) {
        cut[p - 1] = 1
        flood[sp++] = p - 1
      }
      if (x < w - 1 && union[p + 1] === 1 && cut[p + 1] === 0) {
        cut[p + 1] = 1
        flood[sp++] = p + 1
      }
      if (p >= w && union[p - w] === 1 && cut[p - w] === 0) {
        cut[p - w] = 1
        flood[sp++] = p - w
      }
      if (p < nPix - w && union[p + w] === 1 && cut[p + w] === 0) {
        cut[p + w] = 1
        flood[sp++] = p + w
      }
    }
    const paths = decomposeMask(cutMask, turnPolicy, floor)
    // Remove this layer's own pixels so the next union is the layers below it.
    for (let k = offset[label]; k < offset[label + 1]; k++) union[bucket[k]] = 0
    // oxlint-disable-next-line no-await-in-loop
    await onLayer(label, paths)
  }

  // Island layers: each lifted color repainted on top of every base layer.
  for (const island of plan.islands) {
    cut.fill(0)
    for (const p of island.pixels) cut[p] = 1
    const paths = decomposeMask(cutMask, turnPolicy, floor)
    // oxlint-disable-next-line no-await-in-loop
    await onLayer(island.label, paths)
  }
}

/**
 * Cutout tracing across helpers: the coordinator walks the crack network into
 * chains, each chain is fitted ONCE in the helper that owns it, and the regions
 * are assembled here from the shared fits — so both neighbours of a chain still
 * inherit mathematically identical geometry and the partition stays seam-free.
 */
async function fitCutoutInHelpers(
  run: Run,
  helpers: HelperPool,
  labels: LabelMap,
  image: RasterImage,
  paletteOklab: Float32Array | undefined,
  curve: HelperCurveOptions,
  arcPrecision: number | undefined,
  helperCtx: HelperContext,
  labelScope: string,
): Promise<RegionShape[]> {
  const network = extractChains(labels)
  if (paletteOklab) helpers.setImage(helperCtx.scope, image)
  helpers.setChains(labelScope, network)
  const fits: ChainFit[] = new Array(network.chains.length)
  let done = 0
  for await (const out of helpers.dispatch({
    kind: 'fit-chains',
    total: network.chains.length,
    stateKey: labelScope,
    curve,
    batch: CHAIN_BATCH,
    paletteOklab,
    arcPrecision,
  })) {
    fits[out.unit] = { open: out.shapes[0], closed: out.shapes[1] }
    done++
    // A chain is small, so progress and the cancel check tile the run in
    // batches rather than per chain.
    if ((done & CHAIN_TICK_MASK) === 0) {
      run.progress(done / network.chains.length)
      // oxlint-disable-next-line no-await-in-loop
      await run.tick()
    }
  }
  return assembleRegions(network, fits)
}

/** Chains between a progress report and a cancel check (a power of two, minus one). */
const CHAIN_TICK_MASK = 255

/**
 * Chains per helper reply. A chain is small and there are many, so batching
 * keeps the job to a few hundred messages instead of one per chain.
 */
const CHAIN_BATCH = 256

async function inkPipeline(
  run: Run,
  image: RasterImage,
  opaque: BinaryMask | null,
  settings: VectorizeSettings,
  shapes: SvgShape[],
  warnings: VectorizeWarning[],
  setPalette: (p: string[]) => void,
  edgeHint: GrayImage | undefined,
  coverageHint: GrayImage | undefined,
  cache: StageCache | undefined,
  imageId: number | undefined,
  helperCtx: HelperContext,
): Promise<void> {
  run.stage('palette')
  // The despeckled mask and its coverage field are reused when the image and
  // every threshold setting behind them are unchanged. Both hints feed the mask
  // or the field without appearing in the key, so caching is off while either is
  // present (correctness over speed).
  const canCacheInk =
    cache !== undefined &&
    imageId !== undefined &&
    cache.imageId === imageId &&
    edgeHint === undefined &&
    coverageHint === undefined
  const inkKey = canCacheInk ? inkKeyOf(settings) : undefined
  let entry = canCacheInk && cache.ink?.key === inkKey ? cache.ink : undefined
  // Edge hint (if any) protects thin real features from the size-based despeckle;
  // with no hint this is byte-identical to despeckleMask (and always null when caching).
  const protect = edgeProtectMask(edgeHint, image.width, image.height)

  let mask: BinaryMask
  // Signed boundary field for sub-pixel trace refinement. Only the global
  // threshold has a single crossing level to build it from; adaptive and pixel
  // mode trace on the exact lattice.
  let coverage: GrayImage | undefined
  if (entry) {
    mask = entry.mask
    coverage = entry.coverage
    cacheStats(cache!).inkHits++
    await run.tick()
    run.stage('segment')
    await run.tick()
  } else {
    if (canCacheInk) cacheStats(cache!).inkMisses++
    const gray = toGrayscale(image)
    if (settings.thresholdMode === 'adaptive') {
      mask = adaptiveBinarize(
        gray,
        settings.adaptiveRadius,
        settings.adaptiveBias / 255,
        settings.invert,
        opaque,
      )
      if (settings.curveMode !== 'pixel') {
        coverage = signedAdaptiveField(
          gray,
          settings.adaptiveRadius,
          settings.adaptiveBias / 255,
          settings.invert,
        )
      }
    } else {
      const t =
        settings.thresholdMode === 'auto' ? otsuThreshold(gray, opaque) : settings.threshold / 255
      mask = binarize(gray, t, settings.invert, opaque)
      if (settings.curveMode !== 'pixel') coverage = signedThresholdField(gray, t, settings.invert)
    }
    // A learned coverage hint (FieldEnhancer) replaces the field derived from the
    // degraded input, so refinement snaps ring vertices to the clean edge. Quantized
    // (the discretization boundary) and only when a sub-pixel field applies. No hint
    // ⇒ the classical field, byte-identical.
    if (coverageHint && settings.curveMode !== 'pixel') {
      const hf = coverageHintField(coverageHint, image.width, image.height)
      if (hf) coverage = hf
    }
    await run.tick()

    run.stage('segment')
    mask = despeckleMaskGuided(mask, settings.minRegionArea, protect)
    await run.tick()
    if (canCacheInk && inkKey !== undefined) {
      entry = { key: inkKey, mask, coverage }
      cache!.ink = entry
    }
  }

  if (run.tracing) {
    run.emitStep(() => ({
      code: 'threshold',
      label: 'Threshold',
      rasters: [rasterFromMask(mask, 'Binary mask')],
      charts: [luminanceHistogram(image)],
      metrics: {
        blackFraction: Math.round(maskFraction(mask) * 1000) / 1000,
        threshold: settings.threshold,
      },
      notes: [`Threshold mode: ${settings.thresholdMode}${settings.invert ? ' (inverted)' : ''}.`],
    }))
  }

  run.stage('trace')
  setPalette([settings.fillColor])

  if (settings.mode === 'bw') {
    // With a hint, the guided despeckle is the speck filter (it already dropped
    // everything small that the hint did not protect), so the tracer must not
    // re-drop the small features it kept — mirrors preserveDetails in color.
    const traceMinArea = protect ? 1 : Math.max(1, settings.minRegionArea)
    // The mask's rings are decomposed once per turn policy + speck floor and
    // their polygons built once against this entry's coverage field, so a
    // curve-only change replays smoothing and curve optimization alone.
    const ringKey = `${settings.turnPolicy}|${traceMinArea}`
    // `pixel` curveMode emits the exact lattice ring and never reads a polygon.
    const wantPolygons = settings.curveMode !== 'pixel'
    let paths: CrackPath[]
    let polygons: (FlatPoints | null)[] | undefined
    if (entry?.rings && entry.ringKey === ringKey) {
      paths = entry.rings
      polygons = wantPolygons ? entry.polygons : undefined
      cacheStats(cache!).ringHits++
    } else {
      paths = decomposeMask(mask, settings.turnPolicy, traceMinArea)
      if (entry) {
        entry.ringKey = ringKey
        entry.rings = paths
        entry.polygons = undefined
        cacheStats(cache!).ringMisses++
      }
    }
    const curve: HelperCurveOptions = {
      curveMode: settings.curveMode,
      smoothing: settings.smoothing,
      curveOptimize: settings.curveOptimize,
      optTolerance: settings.optTolerance,
      cornerThreshold: settings.cornerThreshold,
    }
    const helpers = helperCtx.helpers
    let traced: TracedShape[]
    if (helpers) {
      // One ring is the parallel unit. A bw shape is an outer ring plus the holes
      // under it, and one ink silhouette routinely carries most of the rings in
      // an image, so a shape-sized unit would leave the run waiting on it — the
      // ring is what balances. The grouping and the descending-area order follow
      // from the rings' signs and parents alone, so the shapes the coordinator
      // concatenates here are exactly the ones `shapesFromPaths` would produce,
      // in the same order.
      const units = ringShapeUnits(paths)
      const inkScope =
        inkKey !== undefined ? `${helperCtx.scope}|${inkKey}` : `#${helperCtx.serial}`
      const ringsKey = `${inkScope}|${ringKey}`
      helpers.setRingUnits(ringsKey, {
        width: mask.width,
        height: mask.height,
        rings: paths.map((p) => p.points),
        coverage: wantPolygons ? coverage : undefined,
      })
      const ringCommands: PathCommand[][] = new Array(paths.length)
      let done = 0
      for await (const out of helpers.dispatch({
        kind: 'trace-rings',
        total: paths.length,
        stateKey: ringsKey,
        curve,
        batch: RING_BATCH,
      })) {
        ringCommands[out.unit] = out.shapes[0]
        done++
        if ((done & RING_TICK_MASK) === 0) {
          run.progress(done / paths.length)
          // oxlint-disable-next-line no-await-in-loop
          await run.tick()
        }
      }
      traced = units.map((unit) => {
        const commands: PathCommand[] = []
        for (const ring of unit.rings) commands.push(...ringCommands[ring])
        return { commands, area: unit.area, holeCount: unit.holeCount }
      })
      for (const shape of traced) {
        shapes.push({ commands: shape.commands, fill: settings.fillColor, fillRule: 'evenodd' })
      }
    } else {
      if (wantPolygons) {
        if (polygons) {
          cacheStats(cache!).polyHits++
        } else {
          polygons = paths.map((p) => ringPolygon(p.points, coverage))
          if (entry) {
            entry.polygons = polygons
            cacheStats(cache!).polyMisses++
          }
        }
      }
      traced = shapesFromPaths(paths, { ...curve, coverage }, polygons)
      for (const shape of traced) {
        shapes.push({ commands: shape.commands, fill: settings.fillColor, fillRule: 'evenodd' })
      }
    }
    if (settings.detectIslands) warnIslands(traced, warnings)
    run.progress(1)
  } else {
    warnCenterlineInput(mask, warnings)
    const skeleton = zhangSuenThin(mask)
    run.progress(0.4)
    await run.tick()
    if (run.tracing) {
      run.emitStep(() => ({
        code: 'thin',
        label: 'Skeleton',
        rasters: [rasterFromMask(skeleton, 'Zhang–Suen skeleton')],
        metrics: { strokePixels: Math.round(maskFraction(skeleton) * skeleton.data.length) },
      }))
    }
    // Distance field feeds a per-stroke width (varying line weight is kept);
    // the global estimate is the fallback and the explicit-width path.
    const useEstimate = settings.strokeWidth <= 0
    const distanceField = useEstimate ? chamferDistance(mask) : undefined
    const globalWidth = useEstimate ? estimateStrokeWidth(mask, skeleton) : settings.strokeWidth
    const strokes = traceCenterline(skeleton, {
      pruneLength: settings.pruneLength,
      cornerThreshold: settings.cornerThreshold,
      fitTolerance: settings.fitTolerance,
      simplifyTolerance: settings.simplifyTolerance,
      smoothing: settings.smoothing,
      distanceField,
    })
    for (const stroke of strokes) {
      const width = useEstimate ? (stroke.width ?? globalWidth) : globalWidth
      shapes.push({
        commands: stroke.commands,
        stroke: settings.fillColor,
        strokeWidth: round2(width),
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      })
    }
    run.progress(1)
  }
}

/** Rings between a progress report and a cancel check (a power of two, minus one). */
const RING_TICK_MASK = 255

/** Bw rings per helper reply — small units, so they travel in groups. */
const RING_BATCH = 64

/**
 * Group decomposed rings into the shapes `shapesFromPaths` builds from them: a
 * positive ring is an outer boundary, a negative one a hole appended to the
 * smallest positive ring enclosing it, and the shapes come back by descending
 * enclosed area. Depends on the rings' area signs and parents only — no curve
 * fitting — so a caller can partition the fitting work by shape.
 */
function ringShapeUnits(
  paths: CrackPath[],
): { rings: number[]; area: number; holeCount: number }[] {
  const units: { rings: number[]; area: number; holeCount: number }[] = []
  // Decomposition index → index in `units`. An enclosing ring is always
  // decomposed before the paths it contains, so its entry is already in place.
  const outerOf = new Int32Array(paths.length)
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i]
    if (path.area > 0) {
      outerOf[i] = units.length
      units.push({ rings: [i], area: path.area, holeCount: 0 })
    } else if (path.parent >= 0) {
      const unit = units[outerOf[path.parent]]
      unit.rings.push(i)
      unit.holeCount++
    }
  }
  units.sort((a, b) => b.area - a.area)
  return units
}

function desaturateInPlace(image: RasterImage): void {
  const { data } = image
  for (let i = 0; i < data.length; i += 4) {
    const L = rgbToOklab(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255)[0]
    const v = Math.round(L * 255)
    data[i] = v
    data[i + 1] = v
    data[i + 2] = v
  }
}

/**
 * Per-label region perimeter: the number of cell sides that face a different
 * label or the image exterior. A thin outline threading between regions, or a
 * backdrop wrapping every shape, has a far larger perimeter than a compact blob
 * of the same color — so the max-perimeter label is the one the others sit on
 * top of. Indexed by label; unlabeled cells contribute nothing.
 */
function regionPerimeters(labels: LabelMap): Float64Array {
  const { data, width, height } = labels
  const perim = new Float64Array(labels.count)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const l = data[i]
      if (l < 0) continue
      if (x + 1 >= width || data[i + 1] !== l) perim[l]++
      if (x - 1 < 0 || data[i - 1] !== l) perim[l]++
      if (y + 1 >= height || data[i + width] !== l) perim[l]++
      if (y - 1 < 0 || data[i - width] !== l) perim[l]++
    }
  }
  return perim
}

/**
 * Stacking order for a label map, base first: the most connective color (max
 * region perimeter — it borders the most other regions) is pinned to the bottom
 * as the full-silhouette base; the rest follow by descending pixel count. Labels
 * with no pixels are omitted. Only the base is re-seated, so the deterministic
 * area order is otherwise preserved.
 */
function stackingOrder(labels: LabelMap, counts: Uint32Array): number[] {
  const order: number[] = []
  for (let l = 0; l < counts.length; l++) if (counts[l] > 0) order.push(l)
  order.sort((a, b) => counts[b] - counts[a])
  if (order.length > 1) {
    const perim = regionPerimeters(labels)
    let base = order[0]
    let bestPerim = perim[base]
    for (const l of order) {
      if (perim[l] > bestPerim) {
        bestPerim = perim[l]
        base = l
      }
    }
    const at = order.indexOf(base)
    if (at > 0) {
      order.splice(at, 1)
      order.unshift(base)
    }
  }
  return order
}

/**
 * Detect color ramps and merge the posterized bands that form them into
 * gradient regions (mutating `labels`), including semi-transparent overlays
 * stacked over a ramp and fades of a transparent source. Off for a fixed
 * palette (the user pinned exact colors) and in pixel mode (exact lattice), and
 * only in color/grayscale modes. Returns the per-label paint table and underlay
 * table, or undefined when it did not run or found nothing (byte-identical to
 * the flat-fill path).
 */
function applyGradients(
  image: RasterImage,
  labels: LabelMap,
  paletteHex: string[],
  paletteRgb: Uint8Array,
  alpha: Uint8Array | null,
  settings: VectorizeSettings,
):
  | {
      gradients: (GradientPaint | null)[]
      underlays: Int32Array
      labels: LabelMap
      paletteHex: string[]
      paletteRgb: Uint8Array
    }
  | undefined {
  if (!settings.gradients || settings.palette !== null || settings.curveMode === 'pixel') {
    return undefined
  }
  const s = settings.gradientStrength
  const fitted = fitRegionGradients(image, labels, {
    alpha: alpha ?? undefined,
    minArea:
      settings.gradientMinArea > 0
        ? settings.gradientMinArea
        : Math.max(GRADIENT_MIN_AREA, settings.minRegionArea),
    // Strength loosens the growth's backtracking ceiling and lowers the required
    // color span together, so a low value keeps only clean, high-contrast ramps
    // (flat objects stay flat) and a high value tolerates more reversal and
    // catches subtler ramps. 0.5 reproduces the neutral defaults.
    maxBacktrack: 0.06 + 0.18 * s,
    minColorSpan: 0.09 - 0.08 * s,
    // The pixel-level ramp verification dominates on a large image; run the
    // detection on a copy no larger than this on the long side and carry the
    // decisions back to the full-resolution regions. Trades exact detection for
    // a usable cost; the traced boundaries stay full-resolution.
    detectMaxDimension: settings.gradientMaxDimension,
  })
  if (!fitted.gradients.some((g) => g !== null)) return undefined
  // A label split off a quantization label (one component joined a ramp, another
  // did not) inherits the flat color of the label it came from.
  const total = fitted.labels.count
  const hex = paletteHex.slice()
  const rgb = new Uint8Array(total * 3)
  rgb.set(paletteRgb.subarray(0, Math.min(paletteRgb.length, total * 3)))
  for (let l = paletteHex.length; l < total; l++) {
    const parent = fitted.parentLabel[l]
    hex.push(paletteHex[parent])
    rgb[l * 3] = paletteRgb[parent * 3]
    rgb[l * 3 + 1] = paletteRgb[parent * 3 + 1]
    rgb[l * 3 + 2] = paletteRgb[parent * 3 + 2]
  }
  return {
    gradients: fitted.gradients,
    underlays: fitted.underlays,
    labels: fitted.labels,
    paletteHex: hex,
    paletteRgb: rgb,
  }
}

/** Recount pixels per label after a relabel (gradient merge). */
function countLabels(labels: LabelMap): Uint32Array {
  const counts = new Uint32Array(labels.count)
  for (let i = 0; i < labels.data.length; i++) {
    const l = labels.data[i]
    if (l >= 0) counts[l]++
  }
  return counts
}

/** Append each color not already present (preserves first-appearance order). */
function addColors(palette: string[], colors: readonly string[]): void {
  for (const c of colors) if (!palette.includes(c)) palette.push(c)
}

/** Per-label palette colors as an interleaved Oklab buffer (length count*3). */
function paletteToOklab(paletteRgb: Uint8Array): Float32Array {
  const m = (paletteRgb.length / 3) | 0
  const out = new Float32Array(m * 3)
  for (let i = 0; i < m; i++) {
    const [L, a, b] = rgbToOklab(
      paletteRgb[i * 3] / 255,
      paletteRgb[i * 3 + 1] / 255,
      paletteRgb[i * 3 + 2] / 255,
    )
    out[i * 3] = L
    out[i * 3 + 1] = a
    out[i * 3 + 2] = b
  }
  return out
}

/** Nearest palette entry to the dominant border color (for omitBackground). */
function nearestPaletteLabel(image: RasterImage, paletteHex: string[]): number {
  const [br, bg, bb] = borderDominantColor(image)
  const [bL, ba2, bb2] = rgbToOklab(br / 255, bg / 255, bb / 255)
  let best = -1
  let bestD = Infinity
  for (let i = 0; i < paletteHex.length; i++) {
    const rgb = hexToRgb(paletteHex[i])
    if (!rgb) continue
    const [L, a, b] = rgbToOklab(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
    const d = deltaEOkSq(L, a, b, bL, ba2, bb2)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

function warnIslands(traced: TracedShape[], warnings: VectorizeWarning[]): void {
  let islands = 0
  for (const shape of traced) islands += shape.holeCount
  if (islands > 0) {
    warnings.push({
      code: 'stencil-islands',
      severity: 'warning',
      message: `${islands} enclosed island${islands === 1 ? '' : 's'} would fall out of a physical stencil — add bridges in your editor.`,
      params: { count: islands },
    })
  }
}

/**
 * Centerline suits thin line art: it traces the medial axis of the ink. When
 * the ink is a large filled area the skeleton is a spidery medial graph that
 * looks nothing like the source, so warn and point at the filled-shape modes.
 */
const CENTERLINE_FILL_FRACTION = 0.35
function warnCenterlineInput(mask: BinaryMask, warnings: VectorizeWarning[]): void {
  const { data } = mask
  if (data.length === 0) return
  let ink = 0
  for (let i = 0; i < data.length; i++) ink += data[i]
  const fraction = ink / data.length
  if (fraction > CENTERLINE_FILL_FRACTION) {
    warnings.push({
      code: 'centerline-input',
      severity: 'warning',
      message: `Centerline traces the middle of thin lines, but ~${Math.round(fraction * 100)}% of this image is filled — expect a skeleton, not matching outlines. Use B&W or Color mode for solid shapes.`,
      params: { percent: Math.round(fraction * 100) },
    })
  }
}

function warnTinyFeatures(
  shapes: SvgShape[],
  widthPx: number,
  settings: VectorizeSettings,
  warnings: VectorizeWarning[],
): void {
  const mmPx = mmPerPx(widthPx, settings.widthMm)
  let minSide = Infinity
  for (const shape of shapes) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const cmd of shape.commands) {
      if (cmd.type === 'Z') continue
      if (cmd.x < minX) minX = cmd.x
      if (cmd.y < minY) minY = cmd.y
      if (cmd.x > maxX) maxX = cmd.x
      if (cmd.y > maxY) maxY = cmd.y
    }
    if (minX < Infinity) {
      minSide = Math.min(minSide, Math.min(maxX - minX, maxY - minY))
    }
  }
  if (minSide < Infinity && minSide * mmPx < 1) {
    warnings.push({
      code: 'tiny-features',
      severity: 'warning',
      message: `Smallest shape is ~${(minSide * mmPx).toFixed(2)} mm — most blades/lasers cannot cut below 1 mm cleanly.`,
      params: { mm: (minSide * mmPx).toFixed(2) },
    })
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

export function createNativeEngine(): TrazorEngine {
  return {
    id: 'native',
    label: 'Trazor native',
    modes: ['color', 'grayscale', 'bw', 'centerline'] satisfies VectorizeMode[],
    vectorize: (image, settings, ctx) => vectorize(image, settings, ctx),
  }
}

export { DEFAULT_SETTINGS }
