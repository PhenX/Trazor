import { describe, expect, it } from 'vitest'
import { componentMembers, componentShape, findComponents } from '../../src/ink/components'
import { tallyContacts, ContactTally } from '../../src/ink/regions'
import { floodComponents } from './region-scenes'

/** A xorshift stream, as in inkvec's own component test. */
function xorshift(seed: bigint): (n: number) => number {
  let s = seed
  const mask = (1n << 64n) - 1n
  return (n) => {
    s ^= (s << 13n) & mask
    s ^= s >> 7n
    s ^= (s << 17n) & mask
    return Number(s % BigInt(n))
  }
}

function check(labels: Int32Array, w: number, h: number): void {
  const { comp, members } = floodComponents(labels, w, h)
  const c = findComponents(labels, w, h)
  expect(Array.from(c.comp)).toEqual(Array.from(comp))
  expect(c.count).toBe(members.length)
  const all = componentMembers(c, () => true)
  const { interior, foreign } = componentShape(c, w, h)
  const tally = new ContactTally(16)
  members.forEach((group, id) => {
    expect(c.size[id]).toBe(group.length)
    const sorted = [...group].sort((a, b) => a - b)
    expect(Array.from(all.pixels.subarray(all.offset[id], all.offset[id + 1]))).toEqual(sorted)
    // The per-component counts equal the per-group tally.
    const pixels = Int32Array.from(group)
    const t = tallyContacts(pixels, 0, pixels.length, id, c.comp, labels, w, h, tally)
    expect([interior[id], foreign[id]]).toEqual([t.interior, t.foreign])
  })
}

describe('findComponents', () => {
  it('equals the flood fill on random and degenerate maps', () => {
    check(new Int32Array(0), 0, 0)
    check(Int32Array.of(3), 1, 1)
    check(Int32Array.of(1, 1, 2, 2, 1, 1), 6, 1)
    check(Int32Array.of(1, 1, 2, 2, 1, 1), 1, 6)
    const next = xorshift(0x9e3779b97f4a7c15n)
    for (let round = 0; round < 300; round++) {
      const w = 1 + next(24)
      const h = 1 + next(24)
      const k = 1 + next(4)
      // Blobs of a few labels with speckle, so runs meet in every way.
      const labels = new Int32Array(w * h)
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          labels[y * w + x] = next(7) === 0 ? next(k) : (Math.floor(x / 3) ^ Math.floor(y / 2)) % k
      check(labels, w, h)
    }
    // A spiral of rings: components whose runs join only far down the image.
    const sp = new Int32Array(81)
    for (let y = 0; y < 9; y++)
      for (let x = 0; x < 9; x++) sp[y * 9 + x] = Math.min(x, y, 8 - x, 8 - y) % 2
    check(sp, 9, 9)
    expect(findComponents(sp, 9, 9).count).toBe(5)
  })

  it('keeps diagonal neighbors apart (4-connectivity)', () => {
    const c = findComponents(Int32Array.of(1, 0, 0, 1), 2, 2)
    expect(c.count).toBe(4)
    expect(Array.from(c.comp)).toEqual([0, 1, 2, 3])
  })

  it('lists only the selected components, each in raster order', () => {
    // 0 0 1
    // 2 0 1
    // 2 2 1
    const labels = Int32Array.of(0, 0, 1, 2, 0, 1, 2, 2, 1)
    const c = findComponents(labels, 3, 3)
    expect(Array.from(c.size)).toEqual([3, 3, 3])
    const m = componentMembers(c, (id) => id !== 1)
    expect(Array.from(m.offset)).toEqual([0, 3, 3, 6])
    expect(Array.from(m.pixels)).toEqual([0, 1, 4, 3, 6, 7])
  })

  it('counts interior pixels without the image border making a boundary', () => {
    const labels = new Int32Array(25)
    labels[12] = 1
    const c = findComponents(labels, 5, 5)
    const { interior, foreign } = componentShape(c, 5, 5)
    expect(interior[0]).toBe(20)
    expect(foreign[0]).toBe(4)
    expect(interior[1]).toBe(0)
    expect(foreign[1]).toBe(4)
  })
})
