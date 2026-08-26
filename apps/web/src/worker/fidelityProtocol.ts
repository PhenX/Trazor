/** Messages accepted by the fidelity worker. */
export type FidelityInMessage =
  | {
      /**
       * Store a reference raster (source over white) to score many candidates
       * against, so the search transfers it once per run instead of per candidate.
       */
      type: 'set-reference'
      refId: number
      width: number
      height: number
      /** Source downscaled over white, RGBA, transferred. */
      reference: ArrayBuffer
    }
  | {
      type: 'score'
      id: number
      width: number
      height: number
      /** Rendered SVG over white, RGBA at `width`×`height`, transferred. */
      rendered: ArrayBuffer
      /** Inline reference (display path). Omit when scoring against a stored `refId`. */
      reference?: ArrayBuffer
      /** Score against a previously `set-reference`d raster instead of an inline one. */
      refId?: number
      /** Build the ΔE heatmap too (display path). Default true; the search sets false. */
      heatmap?: boolean
    }

/** Messages emitted by the fidelity worker. */
export type FidelityOutMessage =
  | {
      type: 'result'
      id: number
      score: number
      width: number
      height: number
      /** ΔE heatmap, RGBA at result size, transferred. Absent when `heatmap` was false. */
      diff?: ArrayBuffer
      /** Windowed SSIM (−1..1), present on the score-only path (heatmap false). */
      ssim?: number
    }
  | { type: 'error'; id: number; message: string }

/** Minimal worker-global surface — keeps this module free of lib.webworker. */
export interface FidelityWorkerScope {
  addEventListener(type: 'message', listener: (ev: { data: unknown }) => void): void
  postMessage(message: unknown, transfer?: Transferable[]): void
}
