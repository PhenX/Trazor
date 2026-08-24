import type { ProfileId, VectorizeSettings } from '@trazor/core'
import { clamp, clampInt, getProfile } from '@trazor/core'
import type { ImageAnalysis } from './analyze'

/**
 * A machine-readable reason for a recommendation: a stable `code` plus any
 * numeric values it interpolates. Lets a UI localize the rationale (the app
 * translates `code` + `params`) while `Recommendation.rationale` keeps the
 * English sentences for non-UI callers and tests.
 */
export interface RationaleKey {
  code: string
  params?: Record<string, number>
}

export interface Recommendation {
  profileId: ProfileId
  patch: Partial<VectorizeSettings>
  rationale: string[]
  rationaleKeys: RationaleKey[]
}

/** Collects rationale in both forms so they never drift apart. */
class Rationale {
  readonly text: string[] = []
  readonly keys: RationaleKey[] = []
  add(code: string, english: string, params?: Record<string, number>): void {
    this.text.push(english)
    this.keys.push(params ? { code, params } : { code })
  }
}

/** Mean Oklab chroma below this reads as effectively grayscale. */
const ACHROMATIC_CHROMA = 0.03

/**
 * A pixel gradient of exactly 0 covering at least this fraction of the image
 * marks clean flat art (illustration, logo, cartoon). Anti-aliasing invents
 * thousands of rim colors and a high `photoScore`, but its soft ramps sit only
 * along edges — the large interiors stay perfectly flat. Photographs and
 * compressed/rescaled graphics carry noise everywhere and never reach this.
 */
const FLAT_ART_MIN_DENSITY = 0.15

/** With at least this fraction of genuinely colored pixels, an image is not grayscale. */
const COLORED_FRACTION_MIN = 0.05

/** Sub-this-size rim specks are merged away when cleaning anti-aliased flat art. */
const FLAT_ART_MIN_REGION = 16

/**
 * Clean flat art (vector illustration, logo, cartoon) rather than a photograph
 * or a degraded graphic. Anti-aliased edges make such art score as photographic
 * (many colors, dense micro-gradients), so `photoScore` alone misroutes it; the
 * flat interiors it keeps — which photos and compression noise destroy — are the
 * reliable tell. Kept in color and traced faithfully, not denoised or posterized.
 */
function isCleanFlatArt(a: ImageAnalysis): boolean {
  return a.flatDensity >= FLAT_ART_MIN_DENSITY
}

/**
 * Effectively grayscale: not only is mean chroma low, but almost no pixel is
 * genuinely colored. The `coloredFraction` guard keeps a vivid subject on a
 * large neutral (black/white) backdrop — whose mean chroma the backdrop drags
 * below `ACHROMATIC_CHROMA` — from being flattened to gray.
 */
function isAchromatic(a: ImageAnalysis): boolean {
  return a.colorfulness < ACHROMATIC_CHROMA && a.coloredFraction < COLORED_FRACTION_MIN
}

/**
 * Photographic-looking texture (noise, blocking, ringing) sitting on top of a
 * few dominant flat colors — a compressed or rescaled flat graphic (a JPEG
 * logo, a screenshot) rather than a true photograph, whose colors spread out
 * so no two dominate. These want strong cleanup, not photo posterization. Clean
 * flat art is excluded: its crisp anti-aliased edges are not compression damage.
 */
function isCompressedFlat(a: ImageAnalysis): boolean {
  return (
    a.photoScore > 0.6 &&
    a.twoToneCoverage > 0.55 &&
    a.colorfulness >= ACHROMATIC_CHROMA &&
    !isCleanFlatArt(a)
  )
}

/**
 * Rule-based settings recommendation from measured image statistics. Fully
 * local and instant — no models involved. When `goal` names a profile, the
 * profile is kept and only data-driven fields are tuned.
 */
