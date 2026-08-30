export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function clampInt(v: number, lo: number, hi: number): number {
  return clamp(Math.round(v), lo, hi)
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Physical scale of an output whose `widthPx` viewBox pixels span `widthMm`
 * millimetres: millimetres per viewBox pixel. `widthMm` of 0/undefined derives
 * the width at 96 dpi (`widthPx / 96 * 25.4`), matching the SVG serializer.
 * Returns 0 for a degenerate width. Invert (`1 / mmPerPx`) for px-per-mm.
 */
export function mmPerPx(widthPx: number, widthMm?: number): number {
  if (!(widthPx > 0)) return 0
  const w = widthMm !== undefined && widthMm > 0 ? widthMm : (widthPx / 96) * 25.4
  return w / widthPx
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`assertion failed: ${message}`)
}

/** Monotonic-ish clock that works in browsers, workers and Node. */
export function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}
