/**
 * Shared helpers for the eval harnesses (docs/ML_ROADMAP.md item 1 & the tracer
 * comparison). Kept dependency-light and Node-only: read a PNG, rasterize an SVG
 * with resvg over white, and score fidelity — mean ΔE and the localized
 * indicators around it — in toe-Oklab (see `qualityStats`).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'
import { deltaEOk, deltaEOkSq, lightnessToe, rgbToOklab } from '@trazor/core'
import type { RasterImage } from '@trazor/core'

/** Read a PNG or JPEG as a RasterImage (fresh Uint8ClampedArray, length w*h*4). */
export function readRgba(path: string): RasterImage {
  const buf = readFileSync(path)
  if (/\.jpe?g$/i.test(path)) {
    const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true })
    return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) }
  }
  const png = PNG.sync.read(buf)
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) }
}

/** Rasterize an SVG string over white at the given width (resvg). */
export function rasterizeSvg(svg: string, width: number): RasterImage {
  const resvg = new Resvg(svg, {
    background: 'rgba(255,255,255,1)',
    fitTo: { mode: 'width', value: width },
  })
  const r = resvg.render()
  return { width: r.width, height: r.height, data: new Uint8ClampedArray(r.pixels) }
}

/**
 * Composite an RGBA image over white into a fresh opaque RasterImage. resvg
 * already renders SVGs over white, so flattening the source the same way makes
 * ΔE fair for inputs with transparency (e.g. a sprite on an alpha background).
 */
export function flattenOverWhite(img: RasterImage): RasterImage {
  const { width, height, data } = img
  const out = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255
    out[i] = data[i] * a + 255 * (1 - a)
    out[i + 1] = data[i + 1] * a + 255 * (1 - a)
    out[i + 2] = data[i + 2] * a + 255 * (1 - a)
    out[i + 3] = 255
  }
  return { width, height, data: out }
}

/** Nearest-neighbor resample to (w, h) — used to align the source to a render. */
export function resampleNearest(img: RasterImage, w: number, h: number): RasterImage {
  if (img.width === w && img.height === h) return img
  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.height - 1, ((y * img.height) / h) | 0)
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, ((x * img.width) / w) | 0)
      const s = (sy * img.width + sx) * 4
      const d = (y * w + x) * 4
      out[d] = img.data[s]
      out[d + 1] = img.data[s + 1]
      out[d + 2] = img.data[s + 2]
      out[d + 3] = img.data[s + 3]
    }
  }
  return { width: w, height: h, data: out }
}

/**
 * Mean toe-Oklab ΔE between two equally-sized RGBA rasters, both taken as opaque
 * over white. Ignores alpha — callers pass images already composited over white.
 */
export function meanDeltaE(a: RasterImage, b: RasterImage): number {
  const n = Math.min(a.data.length, b.data.length) >> 2
  const ta = toeOklab(a)
  const tb = toeOklab(b)
  let sum = 0
  for (let p = 0, o = 0; p < n; p++, o += 3) {
    sum += deltaEOk(ta[o], ta[o + 1], ta[o + 2], tb[o], tb[o + 1], tb[o + 2])
  }
  return n > 0 ? sum / n : 0
}

export interface QualityStats {
  /** Mean toe-Oklab ΔE over all pixels. */
  mean: number
  /** Mean ΔE within a few px of a source boundary — where wrong-colored
   *  bands live, so it tracks banding that whole-image mean ΔE dilutes away. */
  edge: number
  /** 95th-percentile per-pixel ΔE — the worst-tail, which localized bands raise
   *  even when the mean looks fine. */
  p95: number
  /** Spurious-hue: mean, over the edge band, of each traced color's ΔE to the
   *  NEAREST source color in a local window. Plain ΔE compares a traced pixel to
   *  the one aligned source pixel — and a rim is a real mixture, so a wrong band
   *  still scores low — whereas this asks whether the traced color exists anywhere
   *  nearby in the source. A hue invented at a seam has no near-match and scores
   *  high: the band artifact the eye flags but pixel ΔE forgives. */
  spurious: number
  /** Key colors found in the reference: the distinct colors of its flat regions
   *  of meaningful area (see {@link keyColorStats}). */
  keyCount: number
  /** Mean over the key colors of the render's ΔE to that color over the color's
   *  own flat pixels — one vote per color, not per pixel, so a small bow tie
   *  counts as much as the backdrop. A palette that dropped a color shows here
   *  where the pixel-weighted mean hides it. Toe-Oklab. */
  keyDE: number
  /** The worst key color's ΔE: the one color the trace got most wrong. */
  keyWorst: number
  /** Key colors whose ΔE exceeds {@link KEY_MISS}: colors the trace lost. */
  keyMissed: number
  /** Boundary precision: the share of the render's edge pixels within
   *  {@link BF_TOL} px of a reference edge. Ragged or fragmented borders and
   *  speckle invent edges the reference lacks and pull it down. */
  bfPrecision: number
  /** Boundary recall: the share of the reference's edge pixels within
   *  {@link BF_TOL} px of a render edge. Lost details pull it down. */
  bfRecall: number
  /** Boundary F-score, the harmonic mean of the two (Csurka et al. 2013). */
  bf: number
}

