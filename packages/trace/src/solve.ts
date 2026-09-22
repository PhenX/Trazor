import type { FlatPoints } from './paths'
import type { SignedField } from './refine'

/**
 * Boundary solve: move every free point of a chain at once so the geometry's
 * exact rendered coverage matches the image, rather than refining each point
 * along its own normal (inkvec stage 08 `optimise`,
 * `crates/inkvec-trace/src/boundary_opt.rs`; see docs/REFERENCES.md).
 *
 * A pixel's value is the area coverage of every region touching it, so a point's
 * neighbours change what that pixel should read, and a pixel says nothing about
 * motion along the boundary — a per-point normal search cannot see either. The
 * boundary is solved as one problem: the data term is the exact coverage the
 * geometry would paint (the pixel square clipped by the chain, closed along the
 * pixel border) compared against the observed coverage, plus a kink term on
 * second differences and an anchor to the refined positions. The gradient is
 * analytic — a shoelace over the clipped polygon, each vertex a chain point, a
 * gridline crossing that moves with its two neighbours, or a fixed pixel corner —
 * solved by Fletcher–Reeves conjugate gradient with a self-crossing guard.
 *
 * The solve is per chain with the {@link SolveOptions.free} points its only
 * unknowns; pinned endpoints (cutout junctions) keep the partition seam-free by
 * construction, and a closed ring runs cyclically with every point free, held in
 * place tangentially by the anchor. It is a pure function of the points, the
 * field and the options, so a helper-parallel run stays byte-identical.
 */
export interface SolveOptions {
  /** Iteration cap (deterministic; no wall-clock cutoff). inkvec ships 48. */
  maxIters: number
}

/** Largest per-point displacement accepted in one conjugate-gradient step (px). */
const MAX_STEP = 0.35
/** Total leash from a point's refined (anchor) position (px). */
const MAX_TOTAL = 1.0
/** Kink weight, as a fraction of the data term's initial value. */
const K_KINK = 0.05
/** Anchor weight, as a fraction of the data term's initial value, per point. */
const K_ANCHOR = 0.1
/** Floor inside the kink term's square root, for differentiability at zero curvature. */
const KINK_EPS = 1e-4
/** A pixel this saturated on both sides carries no anti-aliased evidence. */
const OBS_LO = 0.03
const OBS_HI = 0.97
/** Backtracking line-search factor and cap. */
const BACKTRACK = 0.4
const BACKTRACK_MAX = 6
/** Early stop once a step buys less than this relative improvement. */
const REL_STOP = 1e-4
/** How far the fold guard halves the accepted displacement before giving up. */
const FOLD_FLOOR = 0.1

/** One vertex of a clipped-pixel loop: how it depends on the chain unknowns. */
type Prov =
  | { readonly k: 0 } // fixed pixel corner
  | { readonly k: 1; readonly v: number } // chain point `v`
  | { readonly k: 2; readonly line: number; readonly a: number; readonly b: number } // vertical-gridline crossing of segment a→b
  | { readonly k: 3; readonly line: number; readonly a: number; readonly b: number } // horizontal-gridline crossing

const CORNER: Prov = { k: 0 }

/**
 * Solve a chain's free points against the coverage field. `pts` is the chain in
 * travel order (a closed ring passes its points once, WITHOUT the duplicated
 * closing point, and `cyclic` true); `free[i]` marks point `i` as an unknown
 * (pinned points — junctions, ring seams — stay put). Returns the moved points,
 * or the input unchanged when the solve gains nothing.
 */
