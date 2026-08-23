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

These scripts are **not part of the JS build or CI** — they run only when you train. The weights are not committed to
git; you generate them here and publish them to the `models` GitHub Release, from which the deploy workflow fetches them
at build time (see [`apps/web/public/models/README.md`](../../apps/web/public/models/README.md)). For a purely local
try, dropping the `.onnx` into `apps/web/public/models/` also works — it's git-ignored.

## From scratch

You need three things on the machine, then one bootstrap command. Everything runs from the **repo root** and installs
nothing globally — the Python side lives entirely in a local `.venv`.

### Prerequisites (both platforms)

1. **Node 18+** and the repo's JS deps — the data step is `npm run dataset`:
   ```sh
   npm install
   ```
2. **Python 3.10+** — [python.org](https://www.python.org/downloads/) (on Windows, tick _“Add python.exe to PATH”_).
3. **For GPU training, an NVIDIA GPU + driver.** Install/refresh the driver from
   [nvidia.com/Download](https://www.nvidia.com/Download/index.aspx), then confirm the toolchain sees it:
   ```sh
   nvidia-smi          # prints your GPU + the max CUDA version the driver supports
   ```
   No GPU is fine — training falls back to CPU automatically (slower). You do **not** need the full CUDA Toolkit; the
   PyTorch CUDA wheel bundles what it needs.

### Bootstrap the Python env

One script creates `.venv` and installs PyTorch + the training deps into it.

```powershell
# Windows (PowerShell), from the repo root
.\scripts\train\setup.ps1 -Cuda cu124   # GPU: use the cuXXX tag ≤ the CUDA version nvidia-smi printed
.\scripts\train\setup.ps1               # CPU-only (omit -Cuda)
```

```sh
# Linux / macOS, from the repo root
sh scripts/train/setup.sh --cuda cu124   # pin a specific CUDA build (e.g. an older driver)
sh scripts/train/setup.sh                # default wheel: CUDA-enabled on Linux, CPU on macOS
```

Pick the `cuXXX` tag from <https://pytorch.org/get-started/locally/> (e.g. `cu121`, `cu124`) — it must be **≤** the CUDA
version `nvidia-smi` reported. The script prints `CUDA available: True` and your device name when the GPU is wired up
correctly; if it says `False` after a `-Cuda`/`--cuda` install, the tag is wrong for your driver — re-run with a lower one.

> **Windows execution-policy note:** the bootstrap calls the venv's Python directly, so it works as-is. Only _activating_
> the venv (`.\.venv\Scripts\Activate.ps1`) can hit _“running scripts is disabled on this system”_ — either run this once,
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or skip activation and call `.venv\Scripts\python.exe` directly
> (the commands below show both).

### Manual alternative

If you'd rather not use the bootstrap script:

```sh
python3 -m venv .venv && . .venv/bin/activate            # Windows: py -m venv .venv ; .\.venv\Scripts\Activate.ps1
pip install torch --index-url https://download.pytorch.org/whl/cu124   # GPU only; skip for CPU
pip install -r scripts/train/requirements.txt
```

## One command

First, on a new machine, run the **sanity check** — it exercises the whole chain (data-gen → train → ONNX export +
parity) with a tiny throwaway config in ~30s on CPU, writing to the gitignored `checkpoints/smoke/` dir, never the
shipped model. If it prints `smoke OK`, your toolchain works:

```sh
python scripts/train/pipeline.py --smoke                 # edge
python scripts/train/pipeline.py --task cleanup --smoke  # cleanup
```

Then the real run:

```sh
python scripts/train/pipeline.py --count 20000 --epochs 60 --quantize            # edge (default)
python scripts/train/pipeline.py --task cleanup --count 20000 --epochs 60 --quantize
```

This generates the dataset, trains, and writes `apps/web/public/models/<task>.onnx`. Add `--workers 8` to speed up
data loading (leave it at the default `0` if you hit a multiprocessing error on Windows). Reuse an existing dataset with
`--data dataset-out --skip-data` — the same set trains both tasks, so generate once and run the two commands with
`--skip-data`.

The examples assume the venv is activated. If you skipped activation (see the note above), just call the venv's Python:
`.venv/bin/python …` on Linux/macOS, `.venv\Scripts\python.exe …` on Windows.

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
| `setup.sh`         | bootstrap the `.venv` + deps (Linux / macOS), optional `--cuda cuXXX`                      |
| `setup.ps1`        | bootstrap the `.venv` + deps (Windows), optional `-Cuda cuXXX`                             |
| `pipeline.py`      | one-shot: data → train → export (cross-platform), `--task` aware                           |
| `dataset.py`       | reads the generator manifest; input normalization matches Edge/CleanupEnhancer exactly     |
| `model.py`         | `TinyUNet` (compact U-Net, `out_channels` per task) + the sigmoid export wrapper           |
| `losses.py`        | edge: class-balanced BCE (HED-style) + soft Dice · cleanup: L1 + (1−SSIM), `--ssim-weight` |
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

Train on both a **procedural** set (unlimited, exact labels — prevents overfitting) and a **real corpus** (icon sets,
brand marks, flags — realistic shapes). Fetch a ready-made real corpus with `npm run corpus`
([`../corpus`](../corpus/README.md)), then give `--data` several roots to concatenate:

```sh
npm run corpus                                                      # → corpus/ (icons, brands, flags)
npm run dataset -- --source dir --corpus corpus --count 20000 --out data/real
npm run dataset -- --source procedural --count 40000 --out data/proc
python scripts/train/train.py --data data/proc data/real --epochs 80 --workers 8
```

Rule of thumb: **~⅔ procedural + ~⅓ real**, adding more real as you collect it. Fonts are the easiest real source —
export glyphs to per-file SVGs. Splits are per source family in each root, so families never leak across train/val/test.

### The knobs

- **`--base-channels`** — model width, hence size and capacity. 16 is a good default. Bump to 24 if predictions look
  blurry or miss thin edges (and you have the data); drop to 8–12 if the ONNX must be tiny. Keep it **< 5 MB** with
  `--quantize`.
- **`--ssim-weight`** (cleanup only) — blends the loss `(1-w)·L1 + w·(1-SSIM)`, default `0.5`. Raise toward `0.7–0.8`
  for crisper structure/contrast (can slightly shift colors); drop toward `0` for pure L1 (most color-faithful). Ignored
  for the edge task.
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

`dataset.py` uses the same ImageNet mean/std as `packNchw` in `@trazor/ml`, input size is fixed at 256 (the app
tiles larger images at run time), and the export bakes in the sigmoid — so the browser sees exactly what you trained.
`export_onnx.py` asserts torch/onnxruntime parity before you ship.

Once `apps/web/public/models/<task>.onnx` exists, the matching class (`EdgeEnhancer` / `CleanupEnhancer`) loads it; until
then it fails soft and the app traces classically (or leaves the image untouched).
