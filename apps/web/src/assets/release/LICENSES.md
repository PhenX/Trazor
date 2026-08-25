# Release-note illustration assets

These images illustrate entries in the "What's new" panel
([`src/lib/releaseNotes.ts`](../../lib/releaseNotes.ts)). Each is a real trace
produced by Trazor itself from a single public-domain source image, so the
before/after pairs show the actual behaviour the notes describe.

## Source image

- **File:** `_source-toucan.svg` (kept here for provenance / regeneration)
- **Title:** _Toucan cartoon_
- **Author:** Ebaychatter0
- **Source:** https://commons.wikimedia.org/wiki/File:Toucan_cartoon.svg
- **License:** [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) —
  public domain dedication, no attribution required. Compatible with this
  project's MIT license. The credit above is courtesy, not an obligation.

## Generated images

All PNGs below were rendered by tracing `_source-toucan.svg` through
`@trazor/engine` and rasterising the resulting SVG. They are derivatives of a
CC0 work and carry no additional restrictions.

| File(s)                                            | Note                       | How it was traced                                                                                            |
| -------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `clean-edges-before.png` / `clean-edges-after.png` | Cleaner edges for flat art | `segmentation: 'quantize'` (global palette) vs `'regions'` (region growing)                                  |
| `auto-detect-before.png` / `auto-detect-after.png` | Sharper auto-detect        | `mode: 'grayscale'` vs `mode: 'color'`                                                                       |
| `auto-optimize-1.png` … `auto-optimize-6.png`      | Auto-optimize              | six candidates at different `paletteSize` / `segmentation` / `mode`; `auto-optimize-5.png` is the chosen one |

To regenerate, re-trace the source SVG with the settings above (see the note's
`items` for the user-facing description).
