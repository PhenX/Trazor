import { CancelledError } from '@trazor/core'
import type { GrayImage, RasterImage, VectorizeSettings } from '@trazor/core'
import { vectorize } from './native'
import type { StageCache } from './native'
import { traceTransferables } from './trace'
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
  // Persisted across runs: reuses preprocess/palette work while the same image
  // is tuned. Single entry, keyed by imageId + settings slices inside vectorize.
  const stageCache: StageCache = {}

  const post = (msg: WorkerOutMessage, transfer?: Transferable[]) =>
    scope.postMessage(msg, transfer)

  scope.addEventListener('message', (ev) => {
    const msg = ev.data as WorkerInMessage
    if (msg.type === 'cancel') {
      cancelled.add(msg.id)
      return
    }
    if (msg.type !== 'vectorize') return

    const { id, width, height, buffer, settings, edgeHint, coverageHint, imageId, trace } = msg
    const image: RasterImage = { width, height, data: new Uint8ClampedArray(buffer) }
    const hint: GrayImage | undefined = edgeHint
      ? { width, height, data: new Float32Array(edgeHint) }
      : undefined
    const cov: GrayImage | undefined = coverageHint
      ? { width, height, data: new Float32Array(coverageHint) }
      : undefined
    void run(id, image, settings, hint, cov, imageId, trace, msg.withDocument)
  })

  async function run(
    id: number,
    image: RasterImage,
    settings: VectorizeSettings,
    edgeHint?: GrayImage,
    coverageHint?: GrayImage,
    imageId?: number,
    trace?: boolean,
    withDocument?: boolean,
  ) {
    try {
      const result = await vectorize(
        image,
        settings,
        {
          edgeHint,
          coverageHint,
          shouldCancel: () => cancelled.has(id),
          onProgress: (stage, overall) => {
            const now = Date.now()
            if (overall >= 1 || now - lastProgressAt > 40) {
              lastProgressAt = now
              post({ type: 'progress', id, stage, overall })
            }
          },
          // Stream each recorded step; transfer its raster buffers (fresh copies)
          // so the snapshots cross to the main thread without a structured copy.
          onTrace: trace
            ? (step) => post({ type: 'trace-step', id, step }, traceTransferables(step.rasters))
            : undefined,
        },
        { imageId, cache: stageCache, withDocument },
      )
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
