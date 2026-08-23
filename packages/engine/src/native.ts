import {
  CancelledError,
  DEFAULT_SETTINGS,
  deltaEOkSq,
  hexToRgb,
  normalizeSettings,
  nowMs,
  rgbToOklab,
} from '@vectorizer/core'
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
  VectorizerEngine,
} from '@vectorizer/core'
import {
  adaptiveBinarize,
  bilateralFilter,
  binarize,
  borderDominantColor,
  chamferDistance,
  clearBorderLabel,
  detectEdges,
  despeckleMaskGuided,
  estimateStrokeWidth,
  flattenImage,
  gaussianBlur,
  medianFilter,
  mergeSmallRegions,
  otsuThreshold,
  quantize,
  resizeGray,
  resizeToFit,
  signedAdaptiveField,
  signedThresholdField,
  toGrayscale,
  toOklabBuffer,
  zhangSuenThin,
} from '@vectorizer/raster'
import { traceCenterline, traceLabelMap, traceMask } from '@vectorizer/trace'
import type { TracedShape } from '@vectorizer/trace'
import { analyzeSvg, serializeSvg } from '@vectorizer/svg'
import type { SvgShape } from '@vectorizer/svg'

const QUANTIZE_SEED = 0x02f6e2b1

/** Oklab ΔE above which a small region counts as a keep-worthy detail. */
const DETAIL_CONTRAST = 0.1

/** Boundary-map probability above which a pixel counts as a protected edge. */
const EDGE_PROTECT_THRESHOLD = 0.5

/**
 * L1 RGB gradient (0..765) at or above which a pixel is treated as an
 * anti-aliased boundary and kept out of the color-clustering training sample,
 * so rim mixtures cannot claim a palette entry.
 */
const CLUSTER_EDGE_THRESHOLD = 40

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

/**
 * Reusable intermediates the worker keeps across runs so that tuning trace-only
 * settings does not re-run preprocessing and quantization. A single entry keyed
 * by the client's image id plus the settings slice each stage depends on; a new
 * image or a changed preprocess/palette setting invalidates it. Reuse is
 * byte-identical to recomputation (deterministic stages, complete keys).
 */
