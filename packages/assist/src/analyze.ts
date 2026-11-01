import type { RasterImage } from '@trazor/core'
import { ciede2000, clamp, rgbToHex, rgbToLab, rgbToOklab } from '@trazor/core'
import { ink as rasterInk } from '@trazor/raster'

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
  /** 0..1 likelihood the image is pixel art, at its own scale or enlarged by repeating pixels. */
  pixelArtScore: number
  /**
   * Side of the square blocks a nearest-neighbour enlargement repeats each
   * pixel into: 3 for pixel art shown at 300%, 1 for an image at its own
   * scale. Read off the color runs between edges, whose lengths an enlargement
   * makes multiples of the block. The pixel-grid measures below are taken on
   * one sample per block.
   */
  pixelScale: number
  /** Distinct colors on the pixel grid (over white), counted up to `GRID_COLORS_MAX` + 1. */
  gridColors: number
  /** Grid colors that never fill a flat corner (a sample and its right and lower neighbors). */
  gridRimColors: number
  /**
   * Share of the pixel grid's rim pixels on an edge — pixels in a color that
   * never fills a flat corner, two of whose neighbors differ — whose color lies
   * between those neighbors': anti-aliasing, which paints an edge pixel a blend
   * of the colors it separates. Near 1 for anti-aliased art; low for pixel art,
   * whose non-flat colors are details (an eye, a highlight, a one-pixel
   * stroke), not blends. Taken over at least `RIM_MIN_SHARE` of the grid, so a
   * few rim pixels weigh little; 0 when no rim pixel is on an edge, 1 when the
   * grid holds more than `GRID_COLORS_MAX` colors (not measured).
   */
  blendRimShare: number
  /**
   * Share of the color changes between neighboring pixel-grid samples that are
   * small steps (under `SOFT_STEP` summed RGB levels): near 0 for pixel art,
   * which steps between distinct shades, and high where colors blend
   * gradually — dithering, grain, a smooth gradient. 1 when not measured.
   */
  softStepShare: number
  /**
   * Share of the pixel grid in 4-connected same-color regions of at most
   * `FINE_REGION_MAX` samples: the details of pixel art. 0 when not measured.
   */
  fineRegionShare: number
  /** Pixel-grid samples per 4-connected same-color region; the grid's size when not measured. */
  meanRegionArea: number
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
   * Fraction of samples inside exactly-flat runs whose color is neither of the
   * two dominant tones: a third flat ink (a gray fill inside a black outline),
   * which anti-aliasing never produces — an intermediate rim color is never
   * flat. Tells genuinely two-tone art from art carrying a minor third tone. A
   * flat color sharing a dominant tone's coarse bin is that tone only within
   * the palette's same-ink distance of the bin's commonest flat color: a pale
   * gray fill beside white paper, or beside a transparent ground read over
   * white, is a third ink.
   */
  minorTonesArea: number
  /**
   * Color of the darker of the two dominant tones: the ink of two-tone art. The
   * mean of the tone's exactly-flat samples (its interior), or of all its
   * samples when none is flat.
   */
  inkHex: string
  /** Color of the lighter of the two dominant tones, read as {@link inkHex}: its paper or ground. */
  paperHex: string
  /**
   * Box-filter-equivalent width, in pixels, of the image's plateau-to-plateau
   * edges composited over white (the intake's ramp evidence): about 1 for a
   * native render, about 2 for a 2× bilinear upscale or a σ = 1 blur. An edge
   * wider than a native one carries no sub-pixel detail a finer grid could
   * recover.
   */
  edgeWidth: number
  /**
   * The paper of a drawing or scan, read off the Oklab-lightness histogram: its
   * main mode (the lightness most samples share), painted the mean color of the
   * samples within `groundSpread` of it. Unlike {@link paperHex} — the lighter of
   * the two commonest coarse RGB bins — a textured or JPEG'd paper that straddles
   * a bin boundary cannot fill both dominant tones and hide the ink.
   */
  groundHex: string
  /** Oklab lightness of the ground's mode. */
  groundLightness: number
  /** Mean Oklab chroma of the ground samples (0 for white or gray paper). */
  groundChroma: number
  /** Half width at half maximum of the ground's lightness peak: a paper is narrow, a photo's tones broad. */
  groundSpread: number
  /** Fraction of samples within `groundSpread` of the ground's lightness. */
  groundShare: number
  /**
   * The ink drawn on the ground: mean color of the darkest third of the samples
   * darker than the ground by more than `max(0.12, 4·groundSpread)` (their cores,
   * not their anti-aliased rims); the ground's color when there are none.
   */
  markHex: string
  /** Oklab lightness of {@link markHex}. */
  markLightness: number
  /**
   * 90th percentile of each sample's Oklab chroma-plane distance from the segment
   * between the ground and the mark: near 0 when every color is a mix of one
   * paper and one ink (a duotone — ink, pencil or wash on toned paper), large
   * when the image carries other hues (a colored print, a photo, a painted fill).
   * Read off a histogram up to `RESIDUAL_MAX` (0.25), where it saturates.
   */
  toneAxisResidual: number
  /**
   * Fraction of samples a quarter to three quarters of the way from the
   * ground's lightness to the mark's: the anti-aliased rims, hairlines, pencil,
   * hatching and wash of a drawing. Clean two-tone ink on its paper holds few
   * (its strokes' thin rims only); 0 when there is no mark.
   */
  midToneShare: number
  /**
   * Fraction of samples inside mid-tone areas: {@link midToneShare} samples
   * whose four neighbors are mid-tones too, in a 2×2 block whose mean color
   * stays within `MID_TONE_MAX_GRAD` of the next blocks'. A drawing's
   * mid-tones are the rims of its strokes, its hatching and its brushed or
   * rubbed washes — thin or broken, so near 0. A photograph or a film still
   * with smooth tones holds them as areas (skin, sky, a studio backdrop, a
   * painted fill), and so does a toned print of one, card mount and all; a busy
   * photograph (foliage, grass, ice, a crowd) breaks them up much as a drawing
   * does. Block means, not single samples, decide the smoothness, so film grain
   * or sensor noise does not hide such an area.
   */
  midToneArea: number
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
/** Alpha from which a pixel counts as solid; below it the image has meaningful alpha. */
const SOLID_MIN_ALPHA = 250
/** Coarse RGB bins (3 bits per channel) the dominant tones are read from. */
const COARSE_BINS = 512
/** Most distinct flat colors counted (the color set's own cap). */
const FLAT_COLORS_MAX = 65536

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
  // color), the count and RGB sums of exactly-flat samples (for its interior
  // color), plus the keys in first-seen order so the dominant-tone ranking is
  // stable.
  const coarseN = new Uint32Array(COARSE_BINS)
  const coarseSum = new Float64Array(COARSE_BINS * 4)
  const flatCoarse = new Uint32Array(COARSE_BINS)
  const flatCoarseSum = new Float64Array(COARSE_BINS * 3)
  // Exactly-flat samples by color (up to FLAT_COLORS_MAX colors).
  const flatColorCount = new Map<number, number>()
  const coarseKeys: number[] = []
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
  // Per-sample Oklab and RGB on the sample grid, for the ground / mark reading.
  const samples: Samples = {
    L: new Float32Array(gw * gh),
    a: new Float32Array(gw * gh),
    b: new Float32Array(gw * gh),
    rgb: new Uint8Array(gw * gh * 3),
    lightHist: new Uint32Array(GROUND_BINS),
    gw,
    gh,
  }

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
      const s = gy * gw + gx
      samples.L[s] = L
      samples.a[s] = oa
      samples.b[s] = ob
      samples.rgb[s * 3] = r
      samples.rgb[s * 3 + 1] = g
      samples.rgb[s * 3 + 2] = b
      samples.lightHist[lightBin(L)]++
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
          flatCoarseSum[coarseKey * 3] += r
          flatCoarseSum[coarseKey * 3 + 1] += g
          flatCoarseSum[coarseKey * 3 + 2] += b
          const seen = flatColorCount.get(colorKey)
          if (seen !== undefined) flatColorCount.set(colorKey, seen + 1)
          else if (flatColorCount.size < FLAT_COLORS_MAX) flatColorCount.set(colorKey, 1)
          if (flatColorSet.size < 65536) flatColorSet.add(colorKey)
        }
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
    sampleCount === 0
      ? 0
      : (flatCount -
          topFlat(top1) -
          topFlat(top2) +
          otherTonesIn(flatColorCount, top1) +
          otherTonesIn(flatColorCount, top2)) /
        sampleCount
  // A tone's color is its interior's: the bin also holds the anti-aliased rim
  // pixels that blend it into its neighbors (a black ink's bin reaches 31), and
  // their mean pulls the ink off the color the artist filled with.
  const toneOf = (key: number): { hex: string; lightness: number } => {
    const n = coarseN[key]
    const o = key * 4
    const nf = flatCoarse[key]
    const f = key * 3
    return {
      hex:
        nf > 0
          ? rgbToHex(
              Math.round(flatCoarseSum[f] / nf),
              Math.round(flatCoarseSum[f + 1] / nf),
              Math.round(flatCoarseSum[f + 2] / nf),
            )
          : rgbToHex(
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
  const flatArea = opaqueCount === 0 ? 0 : flat / opaqueCount
  const rampArea = opaqueCount === 0 ? 0 : ramp / opaqueCount
  const fineArea = opaqueCount === 0 ? 0 : fine / opaqueCount

  const colorRichness = clamp(Math.log2(Math.max(1, colorSet.size)) / 15, 0, 1)
  const photoScore = clamp(
    0.45 * colorRichness + 0.75 * clamp(microGradientDensity * 2.2, 0, 1),
    0,
    1,
  )

  // Pixel art is painted in a hard palette — every pixel one of a few colors,
  // with no anti-aliased rim — at the scale of single pixels. A small canvas
  // (counted at its own scale, before any enlargement) in a few colors that
  // nearly all fill flat runs is one: a small anti-aliased icon has the canvas
  // but not the palette (a 128 px icon may hold only 30 colors, yet most of
  // them are rim colors that never fill a flat run). A larger canvas is pixel
  // art when its pixel grid shows the same two tells (`isPixelGrid`): its
  // non-flat colors are details rather than blends, and it is painted in
  // regions of a few pixels — a sprite sheet, a tile map, a game scene. A large
  // hard-edged logo has the palette but paints it in large regions, and is not.
  const rimColors = Math.max(0, colorSet.size - flatColorSet.size)
  const hardPalette = colorSet.size <= 32 && rimColors * 2 <= colorSet.size
  const grid = pixelGridOf(image)
  const nativePixels = Math.ceil(width / grid.pixelScale) * Math.ceil(height / grid.pixelScale)
  let pixelArtScore = 0
  if (nativePixels <= 128 * 128) pixelArtScore += 0.45
  if (hardPalette) pixelArtScore += 0.4
  if (microGradientDensity < 0.02) pixelArtScore += 0.15
  if (isPixelGrid(grid)) pixelArtScore = Math.max(pixelArtScore, PIXEL_GRID_SCORE)
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
    minorTonesArea,
    inkHex: ink.hex,
    paperHex: paper.hex,
    edgeWidth: edgeWidthOf(image),
    ...grid,
    ...groundAndMark(samples),
  }
}

/** Oklab-lightness histogram bins the ground is read from. */
const GROUND_BINS = 256
/** Half-width (bins) of the box the lightness histogram is smoothed with before its mode is taken. */
const GROUND_SMOOTH = 3
/** Least lightness gap between the ground and a sample counted as ink. */
const MARK_MIN_GAP = 0.12
/** Histogram bins, over 0..`RESIDUAL_MAX`, the tone-axis residual's percentile is read from. */
const RESIDUAL_BINS = 1024
/** Largest tone-axis residual told apart (Oklab chroma-plane distance); farther samples share the last bin. */
const RESIDUAL_MAX = 0.25
/**
 * L1 RGB difference (0..765) between a 2×2 block's mean color and its right or
 * lower neighbor block's up to which the block is smooth for `midToneArea`: the
 * analyzer's smooth-area step (`SMOOTH_MAX_GRAD`), taken on block means so
 * grain and JPEG noise average out while a stroke's rim still steps past it.
 */
const MID_TONE_MAX_GRAD = 12

/** The sample grid's colors and Oklab lightness histogram (`GROUND_BINS`). */
interface Samples {
  L: Float32Array
  a: Float32Array
  b: Float32Array
  rgb: Uint8Array
  lightHist: Uint32Array
  gw: number
  gh: number
}

/** The `GROUND_BINS` histogram bin of an Oklab lightness. */
function lightBin(L: number): number {
  return Math.min(GROUND_BINS - 1, Math.max(0, Math.floor(L * GROUND_BINS)))
}

type GroundMark = Pick<
  ImageAnalysis,
  | 'groundHex'
  | 'groundLightness'
  | 'groundChroma'
  | 'groundSpread'
  | 'groundShare'
  | 'markHex'
  | 'markLightness'
  | 'toneAxisResidual'
  | 'midToneShare'
  | 'midToneArea'
>

/**
 * The ground (paper) and mark (ink) of the samples, how far their colors stray
 * from the line between them, and how much of the image sits in smooth
 * mid-tone areas between them.
 */
function groundAndMark(samples: Samples): GroundMark {
  const { L: sL, a: sA, b: sB, rgb, lightHist: hist, gw, gh } = samples
  const n = gw * gh
  if (n === 0) {
    return {
      groundHex: '#ffffff',
      groundLightness: 1,
      groundChroma: 0,
      groundSpread: 0,
      groundShare: 0,
      markHex: '#ffffff',
      markLightness: 1,
      toneAxisResidual: 0,
      midToneShare: 0,
      midToneArea: 0,
    }
  }
  // The ground is the mode of the box-smoothed histogram; its spread the half
  // width at half maximum; its lightness the mean of the raw bins around it.
  const B = GROUND_BINS
  const sm = new Float64Array(B)
  for (let k = 0; k < B; k++) {
    let v = 0
    for (let d = -GROUND_SMOOTH; d <= GROUND_SMOOTH; d++) {
      const j = k + d
      if (j >= 0 && j < B) v += hist[j]
    }
    sm[k] = v
  }
  let mode = 0
  for (let k = 1; k < B; k++) if (sm[k] > sm[mode]) mode = k
  let lo = mode
  while (lo > 0 && sm[lo] > sm[mode] / 2) lo--
  let hi = mode
  while (hi < B - 1 && sm[hi] > sm[mode] / 2) hi++
  const spread = Math.max(1, mode - lo, hi - mode) / B
  let cw = 0
  let cs = 0
  for (let d = -GROUND_SMOOTH; d <= GROUND_SMOOTH; d++) {
    const j = mode + d
    if (j >= 0 && j < B) {
      cw += hist[j]
      cs += hist[j] * (j + 0.5)
    }
  }
  const groundL = cs / cw / B
  const inkBelow = groundL - Math.max(MARK_MIN_GAP, 4 * spread)

  let pr = 0
  let pg = 0
  let pb = 0
  let pL = 0
  let pa = 0
  let pbb = 0
  let pc = 0
  let pn = 0
  let inkN = 0
  for (let s = 0; s < n; s++) {
    const L = sL[s]
    if (Math.abs(L - groundL) <= spread) {
      pr += rgb[3 * s]
      pg += rgb[3 * s + 1]
      pb += rgb[3 * s + 2]
      pL += L
      pa += sA[s]
      pbb += sB[s]
      pc += Math.sqrt(sA[s] * sA[s] + sB[s] * sB[s])
      pn++
    }
    if (L < inkBelow) inkN++
  }
  pn = Math.max(1, pn)
  const ground = [pL / pn, pa / pn, pbb / pn]
  const groundHex = rgbToHex(Math.round(pr / pn), Math.round(pg / pn), Math.round(pb / pn))

  // The mark is the darkest third of the ink samples, found on the histogram:
  // every sample in a bin below the cut, and the cut bin's samples weighted to
  // make up the third.
  let markHex = groundHex
  let mark = ground
  if (inkN > 0) {
    const want = Math.ceil(inkN / 3)
    let cut = 0
    let below = 0
    while (below + hist[cut] < want) below += hist[cut++]
    const cutWeight = (want - below) / hist[cut]
    let ir = 0
    let ig = 0
    let ib = 0
    let iL = 0
    let ia = 0
    let ibb = 0
    for (let s = 0; s < n; s++) {
      const k = lightBin(sL[s])
      if (k > cut) continue
      const w = k < cut ? 1 : cutWeight
      ir += w * rgb[3 * s]
      ig += w * rgb[3 * s + 1]
      ib += w * rgb[3 * s + 2]
      iL += w * sL[s]
      ia += w * sA[s]
      ibb += w * sB[s]
    }
    markHex = rgbToHex(Math.round(ir / want), Math.round(ig / want), Math.round(ib / want))
    mark = [iL / want, ia / want, ibb / want]
  }

  // Tone-axis residual: the 90th percentile, off a histogram, of each sample's
  // chroma-plane distance from the ground–mark segment.
  const D = [mark[0] - ground[0], mark[1] - ground[1], mark[2] - ground[2]]
  const dd = D[0] * D[0] + D[1] * D[1] + D[2] * D[2] || 1
  const offHist = new Uint32Array(RESIDUAL_BINS)
  for (let s = 0; s < n; s++) {
    const v0 = sL[s] - ground[0]
    const v1 = sA[s] - ground[1]
    const v2 = sB[s] - ground[2]
    const t = clamp((v0 * D[0] + v1 * D[1] + v2 * D[2]) / dd, 0, 1)
    const e1 = v1 - t * D[1]
    const e2 = v2 - t * D[2]
    const off = Math.sqrt(e1 * e1 + e2 * e2)
    offHist[Math.min(RESIDUAL_BINS - 1, Math.floor((off / RESIDUAL_MAX) * RESIDUAL_BINS))]++
  }
  const rank = Math.floor(0.9 * (n - 1)) + 1
  let k90 = 0
  for (let acc = offHist[0]; acc < rank; acc += offHist[++k90]);

  return {
    groundHex,
    groundLightness: groundL,
    groundChroma: pc / pn,
    groundSpread: spread,
    groundShare: pn / n,
    markHex,
    markLightness: mark[0],
    toneAxisResidual: ((k90 + 0.5) * RESIDUAL_MAX) / RESIDUAL_BINS,
    ...midTones(samples, groundL, inkN > 0 ? mark[0] : groundL),
  }
}

/**
 * {@link ImageAnalysis.midToneShare}, the share of samples a quarter to three
 * quarters of the way from `groundL` down to `markL`, and
 * {@link ImageAnalysis.midToneArea}, the share of samples that are such
 * mid-tones with four mid-tone grid neighbors, in a 2×2 block smooth against
 * the next blocks.
 */
function midTones(
  samples: Samples,
  groundL: number,
  markL: number,
): Pick<ImageAnalysis, 'midToneShare' | 'midToneArea'> {
  const { L: sL, rgb, gw, gh } = samples
  if (markL >= groundL) return { midToneShare: 0, midToneArea: 0 }
  const midHi = groundL - 0.25 * (groundL - markL)
  const midLo = groundL - 0.75 * (groundL - markL)
  const mid = new Uint8Array(gw * gh)
  let midN = 0
  for (let s = 0; s < gw * gh; s++) {
    if (sL[s] >= midLo && sL[s] <= midHi) {
      mid[s] = 1
      midN++
    }
  }
  // Mean color of each 2×2 block (the last odd row or column is left out), then
  // whether it is within MID_TONE_MAX_GRAD of its right and lower blocks.
  const bw = gw >> 1
  const bh = gh >> 1
  const mean = new Float32Array(bw * bh * 3)
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const s = 2 * by * gw + 2 * bx
      const o = (by * bw + bx) * 3
      for (let c = 0; c < 3; c++) {
        mean[o + c] =
          (rgb[3 * s + c] +
            rgb[3 * (s + 1) + c] +
            rgb[3 * (s + gw) + c] +
            rgb[3 * (s + gw + 1) + c]) /
          4
      }
    }
  }
  const step = (o: number, q: number): number =>
    Math.abs(mean[o] - mean[q]) +
    Math.abs(mean[o + 1] - mean[q + 1]) +
    Math.abs(mean[o + 2] - mean[q + 2])
  let area = 0
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const o = (by * bw + bx) * 3
      if (bx + 1 < bw && step(o, o + 3) > MID_TONE_MAX_GRAD) continue
      if (by + 1 < bh && step(o, o + bw * 3) > MID_TONE_MAX_GRAD) continue
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const x = 2 * bx + dx
          const y = 2 * by + dy
          const s = y * gw + x
          if (
            mid[s] === 1 &&
            (x === 0 || mid[s - 1] === 1) &&
            (x + 1 === gw || mid[s + 1] === 1) &&
            (y === 0 || mid[s - gw] === 1) &&
            (y + 1 === gh || mid[s + gw] === 1)
          ) {
            area++
          }
        }
      }
    }
  }
  return { midToneShare: midN / (gw * gh), midToneArea: area / (gw * gh) }
}

