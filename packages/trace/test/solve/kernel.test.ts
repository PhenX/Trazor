import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { mulberry32 } from '@trazor/core'
import type { FaceFill, PlanarMap, PremultipliedImage } from '../../src/planar/types'
import { solveBoundaries } from '../../src/solve/boundary'
import type { SolveOptions } from '../../src/solve/boundary'
import { BandKernel, loadBandKernel } from '../../src/solve/kernel'
import type { LbfgsStep } from '../../src/solve/lbfgs'
import {
  cloneMap,
  diskRegion,
  fillsByFace,
  flat,
  labelsOfRegions,
  mapOfLabels,
  polygonRegion,
  render,
  rgbaOf,
} from './solve-helpers'
import type { Region } from './solve-helpers'

const PAPER = flat(0.95, 0.9, 0.8)
const INK = flat(0.1, 0.2, 0.7)
const RED = flat(0.8, 0.15, 0.1)

let kernel: BandKernel

beforeAll(async () => {
  kernel = await loadBandKernel(readFileSync(new URL('../../wasm/solve.wasm', import.meta.url)))
  kernel.measure = true
})

interface Scene {
  image: PremultipliedImage
  map: PlanarMap
  fills: FaceFill[]
}

function scene(width: number, height: number, regions: Region[], fillByLabel: FaceFill[]): Scene {
  const image = render(width, height, regions, rgbaOf(fillByLabel[0]))
  const map = mapOfLabels(labelsOfRegions(width, height, regions))
  return { image, map, fills: fillsByFace(map.faces, fillByLabel) }
}

/**
 * A crowd of disks and boxes in five inks over a backdrop: many independent
 * parts, junctions where shapes touch, and the frame.
 */
function crowd(size: number, seed: number): Scene {
  const rnd = mulberry32(seed)
  const inks = Array.from({ length: 6 }, () =>
    flat(Math.fround(rnd()), Math.fround(rnd()), Math.fround(rnd())),
  )
  const regions: Region[] = []
  const labelOf: number[] = []
  for (let k = 0; k < Math.round((size * size) / 300); k++) {
    const cx = 2 + rnd() * (size - 4)
    const cy = 2 + rnd() * (size - 4)
    const r = 1.5 + rnd() * 4
    const li = 1 + Math.floor(rnd() * 5)
    const color = rgbaOf(inks[li])
    regions.push(
      k % 3 === 0
        ? polygonRegion(
            [
              cx - r,
              cy - r * 0.6,
              cx + r,
              cy - r * 0.6,
              cx + r,
              cy + r * 0.6,
              cx - r,
              cy + r * 0.6,
            ],
            color,
          )
        : diskRegion(cx, cy, r, color),
    )
    labelOf.push(li)
  }
  const image = render(size, size, regions, rgbaOf(inks[0]))
  const labels = labelsOfRegions(size, size, regions)
  for (let i = 0; i < labels.data.length; i++) {
    labels.data[i] = labels.data[i] === 0 ? 0 : labelOf[labels.data[i] - 1]
  }
  const map = mapOfLabels({ ...labels, count: 6 })
  return { image, map, fills: fillsByFace(map.faces, inks) }
}

/** Solve a copy of `s` with the TypeScript descent and one with the kernel; return both. */
function both(s: Scene, opts: SolveOptions = {}): { ts: unknown; wasm: unknown } {
  const run = (k: BandKernel | undefined): unknown => {
    const map = cloneMap(s.map)
    const steps: LbfgsStep[] = []
    const rep = solveBoundaries(map, s.image, s.fills, {
      ...opts,
      ...(k !== undefined ? { kernel: k } : {}),
      onStep: (st) => steps.push(st),
    })
    return {
      rep,
      steps,
      points: map.edges.map((e) => Array.from(e.points)),
      nodes: map.nodes.map((v) => [v.x, v.y]),
    }
  }
  const ts = run(undefined)
  kernel.timings.grown = -1
  const wasm = run(kernel)
  // A solve that reaches the descent runs in a memory sized for it, which never grows.
  const reached = (ts as { rep: { parts: number } }).rep.parts > 0
  expect(reached ? kernel.timings.grown : 0).toBe(0)
  return { ts, wasm }
}

