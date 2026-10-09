/**
 * Fixtures for the label clean-up tests: a flood-fill component reference, and small
 * anti-aliased scenes: shapes rendered by 4×4
 * supersampling into straight RGBA, quantized to 8 bits, then composited over white with
 * single-precision rounding as inkvec composites (`p·a + 1·(1 − a)` in `f32`), so the
 * composited image is bit-identical to the one the reference harness saw.
 */
import { mulberry32 } from '@trazor/core'

export type Rgba = readonly [number, number, number, number]

export interface Scene {
  w: number
  h: number
  /** Straight color, 8-bit levels over 255, three per pixel. */
  straight: Float32Array
  /** Straight alpha, 8-bit levels over 255. */
  alpha: Float32Array
}

/** A shape: its paint and whether the point `(x, y)` (pixel units, y down) is inside. */
export interface Shape {
  paint: Rgba
  inside: (x: number, y: number) => boolean
}

export const rect =
  (x0: number, y0: number, x1: number, y1: number) =>
  (x: number, y: number): boolean =>
    x >= x0 && x < x1 && y >= y0 && y < y1

export const disk =
  (cx: number, cy: number, r: number) =>
  (x: number, y: number): boolean =>
    (x - cx) ** 2 + (y - cy) ** 2 < r * r

/** The half-plane left of the directed line through `(x0, y0)` with direction `angle`. */
export const halfPlane =
  (x0: number, y0: number, angle: number) =>
  (x: number, y: number): boolean =>
    Math.cos(angle) * (y - y0) - Math.sin(angle) * (x - x0) < 0

/**
 * Paint `shapes` (premultiplied paints) bottom to top over a premultiplied `ground`
 * (transparent when its alpha is 0), averaging 4×4 samples per pixel in premultiplied color; `noise` adds up to that many 8-bit levels
 * of seeded noise to one pixel in three.
 */
export function renderScene(
  w: number,
  h: number,
  ground: Rgba,
  shapes: readonly Shape[],
  noise = 0,
  seed = 1,
): Scene {
  const straight = new Float32Array(w * h * 3)
  const alpha = new Float32Array(w * h)
  const rand = mulberry32(seed)
  const ss = 4
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss
          const py = y + (sy + 0.5) / ss
          let c = ground
          for (const s of shapes) {
            if (!s.inside(px, py)) continue
            // Source over, in premultiplied color.
            const t = 1 - s.paint[3]
            c = [
              s.paint[0] + c[0] * t,
              s.paint[1] + c[1] * t,
              s.paint[2] + c[2] * t,
              s.paint[3] + c[3] * t,
            ]
          }
          r += c[0]
          g += c[1]
          b += c[2]
          a += c[3]
        }
      }
      const n = ss * ss
      const p = y * w + x
      const al = a / n
      const level = (v: number): number => {
        const jitter = noise > 0 && rand() < 1 / 3 ? Math.round((rand() * 2 - 1) * noise) : 0
        return Math.min(255, Math.max(0, Math.round(v * 255) + jitter)) / 255
      }
      alpha[p] = Math.round(al * 255) / 255
      const inv = al > 0 ? 1 / al : 0
      straight[p * 3] = level((r / n) * inv)
      straight[p * 3 + 1] = level((g / n) * inv)
      straight[p * 3 + 2] = level((b / n) * inv)
    }
  }
  return { w, h, straight, alpha }
}

/** A paint in premultiplied form, the form `renderScene` blends in. */
export function premultiplied(c: Rgba): Rgba {
  return [c[0] * c[3], c[1] * c[3], c[2] * c[3], c[3]]
}

/** The scene composited over white, rounded as inkvec rounds it (`f32`). */
export function compositeOverWhite(scene: Scene): Float32Array {
  const F = Math.fround
  const n = scene.w * scene.h
  const rgb = new Float32Array(n * 3)
  for (let p = 0; p < n; p++) {
    const a = scene.alpha[p]
    const back = F(1 - a)
    for (let c = 0; c < 3; c++) rgb[p * 3 + c] = F(F(scene.straight[p * 3 + c] * a) + back)
  }
  return rgb
}

const PAPER = premultiplied([0.95, 0.94, 0.9, 1])
const RED = premultiplied([0.86, 0.16, 0.14, 1])
const BLUE = premultiplied([0.12, 0.3, 0.86, 1])
const PURPLE = premultiplied([0.49, 0.23, 0.5, 1])
const DARK = premultiplied([0.1, 0.1, 0.12, 1])
const GREEN = premultiplied([0.2, 0.7, 0.3, 1])
const ORANGE = premultiplied([0.96, 0.55, 0.1, 1])
const WASH = premultiplied([0.2, 0.35, 0.9, 0.5])
const WHITE = premultiplied([1, 1, 1, 1])
const CLEAR: Rgba = [0, 0, 0, 0]

