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

/**
 * Id of the illustration shown alongside a note. Each id maps — in
 * `components/illustrations/` (see its `index.ts`) — to a set of real sample
 * images: an actual before/after trace produced by Trazor from one CC0 source
 * photo (see that folder's `LICENSES.md`), so the picture shows the exact
 * behaviour the note describes. Illustrations are optional; add one only to a
 * note whose change is genuinely visible in a trace, and where an honest
 * before/after (or candidate set) can be produced. Notes whose output looks
 * identical before and after (e.g. a layer-ordering change) get none.
 */
export type ReleaseIllustration = 'auto-optimize' | 'clean-edges' | 'auto-detect'

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
  /** Optional decorative illustration shown above the items. */
  illustration?: ReleaseIllustration
}

/**
 * Every release note, newest first. The order of this array is the source of
 * truth for "which notes are newer than the one a visitor last saw", so keep it
 * strictly newest-to-oldest.
 */
export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    date: '2026-08-25',
    iteration: 1,
    kind: 'feature',
    title: 'Gradient fills',
    items: [
      'Color and grayscale traces can now paint smooth color ramps — skies, soft shading, backgrounds, spotlights, sunsets — with a single SVG gradient instead of a stack of posterized bands, so the result looks smoother and uses fewer shapes. Straight (linear) and circular (radial) ramps are recognized, and a ramp that shifts hue along the way keeps the extra color stops it needs to follow the sweep. Turn on "Gradient fills" in the palette settings; it is on by default in the Illustration and Photo / Poster presets.',
      'Gradients are detected automatically per region and stay fully editable vector output. They are meant for screen and print, not spot-color cutting — a note flags them when you export to a cutter-style setup.',
    ],
  },
  {
    date: '2026-08-24',
    iteration: 7,
    kind: 'improvement',
    title: 'Illustrated release notes',
    items: [
      "The What's new panel now shows real before/after samples on the notes about how tracing looks — cleaner edges, sharper auto-detect and the new Auto-optimize — each one an actual Trazor trace of the same picture, so you can see the difference at a glance before reading it.",
    ],
  },
  {
    date: '2026-08-24',
    iteration: 6,
    kind: 'improvement',
    title: 'Preview overlay & compare polish',
    items: [
      'Panning with "Show path & nodes" on is now smooth, even on very dense traces. The anchor marks and handles are built once and only recomputed when you zoom; the densest traces reuse the last frame while you drag and redraw crisply once you stop.',
      'The anchor crosses are a touch smaller, so the geometry underneath is easier to read.',
      'The PNG/SVG compare divider is easier to grab — a wider catch area and a slightly bolder line.',
      'New "Confetti" sample: a dense pattern that traces to tens of thousands of nodes, handy for seeing the overlay on heavy geometry.',
    ],
  },
  {
    date: '2026-08-24',
    iteration: 5,
    kind: 'feature',
    title: 'Auto-optimize your settings',
    illustration: 'auto-optimize',
    items: [
      'A new Auto-optimize tool searches the settings space for you: set how much you care about fidelity, simplicity, file size, fewer colors, and cleanliness, pick an iteration budget, and it traces many candidates in parallel to find the best combination for your image. Presets seed common goals (Max fidelity, Balanced, Smallest file, Cut-ready).',
      'Compare every candidate on one wall, sorted by any measure or filtered to the best trade-offs. Turn on Compare zoom to magnify the exact same spot across all of them — and against the original — at once, or open any candidate side by side with the source and step through the rest with the arrow keys. Then apply the one you like, or revert to your original settings.',
      'It also tries the suggested palettes for your image, and under Advanced can explore the segmentation method, curve style, and layering. Large images stay fast: the search explores at a reduced size first, then re-traces only its best candidates at full resolution.',
    ],
  },
  {
    date: '2026-08-24',
    iteration: 4,
    kind: 'feature',
    title: 'Cleaner edges for flat art and line art',
    illustration: 'clean-edges',
    items: [
      'A new region-growing segmentation traces cartoons, logos and clip art far more faithfully. Instead of matching every pixel to one global palette — which turned the soft edge between two colors into a hairline rim of a third color — it grows each color region outward from its flat interior, so an anti-aliased edge is split cleanly between its two real neighbors. No more rim halos or speckled outlines, and the linework stays smooth.',
      'Auto-detect switches to it automatically for crisp flat art; you can also pick it under Segmentation → Region growing, or keep Global palette for photos and gradients.',
    ],
  },
  {
    date: '2026-08-24',
    iteration: 3,
    kind: 'improvement',
    title: 'Sharper auto-detect for clean artwork',
    illustration: 'auto-detect',
    items: [
      'Crisp cartoons, logos and clip art are no longer mistaken for photographs. The soft anti-aliased edges of clean art used to read as photographic texture, which picked the wrong profile — posterizing, over-smoothing, or even dropping all color and tracing in grayscale. Auto-detect now recognizes the large flat areas that only clean art has and keeps it as a faithful color illustration.',
      'A vivid subject on a big black or white background stays in color. The background no longer dilutes the color measurement enough to flip the image to grayscale.',
      'Far fewer tiny speck shapes along edges. Anti-aliased borders used to scatter thousands of hairline slivers of an in-between color; auto-detect now merges those specks and dissolves the seams, so the trace is the real shapes — cleaner and much smaller — without blurring the linework.',
    ],
  },
  {
    date: '2026-08-24',
    iteration: 2,
    kind: 'improvement',
    title: 'Cleaner layered vinyl',
    items: [
      'In stacked color mode, the color that outlines the most — the black lines in a cartoon, the backdrop in a flat design — now forms the full base layer at the bottom of the stack, so it reads through the sheets stacked on top of it the way layered vinyl is built. The traced picture looks identical; only which color is the full backing sheet changes.',
      'An enclosed detail like an eye pupil, when it is buried under two or more sheets, now lifts onto its own top cut layer, so the sheets beneath it stay whole instead of each carrying a hole you would have to weed and line up (a detail with just one sheet over it keeps its single hole). Grouped stacked output groups by cut layer rather than by color, so an outline color that reappears as one of these top details stays a separate, correctly ordered layer.',
    ],
  },
  {
    date: '2026-08-24',
    iteration: 1,
    kind: 'fix',
    title: 'A smoother, more responsive studio',
    items: [
      'Opening a photo no longer freezes the studio while palette suggestions are prepared — that work now happens in the background, so the interface stays responsive.',
      'Scoring how closely a trace matches the original (the fidelity score and Difference view) also runs in the background now, so adjusting settings on large images stays smooth.',
    ],
  },
  {
    date: '2026-08-23',
    iteration: 6,
    kind: 'improvement',
    title: 'Cleaner color tracing and smarter auto settings',
    items: [
      'Color and illustration tracing keeps region colors more consistent along edges — fewer stray wrong-colored slivers between shapes — and produces smaller files with fewer nodes.',
      'Auto settings now recognize black-and-white line drawings and trace them as crisp black & white instead of tonal gray tones.',
    ],
  },
  {
    date: '2026-08-23',
    iteration: 5,
    kind: 'feature',
    title: 'Layer visualizer',
    items: [
      'A new Layers panel lists every color in the traced result — the sheets you would cut and stack — so you can see at a glance whether a file has too many layers or shapes before importing it into your cutter.',
      'Expand a layer to inspect its individual contours, with a bigger preview on hover and a running count of shapes and nodes.',
      'Hover or click a layer to highlight just that color in the preview; click a swatch to copy its hex.',
      'The panel sits on the right on desktop and slides in as a drawer on phones.',
    ],
  },
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