export function solveBoundary(
  pts: FlatPoints,
  field: SignedField,
  free: readonly boolean[],
  cyclic: boolean,
  opts: SolveOptions,
): FlatPoints {
  const n = pts.length >> 1
  if (n < 3) return pts
  let anyFree = false
  for (let i = 0; i < n; i++) if (free[i]) anyFree = true
  if (!anyFree) return pts

  const w = field.width
  const h = field.height
  const anchor = Float64Array.from(pts)
  const pos = Float64Array.from(pts)

  // Observed coverage per ANTI-ALIASED pixel the chain crosses, read once at the
  // refined geometry. A fully covered or empty pixel carries no boundary-position
  // evidence — and a hard axis-aligned edge left on the lattice runs along such a
  // pixel's border, where the clip is degenerate — so only partial pixels drive
  // the solve, exactly the pixels stage 07 already treats as carrying sub-pixel
  // truth.
  const partial = new Map<number, number>()
  const cells = collectCells(pos, n, cyclic, w, h)
  for (const cell of cells.keys()) {
    const a = coverage(field, cell % w, (cell / w) | 0)
    if (a > OBS_LO && a < OBS_HI) partial.set(cell, a)
  }
  // A chain with too few anti-aliased pixels is a hard edge — nothing to solve.
  if (partial.size < 3) return pts

  // Orientation: the field is positive on one side, but the chain's travel sense
  // is not known here, so compare the initial clipped area against the field
  // coverage and its complement over the partial pixels; the smaller residual is
  // the side the field measures.
  const geom0 = cellAreas(pos, n, cyclic, w, h)
  let same = 0
  let flipped = 0
  for (const [cell, a] of partial) {
    const area = geom0.get(cell)
    if (area === undefined) continue
    same += (area - a) * (area - a)
    flipped += (area - (1 - a)) * (area - (1 - a))
  }
  const flip = flipped < same

  const obs = new Map<number, number>()
  for (const [cell, a] of partial) obs.set(cell, flip ? 1 - a : a)

  // Scale the priors to the initial data term so they mean the same on a flat
  // logo and a crowded emoji (inkvec `boundary_opt`).
  const data0 = dataTerm(pos, n, cyclic, w, h, obs, null)
  if (!(data0 > 0)) return pts
  const kink0 = kinkTerm(pos, n, cyclic, null, 1)
  const kinkW = kink0 > 1e-12 ? (K_KINK * data0) / kink0 : 0
  const anchorW = (K_ANCHOR * data0) / n

  const grad = new Float64Array(n * 2)
  const energy = (p: Float64Array, g: Float64Array | null): { data: number; total: number } => {
    if (g) g.fill(0)
    const data = dataTerm(p, n, cyclic, w, h, obs, g)
    const total = data + priorTerms(p, anchor, n, cyclic, free, g, kinkW, anchorW)
    return { data, total }
  }

  const crossBefore = selfCrossings(pos, n, cyclic)

  // Fletcher–Reeves nonlinear conjugate gradient.
  let cur = energy(pos, grad)
  let e0 = cur.total
  if (!(e0 > 0) || !Number.isFinite(e0)) return pts
  const dir = new Float64Array(n * 2)
  for (let i = 0; i < n * 2; i++) dir[i] = -grad[i]
  let gg = dot(grad, grad, free)
  if (gg < 1e-18) return pts

  const trial = new Float64Array(n * 2)
  const gNew = new Float64Array(n * 2)
  let energyNow = e0
  for (let iter = 0; iter < opts.maxIters; iter++) {
    // Scale the step so the largest per-point move is MAX_STEP.
    let maxMove = 0
    for (let i = 0; i < n; i++) {
      if (!free[i]) continue
      const dx = dir[i * 2]
      const dy = dir[i * 2 + 1]
      const m = Math.hypot(dx, dy)
      if (m > maxMove) maxMove = m
    }
    if (maxMove < 1e-12) break
    let step = MAX_STEP / maxMove

    let improved = false
    let next = cur
    for (let bt = 0; bt <= BACKTRACK_MAX; bt++) {
      for (let i = 0; i < n; i++) {
        if (!free[i]) {
          trial[i * 2] = pos[i * 2]
          trial[i * 2 + 1] = pos[i * 2 + 1]
          continue
        }
        let tx = pos[i * 2] + step * dir[i * 2]
        let ty = pos[i * 2 + 1] + step * dir[i * 2 + 1]
        // Leash to within MAX_TOTAL of where the measurement put the point.
        const dx = tx - anchor[i * 2]
        const dy = ty - anchor[i * 2 + 1]
        const d = Math.hypot(dx, dy)
        if (d > MAX_TOTAL) {
          tx = anchor[i * 2] + (dx / d) * MAX_TOTAL
          ty = anchor[i * 2 + 1] + (dy / d) * MAX_TOTAL
        }
        trial[i * 2] = tx
        trial[i * 2 + 1] = ty
      }
      next = energy(trial, gNew)
      if (next.total < energyNow) {
        improved = true
        break
      }
      step *= BACKTRACK
    }
    if (!improved) break
    const rel = (energyNow - next.total) / energyNow
    pos.set(trial)
    grad.set(gNew)
    energyNow = next.total
    cur = next
    if (rel < REL_STOP) break

    const ggNew = dot(grad, grad, free)
    const beta = gg > 1e-18 ? ggNew / gg : 0
    gg = ggNew
    let downhill = 0
    for (let i = 0; i < n * 2; i++) {
      dir[i] = -grad[i] + beta * dir[i]
      downhill += dir[i] * grad[i]
    }
    // Restart to steepest descent when the conjugate direction is not downhill.
    if (downhill > -1e-18) for (let i = 0; i < n * 2; i++) dir[i] = -grad[i]
  }

  if (!(energyNow < e0)) return pts

  // Fold guard: a solved displacement can make the boundary self-intersect. Scale
  // the whole displacement back toward the anchor until no NEW crossing remains.
  let scale = 1
  const out = new Float64Array(n * 2)
  for (;;) {
    for (let i = 0; i < n * 2; i++) out[i] = anchor[i] + scale * (pos[i] - anchor[i])
    if (selfCrossings(out, n, cyclic) <= crossBefore) break
    scale *= 0.5
    if (scale < FOLD_FLOOR) return pts
  }
  return Array.from(out)
}

