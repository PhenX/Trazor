import { describe, expect, it } from 'vitest'
import type { BinaryMask, TurnPolicy } from '@trazor/core'
import { mulberry32 } from '@trazor/core'
import type { CrackPath } from '@trazor/trace'
import { decomposeMask } from '@trazor/trace'

function maskOf(rows: string[]): BinaryMask {
  const height = rows.length
  const width = rows[0].length
  const data = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rows[y][x] === '#') data[y * width + x] = 1
    }
  }
  return { width, height, data }
}

describe('decomposeMask', () => {
  it('traces a single pixel as a unit square with positive area', () => {
    const paths = decomposeMask(maskOf(['#']), 'minority', 0)
    expect(paths).toHaveLength(1)
    expect(paths[0].area).toBe(1)
    expect(paths[0].points).toHaveLength(8)
    const pts = paths[0].points
    const set = new Set<string>()
    for (let i = 0; i < pts.length; i += 2) set.add(`${pts[i]},${pts[i + 1]}`)
    expect(set).toEqual(new Set(['0,0', '1,0', '1,1', '0,1']))
  })

  it('finds outer boundary and hole with opposite signs', () => {
    const paths = decomposeMask(
      maskOf(['#####', '#...#', '#.#.#', '#...#', '#####'].map((r) => r.replace(/\./g, ' '))),
      'minority',
      0,
    )
    const positives = paths.filter((p) => p.area > 0)
    const negatives = paths.filter((p) => p.area < 0)
    // Outer boundary encloses 25 (holes included geometrically); dot inside is 1.
    expect(positives.map((p) => p.area).toSorted((a, b) => b - a)).toEqual([25, 1])
    expect(negatives).toHaveLength(1)
    expect(negatives[0].area).toBe(-9)
  })

  it('area sums are consistent with pixel counts', () => {
    const mask = maskOf(
      ['###..', '###..', '..###', '..###', '.....'].map((r) => r.replace(/\./g, ' ')),
    )
    const paths = decomposeMask(mask, 'minority', 0)
    const total = paths.reduce((s, p) => s + p.area, 0)
    let pixels = 0
    for (const v of mask.data) pixels += v
    expect(total).toBe(pixels)
  })

  it('respects minArea by dropping specks', () => {
    const paths = decomposeMask(
      maskOf(['#....', '.....', '..###', '..###', '.....'].map((r) => r.replace(/\./g, ' '))),
      'minority',
      2,
    )
    expect(paths).toHaveLength(1)
    expect(paths[0].area).toBe(6)
  })

  it('turn policy splits or joins diagonal checkerboard pixels', () => {
    const rows = ['#.', '.#'].map((r) => r.replace(/\./g, ' '))
    const joined = decomposeMask(maskOf(rows), 'black', 0)
    const split = decomposeMask(maskOf(rows), 'white', 0)
    expect(joined).toHaveLength(1)
    expect(joined[0].area).toBe(2)
    expect(split).toHaveLength(2)
  })
})

const POLICIES: TurnPolicy[] = ['left', 'right', 'black', 'white', 'majority', 'minority']
const SIZES: [number, number][] = [
  [13, 11],
  [24, 19],
  [40, 31],
]
const DENSITIES = [0.15, 0.35, 0.55, 0.8]

