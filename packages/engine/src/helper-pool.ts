import { CancelledError } from '@trazor/core'
import type { GrayImage, PathCommand, RasterImage, TurnPolicy } from '@trazor/core'
import type { ChainNetwork, EdgeFitInput, FitConfig, FittedEdge, FlatPoints } from '@trazor/trace'
import type { ShapeOut } from '@trazor/svg'
import { flatTransferables, packRuns, unpackCommands, unpackFit } from './flat'
import type {
  HelperCurveOptions,
  HelperEndpoint,
  HelperInMessage,
  HelperJobKind,
  HelperOutMessage,
  HelperSerializeOptions,
  HelperUnitPaint,
} from './protocol'

/** The stacked-layering plan the coordinator ships to every helper. */
export interface StackPlanPayload {
  width: number
  height: number
  /** Label count of the map (the palette length). */
  labelCount: number
  /** Label per pixel with lifted island pixels folded into their surround. */
  stackLabels: Int32Array
  /** Base-layer paint order (layer index ⇒ label). */
  order: Int32Array
  /** Label of each island layer, in paint order after the base layers. */
  islandLabels: Int32Array
  /** Pixel indices of every island layer, concatenated. */
  islandPixels: Int32Array
  /** Run boundaries into `islandPixels` (`islandLabels` length + 1). */
  islandOffsets: Int32Array
  turnPolicy: TurnPolicy
  minArea: number
}

/** The bw mask's lattice rings, as the coordinator decomposed them. */
export interface RingUnitsPayload {
  width: number
  height: number
  /** Every ring, indexed as the coordinator decomposed them. */
  rings: readonly FlatPoints[]
  /** Signed coverage field; absent in pixel mode. */
  coverage?: GrayImage
}

/** The planar map's edges as their fits read them, and the objective they are fitted under. */
export interface EdgeUnitsPayload {
  /** The image frame's size. */
  width: number
  height: number
  cfg: FitConfig
  /** Every edge's fit inputs, by edge index. */
  edges: readonly EdgeFitInput[]
}

/** What a dispatch asks the helpers to do. */
export interface HelperDispatchSpec {
  kind: HelperJobKind
  /** Unit count; the units are `0 … total - 1`. */
  total: number
  /** Key of the cached payload the units index into (as passed to the setter). */
  stateKey: string
  /** Curve settings; omitted for `fit-edges`, whose objective travels with its edges. */
  curve?: HelperCurveOptions
  /**
   * The helper each unit runs on, by unit index — the owners the payload was
   * shipped under ({@link HelperPool.setEdges}); round-robin when omitted. A
   * unit owned by {@link HelperPool.size} (one past the last helper) is the
   * caller's to run: it is neither sent nor yielded.
   */
  owners?: ArrayLike<number>
  /**
   * Abandons the dispatch when aborted, also while it waits on a helper: the
   * iteration rejects with `CancelledError` and the job is cancelled on every
   * helper.
   */
  signal?: AbortSignal
  /** Paint of the shapes a unit produces; omit to fit without serializing. */
  meta?: (unit: number) => HelperUnitPaint
  /** Serialization settings; omit to fit without serializing. */
  serialize?: HelperSerializeOptions
  /**
   * Per-label palette RGB, enabling sub-pixel color refinement: `fit-chains`
   * refines each shared chain, `trace-layers` each layer's boundary field.
   */
  paletteRgb?: Uint8Array
  /** The transparency cut level whose coverage refines exterior edges. */
  alphaThreshold?: number
  /** `fit-chains`: collapse circular Bézier runs to `A` arcs at this precision. */
  arcPrecision?: number
  /**
   * Units per reply from a helper (default 1). A job of many small units — bw
   * rings, cutout chains — batches them, so the run does not pay a message and
   * an event-loop turn per unit; a job of few large units streams one at a time
   * so progress and the trace snapshots keep up.
   */
  batch?: number
}

/** One completed unit, handed back in unit-index order. */
export interface HelperUnitOutput {
  unit: number
  /**
   * Commands per shape the unit produced (`trace-rings`: one, the ring's fit).
   * For `fit-chains` it is the chain's open run, followed by its closed ring
   * when the chain closes on its own start corner.
   */
  shapes: PathCommand[][]
  /**
   * Serialized shapes in emission order; absent when fitting only. One per entry
   * of `shapes`, or — for a unit with an underlay — the underlay copy of every
   * entry followed by the entry's own copy.
   */
  svg?: (ShapeOut | null)[]
  /** `fit-edges`: the edge's fit, whose segments are `shapes[0]`. */
  fit?: FittedEdge
}

