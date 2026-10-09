/**
 * Stage probes: trace ground-truth icons stage by stage and score each stage's
 * geometry against the artist's true edges (`truth.ts`), so a stage that does
 * not move the boundary closer to the drawing shows at once.
 *
 *   npx tsx scripts/eval/gt/stages.ts --inkvec <inkvec checkout> [--set screen] [--tier 128ss]
 *        [--only <family|family/stem,…>] [--workers N] [--chain classic] [--s key=value …]
 *        [--cache <dir>] [--out <rows.json>]
 *
 * Each item's raster (`corpus.ts`; an `op` tier flattened onto white) is
 * traced with the recommender's settings (as `worker.ts` traces, `--s`
 * overriding them) through a probe chain, which hands back its stages as point
 * sets in source pixels (Trazor's coordinates: pixel (i, j) covers
 * [i, i+1] × [j, j+1]). Per stage and item the probe reads each point's
 * distance to the nearest true edge and keeps `mean` (each distance capped at
 * {@link DIST_CAP} px, so one missing shape cannot swamp an icon), `p95`,
 * `max` (uncapped) and `far`, the share of points farther than
 * {@link FAR_PX} px; and, apart, `on`, the mean distance of the points within
 * {@link ON_EDGE_PX} px of an edge (how precisely a boundary the drawing has
 * is placed), and `>1px`, the share of points on no edge at all (a boundary
 * the drawing does not have: a posterized gradient's band, a sliver). The
 * distance table prints the family means of the per-item numbers and their
 * macro mean (the mean of the family means, as `gate.ts` reads a run), plus
 * `reg`: the truth box-filtered to the raster against the raster itself (mean
 * |Δ| in 8-bit units) — near 0 when the truth sits in register with what was
 * traced; the placement table prints `on` and `>1px` the same way. The rows
 * go to `--out` (default `eval-artifacts/gt-stages/<chain>-<set>-<tier>.json`);
 * the truth renders are cached under `<cache>/truth8/` (default
 * `eval-artifacts/gt-cache`), the rows are not.
 *
 * A chain is a {@link ProbeChain} registered in {@link CHAINS}: it traces the
 * image its own way and reports one {@link StageProbe} per stage, named as its
 * columns should read; {@link samplePath}, {@link paintMap} and
 * {@link topmostNear} are the pieces a chain builds its points from. `classic`
 * runs the current engine once (`vectorize` with a `StageCache`, which keeps
 * the label map, the decomposed rings and their refined polygons) and reads:
 *
 * - `lattice`: every lattice point of the decomposed rings (bw, stacked) or of
 *   the boundary chains (cutout, nested);
 * - `subpixel`: the same points after sub-pixel refinement, as the curve fit
 *   samples them (the lattice point where a ring keeps its lattice outline);
 * - `fit`: the fitted outlines, every {@link SAMPLE_STEP} px of arc length —
 *   the engine's own shapes, or for a partition each chain's fit once;
 * - `svg`: the written SVG's filled outlines (precision and primitives
 *   applied), sampled the same way.
 *
 * Only edges the final paint shows are scored. A stacked layer runs on under
 * the sheets painted above it, and that hidden run is set back beneath them on
 * purpose; a point counts only where its own layer (or, for `svg`, its own
 * element) is the topmost paint within {@link VISIBLE_RADIUS} px of it, read
 * off the shapes rendered in paint order.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'
import { Resvg } from '@resvg/resvg-js'
import { analyzeImage, recommendSettings } from '@trazor/assist'
import type { PathCommand, RasterImage, VectorizeSettings } from '@trazor/core'
import { arcToCenter, getProfile, normalizeSettings, scalePathCommands } from '@trazor/core'
import { vectorize } from '@trazor/engine'
import type { StageCache } from '@trazor/engine'
import { alphaCoverageField } from '@trazor/raster'
import { extractGeometry, fitArcs } from '@trazor/svg'
import {
  extractChains,
  fitChains,
  negatedField,
  optimalPolyline,
  pairwiseField,
  refineRingToField,
  ringPolygon,
  signedFieldOf,
} from '@trazor/trace'
import type {
  BoundaryChain,
  ChainNetwork,
  ColorField,
  CrackPath,
  RingFit,
  SignedField,
  TraceCutoutOptions,
} from '@trazor/trace'
import { flattenOverWhite, readRgba } from '../lib'
import type { GtCorpus, GtItem } from './corpus'
import { itemKey, loadCorpus, parseTier, rasterPath, truthPath } from './corpus'
import type { MetricRow } from './stats'
import { familyMeans } from './stats'
import type { Truth } from './truth'
import { EDGE_DE, loadTruth, truthCachePath } from './truth'

/** Arc-length step (source px) at which fitted outlines are sampled. */
export const SAMPLE_STEP = 0.25
/** A point farther than this (source px) from every true edge counts as `far`. */
export const FAR_PX = 0.25
/** Points farther than this (source px) from every true edge lie on none of them. */
export const ON_EDGE_PX = 1
/** Per-point cap (source px) on a distance entering the mean. */
export const DIST_CAP = 4
/** Radius (source px) within which a point's own paint must be topmost for it to count. */
export const VISIBLE_RADIUS = 1
/** Pixels per source pixel of the paint-order map the visibility test reads. */
const ID_PER_PX = 4
/** Longest straight piece (source px) a curve is flattened into before sampling. */
const FLATTEN_STEP = 0.02

