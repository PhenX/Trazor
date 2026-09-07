# AdaVec — what it could offer Trazor, and whether it can run in a browser

A study of [AdaVec](https://github.com/IMU-Group/AdaVec) (Zhao et al., "Less is More: Efficient Image Vectorization
with Adaptive Parameterization", CVPR 2025): how it works as published _and_ as implemented, a measured comparison with
Trazor on AdaVec's own test images, a verdict per component on what is worth borrowing, and an assessment of running each
piece in the browser (WebAssembly, WebGPU, SIMD). The measurements reproduce with `npm run eval:adavec`
([`../scripts/eval/README.md`](../scripts/eval/README.md)); the refinement experiment is described step by step in
[Reproducing](#reproducing).

## TL;DR

- **AdaVec is not a tracer; it is a refinement recipe on top of one.** It segments the image with SAM plus superpixels,
  traces each mask with **VTracer**, thins the control points with a heuristic, re-fits them, and then runs
  **100 iterations of DiffVG** (a differentiable rasterizer) on control points and colors. Nothing is learned; every
  image is optimized from scratch on a CUDA GPU, in 45–164 s.
- **On its own test images it beats Trazor per image.** Under AdaVec's own protocol it wins 12 of 15 Noto emoji (median
  PSNR 36.8 dB vs 33.9 dB), 4 of 5 Fluent emoji and 5 of 7 Iconfont illustrations on PSNR. Its dataset means understate
  that lead because of two catastrophic failures (a dropped gradient wash, a mis-colored layer) and a tinted
  background. Trazor traces the same images in 0.05–0.9 s on one CPU core.
- **Trazor's residual error is geometry, not color.** 100 DiffVG iterations on Trazor's own recommended trace of a Noto
  emoji take PSNR from 33.6 dB to 43.6 dB (above AdaVec's 37.8 dB on that image) and edge ΔE from 0.0154 to 0.0053.
  Moving only the control points delivers the gain; optimizing colors alone changes almost nothing. This is
  [`ML_ROADMAP.md`](ML_ROADMAP.md) item 6b, now with a measured ceiling.
- **The one component worth borrowing is that bounded refinement pass.** The SAM decomposition is a product feature
  (object-per-layer output), not a fidelity win; the control-point simplification is a cruder version of Trazor's
  existing curve optimization; the loss terms only matter inside the pass.
- **Can it run in a browser?** The pipeline as shipped cannot (SAM ViT-H at 2.5 GB, PyTorch, CUDA DiffVG, hard-coded
  paths, no license). The refinement pass can, with limits: DiffVG's CPU path costs **1.8 s per iteration at 512²** on
  four native cores (2.8 s on one) and **0.44 s at 256²**; a WASM port lands at 1.5–3× that. That is an explicit
  export-time "polish" step at a reduced working scale, not an interactive stage. WebGPU brings it under a second per
  image but is Tier-2 by construction (see [Determinism](#determinism-and-the-two-tier-contract)).
- **A side finding on the recommender, confirmed on the representative corpus.** The recommendation routes flat
  illustrations to region growing; forcing quantization instead is an `eval:ab` **PASS** (illustration ΔE −28 %,
  spurious hue −14 %, no family regressed) at the price of +87 % nodes on that family. Region growing forced
  everywhere is a **FAIL**. The trade-off is fidelity against file size, so it is a human call, documented in
  [the sweep](#follow-up-the-eval-ab-sweep-on-the-representative-corpus).

## What AdaVec is

### The pipeline as implemented (`main.py`)

The paper describes three stages; the code has six. Stage names below are the paper's, the mechanics are the code's.

| #   | Stage (paper)                                          | What the code does                                                                                                                                                                                                                                                                                                                              | Dependencies                           |
| --- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 1   | Multi-layer decomposition — semantic masks             | SAM **ViT-H** (`sam_vit_h_4b8939.pth`, 2.5 GB) automatic mask generation on CUDA; each mask is hole-filled, split into connected components, given its mean RGB color and sorted by area.                                                                                                                                                       | `segment_anything`, PyTorch + CUDA     |
| 1   | Multi-layer decomposition — superpixels                | SLIC (1000 superpixels, compactness 10), the mean RGB of each superpixel clustered with DBSCAN (`eps=10` in RGB, `min_samples=1`); each cluster becomes a mask, hole-filled and split into components as above.                                                                                                                                 | scikit-image, scikit-learn             |
| 1   | Multi-layer decomposition — merge                      | Superpixel masks whose IoU with a nearby SAM mask exceeds 0.85 are dropped (SAM wins on edge smoothness); all masks are painted largest-first and any mask left less than 10 % visible is dropped (the paper's impact factor α, threshold 0.1). **The largest mask is then overwritten with the full canvas** and becomes the background layer. | —                                      |
| 2   | Control point simplification — initial paths           | Each mask is written to a PNG and traced with **VTracer** (`stacked`, `spline`, `path_precision=3`); the SVG is parsed with `pydiffvg.svg_to_scene` and one path per mask is kept (the largest for the background; for the others the selection loop's comparison never fires, so the last path parsed is kept).                                | `vtracer` Python binding               |
| 2   | Control point simplification — merge adjacent segments | Two adjacent cubic segments are merged into one when the tangent turn at the shared node is under δ = 8° and the control polygon of the merged segment is convex on one side with all angles under 80° (`is_merge`). Separately, **any segment whose chord is ≤ 10 px is deleted** (not in the paper).                                          | —                                      |
| 2   | Control point simplification — Chamfer refit           | Per path, 200 Adam steps (lr 1, ÷1.1 every 50) move all control points to minimize the symmetric Chamfer distance between 10 samples per segment of the simplified path and of the original VTracer path. Pure geometry, no rasterizer.                                                                                                         | PyTorch                                |
| 3   | Differentiable rendering                               | 100 Adam steps (points lr 0.1, colors lr 0.01) on the whole scene rendered by DiffVG at 2×2 samples per pixel: MSE against the source **plus** an MSE weighted by a signed-distance field of the rendered silhouettes (`scikit-fmm`, not in the paper) **plus** 0.1× O&R's geometric loss (self-intersection, orientation and angle penalties). | DiffVG (C++/CUDA), PyTorch, scikit-fmm |
| —   | Output                                                 | Every fill is a **radial gradient** with two initially identical stops centered on the mask; the optimizer may separate them. Saved with `pydiffvg.save_svg`.                                                                                                                                                                                   | —                                      |

"Adaptive parameterization" therefore means: the number of paths is the number of surviving masks, and the number of
control points is whatever VTracer produced after the merge and the chord filter. No parameter is preset, but none is
chosen by a model either.

### Paper versus code

Worth knowing before citing the paper's numbers or method:

- The **SDF-weighted loss** and the **chord ≤ 10 px deletion** exist only in the code. The Xing loss is defined and
  unused; the area loss is disabled.
- The evaluation script reads `output_500.svg` — **500** iterations of stage 3 — while the paper says 100 and the
  reported time counts the stage-3 time **divided by five**. Quality numbers are therefore for 500 iterations, times for 100.
- Fills are radial gradients, so "flat" emoji come back with a two-stop gradient per shape; the paper only says
  "gradient fills".
- The repository ships 27 of the paper's 300 test images (15 Noto Emoji at 512², 5 Fluent Emoji 3D at 256², 7 Iconfont at
  512²), their own rendered outputs, and per-dataset logs. Those logs match Table 1 of the paper to the third decimal.
- **No license file.** DiffVG (vendored, Apache-2.0), VTracer (MIT) and the SAM weights (Apache-2.0) carry their own
  licenses; AdaVec's own code is all-rights-reserved by default. Only the published method may be reused, clean-room,
  exactly as this repository already treats Potrace.
- Paths are hard-coded (`/root/autodl-tmp/...`), the GPU is not named, Python is pinned to 3.8 and PyTorch to 2.0 +
  CUDA 11.8. It is a research script, not a library.

### What it is not

- Not a learned model: no training, no weights of its own, no dataset. Per-image optimization only.
- Not a photo vectorizer: its own failure section is "gradient-rich images", and it has no notion of a photo palette.
- Not a tracer: the curve geometry comes from VTracer; AdaVec thins it and then lets pixels pull it into place.

## Measured comparison on AdaVec's own test images

### Protocol

`scripts/eval/adavec-compare.ts` traces the 27 shipped ground-truth images through `@trazor/engine` at native
resolution with the studio's auto-recommended settings — the profile patch plus the recommendation patch over the
defaults, exactly what the studio applies on load: the illustration profile with 24 colors and `autoPaletteSize`,
routed to quantization on 13 of the 15 Noto emoji and to region growing on the other two, on all Fluent emoji and on
all Iconfont illustrations. It rasterizes each SVG with resvg over white and scores it exactly as AdaVec's
`metrics/score.py` does: **MSE on the grayscale image at 256 px** (both images resized), **PSNR on RGB**, **SSIM on
grayscale** (7×7 uniform window, sample covariance). The same script scores AdaVec's shipped renders with the same code,
and the numbers it gives them equal the paper's Table 1 (Noto MSE 0.00032 / PSNR 35.90 / SSIM 0.990) — so the two
columns are like for like. Trazor's own Oklab panel from `scripts/eval/lib.ts` (mean ΔE, ΔE in a band around source
edges, 95th percentile, spurious hue) is reported next to it. Timings: Node 22, one core of a 4-core container, engine
at commit `05d2bde`.

AdaVec's times are the paper's (an unnamed CUDA GPU, stage 3 counted at 100 iterations). Its segment counts are
derived from the repository logs (`param_num = 2·points + 12·paths`).

### Dataset means

| Set (n)               | Tool               | MSE ↓       | PSNR ↑   | SSIM ↑    | Paths / segments | Time         |
| --------------------- | ------------------ | ----------- | -------- | --------- | ---------------- | ------------ |
| Noto Emoji (15, 512²) | AdaVec             | 0.00032     | **35.9** | **0.990** | 39 / ≈ 258       | 44.9 s (GPU) |
|                       | Trazor recommended | **0.00025** | 34.1     | 0.985     | 30 / 680         | 0.30 s (CPU) |
| Fluent Emoji 3D (5)   | AdaVec             | **0.00047** | **33.3** | **0.972** | 27 / ≈ 115       | 50.5 s       |
|                       | Trazor recommended | 0.00081     | 30.4     | 0.960     | 7 / 113          | 0.10 s       |
| Iconfont (7, 512²)    | AdaVec             | **0.00103** | **28.1** | **0.923** | 216 / ≈ 1 002    | 164.2 s      |
|                       | Trazor recommended | 0.00115     | 27.1     | 0.909     | 94 / 4 741       | 0.50 s       |

"Paths" for Trazor is the number of `<path>` elements after same-fill merging; "segments" is the number of drawing
commands (`L`, `C`, `A`) in the document.

### Medians and win counts — the means hide the shape of the result

| Set          | Median PSNR AdaVec / Trazor | Median MSE AdaVec / Trazor | AdaVec wins (MSE / PSNR / SSIM) |
| ------------ | --------------------------- | -------------------------- | ------------------------------- |
| Noto Emoji   | **36.8** / 33.9             | **0.00007** / 0.00016      | 12 / 12 / 13 of 15              |
| Fluent Emoji | **33.2** / 29.9             | **0.00042** / 0.00084      | 4 / 4 / 5 of 5                  |
| Iconfont     | **28.6** / 27.3             | **0.00083** / 0.00098      | 5 / 5 / 5 of 7                  |

On a typical clean emoji AdaVec is **3 dB** better. Its Noto mean is dragged down by two images:
`emoji_u1f3bf` (a ski boot whose soft sky wash it drops entirely, MSE 0.00162) and `emoji_u1f6f9` (a skateboard whose
deck layer comes back lighter and slightly displaced, MSE 0.00201). Trazor scores 0.00133 on the first — its region
growing also flattens most of the wash — and 0.00009 on the second. Read the medians and the win counts, not the means.

### Trazor's Oklab panel — where each tool's error lives

| Set          | Tool   | mean ΔE    | edge ΔE    | p95       | spurious hue |
| ------------ | ------ | ---------- | ---------- | --------- | ------------ |
| Noto Emoji   | AdaVec | 0.0054     | **0.0133** | 0.014     | 0.0062       |
|              | Trazor | **0.0034** | 0.0143     | **0.010** | **0.0058**   |
| Fluent Emoji | AdaVec | **0.0091** | **0.0255** | **0.045** | **0.0123**   |
|              | Trazor | 0.0099     | 0.0359     | 0.052     | 0.0158       |
| Iconfont     | AdaVec | **0.0148** | **0.0323** | **0.059** | **0.0124**   |
|              | Trazor | 0.0174     | 0.0382     | 0.067     | 0.0154       |

Three things the panel shows:

- **AdaVec's boundaries sit closer to the true edge** (edge ΔE lower on every set): the differentiable pass pulls each
  control point onto the anti-aliased boundary. That is what RGB PSNR rewards.
- **AdaVec's background is tinted.** Its largest mask is replaced by the full canvas and colored with the mask's mean,
  so white comes back as RGB 254 on Noto and 252–253 on Iconfont. Over 40–70 % of the pixels this is invisible to
  PSNR (0.3 % error) but Oklab ΔE, which is perceptual, charges it on every pixel — hence AdaVec's higher **mean** ΔE
  on the clean Noto set and the sheep (`emoji_u1f411`) whose white wool comes back light gray.
- **Region growing over-merges soft shading.** On the Fluent 3D set the recommendation's region growing folds each
  emoji into 7 shapes and 113 segments on average, flattening the shading AdaVec keeps with per-shape radial gradients;
  the next table quantifies the cost.

### What the other Trazor routings do

Same images, same protocol; only the overridden settings change. "Forced" means the setting is applied to every image
regardless of what the recommender chose.

| Setting                                            | Noto MSE / PSNR                                           | Fluent MSE / PSNR      | Iconfont MSE / PSNR    | Note                                                       |
| -------------------------------------------------- | --------------------------------------------------------- | ---------------------- | ---------------------- | ---------------------------------------------------------- |
| recommended (see [Protocol](#protocol))            | 0.00025 / **34.1**                                        | 0.00081 / 30.4         | 0.00115 / 27.1         | baseline                                                   |
| forced quantization, 16 colors (engine default)    | 0.00024 / 33.3                                            | 0.00068 / 31.8         | 0.00091 / 27.2         | keeps the 3D shading as posterized bands                   |
| forced quantization, 32 colors + `autoPaletteSize` | **0.00023** / 33.3                                        | **0.00060** / **32.3** | **0.00081** / **27.7** | the best classical result on the two shaded sets           |
| forced region growing                              | 0.00026 / 34.1                                            | 0.00081 / 30.4         | 0.00115 / 27.1         | what the recommender already picks for Fluent and Iconfont |
| recommended + `gradients`                          | 0.00027 / 33.9                                            | 0.00077 / 30.6         | 0.00112 / 27.1         | no measurable gain on the 3D emoji; 2–6× slower            |
| recommended, `layering=cutout`                     | 0.00030 / 32.7                                            | 0.00100 / 29.7         | 0.00115 / 27.1         | the seam-free partition costs fidelity on soft shading     |
| recommended, `optTolerance` 0.6 / 1.2 / 2.4        | 537 / 464 / 420 segments → PSNR 32.9 / 30.8 / 28.2 (Noto) |                        |                        | fewer segments buy nothing without a refit                 |

Two readings. First, no classical knob reaches AdaVec's per-image accuracy: the best Noto PSNR is 34.1 dB against a
median of 36.8 dB for AdaVec. Second, the `optTolerance` sweep shows why AdaVec's segment economy is real: Trazor can
approach AdaVec's ≈ 258 segments per Noto emoji only by dropping to 28 dB, whereas AdaVec keeps 37 dB at that count
because it **re-fits the thinned curve to the pixels** afterwards. Simplify-then-refit is the recipe; simplification
alone is a loss.

### Follow-up: the `eval:ab` sweep on the representative corpus

The `scripts/eval/corpus-vtracer` set (four illustrations, one photo, one line drawing, traced at 1600 px), one
`tracer-compare` report per configuration, each judged against the auto-recommended baseline with `ab-report.ts`. The
line drawing is traced in bw and never moves; the baseline routes `Gum Tree Vector` and `vectorstock_31191940` to
region growing and the rest to quantization, at 24 colors with `autoPaletteSize` for illustrations and 32 for the photo.

| Configuration (forced on every image)  | Verdict  | Illustration ΔE / spurious / nodes | Photo ΔE / spurious / nodes | Overall ΔE / spurious / nodes |
| -------------------------------------- | -------- | ---------------------------------- | --------------------------- | ----------------------------- |
| baseline (auto recommendation)         | —        | 0.0159 / 0.0092 / 10 146           | 0.0283 / 0.0125 / 121 914   | 0.0244 / 0.0124 / 29 498      |
| `segmentation=quantize`                | **PASS** | −28 % / −14 % / **+87 %**          | unchanged                   | −12 % / −7 % / +20 %          |
| `segmentation=regions`                 | **FAIL** | +80 % / +73 % / −13 %              | **+286 %** / +168 % / −91 % | +90 % / +64 % / −65 %         |
| quantize, 24 colors, `autoPaletteSize` | MIXED    | −26 % / −9 % / +87 %               | +4 % / +7 % / −32 %         | −11 % / −4 % / −2 %           |
| quantize, 32 colors, `autoPaletteSize` | **PASS** | −30 % / −18 % / **+127 %**         | unchanged                   | −13 % / −9 % / +29 %          |
| quantize, 16 colors, fixed             | FAIL     | −19 % / +13 % / +61 %              | +17 % / +15 % / −51 %       | −5 % / +9 % / −21 %           |
| quantize, 24 colors, fixed             | MIXED    | −25 % / −10 % / +167 %             | +4 % / +7 % / −32 %         | −10 % / −4 % / +17 %          |
| quantize, 32 colors, fixed             | PASS     | −29 % / −20 % / +214 %             | unchanged                   | −13 % / −10 % / +49 %         |
| quantize, 48 colors, fixed             | PASS     | −31 % / −27 % / **+375 %**         | −8 % / −15 % / +66 %        | −15 % / −16 % / +131 %        |

What it settles:

- **Region growing loses on fidelity on this corpus too**, and on its own metric: on the two images the recommender
  sends there, forced quantization lowers spurious hue (`Gum Tree Vector` 0.0081 → 0.0049, `vectorstock` 0.0177 →
  0.0158) as well as ΔE (−61 % and −41 %). Forcing region growing on the rest is a large regression (the photo's ΔE
  nearly quadruples).
- **The cost is size, which the verdict engine does not gate on.** `vectorstock_31191940` goes from 19.5 k nodes and
  414 KB to 52.5 k nodes and 1.1 MB under quantization at 24 colors, and to 67.9 k nodes and 1.4 MB at 32; `Gum Tree
Vector` from 6.8 k to 9.0 k nodes. That is the bloat [`VTRACER_COMPARISON.md`](VTRACER_COMPARISON.md) chose to
  avoid, and the reason the recommender routes flat art to region growing. Every palette above 24 is the same
  trade-off, steeper.
- **Sixteen fixed colors is a FAIL** (spurious hue up on illustrations and on the photo), so the engine default is not
  a candidate; the recommender's floors already do better.
- **The decision is not made here.** Two illustrations carried the region-growing result on this corpus, and the
  emoji sets pointed the same way; the routing is worth revisiting with a size term in the objective (the `tune`
  package's weighted score is the natural place), not by flipping the default on fidelity alone.

### Visual notes

Beyond the numbers (montages are in the session's scratch output, not committed): AdaVec's edges carry a faint
high-frequency wobble from the pixel-loss optimization, and a light gray halo where its background layer meets the
subject on Iconfont; Trazor's stacked output shows hairline seams where two same-color layers abut (the stem and sepal
of `emoji_u1f940`) which the refinement pass closes; on the Fluent 3D set Trazor's quantization posterizes the shading
into visible bands and its region growing flattens it, where AdaVec's per-shape radial gradients stay smooth; Trazor's
cutout mode shows contour banding inside the shaded leaf.

## The refinement experiment: what a bounded DiffVG pass gives Trazor

The question the numbers above raise is whether AdaVec's per-image advantage comes from its decomposition or from its
final optimization. Running only the optimization on Trazor's own output answers it.

**Setup.** `emoji_u1f940` (a wilted rose, 512²) traced by Trazor with its recommended settings and `optimizeSvg=false`
(absolute `M`/`L`/`C` only, so `pydiffvg.svg_to_scene` reads it verbatim: 8 shapes, 708 control points). DiffVG built
CPU-only (`DIFFVG_CUDA=0`, current pybind11), 2×2 samples per pixel, Adam on points (lr 0.1) and flat colors (lr 0.01),
plain RGB MSE against the source over white, no geometric loss. Scored with the same harness protocol afterwards.

| Output                         | MSE (gray 256) | PSNR        | SSIM      | mean ΔE | edge ΔE    | spurious |
| ------------------------------ | -------------- | ----------- | --------- | ------- | ---------- | -------- |
| Trazor recommended             | 0.00019        | 33.6 dB     | 0.992     | 0.0021  | 0.0154     | 0.0050   |
| Trazor + 100 DiffVG iterations | **0.00002**    | **43.6 dB** | **0.999** | 0.0031  | **0.0053** | 0.0040   |
| AdaVec, same image             | 0.00005        | 37.8 dB     | 0.996     | 0.0033  | 0.0103     | 0.0043   |

- **+10 dB, edge ΔE ÷3.** The refined Trazor trace beats AdaVec's own result on this image. The mean ΔE rose because
  the optimizer drifted the white fill to RGB 254 — the same tint AdaVec shows — which a Trazor integration avoids by
  holding colors fixed.
- **Convergence is fast.** DiffVG's internal RGB MSE: 0.000469 at start, 0.000182 after 10 iterations, 0.000156 after
  20, 0.000140 after 30, 0.000129 after 100. Twenty to thirty iterations capture most of the gain.
- **Geometry, not color.** At 256² over 30 iterations: points only 0.000451 → 0.000315; colors only → 0.000432; both →
  0.000295. Trazor's palette is already right; its control points sit up to a pixel off the anti-aliased edge, and the
  classical sub-pixel refinement (`refine.ts`, applied in bw and cutout) does not close that gap — cutout scores
  32.7 dB on Noto.

**Cost, measured on the same machine** (DiffVG's CPU path, its own thread pool):

| Scene                                                       | Canvas | Threads | Forward | Forward + backward per iteration |
| ----------------------------------------------------------- | ------ | ------- | ------- | -------------------------------- |
| Rose, 8 paths / 708 points                                  | 512²   | 4       | 0.25 s  | **1.8 s** (179 s for 100)        |
|                                                             | 512²   | 1       | 0.77 s  | 2.8 s                            |
|                                                             | 256²   | 4       | 0.06 s  | **0.44 s** (45 s for 100)        |
|                                                             | 256²   | 1       | 0.21 s  | 0.70 s                           |
| Iconfont `46009_11` at 16 colors, 663 paths / 25 879 points | 256²   | 4       | 0.30 s  | 1.7 s                            |
|                                                             | 512²   | 4       | 1.0 s   | 6.6 s                            |

The backward pass costs 3–7× the forward pass, cost scales with pixels × samples and with the number of shapes each
sample has to test, and DiffVG rebuilds its acceleration structure every iteration. Ten iterations on the complex
illustration still cut its RGB MSE by a third (0.00215 → 0.00147 at 256²), so the gain is not emoji-specific.

## What Trazor can borrow — component by component

| AdaVec component                                     | Trazor today                                                                                  | Verdict                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bounded differentiable refinement** (stage 3)      | Nothing; item 6b of [`ML_ROADMAP.md`](ML_ROADMAP.md) as an idea                               | **Borrow.** The single component with a measured, large fidelity gain on Trazor's own output. Design below.                                                                                                                                                                             |
| **SAM automatic masks + superpixel merge** (stage 1) | SlimSAM click-to-segment (`MagicSegmenter`); k-means / region-growing palettes                | **Borrow the merge rule, for a product feature, not for fidelity.** Object-per-layer output is the README's "semantic layering" item; AdaVec's IoU-dedupe / largest-first / visibility-floor recipe is a good spec for it. Skip the canvas-sized background layer.                      |
| **Control-point merge + Chamfer refit** (stage 2)    | Selinger §2.4 curve optimization (`opticurve.ts`, `optTolerance`) with end tangents preserved | **Do not port the heuristic; test the idea.** Trazor's tolerance-bounded merge is the principled version. The idea worth one experiment is _refit after simplifying_ — free control points against the original ring — since the sweep shows simplification without a refit only loses. |
| **O&R geometric loss** (self-intersection, angles)   | The Potrace chain does not self-intersect by construction                                     | **Only inside the pass.** A regularizer that keeps a refined curve from folding; irrelevant elsewhere.                                                                                                                                                                                  |
| **SDF-weighted MSE**                                 | Chamfer distance transform exists (`thin.ts`)                                                 | **Optional inside the pass.** Weights the loss toward boundaries; Trazor could use its own edge band instead.                                                                                                                                                                           |
| **Per-shape radial gradient fills**                  | Ramp detection into `<linearGradient>`/`<radialGradient>` (`gradient.ts`)                     | **Different route to the same feature.** AdaVec fits gradients by optimization and wins on the 3D emoji; Trazor's detector did not fire on them. Gradient _parameters_ are a natural extra variable of the pass once it exists.                                                         |
| VTracer initialization, DBSCAN on RGB, SLIC          | Potrace-class chain; Oklab k-means++ and watershed region growing                             | **Nothing to borrow.** Trazor's front-end is stronger and already measured against VTracer ([`VTRACER_COMPARISON.md`](VTRACER_COMPARISON.md)).                                                                                                                                          |

### Design of the pass, as the numbers constrain it

- **Points only, colors fixed.** Colors carry no gain and drift whites; keeping them fixed also keeps the palette, the
  layering plan and the SVG structure byte-identical — only coordinates move.
- **Bounded.** 20–30 iterations; a per-point displacement cap of about one pixel of the working scale, so the pass can
  polish but not re-vectorize; abort if the loss rises.
- **Working scale ≤ 512 px, per-shape tiles.** The cost is pixels × shapes. Each shape only needs the pixels of its
  bounding box plus a margin, composited against the already-final neighbors, and a 4096-px image can be refined on a
  downscaled working copy with the deltas scaled back, exactly as gradient detection already does with
  `detectMaxDimension`.
- **Snap the result to the serializer's precision grid** and offer a WASM reproducible mode — the guardrail every
  geometry-touching ML stage already follows ([`ML_STRATEGY.md`](ML_STRATEGY.md#note-for-the-roadmaps-webgpu-refinement-pass)).
- **Cutout needs the shared-chain rule.** A shared boundary chain must be refined once and reused by both regions, as
  `refineChain` already does for arc fitting; per-region refinement would reopen the seams.
- **Measure with `eval:ab`** on the representative corpus, not on emoji: the gain shown here is on clean flat art, the
  regime the corpus is meant to check against.

## Can it run in a browser?

### The pipeline as shipped: no

SAM ViT-H is 2.5 GB of weights and needs a CUDA GPU; DiffVG is a C++/CUDA extension driven by PyTorch autograd;
VTracer is used through its Python binding; the script hard-codes paths and has no license. Nothing in it can be
loaded as is. Every piece has to be re-implemented, and the question is which pieces are worth it.

### Piece by piece

| Piece                                     | Browser route                                                                                                                                                  | Cost / feasibility                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SAM automatic mask generation             | SlimSAM (already shipped, 5.6 + 4.2 MB quantized) with a **grid of point prompts** in place of ViT-H; MobileSAM / EfficientSAM-Ti as stronger 10–40 MB options | One encoder pass (seconds on WebGPU, tens of seconds on WASM at 1024²), then the decoder on a 16×16–32×32 prompt grid batched through the `point_batch` dimension, plus non-maximum suppression in TypeScript. A few seconds on WebGPU. SlimSAM-77 is far weaker than ViT-H at "segment everything", so expect merged and missed objects. |
| SLIC + DBSCAN                             | TypeScript                                                                                                                                                     | Trivial; Trazor's watershed region growing already plays this role.                                                                                                                                                                                                                                                                       |
| Mask merge (IoU dedupe, visibility floor) | TypeScript                                                                                                                                                     | Trivial.                                                                                                                                                                                                                                                                                                                                  |
| VTracer per mask                          | Trazor's own tracer                                                                                                                                            | Already there and faster.                                                                                                                                                                                                                                                                                                                 |
| Control-point merge + Chamfer refit       | TypeScript (or an AssemblyScript kernel)                                                                                                                       | Cheap: the Chamfer refit is a few thousand point-to-sample distances per iteration, no rasterizer. Deterministic (`sqrt` only).                                                                                                                                                                                                           |
| **DiffVG refinement**                     | see below                                                                                                                                                      | The only hard part.                                                                                                                                                                                                                                                                                                                       |

### The differentiable rasterizer: WASM, SIMD or WebGPU

**WASM (CPU).** DiffVG's kernel is standalone C++ (about 7 700 lines with its headers; `scene.cpp`, `diffvg.cpp`,
`compute_distance.h`, `sample_boundary.h`) that reads raw float buffers, so Emscripten can compile it. What does not
carry over is PyTorch: the loss, its gradient (trivial for MSE) and the Adam update have to be written by hand, and
DiffVG's thread pool becomes WASM threads, which need cross-origin isolation (the `coi-serviceworker` shim the
performance plan already discusses). Extrapolating the measured native numbers by the usual 1.5–3× WASM factor:

| Working canvas | 4 WASM threads (cross-origin isolated) | Single thread | 30 iterations, single thread |
| -------------- | -------------------------------------- | ------------- | ---------------------------- |
| 256²           | 0.7–1.3 s / iteration                  | 1–2 s         | 30–60 s                      |
| 512²           | 3–5 s / iteration                      | 4–8 s         | 2–4 min                      |

Usable only as an explicit, progress-reported **polish before export** at 256–512 px, and only on simple scenes: the
663-path illustration is 4× slower again. A purpose-built rasterizer changes the picture: per-shape bounding-box tiles
instead of full-canvas passes, analytic coverage of a filled Bézier region instead of Monte-Carlo edge sampling, no
per-iteration acceleration-structure rebuild. Bézier Splatting (Liu et al., NeurIPS 2025) reports 6× forward and 18×
backward over DiffVG on closed shapes with a different representation; a tile-based analytic-coverage design should
land in the same range. That brings 30 iterations at 512² into the 10–30 s bracket on one WASM thread — still an
export-time step, but a tolerable one.

**SIMD.** WASM SIMD (128-bit) helps the per-sample distance tests (4 floats per lane) and the pixel-loss reduction;
DiffVG's code is branch-heavy and gains little as is. Budget 1.3–2× for a kernel rewritten around it, in line with the
performance plan's expectations for the other pixel kernels.

**WebGPU.** DiffVG is CUDA, and a WGSL port of its edge-sampling design (per-sample nearest-edge queries, a bounding
volume hierarchy, atomics for gradient scatter) is a large project. The realistic GPU design is the analytic one above
written as compute shaders: per shape, per tile, coverage and its derivatives with respect to the control points, then
a reduction. On any current GPU that is milliseconds per iteration at 512², so 100 iterations in well under a second.
Two costs. Availability: Chrome, Edge and Safari 26 ship WebGPU everywhere; Firefox ships it on Windows and on
Apple-silicon macOS 26 and expects Linux and Android during 2026, so a CPU path must stay. Determinism: GPU
floating-point is not bit-identical across devices, which the next section handles.

### Determinism and the two-tier contract

The pass writes geometry, so it is Tier-1-touching under [`ML_STRATEGY.md`](ML_STRATEGY.md)'s contract. The same
answer applies as for the learned signed field:

- With the pass **off** (the default), output is byte-identical to today's — nothing above changes the classical chain.
- With the pass **on WASM**, output is bit-reproducible across browsers: WASM arithmetic is IEEE-exact and the math
  library is part of the module, so the run is a function of the input alone. This is the reproducible mode.
- With the pass **on WebGPU**, refined coordinates are snapped to the serializer's precision grid; runs agree wherever
  the accumulated float noise stays under half a grid step, and differ by one grid step at the rare coordinate on a
  knife-edge. Same device and driver reproduce exactly.

An iteration cap, a displacement cap and a monotone-loss abort keep the WebGPU and WASM results close to each other,
but they are two implementations and will not be identical; the studio should present the WebGPU result as the fast
path and WASM as the reproducible one, as `createModelSession` already does for the ML backends.

### Where AdaVec's own numbers sit on this scale

AdaVec spends 45–164 s per image on a GPU: SAM ViT-H, 200 Chamfer iterations per path, 100 (evaluated: 500) DiffVG
iterations at full canvas with a signed-distance transform per iteration. Trazor traces the same images in 0.05–0.9 s,
and the experiment above shows that 20–30 refinement iterations on top of that trace exceed AdaVec's fidelity. The
browser budget is therefore not "run AdaVec faster"; it is "add one bounded pass to a pipeline that already does the
rest better".

## Recommendation

1. **Build the pass offline first** ([`ML_ROADMAP.md`](ML_ROADMAP.md) item 6a): a Node harness around a CPU DiffVG
   build, points-only, reporting `eval:ab` on the representative corpus. It costs nothing in the app and settles two open
   questions the emoji cannot answer: the gain on photos and degraded scans, and the right iteration and displacement
   caps.
2. **Then a tile-based analytic-coverage rasterizer in the engine** (pure TypeScript first, AssemblyScript kernel if
   profiling says so): the deterministic in-engine rasterizer that plan
   [`../plans/vectorization-quality.md`](../plans/vectorization-quality.md) workstream E was gated on, now with a measured
   reason to exist. Ship the pass as an opt-in export-time polish with a WASM reproducible mode.
3. **WebGPU as the fast path afterwards**, behind the same interface, under the precision-grid rule.
4. **Segment-everything as a separate product item**: SlimSAM grid prompts plus AdaVec's merge rule for object-per-layer
   output. Measure editability, not ΔE — it will not improve fidelity.
5. **Decide the region-growing routing with a size term.** The sweep above shows quantization wins on every fidelity
   metric where the recommender picks region growing, at two to three times the nodes; weigh the two in the `tune`
   objective and re-run `eval:ab` before changing the default.

## Reproducing

```sh
git clone --depth 1 https://github.com/IMU-Group/AdaVec.git /tmp/adavec
npm run eval:adavec -- --data /tmp/adavec/metrics/groundtruth --renders /tmp/adavec/metrics/results/ours --out out
npm run eval:adavec -- --data /tmp/adavec/metrics/groundtruth --set segmentation=regions   # any variant above
```

The refinement experiment is Python and is not committed. Steps: build DiffVG from AdaVec's vendored copy with
`DIFFVG_CUDA=0` after replacing its pybind11 with a current release (the vendored one predates Python 3.11); install a
CPU PyTorch; trace the image with `--set optimizeSvg=false --out out` so the SVG carries only absolute `M`/`L`/`C`
commands; load it with `pydiffvg.svg_to_scene`, scale the points to the target size, render with
`pydiffvg.RenderFunction` at 2×2 samples over white, and run Adam (points lr 0.1, colors lr 0.01) on the RGB MSE for
100 iterations; save with `pydiffvg.save_svg`, rasterize with resvg, and score the render with `--renders`. Pin the
process to one core with `taskset -c 0` for the single-thread timings.
