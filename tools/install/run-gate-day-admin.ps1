param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("gate1-prepare-release", "gate1-admin-install", "gate1-post-reboot-check", "gate2-backup-restore", "gate3-prepare-update-artifact", "gate3-update", "collect-only", "process-capture-smoke")]
  [string]$Mode,

  [string]$InstallRoot = "C:\BellField",

  [Parameter(Mandatory = $true)]
  [string]$ReleaseRoot,

  [Parameter(Mandatory = $true)]
  [string]$EvidenceRoot,

  [string]$RunId,
  [string]$ArtifactZip,
  [string]$ExpectedVersion,
  [string]$ExpectedSourceCommit,
  [string]$UpdateArtifactRoot,
  [string]$BackupSet,
  [string]$HealthUrl = "http://127.0.0.1:3001/health",
  [string]$LanIp,
  [string]$LanHost,
  [switch]$SetCurrentNetworkPrivate,
  [int]$StepTimeoutSeconds = 1800,
  [int]$UacTimeoutSeconds = 300,
  [switch]$NoSelfElevate,
  [switch]$DryRun,
  [ValidateSet("success", "nonzero", "timeout", "quiet", "missing-terminal")]
  [string]$DryRunGate3Outcome = "success",
  [switch]$ElevatedChild
)

$ErrorActionPreference = "Stop"

$script:runnerScriptPath = if ($PSCommandPath) { $PSCommandPath } else { $MyInvocation.MyCommand.Path }
$script:invocationDirectory = (Get-Location).ProviderPath
$script:evidencePaths = @()
$script:usbLogPath = $null
$script:localLogPath = $null
$script:usbTranscriptPath = $null
$script:localTranscriptPath = $null
$script:transcriptStarted = $false
$script:processOutputRoot = $null
$script:terminalEventWritten = $false
$script:lastGateProcessResult = $null
$script:lastFailedStep = $null
$script:failureEvidenceAttempted = $false

if (-not $RunId) {
  $RunId = "run-$((Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss'Z'"))"
}

function ConvertTo-GateTimestamp {
  return (Get-Date).ToUniversalTime().ToString("o")
}

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-ModeAllowsNonElevatedNoSelfElevate {
  return @("gate1-prepare-release", "gate3-prepare-update-artifact", "process-capture-smoke") -contains $Mode
}

function Get-FullPath {
  param([Parameter(Mandatory = $true)][string]$Path)
  return [System.IO.Path]::GetFullPath($Path)
}

function Resolve-GatePathInput {
  param([AllowNull()][string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path)) {
    return $Path
  }
  if ([System.IO.Path]::IsPathRooted($Path)) {
    return [System.IO.Path]::GetFullPath($Path)
  }
  return [System.IO.Path]::GetFullPath((Join-Path -Path $script:invocationDirectory -ChildPath $Path))
}

function Normalize-GateRunnerPathInputs {
  $script:runnerScriptPath = Resolve-GatePathInput $script:runnerScriptPath
  $script:InstallRoot = Resolve-GatePathInput $script:InstallRoot
  $script:ReleaseRoot = Resolve-GatePathInput $script:ReleaseRoot
  $script:EvidenceRoot = Resolve-GatePathInput $script:EvidenceRoot
  if ($script:ArtifactZip) {
    $script:ArtifactZip = Resolve-GatePathInput $script:ArtifactZip
  }
  if ($script:UpdateArtifactRoot) {
    $script:UpdateArtifactRoot = Resolve-GatePathInput $script:UpdateArtifactRoot
  }
  if ($script:BackupSet) {
    $script:BackupSet = Resolve-GatePathInput $script:BackupSet
  }
}

function Initialize-GateEvidence {
  param([switch]$AllowPartial)

  $resolvedEvidenceRoot = Get-FullPath $EvidenceRoot
  $resolvedInstallRoot = Get-FullPath $InstallRoot
  $localRoot = Join-Path $resolvedInstallRoot "data\logs\gate-day"

  $script:usbLogPath = Join-Path $resolvedEvidenceRoot "gate-day-admin-runner-$RunId.jsonl"
  $script:localLogPath = Join-Path $localRoot "gate-day-admin-runner-$RunId.jsonl"
  $script:usbTranscriptPath = Join-Path $resolvedEvidenceRoot "gate-day-admin-runner-$RunId.transcript.txt"
  $script:localTranscriptPath = Join-Path $localRoot "gate-day-admin-runner-$RunId.transcript.txt"
  $script:processOutputRoot = Join-Path $resolvedEvidenceRoot "gate-day-admin-runner-$RunId-output"

  $paths = @()
  foreach ($directory in @($resolvedEvidenceRoot, $localRoot, $script:processOutputRoot)) {
    try {
      New-Item -ItemType Directory -Force -Path $directory | Out-Null
    } catch {
      if (-not $AllowPartial) {
        throw
      }
      Write-Warning "Could not create Gate Day evidence directory $directory`: $($_.Exception.Message)"
    }
  }

  foreach ($path in @($script:usbLogPath, $script:localLogPath)) {
    $directory = Split-Path -Parent $path
    if (Test-Path -LiteralPath $directory) {
      $paths += $path
    }
  }

  $script:evidencePaths = @($paths | Select-Object -Unique)
  if ($script:evidencePaths.Count -eq 0) {
    throw "No Gate Day evidence log path could be initialized."
  }
}

function Write-GateEvent {
  param(
    [Parameter(Mandatory = $true)][string]$Event,
    [hashtable]$Fields = @{}
  )

  $record = [ordered]@{
    timestamp = ConvertTo-GateTimestamp
    event = $Event
    mode = $Mode
    runId = $RunId
    installRoot = $InstallRoot
    releaseRoot = $ReleaseRoot
  }

  foreach ($key in $Fields.Keys) {
    $record[$key] = $Fields[$key]
  }

  $json = $record | ConvertTo-Json -Depth 16 -Compress
  foreach ($path in $script:evidencePaths) {
    try {
      [System.IO.File]::AppendAllText(
        $path,
        "$json`r`n",
        (New-Object System.Text.UTF8Encoding($false))
      )
    } catch {
      Write-Warning "Failed to write Gate Day evidence event to $path`: $($_.Exception.Message)"
    }
  }
}

function Write-GateLaunch {
  param([string]$Status, [hashtable]$Fields = @{})
  $Fields["status"] = $Status
  Write-GateEvent -Event "BELLFIELD_GATE_ADMIN_LAUNCH" -Fields $Fields
}

function Write-GateResult {
  param([string]$Status, [hashtable]$Fields = @{})
  $Fields["status"] = $Status
  $Fields["evidencePath"] = $script:usbLogPath
  $Fields["localEvidencePath"] = $script:localLogPath
  Write-GateEvent -Event "BELLFIELD_GATE_ADMIN_RESULT" -Fields $Fields
  Write-GateOperatorSummary -Status $Status
  $script:terminalEventWritten = $true
}

function Write-GateFailure {
  param([object]$ErrorRecord, [hashtable]$Fields = @{})
  $Fields["status"] = "failed"
  $failingStep = Get-GateFailureStep
  if ($failingStep) {
    $Fields["failingStep"] = $failingStep
  }
  $message = if ($ErrorRecord.Exception) { $ErrorRecord.Exception.Message } else { [string]$ErrorRecord }
  $Fields["error"] = @{
    message = $message
    type = if ($ErrorRecord.Exception) { $ErrorRecord.Exception.GetType().FullName } else { $null }
  }
  [Console]::Error.WriteLine("BELLFIELD_GATE_ADMIN_FAILURE: $message")
  Write-GateEvent -Event "BELLFIELD_GATE_ADMIN_FAILURE" -Fields $Fields
  Write-GateOperatorSummary -Status "failed" -FailingStep $failingStep
  $script:terminalEventWritten = $true
}

