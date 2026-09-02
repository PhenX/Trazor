import { describe, expect, it } from 'vitest'
import { CancelledError, createRaster, fillRaster, normalizeSettings, setPixel } from '@trazor/core'
import type { RasterImage, VectorizeSettings } from '@trazor/core'
import { vectorize } from '@trazor/engine'
import type { StageCache, StageCacheStats } from '@trazor/engine'

function settings(patch: Partial<VectorizeSettings>): VectorizeSettings {
  return normalizeSettings({ maxDimension: 0, minRegionArea: 2, ...patch })
}

/**
 * A colorful scene whose background color also fills a pocket ringed by the
 * smallest color, so stacked layering lifts that pocket onto its own island
 * layer — the layer set the cache has to reproduce is more than one per color.
 */
function scene(): RasterImage {
  const img = createRaster(64, 64)
  fillRaster(img, 250, 248, 240)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const d = Math.hypot(x + 0.5 - 26, y + 0.5 - 30)
      if (d < 18) setPixel(img, x, y, 210, 60, 50)
      if (d < 11 && d > 7) setPixel(img, x, y, 40, 110, 190)
      if (d < 7) setPixel(img, x, y, 250, 248, 240)
      if (x < 14 && y < 14) setPixel(img, x, y, 240, 200, 60)
    }
  }
  return img
}

/** Ink art with a hole and a few specks — enough boundary work for bw mode. */
function inkArt(): RasterImage {
  const img = createRaster(64, 64)
  fillRaster(img, 255, 255, 255)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32)
      if (d < 24 && d > 10) setPixel(img, x, y, 15, 15, 15)
      if (x > 4 && x < 12 && y > 50 && y < 58) setPixel(img, x, y, 20, 20, 20)
    }
  }
  return img
}

const run = (
  img: RasterImage,
  s: Partial<VectorizeSettings>,
  cache?: StageCache,
  imageId = 1,
): ReturnType<typeof vectorize> =>
  vectorize(img, settings(s), undefined, cache ? { imageId, cache } : undefined)

const stats = (cache: StageCache): StageCacheStats => cache.stats as StageCacheStats

