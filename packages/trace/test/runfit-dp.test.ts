import { describe, expect, it } from 'vitest'
import type { BinaryMask, GrayImage, PathCommand } from '@trazor/core'
import { mulberry32 } from '@trazor/core'
import { decomposeMask, polygonToCommands, ringPolygon } from '@trazor/trace'
import {
  candidateStride,
  descriptionLambda,
  fitOpenRuns,
  mergeReach,
  runBand,
  runTau,
} from '../src/potrace/runfit'

const OPTS = {
  curveMode: 'spline' as const,
  smoothing: 0.75,
  curveOptimize: true,
  optTolerance: 0.2,
}

/** Signed coverage field of a disk (positive inside, 0 at radius R, ±0.5 saturated). */
function diskMaskField(
  size: number,
  cx: number,
  cy: number,
  R: number,
): { mask: BinaryMask; field: GrayImage } {
  const mask = new Uint8Array(size * size)
  const data = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      if (d <= R) mask[y * size + x] = 1
      data[y * size + x] = Math.max(-0.5, Math.min(0.5, R - d))
    }
  }
  return {
    mask: { width: size, height: size, data: mask },
    field: { width: size, height: size, data },
  }
}

/**
 * Signed coverage field of an axis-aligned rounded rectangle (positive inside),
 * corner radius R, via the exact signed distance to a rounded box.
 */
function roundRectMaskField(
  size: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  R: number,
): { mask: BinaryMask; field: GrayImage } {
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const bx = (x1 - x0) / 2
  const by = (y1 - y0) / 2
  const mask = new Uint8Array(size * size)
  const data = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = Math.abs(x + 0.5 - cx) - bx + R
      const py = Math.abs(y + 0.5 - cy) - by + R
      const outside = Math.hypot(Math.max(px, 0), Math.max(py, 0))
      const inside = Math.min(Math.max(px, py), 0)
      const sd = outside + inside - R // negative inside
      if (sd <= 0) mask[y * size + x] = 1
      data[y * size + x] = Math.max(-0.5, Math.min(0.5, -sd))
    }
  }
  return {
    mask: { width: size, height: size, data: mask },
    field: { width: size, height: size, data },
  }
}

function cubicPoint(
  p0x: number,
  p0y: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  p3x: number,
  p3y: number,
  t: number,
): [number, number] {
  const mt = 1 - t
  const a = mt * mt * mt
  const b = 3 * mt * mt * t
  const c = 3 * mt * t * t
  const d = t * t * t
  return [a * p0x + b * c1x + c * c2x + d * p3x, a * p0y + b * c1y + c * c2y + d * p3y]
}

/** Densely sample a command list into points (start + interior of each L/C). */
function samplePath(cmds: PathCommand[]): [number, number][] {
  const pts: [number, number][] = []
  let cx = 0
  let cy = 0
  for (const c of cmds) {
    if (c.type === 'M') {
      cx = c.x
      cy = c.y
      pts.push([cx, cy])
    } else if (c.type === 'L') {
      for (let t = 1; t <= 10; t++)
        pts.push([cx + ((c.x - cx) * t) / 10, cy + ((c.y - cy) * t) / 10])
      cx = c.x
      cy = c.y
    } else if (c.type === 'C') {
      for (let t = 1; t <= 10; t++)
        pts.push(cubicPoint(cx, cy, c.x1, c.y1, c.x2, c.y2, c.x, c.y, t / 10))
      cx = c.x
      cy = c.y
    }
  }
  return pts
}

/** Kåsa circle fit over points, for recovering an emitted arc's radius. */
function fitCircle(pts: [number, number][]): { cx: number; cy: number; r: number } {
  let sx = 0
  let sy = 0
  for (const [x, y] of pts) {
    sx += x
    sy += y
  }
  const mx = sx / pts.length
  const my = sy / pts.length
  let suu = 0
  let suv = 0
  let svv = 0
  let suuu = 0
  let svvv = 0
  let suvv = 0
  let svuu = 0
  for (const [x, y] of pts) {
    const u = x - mx
    const v = y - my
    suu += u * u
    suv += u * v
    svv += v * v
    suuu += u * u * u
    svvv += v * v * v
    suvv += u * v * v
    svuu += v * u * u
  }
  const det = suu * svv - suv * suv
  const bu = (suuu + suvv) / 2
  const bv = (svvv + svuu) / 2
  const uc = (bu * svv - bv * suv) / det
  const vc = (bv * suu - bu * suv) / det
  return { cx: uc + mx, cy: vc + my, r: Math.sqrt(uc * uc + vc * vc + (suu + svv) / pts.length) }
}

