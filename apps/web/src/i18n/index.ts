import { createI18n } from 'vue-i18n'
import { en } from './locales/en'
import { fr } from './locales/fr'

/** Locales the studio ships translations for; the first is the fallback. */
export const SUPPORTED_LOCALES = ['en', 'fr'] as const
export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: LocaleCode = 'en'

/** Persisted-state key — must match `STORAGE_KEY` in store/appStore.ts. */
const STORAGE_KEY = 'trazor:v1'

export function isLocale(value: unknown): value is LocaleCode {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/**
 * Pick the best supported locale for a browser's language preferences. Each
 * candidate is matched by its primary subtag (`fr-CA` → `fr`), most-preferred
 * first; falls back to {@link DEFAULT_LOCALE} when none match. Pure — the caller
 * supplies the candidate list, so it is unit-testable without a browser.
 */
export function detectLocale(candidates: readonly string[]): LocaleCode {
  for (const tag of candidates) {
    const primary = tag.toLowerCase().split('-')[0]
    if (isLocale(primary)) return primary
  }
  return DEFAULT_LOCALE
}

/** The visitor's saved locale choice, or null when unset/unreadable. */
function readStoredLocale(): LocaleCode | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && 'locale' in parsed) {
      const locale = (parsed as { locale?: unknown }).locale
      if (isLocale(locale)) return locale
    }
    return null
  } catch {
    return null
  }
}

/** Browser language candidates, most-preferred first. */
function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return []
  if (navigator.languages && navigator.languages.length > 0) return navigator.languages
  return navigator.language ? [navigator.language] : []
}

/** Saved choice if any, else auto-detected from the browser, else the default. */
export function pickInitialLocale(): LocaleCode {
  return readStoredLocale() ?? detectLocale(browserLanguages())
}

// Untyped message keys (no schema generic) so dynamic lookups like
// `t('profiles.' + id + '.label')` type-check; `fr: MessageSchema` and the
// parity test keep the catalogs in sync instead.
export const i18n = createI18n({
  legacy: false,
  locale: pickInitialLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { en, fr },
  // Some hints name SVG elements literally (`<title>`, `<g>`); intlify's
  // HTML-in-message guard flags those. Every message renders as text — a
  // `:title` tooltip or `{{ t(...) }}` interpolation — and never through
  // `v-html` (only the traced SVG output is), so the angle brackets are inert.
  warnHtmlMessage: false,
})

/** Translate with the shared instance from non-component modules (e.g. the store). */
export function translate(key: string, named?: Record<string, unknown>): string {
  return named === undefined ? i18n.global.t(key) : i18n.global.t(key, named)
}

/** Set the active locale on the shared i18n instance. */
export function applyLocale(locale: LocaleCode): void {
  i18n.global.locale.value = locale
}
