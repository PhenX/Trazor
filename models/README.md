# App models

Project-owned ML weights that ship **with the app**, served same-origin (no CORS, no third-party host). Vite copies
`apps/web/public/` verbatim into the build, so a file here at `models/<name>.onnx` is served at
`${import.meta.env.BASE_URL}models/<name>.onnx` on the deployed site.

This is deliberately different from the third-party models (`u2netp`, SlimSAM), which are fetched at runtime from their
upstream mirrors. Models the project trains itself are served from here instead.

## The proven weights are committed; others are fetched at deploy

`edge-prepass.onnx` and `cleanup.onnx` are **committed here**, so the app bundles them into `dist/` and serves them
same-origin with no dependency on a release fetch. They are the weights published on the open engine repo's `models`
release (`PhenX/Trazor`), verified by sha256 (`47e13201…` edge, `7a3c42a2…` cleanup).

Every **other** `.onnx` stays git-ignored and, when present, is downloaded by the deploy workflow
([`.github/workflows/deploy.yml`](../../../../.github/workflows/deploy.yml)) from that same release before `npm run
build`. A model the project has not proven (e.g. `signed-field.onnx`) is neither committed nor fetched; the app fails
soft and traces classically without it.

To refresh a committed weight: replace the file here (same path), verify its sha256 against the engine release, and
commit it. To publish a new model to the release instead of committing it:

```sh
gh release upload models <name>.onnx --repo PhenX/Trazor --clobber
```

## The models

- **`edge-prepass.onnx`** — the learned edge pre-pass ([`docs/EDGE_PREPASS.md`](../../../../docs/EDGE_PREPASS.md)),
  **published on the `models` release** (~0.46 MB) and fetched here automatically by the deploy.
  `MODEL_REGISTRY['edge-prepass']` points at `models/edge-prepass.onnx`; when it is absent (a plain local build),
  `EdgeEnhancer.create()` fails soft and the app traces classically.
- **`cleanup.onnx`** — the learned cleanup pre-pass ([`docs/CLEANUP_PREPASS.md`](../../../../docs/CLEANUP_PREPASS.md)),
  run by the studio's **Clean up (ML)** button. `MODEL_REGISTRY.cleanup` points at `models/cleanup.onnx`. Until it exists,
  `CleanupEnhancer.create()` fails soft and the working image is left untouched.
