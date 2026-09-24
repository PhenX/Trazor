import { describe, expect, it } from 'vitest'
import type { BinaryMask, GrayImage, PathCommand } from '@trazor/core'
import { decomposeMask, polygonToCommands, ringPolygon } from '@trazor/trace'

/** Illustration profiles trace at this smoothing: outside geometric mode. */
const ILLUSTRATION = 0.8

/** Mask of a signed distance `sd` (negative inside), and its ±0.5 saturated coverage field. */
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

/** Mask and centered area-coverage field (8×8 samples a pixel) of the polygon `vs`. */
function polygonFieldOf(
  size: number,
  vs: [number, number][],
): { mask: BinaryMask; field: GrayImage } {
  const inside = (x: number, y: number): boolean => {
    let odd = false
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const [xi, yi] = vs[i]
      const [xj, yj] = vs[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) odd = !odd
    }
    return odd
  }
  const mask = new Uint8Array(size * size)
  const data = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0
      for (let j = 0; j < 8; j++) {
        for (let i = 0; i < 8; i++) if (inside(x + (i + 0.5) / 8, y + (j + 0.5) / 8)) hits++
      }
      if (hits >= 32) mask[y * size + x] = 1
      data[y * size + x] = hits / 64 - 0.5
    }
  }
  return {
    mask: { width: size, height: size, data: mask },
    field: { width: size, height: size, data },
  }
}

/**
 * Trace a mask's outer ring, against `field` when given (else on the lattice);
 * `cornerThreshold` as the illustration profiles set it when given.
 */
function trace(
  mask: BinaryMask,
  field: GrayImage | undefined,
  smoothing: number,
  cornerThreshold?: number,
): PathCommand[] {
  const outer = decomposeMask(mask, 'minority', 1).find((p) => p.area > 0)
  if (!outer) throw new Error('no outer ring')
  const fit = ringPolygon(outer.points, field)
  return polygonToCommands(outer.points, fit, {
    curveMode: 'spline',
    smoothing,
    curveOptimize: true,
    optTolerance: 0.2,
    coverage: field,
    cornerThreshold,
  })
}

/** The turn (degrees) at every join of a closed M/L/C…Z outline, the closing one included. */
function joinTurns(cmds: PathCommand[]): number[] {
  const unit = (x: number, y: number): [number, number] => {
    const l = Math.hypot(x, y)
    return [x / l, y / l]
  }
  const ends: { tin: [number, number]; tout: [number, number] }[] = []
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  for (const c of cmds) {
    if (c.type === 'M') {
      cx = sx = c.x
      cy = sy = c.y
    } else if (c.type === 'L') {
      const d = unit(c.x - cx, c.y - cy)
      ends.push({ tin: d, tout: d })
      cx = c.x
      cy = c.y
    } else if (c.type === 'C') {
      ends.push({ tin: unit(c.x1 - cx, c.y1 - cy), tout: unit(c.x - c.x2, c.y - c.y2) })
      cx = c.x
      cy = c.y
    } else if (c.type === 'Z' && Math.hypot(cx - sx, cy - sy) > 1e-9) {
      const d = unit(sx - cx, sy - cy)
      ends.push({ tin: d, tout: d })
    }
  }
  return ends.map((e, k) => {
    const [ax, ay] = e.tout
    const [bx, by] = ends[(k + 1) % ends.length].tin
    return (Math.acos(Math.max(-1, Math.min(1, ax * bx + ay * by))) * 180) / Math.PI
  })
}

/**
 * Farthest a densely sampled M/L/C outline strays from the zero set of `sd`
 * (only where `near` holds, when given).
 */
function worstDeviation(
  cmds: PathCommand[],
  sd: (x: number, y: number) => number,
  near: (x: number, y: number) => boolean = () => true,
): number {
  let worst = 0
  let cx = 0
  let cy = 0
  for (const c of cmds) {
    if (c.type === 'M') {
      cx = c.x
      cy = c.y
    } else if (c.type === 'L' || c.type === 'C') {
      for (let k = 1; k <= 20; k++) {
        const t = k / 20
        const m = 1 - t
        const [x, y] =
          c.type === 'L'
            ? [cx + (c.x - cx) * t, cy + (c.y - cy) * t]
            : [
                m * m * m * cx + 3 * m * m * t * c.x1 + 3 * m * t * t * c.x2 + t * t * t * c.x,
                m * m * m * cy + 3 * m * m * t * c.y1 + 3 * m * t * t * c.y2 + t * t * t * c.y,
              ]
        if (near(x, y)) worst = Math.max(worst, Math.abs(sd(x, y)))
      }
      cx = c.x
      cy = c.y
    }
  }
  return worst
}

