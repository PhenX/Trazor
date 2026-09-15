import type { RasterImage } from '@trazor/core'
import { clamp, rgbToHex, rgbToOklab } from '@trazor/core'

export interface ImageAnalysis {
  width: number
  height: number
  pixels: number
  hasAlpha: boolean
  /** Distinct RGB colors, capped at 65536. */
  distinctColors: number
  /** Shannon entropy (bits) of a 4096-bin RGB histogram. */
  entropyBits: number
  /** Fraction of pixels sitting on a strong edge. */
  edgeDensity: number
  /** Fraction of pixels with a small-but-nonzero gradient — the texture photos have and flat art lacks. */
  microGradientDensity: number
  /**
   * Fraction of pixels identical to their right and down neighbors — the large
   * uniform interiors flat art has (even anti-aliased, whose soft ramps sit only
   * along edges) and photographs/compressed graphics lack (sensor/block noise
   * leaves almost no exactly-flat pixel). Separates clean vector art from
   * photographic texture regardless of how many colors anti-aliasing invents.
   */
  flatDensity: number
  /**
   * Fraction of opaque pixels inside smooth areas of one flat color. A smooth
   * area is a connected run of pixels with no more than `SMOOTH_MAX_GRAD` of
   * change between neighbors, so JPEG noise and resampling keep a fill smooth
   * while anti-aliased rims, outlines and photographic texture break it. The
   * area is *flat* when its lightness spread (5th–95th percentile of the RGB
   * sum) stays under `RAMP_MIN_RANGE`. Cartoons and flat illustrations are
   * mostly flat area, whatever compression did to them.
   */
  flatArea: number
  /**
   * Fraction of opaque pixels inside smooth areas whose color ramps — a sky
   * gradient, a shaded backdrop, a soft vignette — with a lightness spread of at
   * least `RAMP_MIN_RANGE`. Region growing floods such an area into one mean
   * color, so this is the share of the image a flat-fill trace would visibly
   * lose. Noise does not count: the spread is a percentile range, not min–max.
   */
  rampArea: number
  /**
   * Fraction of opaque pixels inside smooth areas too small to hold a flat
   * core — fewer than `FINE_MAX_SAMPLES` samples: the fills of a sprite, pixel
   * art at native size, or the flecks a photograph's texture leaves smooth.
   * Region growing folds such fills into their neighbors; per-pixel
   * quantization keeps them.
   */
  fineArea: number
  /** Fraction of pixels covered by the two most common colors. */
  twoToneCoverage: number
  /** 0..1 likelihood the image is photographic. */
  photoScore: number
  /** 0..1 likelihood the image is (native-resolution) pixel art. */
  pixelArtScore: number
  dominantHex: string[]
  meanLightness: number
  /** Std-dev of Oklab lightness. */
  contrast: number
  /** Mean Oklab chroma (√(a²+b²)). Near 0 for grayscale, higher for saturated art. */
  colorfulness: number
  /**
   * Fraction of pixels whose Oklab chroma exceeds `COLORED_CHROMA` — a
   * background-robust measure of how colored the content is. Unlike mean
   * `colorfulness`, a large neutral (black/white) field cannot dilute it: a
   * vivid subject on a black backdrop still reports a meaningful fraction, so it
   * is not mistaken for grayscale.
   */
  coloredFraction: number
}

/** Oklab chroma above which a pixel counts as meaningfully colored (not neutral). */
const COLORED_CHROMA = 0.05

/** L1 RGB gradient (0..765) above which a sample sits on a strong edge. */
const EDGE_GRAD = 72

/**
 * L1 RGB difference between two adjacent samples up to which they belong to one
 * smooth area: the ±2–4 levels JPEG block noise or bilinear resampling leaves
 * inside a fill pass, an anti-aliased rim step or an outline does not.
 */
const SMOOTH_MAX_GRAD = 12

/**
 * Spread of the RGB sum (0..765) between the 5th and 95th percentile of a smooth
 * area's pixels at or above which the area ramps: about 20 levels per channel,
 * the faintest backdrop gradient a flat fill visibly flattens. Below it the area
 * is a flat fill, however noisy.
 */
const RAMP_MIN_RANGE = 60

/** Alpha at or above which a pixel counts as opaque for the area statistics. */
const OPAQUE_MIN_ALPHA = 128

