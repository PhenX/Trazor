import { describe, expect, it } from 'vitest'
import type { RasterImage } from '@trazor/core'
import { KEY_MISS, qualityStats } from './lib'

type Rgb = [number, number, number]
const WHITE: Rgb = [255, 255, 255]
const BLUE: Rgb = [40, 90, 200]
const ORANGE: Rgb = [240, 150, 40]

/** A W×H opaque image painted by `at(x, y)`. */
function paint(W: number, H: number, at: (x: number, y: number) => Rgb): RasterImage {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = at(x, y)
      const i = (y * W + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return { width: W, height: H, data }
}

const inBlue = (x: number, y: number) => x >= 40 && x < 100 && y >= 40 && y < 100
const inOrange = (x: number, y: number) => x >= 150 && x < 162 && y >= 150 && y < 162

/** The reference: a blue square and a small orange square on white. */
const ref = paint(200, 200, (x, y) => (inBlue(x, y) ? BLUE : inOrange(x, y) ? ORANGE : WHITE))

describe('key-color and boundary indicators', () => {
  it('scores an exact render as perfect', () => {
    const q = qualityStats(ref, ref)
    expect(q.keyCount).toBe(3)
    expect(q.keyDE).toBe(0)
    expect(q.keyMissed).toBe(0)
    expect(q.bfPrecision).toBe(1)
    expect(q.bfRecall).toBe(1)
    expect(q.bf).toBe(1)
  })

  it('charges a dropped small color to key colors and recall, where the pixel mean forgives it', () => {
    // The orange square is 0.36 % of the pixels: the pixel-weighted mean barely
    // moves, while one key color in three is lost outright.
    const render = paint(200, 200, (x, y) => (inBlue(x, y) ? BLUE : WHITE))
    const q = qualityStats(render, ref)
    expect(q.mean).toBeLessThan(0.01)
    expect(q.keyCount).toBe(3)
    expect(q.keyMissed).toBe(1)
    expect(q.keyWorst).toBeGreaterThan(KEY_MISS)
    expect(q.keyDE).toBeGreaterThan(0.1)
    expect(q.bfPrecision).toBe(1)
    expect(q.bfRecall).toBeLessThan(0.9)
  })

  it('charges a wrong region color as a key-color error, not a lost color', () => {
    // The blue square painted a muddier blue: its key color is off but present.
    const render = paint(200, 200, (x, y) =>
      inBlue(x, y) ? [70, 100, 170] : inOrange(x, y) ? ORANGE : WHITE,
    )
    const q = qualityStats(render, ref)
    expect(q.keyMissed).toBe(0)
    expect(q.keyDE).toBeGreaterThan(0.01)
    expect(q.bf).toBeGreaterThan(0.99)
  })

  it('charges ragged borders and speckle to boundary precision', () => {
    // Every other row of the blue square bulges 3 px, and white specks sit inside
    // it: edges the reference does not have, so precision falls while recall holds.
    const render = paint(200, 200, (x, y) => {
      const bulge = y % 2 === 0 && x >= 100 && x < 103 && y >= 40 && y < 100
      const speck = x >= 60 && x < 62 && y % 10 < 2 && y >= 50 && y < 90
      if (bulge) return BLUE
      if (inBlue(x, y)) return speck ? WHITE : BLUE
      return inOrange(x, y) ? ORANGE : WHITE
    })
    const q = qualityStats(render, ref)
    expect(q.bfRecall).toBeGreaterThan(0.99)
    expect(q.bfPrecision).toBeLessThan(0.9)
    expect(q.keyMissed).toBe(0)
  })

  it('matches an edge shifted by one pixel, within the tolerance', () => {
    const render = paint(200, 200, (x, y) =>
      inBlue(x + 1, y) ? BLUE : inOrange(x, y) ? ORANGE : WHITE,
    )
    const q = qualityStats(render, ref)
    expect(q.bf).toBe(1)
  })
})
