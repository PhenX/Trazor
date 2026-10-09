/** Scenes and helpers shared by the transparent-image tests: straight RGBA images, random transparent art, glows. */
import { inflateSync } from 'node:zlib'
import type { FillModel } from '../../src/fill/model'
import type { Palette } from '../../src/ink/palette'
import { Lcg, randomArt } from './palette-helpers'

const fr = Math.fround

/** A transparent test image: straight RGBA (single precision), and the same composited over white. */
export interface StraightImage {
  w: number
  h: number
  /** Straight RGBA in `[0, 1]`, four per pixel. */
  rgba: Float32Array
  /** Encoded sRGB over white, three per pixel: `v·a + 1·(1 − a)` in single precision. */
  rgb: Float32Array
  alpha: Float32Array
}

/** Composite straight RGBA over white in single precision, as inkvec's `Rgba::composited` does. */
export function straight(w: number, h: number, rgba: Float32Array): StraightImage {
  const n = w * h
  const rgb = new Float32Array(n * 3)
  const alpha = new Float32Array(n)
  for (let p = 0; p < n; p++) {
    const a = rgba[p * 4 + 3]
    alpha[p] = a
    const back = fr(1 - a)
    for (let c = 0; c < 3; c++) rgb[p * 3 + c] = fr(fr(rgba[p * 4 + c] * a) + back)
  }
  return { w, h, rgba, rgb, alpha }
}

/** An image from a per-pixel straight color and alpha. */
export function draw(
  w: number,
  h: number,
  f: (x: number, y: number) => readonly [readonly number[], number],
): StraightImage {
  const rgba = new Float32Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [s, a] = f(x, y)
      rgba.set([s[0], s[1], s[2], a], (y * w + x) * 4)
    }
  }
  return straight(w, h, rgba)
}

/** Deflated base64 straight RGBA bytes, each byte `k` read as the single-precision `k / 255`. */
export function fromDeflated(w: number, h: number, b64: string): StraightImage {
  const bytes = inflateSync(Buffer.from(b64, 'base64'))
  const rgba = new Float32Array(w * h * 4)
  for (let i = 0; i < rgba.length; i++) rgba[i] = bytes[i] / 255
  return straight(w, h, rgba)
}

/** A channel quantized to 8 bits: `round(clamp(v) · 255) / 255` in single precision. */
function q(v: number): number {
  return fr(Math.round(fr(Math.min(1, Math.max(0, v)) * 255)) / 255)
}

/**
 * Random transparent art (inkvec's `random_transparent` recipe): random flat paint under a
 * clear ground, an opaque disc with a translucent wash in a checker of cells and an
 * anti-aliased rim.
 */
export function randomTransparent(rng: Lcg, w: number, h: number): StraightImage {
  const paint = randomArt(rng, w, h).rgb
  const cx = rng.below(w)
  const cy = rng.below(h)
  const r = fr(1 + fr(fr(rng.unit() * Math.max(w, h)) * 0.5))
  const wash = q(fr(0.1 + fr(rng.unit() * 0.8)))
  const rgba = new Float32Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = fr(Math.sqrt(fr(fr((x - cx) ** 2) + fr((y - cy) ** 2))))
      const inner = (Math.floor(x / 3) + Math.floor(y / 5)) % 4 === 0 ? wash : 1
      const a = d < fr(r - 1) ? inner : d < r ? q(fr(r - d)) : 0
      const p = y * w + x
      rgba.set([paint[p * 3], paint[p * 3 + 1], paint[p * 3 + 2], a], p * 4)
    }
  }
  return straight(w, h, rgba)
}

/** One random transparent case and the evidence and cap it runs with. */
export interface RandomCase {
  name: string
  img: StraightImage
  maxColors: number
  sigmaNoise: number
  soft: boolean
}

/** `count` random transparent cases of mixed sizes (1×1, wide enough to stride, small), noise, intake and cap. */
export function randomCases(count: number): RandomCase[] {
  const rng = new Lcg(0xa1fa)
  const out: RandomCase[] = []
  for (let c = 0; c < count; c++) {
    const [w, h] =
      c % 12 === 0
        ? [1, 1]
        : c % 12 === 1
          ? [300 + rng.below(30), 228]
          : [2 + rng.below(60), 2 + rng.below(60)]
    const img = randomTransparent(rng, w, h)
    const soft = rng.below(3) === 0
    const sigmaNoise = [0, 0.5 / 255, 3 / 255][rng.below(3)]
    const maxColors = [1, 2, 64][rng.below(3)]
    out.push({ name: `rt${c}-${w}x${h}`, img, maxColors, sigmaNoise, soft })
  }
  return out
}

