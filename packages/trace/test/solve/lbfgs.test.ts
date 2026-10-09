import { describe, expect, it } from 'vitest'
import {
  FUNC_TOL,
  MAX_ITERS,
  MAX_TOTAL,
  PG_TOL,
  PIN_X,
  PIN_Y,
  lbfgsDescend,
  pathSlope,
  projectPath,
  projectedGradientNorm,
} from '../../src/solve/lbfgs'
import type { LbfgsResult, LbfgsStep, Objective } from '../../src/solve/lbfgs'
import { MAX_EVALS } from '../../src/solve/linesearch'

/** The Rosenbrock function of every point, `100(y − x²)² + (1 − x)²`: minimum 0 at (1, 1). */
const rosenbrock: Objective = (x, g) => {
  let e = 0
  for (let k = 0; k < x.length; k += 2) {
    const a = x[k + 1] - x[k] * x[k]
    const b = 1 - x[k]
    e += 100 * a * a + b * b
    g[k] = -400 * x[k] * a - 2 * b
    g[k + 1] = 200 * a
  }
  return e
}

/** `Σ_v |p_v − c_v|²` over the given points (every point for part −1). */
function isotropic(c: Float64Array, parts?: number[][]): Objective {
  return (x, g, part) => {
    const ids = part < 0 || !parts ? range(x.length >> 1) : parts[part]
    let e = 0
    for (const v of ids) {
      const dx = x[2 * v] - c[2 * v]
      const dy = x[2 * v + 1] - c[2 * v + 1]
      e += dx * dx + dy * dy
      g[2 * v] = 2 * dx
      g[2 * v + 1] = 2 * dy
    }
    return e
  }
}

/**
 * An ill-conditioned convex quadratic with its minimum 0 at `c`: each point's
 * offset weighted by `[[10, 3], [3, 1.2]]` (condition ≈ 40), plus springs
 * between consecutive points holding their offsets from `c` equal.
 */
function coupledQuadratic(c: Float64Array): Objective {
  return (x, g) => {
    const n = x.length >> 1
    let e = 0
    for (let v = 0; v < n; v++) {
      const dx = x[2 * v] - c[2 * v]
      const dy = x[2 * v + 1] - c[2 * v + 1]
      e += 10 * dx * dx + 6 * dx * dy + 1.2 * dy * dy
      g[2 * v] = 20 * dx + 6 * dy
      g[2 * v + 1] = 6 * dx + 2.4 * dy
    }
    for (let v = 0; v < n - 1; v++) {
      const lx = x[2 * v + 2] - x[2 * v] - (c[2 * v + 2] - c[2 * v])
      const ly = x[2 * v + 3] - x[2 * v + 1] - (c[2 * v + 3] - c[2 * v + 1])
      e += 4 * (lx * lx + ly * ly)
      g[2 * v + 2] += 8 * lx
      g[2 * v + 3] += 8 * ly
      g[2 * v] -= 8 * lx
      g[2 * v + 1] -= 8 * ly
    }
    return e
  }
}

/**
 * The exact-coverage energy of a vertical boundary measured off its true
 * position: one point per row of a `w`-pixel-wide image whose pixel `i` holds
 * the white coverage `clamp(i + 1 − truth, 0, 1)` of the boundary at
 * `x = truth` (white to its right), each row's residual summed over its
 * pixels, plus inkvec's anchor prior `K_ANCHOR · D0 / n · |p − p⁰|²` with
 * `D0` the starting data term. Piecewise smooth: the slope jumps where the
 * boundary meets a gridline.
 */
function coverageEdge(w: number, truth: number, start: Float64Array): Objective {
  const n = start.length >> 1
  const cov = (i: number, x: number): number => Math.min(Math.max(i + 1 - x, 0), 1)
  const data = (x: Float64Array, g: Float64Array | undefined): number => {
    let e = 0
    for (let v = 0; v < n; v++) {
      const p = x[2 * v]
      let gx = 0
      for (let i = 0; i < w; i++) {
        const r = cov(i, p) - cov(i, truth)
        e += r * r
        const u = i + 1 - p
        if (u > 0 && u < 1) gx -= 2 * r
      }
      if (g) {
        g[2 * v] = gx
        g[2 * v + 1] = 0
      }
    }
    return e
  }
  const anchor = (0.1 * data(start, undefined)) / n
  return (x, g) => {
    let e = data(x, g)
    for (let k = 0; k < x.length; k++) {
      const d = x[k] - start[k]
      e += anchor * d * d
      g[k] += 2 * anchor * d
    }
    return e
  }
}

