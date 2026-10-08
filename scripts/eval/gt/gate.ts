/**
 * The ground-truth gate: trace a set of icons whose artist SVG is known, score
 * every trace against it, and compare runs.
 *
 *   npx tsx scripts/eval/gt/gate.ts run (--inkvec <inkvec checkout> [--set screen] [--tier 128ss]
 *        | --images <dir of PNGs, judged against themselves>)
 *        [--engine trazor|inkvec] [--exe <inkvec binary>] [--args "<inkvec flags>"]
 *        [--s key=value ...] [--workers N] [--only <family>] [--keep <dir>] [--out run.json]
 *   npx tsx scripts/eval/gt/gate.ts ab <base.json> <cand.json>
 *   npx tsx scripts/eval/gt/gate.ts report <run.json>
 *
 * `run` traces in worker threads and caches each scored row on disk, keyed by
 * what decides it: for Trazor the hash of every engine source file plus the
 * settings overrides; for inkvec the executable's hash plus its flags; and the
 * tier and item. A rerun of an unchanged engine is free, and an A/B costs one
 * fresh run. `ab` pairs two runs item by item (see stats.ts) and prints each
 * axis's relative change, its bootstrap interval and verdict, then the items
 * that moved most. Corpus and sets: corpus.ts; metrics: score.ts.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import type { GtItem } from './corpus'
import { itemKey, loadCorpus, loadImageDir } from './corpus'
import type { MetricRow } from './stats'
import { AXES, compareRuns, familyMeans, MARGINS } from './stats'
import type { Job, Row } from './worker'

const HERE = dirname(fileURLToPath(import.meta.url))
/** Bumped whenever score.ts or svgmodel.ts changes what a row holds: old rows stop matching. */
const SCORER_VERSION = 4
const ROOT = resolve(HERE, '..', '..', '..')

interface Run {
  meta: {
    engine: string
    engineKey: string
    tier: string
    set: string
    overrides: Record<string, unknown>
    args: string[]
  }
  rows: Row[]
}

function hashTree(dir: string, h: ReturnType<typeof createHash>): void {
  for (const name of readdirSync(dir).toSorted()) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) hashTree(p, h)
    else if (/\.(ts|json)$/.test(name)) {
      h.update(p.slice(ROOT.length))
      h.update(readFileSync(p))
    }
  }
}

/** Hash of every engine source file: a Trazor run's identity. */
function trazorKey(overrides: Record<string, unknown>): string {
  const h = createHash('sha256')
  for (const pkg of readdirSync(join(ROOT, 'packages')).toSorted()) {
    const src = join(ROOT, 'packages', pkg, 'src')
    if (existsSync(src)) hashTree(src, h)
  }
  h.update(JSON.stringify(overrides))
  return h.digest('hex').slice(0, 16)
}

function inkvecKey(exe: string, args: string[]): string {
  return createHash('sha256')
    .update(readFileSync(exe))
    .update(JSON.stringify(args))
    .digest('hex')
    .slice(0, 16)
}

function parseValue(v: string): unknown {
  if (v === 'true') return true
  if (v === 'false') return false
  if (v === 'null') return null
  const n = Number(v)
  return Number.isNaN(n) ? v : n
}

function arg(argv: string[], name: string, dflt?: string): string | undefined {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : dflt
}

const fmt = (v: number, d = 4): string => (Number.isFinite(v) ? v.toFixed(d) : '—')

function summarize(run: Run): string {
  const lines: string[] = []
  // Metric name, column label, decimals.
  const cols: [string, string, number][] = [
    ['de00', 'dE00', 3],
    ['gmsd', 'GMSD', 4],
    ['fillDe00', 'fillE', 3],
    ['bandDe00', 'bandE', 3],
    ['edgeMiss', 'eMiss', 3],
    ['edgeExtra', 'eExtra', 3],
    ['inkMiss', 'inkMiss', 2],
    ['inkExtra', 'inkXtra', 2],
    ['inksMissed', 'inks#', 1],
    ['ratio', 'ratio', 2],
    ['turning', 'turn', 3],
    ['selfRes', 'selfRes', 4],
    ['params', 'params', 0],
    ['bytes', 'bytes', 0],
    ['ms', 'ms', 0],
  ]
  const metrics = cols.map((c) => c[0])
  const per = metrics.map((m) => familyMeans(run.rows as unknown as MetricRow[], m))
  const fams = [...per[0].fam.keys()]
  lines.push(
    `${run.meta.engine} ${run.meta.engineKey}  tier ${run.meta.tier}  set ${run.meta.set}  n=${run.rows.length}`,
  )
  lines.push(['family'.padEnd(16), ...cols.map((c) => c[1].padStart(8))].join(''))
  for (const f of fams) {
    lines.push(
      [
        f.padEnd(16),
        ...per.map((p, i) => fmt(p.fam.get(f) ?? Number.NaN, cols[i][2]).padStart(8)),
      ].join(''),
    )
  }
  lines.push(
    ['MACRO'.padEnd(16), ...per.map((p, i) => fmt(p.macro, cols[i][2]).padStart(8))].join(''),
  )
  const errs = run.rows.filter((r) => r.error)
  if (errs.length)
    lines.push(
      `${errs.length} errors: ${errs
        .slice(0, 3)
        .map((e) => `${e.key}: ${e.error}`)
        .join('; ')}`,
    )
  return lines.join('\n')
}

