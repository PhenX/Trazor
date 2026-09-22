#!/usr/bin/env tsx
/**
 * Trazor vs. Inkvec, measured — the same protocol as `tracer-compare.ts` with
 * the [Inkvec](https://github.com/logolabs/inkvec) CLI as the oracle instead of
 * VTracer, plus the two things Inkvec's own bench reads that the VTracer
 * harness does not:
 *
 *   - **scale fidelity** — when a corpus folder carries `truth/<name>.svg` (the
 *     artist's vector file the raster was rendered from), both outputs are also
 *     rendered at `--scale`× and scored against the truth rendered at that size.
 *     A boundary that is sub-pixel right stays right at 2×; a boundary snapped to
 *     the pixel grid shows its staircase there. This is where Inkvec's
 *     coverage inversion is expected to show, and the 1× score cannot see it.
 *   - **coordinates** — Inkvec's compactness count (each line 2, cubic 6,
 *     quadratic 4, arc 2, `<circle>`/`<ellipse>`/`<rect>` 2, polygon its
 *     numbers), so the node economy is compared on their unit as well as on
 *     `analyzeSvg`'s node count.
 *
 * Fidelity at 1× is scored exactly as `tracer-compare.ts` scores it: resvg
 * over white, GMSD (the human-validated primary), mean Oklab ΔE, the edge band,
 * p95 and spurious hue — plus CIEDE2000 (Inkvec's own metric) for
 * comparability with its published tables.
 *
 * Usage:
 *   npm run eval:inkvec -- --data <dir> --inkvec <bin> [--json report.json]
 *     --data <dir>       folder of PNGs (+ optional families.json, truth/*.svg)
 *     --inkvec <bin>     the inkvec binary (else INKVEC_BIN)
 *     --inkvec-args ".." extra flags for inkvec (default `--quiet`)
 *     --out <dir>        where SVGs are written; default eval-artifacts/inkvec
 *     --profile <id>     force one Trazor profile (else per-image auto)
 *     --set k=v          override a Trazor setting for every image (repeatable)
 *     --scale N          truth render scale for scale fidelity (default 2)
 *     --reuse            reuse inkvec SVGs already in --out (skips the CLI)
 *     --limit N          cap images
 *     --json <path>      also write the report as JSON
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { analyzeImage, recommendSettings } from '@trazor/assist'
import { ciede2000, DEFAULT_SETTINGS, getProfile, normalizeSettings, rgbToLab } from '@trazor/core'
import type { ProfileId, RasterImage, VectorizeSettings } from '@trazor/core'
import { vectorize } from '@trazor/engine'
import { analyzeSvg } from '@trazor/svg'
import { gmsd } from './gmsd'
import { flattenOverWhite, qualityStats, rasterizeSvg, readRgba, resampleNearest } from './lib'

interface Args {
  data: string
  out: string
  inkvec?: string
  inkvecArgs: string[]
  profile?: ProfileId
  overrides: Record<string, unknown>
  scale: number
  reuse: boolean
  limit: number
  json?: string
}

function coerce(v: string): unknown {
  if (v === 'true') return true
  if (v === 'false') return false
  return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    data: '',
    out: 'eval-artifacts/inkvec',
    inkvecArgs: ['--quiet'],
    overrides: {},
    scale: 2,
    reuse: false,
    limit: 0,
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
      case '--inkvec':
        a.inkvec = val
        i++
        break
      case '--inkvec-args':
        a.inkvecArgs = val.split(/\s+/).filter(Boolean)
        i++
        break
      case '--profile':
        a.profile = val as ProfileId
        i++
        break
      case '--set': {
        const eq = (val ?? '').indexOf('=')
        if (eq > 0) a.overrides[val.slice(0, eq)] = coerce(val.slice(eq + 1))
        i++
        break
      }
      case '--scale':
        a.scale = Number(val)
        i++
        break
      case '--reuse':
        a.reuse = true
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
  if (a.data === '') throw new Error('--data <dir> is required')
  return a
}

// ---- CIEDE2000 (Sharma, Wu & Dalal 2005): @trazor/core `ciede2000`/`rgbToLab` ----

/** Mean CIEDE2000 between two same-sized rasters (both opaque over white). */
function meanDe00(a: RasterImage, b: RasterImage): number {
  const n = Math.min(a.data.length, b.data.length) >> 2
  let sum = 0
  for (let p = 0; p < n; p++) {
    const i = p * 4
    const [l1, a1, b1] = rgbToLab(a.data[i] / 255, a.data[i + 1] / 255, a.data[i + 2] / 255)
    const [l2, a2, b2] = rgbToLab(b.data[i] / 255, b.data[i + 1] / 255, b.data[i + 2] / 255)
    sum += ciede2000(l1, a1, b1, l2, a2, b2)
  }
  return n > 0 ? sum / n : 0
}

