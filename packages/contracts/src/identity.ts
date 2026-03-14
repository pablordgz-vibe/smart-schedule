import type { SessionContext } from "./security";
import type { AccountState } from "./security";

export type SocialProviderCode = "github" | "google" | "microsoft";

export type SocialProviderDescriptor = {
  code: SocialProviderCode;
  displayName: string;
};

export type AuthMethodSummary =
  | {
      kind: "password";
      linkedAt: string;
    }
  | {
      kind: "social";
      linkedAt: string;
      provider: SocialProviderCode;
    };

export type IdentityUserSummary = {
  adminTier: number | null;
  authMethods: AuthMethodSummary[];
  email: string;
  emailVerified: boolean;
  id: string;
  name: string;
  recoverUntil: string | null;
  roles: string[];
  state: AccountState;
};

export type UserSettingsSnapshot = {
  locale: string;
  timeFormat: "12h" | "24h";
  timezone: string;
  weekStartsOn: "monday" | "sunday";
};

export type SessionBootstrapContext = {
  key: string;
  label: string;
  membershipRole: "admin" | "member" | null;
  context: SessionContext;
};

export type AuthSessionSnapshot = {
  activeContext: SessionContext;
  availableContexts: SessionBootstrapContext[];
  authenticated: boolean;
  configuredSocialProviders: SocialProviderDescriptor[];
  csrfToken: string | null;
  requireEmailVerification: boolean;
  user: IdentityUserSummary | null;
};

export type AuthTokenDelivery = {
  expiresAt: string;
  previewToken: string | null;
};

export type AuthMutationResult = {
  session: AuthSessionSnapshot;
  tokenDelivery?: AuthTokenDelivery;
};

export type AuthConfigurationSnapshot = {
  minAdminTierForAccountDeactivation: number;
  requireEmailVerification: boolean;
  supportedSocialProviders: SocialProviderDescriptor[];
};
