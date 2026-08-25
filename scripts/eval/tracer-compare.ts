#!/usr/bin/env tsx
/**
 * Trazor vs. VTracer, measured (docs/ML_ROADMAP.md — the "use VTracer as a
 * benchmark oracle" item). For each corpus image it traces the same raster
 * through **@trazor/engine** and through the **vtracer** CLI, rasterizes both
 * SVGs with resvg over white, and reports, bucketed by image family:
 *
 *   - fidelity   — mean Oklab ΔE against the source, plus a banding-aware
 *                  edge-zone ΔE and a p95 worst-tail (lower is better).
 *   - node count — path complexity of the SVG (@trazor/svg analyzeSvg).
 *   - bytes      — serialized SVG size.
 *   - time       — wall-clock per tracer.
 *
 * It answers "is VTracer actually better, and where?" as a number per family
 * instead of a vibe — and becomes the regression harness for the fast-fit (②)
 * and gradient-segmentation (①) work: re-run it and watch the photo/gradient gap
 * close without regressing the flat/line-art buckets.
 *
 * VTracer is optional: without the binary the harness reports Trazor alone and
 * says so. Install it with `cargo install vtracer`, or point --vtracer / the
 * VTRACER_BIN env at a binary.
 *
 * Usage:
 *   npm run eval:corpus                 # write the default corpus first
 *   npm run eval:tracers                # compare over scripts/eval/corpus
 *   npm run eval:tracers -- --data <dir> --montage --json report.json
 *     --data <dir>     folder of PNG/JPEG images (+ optional families.json); default scripts/eval/corpus
 *     --max-dim N      resize inputs so the longest side ≤ N before tracing both (default
 *                      1600; 0 = native — VTracer has no downscale and takes minutes on a 24 MP photo)
 *     --out <dir>      where SVGs / montage are written; default eval-artifacts/tracers
 *     --vtracer <bin>  path to the vtracer binary (else VTRACER_BIN, PATH, ~/.cargo/bin)
 *     --profile <id>   force one Trazor profile for all (else auto: Trazor's own per-image recommendation)
 *     --set k=v        override a Trazor setting for every image (repeatable), e.g. --set dissolveBands=0
 *     --limit N        cap images
 *     --montage        also write an index.html with source | Trazor | VTracer
 *     --json <path>    also write the report as JSON
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { analyzeImage, recommendSettings } from '@trazor/assist'
import { DEFAULT_SETTINGS, getProfile, normalizeSettings } from '@trazor/core'
import type { ProfileId, RasterImage, VectorizeSettings } from '@trazor/core'
import { vectorize } from '@trazor/engine'
import { resizeToFit } from '@trazor/raster'
import { analyzeSvg } from '@trazor/svg'
import {
  flattenOverWhite,
  pngDataUri,
  qualityStats,
  rasterizeSvg,
  readRgba,
  resampleNearest,
  score,
  writePng,
} from './lib'

/**
 * The vtracer flags a user would pick for the goal Trazor's chosen profile
 * implies, so each image is traced tool-vs-tool at matched intent rather than one
 * hobbled against the other. Keyed by the Trazor profile — auto-recommended per
 * image, or forced via --profile.
 */
const PROFILE_VTRACER: Partial<Record<ProfileId, string[]>> = {
  photo: ['--preset', 'photo'],
  poster: ['--preset', 'poster'],
  'pixel-art': ['--mode', 'pixel'],
  'bw-sketch': ['--colormode', 'bw'],
  'laser-engrave': ['--colormode', 'bw'],
  'pen-plotter': ['--colormode', 'bw'],
  stencil: ['--colormode', 'bw'],
  logo: ['--mode', 'spline'],
  illustration: ['--mode', 'spline'],
  'vinyl-cut': ['--mode', 'spline'],
}
const DEFAULT_VTRACER = ['--mode', 'spline']

interface Args {
  data: string
  out: string
  maxDim: number
  vtracer?: string
  profile?: ProfileId
  limit: number
  montage: boolean
  overrides: Record<string, unknown>
  json?: string
}

