#!/usr/bin/env node
/**
 * One-command A/B: trace the representative corpus through the engine on your
 * **working tree** and on **HEAD**, then print a PASS / MIXED / FAIL verdict.
 *
 * This is the guardrail for any color / palette / segmentation change. It runs
 * `tracer-compare` twice over the same real-image corpus — once with your
 * uncommitted edits, once with them stashed away — and hands both reports to
 * `ab-report` for the verdict. Because the packages export TS source (no build
 * step), stashing the source and re-running is a true baseline.
 *
 * Usage:
 *   npm run eval:ab                                  # auto settings over corpus-vtracer
 *   npm run eval:ab -- --set segmentation=quantize --set paletteSize=12
 *   npm run eval:ab -- --sweep 6,8,12                # sweep paletteSize (shorthand)
 *   npm run eval:ab -- --sweep segmentation=quantize,regions   # sweep any setting
 *   npm run eval:ab -- --data <dir> --profile illustration
 *
 * `--sweep <key>=<v1,v2,...>` re-runs the whole A/B at each value of any Trazor
 * setting and prints a verdict per value; a bare `--sweep <n1,n2,...>` is
 * shorthand for `paletteSize` (which also pins `autoPaletteSize=false` so the
 * forced size sticks). Any other flag (`--data`, `--profile`, `--set`,
 * `--max-dim`, `--limit`) passes straight through to `tracer-compare`. Requires
 * uncommitted changes to compare against HEAD; to compare two commits, run
 * `tracer-compare --json` on each and diff with `tsx scripts/eval/ab-report.ts`.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const OUT = join(ROOT, 'eval-artifacts', 'ab')
const DEFAULT_DATA = 'scripts/eval/corpus-vtracer'

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', ...opts })
}

function hasLocalChanges() {
  const unstaged = sh('git', ['diff', '--name-only'])
  const staged = sh('git', ['diff', '--cached', '--name-only'])
  return (unstaged + staged).trim().length > 0
}

/**
 * `--sweep 6,8,12` → sweep paletteSize; `--sweep key=a,b` → sweep any setting.
 * Returns `{ key, values }`; `key === null` means a single auto run.
 */
function parseSweep(spec) {
  const eq = spec.indexOf('=')
  if (eq < 0) return { key: 'paletteSize', values: spec.split(',').map((s) => s.trim()) }
  return {
    key: spec.slice(0, eq),
    values: spec
      .slice(eq + 1)
      .split(',')
      .map((s) => s.trim()),
  }
}

/** Split argv into sweep control vs pass-through flags for tracer-compare. */
function parseArgs(argv) {
  const passthrough = []
  let sweep = { key: null, values: [null] }
  let data = DEFAULT_DATA
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--sweep') {
      sweep = parseSweep(argv[++i])
    } else if (a === '--data') {
      data = argv[++i]
    } else {
      passthrough.push(a)
      // flags that take a value: keep the value with them
      if (['--profile', '--set', '--max-dim', '--limit', '--out'].includes(a)) {
        passthrough.push(argv[++i])
      }
    }
  }
  return { passthrough, sweep, data }
}

/** A filesystem-safe tag for one sweep value. */
function tagOf(key, value) {
  if (value == null) return 'auto'
  return `${key}=${value}`.replace(/[^\w.=-]/g, '_')
}

/** One tracer-compare run → JSON report at `outPath`, forcing `key=value` if set. */
function runCompare(data, passthrough, key, value, outPath) {
  const args = ['scripts/eval/tracer-compare.ts', '--data', data, '--json', outPath, ...passthrough]
  if (key != null && value != null) {
    args.push('--set', `${key}=${value}`)
    // A forced palette size only sticks with autoPaletteSize off.
    if (key === 'paletteSize') args.push('--set', 'autoPaletteSize=false')
  }
  sh('npx', ['tsx', ...args], { stdio: 'inherit' })
}

function main() {
  const { passthrough, sweep, data } = parseArgs(process.argv.slice(2))

  if (!existsSync(data)) {
    console.error(`\n  corpus not found: ${data}`)
    console.error('  fetch the representative corpus first:  npm run eval:samples')
    console.error('  (or pass --data <dir> pointing at real PNG/JPEG images).\n')
    process.exit(2)
  }
  if (!hasLocalChanges()) {
    console.error('\n  no uncommitted changes — nothing to compare against HEAD.')
    console.error('  make your edit first, then re-run. To compare two commits, run')
    console.error('  tracer-compare --json on each and diff with scripts/eval/ab-report.ts.\n')
    process.exit(2)
  }

  mkdirSync(OUT, { recursive: true })
  const { key, values } = sweep

  // Candidate (working tree) first, so a crash never leaves the tree stashed.
  console.log('\n=== candidate (working tree) ===')
  for (const v of values)
    runCompare(data, passthrough, key, v, join(OUT, `cand-${tagOf(key, v)}.json`))

  console.log('\n=== baseline (HEAD) ===')
  sh('git', ['stash', 'push', '-m', 'eval:ab baseline'], { stdio: 'inherit' })
  let stashed = true
  try {
    for (const v of values)
      runCompare(data, passthrough, key, v, join(OUT, `base-${tagOf(key, v)}.json`))
  } finally {
    if (stashed) {
      sh('git', ['stash', 'pop'], { stdio: 'inherit' })
      stashed = false
    }
  }

  // Verdict per swept value. Overall exit is FAIL if any value fails.
  let anyFail = false
  for (const v of values) {
    const tag = tagOf(key, v)
    console.log(`\n=== verdict (${tag}) ===`)
    try {
      sh(
        'npx',
        [
          'tsx',
          'scripts/eval/ab-report.ts',
          join(OUT, `base-${tag}.json`),
          join(OUT, `cand-${tag}.json`),
        ],
        { stdio: 'inherit' },
      )
    } catch {
      anyFail = true // ab-report exits non-zero on FAIL
    }
  }
  process.exit(anyFail ? 1 : 0)
}

main()
