import { describe, expect, it } from 'vitest'
import { gmsd } from './gmsd'
import { addNoise, makeImage, mulberry32 } from './testkit'

// The studio's `scripts/eval/metrics/gmsd.test.ts` vectors, ported verbatim so
// the engine and the studio panel are pinned to the same GMSD numbers.
describe('GMSD', () => {
  const rand = mulberry32(11)
  const texture = makeImage(192, 192, () => {
    const v = Math.floor(rand() * 256)
    return [v, v, v]
  })

  it('is 0 for identical images', () => {
    expect(gmsd(texture, texture)).toBeCloseTo(0, 6)
  })

  it('is positive for a degraded image', () => {
    expect(gmsd(addNoise(texture, 30, 2), texture)).toBeGreaterThan(0)
  })

  it('increases with distortion strength', () => {
    const light = gmsd(addNoise(texture, 10, 4), texture)
    const heavy = gmsd(addNoise(texture, 50, 4), texture)
    expect(heavy).toBeGreaterThan(light)
  })

  it('is symmetric in its arguments', () => {
    const noisy = addNoise(texture, 25, 6)
    expect(gmsd(noisy, texture)).toBeCloseTo(gmsd(texture, noisy), 6)
  })
})
