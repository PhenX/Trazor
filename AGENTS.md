# Trazor — Agent Instructions

Root guide for any AI agent (Claude Code, opencode, Copilot, Cursor, …). It covers the whole monorepo: what lives
where, how to run and verify things, and the conventions that apply everywhere.

**Area guides — read the one covering the directory you are editing, in addition to this file:**

| Editing…                                               | Read first                                             |
| ------------------------------------------------------ | ------------------------------------------------------ |
| `packages/trace/` — the tracer, the flagship algorithm | [`packages/trace/AGENTS.md`](packages/trace/AGENTS.md) |

Reference material worth opening when you need the map rather than the rules: [`ARCHITECTURE.md`](ARCHITECTURE.md)
(whole repo), [`packages/trace/ARCHITECTURE.md`](packages/trace/ARCHITECTURE.md) (the tracer),
[`docs/CONTRACTS.md`](docs/CONTRACTS.md) (exact package APIs), [`docs/REFERENCES.md`](docs/REFERENCES.md)
(algorithm & model sources), [`docs/ML_STRATEGY.md`](docs/ML_STRATEGY.md) (ML strategy: where ML fits, how determinism is
scoped for WebGPU, and how to build a training set), and [`docs/ML_ROADMAP.md`](docs/ML_ROADMAP.md) (the prioritized ML &
vectorization plan).

## Project overview

