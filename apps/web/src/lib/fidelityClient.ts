import type { RasterImage } from '@trazor/core'
import type { FidelityInMessage, FidelityOutMessage } from '../worker/fidelityProtocol'

/** The scored difference the worker returns: score plus the heatmap raster. */
export interface ScoredDifference {
  score: number
  diff: RasterImage
}

/** Raw result: the heatmap is absent on the score-only (search) path. */
interface RawResult {
  score: number
  diff?: RasterImage
}

interface PendingJob {
  resolve: (result: RawResult) => void
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
      this.jobs.set(id, {
        resolve: (r) => resolve({ score: r.score, diff: r.diff as RasterImage }),
        reject,
      })
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

  /**
   * Store the shared reference raster (source over white) once per search. Every
   * later `scoreAgainst(refId, …)` scores against it, so the reference is
   * transferred a single time instead of per candidate. The buffer is
   * transferred, so the caller must not reuse it.
   */
  setReference(
    refId: number,
    width: number,
    height: number,
    reference: Uint8ClampedArray<ArrayBuffer>,
  ): void {
    const worker = this.ensureWorker()
    const msg: FidelityInMessage = {
      type: 'set-reference',
      refId,
      width,
      height,
      reference: reference.buffer,
    }
    worker.postMessage(msg, [reference.buffer])
  }

  /**
   * Score a rendered raster against a stored reference (from {@link setReference}),
   * returning just the mean-ΔE similarity — no heatmap allocation. For the
   * settings search. The rendered buffer is transferred.
   */
  scoreAgainst(
    refId: number,
    width: number,
    height: number,
    rendered: Uint8ClampedArray<ArrayBuffer>,
  ): Promise<number> {
    const worker = this.ensureWorker()
    const id = this.nextId++
    return new Promise<number>((resolve, reject) => {
      this.jobs.set(id, {
        resolve: (r) => resolve(r.score),
        reject,
      })
      const msg: FidelityInMessage = {
        type: 'score',
        id,
        width,
        height,
        rendered: rendered.buffer,
        refId,
        heatmap: false,
      }
      worker.postMessage(msg, [rendered.buffer])
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
        diff: msg.diff
          ? { width: msg.width, height: msg.height, data: new Uint8ClampedArray(msg.diff) }
          : undefined,
      })
    } else {
      job.reject(new Error(msg.message))
    }
  }
}
