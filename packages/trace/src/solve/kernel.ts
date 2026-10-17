/**
 * The boundary solve's descent compiled to WebAssembly: an opt-in kernel that
 * runs {@link lbfgsDescend} on a {@link BandProblem}'s energy inside a
 * WebAssembly module instead of in TypeScript.
 *
 * The module (`crates/solve`, built by `npm run build:wasm` into
 * `packages/trace/wasm/solve.wasm`) is a port of `band.ts`'s energy and
 * gradient, `lbfgs.ts` and `linesearch.ts` that sums every sum in the same
 * order and keeps every expression's order of operations; the energy is plain
 * IEEE 754 arithmetic and square roots, so the descent computes bit for bit the
 * positions the TypeScript computes. Everything else stays here: the band is
 * built and the parts found by {@link BandProblem.setup} and
 * {@link BandProblem.components} (a gradient fill is read through its closure),
 * and the fold guard and the write-back run after.
 *
 * Each descent runs in a fresh instance of the module over a fresh memory
 * ({@link solveBytes} sizes it for everything the solve allocates, and the
 * module's allocator never frees, so the memory never grows):
 *
 * 1. the sizes go into the module's exchange area and `problem_new` allocates
 *    every array, writing their addresses back into the area;
 * 2. each array is filled through a view on the memory: the unknowns, the
 *    edges' unknowns and faces, the band's runs, colors, prefix sums, weights
 *    and observed pixels, the parts;
 * 3. `problem_solve` runs the descent; `problem_x` and `problem_stats` hold the
 *    result, `problem_steps` the accepted steps when they were asked for;
 * 4. the instance and its memory are dropped.
 *
 * A memory that never grows never detaches its buffer: in V8 one detached
 * `ArrayBuffer` slows every typed-array access of the thread from then on.
 *
 * The module imports only its memory and runs in Node and in a Web Worker
 * alike: {@link loadBandKernel} takes its bytes or a compiled
 * `WebAssembly.Module` (a worker receives one by `postMessage`), so this
 * package never reads a file or fetches a URL.
 */
import type { BandPart, BandProblem } from './band'
import type { LbfgsResult, LbfgsStep } from './lbfgs'
import { MAX_ITERS, MAX_STEP, MAX_TOTAL } from './lbfgs'

/** Entries of the exchange area the sizes take (the module's `SIZES`). */
const SIZES = 17
/** Entries of the exchange area the array addresses take (the module's `ARRAYS`). */
const ARRAYS = 28
/** Numbers per recorded step. */
const STEP_WORDS = 8
/** The module's exported global holding where its heap starts (the linker's symbol). */
const HEAP_BASE = '__heap_base'
/** WebAssembly page size, in bytes. */
const PAGE = 65536

/** The module's exports (`crates/solve/src/lib.rs`). */
interface SolveExports {
  io(): number
  problem_new(): number
  problem_solve(
    p: number,
    wKink: number,
    wAnchor: number,
    maxStep: number,
    maxTotal: number,
    maxIters: number,
    budget: number,
    fixedEnergy: number,
    record: number,
  ): number
  problem_x(p: number): number
  problem_stats(p: number): number
  problem_steps(p: number): number
}

/** The descent's settings, as {@link LbfgsOptions} names them. */
export interface KernelDescentOptions {
  maxStep?: number
  maxTotal?: number
  maxIters?: number
  iterationBudget?: number
  fixedEnergy?: number
  onStep?: (step: LbfgsStep) => void
}

/**
 * The last descent's phases, wall time in ms: the memory and the instance made,
 * the problem copied in, the solve, the result copied out; the bytes copied in
 * and the bytes the memory had to grow by (0 when the size was right).
 */
export interface KernelTimings {
  instantiate: number
  copyIn: number
  solve: number
  copyOut: number
  bytes: number
  grown: number
}

/** The sizes of one problem, as the module reads them, and what it allocates. */
interface Sizes {
  n: number
  ne: number
  nids: number
  pe: number
  pr: number
  pv: number
  pieces: number
}

/**
 * Upper bound of the bytes the module allocates for one solve, from its sizes
 * (`crates/solve/src/lib.rs` `problem_new`, `band.rs` `Energy::new`, `lbfgs.rs`):
 * the inputs, the evaluation's scratch for `pieces` pieces, and the descent's
 * positions, the buffers and curvature pairs of its largest part, which every
 * part reuses (and the recorded steps,
 * grown by doubling), plus the crossing lists and 64 KiB for padding and any
 * crossing list that has to grow.
 */
export function solveBytes(
  prob: BandProblem,
  parts: readonly BandPart[],
  s: Sizes,
  record: boolean,
): number {
  const band = prob.band as NonNullable<BandProblem['band']>
  const w = prob.width
  const h = prob.height
  const nr = band.runCount
  const np = parts.length
  const inputs =
    16 * s.n +
    2 * s.n +
    9 * s.ne +
    4 * (s.ne + 1) +
    4 * s.nids +
    32 * nr +
    4 * band.faces.length +
    8 * band.colour.length +
    8 * band.prefix.length +
    24 * band.cells +
    w * h +
    12 * (np + 1) +
    4 * (s.pe + s.pr + s.pv)
  const scratch =
    (56 + 4 + 32 + 32 + 32) * s.pieces +
    8 * w * h +
    12 * h +
    24 * band.maxNf +
    16 * band.maxLen * band.maxNf +
    12 * band.maxLen
  let most = 0
  for (const p of parts) most = Math.max(most, p.vars.length)
  const descent = 48 * s.n + 261 * most + 64 * np + (record ? 4 * 64 * 64 * np : 0)
  return inputs + scratch + descent + 4 * 8 * 64 + 65536
}

