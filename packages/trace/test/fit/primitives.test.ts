import { describe, expect, it } from 'vitest'
import type { PathCommand } from '@trazor/core'
import { fitConfig } from '../../src/planar/types'
import type { EdgePrimitive } from '../../src/planar/types'
import {
  canonicalAngle,
  ellipseContact,
  fitEllipseAlgebraic,
  fitEllipseScreened,
  refineEllipse,
  taubinEllipse,
  taubinEllipseWithResidual,
  ellipseChi2,
} from '../../src/fit/ellipse'
import type { EllipseFit } from '../../src/fit/ellipse'
import {
  backSubT,
  cholesky,
  forwardSub,
  genEigen5,
  levenbergMarquardt,
  solveLinear,
  symEigen,
} from '../../src/fit/lm'
import {
  MAX_ARC_DEGREES,
  arcCenter,
  fitArcs,
  fitCircle,
  fitCircleAlgebraic,
  fitCircleKasa,
  fitEllipse,
  fitPrimitiveOrArcs,
  maxDeviation,
  nearestOnPrimitive,
  pathChi2,
  primitiveCommands,
  samplePath,
  totalSweep,
} from '../../src/fit/primitives'
import type { PrimitiveOffer } from '../../src/fit/primitives'
import { fitRoundRect, minAreaRectAngle, roundRectDistance } from '../../src/fit/roundrect'

// ---------------------------------------------------------------------------
// Deterministic generators
// ---------------------------------------------------------------------------

const MASK = (1n << 64n) - 1n

/** inkvec's test generator, xorshift64*, so its cases draw the same numbers. */
class XorShift {
  private s: bigint
  constructor(seed: number) {
    this.s = BigInt(seed) | 1n
  }
  uniform(): number {
    let x = this.s
    x ^= x >> 12n
    x = (x ^ (x << 25n)) & MASK
    x ^= x >> 27n
    this.s = x
    return Number(((x * 0x2545f4914f6cdd1dn) & MASK) >> 11n) / 2 ** 53
  }
  gaussian(): number {
    const u1 = Math.max(this.uniform(), 1e-300)
    const u2 = this.uniform()
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  }
}

/** inkvec's in-module test generator, a 64-bit LCG. */
function lcg(seed: number): () => number {
  let st = BigInt(seed)
  return () => {
    st = (st * 6364136223846793005n + 1442695040888963407n) & MASK
    return Number(st >> 11n) / 2 ** 53
  }
}

type Curve = (t: number) => [number, number]

/**
 * `n` points on `curve(t)` for `t` in `[t0, t1]` (the last excluded when
 * `closed`), displaced along the unit normal by Gaussian noise of deviation
 * `noise` (inkvec's `sample`).
 */
function sample(
  n: number,
  t0: number,
  t1: number,
  closed: boolean,
  noise: number,
  seed: number,
  curve: Curve,
): Float64Array {
  const rng = new XorShift(seed)
  const denom = closed ? n : n - 1
  const out = new Float64Array(2 * n)
  for (let k = 0; k < n; k++) {
    const t = t0 + ((t1 - t0) * k) / denom
    const [x, y] = curve(t)
    const [ax, ay] = curve(t - 1e-4)
    const [bx, by] = curve(t + 1e-4)
    const l = Math.max(Math.hypot(bx - ax, by - ay), 1e-12)
    const d = noise * rng.gaussian()
    out[2 * k] = x - ((by - ay) / l) * d
    out[2 * k + 1] = y + ((bx - ax) / l) * d
  }
  return out
}

const circleCurve =
  (cx: number, cy: number, r: number): Curve =>
  (t) => [cx + r * Math.cos(t), cy + r * Math.sin(t)]

const ellipseCurve =
  (cx: number, cy: number, rx: number, ry: number, angle: number): Curve =>
  (t) => {
    const x = rx * Math.cos(t)
    const y = ry * Math.sin(t)
    return [
      cx + Math.cos(angle) * x - Math.sin(angle) * y,
      cy + Math.sin(angle) * x + Math.cos(angle) * y,
    ]
  }

/**
 * A rounded rectangle centred at `(cx, cy)`, `w × h`, corner radius `r`,
 * rotated by `rot`, by arc length `s ∈ [0, perimeter)` (inkvec's
 * `round_rect_pts` curve, rotated about the centre).
 */
function roundRectCurve(cx: number, cy: number, w: number, h: number, r: number, rot: number) {
  const sw = w - 2 * r
  const sh = h - 2 * r
  const arc = (r * Math.PI) / 2
  const total = 2 * (sw + sh) + 4 * arc
  const x = -w / 2
  const y = -h / 2
  const lens = [sw, arc, sh, arc, sw, arc, sh, arc]
  const local = (s0: number): [number, number] => {
    let s = ((s0 % total) + total) % total
    for (let which = 0; which < 8; which++) {
      const len = lens[which]
      if (s <= len) {
        const u = len > 0 ? s / len : 0
        let a: number
        switch (which) {
          case 0:
            return [x + r + sw * u, y + h]
          case 1:
            a = Math.PI / 2 - (u * Math.PI) / 2
            return [x + w - r + r * Math.cos(a), y + h - r + r * Math.sin(a)]
          case 2:
            return [x + w, y + h - r - sh * u]
          case 3:
            a = (-u * Math.PI) / 2
            return [x + w - r + r * Math.cos(a), y + r + r * Math.sin(a)]
          case 4:
            return [x + w - r - sw * u, y]
          case 5:
            a = -Math.PI / 2 - (u * Math.PI) / 2
            return [x + r + r * Math.cos(a), y + r + r * Math.sin(a)]
          case 6:
            return [x, y + r + sh * u]
          default:
            a = Math.PI - (u * Math.PI) / 2
            return [x + r + r * Math.cos(a), y + h - r + r * Math.sin(a)]
        }
      }
      s -= len
    }
    return [x + r, y + h]
  }
  const curve: Curve = (s) => {
    const [u, v] = local(s)
    return [cx + Math.cos(rot) * u - Math.sin(rot) * v, cy + Math.sin(rot) * u + Math.cos(rot) * v]
  }
  return { curve, total }
}

/** inkvec's `round_rect_pts`: `[x, y, w, h, rx]` by its top-left corner. */
function roundRectPts(n: number, rect: number[], noise: number, seed: number): Float64Array {
  const [x, y, w, h, r] = rect
  const { curve, total } = roundRectCurve(x + w / 2, y + h / 2, w, h, r, 0)
  return sample(n, 0, total, true, noise, seed, curve)
}

const uniform = (n: number, s: number) => new Float64Array(n).fill(s)
const count = (pts: Float64Array) => pts.length >> 1

