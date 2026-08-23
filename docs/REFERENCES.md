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
- **Frank Crow, “Summed-area tables for texture mapping”, _SIGGRAPH_ 1984.**
  Integral images backing the adaptive (local-mean) threshold
  (`packages/raster/src/threshold.ts`).
- **C. Tomasi & R. Manduchi, “Bilateral Filtering for Gray and Color Images”,
  _ICCV_ 1998.** Edge-preserving denoise option
  (`packages/raster/src/filters.ts`).

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
  Release](https://github.com/PhenX/Vectorizer/releases/tag/models) at deploy
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
- **Vision Cortex, “VTracer”, MIT/Apache-2.0.**
  <https://www.visioncortex.org/vtracer-docs> — the O(n) color-tracing
  framework (clustering → hierarchical layering → spline fit). Informed the
  stacked/cutout layering vocabulary; superseded here by the shared
  boundary-graph approach for seam-free cutouts.
- **T. Xia, B. Liao & Y. Yu, “Patch-based Image Vectorization with Automatic
  Curvilinear Feature Alignment”, _SIGGRAPH Asia_ 2009**, and
  **J. Kopf & D. Lischinski, “Depixelizing Pixel Art”, _SIGGRAPH_ 2011** —
  background for the pixel-art and gradient-handling roadmap items.
- **ML & dataset roadmap.** Prospective ML models (DeepSVG, StarVector,
  LIVE/DiffVG, cleanup/refinement networks) and how a training set would be
  produced are discussed in [`ML_STRATEGY.md`](ML_STRATEGY.md). Citations move
  into this file once the corresponding code ships — as the learned edge
  pre-pass now has (above).
