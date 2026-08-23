import type { PathCommand } from '@vectorizer/core'
import { describe, expect, it } from 'vitest'
import { detectPrimitive, serializeSvg } from '../src/index'
import type { Primitive, SvgDocument } from '../src/index'

const rectPath = (x0: number, y0: number, x1: number, y1: number): PathCommand[] => [
  { type: 'M', x: x0, y: y0 },
  { type: 'L', x: x1, y: y0 },
  { type: 'L', x: x1, y: y1 },
  { type: 'L', x: x0, y: y1 },
  { type: 'Z' },
]

/** Four-cubic Bézier approximation of an axis-aligned ellipse (kappa handles). */
function ellipsePath(cx: number, cy: number, rx: number, ry: number): PathCommand[] {
  const kx = 0.5522847498 * rx
  const ky = 0.5522847498 * ry
  return [
    { type: 'M', x: cx + rx, y: cy },
    { type: 'C', x1: cx + rx, y1: cy + ky, x2: cx + kx, y2: cy + ry, x: cx, y: cy + ry },
    { type: 'C', x1: cx - kx, y1: cy + ry, x2: cx - rx, y2: cy + ky, x: cx - rx, y: cy },
    { type: 'C', x1: cx - rx, y1: cy - ky, x2: cx - kx, y2: cy - ry, x: cx, y: cy - ry },
    { type: 'C', x1: cx + kx, y1: cy - ry, x2: cx + rx, y2: cy - ky, x: cx + rx, y: cy },
    { type: 'Z' },
  ]
}

/** Axis-aligned rounded rectangle: straight edges + kappa cubic corner arcs. */
function roundedRectPath(x0: number, y0: number, x1: number, y1: number, r: number): PathCommand[] {
  const k = 0.5522847498 * r
  return [
    { type: 'M', x: x0 + r, y: y0 },
    { type: 'L', x: x1 - r, y: y0 },
    { type: 'C', x1: x1 - r + k, y1: y0, x2: x1, y2: y0 + r - k, x: x1, y: y0 + r },
    { type: 'L', x: x1, y: y1 - r },
    { type: 'C', x1: x1, y1: y1 - r + k, x2: x1 - r + k, y2: y1, x: x1 - r, y: y1 },
    { type: 'L', x: x0 + r, y: y1 },
    { type: 'C', x1: x0 + r - k, y1: y1, x2: x0, y2: y1 - r + k, x: x0, y: y1 - r },
    { type: 'L', x: x0, y: y0 + r },
    { type: 'C', x1: x0, y1: y0 + r - k, x2: x0 + r - k, y2: y0, x: x0 + r, y: y0 },
    { type: 'Z' },
  ]
}

describe('detectPrimitive — rectangles (exact)', () => {
  it('detects an axis-aligned rectangle in any mode', () => {
    expect(detectPrimitive(rectPath(4, 6, 20, 30), 2, false)).toEqual({
      kind: 'rect',
      x: 4,
      y: 6,
      width: 16,
      height: 24,
    })
  })

  it('detects a rectangle that repeats the closing corner', () => {
    const commands: PathCommand[] = [...rectPath(0, 0, 10, 10)]
    commands.splice(4, 0, { type: 'L', x: 0, y: 0 }) // explicit line back to start
    expect(detectPrimitive(commands, 2, false)).toEqual({
      kind: 'rect',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    })
  })

  it('rejects rotated, curved, open, or compound shapes', () => {
    const diamond: PathCommand[] = [
      { type: 'M', x: 50, y: 0 },
      { type: 'L', x: 100, y: 50 },
      { type: 'L', x: 50, y: 100 },
      { type: 'L', x: 0, y: 50 },
      { type: 'Z' },
    ]
    expect(detectPrimitive(diamond, 2, false)).toBeNull()
    const open: PathCommand[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 },
    ]
    expect(detectPrimitive(open, 2, false)).toBeNull()
    // Rectangle with a hole subpath ⇒ compound, not a primitive.
    const withHole = [...rectPath(0, 0, 20, 20), ...rectPath(5, 5, 15, 15)]
    expect(detectPrimitive(withHole, 2, false)).toBeNull()
  })
})

describe('detectPrimitive — circles and ellipses (gated)', () => {
  it('detects a circle only when round primitives are allowed', () => {
    const circle = ellipsePath(50, 40, 30, 30)
    expect(detectPrimitive(circle, 2, false)).toBeNull()
    const prim = detectPrimitive(circle, 2, true) as Extract<Primitive, { kind: 'circle' }>
    expect(prim.kind).toBe('circle')
    expect(prim.cx).toBeCloseTo(50, 1)
    expect(prim.cy).toBeCloseTo(40, 1)
    expect(prim.r).toBeCloseTo(30, 1)
  })

  it('detects an axis-aligned ellipse', () => {
    const prim = detectPrimitive(ellipsePath(60, 60, 40, 20), 2, true) as Extract<
      Primitive,
      { kind: 'ellipse' }
    >
    expect(prim.kind).toBe('ellipse')
    expect(prim.rx).toBeCloseTo(40, 1)
    expect(prim.ry).toBeCloseTo(20, 1)
  })

  it('does not mistake a rounded blob for a circle', () => {
    const blob: PathCommand[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 40, y1: -10, x2: 60, y2: 30, x: 30, y: 40 },
      { type: 'C', x1: 10, y1: 50, x2: -20, y2: 10, x: 0, y: 0 },
      { type: 'Z' },
    ]
    expect(detectPrimitive(blob, 2, true)).toBeNull()
  })
})

