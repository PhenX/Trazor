import { describe, expect, it } from 'vitest'
import type { BinaryMask, GrayImage, PathCommand } from '@trazor/core'
import { decomposeMask, ringPolygon } from '@trazor/trace'
import { coverageWindows, pathCoverageError } from '../src/coverage'

/** Mask and centered area-coverage field (8×8 samples a pixel) of the region `inside` holds on. */
function areaFieldOf(
  size: number,
  inside: (x: number, y: number) => boolean,
): { mask: BinaryMask; field: GrayImage; cover: Float32Array } {
  const mask = new Uint8Array(size * size)
  const data = new Float32Array(size * size)
  const cover = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0
      for (let j = 0; j < 8; j++) {
        for (let i = 0; i < 8; i++) if (inside(x + (i + 0.5) / 8, y + (j + 0.5) / 8)) hits++
      }
      const c = hits / 64
      cover[y * size + x] = c
      if (c >= 0.5) mask[y * size + x] = 1
      data[y * size + x] = c - 0.5
    }
  }
  return {
    mask: { width: size, height: size, data: mask },
    field: { width: size, height: size, data },
    cover,
  }
}

/** A circle as four quarter cubics. */
function circlePath(cx: number, cy: number, r: number): PathCommand[] {
  const k = 0.5522847498 * r
  return [
    { type: 'M', x: cx + r, y: cy },
    { type: 'C', x1: cx + r, y1: cy + k, x2: cx + k, y2: cy + r, x: cx, y: cy + r },
    { type: 'C', x1: cx - k, y1: cy + r, x2: cx - r, y2: cy + k, x: cx - r, y: cy },
    { type: 'C', x1: cx - r, y1: cy - k, x2: cx - k, y2: cy - r, x: cx, y: cy - r },
    { type: 'C', x1: cx + k, y1: cy - r, x2: cx + r, y2: cy - k, x: cx + r, y: cy },
    { type: 'Z' },
  ]
}

describe('coverage patch of a refined ring', () => {
  it('reads the enclosed side as covered, for a shape and for a hole', () => {
    // A disk with a round hole: the outer ring encloses the ink, the hole's ring
    // encloses paper, and each patch is the coverage of what its ring encloses.
    const inside = (x: number, y: number): boolean => {
      const d = Math.hypot(x - 20.3, y - 19.6)
      return d <= 11 && d >= 5
    }
    const { mask, field, cover } = areaFieldOf(40, inside)
    const paths = decomposeMask(mask, 'minority', 1)
    const outer = paths.find((p) => p.area > 0)!
    const hole = paths.find((p) => p.area < 0)!
    for (const [path, enclosed] of [
      [outer, (c: number): number => c],
      [hole, (c: number): number => 1 - c],
    ] as const) {
      const patch = ringPolygon(path.points, field)!.coverage!
      expect(patch).toBeDefined()
      let worst = 0
      for (let y = 0; y < patch.h; y++) {
        for (let x = 0; x < patch.w; x++) {
          const want = enclosed(cover[(patch.y0 + y) * 40 + patch.x0 + x])
          worst = Math.max(worst, Math.abs(patch.data[y * patch.w + x] - want))
        }
      }
      expect(worst).toBeLessThan(1e-6)
    }
  })

  it('scores the outline that renders the observed coverage best', () => {
    const { mask, field } = areaFieldOf(40, (x, y) => Math.hypot(x - 20.3, y - 19.6) <= 6.2)
    const outer = decomposeMask(mask, 'minority', 1).find((p) => p.area > 0)!
    const patch = ringPolygon(outer.points, field)!.coverage!
    const exact = pathCoverageError(circlePath(20.3, 19.6, 6.2), patch)
    expect(exact).toBeLessThan(0.02)
    expect(pathCoverageError(circlePath(20.6, 19.6, 6.2), patch)).toBeGreaterThan(10 * exact)
    expect(pathCoverageError(circlePath(20.3, 19.6, 5.9), patch)).toBeGreaterThan(10 * exact)
  })

  it('reads a window of a ring as its whole-ring patch reads the same pixels', () => {
    const { mask, field } = areaFieldOf(40, (x, y) => Math.hypot(x - 20.3, y - 19.6) <= 9.4)
    const outer = decomposeMask(mask, 'minority', 1).find((p) => p.area > 0)!
    const fit = ringPolygon(outer.points, field)!
    const whole = fit.coverage!
    const ring = [...outer.points, outer.points[0], outer.points[1]]
    const [window, clear] = coverageWindows(ring, fit.geom, field, [
      [24, 10, 33, 19],
      [0, 0, 6, 6],
    ])
    expect(window).toMatchObject({ x0: 24, y0: 10, w: 9, h: 9 })
    for (let y = 0; y < window!.h; y++) {
      for (let x = 0; x < window!.w; x++) {
        const k = (window!.y0 + y - whole.y0) * whole.w + window!.x0 + x - whole.x0
        expect(window!.data[y * window!.w + x]).toBe(whole.data[k])
        expect(window!.weight[y * window!.w + x]).toBe(whole.weight[k])
      }
    }
    // A window no measured sample reaches carries nothing to compare.
    expect(clear).toBeUndefined()
  })
})
