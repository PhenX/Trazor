/**
 * Spatially-coherent color segmentation front-end.
 *
 * Global k-means labels every pixel independently by nearest palette color, so
 * an anti-aliased/JPEG rim can pick a third color and draw a wrong-colored band.
 * This groups pixels into SLIC superpixels — a color+space k-means (Achanta et
 * al., "SLIC Superpixels", 2012) whose clusters are compact and edge-respecting
 * — quantizes the *original* image to a clean palette, then makes every pixel in
 * a superpixel take the **majority** palette label of that superpixel. Because
 * the palette comes from the un-blended image and the vote only ever picks one
 * of its entries, the front-end cannot invent a seam hue: a rim strip is
 * outvoted by the region it sits in and joins a real neighbor.
 *
 * The cost is that region boundaries snap to superpixel edges, so fine detail
 * blocks up. Measured against the corpus it holds invented hues about as low as
 * per-pixel `colorCoherence` does — no lower — while cutting node count and file
 * size hard. It is therefore an opt-in simplifying knob (`segmentation:
 * 'regions'`), not the fidelity default.
 */
import { clampInt, createLabelMap } from '@trazor/core'
import type { RasterImage } from '@trazor/core'
import { toOklabBuffer } from './convert'
import { quantize } from './quantize'
import type { QuantizeOptions, QuantizeResult } from './quantize'

export interface SegmentOptions extends QuantizeOptions {
  /** Target superpixel side in px (larger ⇒ fewer, coarser regions). */
  superpixelSize?: number
  /** SLIC compactness: higher favors square superpixels over color edges. */
  compactness?: number
  /** SLIC refinement iterations. */
  iterations?: number
}

/**
 * SLIC over the image's Oklab, returning one superpixel id per pixel plus the
 * superpixel count. Deterministic (grid init, no randomness). Disconnected
 * fragments of a superpixel keep its id, which is all the vote step needs, so no
 * separate connectivity pass is run.
 */
function slicLabels(
  image: RasterImage,
  size: number,
  compactness: number,
  iterations: number,
): { sp: Int32Array; kc: number } {
  const { width: w, height: h } = image
  const n = w * h
  const feat = toOklabBuffer(image) // n*3, Oklab
  const S = Math.max(4, size)
  // D² = colorDist² + (m/S)² · spatialDist²
  const spatialW = (compactness * compactness) / (S * S)

  const cols = Math.max(1, Math.round(w / S))
  const rows = Math.max(1, Math.round(h / S))
  const kc = cols * rows
  const cL = new Float64Array(kc)
  const ca = new Float64Array(kc)
  const cb = new Float64Array(kc)
  const cx = new Float64Array(kc)
  const cy = new Float64Array(kc)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      const px = Math.min(w - 1, Math.floor((c + 0.5) * (w / cols)))
      const py = Math.min(h - 1, Math.floor((r + 0.5) * (h / rows)))
      cx[i] = px
      cy[i] = py
      const f = (py * w + px) * 3
      cL[i] = feat[f]
      ca[i] = feat[f + 1]
      cb[i] = feat[f + 2]
    }
  }

  const label = new Int32Array(n).fill(-1)
  const dist = new Float64Array(n)
  const sumL = new Float64Array(kc)
  const sumA = new Float64Array(kc)
  const sumB = new Float64Array(kc)
  const sumX = new Float64Array(kc)
  const sumY = new Float64Array(kc)
  const cnt = new Uint32Array(kc)
  for (let iter = 0; iter < iterations; iter++) {
    dist.fill(Infinity)
    for (let k = 0; k < kc; k++) {
      const x0 = Math.max(0, Math.floor(cx[k] - S))
      const x1 = Math.min(w, Math.ceil(cx[k] + S))
      const y0 = Math.max(0, Math.floor(cy[k] - S))
      const y1 = Math.min(h, Math.ceil(cy[k] + S))
      const kl = cL[k]
      const kaa = ca[k]
      const kbb = cb[k]
      const kx = cx[k]
      const ky = cy[k]
      for (let y = y0; y < y1; y++) {
        const dy = y - ky
        for (let x = x0; x < x1; x++) {
          const p = y * w + x
          const f = p * 3
          const dL = feat[f] - kl
          const dA = feat[f + 1] - kaa
          const dB = feat[f + 2] - kbb
          const dx = x - kx
          const D = dL * dL + dA * dA + dB * dB + spatialW * (dx * dx + dy * dy)
          if (D < dist[p]) {
            dist[p] = D
            label[p] = k
          }
        }
      }
    }
    // Recompute centers as the mean of their assigned pixels.
    sumL.fill(0)
    sumA.fill(0)
    sumB.fill(0)
    sumX.fill(0)
    sumY.fill(0)
    cnt.fill(0)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x
        const k = label[p]
        if (k < 0) continue
        const f = p * 3
        sumL[k] += feat[f]
        sumA[k] += feat[f + 1]
        sumB[k] += feat[f + 2]
        sumX[k] += x
        sumY[k] += y
        cnt[k]++
      }
    }
    for (let k = 0; k < kc; k++) {
      if (cnt[k] === 0) continue // keep an empty center in place
      const inv = 1 / cnt[k]
      cL[k] = sumL[k] * inv
      ca[k] = sumA[k] * inv
      cb[k] = sumB[k] * inv
      cx[k] = sumX[k] * inv
      cy[k] = sumY[k] * inv
    }
  }
  return { sp: label, kc }
}

