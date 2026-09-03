import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CancelledError, createRaster, fillRaster, normalizeSettings, setPixel } from '@trazor/core'
import type { RasterImage, VectorizeResult, VectorizeSettings } from '@trazor/core'
import { HelperPool, installHelperHandler, vectorize } from '@trazor/engine'
import type { HelperEndpoint, StageCache } from '@trazor/engine'
import { createNodeHelpers } from '../../../scripts/bench/node-helpers'
import type { NodeHelpers } from '../../../scripts/bench/node-helpers'
import { scenes } from './helpers/gradient-scenes'

function settings(patch: Partial<VectorizeSettings>): VectorizeSettings {
  return normalizeSettings({ maxDimension: 0, minRegionArea: 2, ...patch })
}

/**
 * A colorful scene whose background color also fills a pocket ringed by the
 * smallest color, so stacked layering lifts that pocket onto its own island
 * layer — the parallel path has to reproduce more than one layer per color.
 */
function scene(): RasterImage {
  const img = createRaster(72, 72)
  fillRaster(img, 250, 248, 240)
  for (let y = 0; y < 72; y++) {
    for (let x = 0; x < 72; x++) {
      const d = Math.hypot(x + 0.5 - 30, y + 0.5 - 34)
      if (d < 22) setPixel(img, x, y, 210, 60, 50)
      if (d < 13 && d > 8) setPixel(img, x, y, 40, 110, 190)
      if (d < 8) setPixel(img, x, y, 250, 248, 240)
      if (x < 16 && y < 16) setPixel(img, x, y, 240, 200, 60)
      if (x > 58 && y > 50) setPixel(img, x, y, 30, 160, 120)
    }
  }
  return img
}

/** A vertical ramp, so gradient detection has a real band run to merge. */
function ramp(): RasterImage {
  const img = createRaster(64, 64)
  for (let y = 0; y < 64; y++) {
    const v = Math.round((y / 63) * 255)
    for (let x = 0; x < 64; x++) setPixel(img, x, y, v, 60, 255 - v)
  }
  return img
}

/**
 * The pinned scene whose glow is detected as a semi-transparent overlay, so its
 * layers carry underlays: each such layer emits its geometry twice, the base's
 * paint first. The helper has to serialize both paints for one traced unit.
 */
const overlayScene = scenes.find((s) => s.name === 'glow over a sky ramp (stacked overlay)') as
  | (typeof scenes)[number]
  | undefined

/** Ink art with a hole and a few specks — enough boundary work for bw mode. */
function inkArt(): RasterImage {
  const img = createRaster(72, 72)
  fillRaster(img, 255, 255, 255)
  for (let y = 0; y < 72; y++) {
    for (let x = 0; x < 72; x++) {
      const d = Math.hypot(x + 0.5 - 36, y + 0.5 - 36)
      if (d < 28 && d > 12) setPixel(img, x, y, 15, 15, 15)
      if (x > 4 && x < 12 && y > 58 && y < 66) setPixel(img, x, y, 20, 20, 20)
      if (y > 30 && y < 34) setPixel(img, x, y, 10, 10, 10)
    }
  }
  return img
}

interface Mode {
  name: string
  image: () => RasterImage
  patch: Partial<VectorizeSettings>
}