/** The coarse bin (`COARSE_BINS`, 3 bits a channel) of a packed `0xrrggbb` color. */
function binOf(c: number): number {
  return ((c >> 21) << 6) | (((c >> 13) & 7) << 3) | ((c >> 5) & 7)
}

/** CIELAB of a packed `0xrrggbb` color. */
function labOf(c: number): [number, number, number] {
  return rgbToLab(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255)
}

/**
 * Exactly-flat samples of coarse bin `key` (`flat`: flat colors and their
 * counts) whose color lies more than the palette's same-ink distance
 * (`SAME_INK_DE00`, CIEDE2000) from the bin's commonest flat color: another ink
 * that shares the bin. 0 for an absent bin.
 */
function otherTonesIn(flat: ReadonlyMap<number, number>, key: number | undefined): number {
  if (key === undefined) return 0
  let mode = -1
  let modeCount = 0
  for (const [c, n] of flat) {
    if (binOf(c) === key && (n > modeCount || (n === modeCount && c < mode))) {
      mode = c
      modeCount = n
    }
  }
  if (mode < 0) return 0
  const m = labOf(mode)
  let other = 0
  for (const [c, n] of flat) {
    if (binOf(c) !== key || c === mode) continue
    const q = labOf(c)
    if (ciede2000(m[0], m[1], m[2], q[0], q[1], q[2]) > rasterInk.SAME_INK_DE00) other += n
  }
  return other
}