/** Observed coverage in [0, 1] at integer pixel (x, y). */
function coverage(field: SignedField, x: number, y: number): number {
  const cx = x < 0 ? 0 : x >= field.width ? field.width - 1 : x
  const cy = y < 0 ? 0 : y >= field.height ? field.height - 1 : y
  const a = field.at(cx, cy) + 0.5
  return a < 0 ? 0 : a > 1 ? 1 : a
}

/** The set of pixels the chain passes through (keyed y*w + x). */
function collectCells(
  pos: Float64Array,
  n: number,
  cyclic: boolean,
  w: number,
  h: number,
): Map<number, true> {
  const cells = new Map<number, true>()
  forEachPiece(pos, n, cyclic, w, h, (cell) => cells.set(cell, true))
  return cells
}

/**
 * Data term Σ (area − obs)² over crossed pixels, and its gradient into `g` (when
 * given), by clipping each pixel by the chain and closing along the pixel border.
 */
function dataTerm(
  pos: Float64Array,
  n: number,
  cyclic: boolean,
  w: number,
  h: number,
  obs: Map<number, number>,
  g: Float64Array | null,
): number {
  const byCell = bucket(pos, n, cyclic, w, h)
  let total = 0
  for (const [cell, pieces] of byCell) {
    const target = obs.get(cell)
    if (target === undefined) continue
    const px = cell % w
    const py = (cell / w) | 0
    const loop = clipLoop(pieces, px, py)
    if (!loop) continue
    const area = loop.area
    const r = area - target
    total += r * r
    if (g && area > 1e-9 && area < 1 - 1e-9) {
      const dda = 2 * r
      const pts = loop.pts
      const provs = loop.provs
      const m = pts.length >> 1
      for (let i = 0; i < m; i++) {
        const pv = (i + m - 1) % m
        const nx = (i + 1) % m
        // Coverage is minus the shoelace, so the derivative is minus the usual.
        const gx = -0.5 * (pts[nx * 2 + 1] - pts[pv * 2 + 1]) * dda
        const gy = -0.5 * (pts[pv * 2] - pts[nx * 2]) * dda
        scatter(provs[i], gx, gy, pos, g)
      }
    }
  }
  return total
}

/** Clipped positive-side area per crossed pixel (no gradient). */
function cellAreas(
  pos: Float64Array,
  n: number,
  cyclic: boolean,
  w: number,
  h: number,
): Map<number, number> {
  const byCell = bucket(pos, n, cyclic, w, h)
  const out = new Map<number, number>()
  for (const [cell, pieces] of byCell) {
    const loop = clipLoop(pieces, cell % w, (cell / w) | 0)
    if (loop) out.set(cell, loop.area)
  }
  return out
}

interface Piece {
  fx: number
  fy: number
  fromProv: Prov
  tx: number
  ty: number
  toProv: Prov
}

/** Break every segment at gridline crossings and file each fragment by pixel. */
function bucket(
  pos: Float64Array,
  n: number,
  cyclic: boolean,
  w: number,
  h: number,
): Map<number, Piece[]> {
  const byCell = new Map<number, Piece[]>()
  forEachPiece(pos, n, cyclic, w, h, (cell, piece) => {
    let list = byCell.get(cell)
    if (!list) {
      list = []
      byCell.set(cell, list)
    }
    list.push(piece)
  })
  return byCell
}

