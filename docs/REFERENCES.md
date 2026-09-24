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
  polylines (centerline strokes) in `packages/trace/src/fit.ts`, for the
  per-run cubic of the multi-model fitter and for the arm lengths of the
  illustration-mode G1 spline pieces, there σ-weighted and held to inkvec's
  admissible arms (`packages/trace/src/potrace/runfit.ts` `fitG1Cubic`).
- **Michael Plass and Maureen Stone, “Curve-Fitting with Piecewise Parametric
  Cubics”, _Computer Graphics_ 17(3) (SIGGRAPH ’83), 1983.** Least-squares
  fitting of piecewise parametric cubics with tangent continuity at the knots.
  The illustration-mode G1 refit of `packages/trace/src/potrace/runfit.ts`
  (`g1Refit`) takes the run fitter's breakpoints as knots and solves one shared
  direction per knot by linear least squares over the span's samples,
  alternated with the pieces' arm lengths and a Newton reparameterization.
- **William H. Press, Saul A. Teukolsky, William T. Vetterling and Brian P.
  Flannery, _Numerical Recipes_, 3rd ed., Cambridge University Press, 2007,
  §2.4 (tridiagonal systems) and §2.7 (cyclic tridiagonal systems via the
  Sherman–Morrison formula).** The G1 refit's knot-tangent system is symmetric
  tridiagonal along a span and cyclic around a smooth loop
  (`solveTridiag`/`solveCyclic` in `runfit.ts`).
