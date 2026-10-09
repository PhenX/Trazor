/**
 * Synthetic fill scenes for the fill tests and the inkvec parity fixtures: an
 * image over white (encoded sRGB, three per pixel, 8-bit levels unless stated)
 * and a label map whose label 1 is the region under test. Scene geometry is
 * given in pixel indices; a pixel's center in fill coordinates is its index
 * plus ½.
 */
import { mulberry32 } from '@trazor/core'
import { bicLambda } from '../../src/fill/select'

export interface FillScene {
  name: string
  w: number
  h: number
  rgb: Float32Array
  labels: Int32Array
  sigma: number
  lambda: number
  /** Inks per label (three per ink), for the evidence test; empty when unused. */
  inks: Float64Array
}

const BG = [0.95, 0.95, 0.95]

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

/** An 8-bit level of `v`, clamped. */
export function quantize(v: number): number {
  return Math.round(Math.min(Math.max(v, 0), 1) * 255) / 255
}

/** The color at `t` between two sRGB stops, interpolated in linear light. */
export function rampLinear(c0: readonly number[], c1: readonly number[], t: number): number[] {
  const u = Math.min(Math.max(t, 0), 1)
  return c0.map((a, k) => {
    const la = srgbToLinear(a)
    const lb = srgbToLinear(c1[k])
    return linearToSrgb(la + (lb - la) * u)
  })
}

/** The color at `t` between two sRGB stops, interpolated in sRGB. */
export function rampSrgb(c0: readonly number[], c1: readonly number[], t: number): number[] {
  const u = Math.min(Math.max(t, 0), 1)
  return c0.map((a, k) => a + (c1[k] - a) * u)
}

/** Build a scene from a per-pixel callback returning the color and label (`null` for the background). */
function render(
  name: string,
  w: number,
  h: number,
  px: (x: number, y: number) => readonly number[] | null,
  sigma = 1 / 255,
  quantized = true,
): FillScene {
  const rgb = new Float32Array(3 * w * h)
  const labels = new Int32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      const c = px(x, y)
      const v = c ?? BG
      for (let k = 0; k < 3; k++) rgb[3 * p + k] = quantized ? quantize(v[k]) : v[k]
      labels[p] = c === null ? 0 : 1
    }
  }
  let n = 0
  for (const l of labels) if (l === 1) n++
  return { name, w, h, rgb, labels, sigma, lambda: bicLambda(n), inks: new Float64Array(0) }
}

const inSquare = (x: number, y: number): boolean => x >= 8 && x < 88 && y >= 8 && y < 88

/** Unit-sigma pseudo-Gaussian noise (sum of 12 uniforms). */
function gaussian(rand: () => number): number {
  let s = 0
  for (let i = 0; i < 12; i++) s += rand()
  return s - 6
}

/** A flat color with 1-level Gaussian noise on an 80 px square. */
export function noisyFlat(): FillScene {
  const rand = mulberry32(7)
  const base = [0.35, 0.55, 0.7]
  return render('noisy-flat', 96, 96, (x, y) =>
    inSquare(x, y) ? base.map((v) => v + gaussian(rand) / 255) : null,
  )
}

export const LINEAR_C0 = [0.17, 0.42, 0.69]
export const LINEAR_C1 = [0.96, 0.68, 0.33]

/** A horizontal ramp in linear light, `t = x / 95`, on an 80 px square. */
export function horizontalLinear(): FillScene {
  return render('horizontal-linear', 96, 96, (x, y) =>
    inSquare(x, y) ? rampLinear(LINEAR_C0, LINEAR_C1, x / 95) : null,
  )
}

/** A ramp in linear light along 32°. */
export function obliqueLinear(): FillScene {
  const a = (32 * Math.PI) / 180
  const c0 = [0.1, 0.1, 0.5]
  const c1 = [0.9, 0.9, 0.2]
  return render('oblique-linear', 96, 96, (x, y) =>
    inSquare(x, y)
      ? rampLinear(c0, c1, 0.5 + ((x - 47.5) * Math.cos(a) + (y - 47.5) * Math.sin(a)) / 100)
      : null,
  )
}

/** The same horizontal ramp interpolated in sRGB. */
export function srgbLinear(): FillScene {
  return render('srgb-linear', 96, 96, (x, y) =>
    inSquare(x, y) ? rampSrgb([0.05, 0.3, 0.9], [0.95, 0.85, 0.1], x / 95) : null,
  )
}

export const RADIAL_CENTRE = [50.3, 44.7]

/** A radial ramp in linear light about (50.3, 44.7) (pixel indices), radius 70, on a disc of radius 40. */
export function radial(): FillScene {
  const c0 = [1, 0.98, 0.9]
  const c1 = [0.72, 0.47, 0.12]
  const [cx, cy] = RADIAL_CENTRE
  return render('radial', 96, 96, (x, y) => {
    const rho = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    return rho <= 40 ? rampLinear(c0, c1, rho / 70) : null
  })
}

export const ELLIPSE = { cx: 40.5, cy: 38, angle: (25 * Math.PI) / 180, aspect: 2 }

