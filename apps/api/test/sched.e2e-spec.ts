import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { Client } from 'pg';
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

describe('schedules, recurrence, and materialization (e2e)', () => {
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

  async function createScheduleAs(
    user: SignedInUser,
    definition: Record<string, unknown>,
  ) {
    const response = await request(getTestServer())
      .post('/sched')
      .set('cookie', user.cookie)
      .set('x-csrf-token', user.csrf)
      .send(definition)
      .expect(201);

    return response.body as {
      schedule: {
        id: string;
        versions: Array<{
          items: Array<{ id: string; title: string }>;
        }>;
      };
    };
  }

  async function listOccurrencesAs(
    user: SignedInUser,
    scheduleId: string,
    from: string,
    to: string,
  ) {
    const response = await request(getTestServer())
      .get(`/sched/${scheduleId}/occurrences`)
      .query({ from, to })
      .set('cookie', user.cookie)
      .expect(200);

    return (
      response.body as {
        occurrences: Array<{
          dueAt: string | null;
          itemDefinitionId: string;
          localDate: string;
          occurrenceDate: string;
          startsAt: string | null;
          title: string;
        }>;
      }
    ).occurrences;
  }

  async function countProjections(scheduleId: string) {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const result = await client.query<{ count: string }>(
        `select count(*)::text as count
         from schedule_occurrence_projections
         where schedule_id = $1`,
        [scheduleId],
      );
      return Number(result.rows[0]?.count ?? 0);
    } finally {
      await client.end();
    }
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

  it('supports wall-clock and UTC-constant DST behavior, preserves exceptions, and keeps materialization idempotent', async () => {
    await completeSetup();
    await signUpAndVerify('owner@example.com', 'Owner', 'owner-password-123');
    const owner = await signIn('owner@example.com', 'owner-password-123');

    const wallClockSchedule = await createScheduleAs(owner, {
      boundaryStartDate: '2026-03-23',
      name: 'Madrid mornings',
      state: 'active',
      versions: [
        {
          effectiveFromDate: '2026-03-23',
          items: [
            {
              dayOffset: 0,
              durationMinutes: 60,
              itemType: 'event',
              repetitionMode: 'grouped',
              startTime: '09:00',
              title: 'Opening shift',
              workRelated: true,
            },
            {
              dayOffset: 0,
              dueTime: '11:00',
              itemType: 'task',
              repetitionMode: 'individual',
              title: 'Checklist',
              workRelated: true,
            },
          ],
          recurrence: {
            frequency: 'weekly',
            interval: 1,
            pauses: [],
            weekdays: [1],
          },
          timezone: 'Europe/Madrid',
          timezoneMode: 'wall_clock',
        },
      ],
    });

    const utcConstantSchedule = await createScheduleAs(owner, {
      boundaryStartDate: '2026-03-23',
      name: 'UTC-fixed handoff',
      state: 'active',
      versions: [
        {
          effectiveFromDate: '2026-03-23',
          items: [
            {
              dayOffset: 0,
              durationMinutes: 30,
              itemType: 'event',
              repetitionMode: 'grouped',
              startTime: '09:00',
              title: 'UTC handoff',
              workRelated: true,
            },
          ],
          recurrence: {
            frequency: 'weekly',
            interval: 1,
            pauses: [],
            weekdays: [1],
          },
          timezone: 'Europe/Madrid',
          timezoneMode: 'utc_constant',
        },
      ],
    });

    const wallClockScheduleId = wallClockSchedule.schedule.id;
    const utcConstantScheduleId = utcConstantSchedule.schedule.id;
    const checklistItemId =
      wallClockSchedule.schedule.versions[0]?.items.find(
        (item) => item.title === 'Checklist',
      )?.id ?? null;

    const wallClockOccurrences = await listOccurrencesAs(
      owner,
      wallClockScheduleId,
      '2026-03-23',
      '2026-04-06',
    );
    const utcConstantOccurrences = await listOccurrencesAs(
      owner,
      utcConstantScheduleId,
      '2026-03-23',
      '2026-04-06',
    );

    const wallClockEventStarts = wallClockOccurrences
      .filter((occurrence) => occurrence.startsAt)
      .map((occurrence) => occurrence.startsAt);
    const utcConstantStarts = utcConstantOccurrences
      .filter((occurrence) => occurrence.startsAt)
      .map((occurrence) => occurrence.startsAt);

    expect(wallClockEventStarts).toEqual([
      '2026-03-23T08:00:00.000Z',
      '2026-03-30T07:00:00.000Z',
      '2026-04-06T07:00:00.000Z',
    ]);
    expect(utcConstantStarts).toEqual([
      '2026-03-23T08:00:00.000Z',
      '2026-03-30T08:00:00.000Z',
      '2026-04-06T08:00:00.000Z',
    ]);

    expect(checklistItemId).toBeTruthy();

    await request(getTestServer())
      .post(`/sched/${wallClockScheduleId}/occurrences/2026-03-30/mutate`)
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        action: 'replace',
        detached: true,
        overrideItem: {
          dayOffset: 0,
          dueTime: '12:00',
          itemType: 'task',
          repetitionMode: 'individual',
          title: 'Checklist - detached',
          workRelated: true,
        },
        scope: 'selected',
        targetItemId: checklistItemId,
      })
      .expect(201);

    await request(getTestServer())
      .post(`/sched/${wallClockScheduleId}/occurrences/2026-03-30/mutate`)
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        action: 'move',
        movedToDate: '2026-03-31',
        scope: 'selected_and_future',
      })
      .expect(409);

    await request(getTestServer())
      .post(`/sched/${wallClockScheduleId}/occurrences/2026-03-30/mutate`)
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        action: 'move',
        movedToDate: '2026-03-31',
        overwriteExceptions: true,
        scope: 'selected_and_future',
      })
      .expect(201);

    const refreshedOccurrences = await listOccurrencesAs(
      owner,
      wallClockScheduleId,
      '2026-03-23',
      '2026-04-06',
    );
    expect(
      refreshedOccurrences.some((occurrence) =>
        occurrence.title.includes('detached'),
      ),
    ).toBe(false);

    const beforeCount = await countProjections(wallClockScheduleId);
    await listOccurrencesAs(
      owner,
      wallClockScheduleId,
      '2026-03-23',
      '2026-04-06',
    );
    const afterCount = await countProjections(wallClockScheduleId);
    expect(afterCount).toBe(beforeCount);

    const calendarViewResponse = await request(getTestServer())
      .get('/cal/calendar-view')
      .query({
        from: '2026-03-22T00:00:00.000Z',
        to: '2026-03-31T23:59:59.000Z',
      })
      .set('cookie', owner.cookie)
      .expect(200);

    expect(
      (
        calendarViewResponse.body as {
          view: {
            entries: Array<{ calendarEntryType: string; scheduleId?: string }>;
          };
        }
      ).view.entries.some(
        (entry) =>
          entry.calendarEntryType === 'schedule_occurrence' &&
          entry.scheduleId === wallClockScheduleId,
      ),
    ).toBe(true);
  });
});
