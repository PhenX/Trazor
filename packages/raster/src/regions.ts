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
 *
 * The first round labels the whole map; a later round only revisits the
 * components an absorption can have changed — one holding a rewritten pixel or
 * touching one, plus the neighbors of a component absorbed earlier in the same
 * round, discovered as that happens. Every other component keeps its pixels,
 * its size and its neighbor labels, so it decides exactly as it did in the
 * round before and cannot merge. Components are absorbed in ascending
 * lowest-pixel-index order — the order a full relabeling reaches them in.
 */
export function mergeSmallRegions(
  labels: LabelMap,
  minArea: number,
  opts?: MergeOptions,
): LabelMap {
  if (minArea <= 1) return labels
  const keepSq = opts?.keepContrast ? opts.keepContrast * opts.keepContrast : 0
  const prot = opts?.protect?.data ?? null
  const oklab = opts?.oklab
  const { width: w, height: h, data } = labels
  const n = w * h
  if (n === 0) return labels

  // Neighbor census indexed by label; `censusSeen` lists the labels one
  // component touched, so the counters clear in O(labels touched).
  let span = labels.count
  for (let i = 0; i < n; i++) {
    if (data[i] >= span) span = data[i] + 1
  }
  const census = new Int32Array(span)
  const censusSeen = new Int32Array(span)

  // Per pixel: 0 = not reached this round, 1 = flooded into a component,
  // 2 = flooded into a component already known to reach `minArea`.
  const mark = new Uint8Array(n)
  const stack = new Int32Array(n)
  // Pixels of the components in play; component `c` owns
  // `order[compStart[c] .. +compSize[c])`.
  const order = new Int32Array(n)
  let compStart = new Int32Array(64)
  let compSize = new Int32Array(64)
  let compMin = new Int32Array(64)
  // Min-heap of component ids keyed by `compMin`: an incremental round absorbs
  // in lowest-pixel-index order while still discovering components as it goes.
  let heap = new Int32Array(64)
  let comps = 0
  let heapLen = 0
  let pos = 0

  /**
   * Flood the component holding `seed` into `order` and record it, returning
   * its id — or -1 when it reaches `minArea` and so can never be absorbed.
   * `capped` stops the flood as soon as that is known and marks what it reached
   * with 2, so the rest of the round dismisses the component in O(1).
   */
  const collect = (seed: number, capped: boolean): number => {
    const lab = data[seed]
    const start = pos
    let end = start
    let min = seed
    let sp = 0
    let big = false
    stack[sp++] = seed
    mark[seed] = 1
    while (sp > 0) {
      const p = stack[--sp]
      order[end++] = p
      if (p < min) min = p
      if (capped && end - start >= minArea) {
        big = true
        break
      }
      const x = p - ((p / w) | 0) * w
      if (x > 0) {
        const m = mark[p - 1]
        if (m !== 1 && data[p - 1] === lab) {
          if (m === 2) {
            big = true
            break
          }
          mark[p - 1] = 1
          stack[sp++] = p - 1
        }
      }
      if (x < w - 1) {
        const m = mark[p + 1]
        if (m !== 1 && data[p + 1] === lab) {
          if (m === 2) {
            big = true
            break
          }
          mark[p + 1] = 1
          stack[sp++] = p + 1
        }
      }
      if (p >= w) {
        const m = mark[p - w]
        if (m !== 1 && data[p - w] === lab) {
          if (m === 2) {
            big = true
            break
          }
          mark[p - w] = 1
          stack[sp++] = p - w
        }
      }
      if (p < n - w) {
        const m = mark[p + w]
        if (m !== 1 && data[p + w] === lab) {
          if (m === 2) {
            big = true
            break
          }
          mark[p + w] = 1
          stack[sp++] = p + w
        }
      }
    }
    if (big) {
      for (let s = start; s < end; s++) mark[order[s]] = 2
      for (let k = 0; k < sp; k++) mark[stack[k]] = 2
      return -1
    }
    const size = end - start
    if (size >= minArea) return -1
    pos = end
    if (comps === compStart.length) {
      compStart = grownInt32(compStart)
      compSize = grownInt32(compSize)
      compMin = grownInt32(compMin)
    }
    compStart[comps] = start
    compSize[comps] = size
    compMin[comps] = min
    return comps++
  }

  const heapPush = (c: number): void => {
    if (c < 0) return
    if (heapLen === heap.length) heap = grownInt32(heap)
    const key = compMin[c]
    let i = heapLen++
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (compMin[heap[parent]] <= key) break
      heap[i] = heap[parent]
      i = parent
    }
    heap[i] = c
  }

  /** The queued component with the lowest `compMin`, or -1 when none is left. */
  const heapPop = (): number => {
    if (heapLen === 0) return -1
    const top = heap[0]
    const last = heap[--heapLen]
    if (heapLen > 0) {
      const key = compMin[last]
      let i = 0
      for (;;) {
        let child = 2 * i + 1
        if (child >= heapLen) break
        if (child + 1 < heapLen && compMin[heap[child + 1]] < compMin[heap[child]]) child++
        if (compMin[heap[child]] >= key) break
        heap[i] = heap[child]
        i = child
      }
      heap[i] = last
    }
    return top
  }

  /**
   * Census component `c`'s differing 4-neighbor labels and absorb it into the
   * most frequent one (ties to the smallest label id). Returns true when its
   * pixels were rewritten.
   */
  const absorb = (c: number): boolean => {
    const start = compStart[c]
    const end = start + compSize[c]
    const lab = data[order[start]]
    let guarded = false
    let seen = 0
    for (let s = start; s < end; s++) {
      const p = order[s]
      if (prot !== null && prot[p] !== 0) guarded = true
      const x = p - ((p / w) | 0) * w
      if (x > 0) {
        const v = data[p - 1]
        if (v !== -1 && v !== lab && census[v]++ === 0) censusSeen[seen++] = v
      }
      if (x < w - 1) {
        const v = data[p + 1]
        if (v !== -1 && v !== lab && census[v]++ === 0) censusSeen[seen++] = v
      }
      if (p >= w) {
        const v = data[p - w]
        if (v !== -1 && v !== lab && census[v]++ === 0) censusSeen[seen++] = v
      }
      if (p < n - w) {
        const v = data[p + w]
        if (v !== -1 && v !== lab && census[v]++ === 0) censusSeen[seen++] = v
      }
    }
    let bestLab = -1
    let bestCnt = 0
    for (let t = 0; t < seen; t++) {
      const lb = censusSeen[t]
      const cnt = census[lb]
      census[lb] = 0
      if (cnt > bestCnt || (cnt === bestCnt && lb < bestLab)) {
        bestCnt = cnt
        bestLab = lb
      }
    }
    if (guarded) return false // a protected edge pixel — keep this small region
    if (bestLab === -1) return false
    if (oklab && contrastExceeds(oklab, lab, bestLab, keepSq)) return false // keep the detail
    for (let s = start; s < end; s++) data[order[s]] = bestLab
    return true
  }

  /** Bring the component holding `q` into the round when its turn is still ahead. */
  const discover = (q: number, after: number): void => {
    if (mark[q] !== 0 || data[q] === -1) return
    const c = collect(q, true)
    if (c >= 0 && compMin[c] > after) heapPush(c)
  }

  // Pixels a round rewrote; they seed the next one. Past `dirtyCap` flooding
  // the whole map again is the cheaper way to find the components in play, so
  // recording stops and the next round is a full one.
  const dirtyCap = Math.max(4096, n >> 3)
  let dirty = new Int32Array(Math.min(1024, dirtyCap))
  let dirtyLen = 0
  let nextFull = true

  const record = (c: number): void => {
    if (nextFull) return
    const start = compStart[c]
    const size = compSize[c]
    if (dirtyLen + size > dirtyCap) {
      nextFull = true
      return
    }
    while (dirtyLen + size > dirty.length) dirty = grownInt32(dirty)
    for (let s = start; s < start + size; s++) dirty[dirtyLen++] = order[s]
  }

  for (let round = 0; round < 8; round++) {
    mark.fill(0)
    comps = 0
    heapLen = 0
    pos = 0
    const incremental = !nextFull
    if (incremental) {
      // A component can only decide differently from the round before when one
      // of its own pixels, or one of their 4-neighbors, was rewritten.
      for (let k = 0; k < dirtyLen; k++) {
        const p = dirty[k]
        const x = p - ((p / w) | 0) * w
        if (mark[p] === 0 && data[p] !== -1) heapPush(collect(p, true))
        if (x > 0 && mark[p - 1] === 0 && data[p - 1] !== -1) heapPush(collect(p - 1, true))
        if (x < w - 1 && mark[p + 1] === 0 && data[p + 1] !== -1) heapPush(collect(p + 1, true))
        if (p >= w && mark[p - w] === 0 && data[p - w] !== -1) heapPush(collect(p - w, true))
        if (p < n - w && mark[p + w] === 0 && data[p + w] !== -1) heapPush(collect(p + w, true))
      }
    } else {
      for (let i = 0; i < n; i++) {
        if (mark[i] === 0 && data[i] !== -1) collect(i, false)
      }
    }
    dirtyLen = 0
    nextFull = false

    let merged = false
    if (incremental) {
      for (let c = heapPop(); c >= 0; c = heapPop()) {
        if (!absorb(c)) continue
        merged = true
        record(c)
        // The rewritten pixels are new neighbor labels for whatever borders
        // them, so those components join this round — unless their turn passed.
        const after = compMin[c]
        const start = compStart[c]
        const end = start + compSize[c]
        for (let s = start; s < end; s++) {
          const p = order[s]
          const x = p - ((p / w) | 0) * w
          if (x > 0) discover(p - 1, after)
          if (x < w - 1) discover(p + 1, after)
          if (p >= w) discover(p - w, after)
          if (p < n - w) discover(p + w, after)
        }
      }
    } else {
      for (let c = 0; c < comps; c++) {
        if (absorb(c)) {
          merged = true
          record(c)
        }
      }
    }
    if (!merged) break
  }
  return labels
}

