import { describe, expect, it } from 'vitest'
import type { LabelMap } from '@trazor/core'
import { hexToRgb, mulberry32, oklabToRgb } from '@trazor/core'
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

describe('fitRegionGradients — few bands, single band, noise, posterized source', () => {
  it('recovers a ramp quantized into only two or three bands', () => {
    const w = 60
    const h = 20
    for (const bands of [2, 3]) {
      const labels = bandLabels(w, h, bands)
      const { gradients } = fitRegionGradients(rampImage(w, h), labels, { minArea: 32 })
      const found = gradients.filter((g) => g !== null)
      expect(found).toHaveLength(1)
      expect(found[0]!.kind).toBe('linear')
      expect(new Set(labels.data).size).toBe(1)
    }
  })

  it('paints a single band whose own pixels ramp', () => {
    const w = 60
    const h = 20
    const labels = bandLabels(w, h, 1)
    const { gradients } = fitRegionGradients(rampImage(w, h), labels, { minArea: 32 })
    expect(gradients[0]?.kind).toBe('linear')
  })

  it('merges a noisy ramp into one gradient', () => {
    const w = 120
    const h = 40
    const rnd = mulberry32(11)
    const gauss = (): number =>
      Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd())
    const image = rasterOf(w, h, (x) => {
      const v = 30 + (x / (w - 1)) * 200 + gauss() * 8
      return [v, v, v, 255] as Rgba
    })
    const labels = bandLabels(w, h, 8)
    const { gradients } = fitRegionGradients(image, labels, { minArea: 32 })
    expect(gradients.filter((g) => g !== null)).toHaveLength(1)
    expect(new Set(labels.data).size).toBe(1)
  })

  it('leaves a posterized source (flat steps) flat', () => {
    // Six hard steps in the source itself, one label each: the bands are flat
    // inside, so a ramp has nothing to explain and would only smooth the steps.
    const w = 120
    const h = 30
    const image = rasterOf(w, h, (x) => {
      const v = 30 + Math.floor(x / (w / 6)) * 40
      return [v, v, v, 255] as Rgba
    })
    const labels = bandLabels(w, h, 6)
    const before = Array.from(labels.data)
    const { gradients } = fitRegionGradients(image, labels, { minArea: 32 })
    expect(gradients.every((g) => g === null)).toBe(true)
    expect(Array.from(labels.data)).toEqual(before)
  })

  it('keeps a flat object adjacent to a ramp out of the gradient', () => {
    // A ramp with a flat black block: the ramp bands (label 0..7) merge, the
    // block (label 8) keeps its flat fill.
    const w = 160
    const h = 60
    const inBlock = (x: number, y: number): boolean => x > 50 && x < 110 && y > 20 && y < 40
    const image = rasterOf(w, h, (x, y) => {
      if (inBlock(x, y)) return [10, 10, 10, 255] as Rgba
      const v = Math.round(60 + (x / (w - 1)) * 180)
      return [v, Math.round(v * 0.8), Math.round(v * 0.5), 255] as Rgba
    })
    const data = new Int32Array(w * h)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        data[y * w + x] = inBlock(x, y) ? 8 : Math.min(7, Math.floor((x / w) * 8))
    const labels: LabelMap = { width: w, height: h, data, count: 9 }
    const { gradients } = fitRegionGradients(image, labels, { minArea: 32 })
    expect(gradients.filter((g) => g !== null)).toHaveLength(1)
    expect(gradients[8]).toBeNull()
    expect(new Set(labels.data)).toEqual(new Set([0, 8]))
  })
})

