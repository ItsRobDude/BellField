import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JobRunner } from './job-runner';

async function waitFor(predicate: () => boolean): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 1_000) {
      throw new Error('Timed out waiting for condition.');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test('JobRunner runs fixed-interval jobs', async () => {
  let runCount = 0;
  const runner = new JobRunner(
    [
      {
        name: 'no-op',
        intervalMs: 10,
        runOnStart: true,
        run: () => {
          runCount += 1;
        }
      }
    ],
    { log: () => undefined }
  );

  runner.start();
  await waitFor(() => runCount >= 2);
  await runner.stop();

  assert.ok(runCount >= 2);
});

test('JobRunner isolates a throwing job from other jobs', async () => {
  let healthyRunCount = 0;
  const runner = new JobRunner(
    [
      {
        name: 'throws',
        intervalMs: 10,
        runOnStart: true,
        run: () => {
          throw new Error('simulated failure');
        }
      },
      {
        name: 'healthy',
        intervalMs: 10,
        runOnStart: true,
        run: () => {
          healthyRunCount += 1;
        }
      }
    ],
    { log: () => undefined }
  );

  runner.start();
  await waitFor(() => healthyRunCount >= 2);
  await runner.stop();

  assert.ok(healthyRunCount >= 2);
});

test('JobRunner honors an initial delay before falling back to the fixed interval', async () => {
  let runCount = 0;
  const runner = new JobRunner(
    [
      {
        name: 'delayed',
        intervalMs: 1_000,
        initialDelayMs: 10,
        run: () => {
          runCount += 1;
        }
      }
    ],
    { log: () => undefined }
  );

  runner.start();
  await waitFor(() => runCount === 1);
  await runner.stop();

  assert.equal(runCount, 1);
});