/** One stage of a chain: its name (a table column) and the boundary points it produced. */
export interface StageProbe {
  readonly name: string
  /** Interleaved `x0, y0, x1, y1, …` in source px; each point is meant to lie on a visible true edge. */
  points(): Float64Array
}

/** What a chain hands back for one image. */
export interface ChainRun {
  /** Stages in pipeline order. */
  stages: StageProbe[]
  /** The route the image took through the chain (`bw`, `stacked`, `cutout`, …). */
  route: string
}

/** A geometry chain under probe: one image and its settings in, the stages' points out. */
export type ProbeChain = (image: RasterImage, settings: VectorizeSettings) => Promise<ChainRun>

/** Distance statistics of one stage on one image (source px). */
export interface StageStats {
  n: number
  mean: number
  p95: number
  max: number
  /** Share of points beyond {@link FAR_PX}. */
  far: number
  /** Share of points beyond {@link ON_EDGE_PX}: on no edge of the drawing (a spurious or misplaced boundary). */
  off: number
  /** Mean distance of the points within {@link ON_EDGE_PX}: how precisely a boundary the drawing has is placed. */
  onMean: number
}

/** One probed item. */
export interface StageRow {
  key: string
  corpus: string
  stem: string
  /** {@link ChainRun.route}. */
  route: string
  /** Wall time of the whole probe (truth, chain and scoring), ms. */
  ms: number
  /** {@link Truth.registration} against the traced raster. */
  reg: number
  /** Per stage name, in the chain's order. */
  stages: Record<string, StageStats>
  error?: string
}

/** Distance statistics of `points` against the truth. */
export function stageStats(truth: Truth, points: Float64Array): StageStats {
  const n = points.length >> 1
  const nan = Number.NaN
  if (n === 0) return { n, mean: nan, p95: nan, max: nan, far: nan, off: nan, onMean: nan }
  const d = new Float64Array(n)
  let sum = 0
  let far = 0
  let on = 0
  let onSum = 0
  for (let i = 0; i < n; i++) {
    const v = truth.trueEdgeDistance(points[i * 2], points[i * 2 + 1])
    d[i] = v
    sum += Math.min(v, DIST_CAP)
    if (v > FAR_PX) far++
    if (v <= ON_EDGE_PX) {
      on++
      onSum += v
    }
  }
  d.sort()
  const at = 0.95 * (n - 1)
  const lo = Math.floor(at)
  const p95 = lo + 1 < n ? d[lo] + (d[lo + 1] - d[lo]) * (at - lo) : d[lo]
  return {
    n,
    mean: sum / n,
    p95,
    max: d[n - 1],
    far: far / n,
    off: (n - on) / n,
    onMean: on > 0 ? onSum / on : nan,
  }
}

/**
 * Walk absolute `commands` (M/L/Q/C/A/Z, scaled by `scale` into source px) and
 * call `emit` at each subpath's start and then every `step` px of arc length.
 * Curves are flattened into pieces of at most {@link FLATTEN_STEP} px first.
 */
