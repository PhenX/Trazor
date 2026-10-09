import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import type { FillFit } from '../../src/fill/model'
import { fillEvidence } from '../../src/fill/evidence'
import { commonPixelGain, fitPixels, fitUnion, pixelsOf, select } from '../../src/fill/select'
import { CORPUS_REFS, SCENE_REFS } from './parity-fixtures'
import type { RefBrief, RefCandidate } from './parity-fixtures'
import { SCENES } from './scenes'

/** A fit in the fixtures' form, its points moved back into inkvec's frame (less ½). */
function asRef(f: FillFit): RefCandidate {
  const m = f.model
  if (m.kind === 'flat') {
    return ['flat', '-', [0, 0, 0, 0, 0, 0], [...m.color], [0, 0, 0], [], f.chi2, f.params, f.cost]
  }
  const interp = m.interp === 'srgb' ? 'srgb' : 'lin'
  const mids = m.mids.map((s) => [s.offset, ...s.color])
  const g =
    m.kind === 'linear'
      ? [m.p0[0] - 0.5, m.p0[1] - 0.5, m.p1[0] - 0.5, m.p1[1] - 0.5, 0, 0]
      : [m.c[0] - 0.5, m.c[1] - 0.5, m.r, m.aspect, m.angle, 0]
  return [m.kind, interp, g, [...m.c0], [...m.c1], mids, f.chi2, f.params, f.cost]
}

function brief(f: FillFit): RefBrief {
  const r = asRef(f)
  return [r[0], r[1], r[5].length, r[6], r[8]]
}

/** Relative difference, 0 for equal values. */
function rel(a: number, b: number): number {
  return a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b))
}

/** Same kind, space and stop count; geometry and stops within 1e-4; cost within 1e-6 relative. */
function expectSameFit(got: RefCandidate, want: RefCandidate): void {
  expect(got.slice(0, 2)).toEqual(want.slice(0, 2))
  expect(got[5].length).toBe(want[5].length)
  for (let i = 0; i < 6; i++) expect(Math.abs(got[2][i] - want[2][i])).toBeLessThan(1e-4)
  for (let i = 0; i < 3; i++) {
    expect(Math.abs(got[3][i] - Math.fround(want[3][i]))).toBeLessThan(1e-4)
    expect(Math.abs(got[4][i] - Math.fround(want[4][i]))).toBeLessThan(1e-4)
  }
  for (let k = 0; k < want[5].length; k++) {
    for (let i = 0; i < 4; i++) expect(Math.abs(got[5][k][i] - want[5][k][i])).toBeLessThan(1e-4)
  }
  expect(got[7]).toBe(want[7])
  expect(rel(got[8], want[8])).toBeLessThan(1e-6)
}

function expectSameList(got: FillFit[], want: RefBrief[]): void {
  expect(got.map((f) => brief(f).slice(0, 3))).toEqual(want.map((b) => b.slice(0, 3)))
  for (let i = 0; i < want.length; i++) expect(rel(brief(got[i])[4], want[i][4])).toBeLessThan(1e-6)
}

describe('parity with inkvec on the synthetic scenes', () => {
  for (const ref of SCENE_REFS) {
    it(`${ref.scene}, label ${ref.label}${ref.evidence ? ', blends excluded' : ''}`, () => {
      const make = SCENES.find((f) => f().name === ref.scene)!
      const sc = make()
      const pure = ref.evidence
        ? fillEvidence(sc.rgb, sc.w, sc.h, sc.labels, sc.inks, sc.sigma)
        : null
      const cands = fitPixels(
        sc.rgb,
        sc.w,
        sc.h,
        pixelsOf(sc.labels, ref.label),
        (p) => sc.labels[p] === ref.label,
        pure === null ? null : (p) => pure[p] === 1,
        sc.sigma,
        sc.lambda,
      )
      expectSameList(cands, ref.candidates)
      const best = select(cands)
      expect(cands.indexOf(best)).toBe(ref.selected)
      expectSameFit(asRef(best), ref.best)
    })
  }
})

/** A corpus crop's image and labels. */
function decode(ref: (typeof CORPUS_REFS)[number]): { rgb: Float32Array; labels: Int32Array } {
  const labels = new Int32Array(ref.w * ref.h)
  let at = 0
  for (const run of ref.labels.split(',')) {
    const [l, n] = run.split('*').map(Number)
    labels.fill(l, at, at + n)
    at += n
  }
  const values = ref.rgb8
    ? Array.from(inflateSync(Buffer.from(ref.rgb8, 'base64')), (v) => Math.fround(v / 255))
    : Array.from(
        new Float32Array(new Uint8Array(inflateSync(Buffer.from(ref.rgb32!, 'base64'))).buffer),
      )
  const rgb = new Float32Array(3 * ref.w * ref.h).fill(1)
  let k = 0
  for (let p = 0; p < labels.length; p++) {
    if (labels[p] === 0) continue
    rgb[3 * p] = values[k++]
    rgb[3 * p + 1] = values[k++]
    rgb[3 * p + 2] = values[k++]
  }
  return { rgb, labels }
}

describe('parity with inkvec on corpus gradient regions', () => {
  for (const ref of CORPUS_REFS) {
    it(`${ref.name}`, () => {
      const { rgb, labels } = decode(ref)
      const cands = fitPixels(
        rgb,
        ref.w,
        ref.h,
        pixelsOf(labels, 1),
        (p) => labels[p] === 1,
        null,
        ref.sigma,
        ref.lambda,
      )
      expectSameList(cands, ref.candidates)
      const best = select(cands)
      expect(cands.indexOf(best)).toBe(ref.selected)
      expectSameFit(asRef(best), ref.best)
    })
  }
  for (const ref of CORPUS_REFS.filter((r) => r.union !== undefined)) {
    it(`${ref.name}: the union of two bands and its common-pixel gain`, () => {
      const { rgb, labels } = decode(ref)
      const want = ref.union!
      {
        const a = pixelsOf(labels, 1)
        const b = pixelsOf(labels, 2)
        const one = (l: number) => (p: number) => labels[p] === l
        const both = (p: number): boolean => labels[p] === 1 || labels[p] === 2
        const left = fitUnion(rgb, ref.w, ref.h, a, [], one(1), null, ref.sigma, ref.lambda)
        const right = fitUnion(rgb, ref.w, ref.h, b, [], one(2), null, ref.sigma, ref.lambda)
        const union = fitUnion(rgb, ref.w, ref.h, a, b, both, null, ref.sigma, ref.lambda)
        expectSameFit(asRef(left), want.left)
        expectSameFit(asRef(right), want.right)
        expectSameFit(asRef(union), want.union)
        const all = Int32Array.from([...a, ...b])
        const gain = commonPixelGain(
          rgb,
          ref.w,
          ref.h,
          all,
          both,
          one(1),
          null,
          left,
          right,
          union,
          ref.sigma,
          ref.lambda,
        )
        expect(rel(gain!, want.gain)).toBeLessThan(1e-6)
      }
    })
  }
})