/** The run reversed and started a third of the way round (inkvec's reversed-run check). */
function reversedRun(pts: Float64Array): Float64Array {
  const n = count(pts)
  const out = new Float64Array(2 * n)
  const shift = Math.floor(n / 3)
  for (let k = 0; k < n; k++) {
    const i = (n - 1 - ((k + shift) % n) + n) % n
    out[2 * k] = pts[2 * i]
    out[2 * k + 1] = pts[2 * i + 1]
  }
  return out
}

/** The run started at sample `shift` (so the path can be scored from its own start). */
function rotateRun(pts: Float64Array, shift: number): Float64Array {
  const n = count(pts)
  const out = new Float64Array(2 * n + 2)
  for (let k = 0; k <= n; k++) {
    out[2 * k] = pts[2 * ((shift + k) % n)]
    out[2 * k + 1] = pts[2 * ((shift + k) % n) + 1]
  }
  return out
}

/** Index of the sample nearest `(x, y)`. */
function nearestSample(pts: Float64Array, x: number, y: number): number {
  let best = 0
  for (let k = 1; k < count(pts); k++) {
    if (
      Math.hypot(pts[2 * k] - x, pts[2 * k + 1] - y) <
      Math.hypot(pts[2 * best] - x, pts[2 * best + 1] - y)
    ) {
      best = k
    }
  }
  return best
}

/** Largest distance from the run to a closed offer's path, scored from the path's own start. */
function offerDeviation(pts: Float64Array, offer: PrimitiveOffer): number {
  const run = rotateRun(pts, nearestSample(pts, offer.x0, offer.y0))
  return maxDeviation(run, offer.x0, offer.y0, offer.segments)
}

/** The endpoint of the last command. */
function lastEnd(segs: readonly PathCommand[]): [number, number] {
  const s = segs[segs.length - 1]
  if (s.type === 'Z') throw new Error('no endpoint')
  return [s.x, s.y]
}

/** The offer's whole primitive, which must be of `kind`. */
function primitiveOf<K extends EdgePrimitive['kind']>(
  offer: PrimitiveOffer | null,
  kind: K,
): Extract<EdgePrimitive, { kind: K }> {
  const prim = offer?.primitive
  if (prim?.kind !== kind) throw new Error(`expected a ${kind}, got ${prim?.kind ?? 'none'}`)
  return prim as Extract<EdgePrimitive, { kind: K }>
}

/** The path form follows the run's own direction from a start anywhere on the outline. */
function expectReversedRunFollows(pts: Float64Array, sigma: Float64Array, tol: number): void {
  const rev = reversedRun(pts)
  const offer = fitPrimitiveOrArcs(rev, sigma, true, fitConfig(256))
  expect(offer?.primitive).toBeDefined()
  if (!offer) return
  expect(lastEnd(offer.segments)).toEqual([offer.x0, offer.y0])
  expect(offerDeviation(rev, offer)).toBeLessThan(tol)
}

/** The circle (or ellipse) as four cubics plus a start point, costed like any path: the cubic description. */
function fourCubicCost(
  pts: Float64Array,
  sigma: Float64Array,
  e: { cx: number; cy: number; rx: number; ry: number; angle: number },
  lambda: number,
): number {
  const k = (4 / 3) * Math.tan(Math.PI / 8)
  const at = (t: number): [number, number] => ellipseCurve(e.cx, e.cy, e.rx, e.ry, e.angle)(t)
  const d = (t: number): [number, number] => {
    const x = -e.rx * Math.sin(t)
    const y = e.ry * Math.cos(t)
    return [
      Math.cos(e.angle) * x - Math.sin(e.angle) * y,
      Math.sin(e.angle) * x + Math.cos(e.angle) * y,
    ]
  }
  const t0 = Math.atan2(pts[1] - e.cy, pts[0] - e.cx)
  const segs: PathCommand[] = []
  for (let i = 0; i < 4; i++) {
    const a = t0 + (i * Math.PI) / 2
    const b = a + Math.PI / 2
    const [ax, ay] = at(a)
    const [bx, by] = at(b)
    const [dax, day] = d(a)
    const [dbx, dby] = d(b)
    segs.push({
      type: 'C',
      x1: ax + k * dax,
      y1: ay + k * day,
      x2: bx - k * dbx,
      y2: by - k * dby,
      x: bx,
      y: by,
    })
  }
  const [x0, y0] = at(t0)
  const run = rotateRun(pts, 0)
  return 0.5 * pathChi2(run, sigma, x0, y0, segs) + lambda * (2 + 4 * 6)
}

const SIGMA = 0.05
const CFG = fitConfig(256)

// ---------------------------------------------------------------------------
// inkvec's tests/primitives.rs
// ---------------------------------------------------------------------------