/**
 * Walk each segment, split it at integer gridline crossings, and hand each
 * fragment (with the pixel it lies in) to `emit`. Fragments arrive in travel
 * order, so a pixel's list is contiguous unless the chain re-enters it.
 */
function forEachPiece(
  pos: Float64Array,
  n: number,
  cyclic: boolean,
  w: number,
  h: number,
  emit: (cell: number, piece: Piece) => void,
): void {
  const segs = cyclic ? n : n - 1
  for (let s = 0; s < segs; s++) {
    const a = s
    const b = (s + 1) % n
    const ax = pos[a * 2]
    const ay = pos[a * 2 + 1]
    const bx = pos[b * 2]
    const by = pos[b * 2 + 1]
    const dx = bx - ax
    const dy = by - ay
    // Crossing parameters with the interior integer gridlines.
    const ts: { t: number; prov: Prov }[] = []
    if (Math.abs(dx) > 1e-12) {
      const lo = Math.min(ax, bx)
      const hi = Math.max(ax, bx)
      for (let m = Math.floor(lo) + 1; m < hi; m++) {
        const t = (m - ax) / dx
        if (t > 1e-9 && t < 1 - 1e-9) ts.push({ t, prov: { k: 2, line: m, a, b } })
      }
    }
    if (Math.abs(dy) > 1e-12) {
      const lo = Math.min(ay, by)
      const hi = Math.max(ay, by)
      for (let m = Math.floor(lo) + 1; m < hi; m++) {
        const t = (m - ay) / dy
        if (t > 1e-9 && t < 1 - 1e-9) ts.push({ t, prov: { k: 3, line: m, a, b } })
      }
    }
    ts.sort((p, q) => p.t - q.t)

    let px = ax
    let py = ay
    let pprov: Prov = { k: 1, v: a }
    const pushPiece = (qx: number, qy: number, qprov: Prov): void => {
      const mx = (px + qx) / 2
      const my = (py + qy) / 2
      let cx = Math.floor(mx)
      let cy = Math.floor(my)
      cx = cx < 0 ? 0 : cx >= w ? w - 1 : cx
      cy = cy < 0 ? 0 : cy >= h ? h - 1 : cy
      emit(cy * w + cx, { fx: px, fy: py, fromProv: pprov, tx: qx, ty: qy, toProv: qprov })
      px = qx
      py = qy
      pprov = qprov
    }
    for (const c of ts) {
      pushPiece(ax + dx * c.t, ay + dy * c.t, c.prov)
    }
    pushPiece(bx, by, { k: 1, v: b })
  }
}

interface Loop {
  pts: number[]
  provs: Prov[]
  area: number
}

/**
 * Build the clipped-pixel loop for one pixel's chain fragments and its
 * positive-side area, or `null` when the fragments do not cut the pixel cleanly
 * (a re-entry, or an end not on the border). The loop is the chain fragments
 * followed by the pixel-border corners closing them, and the area is the
 * orientation whose shoelace is non-positive (the consistent side).
 */
function clipLoop(pieces: Piece[], px: number, py: number): Loop | null {
  // Require one contiguous pass: each fragment's end meets the next's start.
  for (let i = 1; i < pieces.length; i++) {
    if (
      Math.abs(pieces[i - 1].tx - pieces[i].fx) > 1e-9 ||
      Math.abs(pieces[i - 1].ty - pieces[i].fy) > 1e-9
    ) {
      return null
    }
  }
  const first = pieces[0]
  const last = pieces[pieces.length - 1]
  const sIn = perim(first.fx, first.fy, px, py)
  const sOut = perim(last.tx, last.ty, px, py)
  if (!Number.isFinite(sIn) || !Number.isFinite(sOut)) return null

  for (const forward of [true, false]) {
    const pts: number[] = [first.fx, first.fy]
    const provs: Prov[] = [first.fromProv]
    for (const p of pieces) {
      pts.push(p.tx, p.ty)
      provs.push(p.toProv)
    }
    const corners = borderCorners(sOut, sIn, forward, px, py)
    for (const c of corners) {
      pts.push(c[0], c[1])
      provs.push(CORNER)
    }
    const s = shoelaceFlat(pts)
    if (s <= 0) {
      const area = -s
      if (area >= -0.01 && area <= 1.01) {
        return { pts, provs, area: area < 0 ? 0 : area > 1 ? 1 : area }
      }
      return null
    }
  }
  return null
}

