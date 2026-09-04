#!/usr/bin/env node
/**
 * Summarize a V8 `.cpuprofile` (from `node --cpu-prof`): self time per function
 * and per source file, heaviest first. Pairs with `trace-bench.ts`:
 *
 *   node --cpu-prof --cpu-prof-dir=prof node_modules/.bin/tsx scripts/bench/trace-bench.ts
 *   node scripts/bench/cpu-summary.mjs prof/*.cpuprofile [--top 30] [--lines <functionName>]
 */
import { readFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const topIdx = argv.indexOf('--top')
const top = topIdx >= 0 ? Number(argv[topIdx + 1]) : 30
const linesIdx = argv.indexOf('--lines')
const linesFor = linesIdx >= 0 ? argv[linesIdx + 1] : null
const skip = new Set([topIdx + 1, linesIdx + 1])
const files = argv.filter((a, i) => !a.startsWith('--') && !skip.has(i))

const byFn = new Map()
const byFile = new Map()
const byLine = new Map()
let totalUs = 0
for (const file of files) {
  const prof = JSON.parse(readFileSync(file, 'utf8'))
  const nodes = new Map(prof.nodes.map((n) => [n.id, n]))
  const self = new Map()
  const deltas = prof.timeDeltas
  for (let i = 0; i < prof.samples.length; i++) {
    const dt = deltas[i] ?? 0
    self.set(prof.samples[i], (self.get(prof.samples[i]) ?? 0) + dt)
    totalUs += dt
  }
  for (const [id, us] of self) {
    const n = nodes.get(id)
    const cf = n.callFrame
    const src = (cf.url || '').replace(/^file:\/\/.*?\/(packages|scripts)\//, '$1/')
    const fn = `${cf.functionName || '(anonymous)'}  ${src}:${cf.lineNumber + 1}`
    byFn.set(fn, (byFn.get(fn) ?? 0) + us)
    const fileKey = src || `(${cf.functionName || 'native'})`
    byFile.set(fileKey, (byFile.get(fileKey) ?? 0) + us)
    // Per-line ticks for one function (`--lines <name>`): V8 records the tick
    // count per source line inside the sampled function.
    if (linesFor !== null && cf.functionName === linesFor && n.positionTicks) {
      const perTick = us / n.positionTicks.reduce((a, t) => a + t.ticks, 0)
      for (const t of n.positionTicks) {
        const key = `${src}:${t.line}`
        byLine.set(key, (byLine.get(key) ?? 0) + t.ticks * perTick)
      }
    }
  }
}
const print = (title, map) => {
  console.log(`\n${title}  (total ${(totalUs / 1000).toFixed(0)} ms)`)
  const rows = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, top)
  for (const [k, us] of rows) {
    console.log(
      `${(us / 1000).toFixed(0).padStart(7)} ms ${((100 * us) / totalUs).toFixed(1).padStart(5)}%  ${k}`,
    )
  }
}
print('Self time by file', byFile)
print('Self time by function', byFn)
if (linesFor !== null) print(`Self time by line in ${linesFor}`, byLine)
