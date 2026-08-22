"""Losses for the on-device pre-pass models.

- edge: class-balanced BCE (HED-style) + soft Dice. Boundary pixels are sparse
  (the generator's own samples run ~5-8% edge pixels), so plain BCE collapses to
  predicting "no edge". HED's beta weighting rebalances positives against
  negatives; the Dice term further counters the imbalance. Both operate on the
  soft [0,1] target the generator produces.
- cleanup: L1 on the sigmoid'd RGB output vs the clean [0,1] target. L1 (over L2)
  keeps edges crisp instead of blurring them, which matters for a tracer input.
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


def cleanup_loss(logits: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
    return F.l1_loss(torch.sigmoid(logits), target)