/**
 * Most pieces one evaluation can cut: per segment one, plus every gridline it
 * can cross with each end within `maxTotal` of its start.
 */
function maxPieces(prob: BandProblem, maxTotal: number): number {
  const { of, start } = prob.unknowns
  const edges = prob.map.edges
  const reach = 2 * (Number.isFinite(maxTotal) ? maxTotal : Math.max(prob.width, prob.height))
  let total = 0
  for (let k = 0; k < edges.length; k++) {
    const ids = of[k]
    const n = ids.length
    if (n < 2) continue
    const last = edges[k].closed ? n : n - 1
    for (let i = 0; i < last; i++) {
      const a = ids[i]
      const b = ids[i + 1 === n ? 0 : i + 1]
      const dx = Math.abs(start[2 * b] - start[2 * a])
      const dy = Math.abs(start[2 * b + 1] - start[2 * a + 1])
      total += 1 + Math.ceil(dx + reach) + Math.ceil(dy + reach)
    }
  }
  return total
}

/**
 * The compiled descent. Each solve instantiates it afresh over its own memory;
 * one kernel serves any number of solves, one at a time (a solve is
 * synchronous).
 */
export class BandKernel {
  private readonly module: WebAssembly.Module
  /** First byte the module's allocator hands out. */
  private readonly heapBase: number
  /**
   * When set, each descent records {@link timings} (with `performance.now()`,
   * which never reaches the output).
   */
  measure = false
  /** The last descent's phases, when {@link measure} is set. */
  readonly timings: KernelTimings = {
    instantiate: 0,
    copyIn: 0,
    solve: 0,
    copyOut: 0,
    bytes: 0,
    grown: 0,
  }

  constructor(module: WebAssembly.Module, heapBase: number) {
    this.module = module
    this.heapBase = heapBase
  }

  /**
   * {@link lbfgsDescend} on `prob`'s energy (set up, its weights set) over
   * `parts`, from the unknowns' start: the same result, computed in the
   * module. Steps are reported to `opts.onStep` after the descent, in order.
   * Null when the module could not run it: its memory could not be allocated,
   * or the module trapped (the caller then runs the TypeScript descent).
   */
  descend(
    prob: BandProblem,
    parts: readonly BandPart[],
    opts: KernelDescentOptions = {},
  ): LbfgsResult | undefined | null {
    if (prob.band === null) throw new Error('BandKernel: the problem is not set up')
    const maxTotal = opts.maxTotal ?? MAX_TOTAL
    const maxStep = opts.maxStep ?? MAX_STEP
    if (!(maxTotal > 0)) throw new RangeError('BandKernel: maxTotal must be positive')
    if (!(maxStep > 0 && Number.isFinite(maxStep))) {
      throw new RangeError('BandKernel: maxStep must be positive and finite')
    }
    try {
      return this.run(prob, parts, opts)
    } catch (e) {
      if (e instanceof RangeError || e instanceof WebAssembly.RuntimeError) return null
      throw e
    }
  }

