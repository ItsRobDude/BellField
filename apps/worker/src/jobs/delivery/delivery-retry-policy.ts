/**
 * Mirrors the API's delivery retry policy
 * (apps/api/src/modules/customer-delivery/delivery-retry.ts); apps are
 * intentionally not cross-imported.
 */
export const estimateEmailQueueExpiryMs = 24 * 60 * 60 * 1000;

const RETRY_DELAY_MINUTES = [2, 10, 30, 60, 120];

export function nextDeliveryRetryDelayMs(failedAttemptNumber: number): number {
  const index = Math.max(0, Math.min(failedAttemptNumber, RETRY_DELAY_MINUTES.length) - 1);
  return RETRY_DELAY_MINUTES[index] * 60_000;
}
