import type { BinaryMask } from '@trazor/core'
import { traceMask } from '@trazor/trace'
import type { TraceMaskOptions } from '@trazor/trace'
import { analyzeSvg, serializeSvg } from '@trazor/svg'
import type { SvgDocument, SvgShape } from '@trazor/svg'
import { describe, expect, it } from 'vitest'

const CURVE_OPTS: TraceMaskOptions = {
  curveMode: 'spline',
  smoothing: 0.75,
  curveOptimize: true,
  optTolerance: 0.2,
  turnPolicy: 'minority',
  minArea: 4,
}

function mask(
  width: number,
  height: number,
  inside: (x: number, y: number) => boolean,
): BinaryMask {
  const data = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[y * width + x] = inside(x, y) ? 1 : 0
  }
  return { width, height, data }
}

/** Representative traced content: curves, axis-aligned edges, a hole, diagonals. */
const fixtures: { name: string; mask: BinaryMask }[] = [
  {
    name: 'circle r120',
    mask: mask(300, 300, (x, y) => (x - 150) ** 2 + (y - 150) ** 2 <= 120 ** 2),
  },
  {
    name: 'rectangle',
    mask: mask(300, 200, (x, y) => x >= 20 && x < 280 && y >= 20 && y < 180),
  },
  {
    name: 'annulus (hole)',
    mask: mask(300, 300, (x, y) => {
      const d2 = (x - 150) ** 2 + (y - 150) ** 2
      return d2 <= 120 ** 2 && d2 >= 60 ** 2
    }),
  },
  {
    name: 'diamond',
    mask: mask(240, 240, (x, y) => Math.abs(x - 120) + Math.abs(y - 120) <= 100),
  },
]

function docFor(m: BinaryMask): SvgDocument {
  const shapes: SvgShape[] = traceMask(m, CURVE_OPTS).map((s) => ({
    commands: s.commands,
    fill: '#000000',
    fillRule: 'evenodd',
  }))
  return { width: m.width, height: m.height, unit: 'px', shapes }
}

const bytes = (svg: string): number => new TextEncoder().encode(svg).length
const pathDataBytes = (svg: string): number =>
  [...svg.matchAll(/ d="([^"]*)"/g)].reduce((n, m) => n + m[1].length, 0)

describe('optimizePaths on traced shapes', () => {
  it('never grows a document and preserves node/path structure', () => {
    for (const { mask: m } of fixtures) {
      const doc = docFor(m)
      const plain = serializeSvg(doc, { precision: 2 })
      const optimized = serializeSvg(doc, {
        precision: 2,
        optimizePaths: true,
        roundPrimitives: true,
      })
      expect(bytes(optimized)).toBeLessThanOrEqual(bytes(plain))
      const a = analyzeSvg(plain)
      const b = analyzeSvg(optimized)
      expect(b.pathCount).toBe(a.pathCount)
      // Collinear removal and <rect> detection can only drop nodes, never add.
      expect(b.nodeCount).toBeLessThanOrEqual(a.nodeCount)
      expect(b.colorCount).toBe(a.colorCount)
    }
  })

  // Opt-in: `OPTIMIZE_BENCH=1 npx vitest run packages/engine/test/optimize-bench`
  it.skipIf(!process.env.OPTIMIZE_BENCH)('reports byte savings', () => {
    let docPlain = 0
    let docOpt = 0
    let pdPlain = 0
    let pdOpt = 0
    const rows: string[] = []
    for (const { name, mask: m } of fixtures) {
      const doc = docFor(m)
      const plain = serializeSvg(doc, { precision: 2 })
      const optimized = serializeSvg(doc, {
        precision: 2,
        optimizePaths: true,
        roundPrimitives: true,
      })
      const dp = bytes(plain)
      const dopt = bytes(optimized)
      const pp = pathDataBytes(plain)
      const popt = pathDataBytes(optimized)
      docPlain += dp
      docOpt += dopt
      pdPlain += pp
      pdOpt += popt
      const nodes = analyzeSvg(plain).nodeCount
      rows.push(
        `${name.padEnd(18)} nodes=${String(nodes).padStart(4)}  ` +
          `doc ${String(dp).padStart(6)}→${String(dopt).padStart(6)} ` +
          `(${(100 * (1 - dopt / dp)).toFixed(1)}%)  ` +
          `path-data ${String(pp).padStart(6)}→${String(popt).padStart(6)} ` +
          `(${(100 * (1 - popt / pp)).toFixed(1)}%)`,
      )
    }
    rows.push(
      `${'TOTAL'.padEnd(18)}           ` +
        `doc ${String(docPlain).padStart(6)}→${String(docOpt).padStart(6)} ` +
        `(${(100 * (1 - docOpt / docPlain)).toFixed(1)}%)  ` +
        `path-data ${String(pdPlain).padStart(6)}→${String(pdOpt).padStart(6)} ` +
        `(${(100 * (1 - pdOpt / pdPlain)).toFixed(1)}%)`,
    )
    console.log(`\noptimizePaths byte savings (precision 2)\n${rows.join('\n')}\n`)
    expect(docOpt).toBeLessThanOrEqual(docPlain)
  })
})
