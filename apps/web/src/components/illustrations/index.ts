// Registry of release-note illustrations. Each `ReleaseIllustration` id maps to
// a set of real sample images — an actual before/after trace, or a wall of
// candidate traces — produced by Trazor from one CC0 source picture. The images
// live beside this file under `../../assets/release/` (provenance + license in
// that folder's `LICENSES.md`); Vite turns each import into a hashed URL string.
//
// Kept out of the notes data module so `lib/releaseNotes.ts` stays asset-free;
// `ReleaseNotes.vue` looks a note's `illustration` up here and hands the
// descriptor to `ReleaseFigure.vue`.

import type { ReleaseIllustration } from '../../lib/releaseNotes'

import cleanEdgesBefore from '../../assets/release/clean-edges-before.png'
import cleanEdgesAfter from '../../assets/release/clean-edges-after.png'
import autoDetectBefore from '../../assets/release/auto-detect-before.png'
import autoDetectAfter from '../../assets/release/auto-detect-after.png'
import autoOptimize1 from '../../assets/release/auto-optimize-1.png'
import autoOptimize2 from '../../assets/release/auto-optimize-2.png'
import autoOptimize3 from '../../assets/release/auto-optimize-3.png'
import autoOptimize4 from '../../assets/release/auto-optimize-4.png'
import autoOptimize5 from '../../assets/release/auto-optimize-5.png'
import autoOptimize6 from '../../assets/release/auto-optimize-6.png'

/** Two traces of one picture, shown side by side. */
export interface CompareFigure {
  kind: 'compare'
  before: string
  after: string
}

/** A wall of candidate traces, one of them the chosen result (`winner`, 0-based). */
export interface WallFigure {
  kind: 'wall'
  images: string[]
  winner: number
}

export type ReleaseFigureData = CompareFigure | WallFigure

export const RELEASE_ILLUSTRATIONS: Record<ReleaseIllustration, ReleaseFigureData> = {
  'clean-edges': { kind: 'compare', before: cleanEdgesBefore, after: cleanEdgesAfter },
  'auto-detect': { kind: 'compare', before: autoDetectBefore, after: autoDetectAfter },
  'auto-optimize': {
    kind: 'wall',
    images: [
      autoOptimize1,
      autoOptimize2,
      autoOptimize3,
      autoOptimize4,
      autoOptimize5,
      autoOptimize6,
    ],
    winner: 4,
  },
}
