import { describe, expect, it } from 'vitest'
import { createRaster, fillRaster, mulberry32, normalizeSettings, setPixel } from '@trazor/core'
import type { RasterImage, VectorizeSettings } from '@trazor/core'
import { vectorize } from '@trazor/engine'

const W = 80
const H = 80

/**
 * Hybrid scene: a noisy vertical gradient background (non-flat) with a flat
 * white card and a flat teal disc on it — the vector part should keep the
 * card/disc, the raster embed should cover the gradient.
 */
function hybridScene(): RasterImage {
  const rng = mulberry32(1)
  const img = createRaster(W, H)
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1)
    const r = 223 + (122 - 223) * t
    const g = 227 + (134 - 227) * t
    const b = 234 + (153 - 234) * t
    for (let x = 0; x < W; x++) {
      const n = (rng() - 0.5) * 12
      setPixel(img, x, y, Math.round(r + n), Math.round(g + n), Math.round(b + n))
    }
  }
  for (let y = 20; y < 60; y++) {
    for (let x = 20; x < 60; x++) setPixel(img, x, y, 255, 255, 255)
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if ((x - 40) ** 2 + (y - 40) ** 2 <= 8 * 8) setPixel(img, x, y, 14, 127, 140)
    }
  }
  return img
}

/** Flat scene: white background and the teal disc only — nothing to embed. */
function flatScene(): RasterImage {
  const img = createRaster(W, H)
  fillRaster(img, 255, 255, 255)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if ((x - 40) ** 2 + (y - 40) ** 2 <= 8 * 8) setPixel(img, x, y, 14, 127, 140)
    }
  }
  return img
}

function settings(hybridEmbed: boolean): VectorizeSettings {
  return normalizeSettings({
    mode: 'color',
    maxDimension: 0,
    segmentation: 'quantize',
    palette: ['#ffffff', '#0e7f8c'],
    layering: 'stacked',
    minRegionArea: 4,
    hybridEmbed,
    dissolveBands: 0,
    colorCoherence: 0,
    curveMode: 'spline',
    optimizeSvg: true,
    precision: 2,
  })
}

describe('hybridEmbed (vector over embedded raster)', () => {
  it('embeds the raster beneath vector shapes restricted to flat areas', async () => {
    const img = hybridScene()
    const off = await vectorize(img, settings(false))
    const on = await vectorize(img, settings(true))

    expect(off.svg).not.toContain('<image')
    expect(on.svg).toContain('<image x="0" y="0" width="80" height="80" href="data:image/png;base64,')
    // The flat disc is still vectorized.
    expect(on.svg).toContain('fill="#0e7f8c"')
    // The image is painted before the vector shapes.
    expect(on.svg.indexOf('<image')).toBeLessThan(on.svg.indexOf('<path'))

    // Deterministic.
    const on2 = await vectorize(img, settings(true))
    expect(on2.svg).toBe(on.svg)
  })

  it('embeds nothing for a fully flat image', async () => {
    const on = await vectorize(flatScene(), settings(true))
    expect(on.svg).not.toContain('<image')
  })

  it('is byte-identical to a plain trace when off', async () => {
    const img = hybridScene()
    const plain = await vectorize(img, normalizeSettings({ ...settings(false), hybridEmbed: false }))
    const off = await vectorize(img, settings(false))
    expect(off.svg).toBe(plain.svg)
  })
})
