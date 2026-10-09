/**
 * Helpers for the band-merge and carve tests: decoding the inkvec parity fixtures
 * (`bands-fixtures.ts`), reading inkvec's fill lines as Trazor fits, comparing fits,
 * and small synthetic scenes.
 */
import { inflateSync } from 'node:zlib'
import { expect } from 'vitest'
import { isGradient } from '../../src/fill/model'
import type { FillFit, FillModel, Rgb } from '../../src/fill/model'
import type { BandsRef } from './bands-fixtures'

/** An 8-bit level of `v` in single precision, clamped to `[0, 1]`. */
export function q8(v: number): number {
  return Math.fround(Math.round(Math.fround(Math.min(Math.max(v, 0), 1) * 255)) / 255)
}

/** A label map stored as 16-bit values, deflated and base64. */
export function labelsOf(b64: string): Int32Array {
  const bytes = new Uint8Array(inflateSync(Buffer.from(b64, 'base64')))
  return Int32Array.from(new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2))
}

/** A fixture's image over white, pre-merge labels and palette. */
export function decodeRef(ref: BandsRef): {
  rgb: Float32Array
  labels: Int32Array
  inks: Float64Array
} {
  let rgb: Float32Array
  if (ref.rgb8 !== undefined) {
    rgb = Float32Array.from(inflateSync(Buffer.from(ref.rgb8, 'base64')), (v) => v / 255)
  } else {
    const bytes = new Uint8Array(inflateSync(Buffer.from(ref.rgb32!, 'base64')))
    rgb = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4)
  }
  return { rgb, labels: labelsOf(ref.labels), inks: Float64Array.from(ref.inks) }
}

/**
 * inkvec's fill line (`kind interp g0 … g5 c0 c1 n [offset r g b]… | chi2 params cost`,
 * points in inkvec's frame) as a Trazor fit, its points moved by +½.
 */
export function parseFill(line: string): FillFit {
  const [left, right] = line.replace(/^cand /, '').split(' | ')
  const t = left.trim().split(/\s+/)
  const kind = t[0]
  const interp = t[1] === 'srgb' ? 'srgb' : 'linearRgb'
  const num = t.slice(2).map(Number)
  const f3 = (v: number[]): Rgb => [Math.fround(v[0]), Math.fround(v[1]), Math.fround(v[2])]
  const c0 = f3(num.slice(6, 9))
  const c1 = f3(num.slice(9, 12))
  const mids = []
  for (let i = 0; i < num[12]; i++) {
    const m = num.slice(13 + 4 * i, 17 + 4 * i)
    mids.push({ offset: m[0], color: f3(m.slice(1)) })
  }
  const [chi2, params, cost] = right.trim().split(/\s+/).map(Number)
  let model: FillModel
  if (kind === 'flat') {
    model = { kind: 'flat', color: c0 }
  } else if (kind === 'linear') {
    const p0 = [num[0] + 0.5, num[1] + 0.5] as const
    const p1 = [num[2] + 0.5, num[3] + 0.5] as const
    model = { kind: 'linear', p0, p1, c0, c1, interp, mids }
  } else {
    const c = [num[0] + 0.5, num[1] + 0.5] as const
    model = { kind: 'radial', c, r: num[2], aspect: num[3], angle: num[4], c0, c1, interp, mids }
  }
  return { model, chi2, params, cost }
}

function geometry(m: FillModel): number[] {
  if (m.kind === 'flat') return []
  if (m.kind === 'linear') return [...m.p0, ...m.p1]
  return [...m.c, m.r, m.aspect, m.angle]
}

function colors(m: FillModel): number[] {
  if (m.kind === 'flat') return [...m.color]
  return [...m.c0, ...m.c1, ...m.mids.flatMap((s) => [s.offset, ...s.color])]
}

function family(m: FillModel): string {
  if (m.kind === 'flat') return 'flat'
  return `${m.kind}/${m.interp}/${m.mids.length}/${m.kind === 'radial' ? m.aspect === 1 : ''}`
}

/** Relative difference, 0 for equal values. */
export function rel(a: number, b: number): number {
  return a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b))
}

/** Same family and parameter count; geometry and stops within 1e-4; chi² and cost within 1e-6 relative. */
export function expectSameFill(got: FillFit, want: FillFit): void {
  expect(family(got.model)).toBe(family(want.model))
  expect(got.params).toBe(want.params)
  const gg = geometry(got.model)
  const gw = geometry(want.model)
  for (let i = 0; i < gw.length; i++) expect(Math.abs(gg[i] - gw[i])).toBeLessThan(1e-4)
  const cg = colors(got.model)
  const cw = colors(want.model)
  for (let i = 0; i < cw.length; i++) expect(Math.abs(cg[i] - cw[i])).toBeLessThan(1e-4)
  expect(rel(got.cost, want.cost)).toBeLessThan(1e-6)
  if (Math.abs(want.chi2) > 1e-9) expect(rel(got.chi2, want.chi2)).toBeLessThan(1e-6)
}

/** Every fill as {@link expectSameFill}, and the same count. */
export function expectSameFills(got: readonly FillFit[], want: readonly FillFit[]): void {
  expect(got.length).toBe(want.length)
  for (let i = 0; i < want.length; i++) expectSameFill(got[i], want[i])
}

/** How many pixels of two label maps differ. */
export function labelDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let n = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++
  return n
}

/** Distinct gradient fills among the labels the pixels carry. */
export function gradientCount(labels: ArrayLike<number>, fills: readonly FillFit[]): number {
  const seen = new Set<number>()
  for (let p = 0; p < labels.length; p++)
    if (isGradient(fills[labels[p]].model)) seen.add(labels[p])
  return seen.size
}

/** Distinct labels in a label map. */
export function distinct(labels: ArrayLike<number>): number[] {
  return [...new Set(Array.from(labels))].toSorted((a, b) => a - b)
}

/**
 * A horizontal gray ramp `0.25 → 0.75` over `w` columns quantized to 8 bits, labeled
 * in vertical bands `band` pixels wide, each band's ink the mean of its first two
 * columns: the scene of inkvec's region-recovery and work-cap tests.
 */
export function bandedRamp(
  w: number,
  h: number,
  band: number,
): { rgb: Float32Array; labels: Int32Array; inks: Float64Array } {
  const ramp = (x: number): number => Math.fround(0.25 + Math.fround((0.5 * x) / (w - 1)))
  const rgb = new Float32Array(3 * w * h)
  const labels = new Int32Array(w * h)
  for (let p = 0; p < w * h; p++) {
    rgb.fill(q8(ramp(p % w)), 3 * p, 3 * p + 3)
    labels[p] = Math.floor((p % w) / band)
  }
  const nBands = w / band
  const inks = new Float64Array(3 * nBands)
  for (let b = 0; b < nBands; b++) {
    const v = q8(
      Math.fround(Math.fround(ramp(b * band) * 0.5) + Math.fround(ramp(b * band + 1) * 0.5)),
    )
    inks.fill(v, 3 * b, 3 * b + 3)
  }
  return { rgb, labels, inks }
}
