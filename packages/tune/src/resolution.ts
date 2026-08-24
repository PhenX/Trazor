import { normalizeSettings } from '@trazor/core'
import type { VectorizeSettings } from '@trazor/core'

/**
 * Pixel-length settings that must grow with the trace resolution: a blur radius,
 * a window, a prune length or a curve tolerance measured in px means something
 * different at 1000 px than at 4000 px. Scaled by the linear factor.
 */
const LENGTH_KEYS = [
  'blurRadius',
  'adaptiveRadius',
  'pruneLength',
  'strokeWidth',
  'gapFill',
  'optTolerance',
  'fitTolerance',
  'simplifyTolerance',
] as const

/**
 * Rescale the resolution-dependent parameters of `settings` for a trace whose
 * long side changes by `factor` (target ÷ source). Length-in-px fields scale by
 * `factor`; the area threshold `minRegionArea` by `factor²`. Everything else —
 * angles (`cornerThreshold`), levels (`threshold`, `adaptiveBias`), counts,
 * ratios, enums and booleans — is resolution-independent and untouched. The
 * result is re-normalized (so every field lands back inside its clamp).
 *
 * This lets a search run at a cheap draft resolution and then re-trace the best
 * candidates at full resolution with parameters that mean the same thing, so the
 * draft ranking transfers instead of, say, a 6 px prune that vanishes at 4×.
 */
export function scaleSettingsForResolution(
  settings: VectorizeSettings,
  factor: number,
): VectorizeSettings {
  if (!(factor > 0) || factor === 1) return normalizeSettings(settings)
  const next: VectorizeSettings = { ...settings }
  for (const key of LENGTH_KEYS) next[key] = settings[key] * factor
  next.minRegionArea = Math.round(settings.minRegionArea * factor * factor)
  return normalizeSettings(next)
}
