import { CancelledError } from '@trazor/core'
import type {
  GrayImage,
  RasterImage,
  StageId,
  TraceStep,
  VectorizeResult,
  VectorizeSettings,
} from '@trazor/core'
import type { WorkerInMessage, WorkerOutMessage } from './protocol'

interface PendingJob {
  resolve: (r: VectorizeResult) => void
  reject: (e: Error) => void
  onProgress?: (stage: StageId, overall: number) => void
  onTrace?: (step: TraceStep) => void
  settled: boolean
}

/**
 * Main-thread handle on the vectorizer worker. Latest-wins semantics: starting
 * a new run cancels the pending one (its promise rejects with CancelledError).
 * The worker is spawned lazily and respawned after a crash.
 */
export class TrazorClient {
  private worker: Worker | null = null
  private nextId = 1
  private jobs = new Map<number, PendingJob>()
  // Stable identity per working-image object, so the worker can reuse cached
  // preprocess/palette work while the same image is tuned. The app replaces the
  // image object whenever its pixels change, so object identity tracks content.
  private imageIds = new WeakMap<object, number>()
  private nextImageId = 1

  constructor(private createWorker: () => Worker) {}

  private idFor(image: RasterImage): number {
    let id = this.imageIds.get(image)
    if (id === undefined) {
      id = this.nextImageId++
      this.imageIds.set(image, id)
    }
    return id
  }

  vectorize(
    image: RasterImage,
    settings: VectorizeSettings,
    onProgress?: (stage: StageId, overall: number) => void,
    // Optional boundary hint (from EdgeEnhancer), same dimensions as `image`.
    edgeHint?: GrayImage,
    // Optional learned coverage field (from FieldEnhancer), same dimensions as `image`.
    coverageHint?: GrayImage,
    // Optional step tracer: receives a `TraceStep` per pipeline stage as it completes.
    onTrace?: (step: TraceStep) => void,
  ): Promise<VectorizeResult> {
    this.cancelPending()
    const worker = this.ensureWorker()
    const id = this.nextId++

    return new Promise<VectorizeResult>((resolve, reject) => {
      this.jobs.set(id, { resolve, reject, onProgress, onTrace, settled: false })
      // Copy: transferring the original buffers would detach the caller's data.
      const buffer = image.data.slice().buffer
      const transfer: Transferable[] = [buffer]
      let hint: ArrayBuffer | undefined
      if (edgeHint) {
        hint = edgeHint.data.slice().buffer
        transfer.push(hint)
      }
      let cov: ArrayBuffer | undefined
      if (coverageHint) {
        cov = coverageHint.data.slice().buffer
        transfer.push(cov)
      }
      const msg: WorkerInMessage = {
        type: 'vectorize',
        id,
        width: image.width,
        height: image.height,
        buffer,
        settings,
        edgeHint: hint,
        coverageHint: cov,
        imageId: this.idFor(image),
        trace: onTrace !== undefined,
        // The interactive client always wants the raw document available for
        // on-demand exports (the batch pool omits it to skip the extra payload).
        withDocument: true,
      }
      worker.postMessage(msg, transfer)
    })
  }

  /** Cancel all in-flight runs (their promises reject with CancelledError). */
  cancelPending(): void {
    for (const [id, job] of this.jobs) {
      if (!job.settled) {
        job.settled = true
        this.worker?.postMessage({ type: 'cancel', id } satisfies WorkerInMessage)
        job.reject(new CancelledError())
      }
    }
    this.jobs.clear()
  }

  dispose(): void {
    this.cancelPending()
    this.worker?.terminate()
    this.worker = null
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = this.createWorker()
    worker.addEventListener('message', (ev: MessageEvent) => {
      this.handleMessage(ev.data as WorkerOutMessage)
    })
    worker.addEventListener('error', (ev: ErrorEvent) => {
      // A crashed worker fails every pending job and gets respawned lazily.
      for (const job of this.jobs.values()) {
        if (!job.settled) {
          job.settled = true
          job.reject(new Error(ev.message || 'vectorizer worker crashed'))
        }
      }
      this.jobs.clear()
      worker.terminate()
      if (this.worker === worker) this.worker = null
    })
    this.worker = worker
    return worker
  }

  private handleMessage(msg: WorkerOutMessage): void {
    const job = this.jobs.get(msg.id)
    if (!job) return
    switch (msg.type) {
      case 'progress':
        if (!job.settled) job.onProgress?.(msg.stage, msg.overall)
        break
      case 'trace-step':
        if (!job.settled) job.onTrace?.(msg.step)
        break
      case 'result':
        if (!job.settled) {
          job.settled = true
          job.resolve(msg.result)
        }
        this.jobs.delete(msg.id)
        break
      case 'error':
        if (!job.settled) {
          job.settled = true
          job.reject(msg.cancelled ? new CancelledError() : new Error(msg.message))
        }
        this.jobs.delete(msg.id)
        break
    }
  }
}
