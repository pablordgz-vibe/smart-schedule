import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApiApp, createApiAdapter } from '../src/app.factory';
import {
  resetTestDb,
  startTestDb,
  stopTestDb,
  type TestDatabase,
} from './test-db';

type SessionResponse = {
  session: {
    csrfToken: string;
    user: {
      id: string;
    } | null;
  };
};

type SignedInUser = {
  cookie: string;
  csrf: string;
  userId: string;
};

describe('time policies and advisory (e2e)', () => {
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

  async function signUpAndVerify(
    email: string,
    name: string,
    password: string,
  ) {
    const signUpResponse = await request(getTestServer())
      .post('/auth/sign-up')
      .send({ email, name, password })
      .expect(201);

    const token = (
      signUpResponse.body as { tokenDelivery?: { previewToken?: string } }
    ).tokenDelivery?.previewToken;

    await request(getTestServer())
      .post('/auth/verify-email/confirm')
      .send({ token })
      .expect(201);
  }

  async function signIn(
    email: string,
    password: string,
  ): Promise<SignedInUser> {
    const response = await request(getTestServer())
      .post('/auth/sign-in/password')
      .send({ email, password })
      .expect(201);

    return {
      cookie: response.headers['set-cookie'][0],
      csrf: (response.body as SessionResponse).session.csrfToken,
      userId: (response.body as SessionResponse).session.user!.id,
    };
  }

  async function switchContext(
    user: SignedInUser,
    body: {
      contextType: 'organization' | 'personal';
      organizationId?: string;
    },
  ) {
    const response = await request(getTestServer())
      .post('/auth/context')
      .set('cookie', user.cookie)
      .set('x-csrf-token', user.csrf)
      .send(body)
      .expect(201);

    user.cookie = response.headers['set-cookie'][0];
    user.csrf = (response.body as SessionResponse).session.csrfToken;
  }

  async function createOrganizationAs(user: SignedInUser, name: string) {
    const response = await request(getTestServer())
      .post('/org/organizations')
      .set('cookie', user.cookie)
      .set('x-csrf-token', user.csrf)
      .send({ name })
      .expect(201);

    return (response.body as { organization: { id: string } }).organization.id;
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

  it('evaluates deterministic precedence in org scope and returns effective preview', async () => {
    await completeSetup();
    await signUpAndVerify('owner@example.com', 'Owner', 'owner-password-123');
    const owner = await signIn('owner@example.com', 'owner-password-123');

    const organizationId = await createOrganizationAs(owner, 'Ops Org');

    await switchContext(owner, {
      contextType: 'organization',
      organizationId,
    });

    const groupResponse = await request(getTestServer())
      .post(`/org/organizations/${organizationId}/groups`)
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({ name: 'Night Shift' })
      .expect(201);

    const groupId = (groupResponse.body as { group: { id: string } }).group.id;

    await request(getTestServer())
      .post(`/org/organizations/${organizationId}/groups/${groupId}/members`)
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({ userId: owner.userId })
      .expect(201);

    await request(getTestServer())
      .post('/time/policies')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        policyType: 'working_hours',
        scopeLevel: 'organization',
        title: 'Org hours',
        daysOfWeek: [1, 2, 3, 4, 5],
        startTime: '09:00',
        endTime: '18:00',
      })
      .expect(201);

    await request(getTestServer())
      .post('/time/policies')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        policyType: 'working_hours',
        scopeLevel: 'group',
        targetGroupId: groupId,
        title: 'Group hours',
        daysOfWeek: [1, 2, 3, 4, 5],
        startTime: '08:00',
        endTime: '17:00',
      })
      .expect(201);

    await request(getTestServer())
      .post('/time/policies')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        policyType: 'working_hours',
        scopeLevel: 'user',
        targetUserId: owner.userId,
        title: 'User hours',
        daysOfWeek: [1, 2, 3, 4, 5],
        startTime: '07:00',
        endTime: '16:00',
      })
      .expect(201);

    const previewResponse = await request(getTestServer())
      .get(`/time/policies/preview?targetUserId=${owner.userId}`)
      .set('cookie', owner.cookie)
      .expect(200);

    const preview = (
      previewResponse.body as {
        preview: {
          categories: {
            working_hours: {
              resolvedFromScope: 'group' | 'organization' | 'user' | null;
              rules: Array<{ id: string }>;
            };
          };
        };
      }
    ).preview;

    expect(preview.categories.working_hours.resolvedFromScope).toBe('user');
    expect(preview.categories.working_hours.rules.length).toBe(1);
  });

  it('keeps advisory conflicts non-blocking and returns alternatives', async () => {
    await completeSetup();
    await signUpAndVerify('owner@example.com', 'Owner', 'owner-password-123');
    const owner = await signIn('owner@example.com', 'owner-password-123');

    const calendarsResponse = await request(getTestServer())
      .get('/cal/calendars')
      .set('cookie', owner.cookie)
      .expect(200);

    const calendarId = (
      calendarsResponse.body as { calendars: Array<{ id: string }> }
    ).calendars[0].id;

    await request(getTestServer())
      .post('/cal/events')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        calendarIds: [calendarId],
        title: 'Existing overlap event',
        startAt: '2026-03-12T09:00:00.000Z',
        endAt: '2026-03-12T10:00:00.000Z',
      })
      .expect(201);

    await request(getTestServer())
      .post('/time/policies')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        policyType: 'blackout',
        scopeLevel: 'user',
        title: 'Maintenance blackout',
        startAt: '2026-03-12T09:45:00.000Z',
        endAt: '2026-03-12T11:45:00.000Z',
      })
      .expect(201);

    const advisoryResponse = await request(getTestServer())
      .post('/time/advisory/evaluate')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        itemType: 'event',
        title: 'Candidate event',
        startAt: '2026-03-12T09:30:00.000Z',
        endAt: '2026-03-12T10:30:00.000Z',
        commuteMinutesBefore: 10,
        commuteMinutesAfter: 10,
        weatherSummary: 'Rain',
        weatherPreparationNote: 'Carry rain gear.',
      })
      .expect(201);

    const advisory = (
      advisoryResponse.body as {
        advisory: {
          canProceed: boolean;
          concerns: Array<{ category: string }>;
          alternativeSlots: Array<{ startAt: string }>;
        };
      }
    ).advisory;

    expect(advisory.canProceed).toBe(true);
    expect(
      advisory.concerns.some((entry) => entry.category === 'overlap'),
    ).toBe(true);
    expect(
      advisory.concerns.some((entry) => entry.category === 'blackout'),
    ).toBe(true);
    expect(advisory.alternativeSlots.length).toBeGreaterThan(0);
  });
});
