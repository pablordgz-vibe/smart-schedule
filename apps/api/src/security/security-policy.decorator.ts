import { SetMetadata } from '@nestjs/common';
import type { AuthorizationPolicy } from '@smart-schedule/contracts';

export const SECURITY_POLICY_KEY = 'security-policy';

export const SecurityPolicy = (policy: AuthorizationPolicy) =>
  SetMetadata(SECURITY_POLICY_KEY, policy);
