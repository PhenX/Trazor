// One sample, end to end: render → background → composite → degrade → targets →
// write. Pure per item — its output depends only on (svg, pipeSeed, cfg), never
// on order or which thread runs it, so single-threaded and multi-threaded runs
// produce byte-identical files. Shared by generate.mjs (inline) and the worker.

import { join } from 'node:path'
import { compositeOver, degrade, makeBackground } from './degrade.mjs'
import { writeGrayPng, writeRgbaPng } from './io.mjs'
import { mulberry32 } from './random.mjs'
import { renderShape } from './render.mjs'
import { edgeMap } from './targets.mjs'

/**
 * @param item {{ index, id, family, split, base, svg, pipeSeed }}
 * @param cfg  resolved DatasetConfig
 * @returns the manifest record (carries `index` for a stable manifest sort)
 */
export function processItem(item, cfg) {
  const { index, id, family, split, base, svg, pipeSeed } = item
  // One rng drives render → background → degrade, in that order (matches the
  // single-threaded sequence exactly).
  const rng = mulberry32(pipeSeed)
  const shape = renderShape(svg, cfg, rng)
  const bg = makeBackground(cfg.resolution, cfg.resolution, rng, cfg.degrade.background)
  const clean = compositeOver(shape, bg)
  const input = degrade(clean, cfg, rng)

  writeRgbaPng(join(cfg.out, split, 'input', `${base}.png`), input)
  const record = { id, family, split, index, input: `${split}/input/${base}.png` }
  if (cfg.targets.includes('clean')) {
    writeRgbaPng(join(cfg.out, split, 'clean', `${base}.png`), clean)
    record.clean = `${split}/clean/${base}.png`
  }
  if (cfg.targets.includes('edge')) {
    writeGrayPng(
      join(cfg.out, split, 'edge', `${base}.png`),
      edgeMap(shape),
      cfg.resolution,
      cfg.resolution,
    )
    record.edge = `${split}/edge/${base}.png`
  }
  return record
}