function Get-GateFailureStep {
  if ($script:lastFailedStep) {
    return $script:lastFailedStep
  }
  if ($script:lastGateProcessResult -and $script:lastGateProcessResult.step) {
    return $script:lastGateProcessResult.step
  }
  return $null
}

function Write-GateOperatorSummary {
  param(
    [Parameter(Mandatory = $true)][string]$Status,
    [string]$FailingStep,
    [AllowNull()][object]$ChildExitCode = $null
  )

  $parts = @(
    "BELLFIELD_GATE_ADMIN_SUMMARY:",
    "mode=$Mode",
    "status=$Status"
  )
  if ($FailingStep) {
    $parts += "failingStep=$FailingStep"
  }
  if ($null -ne $ChildExitCode) {
    $parts += "childExitCode=$ChildExitCode"
  }
  $parts += "evidencePath=$script:usbLogPath"
  $parts += "localEvidencePath=$script:localLogPath"
  Write-Host ($parts -join " ")
}

function Quote-ProcessArgument {
  param([AllowNull()][string]$Value)
  if ($null -eq $Value) {
    return '""'
  }
  if ($Value.Length -eq 0) {
    return '""'
  }
  if ($Value -notmatch '[\s"]') {
    return $Value
  }

  $quoted = New-Object System.Text.StringBuilder
  [void]$quoted.Append('"')
  $backslashes = 0
  foreach ($char in $Value.ToCharArray()) {
    if ($char -eq '\') {
      $backslashes += 1
      continue
    }
    if ($char -eq '"') {
      if ($backslashes -gt 0) {
        [void]$quoted.Append(('\' * ($backslashes * 2)))
        $backslashes = 0
      }
      [void]$quoted.Append('\"')
      continue
    }
    if ($backslashes -gt 0) {
      [void]$quoted.Append(('\' * $backslashes))
      $backslashes = 0
    }
    [void]$quoted.Append($char)
  }
  if ($backslashes -gt 0) {
    [void]$quoted.Append(('\' * ($backslashes * 2)))
  }
  [void]$quoted.Append('"')
  return $quoted.ToString()
}

function Join-ProcessArguments {
  param([string[]]$Arguments)
  return (($Arguments | ForEach-Object { Quote-ProcessArgument $_ }) -join " ")
}

function Invoke-SelfElevation {
  Write-GateLaunch "uac-requested" @{
    uacTimeoutSeconds = $UacTimeoutSeconds
    scriptPath = $script:runnerScriptPath
  }

  $arguments = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $script:runnerScriptPath,
    "-Mode",
    $Mode,
    "-InstallRoot",
    $InstallRoot,
    "-ReleaseRoot",
    $ReleaseRoot,
    "-EvidenceRoot",
    $EvidenceRoot,
    "-RunId",
    $RunId,
    "-HealthUrl",
    $HealthUrl,
    "-StepTimeoutSeconds",
    [string]$StepTimeoutSeconds,
    "-UacTimeoutSeconds",
    [string]$UacTimeoutSeconds,
    "-ElevatedChild"
  )

  if ($UpdateArtifactRoot) {
    $arguments += @("-UpdateArtifactRoot", $UpdateArtifactRoot)
  }
  if ($ArtifactZip) {
    $arguments += @("-ArtifactZip", $ArtifactZip)
  }
  if ($ExpectedVersion) {
    $arguments += @("-ExpectedVersion", $ExpectedVersion)
  }
  if ($ExpectedSourceCommit) {
    $arguments += @("-ExpectedSourceCommit", $ExpectedSourceCommit)
  }
  if ($BackupSet) {
    $arguments += @("-BackupSet", $BackupSet)
  }
  if ($LanIp) {
    $arguments += @("-LanIp", $LanIp)
  }
  if ($LanHost) {
    $arguments += @("-LanHost", $LanHost)
  }
  if ($SetCurrentNetworkPrivate) {
    $arguments += "-SetCurrentNetworkPrivate"
  }
  if ($DryRun) {
    $arguments += "-DryRun"
  }
  if ($DryRunGate3Outcome -ne "success") {
    $arguments += @("-DryRunGate3Outcome", $DryRunGate3Outcome)
  }

  $argumentLine = Join-ProcessArguments $arguments
  $launchMarkerPath = Join-Path $script:processOutputRoot "uac-launch-$PID.json"
  $completionMarkerPath = Join-Path $script:processOutputRoot "uac-completion-$PID.json"
  Remove-Item -LiteralPath $launchMarkerPath, $completionMarkerPath -Force -ErrorAction SilentlyContinue
  $job = Start-Job -ScriptBlock {
    param([string]$ArgumentLine, [string]$LaunchMarkerPath, [string]$CompletionMarkerPath)
    try {
      $process = Start-Process -FilePath "powershell.exe" -Verb RunAs -PassThru -ArgumentList $ArgumentLine
      $handleCached = $false
      $handleError = $null
      try {
        $null = $process.Handle
        $handleCached = $true
      } catch {
        $handleError = $_.Exception.Message
      }
      $launchJson = [pscustomobject]@{
        status = "started"
        processId = $process.Id
        handleCached = $handleCached
        handleError = $handleError
        startedAt = (Get-Date).ToUniversalTime().ToString("o")
      } | ConvertTo-Json -Depth 6
      [System.IO.File]::WriteAllText($LaunchMarkerPath, $launchJson, (New-Object System.Text.UTF8Encoding($false)))
      $process.WaitForExit()
      $exitCode = $null
      $exitCodeError = $null
      try {
        $exitCode = $process.ExitCode
      } catch {
        $exitCodeError = $_.Exception.Message
      }
      $exitCodeUnknown = $null -eq $exitCode
      $completionJson = [pscustomobject]@{
        status = "completed"
        processId = $process.Id
        exitCode = $exitCode
        exitCodeUnknown = $exitCodeUnknown
        exitCodeError = $exitCodeError
        handleCached = $handleCached
        handleError = $handleError
        completedAt = (Get-Date).ToUniversalTime().ToString("o")
      } | ConvertTo-Json -Depth 6
      [System.IO.File]::WriteAllText($CompletionMarkerPath, $completionJson, (New-Object System.Text.UTF8Encoding($false)))
      [pscustomobject]@{
        status = "completed"
        processId = $process.Id
        exitCode = $exitCode
        exitCodeUnknown = $exitCodeUnknown
        exitCodeError = $exitCodeError
        handleCached = $handleCached
        handleError = $handleError
      }
    } catch {
      $failureJson = [pscustomobject]@{
        status = "failed"
        error = $_.Exception.Message
        failedAt = (Get-Date).ToUniversalTime().ToString("o")
      } | ConvertTo-Json -Depth 6
      [System.IO.File]::WriteAllText($LaunchMarkerPath, $failureJson, (New-Object System.Text.UTF8Encoding($false)))
      [pscustomobject]@{
        status = "failed"
        error = $_.Exception.Message
      }
    }
  } -ArgumentList $argumentLine, $launchMarkerPath, $completionMarkerPath

  $launchDeadline = (Get-Date).AddSeconds([Math]::Max(1, $UacTimeoutSeconds))
  while ((Get-Date) -lt $launchDeadline -and -not (Test-Path -LiteralPath $launchMarkerPath)) {
    Start-Sleep -Milliseconds 250
  }

  if (-not (Test-Path -LiteralPath $launchMarkerPath)) {
    Write-GateLaunch "uac-timeout" @{
      message = "The elevated Gate Day runner did not start before the UAC timeout."
      launchMarkerPath = $launchMarkerPath
    }
    Stop-Job -Job $job -ErrorAction SilentlyContinue | Out-Null
    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
    exit 124
  }

  $launch = Get-Content -LiteralPath $launchMarkerPath -Raw | ConvertFrom-Json
  if ($launch.status -eq "failed") {
    Wait-Job -Job $job | Out-Null
    $result = Receive-Job -Job $job
    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
    Write-GateLaunch "uac-cancelled" @{
      error = if ($launch.error) { $launch.error } else { $result.error }
    }
    exit 1223
  }

  Write-GateLaunch "uac-approved" @{
    childProcessId = $launch.processId
    launchMarkerPath = $launchMarkerPath
  }

  Wait-Job -Job $job | Out-Null
  $result = Receive-Job -Job $job
  Remove-Job -Job $job -Force -ErrorAction SilentlyContinue

  if ($result.status -eq "failed") {
    Write-GateLaunch "child-wait-failed" @{
      childProcessId = $launch.processId
      error = $result.error
    }
    exit 1
  }

  if ($result.exitCodeUnknown -or ($null -eq $result.exitCode)) {
    Write-GateLaunch "child-exit-code-unknown" @{
      childProcessId = $result.processId
      exitCodeError = $result.exitCodeError
      handleCached = $result.handleCached
      handleError = $result.handleError
    }
    Write-GateOperatorSummary -Status "failed" -FailingStep "elevated-child-exit-code"
    exit 1
  }

  if (-not (Test-Path -LiteralPath $completionMarkerPath)) {
    Write-GateLaunch "child-exit-evidence-missing" @{
      childProcessId = $launch.processId
      completionMarkerPath = $completionMarkerPath
      childExitCode = $result.exitCode
    }
  }

  Write-GateLaunch "elevated-child-completed" @{
    childProcessId = $result.processId
    childExitCode = $result.exitCode
  }
  $childStatus = if ($result.exitCode -eq 0) { "succeeded" } else { "failed" }
  Write-GateOperatorSummary -Status $childStatus -ChildExitCode $result.exitCode
  exit ([int]$result.exitCode)
}

function Start-GateTranscript {
  try {
    Start-Transcript -Path $script:usbTranscriptPath -Force | Out-Null
    $script:transcriptStarted = $true
    Write-GateEvent -Event "BELLFIELD_GATE_ADMIN_STEP" -Fields @{
      step = "transcript"
      status = "started"
      transcriptPath = $script:usbTranscriptPath
    }
  } catch {
    Write-GateEvent -Event "BELLFIELD_GATE_ADMIN_STEP" -Fields @{
      step = "transcript"
      status = "failed"
      error = $_.Exception.Message
    }
  }
}

function Stop-GateTranscript {
  if ($script:transcriptStarted) {
    try {
      Stop-Transcript | Out-Null
    } catch {
      Write-Warning "Failed to stop Gate Day transcript: $($_.Exception.Message)"
    }
  }

  if ($script:usbTranscriptPath -and $script:localTranscriptPath -and
      (Test-Path -LiteralPath $script:usbTranscriptPath) -and
      ($script:usbTranscriptPath -ne $script:localTranscriptPath)) {
    try {
      Copy-Item -LiteralPath $script:usbTranscriptPath -Destination $script:localTranscriptPath -Force
    } catch {
      Write-Warning "Failed to copy Gate Day transcript to local log path: $($_.Exception.Message)"
    }
  }
}

function Get-OutputTail {
  param([string]$Path, [int]$MaxChars = 6000)
  if (-not (Test-Path -LiteralPath $Path)) {
    return ""
  }
  $text = [System.IO.File]::ReadAllText($Path)
  if (-not $text) {
    return ""
  }
  if ($text.Length -le $MaxChars) {
    return $text
  }
  return $text.Substring($text.Length - $MaxChars)
}

function Invoke-GateProcess {
  param(
    [Parameter(Mandatory = $true)][string]$Step,
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$Arguments = @(),
    [switch]$AllowNonZero,
    [switch]$AllowUnknownExitCode,
    [int]$HeartbeatSeconds = 0,
    [hashtable]$HeartbeatFields = @{}
  )

  $safeStepName = ($Step -replace '[^A-Za-z0-9_.-]', '-')
  $stdoutPath = Join-Path $script:processOutputRoot "$safeStepName.stdout.txt"
  $stderrPath = Join-Path $script:processOutputRoot "$safeStepName.stderr.txt"

  $argumentLine = Join-ProcessArguments $Arguments
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $FilePath
  $startInfo.Arguments = $argumentLine
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.CreateNoWindow = $true
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  $null = $process.Start()
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $handleCached = $false
  $handleError = $null
  try {
    $null = $process.Handle
    $handleCached = $true
  } catch {
    $handleError = $_.Exception.Message
  }

  $script:lastGateProcessResult = $null
  $startedAt = Get-Date
  $deadline = $startedAt.AddSeconds([Math]::Max(1, $StepTimeoutSeconds))
  $heartbeatInterval = [Math]::Max(1, $HeartbeatSeconds)
  $nextHeartbeatAt = $startedAt.AddSeconds($heartbeatInterval)
  $timedOut = $false

  while ($true) {
    $remainingMilliseconds = [int][Math]::Ceiling(($deadline - (Get-Date)).TotalMilliseconds)
    if ($remainingMilliseconds -le 0) {
      $timedOut = $true
      break
    }
    $waitMilliseconds = [Math]::Min(500, $remainingMilliseconds)
    if ($process.WaitForExit($waitMilliseconds)) {
      break
    }
    $now = Get-Date
    if ($HeartbeatSeconds -gt 0 -and $now -ge $nextHeartbeatAt) {
      Write-GateEvent -Event "BELLFIELD_GATE_ADMIN_STEP" -Fields (@{
          step = $Step
          status = "progress"
          processId = $process.Id
          elapsedSeconds = [int][Math]::Floor(($now - $startedAt).TotalSeconds)
        } + $HeartbeatFields)
      $nextHeartbeatAt = $now.AddSeconds($heartbeatInterval)
    }
  }

  if ($timedOut) {
    try {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    } catch {
      Write-Warning "Failed to stop timed-out process $($process.Id): $($_.Exception.Message)"
    }
    $null = $process.WaitForExit(5000)
  }
  $stdoutText = ""
  $stderrText = ""
  $outputReadError = $null
  try {
    if ($stdoutTask.Wait(5000)) {
      $stdoutText = $stdoutTask.Result
    } else {
      $outputReadError = "Timed out while reading stdout."
    }
  } catch {
    $outputReadError = $_.Exception.Message
  }
  try {
    if ($stderrTask.Wait(5000)) {
      $stderrText = $stderrTask.Result
    } elseif ($outputReadError) {
      $outputReadError = "$outputReadError Timed out while reading stderr."
    } else {
      $outputReadError = "Timed out while reading stderr."
    }
  } catch {
    if ($outputReadError) {
      $outputReadError = "$outputReadError $($_.Exception.Message)"
    } else {
      $outputReadError = $_.Exception.Message
    }
  }
  [System.IO.File]::WriteAllText($stdoutPath, $stdoutText, (New-Object System.Text.UTF8Encoding($false)))
  [System.IO.File]::WriteAllText($stderrPath, $stderrText, (New-Object System.Text.UTF8Encoding($false)))
  $exitCode = $null
  $exitCodeError = $null
  if (-not $timedOut) {
    try {
      $exitCode = $process.ExitCode
    } catch {
      $exitCodeError = $_.Exception.Message
    }
  }
  $exitCodeUnknown = ((-not $timedOut) -and ($null -eq $exitCode))
  if ($exitCodeUnknown -and $AllowUnknownExitCode) {
    Write-GateEvent -Event "BELLFIELD_GATE_ADMIN_STEP" -Fields @{
      step = $Step
      status = "exit-code-unknown"
      processId = $process.Id
      handleCached = $handleCached
      handleError = $handleError
      exitCodeError = $exitCodeError
      message = "The child process exited but Windows PowerShell did not expose its exit code; subsequent verification must prove the step result before publish."
    }
  }

  $result = [ordered]@{
    step = $Step
    command = $FilePath
    arguments = $Arguments
    # Exact child command line for failure evidence. Step arguments must stay
    # non-secret (paths/flags only); secrets are passed via files or generated
    # inside helpers, never on command lines.
    argumentLine = $argumentLine
    processId = $process.Id
    exitCode = $exitCode
    exitCodeUnknown = $exitCodeUnknown
    exitCodeError = $exitCodeError
    handleCached = $handleCached
    handleError = $handleError
    outputReadError = $outputReadError
    timedOut = $timedOut
    stdoutPath = $stdoutPath
    stderrPath = $stderrPath
    stdoutTail = Get-OutputTail -Path $stdoutPath
    stderrTail = Get-OutputTail -Path $stderrPath
  }
  $script:lastGateProcessResult = [pscustomobject]$result

  if ($timedOut) {
    $result.error = "Step timed out after $StepTimeoutSeconds seconds."
    throw ([pscustomobject]$result)
  }

  if ($exitCodeUnknown -and -not $AllowUnknownExitCode) {
    $result.error = "Step exited but Windows PowerShell did not expose an exit code."
    throw ([pscustomobject]$result)
  }

  if ($exitCode -ne 0 -and -not $AllowNonZero -and -not $exitCodeUnknown) {
    $result.error = "Step exited with code $exitCode."
    throw ([pscustomobject]$result)
  }

  return [pscustomobject]$result
}

function Get-UniquePrepareStageRoot {
  param([Parameter(Mandatory = $true)][string]$FinalReleaseRoot)

  $fullFinal = Get-FullPath $FinalReleaseRoot
  $parent = Split-Path -Parent $fullFinal
  $leaf = Split-Path -Leaf $fullFinal
  $stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss'Z'")
  for ($index = 1; $index -le 50; $index += 1) {
    $suffix = if ($index -eq 1) { "" } else { "-$index" }
    $candidate = Join-Path $parent "$leaf.prepare-stage-$stamp$suffix"
    if (-not (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }
  throw "Could not reserve a unique release prepare stage directory beside $fullFinal."
}

function Get-FileCount {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    return 0
  }
  return @(Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction Stop).Count
}

function New-ReleaseVerificationScript {
  param([Parameter(Mandatory = $true)][string]$ReleaseRoot)

  $scriptPath = Join-Path $script:processOutputRoot "verify-prepared-release.mjs"
  $artifactModule = Join-Path $ReleaseRoot "tools\update\release-artifact.mjs"
  $artifactModuleUri = ([System.Uri]$artifactModule).AbsoluteUri
  $scriptText = @"
import { verifyReleaseArtifact } from '$artifactModuleUri';

const releaseRoot = process.argv[2];
const verified = verifyReleaseArtifact({ releaseRoot });
console.log(JSON.stringify({
  version: verified.build.version,
  releaseDate: verified.build.releaseDate,
  sourceCommit: verified.build.sourceCommit,
  fileCount: verified.files.length
}));
"@
  Set-Content -LiteralPath $scriptPath -Value $scriptText -Encoding UTF8
  return $scriptPath
}

function New-ReleaseExtractionScript {
  $scriptPath = Join-Path $script:processOutputRoot "extract-prepared-release.ps1"
  $scriptText = @'
param(
  [Parameter(Mandatory = $true)][string]$ArtifactZip,
  [Parameter(Mandatory = $true)][string]$Destination
)

$ErrorActionPreference = "Stop"
Expand-Archive -LiteralPath $ArtifactZip -DestinationPath $Destination -Force
'@
  Set-Content -LiteralPath $scriptPath -Value $scriptText -Encoding UTF8
  return $scriptPath
}

function Invoke-PrepareRelease {
  param([Parameter(Mandatory = $true)][string]$StepPrefix)

  if (-not $ArtifactZip) {
    throw "$Mode requires -ArtifactZip."
  }
  if (-not $ReleaseRoot) {
    throw "$Mode requires -ReleaseRoot."
  }

  $artifactZipPath = Get-FullPath $ArtifactZip
  $finalReleaseRoot = Get-FullPath $ReleaseRoot
  $stageRoot = Get-UniquePrepareStageRoot -FinalReleaseRoot $finalReleaseRoot
  $stagedReleaseRoot = Join-Path $stageRoot "release"
  $published = $false
  $preserveStage = $false
  $startedAt = Get-Date

  try {
    Invoke-GateStep -Name "$StepPrefix-preflight" -Details @{
      artifactZip = $artifactZipPath
      releaseRoot = $finalReleaseRoot
      stageRoot = $stageRoot
    } -Action {
      if (-not (Test-Path -LiteralPath $artifactZipPath -PathType Leaf)) {
        throw "Artifact ZIP was not found: $artifactZipPath"
      }
      if (Test-Path -LiteralPath $finalReleaseRoot) {
        throw "Refusing to prepare release because the final release root already exists: $finalReleaseRoot. Clean or reset this path before retrying strict Gate Day."
      }
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $finalReleaseRoot) | Out-Null
      return @{
        artifactZip = $artifactZipPath
        releaseRoot = $finalReleaseRoot
        stageRoot = $stageRoot
      }
    }

    Invoke-GateStep -Name "$StepPrefix-extracting" -Details @{
      artifactZip = $artifactZipPath
      stageRoot = $stageRoot
      timeoutSeconds = $StepTimeoutSeconds
    } -Action {
      New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null
      $extractScript = New-ReleaseExtractionScript
      $result = Invoke-GateProcess -Step "$StepPrefix-extracting" -FilePath "powershell.exe" -Arguments @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        $extractScript,
        "-ArtifactZip",
        $artifactZipPath,
        "-Destination",
        $stageRoot
      ) -AllowUnknownExitCode -HeartbeatSeconds 15 -HeartbeatFields @{
        artifactZip = $artifactZipPath
        stageRoot = $stageRoot
      }
      if (-not (Test-Path -LiteralPath $stagedReleaseRoot -PathType Container)) {
        throw "Artifact ZIP did not contain the required top-level release directory."
      }
      return @{
        stageRoot = $stageRoot
        stagedReleaseRoot = $stagedReleaseRoot
        extractedFileCount = Get-FileCount -Path $stagedReleaseRoot
        stdoutPath = $result.stdoutPath
        stderrPath = $result.stderrPath
      }
    }

    $verification = Invoke-GateStep -Name "$StepPrefix-verifying" -Details @{
      stagedReleaseRoot = $stagedReleaseRoot
      expectedVersion = $ExpectedVersion
      expectedSourceCommit = $ExpectedSourceCommit
    } -Action {
      $nodeExe = Get-NodeExe -Root $stagedReleaseRoot
      if (-not (Test-Path -LiteralPath $nodeExe -PathType Leaf)) {
        throw "Extracted release is missing bundled Node runtime: $nodeExe"
      }
      $verifyScript = New-ReleaseVerificationScript -ReleaseRoot $stagedReleaseRoot
      $result = Invoke-GateProcess -Step "$StepPrefix-verifying" -FilePath $nodeExe -Arguments @(
        $verifyScript,
        $stagedReleaseRoot
      ) -AllowUnknownExitCode
      $parsed = Get-Content -LiteralPath $result.stdoutPath -Raw | ConvertFrom-Json
      if ($ExpectedVersion -and $parsed.version -ne $ExpectedVersion) {
        throw "Prepared release version $($parsed.version) did not match expected version $ExpectedVersion."
      }
      if ($ExpectedSourceCommit -and $parsed.sourceCommit -ne $ExpectedSourceCommit) {
        throw "Prepared release source commit $($parsed.sourceCommit) did not match expected source commit $ExpectedSourceCommit."
      }
      return @{
        version = $parsed.version
        releaseDate = $parsed.releaseDate
        sourceCommit = $parsed.sourceCommit
        fileCount = $parsed.fileCount
      }
    }

    Invoke-GateStep -Name "$StepPrefix-published" -Details @{
      stagedReleaseRoot = $stagedReleaseRoot
      releaseRoot = $finalReleaseRoot
    } -Action {
      if (Test-Path -LiteralPath $finalReleaseRoot) {
        throw "Refusing to publish prepared release because final release root appeared during preparation: $finalReleaseRoot."
      }
      Move-Item -LiteralPath $stagedReleaseRoot -Destination $finalReleaseRoot
      $published = $true
      return @{
        releaseRoot = $finalReleaseRoot
        version = $verification.version
        sourceCommit = $verification.sourceCommit
        fileCount = Get-FileCount -Path $finalReleaseRoot
        elapsedSeconds = [int][Math]::Ceiling(((Get-Date) - $startedAt).TotalSeconds)
      }
    }

    if (Test-Path -LiteralPath $stageRoot) {
      Remove-Item -LiteralPath $stageRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
    return "succeeded"
  } catch {
    if ($script:lastGateProcessResult -and $script:lastGateProcessResult.timedOut) {
      $preserveStage = $true
    }
    Write-GateEvent -Event "BELLFIELD_GATE_ADMIN_STEP" -Fields @{
      step = "$StepPrefix-cleanup-guidance"
      status = "failed"
      artifactZip = $artifactZipPath
      releaseRoot = $finalReleaseRoot
      stageRoot = $stageRoot
      stagePreserved = [bool]$preserveStage
      published = [bool]$published
      cleanupGuidance = if ($published) {
        "Final release root may exist. Inspect before retrying; strict Gate Day should reset the machine or remove the release root intentionally."
      } elseif ($preserveStage) {
        "Extraction timed out. Preserve the stage for inspection or remove it intentionally before retrying."
      } else {
        "Preparation failed before publish. The runner will remove the stage if possible; remove any leftover stage before retrying."
      }
    }
    if ((-not $published) -and (-not $preserveStage) -and (Test-Path -LiteralPath $stageRoot)) {
      Remove-Item -LiteralPath $stageRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
    throw
  }
}

function Invoke-GateStep {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][scriptblock]$Action,
    [hashtable]$Details = @{}
  )

  Write-GateEvent -Event "BELLFIELD_GATE_ADMIN_STEP" -Fields (@{
      step = $Name
      status = "started"
    } + $Details)

  if ($DryRun) {
    Write-GateEvent -Event "BELLFIELD_GATE_ADMIN_STEP" -Fields (@{
        step = $Name
        status = "skipped"
        reason = "dry-run"
      } + $Details)
    return [pscustomobject]@{
      skipped = $true
      reason = "dry-run"
    }
  }

  try {
    $result = & $Action
    Write-GateEvent -Event "BELLFIELD_GATE_ADMIN_STEP" -Fields (@{
        step = $Name
        status = "succeeded"
        result = $result
      } + $Details)
    return $result
  } catch {
    $script:lastFailedStep = $Name
    $errorDetail = if ($_.Exception.Message) { $_.Exception.Message } else { [string]$_ }
    $failureFields = @{
      step = $Name
      status = "failed"
      error = $errorDetail
    } + $Details

    if ($_.Exception.Message -and $_.Exception.Message.StartsWith("@{")) {
      $failureFields["rawError"] = $_.Exception.Message
    }
    Write-GateEvent -Event "BELLFIELD_GATE_ADMIN_STEP" -Fields $failureFields
    throw
  }
}

function Invoke-HumanAction {
  param(
    [Parameter(Mandatory = $true)][string]$Step,
    [Parameter(Mandatory = $true)][string]$Message,
    [switch]$Pause
  )

  Write-GateEvent -Event "BELLFIELD_GATE_ADMIN_STEP" -Fields @{
    step = $Step
    status = "needs-human-action"
    message = $Message
  }
  Write-Host ""
  Write-Host "NEEDS HUMAN ACTION: $Message"
  Write-Host ""

  if ($Pause -and -not $DryRun) {
    Read-Host "Press Enter after completing the action"
    Write-GateEvent -Event "BELLFIELD_GATE_ADMIN_STEP" -Fields @{
      step = $Step
      status = "succeeded"
      message = "Operator acknowledged and continued."
    }
  }
}

function Get-NodeExe {
  param([Parameter(Mandatory = $true)][string]$Root)
  return Join-Path $Root "runtime\node\node.exe"
}

function Get-InstallTool {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Name
  )
  return Join-Path $Root "tools\install\$Name"
}

function Invoke-NodeInstallTool {
  param(
    [Parameter(Mandatory = $true)][string]$Step,
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$ScriptName,
    [string[]]$Arguments = @(),
    [switch]$AllowNonZero
  )

  $nodeExe = Get-NodeExe -Root $Root
  $scriptPath = Get-InstallTool -Root $Root -Name $ScriptName
  return Invoke-GateProcess -Step $Step -FilePath $nodeExe -Arguments (@($scriptPath) + $Arguments) -AllowNonZero:$AllowNonZero
}

function Invoke-PowerShellInstallTool {
  param(
    [Parameter(Mandatory = $true)][string]$Step,
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$ScriptName,
    [string[]]$Arguments = @(),
    [switch]$AllowNonZero
  )

  $scriptPath = Get-InstallTool -Root $Root -Name $ScriptName
  return Invoke-GateProcess -Step $Step -FilePath "powershell.exe" -Arguments (@(
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      $scriptPath
    ) + $Arguments) -AllowNonZero:$AllowNonZero
}

function Read-ServerEnvValue {
  param([string]$Name)
  $envPath = Join-Path $InstallRoot "bellfield-server.env"
  if (-not (Test-Path -LiteralPath $envPath)) {
    return $null
  }
  foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -match "^\s*#") {
      continue
    }
    if ($line -match "^\s*$([regex]::Escape($Name))=(.*)$") {
      return $Matches[1].Trim()
    }
  }
  return $null
}

function Get-LicensePath {
  $configuredPath = Read-ServerEnvValue -Name "BELLFIELD_LICENSE_PATH"
  if ($configuredPath) {
    return $configuredPath
  }
  return Join-Path $InstallRoot "data\license\bellfield-license.json"
}

function Invoke-ServiceEvidence {
  param([string]$Step = "collect-service-evidence")
  $outputPath = Join-Path $EvidenceRoot "service-evidence-$RunId.json"
  Invoke-PowerShellInstallTool -Step $Step -Root $ReleaseRoot -ScriptName "collect-windows-service-evidence.ps1" -Arguments @(
    "-InstallRoot",
    $InstallRoot,
    "-OutputPath",
    $outputPath
  )
  return @{
    outputPath = $outputPath
  }
}

function Invoke-LanEvidence {
  param([string]$Step = "collect-lan-evidence")
  $outputPath = Join-Path $EvidenceRoot "lan-evidence-$RunId.json"
  $arguments = @("-InstallRoot", $InstallRoot, "-OutputPath", $outputPath)
  if ($LanIp) {
    $arguments += @("-LanIp", $LanIp)
  }
  Invoke-PowerShellInstallTool -Step $Step -Root $ReleaseRoot -ScriptName "collect-windows-lan-evidence.ps1" -Arguments $arguments
  return @{
    outputPath = $outputPath
  }
}

function Invoke-UpdateEvidence {
  param([string]$Step = "collect-update-evidence")
  # collect-only writes read-only state capture; give it a distinct filename so
  # it cannot be misread as evidence of an actual Gate 3 update attempt.
  $outputName = if ($Mode -eq "collect-only") {
    "update-state-evidence-$RunId.json"
  } else {
    "gate3-update-evidence-$RunId.json"
  }
  $outputPath = Join-Path $EvidenceRoot $outputName
  $collectorRoot = Join-Path $InstallRoot "release"
  Invoke-PowerShellInstallTool -Step $Step -Root $collectorRoot -ScriptName "collect-windows-update-evidence.ps1" -Arguments @(
    "-InstallRoot",
    $InstallRoot,
    "-OutputPath",
    $outputPath,
    "-HealthUrl",
    $HealthUrl
  )
  return @{
    outputPath = $outputPath
  }
}

function Invoke-HealthProbe {
  $response = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 10
  return @{
    url = $HealthUrl
    response = $response
  }
}

function Get-BellFieldServiceStates {
  $states = @()
  foreach ($name in @("bellfield-postgres", "bellfield-api", "bellfield-worker", "bellfield-office-web")) {
    try {
      $service = Get-CimInstance Win32_Service -Filter "Name='$name'" -ErrorAction Stop
      if ($service) {
        $states += [pscustomobject]@{
          name = $service.Name
          state = $service.State
          status = $service.Status
          startMode = $service.StartMode
          startName = $service.StartName
          processId = $service.ProcessId
          exitCode = $service.ExitCode
        }
      } else {
        $states += [pscustomobject]@{
          name = $name
          state = "missing"
        }
      }
    } catch {
      $states += [pscustomobject]@{
        name = $name
        state = "unknown"
        error = $_.Exception.Message
      }
    }
  }
  return @($states)
}

function Copy-ReleaseManifestSnapshot {
  $manifestPath = Join-Path (Join-Path $InstallRoot "release") "bellfield-build-manifest.json"
  $outputPath = Join-Path $EvidenceRoot "release-manifest-$RunId.json"
  if (Test-Path -LiteralPath $manifestPath) {
    Copy-Item -LiteralPath $manifestPath -Destination $outputPath -Force
  }
  return @{
    manifestPath = $manifestPath
    outputPath = $outputPath
    exists = Test-Path -LiteralPath $manifestPath
  }
}

function Get-LatestUpdateLogPath {
  $logRoot = Join-Path $InstallRoot "data\logs\update"
  if (-not (Test-Path -LiteralPath $logRoot)) {
    return $null
  }
  $latest = Get-ChildItem -LiteralPath $logRoot -File -Filter "update-*.jsonl" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
  if (-not $latest) {
    return $null
  }
  return $latest.FullName
}

function Get-TerminalUpdateEvent {
  param([string]$Path)
  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) {
    return $null
  }
  $terminalEvents = @(
    "BELLFIELD_UPDATE_RESULT",
    "BELLFIELD_UPDATE_FAILURE",
    "BELLFIELD_UPDATE_LOCKED",
    "BELLFIELD_UPDATE_REJECTED",
    "BELLFIELD_UPDATE_FATAL"
  )
  $events = @()
  foreach ($line in [System.IO.File]::ReadLines($Path)) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }
    try {
      $event = $line | ConvertFrom-Json
      $events += $event
    } catch {
      continue
    }
  }
  for ($index = $events.Count - 1; $index -ge 0; $index -= 1) {
    if ($terminalEvents -contains [string]$events[$index].event) {
      return $events[$index]
    }
  }
  return $null
}

