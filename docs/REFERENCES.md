# Literature & model references

Every non-trivial algorithm and ML model in this codebase, with its source and
where it is used. Keep this file up to date when adding or changing algorithms.

> Note on licensing: algorithms are implemented from their published
> descriptions (papers), never by porting GPL source code. Model weights keep
> their own licenses, listed below.

## Vector tracing (packages/trace)

- **Peter Selinger, “Potrace: a polygon-based tracing algorithm”, 2003.**
  <https://potrace.sourceforge.net/potrace.pdf>
  The complete high-quality curve chain implemented in `packages/trace/src/potrace/`:
  path decomposition over pixel “crack” boundaries with turn policies (§2.1),
  straight-subpath analysis (§2.2.1), optimal polygon via penalty-minimizing
  dynamic programming (§2.2.2–2.2.3), vertex adjustment by least-squares
  (§2.3.1), corner analysis / smoothing with the α_max parameter (§2.3.2), and
  curve optimization joining Bézier runs (§2.4). Clean-room implementation from
  the paper; Potrace’s GPL source was not used.
- **Philip J. Schneider, “An Algorithm for Automatically Fitting Digitized
  Curves”, in _Graphics Gems_, Academic Press, 1990.**
  Least-squares cubic Bézier fitting with iterative reparameterization
  (Newton-Raphson) and recursive splitting at max-error points. Used for open
  polylines (centerline strokes) in `packages/trace/src/fit.ts`.
- **David Douglas & Thomas Peucker, “Algorithms for the reduction of the number
  of points required to represent a digitized line or its caricature”,
  _Cartographica_ 10(2), 1973.** Polyline simplification used for open paths
  before fitting (`packages/trace/src/simplify.ts`).
- **T. Y. Zhang & C. Y. Suen, “A fast parallel algorithm for thinning digital
  patterns”, _Communications of the ACM_ 27(3), 1984.** Skeletonization for
  centerline mode (`packages/raster/src/thin.ts`).
- **Gunilla Borgefors, “Distance transformations in digital images”, _Computer
  Vision, Graphics, and Image Processing_ 34, 1986.** 3-4 chamfer distance
  transform used to estimate stroke width for centerline output
  (`packages/raster/src/thin.ts`).

## Shape fitting (packages/svg)

- **I. Kåsa, “A circle fitting procedure and its error analysis”, _IEEE Trans.
  Instrumentation and Measurement_ 25(1), 1976.** Algebraic least-squares circle
  fit; recovers an unbiased center/radius from unevenly-spaced boundary samples
  for `<circle>` primitive recognition (`packages/svg/src/fit.ts`) and for
  collapsing circular-arc Bézier runs to `A` commands (`packages/svg/src/arc.ts`).
- **Andrew Fitzgibbon, Maurizio Pilu & Robert Fisher, “Direct least square
  fitting of ellipses”, _IEEE Trans. PAMI_ 21(5), 1999.** Direct conic ellipse
  fit (smallest-eigenvector of the design scatter). Used, with the points
  normalized for conditioning, to recover `<ellipse>` center/radii/angle
  (`packages/svg/src/fit.ts`).
- **W3C, “Scalable Vector Graphics (SVG) 1.1”, Appendix F.6 — “The elliptical arc
  implementation notes”.** Endpoint↔center parameterization of the `A` command
  (out-of-range radii correction, center and swept-angle formulas). Implements
  arc bounds and arc→Bézier reconstruction (`packages/core/src/path.ts`
  `arcToCenter`, `packages/svg/src/arc.ts` `arcToCubics`).

## Color & quantization (packages/core, packages/raster)

- **Björn Ottosson, “A perceptual color space for image processing” (Oklab), 2020.** <https://bottosson.github.io/posts/oklab/>
  All perceptual color math: clustering distances, palette merging, ΔE
  fidelity scoring (`packages/core/src/color.ts`).
