import { errorMessage } from './errors'
import type { ModelSpec } from './registry'
import type { MlProgressFn } from './types'

const CACHE_NAME = 'trazor-models-v1'

async function openCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null
  try {
    return await caches.open(CACHE_NAME)
  } catch {
    // Cache Storage can be unavailable (file://, private browsing) — run without it.
    return null
  }
}

/**
 * Reject a body that is obviously not an ONNX model — an HTML page (dev SPA
 * fallback, an error page, a login redirect) starts with `<` after optional BOM/
 * whitespace, whereas an ONNX protobuf starts with 0x08 (the ir_version field).
 * Throwing here (before the caller caches) turns ORT's opaque "protobuf parsing
 * failed" into an actionable message.
 */
function assertModelBytes(buffer: ArrayBuffer, spec: ModelSpec): void {
  const bytes = new Uint8Array(buffer)
  let i = 0
  // Skip a UTF-8 BOM and leading ASCII whitespace.
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3
  while (i < bytes.length && (bytes[i] === 0x20 || (bytes[i] >= 0x09 && bytes[i] <= 0x0d))) i++
  if (bytes.length === 0 || bytes[i] === 0x3c) {
    throw new Error(
      `Model for ${spec.id} is not a valid ONNX file (got ${bytes.length === 0 ? 'an empty response' : 'an HTML/XML page'}) from ${spec.url} — ` +
        `the file is likely missing (in dev, place it at apps/web/public/models/).`,
    )
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
  // A dev server's SPA fallback answers an unknown path with 200 + index.html, so
  // response.ok is not enough: an HTML body would then be cached and later fail
  // ORT with a cryptic "protobuf parsing failed". Reject it here with a clear
  // message so nothing bad is cached.
  if ((response.headers.get('Content-Type') ?? '').includes('text/html')) {
    throw new Error(
      `Model for ${spec.id} was served as HTML, not a model, from ${spec.url} — ` +
        `the file is likely missing (in dev, place it at apps/web/public/models/).`,
    )
  }
  const total = Number(response.headers.get('Content-Length') ?? '') || 0
  const body = response.body
  if (!body) {
    const buffer = await response.arrayBuffer()
    assertModelBytes(buffer, spec)
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
  assertModelBytes(out.buffer, spec)
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