function Copy-LatestUpdateLog {
  $latestLogPath = Get-LatestUpdateLogPath
  if (-not $latestLogPath) {
    return @{
      copied = $false
      sourcePath = $null
      terminalEvent = $null
      reason = "No durable update JSONL log was found."
    }
  }
  $destinationPath = Join-Path $EvidenceRoot "gate3-update-durable-$RunId-$(Split-Path -Leaf $latestLogPath)"
  Copy-Item -LiteralPath $latestLogPath -Destination $destinationPath -Force
  return @{
    copied = $true
    sourcePath = $latestLogPath
    destinationPath = $destinationPath
    terminalEvent = Get-TerminalUpdateEvent -Path $latestLogPath
  }
}

function Parse-BackupSetPath {
  param([string]$StdoutPath)
  $content = Get-Content -LiteralPath $StdoutPath -Raw
  foreach ($line in ($content -split "`r?`n")) {
    if ($line -like "BELLFIELD_BACKUP_RESULT *") {
      $json = $line -replace "^BELLFIELD_BACKUP_RESULT\s+", ""
      $parsed = $json | ConvertFrom-Json
      return [string]$parsed.backupSetPath
    }
  }
  throw "Packaged backup output did not include BELLFIELD_BACKUP_RESULT."
}

function Invoke-Gate1PrepareRelease {
  return Invoke-PrepareRelease -StepPrefix "gate1-prepare-release"
}