describe('fitRegionGradients — alpha', () => {
  it('emits a fade of a transparent source as opacity stops of one straight color', () => {
    // A red disc whose coverage fades from 1 to 0, composited over white as the
    // engine does; only pixels with coverage ≥ 0.5 are labeled (rings by level).
    const w = 120
    const h = 120
    const cover = (x: number, y: number): number =>
      Math.max(0, Math.min(1, 1 - (Math.hypot(x + 0.5 - 60, y + 0.5 - 60) - 10) / 35))
    const image = rasterOf(w, h, (x, y) => {
      const a = cover(x, y)
      return [
        Math.round(255 + (200 - 255) * a),
        Math.round(255 + (30 - 255) * a),
        Math.round(255 + (30 - 255) * a),
        255,
      ] as Rgba
    })
    const alpha = new Uint8Array(w * h)
    const data = new Int32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = cover(x, y)
        alpha[y * w + x] = Math.round(a * 255)
        data[y * w + x] = a >= 0.5 ? Math.min(5, Math.floor((1 - a) * 12)) : -1
      }
    }
    const labels: LabelMap = { width: w, height: h, data, count: 6 }
    const { gradients, underlays } = fitRegionGradients(image, labels, { minArea: 32, alpha })
    const found = gradients.filter((g) => g !== null)
    expect(found).toHaveLength(1)
    const g = found[0]!
    expect(g.kind).toBe('radial')
    // Every stop is the disc's own color, un-composited from the white backdrop.
    for (const s of g.stops) {
      const rgb = hexToRgb(s.color)!
      expect(Math.abs(rgb[0] - 200)).toBeLessThanOrEqual(4)
      expect(Math.abs(rgb[1] - 30)).toBeLessThanOrEqual(4)
    }
    // Opacity fades outward: the last stop is well below the first.
    const first = g.stops[0].opacity ?? 1
    const last = g.stops[g.stops.length - 1].opacity ?? 1
    expect(first).toBeGreaterThan(0.9)
    expect(last).toBeLessThan(0.7)
    expect(underlays.every((u) => u < 0)).toBe(true)
  })

  it('decomposes a glow over a sky ramp into a base gradient and an opacity overlay', () => {
    // A vertical sky ramp with a radial glow of one constant color whose opacity
    // ramps 1 → 0. The composite under the glow is a 2-D field no single
    // gradient paints; the layered fit recovers the sky as one linear gradient
    // and the glow as a radial gradient of opacity stops painted over it.
    const w = 120
    const h = 120
    const cx = 60
    const cy = 50
    const R = 30
    const F: [number, number, number] = [255, 240, 120]
    const sky = (y: number): [number, number, number] => {
      const t = y / (h - 1)
      return [20 + 230 * t, 30 + 110 * t, 90 - 30 * t]
    }
    const glowA = (x: number, y: number): number =>
      Math.max(0, 1 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / R)
    const image = rasterOf(w, h, (x, y) => {
      const b = sky(y)
      const a = glowA(x, y)
      return [
        Math.round(b[0] + (F[0] - b[0]) * a),
        Math.round(b[1] + (F[1] - b[1]) * a),
        Math.round(b[2] + (F[2] - b[2]) * a),
        255,
      ] as Rgba
    })
    // Labels: 8 sky bands by row; 4 glow rings by opacity level (labels 8..11).
    const data = new Int32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = glowA(x, y)
        data[y * w + x] = a > 0 ? 8 + Math.min(3, Math.floor(a * 4)) : Math.floor(y / 15)
      }
    }
    const labels: LabelMap = { width: w, height: h, data, count: 12 }
    const { gradients, underlays } = fitRegionGradients(image, labels, { minArea: 32 })
    const reps = [...new Set(labels.data)]
    expect(reps).toHaveLength(2)
    const skyRep = reps.find((l) => l < 8)!
    const glowRep = reps.find((l) => l >= 8)!
    expect(gradients[skyRep]?.kind).toBe('linear')
    const glow = gradients[glowRep]!
    expect(glow.kind).toBe('radial')
    if (glow.kind !== 'radial') return
    expect(Math.hypot(glow.cx - cx, glow.cy - cy)).toBeLessThan(3)
    expect(underlays[glowRep]).toBe(skyRep)
    expect(underlays[skyRep]).toBe(-1)
    // One constant color (the glow's), opacity falling from the center outward.
    const colors = new Set(glow.stops.map((s) => s.color))
    expect(colors.size).toBe(1)
    const rgb = hexToRgb(glow.stops[0].color)!
    expect(Math.abs(rgb[0] - F[0])).toBeLessThanOrEqual(6)
    expect(Math.abs(rgb[1] - F[1])).toBeLessThanOrEqual(6)
    expect(Math.abs(rgb[2] - F[2])).toBeLessThanOrEqual(8)
    expect(glow.stops[0].opacity ?? 1).toBeGreaterThan(0.85)
    expect(glow.stops[glow.stops.length - 1].opacity ?? 1).toBeLessThan(0.3)
  })

  it('splits a label whose components lie on different layers', () => {
    // A vertical ramp (bands by row) and, below it, a flat block whose color
    // equals one sky band's centroid: quantization gives both the same label
    // (label 2), though the block is not part of the ramp. The ramp's component
    // joins the gradient; the block keeps a label of its own with the flat color.
    const w = 60
    const h = 100
    const image = rasterOf(w, h, (_x, y) => {
      if (y >= 70) return [120, 90, 130, 255] as Rgba
      const t = y / 69
      return [
        Math.round(40 + 160 * t),
        Math.round(50 + 80 * t),
        Math.round(150 - 40 * t),
        255,
      ] as Rgba
    })
    const data = new Int32Array(w * h)
    for (let y = 0; y < h; y++) {
      // Sky bands 0..4 over rows 0-69 (14 rows each); the block takes band 2's label.
      const band = y >= 70 ? 2 : Math.min(4, Math.floor(y / 14))
      for (let x = 0; x < w; x++) data[y * w + x] = band
    }
    const labels: LabelMap = { width: w, height: h, data, count: 5 }
    const res = fitRegionGradients(image, labels, { minArea: 32 })
    const skyLabel = res.labels.data[0]
    const g = res.gradients[skyLabel]
    expect(g?.kind).toBe('linear')
    if (g?.kind !== 'linear') return
    // The gradient's extent stops at the sky's bottom row, not at the block.
    expect(Math.max(g.y1, g.y2)).toBeLessThan(72)
    // Every sky pixel carries the gradient label; the block carries another,
    // flat label whose parent is label 2.
    for (let y = 0; y < 70; y += 7) expect(res.labels.data[y * w + 30]).toBe(skyLabel)
    const blockLabel = res.labels.data[85 * w + 30]
    expect(blockLabel).not.toBe(skyLabel)
    expect(res.gradients[blockLabel]).toBeNull()
    expect(res.parentLabel[blockLabel]).toBe(2)
    expect(res.gradients).toHaveLength(res.labels.count)
  })

  it('overlays can be disabled', () => {
    const w = 40
    const h = 40
    const labels = bandLabels(w, h, 4)
    const res = fitRegionGradients(rampImage(w, h), labels, { minArea: 8, overlays: false })
    expect(res.underlays.every((u) => u < 0)).toBe(true)
  })
})
