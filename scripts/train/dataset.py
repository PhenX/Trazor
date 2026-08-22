"""Torch dataset over the generator's output (scripts/dataset).

Reads `manifest.json` and yields (input, edge-target) tensors for one split. The
input normalization matches EdgeEnhancer / packNchw (packages/ml/src/imageops.ts)
exactly — same ImageNet mean/std on [0,1] RGB — so a model trained here behaves
the same way in the browser.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torch.utils.data import Dataset

# Must match packNchw in packages/ml/src/imageops.ts.
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


class EdgeDataset(Dataset):
    def __init__(self, root: str | Path, split: str, size: int = 256, limit: int = 0) -> None:
        self.root = Path(root)
        manifest = json.loads((self.root / "manifest.json").read_text())
        samples = [s for s in manifest["samples"] if s["split"] == split and s.get("edge")]
        self.samples = samples[:limit] if limit > 0 else samples
        self.size = size

    def __len__(self) -> int:
        return len(self.samples)

    def _load_rgb(self, rel: str) -> np.ndarray:
        img = Image.open(self.root / rel).convert("RGB")
        if img.size != (self.size, self.size):
            img = img.resize((self.size, self.size), Image.BILINEAR)
        x = np.asarray(img, dtype=np.float32) / 255.0
        x = (x - IMAGENET_MEAN) / IMAGENET_STD
        return np.ascontiguousarray(x.transpose(2, 0, 1))  # CHW

    def _load_edge(self, rel: str) -> np.ndarray:
        img = Image.open(self.root / rel).convert("L")
        if img.size != (self.size, self.size):
            img = img.resize((self.size, self.size), Image.BILINEAR)
        y = np.asarray(img, dtype=np.float32) / 255.0
        return y[None, ...]  # 1HW

    def __getitem__(self, i: int) -> tuple[torch.Tensor, torch.Tensor]:
        s = self.samples[i]
        return torch.from_numpy(self._load_rgb(s["input"])), torch.from_numpy(self._load_edge(s["edge"]))