describe('inkvec primitive cases', () => {
  it('recovers a circle, offers it as three parameters, and beats cubics', () => {
    const [cx, cy, r0] = [120.3, 77.1, 40]
    const pts = sample(320, 0, 2 * Math.PI, true, SIGMA, 7, circleCurve(cx, cy, r0))
    const sigma = uniform(320, SIGMA)
    const cf = fitCircle(pts, sigma)!
    expect(Math.abs(cf.r - r0)).toBeLessThan(0.02)
    expect(Math.hypot(cf.cx - cx, cf.cy - cy)).toBeLessThan(0.02)

    const offer = fitPrimitiveOrArcs(pts, sigma, true, CFG)!
    const prim = primitiveOf(offer, 'circle')
    expect(Math.abs(prim.r - r0)).toBeLessThan(0.02)
    expect(Math.hypot(prim.cx - cx, prim.cy - cy)).toBeLessThan(0.02)
    expect(offer.params).toBe(3)
    expect(offer.segments.every((s) => s.type === 'A')).toBe(true)
    expect(offer.segments).toHaveLength(Math.ceil(360 / MAX_ARC_DEGREES))
    expect(offerDeviation(pts, offer)).toBeLessThan(4 * SIGMA)
    expectReversedRunFollows(pts, sigma, 4 * SIGMA)

    const cubic = fourCubicCost(pts, sigma, { cx, cy, rx: r0, ry: r0, angle: 0 }, CFG.lambda)
    expect(offer.cost).toBeLessThan(cubic)
  })

  it('recovers an ellipse, offers it as five parameters, and beats cubics', () => {
    const [cx, cy, rx0, ry0, ang0] = [90, 64.5, 50, 30, 0.4]
    const pts = sample(360, 0, 2 * Math.PI, true, SIGMA, 11, ellipseCurve(cx, cy, rx0, ry0, ang0))
    const sigma = uniform(360, SIGMA)
    const e = fitEllipse(pts, sigma)!
    expect(Math.abs(e.rx - rx0)).toBeLessThan(0.02)
    expect(Math.abs(e.ry - ry0)).toBeLessThan(0.02)
    expect(Math.hypot(e.cx - cx, e.cy - cy)).toBeLessThan(0.02)
    expect(Math.abs(e.angle - ang0)).toBeLessThan(1e-3)

    const offer = fitPrimitiveOrArcs(pts, sigma, true, CFG)!
    expect(offer.primitive?.kind).toBe('ellipse')
    expect(offer.params).toBe(5)
    expect(offerDeviation(pts, offer)).toBeLessThan(4 * SIGMA)
    expectReversedRunFollows(pts, sigma, 4 * SIGMA)
    const cubic = fourCubicCost(pts, sigma, e, CFG.lambda)
    expect(offer.cost).toBeLessThan(cubic)
  })

  it('does not report a square as a circle', () => {
    const pts = roundRectPts(320, [20, 30, 80, 80, 0], SIGMA, 3)
    const sigma = uniform(320, SIGMA)
    const prim = primitiveOf(fitPrimitiveOrArcs(pts, sigma, true, CFG), 'rect')
    expect(Math.abs(prim.cx - prim.w / 2 - 20)).toBeLessThan(0.05)
    expect(Math.abs(prim.cy - prim.h / 2 - 30)).toBeLessThan(0.05)
    expect(Math.abs(prim.w - 80)).toBeLessThan(0.1)
    expect(Math.abs(prim.h - 80)).toBeLessThan(0.1)
    expect(prim.r).toBeLessThan(0.1)
    // A circle forced onto it is rejected by its own residual.
    expect(fitArcs(pts, sigma, true)).toBeNull()
  })

  it('recovers a rounded rectangle as lines and quarter arcs', () => {
    const [x0, y0, w0, h0, r0] = [15, 22, 90, 56, 12]
    const pts = roundRectPts(400, [x0, y0, w0, h0, r0], SIGMA, 5)
    const sigma = uniform(400, SIGMA)
    const rr = fitRoundRect(pts, sigma, null)!
    expect(Math.abs(rr.r - r0)).toBeLessThan(0.1)
    expect(Math.abs(rr.cx - rr.hw - x0)).toBeLessThan(0.05)
    expect(Math.abs(rr.cy - rr.hh - y0)).toBeLessThan(0.05)
    expect(Math.abs(2 * rr.hw - w0)).toBeLessThan(0.1)
    expect(Math.abs(2 * rr.hh - h0)).toBeLessThan(0.1)

    const offer = fitPrimitiveOrArcs(pts, sigma, true, CFG)!
    expect(Math.abs(primitiveOf(offer, 'rect').r - r0)).toBeLessThan(0.1)
    expect(offer.params).toBe(6)
    const arcs = offer.segments.filter((s) => s.type === 'A').length
    const lines = offer.segments.filter((s) => s.type === 'L').length
    expect(arcs).toBeGreaterThanOrEqual(4)
    expect(arcs).toBeLessThanOrEqual(5)
    expect(lines).toBeGreaterThanOrEqual(4)
    expect(lines).toBeLessThanOrEqual(5)
    expect(offerDeviation(pts, offer)).toBeLessThan(4 * SIGMA)
    expectReversedRunFollows(pts, sigma, 4 * SIGMA)
  })

  it('fits partial arcs better orthogonally than algebraically', () => {
    const [cx, cy, r0] = [50, 50, 30]
    const noise = 0.3
    const trials = 60
    const err = [0, 0, 0]
    const chi2 = [0, 0, 0]
    for (let seed = 0; seed < trials; seed++) {
      const pts = sample(30, 0, Math.PI / 3, false, noise, 1000 + seed, circleCurve(cx, cy, r0))
      const sigma = uniform(30, noise)
      const kasa = fitCircleKasa(pts, sigma)!
      const taubin = fitCircleAlgebraic(pts, sigma)!
      const odf = fitCircle(pts, sigma)!
      expect(odf.chi2).toBeLessThanOrEqual(taubin.chi2 + 1e-9)
      ;[kasa, taubin, odf].forEach((f, k) => {
        err[k] += f.r - r0
        chi2[k] += f.chi2
      })
    }
    // The plain algebraic fit is biased toward small radii and fits measurably worse.
    expect(err[0] / trials).toBeLessThan(-0.05)
    expect(chi2[2]).toBeLessThan(0.98 * chi2[0])
    expect(Math.abs(err[2])).toBeLessThan(Math.abs(err[0]))
    expect(chi2[2]).toBeLessThanOrEqual(chi2[1] + 1e-9)

    const [rx0, ry0] = [60, 25]
    const ellipseArc = (deg: number, nz: number, n: number, seed: number) =>
      sample(
        n,
        0.3,
        0.3 + (deg * Math.PI) / 180,
        false,
        nz,
        seed,
        ellipseCurve(cx, cy, rx0, ry0, 0),
      )
    let algErr = 0
    let odfErr = 0
    let algChi2 = 0
    let odfChi2 = 0
    for (let seed = 0; seed < trials; seed++) {
      const pts = ellipseArc(120, 0.3, 40, 2000 + seed)
      const sigma = uniform(40, 0.3)
      const odf = fitEllipse(pts, sigma)!
      const alg = fitEllipseAlgebraic(pts, sigma)!
      expect(odf.chi2).toBeLessThanOrEqual(alg.chi2 + 1e-9)
      odfErr += Math.abs(odf.rx - rx0) + Math.abs(odf.ry - ry0)
      odfChi2 += odf.chi2
      algErr += Math.abs(alg.rx - rx0) + Math.abs(alg.ry - ry0)
      algChi2 += alg.chi2
    }
    expect(odfErr).toBeLessThan(algErr)
    expect(odfChi2).toBeLessThan(algChi2)

    // On a short noisy arc the conic is not always an ellipse; the orthogonal fit always is.
    let algFailed = 0
    for (let seed = 0; seed < trials; seed++) {
      const pts = ellipseArc(80, 0.5, 30, 3000 + seed)
      const sigma = uniform(30, 0.5)
      expect(fitEllipse(pts, sigma)).not.toBeNull()
      if (fitEllipseAlgebraic(pts, sigma) === null) algFailed++
    }
    expect(algFailed).toBeGreaterThan(0)
  })

  it('turns an open arc run into arc segments of at most 120 degrees', () => {
    const [cx, cy, r0] = [60, 60, 45]
    const pts = sample(
      200,
      0.2,
      0.2 + (250 * Math.PI) / 180,
      false,
      SIGMA,
      21,
      circleCurve(cx, cy, r0),
    )
    const sigma = uniform(200, SIGMA)
    const segs = fitArcs(pts, sigma, false)!
    expect(segs).toHaveLength(3)
    for (const s of segs) {
      expect(s.type).toBe('A')
      if (s.type !== 'A') continue
      expect(Math.abs(s.rx - r0)).toBeLessThan(0.05)
      expect(s.rx).toBe(s.ry)
      expect(s.rotation).toBe(0)
      expect(s.sweep).toBe(true)
    }
    expect(lastEnd(segs)).toEqual([pts[398], pts[399]])
    expect(maxDeviation(pts, pts[0], pts[1], segs)).toBeLessThan(4 * SIGMA)

    const offer = fitPrimitiveOrArcs(pts, sigma, false, CFG)!
    expect(offer.primitive).toBeUndefined()
    expect(offer.closed).toBe(false)
    expect(offer.segments).toHaveLength(3)
    expect(offer.params).toBe(15)
    expect([offer.x0, offer.y0]).toEqual([pts[0], pts[1]])
    expect(offer.cost).toBeCloseTo(0.5 * offer.chi2 + CFG.lambda * offer.params, 9)
  })

  it('does not fit an arc to a straight run', () => {
    const pts = new Float64Array(100)
    for (let k = 0; k < 50; k++) {
      pts[2 * k] = 10 + k
      pts[2 * k + 1] = 20 + 0.5 * k
    }
    const sigma = uniform(50, SIGMA)
    expect(fitArcs(pts, sigma, false)).toBeNull()
    expect(fitPrimitiveOrArcs(pts, sigma, false, CFG)).toBeNull()
  })

  it('round-trips the arc centre parametrization, both ways round', () => {
    const [cx, cy, r] = [30, 40, 25]
    const cases: [number, number][] = [
      [0.3, 1.2],
      [2, -1.9],
      [-1, 2.9],
      [0, -0.5],
      [1, 4],
    ]
    for (const [a0, delta] of cases) {
      const sx = cx + r * Math.cos(a0)
      const sy = cy + r * Math.sin(a0)
      const ex = cx + r * Math.cos(a0 + delta)
      const ey = cy + r * Math.sin(a0 + delta)
      const large = Math.abs(delta) > Math.PI
      const sweep = delta > 0
      const f = arcCenter(sx, sy, r, r, 0, large, sweep, ex, ey)
      expect(Math.hypot(f.cx - cx, f.cy - cy)).toBeLessThan(1e-9)
      expect(Math.abs(f.rx - r)).toBeLessThan(1e-9)
      expect(Math.abs(canonicalAngle(f.theta1 - a0) * 2)).toBeLessThan(1e-9)
      expect(Math.abs(f.delta - delta)).toBeLessThan(1e-9)
      // The reversed arc: same circle, opposite sweep.
      const back = arcCenter(ex, ey, r, r, 0, large, !sweep, sx, sy)
      expect(Math.hypot(back.cx - cx, back.cy - cy)).toBeLessThan(1e-9)
      expect(Math.abs(back.delta + delta)).toBeLessThan(1e-9)

      const fwd = new Float64Array(102)
      for (let i = 0; i <= 50; i++) {
        fwd[2 * i] = cx + r * Math.cos(a0 + (delta * i) / 50)
        fwd[2 * i + 1] = cy + r * Math.sin(a0 + (delta * i) / 50)
      }
      const rev = new Float64Array(102)
      for (let i = 0; i <= 50; i++) {
        rev[2 * i] = fwd[2 * (50 - i)]
        rev[2 * i + 1] = fwd[2 * (50 - i) + 1]
      }
      const arc = (x: number, y: number, sw: boolean): PathCommand[] => [
        { type: 'A', rx: r, ry: r, rotation: 0, largeArc: large, sweep: sw, x, y },
      ]
      expect(maxDeviation(fwd, sx, sy, arc(ex, ey, sweep))).toBeLessThan(1e-3)
      expect(maxDeviation(rev, ex, ey, arc(sx, sy, !sweep))).toBeLessThan(1e-3)
    }
  })
})

