import { describe, expect, it } from 'vitest'
import {
  gainWork,
  MERGE_WORK_FLOOR,
  MergeBudget,
  mergeGradientBands,
  MODEL_WORK_PER_SAMPLE,
  unionWork,
} from '../../src/fill/bands'
import type { BandMerge, MergeOptions } from '../../src/fill/bands'
import { FOREIGN, PURE } from '../../src/fill/evidence'
import {
  flatOnly,
  isGradient,
  linearToSrgb32,
  PARAMS_FLAT,
  srgbToLinear32,
} from '../../src/fill/model'
import type { FillFit } from '../../src/fill/model'
import {
  absorbCounts,
  allInside,
  de00,
  edgeStep,
  isEdge,
  isSmooth,
  rgbToOklab32,
  smoothStep,
} from '../../src/fill/recovery'
import type { SeamCounts } from '../../src/fill/recovery'
import { FIT_PIXELS_CAP, MAX_FIT_SAMPLES, stridedUnion } from '../../src/fill/samples'
import { bicLambda, commonPixelGain } from '../../src/fill/select'
import { BANDS_REFS } from './bands-fixtures'
import {
  bandedRamp,
  decodeRef,
  distinct,
  expectSameFills,
  gradientCount,
  labelDiff,
  labelsOf,
  parseFill,
  q8,
} from './bands-helpers'

/** A two-pixel image of colors `p` and `q`, for the seam tests. */
function pair(p: readonly number[], q: readonly number[]): Float32Array {
  return Float32Array.from([...p, ...q])
}

/** Symmetric seam counts from `[a, b, count]` triples over `n` components. */
function counts(n: number, entries: [number, number, number][]): SeamCounts {
  const c: SeamCounts = Array.from({ length: n }, () => new Map())
  for (const [a, b, k] of entries) {
    c[a].set(b, k)
    c[b].set(a, k)
  }
  return c
}

/** The merge of inkvec's thin-band ramp (40 × 20, bands 2 px wide) under no cap, computed once. */
let rampMerge: (BandMerge & { labels: Int32Array }) | null = null
function unboundedRamp(): BandMerge & { labels: Int32Array } {
  rampMerge ??= merged(bandedRamp(40, 20, 2), 40, 20, 0.5 / 255, {
    budget: new MergeBudget(40, 20, Infinity),
  })
  return rampMerge
}

/** The merge of a scene, on a copy of its labels. */
function merged(
  scene: { rgb: Float32Array; labels: Int32Array; inks: Float64Array },
  w: number,
  h: number,
  sigma: number,
  options: MergeOptions = {},
): BandMerge & { labels: Int32Array } {
  const labels = scene.labels.slice()
  const m = mergeGradientBands(
    labels,
    scene.rgb,
    w,
    h,
    scene.inks,
    sigma,
    bicLambda(w * h),
    options,
  )
  return { ...m, labels }
}

describe('common-pixel gain', () => {
  const w = 12
  const h = 8
  const pixels = Int32Array.from({ length: w * h }, (_, p) => p)
  const member = (): boolean => true
  const inA = (p: number): boolean => p % w < 6

  it('ignores costs measured on another population', () => {
    const rgb = new Float32Array(3 * w * h).fill(0.4)
    const left = flatOnly([0.4, 0.4, 0.4], 2)
    const right: FillFit = { ...left, chi2: 1e12, cost: 1e12 }
    const gain = commonPixelGain(
      rgb,
      w,
      h,
      pixels,
      member,
      inA,
      () => true,
      left,
      right,
      left,
      1 / 255,
      2,
    )
    expect(Math.abs(gain! - 2 * PARAMS_FLAT)).toBeLessThan(1e-6)
  })

  it('refuses to erase a real color step', () => {
    const rgb = new Float32Array(3 * w * h)
    for (let p = 0; p < w * h; p++) rgb.fill(inA(p) ? 0.2 : 0.8, 3 * p, 3 * p + 3)
    const gain = commonPixelGain(
      rgb,
      w,
      h,
      pixels,
      member,
      inA,
      () => true,
      flatOnly([0.2, 0.2, 0.2], 2),
      flatOnly([0.8, 0.8, 0.8], 2),
      flatOnly([0.5, 0.5, 0.5], 2),
      1 / 255,
      2,
    )
    expect(gain!).toBeLessThan(-1000)
  })

  it('declines without evidence', () => {
    const model = flatOnly([0, 0, 0], 1)
    const p16 = Int32Array.from({ length: 16 }, (_, p) => p)
    const rgb = new Float32Array(48)
    expect(
      commonPixelGain(
        rgb,
        4,
        4,
        p16,
        member,
        () => true,
        () => false,
        model,
        model,
        model,
        0.01,
        1,
      ),
    ).toBeNull()
  })
})

