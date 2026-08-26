import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { mulberry32 } from '@trazor/core'
import type { RasterImage } from '@trazor/core'
import { encodePngDataUri } from '../src/index'

function decode(uri: string): PNG {
  const b64 = uri.slice(uri.indexOf(',') + 1)
  return PNG.sync.read(Buffer.from(b64, 'base64'))
}

function sampleImage(w: number, h: number, seed: number): RasterImage {
  const rng = mulberry32(seed)
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < data.length; i++) data[i] = (rng() * 256) | 0
  return { width: w, height: h, data }
}

describe('encodePngDataUri', () => {
  it('round-trips a small image exactly', () => {
    const img = sampleImage(5, 3, 7)
    const uri = encodePngDataUri(img)
    expect(uri.startsWith('data:image/png;base64,')).toBe(true)
    const png = decode(uri)
    expect(png.width).toBe(5)
    expect(png.height).toBe(3)
    expect([...png.data]).toEqual([...img.data])
  })

  it('round-trips an image crossing the stored-block boundary (64 KiB)', () => {
    // 128×128 RGBA raw scanlines exceed 65535 bytes, so the zlib stream needs
    // more than one stored block.
    const img = sampleImage(128, 128, 42)
    const png = decode(encodePngDataUri(img))
    expect(png.width).toBe(128)
    expect(png.height).toBe(128)
    expect([...png.data]).toEqual([...img.data])
  })

  it('handles a 1×1 image', () => {
    const img = sampleImage(1, 1, 3)
    const png = decode(encodePngDataUri(img))
    expect(png.width).toBe(1)
    expect(png.height).toBe(1)
    expect([...png.data]).toEqual([...img.data])
  })

  it('is deterministic', () => {
    const img = sampleImage(9, 6, 11)
    expect(encodePngDataUri(img)).toBe(encodePngDataUri(img))
  })
})
