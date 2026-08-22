/**
 * Label-map region cleanup. Connected components are found with explicit
 * stack-based flood fill (no recursion — images can be 4096×4096).
 */
import { createMask } from '@vectorizer/core'
import type { BinaryMask, LabelMap } from '@vectorizer/core'

/**
 * Absorb 4-connected components smaller than `minArea` into their most
 * frequent 4-neighbor label (excluding -1 and the component's own label).
 * Ties resolve to the smallest label id. Repeats until stable, at most 8
 * rounds. -1 pixels stay -1. Mutates and returns `labels`.
 */
export function mergeSmallRegions(labels: LabelMap, minArea: number): LabelMap {
  if (minArea <= 1) return labels
  const { width: w, height: h, data } = labels
  const n = w * h
  const comp = new Int32Array(n)
  const stack = new Int32Array(n)
  // Pixels in flood order; component `id` owns order[compStart[id] .. +compSize[id]).
  const order = new Int32Array(n)
  const neighborCount = new Map<number, number>()

  for (let round = 0; round < 8; round++) {
    comp.fill(-1)
    const compStart: number[] = []
    const compSize: number[] = []
    let pos = 0
    for (let i = 0; i < n; i++) {
      if (comp[i] !== -1 || data[i] === -1) continue
      const id = compStart.length
      const lab = data[i]
      compStart.push(pos)
      let sp = 0
      stack[sp++] = i
      comp[i] = id
      while (sp > 0) {
        const p = stack[--sp]
        order[pos++] = p
        const x = p - ((p / w) | 0) * w
        if (x > 0 && comp[p - 1] === -1 && data[p - 1] === lab) {
          comp[p - 1] = id
          stack[sp++] = p - 1
        }
        if (x < w - 1 && comp[p + 1] === -1 && data[p + 1] === lab) {
          comp[p + 1] = id
          stack[sp++] = p + 1
        }
        if (p >= w && comp[p - w] === -1 && data[p - w] === lab) {
          comp[p - w] = id
          stack[sp++] = p - w
        }
        if (p < n - w && comp[p + w] === -1 && data[p + w] === lab) {
          comp[p + w] = id
          stack[sp++] = p + w
        }
      }
      compSize.push(pos - compStart[id])
    }

    let merged = false
    for (let id = 0; id < compStart.length; id++) {
      const size = compSize[id]
      if (size >= minArea) continue
      const start = compStart[id]
      const lab = data[order[start]]
      neighborCount.clear()
      for (let s = start; s < start + size; s++) {
        const p = order[s]
        const x = p - ((p / w) | 0) * w
        if (x > 0 && comp[p - 1] !== id && data[p - 1] !== -1 && data[p - 1] !== lab) {
          neighborCount.set(data[p - 1], (neighborCount.get(data[p - 1]) ?? 0) + 1)
        }
        if (x < w - 1 && comp[p + 1] !== id && data[p + 1] !== -1 && data[p + 1] !== lab) {
          neighborCount.set(data[p + 1], (neighborCount.get(data[p + 1]) ?? 0) + 1)
        }
        if (p >= w && comp[p - w] !== id && data[p - w] !== -1 && data[p - w] !== lab) {
          neighborCount.set(data[p - w], (neighborCount.get(data[p - w]) ?? 0) + 1)
        }
        if (p < n - w && comp[p + w] !== id && data[p + w] !== -1 && data[p + w] !== lab) {
          neighborCount.set(data[p + w], (neighborCount.get(data[p + w]) ?? 0) + 1)
        }
      }
      let bestLab = -1
      let bestCnt = 0
      for (const [lb, c] of neighborCount) {
        if (c > bestCnt || (c === bestCnt && lb < bestLab)) {
          bestCnt = c
          bestLab = lb
        }
      }
      if (bestLab !== -1) {
        for (let s = start; s < start + size; s++) data[order[s]] = bestLab
        merged = true
      }
    }
    if (!merged) break
  }
  return labels
}

/** 1 where `labels.data[i] === label`, else 0. */
export function extractLabelMask(labels: LabelMap, label: number): BinaryMask {
  const { width, height, data } = labels
  const mask = createMask(width, height)
  const out = mask.data
  for (let i = 0; i < data.length; i++) {
    if (data[i] === label) out[i] = 1
  }
  return mask
}

/** Number of foreground pixels. */
export function maskArea(mask: BinaryMask): number {
  const { data } = mask
  let area = 0
  for (let i = 0; i < data.length; i++) {
    if (data[i] !== 0) area++
  }
  return area
}
