# ΔE-through-tracer evaluation

The metric that actually ships. The trainer selects checkpoints on a proxy (edge BCE/Dice, cleanup PSNR), but what matters
is the **fidelity of the traced output** — so this harness traces held-out samples through `@trazor/engine` **with and
without** the pre-pass, rasterizes each SVG with resvg over white, and reports mean **Oklab ΔE** against the clean
ground-truth render (the same metric as the studio's fidelity metric).

Two buckets:

- **degraded** — trace the degraded `input/`. Does the pre-pass recover the true scene better? (ΔΔE > 0 = yes.)
- **clean** — trace the clean `clean/` render. **Do no harm**: a pre-pass that regresses already-clean inputs is a net
  loss. Only reported when clean predictions are present (`predict.py --also-clean`).

This is [`ML_ROADMAP.md`](../../docs/ML_ROADMAP.md) item 1 — the measurement backbone for items 2–6.

## Run it

Two steps: predict (Python, needs the trained checkpoint), then evaluate (Node).

```sh
# 1. write predictions for a split → eval-pred/(degraded|clean)/<field>/<base>.png
python scripts/train/predict.py --task edge --data dataset-out --split test \
    --checkpoint scripts/train/checkpoints/edge-prepass.pt --out eval-pred --also-clean

# 2. trace baseline vs pre-pass and report ΔE
npm run eval:prepass -- --data dataset-out --pred eval-pred --split test --task edge --json eval-report.json
```

For `cleanup`, pass `--task cleanup` to both (predictions are cleaned RGB images the tracer runs on directly).

### Options (`trace-eval.ts`)

| flag      | default          | meaning                                                |
| --------- | ---------------- | ------------------------------------------------------ |
| `--data`  | (required)       | dataset root (`manifest.json` + `input/ clean/ edge/`) |
| `--pred`  | (required)       | predictions dir from `predict.py`                      |
| `--task`  | `edge`           | `edge` (boundary hint) or `cleanup` (cleaned image)    |
| `--split` | `test`           | `train` \| `val` \| `test`                             |
| `--mode`  | settings default | `color` \| `grayscale` \| `bw` \| `centerline`         |
| `--limit` | `0` (all)        | cap samples                                            |
| `--json`  | —                | also write the report as JSON                          |

## Reading the output

```
task=edge  mode=color

    bucket  n  ΔE off   ΔE on      ΔΔE  score off  score on  nodes off  nodes on
  degraded  8  0.0202   0.0181  +0.0021      0.919     0.928      19046     15220
     clean  8  0.0039   0.0039  +0.0000      0.985     0.985        996       996
```

- **ΔE off / on** — mean Oklab ΔE to the clean ground truth, without / with the pre-pass (lower is better).
- **ΔΔE** — `off − on`; **positive means the pre-pass helps**.
- **score** — the app's `1 − 4·ΔE` fidelity score.
- **nodes** — mean node count (a pre-pass that keeps detail without raising ΔE, at fewer nodes, is a clear win).
- A **clean-input regression** (clean-bucket ΔE rising) is flagged explicitly — pick the checkpoint that wins on
  degraded **without** regressing clean.

## Validate the harness with no trained model

The whole pipeline (trace → rasterize → ΔE → buckets) runs without any weights by using the dataset's own `edge/` target
as a **perfect stand-in prediction**:

```sh
npm run dataset -- --count 60 --out /tmp/ds
node -e '
const fs=require("fs"),p=require("path");
const [ds,pred]=process.argv.slice(1);
const m=JSON.parse(fs.readFileSync(p.join(ds,"manifest.json"),"utf8"));
for(const s of m.samples){ if(s.split!=="train"||!s.edge) continue;
  const base=p.basename(s.input,".png");
  for(const b of ["degraded","clean"]){ const d=p.join(pred,b,"edge"); fs.mkdirSync(d,{recursive:true});
    fs.copyFileSync(p.join(ds,s.edge), p.join(d,base+".png")); } }
' /tmp/ds /tmp/pred
npm run eval:prepass -- --data /tmp/ds --pred /tmp/pred --split train --limit 8
```

A perfect (clean) hint over a noisy input protects real detail but also preserves noise-driven regions, so it is a
useful sanity check, not a target — a trained model predicts a sparser, denoised hint.

---

# Trazor vs. VTracer (tracer comparison)

`tracer-compare.ts` measures Trazor against [VTracer](https://github.com/visioncortex/vtracer) — the fast O(n) color
tracer — so "is VTracer actually better, and where?" becomes a number per image **family** instead of a vibe. It traces
each corpus image through `@trazor/engine` **and** the `vtracer` CLI, rasterizes both SVGs with resvg over white, and
reports, per family, mean **ΔE**, a **banding-aware** edge-zone ΔE, a p95 worst-tail, a **spurious-hue** score — each
traced pixel's ΔE to the nearest source color in a local window, so a hue the trace invented at a seam (a wrong-colored
band) scores high even though it sits near a real rim mixture and plain ΔE forgives it — the **key-color ΔE** and the
**boundary F-score** (below), plus node count, byte size, and wall-clock time. It's the one axis where VTracer's
spatially-coherent clustering beats Trazor's global k-means on color content.

Every ΔE is measured in **toe-Oklab** — Oklab with the lightness toe (`lightnessToe`, `@trazor/core`). Plain Oklab
spreads the darkest colors so far apart that sRGB (0,0,0) and (6,6,6) sit as far apart as a real hue change: the
compression noise inside a black outline, and a trace that paints that outline black, would count as color errors on a
par with a wrong hue. The studio's on-screen fidelity score uses the same space.

### The two flat-art indicators

The pixel-weighted mean forgives exactly what a viewer notices first on a cartoon: a small region painted the wrong
color, and an outline that breaks up. Two indicators, both in `lib.ts`, charge those directly:

- **Key-color ΔE** (`key ΔE`, `lost`). The reference's key colors are the distinct colors of its flat regions of
  meaningful area (flat pixels — gradient under 0.02, eroded by one pixel — grouped into 4-connected components,
  components closer than 0.05 merged into one color, a color qualifying with at least `max(24, 0.01 %)` of the pixels).
  Each key color is scored as the mean ΔE between the render and that color over the color's own flat pixels, and
  the colors are averaged **with one vote each**: a bow tie's orange dropped from the palette costs as much as the
  backdrop would. `lost` counts the key colors rendered more than 0.08 from themselves.
- **Boundary F-score** (`bf`, `bf P`, `bf R`; Csurka, Larlus & Perronnin 2013). Both images are reduced to
  one-pixel-wide edge maps (forward-difference gradient, non-maximum suppression along the dominant axis, threshold
  0.06) and matched within one pixel. **Precision** falls when the render draws edges the reference lacks — a
  fragmented outline, a rim band, speckle; **recall** falls when the render lost edges the reference has — a
  merged-away detail, a thin line. `bf` is their harmonic mean.

A corpus may carry a **clean reference** for an image: `<data>/clean/<name>.png`, the artwork before compression
(a PNG render of the vector original, say), with the identical size as the input. The image is traced as it is and
scored against the reference, so a trace is rewarded for recovering the artwork rather than its artifacts; the table
marks such rows with `*`.

It's also the regression harness for the two follow-on ideas: a fast greedy curve back-end and gradient-aware
segmentation. Re-run it after either and watch the photo/gradient gap close **without** regressing the flat / line-art
buckets.

## Run it

```sh
cargo install vtracer          # once — or set VTRACER_BIN / pass --vtracer <bin>
npm run eval:corpus            # write the built-in corpus → scripts/eval/corpus
npm run eval:tracers -- --montage --json eval-artifacts/tracers/report.json
```

Or run it on VTracer's **own** showcase images — the fairest test, on its home turf:

```sh
npm run eval:samples   # fetch vtracer/docs/assets/samples → scripts/eval/corpus-vtracer
npm run eval:tracers -- --data scripts/eval/corpus-vtracer --montage
```

VTracer is **optional**: with no binary found the harness reports Trazor alone and says so. By default Trazor traces each
image with its **own auto-recommended settings** (`@trazor/assist` — what the app applies on load, tuned to balance
accuracy and size), and vtracer gets the flags a user would pick for the same goal (`--preset photo`, `--colormode bw`,
`--mode pixel`, …) — tool-vs-tool, not one hobbled against the other. Pass `--profile <id>` to force one Trazor profile
for every image instead.

### Options (`tracer-compare.ts`)

| flag        | default                  | meaning                                                              |
| ----------- | ------------------------ | -------------------------------------------------------------------- |
| `--data`    | `scripts/eval/corpus`    | folder of PNG/JPEG images (+ optional `families.json` tags)          |
| `--max-dim` | `1600`                   | resize inputs to this longest side before tracing both (0 = native)  |
| `--out`     | `eval-artifacts/tracers` | where per-tracer SVGs and the montage are written                    |
| `--vtracer` | `VTRACER_BIN` / PATH     | path to the vtracer binary                                           |
| `--profile` | auto                     | force one Trazor profile for all (else each image's auto settings)   |
| `--set k=v` | —                        | override a Trazor setting for every image (repeatable) for ablations |
| `--limit`   | `0` (all)                | cap images                                                           |
| `--montage` | off                      | also write `index.html`: source \| Trazor \| VTracer                 |
| `--json`    | —                        | also write the report as JSON                                        |

## A/B verdict — `eval:ab`

`tracer-compare` measures one build; **`eval:ab` decides whether a change is an improvement.** It traces the same
corpus through the engine twice — once on your **working tree**, once on **HEAD** (your edits stashed away) — and prints
an explicit **PASS / MIXED / FAIL** so a quality change never ships on a diluted whole-image mean while a localized
metric regresses. It is the guardrail for any color / palette / segmentation change ([`../../AGENTS.md`](../../AGENTS.md)
→ _Evaluating quality changes_).

```sh
# make your edit, then:
npm run eval:ab                                   # auto settings over corpus-vtracer
npm run eval:ab -- --sweep 6,8,12                 # sweep paletteSize (shorthand)
npm run eval:ab -- --sweep segmentation=quantize,regions   # sweep any setting, verdict per value
npm run eval:ab -- --set segmentation=quantize    # force the quantize path (palette changes)
npm run eval:ab -- --data <dir> --profile illustration
```

The verdict prints **per image** (biggest ΔE move first, so a lone regression stands out), then per
family, then overall — no hand-diffing two runs to find which image moved. The metrics that decide it are the
four that matter most: **mean ΔE, spurious hue, key-color ΔE** (lower is better) and the **boundary F-score**
(higher is better); a report written before a metric existed reads as unchanged on it. `--sweep <key>=<v1,v2,…>`
re-runs the whole A/B at each value of any setting and prints one verdict per value; a bare `--sweep
6,8,12` is shorthand for `paletteSize`. To sweep a tunable that is a code constant rather than a
setting, either thread it through `VectorizeSettings` while prototyping (then `--sweep` reaches it) or
edit the constant and re-run `eval:ab` once per value.

It requires uncommitted changes (the candidate) to compare against HEAD (the baseline); because the packages export TS
source with no build step, stashing the source and re-running is a true baseline. The verdict rests on the four primary metrics —
**mean ΔE, spurious hue, key-color ΔE and the boundary F-score** — judged per family and overall:

- **PASS** — a primary metric improved and **no** family regressed. Ships.
- **FAIL** — a primary metric regressed overall, or on two-plus families. Does **not** ship.
- **MIXED** — a genuine trade-off (some families win, some lose). A human weighs it.

`ab-report.ts` is the pure verdict engine (unit-tested in `ab-report.test.ts`) and also runs standalone on any two
`--json` reports, however they were produced — the way to A/B two commits rather than working-tree-vs-HEAD:

```sh
git checkout main    && npm run eval:tracers -- --data scripts/eval/corpus-vtracer --json base.json
git checkout mybranch && npm run eval:tracers -- --data scripts/eval/corpus-vtracer --json cand.json
tsx scripts/eval/ab-report.ts base.json cand.json
```

## The corpus

`make-corpus.mjs` (`npm run eval:corpus`) writes a small, deterministic, **browser-free** image set spanning the families
where the two tracers trade places (`badge`/`peaks` flat, `bloom` illustration, `ink` line-art, `sprite` pixel, `sunset`
photo/gradient) plus a `families.json` tag map. It's git-ignored and reproducible — never committed.

> **It is a signal generator, not a benchmark of record.** The built-in images are _synthetic and clean_, so they
> under-represent VTracer's real strength: actual photographs with fine texture and hundreds of colors, where Trazor's
> fixed-palette quantization bands. For a trustworthy verdict, point `--data` at a folder of **real photos** (any PNGs;
> add a `families.json` to tag them). Read ΔE next to node count and bytes, not alone — higher fidelity bought with far
> more nodes is a different trade than a genuine win.

## VTracer's own samples

`npm run eval:samples` (`fetch-vtracer-samples.mjs`) downloads VTracer's showcase images (its `docs/assets/samples`, via
the jsDelivr CDN — the GitHub API and tarball are commonly gated) into a git-ignored `scripts/eval/corpus-vtracer/` with
best-effort family tags, so the comparison runs on the very inputs VTracer is demoed on. They are third-party images
(some are stock art), fetched on demand for local benchmarking only and never committed.

Large inputs are resized to `--max-dim` (default 1600) before tracing **both** tools — VTracer has no downscale of its
own and takes minutes on a 24 MP photo, so this keeps the comparison fair and completable. The montage (`--montage`)
writes `index.html` next to the assets it references: `source/` (the resized input both tracers saw), `trazor/` and
`vtracer/` (each tracer's SVG). The page itself shows fast, uncropped PNG thumbnails; open the on-disk SVGs to inspect
the real vector output.
