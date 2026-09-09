import { clamp, clampInt } from './utils'

export type VectorizeMode = 'color' | 'grayscale' | 'bw' | 'centerline'

/**
 * How color layers relate to each other — two families crossed by the shared
 * `gapFill` overlap. `knockout`/`trap` keep every color flat on the substrate
 * (the vinyl "knockout" build — thinnest, each sheet bonds directly); `tuck`/
 * `solid-base` physically stack in paint order.
 * - `knockout`: exact partition, colors butt on a shared edge. No overlap, no
 *   stacking — one sheet thick everywhere. Registration-critical (a shift shows
 *   substrate). The seam-free boundary graph, `gapFill` forced to 0.
 * - `trap`: `knockout` plus a `gapFill` overlap along every seam, so a slight
 *   misregistration never opens a gap. Flat, with a hairline two-ply ribbon only
 *   at the seams. The recommended layered-vinyl default.
 * - `tuck`: stacked in paint order, but each lower color reaches under its
 *   neighbours by only `gapFill` (a bounded underlap), so bulk caps at two
 *   sheets at any seam. Dimensional; paint order matters.
 * - `solid-base`: the base color floods to a solid full-silhouette backing sheet
 *   (a cartoon's black base), and each color above extends under only the regions
 *   nested inside it — two colors that merely sit side by side butt at their seam,
 *   backed by the base, instead of one sheeting under the other. A deliberate full
 *   backing sheet with the least redundant stacking.
 */
export type LayeringMode = 'knockout' | 'trap' | 'tuck' | 'solid-base'

/**
 * Which color is pinned to the bottom as the base sheet (layered families only —
 * `tuck`/`solid-base`; a `knockout`/`trap` partition has no base):
 * - `most-connective`: the color with the largest total region perimeter — the
 *   outline/backdrop threading between the others (the standard cartoon build).
 * - `largest`: the color covering the most pixels.
 * - `darkest`: the darkest palette color (a guaranteed black cartoon base).
 * - `manual`: the palette color nearest `baseColorValue`.
 */
export type BaseColorMode = 'most-connective' | 'largest' | 'darkest' | 'manual'

/**
 * - `spline`: full curve chain (optimal polygon → corner analysis → cubic
 *   Béziers). The high-quality default.
 * - `polygon`: straight segments only (optimal polygon, no curve fitting).
 * - `pixel`: exact pixel boundaries, axis-aligned. For pixel art.
 */
export type CurveMode = 'spline' | 'polygon' | 'pixel'

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

/**
 * How color/grayscale modes turn pixels into flat regions:
 * - `quantize`: global k-means palette, then spatial cleanup. General-purpose;
 *   best when the image has real tonal variation (photos, gradients).
 * - `regions`: marker-controlled region growing (watershed). No global palette,
 *   so an anti-aliased edge is split between its two neighbors instead of
 *   inventing a third rim color — the faithful choice for flat art (logos,
 *   cartoons, line art) with crisp anti-aliased boundaries.
 */
