import { describe, expect, it } from 'vitest'
import { MODEL_REGISTRY, overrideModelUrl } from '../src/registry'

describe('MODEL_REGISTRY', () => {
  it('declares every model with a consistent id, positive size, and license', () => {
    const ids = ['u2netp', 'slimsam-encoder', 'slimsam-decoder', 'edge-prepass', 'cleanup'] as const
    expect(Object.keys(MODEL_REGISTRY).toSorted()).toEqual([...ids].toSorted())
    for (const id of ids) {
      const spec = MODEL_REGISTRY[id]
      expect(spec.id).toBe(id)
      expect(spec.approxBytes).toBeGreaterThan(0)
      expect(spec.license.length).toBeGreaterThan(0)
    }
  })

  it('fetches third-party models over https and the project model same-origin', () => {
    for (const id of ['u2netp', 'slimsam-encoder', 'slimsam-decoder'] as const) {
      expect(MODEL_REGISTRY[id].url).toMatch(/^https:\/\//)
    }
    // The project's own models are relative paths resolved against the app's base.
    for (const id of ['edge-prepass', 'cleanup'] as const) {
      const url = MODEL_REGISTRY[id].url
      expect(url).not.toMatch(/^https?:\/\//)
      expect(url).toMatch(/\.onnx$/)
    }
  })
})

describe('overrideModelUrl', () => {
  it('replaces only the URL of the given model', () => {
    const before = { ...MODEL_REGISTRY.u2netp }
    try {
      overrideModelUrl('u2netp', 'https://example.com/u2netp.onnx')
      expect(MODEL_REGISTRY.u2netp.url).toBe('https://example.com/u2netp.onnx')
      expect(MODEL_REGISTRY.u2netp.id).toBe(before.id)
      expect(MODEL_REGISTRY.u2netp.approxBytes).toBe(before.approxBytes)
      expect(MODEL_REGISTRY.u2netp.license).toBe(before.license)
      expect(MODEL_REGISTRY['slimsam-encoder'].url).not.toContain('example.com')
    } finally {
      overrideModelUrl('u2netp', before.url)
    }
  })
})
