import { CancelledError } from '@trazor/core'
import type {
  GrayImage,
  RasterImage,
  StageId,
  VectorizeResult,
  VectorizeSettings,
} from '@trazor/core'
import type { WorkerInMessage, WorkerOutMessage } from './protocol'

/** Per-job options for {@link TrazorPool.run}. */
export interface PoolJobOptions {
  /**
   * A cache-affinity hint (the candidate's preprocess+palette settings slice).
   * The pool prefers the worker that last ran the same key, so the worker's
   * `StageCache` is warm for the shared stages — a big win for curve-only probes.
   */
  affinityKey?: string
  onProgress?: (stage: StageId, overall: number) => void
  edgeHint?: GrayImage
  coverageHint?: GrayImage
}

interface QueuedJob {
  id: number
  image: RasterImage
  settings: VectorizeSettings
  opts: PoolJobOptions
  resolve: (r: VectorizeResult) => void
  reject: (e: Error) => void
  settled: boolean
}

interface Slot {
  worker: Worker | null
  job: QueuedJob | null
  /** Affinity key of the last job this worker ran (its cache is warm for it). */
  lastAffinity: string | null
}

/**
 * A fixed pool of vectorizer workers for throughput work (the settings search).
 *
 * Unlike {@link TrazorClient}, jobs are **not** latest-wins: every `run()` is
 * queued and resolved independently. A freed worker prefers the next queued job
 * matching its last affinity key (so the worker's `StageCache` stays warm),
 * falling back to FIFO. Each worker keeps its own single-entry cache, and jobs
 * for the same image object carry a stable `imageId` so preprocess/palette work
 * is reused across candidates.
 */
export class TrazorPool {
  private readonly slots: Slot[]
  private readonly queue: QueuedJob[] = []
  private nextId = 1
  private readonly imageIds = new WeakMap<object, number>()
  private nextImageId = 1
  private disposed = false

  constructor(
    private readonly createWorker: () => Worker,
    size: number,
  ) {
    const n = Math.max(1, Math.floor(size))
    this.slots = Array.from({ length: n }, () => ({ worker: null, job: null, lastAffinity: null }))
  }

  /** Number of workers. */
  get size(): number {
    return this.slots.length
  }

  /** Queue a candidate for tracing; resolves with its result, independent of other jobs. */
  run(
    image: RasterImage,
    settings: VectorizeSettings,
    opts: PoolJobOptions = {},
  ): Promise<VectorizeResult> {
    if (this.disposed) return Promise.reject(new Error('pool disposed'))
    return new Promise<VectorizeResult>((resolve, reject) => {
      this.queue.push({ id: this.nextId++, image, settings, opts, resolve, reject, settled: false })
      this.pump()
    })
  }

  /** Reject every queued and in-flight job with `CancelledError` and clear the queue. */
  cancelAll(): void {
    for (const job of this.queue.splice(0)) this.settle(job, null, new CancelledError())
    for (const slot of this.slots) {
      if (slot.job) {
        const job = slot.job
        slot.worker?.postMessage({ type: 'cancel', id: job.id } satisfies WorkerInMessage)
        slot.job = null
        this.settle(job, null, new CancelledError())
      }
    }
  }

  dispose(): void {
    this.disposed = true
    this.cancelAll()
    for (const slot of this.slots) {
      slot.worker?.terminate()
      slot.worker = null
    }
  }

  // ------------------------------ internals ------------------------------

  private idFor(image: RasterImage): number {
    let id = this.imageIds.get(image)
    if (id === undefined) {
      id = this.nextImageId++
      this.imageIds.set(image, id)
    }
    return id
  }

  /** Assign queued jobs to free workers, preferring affinity matches over FIFO. */
  private pump(): void {
    for (const slot of this.slots) {
      if (slot.job || this.queue.length === 0) continue
      const idx = this.pickJob(slot)
      const [job] = this.queue.splice(idx, 1)
      slot.job = job
      this.dispatch(slot, job)
    }
  }

  /** Index of the best queued job for a free slot: first affinity match, else FIFO head. */
  private pickJob(slot: Slot): number {
    if (slot.lastAffinity !== null) {
      const match = this.queue.findIndex((j) => j.opts.affinityKey === slot.lastAffinity)
      if (match >= 0) return match
    }
    return 0
  }

  private dispatch(slot: Slot, job: QueuedJob): void {
    const worker = this.ensureWorker(slot)
    slot.lastAffinity = job.opts.affinityKey ?? null
    const buffer = job.image.data.slice().buffer
    const transfer: Transferable[] = [buffer]
    let edgeHint: ArrayBuffer | undefined
    if (job.opts.edgeHint) {
      edgeHint = job.opts.edgeHint.data.slice().buffer
      transfer.push(edgeHint)
    }
    let coverageHint: ArrayBuffer | undefined
    if (job.opts.coverageHint) {
      coverageHint = job.opts.coverageHint.data.slice().buffer
      transfer.push(coverageHint)
    }
    const msg: WorkerInMessage = {
      type: 'vectorize',
      id: job.id,
      width: job.image.width,
      height: job.image.height,
      buffer,
      settings: job.settings,
      edgeHint,
      coverageHint,
      imageId: this.idFor(job.image),
    }
    worker.postMessage(msg, transfer)
  }

  private ensureWorker(slot: Slot): Worker {
    if (slot.worker) return slot.worker
    const worker = this.createWorker()
    worker.addEventListener('message', (ev: MessageEvent) => {
      this.handleMessage(slot, ev.data as WorkerOutMessage)
    })
    worker.addEventListener('error', (ev: ErrorEvent) => {
      const job = slot.job
      slot.job = null
      slot.worker?.terminate()
      slot.worker = null
      slot.lastAffinity = null
      if (job) this.settle(job, null, new Error(ev.message || 'vectorizer worker crashed'))
      this.pump()
    })
    slot.worker = worker
    return worker
  }

  private handleMessage(slot: Slot, msg: WorkerOutMessage): void {
    const job = slot.job
    if (!job || job.id !== msg.id) return
    switch (msg.type) {
      case 'progress':
        if (!job.settled) job.opts.onProgress?.(msg.stage, msg.overall)
        break
      case 'result':
        slot.job = null
        this.settle(job, msg.result, null)
        this.pump()
        break
      case 'error':
        slot.job = null
        this.settle(job, null, msg.cancelled ? new CancelledError() : new Error(msg.message))
        this.pump()
        break
    }
  }

  private settle(job: QueuedJob, result: VectorizeResult | null, error: Error | null): void {
    if (job.settled) return
    job.settled = true
    if (error) job.reject(error)
    else if (result) job.resolve(result)
  }
}
