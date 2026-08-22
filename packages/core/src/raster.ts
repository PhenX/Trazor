/**
 * Raster containers shared by every stage of the pipeline.
 *
 * `RasterImage` is structurally compatible with the DOM `ImageData`, so the
 * browser layer can pass decoded images straight in without copying, while
 * tests can fabricate images in Node with plain typed arrays.
 */

/** Interleaved RGBA, 8 bits per channel, non-premultiplied. */
export interface RasterImage {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
}

/** Single-channel float image, values in [0, 1]. */
export interface GrayImage {
  readonly width: number
  readonly height: number
  readonly data: Float32Array
}

/** Binary mask: 1 = foreground, 0 = background. */
export interface BinaryMask {
  readonly width: number
  readonly height: number
  readonly data: Uint8Array
}

/**
 * Per-pixel cluster labels in [0, count). `-1` marks pixels excluded from
 * vectorization (fully transparent under `background: 'transparent'`).
 */
export interface LabelMap {
  readonly width: number
  readonly height: number
  readonly data: Int32Array
  readonly count: number
}

export function createRaster(width: number, height: number): RasterImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) }
}

export function createGray(width: number, height: number): GrayImage {
  return { width, height, data: new Float32Array(width * height) }
}

export function createMask(width: number, height: number): BinaryMask {
  return { width, height, data: new Uint8Array(width * height) }
}

export function createLabelMap(width: number, height: number, count: number): LabelMap {
  return { width, height, data: new Int32Array(width * height), count }
}

export function cloneRaster(image: RasterImage): RasterImage {
  return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) }
}

/** Fill an entire raster with one RGBA color. */
export function fillRaster(image: RasterImage, r: number, g: number, b: number, a = 255): void {
  const { data } = image
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = a
  }
}

/** Set one pixel (no bounds check). */
export function setPixel(
  image: RasterImage,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  const i = (y * image.width + x) * 4
  image.data[i] = r
  image.data[i + 1] = g
  image.data[i + 2] = b
  image.data[i + 3] = a
}
