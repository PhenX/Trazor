import { describe, expect, it } from 'vitest'
import { createRaster, fillRaster, normalizeSettings, setPixel } from '@trazor/core'
import type { LabelMap, PathCommand, RasterImage, VectorizeSettings } from '@trazor/core'
import { vectorize } from '@trazor/engine'
import { traceLabelMap } from '@trazor/trace'
import { fitArcs } from '@trazor/svg'

const OPTS = {
  curveMode: 'spline' as const,
  smoothing: 0.75,
  curveOptimize: true,
  optTolerance: 0.2,
  cornerThreshold: 100,
}

/** A filled disc (label 1) enclosed by background (label 0). */
function discLabels(cx: number, cy: number, r: number, w: number, h: number): LabelMap {
  const data = new Int32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      data[y * w + x] = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r ? 1 : 0
    }
  }
  return { width: w, height: h, data, count: 2 }
}

function discRaster(): RasterImage {
  const img = createRaster(64, 64)
  fillRaster(img, 255, 255, 255)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      if (Math.hypot(x + 0.5 - 32, y + 0.5 - 32) <= 22) setPixel(img, x, y, 15, 15, 15)
    }
  }
  return img
}

function anchors(commands: PathCommand[]): [number, number][] {
  const out: [number, number][] = []
  for (const c of commands) if (c.type !== 'Z') out.push([c.x, c.y])
  return out
}

const countNodes = (c: PathCommand[]): number => c.filter((x) => x.type !== 'Z').length
const countArcs = (c: PathCommand[]): number => c.filter((x) => x.type === 'A').length
const refine = (precision: number) => (cmds: PathCommand[]) => fitArcs(cmds, precision)

function settings(patch: Partial<VectorizeSettings>): VectorizeSettings {
  return normalizeSettings({ maxDimension: 0, minRegionArea: 2, ...patch })
}

// Any A/a in path data is an arc command — path data has only letters + numbers.
const svgHasArc = (svg: string): boolean =>
  [...svg.matchAll(/ d="([^"]*)"/g)].some((m) => /[Aa]/.test(m[1]))

describe('cutout arc fitting — shared-chain seam consistency', () => {
  it('collapses a shared circular boundary to arcs and drops nodes', () => {
    const labels = discLabels(24, 24, 16, 48, 48)
    const plain = traceLabelMap(labels, OPTS).find((s) => s.label === 1)!
    const arced = traceLabelMap(labels, { ...OPTS, refineChain: refine(2) }).find(
      (s) => s.label === 1,
    )!
    expect(countArcs(plain.commands)).toBe(0)
    expect(countArcs(arced.commands)).toBeGreaterThan(0)
    expect(countNodes(arced.commands)).toBeLessThan(countNodes(plain.commands))
  })

  it('keeps the seam exact — the arc boundary is shared by both neighbours', () => {
    const labels = discLabels(24, 24, 16, 48, 48)
    const shapes = traceLabelMap(labels, { ...OPTS, refineChain: refine(2) })
    const inner = shapes.find((s) => s.label === 1)!
    const outer = shapes.find((s) => s.label === 0)!
    expect(countArcs(inner.commands)).toBeGreaterThan(0)
    expect(countArcs(outer.commands)).toBeGreaterThan(0)
    // Every inner anchor appears exactly in the outer region's rings — no gap.
    for (const [x, y] of anchors(inner.commands)) {
      expect(
        anchors(outer.commands).some(
          ([ox, oy]) => Math.abs(ox - x) < 1e-9 && Math.abs(oy - y) < 1e-9,
        ),
      ).toBe(true)
    }
  })

  it('is byte-identical without a refineChain, and deterministic with one', () => {
    const labels = discLabels(24, 24, 16, 48, 48)
    expect(JSON.stringify(traceLabelMap(labels, OPTS))).toBe(
      JSON.stringify(traceLabelMap(labels, { ...OPTS, refineChain: undefined })),
    )
    expect(JSON.stringify(traceLabelMap(labels, { ...OPTS, refineChain: refine(2) }))).toBe(
      JSON.stringify(traceLabelMap(labels, { ...OPTS, refineChain: refine(2) })),
    )
  })

  it('emits arcs in a cutout SVG when optimize is on, and none when off', async () => {
    const on = await vectorize(discRaster(), settings({ layering: 'cutout', optimizeSvg: true }))
    const off = await vectorize(discRaster(), settings({ layering: 'cutout', optimizeSvg: false }))
    expect(svgHasArc(on.svg)).toBe(true)
    expect(svgHasArc(off.svg)).toBe(false)
    // No full-shape <circle> element in cutout — the boundary is a shared path.
    expect(on.svg).not.toContain('<circle')
    expect(on.stats.nodeCount).toBeLessThan(off.stats.nodeCount)
  })
})
