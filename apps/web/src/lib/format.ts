import type { StageId } from '@vectorizer/core'

/** 12345 → "12.3 kB" (SI units, trimmed decimals). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '—'
  if (bytes < 1000) return `${Math.round(bytes)} B`
  if (bytes < 1_000_000) return `${trim(bytes / 1000)} kB`
  return `${trim(bytes / 1_000_000)} MB`
}

function trim(v: number): string {
  const s = v >= 100 ? v.toFixed(0) : v.toFixed(1)
  return s.endsWith('.0') ? s.slice(0, -2) : s
}

/** 234.5 → "235 ms", 1830 → "1.83 s". */
export function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

/** 12345 → "12,345" (non-breaking group separators). */
export function formatCount(n: number): string {
  return new Intl.NumberFormat('en-US').format(n)
}

export const STAGE_LABELS: Record<StageId, string> = {
  preprocess: 'Preprocess',
  palette: 'Palette',
  segment: 'Segment',
  trace: 'Trace',
  fit: 'Fit curves',
  svg: 'Write SVG',
}
