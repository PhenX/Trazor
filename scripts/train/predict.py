"""Run a trained checkpoint over a dataset split and write predictions for the
ΔE-through-tracer eval (scripts/eval/trace-eval.ts, docs/ML_ROADMAP.md item 1).

Predictions are laid out exactly as the harness reads them:

    <out>/<bucket>/<field>/<base>.png

- bucket  = `degraded` (model run on the degraded `input/`) or, with --also-clean,
  `clean` (model run on the clean `clean/` render — the do-no-harm check).
- field   = `edge` (1-channel [0,1] boundary hint) or `clean` (3-channel RGB),
  matching --task.
- base    = the input file's basename.

Input normalization matches dataset.py / packNchw exactly, so predictions here
behave like the browser's EdgeEnhancer / CleanupEnhancer. Then, e.g.:

    python scripts/train/predict.py --task edge --data dataset-out --split test \
        --checkpoint scripts/train/checkpoints/edge-prepass.pt --out eval-pred --also-clean
    npm run eval:prepass -- --data dataset-out --pred eval-pred --split test
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch
from PIL import Image

from dataset import IMAGENET_MEAN, IMAGENET_STD
from model import TinyUNet

# Per-task output field (the prediction subdir + how many channels the head has).
FIELD = {"edge": "edge", "cleanup": "clean", "field": "field"}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Write pre-pass predictions for the trace eval.")
    p.add_argument("--task", choices=sorted(FIELD), default="edge")
    p.add_argument("--data", required=True, help="dataset root (manifest.json + input/ clean/)")
    p.add_argument("--split", default="test", help="train | val | test")
    p.add_argument("--checkpoint", default=None, help="default: per-task checkpoint")
    p.add_argument("--out", required=True, help="predictions output root")
    p.add_argument("--also-clean", action="store_true", help="also predict on clean/ (do-no-harm bucket)")
    p.add_argument("--limit", type=int, default=0, help="cap samples (0 = all)")
    p.add_argument("--device", default="auto", help="auto | cuda | cpu")
    return p.parse_args()


def load_model(checkpoint: str, device: str) -> tuple[TinyUNet, int, int]:
    ckpt = torch.load(checkpoint, map_location=device)
    out_channels = ckpt.get("out_channels", 1)
    size = ckpt["size"]
    model = TinyUNet(ckpt["base_channels"], out_channels=out_channels).to(device)
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    return model, size, out_channels


def load_input(path: Path, size: int) -> torch.Tensor:
    """Load an RGB image as a normalized [1,3,size,size] tensor (matches dataset.py)."""
    img = Image.open(path).convert("RGB")
    if img.size != (size, size):
        img = img.resize((size, size), Image.BILINEAR)
    x = np.asarray(img, dtype=np.float32) / 255.0
    x = (x - IMAGENET_MEAN) / IMAGENET_STD
    chw = np.ascontiguousarray(x.transpose(2, 0, 1))
    return torch.from_numpy(chw).unsqueeze(0)


def save_prediction(prob: np.ndarray, path: Path) -> None:
    """Write a [C,H,W] prediction in [0,1] as a gray (C=1) or RGB (C=3) PNG."""
    path.parent.mkdir(parents=True, exist_ok=True)
    arr = np.clip(prob * 255.0, 0, 255).astype(np.uint8)
    if arr.shape[0] == 1:
        Image.fromarray(arr[0], mode="L").save(path)
    else:
        Image.fromarray(arr.transpose(1, 2, 0), mode="RGB").save(path)


def main() -> None:
    args = parse_args()
    device = ("cuda" if torch.cuda.is_available() else "cpu") if args.device == "auto" else args.device
    ckpt_name = {"edge": "edge-prepass", "cleanup": "cleanup", "field": "signed-field"}[args.task]
    checkpoint = args.checkpoint or f"scripts/train/checkpoints/{ckpt_name}.pt"
    if not Path(checkpoint).exists():
        raise SystemExit(f"checkpoint not found: {checkpoint} — train first (scripts/train/pipeline.py)")

    model, size, _ = load_model(checkpoint, device)
    field = FIELD[args.task]
    root = Path(args.data)
    manifest = json.loads((root / "manifest.json").read_text())
    samples = [s for s in manifest["samples"] if s["split"] == args.split]
    if args.limit > 0:
        samples = samples[: args.limit]
    if not samples:
        raise SystemExit(f"no samples in split {args.split!r} of {root}")

    # (source field in the manifest, output bucket) pairs to predict.
    sources = [("input", "degraded")]
    if args.also_clean:
        sources.append(("clean", "clean"))

    out = Path(args.out)
    written = 0
    with torch.no_grad():
        for s in samples:
            base = Path(s["input"]).stem
            for src_field, bucket in sources:
                rel = s.get(src_field)
                if not rel:
                    continue
                x = load_input(root / rel, size).to(device)
                prob = torch.sigmoid(model(x))[0].cpu().numpy()  # [C,H,W] in [0,1]
                save_prediction(prob, out / bucket / field / f"{base}.png")
                written += 1

    print(f"wrote {written} prediction(s) for {len(samples)} sample(s) → {out}/(degraded|clean)/{field}/")
    print(f"next: npm run eval:prepass -- --data {args.data} --pred {args.out} --split {args.split} --task {args.task}")


if __name__ == "__main__":
    main()