/** Side of the central crop the pixel grid is read on: pixel art is local, and a crop keeps it as it is. */
const PIXEL_GRID_CROP = 1024
/** Largest enlargement block recognized; longer runs with a common divisor are a coincidence of a few long edges. */
const PIXEL_SCALE_MAX = 8
/** Interior runs needed before their common divisor is read as an enlargement block. */
const PIXEL_SCALE_MIN_RUNS = 32
/** Most distinct grid colors a hard palette holds (an 8-bit palette); past it the grid is not measured. */
const GRID_COLORS_MAX = 256
/** Largest same-color region (grid samples) that counts as a pixel-art detail. */
const FINE_REGION_MAX = 16
/** Most rim pixels tested for a blend; a larger rim is tested at a stride. */
const BLEND_TESTS_MAX = 65536
/** Least RGB distance between the two neighbors an anti-aliased rim pixel blends. */
const BLEND_MIN_SPAN = 40
/** Most RGB distance of a blend from the line between its two neighbors. */
const BLEND_MAX_OFF = 12
/** Summed RGB difference under which a color change is a small step (`softStepShare`). */
const SOFT_STEP = 24

/**
 * A canvas drawn on the pixel grid: three or more colors (a two-color raster
 * is a scan or a threshold, traced smooth), up to `PIXEL_GRID_MAX_COLORS` (the
 * richest pixel art measured holds 130; a quantized image fills its 8-bit
 * palette, 246 and more), no anti-aliasing (see `isAntiAliased`), distinct
 * shades (at most `PIXEL_GRID_MAX_SOFT` of the color changes small steps:
 * pixel art reads up to 0.03, a dithered, grainy or smoothly shaded image 0.11
 * and more), and paint laid in regions of a few pixels — `PIXEL_GRID_MAX_REGION`
 * samples a region on average, or `PIXEL_GRID_MIN_FINE` of the grid in regions
 * of `FINE_REGION_MAX` samples or fewer. Measured on the web corpus: pixel art
 * reads a mean region of 2–49 or a fine share of 0.06–1; flat vector art
 * rendered without anti-aliasing a mean region of 100 and more and a fine
 * share under 0.03, except dense art (a coat of arms: 31, 0.07), which is then
 * traced as the pixels it is. Sprites scattered over a large plain background
 * read like flat art and keep their route.
 */