/**
 * Banding-aware fidelity of a rendered SVG against the (white-composited) source,
 * both same-sized and opaque over white. Beyond the whole-image mean it reports
 * the mean ΔE in a dilated band around source edges, the 95th-percentile ΔE, a
 * spurious-hue score (traced colors with no near-match in the local source) —
 * the localized band/hue errors a whole-image mean hides — and the key-color
 * and boundary indicators. Every ΔE is measured in toe-Oklab (Oklab with the
 * lightness toe, `lightnessToe`): plain Oklab spreads the darkest colors so far
 * apart that the compression noise inside a black outline, and a trace that
 * paints such an outline black, count as color errors on a par with a real hue
 * change.
 */
export function qualityStats(render: RasterImage, ref: RasterImage): QualityStats {
  const W = render.width
  const H = render.height
  const n = W * H
  const sd = ref.data
  const renderToe = toeOklab(render)
  const refToe = toeOklab(ref)

  // Source boundary mask (L1 RGB gradient in the reference), dilated to a band.
  const EDGE_T = 48
  const edge = new Uint8Array(n)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      let g = 0
      if (x + 1 < W) {
        const j = i + 4
        g =
          Math.abs(sd[i] - sd[j]) +
          Math.abs(sd[i + 1] - sd[j + 1]) +
          Math.abs(sd[i + 2] - sd[j + 2])
      }
      if (y + 1 < H) {
        const j = i + W * 4
        const gy =
          Math.abs(sd[i] - sd[j]) +
          Math.abs(sd[i + 1] - sd[j + 1]) +
          Math.abs(sd[i + 2] - sd[j + 2])
        if (gy > g) g = gy
      }
      if (g > EDGE_T) edge[y * W + x] = 1
    }
  }
  const near = new Uint8Array(n)
  const R = 2
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (edge[y * W + x] === 0) continue
      for (let dy = -R; dy <= R; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= H) continue
        const base = yy * W
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx
          if (xx >= 0 && xx < W) near[base + xx] = 1
        }
      }
    }
  }

  const BINS = 1024
  const MAXDE = 0.5
  const hist = new Int32Array(BINS)
  let sum = 0
  let esum = 0
  let ecount = 0
  for (let p = 0, o = 0; p < n; p++, o += 3) {
    const d = deltaEOk(
      renderToe[o],
      renderToe[o + 1],
      renderToe[o + 2],
      refToe[o],
      refToe[o + 1],
      refToe[o + 2],
    )
    sum += d
    if (near[p] !== 0) {
      esum += d
      ecount++
    }
    let bin = ((d / MAXDE) * BINS) | 0
    if (bin >= BINS) bin = BINS - 1
    else if (bin < 0) bin = 0
    hist[bin]++
  }
  const target = 0.95 * n
  let acc = 0
  let p95 = MAXDE
  for (let b = 0; b < BINS; b++) {
    acc += hist[b]
    if (acc >= target) {
      p95 = ((b + 1) / BINS) * MAXDE
      break
    }
  }

  // Spurious hue: within the edge band, each traced color's distance to the
  // nearest source color in a RAD-window (min squared distance, rooted once).
  const sl = refToe
  const RAD = 3
  let ssum = 0
  let scount = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x
      if (near[p] === 0) continue
      const o = p * 3
      const L = renderToe[o]
      const A = renderToe[o + 1]
      const B = renderToe[o + 2]
      let best = Infinity
      for (let dy = -RAD; dy <= RAD; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= H) continue
        for (let dx = -RAD; dx <= RAD; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= W) continue
          const q = (yy * W + xx) * 3
          const dd = deltaEOkSq(L, A, B, sl[q], sl[q + 1], sl[q + 2])
          if (dd < best) best = dd
        }
      }
      ssum += Math.sqrt(best)
      scount++
    }
  }

  const key = keyColorStats(renderToe, refToe, W, H)
  const bfs = boundaryStats(renderToe, refToe, W, H)
  return {
    mean: n > 0 ? sum / n : 0,
    edge: ecount > 0 ? esum / ecount : 0,
    p95,
    spurious: scount > 0 ? ssum / scount : 0,
    ...key,
    ...bfs,
  }
}

