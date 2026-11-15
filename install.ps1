# bofh-golem installer shim for Windows (PowerShell 5.1+).
#
# One-line install:
#   irm https://raw.githubusercontent.com/The-Code-Monkey/bofh-golem/main/install.ps1 | iex
#
# Canonical facts (repo, ref, Node floor) live in bootstrap.json. The shim
# checks the Node floor before downloading the installer archive, forwards
# every flag, and never selects, copies, or removes artifacts.

$ErrorActionPreference = "Stop"

$NodeBin = if ($env:BOFH_GOLEM_NODE) { $env:BOFH_GOLEM_NODE } else { "node" }
$LocatorRepo = "The-Code-Monkey/bofh-golem"
$LocatorRef = "main"
$Repo = if ($env:BOFH_GOLEM_REPO) { $env:BOFH_GOLEM_REPO } else { $LocatorRepo }
$Ref = if ($env:BOFH_GOLEM_REF) { $env:BOFH_GOLEM_REF } else { $LocatorRef }

function Fail([string]$Message) {
    Write-Error "bofh-golem: $Message"
    exit 1
}

if (-not (Get-Command $NodeBin -ErrorAction SilentlyContinue)) {
    Fail "Node.js required. Install Node >=18 from https://nodejs.org"
}

$here = if ($PSScriptRoot) { $PSScriptRoot } else { "" }
$bootstrap = if ($here -and (Test-Path (Join-Path $here "bootstrap.json"))) {
    Join-Path $here "bootstrap.json"
} else {
    $null
}
$tmp = $null

if (-not $bootstrap) {
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("bofh-golem-" + [System.Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $tmp | Out-Null
    $bootstrap = Join-Path $tmp "bootstrap.json"
    $url = if ($env:BOFH_GOLEM_BOOTSTRAP_URL) {
        $env:BOFH_GOLEM_BOOTSTRAP_URL
    } else {
        "https://raw.githubusercontent.com/$Repo/$Ref/bootstrap.json"
    }
    try {
        Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $bootstrap
    } catch {
        Fail "cannot fetch bootstrap metadata: $url"
    }
}

try {
    $meta = Get-Content -Raw -Path $bootstrap | ConvertFrom-Json
    $Repo = $meta.repo
    $Ref = $meta.ref
    $floor = [int]$meta.node

    $major = [int](& $NodeBin -p "process.versions.node.split('.')[0]")
    if ($major -lt $floor) {
        Fail "Node $major too old. Need Node >=$floor."
    }

    $localInstaller = if ($here) { Join-Path $here "installer/install.js" } else { $null }
    if (-not $env:BOFH_GOLEM_FORCE_REMOTE -and $localInstaller -and (Test-Path $localInstaller)) {
        & $NodeBin $localInstaller @args
        exit $LASTEXITCODE
    }

    if (-not $tmp) {
        $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("bofh-golem-" + [System.Guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Path $tmp | Out-Null
    }

    $archive = $env:BOFH_GOLEM_ARCHIVE
    if (-not $archive) {
        $archive = Join-Path $tmp "repo.tar.gz"
        $url = if ($env:BOFH_GOLEM_ARCHIVE_URL) {
            $env:BOFH_GOLEM_ARCHIVE_URL
        } else {
            "https://github.com/$Repo/archive/refs/heads/$Ref.tar.gz"
        }
        Write-Host "bofh-golem: fetching installer..."
        try {
            Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $archive
        } catch {
            Fail "cannot download installer: $url"
        }
    }

    tar -xzf $archive -C $tmp
    if ($LASTEXITCODE -ne 0) {
        Fail "cannot extract installer archive: $archive"
    }

    $installer = Get-ChildItem -Path $tmp -Recurse -Filter "install.js" |
        Where-Object { $_.FullName -match '[\\/]installer[\\/]install\.js$' } |
        Select-Object -First 1
    if (-not $installer) {
        Fail "installer not found in archive: $archive"
    }

    & $NodeBin $installer.FullName @args
    exit $LASTEXITCODE
} finally {
    if ($tmp -and (Test-Path $tmp)) {
        Remove-Item -Recurse -Force $tmp
    }
}
