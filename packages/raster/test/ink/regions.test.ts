import { describe, expect, it } from 'vitest'
import { findComponents } from '../../src/ink/components'
import {
  MAX_FACES,
  absorbBlendSlivers,
  capComponents,
  despeckle,
  mixture,
  reassignBlendPixels,
  relabelRounds,
  splitComponents,
  type Mixture,
} from '../../src/ink/regions'
import {
  compositeOverWhite,
  decodeRle,
  f32,
  floodComponents,
  mosaicScene,
  seamScene,
  translucentScene,
} from './region-scenes'
import type { Scene } from './region-scenes'
import { PARITY_FIXTURES } from './regions-parity'

const cols = (...c: number[][]): Float64Array => Float64Array.from(c.flat())

/** A 64-bit LCG (inkvec's test stream): the next 31-bit draw. */
function lcg(seed: bigint): () => number {
  let s = seed
  const mask = (1n << 64n) - 1n
  return () => {
    s = (s * 6364136223846793005n + 1442695040888963407n) & mask
    return Number(s >> 33n)
  }
}

/** Random maps of 1 to 5 labels, noise and blocks, at odd sizes including one row and one column. */
function randomMaps(): { labels: Int32Array; w: number; h: number }[] {
  const next = lcg(7n)
  const out: { labels: Int32Array; w: number; h: number }[] = []
  for (const [w, h] of [
    [1, 1],
    [1, 9],
    [9, 1],
    [5, 4],
    [17, 11],
    [40, 33],
  ]) {
    for (let k = 1; k <= 5; k++) {
      const noise = Int32Array.from({ length: w * h }, () => next() % k)
      const blocks = Int32Array.from(
        { length: w * h },
        (_, p) => (Math.floor((p % w) / 3) + Math.floor(Math.floor(p / w) / 2)) % k,
      )
      out.push({ labels: noise, w, h }, { labels: blocks, w, h })
    }
  }
  return out
}

/** Despeckle by flood fill and a per-component tally: the reference the run-based one equals. */
function referenceDespeckle(labels: Int32Array, w: number, h: number, minSize: number): void {
  if (minSize <= 1) return
  const { comp, members } = floodComponents(labels, w, h)
  members.forEach((group, id) => {
    if (group.length >= minSize) return
    const tally = new Map<number, number>()
    for (const p of group) {
      const x = p % w
      const y = (p - x) / w
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const q = ny * w + nx
        if (comp[q] !== id) tally.set(labels[q], (tally.get(labels[q]) ?? 0) + 1)
      }
    }
    let best = -1
    let bestCount = 0
    for (const [l, c] of tally) {
      if (c > bestCount || (c === bestCount && l < best)) {
        best = l
        bestCount = c
      }
    }
    if (best >= 0) for (const p of group) labels[p] = best
  })
}

describe('mixture', () => {
  const out: Mixture = { r: 0, who: -1 }

  it('reads a two-ink blend as explained, its dominant ink the nearer end', () => {
    const inks = cols([0.9, 0.1, 0.1], [0.1, 0.1, 0.9])
    expect(mixture([0.66, 0.1, 0.34], 0, inks, 2, 3, out)).toBe(true)
    expect(out.r).toBeCloseTo(0, 6)
    expect(out.who).toBe(0)
    expect(mixture([0.34, 0.1, 0.66], 0, inks, 2, 3, out)).toBe(true)
    expect(out.who).toBe(1)
  })

  it('reads a three-ink blend inside the triangle, dominant the largest weight', () => {
    const inks = cols([1, 0, 0], [0, 1, 0], [0, 0, 1])
    expect(mixture([0.2, 0.3, 0.5], 0, inks, 3, 3, out)).toBe(true)
    expect(out.r).toBeCloseTo(0, 6)
    expect(out.who).toBe(2)
    // Off the plane: the distance to it.
    mixture([0.5, 0.5, 0.5], 0, inks, 3, 3, out)
    expect(out.r).toBeCloseTo(Math.sqrt(3) / 6, 6)
  })

  it('reads a color off every blend by its distance to the nearest end', () => {
    const inks = cols([0, 0, 0], [0.2, 0, 0])
    mixture([0.5, 0, 0], 0, inks, 2, 3, out)
    expect(out.r).toBeCloseTo(0.3, 6)
    expect(out.who).toBe(1)
  })

  it('reads a color at an offset into a pixel array, in any channel count', () => {
    const px = Float32Array.of(9, 9, 9, 9, 0.5, 0.5, 0.5, 0.5)
    const inks = cols([0, 0, 0, 0], [1, 1, 1, 1])
    expect(mixture(px, 4, inks, 2, 4, out)).toBe(true)
    expect(out.r).toBeCloseTo(0, 6)
  })

  it('needs two distinct inks', () => {
    expect(mixture([0.5, 0.5, 0.5], 0, cols([0, 0, 0]), 1, 3, out)).toBe(false)
    expect(mixture([0.5, 0.5, 0.5], 0, cols([0.3, 0.3, 0.3], [0.3, 0.3, 0.3]), 2, 3, out)).toBe(
      false,
    )
  })
})

