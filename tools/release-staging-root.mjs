import { existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

export function resolveReleaseStagingRoot({
  runnerTemp = process.env.RUNNER_TEMP,
  systemTemp = tmpdir()
} = {}) {
  const candidate = String(runnerTemp ?? '').trim();
  if (candidate) {
    const resolvedCandidate = resolve(candidate);
    try {
      if (existsSync(resolvedCandidate) && statSync(resolvedCandidate).isDirectory()) {
        // GitHub keeps RUNNER_TEMP beside the checked-out workspace. On Windows
        // this preserves same-drive pnpm-store reuse without weakening isolation.
        return resolvedCandidate;
      }
    } catch {
      // Fall through to the operating-system temp directory.
    }
  }

  return resolve(systemTemp);
}