// ---- Key colors and boundaries: the flat-art indicators ----

/** Interleaved toe-Oklab per pixel (alpha ignored). */
export function toeOklab(img: RasterImage): Float32Array {
  const n = img.width * img.height
  const out = new Float32Array(n * 3)
  const d = img.data
  const memo = new Map<number, number>()
  for (let p = 0, i = 0, o = 0; p < n; p++, i += 4, o += 3) {
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]
    const at = memo.get(key)
    if (at !== undefined) {
      out[o] = out[at]
      out[o + 1] = out[at + 1]
      out[o + 2] = out[at + 2]
      continue
    }
    const [L, a, b] = rgbToOklab(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255)
    out[o] = lightnessToe(L)
    out[o + 1] = a
    out[o + 2] = b
    memo.set(key, o)
  }
  return out
}

/** Max toe-Oklab ΔE from each pixel to its 4-neighbors. */
function neighborGradient(lab: Float32Array, W: number, H: number): Float32Array {
  const g = new Float32Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (x + 1 < W) {
        const d = Math.sqrt(
          deltaEOkSq(
            lab[i * 3],
            lab[i * 3 + 1],
            lab[i * 3 + 2],
            lab[i * 3 + 3],
            lab[i * 3 + 4],
            lab[i * 3 + 5],
          ),
        )
        if (d > g[i]) g[i] = d
        if (d > g[i + 1]) g[i + 1] = d
      }
      if (y + 1 < H) {
        const j = i + W
        const d = Math.sqrt(
          deltaEOkSq(
            lab[i * 3],
            lab[i * 3 + 1],
            lab[i * 3 + 2],
            lab[j * 3],
            lab[j * 3 + 1],
            lab[j * 3 + 2],
          ),
        )
        if (d > g[i]) g[i] = d
        if (d > g[j]) g[j] = d
      }
    }
  }
  return g
}

/** Toe-Oklab gradient below which a reference pixel is flat (a region interior). */
const KEY_FLAT_T = 0.02
/** Flat regions whose mean colors are closer than this are one key color. */
const KEY_MODE_MERGE = 0.05
/** A key color needs this many flat pixels: `max(KEY_MIN_AREA, KEY_MIN_AREA_FRAC · pixels)`. */
const KEY_MIN_AREA = 24
const KEY_MIN_AREA_FRAC = 1e-4
/** A key color rendered further than this from itself counts as lost. */
export const KEY_MISS = 0.08

export interface KeyColorStats {
  keyCount: number
  keyDE: number
  keyWorst: number
  keyMissed: number
}

/**
 * Key-color fidelity. The reference's key colors are the distinct colors of its
 * flat regions of meaningful area: flat pixels (gradient under `KEY_FLAT_T`,
 * eroded by one pixel so a boundary shift cannot leak in) are grouped into
 * 4-connected components, components closer than `KEY_MODE_MERGE` are one color,
 * and a color qualifies with at least `max(KEY_MIN_AREA, KEY_MIN_AREA_FRAC · n)`
 * flat pixels in total. Each key color is then scored as the mean ΔE between the
 * render and that color over the color's own flat pixels, and the colors are
 * averaged with one vote each — a palette that dropped the bow tie's orange or
 * painted the nose a muddy blend scores it, however small the region.
 */
