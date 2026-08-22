"""Train the edge pre-pass model on the generator's dataset.

Auto-detects CUDA. Saves the best checkpoint (by val loss) to
`scripts/train/checkpoints/edge-prepass.pt` and, beside it, a `preview.png`
montage (input · prediction · target) for eyeballing quality. Early stops when
val loss stops improving. See scripts/train/README.md.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torch.utils.data import DataLoader

from dataset import IMAGENET_MEAN, IMAGENET_STD, EdgeDataset
from losses import edge_loss
from model import TinyUNet


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train the edge pre-pass model.")
    # One or more dataset roots (npm run dataset outputs) — concatenated to mix.
    p.add_argument("--data", nargs="+", required=True, help="dataset root(s)")
    p.add_argument("--out", default="scripts/train/checkpoints")
    p.add_argument("--epochs", type=int, default=60)
    p.add_argument("--batch", type=int, default=32)
    p.add_argument("--lr", type=float, default=3e-4)
    p.add_argument("--size", type=int, default=256)
    p.add_argument("--base-channels", type=int, default=16)
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


def save_preview(model: torch.nn.Module, ds: EdgeDataset, path: Path, device: str, n: int = 4) -> None:
    """Save an [input | prediction | target] montage for up to n val samples."""
    n = min(n, len(ds))
    if n == 0:
        return
    rows = []
    model.eval()
    with torch.no_grad():
        for i in range(n):
            x, y = ds[i]
            prob = torch.sigmoid(model(x.unsqueeze(0).to(device)))[0, 0].cpu().numpy()
            rgb = np.clip((x.numpy().transpose(1, 2, 0) * IMAGENET_STD + IMAGENET_MEAN) * 255, 0, 255)
            pred = np.clip(prob * 255, 0, 255)
            tgt = np.clip(y[0].numpy() * 255, 0, 255)
            gray3 = lambda g: np.stack([g, g, g], axis=-1)  # noqa: E731
            rows.append(np.concatenate([rgb, gray3(pred), gray3(tgt)], axis=1).astype(np.uint8))
    Image.fromarray(np.concatenate(rows, axis=0)).save(path)


def main() -> None:
    args = parse_args()
    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    device = ("cuda" if torch.cuda.is_available() else "cpu") if args.device == "auto" else args.device
    print(f"device: {device} | data: {', '.join(args.data)}")

    train_ds = EdgeDataset(args.data, "train", args.size, args.limit)
    val_ds = EdgeDataset(args.data, "val", args.size)
    print(f"train {len(train_ds)} | val {len(val_ds)}")
    if len(train_ds) == 0:
        raise SystemExit("no training samples — run `npm run dataset` first")
    pin = device == "cuda"

    def loader(ds: EdgeDataset, shuffle: bool) -> DataLoader:
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

    model = TinyUNet(args.base_channels).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"model: TinyUNet(base={args.base_channels}) — {n_params / 1e6:.2f}M params")
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
                x, y = x.to(device, non_blocking=pin), y.to(device, non_blocking=pin)
                logits = model(x)
                v_loss += edge_loss(logits, y).item() * x.size(0)
                v_f += f_score(torch.sigmoid(logits), y) * x.size(0)
                v_n += x.size(0)
        val_loss = v_loss / v_n if v_n else float("nan")
        val_f = v_f / v_n if v_n else float("nan")
        print(f"epoch {epoch + 1}/{args.epochs} | train {train_loss:.4f} | val {val_loss:.4f} | val F {val_f:.3f}")

        score = val_loss if v_n else train_loss
        if score < best - 1e-5:
            best = score
            best_epoch = epoch + 1
            stale = 0
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
            save_preview(model, val_ds if v_n else train_ds, out_dir / "preview.png", device)
        else:
            stale += 1
            if args.patience > 0 and stale >= args.patience:
                print(f"early stop: no val improvement for {args.patience} epochs")
                break

    print(f"best {best:.4f} at epoch {best_epoch} → {out_dir / 'edge-prepass.pt'}")


if __name__ == "__main__":
    main()