/**
 * Assign units to `count` owners (the helpers, and the caller when it runs a
 * share) so their summed weights come out even: heaviest unit first, each to
 * the owner with the least weight so far (Graham 1969, "Bounds on
 * multiprocessing timing anomalies", SIAM J. Appl. Math. 17(2) — the LPT rule,
 * within 4/3 of the best makespan). Ties go to the lower unit and the lower
 * owner, so the assignment is a function of the weights alone.
 */
export function balancedOwners(weights: readonly number[], count: number): Int32Array {
  const owners = new Int32Array(weights.length)
  if (count <= 1) return owners
  const order = weights.map((_, i) => i).toSorted((a, b) => weights[b] - weights[a] || a - b)
  const load = new Float64Array(count)
  for (const unit of order) {
    let h = 0
    for (let k = 1; k < count; k++) if (load[k] < load[h]) h = k
    owners[unit] = h
    load[h] += weights[unit]
  }
  return owners
}

/** Per-helper bookkeeping: which cached payloads it already holds. */
interface Slot {
  endpoint: HelperEndpoint
  imageKey: string | null
  stackKey: string | null
  ringKey: string | null
  chainKey: string | null
  edgeKey: string | null
}

/** A dispatch in flight: the units still owed, buffered results, and the waiters. */
interface Job {
  id: number
  /** Helpers that have not sent `helper-done` yet. */
  pending: Set<number>
  results: Map<number, HelperUnitOutput>
  error: Error | null
  wake: (() => void) | null
}

/**
 * A set of helper workers the vectorization pipeline farms parallel units out
 * to: stacked layers, bw rings, cutout boundary chains, or planar edge fits.
 * Every helper is a stateful engine instance ({@link installHelperHandler})
 * that caches the working image, the label/ring/chain/edge payload it was
 * given and the rings and polygons it derived — so a warm curve tweak re-fits
 * in the helper without shipping or recomputing geometry.
 *
 * Units are partitioned round-robin by unit index, which is deterministic: a
 * re-run hands each unit to the helper that already holds its cache. Planar
 * edges, whose fits vary in cost by orders of magnitude, go to the owners the
 * caller balanced them over ({@link balancedOwners}), the caller itself among
 * them: it runs its own share while the helpers run theirs. Results are handed back
 * strictly in unit order whatever order the helpers finish in, so the shapes
 * array and the SVG text match a sequential run byte for byte.
 *
 * **Memory.** Each helper holds its own copy of what it is sent: the working
 * image (4·w·h bytes — 45 MB for 4096×2731) plus, for stacked, the label map
 * (4·w·h) and its pixel buckets, for bw its share of the rings and the coverage
 * field (4·w·h), for cutout the chains it owns, and for planar the points and
 * σ of the edges it fits (24 bytes a point). Ring and polygon caches add to
 * that. A consumer sizes the pool for the image it is tracing rather than for
 * the core count alone.
 */
export class HelperPool {
  private readonly slots: Slot[]
  private readonly jobs = new Map<number, Job>()
  private nextJobId = 1