/** Blobs, then concentric onion rings that nest several levels deep, then speckle. */
function randomMask(seed: number, w: number, h: number, density: number): BinaryMask {
  const rnd = mulberry32(seed)
  const data = new Uint8Array(w * h)
  const rects = 2 + Math.round(density * 6)
  for (let i = 0; i < rects; i++) {
    const rw = 2 + Math.floor(rnd() * w * 0.5)
    const rh = 2 + Math.floor(rnd() * h * 0.5)
    const x0 = Math.floor(rnd() * (w - 1))
    const y0 = Math.floor(rnd() * (h - 1))
    const v = i % 2 === 0 ? 1 : 0
    for (let y = y0; y < Math.min(h, y0 + rh); y++) {
      for (let x = x0; x < Math.min(w, x0 + rw); x++) data[y * w + x] = v
    }
  }
  const onions = 1 + Math.round(density * 3)
  for (let o = 0; o < onions; o++) {
    let rx = 3 + Math.floor((rnd() * (w - 8)) / 2)
    let ry = 3 + Math.floor((rnd() * (h - 8)) / 2)
    const cx = rx + 1 + Math.floor(rnd() * (w - 2 * rx - 2))
    const cy = ry + 1 + Math.floor(rnd() * (h - 2 * ry - 2))
    for (let v = 1; rx >= 0 && ry >= 0; v ^= 1) {
      for (let y = cy - ry; y <= cy + ry; y++) {
        for (let x = cx - rx; x <= cx + rx; x++) data[y * w + x] = v
      }
      rx -= 2
      ry -= 2
    }
  }
  // Speckle: single-pixel specks and pinholes, the paths minArea then drops.
  for (let i = 0; i < data.length; i++) {
    if (rnd() < density * 0.08) data[i] ^= 1
  }
  return { width: w, height: h, data }
}

/** Reference even-odd fill of one crack ring: vertical crossings per row, sorted, paired. */
function refToggle(work: Uint8Array, points: number[], w: number): void {
  const rows: number[][] = []
  const n = points.length
  for (let i = 0; i < n; i += 2) {
    const y = points[i + 1]
    const ny = points[(i + 3) % n]
    if (ny !== y) (rows[Math.min(y, ny)] ??= []).push(points[i])
  }
  for (let ry = 0; ry < rows.length; ry++) {
    const xs = rows[ry]
    if (!xs) continue
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = xs[k]; x < xs[k + 1]; x++) work[ry * w + x] ^= 1
    }
  }
}

/** Reference even-odd point-in-ring test at a pixel center (half-integer). */
function refContains(points: number[], px: number, py: number): boolean {
  let inside = false
  const n = points.length
  for (let i = 0; i < n; i += 2) {
    const y1 = points[i + 1]
    const y2 = points[(i + 3) % n]
    if (y1 === y2) continue
    if (py > Math.min(y1, y2) && py < Math.max(y1, y2) && points[i] < px) inside = !inside
  }
  return inside
}

/** Reference parent: smallest positive path whose ring contains the path's interior pixel. */
function refParent(paths: CrackPath[], i: number): number {
  const px = paths[i].interiorX + 0.5
  const py = paths[i].interiorY + 0.5
  let best = -1
  for (let j = 0; j < paths.length; j++) {
    if (j === i || paths[j].area <= 0) continue
    if (best >= 0 && paths[j].area >= paths[best].area) continue
    if (refContains(paths[j].points, px, py)) best = j
  }
  return best
}

