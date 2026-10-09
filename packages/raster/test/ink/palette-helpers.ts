/** Image builders shared by the palette tests: painted scenes, inkvec's random flat art, compositing. */
import { linearToSrgb, srgbToLinear } from '@trazor/core'

/** A test image: encoded sRGB over white (three per pixel) and straight alpha, or null when opaque. */
export interface TestImage {
  w: number
  h: number
  rgb: Float32Array
  alpha: Float32Array | null
}

/** An opaque image from a per-pixel color callback (encoded sRGB in [0, 1]). */
export function paint(
  w: number,
  h: number,
  color: (x: number, y: number) => readonly number[],
): TestImage {
  const rgb = new Float32Array(w * h * 3)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = color(x, y)
      rgb.set([c[0], c[1], c[2]], (y * w + x) * 3)
    }
  }
  return { w, h, rgb, alpha: null }
}

/** The color a fraction `t` of the way from `a` to `b`, mixed in linear light. */
export function mixLinear(a: readonly number[], b: readonly number[], t: number): number[] {
  return [0, 1, 2].map((k) => {
    const x = srgbToLinear(a[k])
    const y = srgbToLinear(b[k])
    return linearToSrgb(x + (y - x) * t)
  })
}

/** Vertical stripes of the given inks, `stripe` pixels each, `h` rows. */
export function stripes(
  inks: readonly (readonly number[])[],
  stripe: number,
  h: number,
): TestImage {
  return paint(inks.length * stripe, h, (x) => inks[Math.floor(x / stripe)])
}

/** A small deterministic generator (the PCG-style LCG inkvec's palette tests use). */
export class Lcg {
  private s: bigint
  constructor(seed: number) {
    this.s = BigInt(seed)
  }
  next(): number {
    this.s = (this.s * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn
    return Number(this.s >> 33n)
  }
  below(n: number): number {
    return this.next() % Math.max(n, 1)
  }
  unit(): number {
    return this.below(1 << 20) / (1 << 20)
  }
}

/** A channel quantized to 8 bits, as decoded: `round(clamp(v) · 255) / 255` in single precision. */
function q(v: number): number {
  return Math.fround(Math.round(Math.min(1, Math.max(0, v)) * 255) / 255)
}

/**
 * A random piece of flat art: a few inks painted as rectangles and discs, anti-aliased edges
 * (a blend of the two inks, in linear light or sRGB), some pixels jittered by a level or two,
 * and a few pure-noise pixels; 8-bit values over 255.
 */
export function randomArt(rng: Lcg, w: number, h: number): TestImage {
  const k = 2 + rng.below(5)
  const inks: number[][] = []
  for (let i = 0; i < k; i++) inks.push([q(rng.unit()), q(rng.unit()), q(rng.unit())])
  const inkOf = new Int32Array(w * h)
  for (let s = 1; s < k; s++) {
    const cx = rng.below(w)
    const cy = rng.below(h)
    const r = 1 + rng.unit() * Math.max(w, h) * 0.4
    const disc = rng.below(2) === 0
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx
        const dy = y - cy
        const inside = disc ? dx * dx + dy * dy < r * r : Math.abs(dx) < r && Math.abs(dy) < r * 0.6
        if (inside) inkOf[y * w + x] = s
      }
    }
  }
  const rgb = new Float32Array(w * h * 3)
  for (let p = 0; p < w * h; p++) rgb.set(inks[inkOf[p]], p * 3)
  for (let y = 0; y < h; y++) {
    for (let x = 1; x < w; x++) {
      const a = inkOf[y * w + x - 1]
      const b = inkOf[y * w + x]
      if (a !== b && rng.below(3) !== 0) {
        const t = rng.unit()
        const lin = rng.below(2) === 0
        for (let c = 0; c < 3; c++) {
          const ca = inks[a][c]
          const cb = inks[b][c]
          rgb[(y * w + x) * 3 + c] = lin
            ? q(linearToSrgb(srgbToLinear(ca) * (1 - t) + srgbToLinear(cb) * t))
            : q(ca * (1 - t) + cb * t)
        }
      }
    }
  }
  for (let p = 0; p < w * h; p++) {
    const roll = rng.below(40)
    if (roll === 0) for (let c = 0; c < 3; c++) rgb[p * 3 + c] = q(rng.unit())
    else if (roll <= 3) {
      const j = (rng.below(5) - 2) / 255
      for (let c = 0; c < 3; c++) rgb[p * 3 + c] = q(rgb[p * 3 + c] + j)
    }
  }
  return { w, h, rgb, alpha: null }
}

