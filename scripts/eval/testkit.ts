/**
 * Deterministic synthetic-image builders for the GMSD unit test. Test-only,
 * kept out of any shipped surface. Mirrors the studio's `scripts/eval/testkit.ts`
 * helpers the ported GMSD vectors rely on, so the two test suites share vectors.
 */
import type { RasterImage } from '@trazor/core'

/** Small deterministic PRNG (mulberry32) so noisy fixtures are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** An opaque image whose pixels come from a per-pixel RGB function. */
export function makeImage(
  width: number,
  height: number,
  fn: (x: number, y: number) => [number, number, number],
): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fn(x, y)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return { width, height, data }
}

/** Copy an image with zero-mean Gaussian-ish noise added (deterministic). */
export function addNoise(img: RasterImage, sigma: number, seed = 1): RasterImage {
  const rand = mulberry32(seed)
  const data = new Uint8ClampedArray(img.data)
  for (let i = 0; i < data.length; i++) {
    if (i % 4 === 3) continue
    // Sum of two uniforms approximates a bell curve well enough for a fixture.
    const n = (rand() + rand() - 1) * sigma
    data[i] = img.data[i] + n
  }
  return { width: img.width, height: img.height, data }
}
