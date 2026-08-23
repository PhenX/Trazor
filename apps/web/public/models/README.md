# App models

Project-owned ML weights that ship **with the app**, served same-origin (no CORS, no third-party host). Vite copies
`apps/web/public/` verbatim into the build, so a file here at `models/<name>.onnx` is served at
`${import.meta.env.BASE_URL}models/<name>.onnx` on the deployed site.

This is deliberately different from the third-party models (`u2netp`, SlimSAM), which are fetched at runtime from their
upstream mirrors. Models the project trains itself are served from here instead.

## Weights are fetched at deploy, not committed

`*.onnx` is **git-ignored** — no multi-MB binaries in history. Instead the deploy workflow
([`.github/workflows/deploy.yml`](../../../../.github/workflows/deploy.yml)) downloads them into this directory just
before `npm run build`, so they land in `dist/` and ship same-origin. The source is a **GitHub Release on this repo**
(default tag `models`; override with the `MODELS_RELEASE_TAG` repo variable) with the `.onnx` files attached as assets.

To publish/refresh a model:

1. Train and export it (see [`../../../../scripts/train`](../../../../scripts/train/README.md)) →
   `edge-prepass.onnx` and/or `cleanup.onnx`.
2. Attach it to the `models` release (create the release once, then update its assets):
   ```sh
   gh release create models edge-prepass.onnx cleanup.onnx --title "Model weights" --notes "on-device pre-pass weights"
   # later, to replace:
   gh release upload models edge-prepass.onnx --clobber
   ```
3. Re-run the Pages deploy (push to `main`, or trigger the workflow manually). The new weights are live.

Locally you can drop a `.onnx` here by hand to test — it's git-ignored, so it won't be committed.

## The models

- **`edge-prepass.onnx`** — the learned edge pre-pass ([`docs/EDGE_PREPASS.md`](../../../../docs/EDGE_PREPASS.md)),
  **published on the `models` release** (~0.46 MB) and fetched here automatically by the deploy.
  `MODEL_REGISTRY['edge-prepass']` points at `models/edge-prepass.onnx`; when it is absent (a plain local build),
  `EdgeEnhancer.create()` fails soft and the app traces classically.
- **`cleanup.onnx`** — the learned cleanup pre-pass ([`docs/CLEANUP_PREPASS.md`](../../../../docs/CLEANUP_PREPASS.md)),
  run by the studio's **Clean up (ML)** button. `MODEL_REGISTRY.cleanup` points at `models/cleanup.onnx`. Until it exists,
  `CleanupEnhancer.create()` fails soft and the working image is left untouched.
