/**
 * The boundary solve's energy: the exact rendering error of the planar map over
 * a fixed narrow band of pixels, plus the kink and anchor priors.
 *
 * ```text
 * E = Σ_{p ∈ B} w_p · ‖ Σ_f cov_f(p)·c_f(p) − t_p ‖²
 *   + w_kink   · Σ over points sqrt(|p_{i−1} − 2p_i + p_{i+1}|² + 10⁻⁴)
 *   + w_anchor · Σ over points |p_i − p_i⁰|²        (×4 at a junction)
 * ```
 *
 * `cov_f(p)` is the exact area of face `f` inside pixel `p` (the faces
 * partition the pixel, so these sum to one), `c_f(p)` the face's fill at the
 * pixel centre, `t_p` the observed pixel, all premultiplied encoded sRGB RGBA
 * (four channels), and `B` the band. The face polygons are the faces' rings
 * walked over the edges' current points: every edge is cut into pieces once and
 * each piece adds to both of its faces, which is the same coverage as
 * rasterizing each ring.
 *
 * - **Region fidelity.** The residual is the Chan–Vese region term with each
 *   face's fill as its constant (T. F. Chan, L. A. Vese 2001, "Active contours
 *   without edges", IEEE TIP 10(2); formula as in P. Getreuer 2012, "Chan–Vese
 *   Segmentation", IPOL), the fills held fixed during the solve.
 * - **Narrow band.** `B` is every pixel within {@link REACH} (Chebyshev) of a
 *   pixel a boundary crosses at the start. No point moves more than one pixel,
 *   so a piece can only land inside `B` and the band never needs rebuilding
 *   (D. Adalsteinsson, J. A. Sethian 1995, "A fast level set method for
 *   propagating interfaces", J. Comput. Phys. 118). Every band pixel is
 *   rendered, not only the pixels a boundary cuts, so the energy is continuous:
 *   leaving a pixel costs what being a pure pixel of the other face costs.
 * - **Exact box coverage by signed-area accumulation.** Each piece of boundary
 *   inside a pixel deposits the signed area between itself and the pixel's
 *   right side, for the faces on its left and right, and carries its height to
 *   every pixel further right; a pixel's coverage is its own deposits plus the
 *   carry. The accumulation-buffer rasterizer of libart and R. Levien's font-rs,
 *   an exact box filter as in J. Manson, S. Schaefer 2011, "Wavelet
 *   Rasterization", Computer Graphics Forum 30(2); one carry per face instead
 *   of one winding number, since the faces are a partition. A piece lying on a
 *   pixel border deposits zero area and a full carry, so no pixel decides which
 *   side is which. The carry's derivative is a suffix sum along the row, so the
 *   analytic gradient costs one more pass; a gridline crossing moves with both
 *   ends of its segment, in proportion to where it lies between them.
 * - **Stretches at once.** Between two pixels holding pieces the carry `κ` is
 *   constant, so such a stretch's energy is `κᵀ(ΣA)κ − 2κᵀ(Σb) + Σc` from
 *   per-run prefix sums of the fills fixed at the start.
 * - **Budget.** The per-run tables grow as `len · nf²` for a run of `len`
 *   pixels and `nf` faces, bounded by nothing but the image (one-pixel stripes
 *   make a run a whole row and `nf` every face in it), so they are counted in
 *   entries before anything is allocated and the band is refused past
 *   {@link tableBudget}.
 *
 * Coordinates are Trazor's: pixel `(i, j)` covers `[i, i+1] × [j, j+1]` and the
 * gridlines are the integers. inkvec puts pixel centres on integers and its
 * gridlines on half-integers; every position here is inkvec's plus `½`, and a
 * piece is filed under the pixel inkvec's rounding of its midpoint gives
 * ({@link cellOf}), so a piece lying on the left frame belongs left of the
 * image and one on the top, right or bottom frame to no pixel.
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/boundary_opt.rs` (`build_vars`,
 * `crossings`, `scatter`, `Problem::priors`, `Problem::energy`) and
 * `inkvec-trace/src/boundary_opt/band.rs`.
 */
import { OUTSIDE } from '../planar/types'
import type { FaceFill, PlanarMap, PremultipliedImage } from '../planar/types'
import { PIN_X, PIN_Y } from './lbfgs'

/**
 * Band reach round the pixels the starting boundary crosses, in pixels
 * (Chebyshev). No point moves more than one pixel, so a piece stays within one
 * pixel of a pixel holding a piece at the start.
 */
export const REACH = 1
/** Anchor multiplier at a junction: the junction stage has already placed it. */
export const JUNCTION_ANCHOR = 4
/** Floor inside the kink term's square root, so the gradient exists on a straight run. */
export const KINK_EPS = 1e-4
/**
 * Largest coordinate whose gridlines {@link gridCrossings} walks: far inside
 * the range where `m += 1` is exact and far outside any image.
 */
export const GRID_LIMIT = 1e9
/** Most gridlines {@link gridCrossings} walks along one axis of one segment. */
export const GRID_MAX_SPAN = 2 ** 20
/** How close to a frame line a frame edge's point is snapped onto it and pinned, in px. */
export const FRAME_SNAP = 1e-3
/**
 * Floor of the band-table budget, in table entries (f64): 2²⁵ entries, 256 MiB
 * of tables, far above any ordinary image's (inkvec measured 22 MB on a
 * 2048 px masthead, 106 MB on the worst of 772 stress images).
 */
export const TABLE_BUDGET_FLOOR = 2 ** 25
/** Table entries per image pixel the budget grows by above its floor (32 bytes). */
export const TABLE_BUDGET_PER_PIXEL = 4

/** A piece end that is a boundary point. */
const VERTEX = 0
/** A piece end where its segment crosses a vertical gridline. */
const CROSS_V = 1
/** A piece end where its segment crosses a horizontal gridline. */
const CROSS_H = 2

/**
 * The unknowns of the solve: one per boundary point, except that all the open
 * edges ending at one node share one unknown, which keeps the map a partition
 * however far the points move. Numbered in edge order, then point order, which
 * fixes every summation order downstream.
 */
export interface Unknowns {
  /** Number of unknowns. */
  readonly count: number
  /** Per edge, the unknown holding each of its points. */
  readonly of: readonly Int32Array[]
  /** Starting positions, interleaved `x, y` (frame points snapped by {@link pinFrame}). */
  readonly start: Float64Array
  /** 1 for an unknown standing for a node (a junction). */
  readonly junction: Uint8Array
  /** The node each unknown stands for, or -1. */
  readonly node: Int32Array
  /** Coordinates held on the image frame: `PIN_X`, `PIN_Y` bits (see {@link pinFrame}). */
  readonly pin: Uint8Array
}

/**
 * Number the unknowns of `map`: every point of every edge its own, except the
 * end points of open edges, keyed by their node so the edges meeting there
 * share one. A node's unknown starts at the node's position (an open edge's
 * end points equal it on a map kept by `syncNodes`).
 */
export function buildUnknowns(map: PlanarMap): Unknowns {
  const { edges, nodes } = map
  const byNode = new Int32Array(nodes.length).fill(-1)
  let total = 0
  for (const e of edges) total += e.points.length >> 1
  const start = new Float64Array(2 * total)
  const junction = new Uint8Array(total)
  const node = new Int32Array(total).fill(-1)
  const of: Int32Array[] = []
  let count = 0
  for (const e of edges) {
    const n = e.points.length >> 1
    const ids = new Int32Array(n)
    for (let i = 0; i < n; i++) {
      const shared = e.closed ? -1 : i === 0 ? e.start : i === n - 1 ? e.end : -1
      if (shared >= 0) {
        if (shared >= nodes.length)
          throw new RangeError('buildUnknowns: edge ends at a missing node')
        if (byNode[shared] < 0) {
          byNode[shared] = count
          start[2 * count] = nodes[shared].x
          start[2 * count + 1] = nodes[shared].y
          junction[count] = 1
          node[count] = shared
          count++
        }
        ids[i] = byNode[shared]
      } else {
        start[2 * count] = e.points[2 * i]
        start[2 * count + 1] = e.points[2 * i + 1]
        ids[i] = count++
      }
    }
    of.push(ids)
  }
  return {
    count,
    of,
    start: start.subarray(0, 2 * count),
    junction: junction.subarray(0, count),
    node: node.subarray(0, count),
    pin: new Uint8Array(count),
  }
}

