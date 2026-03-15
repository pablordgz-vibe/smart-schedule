import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  evaluateAdvisory,
  resolveEffectivePolicies,
  type AdvisoryActivity,
  type AdvisoryCandidate,
  type RouteAdvisoryContract,
  type TimePolicyCategory,
  type TimePolicyRecord,
  type TimePolicyScopeLevel,
  type WeatherAdvisoryContract,
} from '@smart-schedule/domain-time';
import { randomUUID } from 'node:crypto';
import type { RequestContext } from '@smart-schedule/contracts';
import { DatabaseService } from '../persistence/database.service';
import { HolidayProviderService } from './holiday-provider.service';

type ScopeInput = {
  organizationId: string | null;
  personalOwnerUserId: string | null;
};

type CreatePolicyInput = {
  context: RequestContext;
  actorId: string;
  policyType: TimePolicyCategory;
  scopeLevel: TimePolicyScopeLevel;
  sourceType: 'custom' | 'official';
  title: string;
  isActive: boolean;
  targetGroupId: string | null;
  targetUserId: string | null;
  rule: TimePolicyRecord['rule'];
};

type UpdatePolicyInput = {
  context: RequestContext;
  actorId: string;
  policyId: string;
  patch: {
    isActive?: boolean;
    rule?: TimePolicyRecord['rule'];
    title?: string;
  };
};

type AdvisoryInput = {
  context: RequestContext;
  actorId: string;
  targetUserId: string | null;
  candidate: AdvisoryCandidate;
  commuteSignal: {
    commuteMinutesAfter: number | null;
    commuteMinutesBefore: number | null;
    source: 'provider' | 'user';
  } | null;
  weatherSignal: {
    preparationNote: string;
    source: 'provider' | 'user';
    summary: string;
  } | null;
};

function nowIso() {
  return new Date().toISOString();
}

function validateTimeToken(value: string | undefined) {
  if (!value) {
    return false;
  }

  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validateDateToken(value: string | undefined) {
  if (!value) {
    return false;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function safeIso(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('Invalid datetime value.');
  }

  return parsed.toISOString();
}

function startOfUtcWeek(value: string) {
  const parsed = new Date(value);
  parsed.setUTCDate(parsed.getUTCDate() - parsed.getUTCDay());
  parsed.setUTCHours(0, 0, 0, 0);
  return parsed;
}

function endOfUtcWeek(value: string) {
  const parsed = startOfUtcWeek(value);
  parsed.setUTCDate(parsed.getUTCDate() + 7);
  return parsed;
}

function shiftIso(value: string, minutes: number) {
  return new Date(new Date(value).getTime() + minutes * 60_000).toISOString();
}

function normalizeLocationToken(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function toIsoString(value: Date | string) {
  return new Date(value).toISOString();
}

function safeRuleData(value: unknown): TimePolicyRecord['rule'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as TimePolicyRecord['rule'];
}

function safeUpdatedAt(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    return value;
  }

  if (value == null) {
    return '';
  }

  return String(value);
}

class InMemoryRouteAdvisoryProvider implements RouteAdvisoryContract {
  estimateCommute(input: {
    arrivalLocation: string;
    departureAt: string;
    departureLocation: string;
  }) {
    const departure = normalizeLocationToken(input.departureLocation);
    const arrival = normalizeLocationToken(input.arrivalLocation);
    if (!departure || !arrival || departure === arrival) {
      return Promise.resolve({ minutes: null });
    }

    const departureTime = new Date(input.departureAt);
    const departureHour = Number.isNaN(departureTime.getTime())
      ? null
      : departureTime.getUTCHours();
    const variability =
      Math.abs(departure.length - arrival.length) +
      Math.abs(departure.charCodeAt(0) - arrival.charCodeAt(0));

    const timeOfDayAdjustment =
      departureHour == null
        ? 0
        : departureHour >= 7 && departureHour < 10
          ? 8
          : departureHour >= 16 && departureHour < 19
            ? 6
            : departureHour >= 22 || departureHour < 6
              ? -3
              : 1;

    return Promise.resolve({
      minutes: Math.max(5, 12 + (variability % 8) + timeOfDayAdjustment),
    });
  }
}

class InMemoryWeatherAdvisoryProvider implements WeatherAdvisoryContract {
  getPreparationSignal(input: { at: string; location: string }) {
    void input.at;

    const normalizedLocation = normalizeLocationToken(input.location);
    if (
      !/(campus|depot|dock|field|outdoor|park|plant|site|terminal|warehouse|yard)/.test(
        normalizedLocation,
      )
    ) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      preparationNote: `Weather-aware preparation is recommended for ${input.location}.`,
      summary: `Weather watch for ${input.location}`,
    });
  }
}

