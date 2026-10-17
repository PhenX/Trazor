/**
 * Deterministic test rasters for the intake measurements: native box-supersampled renders, their
 * resampled, blurred, glowing and block-compressed variants, and the hash the parity fixtures
 * compare by. Every image is 8-bit RGBA, as a decoder hands it over.
 */
import type { RasterImage } from '@trazor/core'

/** Coverage in `[0, 1]` of an `inside(x, y)` shape on a `w × h` grid, box-supersampled `ss × ss` per pixel. */
export function coverage(
  w: number,
  h: number,
  ss: number,
  inside: (x: number, y: number) => boolean,
): Float64Array {
  const out = new Float64Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          if (inside(x + (sx + 0.5) / ss, y + (sy + 0.5) / ss)) n++
        }
      }
      out[y * w + x] = n / (ss * ss)
    }
  }
  return out
}

/** An opaque gray raster from values in `[0, 1]`, rounded to 8 bits. */
export function grayRaster(v: ArrayLike<number>, w: number, h: number): RasterImage {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let p = 0; p < w * h; p++) {
    const b = Math.round(v[p] * 255)
    data[p * 4] = b
    data[p * 4 + 1] = b
    data[p * 4 + 2] = b
    data[p * 4 + 3] = 255
  }
  return { width: w, height: h, data }
}

/** A dark disc of radius `r` centered on a white `size²` canvas, `ss×` supersampled: a native render. */
export function disc(size: number, r: number, ss = 8): RasterImage {
  const c = size / 2
  const cov = coverage(size, size, ss, (x, y) => (x - c) ** 2 + (y - c) ** 2 < r * r)
  return grayRaster(
    cov.map((v) => 1 - v),
    size,
    size,
  )
}

type Rgb = readonly [number, number, number]

/** Paint `cov` of `color` over `img` (straight RGB in `[0, 1]`, three per pixel). */
function paint(img: Float64Array, cov: Float64Array, color: Rgb): void {
  for (let p = 0; p < cov.length; p++) {
    const a = cov[p]
    for (let c = 0; c < 3; c++) img[p * 3 + c] = img[p * 3 + c] * (1 - a) + color[c] * a
  }
}

/** Straight RGB in `[0, 1]` and alpha to an 8-bit raster. */
function toRaster(
  rgb: Float64Array,
  alpha: Float64Array | null,
  w: number,
  h: number,
): RasterImage {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let p = 0; p < w * h; p++) {
    for (let c = 0; c < 3; c++) data[p * 4 + c] = Math.round(rgb[p * 3 + c] * 255)
    data[p * 4 + 3] = alpha ? Math.round(alpha[p] * 255) : 255
  }
  return { width: w, height: h, data }
}

/**
 * A flat-color icon on a `size²` canvas, rendered at 8× supersampling: a disc, a rounded
 * rectangle, a ring, a triangle and a thin bar in five inks on an off-white ground. With
 * `transparent` the ground is clear and the shapes carry the alpha. Callers share the returned
 * raster and must not modify it.
 */
export function iconScene(size: number, transparent = false): RasterImage {
  const key = `${size}:${transparent}`
  const known = iconCache.get(key)
  if (known) return known
  const icon = renderIcon(size, transparent)
  iconCache.set(key, icon)
  return icon
}

/** Rendered icons by size and ground: the 8× supersampling is the slow part of a test. */
const iconCache = new Map<string, RasterImage>()

function renderIcon(size: number, transparent: boolean): RasterImage {
  const s = size / 128
  const rgb = new Float64Array(size * size * 3).fill(transparent ? 0 : 0.96)
  const alpha = transparent ? new Float64Array(size * size) : null
  const shapes: { color: Rgb; inside: (x: number, y: number) => boolean }[] = [
    {
      color: [0.86, 0.16, 0.14],
      inside: (x, y) => (x - 40 * s) ** 2 + (y - 40 * s) ** 2 < (26 * s) ** 2,
    },
    {
      color: [0.12, 0.3, 0.86],
      inside: (x, y) => {
        const dx = Math.max(Math.abs(x - 90 * s) - 18 * s, 0)
        const dy = Math.max(Math.abs(y - 38 * s) - 22 * s, 0)
        return dx * dx + dy * dy < (8 * s) ** 2
      },
    },
    {
      color: [0.2, 0.62, 0.3],
      inside: (x, y) => {
        const d = Math.hypot(x - 42 * s, y - 92 * s)
        return d < 24 * s && d > 14 * s
      },
    },
    {
      color: [0.96, 0.6, 0.1],
      inside: (x, y) => y < 116 * s && y > 72 * s && Math.abs(x - 94 * s) < (y - 72 * s) * 0.55,
    },
    {
      color: [0.1, 0.1, 0.12],
      inside: (x, y) => x > 8 * s && x < 120 * s && Math.abs(y - 66 * s) < 1.6 * s,
    },
  ]
  for (const { color, inside } of shapes) {
    const cov = coverage(size, size, 8, inside)
    paint(rgb, cov, color)
    if (alpha) for (let p = 0; p < cov.length; p++) alpha[p] = alpha[p] * (1 - cov[p]) + cov[p]
  }
  if (alpha) {
    // Un-premultiply: the painted color is premultiplied by the coverage on a clear ground.
    for (let p = 0; p < size * size; p++) {
      if (alpha[p] > 0) for (let c = 0; c < 3; c++) rgb[p * 3 + c] /= alpha[p]
    }
  }
  return toRaster(rgb, alpha, size, size)
}

