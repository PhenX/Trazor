import { describe, expect, it } from 'vitest'
import { createMask } from '@trazor/core'
import { decomposeMask } from '../src/crack'
import { solveBoundary } from '../src/solve'
import type { SignedField } from '../src/refine'
import type { FlatPoints } from '../src/paths'

const N = 128
const CX = 64
const CY = 64
const R = 40

/** Exact coverage of pixel (x, y) by the disk, supersampled. */
function diskCoverage(x: number, y: number): number {
  const sub = 8
  let c = 0
  for (let sy = 0; sy < sub; sy++) {
    for (let sx = 0; sx < sub; sx++) {
      if (Math.hypot(x + (sx + 0.5) / sub - CX, y + (sy + 0.5) / sub - CY) < R) c++
    }
  }
  return c / (sub * sub)
}

/** Signed coverage field of the disk (positive inside), in [-0.5, 0.5]. */
function diskField(): SignedField {
  const data = new Float32Array(N * N)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) data[y * N + x] = diskCoverage(x, y) - 0.5
  }
  return { width: N, height: N, at: (x, y) => data[y * N + x] }
}

/** The disk's lattice crack ring (threshold at half coverage). */
function diskRing(): FlatPoints {
  const mask = createMask(N, N)
  for (let p = 0; p < N * N; p++) {
    mask.data[p] = diskCoverage(p % N, (p / N) | 0) >= 0.5 ? 1 : 0
  }
  return decomposeMask(mask, 'minority', 1)[0].points
}

function radii(pts: FlatPoints): { mean: number; std: number; max: number } {
  let s = 0
  let s2 = 0
  let max = 0
  const n = pts.length >> 1
  for (let i = 0; i < n; i++) {
    const r = Math.hypot(pts[i * 2] - CX, pts[i * 2 + 1] - CY)
    s += r
    s2 += r * r
    max = Math.max(max, Math.abs(r - R))
  }
  const mean = s / n
  return { mean, std: Math.sqrt(Math.max(0, s2 / n - mean * mean)), max }
}

describe('boundary solve', () => {
  it('drives a lattice ring onto the true circle by matching coverage', () => {
    const ring = diskRing()
    const n = ring.length >> 1
    const free = new Array(n).fill(true)
    const before = radii(ring)
    const solved = solveBoundary(ring, diskField(), free, true, { maxIters: 24 })
    const after = radii(solved)
    // The lattice ring's vertices scatter by the staircase (~0.3 px); the solve
    // pulls every point onto the coverage its pixel reads, so they sit on the
    // true circle to a fraction of a pixel.
    expect(after.std).toBeLessThan(before.std * 0.6)
    expect(Math.abs(after.mean - R)).toBeLessThan(0.1)
    expect(after.max).toBeLessThan(0.4)
  })

  it('leaves pinned endpoints exactly where they are', () => {
    const ring = diskRing()
    const n = ring.length >> 1
    // Treat it as an open chain: pin the first and last points.
    const free = new Array(n).fill(true)
    free[0] = false
    free[n - 1] = false
    const solved = solveBoundary(ring, diskField(), free, false, { maxIters: 12 })
    expect(solved[0]).toBe(ring[0])
    expect(solved[1]).toBe(ring[1])
    expect(solved[(n - 1) * 2]).toBe(ring[(n - 1) * 2])
    expect(solved[(n - 1) * 2 + 1]).toBe(ring[(n - 1) * 2 + 1])
  })

  it('is deterministic', () => {
    const ring = diskRing()
    const n = ring.length >> 1
    const free = new Array(n).fill(true)
    const a = solveBoundary(ring, diskField(), free, true, { maxIters: 16 })
    const b = solveBoundary(ring, diskField(), free, true, { maxIters: 16 })
    expect(a).toEqual(b)
  })

  it('leaves a hard-edged ring (no anti-aliasing) untouched', () => {
    const ring = diskRing()
    const n = ring.length >> 1
    const free = new Array(n).fill(true)
    // A binary field: ±0.5 only, no partial pixels.
    const hard: SignedField = {
      width: N,
      height: N,
      at: (x, y) => (diskCoverage(x, y) >= 0.5 ? 0.5 : -0.5),
    }
    const solved = solveBoundary(ring, hard, free, true, { maxIters: 16 })
    expect(solved).toBe(ring)
  })
})
