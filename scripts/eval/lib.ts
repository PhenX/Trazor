/**
 * Shared helpers for the eval harnesses (docs/ML_ROADMAP.md item 1 & the tracer
 * comparison). Kept dependency-light and Node-only: read a PNG, rasterize an SVG
 * with resvg over white, and score fidelity as mean Oklab ΔE — the same metric
 * the app shows (apps/web/src/lib/fidelity.ts).
 */
import { readFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import { PNG } from 'pngjs'
import { deltaEOk, rgbToOklab } from '@trazor/core'
import type { RasterImage } from '@trazor/core'

/** Read an RGBA PNG as a RasterImage (fresh Uint8ClampedArray, length w*h*4). */
export function readRgba(path: string): RasterImage {
  const png = PNG.sync.read(readFileSync(path))
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) }
}

/** Rasterize an SVG string over white at the given width (resvg). */
export function rasterizeSvg(svg: string, width: number): RasterImage {
  const resvg = new Resvg(svg, {
    background: 'rgba(255,255,255,1)',
    fitTo: { mode: 'width', value: width },
  })
  const r = resvg.render()
  return { width: r.width, height: r.height, data: new Uint8ClampedArray(r.pixels) }
}

/**
 * Composite an RGBA image over white into a fresh opaque RasterImage. resvg
 * already renders SVGs over white, so flattening the source the same way makes
 * ΔE fair for inputs with transparency (e.g. a sprite on an alpha background).
 */
export function flattenOverWhite(img: RasterImage): RasterImage {
  const { width, height, data } = img
  const out = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255
    out[i] = data[i] * a + 255 * (1 - a)
    out[i + 1] = data[i + 1] * a + 255 * (1 - a)
    out[i + 2] = data[i + 2] * a + 255 * (1 - a)
    out[i + 3] = 255
  }
  return { width, height, data: out }
}

/** Nearest-neighbor resample to (w, h) — used to align the source to a render. */
export function resampleNearest(img: RasterImage, w: number, h: number): RasterImage {
  if (img.width === w && img.height === h) return img
  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.height - 1, ((y * img.height) / h) | 0)
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, ((x * img.width) / w) | 0)
      const s = (sy * img.width + sx) * 4
      const d = (y * w + x) * 4
      out[d] = img.data[s]
      out[d + 1] = img.data[s + 1]
      out[d + 2] = img.data[s + 2]
      out[d + 3] = img.data[s + 3]
    }
  }
  return { width: w, height: h, data: out }
}

/**
 * Mean Oklab ΔE between two equally-sized RGBA rasters, both taken as opaque over
 * white (mirrors apps/web/src/lib/fidelity.ts). Ignores alpha — callers pass
 * images already composited over white.
 */
export function meanDeltaE(a: RasterImage, b: RasterImage): number {
  const n = Math.min(a.data.length, b.data.length) >> 2
  let sum = 0
  for (let p = 0; p < n; p++) {
    const i = p * 4
    const [l1, a1, b1] = rgbToOklab(a.data[i] / 255, a.data[i + 1] / 255, a.data[i + 2] / 255)
    const [l2, a2, b2] = rgbToOklab(b.data[i] / 255, b.data[i + 1] / 255, b.data[i + 2] / 255)
    sum += deltaEOk(l1, a1, b1, l2, a2, b2)
  }
  return n > 0 ? sum / n : 0
}

/** app score: 1 − 4·ΔE, clamped to [0,1] (apps/web/src/lib/fidelity.ts). */
export function score(dE: number): number {
  const s = 1 - dE * 4
  return s < 0 ? 0 : s > 1 ? 1 : s
}