describe('the work cap', () => {
  it('takes the concatenation stride without building it', () => {
    const cases: [number, number][] = [
      [0, 0],
      [5, 0],
      [0, 7],
      [3, 4],
      [FIT_PIXELS_CAP, 0],
      [FIT_PIXELS_CAP, 1],
      [1, FIT_PIXELS_CAP],
      [40_000, 40_000],
      [1_260_000, 9],
      [7, 200_001],
    ]
    for (const [la, lb] of cases) {
      const a = Int32Array.from({ length: la }, (_, i) => 3 * i + 1)
      const b = Int32Array.from({ length: lb }, (_, i) => 5 * i + 2)
      const concat = [...a, ...b]
      const stride = concat.length > FIT_PIXELS_CAP ? Math.floor(concat.length / FIT_PIXELS_CAP) : 1
      const want = concat.filter((_, i) => i % stride === 0)
      expect(Array.from(stridedUnion(a, b))).toEqual(want)
    }
  })

  it('charges a union fit what it gathers', () => {
    const sizes = [
      0,
      1,
      4095,
      4096,
      4097,
      FIT_PIXELS_CAP - 1,
      FIT_PIXELS_CAP,
      FIT_PIXELS_CAP + 1,
      2 * FIT_PIXELS_CAP - 1,
      2 * FIT_PIXELS_CAP,
      1_260_000,
      4_194_304,
    ]
    for (const n of sizes) {
      const gathered = stridedUnion(new Int32Array(n), new Int32Array(0)).length
      const want = gathered + MODEL_WORK_PER_SAMPLE * Math.min(gathered, MAX_FIT_SAMPLES)
      expect(unionWork(n)).toBe(want)
    }
  })

  it('charges a common-pixel gain every pixel gathered and the samples scored', () => {
    expect(gainWork(0)).toBe(0)
    expect(gainWork(100)).toBe(200)
    expect(gainWork(10_000)).toBe(10_000 + MAX_FIT_SAMPLES)
  })

  it('charges up to its cap, and a refused charge spends nothing', () => {
    const b = new MergeBudget(10, 10, 100)
    expect(b.charge(60)).toBe(true)
    expect(b.charge(40)).toBe(true)
    expect(b.charge(1)).toBe(false)
    expect(b.spent).toBe(100)
    expect(b.stopped).toBe(true)
    expect(new MergeBudget(128, 128).cap).toBe(MERGE_WORK_FLOOR)
    expect(new MergeBudget(4096, 4096).cap).toBe(32 * 4096 * 4096)
  })

  it('stops the merge at the cap and otherwise leaves it unchanged', { timeout: 60_000 }, () => {
    const w = 40
    const h = 20
    const scene = bandedRamp(w, h, 2)
    const sigma = 0.5 / 255
    const result = (b: MergeBudget): string => {
      const m = merged(scene, w, h, sigma, { budget: b })
      return JSON.stringify([Array.from(m.labels), m.fills, m.ink])
    }
    const all = unboundedRamp()
    expect(all.budget.stopped).toBe(false)
    const unbounded = JSON.stringify([Array.from(all.labels), all.fills, all.ink])
    // The default cap does not bind: every charge of the unbounded loop fits under it.
    expect(all.budget.spent).toBeLessThanOrEqual(new MergeBudget(w, h).cap)
    // Every unit charged is spent: one unit under what the loop spent stops it early, with
    // a different result.
    const short = new MergeBudget(w, h, all.budget.spent - 1)
    expect(result(short)).not.toBe(unbounded)
    expect(short.stopped).toBe(true)
    expect(distinct(all.labels)).toHaveLength(1)
    // A cap of zero stops before the first wave: every band stays its own region.
    const none = merged(scene, w, h, sigma, { budget: new MergeBudget(w, h, 0) })
    expect(none.budget.spent).toBe(0)
    expect(distinct(none.labels)).toHaveLength(w / 2)
  })
})

