import type { LabelMap, PathCommand } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { assembleFaces, assembleRegions, extractChains, fitChains } from '../src/index'
import type { TraceCutoutOptions } from '../src/index'

function labelsOf(
  w: number,
  h: number,
  count: number,
  at: (x: number, y: number) => number,
): LabelMap {
  const data = new Int32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = at(x, y)
  return { width: w, height: h, count, data }
}

const opts: TraceCutoutOptions = {
  curveMode: 'spline',
  smoothing: 0.8,
  curveOptimize: true,
  optTolerance: 0.2,
  cornerThreshold: 100,
}

/** Signed area over a ring's on-curve points (exact for the lines a lattice ring is made of). */
function area(commands: readonly PathCommand[]): number {
  let twice = 0
  let sx = 0
  let sy = 0
  let px = 0
  let py = 0
  for (const c of commands) {
    if (c.type === 'M') {
      sx = px = c.x
      sy = py = c.y
    } else if (c.type === 'Z') {
      twice += px * sy - sx * py
    } else {
      twice += px * c.y - c.x * py
      px = c.x
      py = c.y
    }
  }
  return twice / 2
}

describe('thin regions in the chain graph', () => {
  // Paper, a one-pixel ink stem and a one-pixel sliver of a rim color on its
  // right: the three chains around the stem run between the same two junction
  // corners, so each of them alone fits the one straight chord and the stem
  // would close to no area. The stem keeps its lattice outline instead.
  const w = 16
  const h = 60
  const stemAndSliver = labelsOf(w, h, 3, (x, y) =>
    y < 5 || y >= 55 ? 0 : x === 6 ? 1 : x === 7 ? 2 : 0,
  )

  it('keeps a one-pixel stem and the sliver beside it as regions', () => {
    const network = extractChains(stemAndSliver)
    const fits = fitChains(network, opts)
    const regions = assembleRegions(network, fits)
    const stem = regions.find((r) => r.label === 1)
    const sliver = regions.find((r) => r.label === 2)
    expect(stem).toBeDefined()
    expect(sliver).toBeDefined()
    expect(Math.abs(area(stem!.commands))).toBeCloseTo(50, 5)
    expect(Math.abs(area(sliver!.commands))).toBeCloseTo(50, 5)
  })

  it('keeps them as nested faces', () => {
    const network = extractChains(stemAndSliver)
    const fits = fitChains(network, opts)
    const faces = assembleFaces(network, fits)
    const stem = faces.filter((f) => f.label === 1)
    expect(stem).toHaveLength(1)
    expect(Math.abs(area(stem[0].commands))).toBeCloseTo(50, 5)
    expect(Math.abs(area(faces.find((f) => f.label === 2)!.commands))).toBeCloseTo(50, 5)
  })

  it('keeps a one-pixel stem in polygon mode', () => {
    const network = extractChains(stemAndSliver)
    const fits = fitChains(network, { ...opts, curveMode: 'polygon' })
    const stem = assembleRegions(network, fits).find((r) => r.label === 1)!
    expect(Math.abs(area(stem.commands))).toBeCloseTo(50, 5)
  })

  it('keeps a hairline loop whole and leaves a wide region to its fit', () => {
    // A square 20 px on a side keeps its area through the ordinary fit; an
    // L-shaped hairline one pixel wide (a loop ring with its own corners) keeps
    // its whole area too.
    const labels = labelsOf(60, 60, 3, (x, y) => {
      if (x >= 5 && x < 25 && y >= 5 && y < 25) return 1
      if ((x === 40 && y >= 10 && y < 50) || (y === 49 && x >= 40 && x < 55)) return 2
      return 0
    })
    const network = extractChains(labels)
    const fits = fitChains(network, opts)
    const regions = assembleRegions(network, fits)
    const square = regions.find((r) => r.label === 1)!
    expect(Math.abs(area(square.commands))).toBeGreaterThan(380)
    expect(Math.abs(area(square.commands))).toBeLessThan(420)
    const hairline = regions.find((r) => r.label === 2)!
    expect(Math.abs(area(hairline.commands))).toBeCloseTo(54, 5)
    // Deterministic.
    const again = assembleRegions(network, fitChains(network, opts))
    expect(again).toEqual(regions)
  })
})
