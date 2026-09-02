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
```

Stage columns are the engine's own `stats.stages` (`preprocess`, `palette`, `segment`, `trace`, `svg`), in ms.

## Warm cache (`--tweak`)

What the studio does when a curve slider moves: the worker keeps a `StageCache` across runs, so only the stages the
changed setting actually invalidates re-run. Each image is traced cold once (seeding the cache), then again with
`smoothing` nudged by 0.1 on that same cache — the printed stage times and `warm` total are that second run, next to the
`cold` total for reference. The tweaked settings are then traced a third time on a **fresh** cache: the two SVG hashes
must be equal, so the row ends in `ok` (a differing hash prints `MISMATCH` and the run exits non-zero). The closing
`warm reuse` line counts which entries were hit — preprocess, palette, decomposed rings, ink mask.

## CPU profile

`tsx` runs the script in a child process, so pass the profiler flags to the process that runs the engine:

```sh
node --cpu-prof --cpu-prof-dir=prof --import tsx scripts/bench/trace-bench.ts --data <dir>
node scripts/bench/cpu-summary.mjs prof/*.cpuprofile --top 30
```

`cpu-summary.mjs` prints self time per source file and per function, heaviest first. (Line-level attribution is
not available through `tsx`: the transpiled module is a single line.) `prof/` is git-ignored; delete it between runs.

Related: `scripts/eval/README.md` (quality evaluation; `npm run eval:ab` is the verdict for any quality change).
