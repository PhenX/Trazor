"""Train an on-device pre-pass model on the generator's dataset.

Two tasks (`--task`):
- edge (default): 1-channel boundary map → checkpoints/edge-prepass.pt
- cleanup: 3-channel denoised RGB → checkpoints/cleanup.pt

Auto-detects CUDA. Saves the best checkpoint (by val loss) and, beside it, a
`preview.png` montage (input · prediction · target) for eyeballing quality.
Early stops when val loss stops improving. See scripts/train/README.md.
"""

from __future__ import annotations

import argparse
from functools import partial
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torch.utils.data import DataLoader

from dataset import IMAGENET_MEAN, IMAGENET_STD, PrepassDataset
from losses import cleanup_loss, edge_loss, field_loss
from model import TinyUNet

# Per-task config: output channels, checkpoint name, and ONNX output tensor name.
TASKS = {
    "edge": {"out_channels": 1, "checkpoint": "edge-prepass.pt", "output_name": "edges"},
    "cleanup": {"out_channels": 3, "checkpoint": "cleanup.pt", "output_name": "output"},
    "field": {"out_channels": 1, "checkpoint": "signed-field.pt", "output_name": "field"},
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train an on-device pre-pass model.")
    p.add_argument("--task", choices=sorted(TASKS), default="edge", help="which model to train")
    # One or more dataset roots (npm run dataset outputs) — concatenated to mix.
    p.add_argument("--data", nargs="+", required=True, help="dataset root(s)")
    p.add_argument("--out", default="scripts/train/checkpoints")
    p.add_argument("--epochs", type=int, default=60)
    p.add_argument("--batch", type=int, default=32)
    p.add_argument("--lr", type=float, default=3e-4)
    p.add_argument("--size", type=int, default=256)
    p.add_argument("--base-channels", type=int, default=None, help="model width (default: 16 edge, 32 cleanup)")
    p.add_argument(
        "--ssim-weight",
        type=float,
        default=0.5,
        help="cleanup only: weight of the (1-SSIM) term vs L1, in [0,1] (0 = pure L1)",
    )
    # 0 avoids multiprocessing (safest on Windows); raise it (e.g. 8) for speed.
    p.add_argument("--workers", type=int, default=0)
    p.add_argument("--limit", type=int, default=0, help="cap train samples (smoke tests)")
    p.add_argument("--patience", type=int, default=10, help="early-stop after N stale epochs (0 = off)")
    p.add_argument("--device", default="auto", help="auto | cuda | cpu")
    p.add_argument("--seed", type=int, default=0)
    return p.parse_args()


def f_score(prob: torch.Tensor, target: torch.Tensor, thresh: float = 0.5, eps: float = 1e-6) -> float:
    pred = (prob > thresh).float()
    gt = (target > thresh).float()
    tp = (pred * gt).sum()
    prec = tp / (pred.sum() + eps)
    rec = tp / (gt.sum() + eps)
    return float(2 * prec * rec / (prec + rec + eps))


def psnr(prob: torch.Tensor, target: torch.Tensor, eps: float = 1e-8) -> float:
    mse = ((prob - target) ** 2).mean()
    return float(10.0 * torch.log10(1.0 / (mse + eps)))


def to_rgb(chw: np.ndarray) -> np.ndarray:
    """A [C,H,W] array in [0,1] → [H,W,3] uint8, tiling gray to RGB."""
    hwc = chw.transpose(1, 2, 0)
    if hwc.shape[2] == 1:
        hwc = np.repeat(hwc, 3, axis=2)
    return np.clip(hwc * 255, 0, 255).astype(np.uint8)


def save_preview(model: torch.nn.Module, ds: PrepassDataset, path: Path, device: str, n: int = 4) -> None:
    """Save an [input | prediction | target] montage for up to n val samples."""
    n = min(n, len(ds))
    if n == 0:
        return
    rows = []
    model.eval()
    with torch.no_grad():
        for i in range(n):
            x, y = ds[i]
            pred = torch.sigmoid(model(x.unsqueeze(0).to(device)))[0].cpu().numpy()
            rgb = np.clip((x.numpy().transpose(1, 2, 0) * IMAGENET_STD + IMAGENET_MEAN) * 255, 0, 255).astype(np.uint8)
            rows.append(np.concatenate([rgb, to_rgb(pred), to_rgb(y.numpy())], axis=1))
    Image.fromarray(np.concatenate(rows, axis=0)).save(path)


def main() -> None:
    args = parse_args()
    cfg = TASKS[args.task]
    if args.base_channels is None:
        # Restoration (cleanup) benefits from more width than the sparse edge task.
        args.base_channels = 32 if args.task == "cleanup" else 16
    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    device = ("cuda" if torch.cuda.is_available() else "cpu") if args.device == "auto" else args.device
    print(f"task: {args.task} | device: {device} | data: {', '.join(args.data)}")

    train_ds = PrepassDataset(args.data, "train", args.size, args.limit, task=args.task)
    val_ds = PrepassDataset(args.data, "val", args.size, task=args.task)
    print(f"train {len(train_ds)} | val {len(val_ds)}")
    if len(train_ds) == 0:
        raise SystemExit(f"no training samples for task {args.task!r} — run `npm run dataset` first")
    pin = device == "cuda"

    def loader(ds: PrepassDataset, shuffle: bool) -> DataLoader:
        return DataLoader(
            ds,
            batch_size=args.batch,
            shuffle=shuffle,
            num_workers=args.workers,
            pin_memory=pin,  # faster host→GPU copies
            persistent_workers=args.workers > 0 and len(ds) > 0,  # don't respawn each epoch
        )

    train_dl = loader(train_ds, True)
    val_dl = loader(val_ds, False)

    if args.task == "cleanup":
        loss_fn = partial(cleanup_loss, ssim_weight=args.ssim_weight)
    elif args.task == "field":
        loss_fn = field_loss
    else:
        loss_fn = edge_loss
    # Edge uses an ODS-like F-score; the soft-regression tasks (cleanup, field) use PSNR.
    metric_fn = f_score if args.task == "edge" else psnr
    metric_name = "F" if args.task == "edge" else "PSNR"

    model = TinyUNet(args.base_channels, out_channels=cfg["out_channels"]).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"model: TinyUNet(base={args.base_channels}, out={cfg['out_channels']}) — {n_params / 1e6:.2f}M params")
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=max(1, args.epochs))

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    best = float("inf")
    best_epoch = 0
    stale = 0
    for epoch in range(args.epochs):
        model.train()
        total = 0.0
        for x, y in train_dl:
            x, y = x.to(device, non_blocking=pin), y.to(device, non_blocking=pin)
            opt.zero_grad()
            loss = loss_fn(model(x), y)
            loss.backward()
            opt.step()
            total += loss.item() * x.size(0)
        sched.step()
        train_loss = total / len(train_ds)

        model.eval()
        v_loss = 0.0
        v_m = 0.0
        v_n = 0
        with torch.no_grad():
            for x, y in val_dl:
                x, y = x.to(device, non_blocking=pin), y.to(device, non_blocking=pin)
                logits = model(x)
                v_loss += loss_fn(logits, y).item() * x.size(0)
                v_m += metric_fn(torch.sigmoid(logits), y) * x.size(0)
                v_n += x.size(0)
        val_loss = v_loss / v_n if v_n else float("nan")
        val_m = v_m / v_n if v_n else float("nan")
        print(f"epoch {epoch + 1}/{args.epochs} | train {train_loss:.4f} | val {val_loss:.4f} | val {metric_name} {val_m:.3f}")

        score = val_loss if v_n else train_loss
        if score < best - 1e-5:
            best = score
            best_epoch = epoch + 1
            stale = 0
            torch.save(
                {
                    "state_dict": model.state_dict(),
                    "task": args.task,
                    "out_channels": cfg["out_channels"],
                    "base_channels": args.base_channels,
                    "size": args.size,
                    "mean": IMAGENET_MEAN.tolist(),
                    "std": IMAGENET_STD.tolist(),
                    "input_name": "input",
                    "output_name": cfg["output_name"],
                },
                out_dir / cfg["checkpoint"],
            )
            save_preview(model, val_ds if v_n else train_ds, out_dir / f"preview-{args.task}.png", device)
        else:
            stale += 1
            if args.patience > 0 and stale >= args.patience:
                print(f"early stop: no val improvement for {args.patience} epochs")
                break

    print(f"best {best:.4f} at epoch {best_epoch} → {out_dir / cfg['checkpoint']}")


if __name__ == "__main__":
    main()
