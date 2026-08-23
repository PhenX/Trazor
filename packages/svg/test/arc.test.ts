import type { PathCommand } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { arcToCubics, extractGeometry, fitArcs, serializeSvg } from '../src/index'
import type { SvgDocument } from '../src/index'

/** A circular arc (`cx, cy`, radius `r`) sampled as `segs` kappa-ish cubics from
 *  angle `a0` to `a1` (radians, screen coords), starting at the current point. */
function arcCubics(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  segs: number,
): {
  start: PathCommand
  cubics: PathCommand[]
} {
  const pt = (a: number) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  const p0 = pt(a0)
  const cubics: PathCommand[] = []
  const delta = (a1 - a0) / segs
  const k = (4 / 3) * Math.tan(delta / 4)
  let prev = p0
  let ap = a0
  for (let i = 0; i < segs; i++) {
    const an = ap + delta
    const pn = pt(an)
    const d0 = { x: -r * Math.sin(ap), y: r * Math.cos(ap) }
    const d1 = { x: -r * Math.sin(an), y: r * Math.cos(an) }
    cubics.push({
      type: 'C',
      x1: prev.x + k * d0.x,
      y1: prev.y + k * d0.y,
      x2: pn.x - k * d1.x,
      y2: pn.y - k * d1.y,
      x: pn.x,
      y: pn.y,
    })
    prev = pn
    ap = an
  }
  return { start: { type: 'M', x: p0.x, y: p0.y }, cubics }
}

/** A rotated-ellipse arc sampled as `segs` cubics from parametric angle `t0` to `t1`. */
function ellipseArcCubics(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  angleDeg: number,
  t0: number,
  t1: number,
  segs: number,
): { start: PathCommand; cubics: PathCommand[] } {
  const phi = (angleDeg * Math.PI) / 180
  const cs = Math.cos(phi)
  const sn = Math.sin(phi)
  const P = (t: number) => ({
    x: cx + rx * Math.cos(t) * cs - ry * Math.sin(t) * sn,
    y: cy + rx * Math.cos(t) * sn + ry * Math.sin(t) * cs,
  })
  const D = (t: number) => ({
    x: -rx * Math.sin(t) * cs - ry * Math.cos(t) * sn,
    y: -rx * Math.sin(t) * sn + ry * Math.cos(t) * cs,
  })
  const dt = (t1 - t0) / segs
  const k = (4 / 3) * Math.tan(dt / 4)
  const p0 = P(t0)
  const cubics: PathCommand[] = []
  let a = t0
  let prev = p0
  for (let i = 0; i < segs; i++) {
    const an = a + dt
    const pn = P(an)
    const d0 = D(a)
    const d1 = D(an)
    cubics.push({
      type: 'C',
      x1: prev.x + k * d0.x,
      y1: prev.y + k * d0.y,
      x2: pn.x - k * d1.x,
      y2: pn.y - k * d1.y,
      x: pn.x,
      y: pn.y,
    })
    a = an
    prev = pn
  }
  return { start: { type: 'M', x: p0.x, y: p0.y }, cubics }
}

/** Max distance between an A arc (from `from`) sampled as cubics and a circle. */
function maxCircleError(
  from: { x: number; y: number },
  a: Extract<PathCommand, { type: 'A' }>,
  cx: number,
  cy: number,
  r: number,
): number {
  let worst = 0
  let prev = from
  for (const c of arcToCubics(from.x, from.y, a)) {
    if (c.type !== 'C') continue
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const u = 1 - t
      const x = u * u * u * prev.x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x
      const y = u * u * u * prev.y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y
      worst = Math.max(worst, Math.abs(Math.hypot(x - cx, y - cy) - r))
    }
    prev = { x: c.x, y: c.y }
  }
  return worst
}

/** Sample a path (M/L/C/A) into points, expanding arcs via arcToCubics. */
function reconstruct(startCmd: PathCommand, cmds: PathCommand[]): { x: number; y: number }[] {
  let prev = {
    x: startCmd.type === 'M' ? startCmd.x : 0,
    y: startCmd.type === 'M' ? startCmd.y : 0,
  }
  const pts: { x: number; y: number }[] = [prev]
  const sampleCubic = (c: Extract<PathCommand, { type: 'C' }>) => {
    for (let t = 0.25; t <= 1.0001; t += 0.25) {
      const u = 1 - t
      pts.push({
        x: u * u * u * prev.x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
        y: u * u * u * prev.y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
      })
    }
    prev = { x: c.x, y: c.y }
  }
  for (const c of cmds) {
    if (c.type === 'C') {
      sampleCubic(c)
    } else if (c.type === 'A') {
      for (const cub of arcToCubics(prev.x, prev.y, c)) {
        if (cub.type === 'C') sampleCubic(cub)
      }
    } else if (c.type === 'L' || c.type === 'M') {
      prev = { x: c.x, y: c.y }
      pts.push(prev)
    }
  }
  return pts
}

