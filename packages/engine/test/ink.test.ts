import { describe, expect, it } from 'vitest'
import type { RasterImage } from '@trazor/core'
import { inkFrontEnd, intakeIsSoft, nativeInkFrontEnd, softNoise } from '../src/ink'
import { gradientAt } from '../src/planar'

/** An opaque image of `w × h` pixels, each colored by `color(x, y)`. */
function image(w: number, h: number, color: (x: number, y: number) => number[]): RasterImage {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) data.set([...color(x, y), 255], 4 * (y * w + x))
  return { width: w, height: h, data }
}

/** 6 × 6 cells of 36 distinct colors, 8 px each. */
const mosaic = image(48, 48, (x, y) => {
  const k = Math.floor(y / 8) * 6 + Math.floor(x / 8)
  return [40 + 6 * k, 230 - 5 * k, (k * 47) % 256]
})

/** A horizontal ramp inside a flat frame 4 px wide. */
const ramp = image(72, 40, (x, y) => {
  if (x < 4 || x >= 68 || y < 4 || y >= 36) return [250, 250, 250]
  const t = (x - 4) / 63
  return [30 + 190 * t, 60 + 120 * t, 200 - 160 * t].map(Math.round)
})

describe('the ink front end', () => {
  it('keeps every ink of a flat mosaic, with or without gradients', () => {
    // The classic palette budget would merge some; description length keeps them all.
    for (const gradients of [false, true]) {
      const front = inkFrontEnd(mosaic, 1, false, gradients)
      expect(front.labels.count).toBe(36)
      expect(front.counts.reduce((a, b) => a + b, 0)).toBe(48 * 48)
      expect(new Set(front.labels.data).size).toBe(36)
      expect(front.sigmaNoise).toBeGreaterThan(0)
      expect(front.gradients === undefined).toBe(!gradients)
      expect((front.gradients ?? []).every((g) => g === null)).toBe(true)
    }
  })

  it('paints each region its own color, whichever ink names it', () => {
    // Two grays four levels apart are one ink to the palette; split by a black bar,
    // each square keeps its own gray, with or without gradients.
    const squares = image(60, 32, (x) => {
      const v = x < 28 ? 120 : x < 32 ? 0 : 124
      return [v, v, v]
    })
    for (const gradients of [false, true]) {
      const front = inkFrontEnd(squares, 1, false, gradients)
      const at = (x: number): string => front.paletteHex[front.labels.data[16 * 60 + x]]
      expect(at(10)).toBe('#787878')
      expect(at(45)).toBe('#7c7c7c')
      expect(at(30)).toBe('#000000')
    }
  })

  it('merges the bands of a ramp into one linear gradient', () => {
    const banded = inkFrontEnd(ramp, 1, false, false)
    expect(banded.labels.count).toBeGreaterThan(3)
    const front = inkFrontEnd(ramp, 1, false, true)
    expect(front.labels.count).toBe(2)
    const g = front.gradients?.find((p) => p !== null)
    expect(g?.kind).toBe('linear')
    if (g?.kind !== 'linear') return
    // Along x, and within two levels of the ramp at every column whose pixels
    // testify (the outermost, next to the frame, do not; the paint pads there).
    expect(Math.abs(g.y2 - g.y1)).toBeLessThan(0.05 * Math.abs(g.x2 - g.x1))
    const at = new Float64Array(4)
    for (let x = 5; x < 67; x++) {
      gradientAt(g, x + 0.5, 20.5, at)
      const want = ramp.data.subarray(4 * (20 * 72 + x), 4 * (20 * 72 + x) + 3)
      for (let k = 0; k < 3; k++) expect(Math.abs(at[k] * 255 - want[k])).toBeLessThan(2)
    }
    // The frame keeps its own flat label.
    const frame = front.labels.data[0]
    expect(front.gradients?.[frame]).toBeNull()
    expect(front.paletteHex[frame]).toBe('#fafafa')
  })
})

