import { describe, expect, it } from 'vitest'
import { createRaster, fillRaster, normalizeSettings, setPixel } from '@trazor/core'
import type { RasterImage, TraceStep, VectorizeSettings } from '@trazor/core'
import { vectorize } from '@trazor/engine'

/** A few flat color fields on white — exercises the color pipeline's palette/segment. */
function swatches(): RasterImage {
  const img = createRaster(64, 64)
  fillRaster(img, 255, 255, 255)
  const paint = (x0: number, y0: number, r: number, g: number, b: number): void => {
    for (let y = y0; y < y0 + 24; y++)
      for (let x = x0; x < x0 + 24; x++) setPixel(img, x, y, r, g, b)
  }
  paint(4, 4, 200, 40, 40)
  paint(36, 4, 40, 120, 200)
  paint(4, 36, 40, 170, 60)
  paint(36, 36, 230, 200, 40)
  return img
}

/** A black ring on white — a clean shape for bw / centerline. */
function ring(): RasterImage {
  const img = createRaster(48, 48)
  fillRaster(img, 255, 255, 255)
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 48; x++) {
      const d = Math.hypot(x + 0.5 - 24, y + 0.5 - 24)
      if (d < 18 && d > 9) setPixel(img, x, y, 10, 10, 10)
    }
  }
  return img
}

async function trace(img: RasterImage, settings: VectorizeSettings): Promise<TraceStep[]> {
  const steps: TraceStep[] = []
  await vectorize(img, settings, { onTrace: (s) => steps.push(s) })
  return steps
}

describe('engine tracer', () => {
  it('is side-effect-free: traced output is byte-identical to untraced', async () => {
    const cases: [string, RasterImage, VectorizeSettings][] = [
      ['color', swatches(), normalizeSettings({ mode: 'color', paletteSize: 6 })],
      [
        'cutout',
        swatches(),
        normalizeSettings({ mode: 'color', layering: 'cutout', paletteSize: 6 }),
      ],
      ['bw', ring(), normalizeSettings({ mode: 'bw' })],
      ['centerline', ring(), normalizeSettings({ mode: 'centerline' })],
    ]
    for (const [, img, settings] of cases) {
      const plain = await vectorize(img, settings)
      const steps: TraceStep[] = []
      const traced = await vectorize(img, settings, { onTrace: (s) => steps.push(s) })
      expect(traced.svg).toBe(plain.svg)
      expect(traced.stats.nodeCount).toBe(plain.stats.nodeCount)
      expect(steps.length).toBeGreaterThan(0)
    }
  })

  it('emits steps in order with monotonic index and non-negative durations', async () => {
    const steps = await trace(swatches(), normalizeSettings({ mode: 'color', paletteSize: 6 }))
    steps.forEach((s, i) => {
      expect(s.index).toBe(i)
      expect(s.endMs).toBeGreaterThanOrEqual(s.startMs)
      expect(s.label.length).toBeGreaterThan(0)
    })
    const codes = steps.map((s) => s.code)
    expect(codes).toContain('preprocess')
    expect(codes).toContain('segment')
    expect(codes).toContain('trace')
    expect(codes).toContain('serialize')
    // Preprocess precedes serialize.
    expect(codes.indexOf('preprocess')).toBeLessThan(codes.indexOf('serialize'))
  })

  it('preprocess step carries source + working rasters and a full luminance histogram', async () => {
    const img = swatches()
    const steps = await trace(img, normalizeSettings({ mode: 'color', paletteSize: 6 }))
    const pre = steps.find((s) => s.code === 'preprocess')
    expect(pre).toBeDefined()
    expect(pre?.rasters?.length).toBe(2)
    for (const r of pre?.rasters ?? []) {
      expect(r.kind).toBe('rgba')
      expect(r.data.length).toBe(r.width * r.height * 4)
    }
    const hist = pre?.charts?.find((c) => c.kind === 'histogram')
    expect(hist).toBeDefined()
    // Fully opaque image ⇒ every working pixel lands in a bin.
    const sum = hist!.values.reduce((a, b) => a + b, 0)
    expect(sum).toBe((pre!.metrics!.workWidth as number) * (pre!.metrics!.workHeight as number))
  })

  it('segment step carries a labels raster with a palette and population bars', async () => {
    const steps = await trace(swatches(), normalizeSettings({ mode: 'color', paletteSize: 6 }))
    const seg = steps.find((s) => s.code === 'segment')
    const raster = seg?.rasters?.find((r) => r.kind === 'labels')
    expect(raster).toBeDefined()
    expect(raster?.palette?.length).toBeGreaterThan(0)
    expect(raster?.data.length).toBe(raster!.width * raster!.height)
    const bars = seg?.charts?.find((c) => c.label === 'Palette population')
    expect(bars?.kind).toBe('bars')
    expect(bars?.colors?.length).toBe(bars?.values.length)
    expect(seg?.metrics?.colors).toBeGreaterThan(1)
  })

  it('streams stacked trace snapshots with a non-decreasing shape count', async () => {
    const steps = await trace(
      swatches(),
      normalizeSettings({ mode: 'color', layering: 'stacked', paletteSize: 6 }),
    )
    const traceSteps = steps.filter((s) => s.code === 'trace')
    // Intermediate snapshots as the shapes build up, plus the final summary.
    expect(traceSteps.length).toBeGreaterThan(1)
    const counts = traceSteps.map((s) => (s.metrics?.shapes as number) ?? 0)
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1])
    }
    // The final summary counts every shape the run produced.
    expect(counts[counts.length - 1]).toBeGreaterThan(0)
  })

  it('bw traces a threshold mask; centerline adds a skeleton', async () => {
    const bw = await trace(ring(), normalizeSettings({ mode: 'bw' }))
    const thr = bw.find((s) => s.code === 'threshold')
    expect(thr?.rasters?.[0]?.kind).toBe('mask')
    expect(thr?.metrics?.blackFraction).toBeGreaterThan(0)
    expect(bw.some((s) => s.code === 'thin')).toBe(false)

    const cl = await trace(ring(), normalizeSettings({ mode: 'centerline' }))
    const thin = cl.find((s) => s.code === 'thin')
    expect(thin?.rasters?.[0]?.kind).toBe('mask')
    expect(thin?.metrics?.strokePixels).toBeGreaterThan(0)
  })
})