export function keyColorStats(
  renderLab: Float32Array,
  refLab: Float32Array,
  W: number,
  H: number,
): KeyColorStats {
  const n = W * H
  const grad = neighborGradient(refLab, W, H)
  const flat = new Uint8Array(n)
  for (let i = 0; i < n; i++) flat[i] = grad[i] < KEY_FLAT_T ? 1 : 0
  // Core: flat pixels whose 4-neighbors are all flat (1-px erosion).
  const core = new Uint8Array(n)
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x
      if (flat[i] && flat[i - 1] && flat[i + 1] && flat[i - W] && flat[i + W]) core[i] = 1
    }
  }
  // 4-connected components of the core, with their mean color and area.
  const comp = new Int32Array(n).fill(-1)
  const stack = new Int32Array(n)
  const compL: number[] = []
  const compA: number[] = []
  const compB: number[] = []
  const compArea: number[] = []
  for (let s = 0; s < n; s++) {
    if (core[s] === 0 || comp[s] !== -1) continue
    const id = compL.length
    let sp = 0
    stack[sp++] = s
    comp[s] = id
    let sL = 0
    let sA = 0
    let sB = 0
    let c = 0
    while (sp > 0) {
      const p = stack[--sp]
      sL += refLab[p * 3]
      sA += refLab[p * 3 + 1]
      sB += refLab[p * 3 + 2]
      c++
      const x = p - ((p / W) | 0) * W
      if (x > 0 && core[p - 1] && comp[p - 1] === -1) {
        comp[p - 1] = id
        stack[sp++] = p - 1
      }
      if (x < W - 1 && core[p + 1] && comp[p + 1] === -1) {
        comp[p + 1] = id
        stack[sp++] = p + 1
      }
      if (p >= W && core[p - W] && comp[p - W] === -1) {
        comp[p - W] = id
        stack[sp++] = p - W
      }
      if (p < n - W && core[p + W] && comp[p + W] === -1) {
        comp[p + W] = id
        stack[sp++] = p + W
      }
    }
    compL.push(sL / c)
    compA.push(sA / c)
    compB.push(sB / c)
    compArea.push(c)
  }
  // Group components into color modes, largest component first (the mode color
  // is the area-weighted mean of its components).
  const order = compArea.map((_, i) => i).sort((a, b) => compArea[b] - compArea[a] || a - b)
  const modeL: number[] = []
  const modeA: number[] = []
  const modeB: number[] = []
  const modeArea: number[] = []
  const compMode = new Int32Array(compL.length).fill(-1)
  for (const c of order) {
    let hit = -1
    for (let m = 0; m < modeL.length; m++) {
      if (deltaEOk(compL[c], compA[c], compB[c], modeL[m], modeA[m], modeB[m]) < KEY_MODE_MERGE) {
        hit = m
        break
      }
    }
    if (hit < 0) {
      hit = modeL.length
      modeL.push(compL[c])
      modeA.push(compA[c])
      modeB.push(compB[c])
      modeArea.push(0)
    }
    const t = modeArea[hit] + compArea[c]
    modeL[hit] = (modeL[hit] * modeArea[hit] + compL[c] * compArea[c]) / t
    modeA[hit] = (modeA[hit] * modeArea[hit] + compA[c] * compArea[c]) / t
    modeB[hit] = (modeB[hit] * modeArea[hit] + compB[c] * compArea[c]) / t
    modeArea[hit] = t
    compMode[c] = hit
  }
  // Score each key color over its own flat pixels.
  const minArea = Math.max(KEY_MIN_AREA, KEY_MIN_AREA_FRAC * n)
  const sum = new Float64Array(modeL.length)
  const cnt = new Uint32Array(modeL.length)
  for (let p = 0; p < n; p++) {
    const c = comp[p]
    if (c < 0) continue
    const m = compMode[c]
    sum[m] += deltaEOk(
      renderLab[p * 3],
      renderLab[p * 3 + 1],
      renderLab[p * 3 + 2],
      modeL[m],
      modeA[m],
      modeB[m],
    )
    cnt[m]++
  }
  let keyCount = 0
  let total = 0
  let keyWorst = 0
  let keyMissed = 0
  for (let m = 0; m < modeL.length; m++) {
    if (modeArea[m] < minArea || cnt[m] === 0) continue
    const d = sum[m] / cnt[m]
    keyCount++
    total += d
    if (d > keyWorst) keyWorst = d
    if (d > KEY_MISS) keyMissed++
  }
  return { keyCount, keyDE: keyCount > 0 ? total / keyCount : 0, keyWorst, keyMissed }
}

/** Toe-Oklab gradient at or above which a pixel is an edge. */
const BF_EDGE_T = 0.06
/** Chebyshev distance (px) within which an edge pixel matches one in the other image. */
const BF_TOL = 1

export interface BoundaryStats {
  bfPrecision: number
  bfRecall: number
  bf: number
}

