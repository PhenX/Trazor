"""Train the edge pre-pass model on the generator's dataset.

Auto-detects CUDA. Saves the best checkpoint (by val loss) to
`scripts/train/checkpoints/edge-prepass.pt`. See scripts/train/README.md.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

from dataset import IMAGENET_MEAN, IMAGENET_STD, EdgeDataset
from losses import edge_loss
from model import TinyUNet


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train the edge pre-pass model.")
    p.add_argument("--data", required=True, help="dataset root (npm run dataset output)")
    p.add_argument("--out", default="scripts/train/checkpoints")
    p.add_argument("--epochs", type=int, default=30)
    p.add_argument("--batch", type=int, default=32)
    p.add_argument("--lr", type=float, default=3e-4)
    p.add_argument("--size", type=int, default=256)
    p.add_argument("--base-channels", type=int, default=16)
    # 0 avoids multiprocessing (safest on Windows); raise it (e.g. 8) for speed.
    p.add_argument("--workers", type=int, default=0)
    p.add_argument("--limit", type=int, default=0, help="cap train samples (smoke tests)")
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


def main() -> None:
    args = parse_args()
    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    device = ("cuda" if torch.cuda.is_available() else "cpu") if args.device == "auto" else args.device
    print(f"device: {device}")

    train_ds = EdgeDataset(args.data, "train", args.size, args.limit)
    val_ds = EdgeDataset(args.data, "val", args.size)
    print(f"train {len(train_ds)} | val {len(val_ds)}")
    if len(train_ds) == 0:
        raise SystemExit("no training samples — run `npm run dataset` first")
    train_dl = DataLoader(train_ds, batch_size=args.batch, shuffle=True, num_workers=args.workers)
    val_dl = DataLoader(val_ds, batch_size=args.batch, shuffle=False, num_workers=args.workers)

    model = TinyUNet(args.base_channels).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"model: TinyUNet(base={args.base_channels}) — {n_params / 1e6:.2f}M params")
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=max(1, args.epochs))

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    best = float("inf")
    for epoch in range(args.epochs):
        model.train()
        total = 0.0
        for x, y in train_dl:
            x, y = x.to(device), y.to(device)
            opt.zero_grad()
            loss = edge_loss(model(x), y)
            loss.backward()
            opt.step()
            total += loss.item() * x.size(0)
        sched.step()
        train_loss = total / len(train_ds)

        model.eval()
        v_loss = 0.0
        v_f = 0.0
        v_n = 0
        with torch.no_grad():
            for x, y in val_dl:
                x, y = x.to(device), y.to(device)
                logits = model(x)
                v_loss += edge_loss(logits, y).item() * x.size(0)
                v_f += f_score(torch.sigmoid(logits), y) * x.size(0)
                v_n += x.size(0)
        val_loss = v_loss / v_n if v_n else float("nan")
        val_f = v_f / v_n if v_n else float("nan")
        print(f"epoch {epoch + 1}/{args.epochs} | train {train_loss:.4f} | val {val_loss:.4f} | val F {val_f:.3f}")

        score = val_loss if v_n else train_loss
        if score < best:
            best = score
            torch.save(
                {
                    "state_dict": model.state_dict(),
                    "base_channels": args.base_channels,
                    "size": args.size,
                    "mean": IMAGENET_MEAN.tolist(),
                    "std": IMAGENET_STD.tolist(),
                    "input_name": "input",
                    "output_name": "edges",
                },
                out_dir / "edge-prepass.pt",
            )
    print(f"best {best:.4f} → {out_dir / 'edge-prepass.pt'}")


if __name__ == "__main__":
    main()
