#!/usr/bin/env tsx
/**
 * Open tune bench — the measurement behind the settings-search efficiency work.
 * Drives `@trazor/tune`'s `TuneSearch` in Node exactly as the studio does (each
 * candidate traced through `@trazor/engine`, scored, and fed back), over the
 * representative corpus, and reports per image the score-vs-candidates curve, the
 * final score with its ΔE / node count / gzipped bytes, the candidates needed to
 * reach 95 % of that final score, and wall-clock. Deterministic and seeded: the
 * candidate sequence, the winner and every reported number reproduce across runs
 * (only wall-clock varies, and it never enters a committed artifact).
 *
 * Weights: balanced — every objective weighted 1 (fidelity, simplicity, file
 * size, color economy, cleanliness). `@trazor/tune` ships no default weight set,
 * so the bench states the one it uses; it is the studio's balanced preset.
 *
 * Usage:
 *   npm run bench:tune                                  # corpus-vtracer, 512 px, current search
 *   npm run bench:tune -- --variant pin-inert           # the space-narrowing variant
 *   npm run bench:tune -- --repeats 3                    # repeated seeds → the noise band
 *   npm run bench:tune -- --sensitivity                  # objective main-effect table instead
 *   npm run bench:tune -- --data <dir> --limit 2 --workers 3 --json out.json
 *     --data <dir>       folder of PNG/JPEG images; default scripts/eval/corpus-vtracer
 *     --max-dim N        resize before tracing (default 512)
 *     --limit N          cap images
 *     --concurrency C    candidates traced at once; default round size is 2×C (default C=4)
 *     --round-size N     override the search round size (else 2×concurrency)
 *     --iterations N     search budget in candidates (default 40)
 *     --seed N           base PRNG seed (default 1)
 *     --repeats N        run each image at seeds seed..seed+N-1 for a noise band (default 1)
 *     --workers N        helper threads per trace (default 0 = sequential); pins concurrency to 1
 *     --variant V        current | pin-inert (default current)
 *     --sensitivity      run the objective main-effect study instead of the search bench
 *     --sens-samples N   Latin-hypercube points per image/mode for --sensitivity (default 48)
 *     --json <path>      also write the machine-readable report
 */
import { readdirSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { analyzeImage, recommendSettings, suggestPalettes } from '@trazor/assist'
import { getProfile, mulberry32, normalizeSettings } from '@trazor/core'
import type { RasterImage, VectorizeMode, VectorizeSettings } from '@trazor/core'
import { vectorize } from '@trazor/engine'
import type { HelperPool } from '@trazor/engine'
import { resizeToFit } from '@trazor/raster'
import {
  applicableParams,
  DEFAULT_FREE,
  fromUnit,
  latinHypercube,
  OBJECTIVE_IDS,
  scoreCandidate,
  toUnit,
  TuneSearch,
} from '@trazor/tune'
import type {
  CandidateMetrics,
  ObjectiveId,
  ParamSpec,
  TunableKey,
  TuneOptions,
  TuneWeights,
} from '@trazor/tune'
import {
  flattenOverWhite,
  qualityStats,
  rasterizeSvg,
  readRgba,
  resampleNearest,
} from '../eval/lib'
import { createNodeHelpers } from './node-helpers'
import { bestScoreCurve, summarizeCurve, mean, stddev, varianceExplained } from './tune-bench-lib'
import type { CurvePoint } from './tune-bench-lib'

/** Balanced preset: every objective matters equally. The bench's documented weights. */
const BALANCED_WEIGHTS: TuneWeights = {
  fidelity: 1,
  simplicity: 1,
  fileSize: 1,
  colorEconomy: 1,
  cleanliness: 1,
}

type Variant = 'current' | 'pin-inert'

/**
 * Fidelity-inert knobs and the value each is pinned to under the `pin-inert`
 * variant — chosen for the balanced objective, not for fidelity alone. Both cut
 * nodes and bytes, so their dominant value is the one that simplifies:
 * `curveOptimize` on merges curve segments; a moderate color `smoothing`
 * rounds pixel jags without collapsing corners.
 */
const INERT_PINS: Partial<Record<TunableKey, number | boolean | string>> = {
  curveOptimize: true,
  smoothing: 0.75,
}

interface Args {
  data: string
  maxDim: number
  limit: number
  concurrency: number
  roundSize: number | null
  iterations: number
  seed: number
  repeats: number
  workers: number
  variant: Variant
  sensitivity: boolean
  sensSamples: number
  json: string | null
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    data: 'scripts/eval/corpus-vtracer',
    maxDim: 512,
    limit: 0,
    concurrency: 4,
    roundSize: null,
    iterations: 40,
    seed: 1,
    repeats: 1,
    workers: 0,
    variant: 'current',
    sensitivity: false,
    sensSamples: 48,
    json: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i + 1]
    switch (argv[i]) {
      case '--data':
        a.data = v
        i++
        break
      case '--max-dim':
        a.maxDim = Number(v)
        i++
        break
      case '--limit':
        a.limit = Number(v)
        i++
        break
      case '--concurrency':
        a.concurrency = Math.max(1, Number(v))
        i++
        break
      case '--round-size':
        a.roundSize = Math.max(1, Number(v))
        i++
        break
      case '--iterations':
        a.iterations = Math.max(1, Number(v))
        i++
        break
      case '--seed':
        a.seed = Number(v)
        i++
        break
      case '--repeats':
        a.repeats = Math.max(1, Number(v))
        i++
        break
      case '--workers':
        a.workers = Math.max(0, Number(v))
        i++
        break
      case '--variant':
        a.variant = v as Variant
        i++
        break
      case '--sensitivity':
        a.sensitivity = true
        break
      case '--sens-samples':
        a.sensSamples = Math.max(4, Number(v))
        i++
        break
      case '--json':
        a.json = v
        i++
        break
      default:
        if (argv[i].startsWith('--')) throw new Error(`unknown flag ${argv[i]}`)
    }
  }
  return a
}

/** The recommended settings for an image (what the studio applies on load), traced at native size. */
function baseSettings(image: RasterImage): VectorizeSettings {
  const rec = recommendSettings(analyzeImage(image))
  return {
    ...normalizeSettings({ ...getProfile(rec.profileId).patch, ...rec.patch }),
    maxDimension: 0,
  }
}

/** One traced candidate's metrics: engine stats + a fidelity pass against the white-composited source. */
function metricsOf(svg: string, stats: CandidateMetrics, srcWhite: RasterImage): CandidateMetrics {
  const render = rasterizeSvg(svg, srcWhite.width)
  const ref = resampleNearest(srcWhite, render.width, render.height)
  const q = qualityStats(render, ref)
  return { ...stats, meanDeltaE: q.mean, p95DeltaE: q.p95 }
}

/** Trace one settings object and read every metric the objective needs. */
async function traceCandidate(
  image: RasterImage,
  srcWhite: RasterImage,
  settings: VectorizeSettings,
  helpers: HelperPool | undefined,
): Promise<{ metrics: CandidateMetrics; gzip: number }> {
  const t0 = performance.now()
  const result = await vectorize(image, settings, undefined, helpers ? { helpers } : undefined)
  const ms = performance.now() - t0
  const stats: CandidateMetrics = {
    meanDeltaE: 0,
    nodeCount: result.stats.nodeCount,
    pathCount: result.stats.pathCount,
    byteLength: result.stats.byteLength,
    colorCount: result.stats.colorCount,
    warnings: result.warnings,
    durationMs: ms,
  }
  return {
    metrics: metricsOf(result.svg, stats, srcWhite),
    gzip: gzipSync(Buffer.from(result.svg)).length,
  }
}

// --------------------------- variants ---------------------------

