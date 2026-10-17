import type { PathCommand } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { annulusStroke, shapeOut, STROKE_TOL } from '../src/index'
import type { Primitive, SvgShape } from '../src/index'

const circle = (cx: number, cy: number, r: number): Primitive => ({ kind: 'circle', cx, cy, r })
const rrect = (x: number, y: number, w: number, h: number, r: number): Primitive => ({
  kind: 'rrect',
  x,
  y,
  width: w,
  height: h,
  r,
})

describe('annulusStroke', () => {
  it('draws two concentric circles as one stroked circle on their midline', () => {
    const s = annulusStroke(circle(64, 64, 58.67), circle(64.04, 63.98, 48))
    expect(s).not.toBeNull()
    expect(s!.width).toBeCloseTo(10.67, 9)
    const p = s!.primitive as Extract<Primitive, { kind: 'circle' }>
    expect(p.kind).toBe('circle')
    expect(p.cx).toBeCloseTo(64.02, 9)
    expect(p.cy).toBeCloseTo(63.99, 9)
    expect(p.r).toBeCloseTo((58.67 + 48) / 2, 9)
  })

  it('draws a rounded rectangle and its offset hole as one stroked rounded rectangle', () => {
    // lucide's square: x 3..21 of 24 at 128/24, corner 2, stroke 2 (all ×16/3).
    const u = 16 / 3
    const t = 2 * u
    const outer = rrect(2 * u, 2 * u, 20 * u, 20 * u, 3 * u)
    const inner = rrect(4 * u, 4 * u, 16 * u, 16 * u, u)
    const s = annulusStroke(outer, inner)
    expect(s).not.toBeNull()
    expect(s!.width).toBeCloseTo(t, 9)
    expect(s!.primitive.kind).toBe('rrect')
    const p = s!.primitive as Extract<Primitive, { kind: 'rrect' }>
    expect(p.x).toBeCloseTo(3 * u, 9)
    expect(p.width).toBeCloseTo(18 * u, 9)
    expect(p.r).toBeCloseTo(2 * u, 9)
  })

  it('gives square corners a mitred rectangle', () => {
    const s = annulusStroke(
      { kind: 'rect', x: 0, y: 0, width: 40, height: 30 },
      { kind: 'rect', x: 4, y: 4, width: 32, height: 22 },
    )
    expect(s).toEqual({ primitive: { kind: 'rect', x: 2, y: 2, width: 36, height: 26 }, width: 4 })
  })

  it('refuses a ring that is not of one width', () => {
    // Off-centre circles: each outline would move by more than the tolerance.
    expect(annulusStroke(circle(64, 64, 50), circle(64 + 3 * STROKE_TOL, 64, 40))).toBeNull()
    // A frame thicker on one side than the other.
    expect(annulusStroke(rrect(0, 0, 40, 40, 4), rrect(4, 4, 30, 32, 0.5))).toBeNull()
    // A hole that pokes out of the outline.
    expect(annulusStroke(rrect(0, 0, 40, 40, 4), rrect(-1, 4, 30, 32, 1))).toBeNull()
    // An ellipse's offset is not an ellipse.
    const e: Primitive = { kind: 'ellipse', cx: 0, cy: 0, rx: 20, ry: 10 }
    expect(annulusStroke(e, { kind: 'ellipse', cx: 0, cy: 0, rx: 16, ry: 6 })).toBeNull()
    expect(annulusStroke(circle(0, 0, 10), rrect(-5, -5, 10, 10, 2))).toBeNull()
  })
})

describe('a ring written as a stroke', () => {
  const ring: PathCommand[] = [
    { type: 'M', x: 0, y: 0 },
    { type: 'L', x: 40, y: 0 },
    { type: 'L', x: 40, y: 30 },
    { type: 'L', x: 0, y: 30 },
    { type: 'Z' },
    { type: 'M', x: 4, y: 4 },
    { type: 'L', x: 4, y: 26 },
    { type: 'L', x: 36, y: 26 },
    { type: 'L', x: 36, y: 4 },
    { type: 'Z' },
  ]
  const shape: SvgShape = {
    commands: ring,
    fill: '#123456',
    fillRule: 'evenodd',
    strokedPrimitive: {
      primitive: { kind: 'rect', x: 2, y: 2, width: 36, height: 26 },
      width: 4,
    },
  }

  it('is the stroked element when optimizing a flat opaque fill', () => {
    const out = shapeOut(shape, 2, true, true)
    expect(out).toEqual({
      kind: 'element',
      svg: '<rect x="2" y="2" width="36" height="26" fill="none" stroke="#123456" stroke-width="4"/>',
    })
  })

  it('stays the filled path for a gradient, a translucent fill, or unoptimized output', () => {
    for (const s of [
      { ...shape, fill: 'url(#g0)' },
      { ...shape, fillOpacity: 0.5 },
    ]) {
      const out = shapeOut(s, 2, true, true)
      expect(out?.kind).toBe('path')
    }
    const plain = shapeOut(shape, 2, false, true)
    expect(plain?.kind === 'element' && plain.svg.startsWith('<path')).toBe(true)
  })
})
