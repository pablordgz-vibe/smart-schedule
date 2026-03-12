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

describe('calendars, events, tasks, and copy model (e2e)', () => {
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

  async function getDefaultPersonalCalendar(user: SignedInUser) {
    const response = await request(getTestServer())
      .get('/cal/calendars')
      .set('cookie', user.cookie)
      .expect(200);

    const calendars = (response.body as { calendars: Array<{ id: string }> })
      .calendars;
    return calendars[0].id;
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

  it('keeps deadline-less tasks off calendar views while preserving them in task overview', async () => {
    await completeSetup();
    await signUpAndVerify('owner@example.com', 'Owner', 'owner-password-123');
    const owner = await signIn('owner@example.com', 'owner-password-123');

    const personalCalendarId = await getDefaultPersonalCalendar(owner);

    const createTaskResponse = await request(getTestServer())
      .post('/cal/tasks')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        calendarIds: [personalCalendarId],
        title: 'Backlog cleanup',
      })
      .expect(201);

    const taskId = (createTaskResponse.body as { task: { id: string } }).task
      .id;

    const calendarViewResponse = await request(getTestServer())
      .get('/cal/calendar-view')
      .query({
        from: '2026-03-10T00:00:00.000Z',
        to: '2026-03-20T00:00:00.000Z',
      })
      .set('cookie', owner.cookie)
      .expect(200);

    const entries = (
      calendarViewResponse.body as { view: { entries: Array<{ id: string }> } }
    ).view.entries;

    expect(entries.some((entry) => entry.id === taskId)).toBe(false);

    const tasksResponse = await request(getTestServer())
      .get('/cal/tasks')
      .set('cookie', owner.cookie)
      .expect(200);

    expect(
      (tasksResponse.body as { tasks: Array<{ id: string }> }).tasks.some(
        (task) => task.id === taskId,
      ),
    ).toBe(true);
  });

  it('tracks linked-event allocation and keeps linked-work events distinct from task due items', async () => {
    await completeSetup();
    await signUpAndVerify('owner@example.com', 'Owner', 'owner-password-123');
    const owner = await signIn('owner@example.com', 'owner-password-123');

    const personalCalendarId = await getDefaultPersonalCalendar(owner);

    const taskResponse = await request(getTestServer())
      .post('/cal/tasks')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        calendarIds: [personalCalendarId],
        dueAt: '2026-03-15T10:00:00.000Z',
        estimatedDurationMinutes: 60,
        title: 'Write architecture brief',
      })
      .expect(201);

    const taskId = (taskResponse.body as { task: { id: string } }).task.id;

    await request(getTestServer())
      .post('/cal/events')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        calendarIds: [personalCalendarId],
        endAt: '2026-03-15T09:45:00.000Z',
        linkedTaskId: taskId,
        startAt: '2026-03-15T08:15:00.000Z',
        title: 'Drafting block',
      })
      .expect(201);

    const calendarViewResponse = await request(getTestServer())
      .get('/cal/calendar-view')
      .query({
        from: '2026-03-14T00:00:00.000Z',
        to: '2026-03-16T23:59:59.000Z',
      })
      .set('cookie', owner.cookie)
      .expect(200);

    const entries = (
      calendarViewResponse.body as {
        view: {
          entries: Array<{
            calendarEntryType: 'event' | 'linked_work_event' | 'task_due';
            itemType: 'event' | 'task';
          }>;
        };
      }
    ).view.entries;

    expect(
      entries.some(
        (entry) =>
          entry.itemType === 'task' && entry.calendarEntryType === 'task_due',
      ),
    ).toBe(true);

    expect(
      entries.some(
        (entry) =>
          entry.itemType === 'event' &&
          entry.calendarEntryType === 'linked_work_event',
      ),
    ).toBe(true);

    const taskDetailResponse = await request(getTestServer())
      .get(`/cal/tasks/${taskId}`)
      .set('cookie', owner.cookie)
      .expect(200);

    const task = taskDetailResponse.body as {
      task: {
        allocation: {
          allocatedMinutes: number;
          overAllocated: boolean;
        };
      };
    };

    expect(task.task.allocation.allocatedMinutes).toBe(90);
    expect(task.task.allocation.overAllocated).toBe(true);
  });

  it('copies org items into personal context as independent records with provenance', async () => {
    await completeSetup();
    await signUpAndVerify('owner@example.com', 'Owner', 'owner-password-123');
    const owner = await signIn('owner@example.com', 'owner-password-123');

    const organizationId = await createOrganizationAs(owner, 'Ops Org');

    await switchContext(owner, {
      contextType: 'organization',
      organizationId,
    });

    const orgCalendarResponse = await request(getTestServer())
      .post(`/org/organizations/${organizationId}/calendars`)
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({ name: 'Org Team' })
      .expect(201);

    const orgCalendarId = (
      orgCalendarResponse.body as { calendar: { id: string } }
    ).calendar.id;

    const orgTaskResponse = await request(getTestServer())
      .post('/cal/tasks')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        calendarIds: [orgCalendarId],
        dueAt: '2026-03-18T09:00:00.000Z',
        title: 'Org launch checklist',
      })
      .expect(201);

    const orgTaskId = (orgTaskResponse.body as { task: { id: string } }).task
      .id;

    await switchContext(owner, {
      contextType: 'personal',
    });

    const personalCalendarId = await getDefaultPersonalCalendar(owner);

    const copyResponse = await request(getTestServer())
      .post(`/cal/items/task/${orgTaskId}/copy-to-personal`)
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({ calendarIds: [personalCalendarId] })
      .expect(201);

    const copiedTaskId = (copyResponse.body as { item: { id: string } }).item
      .id;

    await request(getTestServer())
      .patch(`/cal/tasks/${copiedTaskId}`)
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({ title: 'Personal retained copy' })
      .expect(200);

    const personalTaskResponse = await request(getTestServer())
      .get(`/cal/tasks/${copiedTaskId}`)
      .set('cookie', owner.cookie)
      .expect(200);

    const personalTask = personalTaskResponse.body as {
      task: {
        provenance: {
          sourceContextType: 'organization';
          sourceItemId: string;
          sourceOrganizationId: string;
        };
      };
    };

    expect(personalTask.task.provenance).not.toBeNull();
    expect(personalTask.task.provenance.sourceContextType).toBe('organization');
    expect(personalTask.task.provenance.sourceItemId).toBe(orgTaskId);
    expect(personalTask.task.provenance.sourceOrganizationId).toBe(
      organizationId,
    );

    await switchContext(owner, {
      contextType: 'organization',
      organizationId,
    });

    const orgTaskAfterCopyEdit = await request(getTestServer())
      .get(`/cal/tasks/${orgTaskId}`)
      .set('cookie', owner.cookie)
      .expect(200);

    expect(
      (orgTaskAfterCopyEdit.body as { task: { title: string } }).task.title,
    ).toBe('Org launch checklist');
  });

  it('allows contact associations in-scope and rejects cross-context associations', async () => {
    await completeSetup();
    await signUpAndVerify('owner@example.com', 'Owner', 'owner-password-123');
    const owner = await signIn('owner@example.com', 'owner-password-123');

    const personalCalendarId = await getDefaultPersonalCalendar(owner);

    const personalContactResponse = await request(getTestServer())
      .post('/cal/contacts/imported')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        displayName: 'Alex Vendor',
        providerCode: 'google-contacts',
        providerContactId: 'contact-1',
      })
      .expect(201);

    const personalContactId = (
      personalContactResponse.body as { contact: { id: string } }
    ).contact.id;

    const personalTaskResponse = await request(getTestServer())
      .post('/cal/tasks')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        calendarIds: [personalCalendarId],
        contactIds: [personalContactId],
        title: 'Reach out to vendor',
      })
      .expect(201);

    const personalTaskId = (
      personalTaskResponse.body as { task: { id: string } }
    ).task.id;

    const personalTaskDetailResponse = await request(getTestServer())
      .get(`/cal/tasks/${personalTaskId}`)
      .set('cookie', owner.cookie)
      .expect(200);

    const personalTask = personalTaskDetailResponse.body as {
      task: { contacts: Array<{ id: string }> };
    };

    expect(personalTask.task.contacts.map((contact) => contact.id)).toContain(
      personalContactId,
    );

    const organizationId = await createOrganizationAs(
      owner,
      'Contact Scope Org',
    );
    await switchContext(owner, {
      contextType: 'organization',
      organizationId,
    });

    const orgCalendarResponse = await request(getTestServer())
      .post(`/org/organizations/${organizationId}/calendars`)
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({ name: 'Org Contacts' })
      .expect(201);

    const orgCalendarId = (
      orgCalendarResponse.body as { calendar: { id: string } }
    ).calendar.id;

    await request(getTestServer())
      .post('/cal/tasks')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        calendarIds: [orgCalendarId],
        contactIds: [personalContactId],
        title: 'Should fail due to context mismatch',
      })
      .expect(403);
  });
});