const PIXEL_GRID_MIN_COLORS = 3
const PIXEL_GRID_MAX_COLORS = 192
/**
 * Anti-aliasing reads two ways on the pixel grid. Either most of the palette is
 * rim colors and at least `AA_MIN_BLEND` of the rim pixels are blends
 * (anti-aliased art reads 0.65 and more, pixel art 0–0.42 with in-between
 * shades its artist placed), or the rims blend throughout — at least
 * `DITHER_MIN_BLEND` across `DITHER_MIN_RIM_COLORS` or more rim colors — as an
 * anti-aliased image does after its palette was cut and dithered (a GIF);
 * a pixel-art crop that cut a shade's flat corners away leaves one or two such
 * colors.
 */
const AA_MIN_BLEND = 0.4
const DITHER_MIN_BLEND = 0.6
const DITHER_MIN_RIM_COLORS = 8
const PIXEL_GRID_MAX_SOFT = 0.08
const PIXEL_GRID_MAX_REGION = 64
const PIXEL_GRID_MIN_FINE = 0.04
/**
 * Least share of the grid counted as rim when the blend share is taken: a few
 * rim pixels (a color cut off by the crop's edge) are no evidence of
 * anti-aliasing, which rims every edge.
 */
const RIM_MIN_SHARE = 0.005
/** `pixelArtScore` of a canvas drawn on the pixel grid. */
const PIXEL_GRID_SCORE = 0.85

