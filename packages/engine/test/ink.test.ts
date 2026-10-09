import { describe, expect, it } from 'vitest'
import { inkFrontEnd } from '../src/ink'

describe('the ink front end', () => {
  it('keeps every ink of a flat mosaic', () => {
    // 6 × 6 cells of 36 distinct colors, 8 px each: the classic palette budget
    // would merge some; description length keeps them all.
    const w = 48
    const h = 48
    const data = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = Math.floor(y / 8) * 6 + Math.floor(x / 8)
        data.set([40 + 6 * k, 230 - 5 * k, (k * 47) % 256, 255], 4 * (y * w + x))
      }
    }
    const front = inkFrontEnd({ width: w, height: h, data }, 1, false)
    expect(front.labels.count).toBe(36)
    expect(front.counts.reduce((a, b) => a + b, 0)).toBe(w * h)
    expect(new Set(front.labels.data).size).toBe(36)
    expect(front.sigmaNoise).toBeGreaterThan(0)
  })
})