// ---- Inkvec's compactness count ----

const NUM_RE = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g

/**
 * Coordinates the way Inkvec's bench counts them (`crosscompare_current.py`
 * `structure()`): after normalizing shorthands, a move/line 2, a cubic 6, a
 * quadratic 4, an arc 2, `<circle>`/`<ellipse>`/`<rect>` 2 each and a polygon
 * its numbers. `H`/`V` are lines and `S`/`T` are full cubics/quadratics.
 */
function countCoordinates(svg: string): number {
  let coords = 0
  const perCmd: Record<string, [number, number]> = {
    M: [2, 2],
    L: [2, 2],
    H: [1, 2],
    V: [1, 2],
    C: [6, 6],
    S: [4, 6],
    Q: [4, 4],
    T: [2, 4],
    A: [7, 2],
  }
  for (const m of svg.matchAll(/(?<![\w-])d\s*=\s*"([^"]*)"/g)) {
    const d = m[1]
    for (const seg of d.matchAll(/([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g)) {
      const cmd = seg[1].toUpperCase()
      if (cmd === 'Z') continue
      const nums = (seg[2].match(NUM_RE) ?? []).length
      const [arity, cost] = perCmd[cmd]
      const reps = Math.max(1, Math.floor(nums / arity))
      // An M followed by more pairs continues as implicit lines (same cost).
      coords += reps * cost
    }
  }
  coords += 2 * (svg.match(/<(?:circle|ellipse|rect)\b/g) ?? []).length
  for (const m of svg.matchAll(/<(?:polygon|polyline)\b[^>]*\bpoints="([^"]*)"/g)) {
    coords += (m[1].match(NUM_RE) ?? []).length
  }
  return coords
}

// ---- scoring ----

interface Fidelity {
  gmsd: number
  dE: number
  de00: number
  edgeDE: number
  p95: number
  spurious: number
}

interface TraceResult extends Fidelity {
  /** Scale fidelity against the truth render, when a truth SVG exists. */
  scaled?: { gmsd: number; dE: number; de00: number }
  nodes: number
  coords: number
  bytes: number
  gzip: number
  ms: number
  svg: string
}

function fidelity(svg: string, srcWhite: RasterImage): Fidelity {
  const render = rasterizeSvg(svg, srcWhite.width)
  const ref = resampleNearest(srcWhite, render.width, render.height)
  const q = qualityStats(render, ref)
  return {
    gmsd: gmsd(render, ref),
    dE: q.mean,
    de00: meanDe00(render, ref),
    edgeDE: q.edge,
    p95: q.p95,
    spurious: q.spurious,
  }
}

function scaledFidelity(
  svg: string,
  truthRender: RasterImage,
): { gmsd: number; dE: number; de00: number } {
  const render = rasterizeSvg(svg, truthRender.width)
  const ref = resampleNearest(truthRender, render.width, render.height)
  return {
    gmsd: gmsd(render, ref),
    dE: qualityStats(render, ref).mean,
    de00: meanDe00(render, ref),
  }
}

