# Dataset generator

A seeded, reproducible pipeline that turns SVGs into aligned `(degraded raster → ground-truth)` training pairs for the
on-device conditioning models in [`../../docs/ML_STRATEGY.md`](../../docs/ML_STRATEGY.md). It feeds two models from one
run — the learned edge pre-pass ([`../../docs/EDGE_PREPASS.md`](../../docs/EDGE_PREPASS.md), the `edge/` target) and the
cleanup pre-pass ([`../../docs/CLEANUP_PREPASS.md`](../../docs/CLEANUP_PREPASS.md), the `clean/` target).

The core idea (see the strategy doc): rendering an SVG gives a _perfectly aligned_ raster + vector pair for free; the
make-or-break step is **degrading the raster input** so the model survives real photos, scans and JPEGs. Ground truth is
derived from the clean render **before** degradation, so inputs and targets stay pixel-aligned.

## Run

```sh
npm run dataset                       # 64 procedural samples → dataset-out/
npm run dataset -- --count 500        # more
npm run dataset -- --source dir --corpus /path/to/svgs --count 2000
npm run dataset -- --count 20000 --jobs 8   # spread across 8 worker threads
npm run dataset -- --help             # all options
```

Generation runs on worker threads (`--jobs`, default: CPU count; `--jobs 1` for single-thread). It is CPU-bound
(rasterize + degrade + PNG encode), so this scales roughly linearly with cores — and the output is **byte-identical**
regardless of `--jobs` (each sample is pure and the manifest is sorted by index).

No corpus is needed to start: the default `procedural` source synthesizes random primitive compositions (the strategy
doc's procedural data source), which also gives exact ground truth. Point `--source dir --corpus <dir>` at real SVGs
(fonts exported per-glyph, icon sets, clip art) to scale up.

## Output

```
dataset-out/
  manifest.json           config, seed, and per-sample split assignment
  train/ val/ test/
    input/  <id>.png       degraded raster (what the model sees)
    clean/  <id>.png       clean scene      (cleanup / super-resolution target)
    edge/   <id>.png       soft edge map    (edge pre-pass target)
```

For a real `--source dir` corpus, splits are assigned **per source family** (top-level subdirectory) so no source SVG
leaks across train/val/test — otherwise metrics inflate. Procedural samples are mutually independent, so they split per
sample and hit the ratios directly. Each sample also records its `family` label in the manifest. Pick the target heads
with `--targets edge,clean`.

## Pipeline (one sample)

1. **Rasterize** the SVG with [resvg](https://github.com/linebender/resvg) at `resolution × supersample`, letterbox to a
   square, apply optional geometric augmentation (rotate/scale/translate), and area-downsample for clean anti-aliasing
   → the **shape** (keeps alpha). — `render.mjs`
2. **Edge target** = max Sobel gradient across the shape's R/G/B/A channels (color boundaries + silhouette). — `targets.mjs`
3. **Background** synth (solid/gradient/checker/noise) and **composite** the shape over it → the **clean scene** (also the
   cleanup target). — `degrade.mjs`
4. **Degrade** a copy of the clean scene: Gaussian blur → down/up resample → Gaussian noise → optional posterize → JPEG
   round-trip (high-order degradation, Real-ESRGAN / BSRGAN style) → the **input**. — `degrade.mjs`

## Determinism

Every random draw comes from `mulberry32` (same PRNG as `@trazor/core`), seeded from `--seed` and the sample index,
so a given config regenerates the same dataset. The manifest records the config and seed and contains **no wall-clock**.
Note that PNG/JPEG encoders can vary across library or platform versions — pin `node_modules` (the repo lockfile) if you
need byte-identical regeneration across machines.

## Files

| File                | Role                                                               |
| ------------------- | ------------------------------------------------------------------ |
| `generate.mjs`      | CLI, worker-pool orchestration, split assignment, manifest         |
| `sample.mjs`        | one sample end to end (render → degrade → targets → write)         |
| `sample-worker.mjs` | worker-thread entry: runs `sample.mjs` off the main thread         |
| `config.mjs`        | defaults + argument parsing + usage                                |
| `sources.mjs`       | procedural SVG synthesis and real-corpus directory walk            |
| `render.mjs`        | resvg rasterization, letterbox, geometric augmentation, downsample |
| `degrade.mjs`       | background, composite, and the photometric degradation ops         |
| `targets.mjs`       | edge-map ground truth (Sobel)                                      |
| `imageops.mjs`      | RGBA resize / area-downsample / affine / letterbox primitives      |
| `random.mjs`        | seeded PRNG and distribution helpers                               |
| `io.mjs`            | PNG writing and manifest                                           |

## Extending

- **Canonicalization** (`sources.mjs`) is a pass-through stub. A production corpus pipeline should flatten transforms,
  resolve `<use>`, and expand shorthand into the `@trazor/svg` path model so targets match engine output.
- **New target heads** (e.g. region label maps for layer ordering, or primitive parameter lists for shape fitting): add a
  deriver beside `targets.mjs` and a `--targets` key.
- **Real backgrounds / more degradations** (chromatic aberration, halftone, scanner warps) plug into `degrade.mjs`.
- **`@trazor/trace` as a target source:** trace clean renders with the engine to produce near-perfect vector targets
  (see the strategy doc's "your own tracer is a supervision signal").
