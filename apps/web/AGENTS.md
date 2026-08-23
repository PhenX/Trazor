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
                          overlay (per-element-kind colors/labels for the complexity overlay),
                          releaseNotes (the user-facing changelog + its date/iteration helpers)
  components/             AppHeader, DropZone, SettingsPanel, MlTools, PreviewViewport, PreviewOverlay, StatsBar, ExportBar, ReleaseNotes, ToastHost
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

## Release notes

The app ships a user-facing changelog: the **"What's new"** button in `AppHeader` opens `ReleaseNotes.vue`, which
renders the entries from [`src/lib/releaseNotes.ts`](src/lib/releaseNotes.ts). A badge on that button counts the notes
published since the visitor's last visit (persisted as `lastSeenRelease`; the count is the store's
`unseenReleaseCount`), and clears when they open the panel.

**On every pull request that changes something a user would notice, add a release note — in the same PR.** This is
part of "done", like updating docs. Skip it only for changes with no user-visible effect (pure refactors, tests, CI,
internal-doc edits).

- **Prepend** one `ReleaseNote` object to the **top** of the `RELEASE_NOTES` array — newest first. The array order is
  the source of truth for the "new since last visit" badge, so never reorder or rewrite already-published entries.
- **Identify it by date, not a version** (there is no versioning yet): set `date` to the merge day (ISO `YYYY-MM-DD`)
  and `iteration` to a per-day counter. If an entry for that date already exists, use the next `iteration` (…`.2`,
  `.3`); otherwise start at `1`. Together they read as `2026-08-23.2` (`releaseId`).
- **Write for users, not contributors.** A short `title` and one plain-language line per change in `items` — say what
  someone can now do or what got better, not which module changed. Pick the `kind` (`feature` / `improvement` / `fix`)
  that best fits. Keep emoji out of the notes.

## Internationalization (i18n)

The UI ships in **English and French** via `vue-i18n` (Composition API, `legacy: false`). The catalogs
live in [`src/i18n/locales/`](src/i18n/locales/): `en.ts` is the source-of-truth schema (`MessageSchema`),
and `fr.ts` is typed as that schema so a missing or extra key is a **type error**. A parity test
([`test/i18n.test.ts`](test/i18n.test.ts)) additionally asserts the two catalogs share the same keys,
the same `{named}` placeholders, and the same plural-branch counts.

- **Every user-visible string goes through the catalogs.** Add the key to **both** `en.ts` and `fr.ts`
  (same path), then read it in a component with `const { t } = useI18n()` and `t('group.key')`. From the
  store and other non-component modules use `translate` (re-exported as `t`) from `src/i18n`. Never
  hardcode display text, `title`/`aria-label`/`placeholder` attributes, or toast messages.
- **Locale is auto-detected** from `navigator.languages` (French → `fr`, otherwise English), overridable
  from the header language menu, and persisted in the store's localStorage state (`locale`). The store
  owns the `locale` ref and drives the shared instance; `App.vue` reflects it onto `<html lang>`.
- **Package strings are localized by stable id/code, not by translating in the package.** Keep
  `@trazor/*` packages emitting English text plus a stable identifier, and translate app-side:
  `profiles.<id>`, `modes.<id>`, `stages.<id>`, `samples.<id>`, `palettes.<id>`, `warnings.<code>` (with
  the warning's `params`), and auto-recommend `rationale.<code>` (with `RationaleKey.params` from
  `@trazor/assist`). When a package produces interpolated user-facing text, expose the values as
  structured `params`/codes (as `VectorizeWarning.params` and `Recommendation.rationaleKeys` do) rather
  than baking presentation-only translated prose into the package.
- **Release-note copy** (`title`/`items` in `lib/releaseNotes.ts`) stays English; only the panel chrome
  and the date (`Intl`, active locale) are localized. Number grouping (`formatCount`) also follows the
  active locale.

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
