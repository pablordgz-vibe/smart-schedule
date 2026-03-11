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
import {
  readMailOutbox,
  resetTestDb,
  startTestDb,
  stopTestDb,
  type TestDatabase,
} from './test-db';

type SessionResponse = {
  session: {
    authenticated: boolean;
    csrfToken: string | null;
    user: {
      id: string;
      authMethods: Array<{ kind: 'password' | 'social'; provider?: string }>;
      emailVerified: boolean;
      state: 'active' | 'deactivated' | 'deleted';
    } | null;
  };
  tokenDelivery?: {
    previewToken: string | null;
  };
};

type AuthUserMutationResponse = {
  user: {
    authMethods: Array<{ kind: 'password' | 'social'; provider?: string }>;
  };
};

type TokenDeliveryResponse = {
  tokenDelivery: {
    previewToken: string | null;
  };
};

type UserListResponse = {
  users: Array<{ email: string }>;
};

describe('identity lifecycle (e2e)', () => {
  let app: NestFastifyApplication;
  let databaseUrl: string;
  let testDb: TestDatabase;

  const getTestServer = () => app.getHttpServer();

  async function completeSetup() {
    await request(getTestServer())
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

  async function signInWithPassword(email: string, password: string) {
    const response = await request(getTestServer())
      .post('/auth/sign-in/password')
      .send({ email, password })
      .expect(201);

    return {
      cookie: response.headers['set-cookie'][0],
      csrfToken: (response.body as SessionResponse).session.csrfToken!,
      userId: (response.body as SessionResponse).session.user!.id,
    };
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
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  afterAll(async () => {
    await stopTestDb(testDb);
  });

  it('supports sign-up, verification enforcement, and password sign-in', async () => {
    await completeSetup();
    const adminSession = await signInWithPassword(
      'admin@example.com',
      'setup-password-123',
    );

    await request(getTestServer())
      .patch('/admin/auth/config')
      .set('cookie', adminSession.cookie)
      .set('x-csrf-token', adminSession.csrfToken)
      .send({ requireEmailVerification: true })
      .expect(200);

    const signUpResponse = await request(getTestServer())
      .post('/auth/sign-up')
      .send({
        email: 'user@example.com',
        name: 'Example User',
        password: 'example-password-123',
      })
      .expect(201);

    const verificationToken = (signUpResponse.body as SessionResponse)
      .tokenDelivery?.previewToken;
    expect(verificationToken).toBeTypeOf('string');
    const mailOutbox = await readMailOutbox(databaseUrl);
    expect(mailOutbox).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'email-verification',
          recipient_email: 'user@example.com',
          subject: 'Verify your SmartSchedule email',
        }),
      ]),
    );

    await request(getTestServer())
      .post('/auth/sign-in/password')
      .send({
        email: 'user@example.com',
        password: 'example-password-123',
      })
      .expect(401);

    await request(getTestServer())
      .post('/auth/verify-email/confirm')
      .send({ token: verificationToken })
      .expect(201);

    const signInResponse = await request(getTestServer())
      .post('/auth/sign-in/password')
      .send({
        email: 'user@example.com',
        password: 'example-password-123',
      })
      .expect(201);

    expect(
      (signInResponse.body as SessionResponse).session.user?.emailVerified,
    ).toBe(true);
  });

  it('supports password reset and social link or unlink protection', async () => {
    await completeSetup();

    const signUpResponse = await request(getTestServer())
      .post('/auth/sign-up')
      .send({
        email: 'user@example.com',
        name: 'Example User',
        password: 'example-password-123',
      })
      .expect(201);

    const verifyToken = (signUpResponse.body as SessionResponse).tokenDelivery
      ?.previewToken;
    await request(getTestServer())
      .post('/auth/verify-email/confirm')
      .send({ token: verifyToken })
      .expect(201);

    const session = await signInWithPassword(
      'user@example.com',
      'example-password-123',
    );

    const linkResponse = await request(getTestServer())
      .post('/auth/providers/link')
      .set('cookie', session.cookie)
      .set('x-csrf-token', session.csrfToken)
      .send({
        provider: 'google',
        providerSubject: 'google:user@example.com',
      })
      .expect(201);

    expect(
      (linkResponse.body as AuthUserMutationResponse).user.authMethods.length,
    ).toBe(2);

    await request(getTestServer())
      .post('/auth/providers/google/unlink')
      .set('cookie', session.cookie)
      .set('x-csrf-token', session.csrfToken)
      .expect(201);

    const socialOnlyResponse = await request(getTestServer())
      .post('/auth/sign-in/social')
      .send({
        email: 'social-only@example.com',
        name: 'Social Only',
        provider: 'github',
        providerSubject: 'github:social-only@example.com',
      })
      .expect(201);

    const socialCookie = socialOnlyResponse.headers['set-cookie'][0];
    const socialCsrf = (socialOnlyResponse.body as SessionResponse).session
      .csrfToken!;

    await request(getTestServer())
      .post('/auth/providers/github/unlink')
      .set('cookie', socialCookie)
      .set('x-csrf-token', socialCsrf)
      .expect(409);

    const resetRequest = await request(getTestServer())
      .post('/auth/password-reset/request')
      .send({ email: 'user@example.com' })
      .expect(201);

    const resetToken = (resetRequest.body as TokenDeliveryResponse)
      .tokenDelivery.previewToken as string;
    const mailOutbox = await readMailOutbox(databaseUrl);
    expect(
      mailOutbox.some((message) => message.kind === 'password-reset'),
    ).toBe(true);

    await request(getTestServer())
      .post('/auth/password-reset/confirm')
      .send({
        password: 'new-example-password-456',
        token: resetToken,
      })
      .expect(201);

    await request(getTestServer())
      .post('/auth/sign-in/password')
      .send({
        email: 'user@example.com',
        password: 'new-example-password-456',
      })
      .expect(201);
  });

  it('supports deletion, recovery, and admin deactivation or reactivation', async () => {
    await completeSetup();
    const loggerSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    const signUpResponse = await request(getTestServer())
      .post('/auth/sign-up')
      .send({
        email: 'user@example.com',
        name: 'Example User',
        password: 'example-password-123',
      })
      .expect(201);

    const verifyToken = (signUpResponse.body as SessionResponse).tokenDelivery
      ?.previewToken;
    await request(getTestServer())
      .post('/auth/verify-email/confirm')
      .send({ token: verifyToken })
      .expect(201);

    const userSession = await signInWithPassword(
      'user@example.com',
      'example-password-123',
    );

    await request(getTestServer())
      .post('/auth/account/delete')
      .set('cookie', userSession.cookie)
      .set('x-csrf-token', userSession.csrfToken)
      .expect(201);

    await request(getTestServer())
      .post('/auth/sign-in/password')
      .send({
        email: 'user@example.com',
        password: 'example-password-123',
      })
      .expect(401);

    const recoveryRequest = await request(getTestServer())
      .post('/auth/account/recovery/request')
      .send({ email: 'user@example.com' })
      .expect(201);

    const recoveryToken = (recoveryRequest.body as TokenDeliveryResponse)
      .tokenDelivery.previewToken as string;

    await request(getTestServer())
      .post('/auth/account/recover')
      .send({ token: recoveryToken })
      .expect(201);

    const adminSession = await signInWithPassword(
      'admin@example.com',
      'setup-password-123',
    );

    await request(getTestServer())
      .post(`/admin/users/${userSession.userId}/deactivate`)
      .set('cookie', adminSession.cookie)
      .set('x-csrf-token', adminSession.csrfToken)
      .expect(201);

    await request(getTestServer())
      .post('/auth/sign-in/password')
      .send({
        email: 'user@example.com',
        password: 'example-password-123',
      })
      .expect(401);

    await request(getTestServer())
      .post(`/admin/users/${userSession.userId}/reactivate`)
      .set('cookie', adminSession.cookie)
      .set('x-csrf-token', adminSession.csrfToken)
      .expect(201);

    await request(getTestServer())
      .post('/auth/sign-in/password')
      .send({
        email: 'user@example.com',
        password: 'example-password-123',
      })
      .expect(201);

    expect(
      loggerSpy.mock.calls.some(([entry]) =>
        String(entry).includes('"action":"identity.account.deleted"'),
      ),
    ).toBe(true);
    expect(
      loggerSpy.mock.calls.some(([entry]) =>
        String(entry).includes('"action":"identity.account.recovered"'),
      ),
    ).toBe(true);
    expect(
      loggerSpy.mock.calls.some(([entry]) =>
        String(entry).includes('"action":"identity.account.deactivated"'),
      ),
    ).toBe(true);
    expect(
      loggerSpy.mock.calls.some(([entry]) =>
        String(entry).includes('"action":"identity.account.reactivated"'),
      ),
    ).toBe(true);
    loggerSpy.mockRestore();
  });

  it('blocks tier-zero admins from managing peer admin accounts', async () => {
    await completeSetup();

    const bootstrapAdmin = await signInWithPassword(
      'admin@example.com',
      'setup-password-123',
    );

    const peerAdminLogin = await request(getTestServer())
      .post('/kernel/session/login')
      .send({
        actorId: 'peer-admin',
        contextId: 'peer-admin',
        contextType: 'system',
        roles: ['system-admin'],
      })
      .expect(201);

    const peerAdminCookie = peerAdminLogin.headers['set-cookie'][0];
    const peerAdminCsrf = (
      peerAdminLogin.body as {
        csrfToken: string;
      }
    ).csrfToken;

    await request(getTestServer())
      .post(`/admin/users/${bootstrapAdmin.userId}/deactivate`)
      .set('cookie', peerAdminCookie)
      .set('x-csrf-token', peerAdminCsrf)
      .expect(401);
  });

  it('lists users for system admins and permanently prunes expired recovery windows', async () => {
    await completeSetup();

    const signUpResponse = await request(getTestServer())
      .post('/auth/sign-up')
      .send({
        email: 'user@example.com',
        name: 'Example User',
        password: 'example-password-123',
      })
      .expect(201);

    const verificationToken = (signUpResponse.body as SessionResponse)
      .tokenDelivery?.previewToken;
    await request(getTestServer())
      .post('/auth/verify-email/confirm')
      .send({ token: verificationToken })
      .expect(201);

    const userSession = await signInWithPassword(
      'user@example.com',
      'example-password-123',
    );
    await request(getTestServer())
      .post('/auth/account/delete')
      .set('cookie', userSession.cookie)
      .set('x-csrf-token', userSession.csrfToken)
      .expect(201);

    const { Client } = await import('pg');
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(
      `update users
       set recover_until = $2
       where email = $1`,
      ['user@example.com', '2020-01-01T00:00:00.000Z'],
    );
    await client.end();

    const adminSession = await signInWithPassword(
      'admin@example.com',
      'setup-password-123',
    );
    const listResponse = await request(getTestServer())
      .get('/admin/users')
      .query({ query: 'admin@example.com' })
      .set('cookie', adminSession.cookie)
      .expect(200);

    expect((listResponse.body as UserListResponse).users).toEqual([
      expect.objectContaining({
        email: 'admin@example.com',
      }),
    ]);

    const expiredRecoveryRequest = await request(getTestServer())
      .post('/auth/account/recovery/request')
      .send({ email: 'user@example.com' })
      .expect(201);

    expect(
      (expiredRecoveryRequest.body as TokenDeliveryResponse).tokenDelivery
        .previewToken,
    ).toBeNull();

    const verifyClient = new (await import('pg')).Client({
      connectionString: databaseUrl,
    });
    await verifyClient.connect();
    const remainingUsers = await verifyClient.query<{ email: string }>(
      `select email from users where email = $1`,
      ['user@example.com'],
    );
    await verifyClient.end();
    expect(remainingUsers.rows).toEqual([]);
  });
});