describe('the ink front end over two grounds', () => {
  /** A transparent canvas: each pixel's straight color and alpha, composited over white, plus the alpha bytes. */
  function transparent(
    w: number,
    h: number,
    paint: (x: number, y: number) => [number, number, number, number],
  ): { image: RasterImage; alpha: Uint8Array } {
    const data = new Uint8ClampedArray(w * h * 4)
    const alpha = new Uint8Array(w * h)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const [r, g, b, a] = paint(x, y)
        const over = (c: number): number => Math.round(c * (a / 255) + 255 * (1 - a / 255))
        data.set([over(r), over(g), over(b), 255], 4 * (y * w + x))
        alpha[y * w + x] = a
      }
    return { image: { width: w, height: h, data }, alpha }
  }

  it('keeps the clear ground transparent and paints a wash at its own opacity', () => {
    // A solid red square and a half-transparent blue one on a clear canvas.
    const { image: canvas, alpha } = transparent(48, 24, (x, y) => {
      if (y < 4 || y >= 20) return [0, 0, 0, 0]
      if (x >= 4 && x < 20) return [220, 30, 30, 255]
      if (x >= 28 && x < 44) return [30, 60, 200, 128]
      return [0, 0, 0, 0]
    })
    const front = nativeInkFrontEnd(canvas, alpha, 1, false, false)
    const at = (x: number, y: number): number => front.labels.data[y * 48 + x]
    expect(at(1, 1)).toBe(-1)
    const red = at(10, 12)
    const blue = at(36, 12)
    expect(red).toBeGreaterThanOrEqual(0)
    expect(front.paletteHex[red]).toBe('#dc1e1e')
    expect(front.fillOpacity?.[red]).toBeUndefined()
    expect(front.fillOpacity?.[blue]).toBeCloseTo(128 / 255, 2)
    // The straight color, not the color over white.
    const ink = front.inkHex?.[blue] ?? ''
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(ink.slice(i, i + 2), 16))
    expect(Math.max(Math.abs(r - 30), Math.abs(g - 60), Math.abs(b - 200))).toBeLessThanOrEqual(1)
  })

  it('fits a glow as one fade whose stops carry opacities', () => {
    // One color whose opacity ramps from 0.1 to 0.85 across the canvas: the palette
    // bands it, the fades stage makes it one gradient with an opacity at each stop.
    const { image: canvas, alpha } = transparent(48, 16, (x) => [
      200,
      80,
      30,
      Math.round(255 * (0.1 + (0.75 * x) / 47)),
    ])
    const banded = nativeInkFrontEnd(canvas, alpha, 1, false, false)
    expect(banded.labels.count).toBeGreaterThan(1)
    const front = nativeInkFrontEnd(canvas, alpha, 1, false, true)
    expect(front.labels.count).toBe(1)
    const fade = front.gradients?.[0]
    expect(fade?.kind).toBe('linear')
    const opacities = fade?.stops.map((st) => st.opacity ?? 1) ?? []
    expect(Math.min(...opacities)).toBeLessThan(0.2)
    expect(Math.max(...opacities)).toBeGreaterThan(0.8)
  })
})

describe('the soft intake', () => {
  /** A dark disk on light, its coverage box-sampled, then blurred by a (2r+1)-wide box `passes` times. */
  function disk(r: number, passes: number): RasterImage {
    const w = 64
    let v = new Float64Array(w * w)
    for (let y = 0; y < w; y++)
      for (let x = 0; x < w; x++) {
        let n = 0
        for (let j = 0; j < 4; j++)
          for (let i = 0; i < 4; i++)
            if (Math.hypot(x + (i + 0.5) / 4 - 32, y + (j + 0.5) / 4 - 32) < 20) n++
        v[y * w + x] = 230 - (200 * n) / 16
      }
    for (let p = 0; p < passes; p++) {
      const next = new Float64Array(w * w)
      for (let y = 0; y < w; y++)
        for (let x = 0; x < w; x++) {
          let s = 0
          let k = 0
          for (let dy = -r; dy <= r; dy++)
            for (let dx = -r; dx <= r; dx++) {
              const xx = Math.min(w - 1, Math.max(0, x + dx))
              const yy = Math.min(w - 1, Math.max(0, y + dy))
              s += v[yy * w + xx]
              k++
            }
          next[y * w + x] = s / k
        }
      v = next
    }
    return image(w, w, (x, y) => {
      const g = Math.round(v[y * w + x])
      return [g, g, g]
    })
  }

  it('reads a crisp render as native and a blurred one as soft', () => {
    expect(intakeIsSoft(disk(0, 0))).toBe(false)
    expect(intakeIsSoft(disk(1, 3))).toBe(true)
  })

  it('raises the noise of a soft intake to the residual against its labels', () => {
    const img = disk(1, 3)
    const front = inkFrontEnd(img, 1, true, false)
    const sigma = softNoise(img, front.labels, front.paletteRgb)
    // A blurred edge leaves a residual the Laplacian estimate on the flats does not see.
    expect(sigma).toBeGreaterThan(inkFrontEnd(img, 1, false, false).sigmaNoise)
    expect(sigma).toBeLessThanOrEqual(8 / 255 + 1e-9)
  })
})
