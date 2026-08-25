import { describe, expect, it } from 'vitest'
import type { LabelMap } from '@trazor/core'
import { hexToRgb } from '@trazor/core'
import { fitRegionGradients } from '../src/index'
import { rasterOf } from './helpers'
import type { Rgba } from './helpers'

/** A horizontal grayscale ramp, dark on the left to light on the right. */
function rampImage(w: number, h: number): ReturnType<typeof rasterOf> {
  return rasterOf(w, h, (x) => {
    const v = Math.round(40 + (x / (w - 1)) * 180)
    return [v, v, v, 255] as Rgba
  })
}

/** Posterize x into `bands` vertical stripes as a label map. */
function bandLabels(w: number, h: number, bands: number): LabelMap {
  const data = new Int32Array(w * h)
  const bw = w / bands
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      data[y * w + x] = Math.min(bands - 1, Math.floor(x / bw))
    }
  }
  return { width: w, height: h, data, count: bands }
}

describe('fitRegionGradients', () => {
  it('merges posterized bands of a linear ramp into one horizontal gradient', () => {
    const w = 60
    const h = 20
    const image = rampImage(w, h)
    const labels = bandLabels(w, h, 6)
    const { gradients } = fitRegionGradients(image, labels, { minArea: 32 })

    const found = gradients.filter((g) => g !== null)
    expect(found).toHaveLength(1)
    const g = found[0]!
    expect(g.kind).toBe('linear')
    if (g.kind !== 'linear') return

    // All six bands collapse into a single region (one label remains).
    expect(new Set(labels.data).size).toBe(1)

    // The ramp runs along x, so the gradient axis is (near-)horizontal.
    expect(Math.abs(g.y2 - g.y1)).toBeLessThan(Math.abs(g.x2 - g.x1))

    // Two stops spanning dark → light (grayscale, so channels stay equal).
    expect(g.stops).toHaveLength(2)
    const lo = hexToRgb(g.stops[0].color)!
    const hi = hexToRgb(g.stops[1].color)!
    expect(Math.abs(lo[0] - lo[1])).toBeLessThanOrEqual(3)
    expect(Math.abs(hi[0] - hi[1])).toBeLessThanOrEqual(3)
    // The endpoints are clearly different luminances (a real ramp, not a flat).
    expect(Math.abs(hi[0] - lo[0])).toBeGreaterThan(80)
  })

  it('leaves two distinct flat colors alone (a step is not a ramp)', () => {
    const w = 40
    const h = 20
    const image = rasterOf(w, h, (x) => (x < w / 2 ? [220, 30, 30, 255] : [30, 60, 220, 255]))
    const labels = bandLabels(w, h, 2)
    const before = Array.from(labels.data)
    const { gradients } = fitRegionGradients(image, labels, { minArea: 32 })
    expect(gradients.every((g) => g === null)).toBe(true)
    // Rejected ramps never touch the label map.
    expect(Array.from(labels.data)).toEqual(before)
  })

  it('does not gradient a ramp below the minimum area', () => {
    const w = 60
    const h = 20
    const labels = bandLabels(w, h, 6)
    const before = Array.from(labels.data)
    const { gradients } = fitRegionGradients(rampImage(w, h), labels, { minArea: w * h * 4 })
    expect(gradients.every((g) => g === null)).toBe(true)
    expect(Array.from(labels.data)).toEqual(before)
  })

  it('is deterministic', () => {
    const w = 60
    const h = 20
    const a = bandLabels(w, h, 6)
    const b = bandLabels(w, h, 6)
    const ra = fitRegionGradients(rampImage(w, h), a, { minArea: 32 })
    const rb = fitRegionGradients(rampImage(w, h), b, { minArea: 32 })
    expect(JSON.stringify(rb.gradients)).toBe(JSON.stringify(ra.gradients))
    expect(Array.from(b.data)).toEqual(Array.from(a.data))
  })
})
