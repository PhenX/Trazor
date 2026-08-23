# Trazor vs. VTracer — what we learned

A record of the investigation into "is [VTracer](https://github.com/visioncortex/vtracer)
better than Trazor, especially on color?", so the conclusions don't have to be
re-derived. VTracer is MIT © 2024 TSANG, Hao Fung; it is used here only as a
measured benchmark oracle (see `scripts/eval/tracer-compare.ts`), not as shipped
code.

## TL;DR

- Trazor already beat VTracer on average color accuracy (mean Oklab ΔE), edge/band
  ΔE, worst-tail (p95), and file size. The one axis VTracer won was **invented
  hues** — the "spurious" metric — which is what people _perceive_ as "VTracer's
  colors look more accurate."
- The cause was **not** the tracing or segmentation algorithm. It was the
  **auto-chosen palette being too small.** With too few colors, k-means is forced
  to give two genuinely distinct regions a _shared_ centroid — e.g. the brown dog
  and the green grass collapse to one muddy green (the dog "goes green"), and thin
  seam intermediates between shapes get their own centroid and paint wrong-colored
  bands.
- **The fix** (`packages/assist/src/recommend.ts`): for rich-color images, floor
  the palette at the profile's budget (illustration 24, photo 32) and turn on
  `autoPaletteSize` (autoK) so near-duplicate centroids still merge away. Distinct
  colors stay separated; clean art doesn't bloat. This closed the gap and Trazor
  now leads VTracer on **every** measured axis, at overall-smaller files.
- **Region-based segmentation is a dead end for us** (measured twice — SLIC vote
  and a VTracer-style connected-cluster port). Both _regressed_. See below.

## Reproducing

```
npm run eval:tracers -- --data scripts/eval/corpus-vtracer --montage
# force a knob for all images:  --set paletteSize=24 --set autoPaletteSize=true
```

Corpus: `scripts/eval/corpus-vtracer/` (the dog photo `angel-luciano…`, `Gum Tree
Vector`, `Cityscape Sunset`, `K1_drawing`, `tank-unit`, `vectorstock`).

## Metrics (all lower = better except score)

- **ΔE** — mean Oklab distance of the re-rasterized SVG vs. the source. Average
  fidelity.
- **band** — ΔE restricted to edge zones. Catches wrong-colored bands at seams.
- **spurious** — for each output pixel, the ΔE to the _nearest source color in a
  window_. This is the "invented color" metric: a hue that appears nowhere nearby
  in the source scores high. It matches the human read of "made-up colors."
- **p95** — 95th-percentile ΔE (worst-tail).
- **score** — a single 0–1 rollup of ΔE.

## Where Trazor already won (baseline, auto settings)

| metric       | Trazor     | VTracer    |
| ------------ | ---------- | ---------- |
| ΔE           | 0.0283     | 0.0321     |
| band         | 0.0513     | 0.0578     |
| p95          | 0.1107     | 0.1285     |
| **spurious** | **0.0158** | **0.0137** |
| bytes vs V   | 0.33×      | 1.0×       |

Only **spurious** favored VTracer. VTracer buys it with far more clusters/colors
(its `vectorstock` output is 123k nodes / 3.7 MB vs Trazor's 16k / 0.39 MB) — many
small, individually-accurate regions. That is the opposite of Trazor's goal (clean,
small, editable vectors), so "just keep more colors everywhere" is not the answer;
the right amount of color, per image, is.

## Root cause: too few colors → shared centroids

k-means with k too small cannot afford a centroid for every distinct region, so it
merges the nearest ones. Consequences the user actually saw:

- **The green dog.** The dog's fur and the grass are close enough in Oklab that at
  k≈16 they share one centroid → the dog is painted grass-green.
- **Wrong-colored seam bands.** A JPEG/anti-aliased seam between two shapes is an
  intermediate color; with a tight palette, k-means spends a centroid _on that
  intermediate_, and it gets traced as a band.

More colors fixes both — but naively raising k bloats already-clean art (forcing
`Gum Tree` from 15k to 76k nodes, 5× its file). The combination that works:

**palette floor + autoK.** Start from a generous budget so distinct regions get
their own centroid, then let autoK (merge centroids < 0.03 Oklab) collapse the
_genuine_ near-duplicates back down. Distinct colors (dog vs. grass, ~0.03+ apart)
survive; redundant ones don't. `Gum Tree` settles at ~20k nodes, not 76k.

## The fix, measured (auto path)

| metric     | before | after      | VTracer |
| ---------- | ------ | ---------- | ------- |
| ΔE         | 0.0283 | **0.0229** | 0.0321  |
| band       | 0.0513 | **0.0471** | 0.0578  |
| spurious   | 0.0158 | **0.0129** | 0.0137  |
| p95        | 0.1107 | **0.0976** | 0.1285  |
| score      | 0.887  | **0.908**  | 0.872   |
| bytes vs V | 0.33×  | 0.94×      | 1.0×    |

Per-image highlights: dog ΔE 0.0407 → **0.0302** (de-greened, beats VTracer 0.0421);
`Gum Tree` ΔE 0.0128 → **0.0074**, bands gone, only 331 KB → 438 KB. Illustration
spurious 0.0130 → **0.0097**, now under VTracer's 0.0102.

Palette-size sweep that pinned the operating point (kmeans, forced k):

| k          | spurious | bytes vs V | note                         |
| ---------- | -------- | ---------- | ---------------------------- |
| 16         | 0.0158   | 0.33×      | ships-before; invented hues  |
| 24         | 0.0143   | 1.03×      | gap ~closed                  |
| 32         | 0.0138   | 1.38×      | ties VTracer                 |
| 24 + autoK | 0.0133   | **0.76×**  | beats VTracer, smaller files |
| 32 + autoK | 0.0126   | 1.04×      | beats VTracer more           |

## Dead ends (don't re-try without a new idea)

**Region-based color segmentation — regressed, twice.** The theory was VTracer's
"segment first, color the region as a whole" avoids seam hues. Reality: forcing
connected regions into Trazor's small palette by coloring each region with one
label _loses per-pixel fidelity everywhere non-flat_, which is most of a photo or
a gradient.

- _SLIC superpixel vote:_ tied colorCoherence on spurious but blocked up edges
  (square superpixels straddle color boundaries).
- _VTracer-style connected-cluster port_ (Felzenszwalb–Huttenlocher regions +
  hierarchical thin/speckle dissolve, Oklab): overall spurious **0.0206** and ΔE
  **0.0392** — worse than the 0.0158 / 0.0283 baseline. Region-mean coloring
  can't beat per-pixel k-means once you reduce to ~16–32 colors.

The lesson: VTracer's low invented-hue is a side effect of keeping _many_ clusters,
not of the clustering method. In a small-palette pipeline, **per-pixel k-means plus
local cleanup (colorCoherence) is better than any region-mean scheme.** The lever
is palette budget, not the segmenter. Both region experiments were removed.

## Remaining tradeoffs / if you want to push further

- **Photo file size.** Posterizing a photo at 32 colors is inherently heavy — the
  dog is now ~4.6 MB / 211k nodes (VTracer 2.76 MB / 81k). Trazor's per-color
  stacked layering is less node-efficient for photos than VTracer's gradient
  layering. This is the one place VTracer is genuinely more compact. Closing it is
  a _node-efficiency_ project (merge co-incident layer boundaries / gradient-aware
  layering), not a color one. The >20k-node warning already flags it to users.
- **colorCoherence stays** (profiles set 0.5) — a small, real cleanup on top of the
  palette fix; not redundant.
- Photos remain a stylization, not a reproduction — as the photo profile warns.
