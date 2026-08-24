import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, mulberry32, normalizeSettings } from '@trazor/core'
import {
  applicableParams,
  DEFAULT_FREE,
  fromUnit,
  settingsKey,
  toUnit,
  TUNABLE_PARAMS,
} from '../src/params'

describe('TUNABLE_PARAMS metadata', () => {
  it('names only real settings fields', () => {
    for (const spec of TUNABLE_PARAMS) {
      expect(spec.key in DEFAULT_SETTINGS).toBe(true)
    }
  })

  it('has unique keys', () => {
    const keys = TUNABLE_PARAMS.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('gives numeric params well-formed ranges', () => {
    for (const spec of TUNABLE_PARAMS.filter((s) => s.kind === 'number' || s.kind === 'int')) {
      expect(typeof spec.min).toBe('number')
      expect(typeof spec.max).toBe('number')
      expect(spec.max! > spec.min!).toBe(true)
      // A log scale needs a strictly positive lower bound.
      expect(spec.scale !== 'log' || spec.min! > 0).toBe(true)
    }
  })

  it('gives enum params at least two choices', () => {
    for (const spec of TUNABLE_PARAMS.filter((s) => s.kind === 'enum')) {
      expect((spec.values?.length ?? 0) > 1).toBe(true)
    }
  })

  it('excludes opt-in params from the default free set', () => {
    for (const spec of TUNABLE_PARAMS) {
      expect(DEFAULT_FREE.includes(spec.key)).toBe(!spec.optIn)
    }
  })
})

describe('unit mapping', () => {
  it('round-trips values within resolution across every numeric param', () => {
    const rand = mulberry32(99)
    for (const spec of TUNABLE_PARAMS) {
      if (spec.kind !== 'number' && spec.kind !== 'int') continue
      for (let i = 0; i < 20; i++) {
        const u = rand()
        const value = fromUnit(spec, u)
        expect(value).toBeGreaterThanOrEqual(spec.min!)
        expect(value).toBeLessThanOrEqual(spec.max!)
        // Mapping back and forth is stable (idempotent through the value grid).
        expect(fromUnit(spec, toUnit(spec, value))).toBeCloseTo(value, 6)
      }
    }
  })
})

describe('generated candidates are already normalized', () => {
  it('normalizeSettings is a no-op on every single-parameter probe', () => {
    for (const spec of TUNABLE_PARAMS) {
      const values: unknown[] = []
      if (spec.kind === 'number' || spec.kind === 'int') {
        for (const u of [0, 0.13, 0.5, 0.87, 1]) values.push(fromUnit(spec, u))
      } else if (spec.kind === 'bool') {
        values.push(true, false)
      } else {
        values.push(...(spec.values ?? []))
      }
      for (const v of values) {
        const settings = normalizeSettings({ ...DEFAULT_SETTINGS, [spec.key]: v })
        expect(settingsKey(settings)).toBe(settingsKey(normalizeSettings(settings)))
        // The value we set survives normalization unchanged (range matches the clamp).
        expect((settings as unknown as Record<string, unknown>)[spec.key]).toEqual(v)
      }
    }
  })
})

describe('applicableParams', () => {
  it('filters by mode and when-guards', () => {
    const bw = normalizeSettings({ mode: 'bw', thresholdMode: 'fixed' })
    const keys = applicableParams(DEFAULT_FREE, 'bw', bw).map((s) => s.key)
    expect(keys).toContain('threshold') // fixed threshold ⇒ present
    expect(keys).not.toContain('adaptiveRadius') // not adaptive ⇒ absent
    expect(keys).not.toContain('paletteSize') // palette params are color-only

    const adaptive = normalizeSettings({ mode: 'bw', thresholdMode: 'adaptive' })
    const keys2 = applicableParams(DEFAULT_FREE, 'bw', adaptive).map((s) => s.key)
    expect(keys2).toContain('adaptiveRadius')
    expect(keys2).not.toContain('threshold')
  })
})
