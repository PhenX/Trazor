/**
 * Aggregates and paired comparison for gate runs.
 *
 * A run's headline is the family-macro mean (the mean of each family's mean),
 * so a large family cannot drown a small one. Two runs over the same items are
 * compared by a paired, family-stratified bootstrap of the macro mean's relative
 * change (Efron & Tibshirani 1993; Koehn 2004 for paired bootstrap in system
 * comparison): items are resampled with replacement within each family, both
 * runs keep each draw's pair together, and the 2.5/97.5 % and one-sided 95 %
 * points of the relative change are read off. A change passes an axis when that
 * one-sided bound is below the axis margin (non-inferiority, Lakens 2017) and is
 * called better when the bound is below zero. Deterministic: seeded draws.
 */

export interface MetricRow {
  key: string
  corpus: string
  [metric: string]: number | string | undefined
}

export const AXES = [
  'de00',
  'gmsd',
  'fillDe00',
  'bandDe00',
  'edgeMiss',
  'edgeExtra',
  'inkMiss',
  'inkExtra',
  'ratio',
  'turning',
  'selfRes',
] as const
export type Axis = (typeof AXES)[number]

/** Non-inferiority margins (relative), per axis. */
export const MARGINS: Record<Axis, number> = {
  de00: 0.01,
  gmsd: 0.01,
  fillDe00: 0.02,
  bandDe00: 0.02,
  edgeMiss: 0.02,
  edgeExtra: 0.02,
  inkMiss: 0.03,
  inkExtra: 0.03,
  ratio: 0.03,
  turning: 0.02,
  selfRes: 0.01,
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number.NaN)

/** Per-family means and the family-macro mean of one metric. */
export function familyMeans(
  rows: MetricRow[],
  metric: string,
): { fam: Map<string, number>; macro: number } {
  const acc = new Map<string, { s: number; n: number }>()
  for (const r of rows) {
    const v = num(r[metric])
    if (Number.isNaN(v)) continue
    const a = acc.get(r.corpus) ?? { s: 0, n: 0 }
    a.s += v
    a.n++
    acc.set(r.corpus, a)
  }
  const fam = new Map<string, number>()
  let s = 0
  for (const [k, a] of [...acc].toSorted((p, q) => (p[0] < q[0] ? -1 : 1))) {
    fam.set(k, a.s / a.n)
    s += a.s / a.n
  }
  return { fam, macro: fam.size > 0 ? s / fam.size : Number.NaN }
}

export interface AxisCompare {
  axis: Axis
  base: number
  cand: number
  delta: number // relative change of the macro mean
  lo: number // 2.5 %
  hi: number // 97.5 %
  upper: number // one-sided 95 %
  verdict: 'better' | 'non-inferior' | 'worse'
}

/** Paired family-stratified bootstrap of the macro mean's relative change, per axis. */
export function compareRuns(
  base: MetricRow[],
  cand: MetricRow[],
  reps = 2000,
  seed = 20261008,
): AxisCompare[] {
  const cMap = new Map(cand.map((r) => [r.key, r]))
  const pairs = base
    .filter((r) => cMap.has(r.key))
    .map((r) => [r, cMap.get(r.key) as MetricRow] as const)
  const byFam = new Map<string, (readonly [MetricRow, MetricRow])[]>()
  for (const p of pairs) {
    const list = byFam.get(p[0].corpus) ?? []
    list.push(p)
    byFam.set(p[0].corpus, list)
  }
  const fams = [...byFam.keys()].toSorted()
  const out: AxisCompare[] = []
  for (const axis of AXES) {
    const valid = (p: readonly [MetricRow, MetricRow]): boolean =>
      !Number.isNaN(num(p[0][axis])) && !Number.isNaN(num(p[1][axis]))
    const famPairs = fams.map((f) => (byFam.get(f) ?? []).filter(valid)).filter((l) => l.length > 0)
    if (famPairs.length === 0) continue
    const macro = (
      pick: (fi: number, i: number) => readonly [MetricRow, MetricRow],
      sizes: number[],
    ): [number, number] => {
      let sb = 0
      let sc = 0
      for (let f = 0; f < sizes.length; f++) {
        let fb = 0
        let fc = 0
        for (let i = 0; i < sizes[f]; i++) {
          const p = pick(f, i)
          fb += num(p[0][axis])
          fc += num(p[1][axis])
        }
        sb += fb / sizes[f]
        sc += fc / sizes[f]
      }
      return [sb / sizes.length, sc / sizes.length]
    }
    const sizes = famPairs.map((l) => l.length)
    const [mb, mc] = macro((f, i) => famPairs[f][i], sizes)
    const delta = (mc - mb) / Math.max(1e-12, Math.abs(mb))
    const rand = mulberry32(seed)
    const ds: number[] = []
    for (let r = 0; r < reps; r++) {
      const draws = famPairs.map((l) =>
        Array.from({ length: l.length }, () => l[Math.floor(rand() * l.length)]),
      )
      const [b, c] = macro((f, i) => draws[f][i], sizes)
      ds.push((c - b) / Math.max(1e-12, Math.abs(b)))
    }
    ds.sort((a, b) => a - b)
    const q = (p: number): number =>
      ds[Math.min(ds.length - 1, Math.max(0, Math.floor(p * ds.length)))]
    const upper = q(0.95)
    out.push({
      axis,
      base: mb,
      cand: mc,
      delta,
      lo: q(0.025),
      hi: q(0.975),
      upper,
      verdict: upper < 0 ? 'better' : upper < MARGINS[axis] ? 'non-inferior' : 'worse',
    })
  }
  return out
}
