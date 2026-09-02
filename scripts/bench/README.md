# Performance bench

Per-stage wall-clock timing of the engine over a folder of images, plus a short hash of each SVG so a performance
change can prove it is **byte-identical** (same hashes before and after) in the same run that shows the speedup.
Real images only — the representative corpus (`node scripts/eval/fetch-vtracer-samples.mjs` writes
`scripts/eval/corpus-vtracer`) or any folder passed with `--data`.

```sh
npm run bench                                                   # auto settings, 1600 px, corpus-vtracer
npm run bench -- --profile logo --set layering=cutout --repeat 3 # force a routing; keep the fastest of 3
npm run bench -- --data <dir> --max-dim 4096                     # a large-image run
```

Stage columns are the engine's own `stats.stages` (`preprocess`, `palette`, `segment`, `trace`, `svg`), in ms.

## CPU profile

`tsx` runs the script in a child process, so pass the profiler flags to the process that runs the engine:

```sh
node --cpu-prof --cpu-prof-dir=prof --import tsx scripts/bench/trace-bench.ts --data <dir>
node scripts/bench/cpu-summary.mjs prof/*.cpuprofile --top 30
```

`cpu-summary.mjs` prints self time per source file and per function, heaviest first. (Line-level attribution is
not available through `tsx`: the transpiled module is a single line.) `prof/` is git-ignored; delete it between runs.

Related: `scripts/eval/README.md` (quality evaluation; `npm run eval:ab` is the verdict for any quality change).
