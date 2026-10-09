import { describe, expect, it } from 'vitest'
import { mixtureResidual, overshootResidual } from '../src/represent'

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