/** Coerce a --set value string to boolean / number / string. */
function coerce(v: string): unknown {
  if (v === 'true') return true
  if (v === 'false') return false
  return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    data: 'scripts/eval/corpus',
    out: 'eval-artifacts/tracers',
    maxDim: 1600,
    limit: 0,
    montage: false,
    overrides: {},
  }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    const val = argv[i + 1]
    switch (key) {
      case '--data':
        a.data = val
        i++
        break
      case '--out':
        a.out = val
        i++
        break
      case '--max-dim':
        a.maxDim = Number(val)
        i++
        break
      case '--vtracer':
        a.vtracer = val
        i++
        break
      case '--profile':
        a.profile = val as ProfileId
        i++
        break
      case '--limit':
        a.limit = Number(val)
        i++
        break
      case '--montage':
        a.montage = true
        break
      case '--set': {
        const eq = (val ?? '').indexOf('=')
        if (eq > 0) a.overrides[val.slice(0, eq)] = coerce(val.slice(eq + 1))
        i++
        break
      }
      case '--json':
        a.json = val
        i++
        break
      default:
        if (key.startsWith('--')) throw new Error(`unknown flag ${key}`)
    }
  }
  return a
}

/** Resolve a vtracer binary: --vtracer, then VTRACER_BIN, PATH, ~/.cargo/bin. */
function resolveVtracer(override?: string): string | null {
  const candidates = [override, process.env.VTRACER_BIN].filter(Boolean) as string[]
  for (const c of candidates) if (existsSync(c)) return c
  try {
    return execFileSync('sh', ['-c', 'command -v vtracer'], { encoding: 'utf8' }).trim() || null
  } catch {
    const fallback = join(homedir(), '.cargo', 'bin', 'vtracer')
    return existsSync(fallback) ? fallback : null
  }
}

interface TraceResult {
  dE: number
  edgeDE: number
  p95: number
  spurious: number
  ssim: number
  hausdorff: number
  boundaryIoU: number
  nodes: number
  bytes: number
  ms: number
  svg: string
}

/** Banding-aware fidelity of a rendered SVG vs. the source, aligned by size. */
function fidelity(
  svg: string,
  srcWhite: RasterImage,
): TraceResult & { nodes: number; bytes: number } {
  const render = rasterizeSvg(svg, srcWhite.width)
  const ref = resampleNearest(srcWhite, render.width, render.height)
  const q = qualityStats(render, ref)
  return {
    dE: q.mean,
    edgeDE: q.edge,
    p95: q.p95,
    spurious: q.spurious,
    ssim: q.ssim,
    hausdorff: q.hausdorff,
    boundaryIoU: q.boundaryIoU,
    nodes: analyzeSvg(svg).nodeCount,
    bytes: Buffer.byteLength(svg, 'utf8'),
  }
}

/**
 * Trazor settings for one image: its own auto-recommendation (analyze → profile
 * + patch, exactly what apps/web applies on load — tuned to balance accuracy and
 * size), or a forced profile.
 */
function trazorSettings(
  image: RasterImage,
  forced?: ProfileId,
  overrides?: Record<string, unknown>,
): { settings: VectorizeSettings; profile: ProfileId } {
  let profile: ProfileId
  let settings: VectorizeSettings
  if (forced) {
    profile = forced
    settings = normalizeSettings(getProfile(forced).patch, DEFAULT_SETTINGS as VectorizeSettings)
  } else {
    // Profile patch first, recommendation patch on top, both over defaults.
    const rec = recommendSettings(analyzeImage(image))
    profile = rec.profileId
    settings = normalizeSettings({ ...getProfile(rec.profileId).patch, ...rec.patch })
  }
  if (overrides && Object.keys(overrides).length > 0) {
    settings = normalizeSettings(overrides as Partial<VectorizeSettings>, settings)
  }
  return { settings, profile }
}

async function traceTrazor(
  image: RasterImage,
  srcWhite: RasterImage,
  settings: VectorizeSettings,
): Promise<TraceResult> {
  const t0 = performance.now()
  const result = await vectorize(image, settings)
  const ms = performance.now() - t0
  const f = fidelity(result.svg, srcWhite)
  return { ...f, ms, svg: result.svg }
}

function traceVtracer(
  bin: string,
  inPath: string,
  outSvg: string,
  srcWhite: RasterImage,
  args: string[],
): TraceResult {
  const t0 = performance.now()
  execFileSync(bin, ['--input', inPath, '--output', outSvg, ...args], {
    timeout: 120_000,
    stdio: 'ignore',
  })
  const ms = performance.now() - t0
  const svg = readFileSync(outSvg, 'utf8')
  return { ...fidelity(svg, srcWhite), ms, svg }
}

interface Row {
  family: string
  name: string
  profile: ProfileId
  trazor: TraceResult
  vtracer: TraceResult | null
}

function fmt(n: number, d = 4): string {
  return n.toFixed(d)
}

