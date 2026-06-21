param(
  [string]$Root = (Get-Location).Path,
  [string]$HashFile = ""
)

$ErrorActionPreference = "Stop"

if (-not $HashFile) {
  $HashFile = Join-Path $Root "SHA256SUMS.txt"
}

function Normalize-HashPath {
  param([Parameter(Mandatory = $true)][string]$PathValue)

  return $PathValue.Trim().TrimStart([char[]]@(".", "/", "\")).Replace("\", "/")
}

function Resolve-HashPath {
  param(
    [Parameter(Mandatory = $true)][string]$RootPath,
    [Parameter(Mandatory = $true)][string]$NormalizedPath
  )

  $localPath = $NormalizedPath.Replace("/", [IO.Path]::DirectorySeparatorChar)
  return Join-Path $RootPath $localPath
}

if (-not (Test-Path -LiteralPath $HashFile)) {
  throw "SHA256SUMS file not found: $HashFile"
}

$entries = @()
foreach ($line in Get-Content -LiteralPath $HashFile) {
  $trimmed = $line.Trim()
  if (-not $trimmed -or $trimmed.StartsWith("#")) {
    continue
  }

  $match = [regex]::Match($trimmed, "^(?<hash>[A-Fa-f0-9]{64})\s+\*?(?<path>.+)$")
  if (-not $match.Success) {
    throw "Could not parse SHA256SUMS line: $line"
  }

  $entries += [PSCustomObject]@{
    ExpectedHash = $match.Groups["hash"].Value.ToUpperInvariant()
    RelativePath = Normalize-HashPath -PathValue $match.Groups["path"].Value
  }
}

if ($entries.Count -eq 0) {
  throw "SHA256SUMS did not contain any hash entries: $HashFile"
}

$results = @()
foreach ($entry in $entries) {
  $fullPath = Resolve-HashPath -RootPath $Root -NormalizedPath $entry.RelativePath
  if (-not (Test-Path -LiteralPath $fullPath)) {
    $results += [PSCustomObject]@{
      relativePath = $entry.RelativePath
      status = "missing"
      expectedHash = $entry.ExpectedHash
      actualHash = $null
    }
    continue
  }

  $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $fullPath).Hash.ToUpperInvariant()
  $results += [PSCustomObject]@{
    relativePath = $entry.RelativePath
    status = if ($actualHash -eq $entry.ExpectedHash) { "ok" } else { "mismatch" }
    expectedHash = $entry.ExpectedHash
    actualHash = $actualHash
  }
}

$failed = @($results | Where-Object { $_.status -ne "ok" })
$summary = [ordered]@{
  status = if ($failed.Count -eq 0) { "ok" } else { "failed" }
  root = (Resolve-Path -LiteralPath $Root).Path
  hashFile = (Resolve-Path -LiteralPath $HashFile).Path
  checked = $results.Count
  failed = $failed.Count
  results = $results
}

$summary | ConvertTo-Json -Depth 5

if ($failed.Count -gt 0) {
  exit 1
}
