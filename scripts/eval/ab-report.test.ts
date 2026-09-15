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
        gmsd: r.gmsd ?? 0.1,
        nodes: r.nodes ?? 1000,
        bytes: r.bytes ?? 10000,
      },
    })),
  }
}

/** A report with the GMSD field stripped — a pre-GMSD (old) report. */
function reportNoGmsd(rows: Array<{ family: string; image: string } & Partial<TrazorMetrics>>) {
  return {
    rows: report(rows).rows.map((r) => {
      const { gmsd: _gmsd, ...rest } = r.trazor
      return { ...r, trazor: rest }
    }),
  }
}

describe('A/B verdict — GMSD primary (default)', () => {
  it('PASSes when GMSD improves outside the tie band, guards held', () => {
    const base = report([{ family: 'photo', image: 'a.png', gmsd: 0.16 }])
    const cand = report([{ family: 'photo', image: 'a.png', gmsd: 0.1 }])
    expect(compareReports(base, cand).verdict).toBe('PASS')
  })

  it('FAILs when GMSD regresses outside the tie band', () => {
    const base = report([{ family: 'photo', image: 'a.png', gmsd: 0.1 }])
    const cand = report([{ family: 'photo', image: 'a.png', gmsd: 0.16 }])
    expect(compareReports(base, cand).verdict).toBe('FAIL')
  })

  it('holds a GMSD move inside the diverse tie band → MIXED, not a win', () => {
    // 0.005 < 0.014 (diverse band): the eye would not see it.
    const base = report([{ family: 'photo', image: 'a.png', gmsd: 0.1 }])
    const cand = report([{ family: 'photo', image: 'a.png', gmsd: 0.105 }])
    const res = compareReports(base, cand)
    expect(res.overall.gmsd?.dir).toBe('held')
    expect(res.verdict).toBe('MIXED')
  })

  it('applies a content-dependent band: a small GMSD drop wins on flat art, holds on photo', () => {
    // 0.0025 clears the flat band (0.0008) but not the diverse one (0.014).
    const flatBase = report([{ family: 'icon', image: 'a.png', gmsd: 0.1 }])
    const flatCand = report([{ family: 'icon', image: 'a.png', gmsd: 0.0975 }])
    const flat = compareReports(flatBase, flatCand)
    expect(flat.families[0].gmsd?.dir).toBe('better') // flat band 0.0008
    expect(flat.verdict).toBe('PASS')

    const photoBase = report([{ family: 'photo', image: 'a.png', gmsd: 0.1 }])
    const photoCand = report([{ family: 'photo', image: 'a.png', gmsd: 0.0975 }])
    const photo = compareReports(photoBase, photoCand)
    expect(photo.families[0].gmsd?.dir).toBe('held') // diverse band 0.014
    expect(photo.verdict).toBe('MIXED')
  })

  it('a guard regression (invented spurious hue) flips a GMSD win to FAIL', () => {
    // GMSD improves, but the change invents a hue at a seam — the guard blocks it.
    const base = report([{ family: 'photo', image: 'a.png', gmsd: 0.16, spurious: 0.012 }])
    const cand = report([{ family: 'photo', image: 'a.png', gmsd: 0.1, spurious: 0.02 }])
    expect(compareReports(base, cand).verdict).toBe('FAIL')
  })

  it('--tie-band overrides the content-dependent band for every group', () => {
    // 0.0025 clears the flat band but not an override of 0.05.
    const base = report([{ family: 'icon', image: 'a.png', gmsd: 0.1 }])
    const cand = report([{ family: 'icon', image: 'a.png', gmsd: 0.0975 }])
    expect(compareReports(base, cand, { tieBand: 0.05 }).overall.gmsd?.dir).toBe('held')
    expect(compareReports(base, cand, { tieBand: 0.05 }).verdict).toBe('MIXED')
  })

  it('FAILs when two-plus families regress GMSD', () => {
    const base = report([
      { family: 'photo', image: 'a.png', gmsd: 0.1 },
      { family: 'lineart', image: 'b.png', gmsd: 0.1 },
    ])
    const cand = report([
      { family: 'photo', image: 'a.png', gmsd: 0.16 },
      { family: 'lineart', image: 'b.png', gmsd: 0.16 },
    ])
    expect(compareReports(base, cand).verdict).toBe('FAIL')
  })

  it('rejects reports without a GMSD field, pointing at --primary de', () => {
    const base = reportNoGmsd([{ family: 'photo', image: 'a.png' }])
    const cand = reportNoGmsd([{ family: 'photo', image: 'a.png' }])
    expect(() => compareReports(base, cand)).toThrow(/--primary de/)
  })

  it('renders a GMSD cell and a GMSD-primary banner', () => {
    const base = report([{ family: 'photo', image: 'a.png', gmsd: 0.16 }])
    const cand = report([{ family: 'photo', image: 'a.png', gmsd: 0.1 }])
    const out = renderReport(compareReports(base, cand))
    expect(out).toContain('GMSD')
    expect(out).toContain('VERDICT: PASS')
    expect(out).toContain('primary: GMSD')
  })
})