export function samplePath(
  commands: readonly PathCommand[],
  scale: number,
  step: number,
  emit: (x: number, y: number) => void,
): void {
  const cmds = scale === 1 ? commands : scalePathCommands(commands, scale)
  let sx = 0
  let sy = 0
  let px = 0
  let py = 0
  // Arc length walked since the last sample.
  let carry = 0
  const lineTo = (x: number, y: number): void => {
    const dx = x - px
    const dy = y - py
    const len = Math.hypot(dx, dy)
    if (len > 0) {
      let t = step - carry
      while (t <= len) {
        emit(px + (dx * t) / len, py + (dy * t) / len)
        t += step
      }
      carry = len - (t - step)
    }
    px = x
    py = y
  }
  const pieces = (length: number): number =>
    Math.min(100_000, Math.max(1, Math.ceil(length / FLATTEN_STEP)))
  for (const c of cmds) {
    switch (c.type) {
      case 'M':
        sx = px = c.x
        sy = py = c.y
        carry = 0
        emit(px, py)
        break
      case 'L':
        lineTo(c.x, c.y)
        break
      case 'Q': {
        const x0 = px
        const y0 = py
        const m = pieces(Math.hypot(c.x1 - x0, c.y1 - y0) + Math.hypot(c.x - c.x1, c.y - c.y1))
        for (let k = 1; k <= m; k++) {
          const t = k / m
          const u = 1 - t
          lineTo(
            u * u * x0 + 2 * u * t * c.x1 + t * t * c.x,
            u * u * y0 + 2 * u * t * c.y1 + t * t * c.y,
          )
        }
        break
      }
      case 'C': {
        const x0 = px
        const y0 = py
        const m = pieces(
          Math.hypot(c.x1 - x0, c.y1 - y0) +
            Math.hypot(c.x2 - c.x1, c.y2 - c.y1) +
            Math.hypot(c.x - c.x2, c.y - c.y2),
        )
        for (let k = 1; k <= m; k++) {
          const t = k / m
          const u = 1 - t
          const a = u * u * u
          const b = 3 * u * u * t
          const d = 3 * u * t * t
          const e = t * t * t
          lineTo(a * x0 + b * c.x1 + d * c.x2 + e * c.x, a * y0 + b * c.y1 + d * c.y2 + e * c.y)
        }
        break
      }
      case 'A': {
        const arc = arcToCenter(px, py, c)
        if (arc) {
          const cos = Math.cos(arc.phi)
          const sin = Math.sin(arc.phi)
          const m = pieces(Math.abs(arc.dTheta) * Math.max(arc.rx, arc.ry))
          for (let k = 1; k < m; k++) {
            const a = arc.theta1 + (arc.dTheta * k) / m
            const ex = arc.rx * Math.cos(a)
            const ey = arc.ry * Math.sin(a)
            lineTo(arc.cx + cos * ex - sin * ey, arc.cy + sin * ex + cos * ey)
          }
        }
        lineTo(c.x, c.y)
        break
      }
      case 'Z':
        lineTo(sx, sy)
        break
    }
  }
}

/**
 * Probe points, each with the paint that draws it (−1: always in view) and the
 * position its visibility is read at — the point itself, or for a refined
 * point its lattice point, so the two stages score the same boundary.
 */
class OwnedPoints {
  readonly xy: number[] = []
  readonly at: number[] = []
  readonly owner: number[] = []
  add(x: number, y: number, owner: number, ax = x, ay = y): void {
    this.xy.push(x, y)
    this.at.push(ax, ay)
    this.owner.push(owner)
  }
  /** Move every point by `d` on both axes (back from a padded working canvas). */
  shift(d: number): void {
    if (d === 0) return
    for (let i = 0; i < this.xy.length; i++) {
      this.xy[i] += d
      this.at[i] += d
    }
  }
}

/** A filled outline in paint order, tagged with its owner. */
export interface PaintedShape {
  owner: number
  commands: readonly PathCommand[]
  evenOdd: boolean
}

/** Which owner's paint is topmost at each pixel of a `perPx`-times source grid (−1: none). */
export interface PaintMap {
  width: number
  height: number
  perPx: number
  ids: Int32Array
}

/** SVG path data of absolute commands, numbers at full precision. */
function pathData(commands: readonly PathCommand[]): string {
  const out: string[] = []
  for (const c of commands) {
    switch (c.type) {
      case 'M':
      case 'L':
        out.push(`${c.type}${c.x} ${c.y}`)
        break
      case 'Q':
        out.push(`Q${c.x1} ${c.y1} ${c.x} ${c.y}`)
        break
      case 'C':
        out.push(`C${c.x1} ${c.y1} ${c.x2} ${c.y2} ${c.x} ${c.y}`)
        break
      case 'A':
        out.push(
          `A${c.rx} ${c.ry} ${c.rotation} ${c.largeArc ? 1 : 0} ${c.sweep ? 1 : 0} ${c.x} ${c.y}`,
        )
        break
      case 'Z':
        out.push('Z')
        break
    }
  }
  return out.join('')
}

/**
 * Render `shapes` in order, each in a color that encodes its owner, without
 * anti-aliasing: the topmost owner per pixel. Shapes are in `viewW × viewH`
 * units spanning a `sourceW × sourceH` source raster.
 */
export function paintMap(
  shapes: readonly PaintedShape[],
  viewW: number,
  viewH: number,
  sourceW: number,
  sourceH: number,
): PaintMap {
  const width = sourceW * ID_PER_PX
  const height = sourceH * ID_PER_PX
  const body = shapes
    .map(
      (s) =>
        `<path d="${pathData(s.commands)}" fill="#${(s.owner + 1).toString(16).padStart(6, '0')}"${s.evenOdd ? ' fill-rule="evenodd"' : ''}/>`,
    )
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewW} ${viewH}" width="${width}" height="${height}">${body}</svg>`
  const r = new Resvg(svg, {
    shapeRendering: 1,
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: false },
  }).render()
  const ids = new Int32Array(width * height).fill(-1)
  const px = r.pixels
  for (let i = 0; i < ids.length && i < r.width * r.height; i++) {
    const o = i * 4
    if (px[o + 3] === 255) ids[i] = ((px[o] << 16) | (px[o + 1] << 8) | px[o + 2]) - 1
  }
  return { width, height, perPx: ID_PER_PX, ids }
}

