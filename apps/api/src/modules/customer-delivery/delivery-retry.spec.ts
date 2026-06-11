import { estimateEmailQueueExpiryMs, nextDeliveryRetryDelayMs } from './delivery-retry';

describe('delivery retry policy', () => {
  it('uses a growing backoff schedule', () => {
    expect(nextDeliveryRetryDelayMs(1)).toBe(2 * 60_000);
    expect(nextDeliveryRetryDelayMs(2)).toBe(10 * 60_000);
    expect(nextDeliveryRetryDelayMs(3)).toBe(30 * 60_000);
    expect(nextDeliveryRetryDelayMs(4)).toBe(60 * 60_000);
    expect(nextDeliveryRetryDelayMs(5)).toBe(120 * 60_000);
  });

  it('caps at the final delay for later attempts', () => {
    expect(nextDeliveryRetryDelayMs(6)).toBe(120 * 60_000);
    expect(nextDeliveryRetryDelayMs(50)).toBe(120 * 60_000);
  });

  it('treats out-of-range attempt numbers defensively', () => {
    expect(nextDeliveryRetryDelayMs(0)).toBe(2 * 60_000);
    expect(nextDeliveryRetryDelayMs(-3)).toBe(2 * 60_000);
  });

  it('pins the queue expiry at 24 hours', () => {
    expect(estimateEmailQueueExpiryMs).toBe(86_400_000);
  });
});