describe('seams', () => {
  it('tells smooth steps and smooth seams', () => {
    expect(smoothStep(pair([0.5, 0.5, 0.5], [0.51, 0.51, 0.51]), 0, 1)).toBe(true)
    expect(smoothStep(pair([0.3, 0.3, 0.3], [0.42, 0.42, 0.42]), 0, 1)).toBe(false)
    const adj = counts(3, [[0, 1, 10]])
    expect(isSmooth(adj, counts(3, [[0, 1, 6]]), 0, 1)).toBe(true)
    expect(isSmooth(adj, counts(3, [[0, 1, 5]]), 0, 1)).toBe(true)
    expect(isSmooth(adj, counts(3, [[0, 1, 4]]), 0, 1)).toBe(false)
    expect(isSmooth(adj, counts(3, [[0, 1, 4]]), 0, 2)).toBe(false)
  })

  it('tells edge steps and edges', () => {
    // A hard step is a discontinuity; one 8-bit level, or a ramp's slope, is not.
    expect(edgeStep(pair([0.1, 0.1, 0.1], [0.8, 0.6, 0.2]), 0, 1)).toBe(true)
    expect(edgeStep(pair([0.8, 0.6, 0.2], [0.81, 0.6, 0.2]), 0, 1)).toBe(false)
    const up = 0.5 + 1 / 255
    expect(edgeStep(pair([0.5, 0.5, 0.5], [up, up, up]), 0, 1)).toBe(false)
    // A seam is an edge when more than half its pairs step; exactly half is not.
    const adj = counts(2, [[0, 1, 4]])
    expect(isEdge(adj, counts(2, [[0, 1, 2]]), 0, 1)).toBe(false)
    expect(isEdge(adj, counts(2, [[0, 1, 3]]), 0, 1)).toBe(true)
    expect(isEdge(adj, counts(2, [[0, 1, 3]]), 1, 1)).toBe(false)
  })

  it('moves an absorbed component’s counts onto the survivor', () => {
    const c = counts(3, [
      [0, 1, 2],
      [1, 2, 5],
      [0, 2, 1],
    ])
    absorbCounts(c, 0, 1)
    expect(c[0].get(2)).toBe(6)
    expect(c[2].get(0)).toBe(6)
    expect(c[0].has(1)).toBe(false)
    expect(c[1].size).toBe(0)
    expect(c[2].has(1)).toBe(false)
  })

  it('counts a blend as inner only when every partner is inside', () => {
    const partners = Uint32Array.from([
      PURE,
      PURE,
      PURE,
      4,
      7,
      PURE,
      4,
      9,
      PURE,
      FOREIGN,
      FOREIGN,
      FOREIGN,
    ])
    expect(allInside(partners, 0, () => false)).toBe(true)
    expect(allInside(partners, 1, (q) => q === 4 || q === 7)).toBe(true)
    expect(allInside(partners, 2, (q) => q === 4 || q === 7)).toBe(false)
    expect(allInside(partners, 3, () => true)).toBe(false)
  })

  it('measures ink differences in CIEDE2000', () => {
    expect(de00(0.5, 0.5, 0.5, 0.5, 0.5, 0.5)).toBe(0)
    const d = de00(0.3, 0.3, 0.3, 0.42, 0.42, 0.42)
    expect(d).toBeGreaterThan(5)
    expect(d).toBeLessThan(15)
    expect(de00(0, 0, 0, 1, 1, 1)).toBeGreaterThan(15)
  })
})