- **logolabs, “inkvec” — curve fitting (stage 11, Apache-2.0), and Raph Levien’s
  `kurbo` cubic fitter it builds on.** <https://github.com/logolabs/inkvec>
  (`crates/inkvec-fit/{lib,multimodel,curves,merge,primitives}.rs`,
  `docs/algorithm/11-fitting.md`). The measured boundary is described by the
  fewest lines, circular arcs and cubics under a minimum-description-length
  objective (`cost = 0.5·χ² + λ·params`, χ² the squared point-to-curve residuals
  weighted by per-point `1/σ²`, `λ = ln(extent/precision) ≈ 8.5` at 512 px, a
  span admissible only within `τ·σ`, `τ = 2`), a dynamic program picking the
  segmentation and the per-span model jointly, then a `merge_free_cubics` pass —
  fitting the curve to the points rather than to the polygon’s chords so it
  carries none of the Selinger chain’s circumscribe/inscribe bias.
  `packages/trace/src/potrace/runfit.ts` implements a browser-fast form: a
  bounded DP over a candidate set (the optimal-polygon vertices of Selinger §2.2
  as breakpoints, the discrete-curvature sign changes and a coarse stride inside
  a long edge) rather than inkvec’s DP over every point, with the corner prior
  from `smoothing`/`cornerThreshold`, an endpoint-pinned circle fit (so the arc
  scored is the arc drawn) and a monotone-sweep gate on the arc. At low smoothing
  (geometric mode) it follows inkvec's structural model too: a corner is a vertex
  of the unadjusted polygon turning at least `CORNER_DEGREES` (45°); the samples
  within the anti-aliasing chamfer of a corner (`CORNER_CHAMFER`, reaching
  `1/sin(½·interior)` along sharper corners) carry no weight, and the corner is
  placed where its two fitted edges meet within that allowance
  (`adjust_vertices_at`), a chamfer stub of at most 2.5 px between two corners
  collapsing into one (`sharpen_corners`, `SHARPEN_MAX_CHORD`); lines and arcs
  are refitted freely — a σ-weighted total-least-squares line (the smaller
  eigenvalue of the weighted scatter, inkvec's `chi2_line`) and a geometric circle
  — and joined where the models meet; and a whole loop is one circle when its
  reduced χ² stays within τ² and its description costs no more than the DP's
  (the whole-primitive rule of `primitives.rs`), so a few outlying samples do not
  veto it the way a per-sample band would. At higher smoothing (illustration
  mode) a measured ring is offered an ellipse as well, and a ring the corner rule
  cut up is offered both against its corner spans' cost — inkvec's
  `fit_primitive_or_arcs`, which offers every closed boundary a circle, an
  ellipse and a rounded rectangle whatever its corners. Such a primitive must
  also render the ring's observed coverage no worse than the fitted outline —
  the rendered-coverage comparison of inkvec's boundary solve (stage 08, below),
  used here as a judge between two candidates rather than as a fit
  (`packages/trace/src/coverage.ts` `pathCoverageError`). The joins inkvec's DP charges a tangent break for, and snaps to one
  tangent after it where it left them smooth (`multimodel.rs` `refine`,
  `tangents.rs` `break_cost`), are all made G1 by the refit after Plass & Stone
  (below), its pieces' arms held to the 0.02–1 chord inkvec admits a G1 cubic's
  arms in (`candidates.rs`, `MAX_ARM`; `multimodel.rs` `polish_arms` refines
  arms inside such a box).
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
- **Walter Gander, Gene H. Golub & Rolf Strebel, “Least-squares fitting of
  circles and ellipses”, _BIT Numerical Mathematics_ 34(4), 1994.** Geometric
  (orthogonal-distance) circle fitting by Gauss–Newton from an algebraic start;
  the free circle model of the geometric-mode refit
  (`packages/trace/src/potrace/runfit.ts` `fitCircleFree`), started from Kåsa's
  fit, whose algebraic residual is biased on a short, strongly curved arc.
- **Andrew Fitzgibbon, Maurizio Pilu & Robert Fisher, “Direct least square
  fitting of ellipses”, _IEEE Trans. PAMI_ 21(5), 1999.** Direct conic ellipse
  fit (smallest-eigenvector of the design scatter). Used, with the points
  normalized for conditioning, to recover `<ellipse>` center/radii/angle
  (`packages/svg/src/fit.ts`).
- **Paul D. Sampson, “Fitting conic sections to ‘very scattered’ data: An
  iterative refinement of the Bookstein algorithm”, _Computer Graphics and Image
  Processing_ 18(1), 1982.** The first-order geometric distance from a point to
  a conic, `|F|/|∇F|` of its implicit form. `fitArcs` accepts an arc only where
  every sample, about a pixel apart along the run, lies within tolerance by
  this distance (`packages/svg/src/arc.ts` `conicDistance`): the radial distance
  in the unit-circle frame shrinks by `ry/rx` near the sharp ends of a thin
  ellipse, where half of one two pixels thick passed for a gently bowed run.
  The whole-ring ellipse of the run fitter is refined by Levenberg–Marquardt on
  the same distance (`packages/trace/src/potrace/runfit.ts` `fitEllipseFree`).
- **David Eberly, “Distance from a Point to an Ellipse, an Ellipsoid, or a
  Hyperellipsoid”, Geometric Tools, 2011.** The nearest point on an ellipse by
  a robust bisection on the root of its one-variable characteristic function.
  The exact orthogonal distance a whole-ring ellipse is judged by
  (`packages/trace/src/potrace/runfit.ts` `ellipseDistance`).
- **W3C, “Scalable Vector Graphics (SVG) 1.1”, Appendix F.6 — “The elliptical arc
  implementation notes”.** Endpoint↔center parameterization of the `A` command
  (out-of-range radii correction, center and swept-angle formulas). Implements
  arc bounds and arc→Bézier reconstruction (`packages/core/src/path.ts`
  `arcToCenter`, `packages/svg/src/arc.ts` `arcToCubics`). Near half a turn the
  endpoint form reconstructs the centre ill-conditioned from the radius: rounding
  the radius to the output grid by ε moves the centre by about √(2rε), so
  `fitArcs` tries the grid radii around the fitted one and keeps the one whose
  reconstructed centre lands nearest the fitted centre.

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
- **ITU-R Recommendation BT.709, “Parameter values for the HDTV standards for
  production and international programme exchange”.** The luma weights
  (0.2126, 0.7152, 0.0722) of `toEncodedLuma` (`packages/raster/src/convert.ts`),
  applied to the gamma-encoded channels a rasterizer blends an anti-aliased edge
  in, so the bw threshold field is linear in an edge pixel's coverage.
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
- **Azriel Rosenfeld, “Digital Straight Line Segments”, _IEEE Transactions on
  Computers_ C-23(12), 1974.** The digitization of a straight line is an
  8-connected arc: at a slope under 45° it steps to the next row across a
  corner. The region-growing segmentation's last rescue pass
  (`packages/raster/src/segment.ts`, `RESCUE_PASSES`) grows its blobs across
  corners for that reason — an anti-aliased hairline's darkest pixels are such a
  digitization, and grown across sides only they break into specks.
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