// ---------------------------------------------------------------------------
// inkvec's in-module tests (solver, ellipse, round_rect)
// ---------------------------------------------------------------------------

describe('solver', () => {
  it('solves a linear system', () => {
    const x = new Float64Array(2)
    expect(solveLinear(Float64Array.of(2, 1, 1, 3), Float64Array.of(5, 5), 2, x)).toBe(true)
    expect(x[0]).toBeCloseTo(2, 10)
    expect(x[1]).toBeCloseTo(1, 10)
    expect(solveLinear(Float64Array.of(1, 2, 2, 4), Float64Array.of(1, 2), 2, x)).toBe(false)
  })

  it('factors and substitutes', () => {
    const l = cholesky(Float64Array.of(4, 2, 2, 5), 2)!
    expect(l[0]).toBeCloseTo(2, 10)
    expect(l[2]).toBeCloseTo(1, 10)
    expect(l[3]).toBeCloseTo(2, 10)
    const x = backSubT(l, forwardSub(l, [6, 8], 2), 2)
    expect(4 * x[0] + 2 * x[1]).toBeCloseTo(6, 10)
    expect(2 * x[0] + 5 * x[1]).toBeCloseTo(8, 10)
    expect(cholesky(Float64Array.of(1, 2, 2, 1), 2)).toBeNull()
  })

  it('diagonalizes a symmetric matrix', () => {
    const { values, vectors } = symEigen([2, 1, 1, 2], 2)
    const sorted = [...values].sort((a, b) => a - b)
    expect(sorted[0]).toBeCloseTo(1, 10)
    expect(sorted[1]).toBeCloseTo(3, 10)
    // Orthonormal eigenvectors.
    expect(vectors[0] * vectors[1] + vectors[2] * vectors[3]).toBeCloseTo(0, 10)
  })

  it('solves the generalized eigenproblem at its minimum ratio', () => {
    const rnd = lcg(5)
    for (let c = 0; c < 200; c++) {
      const cov = new Float64Array(25)
      const nrm = new Float64Array(25)
      for (let row = 0; row < 8; row++) {
        const z = Array.from({ length: 5 }, () => rnd() - 0.5)
        const g = Array.from({ length: 5 }, () => rnd() - 0.5)
        for (let a = 0; a < 5; a++) {
          for (let b = 0; b < 5; b++) {
            cov[a * 5 + b] += z[a] * z[b]
            nrm[a * 5 + b] += g[a] * g[b]
          }
        }
      }
      for (let a = 0; a < 5; a++) nrm[a * 6] += 1
      const out = genEigen5(cov, nrm)!
      const quad = (m: Float64Array, v: ArrayLike<number>) => {
        let s = 0
        for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) s += v[a] * m[a * 5 + b] * v[b]
        return s
      }
      expect(quad(nrm, out.theta)).toBeCloseTo(1, 8)
      expect(quad(cov, out.theta)).toBeCloseTo(out.mu, 8)
      // No random direction has a smaller ratio.
      for (let t = 0; t < 5; t++) {
        const v = Array.from({ length: 5 }, () => rnd() - 0.5)
        expect(quad(cov, v) / quad(nrm, v)).toBeGreaterThanOrEqual(out.mu - 1e-9)
      }
    }
  })

  it('minimizes a least-squares problem by Levenberg–Marquardt', () => {
    // Fit y = a·exp(b·x) to exact data.
    const xs = [0, 0.5, 1, 1.5, 2, 2.5, 3]
    const ys = xs.map((x) => 2 * Math.exp(-0.7 * x))
    const out = levenbergMarquardt(
      [1, 0],
      100,
      (p, jtj, jtr) => {
        jtj.fill(0)
        jtr.fill(0)
        let chi2 = 0
        for (let i = 0; i < xs.length; i++) {
          const e = Math.exp(p[1] * xs[i])
          const res = p[0] * e - ys[i]
          const j = [e, p[0] * xs[i] * e]
          chi2 += res * res
          for (let a = 0; a < 2; a++) {
            jtr[a] += j[a] * res
            for (let b = 0; b < 2; b++) jtj[a * 2 + b] += j[a] * j[b]
          }
        }
        return chi2
      },
      () => {},
    )!
    expect(out.p[0]).toBeCloseTo(2, 6)
    expect(out.p[1]).toBeCloseTo(-0.7, 6)
  })
})

