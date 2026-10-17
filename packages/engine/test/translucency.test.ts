import { describe, expect, it } from 'vitest'
import { createRaster, fillRaster, normalizeSettings, setPixel } from '@trazor/core'
import type { RasterImage, VectorizeSettings } from '@trazor/core'
import { vectorize } from '@trazor/engine'

function settings(patch: Partial<VectorizeSettings>): VectorizeSettings {
  return normalizeSettings({
    maxDimension: 0,
    minRegionArea: 2,
    background: 'transparent',
    alphaThreshold: 128,
    mode: 'color',
    paletteSize: 4,
    ...patch,
  })
}

/** A translucent blue panel (alpha 115) beside an opaque red disk on a clear canvas. */
function translucentScene(): RasterImage {
  const img = createRaster(72, 72)
  fillRaster(img, 0, 0, 0, 0)
  for (let y = 0; y < 72; y++) {
    for (let x = 0; x < 72; x++) {
      if (Math.hypot(x + 0.5 - 20, y + 0.5 - 36) < 14) setPixel(img, x, y, 210, 60, 50, 255)
      if (x >= 34 && x < 66 && y >= 12 && y < 60) setPixel(img, x, y, 40, 120, 200, 115)
    }
  }
  return img
}

/** A fully opaque disk with an anti-aliased rim on a clear canvas — no translucent interior. */
function rimScene(): RasterImage {
  const img = createRaster(72, 72)
  fillRaster(img, 0, 0, 0, 0)
  for (let y = 0; y < 72; y++) {
    for (let x = 0; x < 72; x++) {
      let covered = 0
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          if (Math.hypot(x + (sx + 0.5) / 4 - 36, y + (sy + 0.5) / 4 - 36) < 26) covered++
        }
      }
      if (covered > 0) setPixel(img, x, y, 40, 110, 190, Math.round((covered * 255) / 16))
    }
  }
  return img
}

/** Every `<path>`/`<circle>`/`<rect>`… fill and fill-opacity in the document. */
function fills(svg: string): { fill: string; opacity: number | null }[] {
  return [...svg.matchAll(/<(?:path|circle|ellipse|rect|polygon)\b[^>]*>/g)].map((m) => ({
    fill: /\bfill="([^"]*)"/.exec(m[0])?.[1] ?? '',
    opacity: /\bfill-opacity="([^"]*)"/.exec(m[0])
      ? Number(/\bfill-opacity="([^"]*)"/.exec(m[0])?.[1])
      : null,
  }))
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

describe('translucent faces', () => {
  it('emits the translucent panel as a cutout face painted its ink at its alpha', async () => {
    const result = await vectorize(translucentScene(), settings({ layering: 'cutout' }))
    const translucent = fills(result.svg).filter((f) => f.opacity !== null)
    expect(translucent.length).toBeGreaterThan(0)
    // Alpha 115/255 ≈ 0.451.
    for (const f of translucent) {
      expect(f.opacity).toBeGreaterThan(0.4)
      expect(f.opacity).toBeLessThan(0.5)
    }
    // The face carries the ink color (a saturated blue) — not the light,
    // near-white color the source composites to over white.
    const inks = translucent.map((f) => hexToRgb(f.fill))
    expect(inks.some(([r, , b]) => b > r + 40 && b > 150 && r < 120)).toBe(true)
  })

  it('keeps stacked translucent labels an opaque flat fill (compositing is a later pass)', async () => {
    // A stacked face would composite over the sheets below it, not white, so it
    // stays a flat composited fill until a later session emits the faces beneath.
    const result = await vectorize(translucentScene(), settings({ layering: 'stacked' }))
    expect(result.svg).not.toContain('fill-opacity')
    // The panel still survives the half-coverage cut as its own region.
    expect(fills(result.svg).length).toBeGreaterThan(1)
  })

  it('leaves a fully opaque anti-aliased shape without any fill opacity', async () => {
    const result = await vectorize(rimScene(), settings({ layering: 'cutout', paletteSize: 3 }))
    expect(fills(result.svg).every((f) => f.opacity === null)).toBe(true)
    expect(result.svg).not.toContain('fill-opacity')
  })

  it('is deterministic', async () => {
    const s = settings({ layering: 'cutout' })
    const a = await vectorize(translucentScene(), s)
    const b = await vectorize(translucentScene(), s)
    expect(a.svg).toBe(b.svg)
  })

  it('carries the fill opacity onto the structured document', async () => {
    const result = await vectorize(
      translucentScene(),
      settings({ layering: 'cutout' }),
      undefined,
      {
        withDocument: true,
      },
    )
    const shapes = result.document?.shapes ?? []
    expect(shapes.some((s) => s.fillOpacity !== undefined && s.fillOpacity < 1)).toBe(true)
  })
})