async function runSet(argv: string[]): Promise<void> {
  const inkvecDir = arg(argv, '--inkvec') ?? process.env.INKVEC_DIR ?? ''
  const imageDir = arg(argv, '--images')
  if (!inkvecDir && !imageDir)
    throw new Error('--inkvec <inkvec checkout> or --images <dir> is required')
  const corpus = imageDir ? loadImageDir(resolve(imageDir)) : loadCorpus(inkvecDir)
  const setName = imageDir ? 'images' : (arg(argv, '--set', 'screen') as string)
  // An image folder's rows are cached under its own path's hash.
  const tier = imageDir
    ? `src-${createHash('sha256').update(resolve(imageDir)).digest('hex').slice(0, 8)}`
    : (arg(argv, '--tier', '128ss') as string)
  const engine = (arg(argv, '--engine', 'trazor') as string) === 'inkvec' ? 'inkvec' : 'trazor'
  const only = arg(argv, '--only')
  let items: GtItem[] = corpus.sets[setName]
  if (!items) throw new Error(`unknown set ${setName}: ${Object.keys(corpus.sets).join(', ')}`)
  if (only) items = items.filter((it) => only.split(',').includes(it.corpus))
  const overrides: Record<string, unknown> = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--s') {
      const [k, ...v] = argv[i + 1].split('=')
      overrides[k] = parseValue(v.join('='))
    }
  }
  const exe = arg(argv, '--exe', join(inkvecDir, 'target', 'release', 'inkvec')) as string
  const args = (arg(argv, '--args', '') as string).split(/\s+/).filter(Boolean)
  const engineKey = engine === 'trazor' ? trazorKey(overrides) : inkvecKey(exe, args)
  const cacheDir = resolve(arg(argv, '--cache', join(ROOT, 'eval-artifacts', 'gt-cache')) as string)
  const rowDir = join(cacheDir, 'rows', `v${SCORER_VERSION}`, `${engine}-${engineKey}`, tier)
  mkdirSync(rowDir, { recursive: true })
  const keep = arg(argv, '--keep')
  if (keep) mkdirSync(keep, { recursive: true })
  const noCache = argv.includes('--no-cache') || Boolean(keep)

  const rows = new Map<string, Row>()
  const todo: GtItem[] = []
  for (const it of items) {
    const f = join(rowDir, `${it.corpus}__${it.stem}.json`)
    if (!noCache && existsSync(f)) rows.set(itemKey(it), JSON.parse(readFileSync(f, 'utf8')) as Row)
    else todo.push(it)
  }
  const nWorkers = Math.max(
    1,
    Math.min(todo.length, Number(arg(argv, '--workers', String(Math.max(1, cpus().length - 1))))),
  )
  process.stderr.write(
    `${engine} ${engineKey} ${tier} ${setName}: ${items.length} items, ${rows.size} cached, ${todo.length} to trace on ${nWorkers} workers\n`,
  )

  const job: Job = {
    corpus,
    tier,
    engine,
    overrides,
    inkvecExe: exe,
    inkvecArgs: args,
    cacheDir,
    keepDir: keep ? resolve(keep) : undefined,
  }
  let next = 0
  let done = 0
  const t0 = performance.now()
  await Promise.all(
    Array.from(
      { length: todo.length > 0 ? nWorkers : 0 },
      () =>
        new Promise<void>((res, rej) => {
          // tsx's resolver is registered inside the thread before the worker module loads.
          const boot = `import('tsx/esm/api').then((m) => { m.register(); return import(${JSON.stringify(pathToFileURL(join(HERE, 'worker.ts')).href)}) })`
          const w = new Worker(boot, { eval: true, workerData: { job } })
          const feed = (): void => {
            if (next >= todo.length) {
              // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker_threads port, not a window
              w.postMessage({ done: true })
              return
            }
            // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker_threads port, not a window
            w.postMessage({ item: todo[next++] })
          }
          w.on('message', (m: Row | { ready: true }) => {
            if ('ready' in m) return feed()
            rows.set(m.key, m)
            if (!m.error && !noCache)
              writeFileSync(join(rowDir, `${m.corpus}__${m.stem}.json`), JSON.stringify(m))
            done++
            if (done % 20 === 0 || done === todo.length) {
              process.stderr.write(
                `  ${done}/${todo.length} (${((performance.now() - t0) / 1000).toFixed(0)} s)\n`,
              )
            }
            feed()
          })
          w.on('error', rej)
          w.on('exit', () => res())
        }),
    ),
  )
  const run: Run = {
    meta: { engine, engineKey, tier, set: setName, overrides, args },
    rows: items.map((it) => rows.get(itemKey(it))).filter((r): r is Row => Boolean(r)),
  }
  const out = arg(argv, '--out')
  if (out) {
    mkdirSync(dirname(resolve(out)), { recursive: true })
    writeFileSync(out, JSON.stringify(run, null, 1))
  }
  process.stdout.write(`${summarize(run)}\n`)
}

