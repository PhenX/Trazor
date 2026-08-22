"""One-shot: generate dataset -> train -> export a pre-pass ONNX.

Cross-platform (Windows / macOS / Linux). Each step is also runnable on its own
(see scripts/train/README.md). Examples:

    python scripts/train/pipeline.py --count 20000 --epochs 40 --quantize
    python scripts/train/pipeline.py --data dataset-out --skip-data --epochs 40
    python scripts/train/pipeline.py --task cleanup --count 20000 --quantize
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


# Default ship path per task (mirrors export_onnx.DEFAULT_OUT).
DEFAULT_OUT = {
    "edge": "apps/web/public/models/edge-prepass.onnx",
    "cleanup": "apps/web/public/models/cleanup.onnx",
}


def main() -> None:
    require_deps()
    p = argparse.ArgumentParser(description="Generate data, train, and export a pre-pass model.")
    p.add_argument("--task", choices=sorted(DEFAULT_OUT), default="edge", help="edge or cleanup")
    p.add_argument("--count", type=int, default=20000, help="samples to generate")
    p.add_argument("--data", default="dataset-out")
    p.add_argument("--epochs", type=int, default=60)
    p.add_argument("--batch", type=int, default=32)
    p.add_argument("--base-channels", type=int, default=16, help="model width / size")
    p.add_argument("--patience", type=int, default=10, help="early-stop after N stale epochs (0 = off)")
    p.add_argument("--workers", type=int, default=0, help="dataloader workers (raise for speed)")
    p.add_argument("--jobs", type=int, default=0, help="dataset generator threads (0 = CPU count)")
    p.add_argument("--out", default=None, help="ONNX ship path (default: per-task)")
    p.add_argument("--skip-data", action="store_true", help="reuse an existing --data dir")
    p.add_argument("--quantize", action="store_true")
    args = p.parse_args()
    out = args.out or DEFAULT_OUT[args.task]

    if args.skip_data:
        print(f"skipping data generation, using {args.data}")
    else:
        # The dataset carries both targets (edge + clean), so one generated set
        # trains either task. npm is npm.cmd on Windows; shell=True keeps it portable.
        run(f'npm run dataset -- --count {args.count} --jobs {args.jobs} --out "{args.data}"', shell=True)

    run([
        sys.executable, str(HERE / "train.py"),
        "--task", args.task,
        "--data", args.data, "--epochs", str(args.epochs),
        "--batch", str(args.batch), "--base-channels", str(args.base_channels),
        "--patience", str(args.patience), "--workers", str(args.workers),
    ])

    export = [sys.executable, str(HERE / "export_onnx.py"), "--task", args.task, "--out", out]
    if args.quantize:
        export.append("--quantize")
    run(export)

    print(f"\ndone -> {out} (ships same-origin with the app)")


if __name__ == "__main__":
    main()
