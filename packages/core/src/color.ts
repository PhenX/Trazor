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