describe('band merge', () => {
  it(
    'joins the thin flat bands of a ramp into one gradient only with region recovery',
    { timeout: 60_000 },
    () => {
      const w = 40
      const h = 20
      const scene = bandedRamp(w, h, 2)
      const off = merged(scene, w, h, 0.5 / 255, { regionRecovery: false })
      expect(gradientCount(off.labels, off.fills)).toBe(0)
      const on = unboundedRamp()
      expect(gradientCount(on.labels, on.fills)).toBe(1)
      expect(distinct(on.labels)).toHaveLength(1)
    },
  )

  it('keeps two flat inks at an anti-aliased edge two flat regions', () => {
    const w = 40
    const h = 20
    const a = 0.3
    const b = 0.55
    const rgb = new Float32Array(3 * w * h)
    const labels = new Int32Array(w * h)
    for (let p = 0; p < w * h; p++) {
      const x = p % w
      rgb.fill(q8(x < 20 ? a : x === 20 ? q8(0.5 * (a + b)) : b), 3 * p, 3 * p + 3)
      labels[p] = x > 20 ? 1 : 0
    }
    const inks = Float64Array.from([q8(a), q8(a), q8(a), q8(b), q8(b), q8(b)])
    const m = merged({ rgb, labels, inks }, w, h, 0.5 / 255)
    expect(gradientCount(m.labels, m.fills)).toBe(0)
    expect(m.labels[0]).not.toBe(m.labels[w - 1])
  })

  it('never unions two flat regions just because a ramp could join them', () => {
    const w = 40
    const h = 20
    const rgb = new Float32Array(3 * w * h)
    const labels = new Int32Array(w * h)
    for (let p = 0; p < w * h; p++) {
      rgb.fill(q8(p % w < 20 ? 0.4 : 0.42), 3 * p, 3 * p + 3)
      labels[p] = p % w < 20 ? 0 : 1
    }
    const inks = Float64Array.from([q8(0.4), q8(0.4), q8(0.4), q8(0.42), q8(0.42), q8(0.42)])
    // Without region recovery the union is never even fitted.
    const off = merged({ rgb, labels, inks }, w, h, 0.5 / 255, { regionRecovery: false })
    expect(off.budget.spent).toBe(0)
    expect(distinct(off.labels)).toHaveLength(2)
    // With it, two flat bands one ramp step apart are tried, and the union still has to win
    // on the pixels: a step is not a ramp.
    const on = merged({ rgb, labels, inks }, w, h, 0.5 / 255)
    expect(on.budget.spent).toBeGreaterThan(0)
    expect(distinct(on.labels)).toHaveLength(2)
    expect(gradientCount(on.labels, on.fills)).toBe(0)
  })

  it('never crosses an edge', { timeout: 60_000 }, () => {
    const w = 40
    const h = 20
    const scene = (
      sameHue: boolean,
    ): { rgb: Float32Array; labels: Int32Array; inks: Float64Array } => {
      const rgb = new Float32Array(3 * w * h)
      const labels = new Int32Array(w * h)
      for (let p = 0; p < w * h; p++) {
        const x = p % w
        const v = q8(0.5 + (0.4 * Math.floor(p / w)) / (h - 1))
        const red = [v, q8(0.15), q8(0.15)]
        const blue = [q8(0.15), q8(0.15), v]
        rgb.set(x < 20 || sameHue ? red : blue, 3 * p)
        labels[p] = x < 20 ? 0 : 1
      }
      const r = [q8(0.7), q8(0.15), q8(0.15)]
      const inks = Float64Array.from([...r, ...(sameHue ? r : [q8(0.15), q8(0.15), q8(0.7)])])
      return { rgb, labels, inks }
    }
    // Two gradients facing each other across a discontinuity: the union is never fitted.
    const across = merged(scene(false), w, h, 0.5 / 255)
    expect(across.budget.spent).toBe(0)
    expect(distinct(across.labels)).toHaveLength(2)
    expect(gradientCount(across.labels, across.fills)).toBe(2)
    // The same two gradients across a seam inside one ramp: fitted and merged.
    const inside = merged(scene(true), w, h, 0.5 / 255)
    expect(inside.budget.spent).toBeGreaterThan(0)
    expect(distinct(inside.labels)).toHaveLength(1)
    expect(gradientCount(inside.labels, inside.fills)).toBe(1)
  })

  it('breaks an exact tie towards the lowest pair', { timeout: 60_000 }, () => {
    // An exact 8-bit sRGB ramp (two levels a pixel) in three equal bands: every band and
    // every union is the same exact linear ramp (chi² 0), so both pairs gain exactly 10λ.
    const w = 60
    const h = 20
    const rgb = new Float32Array(3 * w * h)
    const labels = new Int32Array(w * h)
    for (let p = 0; p < w * h; p++) {
      rgb.fill(Math.fround((60 + 2 * (p % w)) / 255), 3 * p, 3 * p + 3)
      labels[p] = Math.floor((p % w) / 20)
    }
    const inks = new Float64Array(9)
    for (let b = 0; b < 3; b++) inks.fill(q8((60 + 2 * (20 * b + 9.5)) / 255), 3 * b, 3 * b + 3)
    const scene = { rgb, labels, inks }
    const all = merged(scene, w, h, 0.5 / 255)
    expect(distinct(all.labels)).toHaveLength(1)
    // A cap that pays for the first wave and its two gains, not the second wave: one merge.
    const cap = 2 * unionWork(40 * h) + 2 * gainWork(40 * h)
    const one = merged(scene, w, h, 0.5 / 255, { budget: new MergeBudget(w, h, cap) })
    expect(one.budget.spent).toBe(cap)
    expect(one.budget.stopped).toBe(true)
    expect(one.labels[0]).toBe(one.labels[25])
    expect(one.labels[45]).not.toBe(one.labels[25])
  })

  it('merges a banded linear gradient into one linear fill', { timeout: 60_000 }, () => {
    const W = 96
    const H = 96
    const c0 = [0.17, 0.42, 0.69]
    const c1 = [0.96, 0.68, 0.33]
    const bg = [0.95, 0.95, 0.95].map(Math.fround)
    const ramp = (t: number): number[] =>
      c0.map((a, k) => {
        const la = srgbToLinear32(Math.fround(a))
        const lb = srgbToLinear32(Math.fround(c1[k]))
        return linearToSrgb32(Math.fround(la + Math.fround(Math.fround(lb - la) * Math.fround(t))))
      })
    const inside = (x: number, y: number): boolean => x >= 8 && x < 88 && y >= 8 && y < 88
    const colors = [bg, ...[0.125, 0.375, 0.625, 0.875].map(ramp)]
    const lab = colors.map((c) => {
      const o = new Float64Array(3)
      rgbToOklab32(c[0], c[1], c[2], o)
      return o
    })
    const rgb = new Float32Array(3 * W * H)
    const labels = new Int32Array(W * H)
    const o = new Float64Array(3)
    for (let p = 0; p < W * H; p++) {
      const x = p % W
      const y = Math.floor(p / W)
      const c = inside(x, y) ? ramp(Math.fround(x / (W - 1))) : bg
      for (let k = 0; k < 3; k++) rgb[3 * p + k] = q8(c[k])
      if (!inside(x, y)) continue
      // The nearest palette entry in OKLab, as the palette labels a pixel.
      rgbToOklab32(rgb[3 * p], rgb[3 * p + 1], rgb[3 * p + 2], o)
      let best = 0
      let bestD = Infinity
      for (let i = 0; i < lab.length; i++) {
        const d = Math.hypot(o[0] - lab[i][0], o[1] - lab[i][1], o[2] - lab[i][2])
        if (d < bestD) {
          best = i
          bestD = d
        }
      }
      labels[p] = best
    }
    const bands = distinct(labels.filter((_, p) => inside(p % W, Math.floor(p / W))))
    expect(bands).toHaveLength(4)
    const m = mergeGradientBands(
      labels,
      rgb,
      W,
      H,
      Float64Array.from(colors.flat()),
      1 / 255,
      bicLambda(W * H),
    )
    const after = distinct(labels.filter((_, p) => inside(p % W, Math.floor(p / W))))
    expect(after).toHaveLength(1)
    const g = after[0]
    expect(g).toBeGreaterThanOrEqual(5)
    const fill = m.fills[g].model
    expect(fill.kind).toBe('linear')
    const bgLabel = labels[0]
    expect(m.fills[bgLabel].model.kind).toBe('flat')
    expect(labels.filter((l) => l === bgLabel)).toHaveLength(W * H - 80 * 80)
    if (fill.kind !== 'linear') return
    const angle = (Math.atan2(fill.p1[1] - fill.p0[1], fill.p1[0] - fill.p0[0]) * 180) / Math.PI
    const d = ((angle % 180) + 180) % 180
    expect(Math.min(d, 180 - d)).toBeLessThanOrEqual(2)
  })

  it('gives a flat region with an interior its own label and pools the thin ones', () => {
    // Two disconnected squares of one ink, each with an interior, and a one-pixel line of
    // the same ink: the squares are two objects with two fresh labels, the line keeps the
    // palette label, whose fill pools every flat component of that ink.
    const w = 30
    const h = 12
    const rgb = new Float32Array(3 * w * h).fill(1)
    const labels = new Int32Array(w * h)
    const dark = [q8(0.2), q8(0.3), q8(0.4)]
    const darker = [q8(0.18), q8(0.28), q8(0.38)]
    for (let p = 0; p < w * h; p++) {
      const x = p % w
      const y = Math.floor(p / w)
      const inA = x >= 1 && x < 9 && y >= 1 && y < 9
      const inB = x >= 12 && x < 20 && y >= 1 && y < 9
      const line = x >= 22 && x < 29 && y === 5
      if (inA || inB || line) {
        rgb.set(inB ? darker : dark, 3 * p)
        labels[p] = 1
      }
    }
    const inks = Float64Array.from([1, 1, 1, ...dark])
    const m = merged({ rgb, labels, inks }, w, h, 0.5 / 255)
    const la = m.labels[2 * w + 2]
    const lb = m.labels[2 * w + 14]
    const line = m.labels[5 * w + 25]
    expect(la).toBeGreaterThanOrEqual(2)
    expect(lb).toBeGreaterThanOrEqual(2)
    expect(la).not.toBe(lb)
    expect(line).toBe(1)
    expect(m.ink[la]).toBe(1)
    expect(m.ink[lb]).toBe(1)
    const colorOf = (f: FillFit): readonly number[] =>
      f.model.kind === 'flat' ? f.model.color : []
    expect(colorOf(m.fills[la])).toEqual(dark)
    expect(colorOf(m.fills[lb])).toEqual(darker)
    expect(m.fills).toHaveLength(2 + distinct(m.labels).filter((l) => l >= 2).length)
  })

  it('never merges across a pair the class veto rejects', { timeout: 60_000 }, () => {
    const w = 40
    const h = 20
    const m = merged(bandedRamp(w, h, 2), w, h, 0.5 / 255, { sameClass: () => false })
    expect(m.budget.spent).toBe(0)
    expect(gradientCount(m.labels, m.fills)).toBe(0)
  })

  it('returns fills for a flat image', () => {
    const labels = new Int32Array(16)
    const m = mergeGradientBands(labels, new Float32Array(48), 4, 4, [0, 0, 0], 1 / 255, 1)
    expect(m.fills.length).toBeGreaterThan(0)
    expect(m.fills.every((f) => !isGradient(f.model))).toBe(true)
  })
})

