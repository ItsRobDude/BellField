import { describe, expect, it } from 'vitest';
import {
  BASE_BACKGROUND_SYNC_INTERVAL_MS,
  MAX_BACKGROUND_SYNC_INTERVAL_MS,
  nextBackgroundSyncDelayMs,
  shouldRunBackgroundSync,
  type BackgroundSyncGateState
} from '../field-background-sync-schedule';

function gate(overrides: Partial<BackgroundSyncGateState> = {}): BackgroundSyncGateState {
  return {
    isDrainInFlight: false,
    isInitializing: false,
    replayableOperationCount: 1,
    isWorkspaceMounted: true,
    ...overrides
  };
}

describe('nextBackgroundSyncDelayMs', () => {
  it('uses the base interval for the first attempt and immediately after a successful drain', () => {
    expect(nextBackgroundSyncDelayMs(0)).toBe(BASE_BACKGROUND_SYNC_INTERVAL_MS);
  });

  it('treats failureCount 1 the same as the base interval so a single hiccup does not slow things down', () => {
    expect(nextBackgroundSyncDelayMs(1)).toBe(BASE_BACKGROUND_SYNC_INTERVAL_MS);
  });

  it('doubles the delay on consecutive failures (60s → 120s → 240s)', () => {
    expect(nextBackgroundSyncDelayMs(2)).toBe(120_000);
    expect(nextBackgroundSyncDelayMs(3)).toBe(240_000);
  });

  it('caps the delay at 5 minutes on prolonged failure streaks', () => {
    expect(nextBackgroundSyncDelayMs(4)).toBe(MAX_BACKGROUND_SYNC_INTERVAL_MS);
    expect(nextBackgroundSyncDelayMs(10)).toBe(MAX_BACKGROUND_SYNC_INTERVAL_MS);
    expect(nextBackgroundSyncDelayMs(1000)).toBe(MAX_BACKGROUND_SYNC_INTERVAL_MS);
  });

  it('treats negative failure counts the same as zero', () => {
    expect(nextBackgroundSyncDelayMs(-1)).toBe(BASE_BACKGROUND_SYNC_INTERVAL_MS);
  });
});

describe('shouldRunBackgroundSync', () => {
  it('runs when the workspace is mounted, init is done, no drain is in flight, and at least one op is replayable', () => {
    expect(shouldRunBackgroundSync(gate())).toBe(true);
  });

  it('stays out of the way while the workspace is not mounted', () => {
    expect(shouldRunBackgroundSync(gate({ isWorkspaceMounted: false }))).toBe(false);
  });

  it('stays out of the way during the initial boot load', () => {
    expect(shouldRunBackgroundSync(gate({ isInitializing: true }))).toBe(false);
  });

  it('does not overlap with a drain that is already in flight (manual or background)', () => {
    expect(shouldRunBackgroundSync(gate({ isDrainInFlight: true }))).toBe(false);
  });

  it('does not run when there is nothing to replay', () => {
    expect(shouldRunBackgroundSync(gate({ replayableOperationCount: 0 }))).toBe(false);
  });

  it('respects queue-resolution semantics: only the replayable count drives the decision', () => {
    // conflict and rejected operations must NOT count toward replayableOperationCount.
    // The caller is expected to compute that via getReplayablePendingOperations
    // and pass only the pending-state count here. We pin the contract by checking
    // that zero replayable means no run, even if the gate state otherwise looks healthy.
    expect(
      shouldRunBackgroundSync({
        isDrainInFlight: false,
        isInitializing: false,
        replayableOperationCount: 0,
        isWorkspaceMounted: true
      })
    ).toBe(false);
  });
});
