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

/**
 * Rescue scene: white background, a dark blob (owns a centroid), and a 2px
 * light-gray stroke. With k = 2 the stroke's color has no centroid — its
 * pixels are all boundary pixels, which the clustering sample excludes — so
 * the stroke is labeled as the background. The rescue step must recover its
 * color so the protect-aware merge has a region to keep.
 */
function rescueScene(withStroke: boolean): RasterImage {
  const w = 64
  const h = 32
  const img = createRaster(w, h)
  fillRaster(img, 255, 255, 255)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((x - 52.5) ** 2 + (y - 16.5) ** 2 <= 8 * 8) setPixel(img, x, y, 48, 48, 48)
    }
  }
  if (withStroke) {
    for (let y = 0; y < h; y++) {
      for (let x = 12; x < 14; x++) setPixel(img, x, y, 205, 205, 205)
    }
  }
  return img
}

function rescueSettings(preserveSalient: boolean): VectorizeSettings {
  return normalizeSettings({
    mode: 'color',
    maxDimension: 0,
    segmentation: 'quantize',
    palette: null,
    paletteSize: 2,
    autoPaletteSize: false,
    layering: 'stacked',
    minRegionArea: 100,
    preserveSalient,
    colorCoherence: 0,
    dissolveBands: 0,
    curveMode: 'polygon',
    curveOptimize: false,
    optimizeSvg: false,
    precision: 3,
  })
}

/**
 * Ramp scene: a gray disc with a ~10px linear anti-aliased ramp up to white.
 * The ramp pixels are flat along the ring and their walked sides stay inside
 * the ramp (steps of ~13 levels), so they must still be rejected — rescuing a
 * ramp into its own band color is exactly the triangle/band glitch.
 */
function rampScene(): RasterImage {
  const w = 64
  const h = 32
  const img = createRaster(w, h)
  fillRaster(img, 255, 255, 255)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - 32, y - 16)
      if (d <= 10) {
        setPixel(img, x, y, 127, 127, 127)
      } else if (d < 20) {
        const g = Math.min(255, Math.round(127 + 13 * (d - 10)))
        setPixel(img, x, y, g, g, g)
      }
    }
  }
  return img
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

  it('rescues the palette entry of a salient feature the small palette dropped', async () => {
    const img = rescueScene(true)
    const off = await vectorize(img, rescueSettings(false))
    const on = await vectorize(img, rescueSettings(true))

    // Off: the stroke shares the background color and merges away (2 colors).
    expect(off.palette).toHaveLength(2)
    expect(analyzeSvg(off.svg).pathCount).toBe(2)
    // On: the stroke's color is rescued into the palette and the stroke survives.
    expect(on.palette).toHaveLength(3)
    expect(analyzeSvg(on.svg).pathCount).toBe(3)

    // Deterministic.
    const on2 = await vectorize(img, rescueSettings(true))
    expect(on2.svg).toBe(on.svg)
  })

  it('rescues a 1px diagonal hairline as one continuous stroke', async () => {
    // A diagonal 1px line's axis runs diagonally — the flatness gate must scan
    // the 8-neighborhood, or the line is rescued only in fragments.
    const img = rescueScene(true)
    for (let y = 0; y < 32; y++) {
      for (let x = 12; x < 14; x++) setPixel(img, x, y, 255, 255, 255)
    }
    for (let t = 0; t < 29; t++) setPixel(img, 8 + t, 30 - t, 205, 205, 205)
    const on = await vectorize(img, rescueSettings(true))
    expect(on.palette).toHaveLength(3)
    expect(analyzeSvg(on.svg).pathCount).toBe(3)
    // One subpath per shape: background, blob, stroke — a fragmented stroke
    // would emit extra M commands.
    expect((on.svg.match(/M\s+-?\d/g) ?? []).length).toBe(3)
  })

  it('does not rescue a wide anti-aliased ramp into band colors', async () => {
    // The ramp around the disc is a rim, not a stroke: its two sides are the
    // disc and the background. It must neither earn a rescued palette entry
    // nor survive as a band region — otherwise real images grow triangles
    // around every shape.
    const img = rampScene()
    const on = await vectorize(img, rescueSettings(true))
    expect(on.palette).toHaveLength(2)
    expect(analyzeSvg(on.svg).pathCount).toBe(2)
  })

  it('keeps a hairline whole where it crosses another shape', async () => {
    // Crossing pixels fail the stroke validation (their two sides straddle
    // the blob boundary), so only the merge's 8-neighborhood guard saves them
    // from being recolored — without it the hairline loses the crossing and
    // the pieces beneath the blob's sheet.
    const w = 220
    const h = 140
    const img = createRaster(w, h)
    fillRaster(img, 255, 255, 255)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if ((x - 70) ** 2 + (y - 70) ** 2 <= 34 * 34) setPixel(img, x, y, 185, 190, 199)
      }
    }
    // Bresenham 1px diagonal (30,110)-(105,30), crossing the blob.
    {
      let x = 30
      let y = 110
      const dx = 75
      const dy = -80
      let err = dx + dy
      for (;;) {
        setPixel(img, x, y, 236, 236, 236)
        if (x === 105 && y === 30) break
        const e2 = 2 * err
        if (e2 >= dy) {
          err += dy
          x += 1
        }
        if (e2 <= dx) {
          err += dx
          y -= 1
        }
      }
    }

    const s = normalizeSettings({
      mode: 'color',
      maxDimension: 0,
      segmentation: 'quantize',
      palette: ['#ffffff', '#b9bec7', '#5a6470', '#ececec'],
      layering: 'stacked',
      minRegionArea: 150,
      preserveSalient: true,
      dissolveBands: 0,
      colorCoherence: 0,
      curveMode: 'spline',
      // Absolute M/L coordinates — the bounds check below parses them naively.
      optimizeSvg: false,
      precision: 2,
    })
    const r = await vectorize(img, s)
    // Every hairline-colored shape together must span the whole line.
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const m of r.svg.matchAll(/<path d="([^"]+)" fill="#ececec"/g)) {
      const nums = (m[1].match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
      for (let i = 0; i < nums.length; i += 2) {
        if (nums[i] < minX) minX = nums[i]
        if (nums[i] > maxX) maxX = nums[i]
        if (nums[i + 1] < minY) minY = nums[i + 1]
        if (nums[i + 1] > maxY) maxY = nums[i + 1]
      }
    }
    expect(minX).toBeLessThanOrEqual(30.5)
    expect(maxX).toBeGreaterThanOrEqual(104.5)
    expect(minY).toBeLessThanOrEqual(30.5)
    expect(maxY).toBeGreaterThanOrEqual(109.5)
  })

  it('adds no palette entry when nothing salient is misrepresented', async () => {
    const img = rescueScene(false)
    const on = await vectorize(img, rescueSettings(true))
    expect(on.palette).toHaveLength(2)
    expect(analyzeSvg(on.svg).pathCount).toBe(2)
  })
})