function Invoke-Gate1AdminInstall {
  Invoke-GateStep -Name "write-server-config" -Action {
    Invoke-NodeInstallTool -Step "write-server-config" -Root $ReleaseRoot -ScriptName "write-server-config.mjs" -Arguments @("--install-root=$InstallRoot")
  }

  $lanArgs = @("-InstallRoot", $InstallRoot)
  if ($LanIp) { $lanArgs += @("-LanIp", $LanIp) }
  if ($LanHost) { $lanArgs += @("-LanHost", $LanHost) }
  if ($SetCurrentNetworkPrivate) { $lanArgs += "-SetCurrentNetworkPrivate" }
  Invoke-GateStep -Name "configure-lan-access" -Action {
    Invoke-PowerShellInstallTool -Step "configure-lan-access" -Root $ReleaseRoot -ScriptName "configure-windows-lan-access.ps1" -Arguments $lanArgs
  }

  Invoke-GateStep -Name "provision-postgres" -Action {
    Invoke-NodeInstallTool -Step "provision-postgres" -Root $ReleaseRoot -ScriptName "provision-postgres.mjs" -Arguments @("--install-root=$InstallRoot")
  }

  Invoke-GateStep -Name "run-packaged-migrations" -Action {
    Invoke-NodeInstallTool -Step "run-packaged-migrations" -Root $ReleaseRoot -ScriptName "run-packaged-migrations.mjs" -Arguments @("--install-root=$InstallRoot")
  }

  Invoke-GateStep -Name "verify-license-file" -Action {
    $licensePath = Get-LicensePath
    if (-not (Test-Path -LiteralPath $licensePath)) {
      Invoke-HumanAction -Step "license-file-required" -Message "Place the BellField license at $licensePath, then return to this elevated runner." -Pause
    }
    if (-not (Test-Path -LiteralPath $licensePath)) {
      throw "License file is still missing at $licensePath."
    }
    return @{ licensePath = $licensePath }
  }

  Invoke-GateStep -Name "render-windows-services" -Action {
    Invoke-NodeInstallTool -Step "render-windows-services" -Root $ReleaseRoot -ScriptName "render-windows-services.mjs" -Arguments @("--install-root=$InstallRoot", "--release-root=$ReleaseRoot")
  }

  Invoke-GateStep -Name "install-windows-services" -Action {
    Invoke-PowerShellInstallTool -Step "install-windows-services" -Root $ReleaseRoot -ScriptName "install-windows-services.ps1" -Arguments @("-ReleaseRoot", $ReleaseRoot)
  }

  Invoke-GateStep -Name "collect-service-evidence" -Action { Invoke-ServiceEvidence }
  Invoke-GateStep -Name "collect-lan-evidence" -Action { Invoke-LanEvidence }

  Invoke-GateStep -Name "copy-first-owner-setup-token-metadata" -Action {
    $result = Invoke-PowerShellInstallTool -Step "copy-first-owner-setup-token-metadata" -Root $ReleaseRoot -ScriptName "copy-first-owner-setup-token.ps1" -Arguments @("-InstallRoot", $InstallRoot)
    $stdout = Get-Content -LiteralPath $result.stdoutPath -Raw | ConvertFrom-Json
    return @{
      installRoot = $stdout.installRoot
      sourceFile = $stdout.sourceFile
      sourceLine = $stdout.sourceLine
      tokenLineCount = $stdout.tokenLineCount
      copiedToClipboard = $stdout.copiedToClipboard
      multipleTokenWarning = $stdout.multipleTokenWarning
    }
  }

  Invoke-HumanAction -Step "create-first-owner-in-browser" -Message "Create the first owner in the browser using the copied setup token. The runner stops here by design."
  return "needs-human-action"
}

