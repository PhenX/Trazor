/**
 * Exact anti-aliased scenes for the sub-pixel and junction tests: a polygon's box-filter
 * coverage of every pixel (Sutherland–Hodgman clipping against the pixel square, then the
 * shoelace area), images composed from per-region coverage in premultiplied RGBA, and the planar
 * map a front end would build from them (each pixel labeled with its largest-coverage region).
 */
import type { LabelMap } from '@trazor/core'
import { splitFaces } from '../../src/planar/faces'
import { buildPlanarMap } from '../../src/planar/map'
import type { PremultipliedImage } from '../../src/planar/types'
import { CLEAR, OUTSIDE } from '../../src/planar/types'
import type { FaceFill, PlanarMap } from '../../src/planar/types'

/** Premultiplied RGBA. */
export type Rgba = readonly [number, number, number, number]

/** Clip a polygon (flat `x, y` list) to the half-plane `s·(coord − c) ≥ 0` of axis `axis`. */
function clip(poly: number[], axis: 0 | 1, c: number, s: 1 | -1): number[] {
  const out: number[] = []
  const n = poly.length >> 1
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const ax = poly[2 * i]
    const ay = poly[2 * i + 1]
    const bx = poly[2 * j]
    const by = poly[2 * j + 1]
    const da = s * ((axis === 0 ? ax : ay) - c)
    const db = s * ((axis === 0 ? bx : by) - c)
    if (da >= 0) out.push(ax, ay)
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db)
      out.push(ax + t * (bx - ax), ay + t * (by - ay))
    }
  }
  return out
}

/** Unsigned shoelace area of a flat polygon. */
function area(poly: number[]): number {
  const n = poly.length >> 1
  let s = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    s += poly[2 * i] * poly[2 * j + 1] - poly[2 * j] * poly[2 * i + 1]
  }
  return Math.abs(s) / 2
}

/** The exact fraction of each pixel `[i, i+1] × [j, j+1]` a simple polygon covers. */
export function polygonCoverage(poly: readonly number[], w: number, h: number): Float64Array {
  const cov = new Float64Array(w * h)
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let k = 0; k < poly.length; k += 2) {
    x0 = Math.min(x0, poly[k])
    x1 = Math.max(x1, poly[k])
    y0 = Math.min(y0, poly[k + 1])
    y1 = Math.max(y1, poly[k + 1])
  }
  const i0 = Math.max(0, Math.floor(x0))
  const i1 = Math.min(w - 1, Math.ceil(x1))
  const j0 = Math.max(0, Math.floor(y0))
  const j1 = Math.min(h - 1, Math.ceil(y1))
  const all = [...poly]
  for (let j = j0; j <= j1; j++) {
    const band = clip(clip(all, 1, j, 1), 1, j + 1, -1)
    if (band.length < 6) continue
    for (let i = i0; i <= i1; i++) {
      const cell = clip(clip(band, 0, i, 1), 0, i + 1, -1)
      if (cell.length >= 6) cov[j * w + i] = Math.min(1, area(cell))
    }
  }
  return cov
}

/** A disk of radius `r` at `(cx, cy)` as a polygon of `n` vertices (sagitta `≈ r·π²/2n²`). */
export function diskPolygon(cx: number, cy: number, r: number, n = 4096): number[] {
  const out: number[] = []
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n
    out.push(cx + r * Math.cos(a), cy + r * Math.sin(a))
  }
  return out
}

/**
 * The wedge from `c` between directions `a0` and `a1` (radians, `a0 < a1`, under π apart),
 * reaching `reach` px out: a polygon whose clip to the image is the exact sector.
 */
export function wedgePolygon(
  cx: number,
  cy: number,
  a0: number,
  a1: number,
  reach = 400,
): number[] {
  const out = [cx, cy]
  const steps = Math.max(1, Math.ceil((a1 - a0) / (Math.PI / 8)))
  for (let s = 0; s <= steps; s++) {
    const a = a0 + ((a1 - a0) * s) / steps
    out.push(cx + reach * Math.cos(a), cy + reach * Math.sin(a))
  }
  return out
}

/** The half-plane left of the directed line through `(x, y)` along angle `a`, as a polygon. */
export function halfPlanePolygon(x: number, y: number, a: number, reach = 400): number[] {
  const dx = Math.cos(a)
  const dy = Math.sin(a)
  // Left of the direction on screen (y down) is `(dy, −dx)`.
  const lx = dy
  const ly = -dx
  return [
    x - reach * dx,
    y - reach * dy,
    x + reach * dx,
    y + reach * dy,
    x + reach * dx + reach * lx,
    y + reach * dy + reach * ly,
    x - reach * dx + reach * lx,
    y - reach * dy + reach * ly,
  ]
}

/** A linear gradient from `c0` at `(x0, y0)` to `c1` at `(x1, y1)`, padded past its ends. */
export interface LinearGradient {
  x0: number
  y0: number
  x1: number
  y1: number
  c0: Rgba
  c1: Rgba
}

/** A gradient's color at `(x, y)` into `out` (interpolated in encoded sRGB). */
export function gradientAt(g: LinearGradient, x: number, y: number, out: Float64Array): void {
  const dx = g.x1 - g.x0
  const dy = g.y1 - g.y0
  const dd = dx * dx + dy * dy
  const t = dd <= 0 ? 0 : Math.min(Math.max(((x - g.x0) * dx + (y - g.y0) * dy) / dd, 0), 1)
  for (let ch = 0; ch < 4; ch++) out[ch] = g.c0[ch] + (g.c1[ch] - g.c0[ch]) * t
}

