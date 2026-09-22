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

/**
 * Flat area in a third tone above which two-tone art is not bilevel: a gray
 * fill inside a black outline is three inks, and a hard threshold would keep
 * only one of them.
 */
const MINOR_TONES_MAX = 0.005

/** Alpha of half coverage: the outline of an anti-aliased edge against transparency. */
const EDGE_ALPHA_THRESHOLD = 128

/**
 * Gray levels for a tonal ink scan traced as grayscale. Few enough that the
 * paper's JPEG texture posterizes into one background level instead of thousands
 * of speck regions, enough to separate paper, faint construction lines, mid-tone
 * hatching and solid ink.
 */
const INK_TONE_LEVELS = 4

/** Speck floor for a tonal ink scan — drops the paper's residual JPEG specks. */
const INK_TONE_MIN_REGION = 16

/**
 * Cartoon-style art — flat fills meeting at crisp, anti-aliased edges — is
 * traced by region growing: each fill grows from its flat interior, so a soft
 * edge is split between its two real neighbors and no rim color is invented,
 * and the trace stays a few clean shapes per fill. Five measured conditions,
 * each shutting out one input the flood wrecks:
 *
 * - **Exactly-flat interiors** (`flatDensity`): a fill keeps pixels identical
 *   to their neighbors even after JPEG (a DC-only block is exact); sensor noise
 *   never does, so a photograph with a large smooth sky is not a cartoon.
 * - **Flat fills dominate** (`flatArea`): most of the opaque image is smooth,
 *   flat-colored area — JPEG-tolerant, unlike `flatDensity`, so a compressed
 *   cartoon still qualifies.
 * - **Ramps are a minority** (`rampArea` against `flatArea`): a smooth area
 *   that ramps — a sky gradient, a shaded backdrop, even a faint one — has no
 *   flat interior to seed and is flooded into one mean color; quantization keeps
 *   it as bands. Once ramps reach half the flat area the gradient is the picture.
 * - **Coarse detail** (`fineArea`): fills too small to hold a flat core — a
 *   sprite's, pixel art's — are folded into their neighbors by region growing;
 *   per-pixel quantization keeps them. A few percent of such fills is fine
 *   detail on a cartoon; more is a sprite.
 * - **Anti-aliased rims exist** (`distinctColors` and micro-gradient against
 *   edge density): a hard-edged pixel palette has no rim to protect — every
 *   pixel already is a palette color — so quantization traces it exactly.
 */
const CARTOON_MIN_FLAT_AREA = 0.4
const CARTOON_MAX_RAMP_SHARE = 0.5
const CARTOON_MAX_FINE_AREA = 0.04
const CARTOON_MIN_RIM_RATIO = 0.1
/** Distinct colors below which an image is a hard-edged pixel palette (the pixel-art profile's own bound). */
const CARTOON_MIN_DISTINCT_COLORS = 64

/** Whether the image reads as cartoon-style flat art region growing serves best. */
function isCartoon(a: ImageAnalysis): boolean {
  return (
    a.flatDensity >= FLAT_ART_MIN_DENSITY &&
    a.flatArea >= CARTOON_MIN_FLAT_AREA &&
    a.rampArea <= CARTOON_MAX_RAMP_SHARE * a.flatArea &&
    a.fineArea <= CARTOON_MAX_FINE_AREA &&
    a.distinctColors >= CARTOON_MIN_DISTINCT_COLORS &&
    a.microGradientDensity >= CARTOON_MIN_RIM_RATIO * a.edgeDensity
  )
}

/**
 * Clean flat art (vector illustration, logo, cartoon) rather than a photograph
 * or a degraded graphic. Anti-aliased edges make such art score as photographic
 * (many colors, dense micro-gradients), so `photoScore` alone misroutes it; the
 * flat interiors it keeps — which photos and compression noise destroy — are the
 * reliable tell. Kept in color and traced faithfully, not denoised or posterized.
 *
 * Two conditions, not one: the flat interiors must be large *and* must outweigh
 * the soft-ramp texture. In genuine flat art the anti-aliased ramps sit only
 * along edges, so `microGradientDensity` stays well below `flatDensity`. A smooth
 * gradient painted on a flat background (a gradient swatch on white, say) also
 * clears the flat threshold — through its background — but its colored area is
 * *all* soft ramp, so its micro-gradient density meets or exceeds its flat
 * density. Without the second condition such an image is treated as flat art and
 * routed to region growing, which floods the entire ramp into one region painted
 * a single mean color (the whole gradient collapses to its average). Requiring
 * the flat interiors to dominate keeps gradients out of the flat-art path.
 */