/**
 * Red and blue meeting along an anti-aliased column that a purple ink elsewhere explains
 * better than either, a one-pixel dark band across the red (a real ink, not a blend), a
 * slanted green edge and light noise.
 */
export function seamScene(): Scene {
  return renderScene(
    40,
    40,
    PAPER,
    [
      { paint: RED, inside: rect(4.3, 4, 21.6, 36) },
      { paint: BLUE, inside: rect(21.6, 4.5, 36.4, 30.2) },
      { paint: PURPLE, inside: disk(30, 35, 3.6) },
      { paint: DARK, inside: rect(4.3, 12, 21.6, 13) },
      {
        paint: GREEN,
        inside: (x, y) => halfPlane(0, 30, -0.35)(x, y) && rect(0, 0, 21, 40)(x, y),
      },
    ],
    1,
    7,
  )
}

/** An orange disk with an anti-aliased rim on a clear ground, a translucent wash over it and a white mark. */
export function translucentScene(): Scene {
  return renderScene(
    36,
    32,
    CLEAR,
    [
      { paint: ORANGE, inside: disk(15.3, 15.6, 10.2) },
      { paint: WASH, inside: rect(18.5, 6.4, 33.2, 26.7) },
      { paint: WHITE, inside: disk(11.2, 13.1, 2.6) },
    ],
    0,
    3,
  )
}

/** Eight cells meeting at slanted anti-aliased boundaries and three-way junctions. */
export function mosaicScene(): Scene {
  const seeds = [
    [6.2, 5.1],
    [19.7, 4.3],
    [33.4, 7.9],
    [9.1, 18.8],
    [24.6, 17.2],
    [5.3, 31.6],
    [18.8, 32.4],
    [32.1, 28.7],
  ]
  const hues: Rgba[] = [
    [0.9, 0.2, 0.2, 1],
    [0.2, 0.6, 0.9, 1],
    [0.95, 0.8, 0.2, 1],
    [0.3, 0.75, 0.35, 1],
    [0.55, 0.3, 0.75, 1],
    [0.15, 0.15, 0.2, 1],
    [0.95, 0.6, 0.7, 1],
    [0.4, 0.85, 0.8, 1],
  ]
  const nearest = (x: number, y: number): number => {
    let best = 0
    let bd = Infinity
    for (let i = 0; i < seeds.length; i++) {
      const d = (x - seeds[i][0]) ** 2 + (y - seeds[i][1]) ** 2
      if (d < bd) {
        bd = d
        best = i
      }
    }
    return best
  }
  return renderScene(
    40,
    38,
    PAPER,
    hues.map((paint, i) => ({ paint, inside: (x: number, y: number) => nearest(x, y) === i })),
    2,
    11,
  )
}

/**
 * 4-connected components by flood fill, numbered in raster order of their first pixel: the
 * reference the run-based labeling is held to. Members in flood order.
 */
export function floodComponents(
  labels: ArrayLike<number>,
  w: number,
  h: number,
): { comp: Int32Array; members: number[][] } {
  const comp = new Int32Array(w * h).fill(-1)
  const members: number[][] = []
  for (let start = 0; start < w * h; start++) {
    if (comp[start] >= 0) continue
    const id = members.length
    const lab = labels[start]
    const stack = [start]
    const group: number[] = []
    comp[start] = id
    while (stack.length > 0) {
      const p = stack.pop() as number
      group.push(p)
      const x = p % w
      const y = (p - x) / w
      const visit = (q: number): void => {
        if (comp[q] < 0 && labels[q] === lab) {
          comp[q] = id
          stack.push(q)
        }
      }
      if (x > 0) visit(p - 1)
      if (x + 1 < w) visit(p + 1)
      if (y > 0) visit(p - w)
      if (y + 1 < h) visit(p + w)
    }
    members.push(group)
  }
  return { comp, members }
}

/** Decode a run-length encoded label map (`label*count`, comma-separated). */
export function decodeRle(s: string): Int32Array {
  const out: number[] = []
  for (const run of s.split(',')) {
    const [v, n] = run.split('*')
    const count = n === undefined ? 1 : Number(n)
    for (let k = 0; k < count; k++) out.push(Number(v))
  }
  return Int32Array.from(out)
}

/** Values printed from single precision, as the `f32` they were. */
export function f32(values: readonly number[]): Float64Array {
  return Float64Array.from(values, (v) => Math.fround(v))
}
