import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateEmailQueueExpiryMs, nextDeliveryRetryDelayMs } from './delivery-retry-policy';

void test('backoff schedule grows and caps', () => {
  assert.equal(nextDeliveryRetryDelayMs(1), 2 * 60_000);
  assert.equal(nextDeliveryRetryDelayMs(2), 10 * 60_000);
  assert.equal(nextDeliveryRetryDelayMs(3), 30 * 60_000);
  assert.equal(nextDeliveryRetryDelayMs(4), 60 * 60_000);
  assert.equal(nextDeliveryRetryDelayMs(5), 120 * 60_000);
  assert.equal(nextDeliveryRetryDelayMs(12), 120 * 60_000);
  assert.equal(nextDeliveryRetryDelayMs(0), 2 * 60_000);
});

void test('queue expiry is pinned at 24 hours', () => {
  assert.equal(estimateEmailQueueExpiryMs, 86_400_000);
});
