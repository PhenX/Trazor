import { describe, expect, it } from 'vitest'
import { mixtureResidual, overshootResidual, representedRegions } from '../src/represent'

const cols = (...c: number[][]): Float64Array => Float64Array.from(c.flat())

describe('mixtureResidual', () => {
  it('reads a blend of two colors as explained, and an outsider as not', () => {
    const inks = cols([0, 0, 0], [1, 0.5, 0.25])
    expect(mixtureResidual([0.5, 0.25, 0.125], inks, 2)).toBeCloseTo(0, 9)
    expect(mixtureResidual([0, 1, 0], inks, 2)).toBeGreaterThan(0.5)
  })

  it('explains a three-color mixture inside the triangle', () => {
    const inks = cols([1, 0, 0], [0, 1, 0], [0, 0, 1])
    expect(mixtureResidual([0.2, 0.3, 0.5], inks, 3)).toBeCloseTo(0, 9)
    // Off the triangle's plane: the distance to it.
    expect(mixtureResidual([0.5, 0.5, 0.5], inks, 3)).toBeCloseTo(Math.sqrt(3) / 6, 6)
  })

  it('needs two colors to mix', () => {
    expect(mixtureResidual([0.1, 0.1, 0.1], cols([0.1, 0.1, 0.1]), 1)).toBe(Infinity)
  })
})

describe('overshootResidual', () => {
  it('explains ringing past either end of a chord, up to the overshoot', () => {
    const inks = cols([0.2, 0.2, 0.2], [0.8, 0.8, 0.8])
    // 10 % past the light end: ringing.
    expect(overshootResidual([0.86, 0.86, 0.86], inks, 2)).toBeCloseTo(0, 9)
    // 30 % past it: not.
    expect(overshootResidual([0.98, 0.98, 0.98], inks, 2)).toBeGreaterThan(0.05)
  })

  it('explains an ink scaled up by a premultiplied resize', () => {
    expect(overshootResidual([0.66, 0.55, 0.11], cols([0.6, 0.5, 0.1]), 1)).toBeCloseTo(0, 9)
  })
})

describe('representedRegions', () => {
  // A blue field (region 0) holding a 6×8 purple pad (region 1) no mixture of
  // blue makes, on an image of `side`².
  function pad(side: number): ReturnType<typeof representedRegions> {
    const rgba = new Uint8ClampedArray(side * side * 4)
    const region = new Int32Array(side * side)
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        const p = y * side + x
        const inPad = x >= 100 && x < 106 && y >= 100 && y < 108
        region[p] = inPad ? 1 : 0
        rgba.set(inPad ? [61, 58, 106, 255] : [71, 121, 170, 255], p * 4)
      }
    }
    const regionRgb = Float64Array.from([
      71 / 255,
      121 / 255,
      170 / 255,
      61 / 255,
      58 / 255,
      106 / 255,
    ])
    return representedRegions(rgba, region, side, side, regionRgb, Uint8Array.from([0, 1]), 1)
  }

  it('counts a small region represented at its own scale when the image share is out of reach', () => {
    // 48 voting pixels: at 200² they reach the image's share (20); at 400² the
    // share asks for 78, and half the pad's own pixels (24) are evidence at its
    // own scale.
    expect(pad(200).represented[1]).toBe(1)
    expect(pad(400).represented[1]).toBe(2)
  })
})