/** An elliptical ramp in linear light (center (40.5, 38) in pixel indices, 25°, aspect 2) on an 80 px image. */
export function ellipse(): FillScene {
  const { cx, cy, angle, aspect } = ELLIPSE
  const sn = Math.sin(angle)
  const cs = Math.cos(angle)
  return render('ellipse', 80, 80, (x, y) => {
    const dx = x - cx
    const dy = y - cy
    const u = dx * cs + dy * sn
    const v = (-dx * sn + dy * cs) * aspect
    const rho = Math.sqrt(u * u + v * v)
    return rho <= 36 ? rampLinear([1, 0.95, 0.8], [0.55, 0.15, 0.05], rho / 40) : null
  })
}

/** Solid near-black, lightening over its last three columns only (a lost feature, not shading). */
export function lostFeature(): FillScene {
  return render('lost-feature', 40, 40, (x, y) => {
    if (x < 4 || x >= 36 || y < 4 || y >= 36) return null
    const v = x >= 33 ? 0.02 + 0.2 * (x - 32) : 0.02
    return [v, v, v]
  })
}

/** A three-stop horizontal sRGB profile with its interior stop at 0.4 of the region. */
export function multiStop(): FillScene {
  const c0 = [0.9, 0.2, 0.1]
  const cm = [0.95, 0.85, 0.3]
  const c1 = [0.1, 0.3, 0.8]
  return render('multi-stop', 96, 96, (x, y) => {
    if (!inSquare(x, y)) return null
    const t = (x - 8) / 79
    return t < 0.4 ? rampSrgb(c0, cm, t / 0.4) : rampSrgb(cm, c1, (t - 0.4) / 0.6)
  })
}

/** A circular radial with a flat core (to radius 10) and a ramp to the rim, the center off the disc's middle. */
export function clampedRadial(): FillScene {
  const cx = 44.3
  const cy = 41.6
  return render('clamped-radial', 90, 90, (x, y) => {
    if (Math.sqrt((x - 45) ** 2 + (y - 45) ** 2) > 36) return null
    const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    const k = Math.max(d - 10, 0) / 30
    return rampSrgb([0.98, 0.8, 0.3], [0.7, 0.2, 0.1], k)
  })
}

/** Two flat colors side by side in one region: a step, not a ramp. */
export function step(): FillScene {
  return render('step', 64, 48, (x, y) => {
    if (x < 4 || x >= 60 || y < 4 || y >= 44) return null
    return x < 32 ? [0.2, 0.3, 0.6] : [0.55, 0.65, 0.85]
  })
}

/** A ramp across the region that rounds to two adjacent 8-bit levels, half each: invisible. */
export function oneLevel(): FillScene {
  return render(
    'one-level',
    96,
    96,
    (x, y) => (inSquare(x, y) ? [(127.75 + (x - 8) / 79) / 255, 0.4, 0.3] : null),
    0.5 / 255,
  )
}

/**
 * A black disc on white with exact anti-aliased coverage (8×8 supersampled),
 * labeled by the nearer ink (0 white, 1 black): the rim is blends. Inks are
 * given for the evidence test; not quantized.
 */
export function aaDisc(): FillScene {
  const w = 40
  const h = 40
  const cx = 19.6
  const cy = 20.3
  const r = 12.4
  const s = render(
    'aa-disc',
    w,
    h,
    (x, y) => {
      let inside = 0
      for (let j = 0; j < 8; j++) {
        for (let i = 0; i < 8; i++) {
          const px = x + (i + 0.5) / 8
          const py = y + (j + 0.5) / 8
          if ((px - cx - 0.5) ** 2 + (py - cy - 0.5) ** 2 <= r * r) inside++
        }
      }
      const a = inside / 64
      return [1 - a, 1 - a, 1 - a]
    },
    0.5 / 255,
    false,
  )
  for (let p = 0; p < w * h; p++) s.labels[p] = s.rgb[3 * p] < 0.5 ? 1 : 0
  return { ...s, inks: Float64Array.from([1, 1, 1, 0, 0, 0]) }
}

/**
 * A black disc on white whose edge is a 4 px soft ramp, labeled by the nearer
 * ink (0 white, 1 black): the blends reach two pixels into the disc, deeper than
 * the interior rule excludes, and lighten its rim. Inks are given for the
 * evidence test.
 */
export function softDisc(): FillScene {
  const w = 48
  const h = 48
  const s = render(
    'soft-disc',
    w,
    h,
    (x, y) => {
      const d = Math.hypot(x - 23.3, y - 24.1)
      const a = Math.min(Math.max((16 - d) / 4 + 0.5, 0), 1)
      return [1 - a, 1 - a, 1 - a]
    },
    0.5 / 255,
  )
  for (let p = 0; p < w * h; p++) s.labels[p] = s.rgb[3 * p] < 0.5 ? 1 : 0
  return { ...s, inks: Float64Array.from([1, 1, 1, 0, 0, 0]) }
}

/** Every scene, for the parity fixtures. */
export const SCENES: readonly (() => FillScene)[] = [
  noisyFlat,
  horizontalLinear,
  obliqueLinear,
  srgbLinear,
  radial,
  ellipse,
  lostFeature,
  multiStop,
  clampedRadial,
  step,
  oneLevel,
  aaDisc,
  softDisc,
]
