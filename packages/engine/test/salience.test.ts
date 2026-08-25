import { describe, expect, it } from 'vitest'
import { createRaster, fillRaster, normalizeSettings, setPixel } from '@trazor/core'
import type { RasterImage, VectorizeSettings } from '@trazor/core'
import { vectorize } from '@trazor/engine'
import { analyzeSvg } from '@trazor/svg'

/**
 * Color scene: white background, a big mid-gray disc (kept by size alone), a
 * 1px light-gray stroke (low Oklab contrast, but a strong RGB edge — the case
 * `preserveSalient` exists for), and a near-white speck below the salience
 * threshold (must still merge away).
 */
function colorScene(): RasterImage {
  const w = 64
  const h = 32
  const img = createRaster(w, h)
  fillRaster(img, 255, 255, 255)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((x - 16.5) ** 2 + (y - 16.5) ** 2 <= 10 * 10) setPixel(img, x, y, 127, 127, 127)
    }
  }
  for (let y = 0; y < h; y++) setPixel(img, 40, y, 240, 240, 240)
  setPixel(img, 50, 16, 246, 246, 246)
  return img
}

/**
 * Ink scene: a 4px dark bar (kept by size) plus a 1px hairline of the same
 * darkness, on white — the hairline is what a plain despeckle drops.
 */
function inkScene(): RasterImage {
  const w = 48
  const h = 24
  const img = createRaster(w, h)
  fillRaster(img, 255, 255, 255)
  for (let y = 0; y < h; y++) {
    for (let x = 4; x < 8; x++) setPixel(img, x, y, 30, 30, 30)
  }
  for (let y = 0; y < h; y++) setPixel(img, 20, y, 90, 90, 90)
  return img
}

function colorSettings(preserveSalient: boolean): VectorizeSettings {
  return normalizeSettings({
    mode: 'color',
    maxDimension: 0,
    segmentation: 'quantize',
    palette: ['#ffffff', '#7f7f7f', '#f0f0f0'],
    layering: 'stacked',
    minRegionArea: 100,
    preserveDetails: false,
    preserveSalient,
    dissolveBands: 0,
    colorCoherence: 0,
    curveMode: 'polygon',
    curveOptimize: false,
    optimizeSvg: false,
    precision: 3,
  })
}

function inkSettings(preserveSalient: boolean): VectorizeSettings {
  return normalizeSettings({
    mode: 'bw',
    maxDimension: 0,
    thresholdMode: 'fixed',
    threshold: 128,
    minRegionArea: 30,
    preserveSalient,
    // Exact rectilinear lattice paths — the sub-pixel field would move the
    // traced edge inward from the integer column, blurring the assertion.
    curveMode: 'pixel',
    curveOptimize: false,
    optimizeSvg: false,
    precision: 3,
  })
}

/** Max x-coordinate over every path's M/L coordinate pairs. */
function maxX(svg: string): number {
  let max = -Infinity
  for (const m of svg.matchAll(/\sd="([^"]+)"/g)) {
    const nums = (m[1].match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
    for (let i = 0; i < nums.length; i += 2) if (nums[i] > max) max = nums[i]
  }
  return max
}

/**
 * Regions-path scene: a 3px light-gray stroke — wide enough to seed a region in
 * marker-controlled watershed, small enough (96 px) to fall below the size
 * merge, and distinct enough (dE ≈ 0.17) to survive the 0.1 threshold fold.
 */
function regionsScene(): RasterImage {
  const w = 64
  const h = 32
  const img = createRaster(w, h)
  fillRaster(img, 255, 255, 255)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((x - 16.5) ** 2 + (y - 16.5) ** 2 <= 10 * 10) setPixel(img, x, y, 127, 127, 127)
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 40; x < 43; x++) setPixel(img, x, y, 205, 205, 205)
  }
  return img
}

function regionsSettings(preserveSalient: boolean): VectorizeSettings {
  return normalizeSettings({
    mode: 'color',
    maxDimension: 0,
    segmentation: 'regions',
    palette: null,
    paletteSize: 8,
    layering: 'stacked',
    minRegionArea: 100,
    preserveSalient,
    curveMode: 'polygon',
    curveOptimize: false,
    optimizeSvg: false,
    precision: 3,
  })
}

describe('preserveSalient (classical salience protection)', () => {
  it('keeps a low-contrast 1px stroke on a strong edge, drops the sub-threshold speck', async () => {
    const img = colorScene()
    const off = await vectorize(img, colorSettings(false))
    const on = await vectorize(img, colorSettings(true))

    // Off: disc + background (the stroke merges into the background label).
    // On: exactly one more path — the stroke — and not a fourth for the speck.
    expect(analyzeSvg(off.svg).pathCount).toBe(2)
    expect(analyzeSvg(on.svg).pathCount).toBe(3)
  })

  it('is deterministic and byte-identical when off', async () => {
    const img = colorScene()
    const a = await vectorize(img, colorSettings(true))
    const b = await vectorize(img, colorSettings(true))
    expect(a.svg).toBe(b.svg)

    const plain = await vectorize(img, colorSettings(false))
    expect(plain.svg).toBe(await vectorize(img, colorSettings(false)).then((r) => r.svg))
  })

  it('keeps a 1px hairline through the bw despeckle', async () => {
    const img = inkScene()
    const off = await vectorize(img, inkSettings(false))
    const on = await vectorize(img, inkSettings(true))

    // Off: the hairline is despeckled (only the bar survives, right edge x=8).
    expect(maxX(off.svg)).toBeCloseTo(8, 5)
    // On: the hairline survives to its right edge x=21.
    expect(maxX(on.svg)).toBeCloseTo(21, 5)
  })

  it('protects thin features on the region-growing segmentation path too', async () => {
    // The regions branch previously dropped small regions inside
    // segmentRegions before any protect mask could run.
    const img = regionsScene()
    const off = await vectorize(img, regionsSettings(false))
    const on = await vectorize(img, regionsSettings(true))
    expect(analyzeSvg(off.svg).pathCount).toBe(2)
    expect(analyzeSvg(on.svg).pathCount).toBe(3)
  })
})
