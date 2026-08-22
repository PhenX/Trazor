# Training the edge pre-pass model

Offline PyTorch training for the on-device edge pre-pass ([`../../docs/EDGE_PREPASS.md`](../../docs/EDGE_PREPASS.md)).
It reads the dataset from [`../dataset`](../dataset/README.md), trains a compact U-Net, and exports an ONNX model that
drops straight into the app at `apps/web/public/models/edge-prepass.onnx` (served same-origin — see
[`../../apps/web/public/models/README.md`](../../apps/web/public/models/README.md)).

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
python scripts/train/pipeline.py --count 20000 --epochs 40 --quantize
```

This generates the dataset, trains, and writes `apps/web/public/models/edge-prepass.onnx`. Add `--workers 8` to speed up
data loading (leave it at the default `0` if you hit a multiprocessing error on Windows). Reuse an existing dataset with
`--data dataset-out --skip-data`.

## Or step by step

```sh
# 1. data  (→ dataset-out/, see ../dataset/README.md)
npm run dataset -- --count 20000 --out dataset-out

# 2. train (auto-uses your GPU; best checkpoint → scripts/train/checkpoints/edge-prepass.pt)
python scripts/train/train.py --data dataset-out --epochs 40 --batch 32 --workers 8

# 3. export (→ apps/web/public/models/edge-prepass.onnx, with a torch/onnx parity check)
python scripts/train/export_onnx.py --quantize
```

## What each file does

| File               | Role                                                                           |
| ------------------ | ------------------------------------------------------------------------------ |
| `pipeline.py`      | one-shot: data → train → export (cross-platform)                               |
| `dataset.py`       | reads the generator manifest; input normalization matches EdgeEnhancer exactly |
| `model.py`         | `TinyUNet` (compact U-Net) + the sigmoid export wrapper                        |
| `losses.py`        | class-balanced BCE (HED-style) + soft Dice                                     |
| `train.py`         | training loop (AdamW + cosine), val F-score, best-checkpoint saving            |
| `export_onnx.py`   | ONNX export + torch/onnxruntime parity check + optional int8 quantization      |
| `requirements.txt` | Python deps                                                                    |

## Tuning

- **Model size / quality:** `--base-channels` (default 16). Smaller (8) → smaller file, less capacity; larger (24–32) →
  more capacity. Keep the exported file within the **< 5 MB** budget from the spec (use `--quantize`).
- **Data:** start with the procedural source for volume; add real SVGs via `npm run dataset -- --source dir --corpus
  <dir>` and regenerate. ~20k pairs to prototype, 50k–200k for production.
- **Input size** is fixed at 256 (matches EdgeEnhancer's model input); the app tiles larger images at run time.
- **Determinism:** `dataset.py` uses the same ImageNet mean/std as `packNchw` in `@vectorizer/ml`, and the export bakes
  in the sigmoid, so the browser sees exactly what you trained. Verify before shipping — `export_onnx.py` asserts
  torch/onnxruntime parity.

Once `apps/web/public/models/edge-prepass.onnx` exists, `EdgeEnhancer.create()` will load it; until then it fails soft
and the app traces classically.
