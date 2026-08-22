import { TARGET_PROFILES } from './profiles'
import type { ProfileId } from './profiles'
import { DEFAULT_SETTINGS, normalizeSettings } from './settings'
import type { VectorizeSettings } from './settings'

/**
 * Bumped when the export shape changes in a way older readers cannot handle.
 * Readers accept any version: unknown fields are dropped and known ones are
 * clamped through `normalizeSettings`, so a document from a newer minor version
 * still imports with its recognizable settings.
 */
export const SETTINGS_EXPORT_VERSION = 1

/** Format marker so an arbitrary JSON paste can be recognized (or rejected). */
export const SETTINGS_EXPORT_APP = 'vectorizer'
export const SETTINGS_EXPORT_KIND = 'settings'

/** A portable, versioned snapshot of the studio settings. */
export interface SettingsExport {
  app: typeof SETTINGS_EXPORT_APP
  kind: typeof SETTINGS_EXPORT_KIND
  version: number
  settings: VectorizeSettings
  /** The profile the settings were derived from, if any. */
  activeProfileId: ProfileId | null
  /** Whether the settings diverge from that profile. */
  profileModified: boolean
}

/** The restorable part of an import — the studio applies these directly. */
export interface ImportedSettings {
  settings: VectorizeSettings
  activeProfileId: ProfileId | null
  profileModified: boolean
}

/** Build a versioned export document from the current studio state. */
export function createSettingsExport(
  settings: VectorizeSettings,
  activeProfileId: ProfileId | null = null,
  profileModified = false,
): SettingsExport {
  return {
    app: SETTINGS_EXPORT_APP,
    kind: SETTINGS_EXPORT_KIND,
    version: SETTINGS_EXPORT_VERSION,
    settings: normalizeSettings(settings),
    activeProfileId: activeProfileId && isProfileId(activeProfileId) ? activeProfileId : null,
    profileModified: profileModified === true,
  }
}

/** Serialize an export document to indented JSON suitable for a file or clipboard. */
export function serializeSettings(
  settings: VectorizeSettings,
  activeProfileId: ProfileId | null = null,
  profileModified = false,
): string {
  return `${JSON.stringify(createSettingsExport(settings, activeProfileId, profileModified), null, 2)}\n`
}

/**
 * Parse an export document (or a bare settings object) back into applicable
 * settings. Throws an `Error` with a human-readable message when the input is
 * not usable so callers can surface it directly.
 */
export function parseSettingsImport(input: string): ImportedSettings {
  let data: unknown
  try {
    data = JSON.parse(input)
  } catch {
    throw new Error('Not valid JSON')
  }
  if (!isRecord(data)) {
    throw new Error('Not a settings object')
  }

  // Accept both the full export wrapper ({ settings: {...} }) and a bare
  // settings object, so a hand-edited or partial paste still works.
  const payload = isRecord(data.settings) ? data.settings : data
  const known = coerceKnownSettings(payload)
  if (Object.keys(known).length === 0) {
    throw new Error('No recognizable settings found')
  }

  const idRaw = data.activeProfileId
  return {
    settings: normalizeSettings(known),
    activeProfileId: typeof idRaw === 'string' && isProfileId(idRaw) ? idRaw : null,
    profileModified: data.profileModified === true,
  }
}

function isProfileId(id: string): id is ProfileId {
  return TARGET_PROFILES.some((p) => p.id === id)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Copy only the fields the schema defines, and only when their type matches the
 * default's — derived from `DEFAULT_SETTINGS`, never a hand-maintained list, so
 * it stays correct as the schema grows. Values are still clamped afterwards by
 * `normalizeSettings`; this pass just drops unknown keys and wrong-typed junk
 * (e.g. a numeric `palette`) that could otherwise break normalization.
 */
function coerceKnownSettings(raw: Record<string, unknown>): Partial<VectorizeSettings> {
  const out: Record<string, unknown> = {}
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    if (!(key in raw)) continue
    const value = raw[key]
    if (key === 'palette') {
      // string[] | null — normalizeSettings filters entries to valid hex.
      if (value === null || Array.isArray(value)) out[key] = value
    } else if (typeof value === typeof def) {
      out[key] = value
    }
  }
  return out as Partial<VectorizeSettings>
}