/** Whether `owner` is the topmost paint anywhere within {@link VISIBLE_RADIUS} px of `(x, y)`. */
export function topmostNear(map: PaintMap, x: number, y: number, owner: number): boolean {
  const r = Math.round(VISIBLE_RADIUS * map.perPx)
  const cx = Math.floor(x * map.perPx)
  const cy = Math.floor(y * map.perPx)
  for (let dy = -r; dy <= r; dy++) {
    const yy = cy + dy
    if (yy < 0 || yy >= map.height) continue
    for (let dx = -r; dx <= r; dx++) {
      const xx = cx + dx
      if (xx < 0 || xx >= map.width || dx * dx + dy * dy > r * r) continue
      if (map.ids[yy * map.width + xx] === owner) return true
    }
  }
  return false
}

/** The points of `pts` in view under `map` (all of them without a map). */
function inView(pts: OwnedPoints, map: PaintMap | undefined): Float64Array {
  if (!map) return Float64Array.from(pts.xy)
  const out: number[] = []
  for (let i = 0; i < pts.owner.length; i++) {
    const o = pts.owner[i]
    if (o < 0 || topmostNear(map, pts.at[i * 2], pts.at[i * 2 + 1], o)) {
      out.push(pts.xy[i * 2], pts.xy[i * 2 + 1])
    }
  }
  return Float64Array.from(out)
}

function probe(name: string, pts: OwnedPoints, map: PaintMap | undefined): StageProbe {
  return { name, points: () => inView(pts, map) }
}

/**
 * Closed rings' lattice points and their refined counterparts (a ring's
 * `RingFit.geom`, which repeats the first point last; the lattice ring where
 * there is no fit), in working px scaled by `scale`.
 */
function addRings(
  paths: readonly CrackPath[],
  fits: readonly (RingFit | null)[] | undefined,
  owner: number,
  scale: number,
  lattice: OwnedPoints,
  refined: OwnedPoints,
): void {
  for (let i = 0; i < paths.length; i++) {
    const ring = paths[i].points
    const geom = fits?.[i]?.geom ?? ring
    for (let k = 0; k < ring.length; k += 2) {
      const x = ring[k] * scale
      const y = ring[k + 1] * scale
      lattice.add(x, y, owner)
      refined.add(geom[k] * scale, geom[k + 1] * scale, owner, x, y)
    }
  }
}

/** A chain's sub-pixel field, as `boundary.ts` (`chainField`) builds it. */
function chainField(
  network: ChainNetwork,
  chain: BoundaryChain,
  cf: ColorField | undefined,
): SignedField | undefined {
  if (!cf) return undefined
  if (chain.left < 0 || chain.right < 0) {
    if (!cf.alpha || (chain.left < 0 && chain.right < 0)) return undefined
    return chain.right >= 0 ? signedFieldOf(cf.alpha) : negatedField(cf.alpha)
  }
  return pairwiseField(
    cf.pixels,
    cf.paletteRgb,
    network.width,
    network.height,
    chain.left,
    chain.right,
  )
}

/** A loop chain as the ring `boundary.ts` (`fitLoop`) fits: from its first turning point. */
function loopRing(points: readonly number[]): number[] {
  const ring = points.slice(0, points.length - 2)
  const n = ring.length >> 1
  let start = 0
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n
    const q = (i + 1) % n
    const cross =
      (ring[i * 2] - ring[p * 2]) * (ring[q * 2 + 1] - ring[i * 2 + 1]) -
      (ring[i * 2 + 1] - ring[p * 2 + 1]) * (ring[q * 2] - ring[i * 2])
    if (cross !== 0) {
      start = i
      break
    }
  }
  const out = new Array<number>(ring.length)
  for (let i = 0; i < n; i++) {
    const src = (start + i) % n
    out[i * 2] = ring[src * 2]
    out[i * 2 + 1] = ring[src * 2 + 1]
  }
  return out
}

/** A palette entry of the engine's stage cache: the label map and what was traced from it. */
type PaletteEntry = NonNullable<StageCache['palette']> extends Map<string, infer E> ? E : never

/**
 * A partition's (cutout, nested) points: every boundary chain once, refined and
 * fitted with the options the engine's color pipeline passes (`colorPipeline`,
 * the partition branch), in working px scaled by `toSource`.
 */
