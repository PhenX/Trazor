#!/usr/bin/env tsx
/**
 * Trazor vs. VTracer, measured (docs/ML_ROADMAP.md — the "use VTracer as a
 * benchmark oracle" item). For each corpus image it traces the same raster
 * through **@trazor/engine** and through the **vtracer** CLI, rasterizes both
 * SVGs with resvg over white, and reports, bucketed by image family:
 *
 *   - fidelity   — mean Oklab ΔE against the source (lower is better; same metric
 *                  as apps/web/src/lib/fidelity.ts and the pre-pass harness).
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
 *     --data <dir>     folder of PNGs (+ optional families.json); default scripts/eval/corpus
 *     --out <dir>      where SVGs / montage are written; default eval-artifacts/tracers
 *     --vtracer <bin>  path to the vtracer binary (else VTRACER_BIN, PATH, ~/.cargo/bin)
 *     --profile <id>   force one Trazor profile for every image (else per-family)
 *     --limit N        cap images
 *     --montage        also write an index.html with source | Trazor | VTracer
 *     --json <path>    also write the report as JSON
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { DEFAULT_SETTINGS, getProfile, normalizeSettings } from '@trazor/core'
import type { ProfileId, RasterImage, VectorizeSettings } from '@trazor/core'
import { vectorize } from '@trazor/engine'
import { analyzeSvg } from '@trazor/svg'
import { flattenOverWhite, meanDeltaE, rasterizeSvg, readRgba, resampleNearest, score } from './lib'

interface FamilyConfig {
  profile: ProfileId
  /** Extra vtracer flags a user would reach for on this kind of image. */
  vtracer: string[]
}

/**
 * How each family is traced by both tools — Trazor's matching target profile and
 * the vtracer flags a user would pick for the same goal, so the comparison is
 * tool-vs-tool at their intended settings, not one hobbled against the other.
 */
const FAMILIES: Record<string, FamilyConfig> = {
  flat: { profile: 'logo', vtracer: ['--mode', 'spline'] },
  logo: { profile: 'logo', vtracer: ['--mode', 'spline'] },
  illustration: { profile: 'illustration', vtracer: ['--mode', 'spline'] },
  poster: { profile: 'poster', vtracer: ['--preset', 'poster'] },
  photo: { profile: 'photo', vtracer: ['--preset', 'photo'] },
  lineart: { profile: 'bw-sketch', vtracer: ['--colormode', 'bw'] },
  pixel: { profile: 'pixel-art', vtracer: ['--mode', 'pixel'] },
}
const DEFAULT_FAMILY = 'illustration'

interface Args {
  data: string
  out: string
  vtracer?: string
  profile?: ProfileId
  limit: number
  montage: boolean
  json?: string
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    data: 'scripts/eval/corpus',
    out: 'eval-artifacts/tracers',
    limit: 0,
    montage: false,
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
  nodes: number
  bytes: number
  ms: number
  svg: string
}

/** ΔE of a rendered SVG against the (white-composited) source, aligned by size. */
function fidelity(
  svg: string,
  srcWhite: RasterImage,
): { dE: number; nodes: number; bytes: number } {
  const render = rasterizeSvg(svg, srcWhite.width)
  const ref = resampleNearest(srcWhite, render.width, render.height)
  return {
    dE: meanDeltaE(render, ref),
    nodes: analyzeSvg(svg).nodeCount,
    bytes: Buffer.byteLength(svg, 'utf8'),
  }
}

async function traceTrazor(
  image: RasterImage,
  srcWhite: RasterImage,
  profile: ProfileId,
): Promise<TraceResult> {
  const settings: VectorizeSettings = normalizeSettings(
    getProfile(profile).patch,
    DEFAULT_SETTINGS as VectorizeSettings,
  )
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

/** Aggregate mean ΔE / nodes / bytes / ms over a set of rows for one tracer. */
function agg(rows: Row[], pick: (r: Row) => TraceResult | null) {
  const got = rows.map(pick).filter((t): t is TraceResult => t !== null)
  if (got.length === 0) return null
  const mean = (f: (t: TraceResult) => number) => got.reduce((s, t) => s + f(t), 0) / got.length
  return {
    dE: mean((t) => t.dE),
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
      const closer = t.dE <= v.dE ? 'Trazor' : 'VTracer'
      const nodeRatio = v.nodes > 0 ? (t.nodes / v.nodes).toFixed(2) : '—'
      console.log(
        `  ${fam.padEnd(12)} ΔE  T ${fmt(t.dE)}  V ${fmt(v.dE)}  → ${closer} closer` +
          `   |  nodes T/V ${nodeRatio}×   |  ms T ${Math.round(t.ms)} V ${Math.round(v.ms)}`,
      )
    } else {
      console.log(
        `  ${fam.padEnd(12)} ΔE  T ${fmt(t.dE)}   nodes ${Math.round(t.nodes)}   ms ${Math.round(t.ms)}`,
      )
    }
  }
}

