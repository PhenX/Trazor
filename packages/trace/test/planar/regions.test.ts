import type { LabelMap } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { splitFaces } from '../../src/planar/faces'
import { buildPlanarMap } from '../../src/planar/map'
import { regionRings } from '../../src/planar/regions'
import { polygonArea, ringPolygon } from '../../src/planar/rings'

function labelsOf(rows: string[]): LabelMap {
  const h = rows.length
  const w = rows[0].length
  const data = new Int32Array(w * h)
  let count = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = rows[y][x]
      const l = c === '.' ? -1 : Number(c)
      data[y * w + x] = l
      if (l + 1 > count) count = l + 1
    }
  }
  return { width: w, height: h, data, count }
}

/** Area the rings of the union enclose: outlines count, holes subtract (shoelace, y down). */
function unionArea(
  rows: string[],
  pick: (label: number) => boolean,
): { area: number; pixels: number; rings: number } {
  const labels = labelsOf(rows)
  const faces = splitFaces(labels)
  const map = buildPlanarMap(faces)
  const inRegion = new Uint8Array(faces.count)
  let pixels = 0
  for (let f = 0; f < faces.count; f++) if (pick(faces.label[f])) inRegion[f] = 1
  for (let p = 0; p < labels.data.length; p++) if (inRegion[faces.ids[p]]) pixels++
  const rings = regionRings(map, inRegion)
  let area = 0
  for (const r of rings) area += -polygonArea(ringPolygon(map, r))
  return { area, pixels, rings: rings.length }
}

describe('regionRings', () => {
  it('walks the union of two touching faces as one ring around both', () => {
    const rows = ['000000', '011220', '011220', '000000']
    const u = unionArea(rows, (l) => l === 1 || l === 2)
    expect(u.rings).toBe(1)
    expect(u.area).toBeCloseTo(u.pixels, 9)
  })

  it('keeps a hole the union does not cover, and skips edges inside it', () => {
    const rows = ['1111111', '1222221', '1233321', '1222221', '1111111']
    const u = unionArea(rows, (l) => l === 1 || l === 2)
    expect(u.rings).toBe(2)
    expect(u.area).toBeCloseTo(u.pixels, 9)
  })

  it('handles faces meeting at a junction and the frame', () => {
    const rows = ['0011', '0211', '2221', '2.11']
    for (const pick of [
      (l: number) => l === 0 || l === 2,
      (l: number) => l === 1,
      (l: number) => l >= 0,
    ]) {
      const u = unionArea(rows, pick)
      expect(u.area).toBeCloseTo(u.pixels, 9)
    }
  })
})
