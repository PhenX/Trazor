# Performance bench

Per-stage wall-clock timing of the engine over a folder of images, plus a short hash of each SVG so a performance
change can prove it is **byte-identical** (same hashes before and after) in the same run that shows the speedup.
Real images only — the representative corpus (`node scripts/eval/fetch-vtracer-samples.mjs` writes
`scripts/eval/corpus-vtracer`) or any folder passed with `--data`.

```sh
npm run bench                                                   # auto settings, 1600 px, corpus-vtracer
npm run bench -- --profile logo --set layering=cutout --repeat 3 # force a routing; keep the fastest of 3
npm run bench -- --data <dir> --max-dim 4096                     # a large-image run
npm run bench -- --tweak --max-dim 4096                          # warm-cache timing for a curve-slider tweak
npm run bench -- --workers 3                                     # trace across 3 helper threads
```

Stage columns are the engine's own `stats.stages` (`preprocess`, `palette`, `segment`, `trace`, `svg`), in ms.

## Warm cache (`--tweak`)

What the studio does when a curve slider moves: the worker keeps a `StageCache` across runs, so only the stages the
changed setting actually invalidates re-run. Each image is traced cold once (seeding the cache), then again with
`smoothing` nudged by 0.1 on that same cache — the printed stage times and `warm` total are that second run, next to the
`cold` total for reference. The tweaked settings are then traced a third time on a **fresh** cache: the two SVG hashes
must be equal, so the row ends in `ok` (a differing hash prints `MISMATCH` and the run exits non-zero). The closing
`warm reuse` line counts which entries were hit — preprocess, palette, the stacked layering plan, decomposed rings,
adjusted polygons, ink mask.

## Helper threads (`--workers N`)

`--workers N` (default 0 = sequential) attaches a `HelperPool` of N Node `worker_threads` helpers to every run, so the
engine traces and serializes in parallel: one unit per stacked layer, per bw shape, or per cutout boundary chain
(`ARCHITECTURE.md` § Parallel tracing). Each helper is a thread running `helper-entry.mjs` — which registers `tsx` for
its own thread, since the packages export TypeScript source and a worker does not inherit the parent's loader hooks —
reached through one end of a `MessageChannel`; `node-helpers.ts` builds them and is reused by the engine's
parallel-path tests. The pool is created once and spans every image, and the run waits for the threads to finish
loading before timing anything, so the first image does not pay for module compilation.

Results are placed by unit index, so **the SVG hashes must be identical with and without `--workers`** — that is the
check to run for any change to the parallel path:

```sh
npm run bench -- --max-dim 4096 --limit 4                        # sequential hashes
npm run bench -- --max-dim 4096 --limit 4 --workers 3            # must print the same hashes
npm run bench -- --tweak --workers 3                             # every row must end in `ok`
```

