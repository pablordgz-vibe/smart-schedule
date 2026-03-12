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
    activeContext: {
      id: string | null;
      type: 'organization' | 'personal' | 'public' | 'system';
    };
    csrfToken: string;
    user: {
      id: string;
    } | null;
    availableContexts: Array<{
      key: string;
      label: string;
      membershipRole: 'admin' | 'member' | null;
      context: {
        id: string | null;
        type: 'organization' | 'personal' | 'public' | 'system';
      };
    }>;
  };
};

describe('organizations and context switching (e2e)', () => {
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

  async function signIn(email: string, password: string) {
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

  it('supports organization invitations for existing and new users', async () => {
    await completeSetup();
    await signUpAndVerify('owner@example.com', 'Owner', 'owner-password-123');
    await signUpAndVerify(
      'member@example.com',
      'Member',
      'member-password-123',
    );

    const owner = await signIn('owner@example.com', 'owner-password-123');
    const member = await signIn('member@example.com', 'member-password-123');

    const createOrgResponse = await request(getTestServer())
      .post('/org/organizations')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({ name: 'Atlas Ops' })
      .expect(201);

    const organizationId = (
      createOrgResponse.body as { organization: { id: string } }
    ).organization.id;

    const switchedOwner = await request(getTestServer())
      .post('/auth/context')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({ contextType: 'organization', organizationId })
      .expect(201);
    owner.cookie = switchedOwner.headers['set-cookie'][0];
    owner.csrf = (switchedOwner.body as SessionResponse).session.csrfToken;

    const inviteExistingResponse = await request(getTestServer())
      .post(`/org/organizations/${organizationId}/invitations`)
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .set('x-active-context-id', organizationId)
      .set('x-active-context-type', 'organization')
      .set('x-tenant-id', organizationId)
      .send({ email: 'member@example.com', role: 'member' })
      .expect(201);

    const inviteCodeForExisting = (
      inviteExistingResponse.body as {
        invitation: { previewInviteCode: string };
      }
    ).invitation.previewInviteCode;

    await request(getTestServer())
      .post('/org/invitations/accept')
      .set('cookie', member.cookie)
      .set('x-csrf-token', member.csrf)
      .send({ inviteCode: inviteCodeForExisting })
      .expect(201);

    const inviteNewResponse = await request(getTestServer())
      .post(`/org/organizations/${organizationId}/invitations`)
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .set('x-active-context-id', organizationId)
      .set('x-active-context-type', 'organization')
      .set('x-tenant-id', organizationId)
      .send({ email: 'new-user@example.com', role: 'member' })
      .expect(201);

    const inviteCodeForNewUser = (
      inviteNewResponse.body as { invitation: { previewInviteCode: string } }
    ).invitation.previewInviteCode;

    await signUpAndVerify(
      'new-user@example.com',
      'New User',
      'new-user-password-123',
    );
    const newUser = await signIn(
      'new-user@example.com',
      'new-user-password-123',
    );

    await request(getTestServer())
      .post('/org/invitations/accept')
      .set('cookie', newUser.cookie)
      .set('x-csrf-token', newUser.csrf)
      .send({ inviteCode: inviteCodeForNewUser })
      .expect(201);

    const contextsResponse = await request(getTestServer())
      .get('/auth/session')
      .set('cookie', member.cookie)
      .expect(200);

    const contexts = (contextsResponse.body as SessionResponse['session'])
      .availableContexts;
    expect(
      contexts.some(
        (context) =>
          context.context.type === 'organization' &&
          context.context.id === organizationId,
      ),
    ).toBe(true);
  });

  it('enforces default visibility and allows explicit organization calendar visibility grants', async () => {
    await completeSetup();
    await signUpAndVerify('owner@example.com', 'Owner', 'owner-password-123');
    await signUpAndVerify('alice@example.com', 'Alice', 'alice-password-123');
    await signUpAndVerify('bob@example.com', 'Bob', 'bob-password-123');

    const owner = await signIn('owner@example.com', 'owner-password-123');
    const alice = await signIn('alice@example.com', 'alice-password-123');
    const bob = await signIn('bob@example.com', 'bob-password-123');

    const createOrgResponse = await request(getTestServer())
      .post('/org/organizations')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({ name: 'Calendar Ops' })
      .expect(201);

    const organizationId = (
      createOrgResponse.body as { organization: { id: string } }
    ).organization.id;

    const switchedOwner = await request(getTestServer())
      .post('/auth/context')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({ contextType: 'organization', organizationId })
      .expect(201);
    owner.cookie = switchedOwner.headers['set-cookie'][0];
    owner.csrf = (switchedOwner.body as SessionResponse).session.csrfToken;

    const ownerOrgHeaders = {
      cookie: owner.cookie,
      'x-csrf-token': owner.csrf,
      'x-active-context-id': organizationId,
      'x-active-context-type': 'organization',
      'x-tenant-id': organizationId,
    };

    const inviteAlice = await request(getTestServer())
      .post(`/org/organizations/${organizationId}/invitations`)
      .set(ownerOrgHeaders)
      .send({ email: 'alice@example.com', role: 'member' })
      .expect(201);
    const inviteAliceBody = inviteAlice.body as {
      invitation: { previewInviteCode: string };
    };

    const inviteBob = await request(getTestServer())
      .post(`/org/organizations/${organizationId}/invitations`)
      .set(ownerOrgHeaders)
      .send({ email: 'bob@example.com', role: 'member' })
      .expect(201);
    const inviteBobBody = inviteBob.body as {
      invitation: { previewInviteCode: string };
    };

    await request(getTestServer())
      .post('/org/invitations/accept')
      .set('cookie', alice.cookie)
      .set('x-csrf-token', alice.csrf)
      .send({ inviteCode: inviteAliceBody.invitation.previewInviteCode })
      .expect(201);

    await request(getTestServer())
      .post('/org/invitations/accept')
      .set('cookie', bob.cookie)
      .set('x-csrf-token', bob.csrf)
      .send({ inviteCode: inviteBobBody.invitation.previewInviteCode })
      .expect(201);

    const aliceOrgContext = await request(getTestServer())
      .post('/auth/context')
      .set('cookie', alice.cookie)
      .set('x-csrf-token', alice.csrf)
      .send({ contextType: 'organization', organizationId })
      .expect(201);
    const aliceOrgCookie = aliceOrgContext.headers['set-cookie'][0];
    const aliceOrgCsrf = (aliceOrgContext.body as SessionResponse).session
      .csrfToken;

    const bobOrgContext = await request(getTestServer())
      .post('/auth/context')
      .set('cookie', bob.cookie)
      .set('x-csrf-token', bob.csrf)
      .send({ contextType: 'organization', organizationId })
      .expect(201);
    const bobOrgCookie = bobOrgContext.headers['set-cookie'][0];

    const membershipsResponse = await request(getTestServer())
      .get(`/org/organizations/${organizationId}/memberships`)
      .set(ownerOrgHeaders)
      .expect(200);
    const memberships = membershipsResponse.body as {
      memberships: Array<{ userId: string; email: string }>;
    };
    const aliceMemberId = memberships.memberships.find(
      (m) => m.email === 'alice@example.com',
    )!.userId;
    const bobMemberId = memberships.memberships.find(
      (m) => m.email === 'bob@example.com',
    )!.userId;

    const generalCalendar = await request(getTestServer())
      .post(`/org/organizations/${organizationId}/calendars`)
      .set(ownerOrgHeaders)
      .send({ name: 'General Team' })
      .expect(201);

    const aliceCalendar = await request(getTestServer())
      .post(`/org/organizations/${organizationId}/calendars`)
      .set(ownerOrgHeaders)
      .send({ name: 'Alice Duty', ownerUserId: aliceMemberId })
      .expect(201);

    const bobCalendar = await request(getTestServer())
      .post(`/org/organizations/${organizationId}/calendars`)
      .set(ownerOrgHeaders)
      .send({ name: 'Bob Duty', ownerUserId: bobMemberId })
      .expect(201);

    const bobBeforeGrant = await request(getTestServer())
      .get(`/org/organizations/${organizationId}/calendars`)
      .set('cookie', bobOrgCookie)
      .set('x-active-context-id', organizationId)
      .set('x-active-context-type', 'organization')
      .set('x-tenant-id', organizationId)
      .expect(200);

    const calendarNamesBefore = (
      bobBeforeGrant.body as { calendars: Array<{ name: string }> }
    ).calendars.map((calendar) => calendar.name);
    expect(calendarNamesBefore).toContain('General Team');
    expect(calendarNamesBefore).toContain('Bob Duty');
    expect(calendarNamesBefore).not.toContain('Alice Duty');

    await request(getTestServer())
      .post(
        `/org/organizations/${organizationId}/calendars/${
          (aliceCalendar.body as { calendar: { id: string } }).calendar.id
        }/visibility`,
      )
      .set(ownerOrgHeaders)
      .send({ userId: bobMemberId })
      .expect(201);

    const bobAfterGrant = await request(getTestServer())
      .get(`/org/organizations/${organizationId}/calendars`)
      .set('cookie', bobOrgCookie)
      .set('x-active-context-id', organizationId)
      .set('x-active-context-type', 'organization')
      .set('x-tenant-id', organizationId)
      .expect(200);

    expect(
      (
        bobAfterGrant.body as { calendars: Array<{ name: string }> }
      ).calendars.map((calendar) => calendar.name),
    ).toContain('Alice Duty');

    await request(getTestServer())
      .get(`/org/organizations/${organizationId}/calendars`)
      .set('cookie', aliceOrgCookie)
      .set('x-csrf-token', aliceOrgCsrf)
      .set('x-active-context-id', organizationId)
      .set('x-active-context-type', 'organization')
      .set('x-tenant-id', organizationId)
      .expect(200);

    void generalCalendar;
    void bobCalendar;
  });

  it('supports group creation and membership add/remove by org admins', async () => {
    await completeSetup();
    await signUpAndVerify('owner@example.com', 'Owner', 'owner-password-123');
    await signUpAndVerify(
      'member@example.com',
      'Member',
      'member-password-123',
    );

    const owner = await signIn('owner@example.com', 'owner-password-123');
    const member = await signIn('member@example.com', 'member-password-123');

    const createOrgResponse = await request(getTestServer())
      .post('/org/organizations')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({ name: 'Group Ops' })
      .expect(201);
    const organizationId = (
      createOrgResponse.body as { organization: { id: string } }
    ).organization.id;

    const switchedOwner = await request(getTestServer())
      .post('/auth/context')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({ contextType: 'organization', organizationId })
      .expect(201);
    owner.cookie = switchedOwner.headers['set-cookie'][0];
    owner.csrf = (switchedOwner.body as SessionResponse).session.csrfToken;

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
    const inviteBody = inviteResponse.body as {
      invitation: { previewInviteCode: string };
    };

    await request(getTestServer())
      .post('/org/invitations/accept')
      .set('cookie', member.cookie)
      .set('x-csrf-token', member.csrf)
      .send({ inviteCode: inviteBody.invitation.previewInviteCode })
      .expect(201);

    const memberId = (
      (
        await request(getTestServer())
          .get(`/org/organizations/${organizationId}/memberships`)
          .set(ownerOrgHeaders)
          .expect(200)
      ).body as { memberships: Array<{ email: string; userId: string }> }
    ).memberships.find((m) => m.email === 'member@example.com')!.userId;

    const groupId = (
      (
        await request(getTestServer())
          .post(`/org/organizations/${organizationId}/groups`)
          .set(ownerOrgHeaders)
          .send({ name: 'Night Shift' })
          .expect(201)
      ).body as { group: { id: string } }
    ).group.id;

    await request(getTestServer())
      .post(`/org/organizations/${organizationId}/groups/${groupId}/members`)
      .set(ownerOrgHeaders)
      .send({ userId: memberId })
      .expect(201);

    const withMember = await request(getTestServer())
      .get(`/org/organizations/${organizationId}/groups`)
      .set(ownerOrgHeaders)
      .expect(200);

    expect(
      (withMember.body as { groups: Array<{ members: unknown[] }> }).groups[0]
        ?.members.length,
    ).toBe(1);

    await request(getTestServer())
      .delete(
        `/org/organizations/${organizationId}/groups/${groupId}/members/${memberId}`,
      )
      .set(ownerOrgHeaders)
      .expect(200);

    const withoutMember = await request(getTestServer())
      .get(`/org/organizations/${organizationId}/groups`)
      .set(ownerOrgHeaders)
      .expect(200);

    expect(
      (withoutMember.body as { groups: Array<{ members: unknown[] }> })
        .groups[0]?.members.length,
    ).toBe(0);
  });

  it('enforces context binding for tenant isolation list surfaces', async () => {
    await completeSetup();
    await signUpAndVerify('owner@example.com', 'Owner', 'owner-password-123');
    const owner = await signIn('owner@example.com', 'owner-password-123');

    const orgA = (
      (
        await request(getTestServer())
          .post('/org/organizations')
          .set('cookie', owner.cookie)
          .set('x-csrf-token', owner.csrf)
          .send({ name: 'Org A' })
          .expect(201)
      ).body as { organization: { id: string } }
    ).organization.id;

    const orgB = (
      (
        await request(getTestServer())
          .post('/org/organizations')
          .set('cookie', owner.cookie)
          .set('x-csrf-token', owner.csrf)
          .send({ name: 'Org B' })
          .expect(201)
      ).body as { organization: { id: string } }
    ).organization.id;

    const switched = await request(getTestServer())
      .post('/auth/context')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({ contextType: 'organization', organizationId: orgA })
      .expect(201);

    const orgACookie = switched.headers['set-cookie'][0];

    await request(getTestServer())
      .get(`/org/organizations/${orgB}/calendars`)
      .set('cookie', orgACookie)
      .set('x-active-context-id', orgA)
      .set('x-active-context-type', 'organization')
      .set('x-tenant-id', orgA)
      .expect(403);
  });
});
