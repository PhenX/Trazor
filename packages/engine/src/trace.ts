import type { BinaryMask, LabelMap, RasterImage, TraceChart, TraceRaster } from '@trazor/core'
import { resizeToFit } from '@trazor/raster'
import type { SvgShape } from '@trazor/svg'

/**
 * Builders for the opt-in step tracer: downscaled image snapshots and small
 * distributions captured at each pipeline stage. Every function reads its inputs
 * and returns freshly allocated plain data — it never mutates pipeline state, so
 * recording cannot perturb the traced run's output. Kept out of the hot path:
 * callers guard each call behind `run.tracing`.
 */

/**
 * Longest side a snapshot is downscaled to before crossing the worker boundary.
 * The studio's timeline inspector paints these snapshots into the full preview
 * (zoomed, over the checker), so they are kept large enough to stay sharp there;
 * each is freshly allocated and transferred (zero-copy), and recording is opt-in.
 */
export const TRACE_RASTER_MAX = 1024

/** Downscaled output dimensions preserving aspect, capped at `max` on the long side. */
function fitDims(width: number, height: number, max: number): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) }
}

/** Nearest-neighbor index into a source row/col for output position `o` of `n`←`src`. */
function srcIndex(o: number, out: number, src: number): number {
  return Math.min(src - 1, Math.floor((o * src) / out))
}

/** RGBA working image → a fresh, downscaled RGBA snapshot (area-average resize). */
export function rasterFromImage(image: RasterImage, caption?: string): TraceRaster {
  const small = resizeToFit(image, TRACE_RASTER_MAX)
  // resizeToFit may return the input unchanged when already small; always copy so
  // the snapshot owns its buffer (safe to transfer, immune to later mutation).
  return {
    kind: 'rgba',
    width: small.width,
    height: small.height,
    data: new Uint8ClampedArray(small.data),
    caption,
  }
}

/** Label map → a fresh, downscaled `labels` snapshot (nearest, keeps hard edges). */
export function rasterFromLabels(
  labels: LabelMap,
  palette: string[],
  caption?: string,
): TraceRaster {
  const { w, h } = fitDims(labels.width, labels.height, TRACE_RASTER_MAX)
  const out = new Uint16Array(w * h)
  const { data, width, height } = labels
  for (let y = 0; y < h; y++) {
    const sy = srcIndex(y, h, height)
    for (let x = 0; x < w; x++) {
      const l = data[sy * width + srcIndex(x, w, width)]
      out[y * w + x] = l < 0 ? 65535 : l
    }
  }
  return { kind: 'labels', width: w, height: h, data: out, palette: palette.slice(), caption }
}

/** Binary mask → a fresh, downscaled 0/1 snapshot (nearest). */
export function rasterFromMask(mask: BinaryMask, caption?: string): TraceRaster {
  const { w, h } = fitDims(mask.width, mask.height, TRACE_RASTER_MAX)
  const out = new Uint8Array(w * h)
  const { data, width, height } = mask
  for (let y = 0; y < h; y++) {
    const sy = srcIndex(y, h, height)
    for (let x = 0; x < w; x++) out[y * w + x] = data[sy * width + srcIndex(x, w, width)] ? 1 : 0
  }
  return { kind: 'mask', width: w, height: h, data: out, caption }
}

/** Luminance histogram (Rec. 709) of the opaque pixels, `bins` buckets over 0–255. */
export function luminanceHistogram(image: RasterImage, bins = 48): TraceChart {
  const values = new Array<number>(bins).fill(0)
  const { data } = image
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue
    const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    const b = Math.min(bins - 1, Math.floor((luma / 256) * bins))
    values[b]++
  }
  return { kind: 'histogram', label: 'Luminance', values, min: 0, max: 255, xLabel: '0–255' }
}

/** One bar per palette color, height = pixel population, tinted with the color. */
export function palettePopulationBars(palette: string[], counts: Uint32Array): TraceChart {
  const values: number[] = []
  const colors: string[] = []
  const barLabels: string[] = []
  for (let i = 0; i < palette.length; i++) {
    values.push(counts[i] ?? 0)
    colors.push(palette[i])
    barLabels.push(palette[i])
  }
  return { kind: 'bars', label: 'Palette population', values, colors, barLabels, yLabel: 'pixels' }
}

/** Log-scaled histogram of per-label region areas — shows the many-small/few-large tail. */
export function regionAreaHistogram(counts: Uint32Array, bins = 24): TraceChart | null {
  const logs: number[] = []
  for (const c of counts) if (c > 0) logs.push(Math.log10(c))
  if (logs.length === 0) return null
  let min = logs[0]
  let max = logs[0]
  for (const v of logs) {
    if (v < min) min = v
    if (v > max) max = v
  }
  min = Math.floor(min)
  max = Math.max(min + 1, Math.ceil(max))
  const values = new Array<number>(bins).fill(0)
  const span = max - min
  for (const v of logs) values[Math.min(bins - 1, Math.floor(((v - min) / span) * bins))]++
  return {
    kind: 'histogram',
    label: 'Region sizes',
    values,
    min,
    max,
    xLabel: 'log₁₀ pixels',
    log: true,
  }
}

/** A shape's paint color for grouping (fill, else stroke, else a neutral). */
function shapeColor(shape: SvgShape): string {
  const paint = shape.fill && shape.fill !== 'none' ? shape.fill : shape.stroke
  return paint && paint !== 'none' ? paint : '#888888'
}

/** Total path nodes grouped by paint color, tallest first (capped), tinted. */
export function nodesPerColorBars(shapes: SvgShape[], cap = 24): TraceChart {
  const byColor = new Map<string, number>()
  for (const s of shapes)
    byColor.set(shapeColor(s), (byColor.get(shapeColor(s)) ?? 0) + s.commands.length)
  const entries = [...byColor.entries()].toSorted((a, b) => b[1] - a[1]).slice(0, cap)
  return {
    kind: 'bars',
    label: 'Nodes per color',
    values: entries.map((e) => e[1]),
    colors: entries.map((e) => e[0]),
    barLabels: entries.map((e) => e[0]),
    yLabel: 'nodes',
  }
}

/** Histogram of per-shape node counts — how complex the individual paths are. */
export function nodesPerShapeHistogram(shapes: SvgShape[], bins = 24): TraceChart {
  const sizes = shapes.map((s) => s.commands.length)
  let max = 0
  for (const n of sizes) if (n > max) max = n
  max = Math.max(1, max)
  const values = new Array<number>(bins).fill(0)
  for (const n of sizes) values[Math.min(bins - 1, Math.floor((n / (max + 1)) * bins))]++
  return { kind: 'histogram', label: 'Nodes per shape', values, min: 0, max, xLabel: 'nodes' }
}

/** Sum of path nodes across shapes (a metric, not a chart). */
export function totalNodes(shapes: SvgShape[]): number {
  let n = 0
  for (const s of shapes) n += s.commands.length
  return n
}

/** Fraction of a mask that is foreground (1), 0–1. */
export function maskFraction(mask: BinaryMask): number {
  let on = 0
  for (const v of mask.data) if (v) on++
  return mask.data.length > 0 ? on / mask.data.length : 0
}

/** How many palette labels actually have pixels. */
export function nonEmptyLabelCount(counts: Uint32Array): number {
  let n = 0
  for (const c of counts) if (c > 0) n++
  return n
}

/** Transferable buffers behind a step's raster snapshots, for a zero-copy postMessage. */
export function traceTransferables(rasters: TraceRaster[] | undefined): Transferable[] {
  if (!rasters) return []
  return rasters.map((r) => r.data.buffer)
}
