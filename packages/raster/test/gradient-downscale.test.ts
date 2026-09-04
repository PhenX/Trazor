import { describe, expect, it } from 'vitest'
import type { LabelMap } from '@trazor/core'
import { fitRegionGradients } from '../src/gradient'
import { rasterOf } from './helpers'

/**
 * `detectMaxDimension` runs the ramp detection on a downscaled copy and carries
 * the decisions back to the full-resolution label map. The detected ramps can
 * differ from a full-resolution run, so these assert the structural contract —
 * a clear ramp is still found as one linear gradient, the geometry is scaled to
 * full space, the relabeling stays in range, and the path is deterministic — not
 * byte-identity.
 */

/** A wide horizontal linear ramp posterized into `bands` vertical bands. */
function rampScene(
  w: number,
  h: number,
  bands: number,
): { image: ReturnType<typeof rasterOf>; labels: LabelMap } {
  const image = rasterOf(w, h, (x) => {
    const t = x / (w - 1)
    return [Math.round(20 + t * 210), Math.round(40 + t * 120), Math.round(200 - t * 150), 255]
  })
  const data = new Int32Array(w * h)
  const bw = w / bands
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) data[y * w + x] = Math.min(bands - 1, Math.floor(x / bw))
  }
  return { image, labels: { width: w, height: h, data, count: bands } }
}

describe('fitRegionGradients downscaled detection', () => {
  it('finds a wide ramp as one linear gradient and scales its geometry to full space', () => {
    const w = 480
    const h = 60
    const { image, labels } = rampScene(w, h, 24)
    const res = fitRegionGradients(image, labels, { minArea: 200, detectMaxDimension: 96 })

    const linears = res.gradients.filter((g) => g?.kind === 'linear')
    expect(linears.length).toBeGreaterThan(0)
    // The ramp's endpoints span most of the image width, in full-resolution px
    // (a detection left in the 96-px space would report x2 well under 96).
    const g = linears[0] as Extract<(typeof linears)[number], { kind: 'linear' }>
    expect(Math.max(g.x1, g.x2)).toBeGreaterThan(w * 0.5)
    expect(Math.max(g.x1, g.x2)).toBeLessThanOrEqual(w)

    // The ramp collapses many bands: some region now covers far more than one band.
    const counts = new Map<number, number>()
    for (const v of labels.data) counts.set(v, (counts.get(v) ?? 0) + 1)
    const largest = Math.max(...counts.values())
    expect(largest).toBeGreaterThan((w * h) / 6)

    // Every rewritten label is a valid index into the returned paint table.
    expect(res.gradients.length).toBe(res.labels.count)
    for (const v of labels.data) expect(v).toBeLessThan(res.labels.count)
  })

  it('is deterministic', () => {
    const digest = (): string => {
      const { image, labels } = rampScene(320, 40, 16)
      const res = fitRegionGradients(image, labels, { minArea: 120, detectMaxDimension: 80 })
      return JSON.stringify({ labels: [...labels.data], gradients: res.gradients })
    }
    expect(digest()).toBe(digest())
  })

  it('leaves a below-cap image at full resolution (no downscale path)', () => {
    const w = 80
    const h = 40
    const { image, labels } = rampScene(w, h, 12)
    const capped = fitRegionGradients(image, structuredClone(labels), {
      minArea: 40,
      detectMaxDimension: 256,
    })
    const full = fitRegionGradients(image, structuredClone(labels), { minArea: 40 })
    expect([...capped.labels.data]).toEqual([...full.labels.data])
    expect(capped.gradients).toEqual(full.gradients)
  })
})