/** Every mode and serialization shape that can reach a helper, plus centerline. */
const MODES: Mode[] = [
  { name: 'color stacked', image: scene, patch: { mode: 'color', paletteSize: 6 } },
  {
    name: 'color stacked, grouped',
    image: scene,
    patch: { mode: 'color', paletteSize: 6, groupByColor: true },
  },
  {
    name: 'color stacked, unoptimized',
    image: scene,
    patch: { mode: 'color', paletteSize: 6, optimizeSvg: false },
  },
  {
    name: 'color stacked, pixel curves',
    image: scene,
    patch: { mode: 'color', paletteSize: 6, curveMode: 'pixel' },
  },
  {
    name: 'color stacked, mm units',
    image: scene,
    patch: { mode: 'color', paletteSize: 6, unit: 'mm', widthMm: 120 },
  },
  {
    name: 'color stacked, gradients',
    image: ramp,
    patch: { mode: 'color', paletteSize: 8, gradients: true },
  },
  {
    name: 'color stacked, region growing',
    image: scene,
    patch: { mode: 'color', segmentation: 'regions' },
  },
  {
    name: 'color stacked, gradient overlay (underlays)',
    image: () => (overlayScene as (typeof scenes)[number]).image(),
    patch: { ...overlayScene?.settings, mode: 'color', gradients: true },
  },
  {
    name: 'color cutout',
    image: scene,
    patch: { mode: 'color', paletteSize: 6, layering: 'cutout' },
  },
  {
    name: 'color cutout, grouped',
    image: scene,
    patch: { mode: 'color', paletteSize: 6, layering: 'cutout', groupByColor: true },
  },
  {
    name: 'color cutout, unoptimized',
    image: scene,
    patch: { mode: 'color', paletteSize: 6, layering: 'cutout', optimizeSvg: false },
  },
  {
    name: 'color cutout, gap fill',
    image: scene,
    patch: { mode: 'color', paletteSize: 6, layering: 'cutout', gapFill: 0.4 },
  },
  { name: 'bw', image: inkArt, patch: { mode: 'bw' } },
  { name: 'bw, unoptimized', image: inkArt, patch: { mode: 'bw', optimizeSvg: false } },
  { name: 'bw, adaptive', image: inkArt, patch: { mode: 'bw', thresholdMode: 'adaptive' } },
  { name: 'bw, pixel curves', image: inkArt, patch: { mode: 'bw', curveMode: 'pixel' } },
  { name: 'grayscale', image: scene, patch: { mode: 'grayscale', paletteSize: 5 } },
  // Centerline strokes come from the skeleton graph walk, which is one
  // indivisible pass over the whole mask, so it stays on the coordinator; the
  // run must still be identical with a pool attached.
  { name: 'centerline', image: inkArt, patch: { mode: 'centerline' } },
]

/** Consecutive paths sharing a `d` but not a `fill` — one underlay/overlay pair each. */
function underlayCount(svg: string): number {
  const paths = [...svg.matchAll(/<path\b[^>]*>/g)].map((p) => ({
    d: /\bd="([^"]*)"/.exec(p[0])?.[1] ?? '',
    fill: /\bfill="([^"]*)"/.exec(p[0])?.[1] ?? '',
  }))
  let n = 0
  for (let i = 1; i < paths.length; i++) {
    if (paths[i].d === paths[i - 1].d && paths[i].fill !== paths[i - 1].fill) n++
  }
  return n
}

/** Everything a byte-for-byte comparison of two runs must cover. */
function digest(r: VectorizeResult): unknown {
  return {
    svg: r.svg,
    palette: r.palette,
    document: r.document,
    warnings: r.warnings,
    pathCount: r.stats.pathCount,
    nodeCount: r.stats.nodeCount,
    colorCount: r.stats.colorCount,
    byteLength: r.stats.byteLength,
  }
}

