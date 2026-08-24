import type { RasterImage } from '@trazor/core'
import type { ImageAnalysis, PaletteSuggestion } from '@trazor/assist'
import type { AssistInMessage, AssistOutMessage } from '../worker/assistProtocol'

interface PendingJob {
  resolve: (suggestions: PaletteSuggestion[]) => void
  reject: (error: Error) => void
}

/**
 * Main-thread handle on the assist worker. Palette suggestion is a full-image
 * k-means pass (several, for a photo), so it runs off the UI thread. Jobs are
 * matched by id; the caller drops results for a superseded image. The worker is
 * spawned lazily and respawned after a crash.
 */
export class AssistClient {
  private worker: Worker | null = null
  private nextId = 1
  private jobs = new Map<number, PendingJob>()

  constructor(private createWorker: () => Worker) {}

  suggestPalettes(image: RasterImage, analysis: ImageAnalysis): Promise<PaletteSuggestion[]> {
    const worker = this.ensureWorker()
    const id = this.nextId++
    return new Promise<PaletteSuggestion[]>((resolve, reject) => {
      this.jobs.set(id, { resolve, reject })
      // Copy: transferring the original buffer would detach the caller's image.
      const buffer = image.data.slice().buffer
      const msg: AssistInMessage = {
        type: 'suggestPalettes',
        id,
        width: image.width,
        height: image.height,
        buffer,
        analysis,
      }
      worker.postMessage(msg, [buffer])
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
      this.handleMessage(ev.data as AssistOutMessage)
    })
    worker.addEventListener('error', (ev: ErrorEvent) => {
      // A crashed worker fails every pending job and gets respawned lazily.
      for (const job of this.jobs.values()) {
        job.reject(new Error(ev.message || 'assist worker crashed'))
      }
      this.jobs.clear()
      worker.terminate()
      if (this.worker === worker) this.worker = null
    })
    this.worker = worker
    return worker
  }

  private handleMessage(msg: AssistOutMessage): void {
    const job = this.jobs.get(msg.id)
    if (!job) return
    this.jobs.delete(msg.id)
    if (msg.type === 'palettes') job.resolve(msg.suggestions)
    else job.reject(new Error(msg.message))
  }
}
