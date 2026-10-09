import { describe, expect, it } from 'vitest'
import type { RasterImage } from '@trazor/core'
import {
  applySubpixel,
  edgeOffset,
  estimateNoise,
  GRID_SIGMA,
  imageNoise,
  inflateForCurvature,
  measureSubpixel,
  NOISE_FLOOR,
  positionSigma,
  premultipliedFromRaster,
  refineSubpixel,
  SIGMA_MODEL,
  unmixCoverage,
} from '../../src/planar/subpixel'
import type { PremultipliedImage } from '../../src/planar/types'
import { OUTSIDE } from '../../src/planar/types'
import type { PlanarMap } from '../../src/planar/types'
import {
  diskPolygon,
  halfPlanePolygon,
  innerPoints,
  polygonCoverage,
  polygonScene,
  sceneImage,
  sceneMap,
  stats,
  type Rgba,
  type Scene,
} from './coverage-helpers'
import { INKVEC, SCENES } from './parity-scenes'

const INK: Rgba = [0.1, 0.1, 0.1, 1]
const PAPER: Rgba = [0.95, 0.95, 0.95, 1]

/** Distance from the circle of radius `r` about `(cx, cy)`. */
const offCircle =
  (cx: number, cy: number, r: number) =>
  (x: number, y: number): number =>
    Math.abs(Math.hypot(x - cx, y - cy) - r)

/** Distance from the line through `(x0, y0)` along angle `a`. */
const offLine =
  (x0: number, y0: number, a: number) =>
  (x: number, y: number): number =>
    Math.abs((x - x0) * Math.sin(a) - (y - y0) * Math.cos(a))

/** A scene's map refined against its image; the map's lattice points kept for comparison. */
function refined(s: Scene, sigmaNoise = 0.004) {
  const { map, fills } = sceneMap(s)
  const lattice = innerPoints(map)
  refineSubpixel(map, sceneImage(s), fills, { sigmaNoise })
  return { map, fills, lattice, points: innerPoints(map) }
}

/** σ of every movable point of every edge between two image faces. */
function innerSigmas(map: PlanarMap): number[] {
  const out: number[] = []
  for (const e of map.edges) {
    if (e.left === OUTSIDE || e.right === OUTSIDE) continue
    for (let k = 0; k < e.fixed.length; k++) if (e.fixed[k] === 0) out.push(e.sigma[k])
  }
  return out
}

/** Deterministic standard normals: Box–Muller on a 32-bit LCG (inkvec's test generator). */
function normals(n: number, seed: number): Float32Array {
  let s = seed >>> 0
  const next = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return ((s >>> 8) + 0.5) / 16777216
  }
  const out = new Float32Array(n)
  for (let i = 0; i < n; i += 2) {
    const u1 = next()
    const u2 = next()
    const r = Math.sqrt(-2 * Math.log(u1))
    out[i] = r * Math.cos(2 * Math.PI * u2)
    if (i + 1 < n) out[i + 1] = r * Math.sin(2 * Math.PI * u2)
  }
  return out
}

describe('edgeOffset', () => {
  it('inverts the exact coverage of a unit square cut by a half-plane', () => {
    for (let deg = 0; deg <= 90; deg += 7.5) {
      const phi = (deg * Math.PI) / 180
      const na = Math.max(Math.abs(Math.cos(phi)), Math.abs(Math.sin(phi)))
      const nb = Math.min(Math.abs(Math.cos(phi)), Math.abs(Math.sin(phi)))
      for (let t = -0.65; t <= 0.65; t += 0.05) {
        // The pixel [0, 1]² covered where n·(q − center) ≤ t.
        const poly = halfPlanePolygon(
          0.5 + t * Math.cos(phi),
          0.5 + t * Math.sin(phi),
          phi - Math.PI / 2,
          4,
        )
        const a = polygonCoverage(poly, 1, 1)[0]
        if (a <= 1e-9 || a >= 1 - 1e-9) continue
        expect(edgeOffset(a, na, nb)).toBeCloseTo(t, 9)
      }
    }
  })

  it('is odd about half coverage', () => {
    for (const a of [0.1, 0.3, 0.45, 0.8, 0.97]) {
      expect(edgeOffset(1 - a, 0.8, 0.6)).toBeCloseTo(-edgeOffset(a, 0.8, 0.6), 12)
    }
    expect(edgeOffset(0.5, 1, 0)).toBe(0)
  })
})

