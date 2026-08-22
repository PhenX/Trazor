<#
.SYNOPSIS
  Bootstrap the Python training environment (Windows / PowerShell).

.DESCRIPTION
  Creates a repo-root .venv and installs PyTorch + the training deps into it.
  Installs nothing globally — everything lands in .venv. It calls the venv's
  python directly, so it works even if PowerShell's execution policy blocks
  Activate.ps1 (to activate later, see the README).

.PARAMETER Cuda
  CUDA wheel tag matching your NVIDIA driver (e.g. cu121, cu124) from
  https://pytorch.org/get-started/locally/. Omit for a CPU-only install.

.EXAMPLE
  .\scripts\train\setup.ps1
.EXAMPLE
  .\scripts\train\setup.ps1 -Cuda cu124
#>
param([string]$Cuda = "")
$ErrorActionPreference = "Stop"

# Prefer the 'py' launcher (standard on python.org installs); fall back to python.
$launcher = if (Get-Command py -ErrorAction SilentlyContinue) { "py" }
            elseif (Get-Command python -ErrorAction SilentlyContinue) { "python" }
            else { throw "Python not found — install Python 3.10+ from python.org and re-run." }

Write-Host "==> creating .venv (via $launcher)"
& $launcher -m venv .venv
$py = ".venv\Scripts\python.exe"

Write-Host "==> upgrading pip"
& $py -m pip install --upgrade pip

if ($Cuda) {
  Write-Host "==> installing torch (CUDA $Cuda)"
  & $py -m pip install torch --index-url "https://download.pytorch.org/whl/$Cuda"
}

Write-Host "==> installing training deps"
& $py -m pip install -r scripts/train/requirements.txt

Write-Host "==> verifying"
& $py -c "import torch; print('torch', torch.__version__, '| CUDA available:', torch.cuda.is_available()); print('  device:', torch.cuda.get_device_name(0)) if torch.cuda.is_available() else None"

Write-Host ""
Write-Host "done. Next (no activation needed — call the venv python directly):"
Write-Host "  .venv\Scripts\python.exe scripts\train\pipeline.py --count 20000 --quantize"
Write-Host "  .venv\Scripts\python.exe scripts\train\pipeline.py --task cleanup --count 20000 --quantize"
Write-Host "(or activate first: .\.venv\Scripts\Activate.ps1 — if blocked, see the README)"