describe('helper pool parallel tracing', () => {
  let helpers: NodeHelpers

  beforeAll(async () => {
    helpers = createNodeHelpers(3)
    await helpers.ready
  }, 30000)

  afterAll(async () => {
    await helpers.dispose()
  })

  for (const { name, image, patch } of MODES) {
    it(`matches the sequential run for ${name}`, async () => {
      const img = image()
      const s = settings(patch)
      const sequential = await vectorize(img, s, undefined, { withDocument: true })
      const parallel = await vectorize(img, s, undefined, {
        withDocument: true,
        helpers: helpers.pool,
      })
      expect(digest(parallel)).toEqual(digest(sequential))
    })

    it(`matches the sequential run for ${name} after a curve tweak`, async () => {
      const img = image()
      const cold = settings({ ...patch, smoothing: 0.5 })
      const tweaked = settings({ ...patch, smoothing: 0.9, optTolerance: 0.4 })
      // Both sides keep a StageCache across the two runs, so the tweak re-fits
      // from cached rings — on the coordinator sequentially, in the helpers in
      // parallel. The tweaked run must equal a cold run of the same settings.
      const seqCache: StageCache = {}
      const parCache: StageCache = {}
      await vectorize(img, cold, undefined, { imageId: 11, cache: seqCache })
      await vectorize(img, cold, undefined, {
        imageId: 12,
        cache: parCache,
        helpers: helpers.pool,
      })
      const warmSeq = await vectorize(img, tweaked, undefined, {
        imageId: 11,
        cache: seqCache,
        withDocument: true,
      })
      const warmPar = await vectorize(img, tweaked, undefined, {
        imageId: 12,
        cache: parCache,
        helpers: helpers.pool,
        withDocument: true,
      })
      const fresh = await vectorize(img, tweaked, undefined, { withDocument: true })
      expect(digest(warmSeq)).toEqual(digest(fresh))
      expect(digest(warmPar)).toEqual(digest(fresh))
    })
  }

  it('emits both paints of an underlay layer identically to the sequential run', async () => {
    const found = overlayScene
    expect(found).toBeDefined()
    const s = settings({ ...found?.settings, mode: 'color', gradients: true })
    const img = (found as (typeof scenes)[number]).image()
    const sequential = await vectorize(img, s, undefined, { withDocument: true })
    // The scene has to actually produce underlays, or the case above proves
    // nothing: an underlay is a path repeated with a different fill.
    expect(underlayCount(sequential.svg)).toBeGreaterThan(0)
    const parallel = await vectorize(img, s, undefined, {
      withDocument: true,
      helpers: helpers.pool,
    })
    expect(digest(parallel)).toEqual(digest(sequential))
  })

  it('rejects with CancelledError mid-run and leaves the pool reusable', async () => {
    const img = scene()
    const s = settings({ mode: 'color', paletteSize: 6 })
    let ticks = 0
    // Cancels once tracing is under way, so the abort lands between units.
    const ctx = { shouldCancel: () => ++ticks > 6 }
    await expect(vectorize(img, s, ctx, { helpers: helpers.pool })).rejects.toBeInstanceOf(
      CancelledError,
    )
    const after = await vectorize(img, s, undefined, { helpers: helpers.pool })
    const sequential = await vectorize(img, s)
    expect(after.svg).toBe(sequential.svg)
  })
})

/**
 * An in-process channel pair, so a test can drive the helper handler without a
 * thread and control when its replies arrive.
 */
function channel(): { pool: HelperEndpoint; helper: HelperEndpoint; flush: () => void } {
  const toHelper: ((ev: { data: unknown }) => void)[] = []
  const toPool: ((ev: { data: unknown }) => void)[] = []
  const held: unknown[] = []
  const helper: HelperEndpoint = {
    postMessage: (message) => held.push(message),
    addEventListener: (_type, listener) => toHelper.push(listener),
  }
  const pool: HelperEndpoint = {
    postMessage: (message) => {
      for (const fn of toHelper) fn({ data: message })
    },
    addEventListener: (_type, listener) => toPool.push(listener),
  }
  // Release the helper's replies newest-first, keeping `helper-done` last: the
  // coordinator sees units complete out of order and must still place them by
  // index.
  const flush = (): void => {
    const done = held.filter((m) => (m as { type: string }).type === 'helper-done')
    const rest = held.filter((m) => (m as { type: string }).type !== 'helper-done').toReversed()
    held.length = 0
    for (const m of [...rest, ...done]) {
      for (const fn of toPool) fn({ data: m })
    }
  }
  return { pool, helper, flush }
}

describe('helper results are placed by unit index', () => {
  it('matches the sequential run when replies arrive newest-first', async () => {
    const ends = channel()
    installHelperHandler(ends.helper)
    const pool = new HelperPool([ends.pool])
    // The handler answers synchronously into `held`; flushing on every macrotask
    // turn releases each batch reversed, so the coordinator never sees unit
    // order on the wire.
    const timer = setInterval(ends.flush, 0)
    try {
      const img = scene()
      const s = settings({ mode: 'color', paletteSize: 6 })
      const parallel = await vectorize(img, s, undefined, { helpers: pool, withDocument: true })
      const sequential = await vectorize(img, s, undefined, { withDocument: true })
      expect(digest(parallel)).toEqual(digest(sequential))
    } finally {
      clearInterval(timer)
    }
  })
})
