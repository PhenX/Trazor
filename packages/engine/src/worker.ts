import { CancelledError } from '@vectorizer/core'
import type { GrayImage, RasterImage, VectorizeSettings } from '@vectorizer/core'
import { vectorize } from './native'
import type { WorkerInMessage, WorkerOutMessage, WorkerScope } from './protocol'

/**
 * Wire the vectorization pipeline to a worker scope. The pipeline yields to the
 * event loop between stages and layers, so `cancel` messages interleave with a
 * running job and cooperative cancellation works without SharedArrayBuffer
 * (static hosts rarely send the COOP/COEP headers it needs).
 */
export function installWorkerHandler(scope: WorkerScope): void {
  const cancelled = new Set<number>()
  let lastProgressAt = 0

  const post = (msg: WorkerOutMessage, transfer?: Transferable[]) =>
    scope.postMessage(msg, transfer)

  scope.addEventListener('message', (ev) => {
    const msg = ev.data as WorkerInMessage
    if (msg.type === 'cancel') {
      cancelled.add(msg.id)
      return
    }
    if (msg.type !== 'vectorize') return

    const { id, width, height, buffer, settings, edgeHint } = msg
    const image: RasterImage = { width, height, data: new Uint8ClampedArray(buffer) }
    const hint: GrayImage | undefined = edgeHint
      ? { width, height, data: new Float32Array(edgeHint) }
      : undefined
    void run(id, image, settings, hint)
  })

  async function run(
    id: number,
    image: RasterImage,
    settings: VectorizeSettings,
    edgeHint?: GrayImage,
  ) {
    try {
      const result = await vectorize(image, settings, {
        edgeHint,
        shouldCancel: () => cancelled.has(id),
        onProgress: (stage, overall) => {
          const now = Date.now()
          if (overall >= 1 || now - lastProgressAt > 40) {
            lastProgressAt = now
            post({ type: 'progress', id, stage, overall })
          }
        },
      })
      if (cancelled.has(id)) {
        post({ type: 'error', id, message: 'cancelled', cancelled: true })
      } else {
        post({ type: 'result', id, result })
      }
    } catch (err) {
      const isCancel = err instanceof CancelledError
      post({
        type: 'error',
        id,
        message: isCancel ? 'cancelled' : err instanceof Error ? err.message : String(err),
        cancelled: isCancel,
      })
    } finally {
      cancelled.delete(id)
    }
  }
}