describe('the WebAssembly descent', () => {
  it('solves a disk exactly as the TypeScript descent does', () => {
    for (const [cx, cy, r] of [
      [10.3, 9.7, 6.2],
      [12.1, 11.4, 7.6],
    ]) {
      const { ts, wasm } = both(scene(22, 22, [diskRegion(cx, cy, r, rgbaOf(INK))], [PAPER, INK]))
      expect(wasm).toEqual(ts)
    }
  })

  it('moves shared nodes, a three-face junction and the frame exactly as the TypeScript does', () => {
    const a = [3.3, 3.4, 8.6, 3.4, 8.6, 12.7, 3.3, 12.7]
    const b = [8.6, 3.4, 15.2, 3.4, 15.2, 12.7, 8.6, 12.7]
    const two = scene(
      20,
      16,
      [polygonRegion(a, rgbaOf(INK)), polygonRegion(b, rgbaOf(RED))],
      [PAPER, INK, RED],
    )
    const p1 = [6.3, 5.7, 6.3, -1, -1, -1, -1, 9.57]
    const p2 = [6.3, 5.7, 17, 11.88, 17, -1, 6.3, -1]
    const three = scene(
      16,
      14,
      [polygonRegion(p1, rgbaOf(INK)), polygonRegion(p2, rgbaOf(RED))],
      [PAPER, INK, RED],
    )
    const frame = scene(
      12,
      10,
      [polygonRegion([0, 0, 3.8, 0, 4.6, 10, 0, 10], rgbaOf(INK))],
      [PAPER, INK],
    )
    for (const s of [two, three, frame]) {
      const { ts, wasm } = both(s)
      expect(wasm).toEqual(ts)
    }
  })

  it('reads a gradient fill exactly as the TypeScript does', () => {
    const ramp: FaceFill = {
      r: 0.5,
      g: 0.4,
      b: 0.5,
      a: 1,
      at: (x, y, out) => {
        const t = Math.min(1, Math.max(0, ((x - 2.5) * 13 + (y - 3.5) * 6) / (13 * 13 + 6 * 6)))
        out[0] = 0.9 + (0.2 - 0.9) * t
        out[1] = 0.2 + (0.6 - 0.2) * t
        out[2] = 0.1 + (0.9 - 0.1) * t
        out[3] = 1
      },
    }
    const color = (x: number, y: number): [number, number, number, number] => {
      const o = new Float64Array(4)
      ramp.at!(x, y, o)
      return [o[0], o[1], o[2], o[3]]
    }
    const { ts, wasm } = both(scene(18, 14, [diskRegion(8.9, 7.7, 4.6, color)], [PAPER, ramp]))
    expect(wasm).toEqual(ts)
  })

  it('solves against the source of an enlarged map exactly as the TypeScript does', () => {
    const source = render(32, 32, [diskRegion(12.3, 11.6, 6.7, rgbaOf(INK))], rgbaOf(PAPER))
    const work = render(64, 64, [diskRegion(24.6, 23.2, 13.4, rgbaOf(INK))], rgbaOf(PAPER))
    const map = mapOfLabels(labelsOfRegions(64, 64, [diskRegion(24.6, 23.2, 13.4, rgbaOf(INK))]))
    const s = { image: work, map, fills: fillsByFace(map.faces, [PAPER, INK]) }
    const { ts, wasm } = both(s, { source: { image: source, scale: 2 } })
    expect(wasm).toEqual(ts)
  })

  it('solves a crowd of independent parts exactly as the TypeScript does', () => {
    for (const seed of [3, 7]) {
      const s = crowd(64, seed)
      const { ts, wasm } = both(s)
      expect((ts as { rep: { parts: number } }).rep.parts).toBeGreaterThan(5)
      expect(wasm).toEqual(ts)
    }
  })

  it('honors the iteration cap and budget as the TypeScript does', () => {
    const s = crowd(48, 11)
    for (const opts of [{ maxIterations: 1 }, { maxIterations: 0 }, { iterationBudget: 5 }]) {
      const { ts, wasm } = both(s, opts)
      expect(wasm).toEqual(ts)
    }
  })

  it('runs the TypeScript descent when the kernel cannot get its memory', () => {
    const s = crowd(48, 13)
    const ts = cloneMap(s.map)
    const repTs = solveBoundaries(ts, s.image, s.fills)
    const wasm = cloneMap(s.map)
    const real = WebAssembly.Memory
    const refuse = function (): never {
      throw new RangeError('WebAssembly.Memory(): could not allocate memory')
    }
    ;(WebAssembly as { Memory: unknown }).Memory = refuse
    let repWasm
    try {
      repWasm = solveBoundaries(wasm, s.image, s.fills, { kernel })
    } finally {
      ;(WebAssembly as { Memory: unknown }).Memory = real
    }
    expect(repWasm).toEqual(repTs)
    expect(wasm.edges.map((e) => Array.from(e.points))).toEqual(
      ts.edges.map((e) => Array.from(e.points)),
    )
  })

  it('reports the time and bytes of a descent when asked', () => {
    const s = crowd(32, 5)
    solveBoundaries(cloneMap(s.map), s.image, s.fills, { kernel })
    expect(kernel.timings.bytes).toBeGreaterThan(0)
    expect(kernel.timings.solve).toBeGreaterThanOrEqual(0)
    expect(kernel.timings.grown).toBe(0)
  })
})
