param(
  [string]$InstallRoot = "C:\BellField",
  [switch]$ShowToken,
  [switch]$NoClipboard
)

$ErrorActionPreference = "Stop"

$apiLogRoot = Join-Path $InstallRoot "data\logs\services\bellfield-api"
$tokenPattern = "BellField first-owner setup token: ([A-Za-z0-9_-]+)\."

if (-not (Test-Path -LiteralPath $apiLogRoot)) {
  throw "BellField API service log directory not found: $apiLogRoot"
}

$tokenMatches = @()
$logFiles = Get-ChildItem -LiteralPath $apiLogRoot -File -Filter "*.log" -ErrorAction Stop |
  Sort-Object LastWriteTimeUtc, FullName

foreach ($file in $logFiles) {
  $lineNumber = 0
  foreach ($line in Get-Content -LiteralPath $file.FullName -ErrorAction Stop) {
    $lineNumber += 1
    $match = [regex]::Match($line, $tokenPattern)
    if ($match.Success) {
      $tokenMatches += [PSCustomObject]@{
        Token = $match.Groups[1].Value
        SourceFile = $file.FullName
        SourceLastWriteTimeUtc = $file.LastWriteTimeUtc
        LineNumber = $lineNumber
      }
    }
  }
}

if ($tokenMatches.Count -eq 0) {
  throw "No first-owner setup token line was found under $apiLogRoot. Confirm bellfield-api is running and GET /identity/setup/status has been called."
}

$latest = $tokenMatches |
  Sort-Object SourceLastWriteTimeUtc, SourceFile, LineNumber |
  Select-Object -Last 1

$copiedToClipboard = $false
$clipboardError = $null
if (-not $NoClipboard) {
  try {
    Set-Clipboard -Value $latest.Token
    $copiedToClipboard = $true
  } catch {
    $clipboardError = $_.Exception.Message
  }
}

$result = [ordered]@{
  status = "ok"
  installRoot = $InstallRoot
  apiLogRoot = $apiLogRoot
  sourceFile = $latest.SourceFile
  sourceLine = $latest.LineNumber
  tokenLineCount = $tokenMatches.Count
  copiedToClipboard = $copiedToClipboard
  multipleTokenWarning = $tokenMatches.Count -gt 1
}

if ($clipboardError) {
  $result.clipboardError = $clipboardError
}

if ($ShowToken) {
  $result.setupToken = $latest.Token
}

$result | ConvertTo-Json -Depth 4