/** Position on a pixel's border as a parameter in [0, 4), or NaN when off it. */
function perim(x: number, y: number, px: number, py: number): number {
  const eps = 1e-7
  const x0 = px
  const y0 = py
  const x1 = px + 1
  const y1 = py + 1
  if (Math.abs(y - y0) <= eps) return clamp01(x - x0)
  if (Math.abs(x - x1) <= eps) return 1 + clamp01(y - y0)
  if (Math.abs(y - y1) <= eps) return 2 + clamp01(x1 - x)
  if (Math.abs(x - x0) <= eps) return 3 + clamp01(y1 - y)
  return NaN
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** The four pixel corners, matching `perim`'s travel direction. */
function cornerPt(i: number, px: number, py: number): [number, number] {
  const m = ((i % 4) + 4) % 4
  if (m === 0) return [px, py]
  if (m === 1) return [px + 1, py]
  if (m === 2) return [px + 1, py + 1]
  return [px, py + 1]
}

/** The pixel corners passed walking the border from `sFrom` to `sTo`. */
function borderCorners(
  sFrom: number,
  sTo: number,
  forward: boolean,
  px: number,
  py: number,
): [number, number][] {
  const out: [number, number][] = []
  const span = forward ? mod4(sTo - sFrom) : mod4(sFrom - sTo)
  let c = forward ? Math.floor(sFrom) + 1 : Math.ceil(sFrom) - 1
  for (let i = 0; i < 4; i++) {
    const off = forward ? mod4(c - sFrom) : mod4(sFrom - c)
    if (off <= 1e-9 || off >= span - 1e-9) break
    out.push(cornerPt(c, px, py))
    c += forward ? 1 : -1
  }
  return out
}

function mod4(v: number): number {
  return ((v % 4) + 4) % 4
}

/** Signed shoelace of a closed loop given as interleaved x, y. */
function shoelaceFlat(pts: number[]): number {
  let s = 0
  const n = pts.length >> 1
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    s += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1]
  }
  return 0.5 * s
}

/** Push a clipped vertex's area gradient onto the unknowns it depends on. */
function scatter(prov: Prov, gx: number, gy: number, pos: Float64Array, g: Float64Array): void {
  if (prov.k === 0) return
  if (prov.k === 1) {
    g[prov.v * 2] += gx
    g[prov.v * 2 + 1] += gy
    return
  }
  if (prov.k === 2) {
    // Vertical crossing (line, a.y + t·dy): x fixed, only y gradient propagates.
    const a = prov.a
    const b = prov.b
    const dx = pos[b * 2] - pos[a * 2]
    if (Math.abs(dx) < 1e-9) return
    const dy = pos[b * 2 + 1] - pos[a * 2 + 1]
    const t = (prov.line - pos[a * 2]) / dx
    g[a * 2 + 1] += gy * (1 - t)
    g[b * 2 + 1] += gy * t
    g[a * 2] += (gy * dy * (t - 1)) / dx
    g[b * 2] -= (gy * dy * t) / dx
    return
  }
  // Horizontal crossing: y fixed, only x gradient propagates.
  const a = prov.a
  const b = prov.b
  const dy = pos[b * 2 + 1] - pos[a * 2 + 1]
  if (Math.abs(dy) < 1e-9) return
  const dx = pos[b * 2] - pos[a * 2]
  const t = (prov.line - pos[a * 2 + 1]) / dy
  g[a * 2] += gx * (1 - t)
  g[b * 2] += gx * t
  g[a * 2 + 1] += (gx * dx * (t - 1)) / dy
  g[b * 2 + 1] -= (gx * dx * t) / dy
}

/** Anchor + kink priors, added to the energy and (when given) the gradient. */
function priorTerms(
  pos: Float64Array,
  anchor: Float64Array,
  n: number,
  cyclic: boolean,
  free: readonly boolean[],
  g: Float64Array | null,
  kinkW: number,
  anchorW: number,
): number {
  let e = 0
  // Anchor: squared distance to the refined position.
  for (let i = 0; i < n; i++) {
    if (!free[i]) continue
    const dx = pos[i * 2] - anchor[i * 2]
    const dy = pos[i * 2 + 1] - anchor[i * 2 + 1]
    e += anchorW * (dx * dx + dy * dy)
    if (g) {
      g[i * 2] += 2 * anchorW * dx
      g[i * 2 + 1] += 2 * anchorW * dy
    }
  }
  e += kinkTerm(pos, n, cyclic, g, kinkW)
  return e
}

