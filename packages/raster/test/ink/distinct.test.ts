import { rgbToOklab } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import {
  DistinctImage,
  STAT_PIXELS,
  colorIdsOfRgb,
  gcd,
  newClaim,
  sideOf,
  statStride,
  weightedLowerMedian,
} from '../../src/ink/distinct'
import type { ColorIds } from '../../src/ink/distinct'
import { ColorView, straddleFraction } from '../../src/ink/mdl'
import { InkAxes, blendPairs } from '../../src/ink/palette'
import { Lcg, mixLinear, paint } from './palette-helpers'
import type { TestImage } from './palette-helpers'

const RED = [0.9, 0.1, 0.1]
const BLUE = [0.1, 0.2, 0.9]
const GREEN = [0.1, 0.8, 0.2]
const lab = (c: readonly number[]): [number, number, number] => rgbToOklab(c[0], c[1], c[2])

describe('colorIdsOfRgb', () => {
  it('numbers colors by first occurrence, over a table that grows', () => {
    const n = 3 * 65536 + 17
    const rgb = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) rgb.set([((Math.floor(i / 7) + 3) % 5) / 4, 0.5, i % 2], i * 3)
    const ids = colorIdsOfRgb(rgb)
    // Reference: one sequential pass.
    const seen: string[] = []
    const reps: number[] = []
    const cid = new Int32Array(n)
    for (let i = 0; i < n; i++) {
      const key = `${rgb[i * 3]},${rgb[i * 3 + 1]},${rgb[i * 3 + 2]}`
      let id = seen.indexOf(key)
      if (id < 0) {
        seen.push(key)
        reps.push(i)
        id = seen.length - 1
      }
      cid[i] = id
    }
    expect(ids.count).toBe(seen.length)
    expect([...ids.reps]).toEqual(reps)
    expect(ids.cid).toEqual(cid)
    // Thousands of colors: the table rehashes and still numbers in order.
    const many = new Float32Array(5000 * 3)
    for (let i = 0; i < 5000; i++) many.set([(i % 97) / 97, Math.floor(i / 97) / 52, 0.25], i * 3)
    const big = colorIdsOfRgb(many)
    expect(big.count).toBe(5000)
    for (let i = 0; i < 5000; i++) expect(big.cid[i]).toBe(i)
  })

  it('tells signed zeros apart, and numbers nothing in an empty image', () => {
    const ids = colorIdsOfRgb(Float32Array.from([0, 0, 0, -0, 0, 0, 0, 0, 0]))
    expect([...ids.cid]).toEqual([0, 1, 0])
    expect(colorIdsOfRgb(new Float32Array(0)).count).toBe(0)
  })
})

describe('statistics helpers', () => {
  it('takes the weighted lower median of the pixels', () => {
    const rng = new Lcg(7)
    for (let trial = 0; trial < 500; trial++) {
      const k = rng.below(9) + 1
      const values: number[] = []
      const mult: number[] = []
      const pixels: number[] = []
      for (let i = 0; i < k; i++) {
        const v = rng.below(13) * 0.25
        const m = rng.below(4)
        values.push(v)
        mult.push(m)
        for (let j = 0; j < m; j++) pixels.push(v)
      }
      pixels.sort((a, b) => a - b)
      const want = pixels.length === 0 ? 0 : pixels[Math.floor(pixels.length / 2)]
      expect(weightedLowerMedian(values, mult)).toBe(want)
    }
  })

  it('sets the side bits by strict comparisons', () => {
    expect(sideOf(0.1, 0.2, 0.8)).toBe(1)
    expect(sideOf(0.9, 0.2, 0.8)).toBe(2)
    expect(sideOf(0.5, 0.2, 0.8)).toBe(0)
    expect(sideOf(0.2, 0.2, 0.8)).toBe(0)
    expect(sideOf(0.8, 0.2, 0.8)).toBe(0)
    expect(sideOf(Number.NaN, 0.2, 0.8)).toBe(0)
  })

  it('strides coprime with the row width above the cap', () => {
    expect(statStride(128 * 128, 128)).toBe(1)
    expect(statStride(STAT_PIXELS, 256)).toBe(1)
    expect(statStride(1_000_000, 0)).toBe(1)
    expect(statStride(512 * 512, 512)).toBe(5)
    expect(statStride(300 * 300, 300)).toBe(7)
    expect(gcd(12, 18)).toBe(6)
    expect(gcd(7, 300)).toBe(1)
  })
})

