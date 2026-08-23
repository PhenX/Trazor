import { describe, expect, it } from 'vitest'
import type { LabelMap, PathCommand } from '@vectorizer/core'
import { rgbToOklab } from '@vectorizer/core'
import { traceLabelMap } from '@vectorizer/trace'
import type { ColorField } from '@vectorizer/trace'

const OPTS = {
  curveMode: 'spline' as const,
  smoothing: 0.75,
  curveOptimize: true,
  optTolerance: 0.2,
}

function anchors(commands: PathCommand[]): [number, number][] {
  const out: [number, number][] = []
  for (const c of commands) if (c.type !== 'Z') out.push([c.x, c.y])
  return out
}

const A = rgbToOklab(20 / 255, 20 / 255, 210 / 255)
const B = rgbToOklab(210 / 255, 210 / 255, 20 / 255)

/**
 * Region 1 is a rectangle whose true edges sit at sub-pixel positions, enclosed
 * by region 0. Pixels are colored by a coverage ramp across a 1px anti-aliased
 * band, so the perceptual 50% crossing (the pairwise field's zero) lands on the
 * true edge — the closed boundary loop should refine onto it.
 */
function subPixelRegionRect(
  left: number,
  right: number,
  top: number,
  bottom: number,
): { labels: LabelMap; field: ColorField } {
  const w = 24
  const h = 20
  const data = new Int32Array(w * h)
  const oklab = new Float32Array(w * h * 3)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cx = x + 0.5
      const cy = y + 0.5
      const s = Math.min(cx - left, right - cx, cy - top, bottom - cy)
      data[y * w + x] = s > 0 ? 1 : 0
      const c = s + 0.5 < 0 ? 0 : s + 0.5 > 1 ? 1 : s + 0.5 // coverage of region 1
      const o = (y * w + x) * 3
      oklab[o] = A[0] + c * (B[0] - A[0])
      oklab[o + 1] = A[1] + c * (B[1] - A[1])
      oklab[o + 2] = A[2] + c * (B[2] - A[2])
    }
  }
  const paletteOklab = new Float32Array([A[0], A[1], A[2], B[0], B[1], B[2]])
  return { labels: { width: w, height: h, data, count: 2 }, field: { oklab, paletteOklab } }
}

describe('cutout sub-pixel color-boundary refinement', () => {
  it('snaps an enclosed region’s boundary onto its true sub-pixel edge', () => {
    const { labels, field } = subPixelRegionRect(5.3, 15.7, 4.4, 12.6)
    const plain = traceLabelMap(labels, OPTS).find((s) => s.label === 1)!
    const refined = traceLabelMap(labels, { ...OPTS, colorField: field }).find(
      (s) => s.label === 1,
    )!

    const pB = anchors(plain.commands)
    const rB = anchors(refined.commands)
    const leftBin = Math.min(...pB.map(([x]) => x))
    const topBin = Math.min(...pB.map(([, y]) => y))
    const leftRef = Math.min(...rB.map(([x]) => x))
    const topRef = Math.min(...rB.map(([, y]) => y))

    // Lattice trace lands on integer edges; refinement lands on (5.3, 4.4).
    expect(leftBin).toBeCloseTo(5, 0)
    expect(topBin).toBeCloseTo(4, 0)
    expect(Math.abs(leftRef - 5.3)).toBeLessThan(0.25)
    expect(Math.abs(topRef - 4.4)).toBeLessThan(0.25)
  })

  it('keeps the region seam-free — both neighbors share the refined boundary', () => {
    const { labels, field } = subPixelRegionRect(5.3, 15.7, 4.4, 12.6)
    const shapes = traceLabelMap(labels, { ...OPTS, colorField: field })
    const inner = anchors(shapes.find((s) => s.label === 1)!.commands)
    const outer = anchors(shapes.find((s) => s.label === 0)!.commands)
    // Every inner-boundary anchor appears exactly in the outer region's rings.
    for (const [x, y] of inner) {
      expect(outer.some(([ox, oy]) => Math.abs(ox - x) < 1e-9 && Math.abs(oy - y) < 1e-9)).toBe(
        true,
      )
    }
  })

  it('is deterministic with a color field', () => {
    const { labels, field } = subPixelRegionRect(5.3, 15.7, 4.4, 12.6)
    const a = JSON.stringify(traceLabelMap(labels, { ...OPTS, colorField: field }))
    const b = JSON.stringify(traceLabelMap(labels, { ...OPTS, colorField: field }))
    expect(a).toBe(b)
  })

  it('is byte-identical to the classical trace when no color field is given', () => {
    const { labels } = subPixelRegionRect(5.3, 15.7, 4.4, 12.6)
    const a = JSON.stringify(traceLabelMap(labels, OPTS))
    const b = JSON.stringify(traceLabelMap(labels, { ...OPTS, colorField: undefined }))
    expect(a).toBe(b)
  })
})
