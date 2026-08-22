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
})
