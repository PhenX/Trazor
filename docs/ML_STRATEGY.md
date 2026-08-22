# ML & dataset strategy

How (and how much) to use machine learning to push output quality toward the best commercial vectorizers, and — the
question that motivated this doc — **what a training dataset should look like, how big it should be, and how to produce
it**. This is a strategy/roadmap document, not a contract; nothing here is shipped yet. Shipped algorithms and models are
tracked in [`REFERENCES.md`](REFERENCES.md); the pipeline it plugs into is in [`../ARCHITECTURE.md`](../ARCHITECTURE.md).

## TL;DR

- **Don't replace the tracer with a neural net.** The clean-room Potrace-class chain in `@vectorizer/trace` _is_ the
  hard, valuable part — the same classical core the leading commercial tools spent years on. Keep it.
- **Don't emulate DeepSVG.** It is a generative model over _simple icons_ (its training set had to be filtered to icons
  with ≤ 8 paths); training your own gets you an icon generator, not a faithful raster→vector engine.
- **Use ML surgically**, as optional _input-conditioning_ stages ahead of the deterministic core — exactly where
  `@vectorizer/ml` already sits (background removal, magic-select) — and let the trace stay byte-identical.
- **You almost certainly don't need millions of examples.** For the small on-device models that fit this project,
  **50k–200k synthetic pairs** is plenty; a working prototype needs **5k–20k**.
- **Produce data by rasterizing SVGs** (your instinct is right) — but the make-or-break step is **degrading the raster
  inputs** so the model survives real photos, scans and JPEGs. Clean renders alone will not generalize.
- **Determinism is nuanced, not absolute** — see [the two-tier contract](#determinism-and-webgpu-a-two-tier-contract).
  WebGPU is allowed; byte-identical output is preserved where it actually matters.

## What "as powerful as the commercial tools" actually means

The leading hosted vectorizers are **hybrids**: deep-learning networks _and_ classical algorithms, plus a proprietary
computational-geometry framework and heavy **shape fitting** (parameterized circles, ellipses, rounded rectangles, stars,
arcs). The deep learning is applied to specific perceptual sub-problems; it is not one end-to-end "image in, SVG out"
network. Their moat is 15 years of the _classical_ framework as much as the ML.

Read against our codebase, that is encouraging: we already own a strong classical core. The visible gap is not "we lack a
neural net" — it is a handful of concrete capabilities (clean shape/primitive fitting, gradient handling, robust behavior
on noisy/compressed inputs, semantic layer separation), several of which are already on the README roadmap. ML helps with
_some_ of them; classical work covers the rest.

## Three ML families, and which one fits this project

| Family                                            | Representative                                  | Data needed    | Runs on-device (WASM/WebGPU)?          | Verdict here                                                  |
| ------------------------------------------------- | ----------------------------------------------- | -------------- | -------------------------------------- | ------------------------------------------------------------- |
| End-to-end **SVG-code generation**                | StarVector (1.4 B params, trained on ~2 M SVGs) | Huge           | No — far too large                     | ✗ Also hallucinates geometry; wrong tool for faithful tracing |
| **Optimization** with a differentiable rasterizer | LIVE / DiffVG                                   | **None**       | No — minutes to hours per image        | ✗ For live use. ✓ **Offline** as a data/oracle tool (below)   |
| **Surgical** small models on sub-problems         | U²-Netp, SlimSAM (already shipped)              | Small–moderate | **Yes** — this is the proven path here | ✓ **Our lane**                                                |