Two things to read differently under `--workers`: the `svg` column drops to the document assembly alone (folding,
grouping, `<defs>`, warnings) because the per-shape half moved into the helpers and now shows up inside `trace`; and
the closing `warm reuse` line counts only what the **coordinator** cached — the per-layer rings and their polygons live
in the helper that owns each unit, so `polygons` reads 0 and `rings` counts only the bw ring decomposition (`stack`,
the stacked layering plan, is the coordinator's share for stacked and reads normally).

Each helper holds its own copy of the working image and label map, so a large image costs memory per thread — see the
memory note on `HelperPool` in `packages/engine/src/helper-pool.ts`.

## CPU profile

`tsx` runs the script in a child process, so pass the profiler flags to the process that runs the engine:

```sh
node --cpu-prof --cpu-prof-dir=prof --import tsx scripts/bench/trace-bench.ts --data <dir>
node scripts/bench/cpu-summary.mjs prof/*.cpuprofile --top 30
```

`cpu-summary.mjs` prints self time per source file and per function, heaviest first. (Line-level attribution is
not available through `tsx`: the transpiled module is a single line.) `prof/` is git-ignored; delete it between runs.

Related: `scripts/eval/README.md` (quality evaluation; `npm run eval:ab` is the verdict for any quality change).

---

# Tune bench (`bench:tune`)

`tune-bench.ts` drives `@trazor/tune`'s `TuneSearch` in Node exactly as the studio does — each candidate traced through
`@trazor/engine`, rasterized with resvg, scored, and fed back — over the representative corpus. It is the measurement
backbone for the settings-search **efficiency** question: does the search reach its final score with fewer candidates,
and does narrowing the parameter space help? Deterministic and seeded; only wall-clock varies between runs.

```sh
npm run bench:tune                                  # corpus-vtracer, 512 px, current search
npm run bench:tune -- --variant pin-inert           # the space-narrowing variant
npm run bench:tune -- --repeats 3                    # repeated seeds → the noise band
npm run bench:tune -- --sensitivity                  # objective main-effect table instead
npm run bench:tune -- --data <dir> --limit 2 --json out.json
```

**Weights.** `@trazor/tune` ships no default weight set, so the bench states the one it uses: **balanced** — every
objective weighted 1 (fidelity, simplicity, file size, color economy, cleanliness), the studio's balanced preset. Search
budget is 40 candidates, round size `2 × --concurrency` (the studio's `roundSize = 2 × workers`), `DEFAULT_FREE`, with
the assist recommendation as the base and the assist palette suggestions as categorical seeds (color mode).

Per image it records the **score-vs-candidates curve** (the best winnable score after each candidate, in evaluation
order), its final score, that winner's ΔE / node count / gzipped bytes, the **candidates to reach 95 %** of the final
score, the area under the normalized curve (how front-loaded), and wall-clock. `summarizeCurve` and the ANOVA helper are
pure and unit-tested (`tune-bench-lib.test.ts`).

## Objective sensitivity (`--sensitivity`)

A main-effect study on the **objective**, not only on ΔE: for each mode it Latin-hypercube-samples `DEFAULT_FREE`,
traces each point, scores it against the mode base, and reports the fraction of each objective's variance one axis
explains (one-way ANOVA over binned levels), averaged over the corpus. The measured leader per mode (balanced weights,
512 px, 48 samples/image), variance of the combined score explained:

| mode  | dominant axis   | SCORE var. | also dominates                                       |
| ----- | --------------- | ---------: | ---------------------------------------------------- |
| color | `paletteSize`   |      ~55 % | colorEconomy ~57 %, fileSize ~39 %, simplicity ~34 % |
| bw    | `thresholdMode` |       ~4 % | simplicity ~31 %, fileSize ~26 %                     |

Every other color axis explains under 4 % of the score. Crucially — and this is the trap the space-narrowing work has to
respect — the **fidelity-inert** axes are not objective-inert: `smoothing` moves simplicity (~3 %) and `curveOptimize`
moves file size (~2 %), so they cannot simply be dropped. (This is a sensitivity on the combined objective over the
corpus forced into each mode; it is not the closed study's ΔE-only main effect, and differs from it for exactly that
reason — the fidelity utility saturates on these clean illustrations, so paletteSize reads far lower on **fidelity** here
than the 58 % it explained of raw ΔE.)

## The space-narrowing experiments (measured negative)

Two variants were measured against the current search at equal budget (40 candidates), over the corpus at 512 px, three
seeds each. The **noise band** is the mean per-image standard deviation of the final score across the three seeds:
**±0.004** for the current search — the final score is highly reproducible even across seeds, so a regression beyond
~0.008 is real.

| variant   | mean final | Δ vs current | mean candidates-to-95 % | verdict                                                |
| --------- | ---------: | -----------: | ----------------------: | ------------------------------------------------------ |
| current   |      0.779 |            — |                    12.1 | baseline                                               |
| pin-inert |      0.779 |       −0.000 |                    11.9 | final score held (within noise); **no** efficiency win |
| staged    |      0.739 |       −0.039 |                     7.1 | reaches 95 % sooner but of a far worse final; rejected |

- **staged** (converge the high-sensitivity axes first, then sweep the tail once — behind a `TuneOptions.staged` flag
  while measured) reaches 95 % of its final in ~7 candidates, but that final is 0.039 lower than the current search and
  regresses five of six images (vectorstock −0.114, Gum Tree −0.053) with a doubled gzipped size. Front-loading the
  dominant fidelity/palette axis **starves the file-size and simplicity levers**, so the balanced objective drops — the
  exact trap the sensitivity table warns about. The flag was not shipped.
- **pin-inert** pins the two fidelity-inert axes (`curveOptimize` on, `smoothing` 0.75) to their objective-good value and
  drops them from the free set. The final score is held within noise on every image, but candidates-to-95 % does not move
  (11.9 vs 12.1): removing two low-sensitivity dimensions frees negligible budget, because the sensitivity-ranked descent
  already spends its budget on the dominant `paletteSize` axis.
- **seed reweighting** toward the high-sensitivity axes was not run: it faces the same objective-balance failure as
  staged (over-sampling `paletteSize` under-samples the file-size/simplicity dimensions in the seed round), so it is
  unpromising by the same evidence.

**Conclusion.** No variant reaches the same final score with fewer candidates. The current search is already efficient on
the balanced objective — its adaptive descent is seeded from per-parameter sensitivity, so it already concentrates budget
on `paletteSize`; the narrowable axes are the low-sensitivity ones, and removing them neither helps (they cost almost
nothing to search) nor is safe to pin blindly (they carry the file-size/simplicity trade-off). Nothing shipped; the bench
and the sensitivity table are the deliverable.
