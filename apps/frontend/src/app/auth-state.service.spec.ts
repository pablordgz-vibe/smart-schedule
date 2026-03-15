import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStateService } from './auth-state.service';
import { ContextService } from './context.service';
import type {
  AuthConfigurationSnapshot,
  AuthMutationResult,
  AuthSessionSnapshot,
  IdentityUserSummary,
  UserSettingsSnapshot,
} from './auth.types';

function buildSession(input?: {
  active?: 'organization' | 'personal' | 'system';
  authenticated?: boolean;
}): AuthSessionSnapshot {
  const active = input?.active ?? 'personal';
  const authenticated = input?.authenticated ?? true;

  return {
    activeContext: !authenticated
      ? { id: null, tenantId: null, type: 'public' }
      : active === 'organization'
        ? { id: 'org-1', tenantId: 'org-1', type: 'organization' }
        : active === 'system'
          ? { id: 'admin-1', tenantId: null, type: 'system' }
          : { id: 'user-1', tenantId: null, type: 'personal' },
    availableContexts: authenticated
      ? [
          {
            key: 'personal',
            label: 'Personal',
            membershipRole: null,
            context: { id: 'user-1', tenantId: null, type: 'personal' as const },
          },
          {
            key: 'org:org-1',
            label: 'Organization: Atlas Ops',
            membershipRole: 'admin',
            context: { id: 'org-1', tenantId: 'org-1', type: 'organization' as const },
          },
          {
            key: 'system',
            label: 'System Administration',
            membershipRole: null,
            context: { id: 'admin-1', tenantId: null, type: 'system' as const },
          },
        ]
      : [],
    authenticated,
    configuredSocialProviders: [{ code: 'google', displayName: 'Google' }],
    csrfToken: authenticated ? 'csrf-token' : null,
    requireEmailVerification: false,
    user: authenticated
      ? {
          adminTier: active === 'system' ? 0 : null,
          authMethods: [{ kind: 'password', linkedAt: '2026-03-11T00:00:00.000Z' }],
          email: 'user@example.com',
          emailVerified: true,
          id: active === 'system' ? 'admin-1' : 'user-1',
          name: active === 'system' ? 'Admin User' : 'Example User',
          recoverUntil: null,
          roles: active === 'system' ? ['system-admin', 'system-admin:tier:0'] : ['user'],
          state: 'active',
        }
      : null,
  };
}

