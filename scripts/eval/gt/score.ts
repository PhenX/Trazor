/**
 * Scoring one trace against the artist's file — the same axes inkvec's gate
 * reads, plus GMSD:
 *
 * - `de00`: mean CIEDE2000 between the trace and the artist's SVG, both
 *   rendered at `JUDGE` px over white (inkvec: `svgeval.score_one`, 1024 px;
 *   a deterministic quarter of the pixels, where inkvec draws 250k at random);
 * - `gmsd`: gradient-magnitude similarity deviation between the same renders
 *   (Xue et al. 2014), the structural axis the human judgments followed best;
 * - `ratio`: the trace's parameters over the artist's (`svgmodel`);
 * - `turning`: the control polygons' turning per unit length (`svgmodel`);
 * - `selfRes`: the trace rendered at the input's own size against the input
 *   over white, mean absolute difference — needs no ground truth, so it also
 *   reads the user's own images;
 * - `edgeMiss` / `edgeExtra`: the boundary geometry alone, colour aside — the
 *   mean distance (source pixels, capped at `EDGE_CAP`) from each edge pixel of
 *   the artist's render to the nearest edge of the trace's render (an outline
 *   misplaced or missing), and from the trace's edges to the artist's (an edge
 *   the drawing does not have: a sliver, a wobble, a spurious band). Edges are
 *   pixels whose colour steps from a neighbour by more than `EDGE_STEP`;
 *   distances by a 3-4 chamfer transform (Borgefors 1986);
 * - `fillDe00` / `bandDe00`: the colour error split by where it falls — on the
 *   artist's flat interiors (more than a source pixel from any of its edges: a
 *   wrong or missing fill, a region given the wrong ink) and in the band within
 *   a source pixel of its edges (where the outline's placement shows);
 * - `inkMiss` / `inkExtra`: the palette alone — the area-weighted mean
 *   CIEDE2000 from each of the artist's inks (the colours of its flat interiors,
 *   area-weighted) to the nearest colour the trace paints with, and from each
 *   colour the trace paints with to the nearest artist ink; `inksMissed` counts
 *   artist inks covering at least `INK_MIN_AREA` source px² with no paint colour
 *   within `INK_JND`.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { RasterImage } from '@trazor/core'
import { ciede2000, rgbToLab } from '@trazor/core'
import { Resvg } from '@resvg/resvg-js'
import { gmsd } from '../gmsd'
import { flattenOverWhite, readRgba, writePng } from '../lib'
import { readSvg } from './svgmodel'

export const JUDGE = 1024

/** Render an SVG to `size`×`size`-fitting width over white. */
export function render(svg: string, width: number): RasterImage {
  const r = new Resvg(svg, {
    background: 'rgba(255,255,255,1)',
    fitTo: { mode: 'width', value: width },
  }).render()
  return { width: r.width, height: r.height, data: new Uint8ClampedArray(r.pixels) }
}

/** The artist's render at JUDGE px, cached as PNG (a pure function of the SVG). */
export function truthRender(svgPath: string, cachePath: string): RasterImage {
  if (existsSync(cachePath)) return readRgba(cachePath)
  const img = render(readFileSync(svgPath, 'utf8'), JUDGE)
  mkdirSync(dirname(cachePath), { recursive: true })
  writePng(cachePath, img)
  return img
}

/** Lab of an 8-bit sRGB triple, memoized by packed value. */
const labCache = new Map<number, [number, number, number]>()
function lab8(r: number, g: number, b: number): [number, number, number] {
  const k = (r << 16) | (g << 8) | b
  let v = labCache.get(k)
  if (!v) {
    v = rgbToLab(r / 255, g / 255, b / 255)
    if (labCache.size > 2_000_000) labCache.clear()
    labCache.set(k, v)
  }
  return v
}

/** Mean CIEDE2000 over every other pixel of every other row (same-sized opaque renders). */
export function meanDe00(a: RasterImage, b: RasterImage): number {
  const w = Math.min(a.width, b.width)
  const h = Math.min(a.height, b.height)
  let sum = 0
  let n = 0
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * a.width + x) * 4
      const j = (y * b.width + x) * 4
      const ar = a.data[i]
      const ag = a.data[i + 1]
      const ab = a.data[i + 2]
      const br = b.data[j]
      const bg = b.data[j + 1]
      const bb = b.data[j + 2]
      n++
      if (ar === br && ag === bg && ab === bb) continue
      const p = lab8(ar, ag, ab)
      const q = lab8(br, bg, bb)
      sum += ciede2000(p[0], p[1], p[2], q[0], q[1], q[2])
    }
  }
  return n > 0 ? sum / n : 0
}