/**
 * 8-bit straight RGBA composited over white in single precision, as inkvec's loader and
 * `Rgba::composited` compute it: `v = byte / 255`, then `v·a + 1·(1 − a)` per channel.
 */
export function compositeOverWhite(rgba: Uint8Array, w: number, h: number): TestImage {
  const fr = Math.fround
  const n = w * h
  const rgb = new Float32Array(n * 3)
  const alpha = new Float32Array(n)
  for (let p = 0; p < n; p++) {
    const a = fr(rgba[p * 4 + 3] / 255)
    alpha[p] = a
    const rest = fr(1 - a)
    for (let c = 0; c < 3; c++) rgb[p * 3 + c] = fr(fr(fr(rgba[p * 4 + c] / 255) * a) + rest)
  }
  return { w, h, rgb, alpha }
}

/** FNV-1a over the labels' 32-bit values: a fingerprint of a label map. */
export function labelHash(labels: Int32Array): number {
  let h = 0x811c9dc5
  for (let i = 0; i < labels.length; i++) {
    let v = labels[i]
    for (let k = 0; k < 4; k++) {
      h ^= v & 0xff
      h = Math.imul(h, 0x01000193)
      v >>>= 8
    }
  }
  return h >>> 0
}

/**
 * Ten concentric rings of ten hues (`hsl(36k°, 62 %, 50 % or 72 %)`, pale and saturated in
 * turn) on white, 128 px, anti-aliased by 4×4 supersampling in linear light.
 */
export function concentricRings(): TestImage {
  const hues: number[][] = []
  for (let k = 0; k < 10; k++) hues.push(hsl(36 * k, 0.62, k % 2 === 0 ? 0.5 : 0.72))
  return paint(128, 128, (x, y) => {
    const acc = [0, 0, 0]
    for (let sy = 0; sy < 4; sy++) {
      for (let sx = 0; sx < 4; sx++) {
        const r = Math.hypot(x + (sx + 0.5) / 4 - 64, y + (sy + 0.5) / 4 - 64)
        const c = r >= 60 ? [1, 1, 1] : hues[Math.min(9, Math.floor(r / 6))]
        for (let i = 0; i < 3; i++) acc[i] += srgbToLinear(c[i]) / 16
      }
    }
    return acc.map((v) => q(linearToSrgb(v)))
  })
}

/** CSS `hsl(h, s, l)` as encoded sRGB in [0, 1], quantized to 8 bits. */
export function hsl(h: number, s: number, l: number): number[] {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number): number => {
    const k = (n + h / 30) % 12
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [q(f(0)), q(f(8)), q(f(4))]
}

/** The evidence and cap a parity case runs with. */
export interface CaseParams {
  maxColors: number
  sigmaNoise: number
  /** Soft intake: the noise guard at 3 spreads and the same-ink floor at 5 dE00. */
  soft: boolean
}

/**
 * inkvec's per-color rewrite cases (`reference_tests.rs`): `count` random art images of mixed
 * sizes (1×1, one column, wide enough to stride the statistical passes, small), each with a
 * noise level, a clean or soft intake and a color cap drawn from the same generator.
 */
export function artCases(count: number): { name: string; img: TestImage; params: CaseParams }[] {
  const rng = new Lcg(0x5eed)
  const out: { name: string; img: TestImage; params: CaseParams }[] = []
  for (let c = 0; c < count; c++) {
    const kind = c % 16
    const [w, h] =
      kind === 0
        ? [1, 1]
        : kind === 1
          ? [1, 1 + rng.below(40)]
          : kind === 2
            ? [300 + rng.below(40), 230]
            : [2 + rng.below(60), 2 + rng.below(60)]
    const img = randomArt(rng, w, h)
    const soft = rng.below(3) === 0
    const sigmaNoise = rng.below(4) === 0 ? 0 : [0.5, 2, 6][rng.below(3)] / 255
    const maxColors = [1, 3, 64][rng.below(3)]
    out.push({ name: `art${c}-${w}x${h}`, img, params: { maxColors, sigmaNoise, soft } })
  }
  return out
}