function Invoke-Gate1PostRebootCheck {
  Invoke-GateStep -Name "collect-service-evidence" -Action { Invoke-ServiceEvidence }
  Invoke-GateStep -Name "collect-lan-evidence" -Action { Invoke-LanEvidence }
  Invoke-GateStep -Name "record-service-states" -Action { Get-BellFieldServiceStates }
  Invoke-GateStep -Name "health" -Action { Invoke-HealthProbe }
  return "succeeded"
}

function Invoke-Gate2BackupRestore {
  $selectedBackupSet = $BackupSet
  if (-not $selectedBackupSet) {
    $backupResult = Invoke-GateStep -Name "run-packaged-backup" -Action {
      Invoke-NodeInstallTool -Step "run-packaged-backup" -Root $ReleaseRoot -ScriptName "run-packaged-backup.mjs" -Arguments @("--install-root=$InstallRoot")
    }
    if ($DryRun) {
      $selectedBackupSet = "<dry-run-backup-set>"
    } else {
      $selectedBackupSet = Parse-BackupSetPath -StdoutPath $backupResult.stdoutPath
    }
    Write-GateEvent -Event "BELLFIELD_GATE_ADMIN_STEP" -Fields @{
      step = "run-packaged-backup"
      status = "succeeded"
      backupSetPath = $selectedBackupSet
    }
  } else {
    Write-GateEvent -Event "BELLFIELD_GATE_ADMIN_STEP" -Fields @{
      step = "run-packaged-backup"
      status = "skipped"
      reason = "backup-set-provided"
      backupSetPath = $selectedBackupSet
    }
  }

  Invoke-HumanAction -Step "create-post-backup-marker" -Message "Create the browser marker data that restore must erase, then return here." -Pause

  Invoke-GateStep -Name "restore-backup" -Details @{ backupSetPath = $selectedBackupSet } -Action {
    Invoke-NodeInstallTool -Step "restore-backup" -Root $ReleaseRoot -ScriptName "restore-backup.mjs" -Arguments @(
      "--release-root=$ReleaseRoot",
      "--install-root=$InstallRoot",
      "--backup-set=$selectedBackupSet",
      "--confirm=RESTORE"
    )
  }

  Invoke-GateStep -Name "collect-service-evidence" -Action { Invoke-ServiceEvidence }
  Invoke-GateStep -Name "health" -Action { Invoke-HealthProbe }
  return "succeeded"
}

