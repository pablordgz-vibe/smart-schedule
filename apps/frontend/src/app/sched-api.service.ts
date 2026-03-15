import { Injectable, inject } from '@angular/core';
import { AuthStateService } from './auth-state.service';

type ApiErrorResponse = {
  dates?: string[];
  error?: { message?: string };
  message?: string | string[];
  validation?: Array<{ field: string; level: 'error' | 'warning'; message: string }>;
};

export class SchedApiError extends Error {
  constructor(
    message: string,
    readonly details: ApiErrorResponse,
  ) {
    super(message);
  }
}

export type ScheduleValidationMessage = {
  field: string;
  level: 'error' | 'warning';
  message: string;
};

export type ScheduleDraftItem = {
  dayOffset: number;
  description?: string | null;
  dueTime?: string | null;
  durationMinutes?: number | null;
  groupKey?: string | null;
  id?: string;
  itemType: 'event' | 'task';
  location?: string | null;
  notes?: string | null;
  repetitionMode: 'grouped' | 'individual';
  startTime?: string | null;
  title: string;
  workRelated: boolean;
};

export type ScheduleDraftVersion = {
  effectiveFromDate: string;
  id?: string;
  items: ScheduleDraftItem[];
  recurrence: {
    count?: number | null;
    dayOfMonth?: number | null;
    frequency: 'daily' | 'monthly' | 'weekly';
    interval: number;
    pauses: Array<{ endDate: string; startDate: string }>;
    weekdays: number[];
  };
  timezone: string;
  timezoneMode: 'utc_constant' | 'wall_clock';
};

export type ScheduleDraftDefinition = {
  boundaryEndDate?: string | null;
  boundaryStartDate?: string | null;
  description?: string | null;
  name: string;
  state: 'active' | 'archived' | 'template';
  versions: ScheduleDraftVersion[];
};

export type ScheduleOccurrencePreview = {
  date: string;
  items: Array<{ itemType: 'event' | 'task'; title: string }>;
  occurrenceDate: string;
  versionId: string | null;
};

export type ScheduleSummary = {
  assignmentCount: number;
  boundaryEndDate: string | null;
  boundaryStartDate: string | null;
  description: string | null;
  exceptionCount: number;
  id: string;
  itemSummary: { eventCount: number; taskCount: number; total: number };
  name: string;
  nextOccurrences: ScheduleOccurrencePreview[];
  recurrenceSummary: string;
  state: 'active' | 'archived' | 'template';
  timezone: string;
  timezoneMode: 'utc_constant' | 'wall_clock';
  timezoneModeLabel: string;
  validation: ScheduleValidationMessage[];
  versionCount: number;
};

export type ScheduleDetail = {
  schedule: ScheduleDraftDefinition & {
    boundaryEndDate: string | null;
    boundaryStartDate: string | null;
    description: string | null;
    id: string;
  };
  summary: {
    itemSummary: { eventCount: number; taskCount: number; total: number };
    recurrenceSummary: string;
    timezoneModeLabel: string;
  };
  upcomingOccurrences: ScheduleOccurrencePreview[];
  validation: ScheduleValidationMessage[];
};

export type ScheduleOccurrenceProjection = {
  detached: boolean;
  dueAt: string | null;
  endsAt: string | null;
  itemDefinitionId: string;
  itemType: 'event' | 'task';
  localDate: string;
  occurrenceDate: string;
  scheduleId: string;
  scheduleVersionId: string;
  startsAt: string | null;
  timezone: string;
  timezoneMode: 'utc_constant' | 'wall_clock';
  title: string;
};

@Injectable({ providedIn: 'root' })
export class SchedApiService {
  private readonly authState = inject(AuthStateService);

  async listSchedules(input: { query?: string; state?: 'active' | 'archived' | 'template' }) {
    const params = new URLSearchParams();
    if (input.state) {
      params.set('state', input.state);
    }
    if (input.query?.trim()) {
      params.set('query', input.query.trim());
    }

    const response = await this.fetchJson<{ schedules: ScheduleSummary[] }>(
      `/api/sched${params.size > 0 ? `?${params.toString()}` : ''}`,
      {
        headers: this.authHeaders(),
      },
    );

    return response.schedules;
  }

  async getSchedule(scheduleId: string) {
    return this.fetchJson<ScheduleDetail>(`/api/sched/${scheduleId}`, {
      headers: this.authHeaders(),
    });
  }

  async preview(definition: ScheduleDraftDefinition) {
    return this.fetchJson<{
      recurrenceSummary: string;
      timezoneModeLabel: string;
      upcomingOccurrences: ScheduleOccurrencePreview[];
      validation: ScheduleValidationMessage[];
    }>('/api/sched/preview', {
      body: JSON.stringify(definition),
      headers: this.authJsonHeaders(),
      method: 'POST',
    });
  }

  async create(definition: ScheduleDraftDefinition) {
    return this.fetchJson<ScheduleDetail>('/api/sched', {
      body: JSON.stringify(definition),
      headers: this.authJsonHeaders(),
      method: 'POST',
    });
  }

  async update(
    scheduleId: string,
    input: {
      changeControl?: {
        anchorDate?: string;
        includePast?: boolean;
        overwriteExceptions?: boolean;
        scope?: 'all' | 'selected_and_future';
      };
      definition: ScheduleDraftDefinition;
    },
  ) {
    return this.fetchJson<ScheduleDetail>(`/api/sched/${scheduleId}`, {
      body: JSON.stringify(input),
      headers: this.authJsonHeaders(),
      method: 'PATCH',
    });
  }

  async listOccurrences(scheduleId: string, input: { from: string; to: string }) {
    const params = new URLSearchParams({
      from: input.from,
      to: input.to,
    });
    const response = await this.fetchJson<{ occurrences: ScheduleOccurrenceProjection[] }>(
      `/api/sched/${scheduleId}/occurrences?${params.toString()}`,
      { headers: this.authHeaders() },
    );
    return response.occurrences;
  }

  async mutateOccurrence(
    scheduleId: string,
    occurrenceDate: string,
    payload: {
      action: 'cancel' | 'move' | 'replace';
      detached?: boolean;
      includePast?: boolean;
      movedToDate?: string | null;
      overrideItem?: ScheduleDraftItem | null;
      overwriteExceptions?: boolean;
      scope: 'all' | 'selected' | 'selected_and_future';
      targetItemId?: string | null;
    },
  ) {
    const response = await this.fetchJson<{ occurrences: ScheduleOccurrenceProjection[] }>(
      `/api/sched/${scheduleId}/occurrences/${occurrenceDate}/mutate`,
      {
        body: JSON.stringify(payload),
        headers: this.authJsonHeaders(),
        method: 'POST',
      },
    );
    return response.occurrences;
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
      throw new SchedApiError(message, body);
    }

    return body as T;
  }
}
