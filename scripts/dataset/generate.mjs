#!/usr/bin/env node
// Dataset generator: SVG corpus → rasterize → degrade → aligned (input, target)
// pairs, for training the on-device conditioning models described in
// docs/ML_STRATEGY.md and docs/EDGE_PREPASS.md.
//
// Per sample it emits, all pixel-aligned at the target resolution:
//   input/  the degraded raster the model sees
//   clean/  the clean scene    (cleanup / super-resolution target)
//   edge/   the soft edge map  (edge pre-pass target)
// plus a manifest.json with the config and per-sample split assignment.
//
// Work is spread across worker threads (--jobs, default: CPU count). Because
// each sample is fully determined by its own seeds and the manifest is sorted by
// index, the output is byte-identical regardless of --jobs.
//
// Usage: npm run dataset -- [options]   (see --help)
import { availableParallelism, cpus } from 'node:os'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { parseArgs, USAGE } from './config.mjs'
import { ensureDir, sanitize, writeManifest } from './io.mjs'
import { hashString, mulberry32, seedFor } from './random.mjs'
import { processItem } from './sample.mjs'
import { dirSource, proceduralItem } from './sources.mjs'

const cfg = parseArgs(process.argv.slice(2))
if (cfg.help) {
  console.log(USAGE)
  process.exit(0)
}

const SPLITS = ['train', 'val', 'test']
for (const s of SPLITS) {
  ensureDir(join(cfg.out, s, 'input'))
  if (cfg.targets.includes('clean')) ensureDir(join(cfg.out, s, 'clean'))
  if (cfg.targets.includes('edge')) ensureDir(join(cfg.out, s, 'edge'))
}

// Assign a split from a stable hash of the split key (mulberry32 avalanches it).
// For a real corpus the key is the source family (top-level subdir), so no source
// SVG leaks across splits; procedural samples split on their own id.
function assignSplit(key) {
  const r = mulberry32(hashString(`${cfg.seed}:${key}`))()
  const { train, val } = cfg.split
  if (r < train) return 'train'
  if (r < train + val) return 'val'
  return 'test'
}

/** Yield fully-resolved work items (svg + seeds + split + filename) in order. */
function* buildItems() {
  if (cfg.source === 'dir') {
    if (!cfg.corpus) throw new Error('source=dir requires --corpus <dir>')
    let index = 0
    for (const { id, family, svg } of dirSource(cfg.corpus, cfg.count)) {
      yield {
        index,
        id,
        family,
        split: assignSplit(family),
        base: sanitize(id),
        svg,
        pipeSeed: seedFor((cfg.seed ^ hashString(id)) >>> 0, 1),
      }
      index++
    }
  } else {
    for (let index = 0; index < cfg.count; index++) {
      const { id, family, svg } = proceduralItem(index, cfg.seed)
      yield {
        index,
        id,
        family,
        split: assignSplit(id),
        base: sanitize(id),
        svg,
        pipeSeed: seedFor(cfg.seed, index * 2 + 1),
      }
    }
  }
}

/** Run items through a pool of worker threads; `onRecord` fires as each finishes. */
function runPool(iterator, jobs, onRecord) {
  return new Promise((resolve, reject) => {
    const url = new URL('./sample-worker.mjs', import.meta.url)
    const workers = []
    let active = 0
    let settled = false
    const fail = (err) => {
      if (settled) return
      settled = true
      for (const w of workers) void w.terminate()
      reject(err)
    }
    const feed = (w) => {
      const n = iterator.next()
      // worker_threads postMessage takes no targetOrigin (this is not window).
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      w.postMessage(n.done ? { type: 'stop' } : { type: 'item', item: n.value })
    }
    for (let i = 0; i < jobs; i++) {
      const w = new Worker(url, { workerData: { config: cfg } })
      workers.push(w)
      active++
      w.on('message', (msg) => {
        if (msg.type === 'record') {
          onRecord(msg.record)
          feed(w)
        }
      })
      w.on('error', fail)
      w.on('exit', (code) => {
        if (code !== 0) fail(new Error(`dataset worker exited with code ${code}`))
        else if (--active === 0 && !settled) {
          settled = true
          resolve()
        }
      })
      feed(w) // prime
    }
  })
}

const records = []
const started = Date.now()
let n = 0
const onRecord = (rec) => {
  records.push(rec)
  if (++n % 64 === 0) console.log(`  ${n} samples…`)
}

const jobs = cfg.jobs > 0 ? cfg.jobs : (availableParallelism?.() ?? cpus().length)
if (jobs <= 1) {
  for (const item of buildItems()) onRecord(processItem(item, cfg))
} else {
  await runPool(buildItems(), jobs, onRecord)
}

// Stable order regardless of worker completion order.
records.sort((a, b) => a.index - b.index)
const counts = SPLITS.reduce(
  (acc, s) => ((acc[s] = records.filter((r) => r.split === s).length), acc),
  {},
)

writeManifest(join(cfg.out, 'manifest.json'), {
  generatedWith: {
    source: cfg.source,
    seed: cfg.seed,
    resolution: cfg.resolution,
    supersample: cfg.supersample,
    jobs,
    count: records.length,
  },
  config: cfg,
  counts,
  samples: records,
})

console.log(
  `\ndone — ${records.length} samples (train ${counts.train}, val ${counts.val}, test ${counts.test}) ` +
    `on ${jobs} job${jobs === 1 ? '' : 's'} in ${((Date.now() - started) / 1000).toFixed(1)}s → ${cfg.out}/`,
)
