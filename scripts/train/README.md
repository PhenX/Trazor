# Training the on-device pre-pass models

Offline PyTorch training for the app's on-device pre-pass models. It reads the dataset from
[`../dataset`](../dataset/README.md), trains a compact U-Net, and exports an ONNX model that drops straight into the app
under `apps/web/public/models/` (served same-origin — see
[`../../apps/web/public/models/README.md`](../../apps/web/public/models/README.md)).

Two tasks share this scaffold, selected with `--task` (one generated dataset trains either — it carries both targets):

| `--task`         | predicts               | target  | ships as            | spec                                                  |
| ---------------- | ---------------------- | ------- | ------------------- | ----------------------------------------------------- |
| `edge` (default) | boundary map (1-ch)    | `edge`  | `edge-prepass.onnx` | [`EDGE_PREPASS.md`](../../docs/EDGE_PREPASS.md)       |
| `cleanup`        | clean RGB image (3-ch) | `clean` | `cleanup.onnx`      | [`CLEANUP_PREPASS.md`](../../docs/CLEANUP_PREPASS.md) |

These scripts are **not part of the JS build or CI** — they run only when you train. The weights are not committed;
you generate them here and drop the `.onnx` in place.

## Setup (Windows / macOS / Linux)

From the repo root. First make sure the JS deps are installed (`npm install`) — the data step uses `npm run dataset`.

Create and activate a virtualenv:

```powershell
# Windows (PowerShell)
py -m venv .venv
.\.venv\Scripts\Activate.ps1
```

```sh
# macOS / Linux
python3 -m venv .venv
source .venv/bin/activate
```

Install PyTorch for your GPU, then the rest. Pick the CUDA build that matches your driver from
<https://pytorch.org/get-started/locally/> — for example:

```sh
pip install torch --index-url https://download.pytorch.org/whl/cu124
pip install -r scripts/train/requirements.txt
```

(No GPU? Just `pip install -r scripts/train/requirements.txt` — it works on CPU, only slower. The scripts auto-detect
CUDA and use it when present.)

## One command

```sh
python scripts/train/pipeline.py --count 20000 --epochs 60 --quantize            # edge (default)
python scripts/train/pipeline.py --task cleanup --count 20000 --epochs 60 --quantize
```

This generates the dataset, trains, and writes `apps/web/public/models/<task>.onnx`. Add `--workers 8` to speed up
data loading (leave it at the default `0` if you hit a multiprocessing error on Windows). Reuse an existing dataset with
`--data dataset-out --skip-data` — the same set trains both tasks, so generate once and run the two commands with
`--skip-data`.

## Or step by step

```sh
# 1. data  (→ dataset-out/, see ../dataset/README.md; carries both edge + clean targets)
npm run dataset -- --count 20000 --out dataset-out

# 2. train (auto-uses your GPU; --data accepts several roots to mix; best → scripts/train/checkpoints/)
python scripts/train/train.py --task edge --data dataset-out --epochs 80 --batch 32 --workers 8

# 3. export (→ apps/web/public/models/<task>.onnx, with a torch/onnx parity check)
python scripts/train/export_onnx.py --task edge --quantize
```

For the cleanup model, pass `--task cleanup` to steps 2 and 3 (reusing the same `dataset-out`).

## What each file does

| File               | Role                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `pipeline.py`      | one-shot: data → train → export (cross-platform), `--task` aware                           |
| `dataset.py`       | reads the generator manifest; input normalization matches Edge/CleanupEnhancer exactly     |
| `model.py`         | `TinyUNet` (compact U-Net, `out_channels` per task) + the sigmoid export wrapper           |
| `losses.py`        | edge: class-balanced BCE (HED-style) + soft Dice · cleanup: L1                             |
| `train.py`         | training loop (AdamW + cosine), val F-score / PSNR, early stopping, preview montage        |
| `export_onnx.py`   | ONNX export + torch/onnxruntime parity check + optional int8 quantization (`--task` aware) |
| `requirements.txt` | Python deps                                                                                |

