import { CancelledError } from '@trazor/core'
import type { GrayImage, PathCommand, RasterImage, TurnPolicy } from '@trazor/core'
import type { ChainNetwork, FlatPoints } from '@trazor/trace'
import type { ShapeOut } from '@trazor/svg'
import { flatTransferables, packRuns, unpackCommands } from './flat'
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

/** What a dispatch asks the helpers to do. */
export interface HelperDispatchSpec {
  kind: HelperJobKind
  /** Unit count; the units are `0 … total - 1`. */
  total: number
  /** Key of the cached payload the units index into (as passed to the setter). */
  stateKey: string
  curve: HelperCurveOptions
  /** Paint of the shapes a unit produces; omit to fit without serializing. */
  meta?: (unit: number) => HelperUnitPaint
  /** Serialization settings; omit to fit without serializing. */
  serialize?: HelperSerializeOptions
  /** `fit-chains`: per-label palette Oklab, enabling sub-pixel color refinement. */
  paletteOklab?: Float32Array
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
}

/** Per-helper bookkeeping: which cached payloads it already holds. */
interface Slot {
  endpoint: HelperEndpoint
  imageKey: string | null
  stackKey: string | null
  ringKey: string | null
  chainKey: string | null
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
 * to: stacked layers, bw rings, or cutout boundary chains. Every helper is a
 * stateful engine instance ({@link installHelperHandler}) that caches the
 * working image, the label/ring/chain payload it was given and the rings and
 * polygons it derived — so a warm curve tweak re-fits in the helper without
 * shipping or recomputing geometry.
 *
 * Units are partitioned round-robin by unit index, which is deterministic: a
 * re-run hands each unit to the helper that already holds its cache. Results
 * are handed back strictly in unit order whatever order the helpers finish in,
 * so the shapes array and the SVG text match a sequential run byte for byte.
 *
 * **Memory.** Each helper holds its own copy of what it is sent: the working
 * image (4·w·h bytes — 45 MB for 4096×2731) plus, for stacked, the label map
 * (4·w·h) and its pixel buckets, for bw its share of the rings and the coverage
 * field (4·w·h), and for cutout the Oklab buffer it derives (12·w·h). Ring and
 * polygon caches add to that. A consumer sizes the pool for the image it is
 * tracing rather than for the core count alone.
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
    }))
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]
      slot.endpoint.addEventListener('message', (ev) => {
        this.handleMessage(i, ev.data as HelperOutMessage)
      })
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

  /** Cache the working image on every helper that does not already hold `key`. */
  setImage(key: string, image: RasterImage): void {
    for (const slot of this.slots) {
      if (slot.imageKey === key) continue
      const buffer = image.data.slice().buffer
      this.send(
        slot,
        {
          type: 'helper-image',
          key,
          width: image.width,
          height: image.height,
          buffer,
        },
        [buffer],
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
   * Run `spec.total` units across the helpers, yielding each unit's output in
   * unit-index order. Abandoning the iteration (a `break`, or a `CancelledError`
   * thrown by the consumer) cancels the job on every helper.
   */
  async *dispatch(spec: HelperDispatchSpec): AsyncGenerator<HelperUnitOutput> {
    if (this.slots.length === 0) throw new Error('helper pool is empty')
    const id = this.nextJobId++
    const job: Job = { id, pending: new Set(), results: new Map(), error: null, wake: null }
    this.jobs.set(id, job)
    try {
      const buckets: number[][] = this.slots.map(() => [])
      for (let unit = 0; unit < spec.total; unit++) buckets[this.helperOf(unit)].push(unit)
      for (let h = 0; h < this.slots.length; h++) {
        const units = buckets[h]
        if (units.length === 0) continue
        job.pending.add(h)
        const paletteOklab = spec.paletteOklab ? spec.paletteOklab.slice().buffer : undefined
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
            paletteOklab,
            arcPrecision: spec.arcPrecision,
          },
          paletteOklab ? [paletteOklab] : undefined,
        )
      }
      for (let unit = 0; unit < spec.total; unit++) {
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
    for (const job of this.jobs.values()) {
      job.error = new CancelledError()
      for (const h of job.pending) this.send(this.slots[h], { type: 'helper-cancel', id: job.id })
      job.wake?.()
      job.wake = null
    }
  }

  // ------------------------------ internals ------------------------------

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
        let run = 0
        let part = 0
        for (let u = 0; u < msg.units.length; u++) {
          const count = msg.counts[u]
          const parts = msg.svgCounts?.[u] ?? count
          const shapes: PathCommand[][] = new Array(count)
          for (let i = 0; i < count; i++) shapes[i] = unpackCommands(msg.commands, run + i)
          const svg = msg.svg ? msg.svg.slice(part, part + parts) : undefined
          run += count
          part += parts
          job.results.set(msg.units[u], { unit: msg.units[u], shapes, svg })
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
