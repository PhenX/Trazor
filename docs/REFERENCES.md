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
  polylines (centerline strokes) in `packages/trace/src/fit.ts` and for the
  per-run cubic of the multi-model fitter (`packages/trace/src/potrace/runfit.ts`).
- **logolabs, “inkvec” — curve fitting (Apache-2.0), and Raph Levien’s `kurbo`
  cubic fitter it builds on.** <https://github.com/logolabs/inkvec>
  (`crates/inkvec-fit/multimodel.rs`, `curves.rs`, `docs/algorithm/11-fitting.md`).
  The measured boundary is described by the fewest lines, circular arcs and
  cubics under a minimum-description-length objective (`cost = 0.5·χ² +
λ·params`, `λ = ln(extent/precision) ≈ 8.5`), fitting the curve to the points
  rather than to the polygon’s chords so it carries none of the Selinger chain’s
  circumscribe/inscribe bias. `packages/trace/src/potrace/runfit.ts` implements a
  browser-fast form of this: the optimal polygon (Selinger §2.2) supplies the
  segmentation and corners, and each smooth run is fitted and its polygon edges
  merged linearly — not inkvec’s O(n²) per-vertex dynamic program (`fit_dp`).
- **logolabs, “inkvec” — sub-pixel boundary refinement (stage 07, Apache-2.0).**
  <https://github.com/logolabs/inkvec> (`crates/inkvec-trace/src/planar.rs`
  `refine_subpixel`/`edge_offset`, `docs/algorithm/07-subpixel.md`). Each boundary
  point is moved onto the coverage = ½ level set by searching along the local
  boundary normal for the crossing: coverage is probed at the pixel centres along
  the normal, the two probes bracketing ½ locate the edge, and a clean step
  inverts through the _exact_ half-plane coverage of a unit square — which, unlike
  a bilinear root-find between pixel centres, carries no bias towards the ½ grid
  (a slanted edge is otherwise read ~0.15 px fat). `refineRingToField` in
  `packages/trace/src/refine.ts` implements this over the engine's signed coverage
  fields (`alphaCoverageField`, `pairwiseField`, `layerField`), feeding the
  polygon, vertex-adjustment and run-fitting stages the de-staircased points.
- **logolabs, “inkvec” — boundary solve (stage 08, Apache-2.0).**
  <https://github.com/logolabs/inkvec> (`crates/inkvec-trace/src/boundary_opt.rs`
  `optimise`, `docs/algorithm/08-boundary-solve.md`). Every boundary point is one
  unknown of a single optimization whose data term is the exact rendered coverage
  — each pixel clipped by the chain and closed along its border (a shoelace with
  an analytic Jacobian through the gridline crossings), `a·c_left + (1−a)·c_right`
  against the pixel — plus a kink term on second differences and an anchor to the
  refined positions, solved by Fletcher–Reeves conjugate gradient with a leashed
  line search and a self-crossing guard. `solveBoundary` in
  `packages/trace/src/solve.ts` implements this per chain over the engine's signed
  coverage fields (the two-face residual reduces to `(a − a_obs)²` on the field);
  verified on the coverage-exact disk but kept off the default trace path (the
  coverage-area null space wanders angular boundaries into a sawtooth) — see
  `packages/trace/ARCHITECTURE.md`.
- **M. Goldapp, “Approximation of circular arcs by cubic polynomials”, _Computer
  Aided Geometric Design_ 8(3), 1991.** The control-arm length `k = (4/3)·tan(θ/4)`
  for emitting a fitted circular arc as ≤90° circle-exact cubics
  (`packages/trace/src/potrace/runfit.ts`), which `@trazor/svg`’s `fitArcs` can
  later collapse to `A` commands.
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
  for `<circle>` primitive recognition (`packages/svg/src/fit.ts`), for
  collapsing circular-arc Bézier runs to `A` commands (`packages/svg/src/arc.ts`),
  and for the arc model of the multi-model run fitter
  (`packages/trace/src/potrace/runfit.ts`).
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
- **Gaurav Sharma, Wencheng Wu & Edul N. Dalal, “The CIEDE2000 color-difference
  formula: implementation notes, supplementary test data, and mathematical
  observations”, _Color Research & Application_ 30(1), 2005.** The CIEDE2000
  color difference and the sRGB→CIELAB (D65) conversion it runs on
  (`ciede2000`, `rgbToLab` in `packages/core/src/color.ts`), verified against
  the paper's published test pairs. Used as the perceptually even “same ink”
  floor (ΔE₀₀ 1.5) in autoK's near-duplicate merge
  (`packages/raster/src/quantize.ts`), where Oklab distance is too strict near
  black and too loose in saturated hues, and as the eval harness's ΔE₀₀ metric
  (`scripts/eval/inkvec-compare.ts`).
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
- **Richard Nock & Frank Nielsen, “Statistical Region Merging”, _IEEE Trans.
  PAMI_ 26(11), 2004.** Size-aware merge predicate: the color tolerance for
  merging two regions shrinks as their areas grow, so small regions fold freely
  while large regions merge only when near-identical. The `mergeSizeBias` option
  of the region-growing merge (`packages/raster/src/segment.ts`), which keeps
  close-but-distinct dominant colors apart instead of averaging them into one.
