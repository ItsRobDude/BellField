import { spawnSync } from 'node:child_process';

// A Windows service reporting Running does not mean PostgreSQL is accepting
// connections: postgres binds its port only after startup recovery finishes.
// Gate Day rerun-27 lost Gate 3 to exactly that gap (ECONNREFUSED from the
// migration client ~4s after the service reached Running). pg_isready speaks
// the postgres protocol, so it also covers the window where the socket is
// bound but the server still rejects clients with "starting up".
export async function waitForPostgresReady({
  pgIsReadyPath,
  host,
  port,
  timeoutMs = 60_000,
  intervalMs = 1_000,
  attemptTimeoutSeconds = 3,
  spawn = spawnSync,
  now = Date.now,
  sleep = sleepMs
}) {
  if (!pgIsReadyPath) {
    throw new Error('waitForPostgresReady requires pgIsReadyPath.');
  }
  if (!host || !port) {
    throw new Error('waitForPostgresReady requires host and port.');
  }

  const startedAt = now();
  const deadline = startedAt + timeoutMs;
  let attempts = 0;
  let lastDetail = '';

  for (;;) {
    attempts += 1;
    const result = spawn(
      pgIsReadyPath,
      ['-h', String(host), '-p', String(port), '-t', String(attemptTimeoutSeconds)],
      {
        encoding: 'utf8',
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: Math.max(attemptTimeoutSeconds * 1000 + 2000, 5000)
      }
    );

    if (result.error) {
      throw new Error(`Failed to run pg_isready at ${pgIsReadyPath}: ${result.error.message}`);
    }
    if (result.status === 0) {
      return {
        ready: true,
        attempts,
        elapsedMs: now() - startedAt
      };
    }

    lastDetail =
      [result.stdout, result.stderr].filter(Boolean).join(' ').trim() ||
      `pg_isready exit ${result.status}`;

    if (now() >= deadline) {
      throw new Error(
        `PostgreSQL did not accept connections on ${host}:${port} within ${timeoutMs}ms ` +
          `(${attempts} pg_isready attempts; last: ${lastDetail}).`
      );
    }
    await sleep(intervalMs);
  }
}

function sleepMs(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}
