// Seeded pseudo-randomness for reproducible dataset generation. Every draw comes
// from mulberry32 (Tommy Ettinger, public domain), matching @trazor/core, so
// a (seed, index) pair fully determines a sample and the same config regenerates
// the same dataset.

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// FNV-1a → 32-bit unsigned; stable across runs, for deriving seeds and split
// assignment from string ids.
export function hashString(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// Knuth multiplicative mix of a base seed and an index into a fresh 32-bit seed.
export function seedFor(base, index) {
  return (Math.imul((base ^ index) >>> 0, 2654435761) + 0x9e3779b9) >>> 0
}

export function uniform(rng, lo, hi) {
  return lo + (hi - lo) * rng()
}

// Inclusive integer in [lo, hi].
export function int(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1))
}

export function chance(rng, p) {
  return rng() < p
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)]
}

// Standard normal via the Box–Muller transform.
export function gaussian(rng, mean = 0, std = 1) {
  let u = 0
  let v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
