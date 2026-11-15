# Windows CI tests for install.ps1. No live network access.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-install-ps1.ps1

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Shim = Join-Path $RepoRoot "install.ps1"
$Bootstrap = Join-Path $RepoRoot "bootstrap.json"
$PowerShellBin = (Get-Process -Id $PID).Path

function New-TempDir([string]$Prefix) {
    $path = Join-Path ([System.IO.Path]::GetTempPath()) ($Prefix + [System.Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $path | Out-Null
    return $path
}

function New-WorkDir {
    $work = New-TempDir "bofh-ps-work-"
    Copy-Item $Shim (Join-Path $work "install.ps1")
    Copy-Item $Bootstrap (Join-Path $work "bootstrap.json")
    return $work
}

function Write-FixtureInstaller([string]$Work) {
    $dir = Join-Path $Work "installer"
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $script = @'
const fs = require("fs");
fs.writeFileSync(process.env.BOFH_TEST_ARGS, JSON.stringify(process.argv.slice(2)));
if (process.env.BOFH_TEST_EXIT) process.exit(Number(process.env.BOFH_TEST_EXIT));
'@
    Set-Content -Path (Join-Path $dir "install.js") -Value $script -Encoding UTF8
}

function New-FixtureArchive {
    $source = New-TempDir "bofh-ps-archive-"
    $root = Join-Path $source "bofh-golem-test"
    Write-FixtureInstaller -Work $root
    $archive = Join-Path $source "repo.tar.gz"
    tar -czf $archive -C $source "bofh-golem-test"
    if ($LASTEXITCODE -ne 0) { throw "cannot create fixture archive" }
    return $archive
}

function Invoke-Shim {
    param(
        [string]$Work,
        [string[]]$ShimArgs,
        [hashtable]$Environment
    )
    $saved = @{}
    foreach ($key in $Environment.Keys) {
        $saved[$key] = [System.Environment]::GetEnvironmentVariable($key, "Process")
        [System.Environment]::SetEnvironmentVariable($key, $Environment[$key], "Process")
    }
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = & $PowerShellBin -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Work "install.ps1") @ShimArgs 2>&1
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorAction
        foreach ($key in $saved.Keys) {
            [System.Environment]::SetEnvironmentVariable($key, $saved[$key], "Process")
        }
    }
    return [pscustomobject]@{ Code = $code; Output = ($output -join "`n") }
}

function Assert-Equal($Actual, $Expected, [string]$Message) {
    if ($Actual -ne $Expected) {
        throw "$Message (expected '$Expected', got '$Actual')"
    }
}

function Assert-Contains([string]$Text, [string]$Needle, [string]$Message) {
    if (-not $Text.Contains($Needle)) {
        throw "$Message (missing '$Needle')"
    }
}

$failures = 0
$tests = @(
    @{
        Name = "local checkout forwards flags"
        Run = {
            $work = New-WorkDir
            Write-FixtureInstaller -Work $work
            $argsFile = Join-Path $work "args.json"
            $result = Invoke-Shim -Work $work -ShimArgs @("--claude", "--dry-run", "--unknown") -Environment @{ BOFH_TEST_ARGS = $argsFile }
            Assert-Equal $result.Code 0 "local shim should succeed"
            $forwarded = (Get-Content -Raw $argsFile | ConvertFrom-Json) -join ","
            Assert-Equal $forwarded "--claude,--dry-run,--unknown" "flags were not forwarded"
        }
    },
    @{
        Name = "archive path forwards flags and cleans up"
        Run = {
            $work = New-WorkDir
            $archive = New-FixtureArchive
            $argsFile = Join-Path $work "args.json"
            $tmp = New-TempDir "bofh-ps-tmp-"
            $result = Invoke-Shim -Work $work -ShimArgs @("--opencode", "--all") -Environment @{
                BOFH_TEST_ARGS = $argsFile
                BOFH_GOLEM_ARCHIVE = $archive
                BOFH_GOLEM_FORCE_REMOTE = "1"
                TEMP = $tmp
                TMP = $tmp
            }
            Assert-Equal $result.Code 0 "archive shim should succeed"
            $forwarded = (Get-Content -Raw $argsFile | ConvertFrom-Json) -join ","
            Assert-Equal $forwarded "--opencode,--all" "flags were not forwarded"
            Assert-Equal (Get-ChildItem -Path $tmp | Measure-Object).Count 0 "temporary directory was not cleaned"
        }
    },
    @{
        Name = "installer failure exits nonzero"
        Run = {
            $work = New-WorkDir
            Write-FixtureInstaller -Work $work
            $argsFile = Join-Path $work "args.json"
            $result = Invoke-Shim -Work $work -ShimArgs @("--claude") -Environment @{
                BOFH_TEST_ARGS = $argsFile
                BOFH_TEST_EXIT = "7"
            }
            Assert-Equal $result.Code 7 "installer exit code was not forwarded"
        }
    },
    @{
        Name = "fetch failure exits nonzero and cleans up"
        Run = {
            $work = New-WorkDir
            $tmp = New-TempDir "bofh-ps-tmp-"
            $result = Invoke-Shim -Work $work -ShimArgs @() -Environment @{
                BOFH_GOLEM_FORCE_REMOTE = "1"
                BOFH_GOLEM_ARCHIVE_URL = "http://127.0.0.1:1/nope.tar.gz"
                TEMP = $tmp
                TMP = $tmp
            }
            if ($result.Code -eq 0) { throw "fetch failure should exit nonzero" }
            Assert-Contains $result.Output "cannot download installer" "fetch failure message is unclear"
            Assert-Equal (Get-ChildItem -Path $tmp | Measure-Object).Count 0 "temporary directory was not cleaned"
        }
    }
)

foreach ($test in $tests) {
    try {
        & $test.Run
        Write-Host "ok - $($test.Name)"
    } catch {
        $failures++
        Write-Host "not ok - $($test.Name): $_"
    }
}

if ($failures -gt 0) {
    throw "$failures PowerShell shim test(s) failed"
}
Write-Host "PowerShell shim tests passed"