function measure(svg: string, ms: number, srcWhite: RasterImage, truth?: RasterImage): TraceResult {
  return {
    ...fidelity(svg, srcWhite),
    scaled: truth ? scaledFidelity(svg, truth) : undefined,
    nodes: analyzeSvg(svg).nodeCount,
    coords: countCoordinates(svg),
    bytes: Buffer.byteLength(svg, 'utf8'),
    gzip: gzipSync(svg).length,
    ms,
    svg,
  }
}

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
    const rec = recommendSettings(analyzeImage(image))
    profile = rec.profileId
    settings = normalizeSettings({ ...getProfile(rec.profileId).patch, ...rec.patch })
  }
  if (overrides && Object.keys(overrides).length > 0) {
    settings = normalizeSettings(overrides as Partial<VectorizeSettings>, settings)
  }
  return { settings, profile }
}

interface Row {
  family: string
  name: string
  profile: ProfileId
  trazor: TraceResult
  inkvec: TraceResult | null
}

function fmt(n: number, d = 4): string {
  return n.toFixed(d)
}

interface Agg {
  gmsd: number
  dE: number
  de00: number
  spurious: number
  sGmsd: number | null
  sDE: number | null
  sDe00: number | null
  nodes: number
  coords: number
  bytes: number
  gzip: number
  ms: number
  n: number
}

function agg(rows: Row[], pick: (r: Row) => TraceResult | null): Agg | null {
  const got = rows.map(pick).filter((t): t is TraceResult => t !== null)
  if (got.length === 0) return null
  const mean = (f: (t: TraceResult) => number): number =>
    got.reduce((s, t) => s + f(t), 0) / got.length
  const scaled = got.filter((t) => t.scaled !== undefined)
  const smean = (f: (s: { gmsd: number; dE: number; de00: number }) => number): number | null =>
    scaled.length > 0
      ? scaled.reduce((s, t) => s + f(t.scaled as { gmsd: number; dE: number; de00: number }), 0) /
        scaled.length
      : null
  return {
    gmsd: mean((t) => t.gmsd),
    dE: mean((t) => t.dE),
    de00: mean((t) => t.de00),
    spurious: mean((t) => t.spurious),
    sGmsd: smean((s) => s.gmsd),
    sDE: smean((s) => s.dE),
    sDe00: smean((s) => s.de00),
    nodes: mean((t) => t.nodes),
    coords: mean((t) => t.coords),
    bytes: mean((t) => t.bytes),
    gzip: mean((t) => t.gzip),
    ms: mean((t) => t.ms),
    n: got.length,
  }
}

function printTable(rows: Row[]): void {
  const head = [
    'family',
    'image',
    'GMSD T',
    'GMSD I',
    'dE00 T',
    'dE00 I',
    'GMSD2× T',
    'GMSD2× I',
    'coords T',
    'coords I',
    'bytes T',
    'bytes I',
    'ms T',
    'ms I',
  ]
  const body: string[][] = []
  for (const r of rows) {
    const t = r.trazor
    const v = r.inkvec
    body.push([
      r.family,
      r.name.length > 34 ? `${r.name.slice(0, 31)}…` : r.name,
      fmt(t.gmsd),
      v ? fmt(v.gmsd) : 'fail',
      fmt(t.de00, 3),
      v ? fmt(v.de00, 3) : '—',
      t.scaled ? fmt(t.scaled.gmsd) : '—',
      v?.scaled ? fmt(v.scaled.gmsd) : '—',
      String(t.coords),
      v ? String(v.coords) : '—',
      String(t.bytes),
      v ? String(v.bytes) : '—',
      String(Math.round(t.ms)),
      v ? String(Math.round(v.ms)) : '—',
    ])
  }
  const table = [head, ...body]
  const widths = head.map((_, c) => Math.max(...table.map((row) => row[c].length)))
  const line = (row: string[]): string =>
    '  ' + row.map((cell, c) => cell.padStart(widths[c])).join('  ')
  console.log(line(head))
  console.log('  ' + widths.map((w) => '-'.repeat(w)).join('  '))
  for (const row of body) console.log(line(row))
}

