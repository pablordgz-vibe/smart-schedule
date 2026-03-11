import { Injectable } from '@nestjs/common';
import type { RateLimitPolicy } from '@smart-schedule/contracts';

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, RateLimitBucket>();

  consume(key: string, policy: RateLimitPolicy) {
    const currentTime = Date.now();
    const currentBucket = this.buckets.get(key);

    if (!currentBucket || currentBucket.resetAt <= currentTime) {
      const nextBucket = {
        count: 1,
        resetAt: currentTime + policy.windowMs,
      };
      this.buckets.set(key, nextBucket);
      return {
        allowed: true,
        remaining: policy.limit - nextBucket.count,
        resetAt: nextBucket.resetAt,
      };
    }

    currentBucket.count += 1;
    this.buckets.set(key, currentBucket);

    return {
      allowed: currentBucket.count <= policy.limit,
      remaining: Math.max(0, policy.limit - currentBucket.count),
      resetAt: currentBucket.resetAt,
    };
  }

  clearAll() {
    this.buckets.clear();
  }
}
