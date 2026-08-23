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