export type Kernel = 'nearest' | 'bilinear' | 'bicubic' | 'lanczos3'

/** Kernel weight at distance `t` (in source pixels) and its half-width. */
function kernel(kind: Kernel): [(t: number) => number, number] {
  switch (kind) {
    case 'nearest':
      return [(t) => (t > -0.5 && t <= 0.5 ? 1 : 0), 1]
    case 'bilinear':
      return [(t) => Math.max(1 - Math.abs(t), 0), 1]
    case 'bicubic':
      // Keys 1981, a = −0.5.
      return [
        (t) => {
          const x = Math.abs(t)
          const a = -0.5
          if (x <= 1) return (a + 2) * x ** 3 - (a + 3) * x ** 2 + 1
          if (x < 2) return a * x ** 3 - 5 * a * x ** 2 + 8 * a * x - 4 * a
          return 0
        },
        2,
      ]
    case 'lanczos3':
      return [
        (t) => {
          if (t === 0) return 1
          if (Math.abs(t) >= 3) return 0
          const p = Math.PI * t
          return (3 * Math.sin(p) * Math.sin(p / 3)) / (p * p)
        },
        3,
      ]
  }
}

/** Resample one line of `n` values to `n·k` with pixel centers aligned, edge-clamped and weight-normalized. */
function resampleLine(src: Float64Array, k: number, kind: Kernel): Float64Array {
  const [f, support] = kernel(kind)
  const n = src.length
  const out = new Float64Array(n * k)
  for (let x = 0; x < n * k; x++) {
    const u = (x + 0.5) / k - 0.5
    const base = Math.floor(u)
    let sum = 0
    let wsum = 0
    for (let i = base - support + 1; i <= base + support; i++) {
      const wgt = f(u - i)
      sum += wgt * src[Math.min(Math.max(i, 0), n - 1)]
      wsum += wgt
    }
    out[x] = sum / wsum
  }
  return out
}

/** An opaque raster upscaled by the integer factor `k` with `kind`, separably, rounded to 8 bits. */
export function upscale(img: RasterImage, k: number, kind: Kernel): RasterImage {
  const { width: w, height: h } = img
  const W = w * k
  const H = h * k
  const data = new Uint8ClampedArray(W * H * 4)
  for (let c = 0; c < 4; c++) {
    const rows = new Float64Array(W * h)
    const line = new Float64Array(w)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) line[x] = img.data[(y * w + x) * 4 + c] / 255
      rows.set(resampleLine(line, k, kind), y * W)
    }
    const col = new Float64Array(h)
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < h; y++) col[y] = rows[y * W + x]
      const up = resampleLine(col, k, kind)
      for (let y = 0; y < H; y++) data[(y * W + x) * 4 + c] = Math.round(up[y] * 255)
    }
  }
  return { width: W, height: H, data }
}

/** Separable Gaussian blur of a `w × h` field (edge-clamped, radius `⌈3σ⌉`). */
function gaussianField(v: Float64Array, w: number, h: number, sigma: number): Float64Array {
  const r = Math.ceil(3 * sigma)
  const taps = new Float64Array(2 * r + 1)
  let total = 0
  for (let i = -r; i <= r; i++) {
    taps[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma))
    total += taps[i + r]
  }
  for (let i = 0; i < taps.length; i++) taps[i] /= total
  const tmp = new Float64Array(w * h)
  const out = new Float64Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0
      for (let i = -r; i <= r; i++)
        s += taps[i + r] * v[y * w + Math.min(Math.max(x + i, 0), w - 1)]
      tmp[y * w + x] = s
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0
      for (let i = -r; i <= r; i++)
        s += taps[i + r] * tmp[Math.min(Math.max(y + i, 0), h - 1) * w + x]
      out[y * w + x] = s
    }
  }
  return out
}

/** An opaque raster blurred by a Gaussian of `sigma` pixels, rounded to 8 bits. */
export function blur(img: RasterImage, sigma: number): RasterImage {
  const { width: w, height: h } = img
  const data = new Uint8ClampedArray(w * h * 4)
  const ch = new Float64Array(w * h)
  for (let c = 0; c < 4; c++) {
    for (let p = 0; p < w * h; p++) ch[p] = img.data[p * 4 + c]
    const b = gaussianField(ch, w, h, sigma)
    for (let p = 0; p < w * h; p++) data[p * 4 + c] = Math.round(b[p])
  }
  return { width: w, height: h, data }
}

/**
 * Sharp dark art (a disc and a bar) over a soft orange halo: the art's silhouette blurred wide
 * (Gaussian `size/24`) and laid under it, as an outer glow is drawn.
 */
