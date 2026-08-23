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
  signedThresholdField,
  toGrayscale,
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

/** Cumulative progress budget per stage (sums to 1). */
const STAGE_BUDGET: Record<StageId, number> = {
  preprocess: 0.12,
  palette: 0.2,
  segment: 0.08,
  trace: 0.42,
  fit: 0.06,
  svg: 0.12,
}
const STAGE_ORDER: StageId[] = ['preprocess', 'palette', 'segment', 'trace', 'fit', 'svg']

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
 * The native vectorization pipeline:
 * preprocess → (palette | binarize) → segment cleanup → trace/fit → SVG.
 */
export async function vectorize(
  source: RasterImage,
  settingsIn: VectorizeSettings,
  ctx?: EngineContext,
): Promise<VectorizeResult> {
  const settings = normalizeSettings(settingsIn)
  const started = nowMs()
  const run = new Run(ctx)
  const warnings: VectorizeWarning[] = []

  // ---- preprocess ----
  run.stage('preprocess')
  let image = resizeToFit(source, settings.maxDimension)
  run.progress(0.3)
  if (settings.denoise === 'median') image = medianFilter(image, 1)
  else if (settings.denoise === 'bilateral') image = bilateralFilter(image, 2, 2, 35)
  if (settings.blurRadius > 0) image = gaussianBlur(image, settings.blurRadius)
  run.progress(0.7)
  const { image: flatImage, opaque } = flattenImage(image, settings)
  image = flatImage
  if (settings.mode === 'grayscale') desaturateInPlace(image)
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
): Promise<void> {
  run.stage('palette')
  const q = quantize(image, {
    k: settings.paletteSize,
    colorSpace: settings.colorSpace,
    quality: settings.quantizeQuality,
    seed: QUANTIZE_SEED,
    mask: opaque,
    autoK: settings.autoPaletteSize,
    fixedPalette: settings.palette,
  })
  if (settings.autoPaletteSize && q.paletteHex.length < settings.paletteSize) {
    warnings.push({
      code: 'palette-clamped',
      severity: 'info',
      message: `Palette reduced to ${q.paletteHex.length} colors (near-duplicates merged).`,
    })
  }
  await run.tick()

  run.stage('segment')
  // Edge hint (if any) protects small regions on a predicted boundary from the
  // size-based merge; with no hint this is byte-identical to the plain merge.
  const protect = edgeProtectMask(edgeHint, image.width, image.height)
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
  const labels = q.labels
  const counts = new Uint32Array(labels.count)
  for (let i = 0; i < labels.data.length; i++) {
    const l = labels.data[i]
    if (l >= 0) counts[l]++
  }
  const backgroundLabel = settings.omitBackground ? nearestPaletteLabel(image, q.paletteHex) : -1
  if (backgroundLabel >= 0) {
    // Excluded everywhere: background pixels behave like transparency.
    for (let i = 0; i < labels.data.length; i++) {
      if (labels.data[i] === backgroundLabel) labels.data[i] = -1
    }
    counts[backgroundLabel] = 0
  }
  await run.tick()

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
    const regions = traceLabelMap(labels, {
      ...curveOpts,
      minArea: traceMinArea,
    })
    regions.sort((a, b) => b.area - a.area)
    for (const region of regions) {
      const fill = q.paletteHex[region.label]
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
    const position = new Int32Array(counts.length).fill(-1)
    order.forEach((label, i) => {
      position[label] = i
    })

    const layerMask: BinaryMask = {
      width: labels.width,
      height: labels.height,
      data: new Uint8Array(labels.width * labels.height),
    }
    for (let i = 0; i < order.length; i++) {
      const data = layerMask.data
      const lab = labels.data
      for (let p = 0; p < lab.length; p++) {
        const l = lab[p]
        data[p] = l >= 0 && position[l] >= i ? 1 : 0
      }
      const traced = traceMask(layerMask, {
        ...curveOpts,
        turnPolicy: settings.turnPolicy,
        minArea: traceMinArea,
      })
      const fill = q.paletteHex[order[i]]
      if (traced.length > 0 && !usedPalette.includes(fill)) usedPalette.push(fill)
      for (const shape of traced) {
        shapes.push({ commands: shape.commands, fill, fillRule: 'evenodd' })
      }
      run.progress((i + 1) / order.length)
      // Sequential on purpose: yields the worker event loop between layers so
      // cancel messages interleave with the computation.
      // oxlint-disable-next-line no-await-in-loop
      await run.tick()
    }
  }
  setPalette(usedPalette)
  run.stage('fit')
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
    const strokeWidth =
      settings.strokeWidth > 0 ? settings.strokeWidth : estimateStrokeWidth(mask, skeleton)
    const strokes = traceCenterline(skeleton, {
      pruneLength: settings.pruneLength,
      cornerThreshold: settings.cornerThreshold,
      fitTolerance: settings.fitTolerance,
      simplifyTolerance: settings.simplifyTolerance,
      smoothing: settings.smoothing,
    })
    for (const stroke of strokes) {
      shapes.push({
        commands: stroke.commands,
        stroke: settings.fillColor,
        strokeWidth: round2(strokeWidth),
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      })
    }
    run.progress(1)
  }
  run.stage('fit')
  run.progress(1)
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
