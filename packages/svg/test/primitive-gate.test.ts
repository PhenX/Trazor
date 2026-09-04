import type { PathCommand } from '@trazor/core'
import { mulberry32 } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { detectPrimitive } from '../src/index'
import type { Primitive } from '../src/index'
import { referenceDetectPrimitive } from './primitive-reference'

const KAPPA = 0.5522847498

/** Closed loop through `pts` as straight edges. */
function lineLoop(pts: readonly { x: number; y: number }[]): PathCommand[] {
  const cmds: PathCommand[] = [{ type: 'M', x: pts[0].x, y: pts[0].y }]
  for (let i = 1; i < pts.length; i++) cmds.push({ type: 'L', x: pts[i].x, y: pts[i].y })
  cmds.push({ type: 'Z' })
  return cmds
}

/** Regular polygon (or star, with `inner` < 1) about (cx, cy), corners jittered. */
function regularLoop(
  n: number,
  cx: number,
  cy: number,
  R: number,
  phase: number,
  inner: number,
  jitter: number,
  rnd: () => number,
): PathCommand[] {
  const count = inner < 1 ? 2 * n : n
  const step = (2 * Math.PI) / count
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i < count; i++) {
    const a = phase + i * step
    const r = (inner < 1 && i % 2 === 1 ? R * inner : R) + (rnd() - 0.5) * jitter
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return lineLoop(pts)
}

/** Axis-aligned rounded rectangle: straight edges and kappa cubic corner arcs. */
function roundedRectLoop(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  jitter: number,
  rnd: () => number,
): PathCommand[] {
  const k = KAPPA * r
  const j = (): number => (rnd() - 0.5) * jitter
  return [
    { type: 'M', x: x0 + r + j(), y: y0 + j() },
    { type: 'L', x: x1 - r + j(), y: y0 + j() },
    { type: 'C', x1: x1 - r + k, y1: y0, x2: x1, y2: y0 + r - k, x: x1 + j(), y: y0 + r + j() },
    { type: 'L', x: x1 + j(), y: y1 - r + j() },
    { type: 'C', x1: x1, y1: y1 - r + k, x2: x1 - r + k, y2: y1, x: x1 - r + j(), y: y1 + j() },
    { type: 'L', x: x0 + r + j(), y: y1 + j() },
    { type: 'C', x1: x0 + r - k, y1: y1, x2: x0, y2: y1 - r + k, x: x0 + j(), y: y1 - r + j() },
    { type: 'L', x: x0 + j(), y: y0 + r + j() },
    { type: 'C', x1: x0, y1: y0 + r - k, x2: x0 + r - k, y2: y0, x: x0 + r + j(), y: y0 + j() },
    { type: 'Z' },
  ]
}

/** Ellipse from four cubics, rotated by `angle`, anchors jittered. */
function ellipseLoop(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  angle: number,
  jitter: number,
  rnd: () => number,
): PathCommand[] {
  const co = Math.cos(angle)
  const si = Math.sin(angle)
  const at = (u: number, v: number): { x: number; y: number } => ({
    x: cx + u * co - v * si + (rnd() - 0.5) * jitter,
    y: cy + u * si + v * co + (rnd() - 0.5) * jitter,
  })
  const kx = KAPPA * rx
  const ky = KAPPA * ry
  const p0 = at(rx, 0)
  const p1 = at(0, ry)
  const p2 = at(-rx, 0)
  const p3 = at(0, -ry)
  const c = (
    h1: { x: number; y: number },
    h2: { x: number; y: number },
    b: { x: number; y: number },
  ): PathCommand => ({ type: 'C', x1: h1.x, y1: h1.y, x2: h2.x, y2: h2.y, x: b.x, y: b.y })
  return [
    { type: 'M', x: p0.x, y: p0.y },
    c(at(rx, ky), at(kx, ry), p1),
    c(at(-kx, ry), at(-rx, ky), p2),
    c(at(-rx, -ky), at(-kx, -ry), p3),
    c(at(kx, -ry), at(rx, -ky), p0),
    { type: 'Z' },
  ]
}

