# ΔE-through-tracer evaluation

The metric that actually ships. The trainer selects checkpoints on a proxy (edge BCE/Dice, cleanup PSNR), but what matters
is the **fidelity of the traced output** — so this harness traces held-out samples through `@trazor/engine` **with and
without** the pre-pass, rasterizes each SVG with resvg over white, and reports mean **Oklab ΔE** against the clean
ground-truth render (the same metric as [`apps/web/src/lib/fidelity.ts`](../../apps/web/src/lib/fidelity.ts)).

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
reports, per family, the same **Oklab ΔE** fidelity metric plus node count, byte size, and wall-clock time.

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

| flag        | default                  | meaning                                                             |
| ----------- | ------------------------ | ------------------------------------------------------------------- |
| `--data`    | `scripts/eval/corpus`    | folder of PNG/JPEG images (+ optional `families.json` tags)         |
| `--max-dim` | `1600`                   | resize inputs to this longest side before tracing both (0 = native) |
| `--out`     | `eval-artifacts/tracers` | where per-tracer SVGs and the montage are written                   |
| `--vtracer` | `VTRACER_BIN` / PATH     | path to the vtracer binary                                          |
| `--profile` | per-family               | force one Trazor profile for every image                            |
| `--limit`   | `0` (all)                | cap images                                                          |
| `--montage` | off                      | also write `index.html`: source \| Trazor \| VTracer                |
| `--json`    | —                        | also write the report as JSON                                       |

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
