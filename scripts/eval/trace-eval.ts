#!/usr/bin/env tsx
/**
 * ΔE-through-tracer evaluation for the on-device pre-pass models
 * (docs/ML_ROADMAP.md item 1). The proxy losses the trainer selects on (edge
 * BCE/Dice, cleanup PSNR) are not what ships — this measures what does: the
 * app's Oklab ΔE fidelity of the *traced* output, with vs. without the pre-pass.
 *
 * For each sample it traces through @trazor/engine, rasterizes the SVG with resvg
 * over white, and reports mean ΔE against the clean ground-truth render (the same
 * metric as apps/web/src/lib/fidelity.ts), in two buckets:
 *   - degraded — trace the degraded `input/` (does the pre-pass recover the true
 *     scene better?).
 *   - clean    — trace the clean `clean/` render (do-no-harm: the pre-pass must
 *     not regress already-clean inputs). Only when clean predictions are present.
 *
 * Predictions come from scripts/train/predict.py, laid out as
 *   <pred>/<bucket>/<field>/<base>.png   bucket ∈ {degraded, clean}
 * where <field> is `edge` (a [0,1] boundary hint), `clean` (a cleaned RGB image),
 * or `field` (a [0,1] coverage field, used as a bw coverage hint), matching --task.
 * A perfect stand-in (the dataset's own `edge/` or `field/` target) exercises the
 * whole harness with no trained model — see scripts/eval/README.md.
 *
 * Usage:
 *   npm run eval:prepass -- --data <dataset-root> --pred <pred-dir> [options]
 *     --task    edge | cleanup | field  (default edge; field defaults to bw mode)
 *     --split   train | val | test    (default test)
 *     --mode    color | grayscale | bw | centerline   (default: settings default)
 *     --limit   N                      cap samples (0 = all)
 *     --json    <path>                 also write the report as JSON
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { PNG } from 'pngjs'
import { DEFAULT_SETTINGS } from '@trazor/core'
import type {
  EngineContext,
  GrayImage,
  RasterImage,
  VectorizeMode,
  VectorizeSettings,
} from '@trazor/core'
import { vectorize } from '@trazor/engine'
import { meanDeltaE, rasterizeSvg, readRgba, score } from './lib'

type Task = 'edge' | 'cleanup' | 'field'

interface Args {
  data: string
  pred: string
  task: Task
  split: string
  mode?: VectorizeMode
  limit: number
  json?: string
}

function parseArgs(argv: string[]): Args {
  const a: Args = { data: '', pred: '', task: 'edge', split: 'test', limit: 0 }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    const val = argv[i + 1]
    switch (key) {
      case '--data':
        a.data = val
        i++
        break
      case '--pred':
        a.pred = val
        i++
        break
      case '--task':
        a.task = val === 'cleanup' ? 'cleanup' : val === 'field' ? 'field' : 'edge'
        i++
        break
      case '--split':
        a.split = val
        i++
        break
      case '--mode':
        a.mode = val as VectorizeMode
        i++
        break
      case '--limit':
        a.limit = Number(val)
        i++
        break
      case '--json':
        a.json = val
        i++
        break
      default:
        if (key.startsWith('--')) throw new Error(`unknown flag ${key}`)
    }
  }
  if (!a.data) throw new Error('missing --data <dataset-root>')
  if (!a.pred) throw new Error('missing --pred <pred-dir>')
  return a
}

/** Read a gray/RGBA PNG as a [0,1] boundary hint (R channel / 255). */
function readHint(path: string): GrayImage {
  const png = PNG.sync.read(readFileSync(path))
  const n = png.width * png.height
  const data = new Float32Array(n)
  for (let i = 0; i < n; i++) data[i] = png.data[i * 4] / 255
  return { width: png.width, height: png.height, data }
}

interface Trace {
  dE: number
  nodes: number
}

async function trace(
  image: RasterImage,
  clean: RasterImage,
  settings: VectorizeSettings,
  ctx?: EngineContext,
): Promise<Trace> {
  const result = await vectorize(image, settings, ctx)
  const raster = rasterizeSvg(result.svg, clean.width)
  return { dE: meanDeltaE(raster, clean), nodes: result.stats.nodeCount }
}

/**
 * The pre-pass variant for one sample, per task: edge feeds the prediction as an
 * `edgeHint`, field as a `coverageHint` (both trace the same base image), and
 * cleanup traces the predicted cleaned image directly.
 */
function tracePrepass(
  task: Task,
  predPath: string,
  base: RasterImage,
  clean: RasterImage,
  settings: VectorizeSettings,
): Promise<Trace> {
  if (task === 'cleanup') return trace(readRgba(predPath), clean, settings)
  if (task === 'field') return trace(base, clean, settings, { coverageHint: readHint(predPath) })
  return trace(base, clean, settings, { edgeHint: readHint(predPath) })
}

interface Acc {
  n: number
  dEoff: number
  dEon: number
  nodesOff: number
  nodesOn: number
}
const emptyAcc = (): Acc => ({ n: 0, dEoff: 0, dEon: 0, nodesOff: 0, nodesOn: 0 })

function add(acc: Acc, off: Trace, on: Trace): void {
  acc.n++
  acc.dEoff += off.dE
  acc.dEon += on.dE
  acc.nodesOff += off.nodes
  acc.nodesOn += on.nodes
}

