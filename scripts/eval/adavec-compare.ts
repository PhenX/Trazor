#!/usr/bin/env tsx
/**
 * Trazor vs. AdaVec (Zhao et al., CVPR 2025) on AdaVec's own test images — the
 * harness behind docs/ADAVEC_STUDY.md.
 *
 * Traces every `<data>/<dataset>/<name>.png` through `@trazor/engine` at native
 * resolution with the studio's auto-recommended settings (plus `--set`
 * overrides), rasterizes each SVG with resvg over white, and scores it under
 * AdaVec's protocol (its `metrics/score.py`): gray MSE at 256 px, RGB PSNR and
 * gray SSIM (7×7 uniform window, sample covariance), plus Trazor's own Oklab
 * panel (mean / edge / p95 / spurious hue, `lib.ts`). With `--renders`, another
 * tool's renders of the same images (`<renders>/<dataset>/<name>.png`) are
 * scored under the identical protocol so the two columns are comparable.
 *
 * Usage:
 *   npm run eval:adavec -- --data <AdaVec>/metrics/groundtruth
 *       --renders <AdaVec>/metrics/results/ours --out adavec-out
 *     --data <dir>       folder tree of PNGs (one sub-folder per dataset)
 *     --renders <dir>    same tree of another tool's renders to score alongside
 *     --out <dir>        write Trazor's SVG + PNG render per image
 *     --set k=v          override a setting for every image (repeatable)
 *     --max-dim N        resize before tracing (default 0 = native)
 *     --json <file>      also write every row as JSON
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { analyzeImage, recommendSettings } from '@trazor/assist'
import { DEFAULT_SETTINGS, getProfile, normalizeSettings } from '@trazor/core'
import type { RasterImage, VectorizeSettings } from '@trazor/core'
import { vectorize } from '@trazor/engine'
import { resizeToFit } from '@trazor/raster'
import {
  flattenOverWhite,
  qualityStats,
  rasterizeSvg,
  readRgba,
  resampleNearest,
  writePng,
} from './lib'

interface Args {
  data: string
  renders: string | null
  out: string | null
  sets: Array<[string, string]>
  maxDim: number
  json: string | null
}

function parseArgs(argv: string[]): Args {
  const a: Args = { data: '', renders: null, out: null, sets: [], maxDim: 0, json: null }
  for (let i = 0; i < argv.length; i++) {
    const val = argv[i + 1]
    switch (argv[i]) {
      case '--data':
        a.data = val
        i++
        break
      case '--renders':
        a.renders = val
        i++
        break
      case '--out':
        a.out = val
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
      case '--json':
        a.json = val
        i++
        break
    }
  }
  if (!a.data) throw new Error('--data <dir> is required')
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

/** ITU-R 601-2 luma as Pillow's `convert('L')` computes it (integer, rounded). */
function toGray(img: RasterImage): Float64Array {
  const n = img.width * img.height
  const g = new Float64Array(n)
  const d = img.data
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    g[p] = (d[i] * 19595 + d[i + 1] * 38470 + d[i + 2] * 7471 + 0x8000) >> 16
  }
  return g
}

/** Area-average a gray plane down to `size`×`size` (what a bilinear resize without antialiasing does at an exact 2× step). */
function boxResize(g: Float64Array, w: number, h: number, size: number): Float64Array {
  if (w === size && h === size) return g
  const out = new Float64Array(size * size)
  for (let y = 0; y < size; y++) {
    const y0 = Math.floor((y * h) / size)
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / size))
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor((x * w) / size)
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / size))
      let sum = 0
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) sum += g[yy * w + xx]
      out[y * size + x] = sum / ((y1 - y0) * (x1 - x0))
    }
  }
  return out
}

/** AdaVec's MSE: both images to gray, resized to 256×256, scaled to [0, 1]. */
function grayMse256(a: RasterImage, b: RasterImage): number {
  const ga = boxResize(toGray(a), a.width, a.height, 256)
  const gb = boxResize(toGray(b), b.width, b.height, 256)
  let sum = 0
  for (let i = 0; i < ga.length; i++) {
    const d = (ga[i] - gb[i]) / 255
    sum += d * d
  }
  return sum / ga.length
}

/** PSNR over the RGB channels of two same-sized opaque images (data range 255). */
function psnrRgb(a: RasterImage, b: RasterImage): number {
  let sum = 0
  const n = a.width * a.height
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    for (let c = 0; c < 3; c++) {
      const d = a.data[i + c] - b.data[i + c]
      sum += d * d
    }
  }
  const mse = sum / (n * 3)
  return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse)
}

/**
 * Gray SSIM as scikit-image's `structural_similarity` defaults compute it:
 * 7×7 uniform window, sample covariance (N/(N−1)), K1 = 0.01, K2 = 0.03, data
 * range 255, averaged over the image with a 3-px border cropped.
 */
