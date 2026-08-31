import { describe, expect, it } from 'vitest'
import { type TrazorMetrics, compareReports, overallVerdict, renderReport } from './ab-report'

/** Build a one-row report at a given metric level (fields not set default sane). */
function report(rows: Array<{ family: string; image: string } & Partial<TrazorMetrics>>) {
  return {
    rows: rows.map((r) => ({
      family: r.family,
      image: r.image,
      trazor: {
        dE: r.dE ?? 0.02,
        edgeDE: r.edgeDE ?? 0.03,
        p95: r.p95 ?? 0.04,
        spurious: r.spurious ?? 0.015,
        nodes: r.nodes ?? 1000,
        bytes: r.bytes ?? 10000,
      },
    })),
  }
}

describe('A/B verdict', () => {
  it('PASSes a clean win — both primaries improve, none regress', () => {
    const base = report([{ family: 'illustration', image: 'a.png', dE: 0.02, spurious: 0.015 }])
    const cand = report([{ family: 'illustration', image: 'a.png', dE: 0.017, spurious: 0.012 }])
    expect(compareReports(base, cand).verdict).toBe('PASS')
  })

  it('FAILs a better mean bought with worse spurious hue (the trap this guards)', () => {
    // Whole-image ΔE drops, but the change invents a hue at a seam — the exact
    // case a mean-only glance would wave through.
    const base = report([{ family: 'illustration', image: 'a.png', dE: 0.021, spurious: 0.012 }])
    const cand = report([{ family: 'illustration', image: 'a.png', dE: 0.019, spurious: 0.016 }])
    expect(compareReports(base, cand).verdict).toBe('FAIL')
  })

  it('FAILs when the overall mean ΔE regresses', () => {
    const base = report([{ family: 'illustration', image: 'a.png', dE: 0.02, spurious: 0.015 }])
    const cand = report([{ family: 'illustration', image: 'a.png', dE: 0.024, spurious: 0.015 }])
    expect(compareReports(base, cand).verdict).toBe('FAIL')
  })

  it('FAILs when two or more families regress a primary metric', () => {
    const base = report([
      { family: 'illustration', image: 'a.png', dE: 0.02 },
      { family: 'photo', image: 'b.png', spurious: 0.015 },
    ])
    const cand = report([
      { family: 'illustration', image: 'a.png', dE: 0.025 },
      { family: 'photo', image: 'b.png', spurious: 0.02 },
    ])
    expect(compareReports(base, cand).verdict).toBe('FAIL')
  })

  it('holds sub-noise wobble as unchanged → not a false win or loss', () => {
    const base = report([{ family: 'illustration', image: 'a.png', dE: 0.02, spurious: 0.015 }])
    const cand = report([
      { family: 'illustration', image: 'a.png', dE: 0.020_05, spurious: 0.015_1 },
    ])
    const res = compareReports(base, cand)
    expect(res.overall.metrics.dE.dir).toBe('held')
    expect(res.overall.metrics.spurious.dir).toBe('held')
    // Nothing moved → not a PASS (no improvement) and not a FAIL (no regression).
    expect(res.verdict).toBe('MIXED')
  })

  it('matches rows by image name and ignores unpaired rows', () => {
    const base = report([
      { family: 'illustration', image: 'a.png', dE: 0.02 },
      { family: 'illustration', image: 'only-in-base.png', dE: 0.01 },
    ])
    const cand = report([
      { family: 'illustration', image: 'a.png', dE: 0.017 },
      { family: 'illustration', image: 'only-in-cand.png', dE: 0.5 },
    ])
    const res = compareReports(base, cand)
    expect(res.overall.n).toBe(1)
    expect(res.perImage.map((p) => p.image)).toEqual(['a.png'])
    expect(res.verdict).toBe('PASS')
  })

  it('renders a per-image section, biggest ΔE mover first', () => {
    const base = report([
      { family: 'illustration', image: 'small-move.png', dE: 0.02 },
      { family: 'illustration', image: 'big-move.png', dE: 0.06 },
    ])
    const cand = report([
      { family: 'illustration', image: 'small-move.png', dE: 0.019 },
      { family: 'illustration', image: 'big-move.png', dE: 0.02 },
    ])
    const out = renderReport(compareReports(base, cand))
    expect(out).toContain('per image')
    expect(out).toContain('VERDICT:')
    // The larger ΔE swing (big-move) is listed before the smaller one.
    expect(out.indexOf('big-move.png')).toBeLessThan(out.indexOf('small-move.png'))
  })

  it('overallVerdict: a per-family win with no regression PASSes even if overall holds', () => {
    const overall = {
      name: 'overall',
      n: 2,
      metrics: {
        dE: { base: 0.02, cand: 0.0199, dir: 'held' as const },
        spurious: { base: 0.015, cand: 0.015, dir: 'held' as const },
        edgeDE: { base: 0.03, cand: 0.03, dir: 'held' as const },
        p95: { base: 0.04, cand: 0.04, dir: 'held' as const },
        nodes: { base: 1000, cand: 1000, dir: 'held' as const },
      },
    }
    const fam = {
      name: 'regions',
      n: 1,
      metrics: {
        dE: { base: 0.04, cand: 0.03, dir: 'better' as const },
        spurious: { base: 0.02, cand: 0.018, dir: 'better' as const },
        edgeDE: { base: 0.03, cand: 0.03, dir: 'held' as const },
        p95: { base: 0.04, cand: 0.04, dir: 'held' as const },
        nodes: { base: 1000, cand: 1000, dir: 'held' as const },
      },
    }
    expect(overallVerdict(overall, [fam])).toBe('PASS')
  })
})
