import { describe, expect, it } from 'vitest'
import { mergeGradientBands } from '../../src/fill/bands'
import { CARVE_MAX, carveResidualFeatures } from '../../src/fill/carve'
import { flatOnly, isGradient, representative } from '../../src/fill/model'
import type { FillFit } from '../../src/fill/model'
import { bicLambda, fitFill } from '../../src/fill/select'
import { BANDS_REFS } from './bands-fixtures'
import {
  decodeRef,
  distinct,
  expectSameFills,
  labelDiff,
  labelsOf,
  parseFill,
  q8,
} from './bands-helpers'

/** A `w × h` image of one color, three values per pixel. */
function solid(w: number, h: number, c: readonly number[]): Float32Array {
  const rgb = new Float32Array(3 * w * h)
  for (let p = 0; p < w * h; p++) rgb.set(c, 3 * p)
  return rgb
}

/** Paint the rectangle `[x0, x1) × [y0, y1)` of `rgb` with `c` (and of `labels` with `l` when given). */
function paint(
  rgb: Float32Array,
  w: number,
  rect: [number, number, number, number],
  c: readonly number[],
  labels?: Int32Array,
  l?: number,
): void {
  const [x0, y0, x1, y1] = rect
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      rgb.set(c, 3 * (y * w + x))
      if (labels !== undefined && l !== undefined) labels[y * w + x] = l
    }
  }
}

/** The carve of a scene: labels, fills and ink after it, and the count minted. */
function carve(
  rgb: Float32Array,
  labels: Int32Array,
  w: number,
  h: number,
  palette: readonly number[],
  fills: FillFit[],
  sigma = 0.5 / 255,
  minSize = 2,
  detail: number | null = null,
): { labels: Int32Array; fills: FillFit[]; ink: number[]; minted: number } {
  const out = labels.slice()
  const f = fills.slice()
  const ink = Array.from({ length: fills.length }, (_, i) => i)
  const minted = carveResidualFeatures(out, rgb, w, h, palette, f, ink, sigma, 1, minSize, detail)
  return { labels: out, fills: f, ink, minted }
}

const BLACK = [0, 0, 0]
const WHITE = [1, 1, 1]