type PixelGrid = Pick<
  ImageAnalysis,
  | 'pixelScale'
  | 'gridColors'
  | 'gridRimColors'
  | 'blendRimShare'
  | 'softStepShare'
  | 'fineRegionShare'
  | 'meanRegionArea'
>

function isAntiAliased(g: PixelGrid): boolean {
  return (
    (g.gridRimColors * 2 > g.gridColors && g.blendRimShare >= AA_MIN_BLEND) ||
    (g.gridRimColors >= DITHER_MIN_RIM_COLORS && g.blendRimShare >= DITHER_MIN_BLEND)
  )
}

function isPixelGrid(g: PixelGrid): boolean {
  return (
    g.gridColors >= PIXEL_GRID_MIN_COLORS &&
    g.gridColors <= PIXEL_GRID_MAX_COLORS &&
    !isAntiAliased(g) &&
    g.softStepShare <= PIXEL_GRID_MAX_SOFT &&
    (g.meanRegionArea <= PIXEL_GRID_MAX_REGION || g.fineRegionShare >= PIXEL_GRID_MIN_FINE)
  )
}

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b]
  return a
}

/**
 * The pixel grid of the central `PIXEL_GRID_CROP`² (over white): the
 * enlargement block, then on one sample per block the colors, how many rim
 * pixels are blends, and the sizes of the same-color regions.
 */
