import type { RasterImage } from '@vectorizer/core'
import { clamp, hexToRgb, oklabToHex, rgbToOklab } from '@vectorizer/core'
import { quantize } from '@vectorizer/raster'
import type { ImageAnalysis } from './analyze'
import { analyzeImage } from './analyze'

export interface PaletteSuggestion {
  id: string
  label: string
  colors: string[]
  description: string
}

const SUGGEST_SEED = 0x51ed270b

/**
 * Candidate palettes derived from the image itself, sized and styled by its
 * statistics. Deterministic for a given image.
 */
export function suggestPalettes(
  image: RasterImage,
  analysis: ImageAnalysis = analyzeImage(image),
): PaletteSuggestion[] {
  const out: PaletteSuggestion[] = []
  const distinct = analysis.distinctColors

  const cluster = (k: number): string[] =>
    quantize(image, {
      k,
      colorSpace: 'oklab',
      quality: 4,
      seed: SUGGEST_SEED,
      autoK: true,
    }).paletteHex

  if (distinct >= 2 && distinct <= 32) {
    out.push({
      id: 'exact',
      label: `Exact (${distinct})`,
      colors: cluster(Math.min(32, distinct)),
      description: 'Every color the image actually uses.',
    })
  }

  const balanced = cluster(distinct <= 12 ? Math.max(2, Math.min(12, distinct)) : 12)
  out.push({
    id: 'balanced',
    label: `Balanced (${balanced.length})`,
    colors: balanced,
    description: 'Perceptual clustering at a comfortable size.',
  })

  if (distinct > 8) {
    const bold = cluster(6)
    out.push({
      id: 'bold',
      label: `Bold (${bold.length})`,
      colors: bold,
      description: 'Few strong tones — poster and print friendly.',
    })
  }

  if (distinct > 64) {
    const rich = cluster(24)
    out.push({
      id: 'rich',
      label: `Rich (${rich.length})`,
      colors: rich,
      description: 'Wide tonal coverage for detailed art.',
    })
  }

  out.push({
    id: 'vivid',
    label: `Vivid (${balanced.length})`,
    colors: dedupe(balanced.map((hex) => scaleChroma(hex, 1.45, 0))),
    description: 'The balanced palette with the saturation pushed.',
  })
  out.push({
    id: 'muted',
    label: `Muted (${balanced.length})`,
    colors: dedupe(balanced.map((hex) => scaleChroma(hex, 0.5, 0.06))),
    description: 'Soft, pastel take on the image colors.',
  })

  const ink = mostChromatic(analysis.dominantHex) ?? '#1a1a2e'
  out.push({
    id: 'duotone',
    label: 'Duotone',
    colors: duotoneRamp(ink, 4),
    description: 'One ink over paper — riso / screen-print look.',
  })

  out.push({
    id: 'mono',
    label: 'Mono (6)',
    colors: grayRamp(6),
    description: 'Neutral grayscale ramp.',
  })

  // Drop degenerate or duplicate suggestions, keep stable order.
  const seen = new Set<string>()
  return out.filter((s) => {
    if (s.colors.length < 2) return false
    const key = s.colors.join(',')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function scaleChroma(hex: string, factor: number, lift: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const [L, a, b] = rgbToOklab(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
  return oklabToHex(clamp(L * (1 - lift) + lift, 0, 1), a * factor, b * factor)
}

function mostChromatic(hexes: string[]): string | null {
  let best: string | null = null
  let bestC = -1
  for (const hex of hexes) {
    const rgb = hexToRgb(hex)
    if (!rgb) continue
    const [, a, b] = rgbToOklab(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
    const c = Math.hypot(a, b)
    if (c > bestC) {
      bestC = c
      best = hex
    }
  }
  return best
}

function duotoneRamp(inkHex: string, steps: number): string[] {
  const rgb = hexToRgb(inkHex) ?? [26, 26, 46]
  const [L, a, b] = rgbToOklab(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
  const inkL = Math.min(L, 0.45)
  const out: string[] = []
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    const cL = inkL + (0.97 - inkL) * t
    const scale = 1 - t * 0.85
    out.push(oklabToHex(cL, a * scale, b * scale))
  }
  return dedupe(out)
}

function grayRamp(steps: number): string[] {
  const out: string[] = []
  for (let i = 0; i < steps; i++) {
    out.push(oklabToHex(0.12 + (0.96 - 0.12) * (i / (steps - 1)), 0, 0))
  }
  return out
}

function dedupe(colors: string[]): string[] {
  return [...new Set(colors)]
}
