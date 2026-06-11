/** Queued sends expire to failed after 24 hours (delivery-relay-plan.md §6). */
export const estimateEmailQueueExpiryMs = 24 * 60 * 60 * 1000;

// Backoff schedule for retryable delivery failures, indexed by the attempt
// number that just failed. Caps at the final entry; the 24h expiry is the
// stop condition, not this table. The worker delivery retry job mirrors this
// schedule (apps are intentionally not cross-imported).
const RETRY_DELAY_MINUTES = [2, 10, 30, 60, 120];

export function nextDeliveryRetryDelayMs(failedAttemptNumber: number): number {
  const index = Math.max(0, Math.min(failedAttemptNumber, RETRY_DELAY_MINUTES.length) - 1);
  return RETRY_DELAY_MINUTES[index] * 60_000;
}
