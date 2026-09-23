import { describe, expect, it } from 'vitest'
import type { BinaryMask, GrayImage, PathCommand } from '@trazor/core'
import { decomposeMask, polygonToCommands, ringPolygon } from '@trazor/trace'
import {
  candidateStride,
  descriptionLambda,
  fitClosedRuns,
  mergeReach,
  ringSigmas,
  runBand,
  runTau,
} from '../src/potrace/runfit'

/** Signed coverage field from a signed distance `sd` (negative inside), ±0.5 saturated. */
function fieldOf(
  size: number,
  sd: (x: number, y: number) => number,
): { mask: BinaryMask; field: GrayImage } {
  const mask = new Uint8Array(size * size)
  const data = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = sd(x + 0.5, y + 0.5)
      if (d <= 0) mask[y * size + x] = 1
      data[y * size + x] = Math.max(-0.5, Math.min(0.5, -d))
    }
  }
  return {
    mask: { width: size, height: size, data: mask },
    field: { width: size, height: size, data },
  }
}

/** Signed distance to a closed polygon (negative inside). */
function polygonDistance(poly: [number, number][]): (x: number, y: number) => number {
  return (x, y) => {
    let d = Infinity
    let inside = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, ay] = poly[j]
      const [bx, by] = poly[i]
      const ex = bx - ax
      const ey = by - ay
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey)))
      d = Math.min(d, Math.hypot(x - ax - t * ex, y - ay - t * ey))
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside
    }
    return inside ? -d : d
  }
}

/** Densely sample the outline of M/L/C commands. */
function outline(cmds: PathCommand[]): [number, number][] {
  const pts: [number, number][] = []
  let cx = 0
  let cy = 0
  for (const c of cmds) {
    if (c.type === 'M') {
      cx = c.x
      cy = c.y
      pts.push([cx, cy])
    } else if (c.type === 'L' || c.type === 'C') {
      for (let k = 1; k <= 20; k++) {
        const t = k / 20
        const m = 1 - t
        if (c.type === 'L') pts.push([cx + (c.x - cx) * t, cy + (c.y - cy) * t])
        else {
          pts.push([
            m * m * m * cx + 3 * m * m * t * c.x1 + 3 * m * t * t * c.x2 + t * t * t * c.x,
            m * m * m * cy + 3 * m * m * t * c.y1 + 3 * m * t * t * c.y2 + t * t * t * c.y,
          ])
        }
      }
      cx = c.x
      cy = c.y
    }
  }
  return pts
}

/** Trace a mask's outer ring against its field at a smoothing setting. */
function trace(mask: BinaryMask, field: GrayImage, smoothing: number): PathCommand[] {
  const outer = decomposeMask(mask, 'minority', 1).find((p) => p.area > 0)
  if (!outer) throw new Error('no outer ring')
  const fit = ringPolygon(outer.points, field)
  return polygonToCommands(outer.points, fit, {
    curveMode: 'spline',
    smoothing,
    curveOptimize: true,
    optTolerance: 0.2,
    coverage: field,
  })
}

/** Flat-ink art (sharp icons, glyphs) traces at this smoothing: geometric mode. */
const GEOMETRIC = 0.25

