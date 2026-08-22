import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  createSettingsExport,
  normalizeSettings,
  parseSettingsImport,
  serializeSettings,
  SETTINGS_EXPORT_VERSION,
} from '@vectorizer/core'

describe('settings export', () => {
  it('stamps the format markers and current version', () => {
    const doc = createSettingsExport(DEFAULT_SETTINGS)
    expect(doc.app).toBe('vectorizer')
    expect(doc.kind).toBe('settings')
    expect(doc.version).toBe(SETTINGS_EXPORT_VERSION)
    expect(doc.activeProfileId).toBeNull()
    expect(doc.profileModified).toBe(false)
  })

  it('serializes to indented JSON that parses back to a valid document', () => {
    const json = serializeSettings(DEFAULT_SETTINGS)
    expect(json).toContain('\n  "version": 1')
    const parsed = JSON.parse(json)
    expect(parsed.settings.mode).toBe('color')
  })

  it('drops an unknown profile id', () => {
    // Force an id the profile list does not contain.
    const doc = createSettingsExport(DEFAULT_SETTINGS, 'nope' as never, true)
    expect(doc.activeProfileId).toBeNull()
  })
})

describe('settings import', () => {
  it('round-trips defaults', () => {
    const restored = parseSettingsImport(serializeSettings(DEFAULT_SETTINGS))
    expect(restored.settings).toEqual(DEFAULT_SETTINGS)
    expect(restored.activeProfileId).toBeNull()
    expect(restored.profileModified).toBe(false)
  })

  it('round-trips non-default settings, palette and profile context', () => {
    const settings = normalizeSettings({
      mode: 'bw',
      paletteSize: 8,
      palette: ['#FF0000', '#00ff00'],
      threshold: 200,
    })
    const restored = parseSettingsImport(serializeSettings(settings, 'vinyl-cut', true))
    expect(restored.settings).toEqual(settings)
    expect(restored.settings.palette).toEqual(['#ff0000', '#00ff00'])
    expect(restored.activeProfileId).toBe('vinyl-cut')
    expect(restored.profileModified).toBe(true)
  })

  it('accepts a bare settings object without the export wrapper', () => {
    const restored = parseSettingsImport(JSON.stringify({ mode: 'centerline', pruneLength: 20 }))
    expect(restored.settings.mode).toBe('centerline')
    expect(restored.settings.pruneLength).toBe(20)
    expect(restored.activeProfileId).toBeNull()
  })

  it('clamps out-of-range numbers through normalizeSettings', () => {
    const restored = parseSettingsImport(
      JSON.stringify({ settings: { paletteSize: 999, maxDimension: 4, precision: 12 } }),
    )
    expect(restored.settings.paletteSize).toBe(64)
    expect(restored.settings.maxDimension).toBe(64)
    expect(restored.settings.precision).toBe(4)
  })

  it('strips unknown keys and keeps the defaults for missing ones', () => {
    const restored = parseSettingsImport(
      JSON.stringify({ settings: { mode: 'grayscale', bogusField: 'boom' } }),
    )
    expect(restored.settings.mode).toBe('grayscale')
    expect('bogusField' in restored.settings).toBe(false)
    expect(restored.settings.paletteSize).toBe(DEFAULT_SETTINGS.paletteSize)
  })

  it('ignores wrong-typed values without throwing', () => {
    const restored = parseSettingsImport(
      JSON.stringify({
        settings: { mode: 'bw', palette: 123, paletteSize: 'lots', invert: 'yes' },
      }),
    )
    expect(restored.settings.mode).toBe('bw')
    expect(restored.settings.palette).toBeNull()
    expect(restored.settings.paletteSize).toBe(DEFAULT_SETTINGS.paletteSize)
    expect(restored.settings.invert).toBe(DEFAULT_SETTINGS.invert)
  })

  it('drops an unknown profile id on import', () => {
    const restored = parseSettingsImport(
      JSON.stringify({ settings: { mode: 'bw' }, activeProfileId: 'ghost', profileModified: true }),
    )
    expect(restored.activeProfileId).toBeNull()
    expect(restored.profileModified).toBe(true)
  })

  it('rejects invalid JSON', () => {
    expect(() => parseSettingsImport('{ not json')).toThrow(/JSON/)
  })

  it('rejects a non-object document', () => {
    expect(() => parseSettingsImport('[1,2,3]')).toThrow(/settings object/)
    expect(() => parseSettingsImport('42')).toThrow(/settings object/)
  })

  it('rejects an object with no recognizable settings', () => {
    expect(() => parseSettingsImport('{"hello":"world"}')).toThrow(/recognizable/)
  })
})
