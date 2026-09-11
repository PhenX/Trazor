/**
 * Shared helpers for the eval harnesses (docs/ML_ROADMAP.md item 1 & the tracer
 * comparison). Kept dependency-light and Node-only: read a PNG, rasterize an SVG
 * with resvg over white, and score fidelity as mean Oklab ΔE — the same metric
 * the app shows (the studio's fidelity metric).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'
import { deltaEOk, deltaEOkSq, rgbToOklab } from '@trazor/core'
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
 * Mean Oklab ΔE between two equally-sized RGBA rasters, both taken as opaque over
 * white (mirrors the studio's fidelity metric). Ignores alpha — callers pass
 * images already composited over white.
 */
export function meanDeltaE(a: RasterImage, b: RasterImage): number {
  const n = Math.min(a.data.length, b.data.length) >> 2
  let sum = 0
  for (let p = 0; p < n; p++) {
    const i = p * 4
    const [l1, a1, b1] = rgbToOklab(a.data[i] / 255, a.data[i + 1] / 255, a.data[i + 2] / 255)
    const [l2, a2, b2] = rgbToOklab(b.data[i] / 255, b.data[i + 1] / 255, b.data[i + 2] / 255)
    sum += deltaEOk(l1, a1, b1, l2, a2, b2)
  }
  return n > 0 ? sum / n : 0
}

export interface QualityStats {
  /** Mean Oklab ΔE over all pixels. */
  mean: number
  /** Mean Oklab ΔE within a few px of a source boundary — where wrong-colored
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
}

/**
 * Banding-aware fidelity of a rendered SVG against the (white-composited) source,
 * both same-sized and opaque over white. Beyond the whole-image mean it reports
 * the mean ΔE in a dilated band around source edges, the 95th-percentile ΔE, and
 * a spurious-hue score (traced colors with no near-match in the local source) —
 * the localized band/hue errors a whole-image mean hides.
 */
export function qualityStats(render: RasterImage, ref: RasterImage): QualityStats {
  const W = render.width
  const H = render.height
  const n = W * H
  const rd = render.data
  const sd = ref.data

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
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const [l1, a1, b1] = rgbToOklab(rd[i] / 255, rd[i + 1] / 255, rd[i + 2] / 255)
    const [l2, a2, b2] = rgbToOklab(sd[i] / 255, sd[i + 1] / 255, sd[i + 2] / 255)
    const d = deltaEOk(l1, a1, b1, l2, a2, b2)
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
  // nearest source color in a RAD-window (min squared Oklab distance, rooted
  // once). Precompute the source's Oklab so the window search is arithmetic only.
  const sl = new Float32Array(n * 3)
  for (let p = 0, i = 0, o = 0; p < n; p++, i += 4, o += 3) {
    const [sL, sa, sb] = rgbToOklab(sd[i] / 255, sd[i + 1] / 255, sd[i + 2] / 255)
    sl[o] = sL
    sl[o + 1] = sa
    sl[o + 2] = sb
  }
  const RAD = 3
  let ssum = 0
  let scount = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x
      if (near[p] === 0) continue
      const i = p * 4
      const [L, A, B] = rgbToOklab(rd[i] / 255, rd[i + 1] / 255, rd[i + 2] / 255)
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

  return {
    mean: n > 0 ? sum / n : 0,
    edge: ecount > 0 ? esum / ecount : 0,
    p95,
    spurious: scount > 0 ? ssum / scount : 0,
  }
}

/** Edge mask: pixels where the reference's local L1 RGB gradient exceeds `thresh`. */
function edgeMask(img: RasterImage, w: number, h: number, thresh = 48): Uint8Array {
  const d = img.data
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * img.width + x) * 4
      let g = 0
      if (x + 1 < w) {
        const q = p + 4
        g = Math.abs(d[p] - d[q]) + Math.abs(d[p + 1] - d[q + 1]) + Math.abs(d[p + 2] - d[q + 2])
      }
      if (y + 1 < h) {
        const q = p + img.width * 4
        const gy =
          Math.abs(d[p] - d[q]) + Math.abs(d[p + 1] - d[q + 1]) + Math.abs(d[p + 2] - d[q + 2])
        if (gy > g) g = gy
      }
      if (g > thresh) out[y * w + x] = 1
    }
  }
  return out
}

/** Chamfer 3-4 distance transform (Borgefors 1986) of an edge set, in pixel units. */
function chamferDistance(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9
  const d = new Float32Array(w * h)
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      let v = d[i]
      if (x > 0) v = Math.min(v, d[i - 1] + 3)
      if (y > 0) v = Math.min(v, d[i - w] + 3)
      if (x > 0 && y > 0) v = Math.min(v, d[i - w - 1] + 4)
      if (x + 1 < w && y > 0) v = Math.min(v, d[i - w + 1] + 4)
      d[i] = v
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      let v = d[i]
      if (x + 1 < w) v = Math.min(v, d[i + 1] + 3)
      if (y + 1 < h) v = Math.min(v, d[i + w] + 3)
      if (x + 1 < w && y + 1 < h) v = Math.min(v, d[i + w + 1] + 4)
      if (x > 0 && y + 1 < h) v = Math.min(v, d[i + w - 1] + 4)
      d[i] = v
    }
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3 // 3-4 weights → pixel units
  return d
}

/**
 * Symmetric mean boundary displacement in pixels between two same-sized rasters:
 * the average, over each image's edge pixels, of the distance to the nearest edge
 * in the other. It measures where boundaries land — the seam/corner error whole-image
 * mean ΔE dilutes — so a bw silhouette traced from a clean vs. a corrupted field is
 * separated even when their mean ΔE is close. 0 = boundaries coincide.
 */
export function boundaryError(a: RasterImage, b: RasterImage): number {
  const w = Math.min(a.width, b.width)
  const h = Math.min(a.height, b.height)
  const ea = edgeMask(a, w, h)
  const eb = edgeMask(b, w, h)
  const dToB = chamferDistance(eb, w, h)
  const dToA = chamferDistance(ea, w, h)
  let sa = 0
  let na = 0
  let sb = 0
  let nb = 0
  for (let i = 0; i < w * h; i++) {
    if (ea[i]) {
      sa += dToB[i]
      na++
    }
    if (eb[i]) {
      sb += dToA[i]
      nb++
    }
  }
  const ma = na > 0 ? sa / na : 0
  const mb = nb > 0 ? sb / nb : 0
  return (ma + mb) / 2
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
