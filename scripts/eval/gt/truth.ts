/**
 * Ground-truth edge geometry for the stage probes (`stages.ts`): the artist's
 * SVG drawn without anti-aliasing at many times the raster's size, read two
 * ways.
 *
 * - `trueEdgeDistance(x, y)`: the Euclidean distance in source pixels from a
 *   point to the nearest true color edge. Two 4-neighboring render pixels
 *   whose colors differ by more than {@link EDGE_DE} (Oklab, each color
 *   composited over white and over black, so an edge against transparency
 *   counts) mark the midpoint of the crack between them, and the image frame
 *   counts as an edge (a boundary traced along it is exact by construction);
 *   the lattice corner between two marks in line is marked too, so a straight
 *   run is an unbroken line. The marks sit on a grid of half render pixels
 *   whose exact squared Euclidean distance transform (Felzenszwalb &
 *   Huttenlocher 2012) is read with bilinear interpolation. A crisp render
 *   samples the drawing at each pixel's center, so the true edge crosses the
 *   segment between two differing centers and its crack midpoint lies within
 *   half a render pixel of it: at the 2048 px render of a 128 px tier, 1/32
 *   source px. Distances read a little short (the nearest of a staircase's
 *   marks wins): around a disk at 16 render px per source px they are within
 *   0.05 px, 0.01–0.02 px on average.
 * - `trueColor(x, y, out)`: the drawing's own paint at a point (the render
 *   pixel holding it), premultiplied encoded sRGB in [0, 1] — the space the
 *   planar core's fills live in.
 *
 * Registration follows inkvec's corpus renderer: the viewBox widened about its
 * center to the raster's aspect and drawn into exactly `scale·N` pixels, so
 * the render's `scale × scale` block (i, j) is source pixel (i, j). Points are
 * in Trazor's coordinates: pixel (i, j) covers [i, i+1] × [j, j+1]. Renders
 * are cached as PNG (straight alpha) under `<cache>/truth8/`.
 *
 * After inkvec (Apache-2.0): `bench/inkvec_bench/render.py` (`normalize_svg`,
 * `_root_size`, `fit_viewbox`) and `bench/build_corpus_v2.py`
 * (`render_supersampled`, the registration of the corpus rasters).
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import type { RasterImage } from '@trazor/core'
import { rgbToOklab } from '@trazor/core'
import { readRgba, writePng } from '../lib'

/** Oklab difference above which two neighboring render pixels lie on two sides of an edge. */
export const EDGE_DE = 0.02

/** The render's long side is at least this many pixels (where {@link MAX_RENDER_SIDE} allows)… */
const MIN_RENDER_SIDE = 2048
/** …and at least this many per source pixel… */
const MIN_SCALE = 8
/** …but never more than this many pixels. */
const MAX_RENDER_SIDE = 4096

/** A finite stand-in for infinity in the distance transform (no ∞ − ∞ in the envelope). */
const FAR = 1e20

/** Render pixels per source pixel for a raster of `width × height`. */
export function truthScale(width: number, height: number): number {
  const n = Math.max(width, height)
  const wanted = Math.max(MIN_SCALE, Math.ceil(MIN_RENDER_SIDE / n))
  return Math.max(1, Math.min(wanted, Math.floor(MAX_RENDER_SIDE / n)))
}

const LENGTH_RE = /^\s*([0-9.eE+-]+)\s*(?:px)?\s*$/

/** A root length in user units (plain or `px`); undefined for anything else. */
function parseLength(v: string | undefined): number | undefined {
  if (v === undefined) return undefined
  const m = LENGTH_RE.exec(v)
  const n = m ? Number(m[1]) : Number.NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** An attribute of a start tag, either quote style. */
function tagAttr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag)
  return m ? (m[1] ?? m[2]) : undefined
}

/**
 * The SVG with its root sized to `width × height` and its viewBox widened about
 * its center to that aspect, so a render at `width` is a uniform scale of the
 * drawing — inkvec's `normalize_svg` (a viewBox from the root size when there
 * is none), `_root_size` and `fit_viewbox`.
 */
