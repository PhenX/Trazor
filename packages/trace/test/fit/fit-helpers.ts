/**
 * Shared inputs for the curve-fit core tests: a 64-bit LCG whose outputs are
 * exact dyadic numbers (the generator inkvec's own tests use), so the same
 * inputs can be rebuilt bit for bit by the reference implementation.
 */

const MASK = (1n << 64n) - 1n

/** A deterministic generator of numbers in `[0, 1)`, 53 bits each. */
export function lcg(seed: number): () => number {
  let st = BigInt(seed)
  return () => {
    st = (st * 6364136223846793005n + 1442695040888963407n) & MASK
    return Number(st >> 11n) / 2 ** 53
  }
}

/** Interleaved points from `[x, y]` pairs. */
export function flat(pairs: readonly (readonly [number, number])[]): Float64Array {
  const out = new Float64Array(2 * pairs.length)
  pairs.forEach(([x, y], k) => {
    out[2 * k] = x
    out[2 * k + 1] = y
  })
  return out
}

/** `count + 1` points from `a` to `b` inclusive, evenly spaced. */
export function run(
  a: readonly [number, number],
  b: readonly [number, number],
  count: number,
): [number, number][] {
  const out: [number, number][] = []
  for (let k = 0; k <= count; k++) {
    const t = k / count
    out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])])
  }
  return out
}

/** `n` points evenly round a circle, counter-clockwise in the raw frame. */
export function circlePoints(n: number, cx: number, cy: number, r: number): [number, number][] {
  const out: [number, number][] = []
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return out
}

/** Unit vector at `deg` degrees. */
export function dir(deg: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180
  return { x: Math.cos(a), y: Math.sin(a) }
}

/** Relative closeness, against `max(1, |want|)`. */
export function near(got: number, want: number, tol: number): boolean {
  return Math.abs(got - want) <= tol * Math.max(1, Math.abs(want))
}