  private run(
    prob: BandProblem,
    parts: readonly BandPart[],
    opts: KernelDescentOptions,
  ): LbfgsResult | undefined {
    const band = prob.band as NonNullable<BandProblem['band']>
    const u = prob.unknowns
    const n = u.count
    const maxTotal = opts.maxTotal ?? MAX_TOTAL
    const maxStep = opts.maxStep ?? MAX_STEP
    const measure = this.measure
    const t0 = measure ? performance.now() : 0
    const edges = prob.map.edges
    const ne = edges.length
    let nids = 0
    for (const ids of u.of) nids += ids.length
    let pe = 0
    let pr = 0
    let pv = 0
    for (const p of parts) {
      pe += p.edges.length
      pr += p.runs.length
      pv += p.vars.length
    }
    const record = opts.onStep !== undefined
    const sizes: Sizes = { n, ne, nids, pe, pr, pv, pieces: maxPieces(prob, maxTotal) }
    const pages = Math.ceil((this.heapBase + solveBytes(prob, parts, sizes, record)) / PAGE)
    const memory = new WebAssembly.Memory({ initial: pages })
    const ex = new WebAssembly.Instance(this.module, { env: { memory } })
      .exports as unknown as SolveExports
    const t1 = measure ? performance.now() : 0
    new Uint32Array(memory.buffer, ex.io(), SIZES).set([
      prob.width,
      prob.height,
      n,
      ne,
      nids,
      band.runCount,
      band.faces.length,
      band.colour.length,
      band.prefix.length,
      band.cells,
      parts.length,
      pe,
      pr,
      pv,
      band.maxNf,
      band.maxLen,
      sizes.pieces,
    ])
    const handle = ex.problem_new()
    const buf = memory.buffer
    const at = new Uint32Array(buf, ex.io() + 4 * SIZES, ARRAYS)
    let a = 0
    const f64 = (len: number) => new Float64Array(buf, at[a++], len)
    const i32 = (len: number) => new Int32Array(buf, at[a++], len)
    const u8 = (len: number) => new Uint8Array(buf, at[a++], len)
    const f32 = (len: number) => new Float32Array(buf, at[a++], len)
    f64(2 * n).set(u.start)
    u8(n).set(u.pin)
    u8(n).set(u.junction)
    const left = i32(ne)
    const right = i32(ne)
    const closed = u8(ne)
    const off = i32(ne + 1)
    const ids = i32(nids)
    let o = 0
    for (let k = 0; k < ne; k++) {
      const e = edges[k]
      left[k] = e.left
      right[k] = e.right
      closed[k] = e.closed ? 1 : 0
      off[k] = o
      ids.set(u.of[k], o)
      o += u.of[k].length
    }
    off[ne] = o
    const nr = band.runCount
    i32(nr).set(band.y)
    i32(nr).set(band.x0)
    i32(nr).set(band.x1)
    i32(nr).set(band.first)
    i32(nr).set(band.fstart)
    i32(nr).set(band.nf)
    i32(nr).set(band.cstart)
    i32(nr).set(band.pstart)
    i32(band.faces.length).set(band.faces)
    f64(band.colour.length).set(band.colour)
    f64(band.prefix.length).set(band.prefix)
    f64(band.cells).set(band.weight)
    // The observed pixels of the band, in band-pixel order.
    const target = f32(4 * band.cells)
    const img = prob.image.data
    const w = prob.width
    for (let r = 0; r < nr; r++) {
      const from = 4 * (band.y[r] * w + band.x0[r])
      const len = band.x1[r] - band.x0[r] + 1
      target.set(img.subarray(from, from + 4 * len), 4 * band.first[r])
    }
    u8(band.inBand.length).set(band.inBand)
    const flat = (pick: (p: BandPart) => Int32Array, total: number): void => {
      const offs = i32(parts.length + 1)
      const all = i32(total)
      let q = 0
      for (let k = 0; k < parts.length; k++) {
        const list = pick(parts[k])
        offs[k] = q
        all.set(list, q)
        q += list.length
      }
      offs[parts.length] = q
    }
    flat((p) => p.edges, pe)
    flat((p) => p.runs, pr)
    flat((p) => p.vars, pv)
    const t2 = measure ? performance.now() : 0
    const ok = ex.problem_solve(
      handle,
      prob.wKink,
      prob.wAnchor,
      maxStep,
      maxTotal,
      Math.min(opts.maxIters ?? MAX_ITERS, MAX_ITERS),
      opts.iterationBudget ?? Infinity,
      opts.fixedEnergy ?? 0,
      record ? 1 : 0,
    )
    const t3 = measure ? performance.now() : 0
    // A memory sized too small grew during the solve: fresh views.
    const out = memory.buffer
    const stats = new Float64Array(out, ex.problem_stats(handle), 5)
    if (opts.onStep !== undefined && stats[4] > 0) {
      const s = new Float64Array(out, ex.problem_steps(handle), STEP_WORDS * stats[4])
      for (let k = 0; k < s.length; k += STEP_WORDS) {
        opts.onStep({
          part: s[k],
          iter: s[k + 1],
          step: s[k + 2],
          trials: s[k + 3],
          energy: s[k + 4],
          rel: s[k + 5],
          moved: s[k + 6],
          pg: s[k + 7],
        })
      }
    }
    const result =
      ok === 1
        ? {
            x: new Float64Array(out, ex.problem_x(handle), 2 * n).slice(),
            before: stats[0],
            after: stats[1],
            iters: stats[2],
            evals: stats[3],
          }
        : undefined
    if (measure) {
      const t = this.timings
      t.instantiate = t1 - t0
      t.copyIn = t2 - t1
      t.solve = t3 - t2
      t.copyOut = performance.now() - t3
      t.bytes =
        8 * (2 * n + band.colour.length + band.prefix.length + band.cells) +
        4 * (ne * 3 + nids + 8 * nr + band.faces.length + 4 * band.cells + pe + pr + pv) +
        2 * n +
        ne +
        band.inBand.length
      t.grown = out.byteLength - pages * PAGE
    }
    return result
  }
}

/**
 * Compile (from bytes) or take the descent's module
 * (`packages/trace/wasm/solve.wasm`) and read where its heap starts.
 */
export async function loadBandKernel(
  source: BufferSource | WebAssembly.Module,
): Promise<BandKernel> {
  const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source)
  // A throwaway instance over a memory well above the module's data and stack.
  const probe = await WebAssembly.instantiate(module, {
    env: { memory: new WebAssembly.Memory({ initial: 256 }) },
  })
  const heapBase = (probe.exports as Record<string, WebAssembly.Global>)[HEAP_BASE].value as number
  return new BandKernel(module, heapBase)
}