describe('ring cache', () => {
  const modes: {
    name: string
    image: () => RasterImage
    base: Partial<VectorizeSettings>
  }[] = [
    { name: 'color stacked', image: scene, base: { mode: 'color', paletteSize: 6 } },
    {
      name: 'color cutout',
      image: scene,
      base: { mode: 'color', paletteSize: 6, layering: 'cutout' },
    },
    { name: 'bw', image: inkArt, base: { mode: 'bw' } },
    { name: 'grayscale', image: scene, base: { mode: 'grayscale', paletteSize: 5 } },
  ]

  for (const { name, image, base } of modes) {
    it(`re-fits ${name} from the cache byte-identically to a fresh run`, async () => {
      const img = image()
      const cache: StageCache = {}
      await run(img, { ...base, smoothing: 0.5 }, cache)
      const tweaked = { ...base, smoothing: 0.9, optTolerance: 0.4, cornerThreshold: 120 }
      const warm = await run(img, tweaked, cache)
      const fresh = await run(img, tweaked)
      expect(warm.svg).toBe(fresh.svg)
      expect(warm.palette).toEqual(fresh.palette)
      // Re-fitting must not consume or mutate what it reused.
      expect((await run(img, tweaked, cache)).svg).toBe(fresh.svg)
    })
  }

  it('hits the ring cache on a curve-only change and misses on a turn policy change', async () => {
    const img = scene()
    const cache: StageCache = {}
    const base = { mode: 'color' as const, paletteSize: 6 }
    await run(img, { ...base, smoothing: 0.4 }, cache)
    expect(stats(cache).ringMisses).toBe(1)

    const warm = await run(img, { ...base, smoothing: 0.8 }, cache)
    expect(stats(cache).ringHits).toBe(1)
    expect(warm.svg).toBe((await run(img, { ...base, smoothing: 0.8 })).svg)

    // The turn policy resolves saddle junctions during decomposition, so the
    // rings themselves change.
    const turned = await run(img, { ...base, smoothing: 0.8, turnPolicy: 'black' }, cache)
    expect(stats(cache).ringHits).toBe(1)
    expect(stats(cache).ringMisses).toBe(2)
    expect(turned.svg).toBe((await run(img, { ...base, smoothing: 0.8, turnPolicy: 'black' })).svg)
  })

  it('misses the ring cache when the speck floor changes', async () => {
    const img = scene()
    const cache: StageCache = {}
    const base = { mode: 'color' as const, paletteSize: 6 }
    await run(img, { ...base, minRegionArea: 2 }, cache)
    const bigger = await run(img, { ...base, minRegionArea: 24 }, cache)
    expect(stats(cache).ringHits).toBe(0)
    expect(stats(cache).ringMisses).toBe(2)
    expect(bigger.svg).toBe((await run(img, { ...base, minRegionArea: 24 })).svg)
  })

  it('keeps stacked rings across a cutout run on the same palette', async () => {
    const img = scene()
    const cache: StageCache = {}
    const base = { mode: 'color' as const, paletteSize: 6 }
    await run(img, base, cache)
    const cut = await run(img, { ...base, layering: 'cutout' }, cache)
    expect(cut.svg).toBe((await run(img, { ...base, layering: 'cutout' })).svg)
    // Cutout traces the shared boundary graph and never consults the rings.
    expect(stats(cache).ringHits).toBe(0)
    const back = await run(img, { ...base, smoothing: 0.9 }, cache)
    expect(stats(cache).ringHits).toBe(1)
    expect(back.svg).toBe((await run(img, { ...base, smoothing: 0.9 })).svg)
  })

  it('keeps one ring set at a time, so an older warm palette re-decomposes', async () => {
    const img = scene()
    const cache: StageCache = {}
    const base = { mode: 'color' as const }
    await run(img, { ...base, paletteSize: 4 }, cache)
    await run(img, { ...base, paletteSize: 8 }, cache)
    const back = await run(img, { ...base, paletteSize: 4, smoothing: 0.9 }, cache)
    // The first palette is still in the LRU, but its rings were released.
    expect(stats(cache).palHits).toBe(1)
    expect(stats(cache).ringHits).toBe(0)
    expect(back.svg).toBe((await run(img, { ...base, paletteSize: 4, smoothing: 0.9 })).svg)
  })

  it('reuses the bw mask, coverage field and rings on a curve-only change', async () => {
    const img = inkArt()
    const cache: StageCache = {}
    await run(img, { mode: 'bw', smoothing: 0.3 }, cache)
    expect(stats(cache).inkMisses).toBe(1)
    expect(stats(cache).ringMisses).toBe(1)

    const warm = await run(img, { mode: 'bw', smoothing: 0.9 }, cache)
    expect(stats(cache).inkHits).toBe(1)
    expect(stats(cache).ringHits).toBe(1)
    expect(warm.svg).toBe((await run(img, { mode: 'bw', smoothing: 0.9 })).svg)

    // A threshold change rebuilds the mask, and with it the rings.
    const inverted = await run(img, { mode: 'bw', smoothing: 0.9, invert: true }, cache)
    expect(stats(cache).inkMisses).toBe(2)
    expect(stats(cache).ringMisses).toBe(2)
    expect(inverted.svg).toBe((await run(img, { mode: 'bw', smoothing: 0.9, invert: true })).svg)
  })

  it('drops the ink entry when the preprocess key changes', async () => {
    const img = inkArt()
    const cache: StageCache = {}
    await run(img, { mode: 'bw' }, cache)
    const blurred = await run(img, { mode: 'bw', blurRadius: 2 }, cache)
    expect(stats(cache).inkHits).toBe(0)
    expect(blurred.svg).toBe((await run(img, { mode: 'bw', blurRadius: 2 })).svg)
  })

  it('cancels cooperatively on the warm path', async () => {
    const img = scene()
    const cache: StageCache = {}
    const base = { mode: 'color' as const, paletteSize: 6 }
    await run(img, base, cache)
    // Cancel once the warm trace stage has painted its first layers, so the
    // request lands between two cached layers rather than before the run.
    let inTrace = false
    await expect(
      vectorize(
        img,
        settings({ ...base, smoothing: 0.9 }),
        {
          onProgress: (stage) => {
            if (stage === 'trace') inTrace = true
          },
          shouldCancel: () => inTrace,
        },
        { imageId: 1, cache },
      ),
    ).rejects.toThrow(CancelledError)
    expect(stats(cache).ringHits).toBe(1)
  })
})
