#!/usr/bin/env sh
# Bootstrap the Python training environment (Linux / macOS).
#
# Creates a repo-root .venv and installs PyTorch + the training deps into it.
# Run from the repo root:
#
#   sh scripts/train/setup.sh                 # CPU (or Linux default CUDA wheel)
#   sh scripts/train/setup.sh --cuda cu124    # install the cu124 CUDA build of torch
#
# Pick the --cuda tag matching your driver from https://pytorch.org/get-started/locally/
# (e.g. cu121, cu124). It installs nothing globally — everything lands in .venv.
set -eu

CUDA=""
while [ $# -gt 0 ]; do
  case "$1" in
    --cuda) CUDA="${2:-}"; shift 2 ;;
    --cuda=*) CUDA="${1#--cuda=}"; shift ;;
    -h|--help) grep '^#' "$0" | cut -c3-; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

PY="${PYTHON:-python3}"
if ! command -v "$PY" >/dev/null 2>&1; then
  echo "error: '$PY' not found — install Python 3.10+ (set PYTHON=... to override)" >&2
  exit 1
fi

echo "==> creating .venv ($("$PY" --version 2>&1))"
"$PY" -m venv .venv
VENV_PY=.venv/bin/python

echo "==> upgrading pip"
"$VENV_PY" -m pip install --upgrade pip

if [ -n "$CUDA" ]; then
  echo "==> installing torch (CUDA $CUDA)"
  "$VENV_PY" -m pip install torch --index-url "https://download.pytorch.org/whl/$CUDA"
fi

echo "==> installing training deps"
"$VENV_PY" -m pip install -r scripts/train/requirements.txt

echo "==> verifying"
"$VENV_PY" - <<'PYEOF'
import torch
print(f"torch {torch.__version__} | CUDA available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"  device: {torch.cuda.get_device_name(0)}")
PYEOF

echo
echo "done. Next (no activation needed — call the venv python directly):"
echo "  .venv/bin/python scripts/train/pipeline.py --count 20000 --quantize"
echo "  .venv/bin/python scripts/train/pipeline.py --task cleanup --count 20000 --quantize"
echo "(or 'source .venv/bin/activate' first, then use plain 'python')"