/**
 * The search options for a variant. `pin-inert` narrows the free set and pins the
 * fidelity-inert knobs to their dominant value on the base — a space-narrowing
 * experiment that needs no engine change. `current` is the shipped search.
 */
function variantSetup(
  variant: Variant,
  base: VectorizeSettings,
  opts: TuneOptions,
): { base: VectorizeSettings; opts: TuneOptions } {
  if (variant === 'pin-inert') {
    const patch: Record<string, unknown> = {}
    const drop = new Set<TunableKey>()
    for (const key of Object.keys(INERT_PINS) as TunableKey[]) {
      patch[key] = INERT_PINS[key]
      drop.add(key)
    }
    return {
      base: normalizeSettings(patch as Partial<VectorizeSettings>, base),
      opts: { ...opts, free: DEFAULT_FREE.filter((k) => !drop.has(k)) },
    }
  }
  return { base, opts }
}

// --------------------------- search bench ---------------------------

interface ImageRunResult {
  image: string
  seed: number
  mode: VectorizeMode
  curve: number[]
  finalScore: number
  candidatesTo95: number
  evaluated: number
  areaUnderCurve: number
  deltaE: number
  nodes: number
  gzip: number
  wallMs: number
}

/** Run one search over one image at one seed and summarize its curve. */
async function runSearch(
  image: RasterImage,
  srcWhite: RasterImage,
  args: Args,
  seed: number,
  helpers: HelperPool | undefined,
): Promise<ImageRunResult> {
  const base = baseSettings(image)
  const roundSize = args.roundSize ?? 2 * args.concurrency
  const palettes = base.mode === 'color' ? suggestPalettes(image).map((p) => p.colors) : undefined
  const baseOpts: TuneOptions = {
    weights: BALANCED_WEIGHTS,
    iterations: args.iterations,
    seed,
    roundSize,
    palettes,
  }
  const { base: startBase, opts } = variantSetup(args.variant, base, baseOpts)
  const search = new TuneSearch(startBase, opts)

  // Winnability is only settled once the round is reported (the fidelity floor is
  // retroactive), so the curve is read off the ledger in evaluation order after
  // each round rather than from the emitted batch.
  const t0 = performance.now()
  const dispatch = args.workers > 0 ? 1 : args.concurrency
  for (;;) {
    const batch = search.nextRound()
    if (batch.length === 0) break
    const results = await mapConcurrent(batch, dispatch, async (c) => {
      const { metrics } = await traceCandidate(image, srcWhite, c.settings, helpers)
      return { id: c.id, metrics }
    })
    search.report(results)
  }
  const wallMs = performance.now() - t0

  const ledger = search.results()
  const points: CurvePoint[] = ledger.map((c) => ({ score: c.score, winnable: !c.rejected }))
  const curve = bestScoreCurve(points)
  const summary = summarizeCurve(curve)
  const best = search.best()
  // The final winner's ΔE / node count and its gzipped size (re-traced once for
  // gzip, which the search does not carry).
  let deltaE = 0
  let nodes = 0
  let gzip = 0
  if (best) {
    deltaE = best.metrics.meanDeltaE
    nodes = best.metrics.nodeCount
    const t = await traceCandidate(image, srcWhite, best.settings, helpers)
    gzip = t.gzip
  }
  return {
    image: '',
    seed,
    mode: base.mode,
    curve,
    finalScore: summary.finalScore,
    candidatesTo95: summary.candidatesTo95,
    evaluated: summary.evaluated,
    areaUnderCurve: summary.areaUnderCurve,
    deltaE,
    nodes,
    gzip,
    wallMs,
  }
}

/** Map with a bounded number of concurrent async tasks, preserving input order. */
async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i])
    }
  }
  const n = Math.min(Math.max(1, concurrency), items.length || 1)
  await Promise.all(Array.from({ length: n }, () => worker()))
  return out
}

function fmt(n: number, d = 4): string {
  return n.toFixed(d)
}

