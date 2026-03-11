import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Logger } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { rm } from 'node:fs/promises';
import { AppModule } from './../src/app.module';
import { configureApiApp } from './../src/app.factory';
import { requestContextHeaderNames } from '@smart-schedule/contracts';

type HealthResponse = {
  status: string;
  info: {
    app: {
      status: string;
    };
  };
};

function createIdentityHeaders(input: {
  actorId: string;
  contextId: string;
  contextType: 'organization' | 'personal' | 'system';
  roles?: string[];
  tenantId?: string;
}) {
  return {
    [requestContextHeaderNames.actorId]: input.actorId,
    [requestContextHeaderNames.actorRoles]: input.roles?.join(',') ?? '',
    [requestContextHeaderNames.activeContextId]: input.contextId,
    [requestContextHeaderNames.activeContextType]: input.contextType,
    [requestContextHeaderNames.tenantId]: input.tenantId ?? '',
  };
}

describe('API health endpoints (e2e)', () => {
  let app: INestApplication<App>;
  const setupStateFile = '/tmp/smart-schedule-api-e2e-setup.json';
  const getTestServer = () => {
    const handler = app.getHttpAdapter().getInstance() as (
      req: unknown,
      res: unknown,
    ) => void;

    return (req: unknown, res: unknown) => handler(req, res);
  };

  async function completeSetup() {
    return request(getTestServer())
      .post('/setup/complete')
      .send({
        admin: {
          email: 'admin@example.com',
          name: 'Initial Admin',
          password: 'setup-password-123',
        },
        integrations: [],
      })
      .expect(201);
  }

  beforeEach(async () => {
    process.env.SETUP_STATE_FILE = setupStateFile;
    process.env.APP_EDITION = 'community';
    await rm(setupStateFile, { force: true });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApiApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    await rm(setupStateFile, { force: true });
  });

  it('returns liveness status', async () => {
    const response = await request(getTestServer())
      .get('/health')
      .expect(200);
    const body = response.body as HealthResponse;

    expect(body.status).toBe('ok');
    expect(body.info.app.status).toBe('up');
    expect(
      response.headers[requestContextHeaderNames.correlationId],
    ).toBeTypeOf('string');
    expect(response.headers[requestContextHeaderNames.requestId]).toBeTypeOf(
      'string',
    );
  });

  it('returns readiness status', async () => {
    const response = await request(getTestServer())
      .get('/health/readiness')
      .expect(200);
    const body = response.body as HealthResponse;

    expect(body.status).toBe('ok');
    expect(body.info.app.status).toBe('up');
  });

  it('blocks non-bootstrap routes until first-run setup is completed', async () => {
    const response = await request(getTestServer()).get('/kernel/session/me').expect(403);

    expect(response.body.error.code).toBe('BOOTSTRAP_LOCKED');
  });

  it('completes setup once and rejects bootstrap reuse', async () => {
    const loggerSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const setupPayload = {
      admin: {
        email: 'admin@example.com',
        name: 'Initial Admin',
        password: 'setup-password-123',
      },
      integrations: [
        {
          code: 'google-calendar',
          credentials: {
            secret: 'provider-token',
          },
          enabled: true,
          mode: 'provider-login',
        },
      ],
    };

    const firstResponse = await request(getTestServer())
      .post('/setup/complete')
      .send(setupPayload)
      .expect(201);

    expect(firstResponse.body.state.isComplete).toBe(true);
    expect(firstResponse.body.state.admin).toBeNull();
    expect(
      loggerSpy.mock.calls.some(([entry]) =>
        String(entry).includes('"resource":"POST /setup/complete"'),
      ),
    ).toBe(true);
    loggerSpy.mockRestore();

    const retryResponse = await request(getTestServer())
      .post('/setup/complete')
      .send(setupPayload)
      .expect(409);

    expect(retryResponse.body.error.code).toBe('BOOTSTRAP_LOCKED');

    const stateResponse = await request(getTestServer())
      .get('/setup/state')
      .expect(200);

    expect(stateResponse.body.isComplete).toBe(true);
    expect(stateResponse.body.configuredIntegrations).toEqual([]);
  });

  it('rejects provider-login setup in the commercial edition', async () => {
    process.env.APP_EDITION = 'commercial';
    await app.close();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApiApp(app);
    await app.init();

    const response = await request(getTestServer())
      .post('/setup/complete')
      .send({
        admin: {
          email: 'admin@example.com',
          name: 'Initial Admin',
          password: 'setup-password-123',
        },
        integrations: [
          {
            code: 'google-calendar',
            credentials: {
              secret: 'provider-token',
            },
            enabled: true,
            mode: 'provider-login',
          },
        ],
      })
      .expect(400);

    expect(response.body.message).toContain('Credential mode provider-login is not allowed');
  });

  it('rejects unknown request fields before controller logic', async () => {
    await completeSetup();

    const response = await request(getTestServer())
      .post('/kernel/session/login')
      .send({
        actorId: 'user-1',
        rogueField: 'unexpected',
      })
      .expect(400);

    expect(response.body.message).toContain('property rogueField should not exist');
  });

  it('rejects direct-object-reference access in personal scope', async () => {
    await completeSetup();

    const response = await request(getTestServer())
      .get('/kernel/testing/personal-items/user-2')
      .set(
        createIdentityHeaders({
          actorId: 'user-1',
          contextId: 'user-1',
          contextType: 'personal',
        }),
      )
      .expect(403);

    expect(response.body.error.code).toBe('CONTEXT_MISMATCH');
  });

  it('rejects direct-object-reference access in organization scope', async () => {
    await completeSetup();

    const response = await request(getTestServer())
      .post('/kernel/testing/organizations/org-2/mutations')
      .set(
        createIdentityHeaders({
          actorId: 'user-1',
          contextId: 'org-1',
          contextType: 'organization',
          roles: ['org:member'],
          tenantId: 'tenant-1',
        }),
      )
      .send({
        contextId: 'org-1',
        contextType: 'organization',
        tenantId: 'tenant-1',
      })
      .expect(403);

    expect(response.body.error.code).toBe('CONTEXT_MISMATCH');
  });

  it('rejects personal users attempting organization-scoped mutations', async () => {
    await completeSetup();

    const response = await request(getTestServer())
      .post('/kernel/testing/organizations/org-1/mutations')
      .set(
        createIdentityHeaders({
          actorId: 'user-1',
          contextId: 'user-1',
          contextType: 'personal',
          roles: ['org:member'],
        }),
      )
      .send({
        contextId: 'org-1',
        contextType: 'organization',
        tenantId: 'tenant-1',
      })
      .expect(403);

    expect(response.body.error.code).toBe('CONTEXT_MISMATCH');
    expect(response.body.error.kind).toBe('context_mismatch');
  });

  it('rejects forged context flags within organization-scoped mutations', async () => {
    await completeSetup();

    const response = await request(getTestServer())
      .post('/kernel/testing/organizations/org-1/mutations')
      .set(
        createIdentityHeaders({
          actorId: 'user-1',
          contextId: 'org-1',
          contextType: 'organization',
          roles: ['org:member'],
          tenantId: 'tenant-1',
        }),
      )
      .send({
        contextId: 'user-1',
        contextType: 'personal',
        tenantId: 'tenant-1',
      })
      .expect(403);

    expect(response.body.error.code).toBe('CONTEXT_MISMATCH');
  });

  it('enforces secure cookie sessions and CSRF on unsafe requests', async () => {
    await completeSetup();

    const loginResponse = await request(getTestServer())
      .post('/kernel/session/login')
      .send({
        actorId: 'user-1',
        contextId: 'user-1',
        contextType: 'personal',
      })
      .expect(201);

    const cookieHeader = loginResponse.headers['set-cookie'][0];
    expect(cookieHeader).toContain('HttpOnly');
    expect(cookieHeader).toContain('Secure');
    expect(cookieHeader).toContain('SameSite=Strict');
    expect(loginResponse.body.csrfToken).toBeTypeOf('string');

    await request(getTestServer())
      .get('/kernel/session/me')
      .set('Cookie', cookieHeader)
      .expect(200);

    const csrfFailure = await request(getTestServer())
      .post('/kernel/session/logout')
      .set('Cookie', cookieHeader)
      .expect(403);

    expect(csrfFailure.body.error.code).toBe('CSRF_INVALID');

    await request(getTestServer())
      .post('/kernel/session/logout')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', loginResponse.body.csrfToken)
      .expect(201);
  });

  it('revokes session access immediately after actor deactivation', async () => {
    await completeSetup();

    const loginResponse = await request(getTestServer())
      .post('/kernel/session/login')
      .send({
        actorId: 'user-99',
        contextId: 'user-99',
        contextType: 'personal',
      })
      .expect(201);
    const cookieHeader = loginResponse.headers['set-cookie'][0];

    await request(getTestServer())
      .post('/kernel/testing/deactivate-actor')
      .send({
        actorId: 'user-99',
      })
      .expect(201);

    const response = await request(getTestServer())
      .get('/kernel/session/me')
      .set('Cookie', cookieHeader)
      .expect(401);

    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('rate limits repeated login attempts', async () => {
    await completeSetup();

    await request(getTestServer())
      .post('/kernel/session/login')
      .send({
        actorId: 'user-1',
      })
      .expect(201);

    await request(getTestServer())
      .post('/kernel/session/login')
      .send({
        actorId: 'user-2',
      })
      .expect(201);

    const response = await request(getTestServer())
      .post('/kernel/session/login')
      .send({
        actorId: 'user-3',
      })
      .expect(429);

    expect(response.body.error.code).toBe('RATE_LIMITED');
  });
});
