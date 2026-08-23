// User-facing release notes shown by the "What's new" panel.
//
// There is no formal version yet, so each note is identified by its calendar
// date plus a per-day iteration (see `releaseId`). Add a new entry at the TOP
// of RELEASE_NOTES on every merged pull request that changes something a user
// would notice — the process and id scheme live in apps/web/AGENTS.md.
//
// Note copy (title/items) is authored in English; only the surrounding chrome
// (date, "New" badge, kind labels) is localized.

import { i18n } from '../i18n'

export type ReleaseNoteKind = 'feature' | 'improvement' | 'fix'

export interface ReleaseNote {
  /** Publication date, ISO `YYYY-MM-DD`. */
  date: string
  /**
   * 1-based counter distinguishing notes published on the same date — the
   * stand-in for a version number. The first note of a day is `1`, the next
   * `2`, and so on; the newest note of a day carries the highest number.
   */
  iteration: number
  /** Dominant category of the change; drives the tag color. */
  kind: ReleaseNoteKind
  /** Short, plain-language headline. */
  title: string
  /** One plain-language line per change — no jargon. */
  items: string[]
}

/**
 * Every release note, newest first. The order of this array is the source of
 * truth for "which notes are newer than the one a visitor last saw", so keep it
 * strictly newest-to-oldest.
 */
export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    date: '2026-08-23',
    iteration: 4,
    kind: 'fix',
    title: 'Truer split view and smoother inspection',
    items: [
      'The side-by-side split view no longer lets the original image show through the traced result, so each side shows only its own picture.',
      'Panning and zooming with "Show path nodes & outlines" turned on is noticeably smoother on detailed traces.',
    ],
  },
  {
    date: '2026-08-23',
    iteration: 3,
    kind: 'feature',
    title: 'Now available in French',
    items: [
      'The studio is now translated into French and picks your language automatically from your browser.',
      'A language menu in the header lets you switch between English and French at any time, and your choice is remembered.',
    ],
  },
  {
    date: '2026-08-23',
    iteration: 2,
    kind: 'feature',
    title: "What's new panel",
    items: [
      'This "What\'s new" list opens from the button in the header, so recent changes are one click away.',
      'A small badge on that button flags notes published since your last visit, and clears once you have read them.',
      'Each note is stamped with its date and a daily number (for example 2026-08-23.2) until proper versioning arrives.',
    ],
  },
  {
    date: '2026-08-23',
    iteration: 1,
    kind: 'improvement',
    title: 'Cleaner curves and lighter SVGs',
    items: [
      'Centerline (single-stroke) tracing now keeps the source colors, which suits vinyl cutting and pen plotting.',
      'Curve fitting uses fewer points for the same shape, so exported files are smaller without looking rougher.',
    ],
  },
  {
    date: '2026-08-22',
    iteration: 2,
    kind: 'feature',
    title: 'Save and reuse your settings',
    items: [
      'Export the current settings and target profile to a small file, then import them again whenever you need them.',
      'Reapply the exact same look across a batch of images without setting every slider by hand.',
    ],
  },
  {
    date: '2026-08-22',
    iteration: 1,
    kind: 'improvement',
    title: 'Works on phones, and shows how a trace is built',
    items: [
      'The studio now fits phone-sized screens, with the result pinned above a control panel that scrolls on its own.',
      'A new overlay colors each part of the traced SVG by kind, so you can see how the drawing is put together.',
    ],
  },
]

/**
 * Stable id and version label of a note: `YYYY-MM-DD.iteration`, e.g.
 * `2026-08-23.2`. Used both as a display tag and as the "last seen" marker.
 */
export function releaseId(note: ReleaseNote): string {
  return `${note.date}.${note.iteration}`
}

/** Id of the newest note, or `null` when there are none. */
export function latestReleaseId(): string | null {
  return RELEASE_NOTES.length > 0 ? releaseId(RELEASE_NOTES[0]) : null
}

/**
 * How many notes are newer than the one a visitor last saw. A `null` marker
 * (first visit, or cleared storage) counts every note as unseen; a marker that
 * no longer matches any note does the same, so a returning visitor is never
 * shown fewer updates than there really are.
 */
export function countUnseen(lastSeenId: string | null): number {
  if (!lastSeenId) return RELEASE_NOTES.length
  const index = RELEASE_NOTES.findIndex((note) => releaseId(note) === lastSeenId)
  return index === -1 ? RELEASE_NOTES.length : index
}

/**
 * Format an ISO `YYYY-MM-DD` date for the active locale, e.g. `August 23, 2026`
 * or `23 août 2026`. Built from `Date.UTC` (not the wall clock), so it is
 * deterministic for a given date + locale.
 */
export function formatReleaseDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return date
  const utc = new Date(Date.UTC(year, month - 1, day))
  return new Intl.DateTimeFormat(i18n.global.locale.value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(utc)
}
