import { describe, expect, it } from 'vitest'
import type { LabelMap } from '@trazor/core'
import { planOnBase, stackPlan, stackedEdge } from '../src/native'

/**
 * A poster in labels: a backdrop (A) with stars (E), and letter fills (B) inside
 * cream rings (C), web lines (D) drawn across the fills. The webs give the fills
 * a perimeter just over the backdrop's, so the perimeter vote alone would pin
 * the fills to the bottom — and every layer above would then carry them as holes.
 */
function poster(): { labels: LabelMap; counts: Uint32Array } {
  const W = 140
  const H = 100
  const [A, B, C, D, E] = [0, 1, 2, 3, 4]
  const data = new Int32Array(W * H).fill(A)
  const blobs: [number, number][] = [
    [35, 30],
    [100, 30],
    [35, 72],
    [100, 72],
  ]
  const R = 18
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (const [cx, cy] of blobs) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
        if (d < R + 3) data[y * W + x] = C
        if (d < R) {
          const web = (x - cx + 64) % 7 === 0 || (y - cy + 64) % 7 === 0
          data[y * W + x] = web && d < R - 2 ? D : B
        }
      }
    }
  }
  for (let sy = 4; sy < H - 4; sy += 9) {
    for (let sx = 4; sx < W - 4; sx += 9) {
      let free = true
      for (let y = sy; y < sy + 3; y++)
        for (let x = sx; x < sx + 3; x++) free &&= data[y * W + x] === A
      const near = blobs.some(([cx, cy]) => Math.hypot(sx + 1.5 - cx, sy + 1.5 - cy) < R + 6)
      if (free && !near)
        for (let y = sy; y < sy + 3; y++) for (let x = sx; x < sx + 3; x++) data[y * W + x] = E
    }
  }
  const counts = new Uint32Array(5)
  for (const l of data) counts[l]++
  return { labels: { width: W, height: H, data, count: 5 }, counts }
}

/** Cell sides facing another label or the image exterior, per label. */
function perimeters(labels: LabelMap): number[] {
  const { width: W, height: H, data } = labels
  const p = new Array(labels.count).fill(0)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const l = data[i]
      if (x + 1 >= W || data[i + 1] !== l) p[l]++
      if (x - 1 < 0 || data[i - 1] !== l) p[l]++
      if (y + 1 >= H || data[i + W] !== l) p[l]++
      if (y - 1 < 0 || data[i - W] !== l) p[l]++
    }
  }
  return p
}

describe('stacked base', () => {
  it('builds a contested base on the stack that traces the least edge', () => {
    const { labels, counts } = poster()
    const perim = perimeters(labels)
    // The fills lead the perimeter vote with the backdrop within a tenth of
    // them: a contest the vote alone cannot settle.
    expect(perim[1]).toBe(Math.max(...perim))
    expect(perim[0]).toBeGreaterThan(0.85 * perim[1])
    const chosen = stackedEdge(stackPlan(labels, counts), labels.width)
    for (const base of [0, 1]) {
      expect(chosen).toBeLessThanOrEqual(
        stackedEdge(planOnBase(labels, counts, base), labels.width),
      )
    }
  })

  it('keeps the perimeter vote when nothing contests it', () => {
    const { labels } = poster()
    // Without its web lines a fill no longer contests the backdrop.
    const data = labels.data.map((l) => (l === 3 ? 1 : l))
    const flat = { ...labels, data }
    const counts = new Uint32Array(5)
    for (const l of data) counts[l]++
    const perim = perimeters(flat)
    expect(perim[0]).toBe(Math.max(...perim))
    expect(perim[1]).toBeLessThan(0.8 * perim[0])
    expect(stackPlan(flat, counts).order[0]).toBe(0)
  })

  it('traces a layer once per side of its cut', () => {
    // Two labels side by side, the right one on top: the base is the full
    // frame (2·(4 + 6) sides) and the top layer its own 2×4 block.
    const data = new Int32Array([
      0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1,
    ])
    const labels: LabelMap = { width: 6, height: 4, data, count: 2 }
    const plan = planOnBase(labels, Uint32Array.from([16, 8]), 0)
    expect(plan.order).toEqual([0, 1])
    expect(stackedEdge(plan, 6)).toBe(20 + 12)
  })
})
