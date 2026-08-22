export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function clampInt(v: number, lo: number, hi: number): number {
  return clamp(Math.round(v), lo, hi)
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`assertion failed: ${message}`)
}

/** Monotonic-ish clock that works in browsers, workers and Node. */
export function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}