describe('fitArcs', () => {
  it('collapses a two-cubic semicircle run into one A', () => {
    const { start, cubics } = arcCubics(100, 100, 40, 0, Math.PI, 2)
    const out = fitArcs([start, ...cubics], 2)
    expect(out.map((c) => c.type).join(' ')).toBe('M A')
    const a = out[1]
    if (a.type !== 'A') throw new Error('expected A')
    expect(a.rx).toBeCloseTo(40, 1)
    expect(a.ry).toBeCloseTo(40, 1)
    // Endpoint is the far side of the diameter.
    expect(a.x).toBeCloseTo(60, 1)
    expect(a.y).toBeCloseTo(100, 1)
    // The reconstructed arc lies on the original circle.
    expect(
      maxCircleError(
        { x: start.type === 'M' ? start.x : 0, y: start.type === 'M' ? start.y : 0 },
        a,
        100,
        100,
        40,
      ),
    ).toBeLessThan(0.6)
  })

  it('collapses a three-cubic 270° arc with the large-arc flag set', () => {
    const { start, cubics } = arcCubics(0, 0, 30, 0, 1.5 * Math.PI, 3)
    const out = fitArcs([start, ...cubics], 3)
    const a = out.find((c) => c.type === 'A')
    if (a === undefined || a.type !== 'A') throw new Error('expected an A')
    expect(a.largeArc).toBe(true)
    expect(a.rx).toBeCloseTo(30, 1)
    const s = start.type === 'M' ? start : { x: 0, y: 0 }
    expect(maxCircleError({ x: s.x, y: s.y }, a, 0, 0, 30)).toBeLessThan(0.6)
  })

  it('preserves arc direction (sweep flag) both ways', () => {
    const cw = arcCubics(0, 0, 25, 0, Math.PI, 2)
    const ccw = arcCubics(0, 0, 25, 0, -Math.PI, 2)
    const aCw = fitArcs([cw.start, ...cw.cubics], 3).find((c) => c.type === 'A')
    const aCcw = fitArcs([ccw.start, ...ccw.cubics], 3).find((c) => c.type === 'A')
    if (aCw?.type !== 'A' || aCcw?.type !== 'A') throw new Error('expected arcs')
    expect(aCw.sweep).not.toBe(aCcw.sweep)
  })

  it('leaves a non-arc S-curve run as cubics', () => {
    // Two cubics curving opposite ways — not a single circle.
    const cmds: PathCommand[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 10, y1: 20, x2: 30, y2: 20, x: 40, y: 0 },
      { type: 'C', x1: 50, y1: -20, x2: 70, y2: -20, x: 80, y: 0 },
    ]
    expect(fitArcs(cmds, 2)).toEqual(cmds)
  })

  it('leaves a single cubic untouched (a run needs at least two)', () => {
    const { start, cubics } = arcCubics(0, 0, 20, 0, Math.PI / 2, 1)
    const cmds = [start, ...cubics]
    expect(fitArcs(cmds, 2)).toEqual(cmds)
  })

  it('preserves circle geometry when a near-full run is only partly collapsed', () => {
    const { start, cubics } = arcCubics(0, 0, 20, 0, 2 * Math.PI, 4)
    const out = fitArcs([start, ...cubics], 2)
    // A lone `A` cannot represent a whole turn, so the run never becomes one arc.
    expect(out.filter((c) => c.type === 'A' || c.type === 'C').length).toBeGreaterThan(1)
    // Whatever the arc/cubic mix, every reconstructed point stays on the circle.
    for (const p of reconstruct(start, out)) {
      expect(Math.abs(Math.hypot(p.x, p.y) - 20)).toBeLessThan(0.6)
    }
  })

  it('still collapses a genuine large-radius arc (tolerance cap is absolute, not radius-scaled)', () => {
    // A clean r=300 arc: its cubics track the circle to well under a pixel, so
    // the absolute (~0.75px) acceptance cap must not reject it.
    const { start, cubics } = arcCubics(0, 0, 300, 0, Math.PI / 2, 2)
    const a = fitArcs([start, ...cubics], 2).find((c) => c.type === 'A')
    if (a?.type !== 'A') throw new Error('expected an A')
    expect(a.rx).toBeCloseTo(300, 0)
  })

  it('rejects a large run that is ~1.5px off a circle (would pass a radius-scaled tolerance)', () => {
    // r=300 arc, but with two interior anchors pushed ~1.5px outward — not a
    // circle to sub-pixel. A radius-scaled tol (r*0.02 = 6px) would collapse it;
    // the absolute cap must keep it as cubics so the emitted arc can't render off.
    const { start, cubics } = arcCubics(0, 0, 300, 0, Math.PI / 2, 4)
    const bumped = cubics.map((c, i) => {
      if (c.type !== 'C' || i === cubics.length - 1) return c
      const r = Math.hypot(c.x, c.y)
      const s = (r + 1.5) / r // push the shared anchor 1.5px radially outward
      return { ...c, x: c.x * s, y: c.y * s }
    })
    expect(fitArcs([start, ...bumped], 2).some((c) => c.type === 'A')).toBe(false)
  })

  it('collapses an axis-aligned elliptical arc into an A with distinct radii', () => {
    const { start, cubics } = ellipseArcCubics(100, 100, 60, 30, 0, 0, 2, 2)
    const out = fitArcs([start, ...cubics], 2)
    const a = out.find((c) => c.type === 'A')
    if (a?.type !== 'A') throw new Error('expected an A')
    expect(a.rx).toBeCloseTo(60, 0)
    expect(a.ry).toBeCloseTo(30, 0)
    expect(a.rotation).toBeCloseTo(0, 1)
  })

  it('collapses a rotated elliptical arc, preserving the rotation', () => {
    const { start, cubics } = ellipseArcCubics(100, 100, 60, 30, 30, 0, 2.4, 3)
    const out = fitArcs([start, ...cubics], 2)
    const a = out.find((c) => c.type === 'A')
    if (a?.type !== 'A') throw new Error('expected an A')
    // Distinct radii recovered (orientation-independent), and a non-zero tilt.
    const radii = [a.rx, a.ry].sort((m, n) => m - n)
    expect(radii[0]).toBeCloseTo(30, 0)
    expect(radii[1]).toBeCloseTo(60, 0)
    expect(Math.abs(a.rotation)).toBeGreaterThan(1)
  })

  it('preserves ellipse geometry when a near-full run is only partly collapsed', () => {
    const cx = 0
    const cy = 0
    const rx = 40
    const ry = 20
    const phi = (15 * Math.PI) / 180
    const { start, cubics } = ellipseArcCubics(cx, cy, rx, ry, 15, 0, 2 * Math.PI, 4)
    const out = fitArcs([start, ...cubics], 2)
    expect(out.filter((c) => c.type === 'A' || c.type === 'C').length).toBeGreaterThan(1)
    const co = Math.cos(phi)
    const si = Math.sin(phi)
    for (const p of reconstruct(start, out)) {
      const nx = ((p.x - cx) * co + (p.y - cy) * si) / rx
      const ny = (-(p.x - cx) * si + (p.y - cy) * co) / ry
      expect(Math.abs(Math.hypot(nx, ny) - 1) * Math.min(rx, ry)).toBeLessThan(0.7)
    }
  })

  it('segments an arc embedded inside a longer all-cubic run', () => {
    // A straight span (as a cubic), then a semicircle (2 cubics), then another
    // straight span — all cubics, no L between them, as a spline trace produces.
    const lineCubic = (x0: number, y0: number, x1: number, y1: number): PathCommand => ({
      type: 'C',
      x1: x0 + (x1 - x0) / 3,
      y1: y0 + (y1 - y0) / 3,
      x2: x0 + (2 * (x1 - x0)) / 3,
      y2: y0 + (2 * (y1 - y0)) / 3,
      x: x1,
      y: y1,
    })
    const arc = arcCubics(100, 100, 40, Math.PI, 2 * Math.PI, 2) // (60,100)→(140,100) via (100,60)
    const cmds: PathCommand[] = [
      { type: 'M', x: 20, y: 100 },
      lineCubic(20, 100, 60, 100),
      ...arc.cubics,
      lineCubic(140, 100, 180, 100),
    ]
    const out = fitArcs(cmds, 2)
    expect(out.filter((c) => c.type === 'A').length).toBe(1)
    expect(out.map((c) => c.type).join(' ')).toBe('M C A C')
    const a = out.find((c) => c.type === 'A')
    if (a?.type !== 'A') throw new Error('expected an A')
    expect(a.rx).toBeCloseTo(40, 0)
  })

  it('handles multiple arc runs separated by lines in one path', () => {
    // Pill outline: line, semicircle, line, semicircle (a rounded-rect shape).
    const r = 20
    const right = arcCubics(160, 50, r, -Math.PI / 2, Math.PI / 2, 2)
    const left = arcCubics(40, 50, r, Math.PI / 2, 1.5 * Math.PI, 2)
    const cmds: PathCommand[] = [
      { type: 'M', x: 40, y: 30 },
      { type: 'L', x: 160, y: 30 },
      ...right.cubics,
      { type: 'L', x: 40, y: 70 },
      ...left.cubics,
      { type: 'Z' },
    ]
    const out = fitArcs(cmds, 2)
    expect(out.filter((c) => c.type === 'A').length).toBe(2)
    expect(out.map((c) => c.type).join(' ')).toBe('M L A L A Z')
  })
})

