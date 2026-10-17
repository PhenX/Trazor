import { describe, expect, it } from 'vitest'
import { normalizeSettings } from '@trazor/core'
import type { RasterImage, VectorizeSettings } from '@trazor/core'
import { vectorize } from '@trazor/engine'

/** An anti-aliased black ring of one width on white: radii 36 and 28 about (48, 48). */
function ring(): RasterImage {
  const n = 96
  const data = new Uint8ClampedArray(n * n * 4)
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      // Coverage by 4×4 subsamples.
      let inside = 0
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < 4; i++) {
          const d = Math.hypot(x + (i + 0.5) / 4 - 48, y + (j + 0.5) / 4 - 48)
          if (d <= 36 && d >= 28) inside++
        }
      const v = Math.round(255 * (1 - inside / 16))
      data.set([v, v, v, 255], 4 * (y * n + x))
    }
  return { width: n, height: n, data }
}

const bw = (patch: Partial<VectorizeSettings>): VectorizeSettings =>
  normalizeSettings({
    mode: 'bw',
    geometry: 'planar',
    thresholdMode: 'fixed',
    threshold: 128,
    fillColor: '#000000',
    smoothing: 0.25,
    precision: 2,
    ...patch,
  })

describe('a ring of one width', () => {
  it('is written as one stroked circle on its midline', async () => {
    const { svg } = await vectorize(ring(), bw({}))
    const m = svg.match(
      /<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" fill="none" stroke="#000000" stroke-width="([\d.]+)"\/>/,
    )
    expect(m).not.toBeNull()
    const [cx, cy, r, width] = m!.slice(1).map(Number)
    expect(cx).toBeCloseTo(48, 1)
    expect(cy).toBeCloseTo(48, 1)
    expect(r).toBeCloseTo(32, 1)
    expect(width).toBeCloseTo(8, 1)
    expect(svg).not.toContain('<path')
  })

  it('stays a filled outline in a millimetre document, which a cutter reads', async () => {
    const { svg } = await vectorize(ring(), bw({ unit: 'mm' }))
    expect(svg).not.toContain('stroke=')
    expect(svg).toContain('fill="#000000"')
  })
})
