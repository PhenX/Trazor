#!/usr/bin/env node
// Fetch known, permissively-licensed SVG collections and lay them out by category
// for the dataset generator's `--source dir` mode. Sources (scripts/corpus/sources.mjs)
// come from three kinds of origin:
//   - npm       — install a package, copy its .svg (icon/brand/flag/emoji libraries)
//   - git       — shallow-clone a repo, copy its .svg (illustration packs)
//   - wikimedia — download SVGs via the Wikimedia Commons API (general clip-art /
//                 artwork, incl. openclipart's CC0 files); opt-in, license-filtered
// Files are copied to corpus/<category>/<pack>/<bucket>/, sharded into buckets so the
// generator's per-family split stays balanced. Nothing here is committed (corpus/ is
// ignored).
//
// Usage:
//   npm run corpus                       # default sources (npm + git; emoji/wikimedia off)
//   npm run corpus -- --only icons,flags # subset by category or pack id
//   npm run corpus -- --all              # include optional sources (emoji, wikimedia)
//   npm run corpus -- --limit-per-source 300 --buckets 16
//   npm run corpus -- --clean            # also wipe the local cache first
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
// Wikimedia asks API clients to send a descriptive User-Agent (their policy).
const USER_AGENT = 'VectorizerCorpusBot/1.0 (https://github.com/PhenX/Vectorizer)'

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
      '  --all                  include optional sources (emoji, wikimedia)\n' +
      '  --limit-per-source <n> cap files per pack (default 600; 0 = no cap)\n' +
      '  --buckets <n>          shards per pack for a balanced split (default 12)\n' +
      '  --out <dir>            output dir (default corpus)\n' +
      '  --clean                wipe the local cache before fetching\n' +
      '  --refresh              re-fetch sources even if already cached\n',
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
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkSvg(full))
    else if (entry.name.toLowerCase().endsWith('.svg')) out.push(full)
  }
  return out
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sanitize = (s) => s.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'file'

/** Files under `root` (recursive), falling back to `alt` when `root` has none. */
function svgFiles(root, alt) {
  let files = walkSvg(root)
  let base = root
  if (!files.length && alt && alt !== root) {
    files = walkSvg(alt)
    base = alt
  }
  return { files: files.toSorted(), base }
}

/** npm: install the package, return its .svg files. */
function provisionNpm(source, cacheDir, refresh) {
  const pkgDir = join(cacheDir, 'node_modules', source.pkg)
  if (refresh || !existsSync(join(pkgDir, 'package.json'))) {
    const spec = `${source.pkg}@${source.version ?? 'latest'}`
    console.log(`  installing ${spec}…`)
    const cmd =
      `npm install "${spec}" --prefix "${cacheDir}" --no-save --omit=dev ` +
      `--no-audit --no-fund --loglevel=error`
    const r = spawnSync(cmd, { shell: true, stdio: 'inherit' })
    if (r.status !== 0 || !existsSync(join(pkgDir, 'package.json'))) return null
  }
  let version = 'unknown'
  try {
    version = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version ?? 'unknown'
  } catch {
    /* keep 'unknown' */
  }
  const { files, base } = svgFiles(source.dir ? join(pkgDir, source.dir) : pkgDir, pkgDir)
  return { files, base, version }
}

