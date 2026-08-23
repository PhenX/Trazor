/**
 * Label-map region cleanup. Connected components are found with explicit
 * stack-based flood fill (no recursion — images can be 4096×4096).
 */
import { createMask, deltaEOkSq } from '@trazor/core'
import type { BinaryMask, LabelMap } from '@trazor/core'

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

/**
 * Dissolve thin, mislabeled boundary bands into the region they sit between.
 *
 * At an edge between two colors, anti-aliased / JPEG-ringing rim pixels are
 * intermediate mixtures that quantization can label as a *third* color, leaving
 * a hairline strip of the wrong color along the seam. Each such pixel is a local
 * sliver: its own label appears in at most a couple of its 8 neighbors while one
 * neighbor label dominates. Reassign those slivers to the dominant neighbor, so
 * the strip splits between the two real regions instead of drawing a band.
 *
 * Updates are simultaneous within a round (read a snapshot, write the result),
 * so the outcome is order-independent and deterministic; ties resolve to the
 * smallest label id. `rounds` erodes bands a pixel at a time (≤0 is a no-op).
 * `protect` pixels (a discretized edge hint) and -1 are never reassigned.
 * Mutates and returns `labels`.
 */
export function dissolveThinBands(
  labels: LabelMap,
  rounds: number,
  protect?: BinaryMask,
): LabelMap {
  const { width: w, height: h, data } = labels
  const n = w * h
  if (rounds <= 0 || n === 0) return labels
  const prot = protect?.data ?? null
  // Own label in at most SELF_MAX of 8 neighbors ⇒ a 1px-wide sliver (a 2×2 or
  // thicker region has ≥3 same-label neighbors and is left alone); a competing
  // label needs at least TOP_MIN neighbors to claim it.
  const SELF_MAX = 2
  const TOP_MIN = 3
  const nb = new Int32Array(8)
  let src = data.slice()
  for (let round = 0; round < rounds; round++) {
    let changed = false
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        const lab = src[i]
        if (lab === -1 || (prot !== null && prot[i] !== 0)) continue
        let k = 0
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy
          if (yy < 0 || yy >= h) continue
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const xx = x + dx
            if (xx < 0 || xx >= w) continue
            const v = src[yy * w + xx]
            if (v !== -1) nb[k++] = v
          }
        }
        let self = 0
        let topLab = -1
        let topCnt = 0
        for (let a = 0; a < k; a++) {
          const la = nb[a]
          if (la === lab) {
            self++
            continue
          }
          let c = 0
          for (let b = 0; b < k; b++) if (nb[b] === la) c++
          if (c > topCnt || (c === topCnt && (topLab === -1 || la < topLab))) {
            topCnt = c
            topLab = la
          }
        }
        if (self <= SELF_MAX && topCnt >= TOP_MIN && topLab !== -1) {
          data[i] = topLab
          changed = true
        }
      }
    }
    if (!changed) break
    if (round + 1 < rounds) src = data.slice()
  }
  return labels
}

/**
 * Remove only the components of `label` that are connected (4-connected) to the
 * image border, setting them to -1; interior regions of the same color survive.
 * Used for `omitBackground`, where the goal is to drop the surrounding
 * background — not identically-colored shapes enclosed by other regions (e.g.
 * white lettering inside a colored banner on a white page). Mutates `labels`
 * and returns the number of pixels cleared.
 */
export function clearBorderLabel(labels: LabelMap, label: number): number {
  if (label < 0) return 0
  const { width: w, height: h, data } = labels
  const n = w * h
  const stack = new Int32Array(n)
  let sp = 0
  const push = (i: number): void => {
    if (data[i] === label) {
      data[i] = -1
      stack[sp++] = i
    }
  }
  // Seed from every border pixel that carries the label.
  for (let x = 0; x < w; x++) {
    push(x)
    push((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    push(y * w)
    push(y * w + (w - 1))
  }
  let cleared = 0
  while (sp > 0) {
    const p = stack[--sp]
    cleared++
    const x = p - ((p / w) | 0) * w
    if (x > 0) push(p - 1)
    if (x < w - 1) push(p + 1)
    if (p >= w) push(p - w)
    if (p < n - w) push(p + w)
  }
  return cleared
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
