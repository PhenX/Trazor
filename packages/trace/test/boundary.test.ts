import { describe, expect, it } from 'vitest'
import type { LabelMap, PathCommand } from '@vectorizer/core'
import { traceLabelMap } from '@vectorizer/trace'

function labelsOf(rows: string[]): LabelMap {
  const height = rows.length
  const width = rows[0].length
  const data = new Int32Array(width * height)
  let count = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x]
      const v = ch === '.' ? -1 : Number.parseInt(ch, 36)
      data[y * width + x] = v
      if (v >= 0) count = Math.max(count, v + 1)
    }
  }
  return { width, height, data, count }
}

const OPTS = {
  curveMode: 'spline' as const,
  smoothing: 0.75,
  curveOptimize: true,
  optTolerance: 0.2,
  minArea: 0,
}

function anchorKeys(commands: PathCommand[]): Set<string> {
  const keys = new Set<string>()
  for (const c of commands) {
    if (c.type === 'Z') continue
    keys.add(`${c.x.toFixed(6)},${c.y.toFixed(6)}`)
  }
  return keys
}

function ringsClosed(commands: PathCommand[]): boolean {
  let startX = NaN
  let startY = NaN
  let lastX = NaN
  let lastY = NaN
  for (const c of commands) {
    if (c.type === 'M') {
      startX = c.x
      startY = c.y
      lastX = c.x
      lastY = c.y
    } else if (c.type === 'Z') {
      if (Math.abs(lastX - startX) > 1e-6 || Math.abs(lastY - startY) > 1e-6) return false
    } else {
      lastX = c.x
      lastY = c.y
    }
  }
  return true
}

describe('traceLabelMap', () => {
  it('splits two regions with an exactly shared straight boundary', () => {
    const rows = Array.from({ length: 10 }, () => '0000011111')
    const shapes = traceLabelMap(labelsOf(rows), OPTS)
    expect(shapes).toHaveLength(2)
    for (const s of shapes) {
      expect(ringsClosed(s.commands)).toBe(true)
    }
    const a = anchorKeys(shapes.find((s) => s.label === 0)!.commands)
    const b = anchorKeys(shapes.find((s) => s.label === 1)!.commands)
    // Shared boundary endpoints are junction-pinned lattice points.
    expect(a.has('5.000000,0.000000')).toBe(true)
    expect(a.has('5.000000,10.000000')).toBe(true)
    expect(b.has('5.000000,0.000000')).toBe(true)
    expect(b.has('5.000000,10.000000')).toBe(true)
    expect(shapes.find((s) => s.label === 0)!.area).toBe(50)
  })

  it('pins a three-color junction point into every region', () => {
    const rows: string[] = []
    for (let y = 0; y < 10; y++) {
      rows.push(y < 5 ? '0000011111' : '0000022222')
    }
    const shapes = traceLabelMap(labelsOf(rows), OPTS)
    expect(shapes).toHaveLength(3)
    for (const s of shapes) {
      expect(ringsClosed(s.commands)).toBe(true)
      expect(anchorKeys(s.commands).has('5.000000,5.000000')).toBe(true)
    }
  })

  it('shares every interior boundary anchor between adjacent regions (seam-free)', () => {
    // A wavy two-label split.
    const rows: string[] = []
    for (let y = 0; y < 16; y++) {
      const split = 6 + Math.round(3 * Math.sin(y / 3))
      rows.push('0'.repeat(split) + '1'.repeat(16 - split))
    }
    const shapes = traceLabelMap(labelsOf(rows), OPTS)
    const a = shapes.find((s) => s.label === 0)!
    const b = shapes.find((s) => s.label === 1)!
    const bKeys = anchorKeys(b.commands)
    // Every anchor of region 0 that is not on the image border must be shared
    // (it lies on the common boundary chain, fitted exactly once).
    const missing: string[] = []
    let interior = 0
    for (const c of a.commands) {
      if (c.type === 'Z' || c.type === 'M') continue
      const onBorder = c.x < 1e-6 || c.y < 1e-6 || c.x > 16 - 1e-6 || c.y > 16 - 1e-6
      if (!onBorder) {
        interior++
        const key = `${c.x.toFixed(6)},${c.y.toFixed(6)}`
        if (!bKeys.has(key)) missing.push(key)
      }
    }
    expect(missing).toEqual([])
    expect(interior).toBeGreaterThan(2)
  })

  it('produces a hole ring identical to the enclosed region ring', () => {
    const rows = [
      '00000000',
      '00000000',
      '00111100',
      '00111100',
      '00111100',
      '00000000',
      '00000000',
      '00000000',
    ]
    const shapes = traceLabelMap(labelsOf(rows), OPTS)
    const outer = shapes.find((s) => s.label === 0)!
    const inner = shapes.find((s) => s.label === 1)!
    expect(outer.holeCount).toBe(1)
    expect(outer.commands.filter((c) => c.type === 'M')).toHaveLength(2)
    const innerKeys = anchorKeys(inner.commands)
    const outerKeys = anchorKeys(outer.commands)
    for (const key of innerKeys) {
      expect(outerKeys.has(key)).toBe(true)
    }
    expect(inner.area).toBe(12)
  })

  it('skips excluded (-1) pixels entirely', () => {
    const rows = ['..00', '..00', '1100', '1100']
    const shapes = traceLabelMap(labelsOf(rows), OPTS)
    expect(shapes.map((s) => s.label).toSorted()).toEqual([0, 1])
    const total = shapes.reduce((s, r) => s + r.area, 0)
    expect(total).toBe(12)
  })

  it('is deterministic', () => {
    const rows: string[] = []
    for (let y = 0; y < 12; y++) {
      const split = 4 + Math.round(2 * Math.cos(y / 2))
      rows.push('2'.repeat(split) + '0'.repeat(12 - split))
    }
    const a = JSON.stringify(traceLabelMap(labelsOf(rows), OPTS))
    const b = JSON.stringify(traceLabelMap(labelsOf(rows), OPTS))
    expect(a).toBe(b)
  })
})
