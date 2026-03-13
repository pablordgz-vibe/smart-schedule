export type SetupIntegrationCredentialMode = 'api-key' | 'provider-login';

export type SetupIntegrationProvider = {
  category: 'ai' | 'calendar' | 'email' | 'holiday-data';
  code: string;
  credentialModes: SetupIntegrationCredentialMode[];
  description: string;
  displayName: string;
};

export type AdminIntegrationSummary = {
  code: string;
  enabled: boolean;
  hasCredentials: boolean;
  mode: SetupIntegrationCredentialMode;
  updatedAt: string;
};

export type AdminIntegrationSnapshot = {
  configuredIntegrations: AdminIntegrationSummary[];
  edition: 'commercial' | 'community';
  providers: SetupIntegrationProvider[];
};

export type MailOutboxSummary = {
  attempts: number;
  createdAt: string;
  deliveredAt: string | null;
  expiresAt: string;
  failedAt: string | null;
  failureReason: string | null;
  id: string;
  kind: string;
  lastAttemptAt: string | null;
  recipientEmail: string;
  status: 'delivered' | 'failed' | 'queued' | 'retrying';
  subject: string;
  transport: string;
};

export type SetupBootstrapPayload = {
  admin: {
    email: string;
    name: string;
    password: string;
  };
  integrations: Array<{
    code: string;
    credentials: Record<string, string>;
    enabled: boolean;
    mode: SetupIntegrationCredentialMode;
  }>;
};

export type SetupStateSnapshot = {
  admin: {
    createdAt: string;
    email: string;
    id: string;
    name: string;
    role: 'system-admin';
  } | null;
  completedAt: string | null;
  configuredIntegrations: SetupBootstrapPayload['integrations'];
  edition: 'commercial' | 'community';
  isComplete: boolean;
  step: 'admin' | 'complete' | 'integrations' | 'review';
};
