#!/usr/bin/env node
// Fetch known, permissively-licensed SVG collections and lay them out by category
// for the dataset generator's `--source dir` mode. Sources are npm packages
// (scripts/corpus/sources.mjs); each is installed into a local cache and its .svg
// files copied into corpus/<category>/<pack>/<bucket>/, sharded into buckets so
// the generator's per-family split (top-level-through-leaf dir = family) is
// balanced across train/val/test. Nothing here is committed (corpus/ is ignored).
//
// Usage:
//   npm run corpus                       # default sources (emoji excluded)
//   npm run corpus -- --only icons,flags # subset by category or pack id
//   npm run corpus -- --all              # include optional/large sources (emoji)
//   npm run corpus -- --limit-per-source 300 --buckets 16
//   npm run corpus -- --clean            # also wipe the npm cache first
//
// Then:  npm run dataset -- --source dir --corpus corpus --count 20000 --out data/real

import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import { SOURCES } from './sources.mjs'

const DEFAULTS = { out: 'corpus', limitPerSource: 600, buckets: 12 }

function parseArgs(argv) {
  const cfg = { ...DEFAULTS, only: null, all: false, clean: false, refresh: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    switch (a) {
      case '--out':
        cfg.out = next()
        break
      case '--only':
        cfg.only = next()
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        break
      case '--limit-per-source':
        cfg.limitPerSource = Math.max(0, Number(next()) || 0)
        break
      case '--buckets':
        cfg.buckets = Math.max(1, Number(next()) || 1)
        break
      case '--all':
        cfg.all = true
        break
      case '--clean':
        cfg.clean = true
        break
      case '--refresh':
        cfg.refresh = true
        break
      case '-h':
      case '--help':
        printUsage()
        process.exit(0)
        break
      default:
        throw new Error(`unknown arg: ${a}`)
    }
  }
  return cfg
}

function printUsage() {
  console.log(
    'corpus fetcher — download known SVG sets, laid out by category for `--source dir`\n\n' +
      'Options:\n' +
      '  --only <a,b>            categories or pack ids to include (default: all non-optional)\n' +
      '  --all                  include optional/large sources (emoji)\n' +
      '  --limit-per-source <n> cap copied files per pack (default 600; 0 = no cap)\n' +
      '  --buckets <n>          shards per pack for a balanced split (default 12)\n' +
      '  --out <dir>            output dir (default corpus)\n' +
      '  --clean                wipe the npm cache before fetching\n' +
      '  --refresh              re-install packages even if already cached\n',
  )
}

/** FNV-1a → 32-bit, for stable bucket assignment (no crypto needed). */
function hash32(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function selected(cfg) {
  let list = SOURCES.filter((s) => cfg.all || !s.optional)
  if (cfg.only) list = list.filter((s) => cfg.only.includes(s.category) || cfg.only.includes(s.id))
  if (list.length === 0) throw new Error('no sources selected — check --only / --all')
  return list
}

function walkSvg(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkSvg(full))
    else if (entry.name.toLowerCase().endsWith('.svg')) out.push(full)
  }
  return out
}

/** Install one package into the cache prefix; return its resolved version or null. */
function install(source, cacheDir, refresh) {
  const pkgDir = join(cacheDir, 'node_modules', source.pkg)
  if (!refresh && existsSync(join(pkgDir, 'package.json'))) return readVersion(pkgDir)
  const spec = `${source.pkg}@${source.version}`
  console.log(`  installing ${spec}…`)
  const cmd =
    `npm install "${spec}" --prefix "${cacheDir}" --no-save --omit=dev ` +
    `--no-audit --no-fund --loglevel=error`
  const r = spawnSync(cmd, { shell: true, stdio: 'inherit' })
  if (r.status !== 0 || !existsSync(join(pkgDir, 'package.json'))) return null
  return readVersion(pkgDir)
}

