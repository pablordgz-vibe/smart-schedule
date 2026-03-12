import { Injectable, inject } from '@angular/core';
import { AuthStateService } from './auth-state.service';

type ApiErrorResponse = {
  error?: { message?: string };
  message?: string | string[];
};

export type TimePolicyCategory =
  | 'working_hours'
  | 'availability'
  | 'unavailability'
  | 'holiday'
  | 'blackout'
  | 'rest'
  | 'max_hours';

export type TimePolicyScopeLevel = 'organization' | 'group' | 'user';

export type TimePolicySummary = {
  id: string;
  isActive: boolean;
  policyType: TimePolicyCategory;
  rule: Record<string, unknown>;
  scopeLevel: TimePolicyScopeLevel;
  sourceType: 'custom' | 'official';
  targetGroupId: string | null;
  targetUserId: string | null;
  title: string;
  updatedAt: string;
};

export type AdvisoryConcern = {
  category: string;
  code: string;
  details: Record<string, unknown>;
  level: 'warning';
  message: string;
};

export type AdvisoryResult = {
  actions: Array<'proceed' | 'alternative_slots' | 'ask_ai' | 'cancel'>;
  canProceed: true;
  concerns: AdvisoryConcern[];
  alternativeSlots: Array<{ startAt: string; endAt: string; reason: string }>;
};

@Injectable({ providedIn: 'root' })
export class TimeApiService {
  private readonly authState = inject(AuthStateService);

  async listPolicies(input?: {
    policyType?: TimePolicyCategory;
    scopeLevel?: TimePolicyScopeLevel;
    targetGroupId?: string;
    targetUserId?: string;
  }) {
    const params = new URLSearchParams();
    if (input?.policyType) {
      params.set('policyType', input.policyType);
    }
    if (input?.scopeLevel) {
      params.set('scopeLevel', input.scopeLevel);
    }
    if (input?.targetGroupId) {
      params.set('targetGroupId', input.targetGroupId);
    }
    if (input?.targetUserId) {
      params.set('targetUserId', input.targetUserId);
    }

    const response = await this.fetchJson<{ policies: TimePolicySummary[] }>(
      `/api/time/policies${params.size > 0 ? `?${params.toString()}` : ''}`,
      { headers: this.authHeaders() },
    );

    return response.policies;
  }

  async createPolicy(payload: Record<string, unknown>) {
    const response = await this.fetchJson<{ policy: TimePolicySummary }>(`/api/time/policies`, {
      body: JSON.stringify(payload),
      headers: this.authHeaders(),
      method: 'POST',
    });

    return response.policy;
  }

  async updatePolicy(policyId: string, payload: Record<string, unknown>) {
    const response = await this.fetchJson<{ policy: TimePolicySummary }>(
      `/api/time/policies/${policyId}`,
      {
        body: JSON.stringify(payload),
        headers: this.authHeaders(),
        method: 'PATCH',
      },
    );

    return response.policy;
  }

  async deletePolicy(policyId: string) {
    return this.fetchJson<{ ok: true }>(`/api/time/policies/${policyId}`, {
      headers: this.authHeaders(),
      method: 'DELETE',
    });
  }

  async previewEffectivePolicies(targetUserId?: string) {
    const params = new URLSearchParams();
    if (targetUserId) {
      params.set('targetUserId', targetUserId);
    }

    const response = await this.fetchJson<{
      preview: {
        categories: Record<
          string,
          {
            resolvedFromScope: TimePolicyScopeLevel | null;
            rules: Array<{ id: string; rule: Record<string, unknown> }>;
          }
        >;
      };
    }>(`/api/time/policies/preview${params.size > 0 ? `?${params.toString()}` : ''}`, {
      headers: this.authHeaders(),
    });

    return response.preview;
  }

  async evaluateAdvisory(payload: Record<string, unknown>) {
    const response = await this.fetchJson<{ advisory: AdvisoryResult }>(
      `/api/time/advisory/evaluate`,
      {
        body: JSON.stringify(payload),
        headers: this.authHeaders(),
        method: 'POST',
      },
    );

    return response.advisory;
  }

  async importOfficialHolidays(payload: {
    locationCode: string;
    providerCode: string;
    scopeLevel: TimePolicyScopeLevel;
    targetGroupId?: string;
    targetUserId?: string;
    year: number;
  }) {
    const response = await this.fetchJson<{
      importResult: {
        imported: number;
      };
    }>(`/api/time/holidays/import`, {
      body: JSON.stringify(payload),
      headers: this.authHeaders(),
      method: 'POST',
    });

    return response.importResult;
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
