#!/usr/bin/env tsx
/**
 * A/B verdict over two `tracer-compare` JSON reports (baseline vs candidate).
 *
 * The point is to turn "eyeball two runs" into an explicit **PASS / MIXED /
 * FAIL** so a quality change can't ship on a diluted whole-image mean while a
 * localized metric regresses. It diffs every fidelity metric the harness
 * records — GMSD, mean ΔE, the banding-aware edge ΔE, the p95 tail, and the
 * spurious-hue score — per image, per family, and overall.
 *
 * **The default verdict reads GMSD.** Two blind human-judged batches
 * (`docs/studies/ab-gmsd.md` and `perceptual-metrics.md` in the studio) fixed
 * **GMSD as the primary metric**: it tracks the eye on 30 of 33 decisive pairs
 * pooled, where mean ΔE and spurious hue track it at 82 % / 79 % (and 60 % on
 * diverse content). So GMSD decides, judged against a **content-dependent tie
 * band** (a move smaller than the band is "held"): ≈ 0.0008 on flat vector art
 * (icon / brand / flag / emoji / flat), ≈ 0.014 on diverse, photographic or
 * degraded content. **Mean ΔE and spurious hue stay on as regression guards**
 * — they can only turn a verdict into FAIL on a clear regression (an invented
 * seam color the GMSD move would otherwise wave through), never rank a
 * candidate. `--tie-band <n>` forces one band; `--primary de` restores the
 * legacy ΔE + spurious verdict for comparison.
 *
 * Deterministic and pure: it only reads the two JSON blobs. Used both as the
 * verdict step of `npm run eval:ab` and directly (`tsx ab-report.ts a.json
 * b.json`) to compare any two reports, however they were produced.
 */
import { readFileSync } from 'node:fs'

/** One tracer's metrics for one image, as written by `tracer-compare.ts`. */
export interface TrazorMetrics {
  dE: number
  edgeDE: number
  p95: number
  spurious: number
  /** GMSD (lower is better) — the default verdict primary. Absent in pre-GMSD
   *  reports, which the default verdict rejects with a pointer to `--primary de`. */
  gmsd?: number
  nodes: number
  bytes: number
  ms?: number
}

interface Row {
  family: string
  image: string
  trazor: TrazorMetrics
}

/**
 * The context/guard metrics, in report order. In `--primary de` these `primary`
 * flags decide the verdict; in the default GMSD mode `dE` and `spurious` are
 * regression guards and GMSD (a separate field, judged against a tie band) is
 * the primary.
 */
const METRICS = [
  { key: 'dE', label: 'ΔE', primary: true },
  { key: 'spurious', label: 'spurious', primary: true },
  { key: 'edgeDE', label: 'band', primary: false },
  { key: 'p95', label: 'p95', primary: false },
  { key: 'nodes', label: 'nodes', primary: false },
] as const
type MetricKey = (typeof METRICS)[number]['key']

/**
 * A metric only counts as changed when it moves by more than `REL` (relative)
 * *and* `absFloor` (absolute) — so sub-noise wobble on already-tiny values
 * (a 0.0001 ΔE drift) reads as "held", not a win or a loss.
 */
const REL = 0.02
const ABS_FLOOR: Record<MetricKey, number> = {
  dE: 0.0005,
  spurious: 0.0005,
  edgeDE: 0.0005,
  p95: 0.001,
  nodes: 20,
}

/** GMSD tie bands from the human-judged batches (docs/studies/perceptual-metrics.md). */
export const TIE_BAND_FLAT = 0.0008
export const TIE_BAND_DIVERSE = 0.014
/** Flat vector families — a GMSD move under TIE_BAND_FLAT is invisible there.
 *  The engine corpus's `flat`/`logo` tags plus the studio's icon/brand/flag/emoji. */
export const FLAT_FAMILIES = new Set(['flat', 'logo', 'icon', 'brand', 'flag', 'emoji'])

export type Primary = 'gmsd' | 'de'

export interface CompareOptions {
  /** Verdict primary: `gmsd` (default, human-validated) or `de` (legacy). */
  primary?: Primary
  /** Force one GMSD tie band for every group instead of the content-dependent one. */
  tieBand?: number | null
}

/** The GMSD tie band for a family: flat vector art vs diverse content, or an override. */
export function tieBandFor(family: string, override?: number | null): number {
  if (override != null) return override
  return FLAT_FAMILIES.has(family) ? TIE_BAND_FLAT : TIE_BAND_DIVERSE
}

export type Direction = 'better' | 'worse' | 'held'
export type Verdict = 'PASS' | 'MIXED' | 'FAIL'

