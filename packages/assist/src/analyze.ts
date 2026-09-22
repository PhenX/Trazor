import type { RasterImage } from '@trazor/core'
import { clamp, rgbToHex, rgbToOklab } from '@trazor/core'

export interface ImageAnalysis {
  width: number
  height: number
  pixels: number
  hasAlpha: boolean
  /** Distinct RGB colors, capped at 65536. */
  distinctColors: number
  /**
   * Distinct colors that occur only where the image is not exactly flat — the
   * colors anti-aliasing invents along edges. A hard-edged pixel palette has
   * next to none (every pixel is a palette color that also fills a flat run); an
   * anti-aliased icon at any size has dozens more of them than it has flat ones.
   */
  rimColors: number
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
  /**
   * Fraction of visible samples (alpha ≥ `VISIBLE_MIN_ALPHA`) that are partly
   * transparent together with all four of their neighbors: the interior of a
   * translucent object (a soft shadow, a glass pane, steam). An anti-aliased
   * rim never produces one — it is a pixel wide, with solid or clear pixels on
   * either side — so this separates translucency from edge coverage. 0 for an
   * opaque image.
   */
  translucentArea: number
  /**
   * Fraction of samples inside exactly-flat runs whose color is neither of the
   * two dominant tones: a third flat ink (a gray fill inside a black outline),
   * which anti-aliasing never produces — an intermediate rim color is never
   * flat. Tells genuinely two-tone art from art carrying a minor third tone.
   */
  minorTonesArea: number
  /** Mean color of the darker of the two dominant tones: the ink of two-tone art. */
  inkHex: string
  /** Mean color of the lighter of the two dominant tones: its paper or ground. */
  paperHex: string
  /** Oklab lightness of `inkHex`. */
  inkLightness: number
  /** Oklab lightness of `paperHex`. */
  paperLightness: number
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
/** Alpha from which a pixel is visible at all (the engine's default cut). */
const VISIBLE_MIN_ALPHA = 8
/** Alpha from which a pixel counts as solid; below it the image has meaningful alpha. */
const SOLID_MIN_ALPHA = 250
/** Coarse RGB bins (3 bits per channel) the dominant tones are read from. */
const COARSE_BINS = 512

/** RGB-sum histogram bins for the percentile spread (8 levels each). */
const SPREAD_BINS = 96

/** Smooth areas of fewer samples than this are fine detail (a region-growing speck floor's worth). */
const FINE_MAX_SAMPLES = 16

/**
 * Composite one channel value over white by its alpha: the ground the engine
 * flattens a transparent image onto (`flattenImage`), so the statistics describe
 * the image the pipeline will trace. A transparent pixel stores whatever color
 * its encoder left behind — usually black — and read raw it would turn a dark
 * icon on a clear canvas into a black field with a hole in it.
 */
function overWhite(v: number, a: number): number {
  return a === 255 ? v : Math.round((v * a + 255 * (255 - a)) / 255)
}

/**
 * One statistical pass over the image, feeding the settings recommender.
 * Large images are sampled on a regular grid (deterministic), capped at ~256k
 * samples, which is plenty for global statistics. Colors are read composited
 * over white ({@link overWhite}); `hasAlpha` and the opaque area come from the
 * source alpha.
 */
export function analyzeImage(image: RasterImage): ImageAnalysis {
  const { width, height, data } = image
  const pixels = width * height
  const step = Math.max(1, Math.floor(Math.sqrt(pixels / 262144)))
  const gw = Math.ceil(width / step)
  const gh = Math.ceil(height / step)

  const colorSet = new Set<number>()
  const flatColorSet = new Set<number>()
  const hist = new Float64Array(4096)
  // Coarse tone bins: sample count, RGB + lightness sums (for the tone's mean
  // color) and the count of exactly-flat samples, plus the keys in first-seen
  // order so the dominant-tone ranking is stable.
  const coarseN = new Uint32Array(COARSE_BINS)
  const coarseSum = new Float64Array(COARSE_BINS * 4)
  const flatCoarse = new Uint32Array(COARSE_BINS)
  const coarseKeys: number[] = []
  // Per sample: 1 when opaque and within `SMOOTH_MAX_GRAD` of its right and
  // down neighbors — the pixels the smooth-area flood below may connect.
  const smooth = new Uint8Array(gw * gh)
  let hasAlpha = false
  let sampleCount = 0
  let opaqueCount = 0
  let visibleCount = 0
  let translucentCount = 0
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
      const a = data[i + 3]
      const r = overWhite(data[i], a)
      const g = overWhite(data[i + 1], a)
      const b = overWhite(data[i + 2], a)
      if (a < SOLID_MIN_ALPHA) hasAlpha = true
      sampleCount++

      const colorKey = (r << 16) | (g << 8) | b
      if (colorSet.size < 65536) colorSet.add(colorKey)
      hist[((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)]++
      const [L, oa, ob] = rgbToOklab(r / 255, g / 255, b / 255)
      const coarseKey = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5)
      if (coarseN[coarseKey] === 0) coarseKeys.push(coarseKey)
      coarseN[coarseKey]++
      coarseSum[coarseKey * 4] += r
      coarseSum[coarseKey * 4 + 1] += g
      coarseSum[coarseKey * 4 + 2] += b
      coarseSum[coarseKey * 4 + 3] += L

      sumL += L
      sumL2 += L * L
      const chroma = Math.hypot(oa, ob)
      sumChroma += chroma
      if (chroma > COLORED_CHROMA) coloredCount++

      let gx1 = 0
      let gy1 = 0
      if (x + step < width) {
        const iR = (row + x + step) * 4
        const aR = data[iR + 3]
        gx1 =
          Math.abs(r - overWhite(data[iR], aR)) +
          Math.abs(g - overWhite(data[iR + 1], aR)) +
          Math.abs(b - overWhite(data[iR + 2], aR))
      }
      if (y + step < height) {
        const iD = ((y + step) * width + x) * 4
        const aD = data[iD + 3]
        gy1 =
          Math.abs(r - overWhite(data[iD], aD)) +
          Math.abs(g - overWhite(data[iD + 1], aD)) +
          Math.abs(b - overWhite(data[iD + 2], aD))
      }
      if (x + step < width && y + step < height) {
        const grad = Math.max(gx1, gy1)
        if (grad > EDGE_GRAD) edgeCount++
        else if (grad > 3) microCount++
        else if (grad === 0) {
          flatCount++
          flatCoarse[coarseKey]++
          if (flatColorSet.size < 65536) flatColorSet.add(colorKey)
        }
      }
      if (a >= OPAQUE_MIN_ALPHA) {
        opaqueCount++
        if (gx1 <= SMOOTH_MAX_GRAD && gy1 <= SMOOTH_MAX_GRAD) smooth[gy * gw + gx] = 1
      }
      if (a >= VISIBLE_MIN_ALPHA) {
        visibleCount++
        if (a < SOLID_MIN_ALPHA && partialAround(data, width, height, x, y, step)) {
          translucentCount++
        }
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

  const sorted = coarseKeys.toSorted((p, q) => coarseN[q] - coarseN[p])
  const top1 = sorted[0]
  const top2 = sorted[1]
  const topN = (key: number | undefined): number => (key === undefined ? 0 : coarseN[key])
  const twoToneCoverage = sampleCount === 0 ? 0 : (topN(top1) + topN(top2)) / sampleCount
  const dominantHex = sorted.slice(0, 6).map((key) => {
    const r = ((key >> 6) & 7) * 32 + 16
    const g = ((key >> 3) & 7) * 32 + 16
    const b = (key & 7) * 32 + 16
    return rgbToHex(r, g, b)
  })
  const topFlat = (key: number | undefined): number => (key === undefined ? 0 : flatCoarse[key])
  const minorTonesArea =
    sampleCount === 0 ? 0 : (flatCount - topFlat(top1) - topFlat(top2)) / sampleCount
  const toneOf = (key: number): { hex: string; lightness: number } => {
    const n = coarseN[key]
    const o = key * 4
    return {
      hex: rgbToHex(
        Math.round(coarseSum[o] / n),
        Math.round(coarseSum[o + 1] / n),
        Math.round(coarseSum[o + 2] / n),
      ),
      lightness: coarseSum[o + 3] / n,
    }
  }
  const toneA = top1 === undefined ? { hex: '#000000', lightness: 0 } : toneOf(top1)
  const toneB = top2 === undefined ? toneA : toneOf(top2)
  const [ink, paper] = toneA.lightness <= toneB.lightness ? [toneA, toneB] : [toneB, toneA]

  const meanLightness = sampleCount === 0 ? 0 : sumL / sampleCount
  const variance = sampleCount === 0 ? 0 : Math.max(0, sumL2 / sampleCount - meanLightness ** 2)
  const contrast = Math.sqrt(variance)
  const colorfulness = sampleCount === 0 ? 0 : sumChroma / sampleCount

  const edgeDensity = sampleCount === 0 ? 0 : edgeCount / sampleCount
  const microGradientDensity = sampleCount === 0 ? 0 : microCount / sampleCount
  const flatDensity = sampleCount === 0 ? 0 : flatCount / sampleCount
  const coloredFraction = sampleCount === 0 ? 0 : coloredCount / sampleCount
  const translucentArea = visibleCount === 0 ? 0 : translucentCount / visibleCount
  const flatArea = opaqueCount === 0 ? 0 : flat / opaqueCount
  const rampArea = opaqueCount === 0 ? 0 : ramp / opaqueCount
  const fineArea = opaqueCount === 0 ? 0 : fine / opaqueCount

  const colorRichness = clamp(Math.log2(Math.max(1, colorSet.size)) / 15, 0, 1)
  const photoScore = clamp(
    0.45 * colorRichness + 0.75 * clamp(microGradientDensity * 2.2, 0, 1),
    0,
    1,
  )

  // Pixel art is a small canvas painted in a hard palette: every pixel is one
  // of a few colors, with no anti-aliased rim. Both tells are needed — a small
  // anti-aliased icon has the canvas but not the palette (a 128 px icon may
  // hold only 30 colors, yet most of them are rim colors that never fill a flat
  // run), a large hard-edged logo the palette but not the canvas — and neither
  // is pixel art.
  const rimColors = Math.max(0, colorSet.size - flatColorSet.size)
  const hardPalette = colorSet.size <= 32 && rimColors * 2 <= colorSet.size
  let pixelArtScore = 0
  if (pixels <= 128 * 128) pixelArtScore += 0.45
  if (hardPalette) pixelArtScore += 0.4
  if (microGradientDensity < 0.02) pixelArtScore += 0.15
  pixelArtScore = clamp(pixelArtScore, 0, 1)

  return {
    width,
    height,
    pixels,
    hasAlpha,
    distinctColors: colorSet.size,
    rimColors,
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
    translucentArea,
    minorTonesArea,
    inkHex: ink.hex,
    paperHex: paper.hex,
    inkLightness: ink.lightness,
    paperLightness: paper.lightness,
  }
}

/**
 * Whether every in-bounds sample neighbor (one grid step away) of the sample at
 * (x, y) is itself partly transparent — the signature of a translucent
 * interior rather than an anti-aliased rim.
 */
function partialAround(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  step: number,
): boolean {
  const partial = (px: number, py: number): boolean => {
    const a = data[(py * width + px) * 4 + 3]
    return a >= VISIBLE_MIN_ALPHA && a < SOLID_MIN_ALPHA
  }
  return (
    (x < step || partial(x - step, y)) &&
    (x + step >= width || partial(x + step, y)) &&
    (y < step || partial(x, y - step)) &&
    (y + step >= height || partial(x, y + step))
  )
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
      const a = data[i + 3]
      spread[(overWhite(data[i], a) + overWhite(data[i + 1], a) + overWhite(data[i + 2], a)) >> 3]++
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
