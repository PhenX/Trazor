import { describe, expect, it } from 'vitest'
import {
  evalPoly,
  factorQuarticInner,
  rootsBetween,
  solve3,
  solveCubic,
  solveQuadratic,
} from '../../src/fit/roots'
import { lcg } from './fit-helpers'

describe('solveQuadratic', () => {
  it('finds both roots in ascending order', () => {
    // (x − 2)(x + 3) = x² + x − 6
    expect(solveQuadratic(-6, 1, 1)).toEqual([-3, 2])
    expect(solveQuadratic(1, 2, 1)).toEqual([-1])
    expect(solveQuadratic(1, 0, 1)).toEqual([])
  })

  it('solves the linear part when the quadratic term vanishes', () => {
    expect(solveQuadratic(-4, 2, 0)).toEqual([2])
    expect(solveQuadratic(0, 0, 0)).toEqual([0])
    expect(solveQuadratic(1, 0, 0)).toEqual([])
  })
})

describe('solveCubic', () => {
  it('finds three distinct real roots', () => {
    // (x − 1)(x − 2)(x − 3) = x³ − 6x² + 11x − 6
    const r = solveCubic(-6, 11, -6, 1).sort((a, b) => a - b)
    expect(r).toHaveLength(3)
    r.forEach((x, k) => expect(x).toBeCloseTo(k + 1, 12))
  })

  it('finds the single real root and falls back to the quadratic', () => {
    // (x − 2)(x² + 1)
    const r = solveCubic(-2, 1, -2, 1)
    expect(r).toHaveLength(1)
    expect(r[0]).toBeCloseTo(2, 12)
    expect(solveCubic(-6, 1, 1, 0)).toEqual([-3, 2])
  })

  it('every root it reports is a root', () => {
    const rnd = lcg(3)
    for (let c = 0; c < 200; c++) {
      const co = [20 * rnd() - 10, 20 * rnd() - 10, 20 * rnd() - 10, 20 * rnd() - 10]
      for (const x of solveCubic(co[0], co[1], co[2], co[3])) {
        const scale = Math.max(...co.map(Math.abs)) * Math.max(1, Math.abs(x)) ** 3
        expect(Math.abs(evalPoly(co, x))).toBeLessThan(1e-9 * scale)
      }
    }
  })
})

describe('factorQuarticInner', () => {
  it('splits a quartic into two real quadratics whose product is the quartic', () => {
    const rnd = lcg(9)
    let factored = 0
    for (let c = 0; c < 200; c++) {
      const [a, b, cc, d] = [40 * rnd() - 20, 40 * rnd() - 20, 40 * rnd() - 20, 40 * rnd() - 20]
      const f = factorQuarticInner(a, b, cc, d, false)
      if (!f) continue
      factored++
      const [a1, b1, a2, b2] = f
      // (x² + a1 x + b1)(x² + a2 x + b2)
      expect(a1 + a2).toBeCloseTo(a, 8)
      expect(b1 + a1 * a2 + b2).toBeCloseTo(b, 8)
      expect(b1 * a2 + a1 * b2).toBeCloseTo(cc, 7)
      expect(b1 * b2).toBeCloseTo(d, 7)
    }
    expect(factored).toBeGreaterThan(150)
  })

  it('recovers the roots of a quartic with known roots', () => {
    // (x − 1)(x − 2)²(x + 3) = x⁴ − 2x³ − 7x² + 20x − 12
    const f = factorQuarticInner(-2, -7, 20, -12, false)
    expect(f).not.toBeNull()
    const [a1, b1, a2, b2] = f as [number, number, number, number]
    const roots = [...solveQuadratic(b1, a1, 1), ...solveQuadratic(b2, a2, 1)].sort((p, q) => p - q)
    const want = [-3, 1, 2, 2]
    // The double root may come back as one root of each factor or as a double one.
    for (const r of roots) expect(want.some((w) => Math.abs(r - w) < 1e-6)).toBe(true)
    expect(roots.some((r) => Math.abs(r + 3) < 1e-9)).toBe(true)
    expect(roots.some((r) => Math.abs(r - 1) < 1e-9)).toBe(true)
  })
})

describe('rootsBetween', () => {
  it('finds every simple root of a quintic in the interval, ascending', () => {
    // (x − 0.1)(x − 0.3)(x − 0.55)(x − 0.8)(x − 2)
    const roots = [0.1, 0.3, 0.55, 0.8, 2]
    let c = [1]
    for (const r of roots) {
      const next = new Array<number>(c.length + 1).fill(0)
      for (let k = 0; k < c.length; k++) {
        next[k + 1] += c[k]
        next[k] -= r * c[k]
      }
      c = next
    }
    const got = rootsBetween(c, 0, 1, 1e-12)
    expect(got).toHaveLength(4)
    got.forEach((x, k) => expect(x).toBeCloseTo(roots[k], 10))
  })

  it('handles cubics and quartics, and finds nothing without a sign change', () => {
    expect(rootsBetween([0.25, 0, 1, 0], -1, 1, 1e-12)).toEqual([])
    const quad = rootsBetween([-0.25, 0, 1, 0], -1, 1, 1e-12)
    expect(quad.map((x) => Math.round(x * 1e9) / 1e9)).toEqual([-0.5, 0.5])
    const r = rootsBetween([-6, 11, -6, 1], 0, 4, 1e-12)
    expect(r).toHaveLength(3)
    r.forEach((x, k) => expect(x).toBeCloseTo(k + 1, 10))
    // x⁴ − 5x² + 4 = (x² − 1)(x² − 4)
    const q = rootsBetween([4, 0, -5, 0, 1], -3, 3, 1e-12)
    expect(q.map((x) => Math.round(x * 1e9) / 1e9)).toEqual([-2, -1, 1, 2])
    expect(rootsBetween([1, 0, 1, 0, 0, 1], 0, 1, 1e-9)).toEqual([])
  })
})

describe('solve3', () => {
  it("solves a 3x3 system by Cramer's rule and refuses a singular one", () => {
    const out = new Float64Array(3)
    // x + 2y + 3z = 14, 2x + y + z = 7, 3x + 2y + z = 10 → (1, 2, 3)
    expect(solve3([1, 2, 3, 2, 1, 1, 3, 2, 1], [14, 7, 10], out)).toBe(true)
    expect([...out].map((v) => Math.round(v * 1e12) / 1e12)).toEqual([1, 2, 3])
    expect(solve3([1, 2, 3, 2, 4, 6, 1, 1, 1], [1, 2, 3], out)).toBe(false)
  })
})
