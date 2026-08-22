import type { StageId, VectorizeResult, VectorizeSettings } from '@vectorizer/core'

/** Messages accepted by the vectorizer worker. */
export type WorkerInMessage =
  | {
      type: 'vectorize'
      id: number
      width: number
      height: number
      /** RGBA bytes, transferred. */
      buffer: ArrayBuffer
      settings: VectorizeSettings
      /** Optional edge-hint plane: Float32, `width`×`height`, transferred. */
      edgeHint?: ArrayBuffer
    }
  | { type: 'cancel'; id: number }

/** Messages emitted by the vectorizer worker. */
export type WorkerOutMessage =
  | { type: 'progress'; id: number; stage: StageId; overall: number }
  | { type: 'result'; id: number; result: VectorizeResult }
  | { type: 'error'; id: number; message: string; cancelled: boolean }

/** Minimal worker-global surface — keeps this package free of lib.webworker. */
export interface WorkerScope {
  addEventListener(type: 'message', listener: (ev: { data: unknown }) => void): void
  postMessage(message: unknown, transfer?: Transferable[]): void
}