/**
 * Hold the image frame where it is: the points of every edge against
 * {@link OUTSIDE}, and the nodes they share with interior boundaries, keep the
 * coordinate that puts them on a frame line (`x = 0`, `x = width`, `y = 0`,
 * `y = height`), snapped exactly onto it from within {@link FRAME_SNAP}, and
 * move only along it. A boundary condition: the accumulation starts from the
 * outside at `x = 0`, and the frame is the edge of the image, not something it
 * measures.
 */
export function pinFrame(map: PlanarMap, u: Unknowns): void {
  const w = map.width
  const h = map.height
  const { start, pin } = u
  for (let k = 0; k < map.edges.length; k++) {
    const e = map.edges[k]
    if (e.left !== OUTSIDE && e.right !== OUTSIDE) continue
    const ids = u.of[k]
    for (let i = 0; i < ids.length; i++) {
      const v = ids[i]
      for (const line of [0, w]) {
        if (Math.abs(start[2 * v] - line) < FRAME_SNAP) {
          start[2 * v] = line
          pin[v] |= PIN_X
        }
      }
      for (const line of [0, h]) {
        if (Math.abs(start[2 * v + 1] - line) < FRAME_SNAP) {
          start[2 * v + 1] = line
          pin[v] |= PIN_Y
        }
      }
    }
  }
}

/**
 * The pixel index inkvec's rounding of a midpoint coordinate gives: with
 * inkvec's coordinate `u = v − ½`, `round(u)` half away from zero. For
 * `v ≥ ½` that is `⌊v⌋` (a point on a gridline belongs to the pixel on its
 * right or below); below it the tie goes the other way, so a piece on the left
 * or top frame lies at index −1, outside the image.
 */
export function cellOf(v: number): number {
  return v >= 0.5 ? Math.floor(v) : 0 - Math.floor(1 - v)
}

/** Whether the gridlines between `lo` and `hi` can be walked a step at a time (NaN fails). */
function walkable(lo: number, hi: number): boolean {
  return lo > -GRID_LIMIT && hi < GRID_LIMIT && hi - lo < GRID_MAX_SPAN
}

/** Gridline crossings of one segment, reused across calls ({@link gridCrossings}). */
export class GridCrossings {
  count = 0
  /** Parameter of each crossing along the segment, ascending, in `(0, 1)`. */
  t = new Float64Array(16)
  /** 1 for a vertical gridline `x = line`, 2 for a horizontal one `y = line`. */
  kind = new Uint8Array(16)
  line = new Float64Array(16)
  /** Each axis's crossings, parameter and line, in the order they were walked. */
  vt = new Float64Array(8)
  vl = new Float64Array(8)
  ht = new Float64Array(8)
  hl = new Float64Array(8)

  /** Room for `n` crossings per axis (contents are not kept). */
  reserve(n: number): void {
    if (n <= this.vt.length) return
    let cap = this.vt.length
    while (cap < n) cap *= 2
    this.vt = new Float64Array(cap)
    this.vl = new Float64Array(cap)
    this.ht = new Float64Array(cap)
    this.hl = new Float64Array(cap)
    this.t = new Float64Array(2 * cap)
    this.kind = new Uint8Array(2 * cap)
    this.line = new Float64Array(2 * cap)
  }
}

/**
 * Gridline crossings of the segment `a → b` into `out`, as parameters in
 * `(0, 1)` in increasing order; returns their count. Each integer `x = m`
 * strictly between `a.x` and `b.x` crosses at `t = (m − a.x)/(b.x − a.x)`, and
 * likewise in `y`. Crossings within `10⁻⁹` of either end are dropped (the end
 * is a vertex), an axis the segment barely moves along (`|d| ≤ 10⁻¹²`) or that
 * cannot be walked (beyond {@link GRID_LIMIT}, over {@link GRID_MAX_SPAN}
 * lines, or NaN) contributes none. A tie between a vertical and a horizontal
 * crossing (a lattice corner) lists the vertical one first.
 */
export function gridCrossings(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  out: GridCrossings,
): number {
  out.reserve(Math.max(axisSpan(ax, bx), axisSpan(ay, by)) + 2)
  const { vt, vl, ht, hl } = out
  const nv = axisCrossings(ax, bx, vt, vl)
  const nh = axisCrossings(ay, by, ht, hl)
  // Each axis walks its gridlines in increasing `m`, so its parameters run
  // ascending when the segment moves forwards along that axis and descending
  // otherwise; merge the two ascending lists, vertical first on a tie.
  const vForward = bx - ax > 0
  const hForward = by - ay > 0
  let i = 0
  let j = 0
  let o = 0
  while (i < nv || j < nh) {
    const iv = vForward ? i : nv - 1 - i
    const jh = hForward ? j : nh - 1 - j
    if (j >= nh || (i < nv && vt[iv] <= ht[jh])) {
      out.t[o] = vt[iv]
      out.kind[o] = CROSS_V
      out.line[o] = vl[iv]
      i++
    } else {
      out.t[o] = ht[jh]
      out.kind[o] = CROSS_H
      out.line[o] = hl[jh]
      j++
    }
    o++
  }
  out.count = o
  return o
}

/** Whether an axis from `a` to `b` is walked at all (see {@link gridCrossings}). */
function walked(a: number, b: number): boolean {
  return Math.abs(b - a) > 1e-12 && walkable(Math.min(a, b), Math.max(a, b))
}

/** Most gridlines one axis of a segment can cross: 0 when it is not walked. */
function axisSpan(a: number, b: number): number {
  return walked(a, b) ? Math.ceil(Math.abs(b - a)) : 0
}

/** One axis of {@link gridCrossings}: the crossings with `a`, `b` that axis's coordinates. */
function axisCrossings(a: number, b: number, ts: Float64Array, ls: Float64Array): number {
  if (!walked(a, b)) return 0
  const d = b - a
  const lo = a < b ? a : b
  const hi = a < b ? b : a
  let n = 0
  for (let m = Math.ceil(lo); m < hi; m += 1) {
    const t = (m - a) / d
    if (t > 1e-9 && t < 1 - 1e-9) {
      ts[n] = t
      ls[n] = m
      n++
    }
  }
  return n
}

/** Most table entries a `width × height` image's band may take: `max(floor, 4·w·h)`. */
export function tableBudget(width: number, height: number): number {
  return Math.max(TABLE_BUDGET_FLOOR, TABLE_BUDGET_PER_PIXEL * width * height)
}

/**
 * The table entries one run of `len` pixels and `nf` faces takes: `4·nf·len`
 * colors (four channels per face per pixel) and `(len + 1)·kk` prefix sums,
 * `kk = nf(nf + 1)/2 + nf + 1` per pixel (one per unordered face pair, one per
 * face against the target, one for the target against itself) and one leading
 * row of zeros.
 */
export function tableEntries(len: number, nf: number): number {
  const kk = (nf * (nf + 1)) / 2 + nf + 1
  return 4 * nf * len + (len + 1) * kk
}

/** The fixed band: runs, their faces, those faces' colors at every pixel, the weights. */
export interface Band {
  readonly runCount: number
  /** Per run: its row, first and last (inclusive) column. */
  readonly y: Int32Array
  readonly x0: Int32Array
  readonly x1: Int32Array
  /** Per run: index of its first pixel in the per-cell arrays. */
  readonly first: Int32Array
  /** Per run: its faces are `faces[fstart .. fstart + nf]`, slot 0 the seed. */
  readonly fstart: Int32Array
  readonly nf: Int32Array
  /** Per run: its colors start at `colour[cstart]`, 4 per face per pixel. */
  readonly cstart: Int32Array
  /** Per run: its prefix sums start at `prefix[pstart]`, `kk` per pixel plus a zero row. */
  readonly pstart: Int32Array
  readonly faces: Int32Array
  readonly colour: Float64Array
  readonly prefix: Float64Array
  /** Data weight of each band pixel (0 where its run's seed is uncertain, else 1). */
  readonly weight: Float64Array
  /** Number of band pixels. */
  readonly cells: number
  /** 1 for every image pixel in the band. */
  readonly inBand: Uint8Array
  /** Table entries the band took ({@link tableEntries} summed over its runs). */
  readonly entries: number
  readonly maxNf: number
  readonly maxLen: number
}

