import { Injectable, computed, signal } from '@angular/core';
import type {
  AuthConfigurationSnapshot,
  AuthMutationResult,
  AuthSessionSnapshot,
  IdentityUserSummary,
  SocialProviderCode,
} from './auth.types';

type ApiErrorResponse = {
  error?: {
    message?: string;
  };
  message?: string | string[];
};

const standaloneSessionFallback: AuthSessionSnapshot = {
  authenticated: true,
  configuredSocialProviders: [
    { code: 'google', displayName: 'Google' },
    { code: 'github', displayName: 'GitHub' },
  ],
  csrfToken: 'standalone-csrf-token',
  requireEmailVerification: false,
  user: {
    adminTier: 0,
    authMethods: [{ kind: 'password', linkedAt: '2026-03-11T00:00:00.000Z' }],
    email: 'demo.user@example.com',
    emailVerified: true,
    id: 'demo-user',
    name: 'Demo User',
    recoverUntil: null,
    roles: ['user', 'system-admin', 'system-admin:tier:0'],
    state: 'active',
  },
};

@Injectable({ providedIn: 'root' })
export class AuthStateService {
  private readonly sessionState = signal<AuthSessionSnapshot | null>(null);
  private readonly busy = signal(false);

  readonly snapshot = this.sessionState.asReadonly();
  readonly isLoaded = computed(() => this.sessionState() !== null);
  readonly isAuthenticated = computed(() => this.sessionState()?.authenticated ?? false);
  readonly user = computed(() => this.sessionState()?.user ?? null);
  readonly providers = computed(() => this.sessionState()?.configuredSocialProviders ?? []);
  readonly csrfToken = computed(() => this.sessionState()?.csrfToken ?? null);
  readonly requireEmailVerification = computed(
    () => this.sessionState()?.requireEmailVerification ?? false,
  );
  readonly isBusy = this.busy.asReadonly();

  async loadIfReady(setupComplete: boolean): Promise<void> {
    if (!setupComplete) {
      this.sessionState.set({
        authenticated: false,
        configuredSocialProviders: [],
        csrfToken: null,
        requireEmailVerification: false,
        user: null,
      });
      return;
    }

    await this.loadSession({ allowScaffoldFallback: true });
  }

  async loadSession(input?: { allowScaffoldFallback?: boolean }): Promise<AuthSessionSnapshot> {
    try {
      const session = await this.fetchJson<AuthSessionSnapshot>('/api/auth/session');
      if (typeof session.authenticated !== 'boolean') {
        throw new Error('Session payload is invalid.');
      }
      this.sessionState.set(session);
      return session;
    } catch (error: unknown) {
      if (!input?.allowScaffoldFallback) {
        throw error;
      }

      this.sessionState.set(standaloneSessionFallback);
      return standaloneSessionFallback;
    }
  }

  async loadConfiguration() {
    return this.fetchJson<AuthConfigurationSnapshot>('/api/auth/providers');
  }

  async loadAdminConfiguration() {
    try {
      return await this.fetchJson<AuthConfigurationSnapshot>('/api/admin/auth/config', {
        headers: this.authHeaders(),
      });
    } catch (error: unknown) {
      if (!this.isStandaloneScaffoldSession()) {
        throw error;
      }

      return {
        minAdminTierForAccountDeactivation: 0,
        requireEmailVerification: false,
        supportedSocialProviders: standaloneSessionFallback.configuredSocialProviders,
      };
    }
  }

  async listUsers(query = '') {
    const search = new URLSearchParams();
    if (query.trim()) {
      search.set('query', query.trim());
    }

    try {
      const response = await this.fetchJson<{ users: IdentityUserSummary[] }>(
        `/api/admin/users${search.size > 0 ? `?${search.toString()}` : ''}`,
        {
          headers: this.authHeaders(),
        },
      );

      return response.users;
    } catch (error: unknown) {
      if (!this.isStandaloneScaffoldSession()) {
        throw error;
      }

      const users = [standaloneSessionFallback.user].filter(
        (user): user is IdentityUserSummary => user !== null,
      );
      const normalizedQuery = query.trim().toLowerCase();

      return users.filter((user) =>
        normalizedQuery.length === 0
          ? true
          : user.email.includes(normalizedQuery) ||
            user.name.toLowerCase().includes(normalizedQuery) ||
            user.id.includes(normalizedQuery),
      );
    }
  }

  async signUp(input: { email: string; name: string; password: string }) {
    const result = await this.fetchJson<AuthMutationResult>('/api/auth/sign-up', {
      body: JSON.stringify(input),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    });
    this.sessionState.set(result.session);
    return result;
  }

  async signInWithPassword(input: { email: string; password: string }) {
    const result = await this.fetchJson<AuthMutationResult>('/api/auth/sign-in/password', {
      body: JSON.stringify(input),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    });
    this.sessionState.set(result.session);
    return result;
  }

  async signInWithSocial(input: {
    email: string;
    name: string;
    provider: SocialProviderCode;
    providerSubject: string;
  }) {
    const result = await this.fetchJson<AuthMutationResult>('/api/auth/sign-in/social', {
      body: JSON.stringify(input),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    });
    this.sessionState.set(result.session);
    return result;
  }

