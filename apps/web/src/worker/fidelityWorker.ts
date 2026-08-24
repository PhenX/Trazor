import { clamp, deltaEOk, rgbToOklab } from '@trazor/core'
import type { FidelityInMessage, FidelityOutMessage, FidelityWorkerScope } from './fidelityProtocol'

const SAMPLE_BUDGET = 200_000
/** ΔE(Oklab) mapped to full heat. */
const HEAT_FULL = 0.25

export interface DifferenceScore {
  /** 0..1 — perceptual similarity between the two rasters. */
  score: number
  /** Per-pixel ΔE heatmap, RGBA (transparent where faithful). */
  diff: Uint8ClampedArray<ArrayBuffer>
}

/**
 * Mean Oklab ΔE between two RGBA rasters of the same size (composited over
 * white beforehand), plus the heatmap for the Difference view. `a` is the
 * rendered result, `b` the reference source. Deterministic and DOM-free, so it
 * runs in a worker; the mean is sampled over up to `SAMPLE_BUDGET` pixels.
 */
export function scoreDifference(
  width: number,
  height: number,
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
): DifferenceScore {
  const pixels = width * height
  const stride = Math.max(1, Math.floor(pixels / SAMPLE_BUDGET))
  const diffData = new Uint8ClampedArray(pixels * 4)

  let sum = 0
  let count = 0
  for (let p = 0; p < pixels; p++) {
    const i = p * 4
    const [l1, a1, b1] = rgbToOklab(a[i] / 255, a[i + 1] / 255, a[i + 2] / 255)
    const [l2, a2, b2] = rgbToOklab(b[i] / 255, b[i + 1] / 255, b[i + 2] / 255)
    const dE = deltaEOk(l1, a1, b1, l2, a2, b2)
    if (p % stride === 0) {
      sum += dE
      count++
    }
    // Heatmap: faithful → transparent, unfaithful → amber to hot red.
    const t = clamp(dE / HEAT_FULL, 0, 1)
    if (t > 0.02) {
      diffData[i] = 255
      diffData[i + 1] = 170 - t * 130
      diffData[i + 2] = 40 + t * 50
      diffData[i + 3] = Math.sqrt(t) * 235
    }
  }

  const meanDeltaE = count > 0 ? sum / count : 0
  return { score: clamp(1 - meanDeltaE * 4, 0, 1), diff: diffData }
}

/**
 * Wire the fidelity ΔE pass to a worker scope. The rasterization (SVG → pixels)
 * is DOM-bound and stays on the main thread; only this per-pixel pass runs here.
 */
export function installFidelityWorker(scope: FidelityWorkerScope): void {
  const post = (msg: FidelityOutMessage, transfer?: Transferable[]): void =>
    scope.postMessage(msg, transfer)

  scope.addEventListener('message', (ev) => {
    const msg = ev.data as FidelityInMessage
    if (msg.type !== 'score') return
    const { id, width, height, rendered, reference } = msg
    try {
      const a = new Uint8ClampedArray(rendered)
      const b = new Uint8ClampedArray(reference)
      const { score, diff } = scoreDifference(width, height, a, b)
      post({ type: 'result', id, score, width, height, diff: diff.buffer }, [diff.buffer])
    } catch (err) {
      post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) })
    }
  })
}
