import type { PathCommand } from '@vectorizer/core'
import { describe, expect, it } from 'vitest'
import { buildPathData, optimizePathData, serializeSvg } from '../src/index'
import type { SvgDocument } from '../src/index'

/**
 * Reconstruct a `d` string to the flat sequence of absolute coordinates it
 * defines (controls then endpoint per command), quantized to the grid so two
 * encodings of the same geometry compare equal regardless of
 * absolute/relative/`H`/`V` form. Handles the commands this project emits.
 */
function canonical(d: string, precision: number): number[] {
  const scale = 10 ** precision
  const gi = (v: number): number => Math.round(v * scale)
  // Each command this project emits carries exactly one operand group (no run
  // coalescing), so token order is: letter, its operands, letter, …
  const toks = [...d.matchAll(/([MLHVQCZmlhvqcz])|(-?(?:\d+\.\d+|\.\d+|\d+))/g)].map(
    (m) => m[1] ?? Number.parseFloat(m[2]),
  )
  const out: number[] = []
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  let k = 0
  const n = (): number => {
    const v = toks[k++]
    if (typeof v !== 'number') throw new Error(`expected number at ${k - 1}`)
    return v
  }
  while (k < toks.length) {
    const letter = toks[k++]
    if (typeof letter !== 'string') throw new Error(`expected command at ${k - 1}`)
    const rel = letter >= 'a'
    switch (letter.toUpperCase()) {
      case 'M':
      case 'L': {
        let x = n()
        let y = n()
        if (rel) {
          x += cx
          y += cy
        }
        cx = x
        cy = y
        if (letter.toUpperCase() === 'M') {
          sx = x
          sy = y
        }
        out.push(gi(x), gi(y))
        break
      }
      case 'H': {
        let x = n()
        if (rel) x += cx
        cx = x
        out.push(gi(x), gi(cy))
        break
      }
      case 'V': {
        let y = n()
        if (rel) y += cy
        cy = y
        out.push(gi(cx), gi(y))
        break
      }
      case 'Q': {
        let x1 = n()
        let y1 = n()
        let x = n()
        let y = n()
        if (rel) {
          x1 += cx
          y1 += cy
          x += cx
          y += cy
        }
        cx = x
        cy = y
        out.push(gi(x1), gi(y1), gi(x), gi(y))
        break
      }
      case 'C': {
        let x1 = n()
        let y1 = n()
        let x2 = n()
        let y2 = n()
        let x = n()
        let y = n()
        if (rel) {
          x1 += cx
          y1 += cy
          x2 += cx
          y2 += cy
          x += cx
          y += cy
        }
        cx = x
        cy = y
        out.push(gi(x1), gi(y1), gi(x2), gi(y2), gi(x), gi(y))
        break
      }
      case 'Z': {
        cx = sx
        cy = sy
        break
      }
    }
  }
  return out
}

const samples: Record<string, PathCommand[]> = {
  'axis-aligned square (far from origin)': [
    { type: 'M', x: 1520, y: 40 },
    { type: 'L', x: 1520, y: 880 },
    { type: 'L', x: 60, y: 880 },
    { type: 'L', x: 60, y: 40 },
    { type: 'Z' },
  ],
  'evenodd ring with a hole subpath': [
    { type: 'M', x: 2, y: 2 },
    { type: 'L', x: 22, y: 2 },
    { type: 'L', x: 22, y: 22 },
    { type: 'L', x: 2, y: 22 },
    { type: 'Z' },
    { type: 'M', x: 8, y: 8 },
    { type: 'L', x: 16, y: 8 },
    { type: 'L', x: 16, y: 16 },
    { type: 'L', x: 8, y: 16 },
    { type: 'Z' },
  ],
  'cubic curve chain with nearby points': [
    { type: 'M', x: 812.5, y: 640.25 },
    { type: 'C', x1: 820.5, y1: 648, x2: 832, y2: 651.5, x: 840.75, y: 650 },
    { type: 'C', x1: 849, y1: 648.5, x2: 855.5, y2: 641, x: 856, y: 632.5 },
    { type: 'Z' },
  ],
  'mixed quadratics and negatives': [
    { type: 'M', x: 0, y: 0 },
    { type: 'L', x: -5, y: -6.25 },
    { type: 'Q', x1: -1, y1: -2, x: 7, y: -8 },
    { type: 'C', x1: -1, y1: -2, x2: -3, y2: -4, x: 7, y: -8 },
    { type: 'Z' },
  ],
}

