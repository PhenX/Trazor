import { describe, expect, it } from 'vitest'
import {
  CancelledError,
  DEFAULT_SETTINGS,
  createRaster,
  fillRaster,
  normalizeSettings,
  setPixel,
} from '@vectorizer/core'
import type { RasterImage, VectorizeSettings } from '@vectorizer/core'
import { vectorize } from '@vectorizer/engine'

function redSquareOnWhite(): RasterImage {
  const img = createRaster(60, 60)
  fillRaster(img, 255, 255, 255)
  for (let y = 15; y < 45; y++) {
    for (let x = 15; x < 45; x++) setPixel(img, x, y, 210, 30, 40)
  }
  return img
}

function donut(): RasterImage {
  const img = createRaster(50, 50)
  fillRaster(img, 255, 255, 255)
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const d = Math.hypot(x + 0.5 - 25, y + 0.5 - 25)
      if (d < 20 && d > 8) setPixel(img, x, y, 10, 10, 10)
    }
  }
  return img
}

function thickPlus(): RasterImage {
  const img = createRaster(60, 60)
  fillRaster(img, 255, 255, 255)
  for (let y = 0; y < 60; y++) {
    for (let x = 0; x < 60; x++) {
      if ((y > 27 && y < 33 && x > 6 && x < 54) || (x > 27 && x < 33 && y > 6 && y < 54)) {
        setPixel(img, x, y, 0, 0, 0)
      }
    }
  }
  return img
}

function settings(patch: Partial<VectorizeSettings>): VectorizeSettings {
  return normalizeSettings({ maxDimension: 0, minRegionArea: 2, ...patch })
}