/** Hausdorff may be Infinity (no edges on one side) — show it, don't print 3e8. */
function fmtHd(n: number): string {
  return Number.isFinite(n) ? fmt(n, 2) : '∞'
}

/** Aggregate mean ΔE / nodes / bytes / ms over a set of rows for one tracer. */
function agg(rows: Row[], pick: (r: Row) => TraceResult | null) {
  const got = rows.map(pick).filter((t): t is TraceResult => t !== null)
  if (got.length === 0) return null
  const mean = (f: (t: TraceResult) => number) => got.reduce((s, t) => s + f(t), 0) / got.length
  return {
    dE: mean((t) => t.dE),
    edgeDE: mean((t) => t.edgeDE),
    p95: mean((t) => t.p95),
    spurious: mean((t) => t.spurious),
    ssim: mean((t) => t.ssim),
    hausdorff: mean((t) => t.hausdorff),
    boundaryIoU: mean((t) => t.boundaryIoU),
    nodes: mean((t) => t.nodes),
    bytes: mean((t) => t.bytes),
    ms: mean((t) => t.ms),
    n: got.length,
  }
}

function printTable(rows: Row[], hasV: boolean): void {
  const head = hasV
    ? [
        'family',
        'image',
        'ΔE T',
        'ΔE V',
        'win',
        'nodes T',
        'nodes V',
        'bytes T',
        'bytes V',
        'ms T',
        'ms V',
      ]
    : ['family', 'image', 'ΔE T', 'nodes T', 'bytes T', 'ms T']
  const body: string[][] = []
  for (const r of rows) {
    const t = r.trazor
    const v = r.vtracer
    if (hasV) {
      const win = v ? (t.dE <= v.dE ? 'T' : 'V') : '—'
      body.push([
        r.family,
        r.name,
        fmt(t.dE),
        v ? fmt(v.dE) : 'fail',
        win,
        String(Math.round(t.nodes)),
        v ? String(Math.round(v.nodes)) : '—',
        String(t.bytes),
        v ? String(v.bytes) : '—',
        String(Math.round(t.ms)),
        v ? String(Math.round(v.ms)) : '—',
      ])
    } else {
      body.push([
        r.family,
        r.name,
        fmt(t.dE),
        String(Math.round(t.nodes)),
        String(t.bytes),
        String(Math.round(t.ms)),
      ])
    }
  }
  const table = [head, ...body]
  const widths = head.map((_, c) => Math.max(...table.map((row) => row[c].length)))
  const line = (row: string[]) => '  ' + row.map((cell, c) => cell.padStart(widths[c])).join('  ')
  console.log(line(head))
  console.log('  ' + widths.map((w) => '-'.repeat(w)).join('  '))
  for (const row of body) console.log(line(row))
}

function printFamilySummary(rows: Row[], hasV: boolean): void {
  const families = [...new Set(rows.map((r) => r.family))].toSorted()
  console.log('\n  per family (mean):\n')
  for (const fam of families) {
    const fr = rows.filter((r) => r.family === fam)
    const t = agg(fr, (r) => r.trazor)
    const v = agg(fr, (r) => r.vtracer)
    if (!t) continue
    if (hasV && v) {
      const nodeRatio = v.nodes > 0 ? (t.nodes / v.nodes).toFixed(2) : '—'
      const byteRatio = v.bytes > 0 ? (t.bytes / v.bytes).toFixed(2) : '—'
      console.log(
        `  ${fam.padEnd(12)} ΔE T ${fmt(t.dE)} V ${fmt(v.dE)}   band T ${fmt(t.edgeDE)} V ${fmt(v.edgeDE)}` +
          `   spurious T ${fmt(t.spurious)} V ${fmt(v.spurious)}   SSIM T ${fmt(t.ssim, 3)} V ${fmt(v.ssim, 3)}` +
          `   HD T ${fmtHd(t.hausdorff)} V ${fmtHd(v.hausdorff)}   bIoU T ${fmt(t.boundaryIoU, 3)} V ${fmt(v.boundaryIoU, 3)}` +
          `   nodes T/V ${nodeRatio}× KB T/V ${byteRatio}×`,
      )
    } else {
      console.log(
        `  ${fam.padEnd(12)} ΔE  T ${fmt(t.dE)}   SSIM ${fmt(t.ssim, 3)}   HD ${fmtHd(t.hausdorff)}   bIoU ${fmt(t.boundaryIoU, 3)}` +
          `   nodes ${Math.round(t.nodes)}   ms ${Math.round(t.ms)}`,
      )
    }
  }
}

const THUMB_W = 520

