import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { rm } from 'node:fs/promises';
import { AppModule } from './../src/app.module';
import { configureApiApp } from './../src/app.factory';

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

describe('identity lifecycle (e2e)', () => {
  let app: INestApplication<App>;
  const setupStateFile = '/tmp/smart-schedule-api-identity-setup.json';
  const identityStateFile = '/tmp/smart-schedule-api-identity-state.json';
  const getTestServer = () => {
    const handler = app.getHttpAdapter().getInstance() as (
      req: unknown,
      res: unknown,
    ) => void;

    return (req: unknown, res: unknown) => handler(req, res);
  };

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
      cookie: response.headers['set-cookie'][0] as string,
      csrfToken: (response.body as SessionResponse).session.csrfToken!,
      userId: (response.body as SessionResponse).session.user!.id,
    };
  }

  beforeEach(async () => {
    process.env.SETUP_STATE_FILE = setupStateFile;
    process.env.IDENTITY_STATE_FILE = identityStateFile;
    process.env.APP_EDITION = 'community';
    process.env.NODE_ENV = 'test';
    await rm(setupStateFile, { force: true });
    await rm(identityStateFile, { force: true });

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
    await rm(identityStateFile, { force: true });
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

    const verificationToken = (signUpResponse.body as SessionResponse).tokenDelivery
      ?.previewToken;
    expect(verificationToken).toBeTypeOf('string');

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

    expect((signInResponse.body as SessionResponse).session.user?.emailVerified).toBe(
      true,
    );
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

    const verifyToken = (signUpResponse.body as SessionResponse).tokenDelivery?.previewToken;
    await request(getTestServer())
      .post('/auth/verify-email/confirm')
      .send({ token: verifyToken })
      .expect(201);

    const session = await signInWithPassword('user@example.com', 'example-password-123');

    const linkResponse = await request(getTestServer())
      .post('/auth/providers/link')
      .set('cookie', session.cookie)
      .set('x-csrf-token', session.csrfToken)
      .send({
        provider: 'google',
        providerSubject: 'google:user@example.com',
      })
      .expect(201);

    expect((linkResponse.body.user.authMethods as Array<{ kind: string }>).length).toBe(2);

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

    const socialCookie = socialOnlyResponse.headers['set-cookie'][0] as string;
    const socialCsrf = (socialOnlyResponse.body as SessionResponse).session.csrfToken!;

    await request(getTestServer())
      .post('/auth/providers/github/unlink')
      .set('cookie', socialCookie)
      .set('x-csrf-token', socialCsrf)
      .expect(409);

    const resetRequest = await request(getTestServer())
      .post('/auth/password-reset/request')
      .send({ email: 'user@example.com' })
      .expect(201);

    const resetToken = resetRequest.body.tokenDelivery.previewToken as string;

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

    const signUpResponse = await request(getTestServer())
      .post('/auth/sign-up')
      .send({
        email: 'user@example.com',
        name: 'Example User',
        password: 'example-password-123',
      })
      .expect(201);

    const verifyToken = (signUpResponse.body as SessionResponse).tokenDelivery?.previewToken;
    await request(getTestServer())
      .post('/auth/verify-email/confirm')
      .send({ token: verifyToken })
      .expect(201);

    const userSession = await signInWithPassword('user@example.com', 'example-password-123');

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

    const recoveryToken = recoveryRequest.body.tokenDelivery.previewToken as string;

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
  });
});