describe('AuthStateService', () => {
  let service: AuthStateService;
  let contextService: ContextService;
  let locationAssignSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
    locationAssignSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        assign: locationAssignSpy,
      },
    });

    TestBed.configureTestingModule({
      providers: [AuthStateService, ContextService],
    });

    service = TestBed.inject(AuthStateService);
    contextService = TestBed.inject(ContextService);
  });

  it('boots anonymous state when setup is incomplete or authentication is absent', async () => {
    await service.loadIfReady(false);
    expect(service.isAuthenticated()).toBe(false);
    expect(service.snapshot()?.activeContext.type).toBe('public');

    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: 'Not authenticated' }), { status: 401 }),
    );

    await service.loadIfReady(true);

    expect(service.loadError()).toBeNull();
    expect(service.snapshot()?.activeContext.type).toBe('public');
  });

  it('loads authenticated sessions and propagates context to the shell context service', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(buildSession({ active: 'organization' })), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );

    const session = await service.loadSession();

    expect(session.activeContext.type).toBe('organization');
    expect(service.isAuthenticated()).toBe(true);
    expect(contextService.activeContext().id).toBe('org:org-1');
  });

  it('surfaces non-auth bootstrap failures and validates malformed session payloads', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: ['Backend', 'offline'] }), {
        headers: { 'content-type': 'application/json' },
        status: 503,
      }),
    );

    await service.loadIfReady(true);
    expect(service.loadError()).toBe('Backend, offline');
    expect(service.snapshot()?.authenticated).toBe(false);

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ activeContext: { id: null, tenantId: null, type: 'public' } }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      ),
    );

    await expect(service.loadSession()).rejects.toThrow('Session payload is invalid.');
  });

  it('posts auth mutations and account recovery flows with JSON payloads', async () => {
    const signInResult: AuthMutationResult = { session: buildSession({ active: 'personal' }) };
    const recoveryResult: AuthMutationResult = { session: buildSession({ active: 'system' }) };

    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(signInResult), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(recoveryResult), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tokenDelivery: { previewToken: 'verify-token' } }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tokenDelivery: { previewToken: 'reset-token' } }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tokenDelivery: { previewToken: 'recover-token' } }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      );

    const signIn = await service.signInWithPassword({
      email: 'user@example.com',
      password: 'password-123',
    });
    const recovered = await service.recoverAccount('recover-token');
    const verifyDelivery = await service.requestEmailVerification('user@example.com');
    const resetDelivery = await service.requestPasswordReset('user@example.com');
    const recoverDelivery = await service.requestRecovery('user@example.com');

    expect(signIn.session.user?.email).toBe('user@example.com');
    expect(recovered.session.activeContext.type).toBe('system');
    expect(service.snapshot()?.activeContext.type).toBe('system');
    expect(verifyDelivery.tokenDelivery.previewToken).toBe('verify-token');
    expect(resetDelivery.tokenDelivery.previewToken).toBe('reset-token');
    expect(recoverDelivery.tokenDelivery.previewToken).toBe('recover-token');

    expect(vi.mocked(fetch)).toHaveBeenNthCalledWith(
      1,
      '/api/auth/sign-in/password',
      expect.objectContaining({
        body: JSON.stringify({ email: 'user@example.com', password: 'password-123' }),
        credentials: 'include',
        method: 'POST',
      }),
    );
  });

  it('supports provider linking, settings updates, admin reads, and user lookups with auth headers', async () => {
    service.setSnapshot(buildSession({ active: 'personal' }));

    const authConfig: AuthConfigurationSnapshot = {
      minAdminTierForAccountDeactivation: 0,
      requireEmailVerification: true,
      supportedSocialProviders: ['google'],
    };
    const settings: UserSettingsSnapshot = {
      locale: 'en-GB',
      timeFormat: '24h',
      timezone: 'Europe/Madrid',
      weekStartsOn: 'monday',
    };
    const users: IdentityUserSummary[] = [
      {
        adminTier: null,
        authMethods: [{ kind: 'password', linkedAt: '2026-03-11T00:00:00.000Z' }],
        createdAt: '2026-03-11T00:00:00.000Z',
        deletedAt: null,
        email: 'alex@example.com',
        emailVerified: true,
        id: 'user-2',
        name: 'Alex',
        recoverUntil: null,
        roles: ['user'],
        state: 'active',
        updatedAt: '2026-03-11T00:00:00.000Z',
      },
    ];

    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(authConfig), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(authConfig), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ users }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(buildSession({ active: 'personal' })), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ settings }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ settings }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(authConfig), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ user: users[0] }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ user: users[0] }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      );

    expect(await service.loadConfiguration()).toEqual(authConfig);
    expect(await service.loadAdminConfiguration()).toEqual(authConfig);
    expect(await service.listUsers('alex')).toEqual(users);
    await service.linkProvider('google', 'google:123');
    expect(await service.loadUserSettings()).toEqual(settings);
    expect(await service.updateUserSettings({ timezone: 'Europe/Madrid' })).toEqual(settings);
    expect(
      await service.updateAdminAuthConfig({
        minAdminTierForAccountDeactivation: 0,
        requireEmailVerification: true,
      }),
    ).toEqual(authConfig);
    expect(await service.deactivateUser('user-2')).toEqual({ user: users[0] });
    expect(await service.reactivateUser('user-2')).toEqual({ user: users[0] });

    expect(vi.mocked(fetch)).toHaveBeenNthCalledWith(
      2,
      '/api/admin/auth/config',
      expect.objectContaining({
        credentials: 'include',
        headers: { 'x-csrf-token': 'csrf-token' },
      }),
    );
    expect(vi.mocked(fetch)).toHaveBeenNthCalledWith(
      3,
      '/api/admin/users?query=alex',
      expect.objectContaining({
        credentials: 'include',
      }),
    );
  });

  it('confirms email, password reset, and context switching through authenticated requests', async () => {
    service.setSnapshot(buildSession({ active: 'personal' }));

    const switchedSession = buildSession({ active: 'organization' });
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(buildSession({ active: 'personal' })), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ session: switchedSession }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(buildSession({ active: 'personal' })), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      );

    await service.confirmEmailVerification('verify-token');
    await service.confirmPasswordReset('reset-token', 'new-password-123');
    const switched = await service.switchContext({
      contextType: 'organization',
      organizationId: 'org-1',
    });
    await service.unlinkProvider('google');

    expect(switched.activeContext.type).toBe('organization');
    expect(service.snapshot()?.activeContext.type).toBe('personal');
  });

  it('starts oauth and clears caches on logout or delete', async () => {
    service.setSnapshot(buildSession({ active: 'personal' }));
    const deleteSpy = vi.fn().mockResolvedValue(true);
    const keysSpy = vi.fn().mockResolvedValue(['shell-cache', 'api-cache']);
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: {
        delete: deleteSpy,
        keys: keysSpy,
      },
    });

    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      );

    service.startOAuth('google', 'link', '/settings');
    await service.logout();
    await service.deleteAccount();

    expect(locationAssignSpy).toHaveBeenCalledWith(
      '/api/auth/oauth/google/start?intent=link&returnTo=%2Fsettings',
    );
    expect(keysSpy).toHaveBeenCalledTimes(2);
    expect(deleteSpy).toHaveBeenCalledWith('shell-cache');
    expect(deleteSpy).toHaveBeenCalledWith('api-cache');
    expect(service.snapshot()?.authenticated).toBe(false);
  });
});
