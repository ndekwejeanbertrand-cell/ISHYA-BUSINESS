interface RateLimitEntry {
  timestamps: number[];
}

export class SlidingWindowRateLimiter {
  private readonly store = new Map<string, RateLimitEntry>();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(options?: { windowMs?: number; maxRequests?: number }) {
    this.windowMs = options?.windowMs ?? 60_000;
    this.maxRequests = options?.maxRequests ?? 30;
  }

  check(key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number; remaining: number } {
    const entry = this.store.get(key) ?? { timestamps: [] };
    const cutoff = now - this.windowMs;
    const recent = entry.timestamps.filter((ts) => ts > cutoff);

    if (recent.length >= this.maxRequests) {
      const oldest = recent[0];
      const retryAfterMs = Math.max(1000, this.windowMs - (now - oldest));
      entry.timestamps = recent;
      this.store.set(key, entry);
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
        remaining: 0,
      };
    }

    recent.push(now);
    entry.timestamps = recent;
    this.store.set(key, entry);

    // Opportunistic cleanup for stale keys
    if (this.store.size > 5000) {
      for (const [k, v] of this.store.entries()) {
        if (v.timestamps.every((ts) => ts <= cutoff)) {
          this.store.delete(k);
        }
      }
    }

    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Math.max(0, this.maxRequests - recent.length),
    };
  }
}
