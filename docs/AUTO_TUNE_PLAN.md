# Auto-optimize — design plan for the brute-force settings search

**Status: M1–M3 shipped; M4 planned.** This documents the design of the automatic settings search ("brute force
mode"): the user states how much they care about each quality axis (fidelity, document simplicity, …) and an iteration
budget; the studio then explores the settings space in parallel workers, smartly tweaking one parameter at a time, and
converges on the best settings for _this_ image and _these_ priorities. The core search (`@trazor/tune`), the worker
pool (`TrazorPool`), the fidelity score-only path, the studio panel, and the comparison wall with the synchronized loupe
are implemented; the milestone table below tracks what remains.

The pipeline it drives is described in [`../ARCHITECTURE.md`](../ARCHITECTURE.md); the settings it tunes are
`VectorizeSettings` ([`../packages/core/src/settings.ts`](../packages/core/src/settings.ts)); the metrics it optimizes
already exist (the fidelity ΔE pass in [`../apps/web/src/lib/fidelity.ts`](../apps/web/src/lib/fidelity.ts), the
complexity stats in `VectorizeResult.stats`).

## Why this fits Trazor unusually well

- **The engine is deterministic** — same image + settings ⇒ byte-identical SVG. A search result is reproducible,
  candidates can be deduplicated by settings hash, and any candidate can be re-derived later from its settings alone.
- **The objective ingredients are already computed per run.** Fidelity (mean Oklab ΔE → the 0..1 score in the stats
  bar), document complexity (`pathCount` / `nodeCount` / `byteLength` from `analyzeSvg`), color count, warnings (tiny
  features, stencil islands), and stage timings all ship with every `VectorizeResult`.
- **The worker already caches the expensive stages.** `StageCache` reuses the preprocessed image (keyed by the
  preprocess settings slice) and the quantized label map (keyed by the palette/cleanup slice). Candidates that only
  touch curve parameters skip preprocessing _and_ k-means — typically the two dominant costs in color mode — so a
  well-scheduled search runs several times faster than naive full re-traces.
- **The worker protocol is ready for pooling.** `installWorkerHandler` is stateless per job (plus its cache);
  spawning N vectorize workers needs no engine-side protocol change.

The one honest caveat: pure brute force over ~20 mixed dimensions is combinatorially hopeless (even 3 values per
parameter is 3²⁰ ≈ 3.5 billion runs). "Brute force" is the user experience — _the machine grinds so I don't tweak
sliders_ — but the implementation must be a budgeted guided search. That is exactly the "each time changing a
parameter, smartly tweaked" loop: seeded exploration, then adaptive one-parameter-at-a-time descent.

## Product shape

A **"Auto-optimize"** action in the settings panel (next to the existing per-image Auto recommendation) opens a panel:

1. **Priorities** — one importance slider per objective (0 = don't care … 1 = top priority; weights are normalized
   internally, so they need not sum to anything):
   - **Fidelity** — perceptual closeness to the source (the existing Oklab ΔE score).
   - **Simplicity** — fewer nodes and paths (editability, cutting time, rendering cost).
   - **File size** — output bytes.
   - **Color economy** — fewer palette entries (screens, vinyl sheets).
   - **Cleanliness** — fewer warnings: tiny sub-mm features, stencil islands.
   - Preset chips seed the sliders: _Max fidelity_, _Balanced_, _Smallest file_, _Cut-ready_.
2. **Iterations** — total candidate evaluations (default 40; range ~10–300) with a live time estimate
   (`iterations × median candidate cost ÷ workers`, refined as results arrive).
3. **Advanced** (disclosure) — parameter groups to explore vs hold (see the parameter space below), a _minimum
   fidelity_ guard, worker count (default auto), and opt-in structural moves (curve mode, layering).
4. **Run** — live progress (evaluated / total, workers busy, best score so far, a best-score sparkline) feeding the
   **comparison wall** (below). A **Pareto toggle** dims the dominated tiles (fidelity vs. nodes frontier); score /
   fidelity / nodes / colors / bytes are the sort keys.
5. **Apply / revert** — applying commits the winning settings through the normal `updateSettings` flow (the debounced
   watcher re-traces; determinism guarantees the same SVG the search scored). The pre-search settings are snapshotted
   for one-click revert.

### The comparison wall (primary results view)

The score ranks candidates, but the score is a mean Oklab ΔE — it cannot tell you which of the top five _looks_ right
where it matters (a nicked corner, a lost highlight, a wobbled letter). So the results view is a **wall of every
candidate**, each an SVG tile, with a **synchronized magnifier** for side-by-side detail comparison:

- **All results, not just the winners.** Every non-rejected candidate is a tile (source image pinned as the reference
  tile), sortable by any objective and filterable to the Pareto front. This is why M1 retains each candidate's SVG:
  the wall re-renders them, and the loupe zooms into them.
- **A loupe that follows the mouse across every tile at once, on demand.** Holding a key (or toggling _Compare zoom_)
  shows a magnifier at the pointer. The pointer position over _any_ tile is converted **once** to image-space
  coordinates, then every tile renders that same region magnified — so your eye compares the identical patch across
  all candidates simultaneously. Scroll (or `[` / `]`) changes magnification; the loupe follows until you release.
- **Vector-crisp, nearly free.** Each tile and each loupe view is an inline `<svg>` whose `viewBox` is set to the
  zoom rectangle — vector zoom stays sharp at any magnification with no re-rasterization, and the whole wall is one
  shared `(cx, cy, zoom)` reactive state driving every tile's `viewBox`. The source reference tile magnifies in
  lockstep, so you can compare each candidate against the original at the same magnified patch.
- **Scales to the budget.** The tile grid is virtualized (only on-screen tiles mount their SVG); a large search
  (200+ candidates) still scrolls smoothly. Click a tile to apply its settings, or open it full-bleed against the
  source for a two-up before deciding.

Everything is localized (en + fr), and the run is fully cancellable at any time.

## Objectives and scoring

Each candidate's metrics come straight from its `VectorizeResult` plus one fidelity pass. Raw metrics are mapped to
0..1 **utilities**, anchored to the baseline candidate (the user's current settings, traced in round 0) so the scoring
is scale-free across images:

| Objective     | Raw metric     | Utility                                              |
| ------------- | -------------- | ---------------------------------------------------- |
| Fidelity      | mean Oklab ΔE  | existing `clamp(1 − 4·ΔE, 0, 1)`                     |
| Simplicity    | `nodeCount` n  | `1 / (1 + n / n₀)` (0.5 at the baseline n₀)          |
| File size     | `byteLength` b | `1 / (1 + b / b₀)`                                   |
| Color economy | `colorCount` k | `1 / (1 + (k − 1) / max(1, k₀ − 1))`                 |
| Cleanliness   | warnings       | `max(0, 1 − Σ penalty)` (per-code penalties, capped) |

Total score = `Σ wᵢ·uᵢ / Σ wᵢ` with the slider weights `wᵢ`. Two hard guards keep the weighted sum honest:

- a candidate that produces an `empty-result` warning is **rejected**, not scored (an empty SVG has perfect
  simplicity);
- the optional _minimum fidelity_ constraint rejects candidates below the floor regardless of their other utilities.

Independent of the weights, the search maintains the **Pareto front** over (fidelity, simplicity, color economy) —
the non-dominated candidates — for the results view.

### How fidelity is measured during the search

The existing `computeFidelity` path is reused with three search-specific economies:

- **Score-only mode.** The fidelity worker gains a `heatmap: false` option — the search needs the mean ΔE, not the
  per-pixel diff raster (a large allocation per candidate).
- **Shared reference.** The reference raster (source, downscaled, composited over white) is identical for every
  candidate; the fidelity protocol gains `set-reference` so it is transferred to each fidelity worker **once** per
  search instead of once per candidate.
- **A common score resolution.** Every candidate SVG is rasterized at one capped size (long side ≤ 1024, or the
  working size if smaller) against a reference at the same size. This bounds the per-candidate main-thread
  rasterization cost _and_ keeps scores comparable if `maxDimension` is ever explored — scoring each result only
  against a same-sized downscale of the source would let low-resolution traces hide their detail loss.

SVG rasterization itself stays on the main thread (`<img>` + canvas — `createImageBitmap` can't rasterize SVG
reliably across browsers), serialized through a small queue with a reused canvas; at ≤ 1024 px it is a few
milliseconds per candidate. The applied winner still gets the normal full-resolution fidelity pass with the heatmap,
through the unchanged display path.

## The parameter space

Parameters are described by metadata, not hardcoded loops — each entry declares its kind, range, step scale, the
modes it applies to, and its **cost group** (which pipeline stages a change invalidates, mirroring the engine's
`preKey` / `palKey` cache keys):

```ts
interface ParamSpec {
  key: keyof VectorizeSettings
  kind: 'number' | 'int' | 'bool' | 'enum'
  min?: number
  max?: number
  scale?: 'linear' | 'log' // step arithmetic domain
  values?: readonly string[] // enum choices
  modes?: readonly VectorizeMode[] // absent ⇒ every mode
  group: 'preprocess' | 'palette' | 'binarize' | 'curve' | 'output'
  /** Only meaningful under these settings (e.g. adaptiveRadius under thresholdMode 'adaptive'). */
  when?: (s: VectorizeSettings) => boolean
}
```

| Group        | Cost per candidate                               | Free by default                                                                                                                                              | Opt-in (structural)                        | Held (never searched)                                                                  |
| ------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `preprocess` | full pipeline                                    | —                                                                                                                                                            | `denoise`, `blurRadius`                    | `maxDimension`, `background*`, `alphaThreshold`                                        |
| `palette`    | palette stage onward (preprocess cached)         | `paletteSize`, `autoPaletteSize`, `quantizeQuality`, `minRegionArea`, `preserveDetails`, `dissolveBands`, `colorCoherence`                                   | `omitBackground`, suggested fixed palettes | `palette` (a user-fixed palette stays fixed), `colorSpace`                             |
| `binarize`   | palette-equivalent (bw/centerline)               | `thresholdMode`, `threshold`, `adaptiveRadius`, `adaptiveBias`                                                                                               | `invert`                                   | —                                                                                      |
| `curve`      | trace onward (preprocess **and** palette cached) | `smoothing`, `curveOptimize`, `optTolerance`, `cornerThreshold`, `simplifyTolerance`, `turnPolicy`; centerline: `fitTolerance`, `pruneLength`, `strokeWidth` | `curveMode` (spline ↔ polygon), `layering` | —                                                                                      |
| `output`     | trace onward                                     | `precision`, `optimizeSvg` (only when the file-size weight is > 0)                                                                                           | —                                          | `unit`, `widthMm`, `svgTitle`, `fillColor`, `groupByColor`, `gapFill`, `detectIslands` |

Notes on the defaults:

- **`mode` is never searched.** Switching color ↔ bw ↔ centerline changes what the output _is_; that is the user's
  call. (A future "try every mode" wizard could run one search per mode and present all four winners.)
- **`curveMode` and `layering` are opt-in** because they change the output's character (angular polygons; stacked vs
  exact-partition structure), even though the objective function could legitimately trade them.
- `detectIslands` stays at the user's value — toggling it off would silence island warnings and game the cleanliness
  objective rather than earn it.
- Every generated candidate passes through `normalizeSettings`; the metadata ranges must match its clamps (a unit
  test asserts normalization is a no-op on generated candidates).
- Steps honor each parameter's scale: `paletteSize`, `minRegionArea`, `optTolerance`, `adaptiveRadius`, `pruneLength`
  step multiplicatively (`log`), the 0..1 sliders linearly, ints on the integer lattice, enums by enumeration.

The curve group is deliberately the largest free set: with the stage cache warm those candidates cost only
trace + fit + svg, so the search gets many cheap probes exactly where the fidelity/simplicity tradeoff mostly lives
(`smoothing`, `optTolerance`, `cornerThreshold`).

## Search strategy

A deterministic, round-based state machine — `nextRound()` emits a batch of candidates, `report(results)` feeds the
scores back — so the strategy is pure, unit-testable in Node against a fake evaluator, and independent of worker
timing. All randomness draws from `mulberry32` with a caller-provided seed (repo-wide determinism rule).

**Round 0 — seeding.** The baseline (current settings), the assist recommendation
(`recommendSettings(analyzeImage(image))`), the applicable target-profile patches for the current mode (≤ 3), and
Latin-hypercube samples over the free space to fill the round. Seeds anchor the utility normalization and give the
descent diverse starting material — LHS spreads the probes so every free parameter is exercised at varied levels even
in a small round (McKay, Beckman & Conover 1979).

**Rounds 1+ — adaptive coordinate descent** (Hooke–Jeeves-style pattern search over the incumbent best):

- Each free parameter carries a state: current step (initialized to ~¼ of its range in its scale), an EMA of the
  score gain it last produced, and a last-tried round.
- A round proposes `R` candidates (R ≈ 2 × workers, capped by the remaining budget): for the top-priority parameters,
  incumbent ± step (continuous/int), toggle (bool), or the next untried value (enum); plus one **recombination**
  (crossing the parameter groups of the two best candidates) and, when the incumbent has stalled, one seeded
  **trust-region restart** sample.
- Priority = exploitation (recent gain EMA) + an exploration bonus for least-recently-tried parameters, with a stable
  deterministic tiebreak — this is the "smartly tweaked" part: parameters that keep paying get revisited, dead ones
  decay to occasional checks.
- On results: the incumbent moves only on strict improvement; a successful direction expands that parameter's step
  (×1.6, capped), a both-directions failure shrinks it (×0.5, floored at the parameter's resolution).
- **Convergence:** when every active step is at its floor and the incumbent hasn't improved for 3 rounds, stop early
  and report convergence — no reason to burn the rest of the budget.
- **Dedup:** candidates hash by canonical JSON of their normalized settings; a repeat is served from the score cache
  (free, thanks to determinism) instead of re-traced, and does not consume budget.

Round barriers are what keep the search deterministic under parallelism: workers finish in nondeterministic order,
but the strategy only sees a full round's results at once, sorted by candidate id. The cost is a little idle time at
each barrier, which `R ≈ 2 × workers` amortizes (short and long candidates mix within a round).

**Determinism contract, stated honestly:** given the same image, base settings, options, seed _and browser_, the
search reproduces the same candidate sequence and the same winner. The trace of any settings is byte-identical
everywhere (Tier 1 untouched); the _scores_ depend on the browser's SVG rasterizer (canvas anti-aliasing varies by
engine), so the chosen winner can differ across browsers — the same standing as the fidelity score already shown in
the stats bar. This mirrors the two-tier determinism contract in
[`ML_STRATEGY.md`](ML_STRATEGY.md#determinism-and-webgpu-a-two-tier-contract): selection is conditioning, the core
stays exact.

## Parallel architecture

```
                       ┌────────────────────────────── main thread ──────────────────────────────┐
  TuneSearch (pure) ──► round candidates ──► TrazorPool.run(settings, {affinityKey})             │
        ▲                                          │ N vectorize workers (StageCache each)       │
        │                                          ▼                                             │
   report(results) ◄── score ◄── FidelityPool ◄── rasterize SVG at score size (serialized queue) │
                        (M fidelity workers, shared reference, no heatmap)                       │
```

- **`TrazorPool` (`@trazor/engine`)** — a sibling of `TrazorClient`: `size` workers from the same injected
  `createWorker` factory, a FIFO queue **without** the client's latest-wins auto-cancel, `cancelAll()`, `dispose()`.
  One job per worker at a time (the handler's cooperative interleaving shares one thread — no benefit to stacking
  jobs). Each worker keeps its own single-entry `StageCache`.
- **Affinity scheduling.** Jobs carry an `affinityKey` = the candidate's `preKey|palKey` slice; the pool prefers the
  worker that last ran that key, so curve-group probes land on a warm cache. (Optional later: widen `StageCache` to a
  small LRU of 2–4 palette entries per worker, so alternating palette probes stop thrashing; measured, not assumed.)
- **Worker count** — default `clamp(hardwareConcurrency − 2, 2, 6)`, reduced for very large working images: each
  worker holds the transferred RGBA copy plus its cache (≈ 10 MB at the default 1600 px working size, ≈ 70 MB at
  4096²), so the pool caps its size by image area. The main vectorize client, assist worker and fidelity workers
  coexist with the pool; the default leaves them headroom.
- **`FidelityPool`** — 1–2 fidelity workers running the existing `scoreDifference` with the protocol additions above
  (`set-reference`, `heatmap: false`).
- **Edge pre-pass** — when the ML edge hint is active it is passed to every pool job (each gets its own transferred
  copy), so the search optimizes the pipeline the user will actually run; this disables the palette-stage cache
  (existing correctness rule), which the time estimate reflects.
- **Memory discipline** — the results ledger keeps _settings + metrics + score + SVG text_ for every candidate. SVG
  is compact text (the wall and loupe re-render it, and it is byte-identically re-derivable from its settings anyway),
  so retaining all of it is cheap; the search never holds a rasterized thumbnail or heatmap per candidate — the wall
  rasterizes only the tiles currently on screen (virtualized), and the loupe zooms the vector directly.
- **Cancellation** — stop cancels queued jobs, sends `cancel` for in-flight ones, and the store snapshot restores the
  pre-search settings. Loading a new image or editing settings mid-search stops the search first.

### Cost model (why this is fast enough)

For a 1600 px color image, a full trace is typically hundreds of ms to a few seconds, dominated by k-means + segment

- trace. With affinity scheduling, curve-group candidates skip preprocess + palette entirely; scoring adds a few ms of
  rasterization (≤ 1024 px) plus a ~1–4 M-pixel ΔE pass in a fidelity worker. Ballpark for the default 40 iterations on
  4 workers: **tens of seconds, not minutes**, with the leaderboard improving live from the first round. The iteration
  estimate shown in the UI is computed from the baseline's measured `durationMs` and refined as real candidates land.

## Where the code lives

New package **`packages/tune` (`@trazor/tune`)** — the search itself is an algorithm, so it follows the repo split:
pure TypeScript, depends only on `@trazor/core`, no DOM, fully testable in Node with a fake evaluator. Exports
(authoritative signatures land in [`CONTRACTS.md`](CONTRACTS.md) with the implementation):

```ts
// Parameter space metadata (per mode, with cost groups and clamped ranges).
export const TUNABLE_PARAMS: readonly ParamSpec[]

export type ObjectiveId = 'fidelity' | 'simplicity' | 'fileSize' | 'colorEconomy' | 'cleanliness'
export type TuneWeights = Record<ObjectiveId, number>

export interface CandidateMetrics {
  meanDeltaE: number
  nodeCount: number
  pathCount: number
  byteLength: number
  colorCount: number
  warnings: VectorizeWarning[]
  durationMs: number
}
export interface TuneCandidate {
  id: number
  settings: VectorizeSettings
  origin: 'baseline' | 'assist' | 'profile' | 'sample' | 'step' | 'recombine' | 'restart'
  /** For 'step' candidates: the parameter this probe tweaks. */
  tweaked?: keyof VectorizeSettings
}
export interface ScoredCandidate extends TuneCandidate {
  metrics: CandidateMetrics
  utilities: Record<ObjectiveId, number>
  score: number
  rejected?: 'empty' | 'fidelity-floor'
}

export interface TuneOptions {
  weights: TuneWeights
  iterations: number
  seed: number
  roundSize: number
  free?: readonly (keyof VectorizeSettings)[] // defaults per the table above
  minFidelity?: number
}

export class TuneSearch {
  constructor(base: VectorizeSettings, opts: TuneOptions)
  /** Next deterministic batch; [] when the budget is spent or the search converged. */
  nextRound(): TuneCandidate[]
  /** Barrier: report the full round, in candidate-id order. */
  report(results: readonly ScoredCandidate[]): void
  best(): ScoredCandidate | null
  paretoFront(): readonly ScoredCandidate[]
  progress(): { evaluated: number; total: number; converged: boolean }
}

export function scoreCandidate(
  metrics: CandidateMetrics,
  baseline: CandidateMetrics,
  weights: TuneWeights,
): { score: number; utilities: Record<ObjectiveId, number> }
```

Supporting changes, each small and in its owner's package:

| Where                                   | Change                                                                                                                                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/engine/src/pool.ts`           | `TrazorPool` (queue, affinity, cancelAll) reusing the existing protocol + worker file                                                                                                                                  |
| `apps/web/src/worker/fidelity*`         | `set-reference` message, `heatmap: false` score mode, `FidelityPool` wrapper                                                                                                                                           |
| `apps/web/src/lib/tuner.ts`             | Orchestrator: rounds → pool → rasterize queue → fidelity → `report`; owns canvases and budgets                                                                                                                         |
| `apps/web/src/store/appStore.ts`        | Reactive tune state (running, progress, best, leaderboard, front, weights) + start/stop/apply/revert actions; the `Tuner` instance stays non-reactive like the other clients                                           |
| `apps/web/src/components/TunePanel.vue` | Priorities, iterations, advanced options, run progress, start/stop/apply/revert                                                                                                                                        |
| `apps/web/src/components/TuneWall.vue`  | The comparison wall: virtualized SVG tile grid + synchronized loupe, sort/Pareto filter, click-to-apply                                                                                                                |
| docs                                    | `CONTRACTS.md` (+`@trazor/tune`, `TrazorPool`), `ARCHITECTURE.md` map + dependency diagram, root `AGENTS.md` layout table, `REFERENCES.md` (pattern search: Hooke & Jeeves 1961; LHS: McKay et al. 1979), release note |

Dependency direction stays clean: `tune` depends on `core` only (it never traces — the app feeds it results), the app
wires `tune` + `engine` + fidelity together.

## Testing

- **`packages/tune`** (Node, fake evaluator):
  - determinism — same seed + same fake scores ⇒ identical candidate sequence and winner;
  - convergence — on synthetic landscapes (a quadratic bowl over two parameters; a discrete step function) the search
    finds the optimum within budget and stops early once steps floor out;
  - metadata sanity — every `ParamSpec` key exists in `DEFAULT_SETTINGS`, and `normalizeSettings` is a no-op on every
    generated candidate (ranges respect the clamps);
  - scoring — utility anchors, weight normalization, empty-result rejection, fidelity floor, Pareto maintenance;
  - dedup — a repeated candidate consumes no budget.
- **`packages/engine`** — `TrazorPool` under a fake worker scope (the protocol types already permit it): N concurrent
  jobs resolve independently, no cancel crosstalk, affinity prefers the warm worker, `cancelAll` rejects cleanly.
- **App** — fidelity protocol round-trip for score-only + shared-reference; store action tests where cheap.
- **e2e** — extend the real-browser smoke test: load a small sample, run a ~6-iteration search with fixed seed,
  assert it completes, the leaderboard is populated, and applying the winner re-traces to the promised node count.

## Milestones

| #         | Milestone                                                                                                                                                                                                                                                                                              | Effort | Risk |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ---- |
| **M1 ✅** | Core: `@trazor/tune` (params, scoring, search), `TrazorPool`, fidelity score-only path; dev-only trigger                                                                                                                                                                                               | M      | Low  |
| **M2 ✅** | Studio UI: panel, presets, progress, the comparison wall with synchronized loupe, apply/revert; i18n; release note                                                                                                                                                                                     | M      | Low  |
| **M3 ✅** | Sharper: multi-entry `StageCache` (palette LRU) with hit/miss stats, sensitivity-ranked probes, Pareto filter + two-up compare inspector on the wall                                                                                                                                                   | S–M    | Low  |
| **M4**    | Breadth: suggested fixed palettes as categorical candidates, structural opt-ins (curve mode / layering), constraint presets, draft-resolution pre-screen for very large images (successive halving with per-parameter px-scaling rules), optional Node CLI batch tuner on the `scripts/eval` substrate | M–L    | Med  |

M1 before M2 keeps the algorithm honest: the strategy must demonstrably beat random sampling on the same budget in
tests before it earns UI. The M4 CLI reuses the existing resvg-based eval harness, which would also let CI benchmark
the search itself against corpus images.

## Risks and mitigations

- **Local optima.** Coordinate descent stalls on ridges. Mitigated by the diverse seed round, recombination, seeded
  restarts on stagnation — and honestly bounded expectations: the goal is "clearly better than hand-tweaking in the
  same wall-clock time", not a proof of global optimality.
- **Main-thread rasterization pressure.** Many workers finishing at once could queue rasterizations. Bounded by the
  ≤ 1024 px score resolution, one-at-a-time queue with a reused canvas, and round barriers (bursts are round-sized).
- **Memory on huge images.** The pool caps its size by image area; the ledger keeps text/thumbnails only for top-K.
- **Objective gaming.** Empty results rejected; `detectIslands` held; simplicity anchored to the baseline so "delete
  everything" never wins while fidelity carries any weight.
- **Cross-browser score drift.** Disclosed above; the applied settings and their SVG remain byte-identical everywhere.
- **UI churn during a run.** The main preview only switches to a candidate on explicit user action (or once, to the
  winner, on completion) — no flashing through 40 intermediate results.

## Open questions

1. **Naming.** "Auto-optimize" (proposed, sits well next to the existing "Auto" recommendation) vs. "Brute force" as
   the user-facing label. The French label would be « Optimisation auto ».
2. **Default objective weights** for the presets, and whether _Cleanliness_ should default to weight 0 outside
   cut-oriented profiles.
3. Should the winner **auto-apply** on completion, or always wait for an explicit Apply? (Proposed: auto-apply with
   revert, since the user asked for the search.)
4. Is a **"try every mode"** variant (one search per mode, four winners presented) worth an M4 slot?
5. Does a **Node CLI batch tuner** have a real audience (regression benchmarks, corpus sweeps), or is M4's slot better
   spent on the draft-resolution pre-screen?