describe('despeckle', () => {
  it('folds a single pixel into its surroundings', () => {
    const labels = Int32Array.of(0, 0, 0, 0, 1, 0, 0, 0, 0)
    despeckle(labels, 3, 3, 2)
    expect(labels[4]).toBe(0)
  })

  it('hands a speckle to its commonest neighbor, ties to the lower label', () => {
    // A pixel of 5 touching two 3s and two 1s.
    const labels = Int32Array.of(9, 3, 9, 3, 5, 1, 9, 1, 9)
    despeckle(labels, 3, 3, 2)
    expect(labels[4]).toBe(1)
    // Three of 2 against one of 0.
    const more = Int32Array.of(7, 2, 7, 2, 4, 2, 7, 0, 7)
    despeckle(more, 3, 3, 2)
    expect(more[4]).toBe(2)
  })

  it('reads neighbors under the labels earlier speckles took', () => {
    // Speckles 5 (first in raster order) and 6 touch; 5 joins 0, so 6 sees 0 twice.
    const labels = Int32Array.of(0, 0, 0, 0, 0, 5, 6, 1, 1, 1, 1, 1)
    despeckle(labels, 4, 3, 2)
    expect(labels[5]).toBe(0)
    expect(labels[6]).toBe(0)
  })

  it('leaves a one-label image alone, handles an empty one, and is a no-op below 2', () => {
    const one = new Int32Array(12).fill(3)
    despeckle(one, 4, 3, 100)
    expect(Array.from(one)).toEqual(new Array(12).fill(3))
    despeckle(new Int32Array(0), 0, 0, 4)
    const speck = Int32Array.of(0, 0, 0, 0, 1, 0, 0, 0, 0)
    despeckle(speck, 3, 3, 1)
    expect(speck[4]).toBe(1)
  })

  it('equals the flood-fill despeckle on random maps', () => {
    for (const { labels, w, h } of randomMaps()) {
      for (const min of [2, 3, 5, 9]) {
        const a = labels.slice()
        const b = labels.slice()
        referenceDespeckle(a, w, h, min)
        despeckle(b, w, h, min)
        expect(Array.from(b)).toEqual(Array.from(a))
      }
    }
  })
})

/** Two inks side by side with a two-column anti-aliased seam labeled with a third. */
function seam(alpha: number | null): {
  labels: Int32Array
  rgb: Float32Array
  alpha: Float32Array | null
  w: number
  h: number
  inks: Float64Array
} {
  const w = 12
  const h = 6
  const red = [0.9, 0.1, 0.1]
  const blue = [0.1, 0.1, 0.9]
  const inks = cols(red, blue, [0.5, 0.1, 0.5])
  const labels = new Int32Array(w * h)
  const rgb = new Float32Array(w * h * 3)
  const a = alpha === null ? null : new Float32Array(w * h).fill(1)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      // Coverage of red: 1 left of the seam, 0.6 and 0.4 across it, 0 right of it.
      const t = x < 5 ? 1 : x === 5 ? 0.6 : x === 6 ? 0.4 : 0
      let c = [0, 1, 2].map((k) => red[k] * t + blue[k] * (1 - t))
      if (x === 5 || x === 6) {
        labels[p] = 2
        if (a !== null && alpha !== null) {
          a[p] = alpha
          c = c.map((v) => v * alpha + (1 - alpha))
        }
      } else labels[p] = x < 5 ? 0 : 1
      rgb.set(c, p * 3)
    }
  }
  return { labels, rgb, alpha: a, w, h, inks }
}

