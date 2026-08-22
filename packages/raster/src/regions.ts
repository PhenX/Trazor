/**
 * Label-map region cleanup. Connected components are found with explicit
 * stack-based flood fill (no recursion — images can be 4096×4096).
 */
import { createMask, deltaEOkSq } from '@vectorizer/core'
import type { BinaryMask, LabelMap } from '@vectorizer/core'

export interface MergeOptions {
  /** Palette colors in Oklab, length `labels.count * 3`, indexed by label. Enables the contrast keep. */
  oklab?: Float32Array
  /**
   * Keep a small region instead of absorbing it when its Oklab ΔE to the
   * would-be target label is at least this (a high-contrast detail, e.g. a
   * logo dot). Low-contrast specks still merge away. Requires `oklab`.
   */
  keepContrast?: number
  /**
   * 1 = keep this pixel's small region even below `minArea` — a discretized edge
   * hint (from EdgeEnhancer), so features on a predicted boundary survive.
   */
  protect?: BinaryMask
}

/**
 * Absorb 4-connected components smaller than `minArea` into their most
 * frequent 4-neighbor label (excluding -1 and the component's own label).
 * Ties resolve to the smallest label id. Repeats until stable, at most 8
 * rounds. -1 pixels stay -1. Mutates and returns `labels`.
 *
 * With `opts`, a small component is kept (not merged) when its color differs
 * from the target label's by at least `keepContrast` in Oklab, or when any of
 * its pixels lies on the `protect` mask (a discretized edge hint), preserving
 * small high-contrast features while still clearing low-contrast noise.
 */
export function mergeSmallRegions(
  labels: LabelMap,
  minArea: number,
  opts?: MergeOptions,
): LabelMap {
  if (minArea <= 1) return labels
  const keepSq = opts?.keepContrast ? opts.keepContrast * opts.keepContrast : 0
  const prot = opts?.protect?.data ?? null
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
      let guarded = false
      for (let s = start; s < start + size; s++) {
        const p = order[s]
        if (prot !== null && prot[p] !== 0) guarded = true
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
      if (guarded) continue // a protected edge pixel — keep this small region
      let bestLab = -1
      let bestCnt = 0
      for (const [lb, c] of neighborCount) {
        if (c > bestCnt || (c === bestCnt && lb < bestLab)) {
          bestCnt = c
          bestLab = lb
        }
      }
      if (bestLab !== -1) {
        if (opts?.oklab && contrastExceeds(opts.oklab, lab, bestLab, keepSq)) continue // keep the detail
        for (let s = start; s < start + size; s++) data[order[s]] = bestLab
        merged = true
      }
    }
    if (!merged) break
  }
  return labels
}

/** True when two palette labels differ by at least `keepSq` (squared Oklab ΔE). */
function contrastExceeds(oklab: Float32Array, a: number, b: number, keepSq: number): boolean {
  const ai = a * 3
  const bi = b * 3
  return (
    deltaEOkSq(oklab[ai], oklab[ai + 1], oklab[ai + 2], oklab[bi], oklab[bi + 1], oklab[bi + 2]) >=
    keepSq
  )
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