function addChains(
  entry: PaletteEntry,
  work: RasterImage,
  alpha: Uint8Array | null,
  s: VectorizeSettings,
  factor: number,
  toSource: number,
  lattice: OwnedPoints,
  refined: OwnedPoints,
  fitted: OwnedPoints,
): void {
  const refines = s.curveMode !== 'pixel'
  const alphaField =
    refines && alpha !== null && s.alphaThreshold > 0
      ? alphaCoverageField(alpha, work.width, work.height, s.alphaThreshold)
      : undefined
  const colorField =
    refines && (entry.paletteHex.length > 1 || alphaField !== undefined)
      ? { pixels: work.data, paletteRgb: entry.paletteRgb, alpha: alphaField }
      : undefined
  const opts: TraceCutoutOptions = {
    curveMode: s.curveMode,
    smoothing: s.smoothing,
    curveOptimize: s.curveOptimize,
    optTolerance: s.optTolerance,
    cornerThreshold: s.cornerThreshold,
    scale: factor,
    colorField,
    refineChain: s.optimizeSvg ? (cmds) => fitArcs(cmds, s.precision) : undefined,
  }
  const network = extractChains(entry.labels)
  const fits = fitChains(network, opts)
  for (let c = 0; c < network.chains.length; c++) {
    const chain = network.chains[c]
    const field = refines ? chainField(network, chain, colorField) : undefined
    let ring: number[]
    let geom: readonly number[]
    let fit: readonly PathCommand[]
    if (chain.loop) {
      ring = loopRing(chain.points)
      geom = (field ? ringPolygon(ring, field)?.geom : undefined) ?? ring
      fit = fits[c].closed ?? []
    } else {
      // An open chain is refined between its pinned junction corners (`fitOpenChain`).
      ring = chain.points
      geom = ring
      if (field) {
        const g = refineRingToField(ring, field, optimalPolyline(ring))
        g[0] = ring[0]
        g[1] = ring[1]
        g[g.length - 2] = ring[ring.length - 2]
        g[g.length - 1] = ring[ring.length - 1]
        geom = g
      }
      fit = [{ type: 'M', x: ring[0], y: ring[1] }, ...fits[c].open]
    }
    for (let k = 0; k < ring.length; k += 2) {
      lattice.add(ring[k] * toSource, ring[k + 1] * toSource, -1)
      refined.add(geom[k] * toSource, geom[k + 1] * toSource, -1)
    }
    samplePath(fit, toSource, SAMPLE_STEP, (x, y) => fitted.add(x, y, -1))
  }
}

/** The current engine (`packages/engine/src/native.ts`), read through its stage cache. */
const classic: ProbeChain = async (image, settings) => {
  const s = normalizeSettings(settings)
  if (s.mode === 'centerline') throw new Error('centerline strokes have no outline to probe')
  const cache: StageCache = {}
  const res = await vectorize(image, s, undefined, { cache, imageId: 1, withDocument: true })
  const work = cache.workImage
  const doc = res.document
  if (!work || !doc) throw new Error('the engine kept no working image or document')
  // Working px (rings, chains) and SVG units (shapes) to source px.
  // A transparent image touching its border is traced with a margin on every
  // side (working px = source px · supersample, plus the margin).
  const pad = (work.width / s.supersample - image.width) / 2
  const workToSource = 1 / s.supersample
  const svgToSource = image.width / res.width
  const lattice = new OwnedPoints()
  const refined = new OwnedPoints()
  const fitted = new OwnedPoints()
  let route: string = s.mode
  // The final paint, where shapes overlap (stacked layers).
  let paint: PaintMap | undefined

  if (s.mode === 'bw') {
    addRings(cache.ink?.rings ?? [], cache.ink?.polygons, -1, workToSource, lattice, refined)
    for (const shape of doc.shapes) {
      samplePath(shape.commands, svgToSource, SAMPLE_STEP, (x, y) => fitted.add(x, y, -1))
    }
  } else {
    const entry = [...(cache.palette?.values() ?? [])].at(-1)
    if (!entry) throw new Error('the engine kept no label map')
    route = s.layering
    if (s.layering === 'stacked') {
      // Each layer's rings, owned by the layer (`VectorShape.layerId`).
      const layers = entry.rings?.layers ?? []
      for (let i = 0; i < layers.length; i++) {
        addRings(layers[i].paths, entry.rings?.polygons?.[i], i, workToSource, lattice, refined)
      }
      // An overlay's base repeats its geometry under the same layer: sample it once.
      const seen = new Set<string>()
      const painted: PaintedShape[] = []
      for (const shape of doc.shapes) {
        const owner = shape.layerId ?? -1
        painted.push({ owner, commands: shape.commands, evenOdd: shape.fillRule === 'evenodd' })
        const key = `${owner}|${JSON.stringify(shape.commands)}`
        if (seen.has(key)) continue
        seen.add(key)
        samplePath(shape.commands, svgToSource, SAMPLE_STEP, (x, y) => fitted.add(x, y, owner))
      }
      paint = paintMap(painted, res.width, res.height, image.width, image.height)
    } else {
      const factor = s.supersample
      const alpha = cache.alpha ?? null
      addChains(entry, work, alpha, s, factor, workToSource, lattice, refined, fitted)
    }
  }

  lattice.shift(-pad)
  refined.shift(-pad)
  if (s.mode !== 'bw' && s.layering !== 'stacked') fitted.shift(-pad)

  // The written file: each filled element in document (paint) order.
  const geometry = extractGeometry(res.svg)
  const elements: PaintedShape[] = geometry.shapes
    .filter((e) => e.fill !== 'none')
    .map((e, i) => ({ owner: i, commands: e.commands, evenOdd: e.kind === 'path' }))
  const written = new OwnedPoints()
  for (const e of elements) {
    samplePath(e.commands, svgToSource, SAMPLE_STEP, (x, y) => written.add(x, y, e.owner))
  }
  const writtenPaint = paintMap(elements, res.width, res.height, image.width, image.height)

  return {
    route,
    stages: [
      probe('lattice', lattice, paint),
      probe('subpixel', refined, paint),
      probe('fit', fitted, paint),
      probe('svg', written, writtenPaint),
    ],
  }
}

