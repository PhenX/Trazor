import type { WarningCode } from '@trazor/core'

/**
 * Catalog sub-key (under `warnings.`) for each engine warning code — the
 * kebab-case codes map to camelCase message groups, each carrying a short
 * `label` (the stats-bar chip) and a `message` (the tooltip, interpolated from
 * the warning's `params`).
 */
const WARNING_KEY: Record<WarningCode, string> = {
  'stencil-islands': 'stencilIslands',
  'node-count': 'nodeCount',
  'empty-result': 'emptyResult',
  'palette-clamped': 'paletteClamped',
  'tiny-features': 'tinyFeatures',
  'centerline-input': 'centerlineInput',
  'gradient-spot-color': 'gradientSpotColor',
  'mode-note': 'modeNote',
}

/** i18n key base for a warning code, e.g. `warnings.stencilIslands`. */
export function warningKeyBase(code: WarningCode): string {
  return `warnings.${WARNING_KEY[code]}`
}
