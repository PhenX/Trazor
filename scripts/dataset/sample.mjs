// One sample, end to end: render → background → composite → degrade → targets →
// write. Pure per item — its output depends only on (svg, pipeSeed, cfg), never
// on order or which thread runs it, so single-threaded and multi-threaded runs
// produce byte-identical files. Shared by generate.mjs (inline) and the worker.

import { join } from 'node:path'
import { compositeOver, degrade, makeBackground, matteHalo } from './degrade.mjs'
import { writeGrayPng, writeRgbaPng } from './io.mjs'
import { chance, mulberry32 } from './random.mjs'
import { renderShape } from './render.mjs'
import { edgeMap, fieldMap } from './targets.mjs'

/**
 * @param item {{ index, id, family, split, base, svg, pipeSeed }}
 * @param cfg  resolved DatasetConfig
 * @returns the manifest record (carries `index` for a stable manifest sort), or
 *   null when the SVG can't be rasterized (a real corpus has a few) — the caller
 *   skips it rather than aborting the run.
 */
export function processItem(item, cfg) {
  const { index, id, family, split, base, svg, pipeSeed } = item
  // One rng drives render → background → degrade, in that order (matches the
  // single-threaded sequence exactly).
  const rng = mulberry32(pipeSeed)
  let shape
  try {
    shape = renderShape(svg, cfg, rng)
  } catch {
    // resvg rejects some real-world SVGs (invalid size, unsupported features).
    return null
  }
  const bg = makeBackground(cfg.resolution, cfg.resolution, rng, cfg.degrade.background)
  const clean = compositeOver(shape, bg)
  // Input-side matting halo: composite a halo'd copy of the shape over the same
  // background for the model input, leaving clean/edge/field (from `shape`) aligned.
  const p = cfg.degrade
  const inputScene =
    p.matteProb > 0 && chance(rng, p.matteProb)
      ? compositeOver(matteHalo(shape, rng, p.matteStrengthMax), bg)
      : clean
  const input = degrade(inputScene, cfg, rng)

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
  if (cfg.targets.includes('field')) {
    // Derived from the clean composite (what the bw tracer would see), not the
    // pre-composite shape — the coverage the model must reproduce from `input`.
    writeGrayPng(
      join(cfg.out, split, 'field', `${base}.png`),
      fieldMap(clean),
      cfg.resolution,
      cfg.resolution,
    )
    record.field = `${split}/field/${base}.png`
  }
  return record
}
