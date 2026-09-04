import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@trazor/core'
import { NM, growRamps } from '../src/gradient'

/**
 * `growRamps` is the agglomerative merge that assembles ramp units into regions:
 * each round it picks the lowest (score, a, b) candidate — adjacent or sharing a
 * neighbor — whose verification passes, merges b into a, and continues, with
 * screening scores and null verifications cached per pair. The shipping version
 * maintains that candidate set incrementally; this pins it to a self-contained,
 * restart-from-scratch reference that re-enumerates and re-screens every pair
 * each round, so the two must return an identical result — the same regions, the
 * same member order, the same rep, the same built payload — on many random
 * inputs. `screen` and `verify` here are deterministic functions of the member
 * set, standing in for the real closed-form screen and pixel-level verify.
 */

type Built = { tag: number }

interface RefCluster {
  members: number[]
  acc: Float64Array
  adj: Set<number>
}

/**
 * Reference merge: a verbatim restart-from-scratch copy of the original
 * `growRamps` (re-enumerate, re-screen and re-sort every pair each round; only
 * verifications are cached, and the whole cache is swept for stale keys per
 * merge). The shipping `growRamps` must match it byte for byte.
 */
function referenceGrowRamps<T>(
  m: Float64Array,
  adj: readonly number[][],
  seeds: readonly number[],
  claimed: Int32Array,
  minArea: number,
  screen: (trial: Float64Array, members: readonly number[]) => number,
  verify: (members: readonly number[], final: boolean) => T | null,
  count: number,
): { members: number[]; rep: number; built: T }[] {
  const rootOf = new Map<number, number>()
  const clusters = new Map<number, RefCluster>()
  for (const seed of seeds) {
    if (claimed[seed] >= 0) continue
    const acc = new Float64Array(NM)
    for (let j = 0; j < NM; j++) acc[j] = m[seed * NM + j]
    clusters.set(seed, { members: [seed], acc, adj: new Set() })
    rootOf.set(seed, seed)
  }
  for (const [root, c] of clusters)
    for (const mem of c.members)
      for (const nb of adj[mem]) {
        const nr = rootOf.get(nb)
        if (nr !== undefined && nr !== root) c.adj.add(nr)
      }

  const trial = new Float64Array(NM)
  const cache = new Map<number, T | null>()
  for (;;) {
    const pairs: [number, number, number][] = []
    const seen = new Set<number>()
    const consider = (a: number, ca: RefCluster, b: number): void => {
      if (b <= a) return
      const key = a * count + b
      if (seen.has(key) || cache.get(key) === null) return
      seen.add(key)
      const cb = clusters.get(b)!
      for (let j = 0; j < NM; j++) trial[j] = ca.acc[j] + cb.acc[j]
      const score = screen(trial, ca.members.concat(cb.members))
      if (Number.isFinite(score)) pairs.push([score, a, b])
    }
    for (const [a, ca] of clusters) {
      for (const b of ca.adj) consider(a, ca, b)
      for (const x of ca.adj) for (const b of clusters.get(x)!.adj) if (b !== a) consider(a, ca, b)
    }
    pairs.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2])
    let merged = false
    for (const [, a, b] of pairs) {
      const key = a * count + b
      const ca = clusters.get(a)!
      const cb = clusters.get(b)!
      let built = cache.get(key)
      if (built === undefined) {
        built = verify(ca.members.concat(cb.members), false)
        cache.set(key, built)
      }
      if (built === null) continue
      for (let j = 0; j < NM; j++) ca.acc[j] += cb.acc[j]
      for (const mem of cb.members) {
        ca.members.push(mem)
        rootOf.set(mem, a)
      }
      ca.adj.delete(b)
      cb.adj.delete(a)
      for (const x of cb.adj) {
        ca.adj.add(x)
        const cx = clusters.get(x)!
        cx.adj.delete(b)
        cx.adj.add(a)
      }
      clusters.delete(b)
      const stale: number[] = []
      for (const k of cache.keys()) {
        const ka = Math.floor(k / count)
        const kb = k % count
        if (ka === a || ka === b || kb === a || kb === b) stale.push(k)
      }
      for (const k of stale) cache.delete(k)
      merged = true
      break
    }
    if (!merged) break
  }

  const supers: { members: number[]; rep: number; built: T }[] = []
  for (const [root, c] of clusters) {
    if (c.acc[0] < minArea) continue
    const built = verify(c.members, true)
    if (!built) continue
    for (const mem of c.members) claimed[mem] = 1
    supers.push({ members: c.members.slice(), rep: root, built })
  }
  return supers
}

/** 32-bit hash of a set of unit ids (order-independent: ids are sorted first). */
function hashMembers(members: readonly number[], salt: number): number {
  let h = salt >>> 0
  for (const id of [...members].sort((a, b) => a - b)) {
    h = Math.imul(h ^ (id + 0x9e3779b9), 0x85ebca6b) >>> 0
    h = (h ^ (h >>> 13)) >>> 0
  }
  return h >>> 0
}

/** A symmetric adjacency list from an unordered set of edges. */
function adjacencyOf(n: number, edges: Iterable<[number, number]>): number[][] {
  const sets: Set<number>[] = Array.from({ length: n }, () => new Set<number>())
  for (const [a, b] of edges) {
    if (a === b) continue
    sets[a].add(b)
    sets[b].add(a)
  }
  return sets.map((s) => [...s].sort((a, b) => a - b))
}