function summaryLine(label: string, t: Agg, v: Agg | null): string {
  const ratio = (a: number, b: number | null): string =>
    b !== null && b > 0 ? `${(a / b).toFixed(2)}×` : '—'
  const s = (x: number | null, d = 4): string => (x === null ? '—' : fmt(x, d))
  let out = `  ${label.padEnd(16)} GMSD T ${fmt(t.gmsd)} I ${s(v?.gmsd ?? null)}`
  out += `   dE00 T ${fmt(t.de00, 3)} I ${s(v?.de00 ?? null, 3)}`
  out += `   ΔE T ${fmt(t.dE)} I ${s(v?.dE ?? null)}`
  out += `   spurious T ${fmt(t.spurious)} I ${s(v?.spurious ?? null)}`
  if (t.sGmsd !== null) {
    out += `\n  ${''.padEnd(16)} scale GMSD T ${fmt(t.sGmsd)} I ${s(v?.sGmsd ?? null)}`
    out += `   scale dE00 T ${s(t.sDe00, 3)} I ${s(v?.sDe00 ?? null, 3)}`
  }
  out += `\n  ${''.padEnd(16)} coords T/I ${ratio(t.coords, v?.coords ?? null)} (${Math.round(t.coords)}/${v ? Math.round(v.coords) : '—'})`
  out += `   nodes T/I ${ratio(t.nodes, v?.nodes ?? null)}`
  out += `   gzip T/I ${ratio(t.gzip, v?.gzip ?? null)}`
  out += `   ms T ${Math.round(t.ms)} I ${v ? Math.round(v.ms) : '—'}`
  return out
}

