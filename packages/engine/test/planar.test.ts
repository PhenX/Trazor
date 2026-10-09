import type { LabelMap, PathCommand } from '@trazor/core'
import type { FittedEdge } from '@trazor/trace'
import { describe, expect, it } from 'vitest'
import {
  cutoutRegions,
  nestedFaces,
  planarGeometry,
  polylineFit,
  setBackFit,
  stackedLayers,
  tracePlanar,
} from '../src/planar'

function labelsOf(rows: string[]): LabelMap {
  const h = rows.length
  const w = rows[0].length
  const data = new Int32Array(w * h)
  let count = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = rows[y][x] === '.' ? -1 : Number(rows[y][x])
      data[y * w + x] = l
      if (l + 1 > count) count = l + 1
    }
  }
  return { width: w, height: h, data, count }
}

/** Area a path paints under even-odd, summed over its subpaths' shoelace areas by sign. */
function paintedArea(commands: readonly PathCommand[]): number {
  let total = 0
  let a = 0
  let sx = 0
  let sy = 0
  let px = 0
  let py = 0
  for (const c of commands) {
    if (c.type === 'M') {
      sx = px = c.x
      sy = py = c.y
      a = 0
    } else if (c.type === 'Z') {
      a += px * sy - sx * py
      total += a / 2
    } else {
      a += px * c.y - c.x * py
      px = c.x
      py = c.y
    }
  }
  // Outer rings run anticlockwise on screen (negative in y-down), holes clockwise.
  return -total
}

const SCENE = ['00000000', '01111220', '01331220', '01331220', '01111.20', '00000000']

describe('planar layerings over shared fitted edges', () => {
  const labels = labelsOf(SCENE)
  const geo = planarGeometry(labels)
  const fits = geo.map.edges.map(polylineFit)
  const pixels = (l: number): number => [...labels.data].filter((v) => v === l).length

  it('paints each label exactly its pixels in the cutout partition', () => {
    const regions = cutoutRegions(geo, fits)
    expect(regions.map((r) => r.label)).toEqual([0, 1, 2, 3])
    for (const r of regions) expect(paintedArea(r.commands)).toBeCloseTo(pixels(r.label), 9)
  })

  it('nests faces with their transparent holes kept and labeled holes left to the child', () => {
    const faces = nestedFaces(geo, fits)
    const byLabel = new Map(faces.map((f, i) => [f.label, i]))
    // The outer field keeps none of its labeled holes but the frame ring.
    const field = faces[byLabel.get(0) as number]
    expect(field.parent).toBe(-1)
    const one = faces[byLabel.get(1) as number]
    expect(faces[one.parent].label).toBe(0)
    // Label 1 wraps the transparent pixel: its outline minus that hole.
    const three = faces[byLabel.get(3) as number]
    expect(faces[three.parent].label).toBe(1)
  })

  it('stacks each layer over everything above it that it reaches', () => {
    const paintLabel = new Int32Array(geo.map.faces.count)
    for (let p = 0; p < labels.data.length; p++) paintLabel[geo.map.faces.ids[p]] = labels.data[p]
    const layers = stackedLayers(geo, fits, paintLabel, [0, 1, 2, 3], [])
    const area = (k: number): number =>
      layers[k].shapes.reduce((s, cmds) => s + paintedArea(cmds), 0)
    // The base covers every opaque pixel; each layer above covers itself and what it reaches.
    expect(area(0)).toBeCloseTo(labels.data.length - 1, 9)
    expect(area(1)).toBeCloseTo(pixels(1) + pixels(2) + pixels(3), 9)
    expect(area(3)).toBeCloseTo(pixels(3), 9)
  })
})