/**
 * Kink: the absolute discrete second difference at each interior point, smoothed
 * by a floor inside the root so a corner costs in proportion to how sharply it
 * turns (inkvec `boundary_opt::priors`). Adds to `g` when given.
 */
function kinkTerm(
  pos: Float64Array,
  n: number,
  cyclic: boolean,
  g: Float64Array | null,
  kinkW: number,
): number {
  let e = 0
  const lo = cyclic ? 0 : 1
  const hi = cyclic ? n : n - 1
  for (let i = lo; i < hi; i++) {
    const p = (i + n - 1) % n
    const q = (i + 1) % n
    const dx = pos[p * 2] - 2 * pos[i * 2] + pos[q * 2]
    const dy = pos[p * 2 + 1] - 2 * pos[i * 2 + 1] + pos[q * 2 + 1]
    const mag = Math.sqrt(dx * dx + dy * dy + KINK_EPS)
    e += kinkW * mag
    if (g) {
      const c = kinkW / mag
      g[p * 2] += c * dx
      g[q * 2] += c * dx
      g[i * 2] -= c * 2 * dx
      g[p * 2 + 1] += c * dy
      g[q * 2 + 1] += c * dy
      g[i * 2 + 1] -= c * 2 * dy
    }
  }
  return e
}

/** Dot product over free coordinates only. */
function dot(a: Float64Array, b: Float64Array, free: readonly boolean[]): number {
  let s = 0
  const n = free.length
  for (let i = 0; i < n; i++) {
    if (!free[i]) continue
    s += a[i * 2] * b[i * 2] + a[i * 2 + 1] * b[i * 2 + 1]
  }
  return s
}

/**
 * Number of properly-intersecting non-adjacent segment pairs, bucketed by pixel
 * so only segments sharing a cell are compared (a point moves less than a pixel,
 * so a new fold is always local).
 */
function selfCrossings(pos: Float64Array, n: number, cyclic: boolean): number {
  const segs = cyclic ? n : n - 1
  // Bucket each segment into the pixels its bounding box touches.
  const buckets = new Map<number, number[]>()
  const w = 1 << 20
  const put = (s: number): void => {
    const a = s
    const b = (s + 1) % n
    const x0 = Math.floor(Math.min(pos[a * 2], pos[b * 2]))
    const x1 = Math.floor(Math.max(pos[a * 2], pos[b * 2]))
    const y0 = Math.floor(Math.min(pos[a * 2 + 1], pos[b * 2 + 1]))
    const y1 = Math.floor(Math.max(pos[a * 2 + 1], pos[b * 2 + 1]))
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 64) return
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const key = (y + (1 << 19)) * w + (x + (1 << 19))
        let list = buckets.get(key)
        if (!list) {
          list = []
          buckets.set(key, list)
        }
        list.push(s)
      }
    }
  }
  for (let s = 0; s < segs; s++) put(s)

  let count = 0
  const seen = new Set<number>()
  for (const list of buckets.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const s = list[i]
        const t = list[j]
        if (s === t) continue
        // Adjacent segments share an endpoint; skip them (and the wrap pair).
        if (Math.abs(s - t) === 1 || Math.abs(s - t) === segs - 1) continue
        const key = s < t ? s * segs + t : t * segs + s
        if (seen.has(key)) continue
        seen.add(key)
        if (segmentsCross(pos, s, (s + 1) % n, t, (t + 1) % n)) count++
      }
    }
  }
  return count
}

/** Whether segments p0→p1 and q0→q1 properly intersect. */
function segmentsCross(pos: Float64Array, a: number, b: number, c: number, d: number): boolean {
  const ax = pos[a * 2]
  const ay = pos[a * 2 + 1]
  const bx = pos[b * 2]
  const by = pos[b * 2 + 1]
  const cx = pos[c * 2]
  const cy = pos[c * 2 + 1]
  const dx = pos[d * 2]
  const dy = pos[d * 2 + 1]
  const d1 = cross(cx, cy, dx, dy, ax, ay)
  const d2 = cross(cx, cy, dx, dy, bx, by)
  const d3 = cross(ax, ay, bx, by, cx, cy)
  const d4 = cross(ax, ay, bx, by, dx, dy)
  return d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0
}

function cross(ox: number, oy: number, ax: number, ay: number, bx: number, by: number): number {
  return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox)
}
