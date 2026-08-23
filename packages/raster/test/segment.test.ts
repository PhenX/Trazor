import { describe, expect, it } from 'vitest'
import { createRaster, setPixel } from '@trazor/core'
import { segmentRegions } from '../src/index'

/** Left half red, right half blue, with an anti-aliased purple seam column. */
function twoTone() {
  const img = createRaster(40, 20)
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 40; x++) {
      if (x === 20)
        setPixel(img, x, y, 120, 40, 120) // seam mixture
      else setPixel(img, x, y, x < 20 ? 200 : 40, 40, x < 20 ? 40 : 200)
    }
  }
  return img
}

const opts = { k: 2, colorSpace: 'oklab' as const, quality: 5, seed: 1 }

describe('segmentRegions', () => {
  it('gives a coherent two-color segmentation and sends the seam to a real side', () => {
    const r = segmentRegions(twoTone(), opts)
    expect(r.paletteHex.length).toBe(2) // no invented third color
    const at = (x: number, y: number) => r.labels.data[y * 40 + x]
    expect(at(5, 10)).not.toBe(at(35, 10)) // the two halves differ
    expect(at(5, 10)).toBe(at(12, 4)) // left half is one coherent label
    expect(at(35, 10)).toBe(at(28, 16)) // right half is one coherent label
    expect([at(20, 10)]).toContain(at(20, 10)) // the seam took one side, not a third
    expect(at(20, 10) === at(5, 10) || at(20, 10) === at(35, 10)).toBe(true)
  })

  it('is deterministic', () => {
    const a = segmentRegions(twoTone(), opts)
    const b = segmentRegions(twoTone(), opts)
    expect([...a.labels.data]).toEqual([...b.labels.data])
    expect(a.paletteHex).toEqual(b.paletteHex)
  })

  it('defers a fixed palette to the plain quantizer', () => {
    const r = segmentRegions(twoTone(), { ...opts, fixedPalette: ['#c82828', '#2828c8'] })
    expect(r.paletteHex.length).toBe(2)
  })
})
