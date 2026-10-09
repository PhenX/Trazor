/**
 * 4-connected components of a label map, found by row runs and a union-find, with member
 * lists built only for the components a caller selects.
 *
 * Two-pass connected-component labeling with a union-find over provisional labels
 * (K. Wu, E. Otoo, K. Suzuki, "Optimizing Two-Pass Connected-Component Labeling
 * Algorithms", Pattern Analysis and Applications 12(2):117–135, 2009), applied to runs
 * rather than pixels: the first pass cuts each row into maximal runs of one label and
 * unites every run with the runs of the same label that share a column with it in the row
 * above; the second resolves the unions. The map is multi-label, so "same component" means
 * "same label and 4-connected". Provisional labels are handed out in raster order, a
 * component's first pixel always starts a run with a fresh label, and the union keeps the
 * smaller label as the root, so components are numbered in raster order of their first
 * pixel, as a flood fill seeded in raster order numbers them.
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/regions/components.rs` (`Components::of`,
 * `shape`, `members`, `Members`).
 */

/** The components of a `w × h` label map. */
export interface Components {
  /** Each pixel's component id, numbered in raster order of the component's first pixel. */
  readonly comp: Int32Array
  /** Each component's pixel count. */
  readonly size: Int32Array
  /** Number of components. */
  readonly count: number
  /** First pixel of every run, in raster order. */
  readonly runStart: Int32Array
  /** Length of every run. */
  readonly runLength: Int32Array
  /** Component of every run. */
  readonly runComp: Int32Array
}

/** Pixels of the selected components: component `c` holds `pixels[offset[c] .. offset[c + 1]]`. */
export interface Members {
  /** `count + 1` offsets into `pixels`; an unselected component spans nothing. */
  readonly offset: Int32Array
  /** Member pixels, component by component, each in raster order. */
  readonly pixels: Int32Array
}

/** Root of `x`, halving the path on the way (every parent points to a smaller index). */
function find(parent: Int32Array, x: number): number {
  while (parent[x] !== x) {
    const p = parent[x]
    parent[x] = parent[p]
    x = p
  }
  return x
}

/** The 4-connected components of the first `w·h` entries of `labels` (row-major). */
export function findComponents(labels: ArrayLike<number>, w: number, h: number): Components {
  const n = w * h
  // Runs per row: one at each row start plus one at every label change.
  let runCount = 0
  if (w > 0) {
    for (let y = 0; y < h; y++) {
      const row = y * w
      runCount++
      for (let x = 1; x < w; x++) if (labels[row + x] !== labels[row + x - 1]) runCount++
    }
  }
  const runStart = new Int32Array(runCount)
  const runLength = new Int32Array(runCount)
  const runComp = new Int32Array(runCount)
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
      const l = labels[row + x]
      const s = x
      while (x < w && labels[row + x] === l) x++
      parent[r] = r
      // Above runs ending at or before column `s` overlap neither this run nor a later one.
      while (j < aboveEnd && runStart[j] - up + runLength[j] <= s) j++
      for (let k = j; k < aboveEnd && runStart[k] - up < x; k++) {
        if (labels[runStart[k]] !== l) continue
        const a = find(parent, r)
        const b = find(parent, k)
        if (a < b) parent[b] = a
        else parent[a] = b
      }
      runStart[r] = row + s
      runLength[r] = x - s
      r++
    }
    aboveFirst = first
    aboveEnd = r
  }

  // Pass 2: roots in increasing order are the components in raster order. A non-root
  // points to a smaller index of its component, already resolved to its final id.
  let count = 0
  for (let p = 0; p < runCount; p++) runComp[p] = parent[p] === p ? count++ : runComp[parent[p]]

  const comp = new Int32Array(n)
  const size = new Int32Array(count)
  for (let k = 0; k < runCount; k++) {
    const id = runComp[k]
    comp.fill(id, runStart[k], runStart[k] + runLength[k])
    size[id] += runLength[k]
  }
  return { comp, size, count, runStart, runLength, runComp }
}

/**
 * Per component: how many of its pixels have all their in-image 4-neighbors in it
 * (`interior`; the image border does not make a pixel a boundary pixel), and how many
 * (pixel, neighbor) pairs cross into another component (`foreign`).
 */
export function componentShape(
  c: Components,
  w: number,
  h: number,
): { interior: Int32Array; foreign: Int32Array } {
  const interior = new Int32Array(c.count)
  const foreign = new Int32Array(c.count)
  const comp = c.comp
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const id = comp[i]
      let out = 0
      if (x > 0 && comp[i - 1] !== id) out++
      if (x + 1 < w && comp[i + 1] !== id) out++
      if (y > 0 && comp[i - w] !== id) out++
      if (y + 1 < h && comp[i + w] !== id) out++
      foreign[id] += out
      if (out === 0) interior[id]++
    }
  }
  return { interior, foreign }
}

/** The pixels of every component `keep` selects, each component's in raster order. */
export function componentMembers(c: Components, keep: (id: number) => boolean): Members {
  const offset = new Int32Array(c.count + 1)
  for (let id = 0; id < c.count; id++) offset[id + 1] = offset[id] + (keep(id) ? c.size[id] : 0)
  const fill = offset.slice(0, c.count)
  const pixels = new Int32Array(offset[c.count])
  for (let k = 0; k < c.runStart.length; k++) {
    const id = c.runComp[k]
    if (offset[id + 1] === offset[id]) continue
    const s = c.runStart[k]
    const len = c.runLength[k]
    const at = fill[id]
    for (let m = 0; m < len; m++) pixels[at + m] = s + m
    fill[id] = at + len
  }
  return { offset, pixels }
}
