# Trazor vs inkvec — coverage-first icon tracing, measured

[inkvec](https://github.com/logolabs/inkvec) (Apache-2.0, Rust) vectorizes icons, logos and emoji, and its own
benchmark ranks Trazor last among the tools it compares against. This is the like-for-like measurement — on inkvec's
home turf (alpha-edged icons from open icon sets), under both metric protocols — the attribution of the gap by
settings sweeps, and the changes it led to. The harness is `scripts/eval/inkvec-compare.ts` (`npm run eval:inkvec`,
see [`../scripts/eval/README.md`](../scripts/eval/README.md)); the corpus is rendered from open icon sets and is not
committed.

## TL;DR

- **Before:** inkvec won 38/38 icons at 512 px on every metric — GMSD 0.0712 vs 0.0148, CIEDE2000 0.63 vs 0.07,
  2.9× the coordinates — and 45/50 at 128 px. Trazor is 10× faster (160 ms in-process vs 1.7 s for inkvec's CLI).
- **The gap was mostly not the curve fitter.** The transparency cut at alpha ≥ 8 is the 3 % coverage contour and
  dilates every edge by ~0.47 px (a third of the GMSD); the analyzer read transparent pixels — stored `(0, 0, 0, 0)`
  — as black and misrouted every alpha-edged icon (a quarter); compositing rims over white before quantization tinted
  fills and invented gray rim rings (two thirds of the ΔE); stacked layering had no sub-pixel refinement and cutout
  none against transparency.
- **After** (this change set): 512 px GMSD 0.0712 → 0.0421 (−41 %), CIEDE2000 0.63 → 0.25 (−61 %), mean ΔE −85 %,
  coordinates −11 %, gzip −8 %, time −14 %; 128 px GMSD 0.116 → 0.093 with coordinates 1 475 → 671 (the mono
  icons leave a pixel-art misroute that copied the raster as rectangles). inkvec still leads ~2.8× on GMSD; what
  remains is the Potrace chain's chord bias, union-under overdraw and gradients, each with a browser-fast fix
  identified.

## Reproducing

```sh
npm run eval:inkvec -- --data <icons-dir> --inkvec /path/to/inkvec --json report.json
npm run eval:inkvec -- --data <icons-dir> --reuse --set alphaThreshold=128   # sweep a setting, keep inkvec's SVGs
```

`<icons-dir>` holds PNGs (`<set>__<name>.png`), a `families.json` tag map and the source SVGs under `truth/`. Both
outputs are rendered with resvg over white; GMSD, Oklab ΔE, CIEDE2000, spurious hue, the 2× scale-fidelity metrics
against the truth, inkvec's coordinate count (M/L 2, C 6, arcs 2, primitives 2), nodes, gzip bytes and wall time are
reported per image, per family and overall, with per-image win counts.

## Attribution (512 px, 38 icons, Trazor only, each row one change)

| Change                         |   GMSD | CIEDE2000 |     ΔE | spurious | coords |  gzip | Reading                                                                                                                                    |
| ------------------------------ | -----: | --------: | -----: | -------: | -----: | ----: | ------------------------------------------------------------------------------------------------------------------------------------------ |
| baseline (auto)                | 0.0712 |     0.631 | 0.0177 |   0.0285 |    807 | 1 531 |                                                                                                                                            |
| palette from region interiors  | 0.0713 |     0.551 | 0.0065 |   0.0133 |    807 | 1 531 | the rim was tinting every fill (`#050505` for black)                                                                                       |
| `--set alphaThreshold=128`     | 0.0488 |     0.505 | 0.0056 |   0.0129 |    709 | 1 367 | the 3 % coverage cut dilated every edge; the gray rim ring it made is gone (Simple Icons 806 → 226 coords); translucent content is dropped |
| `--set precision=2`            | 0.0711 |     0.552 | 0.0065 |   0.0135 |    811 | 1 896 | no quality change, +24 % gzip                                                                                                              |
| analyzer composites over white | 0.0551 |     0.747 | 0.0077 |   0.0116 |    736 | 1 441 | mono icons route to `bw-sketch` (sub-pixel threshold field); one gray-filled, black-outlined mark misread as bilevel                       |
| `--set layering=cutout`        | 0.0542 |     0.751 | 0.0078 |   0.0116 |    782 | 1 735 | Twemoji 0.051 → 0.042 from color-edge refinement; chains written twice                                                                     |
| `--set gradients=true`         | 0.0544 |     0.730 | 0.0077 |   0.0116 |    740 | 1 447 | the synthetic ramp 358 → 70 coords; +50 % time                                                                                             |

## What changed

1. **Analyzer** (`packages/assist`): samples are composited over white (the ground `flattenImage` uses); new measures
   `translucentArea` (partial alpha with partial neighbors: a shadow, glass, steam — a rim never is), `minorTonesArea`
   (a flat third tone, which anti-aliasing never produces), `rimColors` (colors that never fill a flat run) and the two
   dominant tones (`inkHex`/`paperHex`, their lightness). Pixel art needs both a small canvas and a hard palette.
2. **Recommender**: `alphaThreshold: 128` when the partial alpha is rim, so the cut sits at half coverage — the true
   outline of an anti-aliased edge; clean two-tone art thresholds at the lightness midpoint of its two tones and paints
   the measured ink; a flat third tone keeps an image out of black & white.
3. **Palette from region interiors** (`packages/raster/src/palette.ts`): per-channel median over the pixels whose
   four neighbors share the label, after the cleanup settles the labels.
4. **Transparency coverage field** (`alphaCoverageField`) refining exterior edges in both layerings, and a
   **stacked-layer boundary field** (`layerField`) giving stacked layering the sub-pixel color-edge refinement cutout
   had — with the coverage inverted in encoded sRGB (`coverageOf`), the space rasterizers blend in. Helpers receive the
   source alpha and the palette bytes; parity stays byte-identical.
5. The regular-polygon/star primitive fit anchors on the outline's area centroid (a star was emitted 2.3 px off).

`eval:ab` on `corpus-vtracer` (opaque photos, drawings and illustrations — none of the alpha cases above): GMSD held
within the tie band (−1.7 % overall; Cityscape −11 %), mean ΔE ✓ −5.5 %, spurious hue unchanged, no regression on any
image — the verdict reads MIXED only because no GMSD move clears the band on that corpus.

## After (auto settings)

| 512 px (38)   |   GMSD | CIEDE2000 |     ΔE | spurious | scale GMSD | coords |  gzip |    ms |
| ------------- | -----: | --------: | -----: | -------: | ---------: | -----: | ----: | ----: |
| Trazor before | 0.0712 |     0.631 | 0.0177 |   0.0285 |     0.0788 |    807 | 1 531 |   160 |
| Trazor after  | 0.0421 |     0.247 | 0.0026 |   0.0080 |     0.0542 |    717 | 1 405 |   137 |
| inkvec        | 0.0148 |     0.071 | 0.0008 |   0.0038 |     0.0181 |    282 | 1 160 | 1 686 |

Per family after (GMSD Trazor / inkvec): Lucide 0.059 / 0.0085, Material 0.039 / 0.0052, Noto 0.039 / 0.032,
OpenMoji 0.035 / 0.012, Simple Icons 0.050 / 0.020, Twemoji 0.033 / 0.016. Per-image wins Trazor / inkvec: GMSD
2 / 36 (was 0 / 38).

| 128 px (50)   |   GMSD | CIEDE2000 |     ΔE | spurious | scale GMSD | coords |  gzip |  ms |
| ------------- | -----: | --------: | -----: | -------: | ---------: | -----: | ----: | --: |
| Trazor before | 0.1162 |     1.742 | 0.0332 |   0.0266 |     0.1513 |  1 475 | 1 270 |  34 |
| Trazor after  | 0.0933 |     1.136 | 0.0120 |   0.0088 |     0.1244 |    671 | 1 221 |  44 |
| inkvec        | 0.0338 |     0.349 | 0.0034 |   0.0031 |     0.0499 |    396 | 1 460 | 757 |

## What remains, and why

- **The curve chain's chord bias.** On a coverage-exact disk of radius 40 px the polygon vertices sit at mean radius
  40.41 with the field (40.45 without, radial scatter 0.10 vs 0.15) and the emitted curve at 39.74: Selinger's chain
  circumscribes at the vertices and inscribes at the curves, so every convex outline is a fraction of a pixel small.
  inkvec fits its curves to the refined points (a χ² fit per run) and has no such term. The browser-fast fix keeps the
  optimal polygon as the segmentation and refits each run — line, arc or G1 cubic, priced by description length — to
  the refined points by least squares, without inkvec's per-vertex dynamic program (0.5–1 s per ring).
- **Coordinates (2.5× inkvec).** Stacked layering carries the union's outline in every base layer; cutout writes
  every shared chain twice; straight runs are cubics. The **`nested`** layering paints each planar face once (its
  outer ring, in containment order) and merges same-color siblings into one evenodd path — an assembly
  (`assembleFaces`) over the cutout chain graph, not a new data structure. A boundary between nested faces is then
  written once instead of twice, so `nested` carries fewer coordinates than `cutout` at equal GMSD (the overpaint of
  the identical shared curve leaves no seam); it is the default for the logo profile, where it beats cutout. It stays
  off illustration, whose opaque shaded art is smoother under `stacked` (which extends lower layers under upper ones)
  than under any exact partition. The remaining gap on the emoji families is the cubic count of the Potrace chain,
  which the curve refit addresses.
- **Native alpha.** Translucent faces (steam at alpha 115/164 in a Noto emoji) are dropped by the half-coverage cut and
  were painted as light opaque colors by the old one; inkvec emits them with `opacity`. The analyzer already tells the
  cases apart (`translucentArea`).
- **Gradients** are off by default (358 → 70 coordinates on the synthetic ramp when on, +50 % time) and autoK's Oklab
  0.03 merge floor is far stricter near black than inkvec's CIEDE2000 1.5.

Not worth porting: the multi-model dynamic program itself, the 48-iteration boundary solve, symmetry enforcement, the
planar-map rewrite, and 2-decimal emission (measured: no quality change, +24 % gzip).
