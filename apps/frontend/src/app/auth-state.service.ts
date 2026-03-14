import { Injectable, computed, inject, signal } from '@angular/core';
import { ContextService } from './context.service';
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

@Injectable({ providedIn: 'root' })
export class AuthStateService {
  private readonly contextService = inject(ContextService);
  private readonly sessionState = signal<AuthSessionSnapshot | null>(null);
  private readonly busy = signal(false);
  private readonly loadErrorState = signal<string | null>(null);

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
  readonly loadError = this.loadErrorState.asReadonly();

  async loadIfReady(setupComplete: boolean): Promise<void> {
    if (!setupComplete) {
      this.loadErrorState.set(null);
      this.setSessionSnapshot(this.createAnonymousSession());
      return;
    }

    try {
      await this.loadSession();
      this.loadErrorState.set(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Session bootstrap failed.';
      if (
        message.toLowerCase().includes('authentication') ||
        message.toLowerCase().includes('not authenticated')
      ) {
        this.loadErrorState.set(null);
        this.setSessionSnapshot(this.createAnonymousSession());
        return;
      }

      this.loadErrorState.set(message);
      this.setSessionSnapshot(this.createAnonymousSession());
    }
  }

  async loadSession(): Promise<AuthSessionSnapshot> {
    const session = await this.fetchJson<AuthSessionSnapshot>('/api/auth/session');
    if (typeof session.authenticated !== 'boolean') {
      throw new Error('Session payload is invalid.');
    }
    this.loadErrorState.set(null);
    this.setSessionSnapshot(session);
    return session;
  }

  async loadConfiguration() {
    return this.fetchJson<AuthConfigurationSnapshot>('/api/auth/providers');
  }

  async loadAdminConfiguration() {
    return this.fetchJson<AuthConfigurationSnapshot>('/api/admin/auth/config', {
      headers: this.authHeaders(),
    });
  }

  async listUsers(query = '') {
    const search = new URLSearchParams();
    if (query.trim()) {
      search.set('query', query.trim());
    }

    const response = await this.fetchJson<{ users: IdentityUserSummary[] }>(
      `/api/admin/users${search.size > 0 ? `?${search.toString()}` : ''}`,
      {
        headers: this.authHeaders(),
      },
    );

    return response.users;
  }

  async signUp(input: { email: string; name: string; password: string }) {
    const result = await this.fetchJson<AuthMutationResult>('/api/auth/sign-up', {
      body: JSON.stringify(input),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    });
    this.setSessionSnapshot(result.session);
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
    this.setSessionSnapshot(result.session);
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
    this.setSessionSnapshot(result.session);
    return result;
  }

  startOAuth(provider: SocialProviderCode, intent: 'link' | 'sign-in', returnTo: string) {
    const params = new URLSearchParams({
      intent,
      returnTo,
    });
    window.location.assign(`/api/auth/oauth/${provider}/start?${params.toString()}`);
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
    this.setSessionSnapshot(result.session);
    return result;
  }

  async linkProvider(provider: SocialProviderCode, providerSubject: string) {
    await this.fetchJson('/api/auth/providers/link', {
      body: JSON.stringify({ provider, providerSubject }),
      headers: this.authJsonHeaders(),
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
    await this.clearClientCaches();
    this.setSessionSnapshot(this.createAnonymousSession());
  }

  async logout() {
    await this.fetchJson('/api/auth/logout', {
      headers: this.authHeaders(),
      method: 'POST',
    });
    await this.clearClientCaches();
    this.setSessionSnapshot(this.createAnonymousSession());
  }

  async switchContext(input: {
    contextType: 'organization' | 'personal' | 'system';
    organizationId?: string;
  }) {
    const result = await this.fetchJson<AuthMutationResult>('/api/auth/context', {
      body: JSON.stringify(input),
      headers: this.authJsonHeaders(),
      method: 'POST',
    });
    this.setSessionSnapshot(result.session);
    return result.session;
  }

  setSnapshot(snapshot: AuthSessionSnapshot) {
    this.loadErrorState.set(null);
    this.sessionState.set(snapshot);
  }

  async updateAdminAuthConfig(input: {
    minAdminTierForAccountDeactivation?: number;
    requireEmailVerification?: boolean;
  }) {
    return this.fetchJson<AuthConfigurationSnapshot>('/api/admin/auth/config', {
      body: JSON.stringify(input),
      headers: this.authJsonHeaders(),
      method: 'PATCH',
    });
  }

  async deactivateUser(userId: string) {
    return this.fetchJson<{ user: IdentityUserSummary }>(`/api/admin/users/${userId}/deactivate`, {
      headers: this.authHeaders(),
      method: 'POST',
    });
  }

  async reactivateUser(userId: string) {
    return this.fetchJson<{ user: IdentityUserSummary }>(`/api/admin/users/${userId}/reactivate`, {
      headers: this.authHeaders(),
      method: 'POST',
    });
  }

  private authHeaders() {
    return {
      'x-csrf-token': this.csrfToken() ?? '',
    };
  }

  private authJsonHeaders() {
    return {
      'content-type': 'application/json',
      'x-csrf-token': this.csrfToken() ?? '',
    };
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

  private createAnonymousSession(): AuthSessionSnapshot {
    return {
      activeContext: {
        id: null,
        tenantId: null,
        type: 'public',
      },
      availableContexts: [],
      authenticated: false,
      configuredSocialProviders: this.providers(),
      csrfToken: null,
      requireEmailVerification: this.requireEmailVerification(),
      user: null,
    };
  }

  private setSessionSnapshot(snapshot: AuthSessionSnapshot) {
    this.sessionState.set(snapshot);
    this.contextService.applySessionSnapshot(snapshot);
  }

  private async clearClientCaches() {
    if (typeof caches === 'undefined') {
      return;
    }

    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
  }
}