- **Joe H. Ward Jr., “Hierarchical Grouping to Optimize an Objective Function”,
  _Journal of the American Statistical Association_ 58(301), 1963.** Minimum-
  variance agglomeration: the pair whose union adds the least total squared
  error merges first. The hard `maxRegions` cap of the region-growing merge
  (`packages/raster/src/segment.ts`) folds regions by |A|·|B|/(|A|+|B|)·ΔE²
  until the color budget is met, so the budget's damage lands on the smallest,
  closest regions.
- **Frank Crow, “Summed-area tables for texture mapping”, _SIGGRAPH_ 1984.**
  Integral images backing the adaptive (local-mean) threshold
  (`packages/raster/src/threshold.ts`).
- **C. Tomasi & R. Manduchi, “Bilateral Filtering for Gray and Color Images”,
  _ICCV_ 1998.** Edge-preserving denoise option
  (`packages/raster/src/filters.ts`).
- **Z. Du, L. Zhang, et al., “Image Vectorization and Editing via Linear
  Gradient Layer Decomposition”, _ACM TOG (SIGGRAPH)_ 42(4), 2023.** Decomposing
  regions into linear-gradient layers. Posterized quantization bands that form
  one ramp are merged and fitted to a single `<linearGradient>` or
  `<radialGradient>` — closed-form moment fits screen the candidate unions (ramp
  direction = the dominant covariance-normalized least-squares color gradient in
  position space; radial center from an isotropic quadratic fit) before the
  pixel-level verification (`packages/raster/src/gradient.ts`).
- **J.-D. Favreau, F. Lafarge & A. Bousseau, “Photo2ClipArt: Image Abstraction
  and Vectorization Using Layered Linear Gradients”, _ACM TOG (SIGGRAPH Asia)_
  36(6), 2017.** Vectorizing a segmented image as stacked layers, each a color
  gradient with an opacity gradient, chosen by fidelity against simplicity. The
  acceptance rule (a ramp ships only when it explains the pixels better than the
  bands' own flat fills) and the layered fit of a constant-color overlay with a
  ramping opacity over a detected gradient (`packages/raster/src/gradient.ts`).
- **C. Richardt, J. Lopez-Moreno, A. Bousseau, M. Agrawala & G. Drettakis,
  “Vectorising Bitmaps into Semi-Transparent Gradient Layers”, _Computer
  Graphics Forum (EGSR)_ 33(4), 2014.** Decomposing a bitmap into
  semi-transparent linear/radial gradient layers by least squares on the
  compositing equation. The overlay color as the meeting point of the per-pixel
  base→pixel lines in sRGB, and the per-pixel opacity as the projection onto it
  (`packages/raster/src/gradient.ts`).

## Evaluation metrics (scripts/eval)

- **W. Xue, L. Zhang, X. Mou & A. C. Bovik, “Gradient Magnitude Similarity
  Deviation: A Highly Efficient Perceptual Image Quality Index”, _IEEE Trans.
  Image Processing_ 23(2), 2014.** <https://doi.org/10.1109/TIP.2013.2293423>
  The standard deviation of the pixel-wise gradient-magnitude similarity map
  between a render and its reference — cheap and well correlated with human
  opinion. Computed in `scripts/eval/gmsd.ts` (Prewitt gradients over a 2×
  box-downsampled luma plane, stabilizer T = 170) and read as the **default A/B
  verdict primary** by `scripts/eval/ab-report.ts`. Human-validated as the
  primary metric across two blind judged batches in the studio
  (`docs/studies/ab-gmsd.md`, `perceptual-metrics.md`): it tracks the eye on
  30 of 33 decisive pairs pooled, where mean Oklab ΔE and spurious hue track it
  at 82 % / 79 %. The implementation is a byte-for-byte port of the studio's
  `scripts/eval/metrics/gmsd.ts`, so the engine and the studio panel report one
  GMSD, not two.

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
- **P. W. Bridgman, _Dimensional Analysis_, Yale University Press, 1922 (the
  weighted product model; see also E. Triantaphyllou, _Multi-Criteria Decision
  Making Methods: A Comparative Study_, Kluwer, 2000, ch. 2).** The candidate
  score is the weighted geometric mean of the objective utilities, so no axis
  can compensate for a collapse on another (`packages/tune/src/score.ts`).

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
  int8) — trained with [`scripts/train`](../scripts/train/README.md); this
  repository ships none. The deploying app supplies them at deploy time and
  serves them same-origin (the Trazor studio uses its own trained weights).
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
- **logolabs, “inkvec” (software), Apache-2.0.** <https://github.com/logolabs/inkvec>
  — a Rust icon/logo vectorizer built around coverage rather than pixels: the
  coverage of an anti-aliased pixel is inverted from its color, alpha is
  coverage, edges are refined against exact half-plane coverage, and curves are
  fitted by a multi-model (line / arc / cubic / ellipse) dynamic program priced
  by description length. Used as the measured icon benchmark oracle
  (`scripts/eval/inkvec-compare.ts`; the comparison in
  [`INKVEC_COMPARISON.md`](INKVEC_COMPARISON.md)). Its coverage model informed
  the transparency coverage field (`alphaCoverageField`), the cutout and
  stacked-layer boundary fields (`pairwiseField`, `layerField`, `coverageOf` —
  the sRGB blend inversion, from `crates/inkvec-trace/src/coverage.rs`), the
  interior palette read (`interiorPaletteColors`), the CIEDE2000 “same ink”
  merge floor (`quantize.ts`, its `SAME_INK_DE00`), the mixture-label
  absorption pass (`packages/raster/src/mixture.ts`) — its ink-idea test
  (`crates/inkvec-trace/src/color.rs`): a label whose pixels are coverage
  blends of its two neighbors, and which fills little interior, is not an ink —
  and the treatment of an ink as color plus opacity: a flat translucent region
  (a shadow, glass, steam) is emitted as a face with a `fill-opacity`, its ink
  recovered by inverting the over-white composite the working image carries —
  `ink = (over − 255·(1 − a)) / a` — at the label's median alpha
  (`translucentFaces`, `packages/engine`). Its planar-face emission
  (`crates/inkvec-cli/src/emit.rs` `emit_color`, `rings.rs`) — each face painted
  once as its outer ring in containment order, same-color siblings merged into
  one even-odd path — informed the `nested` layering (`assembleFaces`,
  `emitNestedFaces`). No code was taken.
