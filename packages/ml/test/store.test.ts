import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModelStore } from '../src/store'
import type { ModelSpec } from '../src/registry'

const spec: ModelSpec = {
  id: 'edge-prepass',
  url: '/models/edge-prepass.onnx',
  approxBytes: 1,
  license: 'MIT',
}

function respondWith(body: BodyInit, contentType?: string): void {
  const headers: Record<string, string> = {}
  if (contentType) headers['Content-Type'] = contentType
  vi.stubGlobal('fetch', async () => new Response(body, { status: 200, headers }))
}

// `caches` is undefined under vitest's node env, so ModelStore.fetch goes
// straight to the network path — exactly where the guards live.
describe('ModelStore.fetch model-body guards', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('rejects an HTML page served as text/html (dev SPA fallback)', async () => {
    respondWith('<!doctype html><html><body>app</body></html>', 'text/html')
    await expect(new ModelStore().fetch(spec)).rejects.toThrow(/HTML/)
  })

  it('rejects an HTML/XML body even without a text/html content-type', async () => {
    respondWith('<!doctype html>\n<html></html>', 'application/octet-stream')
    await expect(new ModelStore().fetch(spec)).rejects.toThrow(/not a valid ONNX/)
  })

  it('rejects an empty body', async () => {
    respondWith('', 'application/octet-stream')
    await expect(new ModelStore().fetch(spec)).rejects.toThrow(/not a valid ONNX/)
  })

  it('accepts a real model body (starts with the protobuf 0x08 tag)', async () => {
    respondWith(new Uint8Array([0x08, 0x07, 0x12, 0x04]), 'application/octet-stream')
    const buf = await new ModelStore().fetch(spec)
    expect(new Uint8Array(buf)[0]).toBe(0x08)
  })
})