/**
 * The planar-map chain (`vectorize(…, { geometry: 'planar' })`), read through
 * its stage hook: every edge's points after each stage that moves them, and the
 * fitted edges sampled every {@link SAMPLE_STEP}. Every planar edge separates
 * two faces, so every point is meant to lie on a true edge, painted or not. A
 * centerline image takes the classic chain.
 */
const planar: ProbeChain = async (image, settings) => {
  const s = normalizeSettings(settings)
  if (s.mode === 'centerline') {
    const run = await classic(image, settings)
    return { ...run, route: `${run.route} (classic)` }
  }
  const snaps: { name: string; pts: OwnedPoints }[] = []
  const res = await vectorize(image, s, undefined, {
    withDocument: true,
    geometry: 'planar',
    onPlanarStage: (stage, map, fits) => {
      const toSource = 1 / s.supersample
      const pad = (map.width * toSource - image.width) / 2
      const pts = new OwnedPoints()
      if (fits) {
        for (const f of fits) {
          const cmds: PathCommand[] = [{ type: 'M', x: f.x0, y: f.y0 }, ...f.segments]
          samplePath(cmds, toSource, SAMPLE_STEP, (x, y) => pts.add(x, y, -1))
        }
      } else {
        for (const e of map.edges) {
          for (let i = 0; i < e.points.length; i += 2)
            pts.add(e.points[i] * toSource, e.points[i + 1] * toSource, -1)
        }
      }
      pts.shift(-pad)
      snaps.push({ name: stage, pts })
    },
  })
  const svgToSource = image.width / res.width
  const geometry = extractGeometry(res.svg)
  const elements: PaintedShape[] = geometry.shapes
    .filter((e) => e.fill !== 'none')
    .map((e, i) => ({ owner: i, commands: e.commands, evenOdd: e.kind === 'path' }))
  const written = new OwnedPoints()
  for (const e of elements) {
    samplePath(e.commands, svgToSource, SAMPLE_STEP, (x, y) => written.add(x, y, e.owner))
  }
  const writtenPaint = paintMap(elements, res.width, res.height, image.width, image.height)
  return {
    route: s.mode === 'bw' ? 'planar bw' : `planar ${s.layering}`,
    stages: [
      ...snaps.map((snap) => probe(snap.name, snap.pts, undefined)),
      probe('svg', written, writtenPaint),
    ],
  }
}

/** The chains a run can probe, by `--chain` name. */
export const CHAINS: Record<string, ProbeChain> = { classic, planar }

/** The recommender's settings for an image, `overrides` on top (as `worker.ts` traces). */
export function recommendedSettings(
  image: RasterImage,
  overrides: Partial<VectorizeSettings>,
): VectorizeSettings {
  const rec = recommendSettings(analyzeImage(image))
  const base = normalizeSettings({ ...getProfile(rec.profileId).patch, ...rec.patch })
  return normalizeSettings(overrides, base)
}

/** One probe run's job, shared by every worker. */
export interface StageJob {
  corpus: GtCorpus
  tier: string
  chain: string
  overrides: Partial<VectorizeSettings>
  cacheDir: string
}

