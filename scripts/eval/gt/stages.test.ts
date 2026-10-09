import { Resvg } from '@resvg/resvg-js'
import type { PathCommand, RasterImage } from '@trazor/core'
import { mulberry32 } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import type { StageStats } from './stages'
import {
  CHAINS,
  paintMap,
  recommendedSettings,
  samplePath,
  stageStats,
  summarize,
  topmostNear,
} from './stages'
import {
  edgeSeeds,
  registerSvg,
  renderTruth,
  squaredDistanceTransform,
  truthFromRender,
  truthScale,
} from './truth'

const svgOf = (body: string, size = 32): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${body}</svg>`

/** An anti-aliased opaque raster of `svg` at `size` px (straight RGBA, as a corpus raster). */
function rasterOf(svg: string, size: number): RasterImage {
  const r = new Resvg(svg, { background: 'white', fitTo: { mode: 'width', value: size } }).render()
  return { width: r.width, height: r.height, data: new Uint8ClampedArray(r.pixels) }
}

/** `count` points on the circle of radius `r` about (cx, cy), interleaved. */
function ring(cx: number, cy: number, r: number, count = 720): Float64Array {
  const out = new Float64Array(count * 2)
  for (let k = 0; k < count; k++) {
    const a = ((k + 0.37) * 2 * Math.PI) / count
    out[k * 2] = cx + r * Math.cos(a)
    out[k * 2 + 1] = cy + r * Math.sin(a)
  }
  return out
}

describe('squaredDistanceTransform', () => {
  it('matches a brute-force search exactly', () => {
    const w = 23
    const h = 17
    const rand = mulberry32(7)
    const seeds: [number, number][] = []
    const grid = new Float32Array(w * h).fill(1e20)
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(rand() * w)
      const y = Math.floor(rand() * h)
      seeds.push([x, y])
      grid[y * w + x] = 0
    }
    squaredDistanceTransform(grid, w, h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let best = Infinity
        for (const [sx, sy] of seeds) best = Math.min(best, (x - sx) ** 2 + (y - sy) ** 2)
        expect(grid[y * w + x]).toBe(best)
      }
    }
  })

  it('reads a lone seed as the squared Euclidean distance', () => {
    const w = 9
    const h = 6
    const grid = new Float32Array(w * h).fill(1e20)
    grid[2 * w + 3] = 0
    squaredDistanceTransform(grid, w, h)
    expect(grid[5 * w + 8]).toBe(5 * 5 + 3 * 3)
    expect(grid[0]).toBe(3 * 3 + 2 * 2)
  })
})

describe('edgeSeeds', () => {
  it('marks the crack midpoints of a color step and the frame', () => {
    // A 4×2 image: two black columns, two white ones.
    const data = new Uint8ClampedArray(4 * 2 * 4).fill(255)
    for (const i of [0, 1, 4, 5]) data.fill(0, i * 4, i * 4 + 3)
    const grid = edgeSeeds({ width: 4, height: 2, data })
    const gw = 9
    // The crack between columns 1 and 2 at x = 2: nodes (4, 1) and (4, 3).
    expect(grid[1 * gw + 4]).toBe(0)
    expect(grid[3 * gw + 4]).toBe(0)
    // No crack between two equal pixels, and no seed at a pixel center.
    expect(grid[1 * gw + 2]).toBeGreaterThan(1e19)
    expect(grid[1 * gw + 5]).toBeGreaterThan(1e19)
    // The lattice corner between the two, in line.
    expect(grid[2 * gw + 4]).toBe(0)
    // The frame.
    expect(grid[0]).toBe(0)
    expect(grid[2 * gw + 8]).toBe(0)
  })

  it('leaves a corner where the marks turn unmarked', () => {
    // A 2×2 image, black only at (0, 0): its right and lower cracks meet at (1, 1).
    const data = new Uint8ClampedArray(2 * 2 * 4).fill(255)
    data.fill(0, 0, 3)
    const grid = edgeSeeds({ width: 2, height: 2, data })
    const gw = 5
    expect(grid[1 * gw + 2]).toBe(0)
    expect(grid[2 * gw + 1]).toBe(0)
    expect(grid[2 * gw + 2]).toBeGreaterThan(1e19)
  })
})

describe('truth', () => {
  const scale = 16
  const disk = svgOf('<circle cx="16" cy="16" r="10" fill="#000"/>')
  const truth = truthFromRender(renderTruth(disk, 32 * scale, 32 * scale, false), scale)

  it('picks a render of at least 8 px per source px and 2048 px where 4096 allows', () => {
    expect(truthScale(128, 128)).toBe(16)
    expect(truthScale(256, 256)).toBe(8)
    expect(truthScale(512, 512)).toBe(8)
    expect(truthScale(1024, 1024)).toBe(4)
  })

  it('reads ~0 on the true edge', () => {
    const pts = ring(16, 16, 10)
    let sum = 0
    for (let k = 0; k < pts.length; k += 2) {
      const d = truth.trueEdgeDistance(pts[k], pts[k + 1])
      expect(d).toBeLessThan(0.05)
      sum += d
    }
    expect(sum / (pts.length / 2)).toBeLessThan(0.025)
  })

  it('reads the distance off the edge, inside and out', () => {
    for (const [r, want] of [
      [11, 1],
      [9, 1],
      [12.5, 2.5],
      [10.25, 0.25],
    ]) {
      const pts = ring(16, 16, r)
      for (let k = 0; k < pts.length; k += 2) {
        expect(Math.abs(truth.trueEdgeDistance(pts[k], pts[k + 1]) - want)).toBeLessThan(0.05)
      }
    }
    expect(truth.trueEdgeDistance(16, 16)).toBeCloseTo(10, 1)
  })

  it('counts the frame as an edge, and measures beyond it to the frame', () => {
    expect(truth.trueEdgeDistance(0, 7)).toBe(0)
    expect(truth.trueEdgeDistance(1, 16)).toBeCloseTo(1, 2)
    expect(truth.trueEdgeDistance(-2, 16)).toBeCloseTo(2, 9)
    expect(truth.trueEdgeDistance(35, 36)).toBeCloseTo(5, 9)
  })

  it('reads an edge against transparency whatever the paint', () => {
    const white = svgOf('<circle cx="16" cy="16" r="10" fill="#fff"/>')
    const t = truthFromRender(renderTruth(white, 32 * scale, 32 * scale, false), scale)
    const pts = ring(16, 16, 10)
    for (let k = 0; k < pts.length; k += 2) {
      expect(t.trueEdgeDistance(pts[k], pts[k + 1])).toBeLessThan(0.05)
    }
    expect(t.trueEdgeDistance(16, 27)).toBeCloseTo(1, 1)
  })

  it('reads the paint at a point, premultiplied', () => {
    const out = new Float64Array(4)
    truth.trueColor(16, 16, out)
    expect([...out]).toEqual([0, 0, 0, 1])
    truth.trueColor(1, 1, out)
    expect([...out]).toEqual([0, 0, 0, 0])
    const half = svgOf('<rect width="32" height="32" fill="#ff0000" fill-opacity="0.5"/>')
    const t = truthFromRender(renderTruth(half, 32 * 2, 32 * 2, false), 2)
    t.trueColor(10, 10, out)
    expect(out[0]).toBeCloseTo(0.5, 1)
    expect(out[1]).toBe(0)
    expect(out[3]).toBeCloseTo(0.5, 1)
  })

  it('sits in register with an anti-aliased raster of the same drawing', () => {
    const opaque = truthFromRender(renderTruth(disk, 32 * scale, 32 * scale, true), scale)
    const raster = rasterOf(disk, 32)
    expect(opaque.registration(raster)).toBeLessThan(1.5)
    const shifted = rasterOf(svgOf('<circle cx="17" cy="16" r="10" fill="#000"/>'), 32)
    expect(opaque.registration(shifted)).toBeGreaterThan(5 * opaque.registration(raster))
  })
})

describe('registerSvg', () => {
  it('widens a viewBox about its center to the raster aspect', () => {
    const wide =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10" width="200" height="100"><rect width="20" height="10"/></svg>'
    const t = truthFromRender(renderTruth(wide, 32 * 8, 32 * 8, false), 8)
    // The 20 × 10 drawing fills the width and sits centered: y ∈ [8, 24].
    expect(t.trueEdgeDistance(16, 8)).toBeLessThan(0.05)
    expect(t.trueEdgeDistance(16, 24)).toBeLessThan(0.05)
    expect(t.trueEdgeDistance(16, 12)).toBeCloseTo(4, 1)
  })

  it('takes the viewBox from the root size when there is none', () => {
    const out = registerSvg('<svg width="24px" height="24"><path d="M0 0h1"/></svg>', 96, 96)
    expect(out).toContain('viewBox="0 0 24 24"')
    expect(out).toContain('width="96"')
    expect(out).toContain('height="96"')
    expect(out).toContain('<path d="M0 0h1"/>')
  })
})

describe('samplePath', () => {
  it('steps evenly along a polygon, its start included', () => {
    const square: PathCommand[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 4, y: 0 },
      { type: 'L', x: 4, y: 4 },
      { type: 'L', x: 0, y: 4 },
      { type: 'Z' },
    ]
    const pts: number[] = []
    samplePath(square, 1, 0.25, (x, y) => pts.push(x, y))
    expect(pts.length / 2).toBe(65)
    expect(pts.slice(0, 4)).toEqual([0, 0, 0.25, 0])
    expect(pts.slice(-2)).toEqual([0, 0])
    const scaled: number[] = []
    samplePath(square, 2, 0.25, (x, y) => scaled.push(x, y))
    expect(scaled.length / 2).toBe(129)
  })

  it('stays on an arc and spaces samples by arc length', () => {
    const circle: PathCommand[] = [
      { type: 'M', x: 13, y: 8 },
      { type: 'A', rx: 5, ry: 5, rotation: 0, largeArc: false, sweep: true, x: 3, y: 8 },
      { type: 'A', rx: 5, ry: 5, rotation: 0, largeArc: false, sweep: true, x: 13, y: 8 },
      { type: 'Z' },
    ]
    const pts: number[] = []
    samplePath(circle, 1, 0.25, (x, y) => pts.push(x, y))
    expect(pts.length / 2).toBeCloseTo((2 * Math.PI * 5) / 0.25, -1)
    for (let k = 0; k < pts.length; k += 2) {
      expect(Math.hypot(pts[k] - 8, pts[k + 1] - 8)).toBeCloseTo(5, 3)
    }
    // Every gap but the last (which closes onto the start) is one step's chord.
    const gaps: number[] = []
    for (let k = 2; k < pts.length; k += 2) {
      gaps.push(Math.hypot(pts[k] - pts[k - 2], pts[k + 1] - pts[k - 1]))
    }
    expect(Math.max(...gaps)).toBeLessThanOrEqual(0.25 + 1e-9)
    expect(Math.min(...gaps.slice(0, -1))).toBeGreaterThan(0.249)
  })

  it('follows a cubic', () => {
    const k = 0.5522847498307936 * 5
    const quarter: PathCommand[] = [
      { type: 'M', x: 5, y: 0 },
      { type: 'C', x1: 5, y1: k, x2: k, y2: 5, x: 0, y: 5 },
    ]
    const pts: number[] = []
    samplePath(quarter, 1, 0.25, (x, y) => pts.push(x, y))
    for (let i = 0; i < pts.length; i += 2) {
      expect(Math.abs(Math.hypot(pts[i], pts[i + 1]) - 5)).toBeLessThan(0.002)
    }
  })
})

describe('stageStats', () => {
  const scale = 16
  const truth = truthFromRender(
    renderTruth(
      svgOf('<circle cx="16" cy="16" r="10" fill="#000"/>'),
      32 * scale,
      32 * scale,
      false,
    ),
    scale,
  )

  it('scores points on the edge as near and none as far', () => {
    const s = stageStats(truth, ring(16, 16, 10))
    expect(s.n).toBe(720)
    expect(s.mean).toBeLessThan(0.025)
    expect(s.max).toBeLessThan(0.05)
    expect(s.far).toBe(0)
    expect(s.off).toBe(0)
  })

  it('scores an offset outline by its offset', () => {
    const s = stageStats(truth, ring(16, 16, 10.5))
    expect(s.mean).toBeCloseTo(0.5, 1)
    expect(s.p95).toBeCloseTo(0.5, 1)
    expect(s.onMean).toBeCloseTo(0.5, 1)
    expect(s.far).toBe(1)
    expect(s.off).toBe(0)
  })

  it('tells points on no edge apart, capped in the mean', () => {
    const s = stageStats(truth, Float64Array.of(16, 16, 16, 16.5))
    expect(s.off).toBe(1)
    expect(s.onMean).toBeNaN()
    expect(s.mean).toBe(4)
    expect(s.max).toBeCloseTo(10, 1)
    expect(stageStats(truth, new Float64Array(0)).mean).toBeNaN()
  })
})

describe('paintMap', () => {
  const square = (x0: number, y0: number, x1: number, y1: number): PathCommand[] => [
    { type: 'M', x: x0, y: y0 },
    { type: 'L', x: x1, y: y0 },
    { type: 'L', x: x1, y: y1 },
    { type: 'L', x: x0, y: y1 },
    { type: 'Z' },
  ]
  // Owner 0 painted first, owner 1 over its lower right.
  const map = paintMap(
    [
      { owner: 0, commands: square(2, 2, 10, 10), evenOdd: true },
      { owner: 1, commands: square(6, 6, 14, 14), evenOdd: true },
    ],
    16,
    16,
    16,
    16,
  )

  it('sees an outline where its own paint is on top beside it', () => {
    expect(topmostNear(map, 2, 4, 0)).toBe(true)
    expect(topmostNear(map, 6, 12, 1)).toBe(true)
  })

  it('hides an outline running under a later paint', () => {
    expect(topmostNear(map, 10, 9, 0)).toBe(false)
    expect(topmostNear(map, 8, 10, 0)).toBe(false)
  })
})

describe('classic chain', () => {
  const N = 48
  const scene = svgOf(
    '<rect width="48" height="48" fill="#fff"/><rect x="6.3" y="8.2" width="24.6" height="28.9" fill="#d02020"/><circle cx="31.4" cy="24.7" r="9.3" fill="#2040d0"/>',
    N,
  )
  const image = rasterOf(scene, N)
  const truth = truthFromRender(renderTruth(scene, N * 16, N * 16, true), 16)
  const run = async (layering: 'stacked' | 'cutout'): Promise<Record<string, StageStats>> => {
    const out = await CHAINS.classic(image, recommendedSettings(image, { mode: 'color', layering }))
    expect(out.route).toBe(layering)
    expect(out.stages.map((s) => s.name)).toEqual(['lattice', 'subpixel', 'fit', 'svg'])
    const stats: Record<string, StageStats> = {}
    for (const s of out.stages) stats[s.name] = stageStats(truth, s.points())
    return stats
  }

  it('moves the boundary closer to the drawing at the sub-pixel stage', async () => {
    const s = await run('cutout')
    expect(s.subpixel.mean).toBeLessThan(0.6 * s.lattice.mean)
    for (const name of ['lattice', 'subpixel', 'fit', 'svg']) {
      expect(s[name].off).toBe(0)
      expect(s[name].max).toBeLessThan(0.8)
    }
    expect(s.fit.mean).toBeLessThan(0.1)
  })

  it('scores a stacked layer only where it shows, as a partition scores it', async () => {
    const stacked = await run('stacked')
    const cutout = await run('cutout')
    // The red layer runs on under the blue disk, set back beneath it: unseen,
    // so not scored, and each visible boundary counts about once.
    expect(stacked.lattice.n).toBeLessThan(1.05 * cutout.lattice.n)
    expect(stacked.subpixel.max).toBeLessThan(0.6)
    expect(stacked.fit.off).toBe(0)
  })

  it('reports the routes and stages in its table', () => {
    const row = {
      key: 'fam/a',
      corpus: 'fam',
      stem: 'a',
      route: 'bw',
      ms: 1,
      reg: 0.1,
      stages: {
        lattice: { n: 3, mean: 0.2, p95: 0.4, max: 0.5, far: 0.5, off: 0, onMean: 0.2 },
      },
    }
    const text = summarize({ chain: 'classic', tier: '128ss', set: 'screen' }, [row])
    expect(text).toContain('lattice')
    expect(text).toContain('MACRO')
    expect(text).toContain('routes: bw 1')
  })
})
