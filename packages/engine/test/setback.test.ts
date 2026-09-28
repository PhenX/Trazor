import { describe, expect, it } from 'vitest'
import { createRaster, fillRaster, normalizeSettings, setPixel } from '@trazor/core'
import type { PathCommand, RasterImage } from '@trazor/core'
import { vectorize } from '@trazor/engine'
import { decomposeMask } from '@trazor/trace'
import { sheetSetback } from '../src/setback'

const S = 96
/** The red disk: center and radius. */
const DX = 60
const DY = 48
const DR = 16

/**
 * A blue square [20, 60) × [20, 76) on a transparent canvas with a red disk
 * painted over its right edge, so half the disk hangs out over transparency —
 * each pixel carrying its exact area coverage, as a rasterizer writes it.
 */
function scene(): RasterImage {
  const img = createRaster(S, S)
  fillRaster(img, 0, 0, 0, 0)
  const sub = 8
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let red = 0
      let blue = 0
      for (let j = 0; j < sub; j++) {
        for (let i = 0; i < sub; i++) {
          const px = x + (i + 0.5) / sub
          const py = y + (j + 0.5) / sub
          if (Math.hypot(px - DX, py - DY) < DR) red++
          else if (px >= 20 && px < 60 && py >= 20 && py < 76) blue++
        }
      }
      const cover = red + blue
      if (cover === 0) continue
      // Straight-alpha color of the covered part, alpha the covered fraction.
      const r = Math.round((220 * red + 40 * blue) / cover)
      const g = Math.round((40 * red + 90 * blue) / cover)
      const b = Math.round((50 * red + 200 * blue) / cover)
      setPixel(img, x, y, r, g, b, Math.round((cover * 255) / (sub * sub)))
    }
  }
  return img
}

/** Points along every subpath, cubics sampled densely. */
function outline(commands: PathCommand[]): [number, number][] {
  const pts: [number, number][] = []
  let x = 0
  let y = 0
  for (const c of commands) {
    if (c.type === 'M' || c.type === 'L') {
      x = c.x
      y = c.y
      pts.push([x, y])
    } else if (c.type === 'C') {
      for (let i = 1; i <= 16; i++) {
        const t = i / 16
        const u = 1 - t
        pts.push([
          u * u * u * x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
          u * u * u * y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
        ])
      }
      x = c.x
      y = c.y
    } else if (c.type === 'A') {
      x = c.x
      y = c.y
      pts.push([x, y])
    }
  }
  return pts
}

describe('stacked base layer under a sheet above it', () => {
  it('sets the base edge back beneath the sheet where the sheet meets the outside', async () => {
    const result = await vectorize(
      scene(),
      normalizeSettings({
        maxDimension: 0,
        mode: 'color',
        paletteSize: 2,
        background: 'transparent',
        alphaThreshold: 128,
        layering: 'stacked',
        minRegionArea: 2,
        optimizeSvg: false,
      }),
      undefined,
      { withDocument: true },
    )
    const shapes = result.document?.shapes ?? []
    const blue = shapes.find((s) => s.fill?.toLowerCase().startsWith('#2'))
    const red = shapes.find((s) => s.fill?.toLowerCase().startsWith('#d'))
    expect(blue).toBeDefined()
    expect(red).toBeDefined()
    // Along the disk's outer arc (right of the square), the base runs hidden
    // under the red sheet: its outline stays well inside the disk, clear of the
    // pixels the red edge anti-aliases, while the red outline is the circle.
    const arc = (p: [number, number]): boolean => p[0] > 64 && Math.abs(p[1] - DY) < 10
    const bluePts = outline(blue!.commands).filter(arc)
    const redPts = outline(red!.commands).filter(arc)
    expect(bluePts.length).toBeGreaterThan(4)
    expect(redPts.length).toBeGreaterThan(4)
    for (const [x, y] of redPts)
      expect(Math.abs(Math.hypot(x - DX, y - DY) - DR)).toBeLessThan(0.15)
    for (const [x, y] of bluePts) expect(Math.hypot(x - DX, y - DY)).toBeLessThan(DR - 0.6)
  })
})

describe('sheetSetback', () => {
  /** A 24×24 grid, a 16×16 layer mask at [4, 20) with `sheet` pixels labeled 1 (above) and the rest 0. */
  function ringOf(sheet: (x: number, y: number) => boolean): {
    points: number[]
    mask: Uint8Array
    labels: Int32Array
  } {
    const W = 24
    const mask = new Uint8Array(W * W)
    const labels = new Int32Array(W * W).fill(-1)
    for (let y = 4; y < 20; y++) {
      for (let x = 4; x < 20; x++) {
        mask[y * W + x] = 1
        labels[y * W + x] = sheet(x, y) ? 1 : 0
      }
    }
    const [ring] = decomposeMask({ width: W, height: W, data: mask }, 'minority', 1)
    return { points: ring.points, mask, labels }
  }
  const position = new Int32Array([0, 1])

  it('sets back only the stretch under a sheet at least two pixels deep, ramped at its ends', () => {
    const { points, mask, labels } = ringOf((x) => x >= 12)
    const back = sheetSetback(points, mask, labels, position, 0, 24, 24)
    expect(back).toBeDefined()
    const own: number[] = []
    const deep: number[] = []
    const all: number[] = []
    for (let i = 0; i < points.length >> 1; i++) {
      const [x, y] = [points[i * 2], points[i * 2 + 1]]
      const b = Math.abs(back![i])
      all.push(b)
      if (x < 12) own.push(b)
      if (x === 20 && y >= 8 && y <= 16) deep.push(b)
    }
    // The layer's own color (left half, x < 12) is visible and stays put; the
    // right side, deep inside its hidden stretch, moves a full pixel inward, and
    // nothing moves further.
    expect(own.length).toBeGreaterThan(0)
    expect(Math.max(...own)).toBe(0)
    expect(deep.length).toBeGreaterThan(0)
    for (const b of deep) expect(b).toBeCloseTo(1, 10)
    expect(Math.max(...all)).toBeLessThanOrEqual(1)
  })

  it('leaves a sheet one pixel wide alone', () => {
    const { points, mask, labels } = ringOf((x) => x === 19)
    expect(sheetSetback(points, mask, labels, position, 0, 24, 24)).toBeUndefined()
  })

  it('hides nothing under a label painted below the layer', () => {
    const { points, mask, labels } = ringOf((x) => x >= 12)
    expect(sheetSetback(points, mask, labels, new Int32Array([1, 0]), 1, 24, 24)).toBeUndefined()
  })
})
