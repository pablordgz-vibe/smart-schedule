import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('OAuthService', () => {
  const databaseService = {
    query: vi.fn(),
  } as unknown as DatabaseService;

  beforeEach(() => {
    process.env.SESSION_SECRET =
      'development-session-secret-must-change-0001';
    databaseService.query = vi.fn();
    vi.restoreAllMocks();
  });

  it('lists only configured providers and signs link-flow state', async () => {
    vi.mocked(databaseService.query).mockResolvedValue({
      rows: [
        { code: 'google-social-auth' },
        { code: 'github-social-auth' },
        { code: 'microsoft-social-auth' },
      ],
    } as never);
    const service = new OAuthService(databaseService);
    expect((await service.getConfiguredProviders()).map((provider) => provider.code)).toEqual([
      'google',
      'github',
      'microsoft',
    ]);

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

    vi.mocked(databaseService.query).mockResolvedValueOnce({
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

    const state = service.verifyState(parsed.searchParams.get('state')!, 'google');
    expect(state.intent).toBe('link');
    expect(state.actorId).toBe('user-1');
    expect(state.sessionId).toBe('session-1');
    expect(state.returnTo).toBe('/settings');
  });

  it('exchanges provider codes for provider-backed social identities', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: string | URL | Request) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url === 'https://oauth2.googleapis.com/token') {
          return new Response(JSON.stringify({ access_token: 'google-token' }), {
            headers: { 'content-type': 'application/json' },
            status: 200,
          });
        }

        if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
          return new Response(
            JSON.stringify({
              email: 'user@example.com',
              name: 'Example User',
              sub: 'google-subject-1',
            }),
            {
              headers: { 'content-type': 'application/json' },
              status: 200,
            },
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      },
    );

    vi.mocked(databaseService.query).mockResolvedValue({
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
});