/** One point per row of an image `h` tall, all at `x`, off the gridlines in y. */
function verticalChain(x: number, h: number): Float64Array {
  const pts = new Float64Array(2 * h)
  for (let j = 0; j < h; j++) {
    pts[2 * j] = x
    pts[2 * j + 1] = j + 0.63
  }
  return pts
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i)
}

/** Everything a descent returns, as text, so two runs compare bit for bit. */
function outcome(r: LbfgsResult | undefined): string {
  if (!r) return 'none'
  return JSON.stringify([Array.from(r.x), r.before, r.after, r.iters, r.evals])
}

function distance(a: Float64Array, b: Float64Array, v: number): number {
  return Math.hypot(a[2 * v] - b[2 * v], a[2 * v + 1] - b[2 * v + 1])
}

describe('lbfgsDescend', () => {
  it('minimizes the Rosenbrock function', () => {
    const r = lbfgsDescend(rosenbrock, Float64Array.of(-1.2, 1), { maxTotal: Infinity })!
    expect(r.iters).toBeLessThanOrEqual(MAX_ITERS)
    expect(r.after).toBeLessThan(1e-8)
    expect(Math.abs(r.x[0] - 1)).toBeLessThan(1e-3)
    expect(Math.abs(r.x[1] - 1)).toBeLessThan(1e-3)
    // The extended Rosenbrock function (Moré, Garbow & Hillstrom 1981), eight
    // copies in one problem.
    const start = new Float64Array(16)
    for (let v = 0; v < 8; v++) start.set([-1.2, 1], 2 * v)
    const e = lbfgsDescend(rosenbrock, start, { maxTotal: Infinity, maxStep: 1 })!
    expect(e.after).toBeLessThan(1e-8)
    for (const c of e.x) expect(Math.abs(c - 1)).toBeLessThan(1e-3)
  })

  it('minimizes an ill-conditioned convex quadratic, stopping on the relative decrease', () => {
    const c = Float64Array.from({ length: 12 }, (_, k) => 0.3 * Math.sin(1.7 * k + 0.4))
    const f = coupledQuadratic(c)
    const steps: LbfgsStep[] = []
    const r = lbfgsDescend(f, new Float64Array(12), { onStep: (s) => steps.push(s) })!
    expect(r.after).toBeLessThan(r.before * 1e-5)
    for (let k = 0; k < 12; k++) expect(Math.abs(r.x[k] - c[k])).toBeLessThan(5e-3)
    // It stopped on the step that lowered the energy by less than FUNC_TOL of
    // the start's, and on no earlier one.
    expect(steps).toHaveLength(r.iters)
    expect(steps.at(-1)!.rel).toBeLessThan(FUNC_TOL)
    for (const s of steps.slice(0, -1)) expect(s.rel).toBeGreaterThanOrEqual(FUNC_TOL)
    // Measured against a smaller changeable energy, the same decrease is no
    // longer negligible: the descent goes on, lower.
    const deeper = lbfgsDescend(f, new Float64Array(12), { fixedEnergy: r.before * (1 - 1e-4) })!
    expect(deeper.iters).toBeGreaterThan(r.iters)
    expect(deeper.after).toBeLessThan(r.after)
  })

  it('stops on the projected gradient at a smooth minimum', () => {
    // On an isotropic quadratic the quasi-Newton step after the first is
    // exact; the next iteration finds the gradient (relatively) zero, while
    // every step still lowered the energy by far more than FUNC_TOL.
    const c = Float64Array.of(0.2, -0.1, 0.05, 0.15)
    const f = isotropic(c)
    const steps: LbfgsStep[] = []
    const r = lbfgsDescend(f, new Float64Array(4), { onStep: (s) => steps.push(s) })!
    expect(r.iters).toBeLessThan(MAX_ITERS)
    for (const s of steps) expect(s.rel).toBeGreaterThan(FUNC_TOL)
    const g = new Float64Array(4)
    f(r.x, g, -1)
    const g0 = new Float64Array(4)
    f(new Float64Array(4), g0, -1)
    const pg0 = Math.max(Math.hypot(g0[0], g0[1]), Math.hypot(g0[2], g0[3]))
    expect(projectedGradientNorm(new Float64Array(4), r.x, g, MAX_TOTAL)).toBeLessThanOrEqual(
      PG_TOL * pg0,
    )
  })

  it('keeps every point in its disc, on the edge nearest an outside minimum', () => {
    const far = Float64Array.of(3, 0, 0, -3, 2.1, 2.1)
    const start = new Float64Array(6)
    const r = lbfgsDescend(isotropic(far), start)!
    for (let v = 0; v < 3; v++) {
      const d = Math.hypot(far[2 * v], far[2 * v + 1])
      expect(r.x[2 * v]).toBeCloseTo(far[2 * v] / d, 9)
      expect(r.x[2 * v + 1]).toBeCloseTo(far[2 * v + 1] / d, 9)
      expect(distance(r.x, start, v)).toBeLessThanOrEqual(MAX_TOTAL * (1 + 1e-12))
    }
  })

  it('meets the first-order conditions on the disc for an anisotropic objective', () => {
    // The constrained minimum of (x − 2)² + 10(y − 1.5)² on the unit disc is
    // not the radial projection of (2, 1.5); there the gradient is normal to
    // the circle, pointing inward.
    const f: Objective = (x, g) => {
      const dx = x[0] - 2
      const dy = x[1] - 1.5
      g[0] = 2 * dx
      g[1] = 20 * dy
      return dx * dx + 10 * dy * dy
    }
    const start = new Float64Array(2)
    const r = lbfgsDescend(f, start)!
    expect(Math.hypot(r.x[0], r.x[1])).toBeCloseTo(1, 9)
    const g = new Float64Array(2)
    f(r.x, g, -1)
    const pg = projectedGradientNorm(start, r.x, g, MAX_TOTAL)
    expect(pg).toBeLessThan(1e-3 * Math.hypot(g[0], g[1]))
    expect(g[0] * r.x[0] + g[1] * r.x[1]).toBeLessThan(0)
  })

  it('holds pinned coordinates at their start', () => {
    // The objective reports a gradient along the pinned coordinates; the
    // solver ignores it there.
    const c = Float64Array.of(0.5, -0.4, 0.3, 0.6, -0.2, 0.25)
    const start = Float64Array.of(0, 0, 0.1, 0.2, 0.05, -0.05)
    const pin = Uint8Array.of(PIN_X, PIN_Y, PIN_X | PIN_Y)
    const r = lbfgsDescend(isotropic(c), start, { pin })!
    expect(r.x[0]).toBe(start[0])
    expect(r.x[3]).toBe(start[3])
    expect(r.x[4]).toBe(start[4])
    expect(r.x[5]).toBe(start[5])
    expect(r.x[1]).toBeCloseTo(c[1], 6)
    expect(r.x[2]).toBeCloseTo(c[2], 6)
  })

  it('moves a mis-measured edge onto its true sub-pixel position', () => {
    // inkvec's vertical-edge case in Trazor's frame: measured through the
    // middle of pixel column 3, true at 3.8 and 3.22 (same column) and at 4.35
    // (across the gridline x = 4).
    const [w, h, x0] = [8, 10, 3.5]
    for (const truth of [3.8, 3.22, 4.35]) {
      const start = verticalChain(x0, h)
      const r = lbfgsDescend(coverageEdge(w, truth, start), start)!
      expect(r.after).toBeLessThan(r.before)
      const err0 = Math.abs(truth - x0)
      for (let v = 0; v < h; v++) {
        const err = Math.abs(r.x[2 * v] - truth)
        // The anchor holds each point back a little. Across the gridline the
        // energy has a local minimum just short of it (the residual of the
        // pixel the boundary leaves flattens out as that pixel empties, and the
        // anchor pulls back), which inkvec's own test allows for.
        expect(err, `truth ${truth}, point ${v}`).toBeLessThan(err0 > 0.5 ? err0 * 0.5 : 0.025)
        expect(r.x[2 * v + 1]).toBe(start[2 * v + 1])
        expect(distance(r.x, start, v)).toBeLessThanOrEqual(MAX_TOTAL + 1e-9)
      }
    }
  })

  it('lands on the exact minimizer of a mis-measured edge within one pixel', () => {
    // Within one pixel the energy is quadratic: the minimizer of the data term
    // and the anchor is (t + w·x⁰)/(1 + w), with w = K_ANCHOR·D0/n and
    // D0 = n·(x⁰ − t)².
    const [w, h, x0] = [8, 10, 3.5]
    for (const truth of [3.8, 3.22]) {
      const start = verticalChain(x0, h)
      const r = lbfgsDescend(coverageEdge(w, truth, start), start)!
      const anchor = 0.1 * (x0 - truth) ** 2
      const exact = (truth + anchor * x0) / (1 + anchor)
      for (let v = 0; v < h; v++) expect(Math.abs(r.x[2 * v] - exact)).toBeLessThan(1e-6)
    }
  })

  it('leaves an edge already in place alone', () => {
    const start = verticalChain(3.8, 6)
    expect(lbfgsDescend(coverageEdge(8, 3.8, start), start)).toBeUndefined()
    expect(lbfgsDescend(rosenbrock, new Float64Array(0))).toBeUndefined()
    expect(lbfgsDescend(rosenbrock, Float64Array.of(1, 1))).toBeUndefined()
  })

  it('solves each part on its own and leaves points outside every part alone', () => {
    const c = Float64Array.of(0.5, 0.2, -0.3, 0.4, 0.1, -0.6, 0.7, 0.7, 0.2, 0.2)
    const parts = [[0, 2], [1], [3]]
    const seen: number[] = []
    const base = isotropic(c, parts)
    const f: Objective = (x, g, part) => {
      seen.push(part)
      // Only the part's gradient entries may be read.
      g.fill(Number.NaN)
      return base(x, g, part)
    }
    const start = new Float64Array(10)
    const r = lbfgsDescend(f, start, { parts })!
    // The whole problem once at the start, then each part in order.
    expect(seen[0]).toBe(-1)
    expect(seen.slice(1)).toEqual(seen.slice(1).toSorted((a, b) => a - b))
    expect(new Set(seen)).toEqual(new Set([-1, 0, 1, 2]))
    for (const v of [0, 1, 2, 3]) {
      expect(r.x[2 * v]).toBeCloseTo(c[2 * v], 6)
      expect(r.x[2 * v + 1]).toBeCloseTo(c[2 * v + 1], 6)
    }
    // Point 4 is in no part.
    expect(r.x[8]).toBe(0)
    expect(r.x[9]).toBe(0)
    // Before and after are the sums of the parts' energies.
    const g = new Float64Array(10)
    const sum = (x: Float64Array): number => parts.reduce((s, _, k) => s + base(x, g, k), 0)
    expect(r.before).toBe(sum(start))
    expect(r.after).toBe(sum(r.x))
  })

  it('takes no step on a part with nothing to gain', () => {
    const c = Float64Array.of(0.5, 0.2, 0, 0)
    const parts = [[0], [1]]
    const iters: number[] = [0, 0]
    const r = lbfgsDescend(isotropic(c, parts), new Float64Array(4), {
      parts,
      onStep: (s) => iters[s.part]++,
    })!
    expect(iters[1]).toBe(0)
    expect(r.x[2]).toBe(0)
    expect(r.x[3]).toBe(0)
    expect(r.iters).toBe(iters[0])
  })

  it('caps the iterations: no cap is the uncapped descent, a cap only ends it earlier', () => {
    const start = Float64Array.of(-1.2, 1)
    const opts = { maxTotal: Infinity }
    const full = lbfgsDescend(rosenbrock, start, opts)!
    expect(full.iters).toBeGreaterThan(1)
    for (const cap of [MAX_ITERS, full.iters, full.iters + 1, Number.MAX_SAFE_INTEGER, Infinity]) {
      expect(
        outcome(lbfgsDescend(rosenbrock, start, { ...opts, maxIters: cap })),
        `cap ${cap}`,
      ).toBe(outcome(full))
    }
    const one = lbfgsDescend(rosenbrock, start, { ...opts, maxIters: 1 })!
    expect(one.iters).toBe(1)
    expect(one.after).toBeLessThan(one.before)
    expect(one.after).toBeGreaterThanOrEqual(full.after)
    expect(lbfgsDescend(rosenbrock, start, { ...opts, maxIters: 0 })).toBeUndefined()
    // A cap above the ceiling does not raise it.
    const slow = lbfgsDescend(rosenbrock, start, { ...opts, maxStep: 0.01, maxIters: 1000 })!
    expect(slow.iters).toBe(MAX_ITERS)
    expect(start).toEqual(Float64Array.of(-1.2, 1))
  })

  it('spends an iteration budget across the parts in order', () => {
    const start = new Float64Array(16)
    for (let v = 0; v < 8; v++) start.set([-1.2, 1], 2 * v)
    const parts = range(8).map((v) => [v])
    const opts = { parts, maxTotal: Infinity }
    const unbudgeted = new Array(8).fill(0)
    lbfgsDescend(rosenbrock, start, { ...opts, onStep: (s) => unbudgeted[s.part]++ })
    expect(unbudgeted[1]).toBeGreaterThan(10)
    const perPart = new Array(8).fill(0)
    const r = lbfgsDescend(rosenbrock, start, {
      ...opts,
      iterationBudget: unbudgeted[0] + 10,
      onStep: (s) => perPart[s.part]++,
    })!
    expect(perPart.slice(0, 2)).toEqual([unbudgeted[0], 10])
    for (let v = 2; v < 8; v++) {
      expect(perPart[v]).toBe(0)
      expect(r.x[2 * v]).toBe(-1.2)
      expect(r.x[2 * v + 1]).toBe(1)
    }
    expect(lbfgsDescend(rosenbrock, start, { ...opts, iterationBudget: 0 })).toBeUndefined()
  })

  it('ends on a nonsmooth objective within its caps', () => {
    // ℓ1 plus a small quadratic: the minimum sits on a kink, where the
    // curvature condition cannot be met.
    const c = Float64Array.of(0.3, 0.5, 0.7, 0.3, 1.1, 0.1)
    const f: Objective = (x, g) => {
      let e = 0
      for (let k = 0; k < x.length; k++) {
        const d = x[k] - c[k]
        e += Math.abs(d) + 0.01 * d * d
        g[k] = Math.sign(d) + 0.02 * d
      }
      return e
    }
    const r = lbfgsDescend(f, Float64Array.of(0, 0.1, 0.2, 0.1, 0.4, 0.1))!
    expect(r.after).toBeLessThan(r.before)
    expect(r.iters).toBeLessThanOrEqual(MAX_ITERS)
    expect(r.evals).toBeLessThanOrEqual(1 + 1 + MAX_ITERS * MAX_EVALS)
    for (let k = 0; k < 6; k++) expect(Math.abs(r.x[k] - c[k])).toBeLessThan(1e-3)
  })

  it('moves no point more than maxStep in one step', () => {
    const c = Float64Array.of(0.9, -0.4, -0.7, 0.6, 0.2, 0.95)
    for (const maxStep of [0.35, 0.1]) {
      const steps: LbfgsStep[] = []
      lbfgsDescend(isotropic(c), new Float64Array(6), { maxStep, onStep: (s) => steps.push(s) })
      expect(steps.length).toBeGreaterThan(0)
      for (const s of steps) expect(s.moved).toBeLessThanOrEqual(maxStep * (1 + 1e-12))
      expect(steps[0].iter).toBe(0)
    }
  })

  it('is deterministic', () => {
    const c = Float64Array.from({ length: 12 }, (_, k) => 0.3 * Math.sin(1.7 * k + 0.4))
    const a = lbfgsDescend(coupledQuadratic(c), new Float64Array(12))
    const b = lbfgsDescend(coupledQuadratic(c), new Float64Array(12))
    expect(outcome(b)).toBe(outcome(a))
  })

  it('rejects malformed arguments', () => {
    expect(() => lbfgsDescend(rosenbrock, new Float64Array(3))).toThrow(RangeError)
    expect(() => lbfgsDescend(rosenbrock, new Float64Array(2), { maxTotal: 0 })).toThrow(RangeError)
    expect(() => lbfgsDescend(rosenbrock, new Float64Array(2), { maxStep: Infinity })).toThrow(
      RangeError,
    )
    expect(() => lbfgsDescend(rosenbrock, new Float64Array(4), { pin: new Uint8Array(1) })).toThrow(
      RangeError,
    )
  })
})