/** A long free-form loop of mixed segment kinds around a wandering center. */
function freeformLoop(rnd: () => number, ops: number): PathCommand[] {
  const cx = (rnd() - 0.5) * 200
  const cy = (rnd() - 0.5) * 200
  const R = 4 + rnd() * 120
  const cmds: PathCommand[] = []
  const at = (i: number): { x: number; y: number } => {
    const a = (2 * Math.PI * i) / ops
    const r = R * (0.5 + rnd())
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
  }
  const first = at(0)
  cmds.push({ type: 'M', x: first.x, y: first.y })
  for (let i = 1; i < ops; i++) {
    const p = at(i)
    const kind = rnd()
    if (kind < 0.4) cmds.push({ type: 'L', x: p.x, y: p.y })
    else if (kind < 0.55) {
      const h = at(i - 0.5)
      cmds.push({ type: 'Q', x1: h.x, y1: h.y, x: p.x, y: p.y })
    } else {
      const h1 = at(i - 0.7)
      const h2 = at(i - 0.3)
      cmds.push({ type: 'C', x1: h1.x, y1: h1.y, x2: h2.x, y2: h2.y, x: p.x, y: p.y })
    }
  }
  cmds.push({ type: 'Z' })
  return cmds
}

/** Compare against the ungated reference at every precision and both round modes. */
function sameAsReference(cmds: PathCommand[]): Primitive | null {
  let sample: Primitive | null = null
  for (let p = 0; p <= 4; p++) {
    for (const allowRound of [true, false]) {
      const got = detectPrimitive(cmds, p, allowRound)
      expect(got, `precision ${p} allowRound ${allowRound}`).toEqual(
        referenceDetectPrimitive(cmds, p, allowRound),
      )
      if (p === 2 && allowRound) sample = got
    }
  }
  return sample
}

/** Detections found, by kind, over a family of loops. */
function tally(): { add: (prim: Primitive | null) => void; kinds: Map<string, number> } {
  const kinds = new Map<string, number>()
  return {
    add: (prim) => {
      const key = prim === null ? 'none' : prim.kind
      kinds.set(key, (kinds.get(key) ?? 0) + 1)
    },
    kinds,
  }
}

