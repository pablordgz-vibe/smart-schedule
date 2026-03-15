import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import type { ApiRequest } from '../security/request-context.types';
import { DatabaseService } from '../persistence/database.service';
import { OAuthService } from './oauth.service';

function createRequest(input?: Partial<ApiRequest>): ApiRequest {
  return {
    headers: {
      host: 'api.example.test',
      origin: 'https://app.example.test',
      ...(input?.headers ?? {}),
    },
    method: 'GET',
    protocol: 'https',
    requestContext: input?.requestContext,
    session: input?.session,
  } as ApiRequest;
}

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

describe('OAuthService', () => {
  const queryMock = vi.fn();
  const databaseService = {
    query: queryMock,
  } as unknown as DatabaseService;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'development-session-secret-must-change-0001';
    queryMock.mockReset();
    vi.restoreAllMocks();
  });

  it('lists only configured providers and signs link-flow state', async () => {
    queryMock.mockResolvedValue({
      rows: [
        { code: 'google-social-auth' },
        { code: 'github-social-auth' },
        { code: 'microsoft-social-auth' },
      ],
    } as never);
    const service = new OAuthService(databaseService);
    expect(
      (await service.getConfiguredProviders()).map((provider) => provider.code),
    ).toEqual(['google', 'github', 'microsoft']);

    const request = createRequest({
      requestContext: {
        actor: { id: 'user-1', roles: ['user'], type: 'user' },
        context: { id: 'user-1', tenantId: null, type: 'personal' },
        correlationId: 'corr-1',
        requestId: 'req-1',
      },
      session: {
        actor: {
          id: 'user-1',
          roles: ['user'],
          state: 'active',
        },
        context: { id: 'user-1', tenantId: null, type: 'personal' },
        createdAt: new Date().toISOString(),
        csrfToken: 'csrf-1',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        id: 'session-1',
        lastSeenAt: new Date().toISOString(),
        revokedAt: null,
      },
    });

    queryMock.mockResolvedValueOnce({
      rows: [
        {
          credentials: {
            clientId: 'google-client-id',
            clientSecret: 'google-client-secret',
          },
          enabled: true,
        },
      ],
    } as never);
    const authorizationUrl = await service.createAuthorizationUrl({
      intent: 'link',
      provider: 'google',
      request,
      returnTo: '/settings',
    });

    const parsed = new URL(authorizationUrl);
    expect(parsed.origin).toBe('https://accounts.google.com');
    expect(parsed.searchParams.get('client_id')).toBe('google-client-id');

    const state = service.verifyState(
      parsed.searchParams.get('state')!,
      'google',
    );
    expect(state.intent).toBe('link');
    expect(state.actorId).toBe('user-1');
    expect(state.sessionId).toBe('session-1');
    expect(state.returnTo).toBe('/settings');
  });

  it('exchanges provider codes for provider-backed social identities', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: string | URL | Request) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url === 'https://oauth2.googleapis.com/token') {
          return Promise.resolve(
            new Response(JSON.stringify({ access_token: 'google-token' }), {
              headers: { 'content-type': 'application/json' },
              status: 200,
            }),
          );
        }

        if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                email: 'user@example.com',
                name: 'Example User',
                sub: 'google-subject-1',
              }),
              {
                headers: { 'content-type': 'application/json' },
                status: 200,
              },
            ),
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      },
    );

    queryMock.mockResolvedValue({
      rows: [
        {
          credentials: {
            clientId: 'google-client-id',
            clientSecret: 'google-client-secret',
          },
          enabled: true,
        },
      ],
    } as never);
    const service = new OAuthService(databaseService);
    const identity = await service.exchangeCodeForProfile({
      code: 'google-code',
      provider: 'google',
      request: createRequest(),
    });

    expect(identity).toEqual({
      email: 'user@example.com',
      name: 'Example User',
      provider: 'google',
      providerSubject: 'google:google-subject-1',
    });
  });

  it('builds Microsoft authorization urls using the configured tenant id', async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          credentials: {
            clientId: 'microsoft-client-id',
            clientSecret: 'microsoft-client-secret',
            tenantId: 'smart-schedule-tenant',
          },
          enabled: true,
        },
      ],
    } as never);
    const service = new OAuthService(databaseService);

    const authorizationUrl = await service.createAuthorizationUrl({
      intent: 'sign-in',
      provider: 'microsoft',
      request: createRequest({
        headers: {
          host: 'api.example.test',
          referer: 'https://app.example.test/settings',
        },
      }),
      returnTo: 'https://app.example.test/settings/security?pane=linked',
    });

    const parsed = new URL(authorizationUrl);
    expect(parsed.origin).toBe('https://login.microsoftonline.com');
    expect(parsed.pathname).toContain(
      '/smart-schedule-tenant/oauth2/v2.0/authorize',
    );
    expect(parsed.searchParams.get('prompt')).toBe('select_account');

    const state = service.verifyState(
      parsed.searchParams.get('state') ?? undefined,
      'microsoft',
    );
    expect(state.intent).toBe('sign-in');
    expect(state.actorId).toBeNull();
    expect(state.sessionId).toBeNull();
    expect(state.returnTo).toBe('/settings/security?pane=linked');
  });

  it('rejects missing, tampered, expired, and provider-mismatched OAuth states', async () => {
    const service = new OAuthService(databaseService);

    expect(() => service.verifyState(undefined, 'google')).toThrowError(
      'Missing OAuth state.',
    );
    expect(() => service.verifyState('not-a-state', 'google')).toThrowError(
      'Invalid OAuth state.',
    );

    queryMock.mockResolvedValue({
      rows: [
        {
          credentials: {
            clientId: 'google-client-id',
            clientSecret: 'google-client-secret',
          },
          enabled: true,
        },
      ],
    } as never);
    const authorizationUrl = await service.createAuthorizationUrl({
      intent: 'sign-in',
      provider: 'google',
      request: createRequest(),
      returnTo: '/home',
    });
    const stateToken = new URL(authorizationUrl).searchParams.get('state');
    expect(stateToken).toBeTruthy();

    const [encodedPayload] = (stateToken ?? '').split('.');
    expect(() =>
      service.verifyState(`${encodedPayload}.tampered-signature`, 'google'),
    ).toThrowError('Invalid OAuth state signature.');

    const expiredPayload = Buffer.from(
      JSON.stringify({
        ...JSON.parse(
          Buffer.from(encodedPayload, 'base64url').toString('utf8'),
        ),
        expiresAt: Date.now() - 1,
      }),
    ).toString('base64url');
    const expiredSignature = createHmac(
      'sha256',
      process.env.SESSION_SECRET ?? '',
    )
      .update(expiredPayload)
      .digest('base64url');
    expect(() =>
      service.verifyState(`${expiredPayload}.${expiredSignature}`, 'google'),
    ).toThrowError('OAuth state has expired.');

    expect(() =>
      service.verifyState(stateToken ?? undefined, 'github'),
    ).toThrowError('OAuth state/provider mismatch.');
  });

  it('rejects frontend redirects that leave the current origin', () => {
    const service = new OAuthService(databaseService);

    expect(() =>
      service.buildFrontendRedirect(
        createRequest(),
        'https://evil.example.com/pwned',
        { error: 'access_denied' },
      ),
    ).toThrowError(
      'Return targets must stay within the current application origin.',
    );
  });

  it('surfaces provider token exchange failures and GitHub profile fallbacks', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: string | URL | Request) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url === 'https://github.com/login/oauth/access_token') {
          return Promise.resolve(
            createJsonResponse({ error_description: 'GitHub said no.' }, 400),
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      },
    );
    queryMock.mockResolvedValue({
      rows: [
        {
          credentials: {
            clientId: 'github-client-id',
            clientSecret: 'github-client-secret',
          },
          enabled: true,
        },
      ],
    } as never);
    const service = new OAuthService(databaseService);

    await expect(
      service.exchangeCodeForProfile({
        code: 'bad-code',
        provider: 'github',
        request: createRequest(),
      }),
    ).rejects.toThrowError('GitHub said no.');

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: string | URL | Request) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url === 'https://github.com/login/oauth/access_token') {
          return Promise.resolve(
            createJsonResponse({ access_token: 'gh-token' }),
          );
        }

        if (url === 'https://api.github.com/user') {
          return Promise.resolve(
            createJsonResponse({
              email: null,
              id: 42,
              login: 'octocat',
              name: '',
            }),
          );
        }

        if (url === 'https://api.github.com/user/emails') {
          return Promise.resolve(
            createJsonResponse([
              { email: 'backup@example.com', primary: false, verified: true },
            ]),
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      },
    );

    const identity = await service.exchangeCodeForProfile({
      code: 'github-code',
      provider: 'github',
      request: createRequest(),
    });

    expect(identity).toEqual({
      email: 'backup@example.com',
      name: 'octocat',
      provider: 'github',
      providerSubject: 'github:42',
    });
  });

  it('uses the default microsoft tenant and forwarded host headers when no origin is present', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: string | URL | Request) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (
          url === 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
        ) {
          return Promise.resolve(
            createJsonResponse({ access_token: 'ms-token' }),
          );
        }

        if (
          url ===
          'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName'
        ) {
          return Promise.resolve(
            createJsonResponse({
              displayName: 'Mina Graph',
              id: 'ms-user-1',
              mail: null,
              userPrincipalName: 'mina@example.com',
            }),
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      },
    );
    queryMock.mockResolvedValue({
      rows: [
        {
          credentials: {
            clientId: 'microsoft-client-id',
            clientSecret: 'microsoft-client-secret',
            tenantId: '   ',
          },
          enabled: true,
        },
      ],
    } as never);
    const service = new OAuthService(databaseService);

    const authorizationUrl = await service.createAuthorizationUrl({
      intent: 'sign-in',
      provider: 'microsoft',
      request: createRequest({
        headers: {
          'x-forwarded-host': 'proxy.example.test',
          'x-forwarded-proto': 'https',
        },
      }),
      returnTo: '   ',
    });
    const parsed = new URL(authorizationUrl);

    expect(parsed.pathname).toContain('/common/oauth2/v2.0/authorize');
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      'https://proxy.example.test/auth/oauth/microsoft/callback',
    );

    const identity = await service.exchangeCodeForProfile({
      code: 'ms-code',
      provider: 'microsoft',
      request: createRequest({
        headers: {
          'x-forwarded-host': 'proxy.example.test',
          'x-forwarded-proto': 'https',
          host: undefined,
          origin: undefined,
        },
      }),
    });

    expect(identity).toEqual({
      email: 'mina@example.com',
      name: 'Mina Graph',
      provider: 'microsoft',
      providerSubject: 'microsoft:ms-user-1',
    });
  });

  it('rejects disabled or incomplete provider integrations and requests without a resolvable host', async () => {
    const service = new OAuthService(databaseService);

    queryMock.mockResolvedValueOnce({
      rows: [{ credentials: {}, enabled: false }],
    } as never);
    await expect(
      service.exchangeCodeForProfile({
        code: 'missing-secret',
        provider: 'github',
        request: createRequest(),
      }),
    ).rejects.toThrow('GitHub sign-in is not configured.');

    queryMock.mockResolvedValueOnce({
      rows: [{ credentials: { clientId: 'github-client-id' }, enabled: true }],
    } as never);
    await expect(
      service.exchangeCodeForProfile({
        code: 'missing-secret',
        provider: 'github',
        request: createRequest(),
      }),
    ).rejects.toThrow('GitHub sign-in is not configured.');

    queryMock.mockResolvedValueOnce({
      rows: [
        {
          credentials: {
            clientId: 'google-client-id',
            clientSecret: 'google-client-secret',
          },
          enabled: true,
        },
      ],
    } as never);
    await expect(
      service.createAuthorizationUrl({
        intent: 'sign-in',
        provider: 'google',
        request: createRequest({
          headers: {
            host: undefined,
            origin: undefined,
          },
        }),
        returnTo: '/home',
      }),
    ).rejects.toThrow('Unable to resolve the application host.');
  });

  it('falls back to API base URLs for redirects and token exchange defaults', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 500 }),
    );
    queryMock.mockResolvedValue({
      rows: [
        {
          credentials: {
            clientId: 'google-client-id',
            clientSecret: 'google-client-secret',
          },
          enabled: true,
        },
      ],
    } as never);
    const service = new OAuthService(databaseService);

    expect(
      service.buildFrontendRedirect(
        createRequest({
          headers: {
            host: 'api.example.test',
            origin: undefined,
            referer: undefined,
          },
        }),
        '',
        { result: 'linked' },
      ),
    ).toBe('https://api.example.test/home?result=linked');

    await expect(
      service.exchangeCodeForProfile({
        code: 'broken-code',
        provider: 'google',
        request: createRequest(),
      }),
    ).rejects.toThrow(
      'Token exchange failed for the selected social provider.',
    );
  });
});
