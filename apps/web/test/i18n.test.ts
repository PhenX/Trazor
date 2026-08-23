import { describe, expect, it } from 'vitest'
import { detectLocale, i18n, isLocale, SUPPORTED_LOCALES } from '../src/i18n'
import { en } from '../src/i18n/locales/en'
import { fr } from '../src/i18n/locales/fr'

type Tree = { [key: string]: string | string[] | Tree }

/** Flatten a message tree to `path -> string` leaves (arrays expand by index). */
function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      out.set(path, value)
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => out.set(`${path}.${i}`, item))
    } else {
      for (const [k, v] of flatten(value, path)) out.set(k, v)
    }
  }
  return out
}

/** Named interpolation tokens (`{count}`), sorted and de-duplicated. */
function placeholders(message: string): string[] {
  return [...new Set([...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort()
}

/** Number of pluralization branches (`a | b | c`). */
function pluralForms(message: string): number {
  return message.split(' | ').length
}

const enFlat = flatten(en)
const frFlat = flatten(fr)

describe('locale detection', () => {
  it('picks the first supported browser language by primary subtag', () => {
    expect(detectLocale(['fr-FR', 'en-US'])).toBe('fr')
    expect(detectLocale(['en-GB', 'fr'])).toBe('en')
    expect(detectLocale(['fr'])).toBe('fr')
  })

  it('ignores region and case, matching on the primary subtag', () => {
    expect(detectLocale(['FR-ca'])).toBe('fr')
    expect(detectLocale(['EN'])).toBe('en')
  })

  it('falls back to English for unsupported or empty inputs', () => {
    expect(detectLocale(['de', 'es', 'it'])).toBe('en')
    expect(detectLocale([])).toBe('en')
  })

  it('recognizes exactly the supported locales', () => {
    for (const code of SUPPORTED_LOCALES) expect(isLocale(code)).toBe(true)
    expect(isLocale('de')).toBe(false)
    expect(isLocale(null)).toBe(false)
  })
})

describe('catalog parity (en ↔ fr)', () => {
  it('defines the identical set of message keys', () => {
    expect([...frFlat.keys()].sort()).toEqual([...enFlat.keys()].sort())
  })

  it('uses the same interpolation placeholders in every message', () => {
    for (const [key, enMsg] of enFlat) {
      const frMsg = frFlat.get(key)
      expect(frMsg, `missing fr key: ${key}`).toBeDefined()
      expect(placeholders(frMsg as string), `placeholders differ at ${key}`).toEqual(
        placeholders(enMsg),
      )
    }
  })

  it('keeps the same number of plural branches in every message', () => {
    for (const [key, enMsg] of enFlat) {
      expect(pluralForms(frFlat.get(key) as string), `plural forms differ at ${key}`).toBe(
        pluralForms(enMsg),
      )
    }
  })
})

describe('i18n instance', () => {
  it('registers both locales and resolves interpolation and plurals', () => {
    const { global } = i18n

    global.locale.value = 'en'
    expect(global.t('stages.trace')).toBe('Trace')
    expect(global.t('stats.paths', { count: '12' })).toBe('12 paths')
    expect(global.t('preview.points', { count: 1 }, 1)).toBe('1 point')
    expect(global.t('preview.points', { count: 3 }, 3)).toBe('3 points')

    global.locale.value = 'fr'
    expect(global.t('stages.trace')).toBe('Tracé')
    expect(global.t('preview.points', { count: 1 }, 1)).toBe('1 point')
    expect(global.t('preview.points', { count: 3 }, 3)).toBe('3 points')

    global.locale.value = 'en'
  })
})