- **Stuart P. Lloyd, “Least squares quantization in PCM”, _IEEE Trans.
  Information Theory_ 28(2), 1982.** The assign/update iterations the k-means
  refinement runs after seeding (`packages/raster/src/quantize.ts`).
- **David Arthur & Sergei Vassilvitskii, “k-means++: The Advantages of Careful
  Seeding”, _SODA_ 2007.** Palette clustering seeding
  (`packages/raster/src/quantize.ts`).
- **Nobuyuki Otsu, “A Threshold Selection Method from Gray-Level Histograms”,
  _IEEE Trans. SMC_ 9(1), 1979.** Automatic binarization threshold
  (`packages/raster/src/threshold.ts`).
- **Fernand Meyer, “Color image segmentation”, _ICIP_ 1992**, and **Luc Vincent
  & Pierre Soille, “Watersheds in digital spaces: an efficient algorithm based on
  immersion simulations”, _IEEE Trans. PAMI_ 13(6), 1991.** Marker-controlled
  watershed by priority flooding: flat interiors seed the regions, a
  color-distance priority queue grows them over anti-aliased edges. The
  region-growing color segmentation front-end for flat art
  (`packages/raster/src/segment.ts`), which avoids the third-color rim a global
  palette invents on soft edges. Followed by a region-adjacency-graph
  agglomerative merge (near-duplicate and small-region folding).
- **Frank Crow, “Summed-area tables for texture mapping”, _SIGGRAPH_ 1984.**
  Integral images backing the adaptive (local-mean) threshold
  (`packages/raster/src/threshold.ts`).
- **C. Tomasi & R. Manduchi, “Bilateral Filtering for Gray and Color Images”,
  _ICCV_ 1998.** Edge-preserving denoise option
  (`packages/raster/src/filters.ts`).
- **Edwin H. Land & John J. McCann, “Lightness and Retinex Theory”, _J. Optical
  Society of America_ 61(1), 1971, pp. 1–11** (doi:10.1364/JOSA.61.000001),
  single-scale center/surround form after **Daniel J. Jobson, Zia-ur Rahman &
  Glenn A. Woodell, “Properties and performance of a center/surround retinex”,
  _IEEE Trans. Image Processing_ 6(3), 1997, pp. 451–462** (doi:10.1109/83.557356).
  Illumination flattening: the low-frequency lightness field is estimated by a
  wide blur of Oklab L and divided out (renormalized to the mean), so smooth
  shading collapses to a flat tone before quantization
  (`packages/raster/src/illumination.ts`).
- **Kaiming He, Jian Sun & Xiaoou Tang, “Guided Image Filtering”, _IEEE Trans.
  PAMI_ 35(6), 2013, pp. 1397–1409** (doi:10.1109/TPAMI.2012.213). The
  edge-aware (default) illumination estimator above: a self-guided linear filter
  (guide = input = L) whose local ridge-regression coefficients, box-averaged
  via summed windows, follow the shading inside a region but hold at hard color
  edges — so dividing the estimate out leaves no cross-boundary halo
  (`packages/raster/src/illumination.ts`).

## Settings search (packages/tune)

- **Robert Hooke & T. A. Jeeves, “‘Direct Search’ Solution of Numerical and
  Statistical Problems”, _Journal of the ACM_ 8(2), 1961.** The adaptive
  coordinate/pattern search behind the auto-tune loop: probe one parameter at a
  time from the incumbent, expand the step on success and contract it on failure
  (`packages/tune/src/search.ts`).
- **M. D. McKay, R. J. Beckman & W. J. Conover, “A Comparison of Three Methods
  for Selecting Values of Input Variables in the Analysis of Output from a
  Computer Code”, _Technometrics_ 21(2), 1979.** Latin-hypercube sampling used
  to seed the search’s first round so the free parameters are exercised at
  spread-out levels (`packages/tune/src/search.ts`).

## Local ML models (packages/ml)

