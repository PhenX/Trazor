import { describe, expect, it } from 'vitest'
import { normalizeSettings } from '@trazor/core'
import type { RasterImage, VectorizeSettings } from '@trazor/core'
import { vectorize } from '@trazor/engine'
import type { StageCache } from '@trazor/engine'

/** A soft-edged disc and a ramp band on a flat ground: art both chains and both front ends read differently. */
function art(): RasterImage {
  const w = 64
  const h = 48
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x + 0.5 - 22, y + 0.5 - 22) - 13
      const t = Math.min(1, Math.max(0, 0.5 - d))
      let c = [245, 240, 230]
      if (y >= 38) {
        const s = x / (w - 1)
        c = [Math.round(40 + 180 * s), Math.round(90 + 60 * s), Math.round(200 - 150 * s)]
      }
      const disc = [200, 40, 50]
      data.set([...c.map((v, i) => Math.round(v + (disc[i] - v) * t)), 255], 4 * (y * w + x))
    }
  return { width: w, height: h, data }
}

const settings = (patch: Partial<VectorizeSettings>): VectorizeSettings =>
  normalizeSettings({ mode: 'color', paletteSize: 8, gradients: true, ...patch })

describe('the geometry chain from the settings', () => {
  const img = art()

  it('traces with the chain and front end the settings name, as the run options do', async () => {
    const fromSettings = await vectorize(img, settings({ geometry: 'planar', frontEnd: 'ink' }))
    const fromOptions = await vectorize(img, settings({}), undefined, {
      geometry: 'planar',
      frontEnd: 'ink',
    })
    const classic = await vectorize(img, settings({}))
    expect(fromSettings.svg).toBe(fromOptions.svg)
    expect(fromSettings.svg).not.toBe(classic.svg)
    const planarClassic = await vectorize(img, settings({ geometry: 'planar' }))
    expect(planarClassic.svg).not.toBe(fromSettings.svg)
  })

  it('lets the run options override the settings', async () => {
    const planar = settings({ geometry: 'planar', frontEnd: 'ink' })
    const overridden = await vectorize(img, planar, undefined, { geometry: 'classic' })
    const classic = await vectorize(img, settings({}))
    expect(overridden.svg).toBe(classic.svg)
    const frontOverride = await vectorize(img, planar, undefined, { frontEnd: 'classic' })
    const planarClassic = await vectorize(img, settings({ geometry: 'planar' }))
    expect(frontOverride.svg).toBe(planarClassic.svg)
  })

  it('ignores the front end on the classic chain', async () => {
    const ink = await vectorize(img, settings({ frontEnd: 'ink' }))
    const classic = await vectorize(img, settings({}))
    expect(ink.svg).toBe(classic.svg)
  })

  it('keys the stage cache by the chain and its front end', async () => {
    const cache: StageCache = {}
    const run = (patch: Partial<VectorizeSettings>) =>
      vectorize(img, settings(patch), undefined, { cache, imageId: 1 })
    const fresh = (patch: Partial<VectorizeSettings>) => vectorize(img, settings(patch))
    for (const patch of [
      {},
      { geometry: 'planar' as const },
      { geometry: 'planar' as const, frontEnd: 'ink' as const },
      {},
    ]) {
      expect((await run(patch)).svg).toBe((await fresh(patch)).svg)
    }
  })
})