describe('arcToCubics', () => {
  it('reconstructs points on the circle and lands on the endpoint', () => {
    const a: Extract<PathCommand, { type: 'A' }> = {
      type: 'A',
      rx: 50,
      ry: 50,
      rotation: 0,
      largeArc: false,
      sweep: true,
      x: 70,
      y: 20,
    }
    const cubics = arcToCubics(20, 70, a)
    const last = cubics[cubics.length - 1]
    if (last.type !== 'C') throw new Error('expected a cubic')
    expect(last.x).toBeCloseTo(70, 6)
    expect(last.y).toBeCloseTo(20, 6)
  })

  it('degenerates to a line when a radius is zero', () => {
    const cubics = arcToCubics(0, 0, {
      type: 'A',
      rx: 0,
      ry: 10,
      rotation: 0,
      largeArc: false,
      sweep: true,
      x: 10,
      y: 10,
    })
    expect(cubics).toEqual([{ type: 'L', x: 10, y: 10 }])
  })
})

const halfDisc = (): PathCommand[] => {
  const { cubics } = arcCubics(70, 70, 50, 0, -Math.PI, 2) // arc bulging up
  return [{ type: 'M', x: 20, y: 70 }, { type: 'L', x: 120, y: 70 }, ...cubics, { type: 'Z' }]
}

