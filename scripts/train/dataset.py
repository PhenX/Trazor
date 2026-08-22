"""Torch dataset over the generator's output (scripts/dataset).

Reads one or more `manifest.json` roots and yields (input, target) tensors for a
split, concatenated — so a procedural set and a real-corpus set can be mixed in
one training run (`--data proc real`). The input normalization matches
EdgeEnhancer / CleanupEnhancer / packNchw (packages/ml/src/imageops.ts) exactly,
so a model trained here behaves the same in the browser.

Two tasks:
- edge: target is the 1-channel boundary map (`edge` field), [0,1].
- cleanup: target is the 3-channel clean render (`clean` field), [0,1] RGB.
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

# Manifest field carrying each task's ground-truth image.
TARGET_FIELD = {"edge": "edge", "cleanup": "clean"}


class PrepassDataset(Dataset):
    def __init__(
        self,
        roots: str | Path | list[str | Path],
        split: str,
        size: int = 256,
        limit: int = 0,
        task: str = "edge",
    ) -> None:
        if task not in TARGET_FIELD:
            raise ValueError(f"unknown task {task!r} (expected one of {sorted(TARGET_FIELD)})")
        if isinstance(roots, (str, Path)):
            roots = [roots]
        self.size = size
        self.task = task
        self.field = TARGET_FIELD[task]
        # Each sample remembers its own root so paths resolve across mixed sets.
        self.samples: list[tuple[Path, dict]] = []
        for r in roots:
            root = Path(r)
            manifest = json.loads((root / "manifest.json").read_text())
            for s in manifest["samples"]:
                if s["split"] == split and s.get(self.field):
                    self.samples.append((root, s))
        if limit > 0:
            self.samples = self.samples[:limit]

    def __len__(self) -> int:
        return len(self.samples)

    def _load_rgb(self, root: Path, rel: str) -> np.ndarray:
        img = Image.open(root / rel).convert("RGB")
        if img.size != (self.size, self.size):
            img = img.resize((self.size, self.size), Image.BILINEAR)
        x = np.asarray(img, dtype=np.float32) / 255.0
        x = (x - IMAGENET_MEAN) / IMAGENET_STD
        return np.ascontiguousarray(x.transpose(2, 0, 1))  # CHW

    def _load_target(self, root: Path, rel: str) -> np.ndarray:
        if self.task == "cleanup":
            # Clean RGB target in [0,1], no ImageNet normalization (the model's
            # sigmoid output lives in [0,1]).
            img = Image.open(root / rel).convert("RGB")
            if img.size != (self.size, self.size):
                img = img.resize((self.size, self.size), Image.BILINEAR)
            y = np.asarray(img, dtype=np.float32) / 255.0
            return np.ascontiguousarray(y.transpose(2, 0, 1))  # 3HW
        img = Image.open(root / rel).convert("L")
        if img.size != (self.size, self.size):
            img = img.resize((self.size, self.size), Image.BILINEAR)
        y = np.asarray(img, dtype=np.float32) / 255.0
        return y[None, ...]  # 1HW

    def __getitem__(self, i: int) -> tuple[torch.Tensor, torch.Tensor]:
        root, s = self.samples[i]
        return (
            torch.from_numpy(self._load_rgb(root, s["input"])),
            torch.from_numpy(self._load_target(root, s[self.field])),
        )


# Back-compat alias (the edge task's original name).
EdgeDataset = PrepassDataset
