/// <reference types="vite/client" />
/**
 * Lazy onnxruntime-web loader. This module is the only one that touches the
 * Vite-specific `?url` asset imports, and it is only ever reached in the
 * browser via `await import('./ort')` from background.ts / segment.ts —
 * never import it (statically or in tests) from Node-visible code.
 */

import mjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs?url'
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url'
import { recordBackend } from './detect'
import { errorMessage } from './errors'
import type { MlBackend, MlProgressFn } from './types'

export type OrtModule = typeof import('onnxruntime-web')
export type OrtSession = import('onnxruntime-web').InferenceSession

let modulePromise: Promise<OrtModule> | null = null

async function initOrt(): Promise<OrtModule> {
  const ort = await import('onnxruntime-web')
  // Serve the wasm runtime from our own origin (Vite-emitted assets), not a CDN.
  ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl }
  // Threads need SharedArrayBuffer, which needs cross-origin isolation.
  ort.env.wasm.numThreads = globalThis.crossOriginIsolated
    ? Math.min(4, navigator.hardwareConcurrency ?? 1)
    : 1
  ort.env.logLevel = 'error'
  return ort
}

/** Load and configure onnxruntime-web once; a failed load can be retried. */
export function loadOrt(): Promise<OrtModule> {
  if (!modulePromise) {
    const attempt = initOrt()
    modulePromise = attempt
    attempt.catch(() => {
      modulePromise = null
    })
  }
  return modulePromise
}

export interface ModelSession {
  ort: OrtModule
  session: OrtSession
  backend: MlBackend
}

/**
 * Create an inference session, preferring WebGPU and falling back to WASM.
 * `label` names the model in user-facing error messages.
 */
export async function createModelSession(
  buffer: ArrayBuffer,
  label: string,
  onProgress?: MlProgressFn,
): Promise<ModelSession> {
  let ort: OrtModule
  try {
    ort = await loadOrt()
  } catch (err) {
    throw new Error(`This browser cannot run the ${label}: ${errorMessage(err)}`, { cause: err })
  }
  onProgress?.({ phase: 'compile' })
  const bytes = new Uint8Array(buffer)
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      const session = await ort.InferenceSession.create(bytes, { executionProviders: ['webgpu'] })
      recordBackend('webgpu')
      return { ort, session, backend: 'webgpu' }
    } catch {
      // WebGPU adapter/compile failures are common — silently fall back to WASM.
    }
  }
  try {
    const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] })
    recordBackend('wasm')
    return { ort, session, backend: 'wasm' }
  } catch (err) {
    throw new Error(`This browser cannot run the ${label}: ${errorMessage(err)}`, { cause: err })
  }
}