describe('detectPrimitive — rounded rectangles (gated)', () => {
  it('detects a rounded rect only when round primitives are allowed', () => {
    const cmds = roundedRectPath(10, 10, 90, 60, 12)
    expect(detectPrimitive(cmds, 2, false)).toBeNull()
    const p = detectPrimitive(cmds, 2, true) as Extract<Primitive, { kind: 'rrect' }>
    expect(p.kind).toBe('rrect')
    expect(p.x).toBeCloseTo(10, 0)
    expect(p.y).toBeCloseTo(10, 0)
    expect(p.width).toBeCloseTo(80, 0)
    expect(p.height).toBeCloseTo(50, 0)
    expect(p.r).toBeCloseTo(12, 0)
  })

  it('keeps a true circle as a circle, not a pill', () => {
    expect(detectPrimitive(ellipsePath(50, 50, 30, 30), 2, true)?.kind).toBe('circle')
  })

  it('keeps a plain rectangle exact (not a rounded rect)', () => {
    expect(detectPrimitive(rectPath(0, 0, 10, 10), 2, true)?.kind).toBe('rect')
  })

  it('rejects a rounded blob (not axis-aligned edges)', () => {
    const blob: PathCommand[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 40, y1: -10, x2: 60, y2: 30, x: 30, y: 40 },
      { type: 'L', x: 12, y: 44 },
      { type: 'C', x1: 10, y1: 50, x2: -20, y2: 10, x: 0, y: 0 },
      { type: 'Z' },
    ]
    expect(detectPrimitive(blob, 2, true)).toBeNull()
  })
})

/** Rotate every coordinate of a path about (cx, cy) by `deg` degrees. */
function rotatePath(cmds: PathCommand[], cx: number, cy: number, deg: number): PathCommand[] {
  const a = (deg * Math.PI) / 180
  const co = Math.cos(a)
  const si = Math.sin(a)
  const rot = (x: number, y: number): [number, number] => {
    const dx = x - cx
    const dy = y - cy
    return [cx + dx * co - dy * si, cy + dx * si + dy * co]
  }
  return cmds.map((c): PathCommand => {
    switch (c.type) {
      case 'M': {
        const [x, y] = rot(c.x, c.y)
        return { type: 'M', x, y }
      }
      case 'L': {
        const [x, y] = rot(c.x, c.y)
        return { type: 'L', x, y }
      }
      case 'Q': {
        const [x1, y1] = rot(c.x1, c.y1)
        const [x, y] = rot(c.x, c.y)
        return { type: 'Q', x1, y1, x, y }
      }
      case 'C': {
        const [x1, y1] = rot(c.x1, c.y1)
        const [x2, y2] = rot(c.x2, c.y2)
        const [x, y] = rot(c.x, c.y)
        return { type: 'C', x1, y1, x2, y2, x, y }
      }
      default:
        return c
    }
  })
}

describe('detectPrimitive — rotated ellipse (gated)', () => {
  it('detects a rotated ellipse, its radii and angle', () => {
    const cmds = rotatePath(ellipsePath(60, 50, 40, 18), 60, 50, 30)
    expect(detectPrimitive(cmds, 2, false)).toBeNull() // gated like other round primitives
    const p = detectPrimitive(cmds, 2, true) as Extract<Primitive, { kind: 'ellipse' }>
    expect(p.kind).toBe('ellipse')
    expect(p.cx).toBeCloseTo(60, 0)
    expect(p.cy).toBeCloseTo(50, 0)
    // Radii come back in either order depending on which axis `angle` names.
    expect(Math.max(p.rx, p.ry)).toBeCloseTo(40, 0)
    expect(Math.min(p.rx, p.ry)).toBeCloseTo(18, 0)
    expect(p.angle).toBeDefined()
  })

  it('keeps an axis-aligned ellipse un-rotated (no transform needed)', () => {
    const p = detectPrimitive(ellipsePath(60, 60, 40, 20), 2, true) as Extract<
      Primitive,
      { kind: 'ellipse' }
    >
    expect(p.angle === undefined || Math.abs(p.angle) < 0.5).toBe(true)
  })

  it('does not rotate-match a non-ellipse', () => {
    const rotRect = rotatePath(rectPath(0, 0, 40, 20), 20, 10, 25)
    expect(detectPrimitive(rotRect, 2, true)?.kind).not.toBe('ellipse')
  })
})