describe('native engine pipeline', () => {
  it('vectorizes a flat two-color image in stacked color mode', async () => {
    const result = await vectorize(redSquareOnWhite(), settings({ mode: 'color', paletteSize: 4 }))
    expect(result.svg).toContain('<svg')
    expect(result.width).toBe(60)
    expect(result.height).toBe(60)
    expect(result.palette.length).toBe(2)
    expect(result.stats.pathCount).toBeGreaterThanOrEqual(2)
    expect(result.stats.nodeCount).toBeGreaterThan(0)
    expect(result.warnings.filter((w) => w.code === 'empty-result')).toHaveLength(0)
    // The red square must be present as a red-ish fill.
    expect(result.svg).toMatch(/fill="#[a-f0-9]{6}"/)
  })

  it('produces a seam-free cutout with shared boundaries', async () => {
    const result = await vectorize(
      redSquareOnWhite(),
      settings({ mode: 'color', paletteSize: 4, layering: 'cutout', gapFill: 0 }),
    )
    expect(result.palette.length).toBe(2)
    expect(result.stats.pathCount).toBe(2)
  })

  it('is deterministic', async () => {
    const s = settings({ mode: 'color', paletteSize: 6 })
    const a = await vectorize(redSquareOnWhite(), s)
    const b = await vectorize(redSquareOnWhite(), s)
    expect(a.svg).toBe(b.svg)
  })

  it('optimizeSvg compacts path data without changing the geometry', async () => {
    const plain = await vectorize(thickPlus(), settings({ mode: 'bw', optimizeSvg: false }))
    const optimized = await vectorize(thickPlus(), settings({ mode: 'bw', optimizeSvg: true }))
    // Same shapes; never more nodes or bytes (cleanup/primitives may drop some).
    expect(optimized.stats.pathCount).toBe(plain.stats.pathCount)
    expect(optimized.stats.nodeCount).toBeLessThanOrEqual(plain.stats.nodeCount)
    expect(optimized.stats.byteLength).toBeLessThanOrEqual(plain.stats.byteLength)
    // The axis-aligned plus engages H/V shorthands the absolute encoding lacks.
    expect(/d="[^"]*[HV]/.test(optimized.svg)).toBe(true)
    expect(/d="[^"]*[HV]/.test(plain.svg)).toBe(false)
    // On by default.
    const byDefault = await vectorize(thickPlus(), settings({ mode: 'bw' }))
    expect(byDefault.svg).toBe(optimized.svg)
  })

  it('preserveDetails keeps a small high-contrast dot the flat filter removes', async () => {
    const dotImage = (): RasterImage => {
      const img = createRaster(40, 40)
      fillRaster(img, 255, 255, 255)
      for (let y = 5; y < 35; y++) {
        for (let x = 5; x < 35; x++) setPixel(img, x, y, 180, 180, 180)
      }
      // A 2×2 black dot (4 px) — below minRegionArea, but maximal contrast.
      for (let y = 19; y < 21; y++) {
        for (let x = 19; x < 21; x++) setPixel(img, x, y, 0, 0, 0)
      }
      return img
    }
    const base = { mode: 'color' as const, paletteSize: 4, minRegionArea: 6 }
    const flat = await vectorize(dotImage(), settings({ ...base, preserveDetails: false }))
    const kept = await vectorize(dotImage(), settings({ ...base, preserveDetails: true }))
    expect(kept.stats.pathCount).toBeGreaterThan(flat.stats.pathCount)
    const veryDark = (p: string[]): boolean =>
      p.some((h) => Number.parseInt(h.slice(1, 7), 16) < 0x20_20_20)
    expect(veryDark(kept.palette)).toBe(true)
    expect(veryDark(flat.palette)).toBe(false)
  })

  it('warns about stencil islands on a donut in bw mode', async () => {
    const result = await vectorize(
      donut(),
      settings({ mode: 'bw', detectIslands: true, thresholdMode: 'auto' }),
    )
    expect(result.stats.pathCount).toBe(1)
    const island = result.warnings.find((w) => w.code === 'stencil-islands')
    expect(island).toBeDefined()
  })

  it('extracts centerline strokes with an estimated width', async () => {
    const result = await vectorize(thickPlus(), settings({ mode: 'centerline', pruneLength: 6 }))
    expect(result.svg).toContain('stroke=')
    expect(result.svg).toContain('stroke-linecap="round"')
    const width = /stroke-width="([\d.]+)"/.exec(result.svg)
    expect(width).not.toBeNull()
    const w = Number(width![1])
    expect(w).toBeGreaterThan(2.5)
    expect(w).toBeLessThan(9)
  })

  it('desaturates in grayscale mode', async () => {
    const result = await vectorize(
      redSquareOnWhite(),
      settings({ mode: 'grayscale', paletteSize: 4 }),
    )
    for (const hex of result.palette) {
      const r = Number.parseInt(hex.slice(1, 3), 16)
      const g = Number.parseInt(hex.slice(3, 5), 16)
      const b = Number.parseInt(hex.slice(5, 7), 16)
      expect(Math.max(Math.abs(r - g), Math.abs(g - b))).toBeLessThanOrEqual(2)
    }
  })

  it('excludes transparent pixels under background auto', async () => {
    const img = createRaster(40, 40)
    for (let y = 10; y < 30; y++) {
      for (let x = 10; x < 30; x++) setPixel(img, x, y, 40, 120, 220)
    }
    const result = await vectorize(img, settings({ mode: 'color', paletteSize: 4 }))
    expect(result.palette).toHaveLength(1)
    expect(result.stats.pathCount).toBe(1)
  })

  it('drops the background layer when omitBackground is set', async () => {
    const result = await vectorize(
      redSquareOnWhite(),
      settings({ mode: 'color', paletteSize: 4, omitBackground: true }),
    )
    expect(result.palette).toHaveLength(1)
  })

  it('honors a fixed palette', async () => {
    const result = await vectorize(
      redSquareOnWhite(),
      settings({ mode: 'color', palette: ['#ff0000', '#ffffff'] }),
    )
    expect(result.palette).toContain('#ff0000')
    expect(result.palette).toContain('#ffffff')
  })

  it('downscales to maxDimension', async () => {
    const big = createRaster(200, 100)
    fillRaster(big, 250, 250, 250)
    for (let y = 20; y < 80; y++) {
      for (let x = 40; x < 160; x++) setPixel(big, x, y, 30, 30, 30)
    }
    const result = await vectorize(big, settings({ maxDimension: 100 }))
    expect(result.width).toBe(100)
    expect(result.height).toBe(50)
  })

  it('emits mm units with physical size warnings for tiny features', async () => {
    const img = createRaster(200, 200)
    fillRaster(img, 255, 255, 255)
    for (let y = 100; y < 103; y++) {
      for (let x = 100; x < 103; x++) setPixel(img, x, y, 0, 0, 0)
    }
    const result = await vectorize(
      img,
      settings({ mode: 'bw', unit: 'mm', widthMm: 100, minRegionArea: 1 }),
    )
    expect(result.svg).toContain('mm"')
    expect(result.warnings.some((w) => w.code === 'tiny-features')).toBe(true)
  })

  it('cancels cooperatively', async () => {
    await expect(
      vectorize(redSquareOnWhite(), settings({ mode: 'color' }), { shouldCancel: () => true }),
    ).rejects.toThrow(CancelledError)
  })

  it('reports monotonic progress across stages', async () => {
    const seen: number[] = []
    await vectorize(redSquareOnWhite(), settings({ mode: 'color' }), {
      onProgress: (_stage, overall) => seen.push(overall),
    })
    expect(seen.length).toBeGreaterThan(3)
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1] - 1e-9)
    }
    expect(seen[seen.length - 1]).toBeLessThanOrEqual(1)
  })

  it('keeps default settings intact (normalizeSettings copies)', async () => {
    const before = JSON.stringify(DEFAULT_SETTINGS)
    await vectorize(redSquareOnWhite(), settings({ mode: 'color' }))
    expect(JSON.stringify(DEFAULT_SETTINGS)).toBe(before)
  })

  it('an edge hint protects a small bw feature the size filter would drop', async () => {
    const speckImage = (): RasterImage => {
      const img = createRaster(60, 60)
      fillRaster(img, 255, 255, 255)
      for (let y = 15; y < 45; y++) {
        for (let x = 15; x < 45; x++) setPixel(img, x, y, 0, 0, 0)
      }
      setPixel(img, 5, 5, 0, 0, 0) // 1px speck, below minRegionArea
      return img
    }
    const s = settings({ mode: 'bw', minRegionArea: 2, thresholdMode: 'auto' })
    const none = await vectorize(speckImage(), s)
    const hint = { width: 60, height: 60, data: new Float32Array(60 * 60) }
    hint.data[5 * 60 + 5] = 1 // mark the speck as a real boundary
    const withHint = await vectorize(speckImage(), s, { edgeHint: hint })
    expect(withHint.stats.pathCount).toBe(none.stats.pathCount + 1)
    // Same hint ⇒ identical output.
    const again = await vectorize(speckImage(), s, { edgeHint: hint })
    expect(again.svg).toBe(withHint.svg)
  })

  it('an edge hint protects a small color region the merge would drop', async () => {
    const dotImage = (): RasterImage => {
      const img = createRaster(40, 40)
      fillRaster(img, 255, 255, 255)
      for (let y = 5; y < 35; y++) {
        for (let x = 5; x < 35; x++) setPixel(img, x, y, 180, 180, 180)
      }
      // A 2×2 black dot (4 px) — below minRegionArea, maximal contrast.
      for (let y = 19; y < 21; y++) {
        for (let x = 19; x < 21; x++) setPixel(img, x, y, 0, 0, 0)
      }
      return img
    }
    const s = settings({ mode: 'color', paletteSize: 4, minRegionArea: 6 })
    const none = await vectorize(dotImage(), s)
    const hint = { width: 40, height: 40, data: new Float32Array(40 * 40) }
    for (let y = 19; y < 21; y++) {
      for (let x = 19; x < 21; x++) hint.data[y * 40 + x] = 1 // mark the dot as a boundary
    }
    const withHint = await vectorize(dotImage(), s, { edgeHint: hint })
    expect(withHint.stats.pathCount).toBeGreaterThan(none.stats.pathCount)
    const veryDark = (p: string[]): boolean =>
      p.some((h) => Number.parseInt(h.slice(1, 7), 16) < 0x20_20_20)
    expect(veryDark(withHint.palette)).toBe(true)
    expect(veryDark(none.palette)).toBe(false)
    // Same hint ⇒ identical output.
    const again = await vectorize(dotImage(), s, { edgeHint: hint })
    expect(again.svg).toBe(withHint.svg)
  })
})

