import { clamp, clampInt } from './utils'

export type VectorizeMode = 'color' | 'grayscale' | 'bw' | 'centerline'

/**
 * How color layers relate to each other:
 * - `stacked`: layers are painted back-to-front and lower layers extend under
 *   upper ones. Forgiving (no seams by construction), slight overdraw.
 * - `cutout`: an exact partition of the plane. Regions are assembled from a
 *   shared boundary graph so adjacent shapes reuse mathematically identical
 *   edges — no hairline gaps, no overlaps. Best for cutting machines and
 *   editing in vector tools.
 */
export type LayeringMode = 'stacked' | 'cutout'

/**
 * - `spline`: full curve chain (optimal polygon → corner analysis → cubic
 *   Béziers). The high-quality default.
 * - `polygon`: straight segments only (optimal polygon, no curve fitting).
 * - `pixel`: exact pixel boundaries, axis-aligned. For pixel art.
 */
export type CurveMode = 'spline' | 'polygon' | 'pixel'

/**
 * Color segmentation front-end:
 * - `kmeans`: global Oklab k-means — each pixel independently takes the nearest
 *   palette color. Fast and edge-accurate; can invent a wrong-colored sliver at
 *   an anti-aliased seam (which `colorCoherence` cleans in place). The default.
 * - `regions`: SLIC superpixels each vote a single palette label, collapsing the
 *   image into large flat shapes — far fewer nodes and a much smaller file, at
 *   the cost of blockier edges. A stylizing/simplifying knob, not a fidelity one:
 *   it holds invented hues about as low as `kmeans`+`colorCoherence`, no lower.
 */
export type ColorSegmentation = 'kmeans' | 'regions'

/** Ambiguity resolution when tracing meets a checkerboard junction. */
export type TurnPolicy = 'minority' | 'majority' | 'black' | 'white' | 'left' | 'right'

export type ThresholdMode = 'auto' | 'fixed' | 'adaptive'

/**
 * - `auto`: transparent pixels are excluded if the image has meaningful alpha,
 *   otherwise the image is treated as fully opaque.
 * - `transparent`: pixels with alpha below `alphaThreshold` produce no shapes.
 * - `custom`: composite the image over `backgroundColor` first.
 */
export type BackgroundMode = 'auto' | 'transparent' | 'custom'

export type DenoiseMode = 'none' | 'median' | 'bilateral'

export interface VectorizeSettings {
  mode: VectorizeMode

  // ---- Preprocessing ----
  /** Longest side is downscaled to this many pixels before tracing. 0 keeps the original size. */
  maxDimension: number
  denoise: DenoiseMode
  /** Gaussian pre-blur radius in px (0 disables). Helps noisy photos, hurts crisp art. */
  blurRadius: number
  background: BackgroundMode
  /** Used when `background` is `custom`. */
  backgroundColor: string
  /** Alpha below this (0-255) counts as empty under `transparent` handling. */
  alphaThreshold: number

  // ---- Palette (color / grayscale modes) ----
  /** Number of output colors (2-64). */
  paletteSize: number
  /** Let the engine lower `paletteSize` when the image needs fewer colors. */
  autoPaletteSize: boolean
  /** Clustering space. Oklab is perceptual and almost always better. */
  colorSpace: 'oklab' | 'rgb'
  /** 1-10; scales k-means sample count and iterations. */
  quantizeQuality: number
  /**
   * Color segmentation front-end. `kmeans` labels each pixel independently
   * (edge-accurate, the fidelity default). `regions` votes one palette label per
   * SLIC superpixel, coarsening into large flat shapes — much smaller files,
   * blockier edges; for stylized/low-detail output.
   */
  segmentation: ColorSegmentation
  /**
   * Fixed output palette ('#rrggbb' entries). When non-null, quantization maps
   * every pixel to the nearest of exactly these colors and `paletteSize` /
   * `autoPaletteSize` / `quantizeQuality` are ignored.
   */
  palette: string[] | null
  layering: LayeringMode
  /** Regions smaller than this many pixels are merged into their surroundings. */
  minRegionArea: number
  /**
   * Keep small regions that are high-contrast against their surroundings (e.g. a
   * logo dot) instead of merging them away; low-contrast specks still go.
   */
  preserveDetails: boolean
  /**
   * Rounds of thin mislabeled-band cleanup (color/grayscale): dissolve a hairline
   * strip of a wrong color between two regions — an anti-aliased/JPEG rim quantized
   * to a third color — into the region it borders. 0 disables (byte-identical).
   */
  dissolveBands: number
  /**
   * Spatial color coherence (0-1, color/grayscale): re-assign each pixel by
   * balancing palette-color distance against agreement with its neighbors, so a
   * rim mixture joins a real neighboring region instead of inventing a
   * wrong-colored band. 0 disables (byte-identical).
   */
  colorCoherence: number
  /** Hairline-seam compensation stroke width (px) for cutout rendering; 0 disables. */
  gapFill: number
  /** Drop the layer matching the detected background color (stickers, cut files). */
  omitBackground: boolean

  // ---- Binarization (bw / centerline modes) ----
  /** 0-255, used when `thresholdMode` is `fixed`. */
  threshold: number
  thresholdMode: ThresholdMode
  /** Window radius in px for adaptive thresholding. */
  adaptiveRadius: number
  /** Bias added to the adaptive local mean, in levels (-64..64). */
  adaptiveBias: number
  invert: boolean

