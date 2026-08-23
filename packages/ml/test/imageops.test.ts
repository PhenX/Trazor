import type { GrayImage, RasterImage } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import {
  applyAlphaMatte,
  argmax,
  bilinearResizePlane,
  bilinearResizeRgba,
  clampPlane01,
  computeLetterbox,
  cropPlane,
  cropRgba,
  IMAGENET_MEAN,
  IMAGENET_STD,
  mapPointToLetterbox,
  minMaxNormalize,
  packNchw,
  planeToMask,
  planTiles,
  rgbPlanesToImage,
  SAM_MEAN,
  SAM_STD,
  smoothstep,
  stitchPlane,
} from '../src/imageops'

const raster = (width: number, height: number, rgba: number[]): RasterImage => ({
  width,
  height,
  data: Uint8ClampedArray.from(rgba),
})

const gray = (width: number, height: number, values: number[]): GrayImage => ({
  width,
  height,
  data: Float32Array.from(values),
})

const closeTo = (actual: ArrayLike<number>, expected: number[], digits = 5): void => {
  expect(actual.length).toBe(expected.length)
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i], `index ${i}`).toBeCloseTo(expected[i], digits)
  }
}

describe('bilinearResizePlane', () => {
  it('upsamples a 2×2 ramp to the known 4×4 center-aligned values', () => {
    // f(x, y) = x + 2y on the source grid; bilinear reproduces it exactly.
    const src = Float32Array.from([0, 1, 2, 3])
    const out = bilinearResizePlane(src, 2, 2, 4, 4)
    expect(out.length).toBe(16)
    closeTo(out, [0, 0.25, 0.75, 1, 0.5, 0.75, 1.25, 1.5, 1.5, 1.75, 2.25, 2.5, 2, 2.25, 2.75, 3])
  })

  it('downsamples with centered sampling', () => {
    // dst centers land at source x = 0.5 and 2.5.
    const out = bilinearResizePlane(Float32Array.from([0, 1, 2, 3]), 4, 1, 2, 1)
    expect(out.length).toBe(2)
    closeTo(out, [0.5, 2.5])
  })

  it('returns an equal copy for identity size', () => {
    const src = Float32Array.from([1, 2, 3, 4])
    const out = bilinearResizePlane(src, 2, 2, 2, 2)
    expect(out).not.toBe(src)
    expect(Array.from(out)).toEqual([1, 2, 3, 4])
  })

  it('rejects a plane shorter than its stated dimensions', () => {
    expect(() => bilinearResizePlane(new Float32Array(3), 2, 2, 1, 1)).toThrow(RangeError)
  })
})

describe('bilinearResizeRgba', () => {
  it('interpolates every channel and rounds to bytes', () => {
    const image = raster(2, 1, [0, 0, 0, 255, 255, 255, 255, 255])
    const out = bilinearResizeRgba(image, 4, 1)
    expect(out.width).toBe(4)
    expect(out.height).toBe(1)
    // Same taps as the plane test: sx = 0, 0.25, 0.75, 1.
    expect(Array.from(out.data)).toEqual([
      0, 0, 0, 255, 64, 64, 64, 255, 191, 191, 191, 255, 255, 255, 255, 255,
    ])
  })

  it('replicates a single pixel when upsampling', () => {
    const out = bilinearResizeRgba(raster(1, 1, [10, 20, 30, 40]), 2, 2)
    expect(Array.from(out.data)).toEqual([
      10, 20, 30, 40, 10, 20, 30, 40, 10, 20, 30, 40, 10, 20, 30, 40,
    ])
  })
})

describe('packNchw', () => {
  it('lays out channel-major RGB planes', () => {
    const image = raster(2, 1, [10, 20, 30, 255, 40, 50, 60, 255])
    const out = packNchw(image, [0, 0, 0], [1, 1, 1])
    expect(Array.from(out)).toEqual([10, 40, 20, 50, 30, 60])
  })

  it('applies the rembg divide-by-max then ImageNet mean/std', () => {
    const image = raster(1, 1, [51, 102, 204, 255])
    const out = packNchw(image, IMAGENET_MEAN, IMAGENET_STD, {
      scale: 1 / 255,
      divideByMax: true,
    })
    // 51/204 = 0.25, 102/204 = 0.5, 204/204 = 1 (max is over all RGB samples).
    expect(out.length).toBe(3)
    closeTo(out, [(0.25 - 0.485) / 0.229, (0.5 - 0.456) / 0.224, (1 - 0.406) / 0.225])
  })

  it('zero-pads outside the image region (SAM letterbox)', () => {
    const image = raster(1, 1, [255, 255, 255, 255])
    const out = packNchw(image, SAM_MEAN, SAM_STD, { targetWidth: 2, targetHeight: 2 })
    expect(out.length).toBe(12)
    for (let c = 0; c < 3; c++) {
      const plane = out.subarray(c * 4, c * 4 + 4)
      expect(plane[0]).toBeCloseTo((255 - SAM_MEAN[c]) / SAM_STD[c], 5)
      expect(plane[1]).toBe(0)
      expect(plane[2]).toBe(0)
      expect(plane[3]).toBe(0)
    }
  })

  it('treats an all-black image as max 1 (no division by zero)', () => {
    const out = packNchw(raster(1, 1, [0, 0, 0, 255]), [0, 0, 0], [1, 1, 1], {
      scale: 1 / 255,
      divideByMax: true,
    })
    expect(Array.from(out)).toEqual([0, 0, 0])
  })
})