/** One independent part of the problem: its edges, its runs and its unknowns. */
export interface BandPart {
  readonly edges: Int32Array
  readonly runs: Int32Array
  readonly vars: Int32Array
}

/** Growable typed-array store of pieces, one fragment of one segment inside one pixel each. */
class Pieces {
  count = 0
  edge = new Int32Array(0)
  left = new Int32Array(0)
  right = new Int32Array(0)
  /** The segment's unknowns: a vertex at `from` is `va`, a vertex at `to` is `vb`. */
  va = new Int32Array(0)
  vb = new Int32Array(0)
  fx = new Float64Array(0)
  fy = new Float64Array(0)
  tx = new Float64Array(0)
  ty = new Float64Array(0)
  /** How each end moves: VERTEX, CROSS_V or CROSS_H, with its gridline. */
  fkind = new Uint8Array(0)
  tkind = new Uint8Array(0)
  fline = new Float64Array(0)
  tline = new Float64Array(0)
  /** Next piece in the same pixel's list, or -1. */
  next = new Int32Array(0)

  constructor(capacity: number) {
    this.grow(capacity)
  }

  grow(capacity: number): void {
    const keep = this.count
    const i32 = (a: Int32Array) => {
      const b = new Int32Array(capacity)
      b.set(a.subarray(0, keep))
      return b
    }
    const f64 = (a: Float64Array) => {
      const b = new Float64Array(capacity)
      b.set(a.subarray(0, keep))
      return b
    }
    const u8 = (a: Uint8Array) => {
      const b = new Uint8Array(capacity)
      b.set(a.subarray(0, keep))
      return b
    }
    this.edge = i32(this.edge)
    this.left = i32(this.left)
    this.right = i32(this.right)
    this.va = i32(this.va)
    this.vb = i32(this.vb)
    this.fx = f64(this.fx)
    this.fy = f64(this.fy)
    this.tx = f64(this.tx)
    this.ty = f64(this.ty)
    this.fkind = u8(this.fkind)
    this.tkind = u8(this.tkind)
    this.fline = f64(this.fline)
    this.tline = f64(this.tline)
    this.next = i32(this.next)
  }
}

/**
 * The boundary solve's energy over a planar map and an image, and everything
 * needed to evaluate it: the band, the pieces of the current evaluation and the
 * prior weights. {@link setup} fixes the band at the unknowns' start; then
 * {@link energy} evaluates data + priors at any positions, restricted to
 * {@link active} when that is set.
 */
export class BandProblem {
  readonly map: PlanarMap
  readonly unknowns: Unknowns
  readonly image: PremultipliedImage
  readonly fills: readonly FaceFill[]
  readonly width: number
  readonly height: number
  /** Weight of the kink prior. */
  wKink = 1
  /** Weight of the anchor prior (×{@link JUNCTION_ANCHOR} at a junction). */
  wAnchor = 0
  /** The band, once {@link setup} has run. */
  band: Band | null = null
  /** Starting residual of the band pixels holding pieces (what the prior weights scale to). */
  cutResidual = 0
  /** Starting residual of the other band pixels, which no boundary touches at the start. */
  restResidual = 0
  /** The independent part the energy is restricted to, or null for the whole problem. */
  active: BandPart | null = null

  private readonly pieces = new Pieces(4096)
  /** Per pixel, the first of its pieces (-1 for none); the rest follow `next`. */
  private readonly head: Int32Array
  /** Per row, the first of the pieces left of the image. */
  private readonly vhead: Int32Array
  /** The pixels holding a piece, ascending after {@link bucket}. */
  private touched = new Int32Array(1024)
  private touchedCount = 0
  /** The rows holding a piece left of the image, ascending after {@link bucket}. */
  private readonly vrows: Int32Array
  private vrowCount = 0
  private readonly cross = new GridCrossings()
  // Run scratch.
  private carry = new Float64Array(0)
  private cov = new Float64Array(0)
  private suf = new Float64Array(0)
  private g = new Float64Array(0)
  private kap = new Float64Array(0)
  private segs = new Int32Array(0)
  /** Each piece's gradient at its two ends: `[from.x, from.y, to.x, to.y]`. */
  private pieceG = new Float64Array(0)
  /** The last run's energy in pixels holding pieces. */
  private runCut = 0

  constructor(
    map: PlanarMap,
    unknowns: Unknowns,
    image: PremultipliedImage,
    fills: readonly FaceFill[],
  ) {
    const w = map.width
    const h = map.height
    if (image.width !== w || image.height !== h || image.data.length < 4 * w * h) {
      throw new RangeError('BandProblem: the image must have the map size and four channels')
    }
    for (const e of map.edges) {
      if (e.left >= fills.length || e.right >= fills.length) {
        throw new RangeError('BandProblem: a face of the map has no fill')
      }
    }
    this.map = map
    this.unknowns = unknowns
    this.image = image
    this.fills = fills
    this.width = w
    this.height = h
    this.head = new Int32Array(w * h).fill(-1)
    this.vhead = new Int32Array(h).fill(-1)
    this.vrows = new Int32Array(h)
  }

  // -------------------------------------------------------------------------
  // Pieces
  // -------------------------------------------------------------------------

  /**
   * Cut every segment of every edge (of the active part) at its gridline
   * crossings and file each piece under the pixel holding its midpoint
   * ({@link cellOf}); a piece left of the image goes into its row's list, one
   * above, below or right of the image nowhere. Once the band is set, a piece
   * goes to the band pixel of its row nearest its own (a midpoint exactly on a
   * border one and a half pixels out is the one way to leave the band; the
   * neighboring band pixel keeps its carried height, so every coverage in the
   * row stays exact). A crossing lies exactly on its gridline, so the pieces of
   * a chain crossing a row add up to its height exactly.
   */
  bucket(pos: Float64Array): void {
    const { head, vhead } = this
    for (let k = 0; k < this.touchedCount; k++) head[this.touched[k]] = -1
    this.touchedCount = 0
    for (let k = 0; k < this.vrowCount; k++) vhead[this.vrows[k]] = -1
    this.vrowCount = 0
    this.pieces.count = 0
    const edges = this.map.edges
    const active = this.active
    const count = active === null ? edges.length : active.edges.length
    for (let idx = 0; idx < count; idx++) {
      const k = active === null ? idx : active.edges[idx]
      const e = edges[k]
      const ids = this.unknowns.of[k]
      const n = ids.length
      if (n < 2) continue
      const last = e.closed ? n : n - 1
      for (let i = 0; i < last; i++) {
        this.cutSegment(k, ids[i], i + 1 === n ? ids[0] : ids[i + 1], e.left, e.right, pos)
      }
    }
    this.touched.subarray(0, this.touchedCount).sort()
    this.vrows.subarray(0, this.vrowCount).sort()
  }

