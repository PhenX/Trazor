import type { MlAvailability, MlBackend } from './types'

/** Backend that actually served a session; refines later `detectBackend()` answers. */
let confirmedBackend: MlBackend | null = null

export function recordBackend(backend: MlBackend): void {
  confirmedBackend = backend
}

/**
 * Cheap capability probe: WebAssembly + WebGPU presence only. The definitive
 * answer comes from session creation (WebGPU can still fail at adapter or
 * shader-compile time and fall back to WASM); once a session exists this
 * reports the confirmed backend instead.
 */
export async function detectBackend(): Promise<MlAvailability> {
  if (confirmedBackend) return { available: true, backend: confirmedBackend }
  if (typeof navigator === 'undefined' || typeof fetch === 'undefined') {
    return {
      available: false,
      backend: null,
      reason: 'Machine-learning tools need a browser environment.',
    }
  }
  if (typeof WebAssembly === 'undefined' || typeof WebAssembly.instantiate !== 'function') {
    return {
      available: false,
      backend: null,
      reason: 'This browser does not support WebAssembly.',
    }
  }
  return { available: true, backend: 'gpu' in navigator ? 'webgpu' : 'wasm' }
}
