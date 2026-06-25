import { spawnSync } from 'node:child_process';

export function quotePowerShellString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function stopWindowsService(serviceName, timeoutMs) {
  runServiceCommand({
    action: 'stop',
    serviceName,
    timeoutMs,
    command: `
$service = Get-Service -Name ${quotePowerShellString(serviceName)} -ErrorAction SilentlyContinue
if ($null -eq $service) { return }
if ($service.Status -ne 'Stopped') {
  Stop-Service -Name ${quotePowerShellString(serviceName)} -Force -ErrorAction Stop
  $service.WaitForStatus('Stopped', [TimeSpan]::FromMilliseconds(${timeoutMs}))
}
`
  });
}

export function startWindowsService(serviceName, timeoutMs) {
  runServiceCommand({
    action: 'start',
    serviceName,
    timeoutMs,
    command: `
$service = Get-Service -Name ${quotePowerShellString(serviceName)} -ErrorAction SilentlyContinue
if ($null -eq $service) { return }
if ($service.Status -ne 'Running') {
  Start-Service -Name ${quotePowerShellString(serviceName)} -ErrorAction Stop
  $service.WaitForStatus('Running', [TimeSpan]::FromMilliseconds(${timeoutMs}))
}
`
  });
}

function runServiceCommand({ action, serviceName, timeoutMs, command }) {
  try {
    runPowerShellCommand(command, { timeoutMs: timeoutMs + 10_000 });
  } catch (error) {
    throw new Error(
      `Failed to ${action} Windows service ${serviceName}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function runPowerShellCommand(command, options = {}) {
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      shell: false,
      timeout: options.timeoutMs
    }
  );

  if (result.error) {
    const timeoutDetail =
      result.error.code === 'ETIMEDOUT' && options.timeoutMs
        ? ` timed out after ${options.timeoutMs}ms`
        : '';
    throw new Error(`powershell.exe${timeoutDetail} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(
      `powershell.exe exited with ${result.status ?? 1}${detail ? `: ${detail}` : ''}`
    );
  }
}