function pixelGridOf(image: RasterImage): PixelGrid {
  const { width, height, data } = image
  const cw = Math.min(width, PIXEL_GRID_CROP)
  const ch = Math.min(height, PIXEL_GRID_CROP)
  const x0 = Math.floor((width - cw) / 2)
  const y0 = Math.floor((height - ch) / 2)
  const key = new Int32Array(cw * ch)
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = ((y0 + y) * width + x0 + x) * 4
      const a = data[i + 3]
      key[y * cw + x] =
        (overWhite(data[i], a) << 16) | (overWhite(data[i + 1], a) << 8) | overWhite(data[i + 2], a)
    }
  }

  // The enlargement block: the common divisor of the interior runs (bounded by
  // a color change on both sides) along every row and column, and where the
  // first block starts.
  let block = 0
  let runs = 0
  let phaseX = 0
  let phaseY = 0
  for (let y = 0; y < ch && block !== 1; y++) {
    let start = -1
    for (let x = 1; x < cw; x++) {
      if (key[y * cw + x] === key[y * cw + x - 1]) continue
      if (start >= 0) {
        block = gcd(block, x - start)
        runs++
      } else if (block === 0) phaseX = x
      start = x
    }
  }
  for (let x = 0; x < cw && block !== 1; x++) {
    let start = -1
    for (let y = 1; y < ch; y++) {
      if (key[y * cw + x] === key[(y - 1) * cw + x]) continue
      if (start >= 0) {
        block = gcd(block, y - start)
        runs++
      } else if (block === 0) phaseY = y
      start = y
    }
  }
  const scale = block >= 2 && block <= PIXEL_SCALE_MAX && runs >= PIXEL_SCALE_MIN_RUNS ? block : 1
  const ox = scale > 1 ? phaseX % scale : 0
  const oy = scale > 1 ? phaseY % scale : 0
  const gw = Math.max(1, Math.floor((cw - ox) / scale))
  const gh = Math.max(1, Math.floor((ch - oy) / scale))
  const n = gw * gh

  // One sample per block, as an index into the grid's palette.
  const index = new Map<number, number>()
  const palette: number[] = []
  const g = new Uint16Array(n)
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const k = key[(oy + y * scale) * cw + ox + x * scale]
      let c = index.get(k)
      if (c === undefined) {
        if (palette.length === GRID_COLORS_MAX) {
          return {
            pixelScale: scale,
            gridColors: GRID_COLORS_MAX + 1,
            gridRimColors: GRID_COLORS_MAX + 1,
            blendRimShare: 1,
            softStepShare: 1,
            fineRegionShare: 0,
            meanRegionArea: n,
          }
        }
        c = palette.length
        index.set(k, c)
        palette.push(k)
      }
      g[y * gw + x] = c
    }
  }

  // Flat colors fill a corner somewhere: a sample and its right and lower
  // neighbors. A rim pixel on an edge (two of its eight neighbors differ
  // enough to be told apart) is a blend when its color lies between theirs; a
  // rim pixel without such neighbors is shading, not an edge, and not counted.
  const flat = new Uint8Array(palette.length)
  for (let y = 0; y + 1 < gh; y++) {
    for (let x = 0; x + 1 < gw; x++) {
      const s = y * gw + x
      if (g[s] === g[s + 1] && g[s] === g[s + gw]) flat[g[s]] = 1
    }
  }
  let rim = 0
  for (let s = 0; s < n; s++) if (flat[g[s]] === 0) rim++
  let rimColors = 0
  for (const f of flat) if (f === 0) rimColors++
  const stride = Math.max(1, Math.ceil(rim / BLEND_TESTS_MAX))
  let tested = 0
  let blends = 0
  let seenRim = 0
  const nb: number[] = []
  for (let s = 0; s < n; s++) {
    if (flat[g[s]] === 1 || seenRim++ % stride !== 0) continue
    const x = s % gw
    const y = (s - x) / gw
    nb.length = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx
        const yy = y + dy
        if ((dx !== 0 || dy !== 0) && xx >= 0 && yy >= 0 && xx < gw && yy < gh) {
          const q = g[yy * gw + xx]
          if (q !== g[s] && !nb.includes(q)) nb.push(q)
        }
      }
    }
    const verdict = blendOf(palette[g[s]], nb, palette)
    if (verdict === undefined) continue
    tested++
    if (verdict) blends++
  }

  // Color changes between neighbors, and how many are small steps.
  let steps = 0
  let soft = 0
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const s = y * gw + x
      const c = palette[g[s]]
      if (x + 1 < gw && g[s + 1] !== g[s]) {
        steps++
        if (rgbStep(c, palette[g[s + 1]]) < SOFT_STEP) soft++
      }
      if (y + 1 < gh && g[s + gw] !== g[s]) {
        steps++
        if (rgbStep(c, palette[g[s + gw]]) < SOFT_STEP) soft++
      }
    }
  }

  // Same-color regions, 4-connected.
  const seen = new Uint8Array(n)
  const stack = new Int32Array(n)
  let regions = 0
  let fine = 0
  for (let s0 = 0; s0 < n; s0++) {
    if (seen[s0] === 1) continue
    regions++
    const c = g[s0]
    let size = 0
    let sp = 0
    stack[sp++] = s0
    seen[s0] = 1
    while (sp > 0) {
      const s = stack[--sp]
      size++
      const x = s % gw
      if (x > 0) sp = visit(s - 1, c, g, seen, stack, sp)
      if (x + 1 < gw) sp = visit(s + 1, c, g, seen, stack, sp)
      if (s >= gw) sp = visit(s - gw, c, g, seen, stack, sp)
      if (s + gw < n) sp = visit(s + gw, c, g, seen, stack, sp)
    }
    if (size <= FINE_REGION_MAX) fine += size
  }

  return {
    pixelScale: scale,
    gridColors: palette.length,
    gridRimColors: rimColors,
    blendRimShare: tested === 0 ? 0 : blends / Math.max(tested, RIM_MIN_SHARE * n),
    softStepShare: steps === 0 ? 0 : soft / steps,
    fineRegionShare: fine / n,
    meanRegionArea: n / regions,
  }
}

