import {
  CancelledError,
  DEFAULT_SETTINGS,
  deltaEOk,
  deltaEOkSq,
  hexToRgb,
  normalizeSettings,
  nowMs,
  rgbToHex,
  rgbToOklab,
} from '@trazor/core'
import type {
  BinaryMask,
  EngineContext,
  GrayImage,
  LabelMap,
  RasterImage,
  StageId,
  StageTiming,
  VectorizeMode,
  VectorizeResult,
  VectorizeSettings,
  VectorizeWarning,
  TrazorEngine,
} from '@trazor/core'
import {
  adaptiveBinarize,
  bilateralFilter,
  binarize,
  borderDominantColor,
  chamferDistance,
  clearBorderLabel,
  detectEdges,
  despeckleMaskGuided,
  dilate,
  dissolveThinBands,
  estimateStrokeWidth,
  findEnclosedComponents,
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
import { traceCenterline, traceLabelMap, traceMask } from '@trazor/trace'
import type { TracedShape } from '@trazor/trace'
import { analyzeSvg, fitArcs, serializeSvg } from '@trazor/svg'
import type { QuantizeResult } from '@trazor/raster'
import type { SvgShape } from '@trazor/svg'

const QUANTIZE_SEED = 0x02f6e2b1

/** Oklab ΔE above which a small region counts as a keep-worthy detail. */
const DETAIL_CONTRAST = 0.1

/**
 * Salient-color rescue: a protected pixel whose own color differs from its
 * assigned centroid by more than this is a feature the palette swallowed —
 * worth its own entry.
 */
const RESCUE_DE = 0.1
/** Fewer rescued pixels than this change nothing. */
const RESCUE_MIN_PIXELS = 8
/** Cap on rescued palette entries per run. */
const RESCUE_MAX_COLORS = 4
/**
 * A rescued pixel must be locally flat in some 4-direction (min neighbor ΔE
 * below this): real strokes are flat along their axis, while anti-aliased rim
 * mixtures differ in every direction and must not earn band colors.
 */
const RESCUE_FLAT = 0.06

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
 * Classical salience mask: the working image's own strong color boundaries,
 * dilated by one pixel so a thin feature's own pixels are covered. The gradient
 * threshold is the discretization boundary — pure integer comparison, so this is
 * deterministic with or without an ML hint in play.
 */
function salienceProtectMask(image: RasterImage): BinaryMask {
  return dilate(detectEdges(image, CLUSTER_EDGE_THRESHOLD), 1)
}

/** Palette RGB (count×3 bytes) → interleaved Oklab (count×3 floats). */
function paletteOklabOf(rgb: Uint8Array): Float32Array {
  const oklab = new Float32Array(rgb.length)
  for (let i = 0; i < rgb.length; i += 3) {
    const [L, a, b] = rgbToOklab(rgb[i] / 255, rgb[i + 1] / 255, rgb[i + 2] / 255)
    oklab[i] = L
    oklab[i + 1] = a
    oklab[i + 2] = b
  }
  return oklab
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

class Run {
  private timings: StageTiming[] = []
  private stageStart = 0
  private currentStage: StageId | null = null

  constructor(private ctx?: EngineContext) {}

  /** Enter a stage, closing the previous one's timing. */
  stage(stage: StageId): void {
    this.closeStage()
    this.currentStage = stage
    this.stageStart = nowMs()
    this.progress(0)
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
}

/**
 * Reusable intermediates the worker keeps across runs so that tuning trace-only
 * settings does not re-run preprocessing and quantization. One preprocess entry
 * keyed by the client's image id plus the preprocess settings slice, and a small
 * LRU of palette entries keyed by the palette slice — so a search that alternates
 * palettes on one worker (e.g. an oscillating incumbent) keeps recent ones warm
 * instead of thrashing a single slot. A new image or changed preprocess setting
 * clears the whole cache. Reuse is byte-identical to recomputation (deterministic
 * stages, complete keys).
 */
export interface StageCache {
  imageId?: number
  preKey?: string
  workImage?: RasterImage
  opaque?: BinaryMask | null
  /** LRU of palette entries (valid for the current image + preKey); newest last. */
  palette?: Map<string, PaletteEntry>
  /** Reuse counters, for measuring affinity/cache effectiveness. */
  stats?: StageCacheStats
}

/** Cache hit/miss counters (both preprocess and palette stages). */
export interface StageCacheStats {
  preHits: number
  preMisses: number
  palHits: number
  palMisses: number
}

/** Palette entries retained per worker; caps memory while covering an oscillating incumbent. */
const PALETTE_CACHE_SIZE = 4

function cacheStats(cache: StageCache): StageCacheStats {
  return (cache.stats ??= { preHits: 0, preMisses: 0, palHits: 0, palMisses: 0 })
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
    s.preserveSalient,
    s.dissolveBands,
    s.colorCoherence,
    s.omitBackground,
  ].join('|')
}

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

  // ---- preprocess (reused across runs when the image + preprocess key match) ----
  run.stage('preprocess')
  const preKey = preKeyOf(settings)
  let image: RasterImage
  let opaque: BinaryMask | null
  if (cacheable && cache.imageId === imageId && cache.preKey === preKey && cache.workImage) {
    image = cache.workImage
    opaque = cache.opaque ?? null
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
    if (settings.mode === 'grayscale') desaturateInPlace(img)
    image = img
    if (cacheable) {
      cacheStats(cache).preMisses++
      // New image or preprocess ⇒ every palette entry depended on it, so clear them.
      cache.imageId = imageId
      cache.preKey = preKey
      cache.workImage = image
      cache.opaque = opaque
      cache.palette = new Map()
    }
  }
  const { width, height } = image
  await run.tick()

  // ---- per-mode tracing into SVG shapes ----
  const shapes: SvgShape[] = []
  let palette: string[] = []

  if (settings.mode === 'color' || settings.mode === 'grayscale') {
    await colorPipeline(
      run,
      image,
      opaque,
      settings,
      shapes,
      warnings,
      (p) => (palette = p),
      ctx?.edgeHint,
      cacheable ? cache : undefined,
      imageId,
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
    )
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
      shapes,
    },
    {
      precision: settings.precision,
      optimizePaths: settings.optimizeSvg,
      // Full-shape primitive substitution (<circle>/<ellipse>/<rect rx>) stays
      // off for cutout — an element can't be shared with a neighbor's path edge.
      // Arc fitting for cutout happens seam-safely per shared chain instead (the
      // `refineChain` passed to traceLabelMap below).
      roundPrimitives: settings.optimizeSvg && settings.layering !== 'cutout',
      // One <g> per cut layer (color layers only). Cutout is a color partition,
      // so group by color; stacked paints in layer order and a color can recur
      // at two heights (a base outline and a pupil island above it), so group by
      // paint layer to keep those separate and correctly ordered.
      groupByColor: grouped && settings.layering === 'cutout',
      groupByLayer: grouped && settings.layering !== 'cutout',
    },
  )
  run.progress(0.6)
  const analysis = analyzeSvg(svg)

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
  }
}

