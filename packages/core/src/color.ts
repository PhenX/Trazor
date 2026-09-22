/**
 * Color math. Perceptual operations use Oklab (Björn Ottosson, 2020), which
 * behaves far better than sRGB or CIELAB for clustering and nearest-color
 * queries: equal distances are close to equally perceptible.
 */

/** sRGB electro-optical transfer function, component in [0, 1]. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** Inverse sRGB transfer function, component in [0, 1]. */
export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

/**
 * sRGB (components in [0, 1]) → Oklab. Returns [L, a, b] with L in [0, 1].
 */
export function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/**
 * Oklab → sRGB components in [0, 1], clamped to gamut.
 */
export function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
  const l = L + 0.3963377774 * a + 0.2158037573 * b
  const m = L - 0.1055613458 * a - 0.0638541728 * b
  const s = L - 0.0894841775 * a - 1.291485548 * b

  const l3 = l * l * l
  const m3 = m * m * m
  const s3 = s * s * s

  const lr = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
  const lg = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
  const lb = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3

  return [clamp01(linearToSrgb(lr)), clamp01(linearToSrgb(lg)), clamp01(linearToSrgb(lb))]
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** Squared Euclidean distance in Oklab — cheap perceptual difference. */
export function deltaEOkSq(
  L1: number,
  a1: number,
  b1: number,
  L2: number,
  a2: number,
  b2: number,
): number {
  const dL = L1 - L2
  const da = a1 - a2
  const db = b1 - b2
  return dL * dL + da * da + db * db
}

/** Perceptual difference (Euclidean distance in Oklab). */
export function deltaEOk(
  L1: number,
  a1: number,
  b1: number,
  L2: number,
  a2: number,
  b2: number,
): number {
  return Math.sqrt(deltaEOkSq(L1, a1, b1, L2, a2, b2))
}

/** `#rrggbb` (or `#rgb`, case-insensitive) → [r, g, b] bytes. Invalid input → null. */
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ]
}

function byteToHex(v: number): string {
  const i = Math.max(0, Math.min(255, Math.round(v)))
  return i.toString(16).padStart(2, '0')
}

/** [r, g, b] bytes → `#rrggbb`. Values are rounded and clamped. */
export function rgbToHex(r: number, g: number, b: number): string {
  return `#${byteToHex(r)}${byteToHex(g)}${byteToHex(b)}`
}

/** Oklab triple → `#rrggbb`. */
export function oklabToHex(L: number, a: number, b: number): string {
  const [r, g, bl] = oklabToRgb(L, a, b)
  return rgbToHex(r * 255, g * 255, bl * 255)
}

/** Relative luminance proxy: the Oklab L component of an sRGB byte triple. */
export function oklabLightness(r: number, g: number, b: number): number {
  return rgbToOklab(r / 255, g / 255, b / 255)[0]
}

// ---- CIELAB / CIEDE2000 ----
// CIEDE2000 (Sharma, Wu & Dalal, "The CIEDE2000 color-difference formula",
// Color Research & Application 30(1), 2005) is the industrial color-difference
// standard, tuned so a unit is one just-noticeable difference across the whole
// gamut. Oklab distance is close to uniform for clustering but is far stricter
// than a JND near black and looser in saturated hues, so a near-duplicate
// threshold expressed in Oklab merges too eagerly in the shadows and too timidly
// in vivid color; CIEDE2000 is the floor that matches perception evenly.

/** D65 reference white (2° observer), the standard illuminant for CIELAB. */
const D65_X = 0.95047
const D65_Z = 1.08883

/** CIELAB nonlinearity: the CIE 1976 cube-root with the linear toe (216/24389, 24389/27). */
function labF(t: number): number {
  return t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29
}

/**
 * sRGB (components in [0, 1]) → CIELAB (D65). Returns [L*, a*, b*], L* in
 * [0, 100]. The linear-light XYZ uses the sRGB primaries; the L* transfer uses
 * the CIE 1976 cube-root with the linear toe (216/24389, 24389/27).
 */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / D65_X
  const y = 0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb
  const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / D65_Z
  const fx = labF(x)
  const fy = labF(y)
  const fz = labF(z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

const DEG = Math.PI / 180

/**
 * CIEDE2000 color difference ΔE₀₀ between two CIELAB colors (Sharma, Wu & Dalal
 * 2005), with all weighting factors k_L = k_C = k_H = 1. Verified against the
 * paper's published test pairs (`packages/core/test/color.test.ts`).
 */
export function ciede2000(
  L1: number,
  a1: number,
  b1: number,
  L2: number,
  a2: number,
  b2: number,
): number {
  const c1 = Math.hypot(a1, b1)
  const c2 = Math.hypot(a2, b2)
  const cm = (c1 + c2) / 2
  const cm7 = cm ** 7
  const G = 0.5 * (1 - Math.sqrt(cm7 / (cm7 + 25 ** 7)))
  const ap1 = a1 * (1 + G)
  const ap2 = a2 * (1 + G)
  const cp1 = Math.hypot(ap1, b1)
  const cp2 = Math.hypot(ap2, b2)
  const hp = (a: number, b: number): number => {
    if (a === 0 && b === 0) return 0
    const h = Math.atan2(b, a) / DEG
    return h < 0 ? h + 360 : h
  }
  const hp1 = hp(ap1, b1)
  const hp2 = hp(ap2, b2)
  const dL = L2 - L1
  const dC = cp2 - cp1
  let dh = 0
  if (cp1 * cp2 !== 0) {
    dh = hp2 - hp1
    if (dh > 180) dh -= 360
    else if (dh < -180) dh += 360
  }
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dh / 2) * DEG)
  const Lm = (L1 + L2) / 2
  const Cm = (cp1 + cp2) / 2
  let Hm = hp1 + hp2
  if (cp1 * cp2 !== 0) {
    if (Math.abs(hp1 - hp2) > 180) Hm += hp1 + hp2 < 360 ? 360 : -360
    Hm /= 2
  }
  const T =
    1 -
    0.17 * Math.cos((Hm - 30) * DEG) +
    0.24 * Math.cos(2 * Hm * DEG) +
    0.32 * Math.cos((3 * Hm + 6) * DEG) -
    0.2 * Math.cos((4 * Hm - 63) * DEG)
  const dTheta = 30 * Math.exp(-(((Hm - 275) / 25) ** 2))
  const Cm7 = Cm ** 7
  const Rc = 2 * Math.sqrt(Cm7 / (Cm7 + 25 ** 7))
  const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2)
  const Sc = 1 + 0.045 * Cm
  const Sh = 1 + 0.015 * Cm * T
  const Rt = -Math.sin(2 * dTheta * DEG) * Rc
  const l = dL / Sl
  const c = dC / Sc
  const h = dH / Sh
  return Math.sqrt(l * l + c * c + h * h + Rt * c * h)
}

/**
 * CIEDE2000 between two sRGB byte triples (0–255), through {@link rgbToLab}. The
 * near-duplicate palette floor is stated in these perceptually even units.
 */
export function ciede2000Rgb(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
): number {
  const [L1, a1, bb1] = rgbToLab(r1 / 255, g1 / 255, b1 / 255)
  const [L2, a2, bb2] = rgbToLab(r2 / 255, g2 / 255, b2 / 255)
  return ciede2000(L1, a1, bb1, L2, a2, bb2)
}
