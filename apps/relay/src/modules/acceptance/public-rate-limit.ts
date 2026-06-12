/**
 * In-memory fixed-window rate limiter for the public acceptance endpoints.
 * The relay is deliberately single-instance, so process memory is the right
 * scope; nothing here needs to survive a restart.
 */
export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, { windowStartMs: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    /** Bound on tracked keys so an address-rotating client cannot grow memory unbounded. */
    private readonly maxTrackedKeys: number = 50_000
  ) {}

  allow(key: string, nowMs: number): boolean {
    const existing = this.windows.get(key);
    if (!existing || nowMs - existing.windowStartMs >= this.windowMs) {
      if (!existing && this.windows.size >= this.maxTrackedKeys) {
        this.pruneExpired(nowMs);
        // Still full of live windows: refuse new keys rather than grow. A
        // legitimate homeowner retries a minute later; a flood does not.
        if (this.windows.size >= this.maxTrackedKeys) {
          return false;
        }
      }
      this.windows.set(key, { windowStartMs: nowMs, count: 1 });
      return true;
    }
    if (existing.count >= this.limit) {
      return false;
    }
    existing.count += 1;
    return true;
  }

  private pruneExpired(nowMs: number): void {
    for (const [key, window] of this.windows) {
      if (nowMs - window.windowStartMs >= this.windowMs) {
        this.windows.delete(key);
      }
    }
  }
}
