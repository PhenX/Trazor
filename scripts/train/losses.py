"""Losses for the on-device pre-pass models.

- edge: class-balanced BCE (HED-style) + soft Dice. Boundary pixels are sparse
  (the generator's own samples run ~5-8% edge pixels), so plain BCE collapses to
  predicting "no edge". HED's beta weighting rebalances positives against
  negatives; the Dice term further counters the imbalance. Both operate on the
  soft [0,1] target the generator produces.
- cleanup: L1 + (1 - SSIM) on the sigmoid'd RGB output vs the clean [0,1] target.
  L1 (over L2) keeps edges crisp and colors accurate; the SSIM term is a perceptual
  measure of local structure/contrast that L1 alone misses, so the two together
  clean up more faithfully for a tracer input. SSIM is a self-contained,
  differentiable window statistic (no extra weights, unlike a VGG/LPIPS term).
"""

from __future__ import annotations

import torch
import torch.nn.functional as F


def edge_loss(logits: torch.Tensor, target: torch.Tensor, edge_thresh: float = 0.1) -> torch.Tensor:
    prob = torch.sigmoid(logits)
    edge = (target > edge_thresh).float()
    n = edge.numel()
    n_pos = edge.sum().clamp(min=1.0)
    beta = 1.0 - n_pos / n  # fraction of non-edge pixels
    weight = edge * beta + (1.0 - edge) * (1.0 - beta)
    bce = F.binary_cross_entropy_with_logits(logits, target, weight=weight)

    inter = (prob * target).sum()
    dice = 1.0 - (2.0 * inter + 1.0) / (prob.sum() + target.sum() + 1.0)
    return bce + dice


def _gaussian_window(
    channels: int, size: int, sigma: float, device: torch.device, dtype: torch.dtype
) -> torch.Tensor:
    """Normalized 2D Gaussian kernel as depthwise conv weights `[C, 1, size, size]`."""
    coords = torch.arange(size, device=device, dtype=dtype) - (size - 1) / 2.0
    g = torch.exp(-(coords**2) / (2.0 * sigma**2))
    g = g / g.sum()
    kernel = (g[:, None] * g[None, :])  # [size, size]
    return kernel.expand(channels, 1, size, size).contiguous()


def ssim(x: torch.Tensor, y: torch.Tensor, window_size: int = 11, sigma: float = 1.5) -> torch.Tensor:
    """Mean SSIM for images in [0,1], shape [N, C, H, W]. Differentiable.

    Standard Wang et al. (2004) windowed SSIM with a Gaussian window applied
    depthwise per channel. Returns a scalar in (0, 1]; 1.0 when x == y.
    """
    channels = x.shape[1]
    win = _gaussian_window(channels, window_size, sigma, x.device, x.dtype)
    pad = window_size // 2

    def filt(t: torch.Tensor) -> torch.Tensor:
        return F.conv2d(t, win, padding=pad, groups=channels)

    mu_x, mu_y = filt(x), filt(y)
    mu_x2, mu_y2, mu_xy = mu_x * mu_x, mu_y * mu_y, mu_x * mu_y
    sigma_x2 = filt(x * x) - mu_x2
    sigma_y2 = filt(y * y) - mu_y2
    sigma_xy = filt(x * y) - mu_xy
    c1, c2 = 0.01**2, 0.03**2
    ssim_map = ((2 * mu_xy + c1) * (2 * sigma_xy + c2)) / (
        (mu_x2 + mu_y2 + c1) * (sigma_x2 + sigma_y2 + c2)
    )
    return ssim_map.mean()


def cleanup_loss(
    logits: torch.Tensor, target: torch.Tensor, ssim_weight: float = 0.5
) -> torch.Tensor:
    """Mixed L1 + (1 - SSIM), blended by `ssim_weight` in [0, 1] (0 = pure L1)."""
    prob = torch.sigmoid(logits)
    l1 = F.l1_loss(prob, target)
    dssim = 1.0 - ssim(prob, target)
    return (1.0 - ssim_weight) * l1 + ssim_weight * dssim


def field_loss(logits: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
    """Coverage-field loss: L1 + a small (1 - SSIM) on the sigmoid'd field vs the
    clean [0,1] coverage target. The anti-aliased boundary values are what feed the
    tracer's sub-pixel refinement, so local structure (SSIM) matters alongside
    absolute accuracy (L1). Single-channel; `ssim` handles the channel count."""
    prob = torch.sigmoid(logits)
    return F.l1_loss(prob, target) + 0.25 * (1.0 - ssim(prob, target))
