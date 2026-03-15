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

  async function completeSetup(
    integrations: Array<{
      code: string;
      credentials: Record<string, string>;
      enabled: boolean;
      mode: 'api-key' | 'provider-login';
    }> = [],
  ) {
    await request(getTestServer())
      .post('/setup/complete')
      .send({
        admin: {
          email: 'admin@example.com',
          name: 'Initial Admin',
          password: 'setup-password-123',
        },
        integrations,
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
    process.env.CALENDARIFIC_API_BASE_URL = 'https://calendarific.test/api/v2';
    process.env.CALENDARIFIC_PORTAL_BASE_URL = 'https://calendarific.test';
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
    vi.restoreAllMocks();
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

  it('rejects invalid personal-context policy scope and delegation inputs', async () => {
    await completeSetup();
    await signUpAndVerify('owner@example.com', 'Owner', 'owner-password-123');
    const owner = await signIn('owner@example.com', 'owner-password-123');

    await request(getTestServer())
      .get('/time/policies?scopeLevel=organization')
      .set('cookie', owner.cookie)
      .expect(400);

    await request(getTestServer())
      .post('/time/policies')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        policyType: 'working_hours',
        scopeLevel: 'group',
        targetGroupId: 'group-not-allowed',
        title: 'Invalid personal scope',
        daysOfWeek: [1, 2, 3, 4, 5],
        startTime: '09:00',
        endTime: '17:00',
      })
      .expect(400);

    await request(getTestServer())
      .post('/time/holidays/import')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        providerCode: 'gov-feed',
        locationCode: 'ES-MD',
        year: 2026,
        scopeLevel: 'organization',
      })
      .expect(400);

    await request(getTestServer())
      .get('/time/policies/preview?targetUserId=someone-else')
      .set('cookie', owner.cookie)
      .expect(400);

    await request(getTestServer())
      .post('/time/advisory/evaluate')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        itemType: 'event',
        title: 'Delegated candidate',
        startAt: '2026-03-12T09:00:00.000Z',
        endAt: '2026-03-12T10:00:00.000Z',
        targetUserId: 'someone-else',
      })
      .expect(400);
  });

  it('loads holiday locations and keeps official holiday imports idempotent', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: string | URL | Request) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url === 'https://calendarific.test/supported-countries') {
          return Promise.resolve(
            new Response(
              `
                <table>
                  <tr>
                    <td>Spain</td>
                    <td>es</td>
                    <td>
                      <a href="/api?location=es-md">Madrid</a>,
                      <a href="/api?location=es-ct">Catalonia</a>
                    </td>
                  </tr>
                  <tr>
                    <td>United States</td>
                    <td>us</td>
                    <td>
                      <a href="/api?location=us-ca">California</a>
                    </td>
                  </tr>
                </table>
              `,
              { status: 200 },
            ),
          );
        }

        if (url.startsWith('https://calendarific.test/api/v2/holidays')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                response: {
                  holidays: [
                    {
                      date: { iso: '2026-01-06T00:00:00+01:00' },
                      name: 'Epiphany',
                    },
                    {
                      date: { iso: '2026-05-02T00:00:00+01:00' },
                      name: 'Community Day',
                    },
                  ],
                },
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

    await completeSetup([
      {
        code: 'calendarific',
        credentials: { secret: 'calendarific-key' },
        enabled: true,
        mode: 'api-key',
      },
    ]);
    await signUpAndVerify('owner@example.com', 'Owner', 'owner-password-123');
    const owner = await signIn('owner@example.com', 'owner-password-123');

    const catalogResponse = await request(getTestServer())
      .get('/time/holidays/locations?providerCode=calendarific&countryCode=ES')
      .set('cookie', owner.cookie)
      .expect(200);

    const catalogBody = catalogResponse.body as {
      catalog: {
        configured: boolean;
        countries: Array<{ code: string; name: string }>;
        enabled: boolean;
        subdivisions: Array<{ code: string; name: string }>;
      };
    };

    expect(catalogBody.catalog.enabled).toBe(true);
    expect(catalogBody.catalog.configured).toBe(true);
    expect(catalogBody.catalog.countries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'ES', name: 'Spain' }),
      ]),
    );
    expect(catalogBody.catalog.subdivisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'ES-MD', name: 'Madrid' }),
      ]),
    );

    const firstImport = await request(getTestServer())
      .post('/time/holidays/import')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        locationCode: 'ES-MD',
        providerCode: 'calendarific',
        scopeLevel: 'user',
        year: 2026,
      })
      .expect(201);

    const firstImportBody = firstImport.body as {
      importResult: { imported: number; replaced: number };
    };
    expect(firstImportBody.importResult).toMatchObject({
      imported: 2,
      replaced: 0,
    });

    const secondImport = await request(getTestServer())
      .post('/time/holidays/import')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        locationCode: 'ES-MD',
        providerCode: 'calendarific',
        scopeLevel: 'user',
        year: 2026,
      })
      .expect(201);

    const secondImportBody = secondImport.body as {
      importResult: { imported: number; replaced: number };
    };
    expect(secondImportBody.importResult).toMatchObject({
      imported: 2,
      replaced: 2,
    });

    const policies = await request(getTestServer())
      .get('/time/policies?policyType=holiday')
      .set('cookie', owner.cookie)
      .expect(200);

    expect(
      (
        policies.body as {
          policies: Array<{ sourceType: string; title: string }>;
        }
      ).policies,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'official',
          title: 'Community Day',
        }),
        expect.objectContaining({ sourceType: 'official', title: 'Epiphany' }),
      ]),
    );
    expect((policies.body as { policies: unknown[] }).policies).toHaveLength(2);
  });

  it('evaluates org advisory activity for the target user based on visible org calendars, not creator ownership', async () => {
    await completeSetup();
    await signUpAndVerify('owner@example.com', 'Owner', 'owner-password-123');
    await signUpAndVerify(
      'member@example.com',
      'Member',
      'member-password-123',
    );

    const owner = await signIn('owner@example.com', 'owner-password-123');
    const member = await signIn('member@example.com', 'member-password-123');

    const organizationId = await createOrganizationAs(owner, 'Advisory Org');
    await switchContext(owner, {
      contextType: 'organization',
      organizationId,
    });

    const ownerOrgHeaders = {
      cookie: owner.cookie,
      'x-csrf-token': owner.csrf,
      'x-active-context-id': organizationId,
      'x-active-context-type': 'organization',
      'x-tenant-id': organizationId,
    };

    const inviteResponse = await request(getTestServer())
      .post(`/org/organizations/${organizationId}/invitations`)
      .set(ownerOrgHeaders)
      .send({ email: 'member@example.com', role: 'member' })
      .expect(201);

    await request(getTestServer())
      .post('/org/invitations/accept')
      .set('cookie', member.cookie)
      .set('x-csrf-token', member.csrf)
      .send({
        inviteCode: (
          inviteResponse.body as { invitation: { previewInviteCode: string } }
        ).invitation.previewInviteCode,
      })
      .expect(201);

    const memberId = (
      (
        await request(getTestServer())
          .get(`/org/organizations/${organizationId}/memberships`)
          .set(ownerOrgHeaders)
          .expect(200)
      ).body as { memberships: Array<{ email: string; userId: string }> }
    ).memberships.find((entry) => entry.email === 'member@example.com')!.userId;

    const calendarId = (
      (
        await request(getTestServer())
          .post(`/org/organizations/${organizationId}/calendars`)
          .set(ownerOrgHeaders)
          .send({ name: 'Member Duties', ownerUserId: memberId })
          .expect(201)
      ).body as { calendar: { id: string } }
    ).calendar.id;

    await request(getTestServer())
      .post('/cal/events')
      .set(ownerOrgHeaders)
      .send({
        calendarIds: [calendarId],
        title: 'Assigned org shift',
        startAt: '2026-03-12T09:00:00.000Z',
        endAt: '2026-03-12T10:00:00.000Z',
      })
      .expect(201);

    const advisoryResponse = await request(getTestServer())
      .post('/time/advisory/evaluate')
      .set(ownerOrgHeaders)
      .send({
        itemType: 'event',
        title: 'Targeted org candidate',
        startAt: '2026-03-12T09:30:00.000Z',
        endAt: '2026-03-12T10:30:00.000Z',
        targetUserId: memberId,
      })
      .expect(201);

    const advisory = (
      advisoryResponse.body as {
        advisory: {
          concerns: Array<{
            category: string;
            details: { overlapCount?: number };
          }>;
        };
      }
    ).advisory;

    const overlapConcern = advisory.concerns.find(
      (entry) => entry.category === 'overlap',
    );

    expect(overlapConcern?.details.overlapCount).toBe(1);
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

  it('derives provider-backed commute and weather signals from adjacent activity locations', async () => {
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
        title: 'Morning site visit',
        startAt: '2026-03-12T08:30:00.000Z',
        endAt: '2026-03-12T09:30:00.000Z',
        location: 'Office Hub',
      })
      .expect(201);

    await request(getTestServer())
      .post('/cal/events')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        calendarIds: [calendarId],
        title: 'Late delivery check',
        startAt: '2026-03-12T11:00:00.000Z',
        endAt: '2026-03-12T11:30:00.000Z',
        location: 'Distribution Terminal',
      })
      .expect(201);

    const advisoryResponse = await request(getTestServer())
      .post('/time/advisory/evaluate')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        itemType: 'event',
        title: 'Warehouse walkthrough',
        startAt: '2026-03-12T10:00:00.000Z',
        endAt: '2026-03-12T10:30:00.000Z',
        location: 'Warehouse Yard',
      })
      .expect(201);

    const advisory = (
      advisoryResponse.body as {
        advisory: {
          concerns: Array<{
            category: string;
            details: Record<string, string | number | null>;
          }>;
        };
      }
    ).advisory;

    const commuteConcern = advisory.concerns.find(
      (entry) => entry.category === 'commute',
    );
    const weatherConcern = advisory.concerns.find(
      (entry) => entry.category === 'weather_related_preparation',
    );

    expect(commuteConcern?.details.source).toBe('provider');
    expect(weatherConcern?.details.source).toBe('provider');
  });

  it('makes provider commute advisory depend on departure time', async () => {
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
        title: 'Morning departure',
        startAt: '2026-03-12T08:00:00.000Z',
        endAt: '2026-03-12T09:00:00.000Z',
        location: 'Office Hub',
      })
      .expect(201);

    await request(getTestServer())
      .post('/cal/events')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        calendarIds: [calendarId],
        title: 'Late departure',
        startAt: '2026-03-12T22:00:00.000Z',
        endAt: '2026-03-12T23:00:00.000Z',
        location: 'Office Hub',
      })
      .expect(201);

    const rushHourResponse = await request(getTestServer())
      .post('/time/advisory/evaluate')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        itemType: 'event',
        title: 'Rush hour warehouse visit',
        startAt: '2026-03-12T09:15:00.000Z',
        endAt: '2026-03-12T09:45:00.000Z',
        location: 'Warehouse Yard',
      })
      .expect(201);

    const lateNightResponse = await request(getTestServer())
      .post('/time/advisory/evaluate')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        itemType: 'event',
        title: 'Late warehouse visit',
        startAt: '2026-03-12T23:15:00.000Z',
        endAt: '2026-03-12T23:45:00.000Z',
        location: 'Warehouse Yard',
      })
      .expect(201);

    const rushHourAdvisory = (
      rushHourResponse.body as {
        advisory: {
          concerns: Array<{
            category: string;
            details: { commuteMinutesBefore?: number; source?: string };
          }>;
        };
      }
    ).advisory;
    const lateNightAdvisory = (
      lateNightResponse.body as {
        advisory: {
          concerns: Array<{
            category: string;
            details: { commuteMinutesBefore?: number; source?: string };
          }>;
        };
      }
    ).advisory;

    const rushHourCommute = rushHourAdvisory.concerns.find(
      (entry) => entry.category === 'commute',
    );
    const lateNightCommute = lateNightAdvisory.concerns.find(
      (entry) => entry.category === 'commute',
    );

    expect(rushHourCommute).toBeUndefined();
    expect(lateNightCommute?.details.source).toBe('provider');
    expect(lateNightCommute?.details.commuteMinutesBefore).toBeLessThan(20);
  });

  it('evaluates weekly maximum-hour warnings using activities earlier in the same week', async () => {
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
        title: 'Monday project block',
        startAt: '2026-03-09T08:00:00.000Z',
        endAt: '2026-03-09T16:00:00.000Z',
        workRelated: true,
      })
      .expect(201);

    await request(getTestServer())
      .post('/cal/events')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        calendarIds: [calendarId],
        title: 'Tuesday project block',
        startAt: '2026-03-10T08:00:00.000Z',
        endAt: '2026-03-10T16:00:00.000Z',
        workRelated: true,
      })
      .expect(201);

    await request(getTestServer())
      .post('/time/policies')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        policyType: 'max_hours',
        scopeLevel: 'user',
        title: 'Weekly cap',
        maxWeeklyMinutes: 960,
      })
      .expect(201);

    const advisoryResponse = await request(getTestServer())
      .post('/time/advisory/evaluate')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        itemType: 'event',
        title: 'Wednesday project block',
        startAt: '2026-03-11T09:00:00.000Z',
        endAt: '2026-03-11T11:00:00.000Z',
        workRelated: true,
      })
      .expect(201);

    const advisory = (
      advisoryResponse.body as {
        advisory: {
          concerns: Array<{ category: string }>;
        };
      }
    ).advisory;

    expect(
      advisory.concerns.some((entry) => entry.category === 'maximum_hours'),
    ).toBe(true);
  });
});
