import { describe as group, expect, it } from 'vitest'
import type { PathCommand } from '@trazor/core'
import type { FitConfig, FittedEdge } from '../../src/planar/types'
import { fitConfig } from '../../src/planar/types'
import {
  choose,
  costFloor,
  describe,
  descriptionCost,
  liesOnFrame,
  lineChi2Floor,
  primitiveOffer,
} from '../../src/fit/choice'
import { costModelWithOverrides, cubicParams, PARAMS_LINE, withCostModel } from '../../src/fit/cost'
import { chi2 as sampledChi2 } from '../../src/fit/curves'
import type { FitSegment } from '../../src/fit/curves'
import { fitPolyline, optimalMultimodel } from '../../src/fit/multimodel'
import { pathParams, polyline } from '../../src/fit/objective'
import { fitPrimitiveOrArcs } from '../../src/fit/primitives'
import type { PrimitiveOffer } from '../../src/fit/primitives'
import { lcg } from './fit-helpers'

/** inkvec's `FitConfig::default()`: a 256 px canvas at 0.1 px precision, τ = 2. */
const DEFAULT: FitConfig = fitConfig(256, 0.1, 2)

/** A measured run: interleaved points, σ per point, closed or open. */
interface Run {
  points: Float64Array
  sigma: Float64Array
  closed: boolean
}

function runOf(
  pairs: readonly (readonly [number, number])[],
  sigma: number[],
  closed: boolean,
): Run {
  return {
    points: Float64Array.from(pairs.flat()),
    sigma: Float64Array.from(sigma),
    closed,
  }
}

/**
 * The image frame of a `w × h` raster as the planar map writes it: a closed
 * ring of lattice corners round the border, clockwise on screen from the
 * top-left corner, σ = 0.5 px.
 */
function frame(w: number, h: number): Run {
  const pts: [number, number][] = []
  for (let i = 0; i < w; i++) pts.push([i, 0])
  for (let j = 0; j < h; j++) pts.push([w, j])
  for (let i = w; i >= 1; i--) pts.push([i, h])
  for (let j = h; j >= 1; j--) pts.push([0, j])
  return runOf(pts, Array<number>(pts.length).fill(0.5), true)
}

/**
 * Rings and runs of every kind the choice sees (inkvec's test set): frames
 * from 1×1 up, circles with no, slight and heavy wobble and random σ (every
 * fourth one open), a straight run, and coincident points.
 */
function shapes(rng: () => number): Run[] {
  const out = [frame(1, 1), frame(1, 6), frame(3, 3), frame(16, 16), frame(40, 7)]
  for (let c = 0; c < 10; c++) {
    const n = 6 + 9 * c
    const r = 1 + 6 * rng()
    const pts: [number, number][] = []
    for (let k = 0; k < n; k++) {
      const t = (2 * Math.PI * k) / n
      const wobble = [0, 0.1, 0.8][c % 3] * (rng() - 0.5)
      pts.push([20 + (r + wobble) * Math.cos(t), 9 + (r + wobble) * Math.sin(t)])
    }
    const sigma = Array.from({ length: n }, () => 0.05 + 0.4 * rng())
    out.push(runOf(pts, sigma, c % 4 !== 3))
  }
  const line = Array.from({ length: 12 }, (_, k): [number, number] => [k, 0.5 * k])
  out.push(runOf(line, Array<number>(12).fill(0.2), false))
  const same = Array.from({ length: 5 }, (): [number, number] => [3, 3])
  out.push(runOf(same, Array<number>(5).fill(0.3), true))
  return out
}

/** A path drawn near the run's points. */
interface RandomPath {
  x0: number
  y0: number
  segments: FitSegment[]
}

/** A random path of `segs` segments of random kinds near the run's points. */
function randomPath(rng: () => number, run: Run, segs: number): RandomPath {
  const n = run.points.length >> 1
  const near = (): [number, number] => {
    const k = Math.floor(rng() * n) % n
    const x = run.points[2 * k] + 2 * (rng() - 0.5)
    const y = run.points[2 * k + 1] + 2 * (rng() - 0.5)
    return [x, y]
  }
  const [x0, y0] = near()
  const segments: FitSegment[] = []
  for (let s = 0; s < segs; s++) {
    const kind = Math.floor(rng() * 4)
    if (kind === 0) {
      const [x, y] = near()
      segments.push({ type: 'L', x, y })
    } else if (kind === 1) {
      const [x1, y1] = near()
      const [x2, y2] = near()
      const [x, y] = near()
      segments.push({ type: 'C', x1, y1, x2, y2, x, y })
    } else {
      const r = 0.5 + 10 * rng()
      const ry = kind === 2 ? r : r * 1.5
      const sweep = rng() < 0.5
      const [x, y] = near()
      segments.push({ type: 'A', rx: r, ry, rotation: 0, largeArc: false, sweep, x, y })
    }
  }
  return { x0, y0, segments }
}