@Injectable()
export class TimeService {
  private readonly routeProvider: RouteAdvisoryContract =
    new InMemoryRouteAdvisoryProvider();
  private readonly weatherProvider: WeatherAdvisoryContract =
    new InMemoryWeatherAdvisoryProvider();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly holidayProvider: HolidayProviderService,
  ) {}

  async listPolicies(input: {
    context: RequestContext;
    actorId: string;
    includeInactive?: boolean;
    policyType?: TimePolicyCategory;
    scopeLevel?: TimePolicyScopeLevel;
    targetGroupId?: string;
    targetUserId?: string;
  }) {
    await this.assertCanReadPolicies(input.context, input.actorId);
    this.assertValidScopeSelection({
      actorId: input.actorId,
      context: input.context,
      scopeLevel: input.scopeLevel ?? null,
      targetGroupId: input.targetGroupId ?? null,
      targetUserId: input.targetUserId ?? null,
    });

    const scope = this.scopeFromContext(input.context, input.actorId);
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (scope.organizationId) {
      params.push(scope.organizationId);
      clauses.push(
        `context_type = 'organization' and organization_id = $${params.length}`,
      );
    } else {
      params.push(scope.personalOwnerUserId);
      clauses.push(
        `context_type = 'personal' and personal_owner_user_id = $${params.length}`,
      );
    }

    if (input.policyType) {
      params.push(input.policyType);
      clauses.push(`policy_type = $${params.length}`);
    }

    if (input.scopeLevel) {
      params.push(input.scopeLevel);
      clauses.push(`scope_level = $${params.length}`);
    }

    if (input.targetGroupId) {
      params.push(input.targetGroupId);
      clauses.push(`target_group_id = $${params.length}`);
    }

    if (input.targetUserId) {
      params.push(input.targetUserId);
      clauses.push(`target_user_id = $${params.length}`);
    }

    if (!input.includeInactive) {
      clauses.push('is_active = true');
    }

    const result = await this.databaseService.query<{
      id: string;
      policy_type: TimePolicyCategory;
      scope_level: TimePolicyScopeLevel;
      source_type: 'custom' | 'official';
      title: string;
      rule_data: Record<string, unknown>;
      target_group_id: string | null;
      target_user_id: string | null;
      updated_at: string;
      is_active: boolean;
    }>(
      `select
         id,
         policy_type,
         scope_level,
         source_type,
         title,
         rule_data,
         target_group_id,
         target_user_id,
         updated_at,
         is_active
       from time_policies
       where ${clauses.join(' and ')}
       order by policy_type asc, updated_at desc`,
      params,
    );

    return result.rows.map((row) => ({
      id: row.id,
      isActive: row.is_active,
      policyType: row.policy_type,
      rule: safeRuleData(row.rule_data),
      scopeLevel: row.scope_level,
      sourceType: row.source_type,
      targetGroupId: row.target_group_id,
      targetUserId: row.target_user_id,
      title: row.title,
      updatedAt: safeUpdatedAt(row.updated_at),
    }));
  }

  async createPolicy(input: CreatePolicyInput) {
    await this.assertCanManagePolicies(input.context, input.actorId);

    const scope = this.scopeFromContext(input.context, input.actorId);
    const resolvedTargets = await this.resolveTargets({
      actorId: input.actorId,
      context: input.context,
      scopeLevel: input.scopeLevel,
      targetGroupId: input.targetGroupId,
      targetUserId: input.targetUserId,
    });
    const rule = this.normalizeAndValidateRule(input.policyType, input.rule);

    const timestamp = nowIso();
    const policyId = randomUUID();

    await this.databaseService.query(
      `insert into time_policies (
         id,
         context_type,
         organization_id,
         personal_owner_user_id,
         scope_level,
         target_group_id,
         target_user_id,
         policy_type,
         source_type,
         title,
         rule_data,
         is_active,
         created_by_user_id,
         created_at,
         updated_at
       )
       values (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7,
         $8,
         $9,
         $10,
         $11::jsonb,
         $12,
         $13,
         $14,
         $15
       )`,
      [
        policyId,
        scope.organizationId ? 'organization' : 'personal',
        scope.organizationId,
        scope.personalOwnerUserId,
        input.scopeLevel,
        resolvedTargets.targetGroupId,
        resolvedTargets.targetUserId,
        input.policyType,
        input.sourceType,
        input.title.trim(),
        JSON.stringify(rule),
        input.isActive,
        input.actorId,
        timestamp,
        timestamp,
      ],
    );

    return {
      id: policyId,
      isActive: input.isActive,
      policyType: input.policyType,
      rule,
      scopeLevel: input.scopeLevel,
      sourceType: input.sourceType,
      targetGroupId: resolvedTargets.targetGroupId,
      targetUserId: resolvedTargets.targetUserId,
      title: input.title.trim(),
      updatedAt: timestamp,
    };
  }

  async updatePolicy(input: UpdatePolicyInput) {
    const existing = await this.getPolicyForContext({
      context: input.context,
      policyId: input.policyId,
    });
    await this.assertCanManagePolicies(input.context, input.actorId);

    const nextTitle = input.patch.title?.trim() ?? existing.title;
    const nextRule = input.patch.rule
      ? this.normalizeAndValidateRule(existing.policy_type, input.patch.rule)
      : (existing.rule_data as TimePolicyRecord['rule']);
    const nextIsActive = input.patch.isActive ?? existing.is_active;
    const timestamp = nowIso();

    await this.databaseService.query(
      `update time_policies
       set title = $2,
           rule_data = $3::jsonb,
           is_active = $4,
           updated_at = $5
       where id = $1`,
      [
        input.policyId,
        nextTitle,
        JSON.stringify(nextRule),
        nextIsActive,
        timestamp,
      ],
    );

    return {
      id: existing.id,
      isActive: nextIsActive,
      policyType: existing.policy_type,
      rule: nextRule,
      scopeLevel: existing.scope_level,
      sourceType: existing.source_type,
      targetGroupId: existing.target_group_id,
      targetUserId: existing.target_user_id,
      title: nextTitle,
      updatedAt: timestamp,
    };
  }

  async deletePolicy(input: {
    context: RequestContext;
    actorId: string;
    policyId: string;
  }) {
    await this.getPolicyForContext({
      context: input.context,
      policyId: input.policyId,
    });
    await this.assertCanManagePolicies(input.context, input.actorId);

    await this.databaseService.query(
      `delete from time_policies where id = $1`,
      [input.policyId],
    );

    return { ok: true };
  }

  async previewEffectivePolicies(input: {
    context: RequestContext;
    actorId: string;
    targetUserId: string | null;
  }) {
    const target = await this.resolveTargetUser({
      actorId: input.actorId,
      context: input.context,
      targetUserId: input.targetUserId,
      requireOrgAdminForDelegation: false,
    });

    const policies = await this.loadActivePolicyRecords({
      context: input.context,
      actorId: input.actorId,
    });
    const groupIds = await this.listGroupIdsForUser({
      organizationId: this.organizationId(input.context),
      userId: target,
    });

    return resolveEffectivePolicies({
      records: policies,
      targetGroupIds: groupIds,
      targetUserId: target,
    });
  }

  async evaluateAdvisory(input: AdvisoryInput) {
    const targetUserId = await this.resolveTargetUser({
      actorId: input.actorId,
      context: input.context,
      targetUserId: input.targetUserId,
      requireOrgAdminForDelegation: true,
    });

    const [policyRecords, activities] = await Promise.all([
      this.loadActivePolicyRecords({
        context: input.context,
        actorId: input.actorId,
      }),
      this.loadActivitiesForTarget({
        context: input.context,
        endAt: input.candidate.endAt,
        startAt: input.candidate.startAt,
        targetUserId,
      }),
    ]);

    const groupIds = await this.listGroupIdsForUser({
      organizationId: this.organizationId(input.context),
      userId: targetUserId,
    });

    const effectivePolicies = resolveEffectivePolicies({
      records: policyRecords,
      targetGroupIds: groupIds,
      targetUserId,
    });

    const providerSignals = await this.buildProviderSignals({
      activities,
      candidate: input.candidate,
    });

    const advisory = evaluateAdvisory({
      activities,
      candidate: input.candidate,
      commuteSignal: input.commuteSignal ?? providerSignals.commuteSignal,
      effectivePolicies,
      weatherSignal: input.weatherSignal ?? providerSignals.weatherSignal,
    });

    const scope = this.scopeFromContext(input.context, input.actorId);
    await this.databaseService.query(
      `insert into time_advisory_results (
         id,
         context_type,
         organization_id,
         personal_owner_user_id,
         target_user_id,
         candidate_start_at,
         candidate_end_at,
         concerns,
         alternative_slots,
         created_by_user_id,
         created_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)`,
      [
        randomUUID(),
        scope.organizationId ? 'organization' : 'personal',
        scope.organizationId,
        scope.personalOwnerUserId,
        targetUserId,
        input.candidate.startAt,
        input.candidate.endAt,
        JSON.stringify(advisory.concerns),
        JSON.stringify(advisory.alternativeSlots),
        input.actorId,
        nowIso(),
      ],
    );

    return {
      actions: ['proceed', 'alternative_slots', 'ask_ai', 'cancel'] as const,
      ...advisory,
      effectivePolicies,
    };
  }

  async importOfficialHolidays(input: {
    context: RequestContext;
    actorId: string;
    locationCode: string;
    providerCode: string;
    replaceExisting: boolean;
    year: number;
    scopeLevel: TimePolicyScopeLevel;
    targetGroupId: string | null;
    targetUserId: string | null;
  }) {
    await this.assertCanManagePolicies(input.context, input.actorId);

    const target = await this.resolveTargets({
      actorId: input.actorId,
      context: input.context,
      scopeLevel: input.scopeLevel,
      targetGroupId: input.targetGroupId,
      targetUserId: input.targetUserId,
    });

    const scope = this.scopeFromContext(input.context, input.actorId);
    const holidays = await this.holidayProvider.loadOfficialHolidays({
      locationCode: input.locationCode,
      providerCode: input.providerCode,
      year: input.year,
    });

    const importedAt = nowIso();
    const [yearStart, yearEnd] = [`${input.year}-01-01`, `${input.year}-12-31`];
    const uniqueHolidays = Array.from(
      new Map(
        holidays.map((holiday) => [
          `${holiday.date}:${holiday.name.toLowerCase()}`,
          holiday,
        ]),
      ).values(),
    );

    const replaced = await this.databaseService.transaction(async (client) => {
      let replacedCount = 0;
      if (input.replaceExisting) {
        const deleteResult = await client.query(
          `delete from time_policies
           where policy_type = 'holiday'
             and source_type = 'official'
             and scope_level = $1
             and coalesce(organization_id, '') = coalesce($2, '')
             and coalesce(personal_owner_user_id, '') = coalesce($3, '')
             and coalesce(target_group_id, '') = coalesce($4, '')
             and coalesce(target_user_id, '') = coalesce($5, '')
             and rule_data ->> 'providerCode' = $6
             and rule_data ->> 'locationCode' = $7
             and rule_data ->> 'date' >= $8
             and rule_data ->> 'date' <= $9`,
          [
            input.scopeLevel,
            scope.organizationId,
            scope.personalOwnerUserId,
            target.targetGroupId,
            target.targetUserId,
            input.providerCode,
            input.locationCode,
            yearStart,
            yearEnd,
          ],
        );
        replacedCount = deleteResult.rowCount ?? 0;
      }

      for (const holiday of uniqueHolidays) {
        const rule = {
          date: holiday.date,
          holidayName: holiday.name,
          locationCode: input.locationCode,
          providerCode: input.providerCode,
        };

        await client.query(
          `insert into time_policies (
             id,
             context_type,
             organization_id,
             personal_owner_user_id,
             scope_level,
             target_group_id,
             target_user_id,
             policy_type,
             source_type,
             title,
             rule_data,
             is_active,
             created_by_user_id,
             created_at,
             updated_at
           )
           values (
             $1,
             $2,
             $3,
             $4,
             $5,
             $6,
             $7,
             'holiday',
             'official',
             $8,
             $9::jsonb,
             true,
             $10,
             $11,
             $12
           )`,
          [
            randomUUID(),
            scope.organizationId ? 'organization' : 'personal',
            scope.organizationId,
            scope.personalOwnerUserId,
            input.scopeLevel,
            target.targetGroupId,
            target.targetUserId,
            holiday.name,
            JSON.stringify(rule),
            input.actorId,
            importedAt,
            importedAt,
          ],
        );
      }

      return replacedCount;
    });

    return {
      imported: uniqueHolidays.length,
      locationCode: input.locationCode,
      providerCode: input.providerCode,
      replaced,
      scopeLevel: input.scopeLevel,
      targetGroupId: target.targetGroupId,
      targetUserId: target.targetUserId,
      year: input.year,
    };
  }

  async getHolidayLocationCatalog(input: {
    providerCode: string;
    countryCode?: string;
  }) {
    return this.holidayProvider.getLocationCatalog(input);
  }

  private async getPolicyForContext(input: {
    context: RequestContext;
    policyId: string;
  }) {
    const scope = this.scopeFromContext(
      input.context,
      input.context.actor.id ?? null,
    );

    const result = await this.databaseService.query<{
      id: string;
      context_type: 'organization' | 'personal';
      organization_id: string | null;
      personal_owner_user_id: string | null;
      scope_level: TimePolicyScopeLevel;
      target_group_id: string | null;
      target_user_id: string | null;
      policy_type: TimePolicyCategory;
      source_type: 'custom' | 'official';
      title: string;
      rule_data: Record<string, unknown>;
      is_active: boolean;
    }>(
      `select
         id,
         context_type,
         organization_id,
         personal_owner_user_id,
         scope_level,
         target_group_id,
         target_user_id,
         policy_type,
         source_type,
         title,
         rule_data,
         is_active
       from time_policies
       where id = $1`,
      [input.policyId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Time policy not found.');
    }

    if (
      row.context_type === 'organization' &&
      row.organization_id !== scope.organizationId
    ) {
      throw new NotFoundException(
        'Time policy not found in the active organization.',
      );
    }

    if (
      row.context_type === 'personal' &&
      row.personal_owner_user_id !== scope.personalOwnerUserId
    ) {
      throw new NotFoundException(
        'Time policy not found in the active personal scope.',
      );
    }

    return row;
  }

  private async loadActivePolicyRecords(input: {
    context: RequestContext;
    actorId: string;
  }): Promise<TimePolicyRecord[]> {
    await this.assertCanReadPolicies(input.context, input.actorId);

    const scope = this.scopeFromContext(input.context, input.actorId);
    const result = await this.databaseService.query<{
      id: string;
      policy_type: TimePolicyCategory;
      scope_level: TimePolicyScopeLevel;
      target_group_id: string | null;
      target_user_id: string | null;
      updated_at: string;
      rule_data: TimePolicyRecord['rule'];
    }>(
      scope.organizationId
        ? `select
             id,
             policy_type,
             scope_level,
             target_group_id,
             target_user_id,
             updated_at,
             rule_data
           from time_policies
           where context_type = 'organization'
             and organization_id = $1
             and is_active = true`
        : `select
             id,
             policy_type,
             scope_level,
             target_group_id,
             target_user_id,
             updated_at,
             rule_data
           from time_policies
           where context_type = 'personal'
             and personal_owner_user_id = $1
             and is_active = true`,
      [scope.organizationId ?? scope.personalOwnerUserId],
    );

    return result.rows.map((row) => ({
      category: row.policy_type,
      id: row.id,
      rule: safeRuleData(row.rule_data),
      scopeLevel: row.scope_level,
      targetGroupId: row.target_group_id,
      targetUserId: row.target_user_id,
      updatedAt: safeUpdatedAt(row.updated_at),
    }));
  }

  private async loadActivitiesForTarget(input: {
    context: RequestContext;
    startAt: string;
    endAt: string;
    targetUserId: string;
  }): Promise<AdvisoryActivity[]> {
    const startAt = safeIso(input.startAt);
    const endAt = safeIso(input.endAt);
    const scope = this.scopeFromContext(input.context, input.targetUserId);
    const queryStart = new Date(
      Math.min(
        startOfUtcWeek(startAt).getTime(),
        new Date(shiftIso(startAt, -24 * 60)).getTime(),
      ),
    ).toISOString();
    const queryEnd = new Date(
      Math.max(
        endOfUtcWeek(endAt).getTime(),
        new Date(shiftIso(endAt, 24 * 60)).getTime(),
      ),
    ).toISOString();

    const visibleCalendarIds = scope.organizationId
      ? await this.listVisibleOrganizationCalendarIdsForTarget({
          organizationId: scope.organizationId,
          targetUserId: input.targetUserId,
        })
      : [];

    const eventRows = await this.databaseService.query<{
      end_at: string;
      id: string;
      location: string | null;
      start_at: string;
      title: string;
      work_related: boolean;
    }>(
      scope.organizationId
        ? `select
             e.id,
             e.title,
             e.start_at,
             e.end_at,
             e.location,
             e.work_related
           from calendar_events e
           where e.context_type = 'organization'
             and e.organization_id = $1
             and e.lifecycle_state = 'active'
             and e.all_day = false
             and e.start_at < $3
             and e.end_at > $2
             and exists (
               select 1
               from calendar_item_calendar_memberships m
               where m.item_type = 'event'
                 and m.item_id = e.id
                 and m.calendar_id = any($4::text[])
             )`
        : `select id, title, start_at, end_at, location, work_related
           from calendar_events
           where context_type = 'personal'
             and personal_owner_user_id = $1
             and lifecycle_state = 'active'
             and all_day = false
             and start_at < $3
             and end_at > $2`,
      scope.organizationId
        ? [scope.organizationId, queryStart, queryEnd, visibleCalendarIds]
        : [scope.personalOwnerUserId, queryStart, queryEnd],
    );

    const taskRows = await this.databaseService.query<{
      due_at: string;
      id: string;
      location: string | null;
      title: string;
      work_related: boolean;
    }>(
      scope.organizationId
        ? `select
             t.id,
             t.title,
             t.due_at,
             t.location,
             t.work_related
           from calendar_tasks t
           where t.context_type = 'organization'
             and t.organization_id = $1
             and t.lifecycle_state = 'active'
             and t.due_at is not null
             and t.due_at >= $2
             and t.due_at <= $3
             and exists (
               select 1
               from calendar_item_calendar_memberships m
               where m.item_type = 'task'
                 and m.item_id = t.id
                 and m.calendar_id = any($4::text[])
             )`
        : `select id, title, due_at, location, work_related
           from calendar_tasks
           where context_type = 'personal'
             and personal_owner_user_id = $1
             and lifecycle_state = 'active'
             and due_at is not null
             and due_at >= $2
             and due_at <= $3`,
      scope.organizationId
        ? [scope.organizationId, queryStart, queryEnd, visibleCalendarIds]
        : [scope.personalOwnerUserId, queryStart, queryEnd],
    );

    return [
      ...eventRows.rows.map((row) => ({
        endAt: toIsoString(row.end_at),
        id: row.id,
        location: row.location,
        source: 'event' as const,
        startAt: toIsoString(row.start_at),
        title: row.title,
        workRelated: row.work_related,
      })),
      ...taskRows.rows.map((row) => {
        const dueAt = new Date(row.due_at);
        const end = new Date(dueAt.getTime() + 30 * 60_000);
        return {
          endAt: end.toISOString(),
          id: row.id,
          location: row.location,
          source: 'task_due' as const,
          startAt: dueAt.toISOString(),
          title: row.title,
          workRelated: row.work_related,
        };
      }),
    ];
  }

  private async buildProviderSignals(input: {
    activities: AdvisoryActivity[];
    candidate: AdvisoryCandidate;
  }) {
    const [commuteSignal, weatherSignal] = await Promise.all([
      this.deriveProviderCommuteSignal(input),
      this.deriveProviderWeatherSignal(input.candidate),
    ]);

    return { commuteSignal, weatherSignal };
  }

  private async deriveProviderCommuteSignal(input: {
    activities: AdvisoryActivity[];
    candidate: AdvisoryCandidate;
  }) {
    if (!input.candidate.location) {
      return null;
    }

    const adjacentActivities = [...input.activities].sort((left, right) =>
      left.startAt.localeCompare(right.startAt),
    );
    const previous =
      adjacentActivities
        .filter((activity) => activity.endAt <= input.candidate.startAt)
        .at(-1) ?? null;
    const next =
      adjacentActivities.find(
        (activity) => activity.startAt >= input.candidate.endAt,
      ) ?? null;

    const [beforeEstimate, afterEstimate] = await Promise.all([
      previous?.location
        ? this.routeProvider.estimateCommute({
            arrivalLocation: input.candidate.location,
            departureAt: previous.endAt,
            departureLocation: previous.location,
          })
        : Promise.resolve({ minutes: null }),
      next?.location
        ? this.routeProvider.estimateCommute({
            arrivalLocation: next.location,
            departureAt: input.candidate.endAt,
            departureLocation: input.candidate.location,
          })
        : Promise.resolve({ minutes: null }),
    ]);

    if (beforeEstimate.minutes == null && afterEstimate.minutes == null) {
      return null;
    }

    return {
      commuteMinutesAfter: afterEstimate.minutes,
      commuteMinutesBefore: beforeEstimate.minutes,
      source: 'provider' as const,
    };
  }

  private async deriveProviderWeatherSignal(candidate: AdvisoryCandidate) {
    if (!candidate.location) {
      return null;
    }

    const signal = await this.weatherProvider.getPreparationSignal({
      at: candidate.startAt,
      location: candidate.location,
    });

    if (!signal) {
      return null;
    }

    return {
      preparationNote: signal.preparationNote,
      source: 'provider' as const,
      summary: signal.summary,
    };
  }

  private async listGroupIdsForUser(input: {
    organizationId: string | null;
    userId: string;
  }) {
    if (!input.organizationId) {
      return [];
    }

    const result = await this.databaseService.query<{ group_id: string }>(
      `select gm.group_id
       from organization_group_members gm
       inner join organization_groups g on g.id = gm.group_id
       where g.organization_id = $1
         and gm.user_id = $2`,
      [input.organizationId, input.userId],
    );

    return result.rows.map((row) => row.group_id);
  }

  private async listVisibleOrganizationCalendarIdsForTarget(input: {
    organizationId: string;
    targetUserId: string;
  }) {
    const membership = await this.databaseService.query<{
      can_view_all_calendars: boolean;
      role: 'admin' | 'member';
    }>(
      `select role, can_view_all_calendars
       from organization_memberships
       where organization_id = $1
         and user_id = $2`,
      [input.organizationId, input.targetUserId],
    );

    const targetMembership = membership.rows[0];
    if (!targetMembership) {
      throw new BadRequestException(
        'targetUserId is not an active organization member.',
      );
    }

    const visibleCalendars = await this.databaseService.query<{ id: string }>(
      targetMembership.role === 'admin' ||
        targetMembership.can_view_all_calendars
        ? `select id
           from organization_calendars
           where organization_id = $1`
        : `select distinct c.id
           from organization_calendars c
           left join organization_calendar_visibility_grants g
             on g.calendar_id = c.id
             and g.user_id = $2
           where c.organization_id = $1
             and (
               c.owner_user_id is null
               or c.owner_user_id = $2
               or g.user_id is not null
             )`,
      targetMembership.role === 'admin' ||
        targetMembership.can_view_all_calendars
        ? [input.organizationId]
        : [input.organizationId, input.targetUserId],
    );

    return visibleCalendars.rows.map((row) => row.id);
  }

  private normalizeAndValidateRule(
    policyType: TimePolicyCategory,
    rule: TimePolicyRecord['rule'],
  ): TimePolicyRecord['rule'] {
    const normalized: TimePolicyRecord['rule'] = {
      date: rule.date,
      daysOfWeek: rule.daysOfWeek,
      endAt: rule.endAt ? safeIso(rule.endAt) : undefined,
      endTime: rule.endTime,
      holidayName: rule.holidayName,
      locationCode: rule.locationCode,
      maxDailyMinutes: rule.maxDailyMinutes,
      maxWeeklyMinutes: rule.maxWeeklyMinutes,
      minRestMinutes: rule.minRestMinutes,
      providerCode: rule.providerCode,
      startAt: rule.startAt ? safeIso(rule.startAt) : undefined,
      startTime: rule.startTime,
    };

    if (
      policyType === 'working_hours' ||
      policyType === 'availability' ||
      policyType === 'unavailability'
    ) {
      if (!normalized.daysOfWeek || normalized.daysOfWeek.length === 0) {
        throw new BadRequestException(
          'daysOfWeek is required for working/availability rules.',
        );
      }
      if (
        !validateTimeToken(normalized.startTime) ||
        !validateTimeToken(normalized.endTime)
      ) {
        throw new BadRequestException(
          'startTime and endTime must use HH:MM format.',
        );
      }
      if (normalized.daysOfWeek.some((value) => value < 0 || value > 6)) {
        throw new BadRequestException(
          'daysOfWeek values must be between 0 and 6.',
        );
      }
      return normalized;
    }

    if (policyType === 'holiday') {
      if (!validateDateToken(normalized.date)) {
        throw new BadRequestException(
          'Holiday rules require a date value (YYYY-MM-DD).',
        );
      }
      return normalized;
    }

    if (policyType === 'blackout') {
      if (!normalized.startAt || !normalized.endAt) {
        throw new BadRequestException(
          'Blackout rules require startAt and endAt values.',
        );
      }
      if (new Date(normalized.endAt) <= new Date(normalized.startAt)) {
        throw new BadRequestException(
          'Blackout endAt must be later than startAt.',
        );
      }
      return normalized;
    }

    if (policyType === 'rest') {
      if (!normalized.minRestMinutes || normalized.minRestMinutes <= 0) {
        throw new BadRequestException(
          'Rest rules require a positive minRestMinutes value.',
        );
      }
      return normalized;
    }

    if (policyType === 'max_hours') {
      if (
        (!normalized.maxDailyMinutes || normalized.maxDailyMinutes <= 0) &&
        (!normalized.maxWeeklyMinutes || normalized.maxWeeklyMinutes <= 0)
      ) {
        throw new BadRequestException(
          'Maximum-hour rules require maxDailyMinutes or maxWeeklyMinutes.',
        );
      }
      return normalized;
    }

    throw new BadRequestException('Unsupported policy type.');
  }

  private scopeFromContext(
    context: RequestContext,
    actorId: string | null,
  ): ScopeInput {
    if (context.context.type === 'organization') {
      return {
        organizationId: context.context.id,
        personalOwnerUserId: null,
      };
    }

    if (context.context.type === 'personal') {
      return {
        organizationId: null,
        personalOwnerUserId: actorId,
      };
    }

    throw new ForbiddenException(
      'Time policy operations require personal or organization context.',
    );
  }

  private async assertCanReadPolicies(
    context: RequestContext,
    actorId: string,
  ) {
    if (context.context.type === 'personal') {
      return;
    }

    if (context.context.type !== 'organization' || !context.context.id) {
      throw new ForbiddenException(
        'Organization or personal context is required.',
      );
    }

    const membership = await this.databaseService.query<{
      role: 'admin' | 'member';
    }>(
      `select role
       from organization_memberships
       where organization_id = $1
         and user_id = $2`,
      [context.context.id, actorId],
    );

    if (!membership.rows[0] || membership.rows[0].role !== 'admin') {
      throw new ForbiddenException(
        'Only organization administrators can review organization time policies.',
      );
    }
  }

  private async assertCanManagePolicies(
    context: RequestContext,
    actorId: string,
  ) {
    if (context.context.type === 'personal') {
      return;
    }

    if (context.context.type !== 'organization' || !context.context.id) {
      throw new ForbiddenException('Organization context is required.');
    }

    const membership = await this.databaseService.query<{
      role: 'admin' | 'member';
    }>(
      `select role
       from organization_memberships
       where organization_id = $1
         and user_id = $2`,
      [context.context.id, actorId],
    );

    if (!membership.rows[0] || membership.rows[0].role !== 'admin') {
      throw new ForbiddenException(
        'Only organization administrators can manage organization time policies.',
      );
    }
  }

  private async resolveTargets(input: {
    context: RequestContext;
    actorId: string;
    scopeLevel: TimePolicyScopeLevel;
    targetGroupId: string | null;
    targetUserId: string | null;
  }) {
    if (input.context.context.type === 'personal') {
      this.assertValidScopeSelection({
        actorId: input.actorId,
        context: input.context,
        scopeLevel: input.scopeLevel,
        targetGroupId: input.targetGroupId,
        targetUserId: input.targetUserId,
      });

      return {
        targetGroupId: null,
        targetUserId: input.actorId,
      };
    }

    const organizationId = this.organizationId(input.context);
    if (!organizationId) {
      throw new ForbiddenException('Organization context is required.');
    }

    if (input.scopeLevel === 'organization') {
      return {
        targetGroupId: null,
        targetUserId: null,
      };
    }

    if (input.scopeLevel === 'group') {
      if (!input.targetGroupId) {
        throw new BadRequestException(
          'targetGroupId is required for group scope rules.',
        );
      }

      const group = await this.databaseService.query<{ id: string }>(
        `select id
         from organization_groups
         where id = $1
           and organization_id = $2`,
        [input.targetGroupId, organizationId],
      );
      if (!group.rows[0]) {
        throw new BadRequestException(
          'targetGroupId is not part of the active organization.',
        );
      }

      return {
        targetGroupId: input.targetGroupId,
        targetUserId: null,
      };
    }

    const targetUserId = input.targetUserId ?? input.actorId;
    const membership = await this.databaseService.query<{ user_id: string }>(
      `select user_id
       from organization_memberships
       where organization_id = $1
         and user_id = $2`,
      [organizationId, targetUserId],
    );

    if (!membership.rows[0]) {
      throw new BadRequestException(
        'targetUserId must be a member of the active organization.',
      );
    }

    return {
      targetGroupId: null,
      targetUserId,
    };
  }

  private async resolveTargetUser(input: {
    context: RequestContext;
    actorId: string;
    targetUserId: string | null;
    requireOrgAdminForDelegation: boolean;
  }) {
    if (input.context.context.type === 'personal') {
      if (input.targetUserId && input.targetUserId !== input.actorId) {
        throw new BadRequestException(
          'Personal context can only evaluate policies and advisory for the active user.',
        );
      }

      return input.actorId;
    }

    const organizationId = this.organizationId(input.context);
    if (!organizationId) {
      throw new ForbiddenException('Organization context is required.');
    }

    const requestedTarget = input.targetUserId ?? input.actorId;
    const membership = await this.databaseService.query<{
      role: 'admin' | 'member';
      user_id: string;
    }>(
      `select role, user_id
       from organization_memberships
       where organization_id = $1
         and user_id in ($2, $3)
       order by user_id asc`,
      [organizationId, input.actorId, requestedTarget],
    );

    const actorMembership = membership.rows.find(
      (row) => row.user_id === input.actorId,
    );
    if (!actorMembership) {
      throw new ForbiddenException(
        'You are not an active member of this organization.',
      );
    }

    const targetMembership = membership.rows.find(
      (row) => row.user_id === requestedTarget,
    );
    if (!targetMembership) {
      throw new BadRequestException(
        'targetUserId is not an active organization member.',
      );
    }

    if (
      requestedTarget !== input.actorId &&
      input.requireOrgAdminForDelegation &&
      actorMembership.role !== 'admin'
    ) {
      throw new ForbiddenException(
        'Only organization admins can evaluate advisory data for another user.',
      );
    }

    return requestedTarget;
  }

  private organizationId(context: RequestContext) {
    return context.context.type === 'organization' ? context.context.id : null;
  }

  private assertValidScopeSelection(input: {
    actorId: string;
    context: RequestContext;
    scopeLevel: TimePolicyScopeLevel | null;
    targetGroupId: string | null;
    targetUserId: string | null;
  }) {
    if (input.context.context.type !== 'personal') {
      return;
    }

    if (input.scopeLevel && input.scopeLevel !== 'user') {
      throw new BadRequestException(
        'Personal context only supports user-scoped time policies.',
      );
    }

    if (input.targetGroupId) {
      throw new BadRequestException(
        'Personal context does not support group-scoped time policies.',
      );
    }

    if (input.targetUserId && input.targetUserId !== input.actorId) {
      throw new BadRequestException(
        'Personal context can only target the active user.',
      );
    }
  }
}
