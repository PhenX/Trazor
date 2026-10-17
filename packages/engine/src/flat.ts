import type { PathCommand } from '@trazor/core'
import type { EdgePrimitive, FittedEdge, FlatPoints } from '@trazor/trace'

/**
 * A batch of variable-length number runs packed into one transferable buffer:
 * run `i` is `data.subarray(offsets[i], offsets[i + 1])`. Used for lattice ring
 * points (x, y interleaved) and for encoded command lists, so a helper worker
 * exchanges geometry zero-copy instead of structured-cloning arrays of arrays.
 */
export interface FlatRuns {
  data: Float64Array
  /** Run boundaries; `offsets.length` is the run count + 1. */
  offsets: Int32Array
}

/** The two buffers behind a {@link FlatRuns}, for a zero-copy postMessage. */
export function flatTransferables(runs: FlatRuns): Transferable[] {
  return [runs.data.buffer as ArrayBuffer, runs.offsets.buffer as ArrayBuffer]
}

/** Pack number runs (ring points, control-point lists) into one buffer. */
export function packRuns(runs: readonly ArrayLike<number>[]): FlatRuns {
  const offsets = new Int32Array(runs.length + 1)
  let total = 0
  for (let i = 0; i < runs.length; i++) {
    total += runs[i].length
    offsets[i + 1] = total
  }
  const data = new Float64Array(total)
  let at = 0
  for (const run of runs) {
    data.set(run, at)
    at += run.length
  }
  return { data, offsets }
}

/** Run `index` of a batch as a plain number array. */
export function runAt(runs: FlatRuns, index: number): FlatPoints {
  const from = runs.offsets[index]
  const to = runs.offsets[index + 1]
  const out: FlatPoints = new Array(to - from)
  for (let i = from; i < to; i++) out[i - from] = runs.data[i]
  return out
}

/** Number of runs in a batch. */
export function runCount(runs: FlatRuns): number {
  return runs.offsets.length - 1
}

// Command tags, in the encoded stream's first slot per command.
const TAG_M = 0
const TAG_L = 1
const TAG_Q = 2
const TAG_C = 3
const TAG_A = 4
const TAG_Z = 5

/** Encoded slot count of one command (tag included). */
function commandSize(cmd: PathCommand): number {
  switch (cmd.type) {
    case 'M':
    case 'L':
      return 3
    case 'Q':
      return 5
    case 'C':
      return 7
    case 'A':
      return 8
    case 'Z':
      return 1
  }
}

/** Write one command at `at`, returning the next write position. */
function writeCommand(out: Float64Array, at: number, cmd: PathCommand): number {
  switch (cmd.type) {
    case 'M':
      out[at] = TAG_M
      out[at + 1] = cmd.x
      out[at + 2] = cmd.y
      return at + 3
    case 'L':
      out[at] = TAG_L
      out[at + 1] = cmd.x
      out[at + 2] = cmd.y
      return at + 3
    case 'Q':
      out[at] = TAG_Q
      out[at + 1] = cmd.x1
      out[at + 2] = cmd.y1
      out[at + 3] = cmd.x
      out[at + 4] = cmd.y
      return at + 5
    case 'C':
      out[at] = TAG_C
      out[at + 1] = cmd.x1
      out[at + 2] = cmd.y1
      out[at + 3] = cmd.x2
      out[at + 4] = cmd.y2
      out[at + 5] = cmd.x
      out[at + 6] = cmd.y
      return at + 7
    case 'A':
      out[at] = TAG_A
      out[at + 1] = cmd.rx
      out[at + 2] = cmd.ry
      out[at + 3] = cmd.rotation
      out[at + 4] = cmd.largeArc ? 1 : 0
      out[at + 5] = cmd.sweep ? 1 : 0
      out[at + 6] = cmd.x
      out[at + 7] = cmd.y
      return at + 8
    case 'Z':
      out[at] = TAG_Z
      return at + 1
  }
}

/**
 * Pack command lists into one transferable buffer: `[tag, …operands]` per
 * command, one run per list. Float64 slots hold every coordinate exactly, so a
 * round trip returns the identical numbers.
 */
export function packCommands(lists: readonly (readonly PathCommand[])[]): FlatRuns {
  const offsets = new Int32Array(lists.length + 1)
  let total = 0
  for (let i = 0; i < lists.length; i++) {
    for (const cmd of lists[i]) total += commandSize(cmd)
    offsets[i + 1] = total
  }
  const data = new Float64Array(total)
  let at = 0
  for (const list of lists) {
    for (const cmd of list) at = writeCommand(data, at, cmd)
  }
  return { data, offsets }
}