/** Signed distance to the rounded rectangle x0..x1 × y0..y1 with corner radius `R`. */
const roundedRect =
  (x0: number, y0: number, x1: number, y1: number, R: number) =>
  (x: number, y: number): number => {
    const px = Math.abs(x - (x0 + x1) / 2) - (x1 - x0) / 2 + R
    const py = Math.abs(y - (y0 + y1) / 2) - (y1 - y0) / 2 + R
    return Math.hypot(Math.max(px, 0), Math.max(py, 0)) + Math.min(Math.max(px, py), 0) - R
  }

/** A smooth blob of radius `r` about (c, c), wavy enough that no arc covers it. */
const blob =
  (c: number, r: number) =>
  (x: number, y: number): number => {
    const dx = x - c - 0.3
    const dy = y - c + 0.4
    const th = Math.atan2(dy, dx)
    return Math.hypot(dx, dy) - r * (1 + 0.08 * Math.sin(3 * th) + 0.04 * Math.sin(5 * th + 1))
  }

describe('illustration mode — a smooth outline has no kinks', () => {
  it('joins every piece of a smooth blob tangent-continuously', () => {
    // The DP describes the gentle bends of the blob with chords where a chord is
    // cheaper than a curve, each meeting the next at a visible kink; the G1
    // refit makes every join smooth and keeps the outline on the drawing.
    const sd = blob(200, 150)
    const { mask, field } = fieldOf(400, sd)
    const cmds = trace(mask, field, ILLUSTRATION)
    expect(Math.max(...joinTurns(cmds))).toBeLessThan(1)
    expect(worstDeviation(cmds, sd)).toBeLessThan(0.3)
  })

  it('smooths an unrefined ring, staircase steps and all', () => {
    // No coverage field: the samples are the pixel lattice's staircase (σ 0.5),
    // whose one-pixel steps have no direction of their own to pin.
    for (const sd of [
      blob(100, 60),
      (x: number, y: number): number => (Math.hypot((x - 100.3) / 80, (y - 99.6) / 45) - 1) * 45,
    ]) {
      const { mask } = fieldOf(200, sd)
      const cmds = trace(mask, undefined, ILLUSTRATION)
      expect(Math.max(...joinTurns(cmds))).toBeLessThan(1)
      expect(worstDeviation(cmds, sd)).toBeLessThan(0.8)
    }
  })

  it('keeps a straight edge of the drawing straight and its rounds on the drawing', () => {
    // A rounded rectangle: each side stays one line — a straight edge of the
    // drawing, not a chord across a curve, so the smoothing does not bend it —
    // and the rounds between the sides stay close to the drawing.
    const sd = roundedRect(40.3, 40.6, 215.8, 200.2, 20)
    const { mask, field } = fieldOf(256, sd)
    const cmds = trace(mask, field, ILLUSTRATION)
    let cx = 0
    let cy = 0
    const sides: number[] = []
    for (const c of cmds) {
      if (c.type === 'L' && Math.hypot(c.x - cx, c.y - cy) > 100) sides.push(1)
      if (c.type !== 'Z') {
        cx = c.x
        cy = c.y
      }
    }
    expect(sides).toHaveLength(4)
    expect(worstDeviation(cmds, sd)).toBeLessThan(0.3)
  })

  it('follows a small bump on a clean edge rather than cutting it with a chord', () => {
    // A bump 0.3px high on the top side of a clean rounded rectangle: the DP's
    // band lets one chord cross it, but the refit holds a clean edge to a
    // narrower band, so that chord is not kept — the spline follows the bump.
    const rect = roundedRect(40.3, 60.6, 215.8, 180.2, 30)
    const sd = (x: number, y: number): number =>
      rect(x, y) - (y < 120 ? 0.3 * Math.exp(-(((x - 128.4) / 8) ** 2)) : 0)
    const { mask, field } = fieldOf(256, sd)
    const cmds = trace(mask, field, ILLUSTRATION)
    const nearBump = (x: number, y: number): boolean => x > 100 && x < 157 && y < 70
    expect(worstDeviation(cmds, sd, nearBump)).toBeLessThan(0.2)
    // No facet: a kept chord and a kept arc may meet at up to 3°, nothing more.
    expect(Math.max(...joinTurns(cmds))).toBeLessThan(3)
  })

  it('traces a small oval the corner rule cuts up as one ellipse', () => {
    // An eye a few pixels across: its lattice polygon turns sharply at every
    // vertex, so the corner rule cuts it into a few chords and a curve. The
    // whole ring is one ellipse, cheaper to describe and closer to the drawing.
    const [cx, cy, rx, ry, a] = [20.3, 19.6, 2.3, 3.2, 0.3]
    const frame = (x: number, y: number): [number, number] => [
      (x - cx) * Math.cos(a) + (y - cy) * Math.sin(a),
      -(x - cx) * Math.sin(a) + (y - cy) * Math.cos(a),
    ]
    // First-order signed distance for the field; the exact one to measure by.
    const field = (x: number, y: number): number => {
      const [u, v] = frame(x, y)
      const f = (u * u) / (rx * rx) + (v * v) / (ry * ry) - 1
      return f / (2 * Math.hypot(u / (rx * rx), v / (ry * ry)) + 1e-9)
    }
    const exact = (x: number, y: number): number => {
      const [u, v] = frame(x, y)
      let d = Infinity
      for (let k = 0; k < 4000; k++) {
        const t = (2 * Math.PI * k) / 4000
        d = Math.min(d, Math.hypot(u - rx * Math.cos(t), v - ry * Math.sin(t)))
      }
      return d
    }
    const { mask, field: coverage } = fieldOf(40, field)
    const cmds = trace(mask, coverage, ILLUSTRATION, 100)
    expect(Math.max(...joinTurns(cmds))).toBeLessThan(3)
    expect(worstDeviation(cmds, exact)).toBeLessThan(0.25)
  })

  it('keeps a small triangle a triangle though its samples trace a blob', () => {
    // Five pixels across, the triangle's half-coverage contour is round enough
    // for a circle to fit its samples as closely as the corners do. The pixels
    // the contour cuts across at each tip still show the corners, and the
    // circle does not render them.
    const { mask, field } = polygonFieldOf(40, [
      [17.22, 21.43],
      [22.07, 23.31],
      [21.82, 18.93],
    ])
    const cmds = trace(mask, field, ILLUSTRATION, 100)
    expect(joinTurns(cmds).filter((t) => t > 45)).toHaveLength(3)
  })

  it('keeps the point of a small teardrop', () => {
    // A highlight drawn as a drop: an ellipse is within the band of its samples
    // everywhere but at the tip, and renders the tip rounded off.
    const drop: [number, number][] = []
    for (let k = 0; k < 240; k++) {
      const t = (2 * Math.PI * k) / 240
      const x = 7 * Math.cos(t)
      const y = 4 * Math.sin(t) * Math.abs(Math.sin(t / 2))
      drop.push([
        20.3 + x * Math.cos(1) - y * Math.sin(1),
        20.6 + x * Math.sin(1) + y * Math.cos(1),
      ])
    }
    const { mask, field } = polygonFieldOf(44, drop)
    const cmds = trace(mask, field, ILLUSTRATION, 100)
    expect(Math.max(...joinTurns(cmds))).toBeGreaterThan(45)
  })

  it('keeps a small rectangle a rectangle', () => {
    // As small as the oval, but its sides are straight and its corners sharp:
    // no ellipse comes within the band of its samples.
    const [x0, y0, x1, y1] = [16.3, 15.6, 24.1, 21.4]
    const sd = (x: number, y: number): number => {
      const px = Math.max(x0 - x, x - x1)
      const py = Math.max(y0 - y, y - y1)
      return Math.hypot(Math.max(px, 0), Math.max(py, 0)) + Math.min(Math.max(px, py), 0)
    }
    const { mask, field } = fieldOf(40, sd)
    const cmds = trace(mask, field, ILLUSTRATION, 100)
    expect(joinTurns(cmds).filter((t) => t > 45)).toHaveLength(4)
  })
})