describe('estimateNoise', () => {
  it('recovers a known sigma', () => {
    const w = 400
    const h = 400
    for (const levels of [2, 5, 12]) {
      const sigma = levels / 255
      const z = normals(w * h, 4242)
      const g = new Float32Array(w * h)
      for (let i = 0; i < g.length; i++) g[i] = 0.5 + z[i] * sigma
      const ratio = estimateNoise(g, w, h) / sigma
      expect(ratio).toBeGreaterThanOrEqual(0.9)
      expect(ratio).toBeLessThan(1.1)
    }
  })

  it('reports no noise on a noiseless edge-dense picture', () => {
    const w = 300
    const g = new Float32Array(w * w)
    for (let i = 0; i < g.length; i++) g[i] = (i % w) % 6 < 3 ? 0 : 1
    expect(estimateNoise(g, w, w) * 255).toBeLessThan(2)
  })

  it('floors at half a level on a clean image', () => {
    expect(estimateNoise(new Float32Array(64 * 64).fill(0.5), 64, 64)).toBeCloseTo(NOISE_FLOOR, 12)
    const clean = sceneImage(polygonScene(diskPolygon(20, 20, 9), 40, 40, INK, PAPER))
    expect(imageNoise(clean)).toBeCloseTo(NOISE_FLOOR, 12)
  })

  it('rises with real noise', () => {
    const g = new Float32Array(64 * 64).fill(0.5)
    let seed = 12345
    for (let i = 0; i < g.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      g[i] += ((seed >>> 16) / 65535 - 0.5) * 0.1
    }
    expect(estimateNoise(g, 64, 64)).toBeGreaterThan(2 * NOISE_FLOOR)
  })

  it('answers a short buffer or a tiny image', () => {
    expect(estimateNoise([], 100, 100)).toBeGreaterThan(0)
    expect(estimateNoise([0.5, 0.5, 0.5, 0.5], 2, 2)).toBeCloseTo(1 / 255, 12)
  })
})

describe('unmixCoverage', () => {
  it('recovers the coverage of an exact mixture of any two colors', () => {
    const pairs: [Rgba, Rgba][] = [
      [INK, PAPER],
      [
        [0.75, 0.35, 0.2, 1],
        [0.25, 0.55, 0.7, 1],
      ],
      // White paint on a clear ground: no contrast over white, all of it in premultiplied RGBA.
      [
        [1, 1, 1, 1],
        [0, 0, 0, 0],
      ],
      [
        [0.3, 0.15, 0.06, 0.6],
        [0.2, 0.2, 0.2, 1],
      ],
    ]
    for (const [fg, bg] of pairs) {
      for (const a of [0, 0.13, 0.5, 0.71, 1]) {
        const p = fg.map((f, ch) => a * f + (1 - a) * bg[ch])
        expect(unmixCoverage(p, fg, bg)).toBeCloseTo(a, 12)
      }
    }
  })

  it('clamps to [0, 1] and reads 0 between equal colors', () => {
    expect(unmixCoverage([0, 0, 0, 1], [0.5, 0.5, 0.5, 1], [1, 1, 1, 1])).toBe(1)
    expect(unmixCoverage([1, 1, 1, 1], [0.5, 0.5, 0.5, 1], [0, 0, 0, 1])).toBe(1)
    expect(unmixCoverage([0.2, 0.2, 0.2, 1], [0.5, 0.5, 0.5, 1], [0.5, 0.5, 0.5, 1])).toBe(0)
  })
})

describe('positionSigma', () => {
  it('adds the noise term and the method limit in quadrature', () => {
    expect(positionSigma(0.03, 0.75)).toBeCloseTo(Math.hypot(0.04, SIGMA_MODEL), 12)
    expect(positionSigma(0, 1)).toBe(SIGMA_MODEL)
  })

  it('caps an unlocalizable plateau at 4 px', () => {
    expect(positionSigma(0.01, 0)).toBe(4)
    expect(positionSigma(1, 1e-3)).toBe(4)
    expect(positionSigma(0, 1, 0)).toBe(1e-3)
  })
})

