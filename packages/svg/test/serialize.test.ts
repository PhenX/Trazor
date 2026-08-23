import type { PathCommand } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { buildPathData, formatNumber, serializeSvg } from '../src/index'
import type { SvgDocument } from '../src/index'

const square = (x0: number, y0: number, x1: number, y1: number): PathCommand[] => [
  { type: 'M', x: x0, y: y0 },
  { type: 'L', x: x1, y: y0 },
  { type: 'L', x: x1, y: y1 },
  { type: 'L', x: x0, y: y1 },
  { type: 'Z' },
]

/** 24×24 icon: evenodd ring (outer + hole subpath) and a stroked open curve. */
const goldenDoc = (): SvgDocument => ({
  width: 24,
  height: 24,
  unit: 'px',
  title: 'Icon',
  shapes: [
    {
      commands: [...square(2, 2, 22, 22), ...square(8, 8, 16, 16)],
      fill: '#102030',
      fillRule: 'evenodd',
    },
    {
      commands: [
        { type: 'M', x: 4, y: 20 },
        { type: 'Q', x1: 12, y1: 26, x: 20, y: 20 },
      ],
      stroke: '#ff0000',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
    },
  ],
})

describe('formatNumber', () => {
  it('strips trailing zeros and the trailing dot', () => {
    expect(formatNumber(1.5, 3)).toBe('1.5')
    expect(formatNumber(2, 3)).toBe('2')
    expect(formatNumber(10.1, 2)).toBe('10.1')
    expect(formatNumber(0.5, 1)).toBe('0.5')
    expect(formatNumber(100, 4)).toBe('100')
  })

  it('normalizes negative zero to 0', () => {
    expect(formatNumber(-0, 2)).toBe('0')
    expect(formatNumber(-0.0004, 3)).toBe('0')
    expect(formatNumber(-0.2, 0)).toBe('0')
  })

  it('rounds at precision 0 and 3', () => {
    expect(formatNumber(10.6, 0)).toBe('11')
    expect(formatNumber(3.2, 0)).toBe('3')
    expect(formatNumber(1.23456, 3)).toBe('1.235')
    expect(formatNumber(-7.25, 0)).toBe('-7')
  })
})

describe('buildPathData', () => {
  it('emits every command letter with single-space joins', () => {
    const d = buildPathData(square(0, 0, 10, 5), 2)
    expect(d).toBe('M 0 0 L 10 0 L 10 5 L 0 5 Z')
  })

  it('omits the space before negative numbers', () => {
    const commands: PathCommand[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: -5, y: -6.25 },
      { type: 'C', x1: -1, y1: -2, x2: -3, y2: -4, x: 7, y: -8 },
      { type: 'Z' },
    ]
    expect(buildPathData(commands, 2)).toBe('M 0 0 L-5-6.25 C-1-2-3-4 7-8 Z')
  })

  it('applies precision 0 and 3 with trailing-zero stripping', () => {
    const commands: PathCommand[] = [
      { type: 'M', x: 1.4, y: 2.6 },
      { type: 'Q', x1: 0.125, y1: 1.23456, x: 3.5, y: 4 },
    ]
    expect(buildPathData(commands, 0)).toBe('M 1 3 Q 0 1 4 4')
    expect(buildPathData(commands, 3)).toBe('M 1.4 2.6 Q 0.125 1.235 3.5 4')
  })

  it('returns an empty string for no commands', () => {
    expect(buildPathData([], 2)).toBe('')
  })
})