/** RGB-sum histogram bins for the percentile spread (8 levels each). */
const SPREAD_BINS = 96

/** Smooth areas of fewer samples than this are fine detail (a region-growing speck floor's worth). */
const FINE_MAX_SAMPLES = 16

/**
 * One statistical pass over the image, feeding the settings recommender.
 * Large images are sampled on a regular grid (deterministic), capped at ~256k
 * samples, which is plenty for global statistics.
 */
export function analyzeImage(image: RasterImage): ImageAnalysis {
  const { width, height, data } = image
  const pixels = width * height
  const step = Math.max(1, Math.floor(Math.sqrt(pixels / 262144)))
  const gw = Math.ceil(width / step)
  const gh = Math.ceil(height / step)

  const colorSet = new Set<number>()
  const hist = new Float64Array(4096)
  const coarse = new Map<number, number>()
  // Per sample: 1 when opaque and within `SMOOTH_MAX_GRAD` of its right and
  // down neighbors — the pixels the smooth-area flood below may connect.
  const smooth = new Uint8Array(gw * gh)
  let hasAlpha = false
  let sampleCount = 0
  let opaqueCount = 0
  let edgeCount = 0
  let microCount = 0
  let flatCount = 0
  let coloredCount = 0
  let sumL = 0
  let sumL2 = 0
  let sumChroma = 0

  for (let gy = 0; gy < gh; gy++) {
    const y = gy * step
    const row = y * width
    for (let gx = 0; gx < gw; gx++) {
      const x = gx * step
      const i = (row + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const a = data[i + 3]
      if (a < 250) hasAlpha = true
      sampleCount++

      if (colorSet.size < 65536) colorSet.add((r << 16) | (g << 8) | b)
      hist[((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)]++
      const coarseKey = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5)
      coarse.set(coarseKey, (coarse.get(coarseKey) ?? 0) + 1)

      const [L, oa, ob] = rgbToOklab(r / 255, g / 255, b / 255)
      sumL += L
      sumL2 += L * L
      const chroma = Math.hypot(oa, ob)
      sumChroma += chroma
      if (chroma > COLORED_CHROMA) coloredCount++

      let gx1 = 0
      let gy1 = 0
      if (x + step < width) {
        const iR = (row + x + step) * 4
        gx1 = Math.abs(r - data[iR]) + Math.abs(g - data[iR + 1]) + Math.abs(b - data[iR + 2])
      }
      if (y + step < height) {
        const iD = ((y + step) * width + x) * 4
        gy1 = Math.abs(r - data[iD]) + Math.abs(g - data[iD + 1]) + Math.abs(b - data[iD + 2])
      }
      if (x + step < width && y + step < height) {
        const grad = Math.max(gx1, gy1)
        if (grad > EDGE_GRAD) edgeCount++
        else if (grad > 3) microCount++
        else if (grad === 0) flatCount++
      }
      if (a >= OPAQUE_MIN_ALPHA) {
        opaqueCount++
        if (gx1 <= SMOOTH_MAX_GRAD && gy1 <= SMOOTH_MAX_GRAD) smooth[gy * gw + gx] = 1
      }
    }
  }

  const { flat, ramp, fine } = smoothAreas(image, step, gw, gh, smooth)

  let entropyBits = 0
  for (let i = 0; i < 4096; i++) {
    const c = hist[i]
    if (c > 0) {
      const p = c / sampleCount
      entropyBits -= p * Math.log2(p)
    }
  }

  const sorted = [...coarse.entries()].toSorted((a, b) => b[1] - a[1])
  const twoToneCoverage =
    sampleCount === 0 ? 0 : ((sorted[0]?.[1] ?? 0) + (sorted[1]?.[1] ?? 0)) / sampleCount
  const dominantHex = sorted.slice(0, 6).map(([key]) => {
    const r = ((key >> 6) & 7) * 32 + 16
    const g = ((key >> 3) & 7) * 32 + 16
    const b = (key & 7) * 32 + 16
    return rgbToHex(r, g, b)
  })

  const meanLightness = sampleCount === 0 ? 0 : sumL / sampleCount
  const variance = sampleCount === 0 ? 0 : Math.max(0, sumL2 / sampleCount - meanLightness ** 2)
  const contrast = Math.sqrt(variance)
  const colorfulness = sampleCount === 0 ? 0 : sumChroma / sampleCount

  const edgeDensity = sampleCount === 0 ? 0 : edgeCount / sampleCount
  const microGradientDensity = sampleCount === 0 ? 0 : microCount / sampleCount
  const flatDensity = sampleCount === 0 ? 0 : flatCount / sampleCount
  const coloredFraction = sampleCount === 0 ? 0 : coloredCount / sampleCount
  const flatArea = opaqueCount === 0 ? 0 : flat / opaqueCount
  const rampArea = opaqueCount === 0 ? 0 : ramp / opaqueCount
  const fineArea = opaqueCount === 0 ? 0 : fine / opaqueCount

  const colorRichness = clamp(Math.log2(Math.max(1, colorSet.size)) / 15, 0, 1)
  const photoScore = clamp(
    0.45 * colorRichness + 0.75 * clamp(microGradientDensity * 2.2, 0, 1),
    0,
    1,
  )

  let pixelArtScore = 0
  if (pixels <= 128 * 128) pixelArtScore += 0.6
  if (colorSet.size <= 32) pixelArtScore += 0.25
  if (microGradientDensity < 0.02) pixelArtScore += 0.15
  pixelArtScore = clamp(pixelArtScore, 0, 1)

  return {
    width,
    height,
    pixels,
    hasAlpha,
    distinctColors: colorSet.size,
    entropyBits,
    edgeDensity,
    microGradientDensity,
    flatDensity,
    flatArea,
    rampArea,
    fineArea,
    twoToneCoverage,
    photoScore,
    pixelArtScore,
    dominantHex,
    meanLightness,
    contrast,
    colorfulness,
    coloredFraction,
  }
}

/**
 * Flood the smooth samples into 4-connected areas and split them into flat
 * fills and ramps by the percentile spread of their RGB sum; areas below
 * `FINE_MAX_SAMPLES` also count as fine detail. Returns the sample counts of
 * each kind. Explicit stack, fixed scan order: deterministic.
 */
function smoothAreas(
  image: RasterImage,
  step: number,
  gw: number,
  gh: number,
  smooth: Uint8Array,
): { flat: number; ramp: number; fine: number } {
  const { width, data } = image
  const n = gw * gh
  const seen = new Uint8Array(n)
  const stack = new Int32Array(n)
  const spread = new Int32Array(SPREAD_BINS)
  let flat = 0
  let ramp = 0
  let fine = 0
  for (let seed = 0; seed < n; seed++) {
    if (smooth[seed] === 0 || seen[seed] === 1) continue
    spread.fill(0)
    let size = 0
    let sp = 0
    stack[sp++] = seed
    seen[seed] = 1
    while (sp > 0) {
      const s = stack[--sp]
      size++
      const gx = s - ((s / gw) | 0) * gw
      const gy = (s / gw) | 0
      const i = (gy * step * width + gx * step) * 4
      spread[(data[i] + data[i + 1] + data[i + 2]) >> 3]++
      if (gx > 0 && smooth[s - 1] === 1 && seen[s - 1] === 0) {
        seen[s - 1] = 1
        stack[sp++] = s - 1
      }
      if (gx + 1 < gw && smooth[s + 1] === 1 && seen[s + 1] === 0) {
        seen[s + 1] = 1
        stack[sp++] = s + 1
      }
      if (gy > 0 && smooth[s - gw] === 1 && seen[s - gw] === 0) {
        seen[s - gw] = 1
        stack[sp++] = s - gw
      }
      if (gy + 1 < gh && smooth[s + gw] === 1 && seen[s + gw] === 0) {
        seen[s + gw] = 1
        stack[sp++] = s + gw
      }
    }
    // 5th and 95th percentile bins of the RGB sum; 8 levels per bin.
    let acc = 0
    let lo = -1
    let hi = SPREAD_BINS - 1
    for (let bin = 0; bin < SPREAD_BINS; bin++) {
      acc += spread[bin]
      if (lo < 0 && acc >= 0.05 * size) lo = bin
      if (acc >= 0.95 * size) {
        hi = bin
        break
      }
    }
    if ((hi - lo) * 8 >= RAMP_MIN_RANGE) ramp += size
    else flat += size
    if (size < FINE_MAX_SAMPLES) fine += size
  }
  return { flat, ramp, fine }
}