export function recommendSettings(
  a: ImageAnalysis,
  goal: ProfileId | 'auto' = 'auto',
): Recommendation {
  const r = new Rationale()

  const profileId = goal === 'auto' ? pickProfile(a, r) : goal
  const patch: Partial<VectorizeSettings> = { ...getProfile(profileId).patch }

  if (a.hasAlpha) {
    patch.background = 'transparent'
    r.add('alpha', 'Transparent pixels found — they will produce no shapes.')
  }

  if (profileId === 'pixel-art') {
    patch.paletteSize = clampInt(Math.max(2, a.distinctColors), 2, 64)
    r.add('pixelExact', `Kept the ${a.distinctColors} original colors exactly.`, {
      count: a.distinctColors,
    })
    return { profileId, patch, rationale: r.text, rationaleKeys: r.keys }
  }

  // A near-grayscale photo traces as tonal gray layers, not a color palette. A
  // colored subject on a neutral backdrop (low mean chroma but real colored
  // pixels) stays in color — `isAchromatic` accounts for the backdrop.
  if (profileId === 'photo' && isAchromatic(a)) {
    patch.mode = 'grayscale'
    r.add('grayscale', 'Nearly grayscale — tracing as tonal grayscale layers.')
  }

  const flatArt = isCleanFlatArt(a)
  // Respect an explicit photo goal; otherwise treat compressed-flat art specially.
  const compressedFlat = profileId !== 'photo' && isCompressedFlat(a)

  if (patch.mode === 'color' || patch.mode === 'grayscale' || patch.mode === undefined) {
    // Rich color content keeps at least the profile's palette budget, with autoK
    // (autoPaletteSize) trimming the surplus. Too few colors forces distinct
    // regions — a subject and a similar-colored background, say — to share one
    // centroid, which paints a blended color across both (the classic "the dog
    // went green against the grass", and the invented seam bands between shapes).
    // autoK still collapses genuine near-duplicate centroids, so already-clean art
    // keeps a small palette and file; simple low-color images are untouched.
    const suggested = suggestPaletteSize(a)
    const rich = a.distinctColors > 32
    const chosen = rich
      ? Math.max(getProfile(profileId).patch.paletteSize ?? suggested, suggested)
      : suggested
    patch.paletteSize = chosen
    if (rich) patch.autoPaletteSize = true
    if (a.distinctColors >= 65536) {
      r.add('richColor', `Rich color content — up to ${chosen} palette entries.`, { count: chosen })
    } else {
      r.add(
        'distinctColors',
        `≈${a.distinctColors} distinct colors measured — ${chosen} palette entries cover it.`,
        { count: a.distinctColors, size: chosen },
      )
    }
    // Clean flat art is exempt from photo denoise (its edges are crisp, not
    // noisy) — bilateral blur would only soften the linework.
    if (a.photoScore > 0.55 && patch.denoise === undefined && !compressedFlat && !flatArt) {
      patch.denoise = 'bilateral'
      r.add('photoTexture', 'Photographic texture detected — bilateral denoise keeps edges clean.')
    }
    // Anti-aliased flat art: global k-means maps the soft rim between two flat
    // colors to a nearest *third* palette color, drawing hairline slivers along
    // every edge. Region growing instead grows each region from its flat
    // interior, so a soft edge is split between its two real neighbors and no
    // third rim color can form — the faithful, seam-free choice. Small regions
    // below `FLAT_ART_MIN_REGION` still fold into their surroundings.
    if (flatArt) {
      patch.segmentation = 'regions'
      patch.minRegionArea = Math.max(patch.minRegionArea ?? 0, FLAT_ART_MIN_REGION)
      r.add(
        'flatArtRegions',
        'Crisp flat art — growing regions from the flat interiors (no global palette) so anti-aliased edges stay clean.',
      )
    }
  }

  // Recover clean shapes from a degraded flat graphic: smooth the block/ringing
  // noise so region boundaries aren't jagged, and let near-duplicate colors and
  // speckle merge away instead of becoming their own layers.
  if (compressedFlat) {
    patch.denoise = 'bilateral'
    patch.blurRadius = Math.max(patch.blurRadius ?? 0, 1)
    patch.autoPaletteSize = true
    patch.minRegionArea = Math.max(patch.minRegionArea ?? 0, 24)
    patch.smoothing = Math.max(patch.smoothing ?? 0, 0.9)
    r.add(
      'compressed',
      'Compression artifacts — denoise, light blur and speckle merge recover clean shapes.',
    )
  }

  if (a.pixels > 4_000_000) {
    patch.maxDimension = 1600
    r.add('largeSource', 'Large source — tracing at 1600 px for speed with no visible loss.')
  }

  if (a.edgeDensity > 0.2 && (patch.mode === 'bw' || patch.mode === 'centerline')) {
    patch.minRegionArea = Math.max(patch.minRegionArea ?? 0, 8)
    r.add('busyEdges', 'Busy edges — filtering specks below 8 px².')
  }

  return { profileId, patch, rationale: r.text, rationaleKeys: r.keys }
}

