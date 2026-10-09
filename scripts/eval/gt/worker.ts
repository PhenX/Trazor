/**
 * One gate worker thread: traces items with the engine named in the job
 * (Trazor in-process, or an inkvec executable), scores each against the
 * artist's file, and posts the rows back. Started by `gate.ts`.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import { analyzeImage, recommendSettings } from '@trazor/assist'
import type { RasterImage, VectorizeSettings } from '@trazor/core'
import { getProfile, normalizeSettings } from '@trazor/core'
import { vectorize } from '@trazor/engine'
import { flattenOverWhite, readRgba, writePng } from '../lib'
import type { GtCorpus, GtItem } from './corpus'
import { parseTier, rasterPath, truthPath } from './corpus'
import { scoreTrace, truthRender } from './score'

export interface Job {
  corpus: GtCorpus
  tier: string
  engine: 'trazor' | 'inkvec'
  /** Settings overrides on top of the recommender's (Trazor). */
  overrides: Partial<VectorizeSettings>
  /** Extra CLI args (inkvec). */
  inkvecExe?: string
  inkvecArgs: string[]
  cacheDir: string
  /** Where to keep each trace's SVG, if anywhere. */
  keepDir?: string
}

export interface Row {
  key: string
  corpus: string
  stem: string
  ms: number
  de00: number
  gmsd: number
  edgeMiss: number
  edgeExtra: number
  fillDe00: number
  bandDe00: number
  inkMiss: number
  inkExtra: number
  inksMissed: number
  ratio: number
  params: number
  turning: number
  selfRes: number
  anchors: number
  bytes: number
  error?: string
}

const { job } = workerData as { job: Job }

function inputRaster(it: GtItem): { img: RasterImage; path: string } {
  const p = rasterPath(job.corpus, it, job.tier)
  const { opaque } = parseTier(job.tier)
  if (!opaque) return { img: readRgba(p), path: p }
  const flat = flattenOverWhite(readRgba(p))
  const fp = join(job.cacheDir, 'op', job.tier, it.corpus, `${it.stem}.png`)
  mkdirSync(join(job.cacheDir, 'op', job.tier, it.corpus), { recursive: true })
  writePng(fp, flat)
  return { img: flat, path: fp }
}

async function traceTrazor(img: RasterImage): Promise<string> {
  const rec = recommendSettings(analyzeImage(img))
  const base = normalizeSettings({ ...getProfile(rec.profileId).patch, ...rec.patch })
  const { geometry, ...overrides } = job.overrides as Partial<VectorizeSettings> & {
    geometry?: 'classic' | 'planar'
  }
  const settings = normalizeSettings(overrides, base)
  return (await vectorize(img, settings, undefined, { geometry })).svg
}

function traceInkvec(path: string, out: string): string {
  execFileSync(job.inkvecExe as string, [path, '-o', out, '--quiet', ...job.inkvecArgs], {
    stdio: ['ignore', 'ignore', 'pipe'],
    timeout: 600_000,
  })
  return readFileSync(out, 'utf8')
}

async function run(it: GtItem): Promise<Row> {
  const key = `${it.corpus}/${it.stem}`
  try {
    const { img, path } = inputRaster(it)
    const t0 = performance.now()
    let svg: string
    if (job.engine === 'trazor') svg = await traceTrazor(img)
    else {
      const out = join(job.cacheDir, 'inkvec-tmp', `${it.corpus}__${it.stem}.svg`)
      mkdirSync(join(job.cacheDir, 'inkvec-tmp'), { recursive: true })
      svg = traceInkvec(path, out)
    }
    const ms = performance.now() - t0
    if (job.keepDir) writeFileSync(join(job.keepDir, `${it.corpus}__${it.stem}.svg`), svg)
    // An image with no artist file is judged against itself, at its own size.
    const truth = it.raster
      ? flattenOverWhite(img)
      : truthRender(
          truthPath(job.corpus, it),
          join(job.cacheDir, 'gt1024', it.corpus, `${it.stem}.png`),
        )
    const s = scoreTrace(svg, truth, img, it.gtParams)
    return { key, corpus: it.corpus, stem: it.stem, ms, ...s }
  } catch (e) {
    const nan = Number.NaN
    return {
      key,
      corpus: it.corpus,
      stem: it.stem,
      ms: nan,
      de00: nan,
      gmsd: nan,
      edgeMiss: nan,
      edgeExtra: nan,
      fillDe00: nan,
      bandDe00: nan,
      inkMiss: nan,
      inkExtra: nan,
      inksMissed: nan,
      ratio: nan,
      params: nan,
      turning: nan,
      selfRes: nan,
      anchors: nan,
      bytes: nan,
      error: String((e as Error)?.message ?? e).slice(0, 300),
    }
  }
}

parentPort?.on('message', async (msg: { item: GtItem } | { done: true }) => {
  if ('done' in msg) {
    process.exit(0)
  }
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker_threads port, not a window
  parentPort?.postMessage(await run(msg.item))
})
// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker_threads port, not a window
parentPort?.postMessage({ ready: true })