/** Aggregate repeated seeds of one image into a mean ± noise band. */
interface ImageBand {
  image: string
  mode: VectorizeMode
  runs: ImageRunResult[]
  finalMean: number
  finalStd: number
  to95Mean: number
  to95Std: number
  deltaE: number
  nodes: number
  gzip: number
  wallMean: number
}

function band(image: string, runs: ImageRunResult[]): ImageBand {
  const finals = runs.map((r) => r.finalScore)
  const to95 = runs.map((r) => r.candidatesTo95)
  return {
    image,
    mode: runs[0].mode,
    runs,
    finalMean: mean(finals),
    finalStd: stddev(finals),
    to95Mean: mean(to95),
    to95Std: stddev(to95),
    deltaE: mean(runs.map((r) => r.deltaE)),
    nodes: mean(runs.map((r) => r.nodes)),
    gzip: mean(runs.map((r) => r.gzip)),
    wallMean: mean(runs.map((r) => r.wallMs)),
  }
}

async function searchBench(args: Args, files: string[]): Promise<void> {
  const helperSet = args.workers > 0 ? createNodeHelpers(args.workers) : null
  if (helperSet) await helperSet.ready
  const roundSize = args.roundSize ?? 2 * args.concurrency
  console.log(
    `\ntune bench  variant=${args.variant}  weights=balanced  iterations=${args.iterations}` +
      `  roundSize=${roundSize}  seeds=${args.seed}..${args.seed + args.repeats - 1}` +
      `  max-dim=${args.maxDim}  workers=${args.workers}  images=${files.length}\n`,
  )
  console.log(
    `  ${'image'.padEnd(26)} ${'mode'.padEnd(10)} ${'final'.padStart(7)} ${'±'.padStart(6)}` +
      ` ${'to95'.padStart(6)} ${'±'.padStart(5)} ${'eval'.padStart(5)} ${'AUC'.padStart(6)}` +
      ` ${'ΔE'.padStart(7)} ${'nodes'.padStart(7)} ${'gzipB'.padStart(7)} ${'ms'.padStart(7)}`,
  )
  console.log(`  ${'-'.repeat(110)}`)

  const bands: ImageBand[] = []
  for (const file of files) {
    const original = readRgba(join(args.data, file))
    const image = args.maxDim > 0 ? resizeToFit(original, args.maxDim) : original
    const srcWhite = flattenOverWhite(image)
    const runs: ImageRunResult[] = []
    for (let r = 0; r < args.repeats; r++) {
      // oxlint-disable-next-line no-await-in-loop -- sequential: one search at a time
      const run = await runSearch(image, srcWhite, args, args.seed + r, helperSet?.pool)
      run.image = file
      runs.push(run)
    }
    const b = band(basename(file, extname(file)), runs)
    bands.push(b)
    console.log(
      `  ${b.image.slice(0, 26).padEnd(26)} ${b.mode.padEnd(10)} ${fmt(b.finalMean, 3).padStart(7)}` +
        ` ${fmt(b.finalStd, 3).padStart(6)} ${b.to95Mean.toFixed(1).padStart(6)}` +
        ` ${b.to95Std.toFixed(1).padStart(5)} ${b.runs[0].evaluated.toString().padStart(5)}` +
        ` ${fmt(b.runs[0].areaUnderCurve, 3).padStart(6)} ${fmt(b.deltaE).padStart(7)}` +
        ` ${Math.round(b.nodes).toString().padStart(7)} ${Math.round(b.gzip).toString().padStart(7)}` +
        ` ${Math.round(b.wallMean).toString().padStart(7)}`,
    )
  }

  const finalMean = mean(bands.map((b) => b.finalMean))
  const to95Mean = mean(bands.map((b) => b.to95Mean))
  const noiseBand = mean(bands.map((b) => b.finalStd))
  console.log(`  ${'-'.repeat(110)}`)
  console.log(
    `  ${'MEAN'.padEnd(26)} ${''.padEnd(10)} ${fmt(finalMean, 3).padStart(7)}` +
      ` ${fmt(noiseBand, 3).padStart(6)} ${to95Mean.toFixed(1).padStart(6)}`,
  )
  console.log(
    `\n  noise band (mean per-image final-score std over ${args.repeats} seed(s)): ±${fmt(noiseBand, 4)}`,
  )
  console.log(
    `  mean final score ${fmt(finalMean, 4)}   mean candidates-to-95% ${to95Mean.toFixed(1)}`,
  )

  if (args.json) {
    const report = {
      variant: args.variant,
      weights: 'balanced',
      iterations: args.iterations,
      roundSize,
      seeds: Array.from({ length: args.repeats }, (_, i) => args.seed + i),
      maxDim: args.maxDim,
      noiseBand,
      meanFinalScore: finalMean,
      meanCandidatesTo95: to95Mean,
      images: bands.map((b) => ({
        image: b.image,
        mode: b.mode,
        finalMean: b.finalMean,
        finalStd: b.finalStd,
        to95Mean: b.to95Mean,
        to95Std: b.to95Std,
        deltaE: b.deltaE,
        nodes: b.nodes,
        gzip: b.gzip,
        curve: b.runs[0].curve,
      })),
    }
    writeFileSync(args.json, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`\n  report → ${args.json}`)
  }
  await helperSet?.dispose()
}