describe('worker protocol', () => {
  it('round-trips vectorize and cancel through a fake scope', async () => {
    const { installWorkerHandler } = await import('@vectorizer/engine')
    type Listener = (ev: { data: unknown }) => void
    let listener: Listener | null = null
    const outbox: unknown[] = []
    const scope = {
      addEventListener: (_type: 'message', fn: Listener) => {
        listener = fn
      },
      postMessage: (msg: unknown) => {
        outbox.push(msg)
      },
    }
    installWorkerHandler(scope)
    expect(listener).not.toBeNull()

    const img = redSquareOnWhite()
    listener!({
      data: {
        type: 'vectorize',
        id: 1,
        width: img.width,
        height: img.height,
        buffer: img.data.slice().buffer,
        settings: settings({ mode: 'color', paletteSize: 4 }),
      },
    })
    // Wait for the async pipeline to finish.
    await new Promise((resolve) => setTimeout(resolve, 500))
    const result = outbox.find((m) => (m as { type: string; id: number }).type === 'result') as
      | { result: { svg: string } }
      | undefined
    expect(result).toBeDefined()
    expect(result!.result.svg).toContain('<svg')
    const progress = outbox.filter((m) => (m as { type: string }).type === 'progress')
    expect(progress.length).toBeGreaterThan(0)
  })

  it('accepts an optional edge hint through the worker message', async () => {
    const { installWorkerHandler } = await import('@vectorizer/engine')
    type Listener = (ev: { data: unknown }) => void
    let listener: Listener | null = null
    const outbox: unknown[] = []
    const scope = {
      addEventListener: (_type: 'message', fn: Listener) => {
        listener = fn
      },
      postMessage: (msg: unknown) => {
        outbox.push(msg)
      },
    }
    installWorkerHandler(scope)

    const img = redSquareOnWhite()
    listener!({
      data: {
        type: 'vectorize',
        id: 7,
        width: img.width,
        height: img.height,
        buffer: img.data.slice().buffer,
        settings: settings({ mode: 'bw', thresholdMode: 'auto' }),
        edgeHint: new Float32Array(img.width * img.height).buffer,
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 500))
    const result = outbox.find((m) => (m as { type: string }).type === 'result')
    expect(result).toBeDefined()
  })
})