export type SegmentationMode = 'quantize' | 'regions'

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
  /**
   * How pixels become flat regions in color/grayscale modes. `quantize` is the
   * global-palette default; `regions` grows regions from flat interiors so
   * anti-aliased edges never invent a rim color (best for flat art / line art).
   */
  segmentation: SegmentationMode
  /** Number of output colors (2-64). With `regions`, an upper budget rather than an exact count. */
  paletteSize: number
  /** Let the engine lower `paletteSize` when the image needs fewer colors. */
  autoPaletteSize: boolean
  /** Clustering space. Oklab is perceptual and almost always better. */
  colorSpace: 'oklab' | 'rgb'
  /** 1-10; scales k-means sample count and iterations. */
  quantizeQuality: number
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
  /**
   * Seam overlap (registration slack), shared by the overlapping layering modes.
   * With `trap` each region is spread outward along its shared seams by this much
   * — emitted as a same-color stroke — so neighbouring colors keep butting even
   * when screens/vinyl sheets misregister on press, instead of revealing a
   * hairline of substrate. With `tuck` it is the width each lower color reaches
   * under the sheets above it. The width is in the document `unit`: millimetres
   * when `unit` is `'mm'` (print/cut profiles), pixels otherwise. An mm overlap is
   * physical — it converts to the right stroke/underlap at any trace resolution. 0
   * disables (byte-identical). Ignored by `knockout` (a pure butt joint) and
   * `solid-base` (a full underlay).
   */
  gapFill: number
  /**
   * Which color is the base sheet in the layered families (`tuck`/`solid-base`).
   * Ignored by the `knockout`/`trap` partition, which has no base.
   */
  baseColor: BaseColorMode
  /** Target color ('#rrggbb') for `baseColor: 'manual'` — the nearest palette entry becomes the base. */
  baseColorValue: string
  /**
   * Warn when the layered families stack more than this many sheets at any point
   * (a physical thickness limit — smooth HTV layers ~4 deep before it stiffens).
   * 0 disables the check. Only meaningful for `tuck`/`solid-base` in `mm` output.
   */
  maxLayers: number
  /** Drop the layer matching the detected background color (stickers, cut files). */
  omitBackground: boolean
  /**
   * Detect smooth color ramps (color/grayscale modes) and paint them with a
   * single SVG gradient instead of posterized bands: adjacent quantized slices
   * that form one ramp — or a single slice whose own pixels ramp — are merged
   * into one region filled with a `<linearGradient>` (straight ramps) or
   * `<radialGradient>` (concentric ramps — vignettes, spotlights). Every ramp
   * is verified on its pixels and must beat the flat bands it replaces, so an
   * already posterized source stays posterized. A fade of a transparent source
   * keeps its transparency (stops with `stop-opacity`), and a semi-transparent
   * layer over a ramp — a glow, a vignette, a shadow on a sky — is painted as an
   * opacity gradient composited over the ramp beneath it. Geometry is unchanged
   * (mesh-free), so cutout stays seam-free. Ignored with a fixed `palette` and
   * for single-ink (bw/centerline) modes. Off is byte-identical to the classic
   * flat-fill path. Off by default and enabled by no profile.
   */
  gradients: boolean
  /**
   * How eagerly regions merge into gradients (0-1; only when `gradients`). Low
   * keeps only clean, high-contrast ramps — flat objects and subtle areas stay
   * flat, so fewer regions become gradients; high accepts looser, lower-contrast
   * ramps, so more do. Balances the fit tolerance against the minimum color
   * difference a region must span to qualify. 0.5 is the neutral default.
   */
  gradientStrength: number
  /**
   * Minimum region area (px) to become a gradient (only when `gradients`). 0
   * uses an automatic floor derived from `minRegionArea`; raise it to keep small
   * regions flat and limit gradients to large smooth areas.
   */
  gradientMinArea: number
  /**
   * Long side (px) gradient detection runs at on a larger image (only when
   * `gradients`); the detected ramps are carried back to the full-resolution
   * regions. Detection cost scales with the pixel count, so a smaller value is
   * far faster and finds fewer subtle ramps; a larger value is slower and more
   * thorough. 0 detects at full resolution (slowest). The traced geometry is
   * always full-resolution.
   */
  gradientMaxDimension: number

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
  /** Decimal places for SVG coordinates: 1 in px units; the mm-unit profiles set 3. */
  precision: number
  /** Compact path data with relative + H/V commands (identical geometry, smaller file). */
  optimizeSvg: boolean
  /**
   * Group output shapes into `<g>` cut layers (color / grayscale modes) so cut
   * and print software reads each as a single selectable layer. Cutout groups
   * one layer per color (first-appearance order). Stacked groups one layer per
   * paint level, because a color can recur at two heights — a base outline and a
   * pupil island lifted on top — which must stay separate, correctly-ordered
   * layers rather than one merged color.
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

  segmentation: 'quantize',
  paletteSize: 16,
  autoPaletteSize: false,
  colorSpace: 'oklab',
  quantizeQuality: 5,
  palette: null,
  layering: 'solid-base',
  minRegionArea: 6,
  preserveDetails: false,
  dissolveBands: 0,
  colorCoherence: 0,
  gapFill: 0,
  baseColor: 'most-connective',
  baseColorValue: '#000000',
  maxLayers: 4,
  omitBackground: false,
  gradients: false,
  gradientStrength: 0.5,
  gradientMinArea: 0,
  gradientMaxDimension: 384,

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
  precision: 1,
  optimizeSvg: true,
  groupByColor: false,
  unit: 'px',
  widthMm: 0,
  svgTitle: '',
  detectIslands: false,
} satisfies VectorizeSettings)

const LAYERING_MODES = new Set<LayeringMode>(['knockout', 'trap', 'tuck', 'solid-base'])
const BASE_COLOR_MODES = new Set<BaseColorMode>(['most-connective', 'largest', 'darkest', 'manual'])

/**
 * Merge a partial settings patch over the defaults (or a given base) and clamp
 * every numeric field to its valid range.
 */
export function normalizeSettings(
  patch: Partial<VectorizeSettings> = {},
  base: VectorizeSettings = DEFAULT_SETTINGS as VectorizeSettings,
): VectorizeSettings {
  const s: VectorizeSettings = { ...base, ...patch }
  // Back-compat: the old two-value layering (`stacked`/`cutout`) maps onto the
  // new families, so persisted settings and external callers keep working —
  // `cutout` with an overlap was already a trap, so it becomes `trap`.
  const rawLayering = s.layering as string
  if (rawLayering === 'stacked') s.layering = 'solid-base'
  else if (rawLayering === 'cutout') s.layering = s.gapFill > 0 ? 'trap' : 'knockout'
  else if (!LAYERING_MODES.has(s.layering)) s.layering = 'solid-base'
  if (!BASE_COLOR_MODES.has(s.baseColor)) s.baseColor = 'most-connective'
  s.baseColorValue = /^#[0-9a-f]{6}$/i.test(s.baseColorValue)
    ? s.baseColorValue.toLowerCase()
    : '#000000'
  s.maxLayers = clampInt(s.maxLayers, 0, 32)
  s.maxDimension = s.maxDimension === 0 ? 0 : clampInt(s.maxDimension, 64, 8192)
  s.blurRadius = clamp(s.blurRadius, 0, 10)
  s.alphaThreshold = clampInt(s.alphaThreshold, 0, 255)
  s.paletteSize = clampInt(s.paletteSize, 2, 64)
  s.quantizeQuality = clampInt(s.quantizeQuality, 1, 10)
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
  s.segmentation = s.segmentation === 'regions' ? 'regions' : 'quantize'
  s.minRegionArea = clampInt(s.minRegionArea, 0, 4096)
  s.dissolveBands = clampInt(s.dissolveBands, 0, 4)
  s.colorCoherence = clamp(s.colorCoherence, 0, 1)
  s.gradientStrength = clamp(s.gradientStrength, 0, 1)
  s.gradientMinArea = clampInt(s.gradientMinArea, 0, 1_000_000)
  s.gradientMaxDimension =
    s.gradientMaxDimension === 0 ? 0 : clampInt(s.gradientMaxDimension, 128, 4096)
  s.gapFill = clamp(s.gapFill, 0, 5)
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