/** One pixel per OKLab color, numbered: the distinct image of a list of colors. */
function idsOfLab(colors: number[][]): { ids: ColorIds; lab: Float64Array } {
  const keys: string[] = []
  const cid = new Int32Array(colors.length)
  const reps: number[] = []
  const values: number[] = []
  colors.forEach((c, i) => {
    const key = c.join(',')
    let id = keys.indexOf(key)
    if (id < 0) {
      keys.push(key)
      reps.push(i)
      values.push(...c)
      id = keys.length - 1
    }
    cid[i] = id
  })
  return {
    ids: { cid, reps: Int32Array.from(reps), count: keys.length },
    lab: Float64Array.from(values),
  }
}

/** Per color (OKLab, three per color), the distance to the nearest of `inks`. */
function nearestOf(colors: Float64Array, inks: number[][]): Float64Array {
  const out = new Float64Array(colors.length / 3).fill(Infinity)
  for (let d = 0; d < out.length; d++) {
    for (const q of inks) {
      const dd = Math.hypot(
        colors[d * 3] - q[0],
        colors[d * 3 + 1] - q[1],
        colors[d * 3 + 2] - q[2],
      )
      out[d] = Math.min(out[d], dd)
    }
  }
  return out
}

describe('DistinctImage', () => {
  it('counts the claim, scales it by the stride and takes the members’ median distance', () => {
    const c = [0.5, 0, 0]
    const px = Array.from({ length: 10 }, (_, k) => [0.5 + 0.001 * k, 0, 0])
    const { ids, lab: colors } = idsOfLab(px)
    const inf = new Float64Array(ids.count).fill(Infinity)
    const img = new DistinctImage(ids, 10, 1, 1)
    const claim = newClaim(ids.count)
    expect(img.claim(claim, inf, colors, c[0], c[1], c[2])).toBe(10)
    // Ten sorted distances: the lower median is element 5.
    expect(img.spread(claim, 1)).toBeCloseTo(0.005, 9)
    // Members within 0.0035: four of them, element 2.
    expect(img.spread(claim, 0.0035)).toBeCloseTo(0.002, 9)
    expect(img.spread(claim, 0)).toBe(0)
    // Every other pixel, scaled back up.
    expect(
      new DistinctImage(ids, 10, 1, 2).claim(newClaim(ids.count), inf, colors, c[0], c[1], c[2]),
    ).toBe(10)
    // Colors already at an accepted ink are not claimed.
    const taken = inf.slice()
    taken.fill(0, 6)
    expect(img.claim(claim, taken, colors, c[0], c[1], c[2])).toBe(6)
  })

  it('measures the interior as one step of 4-neighbor erosion, the outside counting as claimed', () => {
    const red = lab(RED)
    const c = lab([0.2, 0.6, 0.3])
    const run = (
      colors: number[][],
      cand: number[],
      w: number,
      h: number,
      taken = false,
    ): number => {
      const { ids, lab: l } = idsOfLab(colors)
      const img = new DistinctImage(ids, w, h, 1)
      const claim = newClaim(ids.count)
      const nearest = taken ? new Float64Array(ids.count) : nearestOf(l, [red])
      img.claim(claim, nearest, l, cand[0], cand[1], cand[2])
      return img.interior(claim, img.claimedPixels(claim))
    }
    // A 3×3 block in a 5×5 field: only its center is interior.
    const block = Array.from({ length: 25 }, (_, i) =>
      i % 5 >= 1 && i % 5 <= 3 && i >= 5 && i < 20 ? c : red,
    )
    expect(run(block, c, 5, 5)).toBeCloseTo(1 / 9, 6)
    // The top two rows: row 0 is interior (its missing neighbors are off the image), row 1 not.
    const top = Array.from({ length: 25 }, (_, i) => (i < 10 ? c : red))
    expect(run(top, c, 5, 5)).toBeCloseTo(0.5, 6)
    // The right two columns.
    const right = Array.from({ length: 25 }, (_, i) => (i % 5 >= 3 ? c : red))
    expect(run(right, c, 5, 5)).toBeCloseTo(0.5, 6)
    // Nothing claimed: zero. No grid: solid.
    expect(run(top, lab(GREEN), 5, 5, true)).toBe(0)
    const { ids } = idsOfLab(top)
    expect(new DistinctImage(ids, 0, 0, 1).interior(newClaim(ids.count), new Int32Array(0))).toBe(1)
  })
})

