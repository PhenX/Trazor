import { describe, expect, it } from 'vitest'
import { createRaster, fillRaster, setPixel } from '@vectorizer/core'
import { analyzeImage, recommendSettings, suggestPalettes } from '@vectorizer/assist'
import { mulberry32 } from '@vectorizer/core'

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

  it('keeps a saturated two-tone mark in color rather than B&W', () => {
    const rec = recommendSettings(analyzeImage(navyOnWhite()))
    expect(rec.profileId).not.toBe('bw-sketch')
    expect(['logo', 'illustration']).toContain(rec.profileId)
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
