import { describe, expect, it } from 'vitest'
import type { LabelMap, PathCommand } from '@trazor/core'
import { assembleRegions, extractChains, fitChain, fitChains, traceLabelMap } from '@trazor/trace'
import type { ChainFit, TraceCutoutOptions } from '@trazor/trace'

/** Rows of digits → a label map (`.` is unlabeled). */
function labelsOf(rows: string[]): LabelMap {
  const height = rows.length
  const width = rows[0].length
  const data = new Int32Array(width * height)
  let count = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x]
      const l = ch === '.' ? -1 : Number(ch)
      data[y * width + x] = l
      if (l + 1 > count) count = l + 1
    }
  }
  return { width, height, data, count }
}

/** Two regions meeting along a wavy seam, with a pocket of 2 enclosed by 1. */
const PARTITION = labelsOf([
  '0000000111',
  '0000001111',
  '0000011111',
  '0000111211',
  '0001111221',
  '0001112221',
  '0000111211',
  '0000011111',
  '0000001111',
  '0000000111',
])

/** A third region that borders the image edge and leaves unlabeled corners. */
const WITH_HOLES = labelsOf([
  '..00001111',
  '.0000011111'.slice(0, 10),
  '0002200111',
  '0002200111',
  '0000000111',
  '0000022211',
  '0000022211',
  '0000000111',
  '.000001111',
  '..00001111',
])

const OPTS: TraceCutoutOptions = {
  curveMode: 'spline',
  smoothing: 1,
  curveOptimize: true,
  optTolerance: 0.2,
  cornerThreshold: 120,
}

describe('traceLabelMap split into extract / fit / assemble', () => {
  const cases: { name: string; labels: LabelMap; opts: TraceCutoutOptions }[] = [
    { name: 'a wavy partition', labels: PARTITION, opts: OPTS },
    { name: 'regions with holes and unlabeled pixels', labels: WITH_HOLES, opts: OPTS },
    { name: 'polygon curves', labels: PARTITION, opts: { ...OPTS, curveMode: 'polygon' } },
    { name: 'pixel curves', labels: PARTITION, opts: { ...OPTS, curveMode: 'pixel' } },
    {
      name: 'a chain refinement',
      labels: PARTITION,
      // Marks each chain so the assembly must be reading the refined fit, not
      // re-fitting; the transform keeps the terminal anchors, as required.
      opts: { ...OPTS, refineChain: (cmds) => cmds.map((c) => ({ ...c })) },
    },
    {
      name: 'a sub-pixel color field',
      labels: PARTITION,
      opts: {
        ...OPTS,
        colorField: {
          oklab: new Float32Array(PARTITION.width * PARTITION.height * 3).fill(0.3),
          paletteOklab: new Float32Array([0, 0, 0, 1, 0, 0, 0.5, 0.1, 0.1]),
        },
      },
    },
  ]

  for (const { name, labels, opts } of cases) {
    it(`reproduces the one-shot result for ${name}`, () => {
      const network = extractChains(labels)
      const staged = assembleRegions(network, fitChains(network, opts))
      expect(staged).toEqual(traceLabelMap(labels, opts))
    })

    it(`fits each chain independently for ${name}`, () => {
      const network = extractChains(labels)
      // What a helper pool does: fit the chains out of order, place them by
      // index, assemble from the collected fits.
      const shuffled = network.chains
        .map((_, i) => i)
        .toSorted((a, b) => (a % 3) - (b % 3) || b - a)
      const fits: ChainFit[] = new Array(network.chains.length)
      for (const i of shuffled) fits[i] = fitChain(network, i, opts)
      expect(assembleRegions(network, fits)).toEqual(traceLabelMap(labels, opts))
    })
  }

  it('shares every interior anchor between adjacent regions', () => {
    const network = extractChains(PARTITION)
    const regions = assembleRegions(network, fitChains(network, OPTS))
    const anchors = (commands: PathCommand[]): Set<string> => {
      const out = new Set<string>()
      for (const c of commands) {
        if (c.type !== 'Z') out.add(`${c.x.toFixed(9)},${c.y.toFixed(9)}`)
      }
      return out
    }
    const a = anchors(regions[0].commands)
    const b = anchors(regions[1].commands)
    const shared = [...a].filter((p) => b.has(p))
    expect(shared.length).toBeGreaterThan(2)
  })

  it('carries a closed ring only for a chain that closes on its own start', () => {
    const network = extractChains(WITH_HOLES)
    const fits = fitChains(network, OPTS)
    for (let i = 0; i < network.chains.length; i++) {
      expect(fits[i].closed !== undefined).toBe(network.chains[i].loop)
      // The open run never carries the leading M or a Z: a ring splices it in.
      expect(fits[i].open.some((c) => c.type === 'M' || c.type === 'Z')).toBe(false)
    }
  })
})
