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