/** Mean absolute RGB difference in [0, 1] between same-sized opaque images. */
export function meanAbs(a: RasterImage, b: RasterImage): number {
  const w = Math.min(a.width, b.width)
  const h = Math.min(a.height, b.height)
  let s = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * a.width + x) * 4
      const j = (y * b.width + x) * 4
      s +=
        Math.abs(a.data[i] - b.data[j]) +
        Math.abs(a.data[i + 1] - b.data[j + 1]) +
        Math.abs(a.data[i + 2] - b.data[j + 2])
    }
  }
  return s / (w * h * 3 * 255)
}

/** RGB L1 step (0..765) between neighbours that marks an edge pixel. */
const EDGE_STEP = 48
/** Distance cap (source px) so one missing shape cannot dominate an icon's edge score. */
const EDGE_CAP = 4

/** 1 where a pixel's colour steps by more than EDGE_STEP to its right or lower neighbour. */
function edgeMap(img: RasterImage): Uint8Array {
  const { width: w, height: h, data } = img
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (x + 1 < w) {
        const d =
          Math.abs(data[i] - data[i + 4]) +
          Math.abs(data[i + 1] - data[i + 5]) +
          Math.abs(data[i + 2] - data[i + 6])
        if (d > EDGE_STEP) out[y * w + x] = out[y * w + x + 1] = 1
      }
      if (y + 1 < h) {
        const j = i + w * 4
        const d =
          Math.abs(data[i] - data[j]) +
          Math.abs(data[i + 1] - data[j + 1]) +
          Math.abs(data[i + 2] - data[j + 2])
        if (d > EDGE_STEP) out[y * w + x] = out[(y + 1) * w + x] = 1
      }
    }
  }
  return out
}

/** 3-4 chamfer distance (in pixels, ×3 internally) to the nearest set pixel. */
function chamfer(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9
  const d = new Float32Array(w * h)
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      let v = d[i]
      if (x > 0) v = Math.min(v, d[i - 1] + 3)
      if (y > 0) {
        v = Math.min(v, d[i - w] + 3)
        if (x > 0) v = Math.min(v, d[i - w - 1] + 4)
        if (x + 1 < w) v = Math.min(v, d[i - w + 1] + 4)
      }
      d[i] = v
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      let v = d[i]
      if (x + 1 < w) v = Math.min(v, d[i + 1] + 3)
      if (y + 1 < h) {
        v = Math.min(v, d[i + w] + 3)
        if (x + 1 < w) v = Math.min(v, d[i + w + 1] + 4)
        if (x > 0) v = Math.min(v, d[i + w - 1] + 4)
      }
      d[i] = v
    }
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3
  return d
}

/** Mean capped distance from `from`'s edge pixels to `to`'s edges, in source px. */
function edgeDistance(from: Uint8Array, toDist: Float32Array, unit: number): number {
  let s = 0
  let n = 0
  for (let i = 0; i < from.length; i++) {
    if (!from[i]) continue
    s += Math.min(EDGE_CAP, toDist[i] / unit)
    n++
  }
  return n > 0 ? s / n : 0
}

/** CIEDE2000 within which a paint colour stands for an ink. */
const INK_JND = 2.3
/** Smallest ink area (source px²) counted as missed. */
const INK_MIN_AREA = 2

/**
 * The flat-interior colours of a render: packed RGB → pixel count, over pixels
 * more than `r` from any edge whose colour also repeats exactly two pixels away
 * in all four directions — a fill, not a step of a gradient's ramp.
 */
function flatInks(img: RasterImage, edgeDist: Float32Array, r: number): Map<number, number> {
  const out = new Map<number, number>()
  const { width: w, height: h, data: d } = img
  const same = (i: number, j: number): boolean =>
    d[i * 4] === d[j * 4] && d[i * 4 + 1] === d[j * 4 + 1] && d[i * 4 + 2] === d[j * 4 + 2]
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x
      if (edgeDist[i] <= r) continue
      if (!same(i, i - 2) || !same(i, i + 2) || !same(i, i - 2 * w) || !same(i, i + 2 * w)) continue
      const k = (d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2]
      out.set(k, (out.get(k) ?? 0) + 1)
    }
  }
  return out
}

