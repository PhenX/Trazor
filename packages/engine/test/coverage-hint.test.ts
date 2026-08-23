import { describe, expect, it } from 'vitest'
import { createRaster, fillRaster, normalizeSettings, setPixel } from '@trazor/core'
import type { GrayImage, RasterImage, VectorizeSettings } from '@trazor/core'
import { vectorize } from '@trazor/engine'

// A hard vertical bw step: ink (black) on the left of column `edge`, white to the
// right. The classical coverage field of a hard edge is fully saturated, so
// refinement leaves the traced boundary on the integer lattice (x = edge).
function step(width: number, height: number, edge: number): RasterImage {
  const img = createRaster(width, height)
  fillRaster(img, 255, 255, 255)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < edge; x++) setPixel(img, x, y, 0, 0, 0)
  }
  return img
}

// A soft learned coverage field whose 0.5 iso-line sits at `cross` (sub-pixel),
// as FieldEnhancer would predict for a clean edge: [0,1], >0.5 inside (left).
function coverageField(width: number, height: number, cross: number): GrayImage {
  const data = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = 0.5 + (cross - (x + 0.5)) * 0.8
      data[y * width + x] = v < 0 ? 0 : v > 1 ? 1 : v
    }
  }
  return { width, height, data }
}

function settings(patch: Partial<VectorizeSettings>): VectorizeSettings {
  return normalizeSettings({
    mode: 'bw',
    maxDimension: 0, // no resize: traced coords are in input pixels
    thresholdMode: 'fixed',
    threshold: 128,
    curveMode: 'polygon', // straight edges, no control-point overshoot
    curveOptimize: false,
    optimizeSvg: false, // absolute M/L pairs, easy to parse
    minRegionArea: 2,
    precision: 3,
    ...patch,
  })
}

/** Max x-coordinate in the first path's `d` (M/L pairs ⇒ even indices are x). */
function rightEdge(svg: string): number {
  const d = /\sd="([^"]+)"/.exec(svg)
  if (!d) throw new Error('no path in svg')
  const nums = (d[1].match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  let maxX = -Infinity
  for (let i = 0; i < nums.length; i += 2) maxX = Math.max(maxX, nums[i])
  return maxX
}

describe('learned coverage hint (bw sub-pixel refinement)', () => {
  const W = 40
  const H = 16
  const EDGE = 20

  it('leaves the classical path byte-identical when no hint is given', async () => {
    const img = step(W, H, EDGE)
    const a = await vectorize(img, settings({}))
    const b = await vectorize(img, settings({}))
    // Determinism, and an undefined coverageHint changes nothing.
    expect(a.svg).toBe(b.svg)
    expect(rightEdge(a.svg)).toBeCloseTo(EDGE, 5)
  })

  it('snaps the traced edge toward the clean iso-line on a hard (degraded) input', async () => {
    const img = step(W, H, EDGE)
    const base = await vectorize(img, settings({}))
    const hinted = await vectorize(img, settings({}), {
      coverageHint: coverageField(W, H, EDGE + 0.4),
    })

    const baseX = rightEdge(base.svg)
    const hintX = rightEdge(hinted.svg)

    expect(baseX).toBeCloseTo(EDGE, 5) // classical: hard edge stays on the lattice
    expect(hintX).toBeGreaterThan(baseX + 0.15) // hint pulls it toward the true edge
    expect(hintX).toBeLessThanOrEqual(EDGE + 0.75) // within the refinement clamp
    expect(hinted.svg).not.toBe(base.svg)
  })

  it('ignores the hint in pixel curve mode (no sub-pixel field applies)', async () => {
    const img = step(W, H, EDGE)
    const base = await vectorize(img, settings({ curveMode: 'pixel' }))
    const hinted = await vectorize(img, settings({ curveMode: 'pixel' }), {
      coverageHint: coverageField(W, H, EDGE + 0.4),
    })
    expect(hinted.svg).toBe(base.svg)
  })
})
