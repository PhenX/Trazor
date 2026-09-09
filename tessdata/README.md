# Tesseract language data (OCR text layer)

The `<lang>.traineddata.gz` files Tesseract.js loads to recognize text, served **same-origin** from here (never from a
CDN). `lib/ocrClient.ts` points Tesseract's `langPath` at `${import.meta.env.BASE_URL}tessdata` and reads the gzipped
data, so a file here at `tessdata/eng.traineddata.gz` is served at `${import.meta.env.BASE_URL}tessdata/eng.traineddata.gz`.

## Fetched at deploy, not committed

`*.traineddata` / `*.traineddata.gz` are **git-ignored** — these are multi-MB models and do not belong in history.
Unlike the ONNX weights in [`../models/`](../models/README.md) — Trazor's own, so release-only — these are the
**public** `fast` models the mirror tesseract.js itself defaults to, so no GitHub Release is needed. The deploy workflow
([`.github/workflows/deploy.yml`](../../../../.github/workflows/deploy.yml)) fetches them into this directory just before
`npm run build` with the same build-time script dev uses (`scripts/fetch-tessdata.mjs`), and Vite copies them into
`dist/` so they ship same-origin like any other static asset.

The `fast` (integer) models are the right default for a browser — `eng.traineddata` is ~2 MB `fast` vs ~15–23 MB
`best`. **Every language the picker offers ships by default** — all eleven `fast` models total ~16 MB, and a visitor's
browser only fetches the one they actually pick. To trim what deploys, set the `TESSERACT_LANGS` repo variable to a
shorter space-separated list of the Tesseract codes the picker uses (`eng`, `deu`, `spa`, `fra`, `ita`, `jpn`, `kor`,
`nld`, `por`, `rus`, `chi_sim`) — e.g. `eng fra deu`.

When a selected language's file is absent, `OcrClient` fails soft: the _Detect text_ tool reports the model is
unavailable and tracing proceeds unchanged.

## Local development

The runtime (worker + core) is vendored automatically, but the language data is not — it is a multi-MB download. To
exercise the OCR tool locally, fetch the `fast` models into this directory (dev/build-time only; the shipped app never
fetches them):

```sh
npm run ocr:lang -w apps/web            # English
npm run ocr:lang -w apps/web -- deu fra # more languages
```

They are git-ignored, so they won't be committed.
