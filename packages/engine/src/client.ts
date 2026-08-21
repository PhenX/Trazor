import { CancelledError } from '@vectorizer/core'
import type { RasterImage, StageId, VectorizeResult, VectorizeSettings } from '@vectorizer/core'
import type { WorkerInMessage, WorkerOutMessage } from './protocol'

interface PendingJob {
  resolve: (r: VectorizeResult) => void
  reject: (e: Error) => void
  onProgress?: (stage: StageId, overall: number) => void
  settled: boolean
}

/**
 * Main-thread handle on the vectorizer worker. Latest-wins semantics: starting
 * a new run cancels the pending one (its promise rejects with CancelledError).
 * The worker is spawned lazily and respawned after a crash.
 */
export class VectorizerClient {
  private worker: Worker | null = null
  private nextId = 1
  private jobs = new Map<number, PendingJob>()

  constructor(private createWorker: () => Worker) {}

  vectorize(
    image: RasterImage,
    settings: VectorizeSettings,
    onProgress?: (stage: StageId, overall: number) => void,
  ): Promise<VectorizeResult> {
    this.cancelPending()
    const worker = this.ensureWorker()
    const id = this.nextId++

    return new Promise<VectorizeResult>((resolve, reject) => {
      this.jobs.set(id, { resolve, reject, onProgress, settled: false })
      // Copy: transferring the original buffer would detach the caller's image.
      const buffer = image.data.slice().buffer
      const msg: WorkerInMessage = {
        type: 'vectorize',
        id,
        width: image.width,
        height: image.height,
        buffer,
        settings,
      }
      worker.postMessage(msg, [buffer])
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
