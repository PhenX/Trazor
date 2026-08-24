import type { RasterImage } from '@trazor/core'
import type { FidelityInMessage, FidelityOutMessage } from '../worker/fidelityProtocol'

/** The scored difference the worker returns: score plus the heatmap raster. */
export interface ScoredDifference {
  score: number
  diff: RasterImage
}

interface PendingJob {
  resolve: (result: ScoredDifference) => void
  reject: (error: Error) => void
}

/**
 * Main-thread handle on the fidelity worker. The per-pixel Oklab ΔE pass (twice
 * per pixel, at result resolution) runs off the UI thread; the caller does the
 * DOM-bound rasterization and hands over the two RGBA rasters. Jobs are matched
 * by id; the caller drops results for a superseded run. The worker is spawned
 * lazily and respawned after a crash.
 */
export class FidelityClient {
  private worker: Worker | null = null
  private nextId = 1
  private jobs = new Map<number, PendingJob>()

  constructor(private createWorker: () => Worker) {}

  /**
   * Score a rendered raster against a reference raster (both RGBA, `width`×
   * `height`, composited over white). The buffers are transferred, so the
   * caller must not reuse them afterward.
   */
  score(
    width: number,
    height: number,
    rendered: Uint8ClampedArray<ArrayBuffer>,
    reference: Uint8ClampedArray<ArrayBuffer>,
  ): Promise<ScoredDifference> {
    const worker = this.ensureWorker()
    const id = this.nextId++
    return new Promise<ScoredDifference>((resolve, reject) => {
      this.jobs.set(id, { resolve, reject })
      const msg: FidelityInMessage = {
        type: 'score',
        id,
        width,
        height,
        rendered: rendered.buffer,
        reference: reference.buffer,
      }
      worker.postMessage(msg, [rendered.buffer, reference.buffer])
    })
  }

  dispose(): void {
    this.worker?.terminate()
    this.worker = null
    this.jobs.clear()
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = this.createWorker()
    worker.addEventListener('message', (ev: MessageEvent) => {
      this.handleMessage(ev.data as FidelityOutMessage)
    })
    worker.addEventListener('error', (ev: ErrorEvent) => {
      // A crashed worker fails every pending job and gets respawned lazily.
      for (const job of this.jobs.values()) {
        job.reject(new Error(ev.message || 'fidelity worker crashed'))
      }
      this.jobs.clear()
      worker.terminate()
      if (this.worker === worker) this.worker = null
    })
    this.worker = worker
    return worker
  }

  private handleMessage(msg: FidelityOutMessage): void {
    const job = this.jobs.get(msg.id)
    if (!job) return
    this.jobs.delete(msg.id)
    if (msg.type === 'result') {
      job.resolve({
        score: msg.score,
        diff: { width: msg.width, height: msg.height, data: new Uint8ClampedArray(msg.diff) },
      })
    } else {
      job.reject(new Error(msg.message))
    }
  }
}