describe('minMaxNormalize', () => {
  it('maps the range onto [0, 1]', () => {
    const out = minMaxNormalize(Float32Array.from([2, 4, 6]))
    expect(out[0]).toBe(0)
    expect(out[2]).toBe(1)
    closeTo(out, [0, 0.5, 1])
  })

  it('maps a constant plane to zeros', () => {
    expect(Array.from(minMaxNormalize(Float32Array.from([5, 5, 5])))).toEqual([0, 0, 0])
  })
})

describe('smoothstep', () => {
  it('hits the endpoints and the midpoint', () => {
    expect(smoothstep(0.45, 0.55, 0.45)).toBe(0)
    expect(smoothstep(0.45, 0.55, 0.55)).toBe(1)
    expect(smoothstep(0.45, 0.55, 0.5)).toBeCloseTo(0.5, 6)
    expect(smoothstep(0.45, 0.55, 0.3)).toBe(0)
    expect(smoothstep(0.45, 0.55, 0.7)).toBe(1)
  })

  it('is monotonic inside the band', () => {
    const a = smoothstep(0, 1, 0.3)
    const b = smoothstep(0, 1, 0.6)
    expect(a).toBeGreaterThan(0)
    expect(b).toBeGreaterThan(a)
    expect(b).toBeLessThan(1)
  })

  it('degenerates to a hard step when feather is zero', () => {
    expect(smoothstep(0.5, 0.5, 0.49)).toBe(0)
    expect(smoothstep(0.5, 0.5, 0.5)).toBe(1)
    expect(smoothstep(0.5, 0.5, 0.51)).toBe(1)
  })
})

describe('applyAlphaMatte', () => {
  it('multiplies smoothed matte into the source alpha and keeps RGB', () => {
    const image = raster(3, 1, [9, 8, 7, 255, 1, 2, 3, 128, 4, 5, 6, 255])
    const matte = gray(3, 1, [1, 0.5, 0.2])
    const out = applyAlphaMatte(image, matte, 0.5, 0.05)
    expect(Array.from(out.data.subarray(0, 3))).toEqual([9, 8, 7])
    expect(out.data[3]).toBe(255) // matte 1 → keep alpha
    expect(out.data[7]).toBe(64) // smoothstep(0.45, 0.55, 0.5) = 0.5 → 128 × 0.5
    expect(out.data[11]).toBe(0) // matte below threshold − feather → transparent
    expect(image.data[7]).toBe(128) // input untouched
  })

  it('rejects mismatched matte dimensions', () => {
    expect(() =>
      applyAlphaMatte(raster(1, 1, [0, 0, 0, 255]), gray(2, 1, [0, 0]), 0.5, 0.05),
    ).toThrow(RangeError)
  })
})

describe('computeLetterbox / mapPointToLetterbox', () => {
  it('letterboxes a landscape image (width is the long side)', () => {
    const box = computeLetterbox(200, 100, 1024)
    expect(box.scale).toBeCloseTo(5.12, 6)
    expect(box.resizedWidth).toBe(1024)
    expect(box.resizedHeight).toBe(512)
    const p = mapPointToLetterbox(50, 25, box)
    expect(p.x).toBeCloseTo(256, 6)
    expect(p.y).toBeCloseTo(128, 6)
  })

  it('letterboxes a portrait image (height is the long side)', () => {
    const box = computeLetterbox(100, 200, 1024)
    expect(box.resizedWidth).toBe(512)
    expect(box.resizedHeight).toBe(1024)
    const p = mapPointToLetterbox(100, 200, box)
    expect(p.x).toBeCloseTo(512, 6)
    expect(p.y).toBeCloseTo(1024, 6)
  })

  it('fills the square exactly for square input and never exceeds the target', () => {
    const box = computeLetterbox(64, 64, 1024)
    expect(box.resizedWidth).toBe(1024)
    expect(box.resizedHeight).toBe(1024)
    const thin = computeLetterbox(1, 5000, 1024)
    expect(thin.resizedWidth).toBe(1) // rounds to 0 without the clamp
    expect(thin.resizedHeight).toBe(1024)
  })
})

