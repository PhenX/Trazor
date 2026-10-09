/**
 * The planar chain's hard-case ratchet: clean synthetic shapes, rendered with
 * exact box coverage, that the chain must keep — small disks as circles,
 * rounded rectangles with their corner radius, star tips sharp, thin bars at
 * their width. Once a case passes it stays: a change that breaks one is a
 * regression, whatever the corpus averages say.
 */
import { describe, expect, it } from 'vitest'
import { normalizeSettings } from '@trazor/core'
import type { PathCommand, RasterImage } from '@trazor/core'
import { vectorize } from '../src'

/** Black ink on white, each pixel's coverage by 8×8 box sampling. */
function render(w: number, h: number, inside: (x: number, y: number) => boolean): RasterImage {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = 0
      for (let j = 0; j < 8; j++)
        for (let i = 0; i < 8; i++) if (inside(x + (i + 0.5) / 8, y + (j + 0.5) / 8)) n++
      const v = Math.round(255 * (1 - n / 64))
      data.set([v, v, v, 255], 4 * (y * w + x))
    }
  }
  return { width: w, height: h, data }
}

const SETTINGS = normalizeSettings({
  mode: 'bw',
  precision: 2,
  smoothing: 0.25,
  thresholdMode: 'fixed',
  threshold: 128,
})

/** The traced shapes' absolute commands (the document, before SVG spelling). */
async function shapeCommands(image: RasterImage): Promise<PathCommand[][]> {
  const res = await vectorize(image, SETTINGS, undefined, {
    geometry: 'planar',
    withDocument: true,
  })
  return (res.document?.shapes ?? []).map((s) => s.commands)
}

/** Every segment end point of a shape's commands. */
function vertices(commands: readonly PathCommand[]): [number, number][] {
  const out: [number, number][] = []
  for (const c of commands) if (c.type !== 'Z') out.push([c.x, c.y])
  return out
}

/** The written SVG's elements of one kind, each as its attributes. */
async function elements(image: RasterImage, tag: string): Promise<Record<string, number>[]> {
  const res = await vectorize(image, SETTINGS, undefined, { geometry: 'planar' })
  return [...res.svg.matchAll(new RegExp(`<${tag} ([^>]*)/>`, 'g'))].map((m) =>
    Object.fromEntries(
      [...m[1].matchAll(/([a-z]+)="([-\d.]+)"/g)].map((a) => [a[1], Number(a[2])]),
    ),
  )
}

describe('planar ratchet: disks stay circles', () => {
  for (const r of [3, 4, 5, 6.5, 8]) {
    it(`a disk of radius ${r} is a circle of that radius`, async () => {
      const circles = await elements(
        render(32, 32, (x, y) => Math.hypot(x - 15.3, y - 16.2) < r),
        'circle',
      )
      expect(circles.length).toBe(1)
      expect(Math.abs(circles[0].r - r)).toBeLessThan(0.1)
      expect(Math.hypot(circles[0].cx - 15.3, circles[0].cy - 16.2)).toBeLessThan(0.05)
    })
  }
})

describe('planar ratchet: rounded rectangles keep their corners', () => {
  for (const r of [3, 5, 8]) {
    it(`corner radius ${r}`, async () => {
      const [x0, y0, x1, y1] = [5.4, 6.3, 37.2, 29.7]
      const inside = (x: number, y: number): boolean => {
        const dx = Math.max(x0 + r - x, 0, x - (x1 - r))
        const dy = Math.max(y0 + r - y, 0, y - (y1 - r))
        return x > x0 && x < x1 && y > y0 && y < y1 && Math.hypot(dx, dy) < r
      }
      const rects = await elements(render(44, 36, inside), 'rect')
      expect(rects.length).toBe(1)
      expect(Math.abs(rects[0].rx - r)).toBeLessThan(0.25)
      expect(Math.abs(rects[0].x - x0)).toBeLessThan(0.05)
      expect(Math.abs(rects[0].width - (x1 - x0))).toBeLessThan(0.1)
    })
  }
})

describe('planar ratchet: star tips stay sharp', () => {
  it('a five-pointed star keeps a vertex on every tip', async () => {
    const cx = 20.3
    const cy = 19.7
    const outer = 15
    const inner = 6
    const star: [number, number][] = []
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5
      const r = k % 2 === 0 ? outer : inner
      star.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
    const inside = (x: number, y: number): boolean => {
      let odd = false
      for (let i = 0, j = star.length - 1; i < star.length; j = i++) {
        const [xi, yi] = star[i]
        const [xj, yj] = star[j]
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) odd = !odd
      }
      return odd
    }
    const shapes = await shapeCommands(render(40, 40, inside))
    expect(shapes.length).toBe(1)
    const pts = vertices(shapes[0])
    for (let k = 0; k < 10; k += 2) {
      const [tx, ty] = star[k]
      const nearest = Math.min(...pts.map(([x, y]) => Math.hypot(x - tx, y - ty)))
      expect(nearest).toBeLessThan(0.5)
    }
  })
})

describe('planar ratchet: thin bars keep their width', () => {
  for (const [width, degrees] of [
    [1.5, 0],
    [1.5, 20],
    [2, 45],
  ]) {
    it(`a ${width} px bar at ${degrees}°`, async () => {
      const a = (degrees * Math.PI) / 180
      const [ux, uy] = [Math.cos(a), Math.sin(a)]
      const [cx, cy, len] = [20.2, 19.6, 24]
      const inside = (x: number, y: number): boolean => {
        const s = (x - cx) * ux + (y - cy) * uy
        const t = -(x - cx) * uy + (y - cy) * ux
        return Math.abs(s) < len / 2 && Math.abs(t) < width / 2
      }
      const shapes = await shapeCommands(render(40, 40, inside))
      expect(shapes.length).toBe(1)
      // Area over length: the bar's width as drawn.
      const pts = vertices(shapes[0])
      let area = 0
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i]
        const [x1, y1] = pts[(i + 1) % pts.length]
        area += x0 * y1 - x1 * y0
      }
      expect(Math.abs(Math.abs(area / 2) / len - width)).toBeLessThan(0.15)
    })
  }
})