describe('serializeSvg', () => {
  it('produces the golden compact document', () => {
    const svg = serializeSvg(goldenDoc(), { precision: 2 })
    expect(svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">' +
        '<!-- Trazor: traced client-side -->' +
        '<title>Icon</title>' +
        '<path d="M 2 2 L 22 2 L 22 22 L 2 22 Z M 8 8 L 16 8 L 16 16 L 8 16 Z"' +
        ' fill="#102030" fill-rule="evenodd"/>' +
        '<path d="M 4 20 Q 12 26 20 20" fill="none" stroke="#ff0000" stroke-width="1.5"' +
        ' stroke-linecap="round"/>' +
        '</svg>',
    )
    expect(svg).not.toContain('\n')
  })

  it('pretty mode puts each child on its own indented line', () => {
    const lines = serializeSvg(goldenDoc(), { precision: 2, pretty: true }).split('\n')
    expect(lines[0]).toMatch(/^<svg /)
    expect(lines[1]).toBe('  <!-- Trazor: traced client-side -->')
    expect(lines[2]).toBe('  <title>Icon</title>')
    expect(lines[3]).toMatch(/^ {2}<path /)
    expect(lines[4]).toMatch(/^ {2}<path /)
    expect(lines[5]).toBe('</svg>')
    expect(lines[6]).toBe('')
  })

  it('rounds coordinates and the viewBox at precision 0 and 3', () => {
    const doc: SvgDocument = {
      width: 32.4,
      height: 16.6,
      unit: 'px',
      shapes: [
        {
          commands: [
            { type: 'M', x: 1.2345, y: 2.5 },
            { type: 'L', x: 3.0004, y: 4 },
          ],
          fill: '#000000',
        },
      ],
    }
    const p0 = serializeSvg(doc, { precision: 0 })
    expect(p0).toContain('viewBox="0 0 32 17"')
    expect(p0).toContain('width="32" height="17"')
    expect(p0).toContain('d="M 1 3 L 3 4"')
    const p3 = serializeSvg(doc, { precision: 3 })
    expect(p3).toContain('viewBox="0 0 32.4 16.6"')
    expect(p3).toContain('d="M 1.234 2.5 L 3 4"')
  })

  it('mm sizing keeps aspect and defaults to 96 dpi when widthMm is unset', () => {
    const base: SvgDocument = { width: 96, height: 48, unit: 'mm', widthMm: 0, shapes: [] }
    const derived = serializeSvg(base, { precision: 2 })
    expect(derived).toContain('viewBox="0 0 96 48"')
    expect(derived).toContain('width="25.4mm" height="12.7mm"')

    const explicit = serializeSvg(
      { width: 300, height: 100, unit: 'mm', widthMm: 100, shapes: [] },
      { precision: 2 },
    )
    expect(explicit).toContain('width="100mm" height="33.333mm"')
  })

  it('XML-escapes title and desc', () => {
    const svg = serializeSvg(
      {
        width: 8,
        height: 8,
        unit: 'px',
        title: 'Fish & Chips <"\'>',
        desc: 'a < b',
        shapes: [],
      },
      { precision: 2 },
    )
    expect(svg).toContain('<title>Fish &amp; Chips &lt;&quot;&apos;&gt;</title>')
    expect(svg).toContain('<desc>a &lt; b</desc>')
  })

  it('emits fill="none" only for stroked shapes and skips unpainted or empty ones', () => {
    const commands: PathCommand[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 1, y: 1 },
    ]
    const svg = serializeSvg(
      {
        width: 4,
        height: 4,
        unit: 'px',
        shapes: [
          { commands, stroke: '#123456' },
          { commands }, // neither fill nor stroke ⇒ skipped
          { commands: [], fill: '#ffffff' }, // empty commands ⇒ skipped
        ],
      },
      { precision: 2 },
    )
    expect(svg).toContain('<path d="M 0 0 L 1 1" fill="none" stroke="#123456"/>')
    expect((svg.match(/<path /g) ?? []).length).toBe(1)
  })

  it('emits stroke-linejoin and id when set, escaping the id', () => {
    const svg = serializeSvg(
      {
        width: 4,
        height: 4,
        unit: 'px',
        shapes: [
          {
            commands: square(0, 0, 4, 4),
            fill: 'none',
            stroke: '#000000',
            strokeLinejoin: 'bevel',
            id: 'a&b',
          },
        ],
      },
      { precision: 0 },
    )
    expect(svg).toContain('stroke-linejoin="bevel"')
    expect(svg).toContain('id="a&amp;b"')
  })

  it('throws on unsafe paint values instead of emitting broken XML', () => {
    const doc: SvgDocument = {
      width: 4,
      height: 4,
      unit: 'px',
      shapes: [{ commands: square(0, 0, 4, 4), fill: '"><script>' }],
    }
    expect(() => serializeSvg(doc, { precision: 2 })).toThrow(/unsafe fill/)
  })
})