The open-source **raster → SVG vectorization engine**: the `@trazor/*` TypeScript packages. Pure, deterministic, and
DOM-free (except `@trazor/ml`), so they run identically in a browser, a Web Worker and in Node tests. The engine
powers the **Trazor studio** (a fully client-side web app hosted at [trazor.studio](https://trazor.studio)); that
studio is a separate product and is **not** in this repository — this repo is the vectorizer it is built on.

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
  ml/                      @trazor/ml — background removal & click-to-segment, plus the learned edge,
                           cleanup & signed-field conditioning models, via onnxruntime-web. Browser-only.
  assist/                  @trazor/assist — image statistics → recommended settings & suggested palettes.
  tune/                    @trazor/tune — automatic settings search: weighted objectives + adaptive
                           parameter descent. Pure, DOM-free; a consumer pairs it with the engine worker pool.
docs/                      CONTRACTS.md (package APIs), REFERENCES.md (sources), ML strategy/roadmap.
scripts/                   dataset generation, corpus fetch, tracer-evaluation tooling (scripts/eval/README.md)
                           and the performance bench (scripts/bench/README.md).
shared configs             .oxlintrc.json, .oxfmtrc.json, tsconfig.base.json, tsconfig.packages.json, vitest.config.ts.
```

**Where a new workspace goes** — keep the split consistent:

- `packages/*` — an algorithm package consumed _by name_ (`@trazor/*`), pure and testable in Node. No DOM APIs
  except `@trazor/ml` (which guards all browser access behind functions so it still imports in Node).

Every workspace is listed in the root [`package.json`](package.json) `workspaces` array (`packages/*`). Packages
resolve each other through the workspace symlink and export TypeScript source directly (`"exports": "./src/index.ts"`) —
Vitest (and a consumer's bundler) consume the source, so there is **no per-package build step**.

## Quick start

Prerequisites: **Node.js 22+**, npm, Git. All commands run from the **repo root**.

```bash
npm install
npm run check        # lint + fmt:check + typecheck + test
```

The packages are pure and run in Node; there is no database, server or configuration.

## Commands

From the repo root:

| Command                                 | Purpose                                                               |
| --------------------------------------- | --------------------------------------------------------------------- |
| `npm test` / `test:watch`               | Unit tests (Vitest) across all packages                               |
| `npm run typecheck`                     | `tsc` over the packages                                               |
| `npm run lint` / `lint:fix`             | oxlint                                                                |
| `npm run fmt` / `fmt:check`             | oxfmt                                                                 |
| `npm run check`                         | lint + fmt:check + typecheck + test (the CI gate)                     |
| `npm run dataset` / `corpus` / `eval:*` | dataset generation, corpus fetch, tracer evaluation                   |
| `npm run bench`                         | per-stage timing + SVG hash over a corpus (`scripts/bench/README.md`) |

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
- **Packages don't localize.** A `@trazor/*` package that emits user-facing text returns English plus a stable
  identifier a consumer translates by — a `code`/`id`, and structured `params` for any interpolated values (see
  `VectorizeWarning.params`, `Recommendation.rationaleKeys`) — never presentation-only translated prose.

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
- **scope** — the package or area touched: `core` `raster` `trace` `svg` `engine` `ml` `assist` `tune` `ci` `docs`
  `deps`. Pick the best fit; never invent one.
- **subject** — lower-case start, imperative, no trailing period.

Do not put a model identifier anywhere in a commit message, PR title/body, or code comment.

### Documentation

- Update the affected doc **in the same commit** as the code change.
- [`README.md`](README.md) is the landing page and feature tour.
- [`docs/CONTRACTS.md`](docs/CONTRACTS.md) is the exact package API surface — keep it in sync with exported signatures.
- [`docs/REFERENCES.md`](docs/REFERENCES.md) tracks every citable algorithm and ML model. **When you add or change an
  algorithm, add its source here** (author, title, venue, year + what it's used for + the implementing file). Algorithms
  are implemented from published papers — never by porting GPL source (e.g. Potrace's own code).
- **Keep visual demos.** When you build a visual demo or before/after comparison to illustrate a change, save it under
  [`docs/demos/`](docs/demos/) — the generator (`*.ts`, regenerable) and its rendered `*.html` — so it can seed future
  docs, PRs and the README. Don't leave a demo only in a scratch/temp directory. See
  [`docs/demos/README.md`](docs/demos/README.md).

### Tests

- **Vitest** only — pure functions, run in Node. Tests live in `packages/<name>/test/*.test.ts`.
- Assert **geometric/behavioral invariants**, not golden blobs where a blob would be brittle: corners preserved,
  circles stay near their radius, cutout regions share exact boundary anchors, output is deterministic, warnings fire.
- Every algorithm change ships with a test that would have caught the bug it fixes.

### Evaluating quality changes

A change to color, palette, segmentation or the tracer is only "better" if it is **measured** better on
**representative** images — actual illustrations, logos and photos, not clean synthetic shapes.

- **Never judge a quality change on a synthetic or one-off image.** The built-in `npm run eval:corpus` set is a signal
  generator (clean procedural shapes) and a single hand-picked image proves nothing — both routinely show a "win" that
  vanishes on real art. Measure on the **representative corpus**: `scripts/eval/corpus-vtracer` (`npm run eval:samples`)
  or any folder of real PNG/JPEG images passed with `--data`.
- **Use `npm run eval:ab` for the verdict.** It traces the corpus through the engine on your working tree and on HEAD
  and prints **PASS / MIXED / FAIL** (`scripts/eval/README.md`). A change ships only on **PASS**; a **MIXED** is a real
  trade-off to weigh out loud with the user, and a **FAIL** does not ship. Don't hand-compare two runs by eye.
- **Read the whole metric panel, not the mean.** Whole-image mean ΔE dilutes local damage; a change can lower the mean
  while raising **spurious hue** (a saturated color invented at a seam). `eval:ab` judges on ΔE _and_ spurious hue for
  exactly this reason — a better mean bought with worse spurious hue is not an improvement.
- **Gate at the routing you actually changed.** A palette (quantize) change shows nothing on images the recommender
  routes to region growing, and vice-versa; force the path (`--set segmentation=quantize`) or sweep a setting
  (`--sweep segmentation=quantize,regions`, or `--sweep 6,8,12` for `paletteSize`) so the change is exercised where it
  lives. `eval:ab` prints a per-image breakdown and a verdict per swept value — don't hand-diff two runs.
- **Don't write throwaway eval code.** The per-image deltas and the parameter sweep are built into `eval:ab`; a quick
  "does this function do X?" check belongs in a unit test, not a scratch script. When prototyping a new tunable you'll
  want to sweep, thread it through `VectorizeSettings` so `--sweep` reaches it.

### Working with the user's requests

- **Capture conventions.** When asked to apply a change across many files ("always do X"), add the resulting rule to
  the narrowest `AGENTS.md` that covers it — an area guide first, this root file only if it truly applies everywhere.

## Troubleshooting

- **A model won't download in the browser?** Model URLs must send CORS headers (`Access-Control-Allow-Origin`). GitHub
  release assets do **not** — mirror weights on Hugging Face `resolve/` URLs (see `packages/ml/src/registry.ts`).
- **A breaking change in one package** surfaces only when a dependent package is typechecked. Run the full
  `npm run typecheck` (all packages) before committing, not just the one you edited.
