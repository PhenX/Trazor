import { describe, expect, it } from 'vitest'
import { createRaster, fillRaster, setPixel } from '@trazor/core'
import { analyzeImage, recommendSettings, suggestPalettes } from '@trazor/assist'
import type { ImageAnalysis } from '@trazor/assist'
import { mulberry32 } from '@trazor/core'

const lerpColor = (a: number[], b: number[], t: number) =>
  a.map((v, i) => Math.round(v + (b[i] - v) * t))

function flatLogo() {
  const img = createRaster(200, 200)
  fillRaster(img, 255, 255, 255)
  for (let y = 40; y < 160; y++) {
    for (let x = 40; x < 160; x++) setPixel(img, x, y, 220, 40, 60)
  }
  for (let y = 80; y < 120; y++) {
    for (let x = 80; x < 120; x++) setPixel(img, x, y, 20, 60, 200)
  }
  return img
}

function noisyPhoto() {
  const img = createRaster(200, 200)
  const rnd = mulberry32(7)
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 200; x++) {
      const base = 40 + ((x + y) / 400) * 170
      const n = () => Math.max(0, Math.min(255, base + (rnd() - 0.5) * 60))
      setPixel(img, x, y, n(), n(), n())
    }
  }
  return img
}

function sprite() {
  const img = createRaster(16, 16)
  fillRaster(img, 0, 0, 0, 0)
  for (let y = 4; y < 12; y++) {
    for (let x = 4; x < 12; x++) setPixel(img, x, y, 30, 200, 90)
  }
  return img
}

/** Grayscale gradient with luminance noise (R=G=B) — a photographic gray scene. */
function grayPhoto() {
  const img = createRaster(200, 200)
  const rnd = mulberry32(9)
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 200; x++) {
      const base = 40 + ((x + y) / 400) * 170
      const v = Math.max(0, Math.min(255, base + (rnd() - 0.5) * 50))
      setPixel(img, x, y, v, v, v)
    }
  }
  return img
}

/** A shaded ink drawing on bright paper — achromatic, many gray tones (not
 *  two-tone), crisp strokes: line art a grayscale-photo rule must not catch. */
function inkDrawing() {
  const img = createRaster(200, 200)
  fillRaster(img, 245, 245, 245)
  for (let y = 40; y < 160; y++) {
    for (let x = 20; x < 180; x++) {
      const hatch = (x + y) % 6 < 2
      const g = hatch ? 60 + ((x * 7 + y * 3) % 120) : 245 - ((x + y) % 40)
      setPixel(img, x, y, g, g, g)
    }
  }
  for (let x = 10; x < 190; x++) {
    const y = 100 + Math.round(20 * Math.sin(x / 12))
    setPixel(img, x, y, 20, 20, 20)
    setPixel(img, x, y + 1, 20, 20, 20)
  }
  return img
}

/** Half black, half white — an achromatic high-contrast sketch. */
function inkOnWhite() {
  const img = createRaster(200, 200)
  fillRaster(img, 255, 255, 255)
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 100; x++) setPixel(img, x, y, 12, 12, 12)
  }
  return img
}

/** Half navy, half white — high contrast but clearly colored. */
function navyOnWhite() {
  const img = createRaster(200, 200)
  fillRaster(img, 255, 255, 255)
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 100; x++) setPixel(img, x, y, 20, 30, 120)
  }
  return img
}

/** Two flat color fields buried under heavy noise — a compressed/degraded flat graphic. */
function compressedFlat() {
  const img = createRaster(200, 200)
  const rnd = mulberry32(11)
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 200; x++) {
      const left = x < 100
      // Bin-centered base colors + noise that stays inside the coarse bin, so
      // the two flat fields still dominate (high two-tone) under heavy speckle.
      const n = () => (rnd() - 0.5) * 18
      setPixel(img, x, y, (left ? 48 : 208) + n(), (left ? 112 : 80) + n(), (left ? 176 : 48) + n())
    }
  }
  return img
}

/** Soft radial coverage of a disc at a pixel center → an anti-aliased rim. */
function discCoverage(x: number, y: number, cx: number, cy: number, rad: number, ramp: number) {
  const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
  return Math.max(0, Math.min(1, (rad + ramp / 2 - d) / ramp))
}
function mixByte(a: number, b: number, t: number) {
  return Math.round(a * (1 - t) + b * t)
}

