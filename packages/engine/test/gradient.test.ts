import { describe, expect, it } from 'vitest'
import { createRaster, fillRaster, normalizeSettings, setPixel } from '@trazor/core'
import type { RasterImage } from '@trazor/core'
import { vectorize } from '@trazor/engine'
import { analyzeSvg } from '@trazor/svg'

/** A smooth horizontal grayscale ramp, dark left to light right. */
function rampImage(w = 96, h = 48): RasterImage {
  const img = createRaster(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.round(30 + (x / (w - 1)) * 200)
      setPixel(img, x, y, v, v, v)
    }
  }
  return img
}

/** A hard-edged red square on white — two flat colors, no ramp. */
function flatImage(w = 60, h = 60): RasterImage {
  const img = createRaster(w, h)
  fillRaster(img, 255, 255, 255)
  for (let y = 15; y < 45; y++) {
    for (let x = 15; x < 45; x++) setPixel(img, x, y, 210, 30, 40)
  }
  return img
}

describe('gradient detection — engine', () => {
  it('is byte-identical when no ramp is present', async () => {
    const img = flatImage()
    const off = await vectorize(img, normalizeSettings({ gradients: false }))
    const on = await vectorize(img, normalizeSettings({ gradients: true }))
    expect(on.svg).toBe(off.svg)
  })

  it('paints a ramp with one gradient instead of many bands', async () => {
    const img = rampImage()
    const off = await vectorize(img, normalizeSettings({ paletteSize: 16, gradients: false }))
    const on = await vectorize(img, normalizeSettings({ paletteSize: 16, gradients: true }))

    expect(off.svg).not.toContain('<linearGradient')
    expect(on.svg).toContain('<linearGradient')
    // The merged ramp is far fewer shapes than the posterized bands.
    expect(on.stats.pathCount).toBeLessThan(off.stats.pathCount)
    // The palette still reports real swatches (the gradient's stop colors).
    expect(on.palette.length).toBeGreaterThan(0)
    // Output is still valid, analyzable SVG.
    expect(analyzeSvg(on.svg).width).toBe(img.width)
  })

  it('is ignored in pixel mode (exact lattice)', async () => {
    const img = rampImage()
    const px = await vectorize(img, normalizeSettings({ curveMode: 'pixel', gradients: true }))
    expect(px.svg).not.toContain('<linearGradient')
  })

  it('warns when gradients meet a spot-color (mm) target', async () => {
    const img = rampImage()
    const res = await vectorize(img, normalizeSettings({ gradients: true, unit: 'mm' }))
    expect(res.svg).toContain('<linearGradient')
    expect(res.warnings.some((w) => w.code === 'gradient-spot-color')).toBe(true)
  })
})
