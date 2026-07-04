import assert from 'node:assert/strict';
import test from 'node:test';

import { waitForPostgresReady } from './postgres-readiness.mjs';

function fakeClock() {
  let current = 0;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    }
  };
}

test('returns ready on the first successful pg_isready attempt', async () => {
  const calls = [];
  const clock = fakeClock();
  const result = await waitForPostgresReady({
    pgIsReadyPath: 'pg_isready.exe',
    host: '127.0.0.1',
    port: 5432,
    timeoutMs: 10_000,
    spawn: (command, args) => {
      calls.push({ command, args });
      return { status: 0, stdout: 'accepting connections', stderr: '' };
    },
    now: clock.now,
    sleep: async () => {}
  });

  assert.equal(result.ready, true);
  assert.equal(result.attempts, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['-h', '127.0.0.1', '-p', '5432', '-t', '3']);
});

test('retries while postgres is starting up and succeeds once ready', async () => {
  const clock = fakeClock();
  let attempt = 0;
  const result = await waitForPostgresReady({
    pgIsReadyPath: 'pg_isready.exe',
    host: '127.0.0.1',
    port: 5432,
    timeoutMs: 10_000,
    intervalMs: 500,
    spawn: () => {
      attempt += 1;
      if (attempt < 4) {
        return { status: 1, stdout: '', stderr: 'no response' };
      }
      return { status: 0, stdout: 'accepting connections', stderr: '' };
    },
    now: clock.now,
    sleep: async (ms) => {
      clock.advance(ms);
    }
  });

  assert.equal(result.ready, true);
  assert.equal(result.attempts, 4);
});

test('throws with attempt evidence when the deadline expires', async () => {
  const clock = fakeClock();
  await assert.rejects(
    waitForPostgresReady({
      pgIsReadyPath: 'pg_isready.exe',
      host: '127.0.0.1',
      port: 5432,
      timeoutMs: 2_000,
      intervalMs: 1_000,
      spawn: () => ({ status: 2, stdout: '', stderr: 'is the server running?' }),
      now: clock.now,
      sleep: async (ms) => {
        clock.advance(ms);
      }
    }),
    (error) => {
      assert.match(error.message, /did not accept connections on 127\.0\.0\.1:5432/);
      assert.match(error.message, /pg_isready attempts/);
      assert.match(error.message, /is the server running\?/);
      return true;
    }
  );
});

test('throws when pg_isready itself cannot run', async () => {
  await assert.rejects(
    waitForPostgresReady({
      pgIsReadyPath: 'missing-pg_isready.exe',
      host: '127.0.0.1',
      port: 5432,
      timeoutMs: 2_000,
      spawn: () => ({ error: new Error('spawn ENOENT'), status: null }),
      now: () => 0,
      sleep: async () => {}
    }),
    /Failed to run pg_isready/
  );
});
