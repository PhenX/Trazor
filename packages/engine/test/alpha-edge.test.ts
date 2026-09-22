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
    const lattice = polygonRadii(ringPolygon(ring)?.polygon as number[])
    const refined = polygonRadii(
      ringPolygon(ring, alphaCoverageField(alpha, 128, 128, 128))?.polygon as number[],
    )
    // The lattice polygon's vertices scatter around the circle by the staircase
    // (up to half a pixel); refined against the coverage they scatter less. Both
    // circumscribe the arc: two chord-fitted lines meet outside it.
    expect(refined.std).toBeLessThan(lattice.std * 0.8)
    expect(Math.abs(refined.mean - R)).toBeLessThan(0.5)
  })

  for (const layering of ['stacked', 'cutout'] as const) {
    it(`${layering}: traces the true circle with no chord bias`, async () => {
      const { mean, maxDev } = await radii(settings({ layering, alphaThreshold: 128 }))
      // The multi-model run fitter fits the refined ring points directly (not the
      // polygon's chords), so the emitted curve carries none of the Selinger
      // chain's circumscribe/inscribe bias: the outline sits on the true circle,
      // not a fraction of a pixel inside it, and stays smooth about it.
      expect(Math.abs(mean - R)).toBeLessThan(0.05)
      expect(maxDev).toBeLessThan(0.2)
    })

    it(`${layering}: follows the cut level — a fainter cut traces a larger outline`, async () => {
      const half = await radii(settings({ layering, alphaThreshold: 128 }))
      const faint = await radii(settings({ layering, alphaThreshold: 8 }))
      expect(faint.mean).toBeGreaterThan(half.mean + 0.1)
    })
  }

  it('lands an anti-aliased straight edge on its true sub-pixel line, as lines', async () => {
    const result = await vectorize(
      coverageRect(EDGE_X),
      settings({ alphaThreshold: 128 }),
      undefined,
      {
        withDocument: true,
      },
    )
    const shape = (result.document?.shapes ?? [])[0]
    expect(shape).toBeDefined()
    const cmds = shape.commands
    const xs = cmds
      .filter((c): c is Extract<PathCommand, { x: number }> => 'x' in c)
      .map((c) => c.x)
    // The left face is the anti-aliased edge; its anchors track the true line.
    const left = Math.min(...xs)
    expect(Math.abs(left - EDGE_X)).toBeLessThan(0.1)
    // A straight edge is emitted as straight lines, never cubics.
    expect(cmds.some((c) => c.type === 'C')).toBe(false)
  })

  it('keeps a coverage-exact acute tip sharp, not rounded away', async () => {
    const result = await vectorize(coverageWedge(), settings({ alphaThreshold: 128 }), undefined, {
      withDocument: true,
    })
    const shape = (result.document?.shapes ?? [])[0]
    expect(shape).toBeDefined()
    const pts = outline(shape.commands)
    // An anchor sits near the true apex — the sharp tip survives (an acute tip's
    // exact position is inherently soft in the coverage, so the bound is loose).
    const nearTip = pts.reduce(
      (m, [x, y]) => Math.min(m, Math.hypot(x - TIP_X, y - TIP_Y)),
      Infinity,
    )
    expect(nearTip).toBeLessThan(2)
  })
})

const EDGE_X = 40.3

/** A vertical anti-aliased edge at `edgeX`: opaque to the right, transparent left. */
function coverageRect(edgeX: number): RasterImage {
  const img = createRaster(96, 64)
  fillRaster(img, 0, 0, 0, 0)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 96; x++) {
      // Fraction of the pixel column to the right of the edge (and left of x=80).
      const cov = Math.max(0, Math.min(1, x + 1 - edgeX)) * (x < 80 ? 1 : Math.max(0, 80 - x))
      if (cov > 0 && y > 8 && y < 56) setPixel(img, x, y, 200, 40, 50, Math.round(cov * 255))
    }
  }
  return img
}

const TIP_X = 88
const TIP_Y = 32

/** A coverage-exact triangle with a sharp acute tip at (TIP_X, TIP_Y). */
function coverageWedge(): RasterImage {
  const img = createRaster(112, 64)
  fillRaster(img, 0, 0, 0, 0)
  const sub = 8
  const ax = 16
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 112; x++) {
      let covered = 0
      for (let sy = 0; sy < sub; sy++) {
        for (let sx = 0; sx < sub; sx++) {
          const px = x + (sx + 0.5) / sub
          const py = y + (sy + 0.5) / sub
          // Triangle (ax, 12)–(ax, 52)–(TIP_X, TIP_Y): a slender wedge.
          const t = (px - ax) / (TIP_X - ax)
          if (px >= ax && px <= TIP_X && Math.abs(py - TIP_Y) <= (1 - t) * 20) covered++
        }
      }
      if (covered > 0) setPixel(img, x, y, 200, 40, 50, Math.round((covered * 255) / (sub * sub)))
    }
  }
  return img
}
