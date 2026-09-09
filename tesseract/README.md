# Tesseract runtime (OCR text layer)

The **on-device OCR** behind the studio's _Detect text_ tool ([`plans/text-layer.md`](../../../../plans/text-layer.md))
runs [Tesseract.js](https://github.com/naptha/tesseract.js). Its **worker script** and **WASM core** are served
**same-origin** from here — never from a CDN — to keep the studio's hard invariant intact: nothing about the user's
image leaves the device, and the only downloads are on-device runtime served from our own origin.

Vite copies `apps/web/public/` verbatim into the build, so files here at `tesseract/<file>` are served at
`${import.meta.env.BASE_URL}tesseract/<file>`, which is exactly what `lib/ocrClient.ts` points Tesseract's
`workerPath`/`corePath` at.

## Vendored at deploy, not committed

Everything here except this README is **git-ignored** — no binaries in history. The runtime is copied out of the
installed npm packages (`tesseract.js`, `tesseract.js-core`) by
[`../../scripts/vendor-tesseract.mjs`](../../scripts/vendor-tesseract.mjs). This runs **automatically** via the app's
`predev`/`prebuild` npm scripts, so `npm run dev` and `npm run build` always have it (and so does the deploy). Run it
by hand if you need to:

```sh
node apps/web/scripts/vendor-tesseract.mjs
```

When these files are absent, `OcrClient` fails soft: the _Detect text_ tool reports the model is unavailable and
tracing proceeds unchanged.

The **language data** (`<lang>.traineddata.gz`) lives in the sibling [`../tessdata/`](../tessdata/) directory.