function readVersion(pkgDir) {
  try {
    return JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

function main() {
  const cfg = parseArgs(process.argv.slice(2))
  const sources = selected(cfg)
  const outDir = cfg.out
  const cacheDir = join(outDir, '.cache')
  if (cfg.clean && existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true })
  mkdirSync(cacheDir, { recursive: true })
  // npm wants a package.json at the prefix to install into its node_modules.
  const cachePkg = join(cacheDir, 'package.json')
  if (!existsSync(cachePkg))
    writeFileSync(cachePkg, JSON.stringify({ name: 'corpus-cache', private: true }))

  console.log(
    `Fetching ${sources.length} source(s) → ${outDir}/ (buckets=${cfg.buckets}, limit/source=${cfg.limitPerSource || '∞'})\n`,
  )

  const report = []
  for (const source of sources) {
    console.log(`• ${source.category}/${source.id} (${source.pkg}, ${source.license})`)
    const version = install(source, cacheDir, cfg.refresh)
    if (!version) {
      console.warn(`  ! skipped — install failed for ${source.pkg}`)
      report.push({ ...source, version: null, count: 0, skipped: true })
      continue
    }
    const pkgRoot = join(cacheDir, 'node_modules', source.pkg)
    const srcRoot = source.dir ? join(pkgRoot, source.dir) : pkgRoot
    let files = walkSvg(srcRoot)
    if (files.length === 0 && source.dir) files = walkSvg(pkgRoot) // layout drifted — search all
    files = files.toSorted()
    if (cfg.limitPerSource > 0) files = files.slice(0, cfg.limitPerSource)

    const destBase = join(outDir, source.category, source.id)
    rmSync(destBase, { recursive: true, force: true }) // fresh per source
    let n = 0
    for (const file of files) {
      // Preserve the sub-path in the name so basenames never collide, and shard.
      const relName =
        relative(files.length ? srcRoot : pkgRoot, file).replaceAll(sep, '-') || basename(file)
      const bucket = String(hash32(relName) % cfg.buckets).padStart(2, '0')
      const dest = join(destBase, bucket, relName)
      mkdirSync(join(destBase, bucket), { recursive: true })
      cpSync(file, dest)
      n++
    }
    console.log(`  ${n} svg → ${destBase}/`)
    report.push({ ...source, version, count: n, skipped: false })
  }

  writeReport(outDir, cfg, report)
  summarize(report)
}

function writeReport(outDir, cfg, report) {
  const byCategory = {}
  for (const r of report) byCategory[r.category] = (byCategory[r.category] ?? 0) + r.count
  const total = report.reduce((a, r) => a + r.count, 0)
  writeFileSync(
    join(outDir, 'manifest.json'),
    `${JSON.stringify({ buckets: cfg.buckets, limitPerSource: cfg.limitPerSource, total, byCategory, sources: report }, null, 2)}\n`,
  )
  const rows = report
    .map(
      (r) =>
        `| ${r.category}/${r.id} | ${r.pkg}@${r.version ?? '—'} | ${r.license} | ${r.count} | ${r.home} |`,
    )
    .join('\n')
  writeFileSync(
    join(outDir, 'LICENSES.md'),
    '# Corpus sources & licenses\n\n' +
      "Fetched by `npm run corpus` for local training only (not committed). Respect each pack's\n" +
      'license if you redistribute the corpus.\n\n' +
      '| source | package | license | files | home |\n| --- | --- | --- | --- | --- |\n' +
      `${rows}\n`,
  )
}

function summarize(report) {
  const total = report.reduce((a, r) => a + r.count, 0)
  const skipped = report.filter((r) => r.skipped).length
  console.log(
    `\ndone — ${total} svg across ${report.length - skipped} source(s)${skipped ? `, ${skipped} skipped` : ''}.`,
  )
  console.log('next: npm run dataset -- --source dir --corpus corpus --count 20000 --out data/real')
  console.log(
    '      then mix with procedural: python scripts/train/train.py --data data/proc data/real …',
  )
}

main()
