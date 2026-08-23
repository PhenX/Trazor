import { describe, expect, it } from 'vitest'
import { fitCircle, fitEllipse } from '../src/fit'
import type { Pt } from '../src/fit'

// Deterministic tiny PRNG so "noisy" cases are reproducible (no Math.random).
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296 - 0.5 // [-0.5, 0.5)
  }
}

function circlePts(cx: number, cy: number, r: number, anglesDeg: number[], jitter = 0): Pt[] {
  const rnd = lcg(1)
  return anglesDeg.map((d) => {
    const a = (d * Math.PI) / 180
    return { x: cx + r * Math.cos(a) + rnd() * jitter, y: cy + r * Math.sin(a) + rnd() * jitter }
  })
}

function ellipsePts(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  deg: number,
  n: number,
  jitter = 0,
): Pt[] {
  const rnd = lcg(2)
  const co = Math.cos((deg * Math.PI) / 180)
  const si = Math.sin((deg * Math.PI) / 180)
  const pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI
    const ux = rx * Math.cos(a)
    const uy = ry * Math.sin(a)
    pts.push({
      x: cx + ux * co - uy * si + rnd() * jitter,
      y: cy + ux * si + uy * co + rnd() * jitter,
    })
  }
  return pts
}

describe('fitCircle (Kåsa least squares)', () => {
  it('recovers an exact circle regardless of how unevenly it is sampled', () => {
    // Anchors clustered on one arc — a centroid-of-points estimate would be biased,
    // but the algebraic fit is exact for points that lie on a circle.
    const c = fitCircle(circlePts(50, 40, 30, [0, 8, 16, 24, 32, 200]))!
    expect(c.cx).toBeCloseTo(50, 4)
    expect(c.cy).toBeCloseTo(40, 4)
    expect(c.r).toBeCloseTo(30, 4)
  })

  it('is robust to sample noise', () => {
    const c = fitCircle(circlePts(12.5, -7.25, 18, [0, 30, 70, 130, 180, 210, 260, 300, 340], 0.4))!
    expect(c.cx).toBeCloseTo(12.5, 0)
    expect(c.cy).toBeCloseTo(-7.25, 0)
    expect(c.r).toBeCloseTo(18, 0)
  })

  it('returns null for fewer than three points', () => {
    expect(fitCircle([{ x: 0, y: 0 }])).toBeNull()
  })
})

describe('fitEllipse (direct conic least squares)', () => {
  it('recovers an axis-aligned ellipse (angle ≈ 0)', () => {
    const e = fitEllipse(ellipsePts(60, 60, 40, 20, 0, 40))!
    expect(e.cx).toBeCloseTo(60, 2)
    expect(e.cy).toBeCloseTo(60, 2)
    expect(Math.max(e.rx, e.ry)).toBeCloseTo(40, 2)
    expect(Math.min(e.rx, e.ry)).toBeCloseTo(20, 2)
    expect(Math.abs(e.angle)).toBeLessThan(0.02)
  })

  it('recovers a rotated ellipse: center, radii and angle', () => {
    const e = fitEllipse(ellipsePts(60, 50, 40, 18, 30, 48))!
    expect(e.cx).toBeCloseTo(60, 1)
    expect(e.cy).toBeCloseTo(50, 1)
    expect(e.rx).toBeCloseTo(40, 1) // larger axis first
    expect(e.ry).toBeCloseTo(18, 1)
    expect((e.angle * 180) / Math.PI).toBeCloseTo(30, 0)
  })

  it('is robust to sample noise on a rotated ellipse', () => {
    const e = fitEllipse(ellipsePts(0, 0, 25, 12, -40, 60, 0.5))!
    expect(e.cx).toBeCloseTo(0, 0)
    expect(e.cy).toBeCloseTo(0, 0)
    expect(Math.max(e.rx, e.ry)).toBeCloseTo(25, 0)
    expect(Math.min(e.rx, e.ry)).toBeCloseTo(12, 0)
  })

  it('returns null when the best conic is not an ellipse', () => {
    // Points on a straight line fit a degenerate/hyperbolic conic, not an ellipse.
    const line: Pt[] = Array.from({ length: 8 }, (_, i) => ({ x: i, y: 2 * i + 1 }))
    expect(fitEllipse(line)).toBeNull()
  })
})