function direction(key: MetricKey, base: number, cand: number): Direction {
  const abs = cand - base
  if (Math.abs(abs) < ABS_FLOOR[key]) return 'held'
  if (base !== 0 && Math.abs(abs / base) < REL) return 'held'
  // Every metric here is lower-is-better.
  return abs < 0 ? 'better' : 'worse'
}

/** GMSD direction against the content-dependent tie band (lower is better). */
export function gmsdDirection(base: number, cand: number, tieBand: number): Direction {
  const d = cand - base
  if (Math.abs(d) < tieBand) return 'held'
  return d < 0 ? 'better' : 'worse'
}

/** Mean of `key` over a set of rows. */
function mean(rows: Row[], key: MetricKey): number {
  if (rows.length === 0) return 0
  let s = 0
  for (const r of rows) s += r.trazor[key]
  return s / rows.length
}

/** Mean GMSD over a set of rows, or null when any row lacks it. */
function meanGmsd(rows: Row[]): number | null {
  if (rows.length === 0) return null
  let s = 0
  for (const r of rows) {
    const g = r.trazor.gmsd
    if (typeof g !== 'number' || Number.isNaN(g)) return null
    s += g
  }
  return s / rows.length
}

export interface GroupVerdict {
  name: string
  n: number
  metrics: Record<MetricKey, { base: number; cand: number; dir: Direction }>
  /** GMSD (primary) with the tie band applied, or null when reports carry none. */
  gmsd: { base: number; cand: number; dir: Direction } | null
  /** The GMSD tie band applied to this group. */
  tieBand: number
  /** True when a guard (mean ΔE / spurious hue) regressed materially. */
  guardRegressed: boolean
}

function groupVerdict(name: string, base: Row[], cand: Row[], tieBand: number): GroupVerdict {
  const metrics = {} as GroupVerdict['metrics']
  for (const { key } of METRICS) {
    const b = mean(base, key)
    const c = mean(cand, key)
    metrics[key] = { base: b, cand: c, dir: direction(key, b, c) }
  }
  const gb = meanGmsd(base)
  const gc = meanGmsd(cand)
  const gmsd =
    gb === null || gc === null ? null : { base: gb, cand: gc, dir: gmsdDirection(gb, gc, tieBand) }
  return {
    name,
    n: cand.length,
    metrics,
    gmsd,
    tieBand,
    guardRegressed: metrics.dE.dir === 'worse' || metrics.spurious.dir === 'worse',
  }
}

/**
 * The legacy ΔE + spurious verdict (`--primary de`). A change **FAILs** when it
 * regresses a primary metric (ΔE or spurious hue) on the overall aggregate, or
 * on two or more families — the ship-blocking cases. It **PASSes** only when a
 * primary metric improves overall and none regresses anywhere. Everything in
 * between is **MIXED** — a real trade a human has to weigh.
 */
export function overallVerdict(overall: GroupVerdict, families: GroupVerdict[]): Verdict {
  const primaries = METRICS.filter((m) => m.primary).map((m) => m.key)
  let overallWorse = false
  let overallBetter = false
  for (const k of primaries) {
    if (overall.metrics[k].dir === 'worse') overallWorse = true
    if (overall.metrics[k].dir === 'better') overallBetter = true
  }
  let familiesRegressed = 0
  let familyBetter = false
  for (const f of families) {
    let worse = false
    for (const k of primaries) {
      if (f.metrics[k].dir === 'worse') worse = true
      if (f.metrics[k].dir === 'better') familyBetter = true
    }
    if (worse) familiesRegressed++
  }
  if (overallWorse || familiesRegressed >= 2) return 'FAIL'
  if (overallBetter && familiesRegressed === 0) return 'PASS'
  if (familyBetter && familiesRegressed === 0 && !overallWorse) return 'PASS'
  return 'MIXED'
}

/**
 * The default GMSD-primary verdict. GMSD decides, judged against each group's
 * tie band; mean ΔE and spurious hue are guards that only block the ship.
 *
 * **FAIL** when GMSD regresses overall or on two-plus families, or a guard
 * regresses overall or on two-plus families (a clear defect the guard was built
 * to catch). **PASS** when GMSD improves overall (or on a family) with no GMSD
 * regression anywhere and no ship-blocking guard regression. Otherwise
 * **MIXED** — a real trade a human weighs.
 */