describe('detectPrimitive gating', () => {
  it('matches the reference on regular polygons and stars', () => {
    const rnd = mulberry32(11)
    const t = tally()
    for (let i = 0; i < 260; i++) {
      const n = 3 + Math.floor(rnd() * 11)
      const R = 3 + rnd() * 200
      const inner = rnd() < 0.4 ? 0.3 + rnd() * 0.5 : 1
      const jitter = rnd() < 0.5 ? 0 : rnd() * 0.2 * R
      const cmds = regularLoop(
        n,
        (rnd() - 0.5) * 300,
        (rnd() - 0.5) * 300,
        R,
        rnd() * Math.PI,
        inner,
        jitter,
        rnd,
      )
      t.add(sameAsReference(cmds))
    }
    expect(t.kinds.get('polygon') ?? 0).toBeGreaterThan(20)
    expect(t.kinds.get('none') ?? 0).toBeGreaterThan(20)
  })

  it('matches the reference on rectangles and rounded rectangles', () => {
    const rnd = mulberry32(23)
    const t = tally()
    for (let i = 0; i < 260; i++) {
      const x0 = (rnd() - 0.5) * 200
      const y0 = (rnd() - 0.5) * 200
      const w = 2 + rnd() * 300
      const h = 2 + rnd() * 300
      const r = rnd() * 0.5 * Math.min(w, h)
      const jitter = rnd() < 0.5 ? 0 : rnd() * 3
      t.add(sameAsReference(roundedRectLoop(x0, y0, x0 + w, y0 + h, r, jitter, rnd)))
      t.add(
        sameAsReference(
          lineLoop([
            { x: x0, y: y0 },
            { x: x0 + w, y: y0 },
            { x: x0 + w, y: y0 + h },
            { x: x0, y: y0 + h },
          ]),
        ),
      )
    }
    expect(t.kinds.get('rect') ?? 0).toBeGreaterThan(100)
    expect(t.kinds.get('rrect') ?? 0).toBeGreaterThan(20)
    expect(t.kinds.get('none') ?? 0).toBeGreaterThan(20)
  })

  it('matches the reference on circles and ellipses built from cubics', () => {
    const rnd = mulberry32(37)
    const t = tally()
    for (let i = 0; i < 260; i++) {
      const rx = 1 + rnd() * 150
      const ry = rnd() < 0.4 ? rx : 1 + rnd() * 150
      const angle = rnd() < 0.5 ? 0 : (rnd() - 0.5) * Math.PI
      const jitter = rnd() < 0.5 ? 0 : rnd() * 4
      t.add(
        sameAsReference(
          ellipseLoop((rnd() - 0.5) * 300, (rnd() - 0.5) * 300, rx, ry, angle, jitter, rnd),
        ),
      )
    }
    expect(t.kinds.get('circle') ?? 0).toBeGreaterThan(10)
    expect(t.kinds.get('ellipse') ?? 0).toBeGreaterThan(10)
    expect(t.kinds.get('none') ?? 0).toBeGreaterThan(10)
  })

  it('matches the reference on long free-form loops', () => {
    const rnd = mulberry32(53)
    const t = tally()
    for (let i = 0; i < 200; i++)
      t.add(sameAsReference(freeformLoop(rnd, 3 + Math.floor(rnd() * 60))))
    expect(t.kinds.get('none') ?? 0).toBeGreaterThan(100)
  })

  it('matches the reference on loops too short or too mixed to be any shape', () => {
    const rnd = mulberry32(71)
    const cases: PathCommand[][] = [
      [],
      [{ type: 'M', x: 1, y: 2 }],
      [{ type: 'M', x: 1, y: 2 }, { type: 'Z' }],
      [{ type: 'M', x: 0, y: 0 }, { type: 'L', x: 10, y: 0 }, { type: 'Z' }],
      [
        { type: 'M', x: 0, y: 0 },
        { type: 'L', x: 10, y: 0 },
        { type: 'L', x: 10, y: 10 },
        { type: 'Z' },
      ],
      // Two subpaths, and a Z that is not last: not a single closed loop.
      [
        { type: 'M', x: 0, y: 0 },
        { type: 'L', x: 8, y: 0 },
        { type: 'Z' },
        { type: 'M', x: 4, y: 4 },
        { type: 'L', x: 6, y: 6 },
        { type: 'Z' },
      ],
      [
        { type: 'M', x: 0, y: 0 },
        { type: 'L', x: 8, y: 0 },
        { type: 'L', x: 8, y: 8 },
        { type: 'L', x: 0, y: 8 },
      ],
      // Quadratics and arcs: no detector accepts them, the polygon fit still samples them.
      [
        { type: 'M', x: 0, y: 0 },
        { type: 'Q', x1: 20, y1: -10, x: 40, y: 0 },
        { type: 'Q', x1: 50, y1: 20, x: 40, y: 40 },
        { type: 'Q', x1: 20, y1: 50, x: 0, y: 40 },
        { type: 'Q', x1: -10, y1: 20, x: 0, y: 0 },
        { type: 'Z' },
      ],
      [
        { type: 'M', x: 0, y: 0 },
        { type: 'A', rx: 20, ry: 20, rotation: 0, largeArc: false, sweep: true, x: 40, y: 0 },
        { type: 'A', rx: 20, ry: 20, rotation: 0, largeArc: false, sweep: true, x: 0, y: 0 },
        { type: 'Z' },
      ],
    ]
    const t = tally()
    for (const cmds of cases) t.add(sameAsReference(cmds))
    // A mixed loop of every segment kind, which only the polygon fit may claim.
    for (let i = 0; i < 60; i++) {
      const cmds = freeformLoop(rnd, 4 + Math.floor(rnd() * 6))
      cmds.splice(2, 0, {
        type: 'A',
        rx: 5 + rnd() * 20,
        ry: 5 + rnd() * 20,
        rotation: rnd() * 90,
        largeArc: rnd() < 0.5,
        sweep: rnd() < 0.5,
        x: (rnd() - 0.5) * 100,
        y: (rnd() - 0.5) * 100,
      })
      t.add(sameAsReference(cmds))
    }
    expect(t.kinds.get('none') ?? 0).toBeGreaterThan(50)
  })
})
