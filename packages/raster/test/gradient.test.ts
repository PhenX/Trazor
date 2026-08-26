import { describe, expect, it } from 'vitest'
import type { LabelMap } from '@trazor/core'
import { hexToRgb, oklabToRgb } from '@trazor/core'
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

    // Stops span dark → light (grayscale, so channels stay equal). An sRGB-linear
    // ramp curves in Oklab, so a few interior stops may follow it — endpoints at
    // offset 0 and 1.
    expect(g.stops.length).toBeGreaterThanOrEqual(2)
    expect(g.stops[0].offset).toBe(0)
    expect(g.stops[g.stops.length - 1].offset).toBe(1)
    const lo = hexToRgb(g.stops[0].color)!
    const hi = hexToRgb(g.stops[g.stops.length - 1].color)!
    expect(Math.abs(lo[0] - lo[1])).toBeLessThanOrEqual(3)
    expect(Math.abs(hi[0] - hi[1])).toBeLessThanOrEqual(3)
    // The endpoints are clearly different luminances (a real ramp, not a flat).
    expect(Math.abs(hi[0] - lo[0])).toBeGreaterThan(80)
  })

  it('merges a sharply-bent multi-stop ramp into one gradient (no fragmenting)', () => {
    // A vertical 3-stop sky ramp (navy → mid-blue → pale cyan) that bends in Oklab,
    // posterized into 12 bands. Agglomerative merging + the curvature-agnostic
    // monotonicity gate must recover it as ONE gradient — the reported "sky split
    // into 3" regression came from greedy growth / a straight-line error gate
    // giving up at the bend.
    const w = 24
    const h = 120
    const stops: Array<[number, number, number]> = [
      [0.28, 0.02, -0.09],
      [0.6, -0.03, -0.05],
      [0.86, -0.04, -0.01],
    ]
    const image = rasterOf(w, h, (_x, y) => {
      const u = y / (h - 1)
      const seg = u < 0.5 ? 0 : 1
      const t = u < 0.5 ? u / 0.5 : (u - 0.5) / 0.5
      const a = stops[seg]
      const b = stops[seg + 1]
      const [r, g, bl] = oklabToRgb(
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
      )
      return [Math.round(r * 255), Math.round(g * 255), Math.round(bl * 255), 255] as Rgba
    })
    // Posterize into 12 horizontal bands (vertical ramp ⇒ split along y).
    const data = new Int32Array(w * h)
    const bands = 12
    for (let y = 0; y < h; y++) {
      const band = Math.min(bands - 1, Math.floor((y / h) * bands))
      for (let x = 0; x < w; x++) data[y * w + x] = band
    }
    const labels: LabelMap = { width: w, height: h, data, count: bands }
    const { gradients } = fitRegionGradients(image, labels, { minArea: 32 })
    const found = gradients.filter((g) => g !== null)
    expect(found).toHaveLength(1)
    expect(found[0]!.kind).toBe('linear')
    // All 12 bands collapsed into one region, and the bend kept > 2 stops.
    expect(new Set(labels.data).size).toBe(1)
    expect(found[0]!.stops.length).toBeGreaterThan(2)
  })

  it('does not gradient two flat silhouettes with a seam (a step, not a ramp)', () => {
    // Two flat dark bands (an upper and lower "hill") stacked vertically, with a
    // thin anti-aliased transition band between them — three bands whose means
    // progress monotonically, but a step, not a ramp. The ≥ MIN_MEMBERS floor and
    // the ramp-spread gate must leave all three flat.
    const w = 40
    const h = 30
    const upper: Rgba = [32, 64, 106, 255]
    const lower: Rgba = [21, 42, 73, 255]
    const image = rasterOf(w, h, (_x, y) => {
      if (y < 13) return upper
      if (y > 16) return lower
      return [26, 53, 90, 255] as Rgba // seam average
    })
    const data = new Int32Array(w * h)
    for (let y = 0; y < h; y++) {
      const band = y < 13 ? 0 : y > 16 ? 2 : 1
      for (let x = 0; x < w; x++) data[y * w + x] = band
    }
    const labels: LabelMap = { width: w, height: h, data, count: 3 }
    const before = Array.from(data)
    const { gradients } = fitRegionGradients(image, labels, { minArea: 16 })
    expect(gradients.every((g) => g === null)).toBe(true)
    expect(Array.from(labels.data)).toEqual(before)
  })

  it('keeps a diagonal ramp diagonal on a non-square region', () => {
    // A 3:1 image with a ramp along x+y. Deriving the direction from the raw
    // cross-covariance would tilt it toward the wider axis (~9:1 here); the
    // covariance-normalized gradient must stay ~45° (equal dx, dy).
    const w = 90
    const h = 30
    const image = rasterOf(w, h, (x, y) => {
      const v = Math.round(30 + ((x + y) / (w + h - 2)) * 200)
      return [v, v, v, 255] as Rgba
    })
    const data = new Int32Array(w * h)
    const step = (w + h - 2) / 8
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) data[y * w + x] = Math.min(7, Math.floor((x + y) / step))
    }
    const labels: LabelMap = { width: w, height: h, data, count: 8 }
    const { gradients } = fitRegionGradients(image, labels, { minArea: 32 })
    const g = gradients.find((x) => x !== null)!
    expect(g.kind).toBe('linear')
    if (g.kind !== 'linear') return
    const vx = g.x2 - g.x1
    const vy = g.y2 - g.y1
    // Equal components (±20% of the vector length) ⇒ ~45°, not axis-biased.
    expect(Math.abs(vx - vy)).toBeLessThan(0.2 * Math.hypot(vx, vy))
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

  it('a high minColorSpan keeps a low-contrast ramp flat', () => {
    // A gentle ramp (small total color change): accepted by default, rejected
    // once the required color span exceeds it.
    const w = 60
    const h = 20
    const gentle = rasterOf(w, h, (x) => {
      const v = Math.round(120 + (x / (w - 1)) * 40) // ~40 levels ≈ small Oklab span
      return [v, v, v, 255] as Rgba
    })
    const lax = fitRegionGradients(gentle, bandLabels(w, h, 6), { minArea: 32 })
    expect(lax.gradients.some((g) => g !== null)).toBe(true)
    const strict = fitRegionGradients(gentle, bandLabels(w, h, 6), {
      minArea: 32,
      minColorSpan: 0.3,
    })
    expect(strict.gradients.every((g) => g === null)).toBe(true)
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

  it('collapses an Oklab-straight ramp to 2 stops, keeps stops for a curved one', () => {
    const w = 64
    const h = 20
    // Straight in Oklab (L interpolated linearly) ⇒ Douglas–Peucker keeps 2 stops.
    const straight = rasterOf(w, h, (x) => {
      const [r, g, b] = oklabToRgb(0.25 + (x / (w - 1)) * 0.55, 0, 0)
      return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 255] as Rgba
    })
    const gs = fitRegionGradients(straight, bandLabels(w, h, 8), { minArea: 32 }).gradients.find(
      (g) => g,
    )
    expect(gs?.stops).toHaveLength(2)

    // A monotone-but-curved sweep (L eases down, a ramps up quadratically) keeps
    // more than 2 stops. It stays monotone, so the robustness gate accepts it.
    const curved = rasterOf(w, h, (x) => {
      const t = x / (w - 1)
      const [r, g, b] = oklabToRgb(0.85 - 0.45 * t, 0.05 + 0.22 * t * t, 0.02 + 0.05 * t)
      return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 255] as Rgba
    })
    const gc = fitRegionGradients(curved, bandLabels(w, h, 8), { minArea: 32 }).gradients.find(
      (g) => g,
    )
    expect(gc?.stops.length ?? 0).toBeGreaterThan(2)
  })

  it('emits a linear (not radial) gradient for a linear ramp', () => {
    const w = 60
    const h = 20
    const { gradients } = fitRegionGradients(rampImage(w, h), bandLabels(w, h, 6), { minArea: 32 })
    expect(gradients.find((g) => g !== null)?.kind).toBe('linear')
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

/** A concentric grayscale ramp (dark center → light edge) about (cx, cy). */
function radialImage(w: number, h: number, cx: number, cy: number, maxR: number) {
  return rasterOf(w, h, (x, y) => {
    const t = Math.min(1, Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / maxR)
    const v = Math.round(40 + t * 190)
    return [v, v, v, 255] as Rgba
  })
}

/** Posterize the distance from (cx, cy) into `rings` concentric bands. */
function ringLabels(w: number, h: number, cx: number, cy: number, maxR: number, rings: number) {
  const data = new Int32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = Math.min(0.999, Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / maxR)
      data[y * w + x] = Math.min(rings - 1, Math.floor(t * rings))
    }
  }
  return { width: w, height: h, data, count: rings }
}