describe('the projected path', () => {
  /** A smooth test function of every point and its gradient. */
  const smooth = (x: Float64Array, g: Float64Array): number => {
    let e = 0
    for (let k = 0; k < x.length; k += 2) {
      const [a, b] = [x[k], x[k + 1]]
      e += a * a * b + 0.3 * a * a * a - b * b + Math.sin(a + 2 * b)
      g[k] = 2 * a * b + 0.9 * a * a + Math.cos(a + 2 * b)
      g[k + 1] = a * a - 2 * b + 2 * Math.cos(a + 2 * b)
    }
    return e
  }
  const start = Float64Array.of(0, 0, 1, 1, -0.5, 2, 0.3, -0.2)
  // The first point sits on its disc's edge, the others inside.
  const x = Float64Array.of(0.6, 0.8, 1.2, 0.9, -0.4, 2.3, 0.3, -0.2)
  const dir = Float64Array.of(0.9, 0.3, 1.4, -0.6, -0.8, 1.1, 0.2, 0.5)
  const pin = Uint8Array.of(0, 0, 0, PIN_Y)
  dir[7] = 0

  it('keeps every point in its disc and pinned coordinates at their start', () => {
    const out = new Float64Array(8)
    for (const a of [0, 0.1, 0.5, 1, 3]) {
      projectPath(start, pin, x, dir, a, MAX_TOTAL, out)
      for (let v = 0; v < 4; v++) {
        expect(distance(out, start, v)).toBeLessThanOrEqual(MAX_TOTAL * (1 + 1e-12))
      }
      expect(out[7]).toBe(start[7])
    }
  })

  it('has the slope of the energy along it, also where the projection is active', () => {
    const out = new Float64Array(8)
    const g = new Float64Array(8)
    const phi = (a: number): number => {
      projectPath(start, pin, x, dir, a, MAX_TOTAL, out)
      return smooth(out, g)
    }
    const h = 1e-6
    for (const a of [0.05, 0.3, 0.7, 1.5]) {
      phi(a)
      const slope = pathSlope(start, x, dir, a, g, MAX_TOTAL)
      const numeric = (phi(a + h) - phi(a - h)) / (2 * h)
      expect(Math.abs(slope - numeric), `a = ${a}`).toBeLessThan(1e-6 * (1 + Math.abs(slope)))
    }
  })

  it('measures the projected gradient without the component the disc blocks', () => {
    const s = Float64Array.of(0, 0)
    const onEdge = Float64Array.of(1, 0)
    // −g points outward: only the tangential part counts.
    expect(projectedGradientNorm(s, onEdge, Float64Array.of(-3, 4), MAX_TOTAL)).toBeCloseTo(4, 12)
    // −g points inward: all of it counts.
    expect(projectedGradientNorm(s, onEdge, Float64Array.of(3, 4), MAX_TOTAL)).toBeCloseTo(5, 12)
    // Inside the disc nothing is blocked.
    expect(
      projectedGradientNorm(s, Float64Array.of(0.5, 0), Float64Array.of(-3, 4), MAX_TOTAL),
    ).toBeCloseTo(5, 12)
  })
})
