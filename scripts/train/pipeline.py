"""One-shot: generate dataset -> train -> export a pre-pass ONNX.

Cross-platform (Windows / macOS / Linux). Each step is also runnable on its own
(see scripts/train/README.md). Examples:

    python scripts/train/pipeline.py --smoke                     # ~30s end-to-end sanity check
    python scripts/train/pipeline.py --count 20000 --epochs 40 --quantize
    python scripts/train/pipeline.py --data dataset-out --skip-data --epochs 40
    python scripts/train/pipeline.py --data data/proc data/real --skip-data --epochs 40
    python scripts/train/pipeline.py --task cleanup --count 20000 --quantize

Run --smoke first on a new machine: it exercises the whole chain (data-gen →
train → ONNX export + parity) with a tiny throwaway config, writing to the
gitignored checkpoints/ dir — never the shipped model — so you confirm the
toolchain works before committing to a full run.
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

# Fast throwaway config for --smoke: enough to run every step, small enough to
# finish in well under a minute on CPU.
SMOKE = {"count": 50, "epochs": 1, "batch": 8, "base_channels": 8}
SMOKE_DIR = "scripts/train/checkpoints/smoke"  # gitignored; isolated from real checkpoints

# Checkpoint filename per task (mirrors train.py TASKS / export_onnx.DEFAULT_CHECKPOINT).
CHECKPOINT_NAME = {"edge": "edge-prepass.pt", "cleanup": "cleanup.pt"}


def main() -> None:
    require_deps()
    p = argparse.ArgumentParser(description="Generate data, train, and export a pre-pass model.")
    p.add_argument("--task", choices=sorted(DEFAULT_OUT), default="edge", help="edge or cleanup")
    p.add_argument("--count", type=int, default=20000, help="samples to generate")
    p.add_argument(
        "--data",
        nargs="+",
        default=None,
        help="dataset dir(s); several are concatenated at train time like train.py "
        "(default: dataset-out; --smoke uses its own isolated dir). Generation writes "
        "one set, so pass a single dir to generate, or several with --skip-data to mix",
    )
    p.add_argument("--epochs", type=int, default=60)
    p.add_argument("--batch", type=int, default=32)
    p.add_argument("--base-channels", type=int, default=16, help="model width / size")
    p.add_argument("--ssim-weight", type=float, default=0.5, help="cleanup: (1-SSIM) vs L1 weight, [0,1]")
    p.add_argument("--patience", type=int, default=10, help="early-stop after N stale epochs (0 = off)")
    p.add_argument("--workers", type=int, default=0, help="dataloader workers (raise for speed)")
    p.add_argument("--jobs", type=int, default=0, help="dataset generator threads (0 = CPU count)")
    p.add_argument("--out", default=None, help="ONNX ship path (default: per-task)")
    p.add_argument("--skip-data", action="store_true", help="reuse an existing --data dir")
    p.add_argument("--quantize", action="store_true")
    p.add_argument(
        "--smoke",
        action="store_true",
        help="fast end-to-end sanity check (tiny data/model, throwaway output — not the shipped model)",
    )
    args = p.parse_args()

    if args.smoke:
        # Force the fast config; keep --task/--skip-data/--quantize/--jobs/--workers as given.
        args.count, args.epochs, args.batch, args.base_channels = (
            SMOKE["count"],
            SMOKE["epochs"],
            SMOKE["batch"],
            SMOKE["base_channels"],
        )

    # Resolve paths: smoke stays fully isolated under SMOKE_DIR (gitignored) — its
    # own dataset dir, checkpoint dir, and ONNX, none of them the real dataset or
    # the shipped model.
    default_root = f"{SMOKE_DIR}/data" if args.smoke else "dataset-out"
    # --data may name several roots (concatenated at train time, matching train.py);
    # generation writes a single dataset, so exactly one root is expected there.
    data_roots = args.data or [default_root]
    ckpt_dir = SMOKE_DIR if args.smoke else "scripts/train/checkpoints"
    out = args.out or (
        f"{SMOKE_DIR}/{args.task}.onnx" if args.smoke else DEFAULT_OUT[args.task]
    )
    if args.smoke:
        print(
            f"SMOKE: task={args.task} · {args.count} samples · {args.epochs} epoch · "
            f"base={args.base_channels} → {out} (throwaway, not the shipped model)"
        )

    if args.skip_data:
        print(f"skipping data generation, using {', '.join(data_roots)}")
    else:
        # Generation writes one dataset; several roots only make sense for mixing
        # already-generated sets, which is the --skip-data path.
        if len(data_roots) > 1:
            raise SystemExit(
                "data generation writes one dataset, but --data named several roots: "
                f"{', '.join(data_roots)}.\n"
                "Generate each separately (npm run dataset -- --out <dir>), then re-run "
                "with --skip-data to mix them; or pass a single --data dir to generate."
            )
        # The dataset carries both targets (edge + clean), so one generated set
        # trains either task. npm is npm.cmd on Windows; shell=True keeps it portable.
        run(
            f'npm run dataset -- --count {args.count} --jobs {args.jobs} --out "{data_roots[0]}"',
            shell=True,
        )

    run([
        sys.executable, str(HERE / "train.py"),
        "--task", args.task,
        # Forward every root; train.py's --data is nargs="+" and concatenates them.
        "--data", *data_roots, "--epochs", str(args.epochs),
        "--batch", str(args.batch), "--base-channels", str(args.base_channels),
        "--ssim-weight", str(args.ssim_weight),
        "--patience", str(args.patience), "--workers", str(args.workers),
        "--out", ckpt_dir,
    ])

    export = [sys.executable, str(HERE / "export_onnx.py"), "--task", args.task, "--out", out]
    export += ["--checkpoint", f"{ckpt_dir}/{CHECKPOINT_NAME[args.task]}"]
    if args.quantize:
        export.append("--quantize")
    run(export)

    if args.smoke:
        print(f"\nsmoke OK -> {out} (throwaway). Toolchain works — now run a real training pass.")
    else:
        print(f"\ndone -> {out} (ships same-origin with the app)")


if __name__ == "__main__":
    main()