function writeMontage(rows: Row[], dataDir: string, outDir: string): void {
  const cell = (r: Row) => {
    const srcB64 = readFileSync(join(dataDir, r.name)).toString('base64')
    const num = (t: TraceResult | null, label: string) =>
      t
        ? `${label} ΔE ${fmt(t.dE, 4)} · ${Math.round(t.nodes)} nodes · ${(t.bytes / 1024).toFixed(1)} KB · ${Math.round(t.ms)} ms`
        : `${label} —`
    return `<tr>
      <td class="lbl"><b>${r.name}</b><br><span>${r.family} · ${r.profile}</span></td>
      <td><img src="data:image/png;base64,${srcB64}" alt="source"><div>source</div></td>
      <td><div class="svg">${r.trazor.svg}</div><div>${num(r.trazor, 'Trazor')}</div></td>
      <td><div class="svg">${r.vtracer ? r.vtracer.svg : ''}</div><div>${num(r.vtracer, 'VTracer')}</div></td>
    </tr>`
  }
  const html = `<!doctype html><meta charset="utf8"><title>Trazor vs VTracer</title>
<style>
  body{font:14px system-ui,sans-serif;margin:24px;background:#fff;color:#111}
  table{border-collapse:collapse;width:100%}
  td{border:1px solid #ddd;padding:8px;vertical-align:top;text-align:center}
  td.lbl{text-align:left;white-space:nowrap} td.lbl span{color:#888;font-size:12px}
  img,.svg svg{width:220px;height:220px;object-fit:contain;background:#fff}
  td div{margin-top:6px;color:#555;font-size:12px}
  th{padding:8px;text-align:center;color:#666;font-weight:600}
</style>
<h1>Trazor vs VTracer</h1>
<table><thead><tr><th>image</th><th>source</th><th>Trazor</th><th>VTracer</th></tr></thead>
<tbody>${rows.map(cell).join('\n')}</tbody></table>`
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
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .toSorted()
  if (images.length === 0) throw new Error(`no PNGs in ${args.data}`)
  if (args.limit > 0) images = images.slice(0, args.limit)

  const vbin = resolveVtracer(args.vtracer)
  const hasV = vbin !== null
  const outTrazor = join(args.out, 'trazor')
  const outVtracer = join(args.out, 'vtracer')
  mkdirSync(outTrazor, { recursive: true })
  if (hasV) mkdirSync(outVtracer, { recursive: true })

  console.log(
    `\ncorpus=${args.data}  images=${images.length}  vtracer=${hasV ? vbin : 'NOT FOUND (Trazor-only)'}\n`,
  )

  const rows: Row[] = []
  let vfail = 0
  for (const name of images) {
    const base = basename(name, '.png')
    const family = familyMap[name] ?? DEFAULT_FAMILY
    const cfg = FAMILIES[family] ?? FAMILIES[DEFAULT_FAMILY]
    const profile = args.profile ?? cfg.profile
    const src = readRgba(join(args.data, name))
    const srcWhite = flattenOverWhite(src)

    // oxlint-disable-next-line no-await-in-loop -- sequential: one engine run at a time
    const trazor = await traceTrazor(src, srcWhite, profile)
    writeFileSync(join(outTrazor, `${base}.svg`), trazor.svg)

    let vt: TraceResult | null = null
    if (hasV) {
      try {
        vt = traceVtracer(
          vbin as string,
          join(args.data, name),
          join(outVtracer, `${base}.svg`),
          srcWhite,
          cfg.vtracer,
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
        `\n  overall  ΔE  Trazor ${fmt(t.dE)}  VTracer ${fmt(v.dE)}   ` +
          `score T ${score(t.dE).toFixed(3)} V ${score(v.dE).toFixed(3)}   ` +
          `nodes T/V ${(t.nodes / v.nodes).toFixed(2)}×`,
      )
    }
    if (vfail > 0) console.log(`  (${vfail} image(s) vtracer could not trace)`)
  } else {
    console.log(
      '\n  VTracer not found — install with `cargo install vtracer` to get the comparison columns.',
    )
  }

  if (args.montage) {
    writeMontage(rows, args.data, args.out)
    console.log(`\n  montage → ${join(args.out, 'index.html')}`)
  }
  if (args.json) {
    const report = rows.map((r) => ({
      family: r.family,
      image: r.name,
      profile: r.profile,
      trazor: { dE: r.trazor.dE, nodes: r.trazor.nodes, bytes: r.trazor.bytes, ms: r.trazor.ms },
      vtracer: r.vtracer
        ? { dE: r.vtracer.dE, nodes: r.vtracer.nodes, bytes: r.vtracer.bytes, ms: r.vtracer.ms }
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
