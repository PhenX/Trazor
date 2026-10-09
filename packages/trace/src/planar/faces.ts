/**
 * Faces of a label map: every 4-connected component of one label is one face, transparency
 * (label `CLEAR`, -1) included. Two pixels of one label that touch only at a corner are two
 * faces unless a 4-path joins them; the planar map then gives the corner its junction (or,
 * where one diagonal is a single face, a copy per side; see `map.ts`).
 *
 * Two-pass connected-component labeling with a union-find over provisional labels
 * (Wu, Otoo & Suzuki 2009), applied to row runs rather than pixels. The first pass cuts each
 * row into maximal runs of one label, hands every run a provisional label in raster order and
 * unites it with the runs of the same label that overlap it in the row above (sharing a pixel
 * column, so a run that meets another only at a corner is not united with it). The union
 * keeps the smaller provisional label as the root, so every root is its component's first run
 * in raster order, and the second pass numbers the roots in increasing order: face ids follow
 * the raster order of each face's first pixel, as a flood fill seeded in raster order numbers
 * them.
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/regions/components.rs` (`Components::of`) and
 * `inkvec-trace/src/regions.rs` (`split_components`).
 */
import type { LabelMap } from '@trazor/core'
import type { Faces } from './types'

/** Root of `x`, halving the path on the way (every parent pointer points to a smaller index). */
function find(parent: Int32Array, x: number): number {
  while (parent[x] !== x) {
    const p = parent[x]
    parent[x] = parent[p]
    x = p
  }
  return x
}

/**
 * Split a label map into faces: one per 4-connected component of one label, numbered in raster
 * order of the component's first pixel. Transparent pixels (label `CLEAR`) form faces too.
 */
export function splitFaces(labels: LabelMap): Faces {
  const { width: w, height: h, data } = labels
  const n = w * h

  // Runs per row: one at each row start plus one at every label change.
  let runCount = 0
  if (w > 0) {
    for (let y = 0; y < h; y++) {
      const row = y * w
      runCount++
      for (let x = 1; x < w; x++) if (data[row + x] !== data[row + x - 1]) runCount++
    }
  }
  // Run `r` covers pixels `runStart[r] .. runStart[r + 1]` (`n` for the last run): rows are
  // contiguous in the pixel index, so a run ends where the next one starts.
  const runStart = new Int32Array(runCount)
  const parent = new Int32Array(runCount)

  // Pass 1: runs with provisional labels, united with the overlapping runs above.
  let r = 0
  let aboveFirst = 0
  let aboveEnd = 0
  for (let y = 0; y < h; y++) {
    const row = y * w
    const up = row - w
    const first = r
    let j = aboveFirst
    let x = 0
    while (x < w) {
      const l = data[row + x]
      const s = x
      x++
      while (x < w && data[row + x] === l) x++
      runStart[r] = row + s
      parent[r] = r
      // Above runs ending at or before column `s` cannot overlap this run or any later one.
      while (j < aboveEnd && runStart[j + 1] - up <= s) j++
      for (let k = j; k < aboveEnd && runStart[k] - up < x; k++) {
        if (data[runStart[k]] !== l) continue
        const a = find(parent, r)
        const b = find(parent, k)
        if (a < b) parent[b] = a
        else if (b < a) parent[a] = b
      }
      r++
    }
    aboveFirst = first
    aboveEnd = r
  }

  // Pass 2: roots in increasing order are the components in raster order. A non-root points
  // to a smaller index of its component, already resolved to the component's final id.
  let count = 0
  for (let p = 0; p < runCount; p++) parent[p] = parent[p] === p ? count++ : parent[parent[p]]

  const ids = new Int32Array(n)
  const label = new Int32Array(count)
  const area = new Uint32Array(count)
  for (let k = 0; k < runCount; k++) {
    const id = parent[k]
    const s = runStart[k]
    const e = k + 1 < runCount ? runStart[k + 1] : n
    ids.fill(id, s, e)
    area[id] += e - s
    label[id] = data[s]
  }
  return { width: w, height: h, ids, count, label, area }
}