describe('inflateForCurvature', () => {
  /** Interleaved points. */
  const flat = (pairs: [number, number][]): Float64Array => Float64Array.from(pairs.flat())

  it('leaves a short polyline at its base', () => {
    const pts = flat([
      [0, 0],
      [1, 0],
      [2, 1],
      [3, 1],
      [4, 2],
    ])
    expect(inflateForCurvature(pts, 2, 0.05, false)).toBe(0.05)
  })

  it('does not read an arc as uncertainty, and reads a wobble', () => {
    const arc: [number, number][] = []
    for (let k = 0; k < 40; k++) {
      const a = (2 * Math.PI * k) / 40
      arc.push([10 * Math.cos(a), 10 * Math.sin(a)])
    }
    expect(inflateForCurvature(flat(arc), 5, 0.05, true)).toBeCloseTo(0.05, 6)

    // A run that zigzags turns both ways: its departure from the local line is uncertainty.
    const zigzag: [number, number][] = []
    for (let k = 0; k < 12; k++) zigzag.push([k, k % 2 === 0 ? 0 : 0.4])
    const s = inflateForCurvature(flat(zigzag), 6, 0.05, false)
    expect(s).toBeGreaterThan(0.07)
    // The inflation is capped at half a pixel diagonal.
    for (let k = 0; k < 12; k++) zigzag[k][1] = k % 2 === 0 ? 0 : 3
    expect(inflateForCurvature(flat(zigzag), 6, 0.05, false)).toBeCloseTo(
      Math.hypot(0.05, 0.354),
      12,
    )
  })
})

describe('premultipliedFromRaster', () => {
  it('scales straight 8-bit color by its alpha', () => {
    const raster: RasterImage = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([255, 128, 0, 255, 255, 255, 255, 51]),
    }
    const img = premultipliedFromRaster(raster)
    expect(Array.from(img.data)).toEqual(
      [1, 128 / 255, 0, 1, 0.2, 0.2, 0.2, 0.2].map((v) => Math.fround(v)),
    )
  })
})

