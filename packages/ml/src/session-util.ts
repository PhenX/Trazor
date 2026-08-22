/**
 * Runtime helpers over ORT objects that carry no imports of their own, so the
 * files using them stay loadable in Node (only `import type` touches ORT).
 */

import type { InferenceSession, Tensor } from 'onnxruntime-web'

/**
 * Read a tensor's float32 payload. `getData()` also downloads GPU-resident
 * outputs; plain `.data` covers builds without it.
 */
export async function tensorFloatData(tensor: Tensor): Promise<Float32Array> {
  const data = typeof tensor.getData === 'function' ? await tensor.getData() : tensor.data
  if (data instanceof Float32Array) return data
  throw new Error(`the model produced ${tensor.type} output where float32 was expected`)
}

/** Best-effort session release; availability and sync/async behavior vary across builds. */
export function releaseSession(session: InferenceSession | null): void {
  if (!session) return
  try {
    const result: unknown = session.release()
    if (result instanceof Promise) result.catch(() => undefined)
  } catch {
    // The session is dropped either way.
  }
}
