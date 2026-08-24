import { clamp, deltaEOk, rgbToOklab } from '@trazor/core'
import type { FidelityInMessage, FidelityOutMessage, FidelityWorkerScope } from './fidelityProtocol'

const SAMPLE_BUDGET = 200_000
/** ΔE(Oklab) mapped to full heat. */
const HEAT_FULL = 0.25

export interface DifferenceScore {
  /** 0..1 — perceptual similarity between the two rasters. */
  score: number
  /** Per-pixel ΔE heatmap, RGBA (transparent where faithful); absent when not requested. */
  diff?: Uint8ClampedArray<ArrayBuffer>
}

/**
 * Mean Oklab ΔE between two RGBA rasters of the same size (composited over
 * white beforehand), and optionally the heatmap for the Difference view. `a` is
 * the rendered result, `b` the reference source. Deterministic and DOM-free, so
 * it runs in a worker; the mean is sampled over up to `SAMPLE_BUDGET` pixels.
 *
 * With `heatmap` false (the settings search), only the sampled pixels are
 * touched and no diff raster is allocated — the mean, and so the score, is
 * identical to the heatmap path (same sampled set).
 */
export function scoreDifference(
  width: number,
  height: number,
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  heatmap = true,
): DifferenceScore {
  const pixels = width * height
  const stride = Math.max(1, Math.floor(pixels / SAMPLE_BUDGET))

  let sum = 0
  let count = 0

  if (!heatmap) {
    for (let p = 0; p < pixels; p += stride) {
      const i = p * 4
      const [l1, a1, b1] = rgbToOklab(a[i] / 255, a[i + 1] / 255, a[i + 2] / 255)
      const [l2, a2, b2] = rgbToOklab(b[i] / 255, b[i + 1] / 255, b[i + 2] / 255)
      sum += deltaEOk(l1, a1, b1, l2, a2, b2)
      count++
    }
    return { score: clamp(1 - (count > 0 ? sum / count : 0) * 4, 0, 1) }
  }

  const diffData = new Uint8ClampedArray(pixels * 4)
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

/** A reference raster held for scoring many candidates against (the search path). */
interface StoredReference {
  refId: number
  width: number
  height: number
  data: Uint8ClampedArray
}

/**
 * Wire the fidelity ΔE pass to a worker scope. The rasterization (SVG → pixels)
 * is DOM-bound and stays on the main thread; only this per-pixel pass runs here.
 *
 * `set-reference` stores one shared reference so the search transfers the source
 * raster once, then scores each candidate (`heatmap: false`) against it.
 */
export function installFidelityWorker(scope: FidelityWorkerScope): void {
  const post = (msg: FidelityOutMessage, transfer?: Transferable[]): void =>
    scope.postMessage(msg, transfer)

  let stored: StoredReference | null = null

  scope.addEventListener('message', (ev) => {
    const msg = ev.data as FidelityInMessage
    if (msg.type === 'set-reference') {
      stored = {
        refId: msg.refId,
        width: msg.width,
        height: msg.height,
        data: new Uint8ClampedArray(msg.reference),
      }
      return
    }
    if (msg.type !== 'score') return
    const { id, width, height, rendered, reference, refId, heatmap = true } = msg
    try {
      const a = new Uint8ClampedArray(rendered)
      let b: Uint8ClampedArray
      if (refId !== undefined) {
        if (!stored || stored.refId !== refId) throw new Error('reference not set')
        if (stored.width !== width || stored.height !== height) {
          throw new Error('reference size mismatch')
        }
        b = stored.data
      } else if (reference !== undefined) {
        b = new Uint8ClampedArray(reference)
      } else {
        throw new Error('no reference')
      }
      const { score, diff } = scoreDifference(width, height, a, b, heatmap)
      if (diff) post({ type: 'result', id, score, width, height, diff: diff.buffer }, [diff.buffer])
      else post({ type: 'result', id, score, width, height })
    } catch (err) {
      post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) })
    }
  })
}
