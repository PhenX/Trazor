/**
 * Palette colors measured from region interiors.
 *
 * A label's mean color over every pixel it owns is pulled toward its neighbors
 * by the anti-aliased rim the labeling handed it: a black outline whose rim
 * pixels are gray mixtures over white averages to `#050505`, and that error
 * lands on every pixel of the region. The rim is a measurement of geometry
 * (how far the edge lies across the pixel), not of color, so the region's color
 * is read from its interior alone — the pixels whose four neighbors all carry
 * the same label — and the rim is left to the boundary refinement.
 */
import { rgbToHex } from '@trazor/core'
import type { LabelMap, RasterImage } from '@trazor/core'

/**
 * Fewest interior pixels before a label's color is read from them: below this a
 * feature is thin enough that its interior is itself contaminated (a hairline
 * has none), and the mean over every pixel is the better estimate.
 */
const MIN_INTERIOR = 16

export interface InteriorPalette {
  paletteRgb: Uint8Array
  paletteHex: string[]
}

/**
 * Per-label color: the per-channel median over the label's interior pixels
 * when it has at least `MIN_INTERIOR` of them, else the median over every pixel
 * it owns, else (a label with no pixels) the color it came with. The median is
 * the color that minimizes the residual against the pixels, and it is unmoved
 * by the few rim pixels the interior test lets through — a lost dot, a
 * two-pixel ramp. Labels are read from `labels` as they stand, so this runs
 * after the region cleanup that settles them. Deterministic: histograms only.
 */
export function interiorPaletteColors(
  image: RasterImage,
  labels: LabelMap,
  paletteRgb: Uint8Array,
): InteriorPalette {
  const { width: w, height: h, data: lab } = labels
  const px = image.data
  const count = labels.count
  // Two histogram sets per label: interior pixels and all pixels, 256 bins × 3.
  const inner = new Uint32Array(count * 768)
  const all = new Uint32Array(count * 768)
  const innerN = new Uint32Array(count)
  const allN = new Uint32Array(count)
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      const i = row + x
      const l = lab[i]
      if (l < 0 || l >= count) continue
      const p = i * 4
      const base = l * 768
      all[base + px[p]]++
      all[base + 256 + px[p + 1]]++
      all[base + 512 + px[p + 2]]++
      allN[l]++
      const interior =
        x > 0 &&
        x < w - 1 &&
        y > 0 &&
        y < h - 1 &&
        lab[i - 1] === l &&
        lab[i + 1] === l &&
        lab[i - w] === l &&
        lab[i + w] === l
      if (interior) {
        inner[base + px[p]]++
        inner[base + 256 + px[p + 1]]++
        inner[base + 512 + px[p + 2]]++
        innerN[l]++
      }
    }
  }
  const out = new Uint8Array(count * 3)
  out.set(paletteRgb.subarray(0, Math.min(paletteRgb.length, count * 3)))
  const hex: string[] = new Array(count)
  for (let l = 0; l < count; l++) {
    const useInner = innerN[l] >= MIN_INTERIOR
    const hist = useInner ? inner : all
    const total = useInner ? innerN[l] : allN[l]
    if (total > 0) {
      const base = l * 768
      for (let c = 0; c < 3; c++) {
        // Lower median: the first bin whose cumulative count reaches half.
        const half = (total + 1) >> 1
        let acc = 0
        let v = 0
        for (; v < 255; v++) {
          acc += hist[base + c * 256 + v]
          if (acc >= half) break
        }
        out[l * 3 + c] = v
      }
    }
    hex[l] = rgbToHex(out[l * 3], out[l * 3 + 1], out[l * 3 + 2])
  }
  return { paletteRgb: out, paletteHex: hex }
}