/** Push sample `q` onto the flood `stack` when it is unseen and of color `c`; returns the new stack size. */
function visit(
  q: number,
  c: number,
  g: Uint16Array,
  seen: Uint8Array,
  stack: Int32Array,
  sp: number,
): number {
  if (seen[q] === 1 || g[q] !== c) return sp
  seen[q] = 1
  stack[sp] = q
  return sp + 1
}

/** Summed absolute RGB difference of two packed colors. */
function rgbStep(a: number, b: number): number {
  return (
    Math.abs((a >> 16) - (b >> 16)) +
    Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) +
    Math.abs((a & 255) - (b & 255))
  )
}

/**
 * Whether packed color `c` lies between two of the `nb` palette colors
 * (anti-aliasing); undefined when no two of them differ by `BLEND_MIN_SPAN`
 * (the pixel is not on an edge).
 */
function blendOf(
  c: number,
  nb: readonly number[],
  palette: readonly number[],
): boolean | undefined {
  const cr = c >> 16
  const cg = (c >> 8) & 255
  const cb = c & 255
  let edge = false
  for (let i = 0; i < nb.length; i++) {
    const a = palette[nb[i]]
    const ar = a >> 16
    const ag = (a >> 8) & 255
    const ab = a & 255
    for (let j = i + 1; j < nb.length; j++) {
      const b = palette[nb[j]]
      const dr = (b >> 16) - ar
      const dg = ((b >> 8) & 255) - ag
      const db = (b & 255) - ab
      const dd = dr * dr + dg * dg + db * db
      if (dd < BLEND_MIN_SPAN * BLEND_MIN_SPAN) continue
      edge = true
      const t = ((cr - ar) * dr + (cg - ag) * dg + (cb - ab) * db) / dd
      if (t < 0.08 || t > 0.92) continue
      const er = cr - ar - t * dr
      const eg = cg - ag - t * dg
      const eb = cb - ab - t * db
      if (er * er + eg * eg + eb * eb <= BLEND_MAX_OFF * BLEND_MAX_OFF) return true
    }
  }
  return edge ? false : undefined
}

/** Side of the central crop the edge width is measured on: edges are local, and a crop keeps them as they are. */
const EDGE_WIDTH_CROP = 1024

/**
 * The box-filter-equivalent width of the image's edges (the intake's ramp
 * evidence, `rampEvidence`), measured on the central `EDGE_WIDTH_CROP`² of a
 * larger image — a crop, not a reduction, which would sharpen every edge.
 */
function edgeWidthOf(image: RasterImage): number {
  const { width, height, data } = image
  const cw = Math.min(width, EDGE_WIDTH_CROP)
  const ch = Math.min(height, EDGE_WIDTH_CROP)
  let crop = image
  if (cw < width || ch < height) {
    const x0 = Math.floor((width - cw) / 2)
    const y0 = Math.floor((height - ch) / 2)
    const out = new Uint8ClampedArray(cw * ch * 4)
    for (let y = 0; y < ch; y++) {
      const from = ((y0 + y) * width + x0) * 4
      out.set(data.subarray(from, from + cw * 4), y * cw * 4)
    }
    crop = { width: cw, height: ch, data: out }
  }
  return rasterInk.rampEvidence(rasterInk.intakePixels(crop).rgb, cw, ch).width
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