function Invoke-Gate3PrepareUpdateArtifact {
  return Invoke-PrepareRelease -StepPrefix "gate3-prepare-update-artifact"
}

function Invoke-Gate3Update {
  if (-not $UpdateArtifactRoot) {
    throw "gate3-update requires -UpdateArtifactRoot."
  }
  $currentReleaseRoot = Join-Path $InstallRoot "release"
  $nodeExe = Get-NodeExe -Root $UpdateArtifactRoot
  $updateScript = Get-InstallTool -Root $UpdateArtifactRoot -Name "update-bellfield.mjs"
  $updateResult = Invoke-GateStep -Name "run-update-bellfield" -Action {
    Invoke-GateProcess -Step "run-update-bellfield" -FilePath $nodeExe -AllowNonZero -Arguments @(
      $updateScript,
      "--install-root=$InstallRoot",
      "--current-release-root=$currentReleaseRoot",
      "--update-artifact-root=$UpdateArtifactRoot",
      "--confirm=UPDATE"
    )
  }

  if ($DryRun) {
    $dryRunNeedsCollector = @("nonzero", "timeout", "quiet", "missing-terminal") -contains $DryRunGate3Outcome
    $dryRunTerminalEvent = if ($DryRunGate3Outcome -eq "missing-terminal") {
      $null
    } elseif ($DryRunGate3Outcome -eq "success") {
      @{
        event = "BELLFIELD_UPDATE_RESULT"
        status = "succeeded"
      }
    } else {
      @{
        event = "BELLFIELD_UPDATE_FAILURE"
        status = "failed"
      }
    }
    Write-GateEvent -Event "BELLFIELD_GATE_ADMIN_STEP" -Fields @{
      step = "dry-run-gate3-update-outcome"
      status = "succeeded"
      dryRunOutcome = $DryRunGate3Outcome
      needsCollector = $dryRunNeedsCollector
      simulatedUpdateResult = @{
        timedOut = $DryRunGate3Outcome -eq "timeout"
        exitCode = if ($DryRunGate3Outcome -eq "nonzero") { 1 } else { 0 }
        stdoutQuiet = $DryRunGate3Outcome -eq "quiet"
        stderrQuiet = $DryRunGate3Outcome -eq "quiet"
        terminalEventPresent = $null -ne $dryRunTerminalEvent
      }
    }
    Invoke-GateStep -Name "copy-durable-update-jsonl" -Action { Copy-LatestUpdateLog }
    if ($dryRunNeedsCollector) {
      Invoke-GateStep -Name "collect-update-evidence" -Action { Invoke-UpdateEvidence }
    } else {
      Write-GateEvent -Event "BELLFIELD_GATE_ADMIN_STEP" -Fields @{
        step = "collect-update-evidence"
        status = "skipped"
        reason = "dry-run-no-collector-needed"
      }
    }
    Write-GateEvent -Event "BELLFIELD_GATE_ADMIN_STEP" -Fields @{
      step = "record-terminal-update-event"
      status = if ($dryRunTerminalEvent) { "succeeded" } else { "failed" }
      reason = "dry-run"
      terminalUpdateEvent = $dryRunTerminalEvent
    }
    return "succeeded"
  }

  $logCopy = Invoke-GateStep -Name "copy-durable-update-jsonl" -Action { Copy-LatestUpdateLog }
  $stdoutQuiet = -not (Get-OutputTail -Path $updateResult.stdoutPath -MaxChars 1)
  $stderrQuiet = -not (Get-OutputTail -Path $updateResult.stderrPath -MaxChars 1)
  $terminalEvent = $logCopy.terminalEvent
  $needsCollector = $updateResult.timedOut -or
    ($updateResult.exitCode -ne 0) -or
    ($stdoutQuiet -and $stderrQuiet) -or
    (-not $terminalEvent)

  if ($needsCollector) {
    Invoke-GateStep -Name "collect-update-evidence" -Action { Invoke-UpdateEvidence }
  }

  Write-GateEvent -Event "BELLFIELD_GATE_ADMIN_STEP" -Fields @{
    step = "record-terminal-update-event"
    status = if ($terminalEvent) { "succeeded" } else { "failed" }
    terminalUpdateEvent = $terminalEvent
    copiedUpdateLog = $logCopy
  }

  if ($updateResult.timedOut) {
    throw "Updater timed out."
  }
  if ($updateResult.exitCode -ne 0) {
    throw "Updater exited with code $($updateResult.exitCode)."
  }
  if (-not $terminalEvent) {
    throw "Updater did not produce a terminal durable update event."
  }
  return "succeeded"
}