describe('decomposeMask nesting', () => {
  it('links a nested outer > hole > island > hole chain', () => {
    const paths = decomposeMask(
      maskOf([
        '##########',
        '##########',
        '##......##',
        '##.####.##',
        '##.#..#.##',
        '##.#..#.##',
        '##.####.##',
        '##......##',
        '##########',
        '##########',
      ]),
      'minority',
      0,
    )
    expect(paths.map((p) => p.area)).toEqual([100, -36, 16, -4])
    // The island's enclosing ring is the outer shape: hole rings own nothing.
    expect(paths.map((p) => p.parent)).toEqual([-1, 0, 0, 2])
  })

  it('drops a hole whose enclosing outer ring falls below minArea', () => {
    const rows = [
      '##########',
      '##########',
      '##......##',
      '##.####.##',
      '##.#..#.##',
      '##.#..#.##',
      '##.####.##',
      '##......##',
      '##########',
      '##########',
    ]
    // The island encloses 16 and its own pinhole 4, so a threshold above 16
    // takes both: a kept hole always sits inside a kept ring.
    const paths = decomposeMask(maskOf(rows), 'minority', 20)
    expect(paths.map((p) => p.area)).toEqual([100, -36])
    expect(paths.map((p) => p.parent)).toEqual([-1, 0])
    for (const p of paths) expect(p.parent).toBeLessThan(paths.length)
  })

  it('matches the point-in-ring reference for every parent link', () => {
    const bad: string[] = []
    let seed = 1000
    let holesWithParent = 0
    let nestedIslands = 0
    let maxDepth = 0
    for (const [w, h] of SIZES) {
      for (const density of DENSITIES) {
        for (const policy of POLICIES) {
          for (const minArea of [1, 4]) {
            const mask = randomMask(seed++, w, h, density)
            const paths = decomposeMask(mask, policy, minArea)
            for (let i = 0; i < paths.length; i++) {
              const want = refParent(paths, i)
              if (paths[i].parent !== want) {
                bad.push(
                  `${w}x${h} d${density} ${policy} min${minArea} #${i}: ${paths[i].parent} ≠ ${want}`,
                )
              }
              if (paths[i].area < 0 && want >= 0) holesWithParent++
              if (paths[i].area > 0 && want >= 0) nestedIslands++
              let depth = 0
              for (let j = paths[i].parent; j >= 0; j = paths[j].parent) depth++
              if (depth > maxDepth) maxDepth = depth
            }
          }
        }
      }
    }
    expect(bad).toEqual([])
    // The sweep is only meaningful if it actually produced deep nesting.
    expect(holesWithParent).toBeGreaterThan(300)
    expect(nestedIslands).toBeGreaterThan(80)
    expect(maxDepth).toBeGreaterThanOrEqual(3)
  })

  it('groups holes in decomposition order, matching the reference search', () => {
    const bad: string[] = []
    let seed = 5000
    for (const [w, h] of SIZES) {
      for (const density of DENSITIES) {
        for (const policy of POLICIES) {
          const paths = decomposeMask(randomMask(seed++, w, h, density), policy, 1)
          const got = new Map<number, number[]>()
          const want = new Map<number, number[]>()
          for (let i = 0; i < paths.length; i++) {
            if (paths[i].area > 0) continue
            const g = paths[i].parent
            const r = refParent(paths, i)
            if (g >= 0) got.set(g, [...(got.get(g) ?? []), i])
            if (r >= 0) want.set(r, [...(want.get(r) ?? []), i])
          }
          for (const [outer, list] of want) {
            const mine = got.get(outer) ?? []
            if (mine.join(',') !== list.join(',')) {
              bad.push(`${w}x${h} d${density} ${policy} outer ${outer}: ${mine} ≠ ${list}`)
            }
          }
          if (got.size !== want.size) bad.push(`${w}x${h} d${density} ${policy}: outer count`)
        }
      }
    }
    expect(bad).toEqual([])
  })
})

describe('decomposeMask XOR flip', () => {
  it('flips exactly the reference even-odd fill, in scan order', () => {
    const bad: string[] = []
    let seed = 9000
    for (const [w, h] of SIZES) {
      for (const density of DENSITIES) {
        for (const policy of POLICIES) {
          const mask = randomMask(seed++, w, h, density)
          const paths = decomposeMask(mask, policy, 1)
          const work = new Uint8Array(mask.data)
          let scan = 0
          for (const p of paths) {
            while (scan < work.length && work[scan] !== 1) scan++
            if (scan !== p.interiorY * w + p.interiorX) {
              bad.push(
                `${w}x${h} d${density} ${policy}: seed ${scan} ≠ ${p.interiorY * w + p.interiorX}`,
              )
              break
            }
            refToggle(work, p.points, w)
          }
          if (work.some((v) => v !== 0)) bad.push(`${w}x${h} d${density} ${policy}: residue`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('fills a ring exactly where the point-in-ring test says inside', () => {
    const bad: string[] = []
    let seed = 3000
    for (const [w, h] of SIZES) {
      for (const density of DENSITIES) {
        const mask = randomMask(seed++, w, h, density)
        for (const p of decomposeMask(mask, 'minority', 1)) {
          const fill = new Uint8Array(w * h)
          refToggle(fill, p.points, w)
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              if ((fill[y * w + x] === 1) !== refContains(p.points, x + 0.5, y + 0.5)) {
                bad.push(`${w}x${h} d${density}: ${x},${y}`)
              }
            }
          }
        }
      }
    }
    expect(bad).toEqual([])
  })
})
