import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApiApp, createApiAdapter } from './../src/app.factory';
import { requestContextHeaderNames } from '@smart-schedule/contracts';
import {
  resetTestDb,
  startTestDb,
  stopTestDb,
  type TestDatabase,
} from './test-db';

type HealthResponse = {
  info: {
    app: {
      status: string;
    };
  };
  status: string;
};

type OpenApiDocumentResponse = {
  info: {
    title: string;
    version: string;
  };
  openapi: string;
  paths: Record<string, unknown>;
};

type SecurityErrorResponse = {
  error: {
    code: string;
    kind?: string;
  };
  message?: string | string[];
};

type SetupCompleteResponse = {
  state: {
    admin: null;
    isComplete: boolean;
  };
};

type BootstrapStatusResponse = {
  edition: 'commercial' | 'community';
  enabledIntegrationCodes: string[];
  isComplete: boolean;
};

type SessionLoginResponse = {
  csrfToken: string;
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
  let app: NestFastifyApplication;
  let databaseUrl: string;
  let testDb: TestDatabase;

  const getTestServer = () => app.getHttpServer();

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

  async function bootApp() {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app =
      moduleFixture.createNestApplication<NestFastifyApplication>(
        createApiAdapter(),
      );
    configureApiApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }

  beforeAll(async () => {
    testDb = await startTestDb();
    databaseUrl = testDb.url;
  });

  beforeEach(async () => {
    process.env.APP_EDITION = 'community';
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = databaseUrl;
    await resetTestDb(databaseUrl);
    await bootApp();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  afterAll(async () => {
    await stopTestDb(testDb);
  });

  it('returns liveness status', async () => {
    const response = await request(getTestServer()).get('/health').expect(200);
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

  it('publishes a versioned OpenAPI document for the sprint 1 surface', async () => {
    const response = await request(getTestServer())
      .get('/openapi/v1.json')
      .expect(200);
    const body = response.body as OpenApiDocumentResponse;

    expect(body.info.title).toBe('Smart Schedule API');
    expect(body.info.version).toBe('v1');
    expect(body.openapi).toMatch(/^3\./);
    expect(body.paths).toHaveProperty('/setup/state');
    expect(body.paths).toHaveProperty('/auth/session');
    expect(body.paths).toHaveProperty('/health');
  });

  it('blocks non-bootstrap routes until first-run setup is completed', async () => {
    const response = await request(getTestServer())
      .get('/kernel/session/me')
      .expect(403);

    expect((response.body as SecurityErrorResponse).error.code).toBe(
      'BOOTSTRAP_LOCKED',
    );
  });

  it('exposes a public bootstrap status endpoint without keeping bootstrap routes open', async () => {
    const beforeSetupResponse = await request(getTestServer())
      .get('/platform/bootstrap-status')
      .expect(200);

    expect(
      (beforeSetupResponse.body as BootstrapStatusResponse).isComplete,
    ).toBe(false);

    await completeSetup();

    const afterSetupResponse = await request(getTestServer())
      .get('/platform/bootstrap-status')
      .expect(200);

    const afterSetupBody = afterSetupResponse.body as BootstrapStatusResponse;
    expect(afterSetupBody.isComplete).toBe(true);
    expect(afterSetupBody.enabledIntegrationCodes).toEqual([]);

    const lockedBootstrapRoute = await request(getTestServer())
      .get('/setup/state')
      .expect(403);

    expect(
      (lockedBootstrapRoute.body as SecurityErrorResponse).error.code,
    ).toBe('BOOTSTRAP_LOCKED');
  });

  it('completes setup once and rejects bootstrap reuse', async () => {
    const loggerSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

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

    const firstBody = firstResponse.body as SetupCompleteResponse;
    expect(firstBody.state.isComplete).toBe(true);
    expect(firstBody.state.admin).toBeNull();
    expect(
      loggerSpy.mock.calls.some(([entry]) =>
        String(entry).includes('"action":"setup.completed"'),
      ),
    ).toBe(true);
    loggerSpy.mockRestore();

    const retryResponse = await request(getTestServer())
      .post('/setup/complete')
      .send(setupPayload)
      .expect(403);

    expect((retryResponse.body as SecurityErrorResponse).error.code).toBe(
      'BOOTSTRAP_LOCKED',
    );

    const bootstrapStatusResponse = await request(getTestServer())
      .get('/platform/bootstrap-status')
      .expect(200);

    expect(
      (bootstrapStatusResponse.body as BootstrapStatusResponse).isComplete,
    ).toBe(true);

    const lockedStateResponse = await request(getTestServer())
      .get('/setup/state')
      .expect(403);

    expect((lockedStateResponse.body as SecurityErrorResponse).error.code).toBe(
      'BOOTSTRAP_LOCKED',
    );

    const openApiResponse = await request(getTestServer())
      .get('/openapi/v1.json')
      .expect(200);

    const openApiBody = openApiResponse.body as OpenApiDocumentResponse;
    expect(openApiBody.paths).toHaveProperty('/admin/users');
  });

  it('rejects provider-login setup in the commercial edition', async () => {
    process.env.APP_EDITION = 'commercial';
    await app.close();
    await bootApp();

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

    expect((response.body as SecurityErrorResponse).message).toContain(
      'Credential mode provider-login is not allowed',
    );
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

    expect((response.body as SecurityErrorResponse).message).toContain(
      'property rogueField should not exist',
    );
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

    expect((response.body as SecurityErrorResponse).error.code).toBe(
      'CONTEXT_MISMATCH',
    );
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

    expect((response.body as SecurityErrorResponse).error.code).toBe(
      'CONTEXT_MISMATCH',
    );
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

    const responseBody = response.body as SecurityErrorResponse;
    expect(responseBody.error.code).toBe('CONTEXT_MISMATCH');
    expect(responseBody.error.kind).toBe('context_mismatch');
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

    expect((response.body as SecurityErrorResponse).error.code).toBe(
      'CONTEXT_MISMATCH',
    );
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
    const loginBody = loginResponse.body as SessionLoginResponse;

    const cookieHeader = loginResponse.headers['set-cookie'][0];
    expect(cookieHeader).toContain('HttpOnly');
    expect(cookieHeader).toContain('Secure');
    expect(cookieHeader).toContain('SameSite=Strict');
    expect(loginBody.csrfToken).toBeTypeOf('string');

    await request(getTestServer())
      .get('/kernel/session/me')
      .set('Cookie', cookieHeader)
      .expect(200);

    const csrfFailure = await request(getTestServer())
      .post('/kernel/session/logout')
      .set('Cookie', cookieHeader)
      .expect(403);

    expect((csrfFailure.body as SecurityErrorResponse).error.code).toBe(
      'CSRF_INVALID',
    );

    await request(getTestServer())
      .post('/kernel/session/logout')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', loginBody.csrfToken)
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

    expect((response.body as SecurityErrorResponse).error.code).toBe(
      'AUTHENTICATION_REQUIRED',
    );
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

    expect((response.body as SecurityErrorResponse).error.code).toBe(
      'RATE_LIMITED',
    );
  });
});