/** Probe one item: trace it through the job's chain and score every stage against its truth. */
export async function probeItem(job: StageJob, it: GtItem): Promise<StageRow> {
  const key = itemKey(it)
  const t0 = performance.now()
  try {
    const chain = CHAINS[job.chain]
    if (!chain) throw new Error(`unknown chain ${job.chain}: ${Object.keys(CHAINS).join(', ')}`)
    const { opaque } = parseTier(job.tier)
    const raw = readRgba(rasterPath(job.corpus, it, job.tier))
    const image = opaque ? flattenOverWhite(raw) : raw
    const truth = loadTruth({
      svgPath: truthPath(job.corpus, it),
      width: image.width,
      height: image.height,
      opaque,
      cachePath: truthCachePath(
        job.cacheDir,
        it.corpus,
        it.stem,
        image.width,
        image.height,
        opaque,
      ),
    })
    const run = await chain(image, recommendedSettings(image, job.overrides))
    const stages: Record<string, StageStats> = {}
    for (const st of run.stages) stages[st.name] = stageStats(truth, st.points())
    return {
      key,
      corpus: it.corpus,
      stem: it.stem,
      route: run.route,
      ms: performance.now() - t0,
      reg: truth.registration(image),
      stages,
    }
  } catch (e) {
    return {
      key,
      corpus: it.corpus,
      stem: it.stem,
      route: '—',
      ms: performance.now() - t0,
      reg: Number.NaN,
      stages: {},
      error: String((e as Error)?.message ?? e).slice(0, 300),
    }
  }
}

type Column = [keyof StageStats, string, (v: number) => string]
const pct = (v: number): string => `${(v * 100).toFixed(1)}%`
/** The distance table: what the stages' points measure as a whole. */
const DISTANCE_COLS: Column[] = [
  ['mean', 'mean', (v) => v.toFixed(3)],
  ['p95', 'p95', (v) => v.toFixed(3)],
  ['max', 'max', (v) => v.toFixed(2)],
  ['far', '>.25', pct],
]
/** The placement table: points on an edge of the drawing apart from those on none. */
const PLACEMENT_COLS: Column[] = [
  ['onMean', 'on', (v) => v.toFixed(3)],
  ['off', '>1px', pct],
]
const COL = 7

/** One table of family means of per-item stage statistics, then their macro mean. */
function table(
  flat: readonly MetricRow[],
  names: readonly string[],
  cols: readonly Column[],
  extra: boolean,
): string[] {
  const show = (v: number, f: (v: number) => string): string =>
    (Number.isFinite(v) ? f(v) : '—').padStart(COL)
  const group = cols.length * COL + 2
  const tail = extra ? 'reg'.padStart(COL) + 'n'.padStart(5) : ''
  const lines = [
    ''.padEnd(16) + names.map((n) => `  ${n}`.padEnd(group)).join('') + tail,
    'family'.padEnd(16) +
      names.map(() => `  ${cols.map((c) => c[1].padStart(COL)).join('')}`).join(''),
  ]
  type Means = { fam: Map<string, number>; macro: number }
  const per = names.map((n) => cols.map(([c]) => familyMeans([...flat], `${n}.${c}`)))
  const reg = familyMeans([...flat], 'reg')
  const counts = new Map<string, number>()
  for (const r of flat) counts.set(r.corpus, (counts.get(r.corpus) ?? 0) + 1)
  const line = (label: string, pick: (m: Means) => number, n: number): string =>
    label.padEnd(16) +
    per.map((ms) => `  ${ms.map((m, i) => show(pick(m), cols[i][2])).join('')}`).join('') +
    (extra ? show(pick(reg), (v) => v.toFixed(2)) + String(n).padStart(5) : '')
  for (const f of reg.fam.keys()) {
    lines.push(line(f, (m) => m.fam.get(f) ?? Number.NaN, counts.get(f) ?? 0))
  }
  lines.push(line('MACRO', (m) => m.macro, flat.length))
  return lines
}

/**
 * A run's report: the distance table (family means of the per-item stage
 * statistics and their macro mean, `reg` and the item count beside), the
 * placement table, the routes taken and the first errors.
 */
export function summarize(
  meta: { chain: string; tier: string; set: string },
  rows: readonly StageRow[],
): string {
  const names: string[] = []
  for (const r of rows) for (const n of Object.keys(r.stages)) if (!names.includes(n)) names.push(n)
  const flat: MetricRow[] = rows
    .filter((r) => !r.error)
    .map((r) => {
      const m: MetricRow = { key: r.key, corpus: r.corpus, reg: r.reg }
      for (const n of names) {
        for (const c of [...DISTANCE_COLS, ...PLACEMENT_COLS]) {
          m[`${n}.${c[0]}`] = r.stages[n]?.[c[0]] ?? Number.NaN
        }
      }
      return m
    })
  const lines = [
    `${meta.chain}  tier ${meta.tier}  set ${meta.set}  n=${rows.length}`,
    `distance (source px) from each stage's points to the artist's edges; >.25 = share beyond ${FAR_PX} px; reg = truth vs raster (8-bit)`,
    ...table(flat, names, DISTANCE_COLS, true),
    '',
    `placement: on = mean distance of the points within ${ON_EDGE_PX} px of an edge; >1px = share on no edge of the drawing`,
    ...table(flat, names, PLACEMENT_COLS, false),
  ]
  const routes = new Map<string, number>()
  for (const r of rows) if (!r.error) routes.set(r.route, (routes.get(r.route) ?? 0) + 1)
  lines.push(
    `routes: ${[...routes]
      .toSorted()
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}`,
  )
  const errs = rows.filter((r) => r.error)
  if (errs.length > 0) {
    lines.push(
      `${errs.length} errors: ${errs
        .slice(0, 3)
        .map((e) => `${e.key}: ${e.error}`)
        .join('; ')}`,
    )
  }
  return lines.join('\n')
}