async function colorPipeline(
  run: Run,
  image: RasterImage,
  opaque: BinaryMask | null,
  settings: VectorizeSettings,
  shapes: SvgShape[],
  warnings: VectorizeWarning[],
  setPalette: (p: string[]) => void,
  edgeHint: GrayImage | undefined,
  cache: StageCache | undefined,
  imageId: number | undefined,
): Promise<void> {
  run.stage('palette')
  // The palette + cleaned label map are reused when the image and every setting
  // that shapes them are unchanged. An edge hint feeds the merge, so caching is
  // disabled while one is present (correctness over speed).
  const canCachePal = cache !== undefined && imageId !== undefined && edgeHint === undefined
  const palKey = canCachePal ? palKeyOf(settings) : undefined
  // Edge hint (if any) protects thin features from the size merge and from the
  // tracer's speck filter; without one, `preserveSalient` derives the same mask
  // classically from the image's own boundaries. Null when neither applies.
  const protect =
    edgeProtectMask(edgeHint, image.width, image.height) ??
    (settings.preserveSalient ? salienceProtectMask(image) : null)

  let labels: LabelMap
  let paletteHex: string[]
  let paletteRgb: Uint8Array
  let counts: Uint32Array
  let paletteClampedTo: number | undefined

  const cached =
    canCachePal && cache && cache.imageId === imageId && palKey !== undefined
      ? paletteGet(cache, palKey)
      : undefined
  if (cached) {
    labels = cached.labels
    paletteHex = cached.paletteHex
    paletteRgb = cached.paletteRgb
    counts = cached.counts
    paletteClampedTo = cached.paletteClampedTo
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
    // When a protect mask or detail preservation applies, the size merge must
    // happen HERE (protect-aware), so segmentRegions is told not to drop small
    // regions itself — otherwise they would be gone before protection runs.
    const seg = segmentRegions(image, {
      mergeThreshold: SEGMENT_MERGE_THRESHOLD,
      minRegionArea: protect || settings.preserveDetails ? 0 : settings.minRegionArea,
      maxRegions: settings.autoPaletteSize ? 0 : settings.paletteSize,
      mask: opaque,
    })
    await run.tick()
    if (protect || settings.preserveDetails) {
      mergeSmallRegions(seg.labels, settings.minRegionArea, {
        oklab: paletteOklabOf(seg.paletteRgb),
        keepContrast: DETAIL_CONTRAST,
        protect: protect ?? undefined,
      })
    }
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
    if (canCachePal && palKey !== undefined) {
      palettePut(cache!, palKey, { labels, paletteHex, paletteRgb, counts, paletteClampedTo })
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
    // With protection active, recover palette entries for salient features the
    // clustering sample excluded (thin strokes are all boundary pixels).
    if (settings.preserveSalient && protect && settings.palette === null) {
      rescueSalientColors(image, q, protect, settings.colorSpace)
    }
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
    // `protect` (hoisted above) lets an edge hint or the classical salience mask
    // keep small regions on a real boundary; with neither this is byte-identical
    // to the plain merge. `preserveSalient` also keeps contrast details, so a
    // low-contrast hairline on a strong edge survives while an isolated speck
    // below the salience threshold still merges away.
    if (settings.preserveDetails || settings.preserveSalient) {
      mergeSmallRegions(q.labels, settings.minRegionArea, {
        oklab: paletteOklabOf(q.paletteRgb),
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
    await run.tick()

    if (canCachePal && palKey !== undefined) {
      palettePut(cache!, palKey, { labels, paletteHex, paletteRgb, counts, paletteClampedTo })
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

  run.stage('trace')
  const curveOpts = {
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

  if (settings.layering === 'cutout') {
    // Sub-pixel color-boundary refinement: each shared chain is snapped onto the
    // true anti-aliased edge between its two region colors. Skipped in pixel
    // mode (exact lattice) and when the palette is degenerate.
    const colorField =
      settings.curveMode !== 'pixel' && paletteHex.length > 1
        ? { oklab: toOklabBuffer(image), paletteOklab: paletteToOklab(paletteRgb) }
        : undefined
    const regions = traceLabelMap(labels, {
      ...curveOpts,
      colorField,
      // Collapse circular/elliptical Bézier runs to `A` arcs per shared chain
      // (fitted once, reused reversed) so cutout gets the node reduction without
      // seam divergence. Full-shape primitives stay off for cutout (an element
      // can't be shared with a neighbour's path), which is why `roundPrimitives`
      // is disabled at serialization above.
      refineChain: settings.optimizeSvg ? (cmds) => fitArcs(cmds, settings.precision) : undefined,
    })
    regions.sort((a, b) => b.area - a.area)
    for (const region of regions) {
      const fill = paletteHex[region.label]
      if (!usedPalette.includes(fill)) usedPalette.push(fill)
      shapes.push({
        commands: region.commands,
        fill,
        fillRule: 'evenodd',
        ...(settings.gapFill > 0
          ? { stroke: fill, strokeWidth: settings.gapFill, strokeLinejoin: 'round' as const }
          : {}),
      })
    }
    run.progress(1)
  } else {
    // Stacked: each layer covers itself plus the sheets above that its own
    // color actually reaches, so lower shapes extend underneath their neighbours
    // and edges cannot crack — without dragging in far regions already covered
    // by their own sheets (see the per-layer flood below). The most connective
    // color — the one whose regions have the largest total perimeter, i.e. that
    // borders the most other regions — is pinned to the bottom as the base,
    // so it reads as the outline/backdrop showing between the colors stacked on
    // top: the standard layered-vinyl build (a cartoon's black outline, a flat
    // design's background). A thin outline threading between regions outscores a
    // compact blob of the same color, and a tiny dark speck never wins. The
    // rest stack by descending area (large fields low, small details on top).
    // Order sets only which sheet is the full base and the layer/group order —
    // never the rendered pixels, since each pixel's topmost layer is its own.
    // An enclosed island whose color sits below its surround punches a floating
    // hole in every layer stacked over it. Because the island is ringed by a
    // single color, the count of those layers is exactly its stack depth below
    // the surround: each level from just above the island up to the surround
    // still has that ring, so each carries a hole. Lift a pocket only when two
    // or more sheets stack over it — one sheet's single hole weeds and aligns
    // cleanly, but two or more drift and let the middle sheets peek through.
    // Lifting relabels the island into its surround for the solid base layers,
    // then repaints it on top as its own island layer; its mask is exactly its
    // own pixels, so nested regions still show through and the rendered pixels
    // are unchanged — only the cut layers get cleaner.
    const order0 = stackingOrder(labels, counts)
    const position0 = new Int32Array(counts.length).fill(-1)
    order0.forEach((l, i) => (position0[l] = i))
    const islands = findEnclosedComponents(labels).filter((c) => {
      const depth = position0[c.surround] - position0[c.label]
      return position0[c.label] >= 0 && position0[c.surround] >= 0 && depth >= MIN_LIFT_DEPTH
    })

    // The label map painted for the base layers: island pixels take their
    // surrounding label so nothing beneath them is punched out. With no islands
    // this is the original map and order (no extra work).
    let stackData = labels.data
    let stackCounts = counts
    let order = order0
    if (islands.length > 0) {
      stackData = new Int32Array(labels.data)
      for (const c of islands) for (const p of c.pixels) stackData[p] = c.surround
      stackCounts = new Uint32Array(counts.length)
      for (let i = 0; i < stackData.length; i++) {
        const l = stackData[i]
        if (l >= 0) stackCounts[l]++
      }
      const stackLabels: LabelMap = {
        width: labels.width,
        height: labels.height,
        data: stackData,
        count: labels.count,
      }
      order = stackingOrder(stackLabels, stackCounts)
    }

    // Pixel indices bucketed by label (one O(n) pass) so each layer is built
    // from the previous one by removing just the label that dropped out — the
    // union masks are the same bits as a per-layer full rescan, at O(n) total
    // instead of O(k·n).
    const nPix = stackData.length
    const offset = new Int32Array(stackCounts.length + 1)
    for (let l = 0; l < stackCounts.length; l++) offset[l + 1] = offset[l] + stackCounts[l]
    const bucket = new Int32Array(offset[stackCounts.length])
    const cursor = offset.slice(0, stackCounts.length)
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

    // Progress splits over the base layers plus the island layers on top.
    const totalLayers = order.length + islands.length
    let done = 0
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
      const traced = traceMask(cutMask, {
        ...curveOpts,
        turnPolicy: settings.turnPolicy,
        minArea: traceMinArea,
      })
      const fill = paletteHex[label]
      if (traced.length > 0 && !usedPalette.includes(fill)) usedPalette.push(fill)
      for (const shape of traced) {
        shapes.push({ commands: shape.commands, fill, fillRule: 'evenodd', layerId: i })
      }
      // Remove this layer's own pixels so the next union is the layers below it.
      for (let k = offset[label]; k < offset[label + 1]; k++) union[bucket[k]] = 0
      done++
      run.progress(done / totalLayers)
      // Sequential on purpose: yields the worker event loop between layers so
      // cancel messages interleave with the computation.
      // oxlint-disable-next-line no-await-in-loop
      await run.tick()
    }

    // Island layers: each lifted color repainted on top of every base layer.
    // Islands of different colors are disjoint pixel sets, so their paint order
    // is free; ascending label id keeps it deterministic.
    if (islands.length > 0) {
      const byColor = new Map<number, number[]>()
      for (const c of islands) {
        let arr = byColor.get(c.label)
        if (arr === undefined) {
          arr = []
          byColor.set(c.label, arr)
        }
        for (const p of c.pixels) arr.push(p)
      }
      const islandColors = [...byColor.keys()].sort((a, b) => a - b)
      const islandMask: BinaryMask = {
        width: labels.width,
        height: labels.height,
        data: new Uint8Array(nPix),
      }
      for (let c = 0; c < islandColors.length; c++) {
        const label = islandColors[c]
        islandMask.data.fill(0)
        for (const p of byColor.get(label) as number[]) islandMask.data[p] = 1
        const traced = traceMask(islandMask, {
          ...curveOpts,
          turnPolicy: settings.turnPolicy,
          minArea: traceMinArea,
        })
        const fill = paletteHex[label]
        if (traced.length > 0 && !usedPalette.includes(fill)) usedPalette.push(fill)
        for (const shape of traced) {
          shapes.push({
            commands: shape.commands,
            fill,
            fillRule: 'evenodd',
            layerId: order.length + c,
          })
        }
        done++
        run.progress(done / totalLayers)
        // oxlint-disable-next-line no-await-in-loop
        await run.tick()
      }
    }
  }
  setPalette(usedPalette)
  run.progress(1)
}

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
): Promise<void> {
  run.stage('palette')
  const gray = toGrayscale(image)
  let mask: BinaryMask
  // Signed boundary field for sub-pixel trace refinement. Only the global
  // threshold has a single crossing level to build it from; adaptive and pixel
  // mode trace on the exact lattice.
  let coverage: GrayImage | undefined
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
  // Edge hint (if any) protects thin real features from the size-based despeckle;
  // without one, `preserveSalient` protects the image's own strong edges. Null
  // when neither applies — byte-identical to despeckleMask.
  const protect =
    edgeProtectMask(edgeHint, image.width, image.height) ??
    (settings.preserveSalient ? salienceProtectMask(image) : null)
  mask = despeckleMaskGuided(mask, settings.minRegionArea, protect)
  await run.tick()

  run.stage('trace')
  setPalette([settings.fillColor])

  if (settings.mode === 'bw') {
    const traced = traceMask(mask, {
      curveMode: settings.curveMode,
      smoothing: settings.smoothing,
      curveOptimize: settings.curveOptimize,
      optTolerance: settings.optTolerance,
      cornerThreshold: settings.cornerThreshold,
      coverage,
      turnPolicy: settings.turnPolicy,
      // With a hint, the guided despeckle is the speck filter (it already dropped
      // everything small that the hint did not protect), so the tracer must not
      // re-drop the small features it kept — mirrors preserveDetails in color.
      minArea: protect ? 1 : Math.max(1, settings.minRegionArea),
    })
    for (const shape of traced) {
      shapes.push({ commands: shape.commands, fill: settings.fillColor, fillRule: 'evenodd' })
    }
    if (settings.detectIslands) warnIslands(traced, warnings)
    run.progress(1)
  } else {
    warnCenterlineInput(mask, warnings)
    const skeleton = zhangSuenThin(mask)
    run.progress(0.4)
    await run.tick()
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

/**
 * Salient-color rescue (the quantization half of `preserveSalient`). A thin
 * feature is nothing but boundary pixels, which the clustering sample excludes
 * — so with a small palette its color earns no centroid and the protect-aware
 * merge has no region to keep. This re-colors protected, locally-flat pixels
 * whose own color is far from their assigned centroid with their own (sub-
 * quantized, autoK-merged) palette entries, so the feature survives both as a
 * region and as a color. Mutates `q`; deterministic (fixed seed and scan order).
 */
function rescueSalientColors(
  image: RasterImage,
  q: QuantizeResult,
  protect: BinaryMask,
  colorSpace: 'oklab' | 'rgb',
): void {
  if (q.paletteHex.length >= 64) return
  const w = image.width
  const h = image.height
  const n = w * h
  const oklab = toOklabBuffer(image)
  const pOklab = paletteToOklab(q.paletteRgb)
  const mask = new Uint8Array(n)
  let cnt = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (protect.data[i] === 0) continue
      const l = q.labels.data[i]
      if (l < 0) continue
      const o = i * 3
      const p = l * 3
      if (
        deltaEOk(oklab[o], oklab[o + 1], oklab[o + 2], pOklab[p], pOklab[p + 1], pOklab[p + 2]) <=
        RESCUE_DE
      ) {
        continue
      }
      // Locally flat in some direction: a stroke pixel has same-color neighbors
      // along its axis; a rim mixture differs from all four.
      let flat = false
      const d = (j: number): number =>
        deltaEOk(
          oklab[o],
          oklab[o + 1],
          oklab[o + 2],
          oklab[j * 3],
          oklab[j * 3 + 1],
          oklab[j * 3 + 2],
        )
      if (x > 0 && d(i - 1) <= RESCUE_FLAT) flat = true
      else if (x < w - 1 && d(i + 1) <= RESCUE_FLAT) flat = true
      else if (y > 0 && d(i - w) <= RESCUE_FLAT) flat = true
      else if (y < h - 1 && d(i + w) <= RESCUE_FLAT) flat = true
      if (!flat) continue
      mask[i] = 1
      cnt++
    }
  }
  if (cnt < RESCUE_MIN_PIXELS) return
  const sub = quantize(image, {
    k: Math.min(RESCUE_MAX_COLORS, Math.max(2, cnt >> 4)),
    colorSpace,
    quality: 5,
    seed: QUANTIZE_SEED,
    mask: { width: w, height: h, data: mask },
    autoK: true,
  })
  const added = sub.labels.count
  if (added === 0) return
  const oldCount = q.labels.count
  const newData = new Int32Array(q.labels.data)
  const newRgb = new Uint8Array((oldCount + added) * 3)
  newRgb.set(q.paletteRgb)
  for (let i = 0; i < n; i++) {
    const l = sub.labels.data[i]
    if (l >= 0) newData[i] = oldCount + l
  }
  for (let i = 0; i < added; i++) {
    newRgb.set(sub.paletteRgb.subarray(i * 3, i * 3 + 3), (oldCount + i) * 3)
    q.paletteHex.push(
      rgbToHex(sub.paletteRgb[i * 3], sub.paletteRgb[i * 3 + 1], sub.paletteRgb[i * 3 + 2]),
    )
  }
  q.labels = { ...q.labels, data: newData, count: oldCount + added }
  q.paletteRgb = newRgb
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
  const widthMm = settings.widthMm > 0 ? settings.widthMm : (widthPx / 96) * 25.4
  const mmPerPx = widthMm / widthPx
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
  if (minSide < Infinity && minSide * mmPerPx < 1) {
    warnings.push({
      code: 'tiny-features',
      severity: 'warning',
      message: `Smallest shape is ~${(minSide * mmPerPx).toFixed(2)} mm — most blades/lasers cannot cut below 1 mm cleanly.`,
      params: { mm: (minSide * mmPerPx).toFixed(2) },
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