export function registerSvg(svg: string, width: number, height: number): string {
  const m = /<svg\b[^>]*>/.exec(svg)
  if (!m) throw new Error('no <svg> root')
  const tag = m[0]
  let box = (tagAttr(tag, 'viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  if (box.length !== 4 || box.some((v) => !Number.isFinite(v)) || box[2] <= 0 || box[3] <= 0) {
    const w = parseLength(tagAttr(tag, 'width'))
    const h = parseLength(tagAttr(tag, 'height'))
    if (w === undefined || h === undefined) throw new Error('SVG has neither viewBox nor size')
    box = [0, 0, w, h]
  }
  let [x, y, w, h] = box
  const want = width / height
  if (Math.abs(want - w / h) >= 1e-6) {
    if (want > w / h) {
      const nw = h * want
      x -= (nw - w) / 2
      w = nw
    } else {
      const nh = w / want
      y -= (nh - h) / 2
      h = nh
    }
  }
  const bare = tag
    .replace(/\s(?:width|height|viewBox)\s*=\s*(?:"[^"]*"|'[^']*')/g, '')
    .replace(/\s*\/?>$/, '')
  const root = `${bare} viewBox="${x} ${y} ${w} ${h}" width="${width}" height="${height}"${tag.endsWith('/>') ? '/>' : '>'}`
  return svg.slice(0, m.index) + root + svg.slice(m.index + tag.length)
}

/**
 * The drawing at exactly `width × height` pixels without anti-aliasing (each
 * pixel the paint at its center), premultiplied RGBA as resvg composites it;
 * over white when `opaque` (the `op` tiers), else over transparency.
 */
export function renderTruth(
  svg: string,
  width: number,
  height: number,
  opaque: boolean,
): RasterImage {
  const r = new Resvg(registerSvg(svg, width, height), {
    shapeRendering: 1,
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: false },
    ...(opaque ? { background: 'rgba(255,255,255,1)' } : {}),
  }).render()
  if (r.width !== width || r.height !== height) {
    throw new Error(`truth render is ${r.width}×${r.height}, expected ${width}×${height}`)
  }
  return { width, height, data: new Uint8ClampedArray(r.pixels) }
}

/** Where the truth render of one corpus item is cached. */
export function truthCachePath(
  cacheDir: string,
  corpus: string,
  stem: string,
  width: number,
  height: number,
  opaque: boolean,
): string {
  const scale = truthScale(width, height)
  const dir = `${width * scale}x${height * scale}${opaque ? '-op' : ''}`
  return join(cacheDir, 'truth8', dir, corpus, `${stem}.png`)
}

/** Straight → premultiplied in place (exact inverse of {@link straightCopy} on resvg output). */
function premultiplyInPlace(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a === 255) continue
    data[i] = Math.round((data[i] * a) / 255)
    data[i + 1] = Math.round((data[i + 1] * a) / 255)
    data[i + 2] = Math.round((data[i + 2] * a) / 255)
  }
}

/** A straight-alpha copy of a premultiplied image, for a well-formed PNG. */
function straightCopy(img: RasterImage): RasterImage {
  const data = new Uint8ClampedArray(img.data)
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a === 255) continue
    if (a === 0) {
      data[i] = data[i + 1] = data[i + 2] = 0
      continue
    }
    data[i] = Math.round((data[i] * 255) / a)
    data[i + 1] = Math.round((data[i + 1] * 255) / a)
    data[i + 2] = Math.round((data[i + 2] * 255) / a)
  }
  return { width: img.width, height: img.height, data }
}

/**
 * The truth render of `svgPath` for a `width × height` raster (premultiplied),
 * read from `cachePath` when present and written there otherwise.
 */
export function cachedTruthRender(
  svgPath: string,
  width: number,
  height: number,
  opaque: boolean,
  cachePath: string,
): RasterImage {
  if (existsSync(cachePath)) {
    const img = readRgba(cachePath)
    premultiplyInPlace(img.data)
    return img
  }
  const scale = truthScale(width, height)
  const img = renderTruth(readFileSync(svgPath, 'utf8'), width * scale, height * scale, opaque)
  mkdirSync(dirname(cachePath), { recursive: true })
  writePng(cachePath, straightCopy(img))
  return img
}

/**
 * In place: `grid` holds 0 at the seeds and a huge value elsewhere, and comes
 * back holding each cell's exact squared Euclidean distance to the nearest
 * seed — Felzenszwalb & Huttenlocher 2012, the 1-D lower envelope of parabolas
 * run down every column, then along every row.
 */
export function squaredDistanceTransform(grid: Float32Array, width: number, height: number): void {
  const n = Math.max(width, height)
  const f = new Float64Array(n)
  const d = new Float64Array(n)
  const v = new Int32Array(n)
  const z = new Float64Array(n + 1)
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = grid[y * width + x]
    lowerEnvelope(f, height, d, v, z)
    for (let y = 0; y < height; y++) grid[y * width + x] = d[y]
  }
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) f[x] = grid[row + x]
    lowerEnvelope(f, width, d, v, z)
    for (let x = 0; x < width; x++) grid[row + x] = d[x]
  }
}

