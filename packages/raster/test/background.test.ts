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