function ssimGray(a: RasterImage, b: RasterImage): number {
  const w = a.width
  const h = a.height
  const x = toGray(a)
  const y = toGray(b)
  const WIN = 7
  const PAD = (WIN - 1) >> 1
  const NP = WIN * WIN
  const covNorm = NP / (NP - 1)
  const C1 = (0.01 * 255) ** 2
  const C2 = (0.03 * 255) ** 2
  // Integral images of x, y, x², y², xy (one row/column of zero padding).
  const W1 = w + 1
  const ix = new Float64Array(W1 * (h + 1))
  const iy = new Float64Array(W1 * (h + 1))
  const ixx = new Float64Array(W1 * (h + 1))
  const iyy = new Float64Array(W1 * (h + 1))
  const ixy = new Float64Array(W1 * (h + 1))
  for (let r = 1; r <= h; r++) {
    let sx = 0
    let sy = 0
    let sxx = 0
    let syy = 0
    let sxy = 0
    for (let c = 1; c <= w; c++) {
      const p = (r - 1) * w + (c - 1)
      sx += x[p]
      sy += y[p]
      sxx += x[p] * x[p]
      syy += y[p] * y[p]
      sxy += x[p] * y[p]
      const q = r * W1 + c
      const up = (r - 1) * W1 + c
      ix[q] = ix[up] + sx
      iy[q] = iy[up] + sy
      ixx[q] = ixx[up] + sxx
      iyy[q] = iyy[up] + syy
      ixy[q] = ixy[up] + sxy
    }
  }
  const box = (t: Float64Array, r0: number, c0: number, r1: number, c1: number): number =>
    t[r1 * W1 + c1] - t[r0 * W1 + c1] - t[r1 * W1 + c0] + t[r0 * W1 + c0]
  let sum = 0
  let count = 0
  for (let r = PAD; r < h - PAD; r++) {
    for (let c = PAD; c < w - PAD; c++) {
      const r0 = r - PAD
      const c0 = c - PAD
      const r1 = r + PAD + 1
      const c1 = c + PAD + 1
      const ux = box(ix, r0, c0, r1, c1) / NP
      const uy = box(iy, r0, c0, r1, c1) / NP
      const uxx = box(ixx, r0, c0, r1, c1) / NP
      const uyy = box(iyy, r0, c0, r1, c1) / NP
      const uxy = box(ixy, r0, c0, r1, c1) / NP
      const vx = covNorm * (uxx - ux * ux)
      const vy = covNorm * (uyy - uy * uy)
      const vxy = covNorm * (uxy - ux * uy)
      const A1 = 2 * ux * uy + C1
      const A2 = 2 * vxy + C2
      const B1 = ux * ux + uy * uy + C1
      const B2 = vx + vy + C2
      sum += (A1 * A2) / (B1 * B2)
      count++
    }
  }
  return count > 0 ? sum / count : 1
}

interface Scores {
  mse: number
  psnr: number
  ssim: number
  dE: number
  edge: number
  p95: number
  spurious: number
}

/** Every metric of a render against its opaque-over-white reference. */
function scoreRender(render: RasterImage, ref: RasterImage): Scores {
  const aligned = resampleNearest(render, ref.width, ref.height)
  const q = qualityStats(aligned, ref)
  return {
    mse: grayMse256(ref, aligned),
    psnr: psnrRgb(ref, aligned),
    ssim: ssimGray(ref, aligned),
    dE: q.mean,
    edge: q.edge,
    p95: q.p95,
    spurious: q.spurious,
  }
}

interface Row {
  dataset: string
  name: string
  width: number
  height: number
  settings: string
  ms: number
  shapes: number
  nodes: number
  segments: number
  bytes: number
  trazor: Scores
  other: Scores | null
}

const SCORE_KEYS: Array<keyof Scores> = ['mse', 'psnr', 'ssim', 'dE', 'edge', 'p95', 'spurious']

function fmtScores(s: Scores): string {
  return (
    `mse=${s.mse.toFixed(5)} psnr=${s.psnr.toFixed(2)} ssim=${s.ssim.toFixed(3)}` +
    ` ΔE=${s.dE.toFixed(4)} edge=${s.edge.toFixed(4)} p95=${s.p95.toFixed(3)} spur=${s.spurious.toFixed(4)}`
  )
}