/** Colours a trace paints with: every fill/stroke/stop colour written as #rgb or #rrggbb. */
export function paintColors(svg: string): [number, number, number][] {
  const out = new Map<string, [number, number, number]>()
  for (const m of svg.matchAll(
    /(?:fill|stroke|stop-color)\s*[=:]\s*["']?#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g,
  )) {
    let h = m[1]
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
    const v = Number.parseInt(h, 16)
    out.set(h.toLowerCase(), [(v >> 16) & 255, (v >> 8) & 255, v & 255])
  }
  return [...out.values()]
}

const de = (a: [number, number, number], b: [number, number, number]): number => {
  const p = lab8(a[0], a[1], a[2])
  const q = lab8(b[0], b[1], b[2])
  return ciede2000(p[0], p[1], p[2], q[0], q[1], q[2])
}

export interface Score {
  fillDe00: number
  bandDe00: number
  inkMiss: number
  inkExtra: number
  inksMissed: number
  edgeMiss: number
  edgeExtra: number
  de00: number
  gmsd: number
  ratio: number
  params: number
  turning: number
  selfRes: number
  anchors: number
  bytes: number
}

/** Score a trace's SVG against the artist's render and its own input raster. */
export function scoreTrace(
  svg: string,
  truth: RasterImage,
  input: RasterImage,
  gtParams: number,
): Score {
  const big = render(svg, truth.width)
  const model = readSvg(svg)
  const small = render(svg, input.width)
  const unit = truth.width / input.width
  const eT = edgeMap(truth)
  const eB = edgeMap(big)
  const w = Math.min(truth.width, big.width)
  const h = Math.min(truth.height, big.height)
  const sameSize = truth.width === big.width && truth.height === big.height
  const dT = chamfer(eT, w, h)
  const edgeMiss = sameSize ? edgeDistance(eT, chamfer(eB, w, h), unit) : Number.NaN
  const edgeExtra = sameSize ? edgeDistance(eB, dT, unit) : Number.NaN
  // Colour error split by distance to the artist's edges.
  let fs = 0
  let fn = 0
  let bs = 0
  let bn = 0
  if (sameSize) {
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const i = y * w + x
        const o = i * 4
        const e =
          truth.data[o] === big.data[o] &&
          truth.data[o + 1] === big.data[o + 1] &&
          truth.data[o + 2] === big.data[o + 2]
            ? 0
            : de(
                [truth.data[o], truth.data[o + 1], truth.data[o + 2]],
                [big.data[o], big.data[o + 1], big.data[o + 2]],
              )
        if (dT[i] > unit) {
          fs += e
          fn++
        } else {
          bs += e
          bn++
        }
      }
    }
  }
  // Palette: the artist's flat inks (exact colours, area-weighted, near duplicates
  // grouped by the nearest-colour reading) against the trace's paint colours.
  const paint = paintColors(svg)
  // The canvas both renders sit on paints white wherever nothing is drawn.
  const canvas: [number, number, number][] = [...paint, [255, 255, 255]]
  const inks = sameSize ? flatInks(truth, dT, 2 * unit) : new Map<number, number>()
  const px2 = unit * unit
  let im = 0
  let ia = 0
  let missed = 0
  const inkList: [[number, number, number], number][] = []
  for (const [k, n] of inks) {
    const c: [number, number, number] = [(k >> 16) & 255, (k >> 8) & 255, k & 255]
    inkList.push([c, n])
    let best = Infinity
    for (const p of canvas) best = Math.min(best, de(c, p))
    im += best * n
    ia += n
    if (n / px2 >= INK_MIN_AREA && best > INK_JND) missed++
  }
  let ie = 0
  for (const p of paint) {
    let best = Infinity
    for (const [c, n] of inkList) if (n / px2 >= INK_MIN_AREA) best = Math.min(best, de(c, p))
    ie += Number.isFinite(best) ? best : 0
  }
  return {
    fillDe00: fn > 0 ? fs / fn : 0,
    bandDe00: bn > 0 ? bs / bn : 0,
    inkMiss: ia > 0 ? im / ia : 0,
    inkExtra: paint.length > 0 ? ie / paint.length : 0,
    inksMissed: missed,
    edgeMiss,
    edgeExtra,
    de00: meanDe00(big, truth),
    gmsd: gmsd(big, truth),
    ratio: gtParams > 0 ? model.params / gtParams : Number.NaN,
    params: model.params,
    turning: model.turning,
    selfRes: meanAbs(small, flattenOverWhite(input)),
    anchors: model.anchors,
    bytes: Buffer.byteLength(svg),
  }
}