  /** Cut the segment from unknown `va` to `vb` of edge `k` into pieces and file them. */
  private cutSegment(
    k: number,
    va: number,
    vb: number,
    left: number,
    right: number,
    pos: Float64Array,
  ): void {
    const ax = pos[2 * va]
    const ay = pos[2 * va + 1]
    const bx = pos[2 * vb]
    const by = pos[2 * vb + 1]
    const cr = this.cross
    const nc = gridCrossings(ax, ay, bx, by, cr)
    let t0 = 0
    let fx = ax
    let fy = ay
    let fkind = VERTEX
    let fline = 0
    for (let idx = 0; idx <= nc; idx++) {
      let t1: number
      let tx: number
      let ty: number
      let tkind: number
      let tline: number
      if (idx === nc) {
        t1 = 1
        tx = bx
        ty = by
        tkind = VERTEX
        tline = 0
      } else {
        t1 = cr.t[idx]
        tkind = cr.kind[idx]
        tline = cr.line[idx]
        if (tkind === CROSS_V) {
          tx = tline
          ty = ay + (by - ay) * t1
        } else {
          tx = ax + (bx - ax) * t1
          ty = tline
        }
      }
      if (t1 - t0 > 1e-9) {
        const tm = 0.5 * (t0 + t1)
        const px = cellOf(ax + (bx - ax) * tm)
        const py = cellOf(ay + (by - ay) * tm)
        this.file(k, va, vb, left, right, fx, fy, tx, ty, fkind, fline, tkind, tline, px, py)
      }
      t0 = t1
      fx = tx
      fy = ty
      fkind = tkind
      fline = tline
    }
  }

  /** File one piece under pixel `(px, py)` (see {@link bucket}). */
  private file(
    k: number,
    va: number,
    vb: number,
    left: number,
    right: number,
    fx: number,
    fy: number,
    tx: number,
    ty: number,
    fkind: number,
    fline: number,
    tkind: number,
    tline: number,
    px: number,
    py: number,
  ): void {
    const w = this.width
    if (py < 0 || py >= this.height || px >= w) return
    const y = py
    const p = this.pieces
    if (p.count === p.edge.length) p.grow(2 * p.edge.length)
    const id = p.count++
    p.edge[id] = k
    p.left[id] = left
    p.right[id] = right
    p.va[id] = va
    p.vb[id] = vb
    p.fx[id] = fx
    p.fy[id] = fy
    p.tx[id] = tx
    p.ty[id] = ty
    p.fkind[id] = fkind
    p.fline[id] = fline
    p.tkind[id] = tkind
    p.tline[id] = tline
    if (px < 0) {
      if (this.vhead[y] < 0) this.vrows[this.vrowCount++] = y
      p.next[id] = this.vhead[y]
      this.vhead[y] = id
      return
    }
    const x = this.band === null ? px : this.nearestInBand(y, px)
    const cell = y * w + x
    if (this.head[cell] < 0) {
      if (this.touchedCount === this.touched.length) {
        const grown = new Int32Array(2 * this.touched.length)
        grown.set(this.touched)
        this.touched = grown
      }
      this.touched[this.touchedCount++] = cell
    }
    p.next[id] = this.head[cell]
    this.head[cell] = id
  }

  /** The band pixel of row `y` nearest column `x` (`x` itself when in the band). */
  private nearestInBand(y: number, x: number): number {
    const inb = (this.band as Band).inBand
    const w = this.width
    const row = y * w
    if (inb[row + x]) return x
    for (let d = 1; d < 4; d++) {
      if (x >= d && inb[row + x - d]) return x - d
      if (x + d < w && inb[row + x + d]) return x + d
    }
    return x
  }

  // -------------------------------------------------------------------------
  // The energy
  // -------------------------------------------------------------------------

  /**
   * The whole objective at `pos` (data + priors over the active part, or the
   * whole problem), cutting the chains into pieces first. With `grad`, the
   * entries of the part's unknowns (every unknown for the whole problem) are
   * zeroed and then filled with the objective's gradient, zero along a
   * coordinate pinned to the frame.
   */
  energy(pos: Float64Array, grad: Float64Array | null): number {
    this.bucket(pos)
    const active = this.active
    if (grad !== null) {
      if (active === null) grad.fill(0, 0, 2 * this.unknowns.count)
      else {
        for (let i = 0; i < active.vars.length; i++) {
          const v = active.vars[i]
          grad[2 * v] = 0
          grad[2 * v + 1] = 0
        }
      }
    }
    const d = this.bandData(pos, grad) + this.priors(pos, grad)
    if (grad !== null) {
      const pin = this.unknowns.pin
      const count = active === null ? this.unknowns.count : active.vars.length
      for (let i = 0; i < count; i++) {
        const v = active === null ? i : active.vars[i]
        if (pin[v] & PIN_X) grad[2 * v] = 0
        if (pin[v] & PIN_Y) grad[2 * v + 1] = 0
      }
    }
    return d
  }

  /**
   * The kink and anchor priors at `pos`, their gradient added into `grad`:
   *
   * ```text
   * P = w_kink · Σ sqrt(|p_{i−1} − 2p_i + p_{i+1}|² + 10⁻⁴) + Σ_v w_v · |p_v − p_v⁰|²
   * ```
   *
   * with `w_v = w_anchor` (×{@link JUNCTION_ANCHOR} at a junction). The kink
   * sum runs over the interior points of open edges and every point of closed
   * ones (none on an edge under three points): the absolute second difference,
   * so one sharp corner costs less than the many small kinks a squared term
   * would spread it into; the floor under the root (a Charbonnier smoothing)
   * gives it a gradient on a straight run. The anchor holds a point the image
   * cannot see (along a straight run, between two nearly equal colors) where
   * the measurement put it.
   */
  priors(pos: Float64Array, grad: Float64Array | null): number {
    const active = this.active
    const { of, start, junction } = this.unknowns
    const edges = this.map.edges
    const wKink = this.wKink
    let total = 0
    const ne = active === null ? edges.length : active.edges.length
    for (let idx = 0; idx < ne; idx++) {
      const k = active === null ? idx : active.edges[idx]
      const ids = of[k]
      const n = ids.length
      if (n < 3) continue
      const closed = edges[k].closed
      const lo = closed ? 0 : 1
      const hi = closed ? n : n - 1
      for (let i = lo; i < hi; i++) {
        const ia = ids[(i + n - 1) % n]
        const ib = ids[i]
        const ic = ids[(i + 1) % n]
        const dx = pos[2 * ia] - 2 * pos[2 * ib] + pos[2 * ic]
        const dy = pos[2 * ia + 1] - 2 * pos[2 * ib + 1] + pos[2 * ic + 1]
        const m = Math.sqrt(dx * dx + dy * dy + KINK_EPS)
        total += wKink * m
        if (grad !== null) {
          const s = wKink / m
          grad[2 * ia] += s * dx
          grad[2 * ia + 1] += s * dy
          grad[2 * ib] -= 2 * s * dx
          grad[2 * ib + 1] -= 2 * s * dy
          grad[2 * ic] += s * dx
          grad[2 * ic + 1] += s * dy
        }
      }
    }
    const nv = active === null ? this.unknowns.count : active.vars.length
    for (let i = 0; i < nv; i++) {
      const v = active === null ? i : active.vars[i]
      const w = junction[v] ? this.wAnchor * JUNCTION_ANCHOR : this.wAnchor
      const dx = pos[2 * v] - start[2 * v]
      const dy = pos[2 * v + 1] - start[2 * v + 1]
      total += w * (dx * dx + dy * dy)
      if (grad !== null) {
        grad[2 * v] += 2 * w * dx
        grad[2 * v + 1] += 2 * w * dy
      }
    }
    return total
  }

  /**
   * The band term at `pos` (after {@link bucket} on the same `pos`) over the
   * active part's runs (or all), with its gradient added into `grad`. Each
   * run's energy is summed in run order; each piece's gradient is kept apart
   * and pushed onto the unknowns in pixel order (the rows' pieces left of the
   * image, then the pixels ascending), so the result has one summation order.
   */
  bandData(pos: Float64Array, grad: Float64Array | null): number {
    return this.bandDataWith(pos, grad, false)
  }

  /**
   * {@link bandData} rendering every band pixel one by one: the reference the
   * stretch sums are tested against.
   */
  bandDataCells(pos: Float64Array, grad: Float64Array | null): number {
    return this.bandDataWith(pos, grad, true)
  }

