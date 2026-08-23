import { clamp, deltaEOk, rgbToOklab } from '@trazor/core'
import type { RasterImage, VectorizeResult } from '@trazor/core'
import { create2dCanvas } from './decode'

export interface FidelityReport {
  /** 0..1 — perceptual similarity between source and traced SVG. */
  score: number
  /** Per-pixel ΔE heatmap at result size (transparent where faithful). */
  diff: RasterImage
}

const SAMPLE_BUDGET = 200_000
const CHUNK_PIXELS = 250_000
/** ΔE(Oklab) mapped to full heat. */
const HEAT_FULL = 0.25

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.addEventListener('load', () => resolve(img), { once: true })
    img.addEventListener('error', () => reject(new Error('could not rasterize the SVG result')), {
      once: true,
    })
    img.src = url
  }).finally(() => URL.revokeObjectURL(url))
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Perceptual fidelity of a vectorization result.
 *
 * Rasterizes the result SVG at its own pixel size, composites both it and the
 * (downscaled) source over white, then measures mean ΔE in Oklab over up to
 * 200k sampled pixels. Also produces a heatmap raster for the Difference view.
 */
export async function computeFidelity(
  sourceImage: RasterImage,
  result: VectorizeResult,
): Promise<FidelityReport> {
  const w = result.width
  const h = result.height
  if (!w || !h || !result.svg) throw new Error('empty result')

  // Rendered SVG over white
  const svgImg = await loadSvgImage(result.svg)
  const rendered = create2dCanvas(w, h)
  rendered.ctx.fillStyle = '#ffffff'
  rendered.ctx.fillRect(0, 0, w, h)
  rendered.ctx.drawImage(svgImg, 0, 0, w, h)
  const a = rendered.ctx.getImageData(0, 0, w, h).data

  // Source, downscaled to the same size, over white
  const srcCanvas = create2dCanvas(sourceImage.width, sourceImage.height)
  srcCanvas.ctx.putImageData(
    new ImageData(new Uint8ClampedArray(sourceImage.data), sourceImage.width, sourceImage.height),
    0,
    0,
  )
  const reference = create2dCanvas(w, h)
  reference.ctx.fillStyle = '#ffffff'
  reference.ctx.fillRect(0, 0, w, h)
  reference.ctx.imageSmoothingEnabled = true
  reference.ctx.imageSmoothingQuality = 'high'
  reference.ctx.drawImage(srcCanvas.canvas, 0, 0, w, h)
  const b = reference.ctx.getImageData(0, 0, w, h).data

  const pixels = w * h
  const stride = Math.max(1, Math.floor(pixels / SAMPLE_BUDGET))
  const diffData = new Uint8ClampedArray(pixels * 4)

  let sum = 0
  let count = 0
  for (let start = 0; start < pixels; start += CHUNK_PIXELS) {
    const end = Math.min(pixels, start + CHUNK_PIXELS)
    for (let p = start; p < end; p++) {
      const i = p * 4
      const [l1, a1, b1] = rgbToOklab(a[i] / 255, a[i + 1] / 255, a[i + 2] / 255)
      const [l2, a2, b2] = rgbToOklab(b[i] / 255, b[i + 1] / 255, b[i + 2] / 255)
      const dE = deltaEOk(l1, a1, b1, l2, a2, b2)
      if (p % stride === 0) {
        sum += dE
        count++
      }
      // Heatmap: faithful → transparent, unfaithful → amber to hot red.
      const t = clamp(dE / HEAT_FULL, 0, 1)
      if (t > 0.02) {
        diffData[i] = 255
        diffData[i + 1] = 170 - t * 130
        diffData[i + 2] = 40 + t * 50
        diffData[i + 3] = Math.sqrt(t) * 235
      }
    }
    // oxlint-disable-next-line no-await-in-loop -- sequential on purpose: yield to the UI between chunks
    if (end < pixels) await yieldToUi()
  }

  const meanDeltaE = count > 0 ? sum / count : 0
  return {
    score: clamp(1 - meanDeltaE * 4, 0, 1),
    diff: { width: w, height: h, data: diffData },
  }
}