  async requestEmailVerification(email: string) {
    return this.fetchJson<{ tokenDelivery: AuthMutationResult['tokenDelivery'] }>(
      '/api/auth/verify-email/request',
      {
        body: JSON.stringify({ email }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      },
    );
  }

  async confirmEmailVerification(token: string) {
    await this.fetchJson('/api/auth/verify-email/confirm', {
      body: JSON.stringify({ token }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    });
    return this.loadSession();
  }

  async requestPasswordReset(email: string) {
    return this.fetchJson<{ tokenDelivery: AuthMutationResult['tokenDelivery'] }>(
      '/api/auth/password-reset/request',
      {
        body: JSON.stringify({ email }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      },
    );
  }

  async confirmPasswordReset(token: string, password: string) {
    await this.fetchJson('/api/auth/password-reset/confirm', {
      body: JSON.stringify({ token, password }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    });
  }

  async requestRecovery(email: string) {
    return this.fetchJson<{ tokenDelivery: AuthMutationResult['tokenDelivery'] }>(
      '/api/auth/account/recovery/request',
      {
        body: JSON.stringify({ email }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      },
    );
  }

  async recoverAccount(token: string) {
    const result = await this.fetchJson<AuthMutationResult>('/api/auth/account/recover', {
      body: JSON.stringify({ token }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    });
    this.sessionState.set(result.session);
    return result;
  }

  async linkProvider(provider: SocialProviderCode, providerSubject: string) {
    await this.fetchJson('/api/auth/providers/link', {
      body: JSON.stringify({ provider, providerSubject }),
      headers: this.authHeaders(),
      method: 'POST',
    });
    return this.loadSession();
  }

  async unlinkProvider(provider: SocialProviderCode) {
    await this.fetchJson(`/api/auth/providers/${provider}/unlink`, {
      headers: this.authHeaders(),
      method: 'POST',
    });
    return this.loadSession();
  }

  async deleteAccount() {
    await this.fetchJson('/api/auth/account/delete', {
      headers: this.authHeaders(),
      method: 'POST',
    });
    this.sessionState.set({
      authenticated: false,
      configuredSocialProviders: this.providers(),
      csrfToken: null,
      requireEmailVerification: this.requireEmailVerification(),
      user: null,
    });
  }

  async logout() {
    await this.fetchJson('/api/auth/logout', {
      headers: this.authHeaders(),
      method: 'POST',
    });
    this.sessionState.set({
      authenticated: false,
      configuredSocialProviders: this.providers(),
      csrfToken: null,
      requireEmailVerification: this.requireEmailVerification(),
      user: null,
    });
  }

  setSnapshot(snapshot: AuthSessionSnapshot) {
    this.sessionState.set(snapshot);
  }

  async updateAdminAuthConfig(input: {
    minAdminTierForAccountDeactivation?: number;
    requireEmailVerification?: boolean;
  }) {
    try {
      return await this.fetchJson<AuthConfigurationSnapshot>('/api/admin/auth/config', {
        body: JSON.stringify(input),
        headers: this.authHeaders(),
        method: 'PATCH',
      });
    } catch (error: unknown) {
      if (!this.isStandaloneScaffoldSession()) {
        throw error;
      }

      return {
        minAdminTierForAccountDeactivation: input.minAdminTierForAccountDeactivation ?? 0,
        requireEmailVerification: input.requireEmailVerification ?? false,
        supportedSocialProviders: standaloneSessionFallback.configuredSocialProviders,
      };
    }
  }

  async deactivateUser(userId: string) {
    try {
      return await this.fetchJson<{ user: IdentityUserSummary }>(
        `/api/admin/users/${userId}/deactivate`,
        {
          headers: this.authHeaders(),
          method: 'POST',
        },
      );
    } catch (error: unknown) {
      if (!this.isStandaloneScaffoldSession() || userId !== standaloneSessionFallback.user?.id) {
        throw error;
      }

      return {
        user: {
          ...standaloneSessionFallback.user,
          state: 'deactivated',
        },
      };
    }
  }

  async reactivateUser(userId: string) {
    try {
      return await this.fetchJson<{ user: IdentityUserSummary }>(
        `/api/admin/users/${userId}/reactivate`,
        {
          headers: this.authHeaders(),
          method: 'POST',
        },
      );
    } catch (error: unknown) {
      if (!this.isStandaloneScaffoldSession() || userId !== standaloneSessionFallback.user?.id) {
        throw error;
      }

      return {
        user: {
          ...standaloneSessionFallback.user,
          state: 'active',
        },
      };
    }
  }

  private authHeaders() {
    return {
      'content-type': 'application/json',
      'x-csrf-token': this.csrfToken() ?? '',
    };
  }

  private isStandaloneScaffoldSession() {
    return this.sessionState()?.user?.id === standaloneSessionFallback.user?.id;
  }

  private async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    this.busy.set(true);
    try {
      const response = await fetch(url, {
        credentials: 'include',
        ...init,
      });
      const body = (await response.json().catch(() => ({}))) as ApiErrorResponse & T;
      if (!response.ok) {
        const message = Array.isArray(body.message)
          ? body.message.join(', ')
          : (body.error?.message ?? body.message ?? 'Request failed.');
        throw new Error(message);
      }

      return body as T;
    } finally {
      this.busy.set(false);
    }
  }
}
