import { describe, expect, it } from 'vitest'
import type { BinaryMask, GrayImage, PathCommand } from '@trazor/core'
import { decomposeMask, ringPolygon, traceMask } from '@trazor/trace'

const OPTS = {
  curveMode: 'spline' as const,
  smoothing: 0.75,
  curveOptimize: true,
  optTolerance: 0.2,
  turnPolicy: 'minority' as const,
  minArea: 1,
}

function anchors(commands: PathCommand[]): [number, number][] {
  const out: [number, number][] = []
  for (const c of commands) if (c.type !== 'Z') out.push([c.x, c.y])
  return out
}

/**
 * Axis-aligned rectangle whose true edges sit at sub-pixel positions, with a
 * signed field = interior distance to the nearest edge (zero on the true edge).
 */
function subPixelRect(
  w: number,
  h: number,
  left: number,
  right: number,
  top: number,
  bottom: number,
): { mask: BinaryMask; field: GrayImage } {
  const m = new Uint8Array(w * h)
  const data = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cx = x + 0.5
      const cy = y + 0.5
      const f = Math.min(cx - left, right - cx, cy - top, bottom - cy)
      data[y * w + x] = f
      if (f > 0) m[y * w + x] = 1
    }
  }
  return { mask: { width: w, height: h, data: m }, field: { width: w, height: h, data } }
}

describe('sub-pixel boundary refinement', () => {
  it('snaps edges onto an anti-aliased shape’s true sub-pixel position', () => {
    const { mask, field } = subPixelRect(24, 20, 5.3, 15.7, 4.4, 12.6)
    const binary = anchors(traceMask(mask, OPTS)[0].commands)
    const refined = anchors(traceMask(mask, { ...OPTS, coverage: field })[0].commands)

    const leftBin = Math.min(...binary.map(([x]) => x))
    const leftRef = Math.min(...refined.map(([x]) => x))
    const topBin = Math.min(...binary.map(([, y]) => y))
    const topRef = Math.min(...refined.map(([, y]) => y))

    // The binary trace lands on the integer lattice; refinement lands on the
    // true edge (5.3, 4.4).
    expect(leftBin).toBeCloseTo(5, 1)
    expect(topBin).toBeCloseTo(4, 1)
    expect(Math.abs(leftRef - 5.3)).toBeLessThan(0.2)
    expect(Math.abs(topRef - 4.4)).toBeLessThan(0.2)
  })

  it('places every face of a bar on its true edge, whichever way it faces', () => {
    // Exact box coverage of [10.3, 20.7] × [8.2, 40.8]: each face's rim pixel
    // reads its true offset, and the probe past it reaches the saturated pixel
    // on either side — for a face towards −x or −y as for one towards +x or +y.
    const [x0, x1, y0, y1] = [10.3, 20.7, 8.2, 40.8]
    const w = 32
    const h = 48
    const m = new Uint8Array(w * h)
    const data = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const cx = Math.max(0, Math.min(x + 1, x1) - Math.max(x, x0))
        const cy = Math.max(0, Math.min(y + 1, y1) - Math.max(y, y0))
        data[y * w + x] = cx * cy - 0.5
        if (cx * cy >= 0.5) m[y * w + x] = 1
      }
    }
    const ring = decomposeMask({ width: w, height: h, data: m }, 'minority', 1)[0].points
    const fit = ringPolygon(ring, { width: w, height: h, data })
    if (!fit) throw new Error('no polygon')
    // Worst miss per face, over the points along its middle.
    const miss = [0, 0, 0, 0]
    for (let i = 0; i < fit.geom.length; i += 2) {
      const x = fit.geom[i]
      const y = fit.geom[i + 1]
      if (y > 12 && y < 36) {
        const f = x < 15 ? 0 : 1
        miss[f] = Math.max(miss[f], Math.abs(x - (f === 0 ? x0 : x1)))
      }
      if (x > 13 && x < 18) {
        const f = y < 20 ? 2 : 3
        miss[f] = Math.max(miss[f], Math.abs(y - (f === 2 ? y0 : y1)))
      }
    }
    expect(Math.max(...miss)).toBeLessThan(0.01)
  })

  it('leaves an axis-aligned integer rectangle at its exact corners', () => {
    const w = 20
    const h = 16
    const m = new Uint8Array(w * h)
    const data = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const inside = x >= 4 && x < 16 && y >= 3 && y < 13
        // Sharp ±1 field whose zero contour is the integer rectangle boundary.
        data[y * w + x] = inside ? 1 : -1
        if (inside) m[y * w + x] = 1
      }
    }
    const shapes = traceMask(
      { width: w, height: h, data: m },
      { ...OPTS, coverage: { width: w, height: h, data } },
    )
    const pts = anchors(shapes[0].commands)
    for (const [cx, cy] of [
      [4, 3],
      [16, 3],
      [16, 13],
      [4, 13],
    ]) {
      expect(pts.some(([x, y]) => Math.abs(x - cx) < 0.6 && Math.abs(y - cy) < 0.6)).toBe(true)
    }
  })

  it('is ignored by pixel mode (exact rectilinear geometry)', () => {
    const { mask, field } = subPixelRect(20, 20, 5.3, 15.7, 4.4, 12.6)
    const shapes = traceMask(mask, { ...OPTS, curveMode: 'pixel', coverage: field })
    for (const [x, y] of anchors(shapes[0].commands)) {
      expect(Number.isInteger(x)).toBe(true)
      expect(Number.isInteger(y)).toBe(true)
    }
  })

  it('is deterministic with a coverage field', () => {
    const { mask, field } = subPixelRect(24, 20, 5.3, 15.7, 4.4, 12.6)
    const a = JSON.stringify(traceMask(mask, { ...OPTS, coverage: field }))
    const b = JSON.stringify(traceMask(mask, { ...OPTS, coverage: field }))
    expect(a).toBe(b)
  })
})