  private bandDataWith(pos: Float64Array, grad: Float64Array | null, cells: boolean): number {
    const band = this.band as Band
    const active = this.active
    const withGrad = grad !== null
    if (withGrad) {
      const need = 4 * this.pieces.count
      if (this.pieceG.length < need)
        this.pieceG = new Float64Array(Math.max(need, 2 * this.pieceG.length))
      this.pieceG.fill(0, 0, need)
    }
    let total = 0
    const runs = active === null ? band.runCount : active.runs.length
    for (let k = 0; k < runs; k++) {
      const r = active === null ? k : active.runs[k]
      total += cells ? this.runEnergyCells(r, withGrad) : this.runEnergy(r, withGrad)
    }
    if (grad !== null) this.scatterAll(pos, grad)
    return total
  }

  /** Push every piece's gradient onto its unknowns, in pixel order. */
  private scatterAll(pos: Float64Array, grad: Float64Array): void {
    for (let k = 0; k < this.vrowCount; k++) {
      for (let id = this.vhead[this.vrows[k]]; id >= 0; id = this.pieces.next[id]) {
        this.scatterPiece(id, pos, grad)
      }
    }
    for (let k = 0; k < this.touchedCount; k++) {
      for (let id = this.head[this.touched[k]]; id >= 0; id = this.pieces.next[id]) {
        this.scatterPiece(id, pos, grad)
      }
    }
  }

  private scatterPiece(id: number, pos: Float64Array, grad: Float64Array): void {
    const pg = this.pieceG
    const p = this.pieces
    const o = 4 * id
    if (pg[o] !== 0 || pg[o + 1] !== 0) {
      scatter(p.fkind[id], p.fline[id], p.va[id], p.vb[id], p.va[id], pg[o], pg[o + 1], pos, grad)
    }
    if (pg[o + 2] !== 0 || pg[o + 3] !== 0) {
      scatter(
        p.tkind[id],
        p.tline[id],
        p.va[id],
        p.vb[id],
        p.vb[id],
        pg[o + 2],
        pg[o + 3],
        pos,
        grad,
      )
    }
  }

  /** The slot of face `f` among run `r`'s faces (slot 0 for a face it does not hold). */
  private slot(fstart: number, nf: number, f: number): number {
    const faces = (this.band as Band).faces
    for (let j = 0; j < nf; j++) if (faces[fstart + j] === f) return j
    return 0
  }

  /**
   * Start run `r`: the carry is its seed face (slot 0), plus the heights of the
   * pieces left of the image for a run at column 0. Returns the first of those
   * pieces (-1 for none).
   */
  private startRun(r: number): number {
    const band = this.band as Band
    const nf = band.nf[r]
    const fstart = band.fstart[r]
    const carry = this.carry
    carry.fill(0, 0, nf)
    carry[0] = 1
    this.runCut = 0
    const vstart = band.x0[r] === 0 ? this.vhead[band.y[r]] : -1
    const p = this.pieces
    for (let id = vstart; id >= 0; id = p.next[id]) {
      const s = p.ty[id] - p.fy[id]
      carry[this.slot(fstart, nf, p.left[id])] += s
      carry[this.slot(fstart, nf, p.right[id])] -= s
    }
    return vstart
  }

  /**
   * The coverage of pixel `cell` (right side at `xr`) into `cov`: the carry
   * plus the area each of its pieces deposits, `A = s·(x_r − (a.x + b.x)/2)` to
   * its left face and `−A` to its right, `s = b.y − a.y`; then each piece's
   * height `±s` joins the carry.
   */
  private deposit(fstart: number, nf: number, cell: number, xr: number): void {
    const { carry, cov } = this
    const p = this.pieces
    for (let j = 0; j < nf; j++) cov[j] = carry[j]
    for (let id = this.head[cell]; id >= 0; id = p.next[id]) {
      const s = p.ty[id] - p.fy[id]
      const a = s * (xr - 0.5 * (p.fx[id] + p.tx[id]))
      const sl = this.slot(fstart, nf, p.left[id])
      const sr = this.slot(fstart, nf, p.right[id])
      cov[sl] += a
      cov[sr] -= a
      carry[sl] += s
      carry[sr] -= s
    }
  }

  /**
   * The weighted residual `w·‖Σ_f cov_f·c_f − t‖²` of pixel `i` of run `r` at
   * the coverage in `cov`, and into `g[at ..]` when given `∂E/∂cov_f =
   * 2·w·(r·c_f)` per face slot.
   */
  private pixelEnergy(r: number, i: number, g: Float64Array | null, at: number): number {
    const band = this.band as Band
    const nf = band.nf[r]
    const wgt = band.weight[band.first[r] + i]
    if (wgt === 0) {
      if (g !== null) g.fill(0, at, at + nf)
      return 0
    }
    const cell = 4 * (band.y[r] * this.width + band.x0[r] + i)
    const img = this.image.data
    const col = band.colour
    const c0 = band.cstart[r] + 4 * i * nf
    const cov = this.cov
    let r0 = -img[cell]
    let r1 = -img[cell + 1]
    let r2 = -img[cell + 2]
    let r3 = -img[cell + 3]
    for (let j = 0; j < nf; j++) {
      const cv = cov[j]
      const o = c0 + 4 * j
      r0 += cv * col[o]
      r1 += cv * col[o + 1]
      r2 += cv * col[o + 2]
      r3 += cv * col[o + 3]
    }
    const e = r0 * r0 + r1 * r1 + r2 * r2 + r3 * r3
    if (g !== null) {
      for (let j = 0; j < nf; j++) {
        const o = c0 + 4 * j
        const d = r0 * col[o] + r1 * col[o + 1] + r2 * col[o + 2] + r3 * col[o + 3]
        g[at + j] = 2 * wgt * d
      }
    }
    return wgt * e
  }

  /**
   * The gradient at both ends of each piece of pixel `cell`: its area moves the
   * energy by `da = g_L − g_R` here and its height by `ds`, the same difference
   * summed over the pixels after it (`suf`). `A = s·off` gives `∂A/∂x = −s/2`
   * at either end and `∂A/∂y = ∓off`.
   */
  private pieceGrads(
    fstart: number,
    nf: number,
    cell: number,
    xr: number,
    g: Float64Array,
    gAt: number,
    suf: Float64Array,
    sAt: number,
  ): void {
    const p = this.pieces
    const pg = this.pieceG
    for (let id = this.head[cell]; id >= 0; id = p.next[id]) {
      const sl = this.slot(fstart, nf, p.left[id])
      const sr = this.slot(fstart, nf, p.right[id])
      const da = g[gAt + sl] - g[gAt + sr]
      const ds = suf[sAt + sl] - suf[sAt + sr]
      const s = p.ty[id] - p.fy[id]
      const off = xr - 0.5 * (p.fx[id] + p.tx[id])
      const gx = -0.5 * s * da
      const o = 4 * id
      pg[o] = gx
      pg[o + 1] = -off * da - ds
      pg[o + 2] = gx
      pg[o + 3] = off * da + ds
    }
  }

  /** The gradient of the pieces left of the image: their height reaches every pixel of the run. */
  private virtualGrads(
    fstart: number,
    nf: number,
    vstart: number,
    suf: Float64Array,
    sAt: number,
  ): void {
    const p = this.pieces
    const pg = this.pieceG
    for (let id = vstart; id >= 0; id = p.next[id]) {
      const ds =
        suf[sAt + this.slot(fstart, nf, p.left[id])] - suf[sAt + this.slot(fstart, nf, p.right[id])]
      const o = 4 * id
      pg[o] = 0
      pg[o + 1] = -ds
      pg[o + 2] = 0
      pg[o + 3] = ds
    }
  }