/** Decode run `index` back into commands. */
export function unpackCommands(runs: FlatRuns, index: number): PathCommand[] {
  const { data } = runs
  const to = runs.offsets[index + 1]
  const out: PathCommand[] = []
  let at = runs.offsets[index]
  while (at < to) {
    switch (data[at]) {
      case TAG_M:
        out.push({ type: 'M', x: data[at + 1], y: data[at + 2] })
        at += 3
        break
      case TAG_L:
        out.push({ type: 'L', x: data[at + 1], y: data[at + 2] })
        at += 3
        break
      case TAG_Q:
        out.push({
          type: 'Q',
          x1: data[at + 1],
          y1: data[at + 2],
          x: data[at + 3],
          y: data[at + 4],
        })
        at += 5
        break
      case TAG_C:
        out.push({
          type: 'C',
          x1: data[at + 1],
          y1: data[at + 2],
          x2: data[at + 3],
          y2: data[at + 4],
          x: data[at + 5],
          y: data[at + 6],
        })
        at += 7
        break
      case TAG_A:
        out.push({
          type: 'A',
          rx: data[at + 1],
          ry: data[at + 2],
          rotation: data[at + 3],
          largeArc: data[at + 4] !== 0,
          sweep: data[at + 5] !== 0,
          x: data[at + 6],
          y: data[at + 7],
        })
        at += 8
        break
      case TAG_Z:
        out.push({ type: 'Z' })
        at += 1
        break
      default:
        throw new Error(`unknown path command tag ${data[at]}`)
    }
  }
  return out
}

/**
 * Slots per fitted edge in a {@link packFits} record: `x0, y0, closed, params,
 * chi2`, the primitive's kind (0 none, 1 circle, 2 ellipse, 3 rect) and up to
 * six primitive numbers.
 */
const FIT_RECORD = 12

/**
 * Pack fitted edges into two transferable buffers: each edge's segments as one
 * command run, and its other fields as one {@link FIT_RECORD}-slot record.
 * Float64 slots hold every number exactly, so {@link unpackFit} returns an
 * edge equal to the one packed, field for field.
 */
export function packFits(fits: readonly FittedEdge[]): {
  commands: FlatRuns
  records: Float64Array
} {
  const records = new Float64Array(fits.length * FIT_RECORD)
  for (let i = 0; i < fits.length; i++) {
    const f = fits[i]
    const at = i * FIT_RECORD
    records[at] = f.x0
    records[at + 1] = f.y0
    records[at + 2] = f.closed ? 1 : 0
    records[at + 3] = f.params
    records[at + 4] = f.chi2
    const p = f.primitive
    if (p === undefined) continue
    switch (p.kind) {
      case 'circle':
        records.set([1, p.cx, p.cy, p.r], at + 5)
        break
      case 'ellipse':
        records.set([2, p.cx, p.cy, p.rx, p.ry, p.rotation], at + 5)
        break
      case 'rect':
        records.set([3, p.cx, p.cy, p.w, p.h, p.r, p.rotation], at + 5)
        break
    }
  }
  return { commands: packCommands(fits.map((f) => f.segments)), records }
}

/** Decode fitted edge `index` of a {@link packFits} pair. */
export function unpackFit(commands: FlatRuns, records: Float64Array, index: number): FittedEdge {
  const r = records.subarray(index * FIT_RECORD, (index + 1) * FIT_RECORD)
  const fit: FittedEdge = {
    x0: r[0],
    y0: r[1],
    segments: unpackCommands(commands, index),
    closed: r[2] !== 0,
    params: r[3],
    chi2: r[4],
  }
  const primitive = primitiveOf(r)
  if (primitive !== null) fit.primitive = primitive
  return fit
}

/** The primitive a fit record carries, or null. */
function primitiveOf(r: Float64Array): EdgePrimitive | null {
  switch (r[5]) {
    case 1:
      return { kind: 'circle', cx: r[6], cy: r[7], r: r[8] }
    case 2:
      return { kind: 'ellipse', cx: r[6], cy: r[7], rx: r[8], ry: r[9], rotation: r[10] }
    case 3:
      return { kind: 'rect', cx: r[6], cy: r[7], w: r[8], h: r[9], r: r[10], rotation: r[11] }
    default:
      return null
  }
}
