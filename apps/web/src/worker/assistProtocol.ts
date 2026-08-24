import type { ImageAnalysis, PaletteSuggestion } from '@trazor/assist'

/** Messages accepted by the assist worker. */
export interface AssistInMessage {
  type: 'suggestPalettes'
  id: number
  width: number
  height: number
  /** RGBA bytes, transferred. */
  buffer: ArrayBuffer
  /** Image statistics computed on the main thread (cheap, sampled). */
  analysis: ImageAnalysis
}

/** Messages emitted by the assist worker. */
export type AssistOutMessage =
  | { type: 'palettes'; id: number; suggestions: PaletteSuggestion[] }
  | { type: 'error'; id: number; message: string }

/** Minimal worker-global surface — keeps this module free of lib.webworker. */
export interface AssistWorkerScope {
  addEventListener(type: 'message', listener: (ev: { data: unknown }) => void): void
  postMessage(message: unknown, transfer?: Transferable[]): void
}
