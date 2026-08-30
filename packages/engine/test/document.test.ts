import { describe, expect, it } from 'vitest'
import { createRaster, fillRaster, normalizeSettings, setPixel } from '@trazor/core'
import type { RasterImage } from '@trazor/core'
import { vectorize } from '@trazor/engine'

function swatches(): RasterImage {
  const img = createRaster(48, 48)
  fillRaster(img, 255, 255, 255)
  for (let y = 6; y < 24; y++) for (let x = 6; x < 24; x++) setPixel(img, x, y, 200, 40, 40)
  for (let y = 24; y < 42; y++) for (let x = 24; x < 42; x++) setPixel(img, x, y, 40, 120, 200)
  return img
}

describe('vectorize document', () => {
  it('is attached only when requested, and is side-effect-free', async () => {
    const img = swatches()
    const settings = normalizeSettings({ mode: 'color', paletteSize: 4 })
    const plain = await vectorize(img, settings)
    const withDoc = await vectorize(img, settings, undefined, { withDocument: true })
    expect(plain.document).toBeUndefined()
    expect(withDoc.document).toBeDefined()
    // Requesting the document does not change the SVG.
    expect(withDoc.svg).toBe(plain.svg)
  })

  it('carries the pre-serialization shapes with commands and paint', async () => {
    const { document } = await vectorize(
      swatches(),
      normalizeSettings({ mode: 'color', paletteSize: 4 }),
      undefined,
      {
        withDocument: true,
      },
    )
    expect(document).toBeDefined()
    expect(document!.width).toBe(48)
    expect(document!.height).toBe(48)
    expect(document!.unit).toBe('px')
    expect(document!.shapes.length).toBeGreaterThan(0)
    for (const shape of document!.shapes) {
      expect(shape.commands.length).toBeGreaterThan(0)
      expect(shape.commands[0].type).toBe('M')
      // A color shape carries a solid hex fill.
      expect(
        shape.fill === undefined || /^#|^url\(/.test(shape.fill) || shape.fill === 'none',
      ).toBe(true)
    }
  })

  it('reports millimetre output units on the document', async () => {
    const { document } = await vectorize(
      swatches(),
      normalizeSettings({ mode: 'color', paletteSize: 4, unit: 'mm', widthMm: 100 }),
      undefined,
      { withDocument: true },
    )
    expect(document!.unit).toBe('mm')
    expect(document!.widthMm).toBe(100)
  })
})
