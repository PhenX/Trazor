import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { LabelMap, RasterImage } from '@trazor/core'
import { mulberry32, oklabToRgb } from '@trazor/core'
import { fitRegionGradients } from '../src/gradient'
import { rasterOf } from './helpers'
import type { Rgba } from './helpers'

/**
 * `fitRegionGradients` output — the rewritten labels, the per-label gradients and
 * the underlays — pinned over a fixed set of synthetic scenes (linear and radial
 * ramps, a glow over a sky ramp exercising the overlay phase, a multi-region
 * frame, and noisy ramps). The incremental agglomerative merge must leave the
 * result byte-for-byte unchanged, so any drift in the detected regions or paints
 * fails here. Regenerate the digest only after confirming the new output is
 * intended.
 */

/** A gradient scene: an image and a posterized label map, plus optional coverage. */
interface Scene {
  name: string
  image: RasterImage
  labels: LabelMap
  alpha?: Uint8Array
  minArea: number
}

function bandLabels(w: number, h: number, bands: number): LabelMap {
  const data = new Int32Array(w * h)
  const bw = w / bands
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) data[y * w + x] = Math.min(bands - 1, Math.floor(x / bw))
  return { width: w, height: h, data, count: bands }
}

function linearScene(): Scene {
  const w = 80
  const h = 30
  const image = rasterOf(w, h, (x) => {
    const v = Math.round(40 + (x / (w - 1)) * 180)
    return [v, Math.round(v * 0.7), Math.round(v * 0.5), 255] as Rgba
  })
  return { name: 'linear', image, labels: bandLabels(w, h, 8), minArea: 32 }
}

function radialScene(): Scene {
  const w = 90
  const h = 90
  const cx = 45
  const cy = 45
  const maxR = 66
  const image = rasterOf(w, h, (x, y) => {
    const t = Math.min(1, Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / maxR)
    const v = Math.round(40 + t * 190)
    return [v, v, Math.round(v * 0.9), 255] as Rgba
  })
  const data = new Int32Array(w * h)
  const rings = 7
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = Math.min(0.999, Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / maxR)
      data[y * w + x] = Math.min(rings - 1, Math.floor(t * rings))
    }
  return { name: 'radial', image, labels: { width: w, height: h, data, count: rings }, minArea: 64 }
}

function glowScene(): Scene {
  // A vertical sky ramp with a radial glow of one constant color whose opacity
  // ramps 1 → 0: the overlay phase must recover a base gradient and an opacity
  // overlay painted over it.
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
  const data = new Int32Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const a = glowA(x, y)
      data[y * w + x] = a > 0 ? 8 + Math.min(3, Math.floor(a * 4)) : Math.floor(y / 15)
    }
  return { name: 'glow', image, labels: { width: w, height: h, data, count: 12 }, minArea: 32 }
}

function multiScene(): Scene {
  // A horizontal ramp on the left, a radial on the right, and a flat block, all
  // posterized: several regions competing over one frame.
  const w = 120
  const h = 60
  const image = rasterOf(w, h, (x, y) => {
    if (x > 30 && x < 60 && y > 20 && y < 40) return [12, 12, 12, 255] as Rgba
    if (x < w / 2) {
      const v = Math.round(50 + (x / (w / 2 - 1)) * 180)
      return [v, Math.round(v * 0.8), Math.round(v * 0.4), 255] as Rgba
    }
    const t = Math.min(1, Math.hypot(x + 0.5 - 90, y + 0.5 - 30) / 40)
    const v = Math.round(60 + t * 170)
    return [Math.round(v * 0.6), v, v, 255] as Rgba
  })
  const data = new Int32Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (x > 30 && x < 60 && y > 20 && y < 40) {
        data[y * w + x] = 16
        continue
      }
      if (x < w / 2) data[y * w + x] = Math.min(7, Math.floor((x / (w / 2)) * 8))
      else {
        const t = Math.min(0.999, Math.hypot(x + 0.5 - 90, y + 0.5 - 30) / 40)
        data[y * w + x] = 8 + Math.min(7, Math.floor(t * 8))
      }
    }
  return { name: 'multi', image, labels: { width: w, height: h, data, count: 17 }, minArea: 24 }
}

function noisyScene(seed: number): Scene {
  const w = 100
  const h = 40
  const rnd = mulberry32(seed)
  const gauss = (): number =>
    Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd())
  const image = rasterOf(w, h, (x) => {
    const t = x / (w - 1)
    const [r, g, b] = oklabToRgb(0.3 + t * 0.5, 0.05 * Math.sin(t * 3), -0.1 + t * 0.15)
    return [
      Math.round(r * 255 + gauss() * 6),
      Math.round(g * 255 + gauss() * 6),
      Math.round(b * 255 + gauss() * 6),
      255,
    ] as Rgba
  })
  const bands = 10
  const data = new Int32Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) data[y * w + x] = Math.min(bands - 1, Math.floor((x / w) * bands))
  return {
    name: `noisy-${seed}`,
    image,
    labels: { width: w, height: h, data, count: bands },
    minArea: 32,
  }
}

/** Stable digest of one run's result: rewritten labels, gradients, underlays, parents. */
function digest(scene: Scene): string {
  const labels: LabelMap = {
    width: scene.labels.width,
    height: scene.labels.height,
    data: Int32Array.from(scene.labels.data),
    count: scene.labels.count,
  }
  const res = fitRegionGradients(scene.image, labels, {
    minArea: scene.minArea,
    alpha: scene.alpha,
  })
  return JSON.stringify({
    gradients: res.gradients,
    underlays: Array.from(res.underlays),
    labels: Array.from(res.labels.data),
    count: res.labels.count,
    parent: Array.from(res.parentLabel),
  })
}

describe('fitRegionGradients output is pinned over synthetic scenes', () => {
  const scenes: Scene[] = [
    linearScene(),
    radialScene(),
    glowScene(),
    multiScene(),
    noisyScene(3),
    noisyScene(9),
    noisyScene(21),
  ]

  it('is deterministic across scenes', () => {
    for (const scene of scenes) expect(digest(scene)).toBe(digest(scene))
  })

  it('matches the recorded digest', () => {
    const h = createHash('sha256')
    for (const scene of scenes) h.update(`${scene.name} ${digest(scene)} `)
    expect(h.digest('hex')).toBe('1f9f8680eaf2549d09c5f34be26589714b5dded15d64d7b3930b6bbdb03e9baf')
  })
})
