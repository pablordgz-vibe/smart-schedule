export type SetupIntegrationCredentialMode = 'api-key' | 'provider-login';

export type SetupIntegrationProvider = {
  category: 'ai' | 'calendar' | 'holiday-data';
  code: string;
  credentialModes: SetupIntegrationCredentialMode[];
  description: string;
  displayName: string;
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