/** Many anti-aliased colored discs on white. Crisp flat art, but its soft rims
 *  invent thousands of colors and dense micro-gradients, so it scores as
 *  photographic — while the large disc/background interiors stay perfectly flat.
 *  This is the web-clip-art case that the photoScore heuristic alone misroutes. */
function antialiasedField() {
  const w = 320
  const h = 320
  const img = createRaster(w, h)
  fillRaster(img, 255, 255, 255)
  const cols = [
    [220, 40, 60],
    [30, 70, 200],
    [250, 210, 20],
    [40, 160, 90],
    [180, 60, 190],
  ]
  const rnd = mulberry32(12345)
  const discs: number[][] = []
  for (let i = 0; i < 280; i++) {
    discs.push([
      12 + rnd() * (w - 24),
      12 + rnd() * (h - 24),
      6 + rnd() * 9,
      (rnd() * cols.length) | 0,
    ])
  }
  const ramp = 3.5
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 255
      let g = 255
      let b = 255
      for (const [cx, cy, rad, ci] of discs) {
        if (Math.abs(x - cx) > rad + ramp || Math.abs(y - cy) > rad + ramp) continue
        const cov = discCoverage(x, y, cx, cy, rad, ramp)
        if (cov > 0) {
          const c = cols[ci]
          r = mixByte(r, c[0], cov)
          g = mixByte(g, c[1], cov)
          b = mixByte(b, c[2], cov)
        }
      }
      setPixel(img, x, y, r, g, b)
    }
  }
  return img
}

/** A vivid disc on a large black field — the mean chroma is dragged below the
 *  achromatic line by the black, but the colored pixels are unmistakable, so it
 *  must not be flattened to grayscale. */
function coloredOnBlack() {
  const img = createRaster(200, 200)
  fillRaster(img, 0, 0, 0)
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 200; x++) {
      let r = 0
      let g = 0
      let b = 0
      const cr = discCoverage(x, y, 100, 100, 42, 2)
      r = mixByte(r, 220, cr)
      g = mixByte(g, 40, cr)
      b = mixByte(b, 60, cr)
      const cb = discCoverage(x, y, 100, 100, 22, 2)
      r = mixByte(r, 30, cb)
      g = mixByte(g, 70, cb)
      b = mixByte(b, 200, cb)
      if (r || g || b) setPixel(img, x, y, r, g, b)
    }
  }
  return img
}

/**
 * A smooth red→white→blue gradient swatch centered on a large flat white field —
 * the shape of an image a user pastes to trace. The white margin makes the flat
 * interiors clear the flat-art threshold, but the swatch itself is *all* soft
 * ramp (micro-gradient density at least as high as flat density), so it is a
 * gradient, not clean flat art. It must not be routed to region growing, which
 * would flood the whole ramp into a single mean-colored region.
 */
function gradientOnFlat() {
  const w = 150
  const h = 250
  const img = createRaster(w, h)
  fillRaster(img, 255, 255, 255)
  const red = [210, 40, 40]
  const white = [255, 255, 255]
  const blue = [40, 60, 210]
  const grad = (t: number) =>
    t < 0.5 ? lerpColor(red, white, t * 2) : lerpColor(white, blue, (t - 0.5) * 2)
  const squares = [
    { x0: 18, y0: 12, x1: 132, y1: 118, vertical: false },
    { x0: 18, y0: 132, x1: 132, y1: 238, vertical: true },
  ]
  for (const s of squares) {
    const sw = s.x1 - s.x0
    const sh = s.y1 - s.y0
    const r = Math.min(sw, sh) * 0.18
    for (let y = s.y0; y < s.y1; y++) {
      for (let x = s.x0; x < s.x1; x++) {
        const lx = x - s.x0
        const ly = y - s.y0
        const cx = Math.min(Math.max(lx, r), sw - r)
        const cy = Math.min(Math.max(ly, r), sh - r)
        if (Math.hypot(lx - cx, ly - cy) > r) continue
        const t = s.vertical ? ly / (sh - 1) : lx / (sw - 1)
        const c = grad(t)
        setPixel(img, x, y, c[0], c[1], c[2])
      }
    }
  }
  return img
}

