import type { RasterImage } from '@trazor/core'
import { suggestPalettes } from '@trazor/assist'
import type { AssistInMessage, AssistOutMessage, AssistWorkerScope } from './assistProtocol'

/**
 * Wire palette suggestion to a worker scope. `suggestPalettes` runs several
 * full-image k-means passes, so it must stay off the UI thread (Selinger-class
 * tracing already does, via @trazor/engine). Deterministic for a given image.
 */
export function installAssistWorker(scope: AssistWorkerScope): void {
  const post = (msg: AssistOutMessage, transfer?: Transferable[]): void =>
    scope.postMessage(msg, transfer)

  scope.addEventListener('message', (ev) => {
    const msg = ev.data as AssistInMessage
    if (msg.type !== 'suggestPalettes') return
    const { id, width, height, buffer, analysis } = msg
    try {
      const image: RasterImage = { width, height, data: new Uint8ClampedArray(buffer) }
      const suggestions = suggestPalettes(image, analysis)
      post({ type: 'palettes', id, suggestions })
    } catch (err) {
      post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) })
    }
  })
}
