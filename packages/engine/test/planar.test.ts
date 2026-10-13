import type { LabelMap, PathCommand } from '@trazor/core'
import { upscaleImage } from '@trazor/raster'
import type { FittedEdge } from '@trazor/trace'
import { describe, expect, it } from 'vitest'
import {
  cutoutRegions,
  fittedPoints,
  gradientAt,
  keepsTo,
  nestedFaces,
  planarGeometry,
  polylineFit,
  setBackFit,
  setBackPoints,
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
      layers[k].shapes.reduce((s, sh) => s + paintedArea(sh.commands), 0)
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

  it('solves a trace on an enlarged copy against the source pixels', () => {
    // The labels and the map on the 2× grid, the circle measured on the 32 px source:
    // solved against the enlargement's interpolated ramps the boundary would zigzag back
    // to the lattice.
    const source = diskImage(32, 32, 15.3, 16.1, 9.4)
    const work = diskImage(64, 64, 30.6, 32.2, 18.8)
    const err: Record<string, number> = {}
    tracePlanar({
      labels: work.labels,
      image: upscaleImage(source.image, 2, true),
      alpha: null,
      paints: [{ hex: '#000000' }, { hex: '#ffffff' }],
      scale: 2,
      source: { image: source.image, alpha: null },
      onStage: (stage, map) => {
        let sum = 0
        let n = 0
        for (const e of map.edges) {
          if (e.left < 0 || e.right < 0) continue
          for (let i = 0; i < e.points.length; i += 2) {
            sum += Math.abs(Math.hypot(e.points[i] - 30.6, e.points[i + 1] - 32.2) - 18.8)
            n++
          }
        }
        err[stage] = sum / n
      },
    })
    expect(err.solve).toBeLessThan(0.05)
    expect(err.solve).toBeLessThan(err.subpixel)
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
    expect(ring.shapes[0].commands.filter((c) => c.type === 'M').length).toBe(2)
  })

  it('ends every sheet that reaches the canvas frame on the frame', () => {
    // Two cells side by side: the base sheet spans the canvas, beneath the right cell.
    // Its frame edges next to that cell are no hidden edge to set back: nothing lies
    // beyond the frame, so the base outline keeps to it all the way round.
    const labels = labelsOf(['00001111', '00001111', '00001111', '00001111', '00001111'])
    const geo = planarGeometry(labels)
    const fits = geo.map.edges.map(polylineFit)
    const paintLabel = new Int32Array(geo.map.faces.count)
    for (let p = 0; p < labels.data.length; p++) paintLabel[geo.map.faces.ids[p]] = labels.data[p]
    const setBack = {
      faceIds: geo.map.faces.ids,
      width: 8,
      height: 5,
      distance: 1,
      ramp: 2,
      fit: (pts: Float64Array): PathCommand[] => {
        const out: PathCommand[] = []
        for (let i = 2; i < pts.length; i += 2) out.push({ type: 'L', x: pts[i], y: pts[i + 1] })
        return out
      },
    }
    const base = stackedLayers(geo, fits, paintLabel, [0, 1], [], setBack)[0]
    expect(base.label).toBe(0)
    for (const sh of base.shapes) {
      for (const c of sh.commands) {
        if (c.type === 'Z') continue
        const onFrame = c.x === 0 || c.x === 8 || c.y === 0 || c.y === 5
        expect(onFrame).toBe(true)
      }
    }
    expect(paintedArea(base.shapes[0].commands)).toBeCloseTo(40, 9)
  })

  it('sets a noisy edge back along its smoothed normal, keeping its points in order', () => {
    // A measured edge along y = 8, points half a pixel apart wobbling ±0.3 px,
    // the sheet over it (face 0) above: the set-back follows the edge's line,
    // not each wobble.
    const n = 80
    const points = new Float64Array(2 * n)
    let seed = 7
    for (let i = 0; i < n; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483648
      points[2 * i] = 2 + 0.5 * i
      points[2 * i + 1] = 8 + (seed / 2147483648 - 0.5) * 0.6
    }
    const w = 48
    const h = 16
    const faceIds = new Int32Array(w * h)
    for (let p = 0; p < w * h; p++) faceIds[p] = Math.floor(p / w) < 8 ? 0 : 1
    const edge = {
      points,
      sigma: new Float64Array(n).fill(0.1),
      fixed: new Uint8Array(n),
      left: 0,
      right: 1,
      start: 0,
      end: 1,
      closed: false,
    }
    const sb = { faceIds, width: w, height: h, distance: 1, ramp: 3, fit: () => [] }
    const out = setBackPoints(edge, 0, false, false, sb)
    for (let i = 1; i < n; i++) expect(out[2 * i]).toBeGreaterThan(out[2 * i - 2])
    for (let i = 0; i < n; i++) {
      // One pixel into the sheet, within the edge's own wobble of its line.
      expect(Math.abs(out[2 * i + 1] - (points[2 * i + 1] - 1))).toBeLessThan(0.05)
    }
  })

  it('keeps a set-back off a sheet thinner than the distance it moves', () => {
    // On a 2× grid the set-back is 2 px; the sheet over the edge at y = 8 is a
    // band two pixels deep (rows 6 and 7), so a point moved its full distance
    // would land on the band's far edge, and stays where it was.
    const n = 30
    const points = new Float64Array(2 * n)
    for (let i = 0; i < n; i++) {
      points[2 * i] = 4 + i
      points[2 * i + 1] = 8
    }
    const w = 40
    const h = 16
    const faceIds = new Int32Array(w * h)
    for (let p = 0; p < w * h; p++) {
      const y = Math.floor(p / w)
      faceIds[p] = y >= 6 && y < 8 ? 0 : y >= 8 ? 1 : 2
    }
    const edge = {
      points,
      sigma: new Float64Array(n).fill(0.1),
      fixed: new Uint8Array(n),
      left: 0,
      right: 1,
      start: 0,
      end: 1,
      closed: false,
    }
    const sb = { faceIds, width: w, height: h, distance: 2, ramp: 6, fit: () => [] }
    const out = setBackPoints(edge, 0, false, false, sb)
    for (let i = 0; i < n; i++) expect(out[2 * i + 1]).toBe(8)
    // Three rows deep, the sheet holds the set-back point and half a pixel past it.
    for (let p = 0; p < w * h; p++) if (Math.floor(p / w) === 5) faceIds[p] = 0
    const deep = setBackPoints(edge, 0, false, false, sb)
    for (let i = 0; i < n; i++) expect(deep[2 * i + 1]).toBeCloseTo(6, 9)
  })

  it('sets back an edge fitted a little across its lattice boundary', () => {
    // The labels change between rows 7 and 8, but the fitted edge runs at
    // y = 8.7, on the lower face's pixels: on a 2× grid it still moves its two
    // pixels up beneath the sheet (face 0), which holds the set-back point.
    const n = 20
    const points = new Float64Array(2 * n)
    for (let i = 0; i < n; i++) {
      points[2 * i] = 4 + i
      points[2 * i + 1] = 8.7
    }
    const w = 32
    const h = 16
    const faceIds = new Int32Array(w * h)
    for (let p = 0; p < w * h; p++) faceIds[p] = Math.floor(p / w) < 8 ? 0 : 1
    const sb = { faceIds, width: w, height: h, distance: 2, ramp: 6, fit: () => [] }
    const out = setBackPoints({ points, closed: false }, 0, false, false, sb)
    for (let i = 0; i < n; i++) expect(out[2 * i + 1]).toBeCloseTo(6.7, 9)
  })

  it('draws the shared fit beneath a sheet too thin to set back under', () => {
    // A black field (1) under a one-pixel grey strip (2) beside white (0): the
    // black sheet's outline runs beneath the strip, too thin to hold a pixel's
    // set-back, so it draws the strip's own fitted edge (a curve here), not a
    // refit of the edge's measured points.
    const labels = labelsOf(Array.from({ length: 10 }, () => '1111200000'))
    const geo = planarGeometry(labels)
    const ids = geo.map.faces.ids
    const grey = ids[4]
    const white = ids[5]
    const fits = geo.map.edges.map((e): FittedEdge => {
      const shared =
        (e.left === grey && e.right === white) || (e.left === white && e.right === grey)
      if (!shared) return polylineFit(e)
      const p = e.points
      const n = p.length / 2
      const [x0, y0, x3, y3] = [p[0], p[1], p[2 * n - 2], p[2 * n - 1]]
      return {
        x0,
        y0,
        segments: [
          {
            type: 'C',
            x1: 5.3,
            y1: y0 + (y3 - y0) / 3,
            x2: 5.3,
            y2: y0 + (2 * (y3 - y0)) / 3,
            x: x3,
            y: y3,
          },
        ],
        closed: false,
        params: 6,
        chi2: 0,
      }
    })
    const paintLabel = new Int32Array(geo.map.faces.count)
    for (let p = 0; p < labels.data.length; p++) paintLabel[ids[p]] = labels.data[p]
    const setBack = {
      faceIds: ids,
      width: 10,
      height: 10,
      distance: 1,
      ramp: 2,
      fit: (pts: Float64Array): PathCommand[] => {
        const out: PathCommand[] = []
        for (let i = 2; i < pts.length; i += 2) out.push({ type: 'L', x: pts[i], y: pts[i + 1] })
        return out
      },
    }
    const black = stackedLayers(geo, fits, paintLabel, [0, 1, 2], [], setBack)[1]
    expect(black.label).toBe(1)
    const curves = black.shapes.flatMap((sh) => sh.commands).filter((c) => c.type === 'C')
    expect(curves).toHaveLength(1)
    expect(curves[0]).toMatchObject({ x1: 5.3, x2: 5.3 })
  })

  it("keeps the shared fit's corner where only part of a hidden edge moves", () => {
    // The grey strip (2) over the black field (1) is one pixel wide down to row
    // 7 and four below it, and the shared edge with white is fitted as two
    // lines meeting at (5.4, 5). Only the deep stretch moves; the thin one is
    // drawn as the shared fit draws it, so the corner stays even under a fit
    // that would cut it (one line per moved run).
    const rows = Array.from({ length: 10 }, (_, y) => (y < 7 ? '1111200000' : '1222200000'))
    const labels = labelsOf(rows)
    const geo = planarGeometry(labels)
    const ids = geo.map.faces.ids
    const grey = ids[4]
    const white = ids[5]
    const fits = geo.map.edges.map((e): FittedEdge => {
      const shared =
        (e.left === grey && e.right === white) || (e.left === white && e.right === grey)
      if (!shared) return polylineFit(e)
      const p = e.points
      const n = p.length / 2
      return {
        x0: p[0],
        y0: p[1],
        segments: [
          { type: 'L', x: 5.4, y: 5 },
          { type: 'L', x: p[2 * n - 2], y: p[2 * n - 1] },
        ],
        closed: false,
        params: 4,
        chi2: 0,
      }
    })
    const paintLabel = new Int32Array(geo.map.faces.count)
    for (let p = 0; p < labels.data.length; p++) paintLabel[ids[p]] = labels.data[p]
    const runs: Float64Array[] = []
    const setBack = {
      faceIds: ids,
      width: 10,
      height: 10,
      distance: 1,
      ramp: 2,
      fit: (pts: Float64Array): PathCommand[] => {
        runs.push(pts)
        return [{ type: 'L', x: pts[pts.length - 2], y: pts[pts.length - 1] }]
      },
    }
    const black = stackedLayers(geo, fits, paintLabel, [0, 1, 2], [], setBack)[1]
    const cmds = black.shapes.flatMap((sh) => sh.commands)
    expect(cmds.some((c) => c.type !== 'Z' && c.x === 5.4 && c.y === 5)).toBe(true)
    // One run was refitted: the deep stretch from the corner down, set back a
    // pixel beneath the strip.
    expect(runs).toHaveLength(1)
    const ys = runs[0].filter((_, k) => k % 2 === 1)
    const xs = runs[0].filter((_, k) => k % 2 === 0)
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([5, 10])
    expect(Math.min(...xs)).toBeLessThan(4.5)
  })

  it('joins two hidden edges set back on either side of a node halfway between them', () => {
    // White (0) in the top-left corner; grey (2) right of it and blue (3) below
    // it, both above the black field (1). The black sheet's outline runs
    // beneath grey down to the node (5, 5), then beneath blue: each run is set
    // back a pixel along its own normal, to (6, 5) and (5, 6), and the two
    // meet halfway, at (5.5, 5.5), instead of the outline hooking across.
    const labels = labelsOf([
      '0000022222',
      '0000022222',
      '0000022222',
      '0000022222',
      '0000022222',
      '3333322222',
      '3333333333',
      '3333333333',
      '1111111111',
      '1111111111',
    ])
    const geo = planarGeometry(labels)
    const fits = geo.map.edges.map(polylineFit)
    const paintLabel = new Int32Array(geo.map.faces.count)
    for (let p = 0; p < labels.data.length; p++) paintLabel[geo.map.faces.ids[p]] = labels.data[p]
    const setBack = {
      faceIds: geo.map.faces.ids,
      width: 10,
      height: 10,
      distance: 1,
      ramp: 2,
      fit: (pts: Float64Array): PathCommand[] => {
        const out: PathCommand[] = []
        for (let i = 2; i < pts.length; i += 2) out.push({ type: 'L', x: pts[i], y: pts[i + 1] })
        return out
      },
    }
    const black = stackedLayers(geo, fits, paintLabel, [0, 1, 2, 3], [], setBack)[1]
    expect(black.label).toBe(1)
    const at = (x: number, y: number): boolean =>
      black.shapes.some((sh) =>
        sh.commands.some(
          (c) => c.type !== 'Z' && Math.abs(c.x - x) < 1e-9 && Math.abs(c.y - y) < 1e-9,
        ),
      )
    expect([at(5.5, 5.5), at(6, 5), at(5, 6)]).toEqual([true, false, false])
  })

  it('samples a fitted edge through every segment end, along each segment', () => {
    const fit: FittedEdge = {
      x0: 0,
      y0: 0,
      segments: [
        { type: 'L', x: 4, y: 0 },
        { type: 'C', x1: 5, y1: 0, x2: 6, y2: 1, x: 6, y: 4 },
        { type: 'A', rx: 2, ry: 2, rotation: 0, largeArc: false, sweep: true, x: 2, y: 4 },
      ],
      closed: false,
      params: 0,
      chi2: 0,
    }
    const { points: pts, ends } = fittedPoints(fit, 0.5)
    const at = (x: number, y: number): number => {
      for (let i = 0; i < pts.length; i += 2) if (pts[i] === x && pts[i + 1] === y) return i / 2
      return -1
    }
    const corner = at(4, 0)
    const join = at(6, 4)
    expect([at(0, 0), corner > 0, join > corner, at(2, 4)]).toEqual([
      0,
      true,
      true,
      pts.length / 2 - 1,
    ])
    // The line cut every half pixel; the arc's points on its circle about (4, 4).
    expect(corner).toBe(8)
    expect([...ends]).toEqual([corner, join, pts.length / 2 - 1])
    for (let i = 0; i <= corner; i++) expect(pts[2 * i + 1]).toBe(0)
    for (let i = join; i < pts.length / 2; i++) {
      expect(Math.hypot(pts[2 * i] - 4, pts[2 * i + 1] - 4)).toBeCloseTo(2, 9)
      expect(pts[2 * i + 1]).toBeGreaterThanOrEqual(4 - 1e-9)
    }
    // A closed edge does not repeat its first point.
    const ring = fittedPoints(
      {
        x0: 0,
        y0: 0,
        segments: [
          { type: 'L', x: 2, y: 0 },
          { type: 'L', x: 0, y: 0 },
        ],
        closed: true,
        params: 0,
        chi2: 0,
      },
      1,
    )
    expect([...ring.points]).toEqual([0, 0, 1, 0, 2, 0, 1, 0])
    expect([...ring.ends]).toEqual([2, 4])
  })

  it('measures how far a drawn path strays from its points', () => {
    // Points along y = 0 bulging to y = 1 midway, against the chord.
    const pts = new Float64Array(22)
    for (let i = 0; i <= 10; i++) {
      pts[2 * i] = i
      pts[2 * i + 1] = Math.sin((Math.PI * i) / 10)
    }
    const chord: PathCommand[] = [{ type: 'L', x: 10, y: pts[21] }]
    expect(keepsTo(pts, chord, 0.5)).toBe(false)
    expect(keepsTo(pts, chord, 1.01)).toBe(true)
    const polyline: PathCommand[] = []
    for (let i = 1; i <= 10; i++) polyline.push({ type: 'L', x: pts[2 * i], y: pts[2 * i + 1] })
    expect(keepsTo(pts, polyline, 0.01)).toBe(true)
  })

  it('splits a set-back fit drawn as a chord off its points', () => {
    // A set-back run from a twemoji trouser leg on a 2× grid (working px): one
    // line priced by its points' best-fit line, drawn from the first point to
    // the last two pixels off the run.
    const pts = Float64Array.from([
      73.27, 191.98, 73.81, 193.43, 74.08, 194.7, 74.26, 195.87, 74.44, 197.09, 74.59, 198.29,
      74.71, 199.29, 74.82, 200.28, 74.93, 201.27, 75.05, 202.26, 75.16, 203.26, 75.27, 204.25,
      75.39, 205.24, 75.5, 206.24, 75.62, 207.23, 75.73, 208.22, 75.84, 209.22, 75.96, 210.21,
      76.07, 211.2, 76.18, 212.19, 76.3, 213.19, 76.41, 214.18, 76.52, 215.17, 76.64, 216.17, 76.75,
      217.16, 76.86, 218.15, 76.98, 219.15, 77.09, 220.14, 77.21, 221.13, 77.32, 222.12, 77.43,
      223.12, 77.55, 224.11, 77.66, 225.1, 77.77, 226.1, 77.89, 227.09, 78.0, 228.1, 78.12, 229.11,
      78.23, 230.12, 78.35, 231.14, 78.46, 232.15, 78.48, 233.13, 78.5, 234.12, 78.51, 235.1, 78.53,
      236.09, 78.55, 237.07, 78.56, 238.04, 78.58, 239.0, 78.59, 239.97, 78.61, 240.93, 78.62,
      241.9, 78.64, 242.93, 78.58, 243.96, 77.63, 244.91, 76.69, 245.79, 76.7, 246.76,
    ])
    const segs = setBackFit(256, 256, 2)(pts)
    // The halves' fits keep to the run: within a source pixel (2 px) of every point.
    expect(keepsTo(pts, segs, 2)).toBe(true)
    expect(segs.length).toBeGreaterThan(1)
    expect(segs[segs.length - 1]).toMatchObject({ x: pts[pts.length - 2], y: pts[pts.length - 1] })
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

describe('gradient paint in the forward model', () => {
  it('reads an elliptical radial gradient in its own frame', () => {
    const g = {
      kind: 'radial' as const,
      cx: 10,
      cy: 6,
      r: 8,
      aspect: 2,
      angle: Math.PI / 2,
      stops: [
        { offset: 0, color: '#000000' },
        { offset: 1, color: '#ffffff' },
      ],
    }
    const out = new Float64Array(4)
    // Half way along the major axis (down, at angle π/2) and half way across it.
    gradientAt(g, 10, 10, out)
    expect(out[0]).toBeCloseTo(0.5, 9)
    gradientAt(g, 12, 6, out)
    expect(out[0]).toBeCloseTo(0.5, 9)
    // Past the ellipse the last stop pads.
    gradientAt(g, 15, 6, out)
    expect(out[0]).toBe(1)
  })
})