  /**
   * One run of the band term: its energy, and (with `withGrad`) the gradient
   * at both ends of each of its pieces. The pixels holding pieces are rendered
   * one by one; over a stretch without pieces the carry `κ` is constant, so its
   * energy is the quadratic form `κᵀ(ΣA)κ − 2κᵀ(Σb) + Σc` (`A_ij = w·c_i·c_j`,
   * `b_i = w·c_i·t`, `c = w·t·t` per pixel) and its share of each face's suffix
   * sum is `2((ΣA)κ − Σb)`, from the prefix sums fixed at the start: the same
   * energy and gradient as {@link runEnergyCells}, summed in another order.
   */
  private runEnergy(r: number, withGrad: boolean): number {
    const band = this.band as Band
    const x0 = band.x0[r]
    const len = band.x1[r] - x0 + 1
    const nf = band.nf[r]
    const fstart = band.fstart[r]
    const kk = (nf * (nf + 1)) / 2 + nf + 1
    const pre = band.pstart[r]
    const prefix = band.prefix
    const vstart = this.startRun(r)
    const row = band.y[r] * this.width + x0
    const head = this.head
    const { carry, segs, kap, g } = this
    let total = 0
    let nseg = 0
    let gLen = 0
    let kapLen = 0
    let i = 0
    while (i < len) {
      if (head[row + i] < 0) {
        let j = i + 1
        while (j < len && head[row + j] < 0) j++
        total += stretchEnergy(prefix, pre + i * kk, pre + j * kk, carry, nf)
        if (withGrad) {
          segs[3 * nseg] = i
          segs[3 * nseg + 1] = j
          segs[3 * nseg + 2] = kapLen
          nseg++
          for (let a = 0; a < nf; a++) kap[kapLen + a] = carry[a]
          kapLen += nf
        }
        i = j
        continue
      }
      this.deposit(fstart, nf, row + i, x0 + i + 1)
      if (withGrad) {
        segs[3 * nseg] = i
        segs[3 * nseg + 1] = -1
        segs[3 * nseg + 2] = gLen
        nseg++
      }
      const e = this.pixelEnergy(r, i, withGrad ? g : null, gLen)
      if (withGrad) gLen += nf
      total += e
      this.runCut += e
      i++
    }
    if (!withGrad) return total
    // Backwards: `suf` is each face's `g` summed over everything after the
    // current segment; a stretch adds `2((ΣA)κ − Σb)`, a pixel its own `g`.
    const suf = this.suf
    suf.fill(0, 0, nf)
    for (let k = nseg - 1; k >= 0; k--) {
      const si = segs[3 * k]
      const sj = segs[3 * k + 1]
      const at = segs[3 * k + 2]
      if (sj >= 0) {
        stretchGrad(prefix, pre + si * kk, pre + sj * kk, kap, at, nf, suf)
        continue
      }
      this.pieceGrads(fstart, nf, row + si, x0 + si + 1, g, at, suf, 0)
      for (let a = 0; a < nf; a++) suf[a] += g[at + a]
    }
    this.virtualGrads(fstart, nf, vstart, suf, 0)
    return total
  }

  /** {@link runEnergy} pixel by pixel, the reference it is tested against. */
  private runEnergyCells(r: number, withGrad: boolean): number {
    const band = this.band as Band
    const x0 = band.x0[r]
    const len = band.x1[r] - x0 + 1
    const nf = band.nf[r]
    const fstart = band.fstart[r]
    const vstart = this.startRun(r)
    const row = band.y[r] * this.width + x0
    const g = new Float64Array(len * nf)
    let total = 0
    for (let i = 0; i < len; i++) {
      this.deposit(fstart, nf, row + i, x0 + i + 1)
      total += this.pixelEnergy(r, i, withGrad ? g : null, i * nf)
    }
    if (!withGrad) return total
    // Suffix sums: `suf[i]` is `g` summed over the run's pixels from `i` on.
    const suf = new Float64Array((len + 1) * nf)
    for (let i = len - 1; i >= 0; i--) {
      for (let j = 0; j < nf; j++) suf[i * nf + j] = suf[(i + 1) * nf + j] + g[i * nf + j]
    }
    this.virtualGrads(fstart, nf, vstart, suf, 0)
    for (let i = 0; i < len; i++) {
      this.pieceGrads(fstart, nf, row + i, x0 + i + 1, g, i * nf, suf, (i + 1) * nf)
    }
    return total
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  /**
   * Build the band at the unknowns' start and fix everything about it for the
   * solve: the runs and their faces, the faces' colors, the weights (zero only
   * on runs whose seed is uncertain) and the prefix sums; then the starting
   * residual, split into the pixels the boundary cuts ({@link cutResidual})
   * and the rest ({@link restResidual}). Returns false, with nothing set up,
   * when the band's tables would take more than `budget` entries.
   */
  setup(budget = tableBudget(this.width, this.height)): boolean {
    const start = this.unknowns.start
    this.band = null
    this.active = null
    this.bucket(start)
    const band = this.build(budget)
    if (band === null) return false
    this.band = band
    this.carry = new Float64Array(band.maxNf)
    this.cov = new Float64Array(band.maxNf)
    this.suf = new Float64Array(band.maxNf)
    this.g = new Float64Array(band.maxLen * band.maxNf)
    this.kap = new Float64Array(band.maxLen * band.maxNf)
    this.segs = new Int32Array(3 * band.maxLen)
    let cut = 0
    let rest = 0
    for (let r = 0; r < band.runCount; r++) {
      const e = this.runEnergy(r, false)
      cut += this.runCut
      rest += e - this.runCut
    }
    this.cutResidual = cut
    this.restResidual = rest
    return true
  }

  /**
   * Find the band's runs at the start (after {@link bucket} there): each run's
   * seed (the face filling everything left of it, carried along its row from
   * the far left), its faces (every face of a piece within reach of it), their
   * colors and the prefix sums. Weights are 1 except on runs whose seed is not
   * one clean face. Null when the tables would pass `budget` entries, counted
   * run by run before anything of their size is allocated.
   */
  private build(budget: number): Band | null {
    const w = this.width
    const h = this.height
    const inBand = this.bandPixels()
    const ry: number[] = []
    const rx0: number[] = []
    const rx1: number[] = []
    const rfirst: number[] = []
    const rfstart: number[] = []
    const rnf: number[] = []
    const rcstart: number[] = []
    const faces: number[] = []
    const valid: number[] = []
    let cells = 0
    let cstart = 0
    let entries = 0
    let maxNf = 1
    let maxLen = 1
    const cf: number[] = []
    const cv: number[] = []
    for (let y = 0; y < h; y++) {
      const seed0 = this.rowSeed(y)
      cf.length = 0
      cv.length = 0
      cf.push(seed0 ?? OUTSIDE)
      cv.push(1)
      this.carryList(this.vhead[y], cf, cv)
      let x = 0
      while (x < w) {
        if (!inBand[y * w + x]) {
          x++
          continue
        }
        const x0 = x
        while (x < w && inBand[y * w + x]) x++
        const x1 = x - 1
        // Left of a run at column 0 is the row's far-left face (the run takes
        // the pieces left of the image itself); left of any other run is an
        // untouched pixel, all one face.
        let seed: number
        let ok: boolean
        if (x0 === 0) {
          seed = seed0 ?? OUTSIDE
          ok = seed0 !== null
        } else {
          let top = -1
          for (let k = 0; k < cv.length; k++) if (top < 0 || cv[k] >= cv[top]) top = k
          seed = top < 0 ? OUTSIDE : cf[top]
          ok = top >= 0 && cf[top] !== OUTSIDE && Math.abs(cv[top] - 1) < 1e-6
          for (let k = 0; ok && k < cv.length; k++) ok = cf[k] === cf[top] || Math.abs(cv[k]) < 1e-6
        }
        const fstart = faces.length
        faces.push(seed)
        this.runFaces(y, x0, x1, faces, fstart)
        const nf = faces.length - fstart
        const len = x1 - x0 + 1
        if (nf > maxNf) maxNf = nf
        if (len > maxLen) maxLen = len
        entries += tableEntries(len, nf)
        if (entries > budget) return null
        // Carry across the run for the next seed.
        if (x0 !== 0) {
          cf.length = 0
          cv.length = 0
          cf.push(seed)
          cv.push(1)
        }
        for (let xx = x0; xx <= x1; xx++) this.carryList(this.head[y * w + xx], cf, cv)
        ry.push(y)
        rx0.push(x0)
        rx1.push(x1)
        rfirst.push(cells)
        rfstart.push(fstart)
        rnf.push(nf)
        rcstart.push(cstart)
        cells += len
        cstart += 4 * len * nf
        for (let k = 0; k < len; k++) valid.push(ok ? 1 : 0)
      }
    }
    const runCount = ry.length
    const band: Band = {
      runCount,
      y: Int32Array.from(ry),
      x0: Int32Array.from(rx0),
      x1: Int32Array.from(rx1),
      first: Int32Array.from(rfirst),
      fstart: Int32Array.from(rfstart),
      nf: Int32Array.from(rnf),
      cstart: Int32Array.from(rcstart),
      pstart: new Int32Array(runCount),
      faces: Int32Array.from(faces),
      colour: new Float64Array(cstart),
      prefix: new Float64Array(0),
      weight: Float64Array.from(valid),
      cells,
      inBand,
      entries,
      maxNf,
      maxLen,
    }
    this.fillColours(band)
    return { ...band, prefix: this.fillPrefix(band) }
  }

  /**
   * Every pixel within {@link REACH} of a pixel holding a piece at the start (a
   * piece left of the image counts as holding column −1 of its row).
   */
  private bandPixels(): Uint8Array {
    const w = this.width
    const h = this.height
    const inb = new Uint8Array(w * h)
    const mark = (cx: number, cy: number): void => {
      const ya = Math.max(cy - REACH, 0)
      const yb = Math.min(cy + REACH, h - 1)
      const xa = Math.max(cx - REACH, 0)
      const xb = Math.min(cx + REACH, w - 1)
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) inb[y * w + x] = 1
    }
    for (let k = 0; k < this.touchedCount; k++) {
      const cell = this.touched[k]
      mark(cell % w, Math.floor(cell / w))
    }
    for (let y = 0; y < h; y++) if (this.vhead[y] >= 0) mark(-1, y)
    return inb
  }