/**
 * One-pixel-wide edge map: the forward-difference toe-Oklab gradient, thinned by
 * non-maximum suppression along its dominant axis, then thresholded at
 * `BF_EDGE_T`. The same operator on both images makes their edges comparable
 * whatever the softness of the source's ramps.
 */
export function edgeMap(lab: Float32Array, W: number, H: number): Uint8Array {
  const n = W * H
  const gx = new Float32Array(n)
  const gy = new Float32Array(n)
  const g = new Float32Array(n)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const o = i * 3
      if (x + 1 < W)
        gx[i] = Math.sqrt(
          deltaEOkSq(lab[o], lab[o + 1], lab[o + 2], lab[o + 3], lab[o + 4], lab[o + 5]),
        )
      if (y + 1 < H) {
        const q = (i + W) * 3
        gy[i] = Math.sqrt(
          deltaEOkSq(lab[o], lab[o + 1], lab[o + 2], lab[q], lab[q + 1], lab[q + 2]),
        )
      }
      g[i] = Math.sqrt(gx[i] * gx[i] + gy[i] * gy[i])
    }
  }
  const out = new Uint8Array(n)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (g[i] < BF_EDGE_T) continue
      // Keep a local maximum along the dominant axis; a tie keeps the first of the pair.
      let keep: boolean
      if (gx[i] >= gy[i]) {
        const before = x > 0 ? g[i - 1] : 0
        const after = x + 1 < W ? g[i + 1] : 0
        keep = g[i] > before && g[i] >= after
      } else {
        const before = y > 0 ? g[i - W] : 0
        const after = y + 1 < H ? g[i + W] : 0
        keep = g[i] > before && g[i] >= after
      }
      if (keep) out[i] = 1
    }
  }
  return out
}

/** `edge` dilated by `BF_TOL` (Chebyshev). */
function dilate(edge: Uint8Array, W: number, H: number): Uint8Array {
  const out = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (edge[y * W + x] === 0) continue
      for (let dy = -BF_TOL; dy <= BF_TOL; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= H) continue
        for (let dx = -BF_TOL; dx <= BF_TOL; dx++) {
          const xx = x + dx
          if (xx >= 0 && xx < W) out[yy * W + xx] = 1
        }
      }
    }
  }
  return out
}

/**
 * Boundary precision / recall / F-score (the BF score of Csurka, Larlus &
 * Perronnin 2013) between the render's and the reference's edge maps at a
 * `BF_TOL`-pixel tolerance. Precision falls when the render draws edges the
 * reference lacks — a fragmented outline, a rim band, speckle; recall falls when
 * the render lost edges the reference has — a merged-away detail, a thin line.
 */
export function boundaryStats(
  renderLab: Float32Array,
  refLab: Float32Array,
  W: number,
  H: number,
): BoundaryStats {
  const er = edgeMap(renderLab, W, H)
  const es = edgeMap(refLab, W, H)
  const nearS = dilate(es, W, H)
  const nearR = dilate(er, W, H)
  let rCount = 0
  let rHit = 0
  let sCount = 0
  let sHit = 0
  for (let i = 0; i < W * H; i++) {
    if (er[i]) {
      rCount++
      if (nearS[i]) rHit++
    }
    if (es[i]) {
      sCount++
      if (nearR[i]) sHit++
    }
  }
  const bfPrecision = rCount > 0 ? rHit / rCount : 1
  const bfRecall = sCount > 0 ? sHit / sCount : 1
  const bf =
    bfPrecision + bfRecall > 0 ? (2 * bfPrecision * bfRecall) / (bfPrecision + bfRecall) : 0
  return { bfPrecision, bfRecall, bf }
}

/** app score: 1 − 4·ΔE, clamped to [0,1] (the studio's fidelity metric). */
export function score(dE: number): number {
  const s = 1 - dE * 4
  return s < 0 ? 0 : s > 1 ? 1 : s
}

/** Encode a RasterImage to a PNG file (RGBA, non-premultiplied). */
export function writePng(path: string, img: RasterImage): void {
  const png = new PNG({ width: img.width, height: img.height })
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength)
  writeFileSync(path, PNG.sync.write(png))
}

/** Encode a RasterImage as a base64 PNG data URI (for inlining a thumbnail). */
export function pngDataUri(img: RasterImage): string {
  const png = new PNG({ width: img.width, height: img.height })
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength)
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`
}
