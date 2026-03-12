import { Injectable, inject } from '@angular/core';
import { AuthStateService } from './auth-state.service';

type ApiErrorResponse = {
  error?: { message?: string };
  message?: string | string[];
};

export type CalendarSummary = {
  id: string;
  name: string;
  ownerUserId: string | null;
  type: 'organization' | 'personal';
};

export type ImportedContact = {
  id: string;
  providerCode: string;
  providerContactId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
};

export type AttachmentSummary = {
  fileName: string;
  fileSizeBytes: number;
  id: string;
  mimeType: string;
  state: string;
  storageKey: string;
};

@Injectable({ providedIn: 'root' })
export class CalApiService {
  private readonly authState = inject(AuthStateService);

  async listCalendars() {
    const response = await this.fetchJson<{ calendars: CalendarSummary[] }>('/api/cal/calendars', {
      headers: this.authHeaders(),
    });
    return response.calendars;
  }

  async createPersonalCalendar(name: string) {
    const response = await this.fetchJson<{ calendar: CalendarSummary }>('/api/cal/calendars', {
      body: JSON.stringify({ name }),
      headers: this.authHeaders(),
      method: 'POST',
    });

    return response.calendar;
  }

  async listCalendarView(input: { from: string; to: string; calendarIds?: string[] }) {
    const params = new URLSearchParams({ from: input.from, to: input.to });
    for (const calendarId of input.calendarIds ?? []) {
      params.append('calendarIds', calendarId);
    }

    const response = await this.fetchJson<{
      view: { entries: unknown[]; selectedCalendarIds: string[] };
    }>(`/api/cal/calendar-view?${params.toString()}`, { headers: this.authHeaders() });

    return response.view;
  }

  async listImportedContacts(query = '') {
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set('query', query.trim());
    }

    const response = await this.fetchJson<{ contacts: ImportedContact[] }>(
      `/api/cal/contacts/imported${params.size > 0 ? `?${params.toString()}` : ''}`,
      {
        headers: this.authHeaders(),
      },
    );

    return response.contacts;
  }

  async createImportedContact(input: {
    displayName: string;
    providerCode: string;
    providerContactId: string;
    email?: string;
    phone?: string;
  }) {
    const response = await this.fetchJson<{ contact: ImportedContact }>(
      `/api/cal/contacts/imported`,
      {
        body: JSON.stringify(input),
        headers: this.authHeaders(),
        method: 'POST',
      },
    );

    return response.contact;
  }

  async listTasks(input: {
    deadlinePeriod?: 'all' | 'none' | 'overdue' | 'next_7_days' | 'next_30_days';
    name?: string;
    priority?: 'all' | 'high' | 'low' | 'medium' | 'urgent';
    status?: 'all' | 'blocked' | 'completed' | 'in_progress' | 'todo';
  }) {
    const params = new URLSearchParams();
    if (input.name?.trim()) {
      params.set('name', input.name.trim());
    }
    if (input.deadlinePeriod) {
      params.set('deadlinePeriod', input.deadlinePeriod);
    }
    if (input.priority) {
      params.set('priority', input.priority);
    }
    if (input.status) {
      params.set('status', input.status);
    }

    const response = await this.fetchJson<{ tasks: unknown[] }>(
      `/api/cal/tasks${params.size > 0 ? `?${params.toString()}` : ''}`,
      { headers: this.authHeaders() },
    );

    return response.tasks;
  }

  async getTask(taskId: string) {
    const response = await this.fetchJson<{ task: unknown }>(`/api/cal/tasks/${taskId}`, {
      headers: this.authHeaders(),
    });

    return response.task;
  }

  async createTask(payload: Record<string, unknown>) {
    const response = await this.fetchJson<{ task: unknown }>(`/api/cal/tasks`, {
      body: JSON.stringify(payload),
      headers: this.authHeaders(),
      method: 'POST',
    });

    return response.task;
  }

  async updateTask(taskId: string, patch: Record<string, unknown>) {
    const response = await this.fetchJson<{ task: unknown }>(`/api/cal/tasks/${taskId}`, {
      body: JSON.stringify(patch),
      headers: this.authHeaders(),
      method: 'PATCH',
    });

    return response.task;
  }

  async deleteTask(taskId: string) {
    return this.fetchJson<{ result: { ok: true } }>(`/api/cal/tasks/${taskId}`, {
      headers: this.authHeaders(),
      method: 'DELETE',
    });
  }

  async createEvent(payload: Record<string, unknown>) {
    const response = await this.fetchJson<{ event: unknown }>(`/api/cal/events`, {
      body: JSON.stringify(payload),
      headers: this.authHeaders(),
      method: 'POST',
    });

    return response.event;
  }

  async getEvent(eventId: string) {
    const response = await this.fetchJson<{ event: unknown }>(`/api/cal/events/${eventId}`, {
      headers: this.authHeaders(),
    });

    return response.event;
  }

  async updateEvent(eventId: string, patch: Record<string, unknown>) {
    const response = await this.fetchJson<{ event: unknown }>(`/api/cal/events/${eventId}`, {
      body: JSON.stringify(patch),
      headers: this.authHeaders(),
      method: 'PATCH',
    });

    return response.event;
  }

  async deleteEvent(eventId: string) {
    return this.fetchJson<{ result: { ok: true } }>(`/api/cal/events/${eventId}`, {
      headers: this.authHeaders(),
      method: 'DELETE',
    });
  }

  async addEventAttachment(eventId: string, payload: Record<string, unknown>) {
    const response = await this.fetchJson<{ attachment: AttachmentSummary }>(
      `/api/cal/events/${eventId}/attachments`,
      {
        body: JSON.stringify(payload),
        headers: this.authHeaders(),
        method: 'POST',
      },
    );

    return response.attachment;
  }

  async addTaskAttachment(taskId: string, payload: Record<string, unknown>) {
    const response = await this.fetchJson<{ attachment: AttachmentSummary }>(
      `/api/cal/tasks/${taskId}/attachments`,
      {
        body: JSON.stringify(payload),
        headers: this.authHeaders(),
        method: 'POST',
      },
    );

    return response.attachment;
  }

  async copyToPersonal(input: {
    calendarIds: string[];
    itemId: string;
    itemType: 'event' | 'task';
  }) {
    const response = await this.fetchJson<{ item: unknown }>(
      `/api/cal/items/${input.itemType}/${input.itemId}/copy-to-personal`,
      {
        body: JSON.stringify({ calendarIds: input.calendarIds }),
        headers: this.authHeaders(),
        method: 'POST',
      },
    );

    return response.item;
  }

  private authHeaders() {
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