describe('parity with inkvec', () => {
  for (const ref of BANDS_REFS) {
    it(`merges ${ref.name} as inkvec does`, { timeout: 60_000 }, () => {
      const { rgb, labels, inks } = decodeRef(ref)
      const m = mergeGradientBands(labels, rgb, ref.w, ref.h, inks, ref.sigma, ref.lambda)
      expect(labelDiff(labels, labelsOf(ref.merge.labels))).toBe(0)
      expect(m.ink).toEqual(ref.merge.ink)
      expectSameFills(m.fills, ref.merge.fills.map(parseFill))
      expect(m.budget.spent).toBe(ref.spent)
    })
    for (const v of ref.variants ?? []) {
      const what = `${v.regions ? 'region recovery' : 'no region recovery'}, cap ${v.cap ?? 'default'}`
      it(`merges ${ref.name} as inkvec does (${what})`, { timeout: 60_000 }, () => {
        const { rgb, labels, inks } = decodeRef(ref)
        const budget = new MergeBudget(ref.w, ref.h, v.cap ?? undefined)
        const m = mergeGradientBands(labels, rgb, ref.w, ref.h, inks, ref.sigma, ref.lambda, {
          regionRecovery: v.regions,
          budget,
        })
        expect(labelDiff(labels, labelsOf(v.labels))).toBe(0)
        expect(m.ink).toEqual(v.ink)
        expectSameFills(m.fills, v.fills.map(parseFill))
        expect(budget.spent).toBe(v.spent)
        expect(budget.stopped).toBe(v.stopped)
      })
    }
  }
})