describe('analyzeImage', () => {
  it('measures a flat logo as non-photographic with few colors', () => {
    const a = analyzeImage(flatLogo())
    expect(a.distinctColors).toBeLessThanOrEqual(4)
    expect(a.photoScore).toBeLessThan(0.4)
    expect(a.hasAlpha).toBe(false)
  })

  it('measures a grayscale image as achromatic and a colored one as chromatic', () => {
    expect(analyzeImage(grayPhoto()).colorfulness).toBeLessThan(0.03)
    expect(analyzeImage(navyOnWhite()).colorfulness).toBeGreaterThan(0.03)
  })

  it('measures large flat interiors that anti-aliasing does not erase', () => {
    // Anti-aliased flat art keeps big exactly-flat fields; photo noise leaves none.
    expect(analyzeImage(antialiasedField()).flatDensity).toBeGreaterThan(0.3)
    expect(analyzeImage(noisyPhoto()).flatDensity).toBeLessThan(0.05)
  })

  it('measures a vivid subject on black as colored despite low mean chroma', () => {
    const a = analyzeImage(coloredOnBlack())
    expect(a.colorfulness).toBeLessThan(0.03) // mean chroma dragged down by the black field
    expect(a.coloredFraction).toBeGreaterThan(0.05) // yet a clear fraction is genuinely colored
  })

  it('measures noise/gradients as photographic', () => {
    const a = analyzeImage(noisyPhoto())
    expect(a.photoScore).toBeGreaterThan(0.55)
    expect(a.distinctColors).toBeGreaterThan(100)
  })

  it('flags a tiny transparent sprite as pixel art with alpha', () => {
    const a = analyzeImage(sprite())
    expect(a.pixelArtScore).toBeGreaterThanOrEqual(0.7)
    expect(a.hasAlpha).toBe(true)
  })
})

describe('recommendSettings', () => {
  it('routes flat art to a flat profile with a small palette', () => {
    const rec = recommendSettings(analyzeImage(flatLogo()))
    expect(['logo', 'illustration']).toContain(rec.profileId)
    expect(rec.patch.paletteSize).toBeLessThanOrEqual(8)
    expect(rec.rationale.length).toBeGreaterThan(0)
  })

  it('routes photos to the photo profile with denoise', () => {
    const rec = recommendSettings(analyzeImage(noisyPhoto()))
    expect(rec.profileId).toBe('photo')
  })

  it('keeps pixel art exact', () => {
    const rec = recommendSettings(analyzeImage(sprite()))
    expect(rec.profileId).toBe('pixel-art')
    expect(rec.patch.curveMode).toBe('pixel')
    expect(rec.patch.background).toBe('transparent')
  })

  it('honors an explicit goal profile', () => {
    const rec = recommendSettings(analyzeImage(flatLogo()), 'vinyl-cut')
    expect(rec.profileId).toBe('vinyl-cut')
    expect(rec.patch.unit).toBe('mm')
  })

  it('routes a grayscale photo to the photo profile in grayscale mode', () => {
    const rec = recommendSettings(analyzeImage(grayPhoto()))
    expect(rec.profileId).toBe('photo')
    expect(rec.patch.mode).toBe('grayscale')
  })

  it('routes an achromatic high-contrast sketch to B&W', () => {
    const rec = recommendSettings(analyzeImage(inkOnWhite()))
    expect(rec.profileId).toBe('bw-sketch')
  })

  it('routes a shaded achromatic line drawing (not two-tone) to B&W', () => {
    const a = analyzeImage(inkDrawing())
    expect(a.twoToneCoverage).toBeLessThan(0.92)
    expect(a.colorfulness).toBeLessThan(0.03)
    expect(recommendSettings(a).profileId).toBe('bw-sketch')
  })

  it('keeps a saturated two-tone mark in color rather than B&W', () => {
    const rec = recommendSettings(analyzeImage(navyOnWhite()))
    expect(rec.profileId).not.toBe('bw-sketch')
    expect(['logo', 'illustration']).toContain(rec.profileId)
  })

  it('keeps anti-aliased flat art as a color illustration, not a photo', () => {
    const a = analyzeImage(antialiasedField())
    // The adversarial condition: it scores as photographic, yet its flat
    // interiors mark it as clean art — the flat-art veto must win.
    expect(a.photoScore).toBeGreaterThan(0.6)
    expect(a.flatDensity).toBeGreaterThan(0.15)
    const rec = recommendSettings(a)
    expect(rec.profileId).toBe('illustration')
    expect(rec.patch.mode).toBe('color')
    expect(rec.patch.denoise).not.toBe('bilateral') // crisp edges, not photo blur
    // Region growing (not global quantization) so the anti-aliased edges never
    // invent a third rim color, with small rim regions folded away.
    expect(rec.patch.segmentation).toBe('regions')
    expect(rec.patch.minRegionArea ?? 0).toBeGreaterThanOrEqual(16)
  })

  it('does not route a gradient-on-flat-background to region growing (single-color collapse)', () => {
    const a = analyzeImage(gradientOnFlat())
    // The flat white margin clears the flat-art density threshold on its own...
    expect(a.flatDensity).toBeGreaterThan(0.15)
    // ...but the swatch is all soft ramp, so micro-gradient texture is not
    // dominated by the flat interiors — the tell that separates it from real
    // clean flat art (whose ramps sit only along edges).
    expect(a.microGradientDensity).toBeGreaterThanOrEqual(a.flatDensity)
    // So it must NOT be sent to region growing, which floods the ramp into one
    // region painted the mean color. Global quantization keeps the gradient's
    // colors as distinct posterized bands.
    const rec = recommendSettings(a)
    expect(rec.patch.segmentation).not.toBe('regions')
  })

  it('keeps a colored subject on a black backdrop in color, not grayscale', () => {
    const rec = recommendSettings(analyzeImage(coloredOnBlack()))
    expect(rec.patch.mode).not.toBe('grayscale')
  })

  it('cleans up a degraded flat graphic instead of posterizing it as a photo', () => {
    const rec = recommendSettings(analyzeImage(compressedFlat()))
    expect(rec.profileId).toBe('illustration')
    expect(rec.patch.denoise).toBe('bilateral')
    expect(rec.patch.autoPaletteSize).toBe(true)
    expect(rec.patch.minRegionArea).toBeGreaterThanOrEqual(24)
  })
})