describe('measureSubpixel', () => {
  for (const name of ['disk', 'slant', 'gradient']) {
    it(`reproduces inkvec's points and sigma on the ${name} scene`, () => {
      const { scene, sigmaNoise } = SCENES[name]
      const { map } = refined(scene, sigmaNoise)
      const want = INKVEC[name]
      const pts = innerPoints(map)
      const sig = innerSigmas(map)
      expect(pts.length * 3).toBe(want.length)
      for (let i = 0; i < pts.length; i++) {
        expect(Math.abs(pts[i][0] - want[3 * i])).toBeLessThan(2e-6)
        expect(Math.abs(pts[i][1] - want[3 * i + 1])).toBeLessThan(2e-6)
        expect(Math.abs(sig[i] - want[3 * i + 2])).toBeLessThan(2e-6)
      }
    })
  }

  it('inverts a clean step exactly', () => {
    // Every side's partially covered pixels lie right of or below its lattice line, so the
    // probes saturate on both sides and the step inversion reads them.
    const rect = [3.3, 2.2, 12.4, 2.2, 12.4, 13.35, 3.3, 13.35]
    const { points } = refined(polygonScene(rect, 16, 16, INK, PAPER))
    const corners = [
      [3.3, 2.2],
      [12.4, 2.2],
      [12.4, 13.35],
      [3.3, 13.35],
    ]
    let checked = 0
    for (const [x, y] of points) {
      if (corners.some(([cx, cy]) => Math.hypot(x - cx, y - cy) < 1.5)) continue
      const d = Math.min(
        Math.abs(x - 3.3),
        Math.abs(x - 12.4),
        Math.abs(y - 2.2),
        Math.abs(y - 13.35),
      )
      expect(d).toBeLessThan(1e-6)
      checked++
    }
    expect(checked).toBeGreaterThan(20)
  })

  it('moves a disk at any sub-pixel center onto its circle', () => {
    for (const r of [4.2, 6.3, 10.7]) {
      for (const [dx, dy] of [
        [0, 0],
        [0.25, 0.4],
        [0.5, 0.5],
        [0.73, 0.11],
      ]) {
        const cx = 16 + dx
        const cy = 16 + dy
        const { lattice, points } = refined(
          polygonScene(diskPolygon(cx, cy, r), 32, 32, INK, PAPER),
        )
        const before = stats(lattice, offCircle(cx, cy, r))
        const after = stats(points, offCircle(cx, cy, r))
        expect(after.count).toBe(before.count)
        expect(after.mean).toBeLessThan(0.1)
        expect(after.mean).toBeLessThan(before.mean / 3)
        expect(after.max).toBeLessThan(0.6)
      }
    }
  })

  it('moves a slanted straight edge onto its line', () => {
    for (const deg of [5, 20, 37, 45, 63, 80]) {
      const a = (deg * Math.PI) / 180
      const { lattice, points } = refined(
        polygonScene(halfPlanePolygon(16.3, 15.8, a), 32, 32, INK, PAPER),
      )
      const before = stats(lattice, offLine(16.3, 15.8, a))
      const after = stats(points, offLine(16.3, 15.8, a))
      expect(after.mean).toBeLessThan(0.15)
      expect(after.mean).toBeLessThan(before.mean / 2)
    }
  })

  it('places an edge between two colors as it places black on white', () => {
    const disk = diskPolygon(16.3, 15.6, 7.4)
    const bw = refined(polygonScene(disk, 32, 32, INK, PAPER))
    const tinted = refined(polygonScene(disk, 32, 32, [0.75, 0.35, 0.2, 1], [0.25, 0.55, 0.7, 1]))
    expect(tinted.points.length).toBe(bw.points.length)
    for (let i = 0; i < bw.points.length; i++) {
      expect(tinted.points[i][0]).toBeCloseTo(bw.points[i][0], 6)
      expect(tinted.points[i][1]).toBeCloseTo(bw.points[i][1], 6)
    }
  })

  it('unmixes paint against a transparent ground through alpha', () => {
    const disk = diskPolygon(15.7, 16.2, 6.8)
    const opaque = refined(polygonScene(disk, 32, 32, INK, PAPER))
    const scene = polygonScene(disk, 32, 32, [1, 1, 1, 1], [0, 0, 0, 0])
    scene.clear = [true, false]
    const img = sceneImage(scene)
    // Over white the disk has no contrast at all.
    for (let p = 0; p < 32 * 32; p++) {
      expect(img.data[4 * p] + 1 - img.data[4 * p + 3]).toBeCloseTo(1, 6)
    }
    const { map, fills } = sceneMap(scene)
    refineSubpixel(map, img, fills, { sigmaNoise: 0.004 })
    const clear = innerPoints(map)
    expect(clear.length).toBe(opaque.points.length)
    for (let i = 0; i < clear.length; i++) {
      expect(clear[i][0]).toBeCloseTo(opaque.points[i][0], 6)
      expect(clear[i][1]).toBeCloseTo(opaque.points[i][1], 6)
    }

    // The same disk as an 8-bit straight-alpha raster lands within a hundredth of a pixel.
    const raster: RasterImage = {
      width: 32,
      height: 32,
      data: new Uint8ClampedArray(32 * 32 * 4).map((_, i) =>
        i % 4 === 3 ? Math.round(img.data[i] * 255) : 255,
      ),
    }
    const eight = sceneMap(scene)
    refineSubpixel(eight.map, premultipliedFromRaster(raster), eight.fills, { sigmaNoise: 0.004 })
    const quantized = innerPoints(eight.map)
    for (let i = 0; i < clear.length; i++) {
      expect(Math.hypot(quantized[i][0] - clear[i][0], quantized[i][1] - clear[i][1])).toBeLessThan(
        0.01,
      )
    }
  })

  it('unmixes a gradient face against its fill at the point', () => {
    const scene = SCENES.gradient.scene
    const truth = offCircle(8.6, 8.3, 4.2)
    const local = refined(scene)
    // The same faces unmixed against the gradient's mean color instead.
    const { map, fills } = sceneMap(scene)
    const flat = fills.map(({ r, g, b, a }) => ({ r, g, b, a }))
    refineSubpixel(map, sceneImage(scene), flat, { sigmaNoise: 0.004 })
    const atMean = stats(innerPoints(map), truth)
    const atPoint = stats(local.points, truth)
    expect(atPoint.mean).toBeLessThan(0.1)
    expect(atPoint.mean).toBeLessThan(atMean.mean)
  })

  it('reports a larger sigma on a low-contrast edge', () => {
    const disk = diskPolygon(16.2, 15.9, 7.1)
    const strong = refined(polygonScene(disk, 32, 32, INK, PAPER), 0.01)
    const faint = refined(
      polygonScene(disk, 32, 32, [0.45, 0.45, 0.45, 1], [0.55, 0.55, 0.55, 1]),
      0.01,
    )
    const mean = (v: number[]): number => v.reduce((s, x) => s + x, 0) / v.length
    const sStrong = innerSigmas(strong.map)
    const sFaint = innerSigmas(faint.map)
    expect(Math.min(...sStrong)).toBeGreaterThanOrEqual(SIGMA_MODEL - 1e-12)
    expect(mean(sFaint)).toBeGreaterThan(1.5 * mean(sStrong))

    // With simplifyFaint the faint edge's σ is inflated by 0.25 / contrast (at most 4×).
    const { map, fills } = sceneMap(
      polygonScene(disk, 32, 32, [0.45, 0.45, 0.45, 1], [0.55, 0.55, 0.55, 1]),
    )
    const img = sceneImage(polygonScene(disk, 32, 32, [0.45, 0.45, 0.45, 1], [0.55, 0.55, 0.55, 1]))
    refineSubpixel(map, img, fills, { sigmaNoise: 0.01, simplifyFaint: true })
    expect(mean(innerSigmas(map))).toBeGreaterThan(1.3 * mean(sFaint))
  })

  it('leaves a point with nothing to unmix on the lattice', () => {
    const disk = diskPolygon(16.2, 15.9, 7.1)
    const scene = polygonScene(disk, 32, 32, [0.5, 0.5, 0.5, 1], [0.51, 0.505, 0.5, 1])
    const { lattice, points, map } = refined(scene)
    expect(points).toEqual(lattice)
    for (const s of innerSigmas(map)) expect(s).toBeGreaterThanOrEqual(GRID_SIGMA)
  })

  it('measures without writing, and leaves frame edges and nodes in place', () => {
    const scene = SCENES.slant.scene
    const { map, fills } = sceneMap(scene)
    const img: PremultipliedImage = sceneImage(scene)
    const before = map.edges.map((e) => Float64Array.from(e.points))
    const measured = measureSubpixel(map, img, fills, { sigmaNoise: 0.004 })
    map.edges.forEach((e, k) => expect(e.points).toEqual(before[k]))

    applySubpixel(map, measured)
    const kept: number[] = []
    const was: number[] = []
    map.edges.forEach((e, k) => {
      const frame = e.left === OUTSIDE || e.right === OUTSIDE
      expect(measured.edges[k] === null).toBe(frame)
      for (let i = 0; i < e.fixed.length; i++) {
        if (!frame && e.fixed[i] === 0) continue
        kept.push(e.points[2 * i], e.points[2 * i + 1])
        was.push(before[k][2 * i], before[k][2 * i + 1])
      }
    })
    expect(kept.length).toBeGreaterThan(0)
    expect(kept).toEqual(was)
    // Every interior point moved, by at most a pixel.
    const inner = map.edges.findIndex((e) => e.left !== OUTSIDE && e.right !== OUTSIDE)
    const e = map.edges[inner]
    for (let i = 1; i + 1 < e.fixed.length; i++) {
      const d = Math.hypot(
        e.points[2 * i] - before[inner][2 * i],
        e.points[2 * i + 1] - before[inner][2 * i + 1],
      )
      expect(d).toBeGreaterThan(0)
      expect(d).toBeLessThanOrEqual(1 + 1e-12)
    }
  })

  it('skips an edge whose face has no fill', () => {
    const scene = SCENES.disk.scene
    const { map, fills } = sceneMap(scene)
    const measured = measureSubpixel(map, sceneImage(scene), fills.slice(0, 1))
    expect(measured.edges.every((r) => r === null)).toBe(true)
  })

  it('is deterministic', () => {
    const scene = SCENES.gradient.scene
    const a = refined(scene)
    const b = refined(scene)
    expect(a.points).toEqual(b.points)
    expect(innerSigmas(a.map)).toEqual(innerSigmas(b.map))
  })
})