export interface StageCache {
  imageId?: number
  preKey?: string
  workImage?: RasterImage
  opaque?: BinaryMask | null
  palKey?: string
  labels?: LabelMap
  paletteHex?: string[]
  paletteRgb?: Uint8Array
  counts?: Uint32Array
  /** Palette length when autoPaletteSize clamped it, else undefined (for the warning). */
  paletteClampedTo?: number
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
    s.paletteSize,
    s.autoPaletteSize,
    s.colorSpace,
    s.quantizeQuality,
    s.palette ? s.palette.join(',') : '-',
    s.minRegionArea,
    s.preserveDetails,
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
      // New image or preprocess ⇒ reset the whole entry (palette depends on it).
      cache.imageId = imageId
      cache.preKey = preKey
      cache.workImage = image
      cache.opaque = opaque
      cache.palKey = undefined
      cache.labels = undefined
      cache.paletteHex = undefined
      cache.paletteRgb = undefined
      cache.counts = undefined
      cache.paletteClampedTo = undefined
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
    )
  }

  // ---- svg ----
  run.stage('svg')
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
      // Circle/ellipse detection is a sub-pixel change; keep it off for cutout,
      // where the neighbor still traces the Bézier boundary and must match.
      roundPrimitives: settings.optimizeSvg && settings.layering !== 'cutout',
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
  // tracer's speck filter; null when no hint (and always null when caching).
  const protect = edgeProtectMask(edgeHint, image.width, image.height)

  let labels: LabelMap
  let paletteHex: string[]
  let paletteRgb: Uint8Array
  let counts: Uint32Array
  let paletteClampedTo: number | undefined

  if (canCachePal && cache.imageId === imageId && cache.palKey === palKey && cache.labels) {
    labels = cache.labels
    paletteHex = cache.paletteHex as string[]
    paletteRgb = cache.paletteRgb as Uint8Array
    counts = cache.counts as Uint32Array
    paletteClampedTo = cache.paletteClampedTo
    await run.tick()
    run.stage('segment')
    await run.tick()
  } else {
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
    const q = quantize(image, {
      k: settings.paletteSize,
      colorSpace: settings.colorSpace,
      quality: settings.quantizeQuality,
      seed: QUANTIZE_SEED,
      mask: opaque,
      sampleMask: clusterSample,
      autoK: settings.autoPaletteSize,
      fixedPalette: settings.palette,
    })
    paletteClampedTo =
      settings.autoPaletteSize && q.paletteHex.length < settings.paletteSize
        ? q.paletteHex.length
        : undefined
    await run.tick()

    run.stage('segment')
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
    await run.tick()

    if (canCachePal) {
      cache.palKey = palKey
      cache.labels = labels
      cache.paletteHex = paletteHex
      cache.paletteRgb = paletteRgb
      cache.counts = counts
      cache.paletteClampedTo = paletteClampedTo
    }
  }

  if (paletteClampedTo !== undefined) {
    warnings.push({
      code: 'palette-clamped',
      severity: 'info',
      message: `Palette reduced to ${paletteClampedTo} colors (near-duplicates merged).`,
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
    // Stacked: paint order by pixel count, each layer covering itself plus all
    // layers above, so lower shapes extend underneath and edges cannot crack.
    const order: number[] = []
    for (let l = 0; l < counts.length; l++) if (counts[l] > 0) order.push(l)
    order.sort((a, b) => counts[b] - counts[a])

    // Pixel indices bucketed by label (one O(n) pass) so each layer is built
    // from the previous one by removing just the label that dropped out — the
    // union masks are the same bits as a per-layer full rescan, at O(n) total
    // instead of O(k·n).
    const lab = labels.data
    const nPix = lab.length
    const offset = new Int32Array(counts.length + 1)
    for (let l = 0; l < counts.length; l++) offset[l + 1] = offset[l] + counts[l]
    const bucket = new Int32Array(offset[counts.length])
    const cursor = offset.slice(0, counts.length)
    for (let p = 0; p < nPix; p++) {
      const l = lab[p]
      if (l >= 0) bucket[cursor[l]++] = p
    }

    const layerMask: BinaryMask = {
      width: labels.width,
      height: labels.height,
      data: new Uint8Array(nPix),
    }
    const data = layerMask.data
    // Layer 0 is every labeled pixel (all layers stacked); higher layers peel off.
    for (let p = 0; p < nPix; p++) data[p] = lab[p] >= 0 ? 1 : 0

    for (let i = 0; i < order.length; i++) {
      const traced = traceMask(layerMask, {
        ...curveOpts,
        turnPolicy: settings.turnPolicy,
        minArea: traceMinArea,
      })
      const fill = paletteHex[order[i]]
      if (traced.length > 0 && !usedPalette.includes(fill)) usedPalette.push(fill)
      for (const shape of traced) {
        shapes.push({ commands: shape.commands, fill, fillRule: 'evenodd' })
      }
      // Remove this layer's own pixels so the next mask is the layers below it.
      const label = order[i]
      for (let k = offset[label]; k < offset[label + 1]; k++) data[bucket[k]] = 0
      run.progress((i + 1) / order.length)
      // Sequential on purpose: yields the worker event loop between layers so
      // cancel messages interleave with the computation.
      // oxlint-disable-next-line no-await-in-loop
      await run.tick()
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
  await run.tick()

  run.stage('segment')
  // Edge hint (if any) protects thin real features from the size-based despeckle;
  // with no hint this is byte-identical to despeckleMask.
  const protect = edgeProtectMask(edgeHint, image.width, image.height)
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
    })
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

export function createNativeEngine(): VectorizerEngine {
  return {
    id: 'native',
    label: 'Vectorizer native',
    modes: ['color', 'grayscale', 'bw', 'centerline'] satisfies VectorizeMode[],
    vectorize: (image, settings, ctx) => vectorize(image, settings, ctx),
  }
}

export { DEFAULT_SETTINGS }
