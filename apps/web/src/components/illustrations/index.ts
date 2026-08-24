// Registry of release-note illustrations: each `ReleaseIllustration` id maps to
// a self-contained, theme-aware inline-SVG component. Kept out of the notes data
// module so `lib/releaseNotes.ts` stays free of Vue imports; `ReleaseNotes.vue`
// looks a note's `illustration` up here.
//
// To add one: create `<Name>Art.vue` beside this file, add its id to
// `ReleaseIllustration` in `lib/releaseNotes.ts`, and wire it in below.

import type { Component } from 'vue'
import type { ReleaseIllustration } from '../../lib/releaseNotes'
import AutoDetectArt from './AutoDetectArt.vue'
import AutoOptimizeArt from './AutoOptimizeArt.vue'
import CleanEdgesArt from './CleanEdgesArt.vue'
import LayeredVinylArt from './LayeredVinylArt.vue'

export const RELEASE_ILLUSTRATIONS: Record<ReleaseIllustration, Component> = {
  'auto-optimize': AutoOptimizeArt,
  'clean-edges': CleanEdgesArt,
  'auto-detect': AutoDetectArt,
  'layered-vinyl': LayeredVinylArt,
}