function Invoke-CollectOnly {
  Invoke-GateStep -Name "collect-service-evidence" -Action { Invoke-ServiceEvidence }
  Invoke-GateStep -Name "collect-lan-evidence" -Action { Invoke-LanEvidence }
  Invoke-GateStep -Name "collect-update-evidence" -Action { Invoke-UpdateEvidence }
  Invoke-GateStep -Name "health" -Action { Invoke-HealthProbe }
  Invoke-GateStep -Name "release-manifest-snapshot" -Action { Copy-ReleaseManifestSnapshot }
  return "succeeded"
}

function Invoke-ProcessCaptureSmoke {
  $powerShellCommand = Get-Command "powershell.exe" -ErrorAction SilentlyContinue
  if (-not $powerShellCommand) {
    throw "process-capture-smoke requires Windows PowerShell at powershell.exe."
  }

  for ($index = 1; $index -le 8; $index += 1) {
    $stepName = "process-capture-zero-$index"
    Invoke-GateStep -Name $stepName -Action {
      $result = Invoke-GateProcess -Step $stepName -FilePath "powershell.exe" -Arguments @(
        "-NoProfile",
        "-Command",
        "exit 0"
      )
      if ($result.exitCodeUnknown -or $result.exitCode -ne 0) {
        throw "Process capture zero probe $index did not return exit code 0."
      }
      return $result
    }
  }

  Invoke-GateStep -Name "process-capture-nonzero" -Action {
    $result = Invoke-GateProcess -Step "process-capture-nonzero" -FilePath "powershell.exe" -Arguments @(
      "-NoProfile",
      "-Command",
      "exit 7"
    ) -AllowNonZero
    if ($result.exitCodeUnknown -or $result.exitCode -ne 7) {
      throw "Process capture nonzero probe did not preserve exit code 7."
    }
    return $result
  }

  $outputProbePath = Join-Path $script:processOutputRoot "process-capture-output-probe.ps1"
  $outputProbeScript = @'
$ErrorActionPreference = "Stop"
Write-Output "bellfield stdout probe"
[Console]::Error.WriteLine("bellfield stderr probe")
exit 0
'@
  [System.IO.File]::WriteAllText($outputProbePath, $outputProbeScript, (New-Object System.Text.UTF8Encoding($false)))

  Invoke-GateStep -Name "process-capture-output" -Action {
    $result = Invoke-GateProcess -Step "process-capture-output" -FilePath "powershell.exe" -Arguments @(
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      $outputProbePath
    )
    if ($result.exitCodeUnknown -or $result.exitCode -ne 0) {
      throw "Process capture output probe did not return exit code 0."
    }
    if ($result.stdoutTail -notmatch "bellfield stdout probe") {
      throw "Process capture output probe did not capture stdout."
    }
    if ($result.stderrTail -notmatch "bellfield stderr probe") {
      throw "Process capture output probe did not capture stderr."
    }
    return $result
  }

  return "succeeded"
}