describe('fitRegionGradients — radial', () => {
  it('merges concentric bands into one radial gradient centered on the ramp', () => {
    const w = 100
    const h = 100
    const cx = 50
    const cy = 50
    const maxR = 72 // covers the corners, so the ramp is radial across the whole frame
    const image = radialImage(w, h, cx, cy, maxR)
    const labels = ringLabels(w, h, cx, cy, maxR, 7)
    const { gradients } = fitRegionGradients(image, labels, { minArea: 64 })

    const found = gradients.filter((g) => g !== null)
    expect(found).toHaveLength(1)
    const g = found[0]!
    expect(g.kind).toBe('radial')
    if (g.kind !== 'radial') return
    // Center recovered near the true center; rings merged into one region.
    expect(Math.hypot(g.cx - cx, g.cy - cy)).toBeLessThan(6)
    expect(g.r).toBeGreaterThan(30)
    expect(new Set(labels.data).size).toBe(1)
    expect(g.stops.length).toBeGreaterThanOrEqual(2)
  })

  it('recovers an off-center radial center', () => {
    const w = 120
    const h = 90
    const cx = 40
    const cy = 34
    const maxR = 100 // covers the far corner (~98px away)
    const labels = ringLabels(w, h, cx, cy, maxR, 8)
    const { gradients } = fitRegionGradients(radialImage(w, h, cx, cy, maxR), labels, {
      minArea: 64,
    })
    const g = gradients.find((x) => x !== null)
    expect(g?.kind).toBe('radial')
    if (g?.kind !== 'radial') return
    expect(Math.hypot(g.cx - cx, g.cy - cy)).toBeLessThan(8)
  })

  it('is deterministic', () => {
    const a = ringLabels(100, 100, 50, 50, 52, 7)
    const b = ringLabels(100, 100, 50, 50, 52, 7)
    const ra = fitRegionGradients(radialImage(100, 100, 50, 50, 52), a, { minArea: 64 })
    const rb = fitRegionGradients(radialImage(100, 100, 50, 50, 52), b, { minArea: 64 })
    expect(JSON.stringify(rb.gradients)).toBe(JSON.stringify(ra.gradients))
    expect(Array.from(b.data)).toEqual(Array.from(a.data))
  })
})