## Recipes & tuning

Start here, then adjust from what you see. Sizes are pairs (per `--count`).

| Goal                       | count    | base-channels | epochs (with `--patience 10`) | batch |
| -------------------------- | -------- | ------------- | ----------------------------- | ----- |
| Prototype (does it learn?) | 5k–20k   | 16            | 60                            | 32    |
| Production                 | 50k–200k | 16–24         | 80                            | 32–64 |
| Tiny file                  | 50k+     | 8–12          | 80                            | 32    |

### Data mix (the highest-leverage knob)

Train on both a **procedural** set (unlimited, exact labels — prevents overfitting) and a **real corpus** (fonts, icon
sets — realistic shapes). `--data` takes several roots and concatenates them:

```sh
npm run dataset -- --source procedural --count 40000 --out data/proc
npm run dataset -- --source dir --corpus /path/to/svgs --count 20000 --out data/real
python scripts/train/train.py --data data/proc data/real --epochs 80 --workers 8
```

Rule of thumb: **~⅔ procedural + ~⅓ real**, adding more real as you collect it. Fonts are the easiest real source —
export glyphs to per-file SVGs. Splits are per source family in each root, so families never leak across train/val/test.

### The knobs

- **`--base-channels`** — model width, hence size and capacity. 16 is a good default. Bump to 24 if predictions look
  blurry or miss thin edges (and you have the data); drop to 8–12 if the ONNX must be tiny. Keep it **< 5 MB** with
  `--quantize`.
- **Epochs / early stopping** — don't hand-tune epochs: set a generous `--epochs 80` and let `--patience 10` stop when
  val loss plateaus. `--patience 0` disables it.
- **`--batch` / `--lr`** — batch as large as your VRAM allows (32–64); keep `--lr 3e-4` (AdamW). Doubling the batch, you
  can raise lr ~1.4×.
- **Parallelism / hardware** — the model math runs on your GPU automatically (or across all CPU cores via PyTorch's
  intra-op threads if there's no GPU). `--workers N` parallelizes CPU-side data loading (PNG decode + normalize) to keep
  the GPU fed — set it near your core count; it defaults to `0` (safe on Windows), and `pin_memory` / `persistent_workers`
  enable automatically. The dataset-generation step is separately multithreaded (`npm run dataset -- --jobs N`, default:
  CPU count).
- **Domain gap (the usual culprit)** — if the model scores well on val but poorly in the app on real photos, the fix is
  usually _more degradation_, not a bigger model: raise `noiseStdMax` / `blurSigmaMax` and lower `jpegQuality.min` in
  [`../dataset/config.mjs`](../dataset/README.md) and regenerate.

### Reading the run

- **train / val loss** should fall then plateau; the val proxy metric rises — **val F** (an ODS-like edge F-score) for
  `edge`, **val PSNR** (dB) for `cleanup`.
- **`checkpoints/preview-<task>.png`** is written on every improvement — columns are **input · prediction · target** for
  a few val samples. Smeared predictions → add capacity or data; missed faint boundaries → increase contrast/degradation
  variety in the data.
- **The real metric is the app's Oklab ΔE.** Once the ONNX is in place, use the tool it feeds (**Edge pre-pass** toggle,
  or **Clean up (ML)** button) on a few noisy inputs and compare ΔE / node count against off — that, not the val proxy,
  is what ships.

### Determinism

`dataset.py` uses the same ImageNet mean/std as `packNchw` in `@vectorizer/ml`, input size is fixed at 256 (the app
tiles larger images at run time), and the export bakes in the sigmoid — so the browser sees exactly what you trained.
`export_onnx.py` asserts torch/onnxruntime parity before you ship.

Once `apps/web/public/models/<task>.onnx` exists, the matching class (`EdgeEnhancer` / `CleanupEnhancer`) loads it; until
then it fails soft and the app traces classically (or leaves the image untouched).
