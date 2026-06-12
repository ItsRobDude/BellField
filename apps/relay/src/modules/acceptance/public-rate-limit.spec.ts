import { FixedWindowRateLimiter } from './public-rate-limit';

describe('FixedWindowRateLimiter', () => {
  it('allows up to the limit per window and blocks afterward', () => {
    const limiter = new FixedWindowRateLimiter(3, 60_000);
    expect(limiter.allow('ip-1', 0)).toBe(true);
    expect(limiter.allow('ip-1', 1_000)).toBe(true);
    expect(limiter.allow('ip-1', 2_000)).toBe(true);
    expect(limiter.allow('ip-1', 3_000)).toBe(false);
  });

  it('tracks keys independently', () => {
    const limiter = new FixedWindowRateLimiter(1, 60_000);
    expect(limiter.allow('ip-1', 0)).toBe(true);
    expect(limiter.allow('ip-2', 0)).toBe(true);
    expect(limiter.allow('ip-1', 1)).toBe(false);
  });

  it('resets once the window elapses', () => {
    const limiter = new FixedWindowRateLimiter(1, 60_000);
    expect(limiter.allow('ip-1', 0)).toBe(true);
    expect(limiter.allow('ip-1', 59_999)).toBe(false);
    expect(limiter.allow('ip-1', 60_000)).toBe(true);
  });

  it('refuses new keys at the tracking cap instead of growing, then recovers', () => {
    const limiter = new FixedWindowRateLimiter(5, 60_000, 2);
    expect(limiter.allow('ip-1', 0)).toBe(true);
    expect(limiter.allow('ip-2', 0)).toBe(true);
    // Cap reached with live windows: a third key is refused outright.
    expect(limiter.allow('ip-3', 1)).toBe(false);
    // After the windows expire they prune, and new keys are admitted again.
    expect(limiter.allow('ip-3', 60_001)).toBe(true);
  });
});