Sources for all three are in [References](#references).

### Why not DeepSVG / end-to-end

DeepSVG is a hierarchical VAE over vector _commands_, trained on the SVG-Icons8 set (100k icons). For any vectorization-
flavored use it has to be filtered hard — the common filter keeps only icons with **≤ 8 paths** and **≤ 32 commands per
path**, leaving ~26k. That tells you its regime: small, clean, few-path icons. It cannot represent a photo, a detailed
logo, or a multi-hundred-path illustration, and it emits _plausible_ shapes rather than _faithful_ ones. An end-to-end
generator (DeepSVG, StarVector, an LLM emitting `<path>` code) optimizes for "looks like an SVG of roughly this," which is
the opposite of what a tracer is for. Our tracer already beats them on fidelity for anything past icon complexity.

## Where ML earns its place

Keep ML as optional, fail-soft, _input-conditioning_ stages that hand the deterministic core a cleaner or richer input.
Highest value first, each mapped to the pipeline stage it augments and the roadmap item it advances:

1. **Learned edge / boundary map** — a small edge CNN (PiDiNet / DexiNed / HED class) produces clean boundaries on noisy,
   anti-aliased or JPEG-crushed input, feeding `preprocess`→crack decomposition better cracks than a raw threshold. This
   is the single biggest robustness win on _bad_ inputs.
2. **Cleanup / super-resolution pre-pass** — a small U-Net that de-JPEGs, de-noises and up-samples low-res input before
   quantization. Much of the commercial tools' apparent "magic" on poor uploads is exactly this.
3. **Primitive / shape detection** — classify a region as circle / ellipse / rounded-rect / star and recover its
   parameters, so the serializer can emit a true `<circle>`/`<ellipse>`/arc instead of a many-node path. Directly
   advances the roadmap's "SVG elliptical-arc (`A`) fitting" and matches the commercial shape-fitting advantage.
4. **Layer / occlusion ordering** — infer which region sits on top, for clean editable `stacked` output. Advances
   "Semantic layering with SAM masks (object-per-layer SVG)".
5. **Better segmentation / quantization priors** — extend the existing SlimSAM magic-select toward automatic
   object-per-layer proposals.

Stages 1–3 are the recommended starting points: they are image→image or image→small-vector, cheap to supervise with
synthetic data, and slot in cleanly ahead of the deterministic core.

## Determinism and WebGPU: a two-tier contract

The README and `AGENTS.md` state determinism as an absolute: _same image + same settings ⇒ byte-identical SVG_. That is
the right promise for the classical core, but taken literally it forbids the roadmap's own "Differentiable refinement pass
(WebGPU)" and any WebGPU ML — because **WebGPU floating-point math is not bit-identical across GPUs, drivers and
backends** (reduction order, fast-math, precision differ). Resolve the tension by scoping the guarantee instead of
dropping it.

First, be clear about **what determinism is _for_ here**, because it decides the scope:

- **Reproducible tests** — Vitest runs in Node over pure functions; the suite exercises the classical core and never
  touches the GPU or ML. It is unaffected by anything below.
- **Reproducible exports, caching, user trust** — "I re-run and get the same file."
- **Regression debugging** — a diff in output must mean a diff in code, not in hardware.

### The contract

**Tier 1 — the classical core** (`raster` preprocessing math → `trace` → `svg`): **byte-identical on every device,
always.** No GPU floats, no ML, no wall-clock, fixed-seed PRNG. This is what the test suite and the byte-identical promise
rest on. **Unchanged.**

**Tier 2 — ML conditioning stages** (background removal, segmentation, and future edge / cleanup / refinement models):
**may use WebGPU.** Their job is to produce an intermediate that Tier 1 then consumes.

The lever that makes this safe is the **discretization boundary**. Tier 1's inputs are already _discrete_ —
`BinaryMask`, `LabelMap`, thresholded `GrayImage`. If a Tier-2 model emits a continuous probability/feature map and Tier 1
**discretizes it (threshold / argmax / quantize) before tracing**, then cross-GPU float noise is absorbed: `0.732` vs
`0.731` collapse to the same mask bit. The result is byte-identical across machines _except_ at the rare pixel whose value
sits exactly on the discretization knife-edge. WebGPU thus never perturbs geometry directly; at worst it flips an
occasional boundary pixel.

For the cases that need a **hard** cross-machine guarantee (CI golden files, a "reproducible export" toggle):

- **Pin ML to the WASM backend.** ONNX Runtime Web's WASM execution is bit-reproducible and portable; WebGPU stays the
  default fast path for interactive use. This is a per-run backend choice, not a code change.
- **Cache the discretized intermediate** (the mask / labels) with the result, so re-runs and shared links reuse the exact
  input to Tier 1 rather than re-inferring.

### Restated determinism guarantee

- **Pure classical pipeline (no ML stage engaged):** byte-identical on all devices. Non-negotiable; what the tests
  guarantee.
- **With an ML conditioning stage engaged:** deterministic run-to-run on the same device + backend (the interactive
  guarantee), and byte-identical across devices when that stage runs on the **WASM backend** (reproducible mode).

### Note for the roadmap's WebGPU refinement pass

This pass is essentially a **bounded DiffVG / LIVE-style differentiable refinement** — LIVE's own machinery (a
differentiable rasterizer driving gradient descent on path parameters), but scoped to _polish_ the classical tracer's
existing paths against the source rather than vectorize from scratch. That scoping is what makes it shippable: from-
scratch LIVE is minutes-to-hours and stays offline (see the data-factory note above), whereas a few refinement iterations
on already-good paths is bounded. A pass that nudges Bézier control points by GPU-computed gradients is **Tier-1-touching**
— it writes geometry — so it would break byte-identical output unless constrained. Two ways to keep the promise:

- **Snap refined coordinates to the serializer's output-precision grid.** The `svg` serializer already quantizes
  coordinates to a configurable precision; if the refinement delta is smaller than that step, it vanishes identically on
  every device. This reuses an existing feature and is the cleanest option.
- **Run the refinement in WASM** for reproducible mode, WebGPU otherwise — same split as above.

## Dataset strategy

### How big?

There is no single number — it depends entirely on which model above you build. Grounded ranges:

| What you're training                                                  | Realistic size                     | Notes                                                |
| --------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| Prototype, to prove a sub-model _learns_                              | **5k–20k pairs**                   | Enough to see signal and de-risk the approach        |
| Production small ONNX conditioning model (edge / cleanup / primitive) | **50k–200k pairs**                 | Heavy augmentation multiplies effective size         |
| From-scratch icon generator (DeepSVG-style)                           | **~100k SVGs** collected, filtered | Only yields a simple-icon generator; not recommended |
| Foundation model (StarVector-style)                                   | **500k–2M+**                       | Not on-device viable; out of scope                   |

The honest headline: for the surgical path **you do not need millions**. Diversity and _input realism_ dominate raw count
— 50k well-degraded, diverse pairs beat 1M pristine ones that look nothing like real uploads.

### How to produce it

Your instinct — SVG + a rasterizer — is exactly the standard technique: rendering an SVG yields a _perfectly aligned_
`(raster input, vector ground-truth)` pair, essentially for free and in unlimited quantity. The pipeline:

1. **Collect an SVG corpus** — see [sources](#where-to-get-svgs).
2. **Canonicalize** — flatten transforms, resolve `<use>`, expand shorthand, normalize the `viewBox`, drop unsupported
   features. Raw SVGs are wildly inconsistent (this is why DeepSVG filtered so aggressively). Reuse our own
   `@vectorizer/svg` path model as the canonical target representation so training targets match what the engine emits.
3. **Rasterize deterministically** — [resvg](https://github.com/linebender/resvg) (Rust, fast, accurate) is the standard
   choice; render at 2×–4× and area-downsample for clean anti-aliasing, at several output resolutions.
4. **⚠ Degrade the _inputs_ — the make-or-break step** (details below). Ground truth stays the clean vector; only the
   raster input is corrupted.
5. **Emit the pairing** the task needs — full SVG, an edge map, a `LabelMap`, or a primitive list — as the target
   alongside the degraded raster.
6. **Split by _source family_, not by file** — never let the same font, icon set or clip-art pack straddle train/test, or
   the metrics will lie.

Keep the whole generator **seeded and versioned** (rasterizer version pinned, degradation RNG seeded), in the same spirit
as the engine's determinism, so the dataset is regenerable rather than a frozen blob.

### The degradation pipeline (why clean renders fail)

Train only on pristine renders and the model collapses on real uploads. Apply a high-order degradation model
(Real-ESRGAN / BSRGAN style) to the **input** side, in randomized order and strength:

- **Blur** — isotropic/anisotropic Gaussian; sinc filters for ringing.
- **Resampling** — down- then up-sample with a random filter (area / bilinear / bicubic).
- **Noise** — Gaussian and Poisson, color and luminance.
- **JPEG** — random quality (q ≈ 30–95), optionally applied twice.

Then add corruptions specific to _real vectorizer inputs_, which generic super-resolution sets omit:

- **Background compositing** — place the shape on photographic, textured or gradient backgrounds (real inputs are rarely
  on clean white). Critical.
- **Alpha / matting errors** — edge halos, fringing, imperfect cutouts.
- **Palette reduction & dithering** — GIF-style quantization, ordered/Floyd–Steinberg dither.
- **Geometric** — small rotations, affine/perspective warp, mild lens distortion (scans, photos of screens).
- **Tone** — gamma / color-profile shifts, contrast changes.
- **Line-art specific** — paper grain, pencil texture, scanner speckle for ink/centerline modes.

### Where to get SVGs

- **Fonts — the single best free source.** Every glyph is a clean, license-friendly vector shape; a handful of families
  yields millions of diverse contours (including holes and thin strokes — great for centerline).
- **Icon sets** — Material Symbols, Bootstrap Icons, Feather, Tabler, Iconoir, game-icons.net; Twemoji / Noto Emoji /
  OpenMoji for multicolor. Mind each license.
- **Large corpora** — SVG-Icons8 (~100k) if obtainable; SVG-Stack / TheStack (~2M, permissive) for scale; Wikimedia
  Commons SVGs for genuinely hard, complex cases; FIGR-8 for icons.
- **Procedural generation** — synthesize random compositions of primitives (circles, rects, stars, Béziers) with random
  fills, gradients and strokes. Best for the **shape-detector** and **layer-ordering** tasks, because _you_ own the exact
  ground-truth parameters and z-order. Also lets you dial difficulty directly.

> **Licensing matters more than usual here:** trained weights would ship in-browser, i.e. publicly. Prefer fonts and
> permissively-licensed sets for anything whose weights you distribute; treat restrictively-licensed art as eval-only.

### Two data sources unique to this project

- **Your own tracer is a supervision signal.** Trace clean renders with the existing pipeline; those outputs are
  near-perfect targets for teaching a model to _reproduce tracer quality from a degraded input_ — the cheapest, most
  aligned supervision available, and it needs no external ground truth.
- **DiffVG / LIVE as an offline data factory and oracle.** They need no dataset and are far too slow to ship (minutes to
  hours per image), but offline they can generate high-quality vector targets for arbitrary rasters, or score/refine
  candidate targets. Use them to _manufacture_ training data, never at request time.

## A concrete first milestone

Pick **one** sub-problem, prove the whole loop small, then scale the data. **A runnable scaffold already exists** — the
seeded dataset generator in [`../scripts/dataset`](../scripts/dataset/README.md) and the model spec in
[`EDGE_PREPASS.md`](EDGE_PREPASS.md):

1. Choose **Learned edge pre-pass** (stage 1) or **Cleanup pre-pass** (stage 2) — both are image→image, the easiest to
   supervise and the clearest win on bad inputs. (Primitive detection, stage 3, is the highest _visible_ quality gain but
   a bigger build; do it second.)
2. Build **~20k synthetic pairs** with the generator (`npm run dataset`): SVG source → resvg render → degradation
   pipeline → aligned `(input, edge/clean)` pairs, split by source family. It ships with a procedural source (no corpus
   needed) and a `--source dir` mode for real SVGs.
3. Train the small model per [`EDGE_PREPASS.md`](EDGE_PREPASS.md), export to **ONNX**, and wire it as an optional Tier-2
   conditioning stage in `@vectorizer/ml` (an `EdgeEnhancer` mirroring `BackgroundRemover`), discretizing its output
   before the tracer (per the [two-tier contract](#determinism-and-webgpu-a-two-tier-contract)).
4. Measure against the existing **Oklab ΔE fidelity score** the app already computes — held out by source family — and
   only then scale to 50k–200k.

Keep every stage optional and fail-soft: the app must remain fully functional, and the classical path byte-identical, with
no model loaded.

## References

Not-yet-shipped work that informs this strategy. When any of it becomes shipped code, move its citation into
[`REFERENCES.md`](REFERENCES.md).

- **Carlier et al., "DeepSVG: A Hierarchical Generative Network for Vector Graphics Animation", NeurIPS 2020.**
  <https://arxiv.org/abs/2007.11301> — generative model over SVG commands; SVG-Icons8 (100k icons). Illustrates the
  few-path-icon regime and the aggressive filtering such models require.
- **Rodriguez et al., "StarVector: Generating Scalable Vector Graphics Code from Images and Text", CVPR 2025.**
  <https://arxiv.org/abs/2312.11556> — 1.4 B-param multimodal model; SVG-Stack (~2M SVGs). The end-to-end code-generation
  approach and why its scale/behavior is out of scope on-device.
- **Ma et al., "Towards Layer-wise Image Vectorization (LIVE)", CVPR 2022.** <https://ma-xu.github.io/LIVE/> — training-
  free, topology-preserving optimization; the offline data/oracle option.
- **Li et al., "Differentiable Vector Graphics Rasterization for Editing and Learning (DiffVG)", SIGGRAPH Asia 2020.**
  <https://github.com/BachiLi/diffvg> — the differentiable rasterizer LIVE and any refinement pass build on.
- **Wang et al., "Real-ESRGAN", ICCVW 2021**, and **Zhang et al., "BSRGAN", ICCV 2021.** The high-order degradation
  models behind the input-degradation pipeline.
- **Su et al., "PiDiNet", ICCV 2021** / **Poma et al., "DexiNed", WACV 2020** / **Xie & Tu, "HED", ICCV 2015.** Compact
  edge-detection networks suitable for the learned edge pre-pass.
- **"Image Vectorization: a Review", 2023.** <https://arxiv.org/abs/2306.06441> — survey situating the above.