describe('the planar chain against its image', () => {
  /** A disk of radius `r` at (cx, cy), black on white, anti-aliased by 8×8 box sampling. */
  function diskImage(w: number, h: number, cx: number, cy: number, r: number) {
    const data = new Uint8ClampedArray(w * h * 4)
    const labels = new Int32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let inside = 0
        for (let j = 0; j < 8; j++)
          for (let i = 0; i < 8; i++)
            if (Math.hypot(x + (i + 0.5) / 8 - cx, y + (j + 0.5) / 8 - cy) < r) inside++
        const v = Math.round(255 * (1 - inside / 64))
        const p = (y * w + x) * 4
        data[p] = data[p + 1] = data[p + 2] = v
        data[p + 3] = 255
        labels[y * w + x] = inside >= 32 ? 0 : 1
      }
    }
    return {
      image: { width: w, height: h, data },
      labels: { width: w, height: h, data: labels, count: 2 },
    }
  }

  it('runs every stage in order and lands the boundary on the drawn circle', () => {
    const { image, labels } = diskImage(32, 32, 15.3, 16.1, 9.4)
    const stages: string[] = []
    const err: Record<string, number> = {}
    const { fits } = tracePlanar({
      labels,
      image,
      alpha: null,
      paints: [{ hex: '#000000' }, { hex: '#ffffff' }],
      onStage: (stage, map) => {
        stages.push(stage)
        let sum = 0
        let n = 0
        for (const e of map.edges) {
          if (e.left < 0 || e.right < 0) continue
          for (let i = 0; i < e.points.length; i += 2) {
            sum += Math.abs(Math.hypot(e.points[i] - 15.3, e.points[i + 1] - 16.1) - 9.4)
            n++
          }
        }
        err[stage] = sum / n
      },
    })
    expect(stages).toEqual(['lattice', 'subpixel', 'junctions', 'solve', 'fit', 'repair'])
    // A circle is a few curves and the frame four lines, not their lattice staircase.
    expect(fits.reduce((n, f) => n + f.segments.length, 0)).toBeLessThan(12)
    expect(err.subpixel).toBeLessThan(err.lattice / 2)
    expect(err.solve).toBeLessThan(0.05)
  })

  it('keeps a curved hole in a stacked sheet', () => {
    // A black ring on white whose two circles are each fitted as two arcs: no
    // circle is a polygon of its own segment ends.
    const labels = labelsOf([
      '1111111111111',
      '1111000001111',
      '1110000000111',
      '1100011100011',
      '1000111110001',
      '1000111110001',
      '1000111110001',
      '1100011100011',
      '1110000000111',
      '1111000001111',
      '1111111111111',
    ])
    const geo = planarGeometry(labels)
    const fits = geo.map.edges.map((e): FittedEdge => {
      if (!e.closed || e.left < 0 || e.right < 0) return polylineFit(e)
      const p = e.points
      const n = p.length / 2
      let cx = 0
      let cy = 0
      let a = 0
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        cx += p[2 * i] / n
        cy += p[2 * i + 1] / n
        a += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1]
      }
      let r = 0
      for (let i = 0; i < n; i++) r += Math.hypot(p[2 * i] - cx, p[2 * i + 1] - cy) / n
      const arc = (x: number): PathCommand => ({
        type: 'A',
        rx: r,
        ry: r,
        rotation: 0,
        largeArc: false,
        sweep: a > 0,
        x,
        y: cy,
      })
      return {
        x0: cx + r,
        y0: cy,
        segments: [arc(cx - r), arc(cx + r)],
        closed: true,
        params: 3,
        chi2: 0,
      }
    })
    const paintLabel = new Int32Array(geo.map.faces.count)
    for (let p = 0; p < labels.data.length; p++) paintLabel[geo.map.faces.ids[p]] = labels.data[p]
    const ring = stackedLayers(geo, fits, paintLabel, [1, 0], [])[1]
    expect(ring.label).toBe(0)
    expect(ring.shapes.length).toBe(1)
    expect(ring.shapes[0].filter((c) => c.type === 'M').length).toBe(2)
  })

  it('fits a set-back run as curves, not one line per point', () => {
    const n = 40
    const pts = new Float64Array(2 * n)
    for (let i = 0; i < n; i++) {
      pts[2 * i] = 3 + i * 0.5
      pts[2 * i + 1] = 7 + 0.02 * Math.sin(i)
    }
    const segs = setBackFit(64, 64, 1)(pts)
    expect(segs.length).toBe(1)
    expect(segs[0]).toMatchObject({ type: 'L', x: pts[2 * n - 2], y: pts[2 * n - 1] })
  })
})