/** `d[q] = min_p (q − p)² + f[p]` over `[0, n)` (F&H 2012, Algorithm 1). */
function lowerEnvelope(
  f: Float64Array,
  n: number,
  d: Float64Array,
  v: Int32Array,
  z: Float64Array,
): void {
  let k = 0
  v[0] = 0
  z[0] = -Infinity
  z[1] = Infinity
  for (let q = 1; q < n; q++) {
    const fq = f[q] + q * q
    let p = v[k]
    let s = (fq - (f[p] + p * p)) / (2 * (q - p))
    while (s <= z[k]) {
      k--
      p = v[k]
      s = (fq - (f[p] + p * p)) / (2 * (q - p))
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = Infinity
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    const dq = q - v[k]
    d[q] = dq * dq + f[v[k]]
  }
}

/**
 * Per pixel, the index of its color among the image's distinct colors, and
 * each color's Oklab composited over white (`lab[6c..6c+2]`) and over black
 * (`lab[6c+3..6c+5]`), from premultiplied RGBA.
 */
function colorTable(img: RasterImage): { index: Int32Array; lab: Float64Array } {
  const { data } = img
  const n = img.width * img.height
  const index = new Int32Array(n)
  const ids = new Map<number, number>()
  const labs: number[] = []
  let lastKey = -1
  let lastId = -1
  for (let i = 0; i < n; i++) {
    const o = i * 4
    const key = ((data[o] << 24) | (data[o + 1] << 16) | (data[o + 2] << 8) | data[o + 3]) >>> 0
    if (key !== lastKey) {
      let id = ids.get(key)
      if (id === undefined) {
        id = ids.size
        ids.set(key, id)
        const a = data[o + 3]
        const r = data[o]
        const g = data[o + 1]
        const b = data[o + 2]
        labs.push(
          ...rgbToOklab((r + 255 - a) / 255, (g + 255 - a) / 255, (b + 255 - a) / 255),
          ...rgbToOklab(r / 255, g / 255, b / 255),
        )
      }
      lastKey = key
      lastId = id
    }
    index[i] = lastId
  }
  return { index, lab: Float64Array.from(labs) }
}

/** Whether colors `a` and `b` differ by more than `de` over white or over black. */
function differ(lab: Float64Array, a: number, b: number, de2: number): boolean {
  for (let k = 0; k < 6; k += 3) {
    const dl = lab[a * 6 + k] - lab[b * 6 + k]
    const da = lab[a * 6 + k + 1] - lab[b * 6 + k + 1]
    const db = lab[a * 6 + k + 2] - lab[b * 6 + k + 2]
    if (dl * dl + da * da + db * db > de2) return true
  }
  return false
}

/**
 * The edge seeds of a render on its half-pixel grid of `(2w+1) × (2h+1)` nodes
 * (node (u, v) at render coordinate (u/2, v/2), so pixel centers are the odd
 * nodes): 0 at every crack midpoint between two differing 4-neighbors, at
 * every lattice corner between two such midpoints in line, and along the
 * frame; {@link FAR} elsewhere.
 */
export function edgeSeeds(img: RasterImage, de = EDGE_DE): Float32Array {
  const { width: w, height: h } = img
  const gw = 2 * w + 1
  const gh = 2 * h + 1
  const grid = new Float32Array(gw * gh).fill(FAR)
  for (let u = 0; u < gw; u++) {
    grid[u] = 0
    grid[(gh - 1) * gw + u] = 0
  }
  for (let v = 0; v < gh; v++) {
    grid[v * gw] = 0
    grid[v * gw + gw - 1] = 0
  }
  const { index, lab } = colorTable(img)
  const de2 = de * de
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const c = index[i]
      if (x + 1 < w && index[i + 1] !== c && differ(lab, c, index[i + 1], de2)) {
        grid[(2 * y + 1) * gw + 2 * x + 2] = 0
      }
      if (y + 1 < h && index[i + w] !== c && differ(lab, c, index[i + w], de2)) {
        grid[(2 * y + 2) * gw + 2 * x + 1] = 0
      }
    }
  }
  // A lattice corner between two marked cracks in line lies on a straight run
  // of the edge: marked too, so the run is one unbroken line of seeds. A corner
  // where the marks turn stays unmarked (the true edge cuts across it).
  for (let v = 2; v < gh - 1; v += 2) {
    for (let u = 2; u < gw - 1; u += 2) {
      const o = v * gw + u
      if ((grid[o - 1] === 0 && grid[o + 1] === 0) || (grid[o - gw] === 0 && grid[o + gw] === 0)) {
        grid[o] = 0
      }
    }
  }
  return grid
}