function median(v: number[]): number {
  const s = v.toSorted((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2
}

function summarize(label: string, scores: Scores[]): void {
  const mean = (k: keyof Scores) => scores.reduce((a, s) => a + s[k], 0) / scores.length
  const med = (k: keyof Scores) => median(scores.map((s) => s[k]))
  console.log(
    `  ${label.padEnd(8)} mean   ${fmtScores(Object.fromEntries(SCORE_KEYS.map((k) => [k, mean(k)])) as unknown as Scores)}`,
  )
  console.log(
    `  ${label.padEnd(8)} median ${fmtScores(Object.fromEntries(SCORE_KEYS.map((k) => [k, med(k)])) as unknown as Scores)}`,
  )
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const rows: Row[] = []
  for (const dataset of readdirSync(args.data).toSorted()) {
    const dir = join(args.data, dataset)
    let files: string[]
    try {
      files = readdirSync(dir)
        .filter((f) => /\.png$/i.test(f))
        .toSorted()
    } catch {
      continue
    }
    if (files.length === 0) continue
    console.log(`\n${dataset} (${files.length} images)`)
    for (const file of files) {
      const source = readRgba(join(dir, file))
      const image = args.maxDim > 0 ? resizeToFit(source, args.maxDim) : source
      // Profile patch first, recommendation patch on top, both over defaults.
      const rec = recommendSettings(analyzeImage(image))
      let settings: VectorizeSettings = normalizeSettings({
        ...getProfile(rec.profileId).patch,
        ...rec.patch,
      })
      if (args.sets.length > 0) {
        const patch: Record<string, unknown> = {}
        for (const [k, v] of args.sets) patch[k] = coerce(k, v)
        settings = normalizeSettings(patch as Partial<VectorizeSettings>, settings)
      }
      settings = { ...settings, maxDimension: 0 }
      const t0 = performance.now()
      const res = await vectorize(image, settings, undefined, { withDocument: true })
      const ms = performance.now() - t0
      const ref = flattenOverWhite(source)
      const render = rasterizeSvg(res.svg, source.width)
      const shapes = res.document?.shapes ?? []
      let segments = 0
      for (const sh of shapes) for (const c of sh.commands) if (c.type !== 'M') segments++
      const name = basename(file, '.png')
      if (args.out) {
        const outDir = join(args.out, dataset)
        mkdirSync(outDir, { recursive: true })
        writeFileSync(join(outDir, `${name}.svg`), res.svg)
        writePng(join(outDir, file), render)
      }
      let other: Scores | null = null
      if (args.renders) {
        const path = join(args.renders, dataset, file)
        if (existsSync(path)) other = scoreRender(flattenOverWhite(readRgba(path)), ref)
      }
      const desc =
        settings.mode === 'color' || settings.mode === 'grayscale'
          ? `${rec.profileId}/${settings.mode}/${settings.segmentation}/${settings.layering}/k${settings.paletteSize}${settings.autoPaletteSize ? 'auto' : ''}`
          : `${rec.profileId}/${settings.mode}/${settings.thresholdMode}`
      const row: Row = {
        dataset,
        name,
        width: source.width,
        height: source.height,
        settings: desc,
        ms: Math.round(ms),
        shapes: shapes.length,
        nodes: res.stats.nodeCount,
        segments,
        bytes: res.svg.length,
        trazor: scoreRender(render, ref),
        other,
      }
      rows.push(row)
      console.log(
        `  ${name.slice(0, 32).padEnd(32)} ${row.width}x${row.height} ${desc.padEnd(30)}` +
          ` ${String(row.ms).padStart(5)} ms  shapes=${row.shapes} nodes=${row.nodes} seg=${row.segments} bytes=${row.bytes}`,
      )
      console.log(`    trazor   ${fmtScores(row.trazor)}`)
      if (other) console.log(`    renders  ${fmtScores(other)}`)
    }
    const ds = rows.filter((r) => r.dataset === dataset)
    const meanOf = (k: 'ms' | 'shapes' | 'nodes' | 'segments' | 'bytes') =>
      ds.reduce((a, r) => a + r[k], 0) / ds.length
    console.log(
      `  trazor   ms=${meanOf('ms').toFixed(0)} shapes=${meanOf('shapes').toFixed(1)} nodes=${meanOf('nodes').toFixed(0)}` +
        ` segments=${meanOf('segments').toFixed(0)} bytes=${meanOf('bytes').toFixed(0)}`,
    )
    summarize(
      'trazor',
      ds.map((r) => r.trazor),
    )
    const others = ds.map((r) => r.other).filter((s): s is Scores => s !== null)
    if (others.length > 0) {
      summarize('renders', others)
      const wins = ['mse', 'psnr', 'ssim'].map((k) => {
        const key = k as keyof Scores
        const n = ds.filter((r) => r.other).length
        const better = ds.filter((r) =>
          r.other
            ? key === 'mse'
              ? r.other.mse < r.trazor.mse
              : r.other[key] > r.trazor[key]
            : false,
        ).length
        return `${k} ${better}/${n}`
      })
      console.log(`  renders beat trazor on: ${wins.join('  ')}`)
    }
  }
  if (args.json) writeFileSync(args.json, JSON.stringify(rows, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
