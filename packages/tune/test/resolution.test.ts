import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, normalizeSettings } from '@trazor/core'
import { scaleSettingsForResolution } from '../src/resolution'

const BASE = normalizeSettings({
  ...DEFAULT_SETTINGS,
  blurRadius: 2,
  minRegionArea: 24,
  optTolerance: 0.4,
  adaptiveRadius: 16,
  pruneLength: 12,
  smoothing: 0.7,
  cornerThreshold: 100,
  precision: 2,
  paletteSize: 8,
})

describe('scaleSettingsForResolution', () => {
  it('is a no-op at factor 1', () => {
    expect(scaleSettingsForResolution(BASE, 1)).toEqual(BASE)
  })

  it('scales pixel lengths linearly and areas quadratically', () => {
    const up = scaleSettingsForResolution(BASE, 2)
    expect(up.blurRadius).toBeCloseTo(4, 5)
    expect(up.optTolerance).toBeCloseTo(0.8, 5)
    expect(up.adaptiveRadius).toBe(32)
    expect(up.pruneLength).toBeCloseTo(24, 5)
    // Area threshold grows with the square of the linear factor.
    expect(up.minRegionArea).toBe(96)
  })

  it('leaves resolution-independent fields untouched', () => {
    const up = scaleSettingsForResolution(BASE, 3)
    expect(up.smoothing).toBe(BASE.smoothing)
    expect(up.cornerThreshold).toBe(BASE.cornerThreshold)
    expect(up.precision).toBe(BASE.precision)
    expect(up.paletteSize).toBe(BASE.paletteSize)
    expect(up.mode).toBe(BASE.mode)
  })

  it('round-trips down then up within clamps', () => {
    const down = scaleSettingsForResolution(BASE, 0.5)
    expect(down.blurRadius).toBeCloseTo(1, 5)
    expect(down.minRegionArea).toBe(6) // round(24 * 0.25)
    const back = scaleSettingsForResolution(down, 2)
    expect(back.blurRadius).toBeCloseTo(2, 5)
    expect(back.optTolerance).toBeCloseTo(BASE.optTolerance, 5)
  })

  it('keeps every scaled field a valid, normalized setting', () => {
    const up = scaleSettingsForResolution(BASE, 8)
    expect(up).toEqual(normalizeSettings(up))
  })
})