describe('absorbBlendSlivers', () => {
  it('splits a blend seam between two inks down the middle', () => {
    const s = seam(null)
    const n = absorbBlendSlivers(s.labels, s.rgb, s.alpha, s.w, s.h, s.inks, 0.002)
    expect(n).toBe(1)
    for (let y = 0; y < s.h; y++) {
      expect(s.labels[y * s.w + 5]).toBe(0)
      expect(s.labels[y * s.w + 6]).toBe(1)
    }
  })

  it('keeps a thin real ink that is no blend of its neighbors', () => {
    // A dark one-pixel line between white and yellow: off the white–yellow segment.
    const w = 10
    const h = 7
    const inks = cols([1, 1, 1], [0.95, 0.85, 0.3], [0.1, 0.1, 0.12])
    const labels = new Int32Array(w * h)
    const rgb = new Float32Array(w * h * 3)
    for (let p = 0; p < w * h; p++) {
      const y = Math.floor(p / w)
      labels[p] = y < 3 ? 0 : y === 3 ? 2 : 1
      rgb.set(inks.subarray(labels[p] * 3, labels[p] * 3 + 3), p * 3)
    }
    const before = labels.slice()
    expect(absorbBlendSlivers(labels, rgb, null, w, h, inks, 0.002)).toBe(0)
    expect(Array.from(labels)).toEqual(Array.from(before))
  })

  it('keeps a blob with a real interior', () => {
    const w = 9
    const h = 9
    const inks = cols([0.9, 0.1, 0.1], [0.1, 0.1, 0.9], [0.5, 0.1, 0.5])
    const labels = new Int32Array(w * h)
    const rgb = new Float32Array(w * h * 3)
    for (let p = 0; p < w * h; p++) {
      const x = p % w
      const y = Math.floor(p / w)
      labels[p] = x >= 2 && x < 7 && y >= 2 && y < 7 ? 2 : x < 4 ? 0 : 1
      rgb.set(inks.subarray(labels[p] * 3, labels[p] * 3 + 3), p * 3)
    }
    expect(absorbBlendSlivers(labels, rgb, null, w, h, inks, 0.002)).toBe(0)
  })

  it('reads a translucent seam as a blend with the white backdrop, and hands it to the real inks', () => {
    const opaque = seam(0.5)
    // Without the alpha that says it is translucent, nothing explains the seam.
    expect(
      absorbBlendSlivers(opaque.labels, opaque.rgb, null, opaque.w, opaque.h, opaque.inks, 0.002),
    ).toBe(0)
    const s = seam(0.5)
    expect(absorbBlendSlivers(s.labels, s.rgb, s.alpha, s.w, s.h, s.inks, 0.002)).toBe(1)
    for (let y = 0; y < s.h; y++) {
      expect(s.labels[y * s.w + 5]).toBe(0)
      expect(s.labels[y * s.w + 6]).toBe(1)
    }
  })

  it('is deterministic', () => {
    const scene = seamScene()
    const rgb = compositeOverWhite(scene)
    const fx = PARITY_FIXTURES[0]
    const inks = f32(fx.pal)
    const a = decodeRle(fx.cases[3].labels0)
    const b = a.slice()
    absorbBlendSlivers(a, rgb, scene.alpha, scene.w, scene.h, inks, 0.004)
    absorbBlendSlivers(b, rgb, scene.alpha, scene.w, scene.h, inks, 0.004)
    expect(Array.from(a)).toEqual(Array.from(b))
  })
})

describe('reassignBlendPixels', () => {
  it('moves a lone blend pixel to the ink it mostly is', () => {
    // Red | blue with one seam pixel, 70 % red, labeled with a purple off their segment.
    const w = 6
    const h = 3
    const inks = cols([0.9, 0.1, 0.1], [0.1, 0.1, 0.9], [0.6, 0, 0.7])
    const labels = Int32Array.of(0, 0, 0, 1, 1, 1, 0, 0, 2, 1, 1, 1, 0, 0, 0, 1, 1, 1)
    const rgb = new Float32Array(w * h * 3)
    for (let p = 0; p < w * h; p++) rgb.set(inks.subarray(labels[p] * 3, labels[p] * 3 + 3), p * 3)
    rgb.set([0.66, 0.1, 0.34], 8 * 3)
    expect(reassignBlendPixels(labels, rgb, null, w, h, inks, 0.002)).toBe(1)
    expect(labels[8]).toBe(0)
  })

  it('leaves a pixel that plausibly is its own ink', () => {
    const w = 6
    const h = 3
    // The purple sits just off the red–blue segment, and the pixel just off both.
    const inks = cols([0.9, 0.1, 0.1], [0.1, 0.1, 0.9], [0.5, 0.12, 0.5])
    const labels = Int32Array.of(0, 0, 0, 1, 1, 1, 0, 0, 2, 1, 1, 1, 0, 0, 0, 1, 1, 1)
    const rgb = new Float32Array(w * h * 3)
    for (let p = 0; p < w * h; p++) rgb.set(inks.subarray(labels[p] * 3, labels[p] * 3 + 3), p * 3)
    rgb.set([0.52, 0.115, 0.48], 8 * 3)
    expect(reassignBlendPixels(labels, rgb, null, w, h, inks, 0.002)).toBe(0)
    expect(labels[8]).toBe(2)
  })
})