describe('ellipse geometry', () => {
  it('normalizes axis angles', () => {
    expect(canonicalAngle(Math.PI)).toBeCloseTo(0, 10)
    expect(canonicalAngle(Math.PI / 4)).toBeCloseTo(Math.PI / 4, 10)
    expect(canonicalAngle(-Math.PI / 2)).toBeCloseTo(Math.PI / 2, 10)
  })

  it('finds the orthogonal contact', () => {
    const e: EllipseFit = { cx: 0, cy: 0, rx: 10, ry: 5, angle: 0, chi2: 0 }
    const out = new Float64Array(4)
    expect(ellipseContact(e, 12, 0, out)).toBeCloseTo(2, 6)
    expect(out[1]).toBeCloseTo(0, 6)
    expect(out[2]).toBeCloseTo(1, 6)
    expect(ellipseContact(e, 0, -3, out)).toBeCloseTo(-2, 6)
  })

  it('returns the algebraic geometry without its chi2, and refuses degenerate input', () => {
    const rnd = lcg(11)
    const mismatches: number[] = []
    for (let c = 0; c < 300; c++) {
      const n = 3 + (c % 40)
      const [rx, ry, rot] = [2 + 30 * rnd(), 1 + 20 * rnd(), 3 * rnd()]
      const sweep = 0.3 + 6 * rnd()
      const noise = [0, 0.05, 0.5][c % 3]
      const pts = new Float64Array(2 * n)
      for (let k = 0; k < n; k++) {
        const t = (sweep * k) / n
        const [x, y] = [rx * Math.cos(t), ry * Math.sin(t)]
        pts[2 * k] = 40 + Math.cos(rot) * x - Math.sin(rot) * y + noise * (rnd() - 0.5)
        pts[2 * k + 1] = -7 + Math.sin(rot) * x + Math.cos(rot) * y + noise * (rnd() - 0.5)
      }
      const sigma = Float64Array.from({ length: n }, () => 0.1 + rnd())
      const lean = taubinEllipse(pts, sigma)
      const full = fitEllipseAlgebraic(pts, sigma)
      const same =
        lean === null
          ? full === null
          : full !== null &&
            lean.chi2 === Infinity &&
            [lean.cx, lean.cy, lean.rx, lean.ry, lean.angle].every(
              (v, i) => v === [full.cx, full.cy, full.rx, full.ry, full.angle][i],
            ) &&
            ellipseChi2(pts, sigma, lean) === full.chi2
      if (!same) mismatches.push(c)
    }
    expect(mismatches).toEqual([])
    const line = new Float64Array(20)
    for (let k = 0; k < 10; k++) {
      line[2 * k] = k
      line[2 * k + 1] = 2 * k
    }
    const same = new Float64Array(20).fill(3)
    expect(taubinEllipse(line, uniform(10, 0.5))).toBeNull()
    expect(taubinEllipse(same, uniform(10, 0.5))).toBeNull()
  })

  it('screens the ellipse search to the same verdict as the full fit at the gate', () => {
    const rnd = lcg(77)
    const disagreements: number[] = []
    let passed = 0
    let refused = 0
    for (let c = 0; c < 240; c++) {
      const n = 24 + (c % 150)
      const [rx, ry, rot] = [3 + 40 * rnd(), 2 + 25 * rnd(), 3 * rnd()]
      const noise = [0, 0.1, 0.4, 1][c % 4]
      const shape = Math.floor(c / 4) % 4
      const pts = new Float64Array(2 * n)
      for (let k = 0; k < n; k++) {
        const t = (2 * Math.PI * k) / n
        const [co, s] = [Math.cos(t), Math.sin(t)]
        let x: number
        let y: number
        if (shape === 0) [x, y] = [rx * co, ry * s]
        else if (shape === 1)
          [x, y] = [
            rx * Math.sign(co) * Math.sqrt(Math.abs(co)),
            ry * Math.sign(s) * Math.sqrt(Math.abs(s)),
          ]
        else if (shape === 2) {
          const r = 1 + 0.3 * Math.cos(5 * t)
          ;[x, y] = [rx * r * co, rx * r * s]
        } else [x, y] = [rx * co, 0.05 * ry * s]
        pts[2 * k] = Math.cos(rot) * x - Math.sin(rot) * y + noise * (rnd() - 0.5)
        pts[2 * k + 1] = Math.sin(rot) * x + Math.cos(rot) * y + noise * (rnd() - 0.5)
      }
      const sigma = uniform(n, 0.25)
      const gate = 4 * n
      const full = fitEllipse(pts, sigma)
      const screened = fitEllipseScreened(pts, sigma, fitCircle(pts, sigma), gate)
      let span = 0
      for (let k = 0; k < n; k++)
        span = Math.max(span, Math.hypot(pts[2 * k] - pts[0], pts[2 * k + 1] - pts[1]))
      span = Math.max(span, 1)
      const offered = (e: EllipseFit | null) =>
        e !== null &&
        Number.isFinite(e.rx) &&
        Number.isFinite(e.ry) &&
        Math.max(e.rx, e.ry) <= 1e3 * span &&
        e.chi2 <= gate &&
        Math.abs(totalSweep(pts, e.cx, e.cy, true)) > 1.9 * Math.PI
      if (offered(screened) !== offered(full)) disagreements.push(c)
      if (offered(full) && full && screened) {
        if (screened.chi2 > full.chi2 * (1 + 1e-6) + 1e-9) disagreements.push(c)
        passed++
      } else {
        refused++
      }
    }
    expect(disagreements).toEqual([])
    expect(passed).toBeGreaterThan(20)
    expect(refused).toBeGreaterThan(20)
    // The screen's residual is a lower bound on the refined chi2 at the share used.
    const pts = sample(120, 0, 2 * Math.PI, true, 0.1, 9, ellipseCurve(0, 0, 20, 9, 0.3))
    const alg = taubinEllipseWithResidual(pts, uniform(120, 0.1))!
    const refined = refineEllipse(pts, uniform(120, 0.1), alg.fit)!
    expect(0.25 * alg.residual).toBeLessThanOrEqual(refined.chi2)
  })
})