function isCleanFlatArt(a: ImageAnalysis): boolean {
  return a.flatDensity >= FLAT_ART_MIN_DENSITY && a.microGradientDensity < a.flatDensity
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
 * Genuinely bilevel ink: an achromatic mark that is essentially two tones (dark
 * ink on bright paper) with high contrast and almost no mid-gray. A hard
 * threshold reproduces it exactly, so it is traced as black & white.
 */
function isBilevelInk(a: ImageAnalysis): boolean {
  return (
    a.twoToneCoverage > 0.92 &&
    a.contrast > 0.25 &&
    a.minorTonesArea < MINOR_TONES_MAX &&
    isAchromatic(a)
  )
}

/**
 * Achromatic line-art scan carrying real gray tone: an ink drawing, engraving or
 * technical/patent scan on bright paper — busy edges, a limited tone count, no
 * color — that is not cleanly bilevel ({@link isBilevelInk}). What separates it
 * from a mid-toned grayscale photo is the bright paper ground and the sparse
 * tone count; what separates it from clean two-tone ink is the mid-gray it
 * carries (faint pencil, engraved hatching, a JPEG'd rule). A bw threshold
 * collapses that mid-gray into solid ink — thickening every stroke and flooding
 * hatched areas black — so this is traced as grayscale tonal layers, which keep
 * each stroke at its true darkness.
 */
function isTonalLineArt(a: ImageAnalysis): boolean {
  return (
    isAchromatic(a) &&
    !isBilevelInk(a) &&
    a.meanLightness > 0.7 &&
    a.edgeDensity > 0.1 &&
    a.distinctColors <= 4096
  )
}

/**
 * Photographic-looking texture (noise, blocking, ringing) sitting on top of a
 * few dominant flat colors — a compressed or rescaled flat graphic (a JPEG
 * logo, a screenshot) rather than a true photograph, whose colors spread out
 * so no two dominate. These want strong cleanup, not photo posterization. Clean
 * flat art and cartoons are excluded: their crisp anti-aliased edges are not
 * compression damage, and a blur would only soften the linework.
 */
function isCompressedFlat(a: ImageAnalysis): boolean {
  return (
    a.photoScore > 0.6 &&
    a.twoToneCoverage > 0.55 &&
    a.colorfulness >= ACHROMATIC_CHROMA &&
    !isCleanFlatArt(a) &&
    !isCartoon(a)
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
    patch.alphaThreshold = EDGE_ALPHA_THRESHOLD
    r.add('alpha', 'Transparent pixels found — clear areas will produce no shapes.')
    // Half coverage is the true outline of an anti-aliased opaque edge; soft
    // see-through content (a shadow, glass, steam) survives the cut as a
    // translucent interior and is emitted as a face with opacity, so the same
    // cut serves opaque and translucent alpha alike.
    r.add(
      'alphaEdge',
      'Cutting at half coverage puts every anti-aliased edge on its true outline; translucent regions become faces with opacity.',
    )
  }

  // Clean two-tone flat art (an icon, a glyph, a stamp) has exact tones, so the
  // threshold that splits them is their lightness midpoint — Otsu, made for a
  // scan's histogram, has no reason to land there — and its ink is its own
  // measured color, not black.
  if (patch.mode === 'bw' && isCleanFlatArt(a) && isBilevelInk(a)) {
    patch.thresholdMode = 'fixed'
    patch.threshold = clampInt(Math.round((255 * (a.inkLightness + a.paperLightness)) / 2), 1, 254)
    patch.fillColor = a.inkHex
    r.add(
      'flatInk',
      'Clean two-tone art — threshold set midway between its two tones, ink painted in its measured color.',
    )
  }

  if (profileId === 'pixel-art') {
    patch.paletteSize = clampInt(Math.max(2, a.distinctColors), 2, 64)
    r.add('pixelExact', `Kept the ${a.distinctColors} original colors exactly.`, {
      count: a.distinctColors,
    })
    return { profileId, patch, rationale: r.text, rationaleKeys: r.keys }
  }

  // An achromatic line-art scan with real gray tone traces as grayscale tonal
  // layers, not black & white: a bw threshold would over-ink it, thickening
  // faint strokes and flooding hatched areas solid black. A small tone count
  // posterizes the paper's JPEG texture into one background level instead of
  // thousands of speck regions.
  if (goal === 'auto' && isTonalLineArt(a)) {
    patch.mode = 'grayscale'
    patch.paletteSize = INK_TONE_LEVELS
    patch.autoPaletteSize = false
    patch.minRegionArea = Math.max(patch.minRegionArea ?? 0, INK_TONE_MIN_REGION)
    r.add(
      'inkGrayscale',
      `${INK_TONE_LEVELS} gray tones — enough to separate paper, faint lines and ink, few enough to posterize the scan's texture instead of tracing it.`,
      { levels: INK_TONE_LEVELS },
    )
    if (a.pixels > 4_000_000) {
      patch.maxDimension = 1600
      r.add('largeSource', 'Large source — tracing at 1600 px for speed with no visible loss.')
    }
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
  const cartoon = isCartoon(a)
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
    // Clean flat art and cartoons are exempt from photo denoise (their edges
    // are crisp, not noisy) — bilateral blur would only soften the linework.
    if (
      a.photoScore > 0.55 &&
      patch.denoise === undefined &&
      !compressedFlat &&
      !flatArt &&
      !cartoon
    ) {
      patch.denoise = 'bilateral'
      r.add('photoTexture', 'Photographic texture detected — bilateral denoise keeps edges clean.')
    }
    // Cartoon-style flat art: global k-means maps the soft rim between two
    // flat colors to a nearest *third* palette color, drawing hairline slivers
    // along every edge. Region growing instead grows each fill from its flat
    // interior, so a soft edge is split between its two real neighbors and no
    // rim color can form — the clean, few-shapes choice for a cartoon. The
    // size-aware region merge folds rim slivers on its own, so the profile's
    // speck floor stands (a flag's stars and a scene's small marks survive),
    // and the palette budget is a hard cap on the fills that remain.
    // Gradient-heavy, sprite-fine or hard-edged art is excluded (`isCartoon`)
    // and stays on quantization, which keeps a gradient's bands and traces a
    // pixel palette exactly.
    if (cartoon) {
      patch.segmentation = 'regions'
      r.add(
        'cartoonRegions',
        'Cartoon-style flat art — growing each fill from its flat interior (no global palette) so anti-aliased edges stay clean, within the color budget.',
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
  if (isBilevelInk(a)) {
    r.add(
      'pickBwSketch',
      'Essentially two-tone with high contrast — black & white tracing fits best.',
    )
    return 'bw-sketch'
  }
  // Achromatic line art carrying real gray tone (a faint pencil scan, an
  // engraving's hatching, a JPEG'd technical drawing): no color, a bright paper
  // ground, busy edges and few tones — but not cleanly bilevel. A bw threshold
  // over-inks it; a faithful color/grayscale trace keeps each stroke's true
  // darkness (the recommender applies grayscale mode). The illustration base
  // gives the smooth stacked layering that suits it.
  if (isTonalLineArt(a)) {
    r.add(
      'pickInkGrayscale',
      'Achromatic line art with gray tone — faithful grayscale tracing, not over-inked black & white.',
    )
    return 'illustration'
  }
  // Photographic routing is vetoed for clean flat art and cartoons: anti-aliasing
  // (or JPEG) makes crisp vector art score as photographic, but its flat
  // interiors give it away, so it stays a faithful color trace instead of being
  // posterized or over-cleaned.
  if (!isCleanFlatArt(a) && !isCartoon(a) && a.photoScore > 0.6) {
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
  if (isCleanFlatArt(a) || isCartoon(a)) {
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
