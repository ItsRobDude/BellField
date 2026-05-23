/**
 * Pure scheduling helpers for the field-mobile background sync loop.
 *
 * Quiet by design: the field app should drain the pending queue in the
 * background while the technician workspace is mounted, but should not
 * compete with manual Sync Now, should not auto-retry conflicted or
 * rejected operations, and should back off when network attempts fail
 * so a flaky connection doesn't burn cycles.
 *
 * Defaults:
 *   - base interval: 60 seconds while the workspace is mounted
 *   - foreground regain triggers an immediate attempt outside the timer
 *   - on consecutive failures the next-attempt delay doubles from the
 *     base (60s, 120s, 240s) and caps at 5 minutes
 *
 * All values are exported so callers can tweak under test without
 * reaching for fake timers at every assertion point.
 */

export const BASE_BACKGROUND_SYNC_INTERVAL_MS = 60_000;
export const MAX_BACKGROUND_SYNC_INTERVAL_MS = 300_000;

/**
 * Returns the delay before the next background sync attempt, given the
 * count of consecutive failures since the last successful drain.
 *
 *   failureCount 0 (just succeeded, or first run)  -> 60s
 *   failureCount 1                                  -> 60s
 *   failureCount 2                                  -> 120s
 *   failureCount 3                                  -> 240s
 *   failureCount 4+                                 -> 300s (cap)
 */
export function nextBackgroundSyncDelayMs(failureCount: number): number {
  if (failureCount <= 0) {
    return BASE_BACKGROUND_SYNC_INTERVAL_MS;
  }

  const doubled = BASE_BACKGROUND_SYNC_INTERVAL_MS * Math.pow(2, failureCount - 1);
  return Math.min(doubled, MAX_BACKGROUND_SYNC_INTERVAL_MS);
}

export type BackgroundSyncGateState = {
  /** True while any drain (manual or background) is in flight. */
  isDrainInFlight: boolean;
  /** True until the initial assigned-work load finishes. */
  isInitializing: boolean;
  /** Count of pending operations that are eligible to replay (excludes conflict and rejected). */
  replayableOperationCount: number;
  /** True while the technician workspace screen is mounted and visible. */
  isWorkspaceMounted: boolean;
};

/**
 * Pure gating decision for whether a background drain should run right now.
 *
 * Background sync should stay out of the way when:
 *   - the screen is not mounted (auth screen, app backgrounded out, etc.)
 *   - the workspace is still booting (initial snapshot load)
 *   - a manual Sync Now is already in flight
 *   - there are no replayable operations to drain
 *
 * Conflict and rejected operations are not counted as replayable. They
 * stay preserved on the device until the technician explicitly retries
 * or discards them. This helper never touches them.
 */
export function shouldRunBackgroundSync(state: BackgroundSyncGateState): boolean {
  if (!state.isWorkspaceMounted) {
    return false;
  }

  if (state.isInitializing) {
    return false;
  }

  if (state.isDrainInFlight) {
    return false;
  }

  if (state.replayableOperationCount <= 0) {
    return false;
  }

  return true;
}