/** A copy of `a` with twice the capacity. */
function grownInt32(a: Int32Array): Int32Array<ArrayBuffer> {
  const b = new Int32Array(a.length * 2)
  b.set(a)
  return b
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
 * Spatially-coherent label relaxation (an ICM pass over a Potts MRF; Besag 1986).
 *
 * Global color quantization assigns each pixel to the nearest palette color with
 * no regard for its neighbors, so an anti-aliased/JPEG rim — a genuine mixture —
 * can land on a *third* color and draw a wrong-colored band. This re-assigns each
 * pixel to the label minimizing `colorCost + lambda * (8-neighbors that disagree)`,
 * where `colorCost` is the squared Oklab distance from the pixel to the palette
 * color. Candidates are the pixel's own label plus its neighbors' labels, so the
 * palette is untouched and a coherent region stays put, while a rim sliver joins
 * whichever real region dominates around it — cutting invented seam hues.
 *
 * `imageOklab` is the working image in Oklab (length `n*3`); `paletteOklab` the
 * palette in Oklab (length `count*3`). Updates are simultaneous within a round
 * (read a snapshot), so the result is order-independent and deterministic; ties
 * keep the current label. `protect` pixels and -1 are never moved; `rounds<=0` or
 * `lambda<=0` is a no-op. Mutates and returns `labels`.
 */
export function smoothLabelsSpatial(
  labels: LabelMap,
  imageOklab: Float32Array,
  paletteOklab: Float32Array,
  lambda: number,
  rounds: number,
  protect?: BinaryMask,
): LabelMap {
  const { width: w, height: h, data } = labels
  const n = w * h
  if (rounds <= 0 || lambda <= 0 || n === 0) return labels
  const prot = protect?.data ?? null
  const nb = new Int32Array(8) // labeled neighbors
  const cand = new Int32Array(9) // candidate labels (self + distinct neighbors)
  let src = data.slice()
  for (let round = 0; round < rounds; round++) {
    let changed = false
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x
        const cur = src[p]
        if (cur === -1 || (prot !== null && prot[p] !== 0)) continue
        // Gather labeled neighbors and the distinct candidate labels (self first).
        let k8 = 0
        let nc = 1
        cand[0] = cur
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy
          if (yy < 0 || yy >= h) continue
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const xx = x + dx
            if (xx < 0 || xx >= w) continue
            const v = src[yy * w + xx]
            if (v === -1) continue
            nb[k8++] = v
            let seen = false
            for (let c = 0; c < nc; c++)
              if (cand[c] === v) {
                seen = true
                break
              }
            if (!seen) cand[nc++] = v
          }
        }
        const io = p * 3
        const L = imageOklab[io]
        const A = imageOklab[io + 1]
        const B = imageOklab[io + 2]
        let bestLab = cur
        let bestCost = Infinity
        for (let c = 0; c < nc; c++) {
          const k = cand[c]
          const ko = k * 3
          const dL = L - paletteOklab[ko]
          const dA = A - paletteOklab[ko + 1]
          const dB = B - paletteOklab[ko + 2]
          let agree = 0
          for (let j = 0; j < k8; j++) if (nb[j] === k) agree++
          const cost = dL * dL + dA * dA + dB * dB + lambda * (k8 - agree)
          if (cost < bestCost) {
            bestCost = cost
            bestLab = k
          }
        }
        if (bestLab !== cur) {
          data[p] = bestLab
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

export interface EnclosedComponent {
  /** The component's own label. */
  label: number
  /** The single label that fully surrounds it. */
  surround: number
  /** Pixel indices (row-major) belonging to the component. */
  pixels: Int32Array
}

/**
 * 4-connected components fully enclosed by a single other label: every neighbor
 * outside the component carries that one label, and the component touches
 * neither the image border nor an unlabeled (-1) pixel. These are "islands" — a
 * pupil inside an eye, a dot inside a field. A connective outline network is not
 * enclosed (it borders many labels, and usually the exterior), so it is never
 * returned. Components come back in row-major discovery order (deterministic).
 */
export function findEnclosedComponents(labels: LabelMap): EnclosedComponent[] {
  const { width: w, height: h, data } = labels
  const n = w * h
  const visited = new Uint8Array(n)
  const stack = new Int32Array(n)
  const scratch = new Int32Array(n)
  const out: EnclosedComponent[] = []
  for (let seed = 0; seed < n; seed++) {
    if (visited[seed] === 1 || data[seed] < 0) continue
    const lab = data[seed]
    let sp = 0
    let cp = 0
    stack[sp++] = seed
    visited[seed] = 1
    let enclosed = true
    let surround = -2 // -2 = no differing neighbor label seen yet
    while (sp > 0) {
      const p = stack[--sp]
      scratch[cp++] = p
      const x = p - ((p / w) | 0) * w
      // Each of the 4 sides: same label ⇒ grow the component; otherwise it is an
      // outside face — the image border, the exterior (-1), or a neighbor label.
      // A border/exterior face, or a second distinct neighbor label, breaks
      // enclosure; the flood still finishes so the component is fully marked.
      if (x === 0) enclosed = false
      else {
        const q = p - 1
        if (data[q] === lab) {
          if (visited[q] === 0) {
            visited[q] = 1
            stack[sp++] = q
          }
        } else if (data[q] < 0) enclosed = false
        else if (surround === -2) surround = data[q]
        else if (surround !== data[q]) enclosed = false
      }
      if (x === w - 1) enclosed = false
      else {
        const q = p + 1
        if (data[q] === lab) {
          if (visited[q] === 0) {
            visited[q] = 1
            stack[sp++] = q
          }
        } else if (data[q] < 0) enclosed = false
        else if (surround === -2) surround = data[q]
        else if (surround !== data[q]) enclosed = false
      }
      if (p < w) enclosed = false
      else {
        const q = p - w
        if (data[q] === lab) {
          if (visited[q] === 0) {
            visited[q] = 1
            stack[sp++] = q
          }
        } else if (data[q] < 0) enclosed = false
        else if (surround === -2) surround = data[q]
        else if (surround !== data[q]) enclosed = false
      }
      if (p >= n - w) enclosed = false
      else {
        const q = p + w
        if (data[q] === lab) {
          if (visited[q] === 0) {
            visited[q] = 1
            stack[sp++] = q
          }
        } else if (data[q] < 0) enclosed = false
        else if (surround === -2) surround = data[q]
        else if (surround !== data[q]) enclosed = false
      }
    }
    if (enclosed && surround >= 0) {
      out.push({ label: lab, surround, pixels: scratch.slice(0, cp) })
    }
  }
  return out
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
