import { Injectable, computed, inject } from '@angular/core';
import { AuthStateService } from './auth-state.service';
import { ContextService } from './context.service';

type OrganizationSummary = {
  id: string;
  membershipRole: 'admin' | 'member';
  name: string;
};

export type MembershipSummary = {
  userId: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
};

type InvitationSummary = {
  id: string;
  invitedEmail: string;
  role: 'admin' | 'member';
  expiresAt?: string;
  createdAt?: string;
  previewInviteCode?: string;
};

export type GroupSummary = {
  id: string;
  name: string;
  members: Array<{ userId: string; name: string; email: string }>;
};

type CalendarSummary = {
  id: string;
  name: string;
  ownerUserId: string | null;
};

type ApiErrorResponse = {
  error?: { message?: string };
  message?: string | string[];
};

@Injectable({ providedIn: 'root' })
export class OrgApiService {
  private readonly authState = inject(AuthStateService);
  private readonly contextService = inject(ContextService);

  readonly activeOrganizationId = computed(
    () => this.contextService.activeContext().organizationId,
  );

  async listOrganizations() {
    const response = await this.fetchJson<{ organizations: OrganizationSummary[] }>(
      '/api/org/organizations/mine',
      {
        headers: this.authHeaders(),
      },
    );
    return response.organizations;
  }

  async createOrganization(name: string) {
    return this.fetchJson<{ organization: OrganizationSummary }>('/api/org/organizations', {
      body: JSON.stringify({ name }),
      headers: this.authJsonHeaders(),
      method: 'POST',
    });
  }

  async listMemberships(organizationId: string) {
    const response = await this.fetchJson<{ memberships: MembershipSummary[] }>(
      `/api/org/organizations/${organizationId}/memberships`,
      { headers: this.authHeaders() },
    );
    return response.memberships;
  }

  async createInvitation(input: {
    organizationId: string;
    email: string;
    role: 'admin' | 'member';
  }) {
    const response = await this.fetchJson<{ invitation: InvitationSummary }>(
      `/api/org/organizations/${input.organizationId}/invitations`,
      {
        body: JSON.stringify({ email: input.email, role: input.role }),
        headers: this.authJsonHeaders(),
        method: 'POST',
      },
    );
    return response.invitation;
  }

  async listOrganizationInvitations(organizationId: string) {
    const response = await this.fetchJson<{ invitations: InvitationSummary[] }>(
      `/api/org/organizations/${organizationId}/invitations`,
      { headers: this.authHeaders() },
    );
    return response.invitations;
  }

  async listMyInvitations() {
    const response = await this.fetchJson<{
      invitations: Array<
        InvitationSummary & {
          inviteCode: string;
          organizationId: string;
          organizationName: string;
        }
      >;
    }>('/api/org/invitations/mine', { headers: this.authHeaders() });
    return response.invitations;
  }

  async acceptInvitation(inviteCode: string) {
    return this.fetchJson('/api/org/invitations/accept', {
      body: JSON.stringify({ inviteCode }),
      headers: this.authJsonHeaders(),
      method: 'POST',
    });
  }

  async listGroups(organizationId: string) {
    const response = await this.fetchJson<{ groups: GroupSummary[] }>(
      `/api/org/organizations/${organizationId}/groups`,
      { headers: this.authHeaders() },
    );
    return response.groups;
  }

  async createGroup(organizationId: string, name: string) {
    const response = await this.fetchJson<{ group: { id: string; name: string } }>(
      `/api/org/organizations/${organizationId}/groups`,
      {
        body: JSON.stringify({ name }),
        headers: this.authJsonHeaders(),
        method: 'POST',
      },
    );
    return response.group;
  }

  async addGroupMember(organizationId: string, groupId: string, userId: string) {
    return this.fetchJson(`/api/org/organizations/${organizationId}/groups/${groupId}/members`, {
      body: JSON.stringify({ userId }),
      headers: this.authJsonHeaders(),
      method: 'POST',
    });
  }

  async removeGroupMember(organizationId: string, groupId: string, userId: string) {
    return this.fetchJson(
      `/api/org/organizations/${organizationId}/groups/${groupId}/members/${userId}`,
      {
        headers: this.authHeaders(),
        method: 'DELETE',
      },
    );
  }

  async listCalendars(organizationId: string) {
    const response = await this.fetchJson<{ calendars: CalendarSummary[] }>(
      `/api/org/organizations/${organizationId}/calendars`,
      { headers: this.authHeaders() },
    );
    return response.calendars;
  }

  async createCalendar(input: { organizationId: string; name: string; ownerUserId?: string }) {
    const response = await this.fetchJson<{ calendar: CalendarSummary }>(
      `/api/org/organizations/${input.organizationId}/calendars`,
      {
        body: JSON.stringify({ name: input.name, ownerUserId: input.ownerUserId }),
        headers: this.authJsonHeaders(),
        method: 'POST',
      },
    );
    return response.calendar;
  }

  async grantCalendarVisibility(organizationId: string, calendarId: string, userId: string) {
    return this.fetchJson(
      `/api/org/organizations/${organizationId}/calendars/${calendarId}/visibility`,
      {
        body: JSON.stringify({ userId }),
        headers: this.authJsonHeaders(),
        method: 'POST',
      },
    );
  }

  async revokeCalendarVisibility(organizationId: string, calendarId: string, userId: string) {
    return this.fetchJson(
      `/api/org/organizations/${organizationId}/calendars/${calendarId}/visibility/${userId}`,
      {
        headers: this.authHeaders(),
        method: 'DELETE',
      },
    );
  }

  private authHeaders() {
    return {
      'x-csrf-token': this.authState.csrfToken() ?? '',
    };
  }

  private authJsonHeaders() {
    return {
      'content-type': 'application/json',
      'x-csrf-token': this.authState.csrfToken() ?? '',
    };
  }

  private async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      credentials: 'include',
      ...init,
    });

    const body = (await response.json().catch(() => ({}))) as ApiErrorResponse & T;
    if (!response.ok) {
      const message = Array.isArray(body.message)
        ? body.message.join(', ')
        : (body.error?.message ?? body.message ?? 'Request failed.');
      throw new Error(message);
    }

    return body as T;
  }
}