interface BucketReport {
  bucket: string
  samples: number
  deltaEOff: number
  deltaEOn: number
  improvement: number
  scoreOff: number
  scoreOn: number
  nodesOff: number
  nodesOn: number
}

function summarize(bucket: string, acc: Acc): BucketReport | null {
  if (acc.n === 0) return null
  const deltaEOff = acc.dEoff / acc.n
  const deltaEOn = acc.dEon / acc.n
  return {
    bucket,
    samples: acc.n,
    deltaEOff,
    deltaEOn,
    improvement: deltaEOff - deltaEOn, // >0 = pre-pass helps
    scoreOff: score(deltaEOff),
    scoreOn: score(deltaEOn),
    nodesOff: Math.round(acc.nodesOff / acc.n),
    nodesOn: Math.round(acc.nodesOn / acc.n),
  }
}

function fmtRow(r: BucketReport): string[] {
  return [
    r.bucket,
    String(r.samples),
    r.deltaEOff.toFixed(4),
    r.deltaEOn.toFixed(4),
    (r.improvement >= 0 ? '+' : '') + r.improvement.toFixed(4),
    r.scoreOff.toFixed(3),
    r.scoreOn.toFixed(3),
    String(r.nodesOff),
    String(r.nodesOn),
  ]
}

function printReport(rows: BucketReport[], task: string, mode: string): void {
  console.log(`\ntask=${task}  mode=${mode}\n`)
  const head = [
    'bucket',
    'n',
    'ΔE off',
    'ΔE on',
    'ΔΔE',
    'score off',
    'score on',
    'nodes off',
    'nodes on',
  ]
  const table = [head, ...rows.map(fmtRow)]
  const widths = head.map((_, c) => Math.max(...table.map((row) => row[c].length)))
  for (const row of table) {
    console.log('  ' + row.map((cell, c) => cell.padStart(widths[c])).join('  '))
  }
  const degraded = rows.find((r) => r.bucket === 'degraded')
  const clean = rows.find((r) => r.bucket === 'clean')
  console.log('')
  if (degraded) {
    const verdict = degraded.improvement > 0 ? 'helps' : 'no gain'
    console.log(
      `  degraded: pre-pass ${verdict} (ΔΔE ${degraded.improvement >= 0 ? '+' : ''}${degraded.improvement.toFixed(4)})`,
    )
  }
  if (clean && clean.improvement < -0.001) {
    console.log(
      `  ⚠ clean-input regression: ΔE rose by ${(-clean.improvement).toFixed(4)} — a pre-pass that hurts clean inputs is a net loss`,
    )
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const field = args.task === 'cleanup' ? 'clean' : args.task === 'field' ? 'field' : 'edge'
  // The coverage hint only applies in bw mode, so the field task defaults there.
  const mode = args.mode ?? (args.task === 'field' ? 'bw' : DEFAULT_SETTINGS.mode)
  const settings: VectorizeSettings = { ...DEFAULT_SETTINGS, mode }

  const manifest = JSON.parse(readFileSync(join(args.data, 'manifest.json'), 'utf8'))
  let samples = manifest.samples.filter((s: { split: string }) => s.split === args.split)
  if (samples.length === 0)
    throw new Error(`no samples in split '${args.split}' (try --split train)`)
  if (args.limit > 0) samples = samples.slice(0, args.limit)

  const degraded = emptyAcc()
  const clean = emptyAcc()
  let missing = 0

  for (const s of samples) {
    const base = basename(s.input as string, '.png')
    const inputImg = readRgba(join(args.data, s.input))
    const cleanImg = readRgba(join(args.data, s.clean))

    // degraded bucket: baseline (no pre-pass) vs. pre-pass, both traced on `input`.
    const predDeg = join(args.pred, 'degraded', field, `${base}.png`)
    if (!existsSync(predDeg)) {
      missing++
      continue
    }
    // oxlint-disable no-await-in-loop -- sequential: one engine run at a time, bounded memory
    const baseDeg = await trace(inputImg, cleanImg, settings)
    const onDeg = await tracePrepass(args.task, predDeg, inputImg, cleanImg, settings)
    add(degraded, baseDeg, onDeg)

    // clean bucket (do-no-harm): only when clean predictions exist.
    const predClean = join(args.pred, 'clean', field, `${base}.png`)
    if (existsSync(predClean)) {
      const baseClean = await trace(cleanImg, cleanImg, settings)
      const onClean = await tracePrepass(args.task, predClean, cleanImg, cleanImg, settings)
      add(clean, baseClean, onClean)
    }
    // oxlint-enable no-await-in-loop
  }

  const rows = [summarize('degraded', degraded), summarize('clean', clean)].filter(
    (r): r is BucketReport => r !== null,
  )
  if (rows.length === 0) {
    throw new Error(
      `no predictions found under ${args.pred}/degraded/${field}/ — run scripts/train/predict.py first (or build a stand-in, see scripts/eval/README.md)`,
    )
  }
  printReport(rows, args.task, settings.mode)
  if (missing > 0)
    console.log(
      `\n  (${missing} sample(s) skipped — no prediction under ${args.pred}/degraded/${field}/)`,
    )

  if (args.json) {
    mkdirSync(dirname(args.json), { recursive: true })
    writeFileSync(
      args.json,
      `${JSON.stringify({ task: args.task, mode: settings.mode, split: args.split, buckets: rows }, null, 2)}\n`,
    )
    console.log(`\n  report → ${args.json}`)
  }
}

main().catch((err) => {
  console.error(`\neval failed: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