  // ---- Curves ----
  curveMode: CurveMode
  turnPolicy: TurnPolicy
  /**
   * 0-1. Maps to the corner/smoothness tradeoff of the curve chain (potrace's
   * alphamax): 0 keeps every polygon corner, 1 smooths aggressively.
   */
  smoothing: number
  /** Merge adjacent curve segments when a single curve stays within `optTolerance`. */
  curveOptimize: boolean
  /** Max deviation (px) allowed when merging curves. */
  optTolerance: number
  /**
   * Interior angle (deg) below which a vertex is pinned as a corner — applied to
   * open centerline paths and to closed filled/region rings alike. Above it,
   * pixel-scale jags stay smooth and the curve-chain α metric governs.
   */
  cornerThreshold: number
  /** Max fitting error (px) for open-path (centerline) Bézier fitting. */
  fitTolerance: number
  /** Pre-fit polyline simplification epsilon (px) for open paths / polygon mode. */
  simplifyTolerance: number

  // ---- Centerline mode ----
  /** Output stroke width in px; 0 = estimate from the ink width. */
  strokeWidth: number
  /** Skeleton branches shorter than this (px) are pruned as noise. */
  pruneLength: number

  // ---- Output ----
  /** Paint color for bw and centerline modes. */
  fillColor: string
  /** Decimal places for SVG coordinates. */
  precision: number
  /** Compact path data with relative + H/V commands (identical geometry, smaller file). */
  optimizeSvg: boolean
  /**
   * Group output shapes into one `<g>` layer per color (color / grayscale modes),
   * in first-appearance order. Cut and print software then reads each color as a
   * single selectable layer — one vinyl sheet or one screen per color.
   */
  groupByColor: boolean
  unit: 'px' | 'mm'
  /** Physical width when `unit` is `mm`; 0 derives it from 96 dpi. */
  widthMm: number
  svgTitle: string
  /** Warn about enclosed islands that would fall out of a physical stencil. */
  detectIslands: boolean
}

export const DEFAULT_SETTINGS: Readonly<VectorizeSettings> = Object.freeze({
  mode: 'color',

  maxDimension: 1600,
  denoise: 'none',
  blurRadius: 0,
  background: 'auto',
  backgroundColor: '#ffffff',
  alphaThreshold: 8,

  paletteSize: 16,
  autoPaletteSize: false,
  colorSpace: 'oklab',
  quantizeQuality: 5,
  segmentation: 'kmeans',
  palette: null,
  layering: 'stacked',
  minRegionArea: 6,
  preserveDetails: false,
  dissolveBands: 0,
  colorCoherence: 0,
  gapFill: 0,
  omitBackground: false,

  threshold: 128,
  thresholdMode: 'auto',
  adaptiveRadius: 16,
  adaptiveBias: 4,
  invert: false,

  curveMode: 'spline',
  turnPolicy: 'minority',
  smoothing: 0.75,
  curveOptimize: true,
  optTolerance: 0.2,
  cornerThreshold: 100,
  fitTolerance: 1.2,
  simplifyTolerance: 0.5,

  strokeWidth: 0,
  pruneLength: 8,

  fillColor: '#000000',
  precision: 2,
  optimizeSvg: true,
  groupByColor: false,
  unit: 'px',
  widthMm: 0,
  svgTitle: '',
  detectIslands: false,
} satisfies VectorizeSettings)

/**
 * Merge a partial settings patch over the defaults (or a given base) and clamp
 * every numeric field to its valid range.
 */
export function normalizeSettings(
  patch: Partial<VectorizeSettings> = {},
  base: VectorizeSettings = DEFAULT_SETTINGS as VectorizeSettings,
): VectorizeSettings {
  const s: VectorizeSettings = { ...base, ...patch }
  s.maxDimension = s.maxDimension === 0 ? 0 : clampInt(s.maxDimension, 64, 8192)
  s.blurRadius = clamp(s.blurRadius, 0, 10)
  s.alphaThreshold = clampInt(s.alphaThreshold, 0, 255)
  s.paletteSize = clampInt(s.paletteSize, 2, 64)
  s.quantizeQuality = clampInt(s.quantizeQuality, 1, 10)
  if (s.segmentation !== 'regions') s.segmentation = 'kmeans'
  if (s.palette !== null) {
    const seen = new Set<string>()
    const valid: string[] = []
    for (const entry of s.palette) {
      if (/^#[0-9a-f]{6}$/i.test(entry)) {
        const hex = entry.toLowerCase()
        if (!seen.has(hex)) {
          seen.add(hex)
          valid.push(hex)
        }
      }
      if (valid.length >= 64) break
    }
    s.palette = valid.length > 0 ? valid : null
  }
  s.minRegionArea = clampInt(s.minRegionArea, 0, 4096)
  s.dissolveBands = clampInt(s.dissolveBands, 0, 4)
  s.colorCoherence = clamp(s.colorCoherence, 0, 1)
  s.gapFill = clamp(s.gapFill, 0, 2)
  s.threshold = clampInt(s.threshold, 0, 255)
  s.adaptiveRadius = clampInt(s.adaptiveRadius, 2, 128)
  s.adaptiveBias = clamp(s.adaptiveBias, -64, 64)
  s.smoothing = clamp(s.smoothing, 0, 1)
  s.optTolerance = clamp(s.optTolerance, 0, 5)
  s.cornerThreshold = clamp(s.cornerThreshold, 0, 180)
  s.fitTolerance = clamp(s.fitTolerance, 0.1, 10)
  s.simplifyTolerance = clamp(s.simplifyTolerance, 0, 10)
  s.strokeWidth = clamp(s.strokeWidth, 0, 64)
  s.pruneLength = clamp(s.pruneLength, 0, 256)
  s.precision = clampInt(s.precision, 0, 4)
  s.widthMm = clamp(s.widthMm, 0, 10000)
  return s
}
