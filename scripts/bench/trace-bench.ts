#!/usr/bin/env tsx
/**
 * Per-stage timing of the engine over a folder of images — the measurement
 * behind any performance work. Each image is traced with Trazor's own
 * auto-recommended settings (what the studio applies on load) unless a profile
 * or overrides are given, and the engine's stage timings are printed per image
 * plus a total and a short SHA-1 of the SVG text — so a performance change can
 * prove it is byte-identical (same hashes before and after) in the same run
 * that shows the speedup. Wall-clock only: pair with `cpu-summary.mjs` for a
 * profile.
 *
 * Usage:
 *   npm run bench                                   # scripts/eval/corpus-vtracer
 *   npm run bench -- --data <dir> --profile logo --set layering=cutout --repeat 3
 *   node --cpu-prof --cpu-prof-dir=prof node_modules/.bin/tsx scripts/bench/trace-bench.ts
 *     --data <dir>     folder of PNG/JPEG images; default scripts/eval/corpus-vtracer
 *     --profile <id>   force one target profile (else the per-image recommendation)
 *     --set k=v        override a setting for every image (repeatable)
 *     --max-dim N      resize before tracing (default 1600; 0 = native)
 *     --repeat N       trace each image N times, report the fastest (default 1)
 *     --limit N        cap images
 *     --tweak          warm-cache mode: after a cold run, nudge `smoothing` and
 *                      re-run on the same StageCache (what the studio does when a
 *                      curve slider moves), printing the warm stage times and
 *                      checking the SVG against a cold run of the tweaked settings
 */
import { createHash } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { analyzeImage, recommendSettings } from '@trazor/assist'
import { DEFAULT_SETTINGS, getProfile, normalizeSettings } from '@trazor/core'
import type { ProfileId, StageId, VectorizeSettings } from '@trazor/core'
import { vectorize } from '@trazor/engine'
import type { StageCache } from '@trazor/engine'
import { resizeToFit } from '@trazor/raster'
import { readRgba } from '../eval/lib'

interface Args {
  data: string
  profile: ProfileId | null
  sets: Array<[string, string]>
  maxDim: number
  repeat: number
  limit: number
  tweak: boolean
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    data: 'scripts/eval/corpus-vtracer',
    profile: null,
    sets: [],
    maxDim: 1600,
    repeat: 1,
    limit: 0,
    tweak: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const val = argv[i + 1]
    switch (argv[i]) {
      case '--data':
        a.data = val
        i++
        break
      case '--profile':
        a.profile = val as ProfileId
        i++
        break
      case '--set': {
        const eq = val.indexOf('=')
        a.sets.push([val.slice(0, eq), val.slice(eq + 1)])
        i++
        break
      }
      case '--max-dim':
        a.maxDim = Number(val)
        i++
        break
      case '--repeat':
        a.repeat = Math.max(1, Number(val))
        i++
        break
      case '--limit':
        a.limit = Number(val)
        i++
        break
      case '--tweak':
        a.tweak = true
        break
    }
  }
  return a
}

/** Coerce a `--set` value to the type of the default setting it overrides. */
function coerce(key: string, raw: string): unknown {
  const cur = (DEFAULT_SETTINGS as Record<string, unknown>)[key]
  if (typeof cur === 'number') return Number(raw)
  if (typeof cur === 'boolean') return raw === 'true' || raw === '1'
  if (cur === null) return raw === 'null' ? null : raw.split(',')
  return raw
}

const STAGES: StageId[] = ['preprocess', 'palette', 'segment', 'trace', 'svg']

/** Short SVG digest — two runs are byte-identical iff these match. */
function svgHash(svg: string): string {
  return createHash('sha1').update(svg).digest('hex').slice(0, 10)
}

/** Per-stage milliseconds of one run, summed per stage id. */
function stageMs(stages: { stage: StageId; ms: number }[]): Record<string, number> {
  const t: Record<string, number> = {}
  for (const s of stages) t[s.stage] = (t[s.stage] ?? 0) + s.ms
  return t
}