describe('serialize with arcs', () => {
  const doc = (commands: PathCommand[]): SvgDocument => ({
    width: 140,
    height: 100,
    unit: 'px',
    shapes: [{ commands, fill: '#000' }],
  })

  it('emits an A for a half-disc when roundPrimitives is on', () => {
    const svg = serializeSvg(doc(halfDisc()), {
      precision: 2,
      optimizePaths: true,
      roundPrimitives: true,
    })
    const d = /d="([^"]*)"/.exec(svg)?.[1] ?? ''
    expect(d).toMatch(/[Aa]\s*50\s+50/)
  })

  it('stays byte-identical (no arc) when roundPrimitives is off', () => {
    const off = serializeSvg(doc(halfDisc()), {
      precision: 2,
      optimizePaths: true,
      roundPrimitives: false,
    })
    const d = /d="([^"]*)"/.exec(off)?.[1] ?? ''
    expect(d).not.toMatch(/[Aa]\d/)
    expect(d).toContain('c') // still cubic Béziers
  })

  it('round-trips an emitted arc back onto the original circle', () => {
    const svg = serializeSvg(doc(halfDisc()), {
      precision: 3,
      optimizePaths: true,
      roundPrimitives: true,
    })
    const geo = extractGeometry(svg)
    // Every reconstructed vertex on the curved side lies on the r=50 circle.
    let worst = 0
    for (const c of geo.shapes[0].commands) {
      if (c.type === 'C') {
        worst = Math.max(worst, Math.abs(Math.hypot(c.x - 70, c.y - 70) - 50))
      }
    }
    expect(worst).toBeLessThan(0.8)
  })
})