/** The straddle fraction of candidate `c` along the pair `(a, b)` in linear light, over `img`. */
function straddleOf(
  img: TestImage,
  c: readonly number[],
  a: readonly number[],
  b: readonly number[],
  w = img.w,
): number {
  const ids = colorIdsOfRgb(img.rgb)
  const view = new ColorView(img.rgb, ids, w, img.h)
  const axes = InkAxes.of([...lab(a), ...lab(b)])
  const nearest = new Float64Array(ids.count).fill(Infinity)
  for (const ink of [a, b]) {
    const q = lab(ink)
    for (let d = 0; d < ids.count; d++) {
      const dd = Math.hypot(
        view.lab[d * 3] - q[0],
        view.lab[d * 3 + 1] - q[1],
        view.lab[d * 3 + 2] - q[2],
      )
      nearest[d] = Math.min(nearest[d], dd)
    }
  }
  const claim = newClaim(ids.count)
  const cl = lab(c)
  view.img.claim(claim, nearest, view.lab, cl[0], cl[1], cl[2])
  const hoods = view.img.neighborhoods(view.img.claimedPixels(claim))
  return straddleFraction(
    view,
    hoods,
    cl[0],
    cl[1],
    cl[2],
    axes,
    { i: 0, j: 1, linear: true, off: 0 },
    new Uint8Array(ids.count + 1),
  )
}

describe('straddleFraction', () => {
  const c = mixLinear(RED, BLUE, 0.5)

  it('reads a one-pixel blend band as straddling and a two-pixel band as not', () => {
    const aa = paint(7, 3, (x) => (x <= 2 ? RED : x === 3 ? c : BLUE))
    expect(straddleOf(aa, c, RED, BLUE)).toBe(1)
    const band = paint(8, 3, (x) => (x <= 2 ? RED : x <= 4 ? c : BLUE))
    expect(straddleOf(band, c, RED, BLUE)).toBe(0)
    // A one-pixel band on the top rows and a two-pixel one below: the pixels whose 3×3 holds both inks.
    const mixed = paint(8, 4, (x, y) => (x <= 2 ? RED : x === 3 || (x === 4 && y >= 2) ? c : BLUE))
    expect(straddleOf(mixed, c, RED, BLUE)).toBeCloseTo(3 / 6, 6)
  })

  it('judges a blend near one end by the room left on that side', () => {
    for (const t of [0.9, 0.1]) {
      const m = mixLinear(RED, BLUE, t)
      expect(
        straddleOf(
          paint(7, 3, (x) => (x <= 2 ? RED : x === 3 ? m : BLUE)),
          m,
          RED,
          BLUE,
        ),
      ).toBe(1)
    }
  })

  it('is zero without a grid or along a degenerate axis, and one with nothing claimed', () => {
    const flat = paint(3, 3, () => RED)
    expect(straddleOf(flat, GREEN, RED, BLUE, 0)).toBe(0)
    expect(straddleOf(flat, RED, RED, RED)).toBe(0)
    // Every pixel is red, exactly at an ink: the candidate claims nothing.
    expect(straddleOf(flat, GREEN, RED, BLUE)).toBe(1)
  })

  it('agrees with the pair the blend test reports', () => {
    const [l, a, b] = lab(c)
    const pairs = blendPairs(l, a, b, InkAxes.of([...lab(RED), ...lab(BLUE)]), 0.056, 0.04)
    expect(pairs.some((p) => p.linear && p.i === 0 && p.j === 1)).toBe(true)
  })
})