function pickProfile(a: ImageAnalysis, r: Rationale): ProfileId {
  if (a.pixelArtScore >= 0.7) {
    r.add('pickPixelArt', 'Small canvas with few flat colors — treating as pixel art.')
    return 'pixel-art'
  }
  // Two-tone only routes to B&W when it is genuinely achromatic; a saturated
  // two-color mark (navy on white, say) keeps its color through a flat profile.
  if (a.twoToneCoverage > 0.92 && a.contrast > 0.25 && isAchromatic(a)) {
    r.add(
      'pickBwSketch',
      'Essentially two-tone with high contrast — black & white tracing fits best.',
    )
    return 'bw-sketch'
  }
  // Achromatic line art / ink drawing: no real color, a bright paper background,
  // crisp strokes and few distinct tones — unlike a mid-toned grayscale photo,
  // which fills the tonal range with smooth micro-gradients. Threshold B&W keeps
  // the lines crisp and compact instead of stacking tonal gray layers.
  if (isAchromatic(a) && a.meanLightness > 0.7 && a.edgeDensity > 0.1 && a.distinctColors <= 4096) {
    r.add(
      'pickInkLineart',
      'Achromatic line art with crisp edges and few tones — black & white tracing.',
    )
    return 'bw-sketch'
  }
  // Photographic routing is vetoed for clean flat art: anti-aliasing makes crisp
  // vector art score as photographic, but its flat interiors give it away, so it
  // stays a faithful color trace instead of being posterized or over-cleaned.
  if (!isCleanFlatArt(a) && a.photoScore > 0.6) {
    if (isCompressedFlat(a)) {
      r.add(
        'pickCompressedFlat',
        'Compression noise over a few flat colors — cleaning up as flat art.',
      )
      return 'illustration'
    }
    r.add('pickPhoto', 'Photographic content — posterized profile.')
    return 'photo'
  }
  if (a.distinctColors <= 24 && a.microGradientDensity < 0.08) {
    r.add('pickLogo', 'Flat shapes with few colors — logo profile with seam-free cutout layers.')
    return 'logo'
  }
  if (isCleanFlatArt(a)) {
    r.add('pickFlatArt', 'Clean flat art with anti-aliased edges — faithful color illustration.')
    return 'illustration'
  }
  r.add('pickIllustration', 'Mixed flat artwork — illustration profile.')
  return 'illustration'
}

function suggestPaletteSize(a: ImageAnalysis): number {
  if (a.distinctColors <= 32) return clampInt(Math.max(2, a.distinctColors), 2, 32)
  // Entropy-guided: busy images earn more colors.
  const fromEntropy = Math.round(2 ** clamp(a.entropyBits / 2.2, 3, 5.3))
  return clampInt(fromEntropy, 8, 40)
}
