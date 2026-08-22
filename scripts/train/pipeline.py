"""One-shot: generate dataset -> train -> export the edge pre-pass ONNX.

Cross-platform (Windows / macOS / Linux). Each step is also runnable on its own
(see scripts/train/README.md). Examples:

    python scripts/train/pipeline.py --count 20000 --epochs 40 --quantize
    python scripts/train/pipeline.py --data dataset-out --skip-data --epochs 40
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent


def run(cmd: list[str] | str, shell: bool = False) -> None:
    print(f"\n$ {cmd if isinstance(cmd, str) else ' '.join(cmd)}\n", flush=True)
    subprocess.run(cmd, cwd=REPO_ROOT, shell=shell, check=True)


def require_deps() -> None:
    """Fail early with an actionable message when the Python deps are missing.

    The subprocess steps use this same interpreter (sys.executable), so checking
    here catches a mis-set venv before any work runs. A CUDA torch wheel does not
    always pull numpy, so a torch-only install can still be missing packages.
    """
    missing = []
    for mod, pkg in (("numpy", "numpy"), ("PIL", "pillow"), ("onnx", "onnx"), ("onnxruntime", "onnxruntime")):
        try:
            __import__(mod)
        except ImportError:
            missing.append(pkg)
    if missing:
        raise SystemExit(
            f"missing Python deps: {', '.join(missing)}\n"
            "activate your venv, then install them:\n"
            "  pip install -r scripts/train/requirements.txt\n"
            f"(this interpreter: {sys.executable})"
        )


def main() -> None:
    require_deps()
    p = argparse.ArgumentParser(description="Generate data, train, and export the edge pre-pass model.")
    p.add_argument("--count", type=int, default=20000, help="samples to generate")
    p.add_argument("--data", default="dataset-out")
    p.add_argument("--epochs", type=int, default=60)
    p.add_argument("--batch", type=int, default=32)
    p.add_argument("--base-channels", type=int, default=16, help="model width / size")
    p.add_argument("--patience", type=int, default=10, help="early-stop after N stale epochs (0 = off)")
    p.add_argument("--workers", type=int, default=0, help="dataloader workers (raise for speed)")
    p.add_argument("--jobs", type=int, default=0, help="dataset generator threads (0 = CPU count)")
    p.add_argument("--out", default="apps/web/public/models/edge-prepass.onnx")
    p.add_argument("--skip-data", action="store_true", help="reuse an existing --data dir")
    p.add_argument("--quantize", action="store_true")
    args = p.parse_args()

    if args.skip_data:
        print(f"skipping data generation, using {args.data}")
    else:
        # npm is a shell command on Windows (npm.cmd); shell=True keeps it portable.
        run(f'npm run dataset -- --count {args.count} --jobs {args.jobs} --out "{args.data}"', shell=True)

    run([
        sys.executable, str(HERE / "train.py"),
        "--data", args.data, "--epochs", str(args.epochs),
        "--batch", str(args.batch), "--base-channels", str(args.base_channels),
        "--patience", str(args.patience), "--workers", str(args.workers),
    ])

    export = [sys.executable, str(HERE / "export_onnx.py"), "--out", args.out]
    if args.quantize:
        export.append("--quantize")
    run(export)

    print(f"\ndone -> {args.out} (ships same-origin with the app)")


if __name__ == "__main__":
    main()