/**
 * Region-based color segmentation: palette-quantize the original image, then let
 * every SLIC superpixel adopt the majority palette label of its pixels. Same
 * `QuantizeResult` shape as {@link quantize}, so it drops into the engine in its
 * place; assignment is coherent per region, cutting invented seam hues without
 * ever introducing a color the plain quantizer would not.
 */
export function segmentRegions(image: RasterImage, opts: SegmentOptions): QuantizeResult {
  const base = quantize(image, opts)
  // A fixed/exact palette already resolves seams without clustering, and an
  // empty label set (fully masked) has nothing to vote on.
  if ((opts.fixedPalette != null && opts.fixedPalette.length > 0) || base.paletteHex.length === 0)
    return base

  const n = image.width * image.height
  const size = opts.superpixelSize ?? Math.max(6, Math.round(Math.sqrt(n / 8000)))
  const compactness = opts.compactness ?? 8
  const iterations = clampInt(opts.iterations ?? 10, 1, 20)
  const { sp, kc } = slicLabels(image, size, compactness, iterations)

  // Majority palette label within each superpixel (ties keep the lower index).
  const C = base.paletteHex.length
  const src = base.labels.data
  const tally = new Uint32Array(kc * C)
  for (let p = 0; p < n; p++) {
    const l = src[p]
    if (l < 0) continue
    const k = sp[p]
    if (k < 0) continue
    tally[k * C + l]++
  }
  const spLabel = new Int32Array(kc).fill(-1)
  for (let k = 0; k < kc; k++) {
    const b = k * C
    let best = -1
    let bestCount = 0
    for (let c = 0; c < C; c++) {
      const v = tally[b + c]
      if (v > bestCount) {
        bestCount = v
        best = c
      }
    }
    spLabel[k] = best
  }

  const out = createLabelMap(image.width, image.height, C)
  const dst = out.data
  const counts = new Uint32Array(C)
  for (let p = 0; p < n; p++) {
    const l = src[p]
    if (l < 0) {
      dst[p] = -1
      continue
    }
    const k = sp[p]
    const nl = k >= 0 && spLabel[k] >= 0 ? spLabel[k] : l
    dst[p] = nl
    counts[nl]++
  }
  return { labels: out, paletteHex: base.paletteHex, paletteRgb: base.paletteRgb, counts }
}
