import type { LabelMap, PathCommand } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import {
  cutoutRegions,
  nestedFaces,
  planarGeometry,
  polylineFit,
  stackedLayers,
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