function Invoke-FailureEvidenceCollection {
  # Best-effort service/LAN evidence in the SAME elevated session after a
  # mutating-mode failure, so evidence survives even when the separate
  # collect-only runner (a second UAC prompt) is missed or cancelled, as in
  # rerun-24. collect-only remains the documented fallback path.
  if ($script:failureEvidenceAttempted) {
    return
  }
  $script:failureEvidenceAttempted = $true
  if ($DryRun -or -not (Test-IsAdministrator)) {
    return
  }
  if (@("gate1-admin-install", "gate2-backup-restore", "gate3-update") -notcontains $Mode) {
    return
  }

  $collectors = @(
    @{ step = "failure-service-evidence"; action = { Invoke-ServiceEvidence -Step "failure-service-evidence" } },
    @{ step = "failure-lan-evidence"; action = { Invoke-LanEvidence -Step "failure-lan-evidence" } }
  )
  foreach ($collector in $collectors) {
    try {
      $collected = & $collector.action
      Write-GateEvent -Event "BELLFIELD_GATE_ADMIN_STEP" -Fields @{
        step = $collector.step
        status = "succeeded"
        outputPath = $collected.outputPath
      }
    } catch {
      Write-GateEvent -Event "BELLFIELD_GATE_ADMIN_STEP" -Fields @{
        step = $collector.step
        status = "failed"
        error = $_.Exception.Message
        message = "Best-effort failure evidence collection failed; run collect-only for full evidence."
      }
    }
  }
}

function Invoke-SelectedMode {
  switch ($Mode) {
    "gate1-prepare-release" { return Invoke-Gate1PrepareRelease }
    "gate1-admin-install" { return Invoke-Gate1AdminInstall }
    "gate1-post-reboot-check" { return Invoke-Gate1PostRebootCheck }
    "gate2-backup-restore" { return Invoke-Gate2BackupRestore }
    "gate3-prepare-update-artifact" { return Invoke-Gate3PrepareUpdateArtifact }
    "gate3-update" { return Invoke-Gate3Update }
    "collect-only" { return Invoke-CollectOnly }
    "process-capture-smoke" { return Invoke-ProcessCaptureSmoke }
    default { throw "Unsupported Gate Day admin runner mode: $Mode" }
  }
}

Normalize-GateRunnerPathInputs
Initialize-GateEvidence -AllowPartial:((-not (Test-IsAdministrator)) -and (-not $ElevatedChild))

if ((-not (Test-IsAdministrator)) -and (-not $NoSelfElevate)) {
  Invoke-SelfElevation
}

if ((-not (Test-IsAdministrator)) -and (-not $DryRun) -and (-not ($NoSelfElevate -and (Test-ModeAllowsNonElevatedNoSelfElevate)))) {
  Write-GateFailure -ErrorRecord "Gate Day admin runner must run elevated. Re-run without -NoSelfElevate, use -DryRun for smoke tests, or restrict -NoSelfElevate to a prepare mode with a writable temp release root." -Fields @{
    status = "rejected"
  }
  exit 1
}

$exitCode = 0
try {
  $launchStatus = if ($ElevatedChild) {
    "elevated-child-started"
  } elseif ($DryRun) {
    "dry-run-started"
  } elseif (-not (Test-IsAdministrator)) {
    "non-elevated-prepare-started"
  } else {
    "already-elevated-started"
  }
  Write-GateLaunch $launchStatus @{
    dryRun = [bool]$DryRun
    isAdministrator = Test-IsAdministrator
  }
  Start-GateTranscript
  $modeOutput = @(Invoke-SelectedMode)
  $resultStatus = [string]($modeOutput | Select-Object -Last 1)
  Write-GateResult $resultStatus
} catch {
  $exitCode = 1
  Write-GateFailure -ErrorRecord $_
  Invoke-FailureEvidenceCollection
} finally {
  if (-not $script:terminalEventWritten) {
    Write-GateResult "failed"
  }
  Stop-GateTranscript
}

exit $exitCode