describe('optimizePathData', () => {
  for (const precision of [0, 2, 3]) {
    describe(`precision ${precision}`, () => {
      for (const [name, commands] of Object.entries(samples)) {
        it(`preserves geometry and never grows: ${name}`, () => {
          const abs = buildPathData(commands, precision)
          const opt = optimizePathData(commands, precision)
          expect(canonical(opt, precision)).toEqual(canonical(abs, precision))
          expect(opt.length).toBeLessThanOrEqual(abs.length)
        })
      }
    })
  }

  it('is deterministic', () => {
    for (const commands of Object.values(samples)) {
      expect(optimizePathData(commands, 2)).toBe(optimizePathData(commands, 2))
    }
  })

  it('collapses an axis-aligned square to H/V commands', () => {
    const commands: PathCommand[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 100, y: 0 },
      { type: 'L', x: 100, y: 100 },
      { type: 'L', x: 0, y: 100 },
      { type: 'Z' },
    ]
    expect(optimizePathData(commands, 2)).toBe('M 0 0 H 100 V 100 H 0 Z')
  })

  it('chooses relative form when deltas are smaller than absolutes', () => {
    const commands: PathCommand[] = [
      { type: 'M', x: 1000, y: 1000 },
      { type: 'L', x: 1005, y: 1003 },
    ]
    expect(optimizePathData(commands, 0)).toBe('M 1000 1000 l 5 3')
  })

  it('keeps the first move absolute and glues negative deltas', () => {
    const commands: PathCommand[] = [
      { type: 'M', x: 1000, y: 1000 },
      { type: 'L', x: 995, y: 993.75 },
    ]
    // Relative wins here; both deltas negative ⇒ "l-5-6.25" with no separating spaces.
    expect(optimizePathData(commands, 2)).toBe('M 1000 1000 l-5-6.25')
  })

  it('breaks a zero-cost absolute/relative tie toward absolute', () => {
    const commands: PathCommand[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: -5, y: -6.25 },
    ]
    expect(optimizePathData(commands, 2)).toBe('M 0 0 L-5-6.25')
  })

  it('quantizes without accumulating drift across a long relative run', () => {
    const commands: PathCommand[] = [{ type: 'M', x: 0, y: 0 }]
    let x = 0
    for (let i = 1; i <= 300; i++) {
      x += 1.005 // rounds to 1.0 or 1.01 per step; deltas must still sum exactly
      commands.push({ type: 'L', x, y: i % 2 })
    }
    const opt = optimizePathData(commands, 2)
    expect(canonical(opt, 2)).toEqual(canonical(buildPathData(commands, 2), 2))
  })
})

describe('serializeSvg with optimizePaths', () => {
  const doc: SvgDocument = {
    width: 100,
    height: 100,
    unit: 'px',
    shapes: [
      {
        commands: [
          { type: 'M', x: 4, y: 4 },
          { type: 'L', x: 96, y: 4 },
          { type: 'L', x: 96, y: 96 },
          { type: 'L', x: 4, y: 96 },
          { type: 'Z' },
        ],
        fill: '#123456',
        fillRule: 'evenodd',
      },
    ],
  }

  it('never produces a larger document and stays valid', () => {
    const plain = serializeSvg(doc, { precision: 2 })
    const optimized = serializeSvg(doc, { precision: 2, optimizePaths: true })
    expect(optimized.length).toBeLessThanOrEqual(plain.length)
    expect(optimized).toContain('d="M 4 4 H 96 V 96 H 4 Z"')
    expect(optimized.startsWith('<svg')).toBe(true)
    expect(optimized.endsWith('</svg>')).toBe(true)
  })
})