function metaLine(t: TraceResult | null): string {
  return t
    ? `ΔE ${fmt(t.dE, 4)} · band ${fmt(t.edgeDE, 4)} · spurious ${fmt(t.spurious, 4)} · ${Math.round(t.nodes)} nodes · ${(t.bytes / 1024).toFixed(1)} KB`
    : '—'
}

function paneHtml(title: string, uri: string | null, meta: string): string {
  return `<figure><figcaption>${title}</figcaption>${
    uri ? `<img src="${uri}" alt="${title}">` : '<div class="miss">failed</div>'
  }<small>${meta}</small></figure>`
}

function writeMontage(rows: Row[], outDir: string): void {
  // Panes are small PNG thumbnails rendered from each asset (the source PNG and
  // both SVGs, via the same resvg used for scoring) — fast to open and uncropped,
  // where a 300k-node SVG embedded live would not be. The full-resolution inputs
  // and SVG outputs stay on disk under source/, trazor/, vtracer/.
  const thumb = (img: RasterImage): string =>
    pngDataUri(
      resampleNearest(img, THUMB_W, Math.max(1, Math.round((THUMB_W * img.height) / img.width))),
    )
  const cell = (r: Row) => {
    const base = basename(r.name, extname(r.name))
    const srcUri = thumb(readRgba(join(outDir, 'source', `${base}.png`)))
    const trazorUri = pngDataUri(rasterizeSvg(r.trazor.svg, THUMB_W))
    const vtUri = r.vtracer ? pngDataUri(rasterizeSvg(r.vtracer.svg, THUMB_W)) : null
    return `<section>
    <h2>${r.name} <span>${r.family} · ${r.profile}</span></h2>
    <div class="row">
      ${paneHtml('source', srcUri, '')}
      ${paneHtml('Trazor', trazorUri, metaLine(r.trazor))}
      ${paneHtml('VTracer', vtUri, metaLine(r.vtracer))}
    </div>
  </section>`
  }

  const html = `<!doctype html><meta charset="utf8"><title>Trazor vs VTracer</title>
<style>
  :root{color-scheme:light dark}
  body{font:14px/1.5 system-ui,sans-serif;max-width:1100px;margin:0 auto;padding:24px}
  h1{font-size:20px}
  section{margin:28px 0;border-top:1px solid #8884;padding-top:16px}
  h2{font-size:15px;margin:0 0 12px} h2 span{color:#8a8a8a;font-weight:400}
  .row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
  figure{margin:0;text-align:center}
  figcaption{color:#8a8a8a;font-size:12px;margin-bottom:6px}
  img,.miss{width:100%;aspect-ratio:1;object-fit:contain;background:#fff;border:1px solid #8883;border-radius:6px}
  .miss{display:grid;place-items:center;color:#b00;font-size:12px;min-height:120px}
  small{display:block;color:#8a8a8a;margin-top:6px;font-size:12px}
</style>
<h1>Trazor vs VTracer</h1>
${rows.map(cell).join('\n')}`
  writeFileSync(join(outDir, 'index.html'), html)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (!existsSync(args.data)) {
    throw new Error(
      `no corpus at ${args.data} — run \`npm run eval:corpus\` first (or pass --data <dir>)`,
    )
  }
  const familyMap: Record<string, string> = existsSync(join(args.data, 'families.json'))
    ? JSON.parse(readFileSync(join(args.data, 'families.json'), 'utf8'))
    : {}
  let images = readdirSync(args.data)
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .toSorted()
  if (images.length === 0) throw new Error(`no images in ${args.data}`)
  if (args.limit > 0) images = images.slice(0, args.limit)

  const vbin = resolveVtracer(args.vtracer)
  const hasV = vbin !== null
  const outTrazor = join(args.out, 'trazor')
  const outVtracer = join(args.out, 'vtracer')
  mkdirSync(outTrazor, { recursive: true })
  if (hasV) mkdirSync(outVtracer, { recursive: true })
  const srcDir = join(args.out, 'source')
  mkdirSync(srcDir, { recursive: true })

  console.log(
    `\ncorpus=${args.data}  images=${images.length}  trazor=${
      args.profile ? `profile:${args.profile}` : 'auto'
    }  max-dim=${args.maxDim || 'native'}  vtracer=${hasV ? vbin : 'NOT FOUND (Trazor-only)'}\n`,
  )

  const rows: Row[] = []
  let vfail = 0
  for (const name of images) {
    const base = basename(name, extname(name))
    // Resize large inputs to a sane working size for BOTH tracers, then trace the
    // identical PNG (vtracer has no downscale and would spend minutes on a 24 MP
    // photo). The resized PNG is also the montage's source pane.
    const original = readRgba(join(args.data, name))
    const src = args.maxDim > 0 ? resizeToFit(original, args.maxDim) : original
    const srcPng = join(srcDir, `${base}.png`)
    writePng(srcPng, src)
    const srcWhite = flattenOverWhite(src)

    // Trazor uses its own auto-recommendation per image (what the app applies on
    // load) unless --profile forces one; vtracer gets the matching-intent flags.
    const { settings, profile } = trazorSettings(src, args.profile, args.overrides)
    const family = familyMap[name] ?? profile
    const vtracerArgs = PROFILE_VTRACER[profile] ?? DEFAULT_VTRACER

    // oxlint-disable-next-line no-await-in-loop -- sequential: one engine run at a time
    const trazor = await traceTrazor(src, srcWhite, settings)
    writeFileSync(join(outTrazor, `${base}.svg`), trazor.svg)

    let vt: TraceResult | null = null
    if (hasV) {
      try {
        vt = traceVtracer(
          vbin as string,
          srcPng,
          join(outVtracer, `${base}.svg`),
          srcWhite,
          vtracerArgs,
        )
      } catch (err) {
        vfail++
        console.error(`  ! vtracer failed on ${name}: ${err instanceof Error ? err.message : err}`)
      }
    }
    rows.push({ family, name, profile, trazor, vtracer: vt })
  }

  printTable(rows, hasV)
  printFamilySummary(rows, hasV)

  if (hasV) {
    const t = agg(rows, (r) => r.trazor)
    const v = agg(rows, (r) => r.vtracer)
    if (t && v) {
      console.log(
        `\n  overall  ΔE T ${fmt(t.dE)} V ${fmt(v.dE)}   band T ${fmt(t.edgeDE)} V ${fmt(v.edgeDE)}   ` +
          `spurious T ${fmt(t.spurious)} V ${fmt(v.spurious)}   p95 T ${fmt(t.p95)} V ${fmt(v.p95)}   ` +
          `SSIM T ${fmt(t.ssim, 3)} V ${fmt(v.ssim, 3)}   HD T ${fmtHd(t.hausdorff)} V ${fmtHd(v.hausdorff)}   ` +
          `bIoU T ${fmt(t.boundaryIoU, 3)} V ${fmt(v.boundaryIoU, 3)}   ` +
          `score T ${score(t.dE).toFixed(3)} V ${score(v.dE).toFixed(3)}   nodes T/V ${(t.nodes / v.nodes).toFixed(2)}×   bytes T/V ${(t.bytes / v.bytes).toFixed(2)}×`,
      )
    }
    if (vfail > 0) console.log(`  (${vfail} image(s) vtracer could not trace)`)
  } else {
    console.log(
      '\n  VTracer not found — install with `cargo install vtracer` to get the comparison columns.',
    )
  }

  if (args.montage) {
    writeMontage(rows, args.out)
    console.log(`\n  montage → ${join(args.out, 'index.html')}`)
  }
  if (args.json) {
    const report = rows.map((r) => ({
      family: r.family,
      image: r.name,
      profile: r.profile,
      trazor: {
        dE: r.trazor.dE,
        edgeDE: r.trazor.edgeDE,
        p95: r.trazor.p95,
        spurious: r.trazor.spurious,
        ssim: r.trazor.ssim,
        hausdorff: r.trazor.hausdorff,
        boundaryIoU: r.trazor.boundaryIoU,
        nodes: r.trazor.nodes,
        bytes: r.trazor.bytes,
        ms: r.trazor.ms,
      },
      vtracer: r.vtracer
        ? {
            dE: r.vtracer.dE,
            edgeDE: r.vtracer.edgeDE,
            p95: r.vtracer.p95,
            spurious: r.vtracer.spurious,
            ssim: r.vtracer.ssim,
            hausdorff: r.vtracer.hausdorff,
            boundaryIoU: r.vtracer.boundaryIoU,
            nodes: r.vtracer.nodes,
            bytes: r.vtracer.bytes,
            ms: r.vtracer.ms,
          }
        : null,
    }))
    mkdirSync(join(args.json, '..'), { recursive: true })
    writeFileSync(
      args.json,
      `${JSON.stringify({ corpus: args.data, vtracer: vbin, rows: report }, null, 2)}\n`,
    )
    console.log(`  report → ${args.json}`)
  }
}

main().catch((err) => {
  console.error(`\ntracer-compare failed: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