  /**
   * The face on the far left of row `y` at the start: {@link OUTSIDE} when the
   * frame crosses the row, otherwise the face west of the leftmost piece with a
   * height in it (a map without a frame); null for a row no boundary crosses.
   */
  private rowSeed(y: number): number | null {
    const p = this.pieces
    let found = false
    let best = OUTSIDE
    let bestX = 0
    for (let id = this.vhead[y]; id >= 0; id = p.next[id]) {
      if (p.left[id] === OUTSIDE || p.right[id] === OUTSIDE) return OUTSIDE
      const s = p.ty[id] - p.fy[id]
      if (s === 0) continue
      const xm = 0.5 * (p.fx[id] + p.tx[id])
      // Walking down (s > 0) the left face is on +x, so the face towards −x is the right one.
      if (!found || xm < bestX) {
        best = s > 0 ? p.right[id] : p.left[id]
        bestX = xm
        found = true
      }
    }
    for (let x = 0; x < this.width; x++) {
      for (let id = this.head[y * this.width + x]; id >= 0; id = p.next[id]) {
        const s = p.ty[id] - p.fy[id]
        if (s === 0) continue
        const xm = 0.5 * (p.fx[id] + p.tx[id])
        if (!found || xm < bestX) {
          best = s > 0 ? p.right[id] : p.left[id]
          bestX = xm
          found = true
        }
      }
      // Pieces further right cannot lie further left than x − 1.
      if (found) break
    }
    return found ? best : null
  }

  /** Add the heights of the pieces of one list to a carry of `(face, value)` entries. */
  private carryList(first: number, cf: number[], cv: number[]): void {
    const p = this.pieces
    for (let id = first; id >= 0; id = p.next[id]) {
      const s = p.ty[id] - p.fy[id]
      bump(cf, cv, p.left[id], s)
      bump(cf, cv, p.right[id], -s)
    }
  }

  /**
   * Append to `faces[fstart ..]` every face of a piece within {@link REACH} of
   * the run `x0 ..= x1` of row `y` (with the pieces left of the image for a run
   * at column 0).
   */
  private runFaces(y: number, x0: number, x1: number, faces: number[], fstart: number): void {
    const w = this.width
    const p = this.pieces
    const add = (first: number): void => {
      for (let id = first; id >= 0; id = p.next[id]) {
        for (const f of [p.left[id], p.right[id]]) {
          let has = false
          for (let k = fstart; k < faces.length && !has; k++) has = faces[k] === f
          if (!has) faces.push(f)
        }
      }
    }
    const ya = Math.max(y - REACH, 0)
    const yb = Math.min(y + REACH, this.height - 1)
    for (let yy = ya; yy <= yb; yy++) {
      if (x0 === 0) add(this.vhead[yy])
      const xa = Math.max(x0 - REACH, 0)
      const xb = Math.min(x1 + REACH, w - 1)
      for (let xx = xa; xx <= xb; xx++) add(this.head[yy * w + xx])
    }
  }

  /**
   * Every face of every run at every pixel of it, once for the whole solve:
   * its fill at the pixel centre (`at` for a smooth fill), and the observed
   * pixel for {@link OUTSIDE}, which then carries no residual.
   */
  private fillColours(band: Band): void {
    const w = this.width
    const img = this.image.data
    const out = new Float64Array(4)
    const col = band.colour
    let o = 0
    for (let r = 0; r < band.runCount; r++) {
      const nf = band.nf[r]
      const fstart = band.fstart[r]
      const y = band.y[r]
      for (let x = band.x0[r]; x <= band.x1[r]; x++) {
        const cell = 4 * (y * w + x)
        for (let j = 0; j < nf; j++) {
          const f = band.faces[fstart + j]
          if (f < 0) {
            col[o] = img[cell]
            col[o + 1] = img[cell + 1]
            col[o + 2] = img[cell + 2]
            col[o + 3] = img[cell + 3]
          } else {
            const fill = this.fills[f]
            if (fill.at !== undefined) {
              fill.at(x + 0.5, y + 0.5, out)
              col[o] = out[0]
              col[o + 1] = out[1]
              col[o + 2] = out[2]
              col[o + 3] = out[3]
            } else {
              col[o] = fill.r
              col[o + 1] = fill.g
              col[o + 2] = fill.b
              col[o + 3] = fill.a
            }
          }
          o += 4
        }
      }
    }
  }

  /**
   * Each run's prefix sums over its pixels of `w·c_i·c_j` (`i ≤ j`), `w·c_i·t`
   * and `w·t·t`, a leading row of zeros first; sets each run's `pstart`.
   */
  private fillPrefix(band: Band): Float64Array {
    let total = 0
    for (let r = 0; r < band.runCount; r++) {
      const nf = band.nf[r]
      const kk = (nf * (nf + 1)) / 2 + nf + 1
      total += (band.x1[r] - band.x0[r] + 2) * kk
    }
    const out = new Float64Array(total)
    const img = this.image.data
    const col = band.colour
    const w = this.width
    const acc = new Float64Array((band.maxNf * (band.maxNf + 1)) / 2 + band.maxNf + 1)
    let o = 0
    for (let r = 0; r < band.runCount; r++) {
      const nf = band.nf[r]
      const kk = (nf * (nf + 1)) / 2 + nf + 1
      band.pstart[r] = o
      acc.fill(0, 0, kk)
      o += kk
      const len = band.x1[r] - band.x0[r] + 1
      for (let i = 0; i < len; i++) {
        const wgt = band.weight[band.first[r] + i]
        const c0 = band.cstart[r] + 4 * i * nf
        const cell = 4 * (band.y[r] * w + band.x0[r] + i)
        const t0 = img[cell]
        const t1 = img[cell + 1]
        const t2 = img[cell + 2]
        const t3 = img[cell + 3]
        let k = 0
        for (let a = 0; a < nf; a++) {
          const oa = c0 + 4 * a
          for (let b = a; b < nf; b++) {
            const ob = c0 + 4 * b
            const v =
              col[oa] * col[ob] +
              col[oa + 1] * col[ob + 1] +
              col[oa + 2] * col[ob + 2] +
              col[oa + 3] * col[ob + 3]
            acc[k] += wgt * v
            k++
          }
        }
        for (let a = 0; a < nf; a++) {
          const oa = c0 + 4 * a
          const v = col[oa] * t0 + col[oa + 1] * t1 + col[oa + 2] * t2 + col[oa + 3] * t3
          acc[k + a] += wgt * v
        }
        acc[kk - 1] += wgt * (t0 * t0 + t1 * t1 + t2 * t2 + t3 * t3)
        out.set(acc.subarray(0, kk), o)
        o += kk
      }
    }
    return out
  }