describe('geometric mode — the drawing’s own lines, rounds and corners', () => {
  it('lands a star’s tips and notches on the drawing’s vertices', () => {
    const star: [number, number][] = []
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const r = i % 2 === 0 ? 50 : 22
      star.push([128.3 + r * Math.cos(a), 127.6 + r * Math.sin(a)])
    }
    const sd = polygonDistance(star)
    const { mask, field } = fieldOf(256, sd)
    const cmds = trace(mask, field, GEOMETRIC)
    // Every edge is a straight line, and every emitted point is on the drawing.
    expect(cmds.every((c) => c.type !== 'C')).toBe(true)
    for (const [x, y] of outline(cmds)) expect(Math.abs(sd(x, y))).toBeLessThan(0.12)
    // The anti-aliasing blunted each tip; its two edges, extended, meet on it.
    const anchors = cmds.flatMap((c) => (c.type === 'Z' ? [] : [[c.x, c.y]]))
    for (const [vx, vy] of star) {
      const miss = Math.min(...anchors.map(([x, y]) => Math.hypot(x - vx, y - vy)))
      expect(miss).toBeLessThan(0.15)
    }
  })

  it('traces a disk off the pixel grid as one circle', () => {
    const sd = (x: number, y: number): number => Math.hypot(x - 64.3, y - 63.7) - 40
    const { mask, field } = fieldOf(128, sd)
    const cmds = trace(mask, field, GEOMETRIC)
    // One whole circle: four circle-exact quarter cubics, on the true circle.
    expect(cmds.filter((c) => c.type === 'C')).toHaveLength(4)
    expect(cmds.some((c) => c.type === 'L')).toBe(false)
    for (const [x, y] of outline(cmds)) expect(Math.abs(sd(x, y))).toBeLessThan(0.02)
  })

  it('keeps a rounded rectangle on its straight edges and round corners', () => {
    const [x0, y0, x1, y1, R] = [40.3, 40.6, 215.8, 200.2, 20]
    const sd = (x: number, y: number): number => {
      const px = Math.abs(x - (x0 + x1) / 2) - (x1 - x0) / 2 + R
      const py = Math.abs(y - (y0 + y1) / 2) - (y1 - y0) / 2 + R
      return Math.hypot(Math.max(px, 0), Math.max(py, 0)) + Math.min(Math.max(px, py), 0) - R
    }
    const { mask, field } = fieldOf(256, sd)
    const geometric = outline(trace(mask, field, GEOMETRIC))
    const smooth = outline(trace(mask, field, 0.8))
    const worst = (pts: [number, number][]): number =>
      Math.max(...pts.map(([x, y]) => Math.abs(sd(x, y))))
    expect(worst(geometric)).toBeLessThan(0.2)
    // The illustration setting simplifies further and strays further.
    expect(worst(geometric)).toBeLessThan(worst(smooth))
  })
})

describe('whole-ring circle — one model for the whole loop when it is the better description', () => {
  const opts = {
    alphamax: (GEOMETRIC * 4) / 3,
    lambda: descriptionLambda(256),
    tau: runTau(),
    band: runBand(0.2),
    reach: mergeReach(true),
    stride: candidateStride(true),
  }
  /** A 240-sample ring on a circle (σ 0.1), `move` displacing samples radially. */
  const ring = (move: (i: number) => number) => {
    const n = 240
    const geom: number[] = []
    const sigma: number[] = []
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n
      const r = 40 + move(i)
      geom.push(100 + r * Math.cos(a), 100 + r * Math.sin(a))
      sigma.push(0.1)
    }
    geom.push(geom[0], geom[1])
    sigma.push(0.1)
    const vertices: number[] = []
    const polygon: number[] = []
    for (let i = 0; i < n; i += 12) {
      vertices.push(i)
      polygon.push(geom[i * 2], geom[i * 2 + 1])
    }
    vertices.push(n)
    polygon.push(geom[0], geom[1])
    return fitClosedRuns(geom, sigma, vertices, polygon, opts) ?? []
  }

  it('keeps a circle whole through a few 2.5σ outliers', () => {
    // Three samples a quarter pixel out: past any per-sample band, yet the
    // circle's χ² over the whole loop stays within its budget.
    const cmds = ring((i) => (i === 30 || i === 110 || i === 190 ? 0.25 : 0))
    expect(cmds.map((c) => c.type).join('')).toBe('MCCCCZ')
  })

  it('does not round over a real notch', () => {
    const cmds = ring((i) => (i >= 60 && i < 72 ? -1.2 : 0))
    expect(cmds.map((c) => c.type).join('')).not.toBe('MCCCCZ')
  })
})

describe('ringSigmas — how well each sample is known', () => {
  it('reads a hard grid edge as exact, a refined edge as measured, the lattice as the staircase', () => {
    // A square with an integer left edge (x = 10, hard) and a right edge at
    // x = 20.4 (anti-aliased, refined).
    const sd = (x: number, y: number): number => Math.max(10 - x, x - 20.4, 10 - y, y - 30)
    const { mask, field } = fieldOf(40, sd)
    const outer = decomposeMask(mask, 'minority', 1)[0].points
    const fit = ringPolygon(outer, field)
    if (!fit) throw new Error('no polygon')
    const hard = new Set<number>()
    const refined = new Set<number>()
    const n = fit.geom.length >> 1
    for (let i = 0; i < n; i++) {
      const y = fit.geom[i * 2 + 1]
      if (y < 13 || y > 27) continue
      ;(fit.geom[i * 2] < 15 ? hard : refined).add(fit.sigma[i])
    }
    expect([...hard]).toEqual([0.06])
    expect([...refined]).toEqual([0.1])
    const lattice = [...outer, outer[0], outer[1]]
    expect(new Set(ringSigmas(lattice, lattice, false))).toEqual(new Set([0.5]))
  })
})
