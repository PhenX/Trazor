import type { RasterImage } from '@trazor/core'

/** Formats we advertise. Anything `image/*` is attempted anyway. */
export const acceptTypes = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
  'image/svg+xml',
] as const

/** Value for `<input accept>` / drag filtering. */
export const acceptAttr = 'image/*'

/** Decoded images larger than this on the longest side are downscaled at decode time. */
const MAX_DECODE_DIMENSION = 8192

export class DecodeError extends Error {
  override name = 'DecodeError'
}

function friendlyType(blob: Blob, name: string): string {
  if (blob.type) return blob.type
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]
  return ext ? `.${ext.toLowerCase()}` : 'unknown format'
}

function decodeViaImageElement(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob)
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.addEventListener('load', () => resolve(img), { once: true })
    img.addEventListener(
      'error',
      () => reject(new DecodeError('the browser could not decode this image')),
      { once: true },
    )
    img.src = url
  }).finally(() => URL.revokeObjectURL(url))
}

export interface Canvas2D {
  canvas: OffscreenCanvas | HTMLCanvasElement
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
}

export function create2dCanvas(width: number, height: number): Canvas2D {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (ctx) return { canvas, ctx }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new DecodeError('2D canvas is unavailable in this browser')
  return { canvas, ctx }
}

/**
 * Decode a File/Blob (from drop, paste or file input) into a `RasterImage`.
 *
 * Uses `createImageBitmap` with EXIF orientation applied; falls back to an
 * `<img>` element for formats `createImageBitmap` rejects (notably SVG in some
 * browsers). The resulting `ImageData` is returned directly — it is
 * structurally a valid `RasterImage`.
 */
export async function decodeBlob(blob: Blob, name = ''): Promise<RasterImage> {
  if (blob.size === 0) {
    throw new DecodeError('this file is empty')
  }
  if (blob.type && !blob.type.startsWith('image/')) {
    throw new DecodeError(
      `"${friendlyType(blob, name)}" is not an image — try PNG, JPEG, WebP, GIF, BMP, AVIF or SVG`,
    )
  }

  let source: ImageBitmap | HTMLImageElement
  try {
    source = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch {
    // e.g. SVG blobs, or formats this browser's createImageBitmap rejects.
    source = await decodeViaImageElement(blob)
  }

  const srcW = 'naturalWidth' in source ? source.naturalWidth : source.width
  const srcH = 'naturalHeight' in source ? source.naturalHeight : source.height
  if (!srcW || !srcH) {
    throw new DecodeError('this image has no intrinsic size (empty or dimensionless SVG)')
  }

  const scale = Math.min(1, MAX_DECODE_DIMENSION / Math.max(srcW, srcH))
  const width = Math.max(1, Math.round(srcW * scale))
  const height = Math.max(1, Math.round(srcH * scale))

  const { ctx } = create2dCanvas(width, height)
  ctx.drawImage(source, 0, 0, width, height)
  if ('close' in source) source.close()

  // ImageData is structurally compatible with RasterImage — no copy needed.
  return ctx.getImageData(0, 0, width, height)
}