- **T. Porter & T. Duff, “Compositing Digital Images”, _Computer Graphics
  (SIGGRAPH)_ 18(3), 1984.** The `over` operator `out = src·a + dst·(1 − a)` that
  `flattenImage` applies to composite a transparent source onto white, and whose
  straight-alpha inverse recovers a translucent face's ink from that white
  composite (`translucentFaces`).
- **K. Zhao, L. Bao, Y. Li, X. Su, K. Zhang & X. Qiao, “Less is More: Efficient
  Image Vectorization with Adaptive Parameterization” (AdaVec), _CVPR_ 2025.**
  <https://github.com/IMU-Group/AdaVec> — SAM + superpixel layer decomposition,
  VTracer initialization, heuristic control-point simplification with a Chamfer
  refit, then 100 iterations of DiffVG refinement — the reference point for the
  bounded refinement pass of [`ML_ROADMAP.md`](ML_ROADMAP.md) item 6. Its
  repository carries no license, so only the published method is usable.
- **O. Hirschorn, A. Jevnisek & S. Avidan, “Optimize & Reduce: A Top-Down
  Approach for Image Vectorization”, _AAAI_ 2024.** The differentiable geometric
  loss (control-polygon self-intersection, orientation and angle penalties)
  AdaVec reuses; relevant only inside a refinement pass.
- **X. Liu, C. Zhou, N. Zhao & S. Huang, “Bézier Splatting for Fast and
  Differentiable Vector Graphics Rendering”, _NeurIPS_ 2025.**
  <https://arxiv.org/abs/2503.16424> — a splatting-based differentiable
  rasterizer reported 6×/18× (forward/backward) faster than DiffVG on closed
  shapes; the reference point for the cost of an in-app refinement pass.
- **T. Xia, B. Liao & Y. Yu, “Patch-based Image Vectorization with Automatic
  Curvilinear Feature Alignment”, _SIGGRAPH Asia_ 2009**, and
  **J. Kopf & D. Lischinski, “Depixelizing Pixel Art”, _SIGGRAPH_ 2011** —
  background for the pixel-art and gradient-handling roadmap items.
- **ML & dataset roadmap.** Prospective ML models (DeepSVG, StarVector,
  LIVE/DiffVG, cleanup/refinement networks) and how a training set would be
  produced are discussed in [`ML_STRATEGY.md`](ML_STRATEGY.md). Citations move
  into this file once the corresponding code ships — as the learned edge
  pre-pass now has (above).
