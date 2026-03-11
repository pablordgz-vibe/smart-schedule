import { SetMetadata } from '@nestjs/common';
import type { RateLimitPolicy } from '@smart-schedule/contracts';

export const RATE_LIMIT_POLICY_KEY = 'rate-limit-policy';

export const RateLimit = (policy: RateLimitPolicy) =>
  SetMetadata(RATE_LIMIT_POLICY_KEY, policy);