/** The best single line through the run: its principal axis, long enough to cover every foot. */
function principalLine(run: Run): RandomPath {
  const n = run.points.length >> 1
  let cx = 0
  let cy = 0
  for (let k = 0; k < n; k++) {
    cx += run.points[2 * k] / n
    cy += run.points[2 * k + 1] / n
  }
  let a = 0
  let b = 0
  let d = 0
  for (let k = 0; k < n; k++) {
    const dx = run.points[2 * k] - cx
    const dy = run.points[2 * k + 1] - cy
    a += dx * dx
    b += dx * dy
    d += dy * dy
  }
  const angle = 0.5 * Math.atan2(2 * b, a - d)
  const ux = Math.cos(angle)
  const uy = Math.sin(angle)
  const reach = 4 * Math.sqrt(a + d + 1)
  return {
    x0: cx - reach * ux,
    y0: cy - reach * uy,
    segments: [{ type: 'L', x: cx + reach * ux, y: cy + reach * uy }],
  }
}

/** `½·χ² + λ·P` of a path against a run: the sampled χ², its start and every segment priced. */
function pathCost(run: Run, path: RandomPath, cfg: FitConfig): number {
  const chi2 = sampledChi2(run.points, run.sigma, path.x0, path.y0, path.segments)
  const params = pathParams({ ...path, closed: run.closed })
  return 0.5 * chi2 + cfg.lambda * params
}

/** The program's fit of a run, as the choice receives it. */
function curveOf(run: Run, cfg: FitConfig): FittedEdge {
  return fitPolyline(run.points, run.sigma, run.closed, cfg)
}

/** `n` points round `curve(t)`, `t = 2πk/n`. */
function ring(n: number, curve: (t: number) => [number, number]): Float64Array {
  const out = new Float64Array(2 * n)
  for (let k = 0; k < n; k++) {
    const [x, y] = curve((2 * Math.PI * k) / n)
    out[2 * k] = x
    out[2 * k + 1] = y
  }
  return out
}