describe('relabelRounds', () => {
  it('follows a cascade to the end', () => {
    // Each pixel of the middle row takes label 1 once its left neighbor has it.
    const w = 12
    const labels = new Int32Array(w * 3)
    labels[w] = 1
    const moved = relabelRounds(labels, w, 3, 5, (snap, p) =>
      p % w > 0 && Math.floor(p / w) === 1 && snap[p] === 0 && snap[p - 1] === 1 ? 1 : -1,
    )
    expect(moved).toBe(5)
    expect(Array.from(labels.subarray(w, 2 * w))).toEqual([1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0])
  })

  it('moves exactly as deciding every pixel every round', () => {
    // A 3×3 majority rule: a pixel takes the label held by five or more of its neighborhood.
    const rule = (snap: Int32Array, p: number, w: number, h: number): number => {
      const x = p % w
      const y = (p - x) / w
      const counts = new Map<number, number>()
      for (let qy = Math.max(0, y - 1); qy < Math.min(h, y + 2); qy++)
        for (let qx = Math.max(0, x - 1); qx < Math.min(w, x + 2); qx++) {
          const l = snap[qy * w + qx]
          counts.set(l, (counts.get(l) ?? 0) + 1)
        }
      for (const [l, c] of counts) if (c >= 5 && l !== snap[p]) return l
      return -1
    }
    for (const { labels, w, h } of randomMaps()) {
      const a = labels.slice()
      let movedA = 0
      for (let round = 0; round < 4; round++) {
        const snap = a.slice()
        let m = 0
        for (let p = 0; p < w * h; p++) {
          const t = rule(snap, p, w, h)
          if (t >= 0) {
            a[p] = t
            m++
          }
        }
        movedA += m
        if (m === 0) break
      }
      const b = labels.slice()
      const movedB = relabelRounds(b, w, h, 4, (snap, p) => rule(snap, p, w, h))
      expect(movedB).toBe(movedA)
      expect(Array.from(b)).toEqual(Array.from(a))
    }
  })
})

describe('splitComponents', () => {
  it('numbers each 4-connected component as its own face', () => {
    const labels = Int32Array.of(1, 1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0)
    const { faces, faceLabel, count } = splitComponents(labels, 4, 4)
    expect(count).toBe(3)
    expect(faces[0]).not.toBe(faces[3])
    expect(Array.from(faceLabel)).toEqual([1, 0, 1])
  })

  it('numbers faces in raster order of their first pixel, as the flood fill does', () => {
    for (const { labels, w, h } of randomMaps()) {
      const { faces, faceLabel, count } = splitComponents(labels, w, h)
      const { comp, members } = floodComponents(labels, w, h)
      expect(Array.from(faces)).toEqual(Array.from(comp))
      expect(count).toBe(members.length)
      expect(Array.from(faceLabel)).toEqual(members.map((g) => labels[g[0]]))
    }
  })

  it('merges the smallest components when there are more than face ids', () => {
    // A 300 × 300 checkerboard: 90,000 one-pixel components.
    const w = 300
    const h = 300
    const labels = Int32Array.from({ length: w * h }, (_, p) => ((p % w) + Math.floor(p / w)) % 2)
    expect(findComponents(labels, w, h).count).toBeGreaterThan(MAX_FACES)
    const { faces, faceLabel, count } = splitComponents(labels, w, h)
    expect(count).toBeLessThanOrEqual(MAX_FACES)
    expect(faces.every((f) => f < count)).toBe(true)
    // Each face id is exactly one 4-connected component of the face map, of one input label.
    expect(findComponents(faces, w, h).count).toBe(count)
    expect(faceLabel.every((l) => l < 2)).toBe(true)
    // The input is untouched.
    expect(labels[1]).toBe(1)
  })
})

