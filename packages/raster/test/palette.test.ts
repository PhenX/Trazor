import { describe, expect, it } from 'vitest'
import { createRaster, setPixel } from '@trazor/core'
import type { LabelMap, RasterImage } from '@trazor/core'
import { interiorPaletteColors } from '../src/index'

/**
 * A black disk on white with a one-pixel gray anti-aliased rim, the rim labeled
 * with the disk (as a size merge leaves it): the disk's color must read black,
 * not the rim-tinted mean.
 */
function rimmedDisk(): { image: RasterImage; labels: LabelMap } {
  const w = 40
  const h = 40
  const image = createRaster(w, h)
  const data = new Int32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x + 0.5 - 20, y + 0.5 - 20)
      if (d < 12) {
        setPixel(image, x, y, 0, 0, 0)
        data[y * w + x] = 1
      } else if (d < 13) {
        setPixel(image, x, y, 128, 128, 128)
        data[y * w + x] = 1
      } else {
        setPixel(image, x, y, 255, 255, 255)
        data[y * w + x] = 0
      }
    }
  }
  return { image, labels: { width: w, height: h, data, count: 2 } }
}

describe('interiorPaletteColors', () => {
  it('reads a region’s color from its interior, not its rim', () => {
    const { image, labels } = rimmedDisk()
    const given = new Uint8Array([255, 255, 255, 5, 5, 5])
    const out = interiorPaletteColors(image, labels, given)
    expect(out.paletteHex).toEqual(['#ffffff', '#000000'])
    expect([...out.paletteRgb]).toEqual([255, 255, 255, 0, 0, 0])
  })

  it('falls back to the median over every pixel for a thin feature', () => {
    // A 2-px-wide stroke has no interior pixel at all.
    const w = 20
    const h = 10
    const image = createRaster(w, h)
    const data = new Int32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ink = y === 4 || y === 5
        setPixel(image, x, y, ink ? 30 : 250, ink ? 30 : 250, ink ? 30 : 250)
        data[y * w + x] = ink ? 1 : 0
      }
    }
    const out = interiorPaletteColors(
      image,
      { width: w, height: h, data, count: 2 },
      new Uint8Array([0, 0, 0, 0, 0, 0]),
    )
    expect(out.paletteHex[1]).toBe('#1e1e1e')
  })

  it('keeps the given color for a label with no pixels', () => {
    const image = createRaster(4, 4)
    const labels: LabelMap = { width: 4, height: 4, data: new Int32Array(16), count: 2 }
    const out = interiorPaletteColors(image, labels, new Uint8Array([0, 0, 0, 10, 20, 30]))
    expect(out.paletteHex[1]).toBe('#0a141e')
  })

  it('is deterministic', () => {
    const { image, labels } = rimmedDisk()
    const given = new Uint8Array([255, 255, 255, 5, 5, 5])
    const a = interiorPaletteColors(image, labels, given)
    const b = interiorPaletteColors(image, labels, given)
    expect(a).toEqual(b)
  })
})
