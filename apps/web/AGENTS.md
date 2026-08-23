# Web app — agent guide

Rules for working inside `apps/web/` (`@trazor/web`) — the Vue 3 + Pinia + Vite studio UI, and the only deployable
surface. Read [`../../AGENTS.md`](../../AGENTS.md) first for repo-wide conventions and
[`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) for how the packages fit together.

## What this app is

A single-page studio that decodes an image, drives the vectorization `@trazor/engine` in a Web Worker, and shows the
result with live stats and a fidelity score. It is **100% client-side** — no network calls except the optional on-device
ML model downloads. It builds to static files in `dist/` and deploys to GitHub Pages (or any static host).

## Shape

```
src/
  main.ts                createApp + Pinia + base.css
  App.vue                layout grid, keyboard shortcuts, theme binding
  store/appStore.ts       the single source of truth (Pinia setup store)
  worker/vectorize.worker.ts   installWorkerHandler(self) — the engine, off the main thread
  lib/                    decode (image → RasterImage), download/copy, fidelity scoring, samples, format helpers,
                          overlay (per-element-kind colors/labels for the complexity overlay)
  components/             AppHeader, DropZone, SettingsPanel, MlTools, PreviewViewport, PreviewOverlay, StatsBar, ExportBar, ToastHost
  components/controls/    ControlRow / SliderRow / SelectRow / SwitchRow / ColorRow / TextRow
  styles/base.css         design tokens (dark + light), shared component classes
```

## Conventions

- **`<script setup lang="ts">`, typed props/emits, no `any`.** Prefer computed over methods; extract a small component
  rather than growing one giant SFC.
- **The store is the single source of truth.** State, settings, the worker client, ML state and palette suggestions all
  live in `store/appStore.ts`; components stay thin and dispatch to it.
- **Vectorization goes through the worker, never inline.** The store holds one `TrazorClient` and re-runs on a
  debounced `[workingImage, settings]` watch with latest-wins semantics; a superseded run rejects with `CancelledError`
  (matched by `error.name`, cross-realm safe) and is swallowed silently. Never call the engine on the main thread.
- **The worker copies the pixel buffer before transferring** (`client.ts`) — the store passes `workingImage` without
  cloning and relies on that. Don't remove the copy or the caller's image detaches.
- **Settings come from `@trazor/core`.** Use `DEFAULT_SETTINGS`, `normalizeSettings`, `TARGET_PROFILES`; never
  hand-maintain a parallel list of fields or clamps.
- **Theme-aware and responsive.** Every color is a token in `base.css` defined for both dark and default/light; respect
  `prefers-reduced-motion`. Usable at 1280×800 and up; the sidebar scrolls independently.
- **No external network resources** — system font stack only, no CDN/webfonts. The only permitted downloads are ML model
  weights via `@trazor/ml`, and the app must stay fully functional when they fail.
- **ML is lazy and fail-soft.** Import `@trazor/ml` dynamically so `onnxruntime-web` stays out of the main bundle;
  surface every failure as a toast and continue without it.

## Workflow

```bash
npm run dev              # Vite dev server (run in the background, not the foreground of a tool call)
npm run typecheck -w apps/web    # vue-tsc
npx oxlint apps/web              # lint
npx oxfmt apps/web               # format (run last)
npm run build            # production build → dist/
npm run e2e              # from repo root, after build — headless Chromium smoke test + screenshot
```

`vite.config.ts` reads `BASE_PATH` (default `/`) for sub-path hosting — the Pages workflow sets it to `/<repo>/`.
Prefer `npm run e2e` over a foreground dev server to confirm a change actually works in a real browser.