export function gmsdVerdict(overall: GroupVerdict, families: GroupVerdict[]): Verdict {
  if (!overall.gmsd) {
    throw new Error('gmsdVerdict called on reports without a GMSD field')
  }
  const familiesGmsdWorse = families.filter((f) => f.gmsd?.dir === 'worse').length
  const familyGmsdBetter = families.some((f) => f.gmsd?.dir === 'better')
  const guardBlocks = overall.guardRegressed || families.filter((f) => f.guardRegressed).length >= 2

  if (overall.gmsd.dir === 'worse' || familiesGmsdWorse >= 2 || guardBlocks) return 'FAIL'
  // Past the FAIL guard, overall GMSD is 'better' or 'held' — a family win with
  // nothing regressing PASSes even when the overall aggregate holds.
  if (overall.gmsd.dir === 'better' && familiesGmsdWorse === 0) return 'PASS'
  if (familyGmsdBetter && familiesGmsdWorse === 0) return 'PASS'
  return 'MIXED'
}

export interface AbResult {
  primary: Primary
  overall: GroupVerdict
  families: GroupVerdict[]
  perImage: Array<{ image: string; family: string; base: TrazorMetrics; cand: TrazorMetrics }>
  verdict: Verdict
}

/** Compare two parsed reports. Rows are matched by image name. */
export function compareReports(
  base: { rows: Row[] },
  cand: { rows: Row[] },
  opts: CompareOptions = {},
): AbResult {
  const primary: Primary = opts.primary ?? 'gmsd'
  const baseBy = new Map(base.rows.map((r) => [r.image, r]))
  const paired = cand.rows.filter((r) => baseBy.has(r.image))
  const baseRows = paired.map((r) => baseBy.get(r.image) as Row)

  if (primary === 'gmsd') {
    const missing = [...baseRows, ...paired].some(
      (r) => typeof r.trazor.gmsd !== 'number' || Number.isNaN(r.trazor.gmsd),
    )
    if (missing) {
      throw new Error(
        'these reports carry no `gmsd` field — re-run `tracer-compare` on the current engine ' +
          'so the reports record GMSD, or pass `--primary de` to use the legacy ΔE + spurious verdict.',
      )
    }
  }

  const families = [...new Set(paired.map((r) => r.family))].sort()
  const familyVerdicts = families.map((fam) =>
    groupVerdict(
      fam,
      baseRows.filter((r) => r.family === fam),
      paired.filter((r) => r.family === fam),
      tieBandFor(fam, opts.tieBand),
    ),
  )
  // Overall spans mixed content — the diverse band, unless an override forces one.
  const overall = groupVerdict('overall', baseRows, paired, tieBandFor('overall', opts.tieBand))
  const perImage = paired.map((r) => ({
    image: r.image,
    family: r.family,
    base: (baseBy.get(r.image) as Row).trazor,
    cand: r.trazor,
  }))
  return {
    primary,
    overall,
    families: familyVerdicts,
    perImage,
    verdict:
      primary === 'gmsd'
        ? gmsdVerdict(overall, familyVerdicts)
        : overallVerdict(overall, familyVerdicts),
  }
}

// ---- CLI rendering ----

const MARK: Record<Direction, string> = { better: '✓', worse: '✗', held: '·' }

function pct(base: number, cand: number): string {
  if (base === 0) return '  —  '
  const d = ((cand - base) / base) * 100
  return (d >= 0 ? '+' : '') + d.toFixed(1) + '%'
}

function fmt(v: number, key: MetricKey | 'gmsd'): string {
  return key === 'nodes' ? String(Math.round(v)) : v.toFixed(4)
}

/** The GMSD cell for a group (empty when the reports carry no GMSD). */
function gmsdCell(g: GroupVerdict): string {
  if (!g.gmsd) return ''
  const m = g.gmsd
  return `GMSD ${MARK[m.dir]} ${fmt(m.base, 'gmsd')}→${fmt(m.cand, 'gmsd')} ${pct(m.base, m.cand)}   `
}

function renderGroup(g: GroupVerdict): string {
  const parts = METRICS.map(({ key, label }) => {
    const m = g.metrics[key]
    return `${label} ${MARK[m.dir]} ${fmt(m.base, key)}→${fmt(m.cand, key)} ${pct(m.base, m.cand)}`
  })
  return `  ${g.name.padEnd(13)} (${g.n})  ` + gmsdCell(g) + parts.join('   ')
}