// --------------------------- sensitivity ---------------------------

/** A base settings object forced into `mode`, from the mode's target profile default. */
function modeBase(mode: VectorizeMode): VectorizeSettings {
  const profile = mode === 'color' ? 'illustration' : mode === 'bw' ? 'bw-sketch' : 'illustration'
  return { ...normalizeSettings({ ...getProfile(profile).patch, mode }), maxDimension: 0 }
}

/** Per-parameter variance-explained of each objective, one mode, averaged over the corpus. */
async function sensitivity(args: Args, files: string[]): Promise<void> {
  const modes: VectorizeMode[] = ['color', 'bw']
  const rand = mulberry32((args.seed >>> 0) ^ 0x5eed)
  const report: Record<string, unknown> = { samples: args.sensSamples, weights: 'balanced' }
  console.log(
    `\ntune sensitivity  weights=balanced  samples/image=${args.sensSamples}` +
      `  max-dim=${args.maxDim}  images=${files.length}\n`,
  )

  for (const mode of modes) {
    const base = modeBase(mode)
    const specs = applicableParams(DEFAULT_FREE, mode, base).filter(
      (s) => s.kind === 'number' || s.kind === 'int' || s.kind === 'bool' || s.kind === 'enum',
    )
    // Accumulate every objective and score across all images/samples, tagged by
    // each parameter's level, so main effects average over the corpus.
    const scores: number[] = []
    const utils: Record<ObjectiveId, number[]> = {
      fidelity: [],
      simplicity: [],
      fileSize: [],
      colorEconomy: [],
      cleanliness: [],
    }
    const levels = new Map<TunableKey, string[]>(specs.map((s) => [s.key, []]))

    for (const file of files) {
      const original = readRgba(join(args.data, file))
      const image = args.maxDim > 0 ? resizeToFit(original, args.maxDim) : original
      const srcWhite = flattenOverWhite(image)
      // The baseline anchor for the "fewer is better" utilities: the mode base.
      // oxlint-disable-next-line no-await-in-loop -- sequential tracing
      const anchor = (await traceCandidate(image, srcWhite, base, undefined)).metrics
      const lhs = latinHypercube(args.sensSamples, specs.length, rand)
      const settingsList = lhs.map((sample) => {
        let s = base
        for (let d = 0; d < specs.length; d++) s = withSample(s, specs[d], sample[d])
        return normalizeSettings(s)
      })
      // oxlint-disable-next-line no-await-in-loop -- sequential tracing
      const traced = await mapConcurrent(settingsList, args.concurrency, (s) =>
        traceCandidate(image, srcWhite, s, undefined),
      )
      for (let k = 0; k < settingsList.length; k++) {
        const s = settingsList[k]
        const { score, utilities } = scoreCandidate(traced[k].metrics, anchor, BALANCED_WEIGHTS)
        scores.push(score)
        for (const id of OBJECTIVE_IDS) utils[id].push(utilities[id])
        for (const spec of specs) levels.get(spec.key)!.push(levelLabel(spec, s[spec.key]))
      }
    }

    const rows = specs
      .map((spec) => {
        const label = levels.get(spec.key)!
        return {
          key: spec.key,
          group: spec.group,
          score: groupedVariance(scores, label),
          fidelity: groupedVariance(utils.fidelity, label),
          simplicity: groupedVariance(utils.simplicity, label),
          fileSize: groupedVariance(utils.fileSize, label),
          colorEconomy: groupedVariance(utils.colorEconomy, label),
          cleanliness: groupedVariance(utils.cleanliness, label),
        }
      })
      .toSorted((a, b) => b.score - a.score)

    console.log(`  mode=${mode}  (variance of each objective explained, %)\n`)
    console.log(
      `  ${'param'.padEnd(18)} ${'group'.padEnd(10)} ${'SCORE'.padStart(6)} ${'fidel'.padStart(6)}` +
        ` ${'simpl'.padStart(6)} ${'fsize'.padStart(6)} ${'color'.padStart(6)} ${'clean'.padStart(6)}`,
    )
    console.log(`  ${'-'.repeat(72)}`)
    for (const r of rows) {
      console.log(
        `  ${r.key.padEnd(18)} ${r.group.padEnd(10)} ${pct(r.score)} ${pct(r.fidelity)}` +
          ` ${pct(r.simplicity)} ${pct(r.fileSize)} ${pct(r.colorEconomy)} ${pct(r.cleanliness)}`,
      )
    }
    console.log('')
    report[mode] = rows
  }

  if (args.json) {
    writeFileSync(args.json, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`  report → ${args.json}`)
  }
}

