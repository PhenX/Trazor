import { mkdirSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createRaster, fillRaster, normalizeSettings, setPixel } from '@vectorizer/core'
import { vectorize } from '@vectorizer/engine'

const OUT = '/home/user/Vectorizer/e2e-artifacts'

function scene() {
  // Flat-art scene: sky, sun, hill, tree trunk + crown, all hard-edged.
  const w = 320,
    h = 240
  const img = createRaster(w, h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let c: [number, number, number] = [92, 158, 224] // sky
      const hill = 170 + 40 * Math.sin(x / 60)
      if (Math.hypot(x - 240, y - 60) < 34) c = [250, 200, 60] // sun
      if (y > hill) c = [70, 160, 90] // hill
      if (x > 70 && x < 86 && y > 120 && y < 190) c = [110, 76, 48] // trunk
      if (Math.hypot(x - 78, y - 104) < 36) c = [40, 120, 60] // crown
      setPixel(img, x, y, c[0], c[1], c[2])
    }
  return img
}

function handwriting() {
  // Thick pen strokes: a wave + a loop crossing it.
  const img = createRaster(320, 160)
  fillRaster(img, 255, 255, 255)
  const ink = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) {
          const px = Math.round(x + dx),
            py = Math.round(y + dy)
          if (px >= 0 && px < 320 && py >= 0 && py < 160) setPixel(img, px, py, 20, 20, 30)
        }
      }
  }
  for (let t = 0; t <= 1; t += 0.002) {
    ink(20 + t * 280, 80 + 40 * Math.sin(t * 6.28318 * 1.5), 3)
  }
  for (let t = 0; t <= 1; t += 0.002) {
    const a = t * 6.28318
    ink(160 + 50 * Math.cos(a), 80 + 50 * Math.sin(a), 3)
  }
  return img
}

// Artifact generator, opt-in: SHOWCASE=1 npx vitest run packages/engine/test/showcase.test.ts
describe.skipIf(!process.env.SHOWCASE)('showcase artifacts', () => {
  it('writes cutout + stacked + centerline SVGs', async () => {
    mkdirSync(OUT, { recursive: true })
    const img = scene()
    const cutout = await vectorize(
      img,
      normalizeSettings({
        mode: 'color',
        paletteSize: 8,
        autoPaletteSize: true,
        layering: 'cutout',
        maxDimension: 0,
        minRegionArea: 6,
      }),
    )
    writeFileSync(`${OUT}/scene-cutout.svg`, cutout.svg)
    const stacked = await vectorize(
      img,
      normalizeSettings({
        mode: 'color',
        paletteSize: 8,
        autoPaletteSize: true,
        layering: 'stacked',
        maxDimension: 0,
        minRegionArea: 6,
      }),
    )
    writeFileSync(`${OUT}/scene-stacked.svg`, stacked.svg)
    const center = await vectorize(
      handwriting(),
      normalizeSettings({
        mode: 'centerline',
        maxDimension: 0,
        pruneLength: 8,
      }),
    )
    writeFileSync(`${OUT}/strokes-centerline.svg`, center.svg)
    const bw = await vectorize(
      handwriting(),
      normalizeSettings({
        mode: 'bw',
        maxDimension: 0,
      }),
    )
    writeFileSync(`${OUT}/strokes-bw.svg`, bw.svg)
    expect(cutout.stats.pathCount).toBeGreaterThanOrEqual(4)
    expect(stacked.stats.pathCount).toBeGreaterThanOrEqual(4)
    expect(center.stats.pathCount).toBeGreaterThanOrEqual(2)
    expect(bw.svg).toContain('<path')
    console.log(
      'cutout',
      cutout.stats.pathCount,
      'paths',
      cutout.stats.nodeCount,
      'nodes;',
      'stacked',
      stacked.stats.pathCount,
      'paths;',
      'centerline',
      center.stats.pathCount,
      'strokes',
      center.stats.nodeCount,
      'nodes',
    )
  })
})
