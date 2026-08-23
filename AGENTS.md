# Trazor — Agent Instructions

Root guide for any AI agent (Claude Code, opencode, Copilot, Cursor, …). It covers the whole monorepo: what lives
where, how to run and verify things, and the conventions that apply everywhere.

**Area guides — read the one covering the directory you are editing, in addition to this file:**

| Editing…                                               | Read first                                             |
| ------------------------------------------------------ | ------------------------------------------------------ |
| `packages/trace/` — the tracer, the flagship algorithm | [`packages/trace/AGENTS.md`](packages/trace/AGENTS.md) |
| `apps/web/` — the Vue 3 studio UI                      | [`apps/web/AGENTS.md`](apps/web/AGENTS.md)             |

Reference material worth opening when you need the map rather than the rules: [`ARCHITECTURE.md`](ARCHITECTURE.md)
(whole repo), [`packages/trace/ARCHITECTURE.md`](packages/trace/ARCHITECTURE.md) (the tracer),
[`docs/CONTRACTS.md`](docs/CONTRACTS.md) (exact package APIs), [`docs/REFERENCES.md`](docs/REFERENCES.md)
(algorithm & model sources), and [`docs/ML_STRATEGY.md`](docs/ML_STRATEGY.md) (ML & dataset roadmap: where ML fits, how
determinism is scoped for WebGPU, and how to build a training set).

## Project overview

A **fully client-side** raster → SVG vectorization studio. It decodes an image in the browser, traces it to clean,
editable, cuttable SVG, and never sends anything to a server — no upload, no account, no backend. The output is a
static site deployable to GitHub Pages or any static host.

The **tracing algorithm is the product**: a Potrace-class curve chain (Selinger 2003, clean-room — no GPL code)
applied per color layer, plus a shared boundary graph for seam-free cutout partitions and skeleton-based centerline
tracing. On top of it sit target profiles (illustration, logo, vinyl cut, laser, pen plotter, stencil, …), data-derived
palette suggestions, and optional on-device ML (background removal, click-to-segment). See [`README.md`](README.md) for
the feature tour and [`docs/REFERENCES.md`](docs/REFERENCES.md) for the literature behind each stage.

## Repository layout

```
packages/                  Algorithm packages, consumed by name (@trazor/*). Pure TS, no DOM (except ml).
  core/                    @trazor/core — shared types, settings schema + profiles, Oklab color math,
                           geometry, path model, deterministic PRNG. Zero deps. Everything depends on it.
  raster/                  @trazor/raster — resize, denoise, background flatten, k-means++ quantization,
                           Otsu/adaptive threshold, morphology, Zhang-Suen thinning, chamfer distance.
  trace/                   @trazor/trace — THE tracer: crack decomposition, Potrace chain, shared boundary
                           graph (seam-free cutout), centerline extraction, Schneider fitting.
  svg/                     @trazor/svg — compact SVG serialization + output analysis.
  engine/                  @trazor/engine — mode pipelines, progress/cancellation, warnings, worker + client.
  ml/                      @trazor/ml — background removal & click-to-segment via onnxruntime-web. Browser-only.
  assist/                  @trazor/assist — image statistics → recommended settings & suggested palettes.
apps/
  web/                     @trazor/web — Vue 3 + Pinia + Vite studio UI. The deployable app.
docs/                      CONTRACTS.md (package APIs), REFERENCES.md (sources), screenshot.png.
scripts/                   e2e.mjs — real-browser smoke test / screenshot generator.
shared configs             .oxlintrc.json, .oxfmtrc.json, tsconfig.base.json, tsconfig.packages.json, vitest.config.ts.
```

**Where a new workspace goes** — keep the split consistent:

- `packages/*` — an algorithm package consumed _by name_ (`@trazor/*`), pure and testable in Node. No DOM APIs
  except `@trazor/ml` (which guards all browser access behind functions so it still imports in Node).
- `apps/*` — a deployable surface. Today just `web`.

Every workspace is listed in the root [`package.json`](package.json) `workspaces` array (`packages/*`, `apps/*`).
Packages resolve each other through the workspace symlink and export TypeScript source directly (`"exports": "./src/index.ts"`) —
Vite and Vitest consume the source, so there is **no per-package build step**; only `apps/web` builds (via Vite).

## Quick start

Prerequisites: **Node.js 22+**, npm, Git. All commands run from the **repo root**.

```bash
npm install
npm run dev          # Vite dev server → http://localhost:5173
```

Everything runs in the browser; there is no database, server or configuration.

## Commands

From the repo root:

