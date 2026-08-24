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

/**
 * One statistical pass over the image, feeding the settings recommender.
 * Large images are sampled on a regular grid (deterministic), capped at ~256k
 * samples, which is plenty for global statistics.
 */
export function analyzeImage(image: RasterImage): ImageAnalysis {
  const { width, height, data } = image
  const pixels = width * height
  const step = Math.max(1, Math.floor(Math.sqrt(pixels / 262144)))

  const colorSet = new Set<number>()
  const hist = new Float64Array(4096)
  const coarse = new Map<number, number>()
  let hasAlpha = false
  let sampleCount = 0
  let edgeCount = 0
  let microCount = 0
  let flatCount = 0
  let coloredCount = 0
  let sumL = 0
  let sumL2 = 0
  let sumChroma = 0

  for (let y = 0; y < height; y += step) {
    const row = y * width
    for (let x = 0; x < width; x += step) {
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

      if (x + step < width && y + step < height) {
        const iR = (row + x + step) * 4
        const iD = ((y + step) * width + x) * 4
        const gx = Math.abs(r - data[iR]) + Math.abs(g - data[iR + 1]) + Math.abs(b - data[iR + 2])
        const gy = Math.abs(r - data[iD]) + Math.abs(g - data[iD + 1]) + Math.abs(b - data[iD + 2])
        const grad = Math.max(gx, gy)
        if (grad > 72) edgeCount++
        else if (grad > 3) microCount++
        else if (grad === 0) flatCount++
      }
    }
  }

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
