# bofh-golem installer shim for Windows (PowerShell 5.1+).
#
# One-line install:
#   irm https://raw.githubusercontent.com/The-Code-Monkey/bofh-golem/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

$Repo = "The-Code-Monkey/bofh-golem"
$PinnedRef = if ($env:BOFH_GOLEM_REF) { $env:BOFH_GOLEM_REF } else { "main" }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "bofh-golem: Node.js (>=18) required. Install from https://nodejs.org"
    exit 1
}

$nodeMajor = node -p "process.versions.node.split('.')[0]"
if ([int]$nodeMajor -lt 18) {
    Write-Error "bofh-golem: Node $nodeMajor too old. Need Node >=18."
    exit 1
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$installer = Join-Path $here "installer/install.js"

if (Test-Path $installer) {
    node $installer @args
    exit $LASTEXITCODE
}

# Curl-pipe path: download the tarball and run the installer from it.
Write-Host "bofh-golem: fetching installer..."
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("bofh-golem-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
    $tar = Join-Path $tmp "repo.tar.gz"
    Invoke-WebRequest -Uri "https://github.com/$Repo/archive/refs/heads/$PinnedRef.tar.gz" -OutFile $tar
    tar -xzf $tar -C $tmp
    $dir = Get-ChildItem -Path $tmp -Directory | Select-Object -First 1
    node (Join-Path $dir.FullName "installer/install.js") @args
} finally {
    Remove-Item -Recurse -Force $tmp
}