const SELF = fileURLToPath(import.meta.url)
const ROOT = resolve(dirname(SELF), '..', '..', '..')

function arg(argv: string[], name: string, dflt?: string): string | undefined {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : dflt
}

function parseValue(v: string): unknown {
  if (v === 'true') return true
  if (v === 'false') return false
  if (v === 'null') return null
  const n = Number(v)
  return Number.isNaN(n) ? v : n
}

async function main(argv: string[]): Promise<void> {
  const inkvecDir = arg(argv, '--inkvec') ?? process.env.INKVEC_DIR ?? ''
  if (!inkvecDir) throw new Error('--inkvec <inkvec checkout> is required')
  const corpus = loadCorpus(inkvecDir)
  const setName = arg(argv, '--set', 'screen') as string
  const tier = arg(argv, '--tier', '128ss') as string
  const chain = arg(argv, '--chain', 'classic') as string
  if (!CHAINS[chain]) throw new Error(`unknown chain ${chain}: ${Object.keys(CHAINS).join(', ')}`)
  let items: GtItem[] = corpus.sets[setName]
  if (!items) throw new Error(`unknown set ${setName}: ${Object.keys(corpus.sets).join(', ')}`)
  const only = arg(argv, '--only')
  if (only) {
    const picks = only.split(',')
    items = items.filter((it) => picks.includes(it.corpus) || picks.includes(itemKey(it)))
  }
  const overrides: Record<string, unknown> = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--s') {
      const [k, ...v] = argv[i + 1].split('=')
      overrides[k] = parseValue(v.join('='))
    }
  }
  const cacheDir = resolve(arg(argv, '--cache', join(ROOT, 'eval-artifacts', 'gt-cache')) as string)
  const nWorkers = Math.max(1, Math.min(items.length, Number(arg(argv, '--workers', '2'))))
  const job: StageJob = { corpus, tier, chain, overrides, cacheDir }
  process.stderr.write(
    `${chain} ${tier} ${setName}: ${items.length} items on ${nWorkers} workers\n`,
  )

  const rows = new Map<string, StageRow>()
  let next = 0
  let done = 0
  const t0 = performance.now()
  await Promise.all(
    Array.from(
      { length: items.length > 0 ? nWorkers : 0 },
      () =>
        new Promise<void>((res, rej) => {
          // tsx's resolver is registered inside the thread before this module loads there.
          const boot = `import('tsx/esm/api').then((m) => { m.register(); return import(${JSON.stringify(pathToFileURL(SELF).href)}) })`
          const w = new Worker(boot, { eval: true, workerData: { stageProbe: job } })
          const feed = (): void => {
            // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker_threads port, not a window
            if (next >= items.length) w.postMessage({ done: true })
            // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker_threads port, not a window
            else w.postMessage({ item: items[next++] })
          }
          w.on('message', (m: StageRow | { ready: true }) => {
            if ('ready' in m) return feed()
            rows.set(m.key, m)
            done++
            if (done % 20 === 0 || done === items.length) {
              process.stderr.write(
                `  ${done}/${items.length} (${((performance.now() - t0) / 1000).toFixed(0)} s)\n`,
              )
            }
            feed()
          })
          w.on('error', rej)
          w.on('exit', () => res())
        }),
    ),
  )
  const ordered = items.map((it) => rows.get(itemKey(it))).filter((r): r is StageRow => Boolean(r))
  const meta = { chain, tier, set: setName, overrides, edgeDe: EDGE_DE, step: SAMPLE_STEP }
  const out = resolve(
    arg(
      argv,
      '--out',
      join(ROOT, 'eval-artifacts', 'gt-stages', `${chain}-${setName}-${tier}.json`),
    ) as string,
  )
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify({ meta, rows: ordered }, null, 1))
  process.stdout.write(`${summarize(meta, ordered)}\nrows: ${out}\n`)
}

const worker = (workerData as { stageProbe?: StageJob } | null)?.stageProbe
if (!isMainThread && worker && parentPort) {
  const port = parentPort
  port.on('message', async (msg: { item: GtItem } | { done: true }) => {
    if ('done' in msg) process.exit(0)
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker_threads port, not a window
    port.postMessage(await probeItem(worker, msg.item))
  })
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker_threads port, not a window
  port.postMessage({ ready: true })
} else if (isMainThread && process.argv[1] && resolve(process.argv[1]) === SELF) {
  await main(process.argv.slice(2))
}