group('costFloor', () => {
  it('is below the cost of every path, of one segment or many, of any kind', () => {
    const rng = lcg(11)
    let checked = 0
    for (const run of shapes(rng)) {
      for (const lambda of [0, 1e-3, 1, 7.85, 12.3, 1e3]) {
        const cfg: FitConfig = { ...DEFAULT, lambda }
        const floor = costFloor(run.points, run.sigma, cfg)
        const paths = [principalLine(run)]
        for (let segs = 1; segs <= 5; segs++) {
          for (let k = 0; k < 12; k++) paths.push(randomPath(rng, run, segs))
        }
        for (const path of paths) {
          const cost = pathCost(run, path, cfg)
          if (!(cost >= floor)) {
            throw new Error(
              `${run.points.length / 2} pts, λ ${lambda}: cost ${cost} < floor ${floor}`,
            )
          }
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(5000)
  })

  it('is the two-segment price on a frame no single line comes near', () => {
    const f = frame(16, 16)
    expect(costFloor(f.points, f.sigma, DEFAULT)).toBe(6 * DEFAULT.lambda)
  })

  it('charges one cubic its price in force when that is below two segments', () => {
    const f = frame(16, 16)
    // At the standard price one cubic (2 + 6 = 8λ) is above two segments (6λ).
    expect(2 + cubicParams()).toBeGreaterThan(3 * PARAMS_LINE)
    // At the cheapest cubic the floor drops to one cubic's 4λ.
    const cheap = withCostModel(costModelWithOverrides(2), () => {
      expect(cubicParams()).toBe(2)
      return costFloor(f.points, f.sigma, DEFAULT)
    })
    expect(cheap).toBe(4 * DEFAULT.lambda)
    const dear = withCostModel(costModelWithOverrides(12), () =>
      costFloor(f.points, f.sigma, DEFAULT),
    )
    expect(dear).toBe(6 * DEFAULT.lambda)
  })

  it('charges a nearly straight run one line and its residual', () => {
    // Collinear points: the scatter's smaller eigenvalue is zero, so the floor
    // is one line's four parameters.
    const line = runOf(
      Array.from({ length: 12 }, (_, k): [number, number] => [k, 0.5 * k]),
      Array<number>(12).fill(0.2),
      false,
    )
    expect(lineChi2Floor(line.points, line.sigma)).toBe(0)
    expect(costFloor(line.points, line.sigma, DEFAULT)).toBe(4 * DEFAULT.lambda)
    // A bow: the floor's line part grows with it but stays below the best line's cost.
    const bow = runOf(
      Array.from({ length: 21 }, (_, k): [number, number] => [k, 0.02 * (k - 10) ** 2]),
      Array<number>(21).fill(0.1),
      false,
    )
    const l = lineChi2Floor(bow.points, bow.sigma)
    expect(l).toBeGreaterThan(0)
    expect(pathCost(bow, principalLine(bow), DEFAULT)).toBeGreaterThanOrEqual(
      costFloor(bow.points, bow.sigma, DEFAULT),
    )
  })

  it('proves nothing on degenerate input', () => {
    const f = frame(4, 4)
    for (const lambda of [-1, Number.NaN]) {
      expect(costFloor(f.points, f.sigma, { ...DEFAULT, lambda })).toBe(-Infinity)
    }
    const bad = frame(4, 4)
    bad.points[4] = Number.NaN
    expect(lineChi2Floor(bad.points, bad.sigma)).toBe(0)
    expect(lineChi2Floor(new Float64Array(0), new Float64Array(0))).toBe(0)
    // A missing σ weighs 0.5 px, a σ under 1e-3 px weighs 1e-3 px.
    const tilted = runOf(
      [
        [0, 0],
        [4, 1],
        [8, 0],
        [12, 1],
      ],
      [0.5, 0.5, 0.5, 0.5],
      false,
    )
    expect(lineChi2Floor(tilted.points, new Float64Array(0))).toBe(
      lineChi2Floor(tilted.points, tilted.sigma),
    )
    expect(lineChi2Floor(tilted.points, new Float64Array(4))).toBe(
      lineChi2Floor(tilted.points, new Float64Array(4).fill(1e-3)),
    )
  })
})

group('liesOnFrame', () => {
  it('recognizes every point on one of the four border lines, and nothing else', () => {
    expect(liesOnFrame(frame(5, 3).points, 5, 3)).toBe(true)
    expect(liesOnFrame(frame(5, 3).points, 5, 4)).toBe(false)
    expect(liesOnFrame(new Float64Array(0), 5, 3)).toBe(false)
    const inside = frame(5, 3)
    inside.points[6] = 1
    inside.points[7] = 1
    expect(liesOnFrame(inside.points, 5, 3)).toBe(false)
    // An open run along two sides is on the frame too; the caller asks about closed rings.
    expect(liesOnFrame(Float64Array.from([3, 0, 5, 0, 5, 2]), 5, 3)).toBe(true)
    // Exact: a point a hair inside the frame is not on it.
    expect(liesOnFrame(Float64Array.from([0, 0, 2, 1e-12, 5, 0]), 5, 3)).toBe(false)
  })
})

group('choose', () => {
  const cfg = fitConfig(128)
  const curve: FittedEdge = {
    x0: 0,
    y0: 0,
    segments: [
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 },
      { type: 'L', x: 0, y: 0 },
    ],
    closed: true,
    params: 8,
    chi2: 6,
  }
  const curveCost = 0.5 * 6 + cfg.lambda * 8
  const offerAt = (cost: number): PrimitiveOffer => ({
    x0: 0,
    y0: 0,
    segments: [{ type: 'L', x: 0, y: 0 }],
    closed: true,
    params: 3,
    chi2: 1,
    primitive: { kind: 'circle', cx: 5, cy: 5, r: 5 },
    cost,
  })

  it('prices a description by its recorded χ² and parameters', () => {
    expect(descriptionCost(curve, cfg)).toBe(curveCost)
    expect(descriptionCost({ ...curve, segments: [] }, cfg)).toBe(Infinity)
  })

  it('takes the offer only when strictly cheaper, without its cost', () => {
    const won = choose(curve, offerAt(curveCost - 1e-9), cfg)
    expect(won.primitive).toEqual({ kind: 'circle', cx: 5, cy: 5, r: 5 })
    expect(won.params).toBe(3)
    expect(won.chi2).toBe(1)
    expect('cost' in won).toBe(false)
    expect(choose(curve, offerAt(curveCost), cfg)).toBe(curve)
    expect(choose(curve, offerAt(curveCost + 1), cfg)).toBe(curve)
    expect(choose(curve, null, cfg)).toBe(curve)
  })

  it('keeps the curve on a NaN either side', () => {
    expect(choose(curve, offerAt(Number.NaN), cfg)).toBe(curve)
    const nanCurve = { ...curve, chi2: Number.NaN }
    expect(choose(nanCurve, offerAt(0), cfg)).toBe(nanCurve)
  })

  it('scores a closed ring cut away from its first point against its points in path order', () => {
    // Two rings close to an ellipse and a rounded square, but not either: a
    // primitive passes the gate, and loses to the curve. The program cuts each
    // away from point 0; scored against the points in their stored order (the
    // path starting at the cut), the curve would cost orders of magnitude more
    // and the primitive would win.
    const cfgRing = fitConfig(128)
    const egg = ring(90, (t) => [
      40.3 + 12 * Math.cos(t) * (1 + 0.05 * Math.cos(t)),
      40.7 + 10 * Math.sin(t),
    ])
    const squircle = ring(144, (t) => {
      const c = Math.cos(t)
      const s = Math.sin(t)
      return [
        40 + 18 * Math.sign(c) * Math.sqrt(Math.abs(c)),
        40 + 18 * Math.sign(s) * Math.sqrt(Math.abs(s)),
      ]
    })
    for (const points of [egg, squircle]) {
      const sigma = new Float64Array(points.length >> 1).fill(0.05)
      const cut = optimalMultimodel(polyline(points, sigma, true), cfgRing).vertices[0]
      expect(cut).not.toBe(0)
      const curveFit = fitPolyline(points, sigma, true, cfgRing)
      const offer = primitiveOffer(points, sigma, true, cfgRing)
      expect(offer?.primitive).toBeDefined()
      const misaligned =
        0.5 *
          sampledChi2(points, sigma, curveFit.x0, curveFit.y0, curveFit.segments as FitSegment[]) +
        cfgRing.lambda * curveFit.params
      expect(offer!.cost).toBeLessThan(misaligned)
      expect(offer!.cost).toBeGreaterThan(descriptionCost(curveFit, cfgRing))
      const chosen = choose(curveFit, offer, cfgRing)
      expect(chosen).toBe(curveFit)
      expect(chosen.primitive).toBeUndefined()
    }
  })
})

group('primitiveOffer', () => {
  const cfg = fitConfig(128)

  it("charges an open run of arcs its start point, as the curve's start is charged", () => {
    const n = 40
    const points = new Float64Array(2 * n)
    for (let k = 0; k < n; k++) {
      const t = -1 + (2 * k) / (n - 1)
      points[2 * k] = 30 + 15 * Math.cos(t)
      points[2 * k + 1] = 30 + 15 * Math.sin(t)
    }
    const sigma = new Float64Array(n).fill(0.05)
    const raw = fitPrimitiveOrArcs(points, sigma, false, cfg)
    expect(raw).not.toBeNull()
    expect(raw!.primitive).toBeUndefined()
    const offer = primitiveOffer(points, sigma, false, cfg)!
    expect(offer.params).toBe(raw!.params + PARAMS_LINE)
    expect(offer.cost).toBe(raw!.cost + cfg.lambda * PARAMS_LINE)
    expect(offer.segments).toEqual(raw!.segments)
    // Priced as a description: its cost is ½·χ² + λ·params of what it records.
    expect(offer.cost).toBeCloseTo(0.5 * offer.chi2 + cfg.lambda * offer.params, 9)
  })

  it('passes a whole primitive through as it comes', () => {
    const points = ring(64, (t) => [30 + 10 * Math.cos(t), 30 + 10 * Math.sin(t)])
    const sigma = new Float64Array(64).fill(0.05)
    const raw = fitPrimitiveOrArcs(points, sigma, true, cfg)
    expect(primitiveOffer(points, sigma, true, cfg)).toEqual(raw)
    expect(raw?.primitive?.kind).toBe('circle')
  })
})

group('the frame-first description', () => {
  it('returns the plain choice, and skips the program on frames the rectangle provably wins', () => {
    const rng = lcg(5)
    let skipped = 0
    for (const run of shapes(rng)) {
      const plain = choose(
        curveOf(run, DEFAULT),
        primitiveOffer(run.points, run.sigma, run.closed, DEFAULT),
        DEFAULT,
      )
      for (const frameFirst of [false, true]) {
        let ran = false
        const got = describe(run.points, run.sigma, run.closed, DEFAULT, frameFirst, () => {
          ran = true
          return curveOf(run, DEFAULT)
        })
        expect(got).toEqual(plain)
        if (frameFirst && !ran) skipped++
      }
    }
    // Every frame of at least 3×3 has its program skipped.
    expect(skipped).toBeGreaterThanOrEqual(3)
  })

  it('describes a frame as its rectangle without running the program', () => {
    const f = frame(24, 16)
    const got = describe(f.points, f.sigma, true, DEFAULT, true, () => {
      throw new Error('the program ran')
    })
    expect(got.primitive).toEqual({ kind: 'rect', cx: 12, cy: 8, w: 24, h: 16, r: 0, rotation: 0 })
    expect(got.params).toBe(4)
    expect(got.closed).toBe(true)
    const last = got.segments[got.segments.length - 1] as PathCommand & { x: number; y: number }
    expect([last.x, last.y]).toEqual([got.x0, got.y0])
  })
})