describe('carve', () => {
  it('lets the interior noise reveal a faint stroke that boundary noise hides', () => {
    const w = 32
    const h = 32
    const rgb = solid(w, h, WHITE)
    const faint = [0.88, 1, 1]
    for (let y = 8; y < 24; y++) {
      rgb.set(faint, 3 * (y * w + 12))
      rgb.set(faint, 3 * (y * w + 1))
    }
    const run = (detail: number | null): Int32Array =>
      carve(rgb, new Int32Array(w * h), w, h, WHITE, [flatOnly([1, 1, 1], 1)], 8 / 255, 2, detail)
        .labels
    expect(run(null)[16 * w + 12]).toBe(0)
    const detailed = run(0.5 / 255)
    expect(detailed[16 * w + 12]).not.toBe(0)
    expect(detailed[16 * w + 1]).toBe(0)
  })

  it('carves a swallowed feature back out of the region that hid it', { timeout: 30_000 }, () => {
    // One label for the whole image: a black square inside a region called white.
    const w = 24
    const h = 24
    const rgb = solid(w, h, WHITE)
    paint(rgb, w, [8, 8, 16, 16], BLACK)
    const labels = new Int32Array(w * h)
    const lambda = bicLambda(w * h)
    const merge = mergeGradientBands(labels, rgb, w, h, WHITE, 0.5 / 255, lambda)
    const n = carveResidualFeatures(
      labels,
      rgb,
      w,
      h,
      WHITE,
      merge.fills,
      merge.ink,
      0.5 / 255,
      lambda,
      2,
    )
    expect(n).toBeGreaterThan(0)
    const regions = distinct(labels)
    expect(regions).toHaveLength(2)
    const reps = regions.map((l) => representative(merge.fills[l].model))
    expect(reps.some((c) => c.every((v) => v < 0.05))).toBe(true)
  })

  it('carves a seam through a solid shape and refits the shape flat', () => {
    const w = 24
    const h = 16
    const rgb = solid(w, h, BLACK)
    paint(rgb, w, [4, 7, 20, 9], WHITE)
    const r = carve(
      rgb,
      new Int32Array(w * h),
      w,
      h,
      [...BLACK, ...WHITE],
      [flatOnly([0, 0, 0], 1), flatOnly([1, 1, 1], 1)],
    )
    expect(r.minted).toBe(1)
    expect(r.labels[8 * w + 10]).toBe(2)
    expect(r.labels[2 * w + 2]).toBe(0)
    expect(r.ink[2]).toBe(1)
    expect(r.fills[2].model).toEqual({ kind: 'flat', color: [1, 1, 1] })
    expect(r.fills[0].model).toEqual({ kind: 'flat', color: [0, 0, 0] })
  })

  it('leaves a blend next to another ink alone and carves the same fleck away from it', () => {
    // White (label 1) left of x = 10, black (label 0) right of it; a 1 × 4 gray fleck in the
    // black, two pixels from the white (a blend towards it) or five (a feature).
    const w = 24
    const h = 14
    const run = (x: number): number => {
      const rgb = solid(w, h, BLACK)
      const labels = new Int32Array(w * h)
      paint(rgb, w, [0, 0, 10, h], WHITE, labels, 1)
      paint(rgb, w, [x, 5, x + 1, 9], [0.5, 0.5, 0.5])
      return carve(
        rgb,
        labels,
        w,
        h,
        [...BLACK, ...WHITE],
        [flatOnly([0, 0, 0], 1), flatOnly([1, 1, 1], 1)],
      ).minted
    }
    expect(run(11)).toBe(0)
    expect(run(15)).toBe(1)
  })

  it('takes clusters of at least max(minSize, 4) pixels', () => {
    const w = 24
    const h = 16
    const rgb = solid(w, h, BLACK)
    paint(rgb, w, [3, 3, 6, 4], WHITE) // three pixels
    paint(rgb, w, [10, 3, 15, 4], WHITE) // five pixels
    const fills = [flatOnly([0, 0, 0], 1)]
    const at = (minSize: number): Int32Array =>
      carve(rgb, new Int32Array(w * h), w, h, BLACK, fills, 0.5 / 255, minSize).labels
    expect(at(2)[3 * w + 4]).toBe(0)
    expect(at(2)[3 * w + 12]).toBe(1)
    expect(at(6)[3 * w + 12]).toBe(0)
  })

  it(`mints at most ${CARVE_MAX} features, in raster order`, () => {
    const w = 84
    const h = 24
    const rgb = solid(w, h, BLACK)
    const dots: number[] = []
    for (let y = 2; y + 2 < h && dots.length < 70; y += 4) {
      for (let x = 2; x + 2 < w && dots.length < 70; x += 4) {
        paint(rgb, w, [x, y, x + 2, y + 2], WHITE)
        dots.push(y * w + x)
      }
    }
    const r = carve(rgb, new Int32Array(w * h), w, h, BLACK, [flatOnly([0, 0, 0], 1)])
    expect(r.minted).toBe(CARVE_MAX)
    expect(dots.map((p) => r.labels[p] !== 0)).toEqual(dots.map((_, i) => i < CARVE_MAX))
    expect(r.fills).toHaveLength(1 + CARVE_MAX)
  })

  it('leaves a region with fewer than eight pure interior pixels alone', () => {
    const run = (rh: number): number => {
      // A black region 4 wide and rh tall inside a gray one, with a white 2 × 2 cluster in
      // its interior (2 wide, rh − 2 tall).
      const w = 16
      const h = 12
      const rgb = solid(w, h, [0.5, 0.5, 0.5])
      const labels = new Int32Array(w * h).fill(1)
      paint(rgb, w, [3, 3, 7, 3 + rh], BLACK, labels, 0)
      paint(rgb, w, [4, 5, 6, 7], WHITE)
      return carve(
        rgb,
        labels,
        w,
        h,
        [...BLACK, 0.5, 0.5, 0.5],
        [flatOnly([0, 0, 0], 1), flatOnly([0.5, 0.5, 0.5], 1)],
      ).minted
    }
    expect(run(5)).toBe(0)
    expect(run(6)).toBe(1)
  })

  it('tests the residual against the fill the fitter chose', { timeout: 30_000 }, () => {
    const w = 40
    const h = 20
    const rgb = new Float32Array(3 * w * h)
    for (let p = 0; p < w * h; p++) rgb.fill(q8(0.2 + (0.6 * (p % w)) / (w - 1)), 3 * p, 3 * p + 3)
    const labels = new Int32Array(w * h)
    const ramp = fitFill(rgb, w, h, labels, 0, 0.5 / 255, 1)
    expect(isGradient(ramp.model)).toBe(true)
    expect(carve(rgb, labels, w, h, [0.5, 0.5, 0.5], [ramp]).minted).toBe(0)
    expect(
      carve(rgb, labels, w, h, [0.5, 0.5, 0.5], [flatOnly([0.5, 0.5, 0.5], 1)]).minted,
    ).toBeGreaterThan(0)
  })

  it('names a feature by the nearest palette entry, ties to the lower', () => {
    const w = 16
    const h = 12
    const rgb = solid(w, h, BLACK)
    paint(rgb, w, [5, 5, 8, 7], WHITE)
    const palette = [...BLACK, 0.9, 1, 1, 1, 0.9, 1]
    const fills = [flatOnly([0, 0, 0], 1), flatOnly([0.9, 1, 1], 1), flatOnly([1, 0.9, 1], 1)]
    const r = carve(rgb, new Int32Array(w * h), w, h, palette, fills)
    expect(r.minted).toBe(1)
    expect(r.ink[3]).toBe(1)
  })

  it('mints nothing without fills', () => {
    const rgb = solid(8, 8, BLACK)
    expect(
      carveResidualFeatures(new Int32Array(64), rgb, 8, 8, BLACK, [], [], 0.5 / 255, 1, 2),
    ).toBe(0)
  })
})

describe('parity with inkvec', () => {
  for (const ref of BANDS_REFS) {
    it(`carves ${ref.name} as inkvec does`, () => {
      const { rgb } = decodeRef(ref)
      const labels = labelsOf(ref.merge.labels)
      const fills = ref.merge.fills.map(parseFill)
      const want = fills.slice()
      for (const [l, line] of ref.carve.fills) want[l] = parseFill(line)
      const ink = ref.merge.ink.slice()
      const minted = carveResidualFeatures(
        labels,
        rgb,
        ref.w,
        ref.h,
        ref.inks,
        fills,
        ink,
        ref.sigma,
        ref.lambda,
        2,
      )
      expect(minted).toBe(ref.minted)
      expect(labelDiff(labels, labelsOf(ref.carve.labels))).toBe(0)
      expect(ink).toEqual(ref.carve.ink)
      expectSameFills(fills, want)
    })
  }
})