/** A scene: per region its exact coverage and its color. */
export interface Scene {
  width: number
  height: number
  coverage: Float64Array[]
  colors: Rgba[]
  /** Region `k` is transparent (labeled {@link CLEAR}). */
  clear?: boolean[]
  /** Region `k` is painted with a gradient (read at each pixel center), its color the mean. */
  gradient?: (LinearGradient | undefined)[]
}

/** The scene's image: per pixel `Σ_k coverage_k · color_k`. */
export function sceneImage(s: Scene): PremultipliedImage {
  const n = s.width * s.height
  const data = new Float32Array(4 * n)
  const c = new Float64Array(4)
  for (let p = 0; p < n; p++) {
    for (let k = 0; k < s.coverage.length; k++) {
      const cov = s.coverage[k][p]
      if (cov === 0) continue
      const g = s.gradient?.[k]
      if (g === undefined) c.set(s.colors[k])
      else gradientAt(g, (p % s.width) + 0.5, Math.floor(p / s.width) + 0.5, c)
      for (let ch = 0; ch < 4; ch++) data[4 * p + ch] += cov * c[ch]
    }
  }
  return { width: s.width, height: s.height, data }
}

/** Two regions: inside a polygon and the rest. */
export function polygonScene(
  poly: readonly number[],
  w: number,
  h: number,
  inside: Rgba,
  outside: Rgba,
): Scene {
  const cin = polygonCoverage(poly, w, h)
  const cout = cin.map((c) => 1 - c)
  return { width: w, height: h, coverage: [cout, cin], colors: [outside, inside] }
}

/** Each pixel labeled with its largest-coverage region (the first on a tie). */
export function sceneLabels(s: Scene): LabelMap {
  const n = s.width * s.height
  const data = new Int32Array(n)
  for (let p = 0; p < n; p++) {
    let best = 0
    for (let k = 1; k < s.coverage.length; k++) {
      if (s.coverage[k][p] > s.coverage[best][p]) best = k
    }
    data[p] = s.clear?.[best] ? CLEAR : best
  }
  return { width: s.width, height: s.height, data, count: s.coverage.length }
}

/**
 * A scene's planar map and each face's fill: its region's color, or its gradient (whose flat
 * color is then the mean of its two ends).
 */
export function sceneMap(s: Scene): { map: PlanarMap; fills: FaceFill[] } {
  const faces = splitFaces(sceneLabels(s))
  const map = buildPlanarMap(faces)
  const fills: FaceFill[] = []
  for (let f = 0; f < faces.count; f++) {
    const l = faces.label[f]
    const k = l === CLEAR ? (s.clear?.indexOf(true) ?? 0) : l
    const g = s.gradient?.[k]
    if (g === undefined) {
      const c = s.colors[k]
      fills.push({ r: c[0], g: c[1], b: c[2], a: c[3] })
    } else {
      const mid = (ch: number): number => 0.5 * (g.c0[ch] + g.c1[ch])
      fills.push({
        r: mid(0),
        g: mid(1),
        b: mid(2),
        a: mid(3),
        at: (x, y, out) => gradientAt(g, x, y, out),
      })
    }
  }
  return { map, fills }
}

/**
 * Regions meeting at `(cx, cy)`: region `k` the sector from direction `angles[k]` to the next
 * (radians, ascending, spanning one turn), painted `colors[k]`.
 */
export function sectorsScene(
  cx: number,
  cy: number,
  angles: readonly number[],
  colors: readonly Rgba[],
  w: number,
  h: number,
): Scene {
  const coverage: Float64Array[] = []
  for (let k = 0; k < angles.length; k++) {
    const a0 = angles[k]
    const a1 = k + 1 < angles.length ? angles[k + 1] : angles[0] + 2 * Math.PI
    // Wedges of under π each, so every clipped piece is convex.
    const parts = Math.ceil((a1 - a0) / 3)
    const c = new Float64Array(w * h)
    for (let q = 0; q < parts; q++) {
      const from = a0 + ((a1 - a0) * q) / parts
      const to = a0 + ((a1 - a0) * (q + 1)) / parts
      const piece = polygonCoverage(wedgePolygon(cx, cy, from, to), w, h)
      for (let i = 0; i < c.length; i++) c[i] += piece[i]
    }
    coverage.push(c)
  }
  return { width: w, height: h, coverage, colors: [...colors] }
}

/** Every movable point of every edge between two faces of the image: `[x, y]` pairs. */
export function innerPoints(map: PlanarMap): [number, number][] {
  const out: [number, number][] = []
  for (const e of map.edges) {
    if (e.left === OUTSIDE || e.right === OUTSIDE) continue
    for (let k = 0; k < e.fixed.length; k++) {
      if (e.fixed[k] === 0) out.push([e.points[2 * k], e.points[2 * k + 1]])
    }
  }
  return out
}

/** Max and mean of `f` over points. */
export function stats(pts: [number, number][], f: (x: number, y: number) => number) {
  let max = 0
  let sum = 0
  for (const [x, y] of pts) {
    const d = f(x, y)
    max = Math.max(max, d)
    sum += d
  }
  return { max, mean: sum / Math.max(pts.length, 1), count: pts.length }
}