function printSummary(rows: Row[]): void {
  const families = [...new Set(rows.map((r) => r.family))].toSorted()
  console.log('\n  per family (mean):\n')
  for (const fam of families) {
    const fr = rows.filter((r) => r.family === fam)
    const t = agg(fr, (r) => r.trazor)
    const v = agg(fr, (r) => r.inkvec)
    if (!t) continue
    console.log(summaryLine(`${fam} (${fr.length})`, t, v))
  }
  const t = agg(rows, (r) => r.trazor)
  const v = agg(rows, (r) => r.inkvec)
  if (t) {
    console.log('')
    console.log(summaryLine(`overall (${rows.length})`, t, v))
    // Win counts on the primary, so a mean pulled by one outlier cannot hide a
    // consistent per-image loss.
    const paired = rows.filter((r) => r.inkvec !== null)
    const wins = (f: (r: Row) => boolean): number => paired.filter(f).length
    console.log(
      `\n  per-image wins (T better / I better) — GMSD ${wins((r) => r.trazor.gmsd < (r.inkvec as TraceResult).gmsd)}/${wins(
        (r) => r.trazor.gmsd > (r.inkvec as TraceResult).gmsd,
      )}` +
        `   dE00 ${wins((r) => r.trazor.de00 < (r.inkvec as TraceResult).de00)}/${wins((r) => r.trazor.de00 > (r.inkvec as TraceResult).de00)}` +
        (t.sGmsd !== null
          ? `   scale GMSD ${wins((r) => (r.trazor.scaled?.gmsd ?? 0) < ((r.inkvec as TraceResult).scaled?.gmsd ?? 0))}/${wins(
              (r) => (r.trazor.scaled?.gmsd ?? 0) > ((r.inkvec as TraceResult).scaled?.gmsd ?? 0),
            )}`
          : '') +
        `   coords ${wins((r) => r.trazor.coords < (r.inkvec as TraceResult).coords)}/${wins((r) => r.trazor.coords > (r.inkvec as TraceResult).coords)}`,
    )
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (!existsSync(args.data)) throw new Error(`no corpus at ${args.data}`)
  const familyMap: Record<string, string> = existsSync(join(args.data, 'families.json'))
    ? JSON.parse(readFileSync(join(args.data, 'families.json'), 'utf8'))
    : {}
  let images = readdirSync(args.data)
    .filter((f) => /\.png$/i.test(f))
    .toSorted()
  if (images.length === 0) throw new Error(`no images in ${args.data}`)
  if (args.limit > 0) images = images.slice(0, args.limit)

  const bin = args.inkvec ?? process.env.INKVEC_BIN
  const hasI = bin !== undefined && existsSync(bin)
  const outT = join(args.out, 'trazor')
  const outI = join(args.out, 'inkvec')
  mkdirSync(outT, { recursive: true })
  mkdirSync(outI, { recursive: true })
  const truthDir = join(args.data, 'truth')

  console.log(
    `\ncorpus=${args.data}  images=${images.length}  trazor=${
      args.profile ? `profile:${args.profile}` : 'auto'
    }${Object.keys(args.overrides).length > 0 ? ` set:${JSON.stringify(args.overrides)}` : ''}` +
      `  inkvec=${hasI ? bin : 'NOT FOUND (Trazor-only)'} ${args.inkvecArgs.join(' ')}  scale=${args.scale}×\n`,
  )

  // Warm the engine once so the per-image timings are those of a warm worker.
  {
    const first = readRgba(join(args.data, images[0]))
    await vectorize(first, trazorSettings(first, args.profile, args.overrides).settings)
  }

  const rows: Row[] = []
  for (const name of images) {
    const base = basename(name, extname(name))
    const src = readRgba(join(args.data, name))
    const srcWhite = flattenOverWhite(src)
    const truthPath = join(truthDir, `${base}.svg`)
    let truth: RasterImage | undefined
    if (existsSync(truthPath) && args.scale > 0) {
      const truthSvg = readFileSync(truthPath, 'utf8')
      truth = rasterizeSvg(truthSvg, Math.round(src.width * args.scale))
    }

    const { settings, profile } = trazorSettings(src, args.profile, args.overrides)
    const family = familyMap[name] ?? profile
    const t0 = performance.now()
    const result = await vectorize(src, settings)
    const trazor = measure(result.svg, performance.now() - t0, srcWhite, truth)
    writeFileSync(join(outT, `${base}.svg`), trazor.svg)

    let inkvec: TraceResult | null = null
    if (hasI) {
      const outSvg = join(outI, `${base}.svg`)
      const timePath = join(outI, `${base}.ms`)
      try {
        let ms: number
        if (args.reuse && existsSync(outSvg) && existsSync(timePath)) {
          ms = Number(readFileSync(timePath, 'utf8'))
        } else {
          const t1 = performance.now()
          execFileSync(bin as string, [join(args.data, name), '-o', outSvg, ...args.inkvecArgs], {
            timeout: 300_000,
            stdio: 'ignore',
          })
          ms = performance.now() - t1
          writeFileSync(timePath, String(ms))
        }
        inkvec = measure(readFileSync(outSvg, 'utf8'), ms, srcWhite, truth)
      } catch (err) {
        console.error(`  ! inkvec failed on ${name}: ${err instanceof Error ? err.message : err}`)
      }
    }
    rows.push({ family, name, profile, trazor, inkvec })
    process.stdout.write(
      `  ${name.padEnd(48)} T gmsd ${fmt(trazor.gmsd)} de00 ${fmt(trazor.de00, 3)} coords ${String(trazor.coords).padStart(5)} ${Math.round(trazor.ms)}ms` +
        (inkvec
          ? `   I gmsd ${fmt(inkvec.gmsd)} de00 ${fmt(inkvec.de00, 3)} coords ${String(inkvec.coords).padStart(5)} ${Math.round(inkvec.ms)}ms`
          : '') +
        '\n',
    )
  }

  console.log('')
  printTable(rows)
  printSummary(rows)

  if (args.json) {
    const strip = (t: TraceResult | null) => {
      if (t === null) return null
      const { svg: _svg, ...rest } = t
      return rest
    }
    const report = rows.map((r) => ({
      family: r.family,
      image: r.name,
      profile: r.profile,
      trazor: strip(r.trazor),
      inkvec: strip(r.inkvec),
    }))
    mkdirSync(join(args.json, '..'), { recursive: true })
    writeFileSync(
      args.json,
      `${JSON.stringify({ corpus: args.data, inkvec: hasI ? bin : null, overrides: args.overrides, rows: report }, null, 2)}\n`,
    )
    console.log(`\n  report → ${args.json}`)
  }
}

main().catch((err) => {
  console.error(`\ninkvec-compare failed: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
