import type { ProfileId, VectorizeSettings } from '@vectorizer/core'
import { clamp, clampInt, getProfile } from '@vectorizer/core'
import type { ImageAnalysis } from './analyze'

export interface Recommendation {
  profileId: ProfileId
  patch: Partial<VectorizeSettings>
  rationale: string[]
}

/** Mean Oklab chroma below this reads as effectively grayscale. */
const ACHROMATIC_CHROMA = 0.03

/**
 * Rule-based settings recommendation from measured image statistics. Fully
 * local and instant — no models involved. When `goal` names a profile, the
 * profile is kept and only data-driven fields are tuned.
 */
export function recommendSettings(
  a: ImageAnalysis,
  goal: ProfileId | 'auto' = 'auto',
): Recommendation {
  const rationale: string[] = []

  const profileId = goal === 'auto' ? pickProfile(a, rationale) : goal
  const patch: Partial<VectorizeSettings> = { ...getProfile(profileId).patch }

  if (a.hasAlpha) {
    patch.background = 'transparent'
    rationale.push('Transparent pixels found — they will produce no shapes.')
  }

  if (profileId === 'pixel-art') {
    patch.paletteSize = clampInt(Math.max(2, a.distinctColors), 2, 64)
    rationale.push(`Kept the ${a.distinctColors} original colors exactly.`)
    return { profileId, patch, rationale }
  }

  // A near-grayscale photo traces as tonal gray layers, not a color palette.
  if (profileId === 'photo' && a.colorfulness < ACHROMATIC_CHROMA) {
    patch.mode = 'grayscale'
    rationale.push('Nearly grayscale — tracing as tonal grayscale layers.')
  }

  if (patch.mode === 'color' || patch.mode === 'grayscale' || patch.mode === undefined) {
    const suggested = suggestPaletteSize(a)
    patch.paletteSize = suggested
    rationale.push(
      a.distinctColors >= 65536
        ? `Rich color content — using ${suggested} palette entries.`
        : `≈${a.distinctColors} distinct colors measured — ${suggested} palette entries cover it.`,
    )
    if (a.photoScore > 0.55 && patch.denoise === undefined) {
      patch.denoise = 'bilateral'
      rationale.push('Photographic texture detected — bilateral denoise keeps edges clean.')
    }
  }

  if (a.pixels > 4_000_000) {
    patch.maxDimension = 1600
    rationale.push('Large source — tracing at 1600 px for speed with no visible loss.')
  }

  if (a.edgeDensity > 0.2 && (patch.mode === 'bw' || patch.mode === 'centerline')) {
    patch.minRegionArea = Math.max(patch.minRegionArea ?? 0, 8)
    rationale.push('Busy edges — filtering specks below 8 px².')
  }

  return { profileId, patch, rationale }
}

function pickProfile(a: ImageAnalysis, rationale: string[]): ProfileId {
  if (a.pixelArtScore >= 0.7) {
    rationale.push('Small canvas with few flat colors — treating as pixel art.')
    return 'pixel-art'
  }
  // Two-tone only routes to B&W when it is genuinely achromatic; a saturated
  // two-color mark (navy on white, say) keeps its color through a flat profile.
  if (a.twoToneCoverage > 0.92 && a.contrast > 0.25 && a.colorfulness < ACHROMATIC_CHROMA) {
    rationale.push('Essentially two-tone with high contrast — black & white tracing fits best.')
    return 'bw-sketch'
  }
  if (a.photoScore > 0.6) {
    rationale.push('Photographic content — posterized profile.')
    return 'photo'
  }
  if (a.distinctColors <= 24 && a.microGradientDensity < 0.08) {
    rationale.push('Flat shapes with few colors — logo profile with seam-free cutout layers.')
    return 'logo'
  }
  rationale.push('Mixed flat artwork — illustration profile.')
  return 'illustration'
}

function suggestPaletteSize(a: ImageAnalysis): number {
  if (a.distinctColors <= 32) return clampInt(Math.max(2, a.distinctColors), 2, 32)
  // Entropy-guided: busy images earn more colors.
  const fromEntropy = Math.round(2 ** clamp(a.entropyBits / 2.2, 3, 5.3))
  return clampInt(fromEntropy, 8, 40)
}