function trace(mask: BinaryMask, field: GrayImage): PathCommand[] {
  const paths = decomposeMask(mask, 'minority', 1)
  const outer = paths.find((p) => p.area > 0)
  if (!outer) throw new Error('no outer ring')
  const fit = ringPolygon(outer.points, field)
  return polygonToCommands(outer.points, fit, { ...OPTS, coverage: field })
}

describe('run-fit dynamic program', () => {
  it('recovers a 42 px rounded corner as an arc within 1 % of its radius and 0.1 px of the outline', () => {
    const size = 256
    const R = 42
    // Rect [40,40]–[216,216], centre (128,128); the top-right corner arc is a
    // quarter circle of radius R centred at (216−R, 40+R) = (174, 82).
    const { mask, field } = roundRectMaskField(size, 40, 40, 216, 216, R)
    const cmds = trace(mask, field)
    const ccx = 216 - R
    const ccy = 40 + R
    // Emitted points in the top-right corner quadrant.
    const corner = samplePath(cmds).filter(
      ([x, y]) => x > ccx - 1 && x <= 216.5 && y >= 39.5 && y < ccy + 1,
    )
    expect(corner.length).toBeGreaterThan(6)
    const fitc = fitCircle(corner)
    // Radius within 1 %.
    expect(Math.abs(fitc.r - R) / R).toBeLessThan(0.01)
    // Outline within 0.1 px: every corner sample sits on the true corner circle.
    for (const [x, y] of corner) {
      expect(Math.abs(Math.hypot(x - ccx, y - ccy) - R)).toBeLessThan(0.1)
    }
  })

  it('recovers a large (≈149 px) arc as a single arc per quadrant, not a run of stubs', () => {
    const size = 256
    const R = 95 // a 90° arc spans R·π/2 ≈ 149 px
    const cx = 128
    const cy = 128
    const { mask, field } = diskMaskField(size, cx, cy, R)
    const cmds = trace(mask, field)
    // A clean disk collapses to the four circle-exact quadrant cubics.
    const curves = cmds.filter((c) => c.type === 'C').length
    const lines = cmds.filter((c) => c.type === 'L').length
    expect(curves).toBeLessThanOrEqual(5)
    expect(lines).toBe(0)
    // Radius within 1 %, outline within 0.15 px of the true circle.
    const pts = samplePath(cmds)
    const fitc = fitCircle(pts)
    expect(Math.abs(fitc.r - R) / R).toBeLessThan(0.01)
    for (const [x, y] of pts) {
      expect(Math.abs(Math.hypot(x - cx, y - cy) - R)).toBeLessThan(0.15)
    }
  })

  it('fits a straight run carrying 0.15 px jitter as one line', () => {
    const N = 40
    const geom: number[] = []
    const sigma: number[] = []
    const rng = mulberry32(20260922)
    for (let i = 0; i < N; i++) {
      const x = 20 + i * 4
      const y = 100 + (rng() - 0.5) * 0.3 // ±0.15 px normal jitter
      geom.push(x, y)
      sigma.push(0.2)
    }
    const opts = {
      alphamax: (0.75 * 4) / 3,
      lambda: descriptionLambda(256),
      tau: runTau(),
      band: runBand(0.2),
      reach: mergeReach(true),
      stride: candidateStride(true),
    }
    const cmds = fitOpenRuns(geom, sigma, [0, N - 1], opts)
    // One straight run ⇒ a single line to the final sample, no cubics/arcs.
    expect(cmds).toHaveLength(1)
    const last = cmds[0] as { type: string; x: number; y: number }
    expect(last.type).toBe('L')
    expect(last.x).toBeCloseTo(geom[(N - 1) * 2], 6)
    expect(last.y).toBeCloseTo(geom[(N - 1) * 2 + 1], 6)
  })

  it('is deterministic', () => {
    const { mask, field } = diskMaskField(128, 64, 64, 40)
    const a = JSON.stringify(trace(mask, field))
    const b = JSON.stringify(trace(mask, field))
    expect(a).toBe(b)
  })
})
