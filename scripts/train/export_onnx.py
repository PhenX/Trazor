"""Export a trained checkpoint to ONNX for the on-device pre-pass models.

Produces a fixed [1,3,size,size] → [1,C,size,size] sigmoid model (C=1 edge,
C=3 cleanup), verifies torch/onnxruntime parity, and (optionally) quantizes to
int8. Drop the result at apps/web/public/models/<name>.onnx to ship it
same-origin with the app:
- edge → edge-prepass.onnx   (EdgeEnhancer, packages/ml/src/edge.ts)
- cleanup → cleanup.onnx      (CleanupEnhancer, packages/ml/src/cleanup.ts)
- field → signed-field.onnx   (FieldEnhancer, packages/ml/src/field.ts)
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import torch

from model import SigmoidWrapper, TinyUNet

# Default ship path per task.
DEFAULT_OUT = {
    "edge": "apps/web/public/models/edge-prepass.onnx",
    "cleanup": "apps/web/public/models/cleanup.onnx",
    "field": "apps/web/public/models/signed-field.onnx",
}
DEFAULT_CHECKPOINT = {
    "edge": "scripts/train/checkpoints/edge-prepass.pt",
    "cleanup": "scripts/train/checkpoints/cleanup.pt",
    "field": "scripts/train/checkpoints/signed-field.pt",
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Export a pre-pass model to ONNX.")
    p.add_argument("--task", choices=sorted(DEFAULT_OUT), default="edge")
    p.add_argument("--checkpoint", default=None, help="default: per-task checkpoint")
    p.add_argument("--out", default=None, help="default: per-task ship path")
    p.add_argument("--opset", type=int, default=17)
    p.add_argument("--quantize", action="store_true", help="also emit an int8 .onnx (smaller)")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    checkpoint = args.checkpoint or DEFAULT_CHECKPOINT[args.task]
    out = Path(args.out or DEFAULT_OUT[args.task])

    ckpt = torch.load(checkpoint, map_location="cpu")
    size = ckpt["size"]
    out_channels = ckpt.get("out_channels", 1)  # older edge checkpoints predate this
    model = TinyUNet(ckpt["base_channels"], out_channels=out_channels)
    model.load_state_dict(ckpt["state_dict"])
    export_model = SigmoidWrapper(model).eval()

    out.parent.mkdir(parents=True, exist_ok=True)
    dummy = torch.zeros(1, 3, size, size)
    torch.onnx.export(
        export_model,
        dummy,
        str(out),
        input_names=[ckpt["input_name"]],
        output_names=[ckpt["output_name"]],
        opset_version=args.opset,
        do_constant_folding=True,
        # Legacy TorchScript exporter: the widest op coverage for onnxruntime-web,
        # and no onnxscript dependency (the newer dynamo path needs it).
        dynamo=False,
    )
    print(f"exported {out} ({out.stat().st_size / 1e6:.2f} MB)")

    # Parity: torch vs onnxruntime on a random input.
    import onnxruntime as ort

    rng = np.random.default_rng(0)
    sample = rng.standard_normal((1, 3, size, size)).astype(np.float32)
    with torch.no_grad():
        torch_out = export_model(torch.from_numpy(sample)).numpy()
    sess = ort.InferenceSession(str(out), providers=["CPUExecutionProvider"])
    onnx_out = sess.run(None, {ckpt["input_name"]: sample})[0]
    max_diff = float(np.abs(torch_out - onnx_out).max())
    print(f"parity max|torch-onnx| = {max_diff:.2e}")
    print(f"output shape {onnx_out.shape} range [{onnx_out.min():.3f}, {onnx_out.max():.3f}]")
    assert onnx_out.shape == (1, out_channels, size, size), "unexpected output shape"
    assert max_diff < 1e-3, "torch/onnx parity failed"

    if args.quantize:
        from onnxruntime.quantization import QuantType, quantize_dynamic

        q = out.with_name(f"{out.stem}.int8.onnx")
        quantize_dynamic(str(out), str(q), weight_type=QuantType.QInt8)
        print(f"quantized {q} ({q.stat().st_size / 1e6:.2f} MB)")

    print(f"OK — place the .onnx at {DEFAULT_OUT[args.task]} to ship it")


if __name__ == "__main__":
    main()
