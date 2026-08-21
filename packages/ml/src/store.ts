import { errorMessage } from './errors'
import type { ModelSpec } from './registry'
import type { MlProgressFn } from './types'

const CACHE_NAME = 'vectorizer-models-v1'

async function openCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null
  try {
    return await caches.open(CACHE_NAME)
  } catch {
    // Cache Storage can be unavailable (file://, private browsing) — run without it.
    return null
  }
}

async function downloadModel(spec: ModelSpec, onProgress?: MlProgressFn): Promise<ArrayBuffer> {
  if (typeof fetch === 'undefined') {
    throw new Error('Model download failed (no network access in this environment)')
  }
  let response: Response
  try {
    response = await fetch(spec.url)
  } catch (err) {
    throw new Error(`Model download failed (${errorMessage(err)})`, { cause: err })
  }
  if (!response.ok) {
    throw new Error(`Model download failed (HTTP ${response.status} for ${spec.id})`)
  }
  const total = Number(response.headers.get('Content-Length') ?? '') || 0
  const body = response.body
  if (!body) {
    const buffer = await response.arrayBuffer()
    onProgress?.({
      phase: 'download',
      id: spec.id,
      loaded: buffer.byteLength,
      total: buffer.byteLength,
    })
    return buffer
  }
  onProgress?.({ phase: 'download', id: spec.id, loaded: 0, total })
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  try {
    for (;;) {
      // Stream chunks only exist one at a time — sequential await is inherent here.
      // oxlint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      loaded += value.byteLength
      onProgress?.({ phase: 'download', id: spec.id, loaded, total })
    }
  } catch (err) {
    throw new Error(`Model download failed (${errorMessage(err)})`, { cause: err })
  }
  const out = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out.buffer
}

/** Model bytes cached in Cache Storage; degrades to plain network when storage is unavailable. */
export class ModelStore {
  async fetch(spec: ModelSpec, onProgress?: MlProgressFn): Promise<ArrayBuffer> {
    const cache = await openCache()
    if (cache) {
      let hit: Response | undefined
      try {
        hit = await cache.match(spec.url)
      } catch {
        hit = undefined
      }
      if (hit) {
        const buffer = await hit.arrayBuffer()
        onProgress?.({
          phase: 'download',
          id: spec.id,
          loaded: buffer.byteLength,
          total: buffer.byteLength,
        })
        return buffer
      }
    }
    const buffer = await downloadModel(spec, onProgress)
    if (cache) {
      try {
        await cache.put(
          spec.url,
          new Response(buffer, { headers: { 'Content-Type': 'application/octet-stream' } }),
        )
      } catch {
        // Quota exceeded or storage denied — keep working without persistence.
      }
    }
    return buffer
  }

  async usage(): Promise<{ models: number; bytes: number }> {
    const cache = await openCache()
    if (!cache) return { models: 0, bytes: 0 }
    let models = 0
    let bytes = 0
    try {
      const requests = await cache.keys()
      const sizes = await Promise.all(
        requests.map(async (request) => {
          const response = await cache.match(request)
          return response ? (await response.blob()).size : -1
        }),
      )
      for (const size of sizes) {
        if (size < 0) continue
        models += 1
        bytes += size
      }
    } catch {
      // Storage misbehaved — report nothing rather than fail.
      return { models: 0, bytes: 0 }
    }
    return { models, bytes }
  }

  async clear(): Promise<void> {
    if (typeof caches === 'undefined') return
    try {
      await caches.delete(CACHE_NAME)
    } catch {
      // Either the cache never existed or storage is unavailable — both fine.
    }
  }
}