/** The curve-setting nudge the warm run applies: ±0.1 smoothing, clamped to [0,1]. */
function tweakSmoothing(v: number): number {
  return Math.round((v <= 0.9 ? v + 0.1 : v - 0.1) * 100) / 100
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  let files = readdirSync(args.data)
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .toSorted()
  if (args.limit > 0) files = files.slice(0, args.limit)

  const totals: Record<string, number> = {}
  let sumMs = 0
  let mismatches = 0
  const reuse = { pre: 0, pal: 0, ring: 0, ink: 0 }
  console.log(
    args.tweak
      ? `${'image'.padEnd(28)} ${'size'.padStart(9)} ${'settings'.padEnd(22)}` +
          ` ${STAGES.map((s) => s.padStart(9)).join('')} ${'warm'.padStart(8)} ${'cold'.padStart(8)}  svg-sha1    tweak`
      : `${'image'.padEnd(28)} ${'size'.padStart(9)} ${'settings'.padEnd(22)}` +
          ` ${STAGES.map((s) => s.padStart(9)).join('')} ${'total'.padStart(8)} ${'nodes'.padStart(7)}  svg-sha1`,
  )
  for (const file of files) {
    const original = readRgba(join(args.data, file))
    const image = args.maxDim > 0 ? resizeToFit(original, args.maxDim) : original
    let settings: VectorizeSettings
    if (args.profile) settings = normalizeSettings(getProfile(args.profile).patch)
    else settings = normalizeSettings(recommendSettings(analyzeImage(image)).settings)
    if (args.sets.length > 0) {
      const patch: Record<string, unknown> = {}
      for (const [k, v] of args.sets) patch[k] = coerce(k, v)
      settings = normalizeSettings(patch as Partial<VectorizeSettings>, settings)
    }
    // Trace at the working size directly so `preprocess` measures the pipeline's
    // own resize/denoise/flatten, not the harness's pre-resize.
    settings = { ...settings, maxDimension: 0 }

    const desc = `${settings.mode}/${settings.mode === 'color' || settings.mode === 'grayscale' ? `${settings.segmentation}/${settings.layering}` : settings.thresholdMode}`
    const name = basename(file, extname(file)).slice(0, 28).padEnd(28)
    const size = `${image.width}x${image.height}`.padStart(9)

    if (args.tweak) {
      // What the studio does when a curve slider moves: one cold run seeds the
      // worker's StageCache, the tweaked run reuses it. The tweaked settings are
      // also traced cold on a fresh cache — the two must be byte-identical.
      const cache: StageCache = {}
      const cold = await vectorize(image, settings, undefined, { imageId: 1, cache })
      const tweaked = { ...settings, smoothing: tweakSmoothing(settings.smoothing) }
      const warm = await vectorize(image, tweaked, undefined, { imageId: 1, cache })
      const reference = await vectorize(image, tweaked)
      const t = stageMs(warm.stats.stages)
      for (const st of STAGES) totals[st] = (totals[st] ?? 0) + (t[st] ?? 0)
      sumMs += warm.stats.durationMs
      const hash = svgHash(warm.svg)
      const same = hash === svgHash(reference.svg)
      if (!same) mismatches++
      const st = cache.stats
      if (st) {
        reuse.pre += st.preHits
        reuse.pal += st.palHits
        reuse.ring += st.ringHits
        reuse.ink += st.inkHits
      }
      console.log(
        `${name} ${size} ${desc.padEnd(22)}` +
          ` ${STAGES.map((s) => (t[s] ?? 0).toFixed(0).padStart(9)).join('')}` +
          ` ${warm.stats.durationMs.toFixed(0).padStart(8)} ${cold.stats.durationMs.toFixed(0).padStart(8)}  ${hash}` +
          `  ${same ? 'ok' : `MISMATCH cold=${svgHash(reference.svg)}`}`,
      )
      continue
    }

    let best: Record<string, number> | null = null
    let bestTotal = Infinity
    let nodes = 0
    let hash = ''
    for (let r = 0; r < args.repeat; r++) {
      const res = await vectorize(image, settings)
      const t = stageMs(res.stats.stages)
      if (res.stats.durationMs < bestTotal) {
        bestTotal = res.stats.durationMs
        best = t
        nodes = res.stats.nodeCount
        hash = svgHash(res.svg)
      }
    }
    const t = best ?? {}
    for (const s of STAGES) totals[s] = (totals[s] ?? 0) + (t[s] ?? 0)
    sumMs += bestTotal
    console.log(
      `${name} ${size} ${desc.padEnd(22)}` +
        ` ${STAGES.map((s) => (t[s] ?? 0).toFixed(0).padStart(9)).join('')} ${bestTotal.toFixed(0).padStart(8)} ${String(nodes).padStart(7)}  ${hash}`,
    )
  }
  console.log(
    `${'TOTAL'.padEnd(28)} ${''.padStart(9)} ${''.padEnd(22)}` +
      ` ${STAGES.map((s) => (totals[s] ?? 0).toFixed(0).padStart(9)).join('')} ${sumMs.toFixed(0).padStart(8)}`,
  )
  const pct = STAGES.map((s) => `${s} ${((100 * (totals[s] ?? 0)) / sumMs).toFixed(0)}%`).join('  ')
  console.log(`share: ${pct}`)
  if (args.tweak) {
    console.log(
      `warm reuse: preprocess ${reuse.pre}  palette ${reuse.pal}  rings ${reuse.ring}  ink ${reuse.ink}` +
        ` (of ${files.length} images)`,
    )
    if (mismatches > 0) {
      console.log(
        `\n!! MISMATCH on ${mismatches} image(s): a warm run differs from its cold run !!`,
      )
      process.exitCode = 1
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