/** A parameter value's discrete level label (numeric params binned into low/mid/high). */
function levelLabel(spec: ParamSpec, value: unknown): string {
  if (spec.kind === 'bool') return String(value)
  if (spec.kind === 'enum') return String(value)
  const u = toUnit(spec, value as number)
  return u < 1 / 3 ? 'lo' : u < 2 / 3 ? 'mid' : 'hi'
}

/** Variance-explained of a metric by a parameter, grouping observations by level label. */
function groupedVariance(values: readonly number[], labels: readonly string[]): number {
  const buckets = new Map<string, number[]>()
  for (let i = 0; i < values.length; i++) {
    const l = labels[i]
    const b = buckets.get(l)
    if (b) b.push(values[i])
    else buckets.set(l, [values[i]])
  }
  return varianceExplained(values, [...buckets.values()])
}

/** Set a parameter from a [0,1] sample (enum/bool discretized), for the LHS fill. */
function withSample(
  settings: VectorizeSettings,
  spec: ParamSpec,
  sample: number,
): VectorizeSettings {
  if (spec.kind === 'bool') return { ...settings, [spec.key]: sample >= 0.5 }
  if (spec.kind === 'enum') {
    const values = spec.values ?? []
    const idx = Math.min(values.length - 1, Math.floor(sample * values.length))
    return { ...settings, [spec.key]: values[idx] }
  }
  return { ...settings, [spec.key]: fromUnit(spec, sample) }
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}`.padStart(6)
}

// --------------------------- main ---------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  let files = readdirSync(args.data)
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .toSorted()
  if (files.length === 0) throw new Error(`no images in ${args.data}`)
  if (args.limit > 0) files = files.slice(0, args.limit)

  if (args.sensitivity) await sensitivity(args, files)
  else await searchBench(args, files)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