  // -------------------------------------------------------------------------
  // Independent parts
  // -------------------------------------------------------------------------

  /**
   * The problem's independent parts, at the start (call right after
   * {@link setup}, whose pieces it reads). Two boundaries are in one part when
   * they share an unknown (a junction) or when pieces of both lie within reach
   * of one run of the band (a piece only ever lands in a run it was within a
   * pixel of at the start). The energy is then exactly the sum of the parts'
   * energies, each minimized on its own: block-separable minimization, as a
   * sparse solver's independent residual blocks (Ceres Solver documentation,
   * `nnls_solving`). Parts with no run (the frame's top, right and bottom,
   * which no pixel reads) are left out. Ordered by their first edge.
   */
  components(): BandPart[] {
    const band = this.band as Band
    const w = this.width
    const h = this.height
    const ne = this.map.edges.length
    const nr = band.runCount
    const parent = new Int32Array(ne + nr)
    for (let i = 0; i < parent.length; i++) parent[i] = i
    const find = (x: number): number => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]]
        x = parent[x]
      }
      return x
    }
    const union = (a: number, b: number): void => {
      const ra = find(a)
      const rb = find(b)
      if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb)
    }
    const { of, count } = this.unknowns
    // Junctions.
    const firstEdge = new Int32Array(count).fill(-1)
    for (let k = 0; k < ne; k++) {
      const ids = of[k]
      for (let i = 0; i < ids.length; i++) {
        const v = ids[i]
        if (firstEdge[v] < 0) firstEdge[v] = k
        else union(firstEdge[v], k)
      }
    }
    // Runs and the boundaries within reach of them.
    const p = this.pieces
    for (let r = 0; r < nr; r++) {
      const node = ne + r
      const y = band.y[r]
      const ya = Math.max(y - REACH, 0)
      const yb = Math.min(y + REACH, h - 1)
      const xa = Math.max(band.x0[r] - REACH, 0)
      const xb = Math.min(band.x1[r] + REACH, w - 1)
      for (let yy = ya; yy <= yb; yy++) {
        if (band.x0[r] === 0) {
          for (let id = this.vhead[yy]; id >= 0; id = p.next[id]) union(node, p.edge[id])
        }
        for (let x = xa; x <= xb; x++) {
          for (let id = this.head[yy * w + x]; id >= 0; id = p.next[id]) union(node, p.edge[id])
        }
      }
    }
    const group = new Int32Array(ne + nr).fill(-1)
    const edges: number[][] = []
    const runs: number[][] = []
    for (let k = 0; k < ne; k++) {
      const root = find(k)
      if (group[root] < 0) {
        group[root] = edges.length
        edges.push([])
        runs.push([])
      }
      edges[group[root]].push(k)
    }
    for (let r = 0; r < nr; r++) {
      const root = find(ne + r)
      if (group[root] < 0) continue
      runs[group[root]].push(r)
    }
    const seen = new Uint8Array(count)
    const parts: BandPart[] = []
    for (let gi = 0; gi < edges.length; gi++) {
      const vars: number[] = []
      for (const k of edges[gi]) {
        const ids = of[k]
        for (let i = 0; i < ids.length; i++) {
          if (!seen[ids[i]]) {
            seen[ids[i]] = 1
            vars.push(ids[i])
          }
        }
      }
      if (runs[gi].length === 0) continue
      parts.push({
        edges: Int32Array.from(edges[gi]),
        runs: Int32Array.from(runs[gi]),
        vars: Int32Array.from(vars),
      })
    }
    return parts
  }
}

/** Adds `s` to face `f`'s entry of a small carry list (appending it when absent). */
function bump(cf: number[], cv: number[], f: number, s: number): void {
  for (let k = 0; k < cf.length; k++) {
    if (cf[k] === f) {
      cv[k] += s
      return
    }
  }
  cf.push(f)
  cv.push(s)
}

/**
 * Push the gradient `(gx, gy)` with respect to one end of a piece back onto
 * the unknowns it depends on. A vertex is its own unknown `v`. A crossing of
 * the segment `a → b` with the vertical gridline `x = line`,
 * `q = a + t(b − a)` with `t = (line − a.x)/dx`, has a fixed x and a y moving
 * with both ends: `∂q.y/∂a.y = 1 − t`, `∂q.y/∂b.y = t`,
 * `∂q.y/∂a.x = dy(t − 1)/dx`, `∂q.y/∂b.x = −dy·t/dx`; a horizontal gridline
 * swaps x and y. A crossing on a segment parallel to its gridline
 * (`|dx| < 10⁻⁹`) contributes nothing.
 */
function scatter(
  kind: number,
  line: number,
  a: number,
  b: number,
  v: number,
  gx: number,
  gy: number,
  pos: Float64Array,
  grad: Float64Array,
): void {
  if (kind === VERTEX) {
    grad[2 * v] += gx
    grad[2 * v + 1] += gy
    return
  }
  const pax = pos[2 * a]
  const pay = pos[2 * a + 1]
  const pbx = pos[2 * b]
  const pby = pos[2 * b + 1]
  if (kind === CROSS_V) {
    const dx = pbx - pax
    if (Math.abs(dx) < 1e-9) return
    const dy = pby - pay
    const t = (line - pax) / dx
    grad[2 * a + 1] += gy * (1 - t)
    grad[2 * b + 1] += gy * t
    grad[2 * a] += (gy * dy * (t - 1)) / dx
    grad[2 * b] -= (gy * dy * t) / dx
    return
  }
  const dy = pby - pay
  if (Math.abs(dy) < 1e-9) return
  const dx = pbx - pax
  const t = (line - pay) / dy
  grad[2 * a] += gx * (1 - t)
  grad[2 * b] += gx * t
  grad[2 * a + 1] += (gx * dx * (t - 1)) / dy
  grad[2 * b + 1] -= (gx * dx * t) / dy
}

/**
 * The energy of a stretch of pixels with the constant coverage `kap`, from the
 * prefix sums at its two ends (`p[o0 ..]`, `p[o1 ..]`): `κᵀ(ΣA)κ − 2κᵀ(Σb) + Σc`.
 */
function stretchEnergy(
  p: Float64Array,
  o0: number,
  o1: number,
  kap: Float64Array,
  nf: number,
): number {
  const kk = (nf * (nf + 1)) / 2 + nf + 1
  let e = p[o1 + kk - 1] - p[o0 + kk - 1]
  let t = 0
  for (let a = 0; a < nf; a++) {
    for (let b = a; b < nf; b++) {
      const f = a === b ? 1 : 2
      e += f * kap[a] * kap[b] * (p[o1 + t] - p[o0 + t])
      t++
    }
  }
  for (let a = 0; a < nf; a++) e -= 2 * kap[a] * (p[o1 + t + a] - p[o0 + t + a])
  return e
}

/** Add a stretch's share of each face's suffix sum, `2((ΣA)κ − Σb)`, to `suf`. */
function stretchGrad(
  p: Float64Array,
  o0: number,
  o1: number,
  kap: Float64Array,
  at: number,
  nf: number,
  suf: Float64Array,
): void {
  let t = 0
  for (let a = 0; a < nf; a++) {
    for (let b = a; b < nf; b++) {
      const dab = p[o1 + t] - p[o0 + t]
      suf[a] += 2 * dab * kap[at + b]
      if (a !== b) suf[b] += 2 * dab * kap[at + a]
      t++
    }
  }
  for (let a = 0; a < nf; a++) suf[a] -= 2 * (p[o1 + t + a] - p[o0 + t + a])
}
