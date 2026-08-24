/** Messages accepted by the fidelity worker. */
export interface FidelityInMessage {
  type: 'score'
  id: number
  width: number
  height: number
  /** Rendered SVG over white, RGBA at result size, transferred. */
  rendered: ArrayBuffer
  /** Source downscaled over white, RGBA at result size, transferred. */
  reference: ArrayBuffer
}

/** Messages emitted by the fidelity worker. */
export type FidelityOutMessage =
  | {
      type: 'result'
      id: number
      score: number
      width: number
      height: number
      /** ΔE heatmap, RGBA at result size, transferred. */
      diff: ArrayBuffer
    }
  | { type: 'error'; id: number; message: string }

/** Minimal worker-global surface — keeps this module free of lib.webworker. */
export interface FidelityWorkerScope {
  addEventListener(type: 'message', listener: (ev: { data: unknown }) => void): void
  postMessage(message: unknown, transfer?: Transferable[]): void
}