describe('recommendSettings — region-growing gates', () => {
  // Clean flat art with many anti-aliased colors and no gradient — the case
  // region growing is for. Overrides flip one gate at a time.
  const flatArt = (over: Partial<ImageAnalysis> = {}): ImageAnalysis => ({
    width: 800,
    height: 600,
    pixels: 480_000,
    hasAlpha: false,
    distinctColors: 8000,
    entropyBits: 9,
    edgeDensity: 0.08,
    microGradientDensity: 0.18,
    flatDensity: 0.6,
    twoToneCoverage: 0.3,
    photoScore: 0.7,
    pixelArtScore: 0,
    dominantHex: ['#808080'],
    meanLightness: 0.6,
    contrast: 0.2,
    colorfulness: 0.1,
    coloredFraction: 0.5,
    ...over,
  })

  it('grows regions for many-color, gradient-free flat art', () => {
    expect(recommendSettings(flatArt()).patch.segmentation).toBe('regions')
  })

  it('keeps few-color flat art on quantization (no anti-aliased rims to protect)', () => {
    // A clean logo/sprite has no rim halo, so per-pixel quantization is exact;
    // region-mean coloring would only lose fidelity.
    expect(recommendSettings(flatArt({ distinctColors: 40 })).patch.segmentation).not.toBe(
      'regions',
    )
  })

  it('keeps gradient-bearing flat art on quantization (region growing floods ramps)', () => {
    // Still clean flat art (micro-gradient below flat density), but the gradient
    // has no flat interior to seed a marker, so region growing would flood it
    // into one mean color. Quantization posterizes the ramp into distinct bands.
    const a = flatArt({ microGradientDensity: 0.3 })
    expect(a.microGradientDensity).toBeLessThan(a.flatDensity) // still "flat art"
    expect(recommendSettings(a).patch.segmentation).not.toBe('regions')
  })
})

describe('suggestPalettes', () => {
  it('offers valid, distinct, deterministic palettes for flat art', () => {
    const img = flatLogo()
    const suggestions = suggestPalettes(img)
    expect(suggestions.length).toBeGreaterThanOrEqual(3)
    const ids = suggestions.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('exact')
    for (const s of suggestions) {
      expect(s.colors.length).toBeGreaterThanOrEqual(2)
      for (const hex of s.colors) expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    }
    const exact = suggestions.find((s) => s.id === 'exact')!
    expect(exact.colors.length).toBe(3)
    expect(JSON.stringify(suggestPalettes(img))).toBe(JSON.stringify(suggestions))
  })

  it('offers a rich palette for photographic content', () => {
    const suggestions = suggestPalettes(noisyPhoto())
    expect(suggestions.some((s) => s.id === 'rich')).toBe(true)
    expect(suggestions.some((s) => s.id === 'mono')).toBe(true)
  })
})