- **Xuebin Qin et al., “U²-Net: Going Deeper with Nested U-Structure for
  Salient Object Detection”, _Pattern Recognition_ 106, 2020.**
  <https://arxiv.org/abs/2005.09007> — background removal. Weights: `u2netp`
  (lightweight variant, ~4.6 MB) via the rembg project’s model mirror,
  Apache-2.0.
- **Alexander Kirillov et al., “Segment Anything”, _ICCV_ 2023.**
  <https://arxiv.org/abs/2304.02643> — the promptable-segmentation interface
  (point prompts → mask) our magic-select follows.
- **Zigeng Chen et al., “SlimSAM: 0.1% Data Makes Segment Anything Slim”, 2023.**
  <https://arxiv.org/abs/2312.05284> — pruned SAM used for in-browser
  segmentation. Weights: `Xenova/slimsam-77-uniform` ONNX export (quantized),
  Apache-2.0.
- **Learned edge pre-pass — this project’s own model, MIT.** A compact
  boundary-detection network (HED / PiDiNet class, cited in
  [`ML_STRATEGY.md`](ML_STRATEGY.md#references)) that predicts clean region
  boundaries from a degraded raster and guides despeckle / small-region merge so
  real detail survives (`packages/ml/src/edge.ts`; spec and training in
  [`EDGE_PREPASS.md`](EDGE_PREPASS.md)). Weights: `edge-prepass.onnx` (~0.46 MB,
  int8), fetched from this repo’s [`models` GitHub
  Release](https://github.com/PhenX/Trazor/releases/tag/models) at deploy
  time and served same-origin — not committed to git.
- **ONNX Runtime Web** — WebGPU/WASM inference runtime, MIT.
  <https://onnxruntime.ai/>
- **Daniel Gatis, “rembg” (software), MIT.**
  <https://github.com/danielgatis/rembg> — source of the u2netp weight mirror
  and of the divide-by-max preprocessing convention our background remover
  reproduces (`packages/ml/src/background.ts`).
- **Hugging Face / Xenova, “Transformers.js” (software), Apache-2.0.**
  <https://github.com/huggingface/transformers.js> — source of the SlimSAM ONNX
  export and its letterbox/normalization/graph-name conventions
  (`packages/ml/src/segment.ts`).

## Related & compared work (not shipped)

- **Peter Selinger, Potrace (software), GPL-2.0.** Reference implementation of
  the paper above; not used as code because its license is incompatible with
  this repository’s MIT license.
- **Vision Cortex, “VTracer”, MIT © 2024 TSANG, Hao Fung.**
  <https://github.com/visioncortex/vtracer> — the O(n) color-tracing framework
  (connected-cluster segmentation → hierarchical layering → spline fit). Used as
  the measured benchmark oracle (`scripts/eval/tracer-compare.ts`); its clustering
  was also ported and evaluated as a color segmentation front-end. The finding
  ([`VTRACER_COMPARISON.md`](VTRACER_COMPARISON.md)): VTracer's low invented-hue
  count comes from keeping many clusters, not from the clustering method, so a
  region-mean port regresses in Trazor's small-palette pipeline — the color-fidelity
  win came from palette budgeting instead (`packages/assist/src/recommend.ts`).
  Informed the stacked/cutout layering vocabulary; cutouts use the shared
  boundary-graph approach for seam-freedom.
- **T. Xia, B. Liao & Y. Yu, “Patch-based Image Vectorization with Automatic
  Curvilinear Feature Alignment”, _SIGGRAPH Asia_ 2009**, and
  **J. Kopf & D. Lischinski, “Depixelizing Pixel Art”, _SIGGRAPH_ 2011** —
  background for the pixel-art and gradient-handling roadmap items.
- **ML & dataset roadmap.** Prospective ML models (DeepSVG, StarVector,
  LIVE/DiffVG, cleanup/refinement networks) and how a training set would be
  produced are discussed in [`ML_STRATEGY.md`](ML_STRATEGY.md). Citations move
  into this file once the corresponding code ships — as the learned edge
  pre-pass now has (above).