/** Per-image lines, biggest GMSD (else ΔE) move first, so a lone regression stands out. */
function renderPerImage(res: AbResult): string[] {
  const key = (m: TrazorMetrics): number => (typeof m.gmsd === 'number' ? m.gmsd : m.dE)
  const rows = [...res.perImage].sort(
    (a, b) => Math.abs(key(b.cand) - key(b.base)) - Math.abs(key(a.cand) - key(a.base)),
  )
  const cell = (mkey: MetricKey, base: number, cand: number, label: string): string =>
    `${label} ${MARK[direction(mkey, base, cand)]} ${fmt(base, mkey)}→${fmt(cand, mkey)} ${pct(base, cand)}`
  const gCell = (base: TrazorMetrics, cand: TrazorMetrics, tieBand: number): string =>
    typeof base.gmsd === 'number' && typeof cand.gmsd === 'number'
      ? `GMSD ${MARK[gmsdDirection(base.gmsd, cand.gmsd, tieBand)]} ${fmt(base.gmsd, 'gmsd')}→${fmt(cand.gmsd, 'gmsd')} ${pct(base.gmsd, cand.gmsd)}   `
      : ''
  return rows.map((r) => {
    const name = `${r.family}/${r.image}`
    const head = (name.length > 34 ? name.slice(0, 33) + '…' : name).padEnd(35)
    return (
      `  ${head} ` +
      gCell(r.base, r.cand, tieBandFor(r.family)) +
      [
        cell('dE', r.base.dE, r.cand.dE, 'ΔE'),
        cell('spurious', r.base.spurious, r.cand.spurious, 'spur'),
        cell('nodes', r.base.nodes, r.cand.nodes, 'nodes'),
      ].join('   ')
    )
  })
}

export function renderReport(res: AbResult): string {
  const lines: string[] = []
  lines.push('\n  per image (largest quality move first):\n')
  for (const l of renderPerImage(res)) lines.push(l)
  lines.push('')
  lines.push('  per family (baseline → candidate):\n')
  for (const f of res.families) lines.push(renderGroup(f))
  lines.push('')
  lines.push(renderGroup(res.overall))
  lines.push('')
  const banner =
    res.verdict === 'PASS'
      ? res.primary === 'gmsd'
        ? '✓ PASS — ships: GMSD improved with no family regression and no guard regression'
        : '✓ PASS — ships: a primary metric improved with no family regression'
      : res.verdict === 'FAIL'
        ? res.primary === 'gmsd'
          ? '✗ FAIL — do not ship: GMSD regressed, or a guard (ΔE / spurious hue) regressed'
          : '✗ FAIL — do not ship: a primary metric (ΔE / spurious hue) regressed'
        : '~ MIXED — a real trade-off; needs a human call'
  lines.push(`  VERDICT: ${res.verdict}   ${banner}`)
  lines.push('')
  if (res.primary === 'gmsd') {
    lines.push(
      `  primary: GMSD (human-validated), tie band ${res.overall.tieBand} diverse / ${TIE_BAND_FLAT} flat. ` +
        'guards: ΔE (mean fidelity) · spurious (invented hue at seams). lower is better.',
    )
  } else {
    lines.push(
      '  primary metrics: ΔE (mean fidelity) · spurious (invented hue at seams). lower is better.',
    )
  }
  return lines.join('\n')
}

interface CliArgs {
  baseP?: string
  candP?: string
  primary: Primary
  tieBand: number | null
}

function parseArgs(argv: string[]): CliArgs {
  const a: CliArgs = { primary: 'gmsd', tieBand: null }
  const positional: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (key === '--primary') {
      const v = argv[++i]
      if (v !== 'gmsd' && v !== 'de') throw new Error(`--primary must be gmsd or de (got ${v})`)
      a.primary = v
    } else if (key === '--tie-band') {
      a.tieBand = Number(argv[++i])
    } else if (key.startsWith('--')) {
      throw new Error(`unknown flag ${key}`)
    } else {
      positional.push(key)
    }
  }
  a.baseP = positional[0]
  a.candP = positional[1]
  return a
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  if (!args.baseP || !args.candP) {
    console.error(
      'usage: tsx ab-report.ts <baseline.json> <candidate.json> [--primary gmsd|de] [--tie-band <n>]',
    )
    process.exit(2)
  }
  const base = JSON.parse(readFileSync(args.baseP, 'utf8'))
  const cand = JSON.parse(readFileSync(args.candP, 'utf8'))
  const res = compareReports(base, cand, { primary: args.primary, tieBand: args.tieBand })
  console.log(renderReport(res))
  // Non-zero exit on FAIL so it can gate a script / CI step.
  if (res.verdict === 'FAIL') process.exit(1)
}

// Run as CLI only when invoked directly (not when imported by a test).
if (import.meta.url === `file://${process.argv[1]}`) main()
