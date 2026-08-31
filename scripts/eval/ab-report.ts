#!/usr/bin/env tsx
/**
 * A/B verdict over two `tracer-compare` JSON reports (baseline vs candidate).
 *
 * The point is to turn "eyeball two runs" into an explicit **PASS / MIXED /
 * FAIL** so a quality change can't ship on a diluted whole-image mean while a
 * localized metric regresses. It diffs every fidelity metric the harness
 * records — mean ΔE, the banding-aware edge ΔE, the p95 tail, and the
 * spurious-hue score — per image, per family, and overall, and judges the run
 * on the two that matter most: **mean ΔE and spurious-hue**. A change that
 * lowers the mean but raises spurious hue (a saturated color invented at a
 * seam) is not an improvement, and this catches exactly that.
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
  nodes: number
  bytes: number
  ms?: number
}

interface Row {
  family: string
  image: string
  trazor: TrazorMetrics
}

/** The metrics compared, in report order. `primary` ones decide the verdict. */
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

export type Direction = 'better' | 'worse' | 'held'
export type Verdict = 'PASS' | 'MIXED' | 'FAIL'

function direction(key: MetricKey, base: number, cand: number): Direction {
  const abs = cand - base
  if (Math.abs(abs) < ABS_FLOOR[key]) return 'held'
  if (base !== 0 && Math.abs(abs / base) < REL) return 'held'
  // Every metric here is lower-is-better.
  return abs < 0 ? 'better' : 'worse'
}

/** Mean of `key` over a set of rows. */
function mean(rows: Row[], key: MetricKey): number {
  if (rows.length === 0) return 0
  let s = 0
  for (const r of rows) s += r.trazor[key]
  return s / rows.length
}

export interface GroupVerdict {
  name: string
  n: number
  metrics: Record<MetricKey, { base: number; cand: number; dir: Direction }>
}

function groupVerdict(name: string, base: Row[], cand: Row[]): GroupVerdict {
  const metrics = {} as GroupVerdict['metrics']
  for (const { key } of METRICS) {
    const b = mean(base, key)
    const c = mean(cand, key)
    metrics[key] = { base: b, cand: c, dir: direction(key, b, c) }
  }
  return { name, n: cand.length, metrics }
}

/**
 * Overall verdict from the family + overall groups. A change **FAILs** when it
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

export interface AbResult {
  overall: GroupVerdict
  families: GroupVerdict[]
  perImage: Array<{ image: string; family: string; base: TrazorMetrics; cand: TrazorMetrics }>
  verdict: Verdict
}

/** Compare two parsed reports. Rows are matched by image name. */
export function compareReports(base: { rows: Row[] }, cand: { rows: Row[] }): AbResult {
  const baseBy = new Map(base.rows.map((r) => [r.image, r]))
  const paired = cand.rows.filter((r) => baseBy.has(r.image))
  const baseRows = paired.map((r) => baseBy.get(r.image) as Row)

  const families = [...new Set(paired.map((r) => r.family))].sort()
  const familyVerdicts = families.map((fam) =>
    groupVerdict(
      fam,
      baseRows.filter((r) => r.family === fam),
      paired.filter((r) => r.family === fam),
    ),
  )
  const overall = groupVerdict('overall', baseRows, paired)
  const perImage = paired.map((r) => ({
    image: r.image,
    family: r.family,
    base: (baseBy.get(r.image) as Row).trazor,
    cand: r.trazor,
  }))
  return {
    overall,
    families: familyVerdicts,
    perImage,
    verdict: overallVerdict(overall, familyVerdicts),
  }
}

// ---- CLI rendering ----

const MARK: Record<Direction, string> = { better: '✓', worse: '✗', held: '·' }

function pct(base: number, cand: number): string {
  if (base === 0) return '  —  '
  const d = ((cand - base) / base) * 100
  return (d >= 0 ? '+' : '') + d.toFixed(1) + '%'
}

function fmt(v: number, key: MetricKey): string {
  return key === 'nodes' ? String(Math.round(v)) : v.toFixed(4)
}

function renderGroup(g: GroupVerdict): string {
  const parts = METRICS.map(({ key, label }) => {
    const m = g.metrics[key]
    return `${label} ${MARK[m.dir]} ${fmt(m.base, key)}→${fmt(m.cand, key)} ${pct(m.base, m.cand)}`
  })
  return `  ${g.name.padEnd(13)} (${g.n})  ` + parts.join('   ')
}

/** Per-image lines, biggest ΔE move first, so a lone regression stands out. */
function renderPerImage(res: AbResult): string[] {
  const rows = [...res.perImage].sort(
    (a, b) => Math.abs(b.cand.dE - b.base.dE) - Math.abs(a.cand.dE - a.base.dE),
  )
  const cell = (key: MetricKey, base: number, cand: number, label: string): string =>
    `${label} ${MARK[direction(key, base, cand)]} ${fmt(base, key)}→${fmt(cand, key)} ${pct(base, cand)}`
  return rows.map((r) => {
    const name = `${r.family}/${r.image}`
    const head = (name.length > 34 ? name.slice(0, 33) + '…' : name).padEnd(35)
    return (
      `  ${head} ` +
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
  lines.push('\n  per image (largest ΔE move first):\n')
  for (const l of renderPerImage(res)) lines.push(l)
  lines.push('')
  lines.push('  per family (baseline → candidate):\n')
  for (const f of res.families) lines.push(renderGroup(f))
  lines.push('')
  lines.push(renderGroup(res.overall))
  lines.push('')
  const banner =
    res.verdict === 'PASS'
      ? '✓ PASS — ships: a primary metric improved with no family regression'
      : res.verdict === 'FAIL'
        ? '✗ FAIL — do not ship: a primary metric (ΔE / spurious hue) regressed'
        : '~ MIXED — a real trade-off; needs a human call'
  lines.push(`  VERDICT: ${res.verdict}   ${banner}`)
  lines.push('')
  lines.push(
    '  primary metrics: ΔE (mean fidelity) · spurious (invented hue at seams). lower is better.',
  )
  return lines.join('\n')
}

function main(): void {
  const [baseP, candP] = process.argv.slice(2)
  if (!baseP || !candP) {
    console.error('usage: tsx ab-report.ts <baseline.json> <candidate.json>')
    process.exit(2)
  }
  const base = JSON.parse(readFileSync(baseP, 'utf8'))
  const cand = JSON.parse(readFileSync(candP, 'utf8'))
  const res = compareReports(base, cand)
  console.log(renderReport(res))
  // Non-zero exit on FAIL so it can gate a script / CI step.
  if (res.verdict === 'FAIL') process.exit(1)
}

// Run as CLI only when invoked directly (not when imported by a test).
if (import.meta.url === `file://${process.argv[1]}`) main()
