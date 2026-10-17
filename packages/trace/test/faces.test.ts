import { describe, expect, it } from 'vitest'
import type { LabelMap, PathCommand } from '@trazor/core'
import { assembleFaces, assembleRegions, extractChains, fitChains } from '@trazor/trace'
import type { FaceShape, TraceCutoutOptions } from '@trazor/trace'

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

const OPTS: TraceCutoutOptions = {
  curveMode: 'spline',
  smoothing: 1,
  curveOptimize: true,
  optTolerance: 0.2,
  cornerThreshold: 120,
}

/** Concentric squares: 0 encloses 1 encloses 2. */
const NESTED = labelsOf(['00000000', '01111110', '01222210', '01222210', '01111110', '00000000'])

/** Two disjoint label-2 pockets inside one label-1 field on a 0 ground. */
const SIBLINGS = labelsOf([
  '0000000000',
  '0111111110',
  '0120110210',
  '0120110210',
  '0111111110',
  '0000000000',
])

function faces(labels: LabelMap, opts: TraceCutoutOptions = OPTS): FaceShape[] {
  const network = extractChains(labels)
  return assembleFaces(network, fitChains(network, opts))
}

function anchors(commands: PathCommand[]): Set<string> {
  const out = new Set<string>()
  for (const c of commands) {
    if (c.type !== 'Z') out.add(`${c.x.toFixed(6)},${c.y.toFixed(6)}`)
  }
  return out
}

describe('assembleFaces (nested layering)', () => {
  it('builds one outer-ring face per connected region, no holes', () => {
    const f = faces(NESTED)
    // Three faces, one per color; each is exactly one subpath (M … Z).
    expect(f.length).toBe(3)
    for (const face of f) {
      expect(face.commands.filter((c) => c.type === 'M').length).toBe(1)
      expect(face.commands.filter((c) => c.type === 'Z').length).toBe(1)
    }
  })

  it('nests the containment forest by label', () => {
    const f = faces(NESTED)
    const byLabel = new Map(f.map((face, i) => [face.label, i]))
    const parentLabel = (label: number): number => {
      const p = f[byLabel.get(label)!].parent
      return p < 0 ? -1 : f[p].label
    }
    expect(parentLabel(0)).toBe(-1) // the ground is a root
    expect(parentLabel(1)).toBe(0) // 1 sits in 0
    expect(parentLabel(2)).toBe(1) // 2 sits in 1
  })

  it('reuses the shared chain fit — the innermost face equals its cutout region', () => {
    const network = extractChains(NESTED)
    const fits = fitChains(network, OPTS)
    const face2 = assembleFaces(network, fits).find((f) => f.label === 2)!
    const region2 = assembleRegions(network, fits).find((r) => r.label === 2)!
    // Label 2 is innermost: it has only an outer ring in either assembly, so the
    // face's outline is anchor-for-anchor the cutout region's ring — the fit is
    // shared, so the boundary is seam-free with the face painted over it.
    expect(anchors(face2.commands)).toEqual(anchors(region2.commands))
  })

  it('makes each sibling pocket its own face under the shared parent', () => {
    const f = faces(SIBLINGS)
    const twos = f.filter((face) => face.label === 2)
    expect(twos.length).toBe(2)
    const one = f.findIndex((face) => face.label === 1)
    for (const two of twos) expect(f[two.parent].label).toBe(1)
    expect(f[one].parent).toBeGreaterThanOrEqual(0)
    expect(f[f[one].parent].label).toBe(0)
  })

  it('is deterministic', () => {
    const a = JSON.stringify(faces(NESTED))
    const b = JSON.stringify(faces(NESTED))
    expect(a).toBe(b)
  })
})