describe('rounded-rectangle geometry', () => {
  it('measures the signed distance exactly on sides, outside and inside', () => {
    expect(roundRectDistance(10, 0, 0, 0, 10, 5, 2)).toBeCloseTo(0, 10)
    expect(roundRectDistance(12, 0, 0, 0, 10, 5, 2)).toBeCloseTo(2, 10)
    expect(roundRectDistance(0, 0, 0, 0, 10, 5, 2)).toBeCloseTo(-5, 10)
    // A corner arc: the inner corner (8, 3) plus 2 along the diagonal is on the outline.
    expect(roundRectDistance(8 + Math.SQRT2, 3 + Math.SQRT2, 0, 0, 10, 5, 2)).toBeCloseTo(0, 10)
    // Rotated a quarter turn, the half-extents swap.
    const [c, s] = [Math.cos(Math.PI / 2), Math.sin(Math.PI / 2)]
    expect(roundRectDistance(0, 10, 0, 0, 10, 5, 2, c, s)).toBeCloseTo(0, 10)
  })

  it('finds the minimum-area rectangle by rotating calipers as a brute force does', () => {
    const rnd = lcg(3)
    const box = (pts: Float64Array, a: number) => {
      const [c, s] = [Math.cos(a), Math.sin(a)]
      let [ulo, uhi, vlo, vhi] = [Infinity, -Infinity, Infinity, -Infinity]
      for (let k = 0; k < pts.length; k += 2) {
        const u = c * pts[k] + s * pts[k + 1]
        const v = c * pts[k + 1] - s * pts[k]
        ;[ulo, uhi, vlo, vhi] = [
          Math.min(ulo, u),
          Math.max(uhi, u),
          Math.min(vlo, v),
          Math.max(vhi, v),
        ]
      }
      return (uhi - ulo) * (vhi - vlo)
    }
    for (let c = 0; c < 600; c++) {
      const n = 3 + Math.floor(rnd() * 60)
      const pts = Float64Array.from({ length: 2 * n }, () =>
        c % 3 === 0 ? Math.floor(rnd() * 12) : rnd() * 50,
      )
      // Every hull edge direction, by brute force: none gives a smaller box.
      let brute = Infinity
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) continue
          brute = Math.min(
            brute,
            box(pts, Math.atan2(pts[2 * j + 1] - pts[2 * i + 1], pts[2 * j] - pts[2 * i])),
          )
        }
      }
      if (!Number.isFinite(brute) || brute === 0) continue
      expect(box(pts, minAreaRectAngle(pts))).toBeLessThanOrEqual(brute * (1 + 1e-9) + 1e-9)
    }
  })

  it('finds the tilt of the minimum-area rectangle', () => {
    const { curve, total } = roundRectCurve(50, 40, 40, 24, 0, 0.35)
    const pts = sample(200, 0, total, true, 0, 1, curve)
    expect(minAreaRectAngle(pts)).toBeCloseTo(0.35, 6)
    const square = roundRectPts(64, [0, 0, 16, 16, 0], 0, 1)
    expect(minAreaRectAngle(square)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Recovery across sizes, rotations and corner radii
// ---------------------------------------------------------------------------

/** Points at roughly `spacing` px along a closed curve parametrized by arc length `[0, length)`. */
function ring(curve: Curve, length: number, spacing: number, seed: number, noise = SIGMA) {
  return sample(Math.max(12, Math.round(length / spacing)), 0, length, true, noise, seed, curve)
}

/**
 * Record `label` in `failures` when an error is not below its bound, or a
 * value differs from the one expected (`[value, expected, 'eq']`).
 */
function check(
  failures: string[],
  label: string,
  terms: Record<string, [number, number] | [number, number, 'eq']>,
): void {
  const bad = Object.entries(terms).filter(([, t]) =>
    t.length === 3 ? t[0] !== t[1] : !(t[0] < t[1]),
  )
  if (bad.length > 0)
    failures.push(`${label}: ${bad.map(([k, t]) => `${k} ${t[0]} vs ${t[1]}`).join(', ')}`)
}

/** Smallest difference between two rectangle rotations, modulo a quarter turn. */
function rectAngleError(a: number, b: number): number {
  const d = (((a - b) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2)
  return Math.min(d, Math.PI / 2 - d)
}

describe('recovery', () => {
  it('recovers noisy circles of radius 2 to 40', () => {
    const failures: string[] = []
    for (const r0 of [2, 2.5, 3, 4, 5, 6, 8, 12, 16, 20, 30, 40]) {
      const [cx, cy] = [50.37, 41.81]
      const length = 2 * Math.PI * r0
      const circle = circleCurve(cx, cy, r0)
      const pts = ring((s) => circle((s / length) * 2 * Math.PI), length, 0.8, 100 + r0 * 10)
      const offer = fitPrimitiveOrArcs(pts, uniform(count(pts), SIGMA), true, CFG)
      const prim = primitiveOf(offer, 'circle')
      check(failures, `r ${r0}`, {
        r: [Math.abs(prim.r - r0), 0.1],
        centre: [Math.hypot(prim.cx - cx, prim.cy - cy), 0.1],
        params: [offer!.params, 3, 'eq'],
        deviation: [offerDeviation(pts, offer!), 5 * SIGMA],
      })
      expect(lastEnd(offer!.segments)).toEqual([offer!.x0, offer!.y0])
    }
    expect(failures).toEqual([])
  })

  it('recovers ellipses, axis-aligned and tilted', () => {
    const cases: [number, number, number][] = [
      [8, 4, 0],
      [12, 6, 0.4],
      [20, 9, -0.7],
      [30, 18, 1.2],
      [50, 30, Math.PI / 2],
      [24, 20, -0.2],
    ]
    const failures: string[] = []
    for (const [rx0, ry0, ang0] of cases) {
      const [cx, cy] = [64.2, 48.9]
      const e = ellipseCurve(cx, cy, rx0, ry0, ang0)
      const pts = sample(Math.round(5 * (rx0 + ry0)), 0, 2 * Math.PI, true, SIGMA, rx0, e)
      const offer = fitPrimitiveOrArcs(pts, uniform(count(pts), SIGMA), true, CFG)
      const prim = primitiveOf(offer, 'ellipse')
      check(failures, `${rx0}×${ry0} at ${ang0}`, {
        rx: [Math.abs(prim.rx - rx0), 0.1],
        ry: [Math.abs(prim.ry - ry0), 0.1],
        centre: [Math.hypot(prim.cx - cx, prim.cy - cy), 0.1],
        rotation: [Math.abs(canonicalAngle(prim.rotation - ang0)), 0.01],
        params: [offer!.params, 5, 'eq'],
      })
    }
    expect(failures).toEqual([])
  })

  it('recovers sharp rectangles at several sizes and rotations', () => {
    const failures: string[] = []
    for (const [w0, h0] of [
      [10, 6],
      [24, 24],
      [40, 25],
      [90, 56],
    ]) {
      for (const rot of [0, 0.15, 0.5, -0.3, Math.PI / 4]) {
        const [cx, cy] = [60.3, 47.6]
        const { curve, total } = roundRectCurve(cx, cy, w0, h0, 0, rot)
        const pts = ring(curve, total, 0.8, w0 * 7 + h0)
        const offer = fitPrimitiveOrArcs(pts, uniform(count(pts), SIGMA), true, CFG)
        const prim = primitiveOf(offer, 'rect')
        const swap = Math.abs(prim.rotation - rot) > Math.PI / 4
        const [w, h] = swap ? [prim.h, prim.w] : [prim.w, prim.h]
        check(failures, `${w0}×${h0} at ${rot}`, {
          r: [prim.r, 0.1],
          w: [Math.abs(w - w0), 0.1],
          h: [Math.abs(h - h0), 0.1],
          centre: [Math.hypot(prim.cx - cx, prim.cy - cy), 0.1],
          rotation: [rectAngleError(prim.rotation, rot), 0.005],
          params: [offer!.params, rot === 0 ? 4 : 5, 'eq'],
          deviation: [offerDeviation(pts, offer!), 5 * SIGMA],
        })
        expect(lastEnd(offer!.segments)).toEqual([offer!.x0, offer!.y0])
      }
    }
    expect(failures).toEqual([])
  })

  it('recovers rounded rectangles with r = 2, 3, 5, 8 at several sizes and rotations', () => {
    const failures: string[] = []
    for (const r0 of [2, 3, 5, 8]) {
      for (const [w0, h0] of [
        [20, 17],
        [36, 24],
        [90, 56],
      ]) {
        for (const rot of [0, 0.3, -0.6]) {
          const [cx, cy] = [70.1, 55.7]
          const { curve, total } = roundRectCurve(cx, cy, w0, h0, r0, rot)
          const pts = ring(curve, total, 0.8, r0 * 1000 + w0 + h0)
          const offer = fitPrimitiveOrArcs(pts, uniform(count(pts), SIGMA), true, CFG)
          const prim = primitiveOf(offer, 'rect')
          const swap = Math.abs(prim.rotation - rot) > Math.PI / 4
          const [w, h] = swap ? [prim.h, prim.w] : [prim.w, prim.h]
          check(failures, `r ${r0}, ${w0}×${h0} at ${rot}`, {
            r: [Math.abs(prim.r - r0), 0.1],
            w: [Math.abs(w - w0), 0.1],
            h: [Math.abs(h - h0), 0.1],
            centre: [Math.hypot(prim.cx - cx, prim.cy - cy), 0.1],
            rotation: [rectAngleError(prim.rotation, rot), 0.005],
            params: [offer!.params, rot === 0 ? 6 : 7, 'eq'],
            deviation: [offerDeviation(pts, offer!), 5 * SIGMA],
          })
          expect(lastEnd(offer!.segments)).toEqual([offer!.x0, offer!.y0])
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('describes the image frame as a plain rectangle', () => {
    const [w, h] = [64, 48]
    const pts: number[] = []
    for (let x = 0; x < w; x++) pts.push(x, 0)
    for (let y = 0; y < h; y++) pts.push(w, y)
    for (let x = w; x > 0; x--) pts.push(x, h)
    for (let y = h; y > 0; y--) pts.push(0, y)
    const ringPts = Float64Array.from(pts)
    const offer = fitPrimitiveOrArcs(ringPts, uniform(count(ringPts), 0.5), true, fitConfig(64))
    const prim = primitiveOf(offer, 'rect')
    expect(prim.rotation).toBe(0)
    expect(prim.cx).toBeCloseTo(w / 2, 9)
    expect(prim.cy).toBeCloseTo(h / 2, 9)
    expect(prim.w).toBeCloseTo(w, 9)
    expect(prim.h).toBeCloseTo(h, 9)
    expect(prim.r).toBe(0)
    expect(offer!.params).toBe(4)
    expect(offer!.segments.every((s) => s.type === 'L')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Negative cases
// ---------------------------------------------------------------------------

describe('shapes that are not primitives', () => {
  it('rejects a squircle once it departs from a rounded square by more than the noise', () => {
    // |x/a|⁴ + |y/a|⁴ = 1, within about 0.5 % of its size of a rounded square
    // with r ≈ 0.54·a: at a = 10 that is inside σ = 0.05 and the rounded square
    // is an honest description; from a = 25 on it is not.
    const squircle = (a: number) =>
      sample(Math.round(8 * a), 0, 2 * Math.PI, true, SIGMA, a, (t) => {
        const [c, s] = [Math.cos(t), Math.sin(t)]
        return [
          40 + a * Math.sign(c) * Math.sqrt(Math.abs(c)),
          40 + a * Math.sign(s) * Math.sqrt(Math.abs(s)),
        ]
      })
    const offered = [25, 40, 60].map((a) => {
      const pts = squircle(a)
      return fitPrimitiveOrArcs(pts, uniform(count(pts), SIGMA), true, CFG)?.primitive
    })
    expect(offered).toEqual([undefined, undefined, undefined])
    const small = squircle(10)
    const offer = fitPrimitiveOrArcs(small, uniform(count(small), SIGMA), true, CFG)
    expect(offer?.primitive ? offerDeviation(small, offer) : 0).toBeLessThan(4 * SIGMA)
  })

  it('rejects a notched rectangle', () => {
    // A 40 × 30 rectangle with a 3 × 2 px notch cut into its top side.
    const corners = [
      [10, 10],
      [24, 10],
      [24, 12],
      [27, 12],
      [27, 10],
      [50, 10],
      [50, 40],
      [10, 40],
    ]
    const pts: number[] = []
    const rng = new XorShift(17)
    for (let i = 0; i < corners.length; i++) {
      const [ax, ay] = corners[i]
      const [bx, by] = corners[(i + 1) % corners.length]
      const len = Math.hypot(bx - ax, by - ay)
      const steps = Math.max(1, Math.round(len / 0.8))
      for (let k = 0; k < steps; k++) {
        const u = k / steps
        const nx = -(by - ay) / len
        const ny = (bx - ax) / len
        const d = k === 0 ? 0 : SIGMA * rng.gaussian()
        pts.push(ax + (bx - ax) * u + nx * d, ay + (by - ay) * u + ny * d)
      }
    }
    const ringPts = Float64Array.from(pts)
    const offer = fitPrimitiveOrArcs(ringPts, uniform(count(ringPts), SIGMA), true, CFG)
    expect(offer?.primitive).toBeUndefined()
  })

  it('rejects a teardrop', () => {
    const offered = [8, 20].map((size) => {
      // A round body drawn to a point: (cos t, sin t · sin²(t/2)) scaled.
      const curve: Curve = (t) => [
        30 + size * Math.cos(t),
        30 + size * Math.sin(t) * Math.sin(t / 2) ** 2,
      ]
      const pts = sample(Math.round(6 * size), 0, 2 * Math.PI, true, SIGMA, size, curve)
      return fitPrimitiveOrArcs(pts, uniform(count(pts), SIGMA), true, CFG)?.primitive
    })
    expect(offered).toEqual([undefined, undefined])
  })

  it('does not offer an arc a single line describes more cheaply', () => {
    // A 40 px run bowed 0.4 px (radius 500) at σ = 0.5: the circle fits, but one
    // line at two parameters beats one arc at five.
    const pts = sample(40, -0.04, 0.04, false, 0, 1, circleCurve(0, 0, 500))
    const sigma = uniform(40, 0.5)
    expect(fitArcs(pts, sigma, false)).not.toBeNull()
    expect(fitPrimitiveOrArcs(pts, sigma, false, CFG)).toBeNull()
  })

  it('rejects a circle that winds twice', () => {
    const one = sample(120, 0, 2 * Math.PI, true, SIGMA, 3, circleCurve(20, 20, 10))
    const twice = new Float64Array(480)
    twice.set(one)
    twice.set(one, 240)
    expect(fitPrimitiveOrArcs(twice, uniform(240, SIGMA), true, CFG)?.primitive?.kind).not.toBe(
      'circle',
    )
  })
})

// ---------------------------------------------------------------------------
// Path forms
// ---------------------------------------------------------------------------

/** Dense samples of a primitive's outline. */
function outline(prim: EdgePrimitive, n: number): Float64Array {
  const out = new Float64Array(2 * n)
  if (prim.kind === 'circle') {
    for (let k = 0; k < n; k++)
      [out[2 * k], out[2 * k + 1]] = circleCurve(prim.cx, prim.cy, prim.r)((2 * Math.PI * k) / n)
  } else if (prim.kind === 'ellipse') {
    const e = ellipseCurve(prim.cx, prim.cy, prim.rx, prim.ry, prim.rotation)
    for (let k = 0; k < n; k++) [out[2 * k], out[2 * k + 1]] = e((2 * Math.PI * k) / n)
  } else {
    const { curve, total } = roundRectCurve(prim.cx, prim.cy, prim.w, prim.h, prim.r, prim.rotation)
    for (let k = 0; k < n; k++) [out[2 * k], out[2 * k + 1]] = curve((total * k) / n)
  }
  return out
}

/** Signed distance from `(x, y)` to a primitive's outline. */
function distanceTo(prim: EdgePrimitive, x: number, y: number): number {
  if (prim.kind === 'circle') return Math.hypot(x - prim.cx, y - prim.cy) - prim.r
  if (prim.kind === 'ellipse') {
    const e: EllipseFit = { ...prim, angle: prim.rotation, chi2: 0 }
    return ellipseContact(e, x, y, new Float64Array(4))
  }
  const [c, s] = [Math.cos(prim.rotation), Math.sin(prim.rotation)]
  return roundRectDistance(x, y, prim.cx, prim.cy, prim.w / 2, prim.h / 2, prim.r, c, s)
}

describe('primitive path forms', () => {
  const prims: EdgePrimitive[] = [
    { kind: 'circle', cx: 10.5, cy: -3.25, r: 7 },
    { kind: 'ellipse', cx: 4, cy: 9, rx: 15, ry: 6, rotation: 0.7 },
    { kind: 'rect', cx: 30, cy: 20, w: 24, h: 10, r: 0, rotation: 0 },
    { kind: 'rect', cx: 30, cy: 20, w: 24, h: 10, r: 3, rotation: -0.4 },
    { kind: 'rect', cx: 30, cy: 20, w: 10, h: 10, r: 5, rotation: 0.2 },
  ]

  it('draws exactly the primitive, once round the asked way, and closes exactly at its start', () => {
    const failures: string[] = []
    for (const prim of prims) {
      const dense = outline(prim, 720)
      for (const k of [0, 97, 333]) {
        const [x0, y0] = nearestOnPrimitive(prim, dense[2 * k] + 0.3, dense[2 * k + 1] - 0.2)
        for (const increasing of [true, false]) {
          const label = `${prim.kind} from ${k}, ${increasing}`
          const segs = primitiveCommands(prim, x0, y0, increasing)
          expect(lastEnd(segs)).toEqual([x0, y0])
          expect(segs.some((s) => s.type === 'A' && s.largeArc)).toBe(false)
          const path = Float64Array.from(samplePath(x0, y0, segs, 0.05))
          let worst = 0
          for (let i = 0; i < path.length; i += 2) {
            worst = Math.max(worst, Math.abs(distanceTo(prim, path[i], path[i + 1])))
          }
          const sweep = totalSweep(path, prim.cx, prim.cy, true)
          check(failures, label, {
            onOutline: [worst, 1e-9],
            turn: [Math.abs(sweep - (increasing ? 2 * Math.PI : -2 * Math.PI)), 1e-9],
          })
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('puts the start on the primitive, at the nearest point of its outline', () => {
    for (const prim of prims) {
      const [x, y] = nearestOnPrimitive(prim, 100, -50)
      expect(Math.abs(distanceTo(prim, x, y))).toBeLessThan(1e-9)
      const dense = outline(prim, 4000)
      let nearest = Infinity
      for (let k = 0; k < 4000; k++) {
        nearest = Math.min(nearest, Math.hypot(dense[2 * k] - 100, dense[2 * k + 1] + 50))
      }
      expect(Math.hypot(x - 100, y + 50)).toBeLessThanOrEqual(nearest + 1e-9)
    }
  })

  it('follows the ring the offer describes', () => {
    const pts = sample(240, 0, 2 * Math.PI, true, SIGMA, 4, ellipseCurve(30, 30, 20, 11, 0.3))
    const offer = fitPrimitiveOrArcs(pts, uniform(240, SIGMA), true, CFG)!
    expect(offer.segments.every((s) => s.type === 'A' && s.sweep)).toBe(true)
    const back = reversedRun(pts)
    const offerBack = fitPrimitiveOrArcs(back, uniform(240, SIGMA), true, CFG)!
    expect(offerBack.segments.every((s) => s.type === 'A' && !s.sweep)).toBe(true)
  })

  it('is deterministic', () => {
    const { curve, total } = roundRectCurve(33, 21, 30, 18, 4, 0.25)
    const pts = sample(120, 0, total, true, SIGMA, 8, curve)
    const sigma = uniform(120, SIGMA)
    expect(fitPrimitiveOrArcs(pts, sigma, true, CFG)).toEqual(
      fitPrimitiveOrArcs(pts, sigma, true, CFG),
    )
  })
})