describe('A/B verdict — legacy ΔE + spurious (--primary de), unchanged', () => {
  const de = { primary: 'de' as const }

  it('PASSes a clean win — both primaries improve, none regress', () => {
    const base = report([{ family: 'illustration', image: 'a.png', dE: 0.02, spurious: 0.015 }])
    const cand = report([{ family: 'illustration', image: 'a.png', dE: 0.017, spurious: 0.012 }])
    expect(compareReports(base, cand, de).verdict).toBe('PASS')
  })

  it('FAILs a better mean bought with worse spurious hue (the trap this guards)', () => {
    const base = report([{ family: 'illustration', image: 'a.png', dE: 0.021, spurious: 0.012 }])
    const cand = report([{ family: 'illustration', image: 'a.png', dE: 0.019, spurious: 0.016 }])
    expect(compareReports(base, cand, de).verdict).toBe('FAIL')
  })

  it('FAILs when the overall mean ΔE regresses', () => {
    const base = report([{ family: 'illustration', image: 'a.png', dE: 0.02, spurious: 0.015 }])
    const cand = report([{ family: 'illustration', image: 'a.png', dE: 0.024, spurious: 0.015 }])
    expect(compareReports(base, cand, de).verdict).toBe('FAIL')
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
    expect(compareReports(base, cand, de).verdict).toBe('FAIL')
  })

  it('holds sub-noise wobble as unchanged → not a false win or loss', () => {
    const base = report([{ family: 'illustration', image: 'a.png', dE: 0.02, spurious: 0.015 }])
    const cand = report([
      { family: 'illustration', image: 'a.png', dE: 0.020_05, spurious: 0.015_1 },
    ])
    const res = compareReports(base, cand, de)
    expect(res.overall.metrics.dE.dir).toBe('held')
    expect(res.overall.metrics.spurious.dir).toBe('held')
    expect(res.verdict).toBe('MIXED')
  })

  it('runs on pre-GMSD reports (old JSON) without a GMSD field', () => {
    const base = reportNoGmsd([{ family: 'illustration', image: 'a.png', dE: 0.02 }])
    const cand = reportNoGmsd([{ family: 'illustration', image: 'a.png', dE: 0.017 }])
    expect(compareReports(base, cand, de).verdict).toBe('PASS')
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
    const res = compareReports(base, cand, de)
    expect(res.overall.n).toBe(1)
    expect(res.perImage.map((p) => p.image)).toEqual(['a.png'])
    expect(res.verdict).toBe('PASS')
  })

  it('overallVerdict: a per-family win with no regression PASSes even if overall holds', () => {
    const g = (
      name: string,
      m: Partial<Record<'dE' | 'spurious', ['better' | 'worse' | 'held', number, number]>>,
    ) => ({
      name,
      n: 1,
      tieBand: 0.014,
      gmsd: null,
      guardRegressed: false,
      metrics: {
        dE: {
          base: m.dE?.[1] ?? 0.02,
          cand: m.dE?.[2] ?? 0.02,
          dir: m.dE?.[0] ?? ('held' as const),
        },
        spurious: {
          base: m.spurious?.[1] ?? 0.015,
          cand: m.spurious?.[2] ?? 0.015,
          dir: m.spurious?.[0] ?? ('held' as const),
        },
        edgeDE: { base: 0.03, cand: 0.03, dir: 'held' as const },
        p95: { base: 0.04, cand: 0.04, dir: 'held' as const },
        nodes: { base: 1000, cand: 1000, dir: 'held' as const },
      },
    })
    const overall = g('overall', { dE: ['held', 0.02, 0.0199] })
    const fam = g('regions', { dE: ['better', 0.04, 0.03], spurious: ['better', 0.02, 0.018] })
    expect(overallVerdict(overall, [fam])).toBe('PASS')
  })
})
