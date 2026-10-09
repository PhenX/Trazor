/**
 * The planar chain's ink front end: inkvec's (ported in `@trazor/raster`'s
 * `ink`), in inkvec's order — the pixel noise, the image's inks chosen by
 * description length, each pixel labelled with its nearest ink, the noise
 * raised to the labels' residual on a soft intake, then speckles folded into
 * their commonest neighbour and anti-aliased blend slivers and pixels handed
 * back to the inks they blend. Each label is one ink, painted flat.
 */
import type { LabelMap, RasterImage } from '@trazor/core'
import { estimateNoise, rgbToHex } from '@trazor/core'
import { ink } from '@trazor/raster'

/** What the ink front end hands the planar chain. */
export interface InkFrontEnd {
  /** One ink per label, every label in use. */
  labels: LabelMap
  paletteHex: string[]
  /** Encoded sRGB bytes, three per label. */
  paletteRgb: Uint8Array
  counts: Uint32Array
  /** The pixel noise the geometry divides by, per channel, in encoded sRGB units. */
  sigmaNoise: number
}

/** Smallest region kept as itself, in source pixels (inkvec's `min_region`). */
const MIN_REGION = 2

/**
 * The ink front end of an opaque working image (already over white) traced
 * `scale` working pixels per source pixel; `soft` is the intake's verdict
 * (wide edges, ringing, a lossy container), which loosens the palette's guards
 * and lets the noise rise to the residual against the labels.
 */
export function inkFrontEnd(image: RasterImage, scale: number, soft: boolean): InkFrontEnd {
  const { width: w, height: h, data } = image
  const n = w * h
  const rgb = new Float32Array(n * 3)
  const lum = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const r = Math.fround(data[4 * i] / 255)
    const g = Math.fround(data[4 * i + 1] / 255)
    const b = Math.fround(data[4 * i + 2] / 255)
    rgb[3 * i] = r
    rgb[3 * i + 1] = g
    rgb[3 * i + 2] = b
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  let sigma = estimateNoise(lum, w, h)
  const ids = ink.colorIdsOfRgb(rgb)
  const pal = ink.extractPaletteMdl(
    rgb,
    w,
    h,
    ink.DEFAULT_MERGE_DISTANCE,
    ink.DEFAULT_MAX_COLORS,
    ink.paletteEvidence(sigma, n, soft),
    ids,
  )
  const raw = ink.labelImage(rgb, pal, ids)
  if (soft) {
    const measured = Math.min(
      ink.residualSigma(rgb, raw, w, h, pal.inkRgb) * ink.MEASURED_SIGMA_SCALE,
      ink.MEASURED_SIGMA_CAP / 255,
    )
    sigma = Math.max(sigma, measured)
  }
  const minRegion = MIN_REGION * scale * scale
  ink.despeckle(raw, w, h, minRegion)
  const absorbed = ink.absorbBlendSlivers(raw, rgb, null, w, h, pal.inkRgb, sigma)
  const moved = ink.reassignBlendPixels(raw, rgb, null, w, h, pal.inkRgb, sigma)
  if (absorbed > 0 || moved > 0) ink.despeckle(raw, w, h, minRegion)
  if (ink.findComponents(raw, w, h).count > ink.MAX_FACES)
    ink.capComponents(raw, w, h, ink.MAX_FACES)

  // Renumber the inks still in use densely, in palette order.
  const used = new Uint32Array(pal.count)
  for (let i = 0; i < n; i++) used[raw[i]]++
  const remap = new Int32Array(pal.count).fill(-1)
  const paletteHex: string[] = []
  const bytes: number[] = []
  const counts: number[] = []
  for (let k = 0; k < pal.count; k++) {
    if (used[k] === 0) continue
    remap[k] = paletteHex.length
    const c = [0, 1, 2].map((j) =>
      Math.round(Math.min(1, Math.max(0, pal.inkRgb[3 * k + j])) * 255),
    )
    paletteHex.push(rgbToHex(c[0], c[1], c[2]))
    bytes.push(c[0], c[1], c[2])
    counts.push(used[k])
  }
  const out = new Int32Array(n)
  for (let i = 0; i < n; i++) out[i] = remap[raw[i]]
  return {
    labels: { width: w, height: h, data: out, count: paletteHex.length },
    paletteHex,
    paletteRgb: Uint8Array.from(bytes),
    counts: Uint32Array.from(counts),
    sigmaNoise: sigma,
  }
}
