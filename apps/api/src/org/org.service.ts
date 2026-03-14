import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { DatabaseService } from '../persistence/database.service';
import { AuditService } from '../security/audit.service';

type MembershipRole = 'admin' | 'member';

type SessionContextDescriptor = {
  key: string;
  label: string;
  membershipRole: MembershipRole | null;
  context: {
    id: string;
    tenantId: string | null;
    type: 'organization' | 'personal' | 'system';
  };
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

@Injectable()
export class OrgService {
  constructor(
    private readonly auditService: AuditService,
    private readonly databaseService: DatabaseService,
  ) {}

  async createOrganization(input: { actorId: string; name: string }) {
    const timestamp = nowIso();
    const organizationId = randomUUID();

    const result = await this.databaseService.transaction(async (client) => {
      await client.query(
        `insert into organizations (
           id,
           name,
           created_by_user_id,
           created_at,
           updated_at
         )
         values ($1, $2, $3, $4, $5)`,
        [
          organizationId,
          input.name.trim(),
          input.actorId,
          timestamp,
          timestamp,
        ],
      );

      await client.query(
        `insert into organization_memberships (
           id,
           organization_id,
           user_id,
           role,
           can_view_all_calendars,
           created_at,
           updated_at
         )
         values ($1, $2, $3, 'admin', true, $4, $5)`,
        [randomUUID(), organizationId, input.actorId, timestamp, timestamp],
      );

      const organization = await client.query<{
        id: string;
        name: string;
      }>(
        `select id, name
         from organizations
         where id = $1`,
        [organizationId],
      );

      return organization.rows[0];
    });

    this.auditService.emit({
      action: 'org.organization.created',
      details: {
        organizationName: result.name,
      },
      targetId: result.id,
      targetType: 'organization',
    });

    return result;
  }

  async listOrganizationsForUser(actorId: string) {
    const result = await this.databaseService.query<{
      organization_id: string;
      organization_name: string;
      membership_role: MembershipRole;
    }>(
      `select
         m.organization_id,
         o.name as organization_name,
         m.role as membership_role
       from organization_memberships m
       inner join organizations o
         on o.id = m.organization_id
       where m.user_id = $1
       order by o.name asc`,
      [actorId],
    );

    return result.rows.map((row) => ({
      id: row.organization_id,
      membershipRole: row.membership_role,
      name: row.organization_name,
    }));
  }

  async resolveOrganizationContextForActor(input: {
    actorId: string;
    organizationId: string;
  }) {
    const result = await this.databaseService.query<{
      organization_id: string;
      organization_name: string;
      role: MembershipRole;
    }>(
      `select
         m.organization_id,
         o.name as organization_name,
         m.role
       from organization_memberships m
       inner join organizations o
         on o.id = m.organization_id
       where m.user_id = $1
         and m.organization_id = $2`,
      [input.actorId, input.organizationId],
    );

    const membership = result.rows[0];
    if (!membership) {
      throw new ForbiddenException(
        'The current user is not an active member of that organization.',
      );
    }

    return {
      context: {
        id: membership.organization_id,
        tenantId: membership.organization_id,
        type: 'organization' as const,
      },
      contextLabel: `Organization: ${membership.organization_name}`,
      membershipRole: membership.role,
    };
  }

  async listSessionContextsForActor(input: {
    actorId: string;
    actorRoles: string[];
  }): Promise<SessionContextDescriptor[]> {
    const organizations = await this.listOrganizationsForUser(input.actorId);

    const contexts: SessionContextDescriptor[] = [
      {
        key: 'personal',
        label: 'Personal',
        membershipRole: null,
        context: {
          id: input.actorId,
          tenantId: null,
          type: 'personal',
        },
      },
      ...organizations.map((organization) => ({
        key: `org:${organization.id}`,
        label: `Organization: ${organization.name}`,
        membershipRole: organization.membershipRole,
        context: {
          id: organization.id,
          tenantId: organization.id,
          type: 'organization' as const,
        },
      })),
    ];

    if (input.actorRoles.includes('system-admin')) {
      contexts.push({
        key: 'system',
        label: 'System Administration',
        membershipRole: null,
        context: {
          id: input.actorId,
          tenantId: null,
          type: 'system',
        },
      });
    }

    return contexts;
  }

  async listMemberships(input: { actorId: string; organizationId: string }) {
    await this.assertOrganizationAdmin(input.organizationId, input.actorId);

    const result = await this.databaseService.query<{
      email: string;
      name: string;
      role: MembershipRole;
      user_id: string;
    }>(
      `select
         u.id as user_id,
         u.email,
         u.name,
         m.role
       from organization_memberships m
       inner join users u
         on u.id = m.user_id
       where m.organization_id = $1
       order by u.email asc`,
      [input.organizationId],
    );

    return result.rows.map((row) => ({
      email: row.email,
      name: row.name,
      role: row.role,
      userId: row.user_id,
    }));
  }

  async createInvitation(input: {
    actorId: string;
    email: string;
    organizationId: string;
    role: MembershipRole;
  }) {
    await this.assertOrganizationAdmin(input.organizationId, input.actorId);

    const email = normalizeEmail(input.email);

    const existingMember = await this.databaseService.query<{
      exists: boolean;
    }>(
      `select exists(
         select 1
         from organization_memberships m
         inner join users u on u.id = m.user_id
         where m.organization_id = $1
           and u.email = $2
       ) as exists`,
      [input.organizationId, email],
    );

    if (existingMember.rows[0]?.exists) {
      throw new ConflictException(
        'That email is already an organization member.',
      );
    }

    const inviteCode = randomBytes(24).toString('base64url');
    const timestamp = nowIso();
    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const organizationResult = await this.databaseService.query<{ name: string }>(
      `select name
       from organizations
       where id = $1`,
      [input.organizationId],
    );
    const organizationName =
      organizationResult.rows[0]?.name ?? 'your organization';

    const result = await this.databaseService.query<{
      id: string;
      invited_email: string;
      organization_id: string;
      role: MembershipRole;
    }>(
      `insert into organization_invitations (
         id,
         organization_id,
         invited_email,
         invited_by_user_id,
         role,
         invite_code,
         accepted_by_user_id,
         accepted_at,
         expires_at,
         created_at
       )
       values ($1, $2, $3, $4, $5, $6, null, null, $7, $8)
       returning id, organization_id, invited_email, role`,
      [
        randomUUID(),
        input.organizationId,
        email,
        input.actorId,
        input.role,
        inviteCode,
        expiresAt,
        timestamp,
      ],
    );

    await this.queueInvitationMail({
      email,
      expiresAt,
      inviteCode,
      organizationName,
      role: input.role,
    });

    this.auditService.emit({
      action: 'org.invitation.created',
      details: {
        invitedEmail: email,
        role: input.role,
      },
      targetId: result.rows[0].id,
      targetType: 'organization-invitation',
    });

    return {
      id: result.rows[0].id,
      invitedEmail: result.rows[0].invited_email,
      organizationId: result.rows[0].organization_id,
      previewInviteCode: inviteCode,
      role: result.rows[0].role,
    };
  }

  async listOrganizationInvitations(input: {
    actorId: string;
    organizationId: string;
  }) {
    await this.assertOrganizationAdmin(input.organizationId, input.actorId);

    const result = await this.databaseService.query<{
      created_at: string;
      expires_at: string;
      id: string;
      invited_email: string;
      role: MembershipRole;
    }>(
      `select
         id,
         invited_email,
         role,
         expires_at,
         created_at
       from organization_invitations
       where organization_id = $1
         and accepted_at is null
       order by created_at desc`,
      [input.organizationId],
    );

    return result.rows.map((row) => ({
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      id: row.id,
      invitedEmail: row.invited_email,
      role: row.role,
    }));
  }

  async listInvitationsForActor(actorId: string) {
    const userResult = await this.databaseService.query<{ email: string }>(
      `select email
       from users
       where id = $1`,
      [actorId],
    );

    const email = userResult.rows[0]?.email;
    if (!email) {
      return [];
    }

    const invitations = await this.databaseService.query<{
      created_at: string;
      expires_at: string;
      id: string;
      invite_code: string;
      organization_id: string;
      organization_name: string;
      role: MembershipRole;
    }>(
      `select
         i.id,
         i.organization_id,
         o.name as organization_name,
         i.role,
         i.invite_code,
         i.expires_at,
         i.created_at
       from organization_invitations i
       inner join organizations o
         on o.id = i.organization_id
       where i.invited_email = $1
         and i.accepted_at is null
         and i.expires_at > now()
       order by i.created_at desc`,
      [email],
    );

    return invitations.rows.map((invitation) => ({
      createdAt: invitation.created_at,
      expiresAt: invitation.expires_at,
      id: invitation.id,
      inviteCode: invitation.invite_code,
      organizationId: invitation.organization_id,
      organizationName: invitation.organization_name,
      role: invitation.role,
    }));
  }

  async acceptInvitation(input: { actorId: string; inviteCode: string }) {
    return this.databaseService.transaction(async (client) => {
      const actorResult = await client.query<{ email: string }>(
        `select email
         from users
         where id = $1`,
        [input.actorId],
      );

      const actorEmail = actorResult.rows[0]?.email;
      if (!actorEmail) {
        throw new NotFoundException('User not found.');
      }

      const invitationResult = await client.query<{
        id: string;
        invited_email: string;
        organization_id: string;
        role: MembershipRole;
      }>(
        `select id, invited_email, organization_id, role
         from organization_invitations
         where invite_code = $1
           and accepted_at is null
           and expires_at > now()`,
        [input.inviteCode],
      );

      const invitation = invitationResult.rows[0];
      if (!invitation) {
        throw new NotFoundException('Invitation not found or expired.');
      }

      if (
        normalizeEmail(invitation.invited_email) !== normalizeEmail(actorEmail)
      ) {
        throw new ForbiddenException(
          'This invitation was issued for a different email address.',
        );
      }

      await client.query(
        `insert into organization_memberships (
           id,
           organization_id,
           user_id,
           role,
           can_view_all_calendars,
           created_at,
           updated_at
         )
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (organization_id, user_id)
         do update set
           role = excluded.role,
           can_view_all_calendars = excluded.can_view_all_calendars,
           updated_at = excluded.updated_at`,
        [
          randomUUID(),
          invitation.organization_id,
          input.actorId,
          invitation.role,
          invitation.role === 'admin',
          nowIso(),
          nowIso(),
        ],
      );

      await client.query(
        `update organization_invitations
         set accepted_by_user_id = $2,
             accepted_at = $3
         where id = $1`,
        [invitation.id, input.actorId, nowIso()],
      );

      this.auditService.emit({
        action: 'org.invitation.accepted',
        details: {
          organizationId: invitation.organization_id,
          role: invitation.role,
        },
        targetId: invitation.id,
        targetType: 'organization-invitation',
      });

      return {
        invitationId: invitation.id,
        organizationId: invitation.organization_id,
        role: invitation.role,
      };
    });
  }

  async createGroup(input: {
    actorId: string;
    name: string;
    organizationId: string;
  }) {
    await this.assertOrganizationAdmin(input.organizationId, input.actorId);

    const timestamp = nowIso();
    try {
      const result = await this.databaseService.query<{
        id: string;
        name: string;
      }>(
        `insert into organization_groups (
           id,
           organization_id,
           name,
           created_by_user_id,
           created_at,
           updated_at
         )
         values ($1, $2, $3, $4, $5, $6)
         returning id, name`,
        [
          randomUUID(),
          input.organizationId,
          input.name.trim(),
          input.actorId,
          timestamp,
          timestamp,
        ],
      );

      return {
        id: result.rows[0].id,
        name: result.rows[0].name,
      };
    } catch (error) {
      if (
        String(error).includes('organization_groups_organization_id_name_key')
      ) {
        throw new ConflictException('A group with that name already exists.');
      }

      throw error;
    }
  }

  async addUserToGroup(input: {
    actorId: string;
    groupId: string;
    organizationId: string;
    userId: string;
  }) {
    await this.assertOrganizationAdmin(input.organizationId, input.actorId);
    await this.assertGroupBelongsToOrganization(
      input.groupId,
      input.organizationId,
    );
    await this.assertUserIsOrganizationMember(
      input.organizationId,
      input.userId,
    );

    await this.databaseService.query(
      `insert into organization_group_members (
         group_id,
         user_id,
         added_at
       )
       values ($1, $2, $3)
       on conflict do nothing`,
      [input.groupId, input.userId, nowIso()],
    );

    return { ok: true };
  }

  async removeUserFromGroup(input: {
    actorId: string;
    groupId: string;
    organizationId: string;
    userId: string;
  }) {
    await this.assertOrganizationAdmin(input.organizationId, input.actorId);
    await this.assertGroupBelongsToOrganization(
      input.groupId,
      input.organizationId,
    );

    await this.databaseService.query(
      `delete from organization_group_members
       where group_id = $1
         and user_id = $2`,
      [input.groupId, input.userId],
    );

    return { ok: true };
  }

  async listGroups(input: { actorId: string; organizationId: string }) {
    await this.assertOrganizationAdmin(input.organizationId, input.actorId);

    const groups = await this.databaseService.query<{
      group_id: string;
      group_name: string;
      member_email: string | null;
      member_name: string | null;
      member_user_id: string | null;
    }>(
      `select
         g.id as group_id,
         g.name as group_name,
         u.id as member_user_id,
         u.name as member_name,
         u.email as member_email
       from organization_groups g
       left join organization_group_members gm
         on gm.group_id = g.id
       left join users u
         on u.id = gm.user_id
       where g.organization_id = $1
       order by g.name asc, u.email asc nulls last`,
      [input.organizationId],
    );

    const groupMap = new Map<
      string,
      {
        id: string;
        members: Array<{ email: string; name: string; userId: string }>;
        name: string;
      }
    >();

    for (const row of groups.rows) {
      const existing = groupMap.get(row.group_id) ?? {
        id: row.group_id,
        members: [],
        name: row.group_name,
      };

      if (row.member_user_id && row.member_name && row.member_email) {
        existing.members.push({
          email: row.member_email,
          name: row.member_name,
          userId: row.member_user_id,
        });
      }

      groupMap.set(row.group_id, existing);
    }

    return [...groupMap.values()];
  }

  async createOrganizationCalendar(input: {
    actorId: string;
    name: string;
    organizationId: string;
    ownerUserId: string | null;
  }) {
    await this.assertOrganizationAdmin(input.organizationId, input.actorId);
    if (input.ownerUserId) {
      await this.assertUserIsOrganizationMember(
        input.organizationId,
        input.ownerUserId,
      );
    }

    const timestamp = nowIso();
    const result = await this.databaseService.query<{
      id: string;
      name: string;
      owner_user_id: string | null;
    }>(
      `insert into organization_calendars (
         id,
         organization_id,
         name,
         owner_user_id,
         created_by_user_id,
         created_at,
         updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, name, owner_user_id`,
      [
        randomUUID(),
        input.organizationId,
        input.name.trim(),
        input.ownerUserId,
        input.actorId,
        timestamp,
        timestamp,
      ],
    );

    return {
      id: result.rows[0].id,
      name: result.rows[0].name,
      ownerUserId: result.rows[0].owner_user_id,
    };
  }

  async listVisibleOrganizationCalendars(input: {
    actorId: string;
    organizationId: string;
  }) {
    const membership = await this.getMembership(
      input.organizationId,
      input.actorId,
    );
    if (!membership) {
      throw new ForbiddenException(
        'The current user is not an organization member.',
      );
    }

    const isAdmin = membership.role === 'admin';
    const visibleCalendars =
      isAdmin || membership.canViewAllCalendars
        ? await this.databaseService.query<{
            id: string;
            name: string;
            owner_user_id: string | null;
          }>(
            `select id, name, owner_user_id
           from organization_calendars
           where organization_id = $1
           order by name asc`,
            [input.organizationId],
          )
        : await this.databaseService.query<{
            id: string;
            name: string;
            owner_user_id: string | null;
          }>(
            `select distinct c.id, c.name, c.owner_user_id
           from organization_calendars c
           left join organization_calendar_visibility_grants g
             on g.calendar_id = c.id
             and g.user_id = $2
           where c.organization_id = $1
             and (
               c.owner_user_id is null
               or c.owner_user_id = $2
               or g.user_id is not null
             )
           order by c.name asc`,
            [input.organizationId, input.actorId],
          );

    const grantsByCalendarId = new Map<
      string,
      Array<{ email: string; name: string; userId: string }>
    >();

    if (isAdmin && visibleCalendars.rows.length > 0) {
      const visibilityGrants = await this.databaseService.query<{
        calendar_id: string;
        email: string;
        name: string;
        user_id: string;
      }>(
        `select
           g.calendar_id,
           u.email,
           u.name,
           u.id as user_id
         from organization_calendar_visibility_grants g
         inner join users u
           on u.id = g.user_id
         where g.organization_id = $1
         order by g.calendar_id asc, u.email asc`,
        [input.organizationId],
      );

      for (const grant of visibilityGrants.rows) {
        const existing = grantsByCalendarId.get(grant.calendar_id) ?? [];
        existing.push({
          email: grant.email,
          name: grant.name,
          userId: grant.user_id,
        });
        grantsByCalendarId.set(grant.calendar_id, existing);
      }
    }

    return visibleCalendars.rows.map((calendar) => ({
      defaultVisibility: calendar.owner_user_id ? 'owner-and-grants' : 'all-members',
      id: calendar.id,
      name: calendar.name,
      ownerUserId: calendar.owner_user_id,
      visibilityGrants: grantsByCalendarId.get(calendar.id) ?? [],
    }));
  }

  async grantCalendarVisibility(input: {
    actorId: string;
    calendarId: string;
    organizationId: string;
    userId: string;
  }) {
    await this.assertOrganizationAdmin(input.organizationId, input.actorId);
    await this.assertUserIsOrganizationMember(
      input.organizationId,
      input.userId,
    );

    const calendar = await this.databaseService.query<{
      id: string;
    }>(
      `select id
       from organization_calendars
       where id = $1
         and organization_id = $2`,
      [input.calendarId, input.organizationId],
    );

    if (!calendar.rows[0]) {
      throw new NotFoundException('Calendar not found in this organization.');
    }

    await this.databaseService.query(
      `insert into organization_calendar_visibility_grants (
         organization_id,
         calendar_id,
         user_id,
         granted_by_user_id,
         granted_at
       )
       values ($1, $2, $3, $4, $5)
       on conflict (calendar_id, user_id)
       do update set
         granted_by_user_id = excluded.granted_by_user_id,
         granted_at = excluded.granted_at`,
      [
        input.organizationId,
        input.calendarId,
        input.userId,
        input.actorId,
        nowIso(),
      ],
    );

    return { ok: true };
  }

  async revokeCalendarVisibility(input: {
    actorId: string;
    calendarId: string;
    organizationId: string;
    userId: string;
  }) {
    await this.assertOrganizationAdmin(input.organizationId, input.actorId);

    await this.databaseService.query(
      `delete from organization_calendar_visibility_grants
       where organization_id = $1
         and calendar_id = $2
         and user_id = $3`,
      [input.organizationId, input.calendarId, input.userId],
    );

    return { ok: true };
  }

  private async queueInvitationMail(input: {
    email: string;
    expiresAt: string;
    inviteCode: string;
    organizationName: string;
    role: MembershipRole;
  }) {
    await this.databaseService.query(
      `insert into mail_outbox (
         id,
         body,
         created_at,
         expires_at,
         kind,
         subject,
         recipient_email
       )
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        randomUUID(),
        [
          'From: no-reply@smart-schedule.local',
          `To: ${input.email}`,
          '',
          `You have been invited to join ${input.organizationName} as ${input.role}.`,
          `Use invite code: ${input.inviteCode}`,
          `This invitation expires at ${input.expiresAt}.`,
        ].join('\n'),
        nowIso(),
        input.expiresAt,
        'organization-invitation',
        `Invitation to join ${input.organizationName}`,
        input.email,
      ],
    );
  }

  private async assertOrganizationAdmin(
    organizationId: string,
    actorId: string,
  ) {
    const membership = await this.getMembership(organizationId, actorId);
    if (!membership || membership.role !== 'admin') {
      throw new ForbiddenException(
        'Only organization administrators can perform this action.',
      );
    }
  }

  private async getMembership(organizationId: string, actorId: string) {
    const result = await this.databaseService.query<{
      can_view_all_calendars: boolean;
      role: MembershipRole;
    }>(
      `select role, can_view_all_calendars
       from organization_memberships
       where organization_id = $1
         and user_id = $2`,
      [organizationId, actorId],
    );

    const membership = result.rows[0];
    if (!membership) {
      return null;
    }

    return {
      canViewAllCalendars: membership.can_view_all_calendars,
      role: membership.role,
    };
  }

  private async assertUserIsOrganizationMember(
    organizationId: string,
    userId: string,
  ) {
    const result = await this.databaseService.query<{ exists: boolean }>(
      `select exists(
         select 1
         from organization_memberships
         where organization_id = $1
           and user_id = $2
       ) as exists`,
      [organizationId, userId],
    );

    if (!result.rows[0]?.exists) {
      throw new BadRequestException(
        'The selected user is not a member of this organization.',
      );
    }
  }

  private async assertGroupBelongsToOrganization(
    groupId: string,
    organizationId: string,
  ) {
    const result = await this.databaseService.query<{ exists: boolean }>(
      `select exists(
         select 1
         from organization_groups
         where id = $1
           and organization_id = $2
       ) as exists`,
      [groupId, organizationId],
    );

    if (!result.rows[0]?.exists) {
      throw new NotFoundException('Group not found in this organization.');
    }
  }
}