function ab(argv: string[]): void {
  const [bp, cp] = argv.filter((a) => !a.startsWith('--'))
  const base = JSON.parse(readFileSync(bp, 'utf8')) as Run
  const cand = JSON.parse(readFileSync(cp, 'utf8')) as Run
  const res = compareRuns(base.rows as unknown as MetricRow[], cand.rows as unknown as MetricRow[])
  process.stdout.write(
    `base ${base.meta.engine} ${base.meta.engineKey}  →  cand ${cand.meta.engine} ${cand.meta.engineKey}  (${base.meta.tier})\n`,
  )
  process.stdout.write(
    `${'axis'.padEnd(9)}${'base'.padStart(9)}${'cand'.padStart(9)}${'Δ%'.padStart(8)}${'95% CI'.padStart(18)}${'margin'.padStart(8)}  verdict\n`,
  )
  for (const r of res) {
    const pct = (v: number): string => `${(v * 100).toFixed(1)}`
    process.stdout.write(
      `${r.axis.padEnd(9)}${fmt(r.base).padStart(9)}${fmt(r.cand).padStart(9)}${pct(r.delta).padStart(8)}` +
        `${`[${pct(r.lo)}, ${pct(r.hi)}]`.padStart(18)}${`${(MARGINS[r.axis] * 100).toFixed(0)}%`.padStart(8)}  ${r.verdict}\n`,
    )
  }
  const cMap = new Map(cand.rows.map((r) => [r.key, r]))
  const moved = base.rows
    .filter(
      (r) =>
        cMap.has(r.key) &&
        Number.isFinite(r.de00) &&
        Number.isFinite(cMap.get(r.key)?.de00 ?? Number.NaN),
    )
    .map((r) => ({ key: r.key, b: r.de00, c: (cMap.get(r.key) as Row).de00 }))
    .toSorted((p, q) => q.c - q.b - (p.c - p.b))
  const show = Number(arg(argv, '--top', '8'))
  process.stdout.write(
    `\nworst de00 moves:\n${moved
      .slice(0, show)
      .map((m) => `  ${m.key.padEnd(56)} ${fmt(m.b, 3)} → ${fmt(m.c, 3)}`)
      .join('\n')}\n`,
  )
  process.stdout.write(
    `best de00 moves:\n${moved
      .slice(-show)
      .toReversed()
      .map((m) => `  ${m.key.padEnd(56)} ${fmt(m.b, 3)} → ${fmt(m.c, 3)}`)
      .join('\n')}\n`,
  )
  void AXES
}

const [cmd, ...rest] = process.argv.slice(2)
if (cmd === 'run') await runSet(rest)
else if (cmd === 'ab') ab(rest)
else if (cmd === 'report')
  process.stdout.write(`${summarize(JSON.parse(readFileSync(rest[0], 'utf8')) as Run)}\n`)
else {
  process.stderr.write(
    'usage: gate.ts run|ab|report …  (see the header of scripts/eval/gt/gate.ts)\n',
  )
  process.exit(2)
}