/** The ground truth of one raster, in its source pixels. */
export interface Truth {
  /** Source raster size (px). */
  readonly width: number
  readonly height: number
  /** Render pixels per source pixel. */
  readonly scale: number
  /** Distance (source px) from `(x, y)` to the nearest true edge (the frame counts as one). */
  trueEdgeDistance(x: number, y: number): number
  /** The drawing's paint at `(x, y)` into `out[0..3]`: premultiplied encoded sRGB in [0, 1]. */
  trueColor(x: number, y: number, out: Float64Array): void
  /**
   * Mean absolute difference (0–255, premultiplied RGBA) between the render
   * box-filtered to the source grid and `raster` (straight RGBA, the corpus
   * raster): how well the truth sits in register with what was traced.
   */
  registration(raster: RasterImage): number
}

/** The truth read from a render of `scale` pixels per source pixel (premultiplied RGBA). */
export function truthFromRender(render: RasterImage, scale: number, de = EDGE_DE): Truth {
  const width = render.width / scale
  const height = render.height / scale
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new Error(`render ${render.width}×${render.height} is not a multiple of ${scale}`)
  }
  const gw = 2 * render.width + 1
  const gh = 2 * render.height + 1
  const dist = edgeSeeds(render, de)
  squaredDistanceTransform(dist, gw, gh)
  for (let i = 0; i < dist.length; i++) dist[i] = Math.sqrt(dist[i])
  // Grid nodes per source pixel.
  const k = 2 * scale
  const { data } = render
  return {
    width,
    height,
    scale,
    trueEdgeDistance(x: number, y: number): number {
      // Beyond the frame the frame itself is the nearest edge.
      const cx = Math.min(width, Math.max(0, x))
      const cy = Math.min(height, Math.max(0, y))
      if (cx !== x || cy !== y) return Math.hypot(x - cx, y - cy)
      const u = Math.min(gw - 1, x * k)
      const v = Math.min(gh - 1, y * k)
      const i = Math.min(gw - 2, Math.floor(u))
      const j = Math.min(gh - 2, Math.floor(v))
      const fu = u - i
      const fv = v - j
      const o = j * gw + i
      const top = dist[o] + (dist[o + 1] - dist[o]) * fu
      const bottom = dist[o + gw] + (dist[o + gw + 1] - dist[o + gw]) * fu
      return (top + (bottom - top) * fv) / k
    },
    trueColor(x: number, y: number, out: Float64Array): void {
      const px = Math.min(render.width - 1, Math.max(0, Math.floor(x * scale)))
      const py = Math.min(render.height - 1, Math.max(0, Math.floor(y * scale)))
      const o = (py * render.width + px) * 4
      out[0] = data[o] / 255
      out[1] = data[o + 1] / 255
      out[2] = data[o + 2] / 255
      out[3] = data[o + 3] / 255
    },
    registration(raster: RasterImage): number {
      if (raster.width !== width || raster.height !== height) return Number.NaN
      const block = scale * scale
      const acc = new Float64Array(4)
      let sum = 0
      for (let j = 0; j < height; j++) {
        for (let i = 0; i < width; i++) {
          acc.fill(0)
          for (let dy = 0; dy < scale; dy++) {
            let o = ((j * scale + dy) * render.width + i * scale) * 4
            for (let dx = 0; dx < scale; dx++, o += 4) {
              acc[0] += data[o]
              acc[1] += data[o + 1]
              acc[2] += data[o + 2]
              acc[3] += data[o + 3]
            }
          }
          const r = (j * width + i) * 4
          const a = raster.data[r + 3]
          for (let c = 0; c < 3; c++)
            sum += Math.abs(acc[c] / block - (raster.data[r + c] * a) / 255)
          sum += Math.abs(acc[3] / block - a)
        }
      }
      return sum / (width * height * 4)
    },
  }
}

/** Where to find and keep the truth of one raster. */
export interface TruthSource {
  svgPath: string
  /** Source raster size (px). */
  width: number
  height: number
  /** Rendered over white (an `op` tier), else over transparency. */
  opaque: boolean
  cachePath: string
}

/** The ground truth of one corpus raster, its render read from (or written to) the cache. */
export function loadTruth(src: TruthSource): Truth {
  const render = cachedTruthRender(src.svgPath, src.width, src.height, src.opaque, src.cachePath)
  return truthFromRender(render, truthScale(src.width, src.height))
}