describe('cropPlane', () => {
  it('copies the requested region', () => {
    const src = Float32Array.from([0, 1, 2, 3, 4, 5])
    expect(Array.from(cropPlane(src, 3, 1, 0, 2, 2))).toEqual([1, 2, 4, 5])
  })
})

describe('argmax', () => {
  it('returns the index of the max, first on ties, -1 when empty', () => {
    expect(argmax([1, 3, 2])).toBe(1)
    expect(argmax([2, 5, 5])).toBe(1)
    expect(argmax(Float32Array.from([-3, -1, -2]))).toBe(1)
    expect(argmax([])).toBe(-1)
  })
})

describe('planeToMask', () => {
  it('thresholds strictly above the cutoff', () => {
    const mask = planeToMask(Float32Array.from([-1, 0, 0.5, 2]), 2, 2)
    expect(Array.from(mask.data)).toEqual([0, 0, 1, 1])
    expect(mask.width).toBe(2)
    expect(mask.height).toBe(2)
  })
})

describe('clampPlane01', () => {
  it('clamps values into [0,1]', () => {
    const out = clampPlane01(Float32Array.from([-0.5, 0, 0.25, 1, 2]))
    expect(out.length).toBe(5)
    closeTo(out, [0, 0, 0.25, 1, 1])
  })
})

describe('cropRgba', () => {
  it('copies an in-bounds sub-rectangle', () => {
    const img = raster(
      3,
      2,
      [
        // prettier-ignore
        0, 0, 0, 255, 10, 0, 0, 255, 20, 0, 0, 255, 30, 0, 0, 255, 40, 0, 0, 255, 50, 0, 0, 255,
      ],
    )
    const crop = cropRgba(img, 1, 0, 2, 2)
    expect(crop.width).toBe(2)
    expect(crop.height).toBe(2)
    expect([...crop.data]).toEqual([10, 0, 0, 255, 20, 0, 0, 255, 40, 0, 0, 255, 50, 0, 0, 255])
  })
})

describe('planTiles', () => {
  it('returns a single tile when the image fits within one', () => {
    expect(planTiles(100, 80, 100, 80, 16)).toEqual([{ x: 0, y: 0 }])
  })

  it('covers the image with in-bounds tiles flush to the far edge', () => {
    const width = 300
    const tile = 128
    const overlap = 32
    const tiles = planTiles(width, 100, tile, 100, overlap)
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(0)
      expect(t.x + tile).toBeLessThanOrEqual(width)
    }
    const xs = [...new Set(tiles.map((t) => t.x))].toSorted((a, b) => a - b)
    expect(xs[0]).toBe(0)
    expect(xs[xs.length - 1]).toBe(width - tile)
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeLessThanOrEqual(tile)
  })
})

describe('rgbPlanesToImage', () => {
  it('interleaves three planes and scales [0,1] to bytes', () => {
    const r = Float32Array.from([0, 1])
    const g = Float32Array.from([0.5, 0.25])
    const b = Float32Array.from([1, 0])
    const img = rgbPlanesToImage(r, g, b, 2, 1, null)
    expect(img.width).toBe(2)
    expect(img.height).toBe(1)
    // Uint8ClampedArray rounds on store: 0.5*255=127.5→128, 0.25*255=63.75→64.
    expect([...img.data]).toEqual([0, 128, 255, 255, 255, 64, 0, 255])
  })

  it('copies alpha from the source and clamps out-of-range values', () => {
    const r = Float32Array.from([2]) // >1 clamps to 255
    const g = Float32Array.from([-1]) // <0 clamps to 0
    const b = Float32Array.from([0.5])
    const src = Uint8ClampedArray.from([9, 9, 9, 42])
    const img = rgbPlanesToImage(r, g, b, 1, 1, src)
    expect([...img.data]).toEqual([255, 0, 128, 42])
  })

  it('rejects planes shorter than the dimensions', () => {
    expect(() =>
      rgbPlanesToImage(new Float32Array(1), new Float32Array(2), new Float32Array(2), 2, 1, null),
    ).toThrow(RangeError)
  })
})

describe('stitchPlane', () => {
  it('reconstructs a plane from overlapping tiles', () => {
    const width = 40
    const height = 24
    const tileW = 16
    const tileH = 16
    const ref = new Float32Array(width * height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) ref[y * width + x] = x * 0.01 + y * 0.02
    }
    const placements = planTiles(width, height, tileW, tileH, 6)
    const planes = placements.map((p) => cropPlane(ref, width, p.x, p.y, tileW, tileH))
    // Every output pixel is a weighted average of identical samples of the ramp,
    // so stitching returns the original plane.
    const stitched = stitchPlane(width, height, tileW, tileH, placements, planes)
    expect(stitched.length).toBe(width * height)
    closeTo(stitched, [...ref], 4)
  })
})