/** Closed all-line path of a regular polygon (n vertices) at radius r, rotated `rot` deg. */
function regularPolygonPath(cx: number, cy: number, r: number, n: number, rot = 0): PathCommand[] {
  const out: PathCommand[] = []
  for (let i = 0; i < n; i++) {
    const a = (rot * Math.PI) / 180 + (i * 2 * Math.PI) / n
    out.push({ type: i === 0 ? 'M' : 'L', x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  out.push({ type: 'Z' })
  return out
}

/** Closed all-line path of a regular star (n points, alternating radii). */
function regularStarPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  n: number,
  rot = 0,
): PathCommand[] {
  const out: PathCommand[] = []
  for (let i = 0; i < 2 * n; i++) {
    const a = (rot * Math.PI) / 180 + (i * Math.PI) / n
    const r = i % 2 === 0 ? rOuter : rInner
    out.push({ type: i === 0 ? 'M' : 'L', x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  out.push({ type: 'Z' })
  return out
}

describe('detectPrimitive — regular polygons and stars (gated)', () => {
  it('detects a rotated regular pentagon as a polygon', () => {
    const cmds = regularPolygonPath(50, 50, 30, 5, 12)
    expect(detectPrimitive(cmds, 2, false)).toBeNull() // gated
    const p = detectPrimitive(cmds, 2, true) as Extract<Primitive, { kind: 'polygon' }>
    expect(p.kind).toBe('polygon')
    expect(p.points).toHaveLength(5)
  })

  it('detects a diamond (square rotated 45°, diagonal edges) as a polygon', () => {
    const p = detectPrimitive(regularPolygonPath(50, 50, 30, 4, 0), 2, true)
    expect(p?.kind).toBe('polygon')
  })

  it('detects a five-point star as a 10-point polygon', () => {
    const p = detectPrimitive(regularStarPath(50, 50, 34, 15, 5, -18), 2, true) as Extract<
      Primitive,
      { kind: 'polygon' }
    >
    expect(p?.kind).toBe('polygon')
    expect(p.points).toHaveLength(10)
  })

  it('regularizes a slightly irregular pentagon within tolerance', () => {
    const cmds = regularPolygonPath(50, 50, 30, 5, 0)
    const v = cmds[2] as Extract<PathCommand, { type: 'L' }>
    const nudged: PathCommand[] = cmds.map((c) => (c === v ? { ...v, x: v.x + 0.4 } : c))
    expect(detectPrimitive(nudged, 2, true)?.kind).toBe('polygon')
  })

  it('does not regularize a genuinely irregular quadrilateral', () => {
    const quad: PathCommand[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 40, y: 5 },
      { type: 'L', x: 55, y: 45 },
      { type: 'L', x: 5, y: 30 },
      { type: 'Z' },
    ]
    expect(detectPrimitive(quad, 2, true)?.kind === 'polygon').toBe(false)
  })

  it('emits <polygon> and is deterministic', () => {
    const cmds = regularPolygonPath(50, 50, 30, 6, 10)
    const a = serializeSvg(primitiveDoc(cmds), {
      precision: 2,
      optimizePaths: true,
      roundPrimitives: true,
    })
    const b = serializeSvg(primitiveDoc(cmds), {
      precision: 2,
      optimizePaths: true,
      roundPrimitives: true,
    })
    expect(a).toContain('<polygon points="')
    expect(a).toBe(b)
  })
})

const primitiveDoc = (commands: PathCommand[]): SvgDocument => ({
  width: 100,
  height: 100,
  unit: 'px',
  shapes: [{ commands, fill: '#3366cc', fillRule: 'evenodd' }],
})

describe('serializeSvg primitive emission', () => {
  const doc = primitiveDoc

  it('emits <rect> exactly and only under optimizePaths', () => {
    const commands = rectPath(10, 10, 90, 60)
    expect(serializeSvg(doc(commands), { precision: 2 })).toContain('<path ')
    const opt = serializeSvg(doc(commands), { precision: 2, optimizePaths: true })
    expect(opt).toContain('<rect x="10" y="10" width="80" height="50" fill="#3366cc"/>')
    expect(opt).not.toContain('fill-rule') // single region needs none
  })

  it('emits <circle> only when roundPrimitives is set', () => {
    const commands = ellipsePath(50, 50, 25, 25)
    const noRound = serializeSvg(doc(commands), { precision: 2, optimizePaths: true })
    expect(noRound).toContain('<path ')
    const round = serializeSvg(doc(commands), {
      precision: 2,
      optimizePaths: true,
      roundPrimitives: true,
    })
    expect(round).toContain('<circle ')
  })

  it('emits <rect rx> for a rounded rectangle only when roundPrimitives is set', () => {
    const commands = roundedRectPath(10, 10, 90, 60, 10)
    expect(serializeSvg(doc(commands), { precision: 2, optimizePaths: true })).toContain('<path ')
    const round = serializeSvg(doc(commands), {
      precision: 2,
      optimizePaths: true,
      roundPrimitives: true,
    })
    expect(round).toMatch(/<rect [^>]*\brx="/)
  })

  it('emits <ellipse> with a rotate transform for a rotated ellipse', () => {
    const commands = rotatePath(ellipsePath(60, 50, 40, 18), 60, 50, 30)
    const round = serializeSvg(doc(commands), {
      precision: 2,
      optimizePaths: true,
      roundPrimitives: true,
    })
    expect(round).toMatch(/<ellipse [^>]*transform="rotate\(/)
  })
})