export function glowScene(size: number): RasterImage {
  const c = size / 2
  const r = size * 0.22
  const art = coverage(
    size,
    size,
    8,
    (x, y) =>
      (x - c) ** 2 + (y - c) ** 2 < r * r ||
      (Math.abs(y - size * 0.82) < size * 0.04 && Math.abs(x - c) < size * 0.3),
  )
  const halo = gaussianField(art, size, size, size / 24)
  const rgb = new Float64Array(size * size * 3)
  const ink: Rgb = [0.1, 0.1, 0.14]
  const glow: Rgb = [0.94, 0.67, 0.16]
  for (let p = 0; p < size * size; p++) {
    const g = Math.min(halo[p] * 1.6, 1)
    for (let ch = 0; ch < 3; ch++) {
      const ground = glow[ch] * g + (1 - g)
      rgb[p * 3 + ch] = ink[ch] * art[p] + ground * (1 - art[p])
    }
  }
  return toRaster(rgb, null, size, size)
}

/** The JPEG luminance quantization table (ITU-T T.81, Annex K.1), row-major. */
const JPEG_LUMA = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113,
  92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
]

/**
 * An opaque raster through a JPEG-like block transform: each channel's 8×8 blocks DCT-II'd,
 * quantized with the luminance table at `quality` (the IJG scaling), and transformed back, which
 * leaves the codec's Gibbs ringing beside every strong edge. Sides must be multiples of 8.
 */
export function blockCompress(img: RasterImage, quality: number): RasterImage {
  const { width: w, height: h } = img
  const scale = quality < 50 ? 5000 / quality : 200 - 2 * quality
  const q = JPEG_LUMA.map((v) => Math.min(Math.max(Math.floor((v * scale + 50) / 100), 1), 255))
  const cos = new Float64Array(64)
  for (let x = 0; x < 8; x++) {
    for (let u = 0; u < 8; u++) cos[x * 8 + u] = Math.cos(((2 * x + 1) * u * Math.PI) / 16)
  }
  const cu = (u: number): number => (u === 0 ? Math.SQRT1_2 : 1)
  const data = new Uint8ClampedArray(img.data)
  const block = new Float64Array(64)
  const coef = new Float64Array(64)
  for (let c = 0; c < 3; c++) {
    for (let by = 0; by < h; by += 8) {
      for (let bx = 0; bx < w; bx += 8) {
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++)
            block[y * 8 + x] = img.data[((by + y) * w + bx + x) * 4 + c] - 128
        }
        for (let v = 0; v < 8; v++) {
          for (let u = 0; u < 8; u++) {
            let s = 0
            for (let y = 0; y < 8; y++) {
              for (let x = 0; x < 8; x++) s += block[y * 8 + x] * cos[x * 8 + u] * cos[y * 8 + v]
            }
            const f = 0.25 * cu(u) * cu(v) * s
            coef[v * 8 + u] = Math.round(f / q[v * 8 + u]) * q[v * 8 + u]
          }
        }
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            let s = 0
            for (let v = 0; v < 8; v++) {
              for (let u = 0; u < 8; u++)
                s += cu(u) * cu(v) * coef[v * 8 + u] * cos[x * 8 + u] * cos[y * 8 + v]
            }
            data[((by + y) * w + bx + x) * 4 + c] = Math.round(0.25 * s + 128)
          }
        }
      }
    }
  }
  return { width: w, height: h, data }
}

/** FNV-1a (64-bit) over the little-endian bytes of `bits`, as 16 hex digits. */
export function fnv(bits: Uint32Array): string {
  let h = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const mask = (1n << 64n) - 1n
  for (let i = 0; i < bits.length; i++) {
    const b = bits[i]
    for (let k = 0; k < 4; k++) {
      h ^= BigInt((b >>> (8 * k)) & 0xff)
      h = (h * prime) & mask
    }
  }
  return h.toString(16).padStart(16, '0')
}

/** The bit patterns of a single-precision array. */
export function bitsOf(f: Float32Array): Uint32Array {
  return new Uint32Array(f.buffer, f.byteOffset, f.length)
}

/** The scenes the parity fixtures were measured on, by name. */
export const PARITY_SCENES: Record<string, () => RasterImage> = {
  'disc-128': () => disc(128, 40),
  'icon-128': () => iconScene(128),
  'icon-256': () => iconScene(256),
  'icon-128-clear': () => iconScene(128, true),
  'icon-bicubic4': () => upscale(iconScene(128), 4, 'bicubic'),
  'icon-bilinear2': () => upscale(iconScene(128), 2, 'bilinear'),
  'icon-lanczos3': () => upscale(iconScene(96), 3, 'lanczos3'),
  'icon-blur2': () => blur(iconScene(256), 2),
  'icon-jpeg40': () => blockCompress(iconScene(256), 40),
  'glow-256': () => glowScene(256),
  'disc-sparse-144': () => disc(144, Math.sqrt(38 / Math.PI)),
}
