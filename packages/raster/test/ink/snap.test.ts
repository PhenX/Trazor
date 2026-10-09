import { rgbToOklab } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { PARAMS_FLAT } from '../../src/fill/model'
import type { FillFit, Rgb } from '../../src/fill/model'
import { de00 } from '../../src/ink/palette'
import type { Palette } from '../../src/ink/palette'
import { REP_DE00, SNAP_DE00, interiorCounts, snapFlatFills } from '../../src/ink/snap'

const WHITE: Rgb = [1, 1, 1]
const BLACK: Rgb = [0, 0, 0]
const RED: Rgb = [0.9, 0.1, 0.1]
/** One level off black on two channels: under the snap distance. */
const NEAR_BLACK: Rgb = [1 / 255, 1 / 255, 2 / 255]

function flat(c: Rgb): FillFit {
  return { model: { kind: 'flat', color: c }, chi2: 1, params: PARAMS_FLAT, cost: 2 }
}

function palette(inks: Rgb[]): Palette {
  return {
    count: inks.length,
    inkLab: Float64Array.from(inks.flatMap((c) => rgbToOklab(c[0], c[1], c[2]))),
    inkRgb: Float64Array.from(inks.flat()),
    weight: new Float64Array(inks.length).fill(1 / inks.length),
    alpha: new Float64Array(inks.length).fill(1),
  }
}

/** A 12×12 face map: face 0 the ground, 1 a 6×6 block (16 interior pixels), 2 a one-pixel line, 3 a 3×3 block (one). */
function faces(): [Int32Array, number, number] {
  const [w, h] = [12, 12]
  const f = new Int32Array(w * h)
  for (let p = 0; p < w * h; p++) {
    const [x, y] = [p % w, Math.floor(p / w)]
    if (x >= 2 && x < 8 && y >= 2 && y < 8) f[p] = 1
    else if (x === 10 && y >= 2 && y < 10) f[p] = 2
    else if (x >= 2 && x < 5 && y >= 9) f[p] = 3
  }
  return [f, w, h]
}

const colorOf = (fit: FillFit): Rgb => (fit.model.kind === 'flat' ? fit.model.color : [-1, -1, -1])

describe('interiorCounts', () => {
  it('counts pixels with four neighbors in the face, off the picture edge', () => {
    const [f, w, h] = faces()
    const c = interiorCounts(f, w, h, 4)
    expect([...c.subarray(1)]).toEqual([16, 0, 1])
    expect(c[0]).toBeGreaterThan(0)
    expect([...interiorCounts(new Int32Array(4), 2, 2, 1)]).toEqual([0])
    expect(interiorCounts(f, w, h, 1)).toHaveLength(1)
  })
})

describe('snapFlatFills', () => {
  it('paints faces of one ink the color of the face with most interior', () => {
    const [f, w, h] = faces()
    expect(de00(...NEAR_BLACK, ...BLACK)).toBeLessThan(SNAP_DE00)
    // The entry is NEAR_BLACK; the big block was fitted to BLACK, the line and the small block
    // to NEAR_BLACK. All take BLACK, the big block's color.
    const fills = [flat(WHITE), flat(BLACK), flat(NEAR_BLACK), flat(NEAR_BLACK)]
    expect(snapFlatFills(f, w, h, fills, [0, 1, 1, 1], palette([WHITE, NEAR_BLACK]))).toBe(2)
    for (let k = 1; k < 4; k++) expect(colorOf(fills[k])).toEqual(BLACK)
    // Only the color moves.
    expect([fills[2].chi2, fills[2].cost]).toEqual([1, 2])
  })

  it('keeps apart colors the artist kept apart', () => {
    const [f, w, h] = faces()
    // Two light grays a few levels apart: one palette ink under the same-ink floor, above the snap.
    const arrow: Rgb = [0.98, 0.98, 0.98]
    const d = de00(...WHITE, ...arrow)
    expect(d).toBeGreaterThanOrEqual(SNAP_DE00)
    expect(d).toBeLessThan(REP_DE00)
    const fills = [flat(WHITE), flat(BLACK), flat(BLACK), flat(arrow)]
    expect(snapFlatFills(f, w, h, fills, [0, 1, 1, 0], palette([WHITE, BLACK]))).toBe(0)
    expect(colorOf(fills[3])).toEqual(arrow)
  })

  it('leaves an ink without an interior face alone, and a plateau far from its entry', () => {
    const [f, w, h] = faces()
    const pal = palette([WHITE, BLACK])
    const fills = [flat(WHITE), flat(RED), flat(NEAR_BLACK), flat(RED)]
    snapFlatFills(f, w, h, fills, [0, 9, 1, 9], pal)
    expect(colorOf(fills[2])).toEqual(NEAR_BLACK)
    expect(colorOf(fills[1])).toEqual(RED)
    const grey: Rgb = [0.3, 0.3, 0.3]
    const plateau = [flat(WHITE), flat(grey), flat(NEAR_BLACK), flat(BLACK)]
    expect(snapFlatFills(f, w, h, plateau, [0, 1, 1, 1], pal)).toBe(1)
    expect(colorOf(plateau[1])).toEqual(grey)
    expect(colorOf(plateau[2])).toEqual(BLACK)
  })

  it('keeps a thin face of anti-aliasing', () => {
    const [f, w, h] = faces()
    const half: Rgb = [0.735, 0.735, 0.735]
    const fills = [flat(WHITE), flat(BLACK), flat(half), flat(BLACK)]
    expect(snapFlatFills(f, w, h, fills, [0, 1, 1, 1], palette([WHITE, BLACK]))).toBe(0)
    expect(colorOf(fills[2])).toEqual(half)
  })

  it('leaves gradients, skipped faces and out-of-range inks alone', () => {
    const [f, w, h] = faces()
    const pal = palette([WHITE, BLACK])
    const grad: FillFit = {
      model: {
        kind: 'linear',
        p0: [0.5, 0.5],
        p1: [1.5, 0.5],
        c0: BLACK,
        c1: WHITE,
        interp: 'linearRgb',
        mids: [],
      },
      chi2: 0,
      params: 10,
      cost: 0,
    }
    const fills = [grad, flat(NEAR_BLACK), flat(NEAR_BLACK), flat(BLACK)]
    // Face 1 is skipped (and does not represent black); face 3 represents black and is black
    // already; face 2's ink is out of range.
    expect(snapFlatFills(f, w, h, fills, [0, 1, 9, 1], pal, (k) => k === 1)).toBe(0)
    expect(fills[0]).toBe(grad)
    expect(colorOf(fills[1])).toEqual(NEAR_BLACK)
    expect(colorOf(fills[2])).toEqual(NEAR_BLACK)
    expect(snapFlatFills(f, w, h, fills, [0, 1, 1, 1], palette([]))).toBe(0)
  })
})
