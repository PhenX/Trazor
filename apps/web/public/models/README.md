# App models

Project-owned ML weights that ship **with the app**, served same-origin (no CORS, no third-party host). Vite copies
`apps/web/public/` verbatim into the build, so a file here at `models/<name>.onnx` is served at
`${import.meta.env.BASE_URL}models/<name>.onnx` on the deployed site.

This is deliberately different from the third-party models (`u2netp`, SlimSAM), which are fetched at runtime from their
upstream mirrors. Models the project trains itself live here instead.

## edge-prepass.onnx

The learned edge pre-pass (see [`../../../../docs/EDGE_PREPASS.md`](../../../../docs/EDGE_PREPASS.md)). Not committed yet
— train it on data from [`../../../../scripts/dataset`](../../../../scripts/dataset/README.md), export to ONNX, and drop
it here as `edge-prepass.onnx`. `MODEL_REGISTRY['edge-prepass']` already points at `models/edge-prepass.onnx`; the app
resolves that against its deploy base. Until the file exists, `EdgeEnhancer.create()` fails soft and the app traces
classically.

`*.onnx` here is force-tracked (the repo's root `.gitignore` keeps scratch weights out but allows this directory). The
binary is a few MB; if the repo accumulates several models, track them with **Git LFS** (`git lfs track
"apps/web/public/models/*.onnx"`) to keep clones lean.