| Command                     | Purpose                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`               | Dev server (Vite, `apps/web`)                                                                                                                                       |
| `npm run build` / `preview` | Production build → `apps/web/dist` / preview it                                                                                                                     |
| `npm test` / `test:watch`   | Unit tests (Vitest) across all packages                                                                                                                             |
| `npm run typecheck`         | `tsc` (packages) + `vue-tsc` (app)                                                                                                                                  |
| `npm run lint` / `lint:fix` | oxlint                                                                                                                                                              |
| `npm run fmt` / `fmt:check` | oxfmt                                                                                                                                                               |
| `npm run check`             | lint + fmt:check + typecheck + test (what CI runs)                                                                                                                  |
| `npm run e2e`               | Real-browser smoke test — **needs `npm run build` first**; drives `apps/web/dist` with system Chromium, writes `e2e-artifacts/` and refreshes `docs/screenshot.png` |
| `npm run test:render`       | Real-browser render check — **needs `npm run build` first**; traces bundled samples and asserts optimized SVGs render identically to the un-optimized baseline      |

Run a single package's tests with `npx vitest run packages/<name>`.

Run typecheck, lint and tests **once at the end** before the final commit — not after every edit.

## Conventions that apply everywhere

### Code

- **Keep it simple.** Obvious code beats clever code. This is a deliberately AI-friendly codebase.
- **Strict TypeScript**, ESM everywhere. `verbatimModuleSyntax` is on — use `import type` for type-only imports.
- **American English** spelling in code and docs ("initialize", "color", "normalize").
- **Determinism is a hard requirement.** The same image + settings must produce byte-identical SVG. Never call
  `Math.random()` — draw from `mulberry32` (`@trazor/core`) with a fixed or caller-provided seed. `Date.now()` /
  `new Date()` must not affect output.
- **Hot pixel loops** use typed arrays and precomputed indices — no per-pixel closures, objects or allocations. Images
  can be 4096×4096.
- **No DOM APIs in algorithm packages** (`core`/`raster`/`trace`/`svg`/`engine`/`assist`) — they must run in Node
  (tests) and in a Web Worker. `@trazor/ml` may touch browser APIs but only behind functions, never at module top
  level, so it still imports cleanly in Node.
- **Cross-package boundaries are the contract.** [`docs/CONTRACTS.md`](docs/CONTRACTS.md) is the authoritative API
  surface; when you change an exported signature, update the contract and every caller in the same commit.
- **Packages don't localize.** The Vue app is bilingual (English/French; see [`apps/web/AGENTS.md`](apps/web/AGENTS.md)).
  A `@trazor/*` package that emits user-facing text returns English plus a stable identifier the app translates by —
  a `code`/`id`, and structured `params` for any interpolated values (see `VectorizeWarning.params`,
  `Recommendation.rationaleKeys`) — never presentation-only translated prose.

### Comments

- **Never write before/after comparisons.** No "was X, now Y", "used to", "previously", "replaced A with B". Comments
  describe the current state only — git holds the history.
- **Never justify a change** in a comment. State the rule the code follows (e.g. "y-down, integer pixel-corner
  coordinates"), not the story behind it or the alternative rejected. Reasoning belongs in the commit message / PR.
- **Cite the algorithm, not the plan.** A one-line reference to the paper/section is welcome ("Selinger 2003 §2.2");
  never reference task lists, plan IDs or exploration notes.
- These rules apply to every comment: JSDoc, inline, and comments inside tests.

### Commits & PR titles

Conventional Commits, `type(scope): subject`:

- **type** — `feat` `fix` `perf` `docs` `chore` `ci` `refactor` `test` `build` `style` `revert`
- **scope** — the package or area touched: `core` `raster` `trace` `svg` `engine` `ml` `assist` `web` `ci` `docs`
  `deps`. Pick the best fit; never invent one.
- **subject** — lower-case start, imperative, no trailing period.

Do not put a model identifier anywhere in a commit message, PR title/body, or code comment.

### Documentation

- Update the affected doc **in the same commit** as the code change.
- **User-visible change? Add a release note in the same PR.** The app shows a "What's new" changelog; prepend an entry
  to [`apps/web/src/lib/releaseNotes.ts`](apps/web/src/lib/releaseNotes.ts) following the rules in
  [`apps/web/AGENTS.md`](apps/web/AGENTS.md) (dated + numbered per day, plain language). Skip only changes a user would
  never notice.
- [`README.md`](README.md) is the landing page and feature tour.
- [`docs/CONTRACTS.md`](docs/CONTRACTS.md) is the exact package API surface — keep it in sync with exported signatures.
- [`docs/REFERENCES.md`](docs/REFERENCES.md) tracks every citable algorithm and ML model. **When you add or change an
  algorithm, add its source here** (author, title, venue, year + what it's used for + the implementing file). Algorithms
  are implemented from published papers — never by porting GPL source (e.g. Potrace's own code).
- `docs/screenshot.png` is generated by `npm run e2e`; don't hand-edit it.
- **Keep visual demos.** When you build a visual demo or before/after comparison to illustrate a change, save it under
  [`docs/demos/`](docs/demos/) — the generator (`*.ts`, regenerable) and its rendered `*.html` — so it can seed future
  docs, PRs and the README. Don't leave a demo only in a scratch/temp directory. See
  [`docs/demos/README.md`](docs/demos/README.md).

### Tests

- **Vitest** only — pure functions, run in Node. Tests live in `packages/<name>/test/*.test.ts`.
- Assert **geometric/behavioral invariants**, not golden blobs where a blob would be brittle: corners preserved,
  circles stay near their radius, cutout regions share exact boundary anchors, output is deterministic, warnings fire.
- Every algorithm change ships with a test that would have caught the bug it fixes.

### Working with the user's requests

- **Capture conventions.** When asked to apply a change across many files ("always do X"), add the resulting rule to
  the narrowest `AGENTS.md` that covers it — an area guide first, this root file only if it truly applies everywhere.

## Troubleshooting

- **`npm run e2e` fails to launch a browser?** It uses the system Chromium at `/opt/pw-browsers/chromium` and needs a
  fresh `npm run build` first (it serves `apps/web/dist`).
- **A model won't download in the browser?** Model URLs must send CORS headers (`Access-Control-Allow-Origin`). GitHub
  release assets do **not** — mirror weights on Hugging Face `resolve/` URLs (see `packages/ml/src/registry.ts`).
- **Typecheck passes per-package but the app fails `vue-tsc`?** Packages export raw `src/` TypeScript; a breaking change
  in a package surfaces only when the app (or another package) is typechecked. Run the full `npm run typecheck`.
- **Never start the dev server in the foreground of a tool call.** `npm run dev` blocks until timeout — run it in the
  background if you need it, or use `npm run e2e` for headless verification.