describe('capComponents', () => {
  it('merges whole components into a neighbor until the cap holds', () => {
    for (const { labels, w, h } of randomMaps()) {
      const before = findComponents(labels, w, h)
      for (const cap of [1, 2, 3, 7, Math.max(before.count - 1, 0), before.count]) {
        const capped = labels.slice()
        const moved = capComponents(capped, w, h, cap)
        expect(findComponents(capped, w, h).count).toBeLessThanOrEqual(Math.max(cap, 1))
        // Under the cap nothing changes.
        const under = before.count <= Math.max(cap, 1)
        const unchanged = capped.every((l, p) => l === labels[p])
        expect(!under || (unchanged && moved === 0)).toBe(true)
        // Each original component is unchanged or one new label throughout; with one
        // component to remove, one relabeling, to a label a 4-neighboring component carried.
        const oneRound = cap + 1 === before.count && cap >= 1
        expect(!oneRound || moved === 1).toBe(true)
        for (let c = 0; c < before.count; c++) {
          const px: number[] = []
          for (let p = 0; p < w * h; p++) if (before.comp[p] === c) px.push(p)
          const now = capped[px[0]]
          expect(px.every((p) => capped[p] === now)).toBe(true)
          expect(labels.includes(now)).toBe(true)
          const touches = px.some((p) => {
            const x = p % w
            const y = (p - x) / w
            return [
              x > 0 ? p - 1 : -1,
              x + 1 < w ? p + 1 : -1,
              y > 0 ? p - w : -1,
              y + 1 < h ? p + w : -1,
            ].some((q) => q >= 0 && before.comp[q] !== c && labels[q] === now)
          })
          expect(!oneRound || now === labels[px[0]] || touches).toBe(true)
        }
      }
    }
  })

  it('takes the smallest first, each into its commonest neighbor', () => {
    // 0 0 0 0
    // 0 1 0 2
    // 0 0 0 2
    // Components: 0 (10 px), 1 (1 px), 2 (2 px). One to remove: the 1, into 0.
    const labels = Int32Array.of(0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 0, 2)
    expect(capComponents(labels, 4, 3, 2)).toBe(1)
    expect(Array.from(labels)).toEqual([0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 2])
  })
})

describe('parity with inkvec', () => {
  const scenes: Record<string, () => Scene> = {
    seam: seamScene,
    translucent: translucentScene,
    mosaic: mosaicScene,
  }

  for (const fx of PARITY_FIXTURES) {
    it(`reproduces every clean-up stage of the ${fx.name} scene label for label`, () => {
      const scene = scenes[fx.name]()
      const { w, h, alpha } = scene
      const rgb = compositeOverWhite(scene)
      const inks = f32(fx.pal)
      for (const c of fx.cases) {
        let l = decodeRle(c.labels0)
        despeckle(l, w, h, c.min)
        expect(Array.from(l), `${c.name} despeckle`).toEqual(Array.from(decodeRle(c.despeckle)))

        l = decodeRle(c.despeckle)
        expect(absorbBlendSlivers(l, rgb, alpha, w, h, inks, c.sigma), `${c.name} absorbed`).toBe(
          c.absorbed,
        )
        expect(Array.from(l), `${c.name} absorb`).toEqual(Array.from(decodeRle(c.absorb)))

        l = decodeRle(c.absorb)
        expect(reassignBlendPixels(l, rgb, alpha, w, h, inks, c.sigma), `${c.name} moved`).toBe(
          c.moved,
        )
        expect(Array.from(l), `${c.name} reassign`).toEqual(Array.from(decodeRle(c.reassign)))

        l = decodeRle(c.reassign)
        if (c.absorbed > 0 || c.moved > 0) despeckle(l, w, h, c.min)
        expect(Array.from(l), `${c.name} despeckle2`).toEqual(Array.from(decodeRle(c.despeckle2)))

        const split = splitComponents(decodeRle(c.despeckle2), w, h)
        expect(Array.from(split.faces), `${c.name} faces`).toEqual(Array.from(decodeRle(c.faces)))
        expect(Array.from(split.faceLabel), `${c.name} face labels`).toEqual(c.faceLabel)
      }
    })
  }
})