/** A straight color `s` at opacity `a`, seen over white: `s·a + 1 − a` in single precision. */
export function onWhite(s: readonly number[], a: number): [number, number, number] {
  return [fr(fr(fr(s[0] * a) + 1) - a), fr(fr(fr(s[1] * a) + 1) - a), fr(fr(fr(s[2] * a) + 1) - a)]
}

/** The input of the fades stage: an image, its labels, the palette's inks and the inks per label. */
export interface FadeScene {
  name: string
  img: StraightImage
  labels: Int32Array
  palette: Palette
  nFills: number
  labelInk: number[]
  sigma: number
  lambda: number
}

/** A palette of colors over white and opacities (OKLab and weight unused by the fades stage). */
export function washPalette(inkRgb: readonly number[], inkAlpha: readonly number[]): Palette {
  const k = inkAlpha.length
  return {
    count: k,
    inkLab: new Float64Array(k * 3),
    inkRgb: Float64Array.from(inkRgb, fr),
    weight: new Float64Array(k),
    alpha: Float64Array.from(inkAlpha, fr),
  }
}

/** A `w × h` glow: a straight color `s` whose opacity ramps from 0.1 to 0.85 along x, in `bands` palette bands. */
export function glow(w: number, h: number, bands: number, s: number[], lambda: number): FadeScene {
  const aAt = (x: number): number => fr(0.1 + fr(fr(0.75 * x) / (w - 1)))
  const band = (x: number): number => Math.floor((x * bands) / w)
  const rgba = new Float32Array(w * h * 4)
  const labels = new Int32Array(w * h)
  for (let p = 0; p < w * h; p++) {
    const x = p % w
    rgba.set([s[0], s[1], s[2], aAt(x)], p * 4)
    labels[p] = band(x)
  }
  const inkRgb: number[] = []
  const inkAlpha: number[] = []
  for (let b = 0; b < bands; b++) {
    let sum = 0
    let k = 0
    for (let x = 0; x < w; x++) {
      if (band(x) === b) {
        sum = fr(sum + aAt(x))
        k++
      }
    }
    const a = fr(sum / k)
    inkAlpha.push(a)
    inkRgb.push(...onWhite(s, a))
  }
  return {
    name: `glow${w}x${h}b${bands}`,
    img: straight(w, h, rgba),
    labels,
    palette: washPalette(inkRgb, inkAlpha),
    nFills: 0,
    labelInk: [],
    sigma: 1 / 255,
    lambda,
  }
}

/** The same glow twice, one above the other, with a row of opaque paint (ink 4) between. */
export function twoGlows(): FadeScene {
  const s = [0.8, 0.3, 0.1]
  const g = glow(16, 4, 4, s, 3)
  const w = 16
  const rgba = new Float32Array(w * 9 * 4)
  const labels = new Int32Array(w * 9)
  rgba.set(g.img.rgba, 0)
  labels.set(g.labels, 0)
  for (let x = 0; x < w; x++) {
    rgba.set([s[0], s[1], s[2], 1], (64 + x) * 4)
    labels[64 + x] = 4
  }
  rgba.set(g.img.rgba, 80 * 4)
  labels.set(g.labels, 80)
  return {
    ...g,
    name: 'twoGlows',
    img: straight(w, 9, rgba),
    labels,
    palette: washPalette([...g.palette.inkRgb, ...s], [...g.palette.alpha, 1]),
  }
}

/** A flat wash at opacity 0.5 whose palette entry says 0.52. */
export function flatWash(): FadeScene {
  const s = [0.2, 0.4, 0.8]
  const w = 6
  const rgba = new Float32Array(w * w * 4)
  for (let p = 0; p < w * w; p++) rgba.set([s[0], s[1], s[2], 0.5], p * 4)
  const img = straight(w, w, rgba)
  return {
    name: 'flatWash',
    img,
    labels: new Int32Array(w * w),
    palette: washPalette(Array.from(img.rgb.subarray(0, 3)), [0.52]),
    nFills: 0,
    labelInk: [],
    sigma: 1 / 255,
    lambda: 2,
  }
}

/**
 * A radial halo on the clear ground: an opaque core (ink 6), opacity falling from 0.95 with the
 * radius in five opacity bands (inks 0–4), color from yellow to red, the clear ground (ink 5)
 * beyond; with `noise`, a level or two of jitter in the opacity.
 */
