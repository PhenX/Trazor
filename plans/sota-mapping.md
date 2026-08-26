# SOTA report → Trazor mapping

Maps every idea in [`state of the art.md`](state%20of%20the%20art.md) to Trazor: what is already shipped,
what is planned and where, what is genuinely new, and what is a confirmed dead end. Tags: `[shipped]`,
`[planned]`, `[new]`, `[dead end]`.

The report's own conclusion — the best systems combine classical geometry + differentiable optimization +
surgical deep learning — is exactly Trazor's architecture. This mapping is the bridge from that report to
the concrete plans: [`vectorization-quality.md`](vectorization-quality.md) (classical quality workstreams),
[`../docs/ML_ROADMAP.md`](../docs/ML_ROADMAP.md) (ML items), and the README roadmap.

## 1. Classical approaches

- **Potrace** — [shipped] the core: clean-room Selinger 2003 chain in `packages/trace`
  (crack decomposition → optimal polygon → vertex adjustment → corner/smoothing → opticurve).
- **AutoTrace** — [dead end] the Potrace chain already has spline fitting, per-vertex corner decisions and
  G1 continuity (pinned by `packages/trace/test/continuity.test.ts`); AutoTrace's extra parameters add nothing.
- **VTracer (region segmentation)** — [shipped] measured head-to-head in `docs/VTRACER_COMPARISON.md`: Trazor
  leads on ΔE, edge-band ΔE, p95 and file size; region-based segmentation regressed twice and was removed. The
  one VTracer advantage left — compact photo output via gradient layering — feeds workstream F below.
- **Illustrator Image Trace (adaptive quantization, modes)** — [shipped] profiles + `@trazor/assist`
  recommendations + `@trazor/tune` automatic search + the palette-floor/autoK fix cover this and go further.

## 2. Differentiable optimization

- **DiffVG** — [planned] `docs/ML_ROADMAP.md` item 6: offline oracle (6a) and bounded in-app refinement (6b).
- **LIVE (layer-wise, gradient layers)** — [planned] offline oracle use (`ML_STRATEGY.md`); the output-side
  idea (gradient fills) is scheduled as workstream F in `plans/vectorization-quality.md`.
- **CLIPasso (semantic/perceptual simplification)** — [new] steal the principle, not CLIP: use the shipped
  edge model's output as a salience map to bias region merging and curve tolerance (keep perceptually
  important detail, drop noise). ML_ROADMAP backlog.
- **Continuity-constrained curve fitting (arXiv 2105.10098)** — [shipped] G1 already holds; the only remaining
  item is optional RANSAC robustification of the primitive/arc fits (ML_ROADMAP item 4).

## 3. Deep supervised learning

- **Im2Vec / SVG-Net / StarVector (end-to-end code generation)** — [dead end] rejected in
  `docs/ML_STRATEGY.md`: hallucinates geometry, few-path icon regime only, far too large for on-device.
- **Diffusion (VectorFusion, DiffSketcher)** — [dead end] on-device impossible; offline data-factory value is
  covered more cheaply by the existing seeded synthetic dataset generator.
- **Deep Vectorization of Technical Drawings (Egiazarian 2020)** — [new] a small primitive-classification head
  (line/arc/circle/corner) as a Tier-2 stage: informs corner decisions, centerline mode, and primitive-fitting
  acceptance. ML_ROADMAP backlog.
- **Text preservation** — [new] a lightweight text-aware protect mask (TinyUNet, trained on font-synthesized
  text renders) keeps lettering crisp through quantization/thresholding. ML_ROADMAP backlog.

## 4. Layer-wise / gradients

- **Gradient fills** — [planned → scheduled] workstream F in `plans/vectorization-quality.md`: deterministic
  per-region linear (then radial) gradient fit (PCA of position → Oklab color) that merges the posterized
  slices of a ramp into one `<linearGradient>` region. The biggest single photo-fidelity and photo-file-size
  lever. Source: Z. Du et al., TOG 2023 (the output-side half of LIVE).
- **Hierarchical region trees** — [planned] the hole hierarchy exists in `traceMask`; object-level
  layer/occlusion ordering is the ML_ROADMAP backlog item.

## 5. Tools

Nothing new. Inkscape, CorelDRAW and Supervectorizer are benchmarked or superseded; see
`docs/VTRACER_COMPARISON.md`.

## 6. Evaluation & benchmarks

- **Geometric metrics (Hausdorff, IoU)** — [new] add to `scripts/eval` alongside ΔE: boundary-position error
  is what the signed-field prepass (ML_ROADMAP item 3) claims to improve, so measure it directly.
- **Perceptual metrics (SSIM, LPIPS)** — [new] SSIM is already a training loss; add it to `scripts/eval` and to
  the `@trazor/tune` scorer so fidelity tracks perception, not only Oklab ΔE. LPIPS stays offline-only.
- **Complexity** — [shipped] node count and byte size are already reported.
- **Public benchmark gallery** — [new] the `scripts/eval/tracer-compare.ts` infrastructure exists; a published
  "Trazor vs VTracer/Inkscape" page doubles as a regression harness and landing-page proof.

## 7. Challenges & future directions

- **Photos / hybrid raster+vector** — [new] an "embed raster" output option: flat areas stay vectorized,
  high-error areas embed the original crop as `<image>`. Deterministic, zero ML, turns photos into a real
  output mode. README roadmap.
- **Text** — covered by the text protect mask above.
- **Compacité (perceptual simplification)** — the salience idea above.
- **Unsupervised learning** — [planned] "your own tracer is a supervision signal" (`ML_STRATEGY.md`).
- **Real-time** — [shipped] worker pool + client in `@trazor/engine`.

## Shortlist of new items, in priority order

1. **Gradient fills** (workstream F) — highest impact, deterministic, classical.
2. **Eval upgrades** — SSIM + Hausdorff/IoU in `scripts/eval` and the `tune` scorer; unlocks measuring 3–6.
3. **Salience-aware simplification** — reuses the shipped edge model.
4. **Text protect mask** — cheap, visible win for logos/screenshots.
5. **Hybrid raster embed** — photos become a real output mode.
6. **Technical-drawing primitive head** — for CAD-ish and line modes.