type Shape = 'chain' | 'grid' | 'clique' | 'disconnected' | 'random'

/** A random adjacency graph of one of several shapes, plus random per-unit moments. */
function randomGraph(
  rnd: () => number,
  n: number,
  shape: Shape,
): { adj: number[][]; m: Float64Array } {
  const edges: [number, number][] = []
  if (shape === 'chain') {
    for (let i = 1; i < n; i++) edges.push([i - 1, i])
  } else if (shape === 'grid') {
    const w = Math.max(1, Math.round(Math.sqrt(n)))
    for (let i = 0; i < n; i++) {
      if (i % w !== 0) edges.push([i - 1, i])
      if (i - w >= 0) edges.push([i - w, i])
    }
  } else if (shape === 'clique') {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) edges.push([i, j])
  } else if (shape === 'disconnected') {
    // Several small components with no edges between them.
    let i = 0
    while (i < n) {
      const size = 1 + Math.floor(rnd() * 5)
      for (let a = i; a < Math.min(n, i + size); a++)
        for (let b = a + 1; b < Math.min(n, i + size); b++) if (rnd() < 0.7) edges.push([a, b])
      i += size
    }
  } else {
    const density = 0.05 + rnd() * 0.2
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) if (rnd() < density) edges.push([i, j])
  }
  const m = new Float64Array(n * NM)
  for (let l = 0; l < n; l++) {
    m[l * NM] = 1 + Math.floor(rnd() * 40) // area (drives minArea and acc[0])
    for (let j = 1; j < NM; j++) m[l * NM + j] = (rnd() - 0.5) * 20
  }
  return { adj: adjacencyOf(n, edges), m }
}

/** Serialize supers for comparison: members (in order), rep, built tag. */
function serialize(supers: { members: number[]; rep: number; built: Built }[]): string {
  return supers.map((s) => `${s.rep}|${s.members.join(',')}|${s.built.tag}`).join(';')
}

describe('growRamps matches the restart-from-scratch reference', () => {
  const shapes: Shape[] = ['chain', 'grid', 'clique', 'disconnected', 'random']

  // `mode` chooses how the deterministic screen/verify accept or reject pairs.
  const modes = [
    { name: 'verify passes all, screen rejects none', screenSkip: 0, verifyFail: 0 },
    { name: 'verify fails a subset', screenSkip: 0, verifyFail: 0.35 },
    { name: 'screen rejects a subset', screenSkip: 0.25, verifyFail: 0 },
    { name: 'both reject a subset', screenSkip: 0.2, verifyFail: 0.3 },
  ] as const

  for (const shape of shapes) {
    for (const mode of modes) {
      it(`${shape} — ${mode.name}`, () => {
        for (let seed = 1; seed <= 20; seed++) {
          const rnd = mulberry32(seed * 131 + 7)
          // The reference is the slow restart-from-scratch algorithm, so keep the
          // dense shapes small; chains and grids stay larger to cover longer runs.
          const n =
            shape === 'clique'
              ? 4 + Math.floor(rnd() * 24)
              : shape === 'chain' || shape === 'grid'
                ? 6 + Math.floor(rnd() * 160)
                : 4 + Math.floor(rnd() * 70)
          const { adj, m } = randomGraph(rnd, n, shape)
          const count = n

          // Deterministic screen: a pseudo-random score in [0,1) from the member
          // set, non-finite for a fixed fraction of sets.
          const screen = (_trial: Float64Array, members: readonly number[]): number => {
            const h = hashMembers(members, 0x1234)
            if (mode.screenSkip > 0 && (h % 1000) / 1000 < mode.screenSkip) return Infinity
            return (h >>> 8) / 0x1000000
          }
          // Deterministic verify: null for a fixed fraction of sets, else a tag.
          const verify = (members: readonly number[], _final: boolean): Built | null => {
            const h = hashMembers(members, 0xabcd)
            if (mode.verifyFail > 0 && (h % 1000) / 1000 < mode.verifyFail) return null
            return { tag: h }
          }

          const minArea = seed % 3 === 0 ? 5 : 0
          // Some seeds start with a few units already claimed.
          const preClaim = (c: Int32Array): void => {
            if (seed % 4 === 0) for (let l = 0; l < n; l += 7) c[l] = 1
          }
          // A representative seed order: largest area first, id as tiebreak.
          const seeds = Array.from({ length: n }, (_, l) => l).sort(
            (a, b) => m[b * NM] - m[a * NM] || a - b,
          )

          const claimedRef = new Int32Array(n).fill(-1)
          preClaim(claimedRef)
          const ref = referenceGrowRamps(m, adj, seeds, claimedRef, minArea, screen, verify, count)

          const claimedNew = new Int32Array(n).fill(-1)
          preClaim(claimedNew)
          const got = growRamps<Built>(m, adj, seeds, claimedNew, minArea, screen, verify, count)

          expect(serialize(got)).toBe(serialize(ref))
          expect(Array.from(claimedNew)).toEqual(Array.from(claimedRef))
        }
      })
    }
  }
})