export function halo(noise: boolean): FadeScene {
  const w = 40
  const h = 36
  const rng = new Lcg(7)
  const rgba = new Float32Array(w * h * 4)
  const labels = new Int32Array(w * h)
  const inkA = [0.8, 0.62, 0.45, 0.28, 0.12]
  const bandOf = (a: number): number => {
    let best = 0
    for (let k = 1; k < 5; k++) if (Math.abs(a - inkA[k]) < Math.abs(a - inkA[best])) best = k
    return best
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      const r = Math.hypot(x - 19.3, y - 17.6)
      if (r < 3) {
        rgba.set([0.9, 0.1, 0.05, 1], p * 4)
        labels[p] = 6
        continue
      }
      let a = 0.95 - 0.055 * r
      if (noise) a += (rng.below(5) - 2) / 255
      a = fr(Math.round(Math.min(1, Math.max(0, a)) * 255) / 255)
      const t = Math.min(1, r / 16)
      rgba.set([1, 0.85 - 0.6 * t, 0.2 - 0.15 * t, a], p * 4)
      labels[p] = a < 0.04 ? 5 : bandOf(a)
    }
  }
  const inkRgb: number[] = []
  for (let k = 0; k < 5; k++) inkRgb.push(...onWhite([1, 0.6, 0.12], inkA[k]))
  inkRgb.push(1, 1, 1, 0.9, 0.1, 0.05)
  return {
    name: noise ? 'haloNoisy' : 'halo',
    img: straight(w, h, rgba),
    labels,
    palette: washPalette(inkRgb, [...inkA, 0, 1]),
    nFills: 7,
    labelInk: [0, 1, 2, 3, 4, 5, 6],
    sigma: noise ? 2 / 255 : 0.5 / 255,
    lambda: 0.5 * Math.log(w * h),
  }
}

/** A shadow whose opacity falls down the image in three bands and whose gray lightens across it, beside a 4 × 3 wash. */
export function shadow(): FadeScene {
  const w = 30
  const h = 20
  const rgba = new Float32Array(w * h * 4)
  const labels = new Int32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      if (x >= 26 && y < 3) {
        rgba.set([0.1, 0.6, 0.2, 0.5], p * 4)
        labels[p] = 4
        continue
      }
      const a = fr(Math.round((0.7 - 0.6 * (y / (h - 1))) * 255) / 255)
      const c = 0.05 + 0.3 * (x / (w - 1))
      rgba.set([c, c, c, a], p * 4)
      labels[p] = y < 7 ? 0 : y < 14 ? 1 : 2
    }
  }
  const gray = [0.2, 0.2, 0.2]
  const inkRgb = [
    ...onWhite(gray, 0.6),
    ...onWhite(gray, 0.4),
    ...onWhite(gray, 0.2),
    1,
    1,
    1,
    ...onWhite([0.1, 0.6, 0.2], 0.5),
  ]
  return {
    name: 'shadow',
    img: straight(w, h, rgba),
    labels,
    palette: washPalette(inkRgb, [0.6, 0.4, 0.2, 0, 0.5]),
    nFills: 3,
    labelInk: [0, 1, 2],
    sigma: 1 / 255,
    lambda: 0.5 * Math.log(w * h),
  }
}

/** Every fades scene the parity fixtures were made from, in order. */
export function fadeScenes(): FadeScene[] {
  return [
    glow(16, 4, 4, [0.8, 0.3, 0.1], 0.5 * Math.log(64)),
    glow(24, 10, 6, [0.1, 0.5, 0.9], 0.5 * Math.log(240)),
    twoGlows(),
    flatWash(),
    halo(false),
    halo(true),
    shadow(),
  ]
}

/** A fill model as inkvec prints it: its kind, then every number, positions in inkvec's frame (Trazor's − ½). */
export function modelTokens(m: FillModel): (string | number)[] {
  if (m.kind === 'flat') return ['flat', ...m.color]
  const interp = m.interp === 'srgb' ? 'srgb' : 'lin'
  const mids = m.mids.flatMap((s) => [s.offset, ...s.color])
  if (m.kind === 'linear') {
    const { p0, p1 } = m
    return [
      'linear',
      p0[0] - 0.5,
      p0[1] - 0.5,
      p1[0] - 0.5,
      p1[1] - 0.5,
      interp,
      ...m.c0,
      ...m.c1,
      m.mids.length,
      ...mids,
    ]
  }
  return [
    'radial',
    m.c[0] - 0.5,
    m.c[1] - 0.5,
    m.r,
    m.aspect,
    m.angle,
    interp,
    ...m.c0,
    ...m.c1,
    m.mids.length,
    ...mids,
  ]
}

/** Largest difference between two token lists, Infinity when their kinds, spaces or stop counts differ. */
export function modelDiff(
  a: readonly (string | number)[],
  b: readonly (string | number)[],
): number {
  if (a.length !== b.length) return Infinity
  let m = 0
  for (let i = 0; i < a.length; i++) {
    if (typeof a[i] === 'string' || typeof b[i] === 'string') {
      if (a[i] !== b[i]) return Infinity
      continue
    }
    const d = Math.abs((a[i] as number) - (b[i] as number))
    if (Number.isNaN(d)) return Infinity
    m = Math.max(m, d)
  }
  return m
}
