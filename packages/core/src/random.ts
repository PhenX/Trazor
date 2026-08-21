/**
 * Deterministic PRNG (mulberry32). The pipeline must be reproducible: the same
 * image and settings always produce byte-identical SVG, so anything sampled
 * (k-means seeding, pixel sampling) draws from a fixed-seed generator.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
