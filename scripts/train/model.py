"""Compact U-Net for the on-device pre-pass models.

Two tasks share this network, differing only in the head width:
- edge (docs/EDGE_PREPASS.md): 1 channel, a boundary probability map.
- cleanup (docs/CLEANUP_PREPASS.md): 3 channels, a denoised RGB image.

The network returns logits/pre-activations; training uses the matching loss.
The ONNX export wraps it with a Sigmoid so the shipped model outputs values in
[0, 1] — exactly what EdgeEnhancer / CleanupEnhancer (packages/ml/src) read back.
"""

from __future__ import annotations

import torch
from torch import nn


class DoubleConv(nn.Module):
    def __init__(self, in_ch: int, out_ch: int) -> None:
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.block(x)


class TinyUNet(nn.Module):
    """Three-level U-Net; `base` sets the channel width, hence the model size.

    `out_channels` is 1 for the edge task, 3 for the cleanup (RGB) task.
    """

    def __init__(self, base: int = 16, out_channels: int = 1) -> None:
        super().__init__()
        self.enc1 = DoubleConv(3, base)
        self.enc2 = DoubleConv(base, base * 2)
        self.pool = nn.MaxPool2d(2)
        self.bottleneck = DoubleConv(base * 2, base * 4)
        self.up2 = nn.ConvTranspose2d(base * 4, base * 2, 2, stride=2)
        self.dec2 = DoubleConv(base * 4, base * 2)
        self.up1 = nn.ConvTranspose2d(base * 2, base, 2, stride=2)
        self.dec1 = DoubleConv(base * 2, base)
        self.head = nn.Conv2d(base, out_channels, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        e1 = self.enc1(x)
        e2 = self.enc2(self.pool(e1))
        b = self.bottleneck(self.pool(e2))
        d2 = self.dec2(torch.cat([self.up2(b), e2], dim=1))
        d1 = self.dec1(torch.cat([self.up1(d2), e1], dim=1))
        return self.head(d1)  # [N, out_channels, H, W]


class SigmoidWrapper(nn.Module):
    """Model + Sigmoid, used only for ONNX export (ships probabilities)."""

    def __init__(self, model: nn.Module) -> None:
        super().__init__()
        self.model = model

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return torch.sigmoid(self.model(x))
