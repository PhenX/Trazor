import { describe, expect, it } from 'vitest'
import { borderDominantColor, flattenImage } from '../src/index'
import { rasterOf } from './helpers'

describe('flattenImage', () => {
  it('custom: composites over backgroundColor and returns opaque = null', () => {
    const img = rasterOf(2, 1, (x) => (x === 0 ? [200, 0, 0, 128] : [10, 20, 30, 255]))
    const { image, opaque } = flattenImage(img, {
      background: 'custom',
      backgroundColor: '#0000ff',
      alphaThreshold: 8,
    })
    expect(opaque).toBeNull()
    // src * a + bg * (1 - a)
    expect(image.data[0]).toBe(Math.round((200 * 128) / 255))
    expect(image.data[1]).toBe(0)
    expect(image.data[2]).toBe(Math.round((255 * 127) / 255))
    expect(image.data[3]).toBe(255)
    // Fully opaque pixels pass through.
    expect(Array.from(image.data.slice(4, 8))).toEqual([10, 20, 30, 255])
  })

  it('custom: falls back to white for an invalid backgroundColor', () => {
    const img = rasterOf(1, 1, () => [0, 0, 0, 0])
    const { image } = flattenImage(img, {
      background: 'custom',
      backgroundColor: 'not-a-color',
      alphaThreshold: 8,
    })
    expect([...image.data]).toEqual([255, 255, 255, 255])
  })

  it('transparent: composites RGB over white but masks by ORIGINAL alpha', () => {
    const img = rasterOf(3, 1, (x) => {
      if (x === 0) return [90, 90, 90, 0]
      if (x === 1) return [200, 0, 0, 128]
      return [10, 20, 30, 255]
    })
    const { image, opaque } = flattenImage(img, {
      background: 'transparent',
      backgroundColor: '#000000',
      alphaThreshold: 8,
    })
    // Fully transparent pixel becomes white (fringe color removed).
    expect(Array.from(image.data.slice(0, 4))).toEqual([255, 255, 255, 255])
    // Semi-transparent pixel composited over white.
    expect(image.data[4]).toBe(Math.round((200 * 128 + 255 * 127) / 255))
    expect(image.data[5]).toBe(Math.round((255 * 127) / 255))
    expect(image.data[7]).toBe(255)
    expect(opaque).not.toBeNull()
    expect([...(opaque?.data ?? [])]).toEqual([0, 1, 1])
  })

  it('transparent: alphaThreshold controls the opaque mask', () => {
    const img = rasterOf(3, 1, (x) => [0, 0, 0, [0, 128, 255][x]])
    const { opaque } = flattenImage(img, {
      background: 'transparent',
      backgroundColor: '#ffffff',
      alphaThreshold: 200,
    })
    expect([...(opaque?.data ?? [])]).toEqual([0, 0, 1])
  })

  it('transparent: keeps a flat translucent wisp below the cut, even one pixel thin', () => {
    // A 1px-thin horizontal line of constant alpha 120: each pixel has a same-
    // level neighbor along the line, so a high cut keeps the whole wisp — the
    // clear pixels above and below never match.
    const img = rasterOf(4, 3, (_x, y) => [40, 120, 200, y === 1 ? 120 : 0])
    const { opaque } = flattenImage(img, {
      background: 'transparent',
      backgroundColor: '#ffffff',
      alphaThreshold: 200,
    })
    expect([...(opaque?.data ?? [])]).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0])
  })

  it('transparent: cuts a straight anti-aliased rim at the threshold, though its level runs along it', () => {
    // An opaque square whose straight rim reads alpha 100 all along each side:
    // rim pixels share a level along the side but ramp from clear to solid
    // across it, so they are no translucent plateau — and the solid square
    // keeps its tight cut everywhere.
    const img = rasterOf(10, 10, (x, y) => {
      const inX = x >= 2 && x <= 7
      const inY = y >= 2 && y <= 7
      const rimX = x === 1 || x === 8
      const rimY = y === 1 || y === 8
      const a = inX && inY ? 255 : (rimX && inY) || (rimY && inX) ? 100 : 0
      return [30, 30, 30, a]
    })
    const { opaque } = flattenImage(img, {
      background: 'transparent',
      backgroundColor: '#ffffff',
      alphaThreshold: 128,
    })
    const data = opaque?.data ?? new Uint8Array(0)
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const solid = x >= 2 && x <= 7 && y >= 2 && y <= 7
        expect(data[y * 10 + x], `${x},${y}`).toBe(solid ? 1 : 0)
      }
    }
  })

  it('transparent: drops an anti-aliased rim ramp below the cut (no flat neighbor)', () => {
    // A coverage ramp climbing from clear to solid: no two neighbors share a
    // level, so nothing below the cut is a translucent plateau.
    const img = rasterOf(5, 1, (x) => [0, 0, 0, [0, 50, 120, 200, 255][x]])
    const { opaque } = flattenImage(img, {
      background: 'transparent',
      backgroundColor: '#ffffff',
      alphaThreshold: 200,
    })
    expect([...(opaque?.data ?? [])]).toEqual([0, 0, 0, 1, 1])
  })

  it('auto: fully opaque input keeps RGB and returns opaque = null', () => {
    const img = rasterOf(2, 2, (x, y) => [x * 100, y * 100, 42, 255])
    const { image, opaque } = flattenImage(img, {
      background: 'auto',
      backgroundColor: '#ff00ff',
      alphaThreshold: 8,
    })
    expect(opaque).toBeNull()
    expect(image.data).toEqual(img.data)
    expect(image).not.toBe(img)
  })

  it('auto: any pixel with alpha < 250 switches to transparent handling', () => {
    const img = rasterOf(2, 1, (x) => (x === 0 ? [50, 50, 50, 249] : [10, 10, 10, 255]))
    const { opaque } = flattenImage(img, {
      background: 'auto',
      backgroundColor: '#ffffff',
      alphaThreshold: 8,
    })
    expect(opaque).not.toBeNull()
    expect([...(opaque?.data ?? [])]).toEqual([1, 1])
  })

  it('auto: alpha in [250, 255) still counts as opaque handling', () => {
    const img = rasterOf(1, 1, () => [0, 0, 0, 250])
    const { image, opaque } = flattenImage(img, {
      background: 'auto',
      backgroundColor: '#ffffff',
      alphaThreshold: 8,
    })
    expect(opaque).toBeNull()
    // Residual translucency is flattened over white and alpha normalized.
    expect([...image.data]).toEqual([5, 5, 5, 255])
  })
})

describe('borderDominantColor', () => {
  it('returns the most common color of the 1px border frame', () => {
    const img = rasterOf(6, 5, (x, y) => {
      const border = x === 0 || y === 0 || x === 5 || y === 4
      if (!border) return [200, 0, 0, 255] // interior must be ignored
      // Two red border pixels, the rest green.
      if ((x === 2 && y === 0) || (x === 3 && y === 4)) return [200, 0, 0, 255]
      return [0, 180, 20, 255]
    })
    expect(borderDominantColor(img)).toEqual([0, 180, 20])
  })

  it('handles 1x1 images', () => {
    const img = rasterOf(1, 1, () => [12, 34, 56, 255])
    expect(borderDominantColor(img)).toEqual([12, 34, 56])
  })
})