  constructor(endpoints: readonly HelperEndpoint[]) {
    this.slots = endpoints.map((endpoint) => ({
      endpoint,
      imageKey: null,
      stackKey: null,
      ringKey: null,
      chainKey: null,
      edgeKey: null,
    }))
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]
      slot.endpoint.addEventListener('message', (ev) => {
        this.handleMessage(i, ev.data as HelperOutMessage)
      })
      slot.endpoint.start?.()
    }
  }

  /** Number of helpers; 0 means the caller runs everything itself. */
  get size(): number {
    return this.slots.length
  }

  /** The helper that owns `unit` — round-robin, so a re-run reuses its caches. */
  helperOf(unit: number): number {
    return unit % this.slots.length
  }

  /**
   * Cache the working image — and, under transparent handling, the source alpha
   * — on every helper that does not already hold `key`.
   */
  setImage(key: string, image: RasterImage, alpha?: Uint8Array | null): void {
    for (const slot of this.slots) {
      if (slot.imageKey === key) continue
      const buffer = image.data.slice().buffer
      const alphaBuffer = alpha ? alpha.slice().buffer : undefined
      this.send(
        slot,
        {
          type: 'helper-image',
          key,
          width: image.width,
          height: image.height,
          buffer,
          alpha: alphaBuffer,
        },
        alphaBuffer ? [buffer, alphaBuffer] : [buffer],
      )
      slot.imageKey = key
    }
  }

  /** Cache the stacked plan on every helper that does not already hold `key`. */
  setStackPlan(key: string, plan: StackPlanPayload): void {
    for (const slot of this.slots) {
      if (slot.stackKey === key) continue
      const stackLabels = plan.stackLabels.slice().buffer
      const order = plan.order.slice().buffer
      const islandLabels = plan.islandLabels.slice().buffer
      const islandPixels = plan.islandPixels.slice().buffer
      const islandOffsets = plan.islandOffsets.slice().buffer
      this.send(
        slot,
        {
          type: 'helper-stack',
          key,
          width: plan.width,
          height: plan.height,
          labelCount: plan.labelCount,
          stackLabels,
          order,
          islandLabels,
          islandPixels,
          islandOffsets,
          turnPolicy: plan.turnPolicy,
          minArea: plan.minArea,
        },
        [stackLabels, order, islandLabels, islandPixels, islandOffsets],
      )
      slot.stackKey = key
    }
  }

  /**
   * Cache each helper's own share of the bw mask's rings under `key`. Only the
   * rings a helper owns are shipped, so the whole set crosses once.
   */
  setRingUnits(key: string, payload: RingUnitsPayload): void {
    for (let h = 0; h < this.slots.length; h++) {
      const slot = this.slots[h]
      if (slot.ringKey === key) continue
      const units: number[] = []
      const rings: FlatPoints[] = []
      for (let ring = 0; ring < payload.rings.length; ring++) {
        if (this.helperOf(ring) !== h) continue
        units.push(ring)
        rings.push(payload.rings[ring] as FlatPoints)
      }
      const packed = packRuns(rings)
      const unitBuf = new Int32Array(units).buffer
      const coverage = payload.coverage ? payload.coverage.data.slice().buffer : undefined
      this.send(
        slot,
        {
          type: 'helper-rings',
          key,
          width: payload.width,
          height: payload.height,
          units: unitBuf,
          rings: packed,
          coverage,
        },
        [unitBuf, ...flatTransferables(packed), ...(coverage ? [coverage] : [])],
      )
      slot.ringKey = key
    }
  }

  /** Cache each helper's own share of the cutout boundary chains under `key`. */
  setChains(key: string, network: ChainNetwork): void {
    for (let h = 0; h < this.slots.length; h++) {
      const slot = this.slots[h]
      if (slot.chainKey === key) continue
      const units: number[] = []
      const points: FlatPoints[] = []
      const left: number[] = []
      const right: number[] = []
      const loop: number[] = []
      for (let i = 0; i < network.chains.length; i++) {
        if (this.helperOf(i) !== h) continue
        const chain = network.chains[i]
        units.push(i)
        points.push(chain.points)
        left.push(chain.left)
        right.push(chain.right)
        loop.push(chain.loop ? 1 : 0)
      }
      const packed = packRuns(points)
      const unitBuf = new Int32Array(units).buffer
      const leftBuf = new Int32Array(left).buffer
      const rightBuf = new Int32Array(right).buffer
      const loopBuf = new Uint8Array(loop).buffer
      this.send(
        slot,
        {
          type: 'helper-chains',
          key,
          width: network.width,
          height: network.height,
          units: unitBuf,
          left: leftBuf,
          right: rightBuf,
          loop: loopBuf,
          points: packed,
        },
        [unitBuf, leftBuf, rightBuf, loopBuf, ...flatTransferables(packed)],
      )
      slot.chainKey = key
    }
  }

  /**
   * Cache each helper's own share of the planar map's edges under `key`: helper
   * `owners[k]` gets edge `k`, so the whole set crosses once. A key names one
   * map and one assignment; the dispatch that fits them passes the same owners.
   */
  setEdges(key: string, payload: EdgeUnitsPayload, owners: ArrayLike<number>): void {
    for (let h = 0; h < this.slots.length; h++) {
      const slot = this.slots[h]
      if (slot.edgeKey === key) continue
      const units: number[] = []
      const closed: number[] = []
      const points: Float64Array[] = []
      const sigma: Float64Array[] = []
      for (let k = 0; k < payload.edges.length; k++) {
        if (owners[k] !== h) continue
        const edge = payload.edges[k]
        units.push(k)
        closed.push(edge.closed ? 1 : 0)
        points.push(edge.points)
        sigma.push(edge.sigma)
      }
      const packedPoints = packRuns(points)
      const packedSigma = packRuns(sigma)
      const unitBuf = new Int32Array(units).buffer
      const closedBuf = new Uint8Array(closed).buffer
      this.send(
        slot,
        {
          type: 'helper-edges',
          key,
          width: payload.width,
          height: payload.height,
          tau: payload.cfg.tau,
          lambda: payload.cfg.lambda,
          units: unitBuf,
          closed: closedBuf,
          points: packedPoints,
          sigma: packedSigma,
        },
        [unitBuf, closedBuf, ...flatTransferables(packedPoints), ...flatTransferables(packedSigma)],
      )
      slot.edgeKey = key
    }
  }

  /**
   * Run `spec.total` units across the helpers, yielding each helper-owned unit's
   * output in unit-index order. The first step of the iteration posts every
   * helper's job. Abandoning the iteration (a `break`, a `CancelledError` thrown
   * by the consumer, or `spec.signal` aborted) cancels the job on every helper.
   */
  async *dispatch(spec: HelperDispatchSpec): AsyncGenerator<HelperUnitOutput> {
    if (this.slots.length === 0) throw new Error('helper pool is empty')
    const id = this.nextJobId++
    const job: Job = { id, pending: new Set(), results: new Map(), error: null, wake: null }
    this.jobs.set(id, job)
    const abort = (): void => this.abort(job)
    spec.signal?.addEventListener('abort', abort)
    try {
      const buckets: number[][] = this.slots.map(() => [])
      const owners = spec.owners
      const helperOwned = (unit: number): boolean => !owners || owners[unit] < this.slots.length
      for (let unit = 0; unit < spec.total; unit++) {
        if (helperOwned(unit)) buckets[owners ? owners[unit] : this.helperOf(unit)].push(unit)
      }
      for (let h = 0; h < this.slots.length; h++) {
        const units = buckets[h]
        if (units.length === 0) continue
        job.pending.add(h)
        const paletteRgb = spec.paletteRgb ? spec.paletteRgb.slice().buffer : undefined
        this.send(
          this.slots[h],
          {
            type: 'helper-job',
            id,
            kind: spec.kind,
            units,
            stateKey: spec.stateKey,
            curve: spec.curve,
            batch: Math.max(1, spec.batch ?? 1),
            meta: spec.meta ? units.map(spec.meta) : undefined,
            serialize: spec.serialize,
            paletteRgb,
            alphaThreshold: spec.alphaThreshold,
            arcPrecision: spec.arcPrecision,
          },
          paletteRgb ? [paletteRgb] : [],
        )
      }
      for (let unit = 0; unit < spec.total; unit++) {
        if (!helperOwned(unit)) continue
        while (!job.results.has(unit)) {
          if (job.error) throw job.error
          if (job.pending.size === 0) {
            throw new Error(`helper pool: unit ${unit} was never produced`)
          }
          // oxlint-disable-next-line no-await-in-loop
          await new Promise<void>((resolve) => (job.wake = resolve))
        }
        const out = job.results.get(unit) as HelperUnitOutput
        job.results.delete(unit)
        yield out
      }
    } finally {
      spec.signal?.removeEventListener('abort', abort)
      this.jobs.delete(id)
      if (job.pending.size > 0) {
        for (const h of job.pending) {
          this.send(this.slots[h], { type: 'helper-cancel', id })
        }
      }
    }
  }

  /** Cancel every dispatch in flight; each rejects with `CancelledError`. */
  cancel(): void {
    for (const job of this.jobs.values()) this.abort(job)
  }

  // ------------------------------ internals ------------------------------

  /** Fail `job` with `CancelledError`, cancel it on its helpers and wake its waiter. */
  private abort(job: Job): void {
    job.error = new CancelledError()
    for (const h of job.pending) this.send(this.slots[h], { type: 'helper-cancel', id: job.id })
    job.wake?.()
    job.wake = null
  }

  private send(slot: Slot, msg: HelperInMessage, transfer?: Transferable[]): void {
    slot.endpoint.postMessage(msg, transfer)
  }

  private handleMessage(helper: number, msg: HelperOutMessage): void {
    const job = this.jobs.get(msg.id)
    if (!job) return
    switch (msg.type) {
      case 'helper-batch': {
        // Geometry and serialized shapes advance separately: a unit with an
        // underlay serializes its geometry once per paint.
        const records = msg.fits ? new Float64Array(msg.fits) : undefined
        let run = 0
        let part = 0
        for (let u = 0; u < msg.units.length; u++) {
          const count = msg.counts[u]
          const parts = msg.svgCounts?.[u] ?? count
          // A fit-edges unit is one run, its edge's segments, plus one fit record.
          const fit = records ? unpackFit(msg.commands, records, run) : undefined
          const shapes: PathCommand[][] = new Array(count)
          for (let i = 0; i < count; i++) {
            shapes[i] = fit && i === 0 ? fit.segments : unpackCommands(msg.commands, run + i)
          }
          const svg = msg.svg ? msg.svg.slice(part, part + parts) : undefined
          run += count
          part += parts
          job.results.set(msg.units[u], { unit: msg.units[u], shapes, svg, fit })
        }
        break
      }
      case 'helper-done':
        job.pending.delete(helper)
        break
      case 'helper-error':
        job.pending.delete(helper)
        job.error ??= new Error(msg.message)
        break
    }
    job.wake?.()
    job.wake = null
  }
}
