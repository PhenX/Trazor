import type { RasterImage, VectorizeResult } from '@trazor/core'
import { create2dCanvas } from './decode'
import type { FidelityClient } from './fidelityClient'

export interface FidelityReport {
  /** 0..1 — perceptual similarity between source and traced SVG. */
  score: number
  /** Per-pixel ΔE heatmap at result size (transparent where faithful). */
  diff: RasterImage
}

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

/**
 * Perceptual fidelity of a vectorization result.
 *
 * Rasterizes the result SVG at its own pixel size and composites both it and
 * the (downscaled) source over white — DOM-bound work that stays on the main
 * thread. The heavy per-pixel Oklab ΔE pass (mean similarity + heatmap) runs in
 * the fidelity worker via `client`, so a large result never janks the UI.
 */
export async function computeFidelity(
  sourceImage: RasterImage,
  result: VectorizeResult,
  client: FidelityClient,
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

  // Heavy per-pixel ΔE + heatmap — off the main thread.
  return client.score(w, h, a, b)
}
