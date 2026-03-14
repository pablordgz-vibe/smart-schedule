import type {
  SocialProviderCode,
  SocialProviderDescriptor,
} from '@smart-schedule/contracts';

export const socialProviderCatalog: Record<
  SocialProviderCode,
  SocialProviderDescriptor
> = {
  github: { code: 'github', displayName: 'GitHub' },
  google: { code: 'google', displayName: 'Google' },
  microsoft: { code: 'microsoft', displayName: 'Microsoft' },
};
