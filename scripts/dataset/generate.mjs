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
// Usage: npm run dataset -- [options]   (see --help)
import { join } from 'node:path'
import { parseArgs, USAGE } from './config.mjs'
import { compositeOver, degrade, makeBackground } from './degrade.mjs'
import { ensureDir, sanitize, writeGrayPng, writeManifest, writeRgbaPng } from './io.mjs'
import { hashString, mulberry32, seedFor } from './random.mjs'
import { renderShape } from './render.mjs'
import { dirSource, proceduralSource } from './sources.mjs'
import { edgeMap } from './targets.mjs'

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

// Assign a split from a stable hash of the split key. For a real corpus the key
// is the source family (top-level subdir), so no source SVG leaks across splits;
// procedural samples are mutually independent, so each splits on its own id and
// the ratios are hit directly.
function assignSplit(key) {
  // mulberry32 avalanches the hash — FNV-1a alone leaves high bits correlated
  // for near-identical sequential ids, which would bias the split.
  const r = mulberry32(hashString(`${cfg.seed}:${key}`))()
  const { train, val } = cfg.split
  if (r < train) return 'train'
  if (r < train + val) return 'val'
  return 'test'
}

// Two independent PRNG streams per sample: one for shape synthesis, one for the
// render/degrade pipeline, so changing one does not shift the other.
const synthRng = (i) => mulberry32(seedFor(cfg.seed, i * 2))
const pipeRng = (id, i) =>
  cfg.source === 'dir'
    ? mulberry32(seedFor(cfg.seed ^ hashString(id), 1))
    : mulberry32(seedFor(cfg.seed, i * 2 + 1))

function source() {
  if (cfg.source === 'dir') {
    if (!cfg.corpus) throw new Error('source=dir requires --corpus <dir>')
    return dirSource(cfg.corpus, cfg.count)
  }
  return proceduralSource(cfg.count, synthRng)
}

const records = []
const started = Date.now()
let i = 0
for (const item of source()) {
  const rng = pipeRng(item.id, i)
  const split = assignSplit(cfg.source === 'dir' ? item.family : item.id)
  const base = sanitize(item.id)

  const shape = renderShape(item.svg, cfg, rng)
  const bg = makeBackground(cfg.resolution, cfg.resolution, rng, cfg.degrade.background)
  const clean = compositeOver(shape, bg)
  const input = degrade(clean, cfg, rng)

  writeRgbaPng(join(cfg.out, split, 'input', `${base}.png`), input)
  const rec = { id: item.id, family: item.family, split, input: `${split}/input/${base}.png` }
  if (cfg.targets.includes('clean')) {
    writeRgbaPng(join(cfg.out, split, 'clean', `${base}.png`), clean)
    rec.clean = `${split}/clean/${base}.png`
  }
  if (cfg.targets.includes('edge')) {
    writeGrayPng(
      join(cfg.out, split, 'edge', `${base}.png`),
      edgeMap(shape),
      cfg.resolution,
      cfg.resolution,
    )
    rec.edge = `${split}/edge/${base}.png`
  }
  records.push(rec)
  i++
  if (i % 16 === 0) console.log(`  ${i} samples…`)
}

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
    count: i,
  },
  config: cfg,
  counts,
  samples: records,
})

console.log(
  `\ndone — ${i} samples (train ${counts.train}, val ${counts.val}, test ${counts.test}) ` +
    `in ${((Date.now() - started) / 1000).toFixed(1)}s → ${cfg.out}/`,
)