/** git: shallow-clone the repo, return its .svg files. */
function provisionGit(source, cacheDir, refresh) {
  const dest = join(cacheDir, 'git', source.id)
  if (refresh && existsSync(dest)) rmSync(dest, { recursive: true, force: true })
  if (!existsSync(join(dest, '.git'))) {
    console.log(`  cloning ${source.repo}…`)
    const args = ['clone', '--depth', '1']
    if (source.ref) args.push('--branch', source.ref)
    args.push(source.repo, dest)
    const r = spawnSync('git', args, { stdio: 'inherit' })
    if (r.status !== 0 || !existsSync(dest)) return null
  }
  let version = 'git'
  const rev = spawnSync('git', ['-C', dest, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' })
  if (rev.status === 0) version = rev.stdout.trim()
  const { files, base } = svgFiles(source.dir ? join(dest, source.dir) : dest, dest)
  return { files, base, version }
}

/** Wikimedia Commons API: list SVG file titles (PD/CC0 only), paged to `cap`. */
async function commonsTitles(source, cap) {
  const base = 'https://commons.wikimedia.org/w/api.php'
  const common =
    'action=query&format=json&prop=imageinfo&iiprop=url|mime|extmetadata' +
    '&iiextmetadatafilter=LicenseShortName|License'
  const gen = source.wikimediaCategory
    ? `generator=categorymembers&gcmtitle=Category:${encodeURIComponent(source.wikimediaCategory)}` +
      '&gcmtype=file&gcmlimit=50'
    : `generator=search&gsrnamespace=6&gsrlimit=50&gsrsearch=${encodeURIComponent(
        `${source.query ?? 'svg'} filemime:image/svg+xml`,
      )}`
  const out = []
  let cont = ''
  const isOpen = /cc0|public domain|^pd$/i
  for (let page = 0; page < 40 && out.length < cap; page++) {
    const res = await fetch(`${base}?${common}&${gen}${cont}`, {
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!res.ok) throw new Error(`Commons HTTP ${res.status}`)
    const json = await res.json()
    for (const p of Object.values(json.query?.pages ?? {})) {
      const ii = p.imageinfo?.[0]
      if (!ii || ii.mime !== 'image/svg+xml' || !ii.url) continue
      const lic = ii.extmetadata?.LicenseShortName?.value ?? ii.extmetadata?.License?.value ?? ''
      // Openclipart is uniformly CC0/PD; a broad search needs the license gate.
      if (!source.wikimediaCategory && !isOpen.test(lic)) continue
      out.push({ title: p.title, url: ii.url, license: lic || 'CC0/PD' })
      if (out.length >= cap) break
    }
    const c = json.continue?.gcmcontinue ?? json.continue?.sroffset
    if (c === undefined) break
    cont = source.wikimediaCategory
      ? `&gcmcontinue=${encodeURIComponent(json.continue.gcmcontinue)}`
      : `&sroffset=${json.continue.sroffset}`
    await sleep(300) // be polite to the API
  }
  return out
}

/**
 * wikimedia: download SVGs from Wikimedia Commons (PD/CC0). Opt-in and best-effort —
 * the API rate-limits shared IPs, so run this from your own machine, not CI.
 */
async function provisionWikimedia(source, cacheDir, refresh, cap) {
  const dest = join(cacheDir, 'wikimedia', source.id)
  if (refresh && existsSync(dest)) rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  const have = walkSvg(dest)
  if (!refresh && have.length >= cap) {
    return { files: have.toSorted().slice(0, cap), base: dest, version: 'commons' }
  }
  let titles
  try {
    titles = await commonsTitles(source, cap)
  } catch (err) {
    console.warn(`  ! Commons query failed (${err.message})`)
    return null
  }
  for (const t of titles) {
    const dst = join(dest, `${sanitize(t.title.replace(/^File:/, '').replace(/\.svg$/i, ''))}.svg`)
    if (existsSync(dst)) continue
    try {
      // oxlint-disable-next-line no-await-in-loop
      const r = await fetch(t.url, { headers: { 'User-Agent': USER_AGENT } })
      if (!r.ok) continue
      // oxlint-disable-next-line no-await-in-loop
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length && buf[0] === 0x3c) writeFileSync(dst, buf) // starts with '<' → SVG/XML
    } catch {
      /* skip this file */
    }
    // oxlint-disable-next-line no-await-in-loop
    await sleep(200)
  }
  return { files: walkSvg(dest).toSorted(), base: dest, version: 'commons' }
}

function provision(source, cacheDir, cfg) {
  const type = source.type ?? 'npm'
  if (type === 'npm') return provisionNpm(source, cacheDir, cfg.refresh)
  if (type === 'git') return provisionGit(source, cacheDir, cfg.refresh)
  if (type === 'wikimedia')
    return provisionWikimedia(source, cacheDir, cfg.refresh, cfg.limitPerSource || 500)
  throw new Error(`unknown source type '${type}' for ${source.id}`)
}

async function main() {
  const cfg = parseArgs(process.argv.slice(2))
  const sources = selected(cfg)
  const outDir = cfg.out
  const cacheDir = join(outDir, '.cache')
  if (cfg.clean && existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true })
  mkdirSync(join(cacheDir, 'node_modules'), { recursive: true })
  // npm wants a package.json at the prefix to install into its node_modules.
  const cachePkg = join(cacheDir, 'package.json')
  if (!existsSync(cachePkg)) {
    writeFileSync(cachePkg, JSON.stringify({ name: 'corpus-cache', private: true }))
  }

  console.log(
    `Fetching ${sources.length} source(s) → ${outDir}/ (buckets=${cfg.buckets}, limit/source=${cfg.limitPerSource || '∞'})\n`,
  )

  const report = []
  for (const source of sources) {
    console.log(`• ${source.category}/${source.id} (${source.type ?? 'npm'}, ${source.license})`)
    // Sources run one at a time on purpose (network/disk friendly, stable order).
    // oxlint-disable-next-line no-await-in-loop
    const prov = await provision(source, cacheDir, cfg)
    if (!prov) {
      console.warn(`  ! skipped — could not fetch ${source.id}`)
      report.push({ ...source, version: null, count: 0, skipped: true })
      continue
    }
    let files = prov.files
    if (cfg.limitPerSource > 0) files = files.slice(0, cfg.limitPerSource)

    const destBase = join(outDir, source.category, source.id)
    rmSync(destBase, { recursive: true, force: true }) // fresh per source
    let n = 0
    for (const file of files) {
      // Preserve the sub-path in the name so basenames never collide, and shard.
      const relName = relative(prov.base, file).replaceAll(sep, '-') || basename(file)
      const bucket = String(hash32(relName) % cfg.buckets).padStart(2, '0')
      mkdirSync(join(destBase, bucket), { recursive: true })
      cpSync(file, join(destBase, bucket, relName))
      n++
    }
    console.log(`  ${n} svg → ${destBase}/`)
    report.push({ ...source, version: prov.version, count: n, skipped: false })
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
        `| ${r.category}/${r.id} | ${r.type ?? 'npm'} | ${r.license} | ${r.count} | ${r.home} |`,
    )
    .join('\n')
  writeFileSync(
    join(outDir, 'LICENSES.md'),
    '# Corpus sources & licenses\n\n' +
      "Fetched by `npm run corpus` for local training only (not committed). Respect each pack's\n" +
      'license if you redistribute the corpus.\n\n' +
      '| source | type | license | files | home |\n| --- | --- | --- | --- | --- |\n' +
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
}

await main()
