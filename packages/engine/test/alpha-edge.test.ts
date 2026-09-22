import { describe, expect, it } from 'vitest'
import { createMask, createRaster, fillRaster, normalizeSettings, setPixel } from '@trazor/core'
import type { PathCommand, RasterImage, VectorizeSettings } from '@trazor/core'
import { vectorize } from '@trazor/engine'
import { alphaCoverageField } from '@trazor/raster'
import { decomposeMask, ringPolygon } from '@trazor/trace'

const CX = 64
const CY = 64
const R = 40

/**
 * A disk of radius `R` on a transparent canvas, each rim pixel carrying its
 * exact coverage in alpha over the ink color — what a rasterizer writes for an
 * anti-aliased shape.
 */
function coverageDisk(): RasterImage {
  const img = createRaster(128, 128)
  fillRaster(img, 0, 0, 0, 0)
  const sub = 8
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      let covered = 0
      for (let sy = 0; sy < sub; sy++) {
        for (let sx = 0; sx < sub; sx++) {
          if (Math.hypot(x + (sx + 0.5) / sub - CX, y + (sy + 0.5) / sub - CY) < R) covered++
        }
      }
      if (covered > 0) setPixel(img, x, y, 200, 40, 50, Math.round((covered * 255) / (sub * sub)))
    }
  }
  return img
}

function settings(patch: Partial<VectorizeSettings>): VectorizeSettings {
  return normalizeSettings({
    maxDimension: 0,
    mode: 'color',
    paletteSize: 2,
    background: 'transparent',
    minRegionArea: 2,
    optimizeSvg: false,
    ...patch,
  })
}

/** Points along the first subpath, cubics sampled densely. */
function outline(commands: PathCommand[]): [number, number][] {
  const pts: [number, number][] = []
  let x = 0
  let y = 0
  for (const c of commands) {
    if (c.type === 'M') {
      if (pts.length > 0) break
      x = c.x
      y = c.y
      pts.push([x, y])
    } else if (c.type === 'L') {
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
    }
  }
  return pts
}

/** Mean and largest radial deviation of the traced disk's outline from the true circle. */
async function radii(s: VectorizeSettings): Promise<{ mean: number; maxDev: number }> {
  const result = await vectorize(coverageDisk(), s, undefined, { withDocument: true })
  const shapes = result.document?.shapes ?? []
  expect(shapes.length).toBeGreaterThan(0)
  const pts = outline(shapes[0].commands)
  expect(pts.length).toBeGreaterThan(16)
  let sum = 0
  let maxDev = 0
  for (const [px, py] of pts) {
    const r = Math.hypot(px - CX, py - CY)
    sum += r
    maxDev = Math.max(maxDev, Math.abs(r - R))
  }
  return { mean: sum / pts.length, maxDev }
}

/** Radial statistics of a polygon's vertices (the last repeats the first). */
function polygonRadii(poly: readonly number[]): { mean: number; std: number } {
  let s = 0
  let s2 = 0
  let n = 0
  for (let i = 0; i < poly.length - 2; i += 2) {
    const r = Math.hypot(poly[i] - CX, poly[i + 1] - CY)
    s += r
    s2 += r * r
    n++
  }
  const mean = s / n
  return { mean, std: Math.sqrt(Math.max(0, s2 / n - mean * mean)) }
}

describe('exterior edges against transparency', () => {
  it('the coverage field takes the polygon stage off the lattice staircase', () => {
    const img = coverageDisk()
    const alpha = new Uint8Array(128 * 128)
    const mask = createMask(128, 128)
    for (let p = 0; p < alpha.length; p++) {
      alpha[p] = img.data[p * 4 + 3]
      mask.data[p] = alpha[p] >= 128 ? 1 : 0
    }
    const ring = decomposeMask(mask, 'minority', 1)[0].points
    const lattice = polygonRadii(ringPolygon(ring) as number[])
    const refined = polygonRadii(
      ringPolygon(ring, alphaCoverageField(alpha, 128, 128, 128)) as number[],
    )
    // The lattice polygon's vertices scatter around the circle by the staircase
    // (up to half a pixel); refined against the coverage they scatter less. Both
    // circumscribe the arc: two chord-fitted lines meet outside it.
    expect(refined.std).toBeLessThan(lattice.std * 0.8)
    expect(Math.abs(refined.mean - R)).toBeLessThan(0.5)
  })

  for (const layering of ['stacked', 'cutout'] as const) {
    it(`${layering}: traces a smooth outline at the half-coverage contour`, async () => {
      const { mean, maxDev } = await radii(settings({ layering, alphaThreshold: 128 }))
      // The curve stage passes inside the polygon's chords (Selinger's smoothing
      // runs the curve through the edge midpoints), so a convex outline sits a
      // fraction of a pixel inside the true circle; the refined outline is
      // smooth about it.
      expect(Math.abs(mean - R)).toBeLessThan(0.4)
      expect(maxDev).toBeLessThan(0.7)
    })

    it(`${layering}: follows the cut level — a fainter cut traces a larger outline`, async () => {
      const half = await radii(settings({ layering, alphaThreshold: 128 }))
      const faint = await radii(settings({ layering, alphaThreshold: 8 }))
      expect(faint.mean).toBeGreaterThan(half.mean + 0.1)
    })
  }
})
