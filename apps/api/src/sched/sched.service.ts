import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import {
  describeTimezoneMode,
  materializeScheduleOccurrences,
  previewUpcomingOccurrences,
  replaceVersionItem,
  shiftVersionItems,
  summarizeRecurrence,
  validateScheduleDefinition,
  type ScheduleDefinition,
  type ScheduleItemDefinition,
  type ScheduleMutationScope,
  type ScheduleOccurrenceException,
  type ScheduleOccurrenceMutationAction,
  type ScheduleOccurrenceProjection,
  type ScheduleVersionDefinition,
} from '@smart-schedule/domain-sched';
import { DatabaseService } from '../persistence/database.service';
import { OrgService } from '../org/org.service';
import { AuditService } from '../security/audit.service';

type ActiveScope = {
  contextType: 'organization' | 'personal';
  organizationId: string | null;
  personalOwnerUserId: string | null;
};

type QueryExecutor = DatabaseService | PoolClient;

type ScheduleRow = {
  boundary_end_date: string | null;
  boundary_start_date: string | null;
  context_type: 'organization' | 'personal';
  description: string | null;
  id: string;
  lifecycle_state: 'active' | 'deleted';
  name: string;
  operational_state: 'active' | 'archived' | 'template';
  organization_id: string | null;
  personal_owner_user_id: string | null;
};

type ScheduleVersionRow = {
  change_summary: string | null;
  effective_from_date: string;
  id: string;
  items: ScheduleItemDefinition[];
  recurrence_rule: ScheduleVersionDefinition['recurrence'];
  timezone: string;
  timezone_mode: ScheduleVersionDefinition['timezoneMode'];
};

type ScheduleExceptionRow = {
  action: ScheduleOccurrenceMutationAction;
  detached: boolean;
  id: string;
  moved_to_date: string | null;
  occurrence_date: string;
  override_item: Partial<ScheduleItemDefinition> | null;
  target_item_id: string | null;
};

type ProjectionRow = {
  detached: boolean;
  due_at: string | null;
  ends_at: string | null;
  item_definition_id: string;
  item_type: 'event' | 'task';
  local_date: string;
  occurrence_date: string;
  schedule_id: string;
  schedule_version_id: string;
  starts_at: string | null;
  timezone: string;
  timezone_mode: 'utc_constant' | 'wall_clock';
  title: string;
};

function nowIso() {
  return new Date().toISOString();
}

function isoDate(value = nowIso()) {
  return value.slice(0, 10);
}

function addDays(dateToken: string, amount: number) {
  const date = new Date(`${dateToken}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function compareDateTokens(left: string, right: string) {
  return normalizeDateToken(left).localeCompare(normalizeDateToken(right));
}

function normalizeDateToken(value: Date | string) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'string' && value.includes('T')) {
    return value.slice(0, 10);
  }

  return value;
}

function projectionHash(projection: ScheduleOccurrenceProjection) {
  return JSON.stringify({
    detached: projection.detached,
    dueAt: projection.dueAt,
    endsAt: projection.endsAt,
    itemDefinitionId: projection.itemDefinitionId,
    itemType: projection.itemType,
    localDate: projection.localDate,
    occurrenceDate: projection.occurrenceDate,
    scheduleId: projection.scheduleId,
    scheduleVersionId: projection.scheduleVersionId,
    startsAt: projection.startsAt,
    timezone: projection.timezone,
    timezoneMode: projection.timezoneMode,
    title: projection.title,
  });
}

function materializationWindowFromNow() {
  const today = isoDate();
  return {
    from: addDays(today, -30),
    to: addDays(today, 180),
  };
}

function scopeWindow(input: { from: string; to: string }) {
  return {
    from: input.from.slice(0, 10),
    to: input.to.slice(0, 10),
  };
}

function isAdminRole(role: string | null | undefined) {
  return role === 'admin';
}

async function queryExecutor<TResult extends QueryResultRow>(
  executor: QueryExecutor,
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<TResult>> {
  if (executor instanceof DatabaseService) {
    return executor.query<TResult>(text, params);
  }

  return executor.query<TResult>(text, params);
}

function sortVersions(versions: ScheduleVersionDefinition[]) {
  return [...versions].sort((left, right) =>
    compareDateTokens(left.effectiveFromDate, right.effectiveFromDate),
  );
}

function getVersionForOccurrence(
  versions: ScheduleVersionDefinition[],
  occurrenceDate: string,
) {
  const sorted = sortVersions(versions);
  let selected = sorted[0] ?? null;

  for (const version of sorted) {
    if (compareDateTokens(version.effectiveFromDate, occurrenceDate) <= 0) {
      selected = version;
      continue;
    }
    break;
  }

  return selected;
}

function normalizeVersionsForChangeControl(input: {
  anchorDate?: string;
  includePast?: boolean;
  scope?: 'all' | 'selected_and_future';
  versions: ScheduleVersionDefinition[];
}) {
  const sorted = sortVersions(input.versions);
  if (
    input.scope !== 'selected_and_future' ||
    !input.anchorDate ||
    input.includePast
  ) {
    return sorted;
  }

  const versionsAtOrAfterAnchor = sorted.filter(
    (version) =>
      compareDateTokens(version.effectiveFromDate, input.anchorDate!) >= 0,
  );
  if (versionsAtOrAfterAnchor.length > 0) {
    return versionsAtOrAfterAnchor;
  }

  const latestBeforeAnchor = [...sorted]
    .reverse()
    .find(
      (version) =>
        compareDateTokens(version.effectiveFromDate, input.anchorDate!) < 0,
    );
  if (!latestBeforeAnchor) {
    return sorted;
  }

  return [
    {
      ...latestBeforeAnchor,
      effectiveFromDate: input.anchorDate,
      id: randomUUID(),
    },
  ];
}

@Injectable()
export class SchedService {
  constructor(
    private readonly auditService: AuditService,
    private readonly databaseService: DatabaseService,
    private readonly orgService: OrgService,
  ) {}

  getScope(input: {
    actorId: string;
    contextId: string;
    contextType: 'organization' | 'personal' | 'public' | 'system';
  }): ActiveScope {
    if (
      input.contextType !== 'organization' &&
      input.contextType !== 'personal'
    ) {
      throw new ForbiddenException(
        'Schedule APIs require a personal or organization context.',
      );
    }

    if (input.contextType === 'organization') {
      return {
        contextType: 'organization',
        organizationId: input.contextId,
        personalOwnerUserId: null,
      };
    }

    return {
      contextType: 'personal',
      organizationId: null,
      personalOwnerUserId: input.actorId,
    };
  }

  async listSchedules(input: {
    actorId: string;
    query?: string;
    scope: ActiveScope;
    state?: 'active' | 'archived' | 'template';
  }) {
    await this.assertCanViewScope(input.scope, input.actorId);

    const rows = await this.querySchedulesByScope(input.scope, input.state);
    const filtered = rows.filter((row) =>
      input.query?.trim()
        ? row.name.toLowerCase().includes(input.query.trim().toLowerCase())
        : true,
    );
    const definitions = await Promise.all(
      filtered.map((row) => this.readScheduleDefinition(row.id, input.scope)),
    );
    const previewWindow = materializationWindowFromNow();

    return Promise.all(
      definitions.map(async (definition) => {
        const exceptions = await this.readScheduleExceptions(definition.id);
        const preview = previewUpcomingOccurrences({
          definition,
          exceptions,
          fromDate: previewWindow.from,
          limit: 4,
        });

        return {
          assignmentCount: 0,
          boundaryEndDate: definition.boundaryEndDate,
          boundaryStartDate: definition.boundaryStartDate,
          description: definition.description,
          exceptionCount: exceptions.length,
          id: definition.id,
          itemSummary: this.summarizeItems(definition.versions[0]?.items ?? []),
          name: definition.name,
          nextOccurrences: preview.occurrences,
          recurrenceSummary: summarizeRecurrence(
            definition.versions[0].recurrence,
          ),
          state: definition.state,
          timezone: definition.versions[0].timezone,
          timezoneMode: definition.versions[0].timezoneMode,
          timezoneModeLabel: describeTimezoneMode(
            definition.versions[0].timezoneMode,
          ),
          validation: preview.validation,
          versionCount: definition.versions.length,
        };
      }),
    );
  }

  async getSchedule(input: {
    actorId: string;
    scheduleId: string;
    scope: ActiveScope;
  }) {
    await this.assertCanViewScope(input.scope, input.actorId);
    const definition = await this.readScheduleDefinition(
      input.scheduleId,
      input.scope,
    );
    const exceptions = await this.readScheduleExceptions(input.scheduleId);
    const preview = previewUpcomingOccurrences({
      definition,
      exceptions,
      fromDate: materializationWindowFromNow().from,
      limit: 8,
    });

    return {
      schedule: definition,
      summary: {
        itemSummary: this.summarizeItems(definition.versions[0]?.items ?? []),
        recurrenceSummary: summarizeRecurrence(
          definition.versions[0].recurrence,
        ),
        timezoneModeLabel: describeTimezoneMode(
          definition.versions[0].timezoneMode,
        ),
      },
      upcomingOccurrences: preview.occurrences,
      validation: preview.validation,
    };
  }

  async previewSchedule(input: {
    definition: ScheduleDefinition;
    actorId: string;
    scope: ActiveScope;
  }) {
    await this.assertCanViewScope(input.scope, input.actorId);
    const preview = previewUpcomingOccurrences({
      definition: input.definition,
      exceptions: [],
      fromDate:
        input.definition.boundaryStartDate ??
        materializationWindowFromNow().from,
      limit: 8,
    });

    return {
      recurrenceSummary: summarizeRecurrence(
        input.definition.versions[0].recurrence,
      ),
      timezoneModeLabel: describeTimezoneMode(
        input.definition.versions[0].timezoneMode,
      ),
      upcomingOccurrences: preview.occurrences,
      validation: preview.validation,
    };
  }

  async createSchedule(input: {
    actorId: string;
    definition: ScheduleDefinition;
    scope: ActiveScope;
  }) {
    await this.assertCanManageScope(input.scope, input.actorId);
    this.assertDefinitionValid(input.definition);

    const timestamp = nowIso();
    const scheduleId = randomUUID();
    const definition: ScheduleDefinition = {
      ...input.definition,
      id: scheduleId,
    };

    await this.databaseService.transaction(async (client) => {
      await client.query(
        `insert into schedules (
           id,
           context_type,
           organization_id,
           personal_owner_user_id,
           created_by_user_id,
           operational_state,
           name,
           description,
           boundary_start_date,
           boundary_end_date,
           created_at,
           updated_at
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          scheduleId,
          input.scope.contextType,
          input.scope.organizationId,
          input.scope.personalOwnerUserId,
          input.actorId,
          definition.state,
          definition.name.trim(),
          definition.description?.trim() || null,
          definition.boundaryStartDate,
          definition.boundaryEndDate,
          timestamp,
          timestamp,
        ],
      );

      await this.insertVersions(client, {
        actorId: input.actorId,
        scheduleId,
        versions: definition.versions,
      });

      if (definition.state === 'active') {
        await this.materializePersistedSchedule(
          scheduleId,
          materializationWindowFromNow(),
          client,
        );
      }
    });

    this.auditService.emit({
      action: 'schedule.created',
      details: {
        operationalState: definition.state,
        versionCount: definition.versions.length,
      },
      targetId: scheduleId,
      targetType: 'schedule',
    });

    return this.getSchedule({
      actorId: input.actorId,
      scheduleId,
      scope: input.scope,
    });
  }

  async updateSchedule(input: {
    actorId: string;
    changeControl?: {
      anchorDate?: string;
      includePast?: boolean;
      overwriteExceptions?: boolean;
      scope?: Exclude<ScheduleMutationScope, 'selected'>;
    };
    definition: ScheduleDefinition;
    scheduleId: string;
    scope: ActiveScope;
  }) {
    await this.assertCanManageScope(input.scope, input.actorId);
    this.assertDefinitionValid(input.definition);

    const existing = await this.readScheduleDefinition(
      input.scheduleId,
      input.scope,
    );
    const versionsForWrite = normalizeVersionsForChangeControl({
      anchorDate: input.changeControl?.anchorDate,
      includePast: input.changeControl?.includePast,
      scope: input.changeControl?.scope,
      versions: input.definition.versions,
    });

    if (
      existing.state === 'active' &&
      input.changeControl?.scope &&
      input.changeControl.anchorDate
    ) {
      const conflicting = await this.listExceptionDatesInScope({
        anchorDate: input.changeControl.anchorDate,
        includePast: Boolean(input.changeControl.includePast),
        scheduleId: input.scheduleId,
        scope: input.changeControl.scope,
      });
      if (conflicting.length > 0 && !input.changeControl.overwriteExceptions) {
        throw new ConflictException({
          dates: conflicting,
          message:
            'This update would overwrite existing occurrence exceptions. Confirm overwrite to continue.',
        });
      }
    }

    const timestamp = nowIso();
    await this.databaseService.transaction(async (client) => {
      await client.query(
        `update schedules
         set operational_state = $2,
             name = $3,
             description = $4,
             boundary_start_date = $5,
             boundary_end_date = $6,
             updated_at = $7
         where id = $1`,
        [
          input.scheduleId,
          input.definition.state,
          input.definition.name.trim(),
          input.definition.description?.trim() || null,
          input.definition.boundaryStartDate,
          input.definition.boundaryEndDate,
          timestamp,
        ],
      );

      if (
        input.changeControl?.scope === 'selected_and_future' &&
        input.changeControl.anchorDate &&
        !input.changeControl.includePast
      ) {
        await client.query(
          `delete from schedule_versions
           where schedule_id = $1
             and effective_from_date >= $2`,
          [input.scheduleId, input.changeControl.anchorDate],
        );
      } else {
        await client.query(
          `delete from schedule_versions where schedule_id = $1`,
          [input.scheduleId],
        );
      }

      await this.insertVersions(client, {
        actorId: input.actorId,
        scheduleId: input.scheduleId,
        versions: versionsForWrite,
      });

      if (input.changeControl?.overwriteExceptions) {
        const anchor = input.changeControl.anchorDate ?? isoDate();
        if (
          input.changeControl.scope === 'selected_and_future' &&
          !input.changeControl.includePast
        ) {
          await client.query(
            `delete from schedule_exceptions
             where schedule_id = $1
               and occurrence_date >= $2`,
            [input.scheduleId, anchor],
          );
        } else {
          await client.query(
            `delete from schedule_exceptions
             where schedule_id = $1`,
            [input.scheduleId],
          );
        }
      }

      if (input.definition.state === 'active') {
        await this.materializePersistedSchedule(
          input.scheduleId,
          materializationWindowFromNow(),
          client,
        );
      } else {
        await client.query(
          `delete from schedule_occurrence_projections where schedule_id = $1`,
          [input.scheduleId],
        );
      }
    });

    this.auditService.emit({
      action: 'schedule.updated',
      details: {
        overwriteExceptions: input.changeControl?.overwriteExceptions ?? false,
        scope: input.changeControl?.scope ?? 'all',
      },
      targetId: input.scheduleId,
      targetType: 'schedule',
    });

    return this.getSchedule({
      actorId: input.actorId,
      scheduleId: input.scheduleId,
      scope: input.scope,
    });
  }

  async mutateOccurrence(input: {
    action: ScheduleOccurrenceMutationAction;
    actorId: string;
    detached: boolean;
    includePast: boolean;
    movedToDate: string | null;
    occurrenceDate: string;
    overrideItem: Partial<ScheduleItemDefinition> | null;
    overwriteExceptions: boolean;
    scheduleId: string;
    scope: ScheduleMutationScope;
    scopeContext: ActiveScope;
    targetItemId: string | null;
  }) {
    await this.assertCanManageScope(input.scopeContext, input.actorId);
    const definition = await this.readScheduleDefinition(
      input.scheduleId,
      input.scopeContext,
    );
    if (definition.state !== 'active') {
      throw new BadRequestException(
        'Occurrence edits are only supported for active schedules.',
      );
    }

    const conflicting = await this.listExceptionDatesInScope({
      anchorDate: input.occurrenceDate,
      includePast: input.includePast,
      scheduleId: input.scheduleId,
      scope: input.scope,
    });
    if (
      input.scope !== 'selected' &&
      conflicting.length > 0 &&
      !input.overwriteExceptions
    ) {
      throw new ConflictException({
        dates: conflicting,
        message:
          'This recurrence update would overwrite existing exceptions. Confirm overwrite to continue.',
      });
    }

    const targetVersion = getVersionForOccurrence(
      definition.versions,
      input.occurrenceDate,
    );
    if (!targetVersion) {
      throw new NotFoundException(
        'No schedule version was active for that date.',
      );
    }

    await this.databaseService.transaction(async (client) => {
      if (input.scope === 'selected') {
        await this.upsertException(client, {
          action: input.action,
          actorId: input.actorId,
          detached: input.detached,
          movedToDate: input.movedToDate,
          occurrenceDate: input.occurrenceDate,
          overrideItem: input.overrideItem,
          scheduleId: input.scheduleId,
          targetItemId: input.targetItemId,
        });
      } else {
        if (input.overwriteExceptions) {
          if (input.scope === 'selected_and_future') {
            await client.query(
              `delete from schedule_exceptions
               where schedule_id = $1
                 and occurrence_date >= $2`,
              [input.scheduleId, input.occurrenceDate],
            );
          } else if (input.includePast) {
            await client.query(
              `delete from schedule_exceptions where schedule_id = $1`,
              [input.scheduleId],
            );
          }
        }

        if (input.action === 'cancel') {
          if (input.scope === 'all' && input.includePast) {
            await client.query(
              `update schedules
               set operational_state = 'archived',
                   updated_at = $2
               where id = $1`,
              [input.scheduleId, nowIso()],
            );
          } else {
            await client.query(
              `update schedules
               set boundary_end_date = $2,
                   updated_at = $3
               where id = $1`,
              [input.scheduleId, addDays(input.occurrenceDate, -1), nowIso()],
            );
          }
        } else {
          const effectiveFromDate =
            input.scope === 'all' && input.includePast
              ? (definition.boundaryStartDate ??
                definition.versions[0].effectiveFromDate)
              : input.occurrenceDate;
          const nextVersion: ScheduleVersionDefinition =
            input.action === 'move'
              ? {
                  ...targetVersion,
                  effectiveFromDate,
                  id: randomUUID(),
                  items: shiftVersionItems(
                    targetVersion.items,
                    this.daysBetween(input.occurrenceDate, input.movedToDate!),
                  ),
                }
              : {
                  ...targetVersion,
                  effectiveFromDate,
                  id: randomUUID(),
                  items: replaceVersionItem({
                    items: targetVersion.items,
                    replacement: input.overrideItem ?? {},
                    targetItemId: input.targetItemId!,
                  }),
                };

          if (input.scope === 'all' && input.includePast) {
            await client.query(
              `delete from schedule_versions where schedule_id = $1`,
              [input.scheduleId],
            );
          } else {
            await client.query(
              `delete from schedule_versions
               where schedule_id = $1
                 and effective_from_date >= $2`,
              [input.scheduleId, input.occurrenceDate],
            );
          }

          await this.insertVersions(client, {
            actorId: input.actorId,
            scheduleId: input.scheduleId,
            versions:
              input.scope === 'all' && input.includePast
                ? [nextVersion]
                : [nextVersion],
          });
        }
      }

      await this.materializePersistedSchedule(
        input.scheduleId,
        materializationWindowFromNow(),
        client,
      );
    });

    this.auditService.emit({
      action: 'schedule.occurrence.mutated',
      details: {
        action: input.action,
        detached: input.detached,
        scope: input.scope,
      },
      targetId: input.scheduleId,
      targetType: 'schedule',
    });

    return this.listScheduleOccurrences({
      actorId: input.actorId,
      from: materializationWindowFromNow().from,
      scheduleId: input.scheduleId,
      scope: input.scopeContext,
      to: materializationWindowFromNow().to,
    });
  }

  async listScheduleOccurrences(input: {
    actorId: string;
    from: string;
    scheduleId: string;
    scope: ActiveScope;
    to: string;
  }) {
    await this.assertCanViewScope(input.scope, input.actorId);
    await this.materializePersistedSchedule(
      input.scheduleId,
      { from: input.from, to: input.to },
      this.databaseService,
      input.scope,
    );

    const rows = await this.databaseService.query<ProjectionRow>(
      `select
         schedule_id,
         schedule_version_id,
         occurrence_date,
         item_definition_id,
         item_type,
         title,
         local_date,
         starts_at,
         ends_at,
         due_at,
         timezone,
         timezone_mode,
         detached
       from schedule_occurrence_projections
       where schedule_id = $1
         and local_date between $2 and $3
       order by local_date asc, coalesce(starts_at, due_at) asc, title asc`,
      [input.scheduleId, input.from, input.to],
    );

    return rows.rows.map((row) => ({
      detached: row.detached,
      dueAt: row.due_at,
      endsAt: row.ends_at,
      itemDefinitionId: row.item_definition_id,
      itemType: row.item_type,
      localDate: row.local_date,
      occurrenceDate: row.occurrence_date,
      scheduleId: row.schedule_id,
      scheduleVersionId: row.schedule_version_id,
      startsAt: row.starts_at,
      timezone: row.timezone,
      timezoneMode: row.timezone_mode,
      title: row.title,
    }));
  }

  async listCalendarEntries(input: {
    actorId: string;
    from: string;
    scope: ActiveScope;
    to: string;
  }) {
    await this.assertCanViewScope(input.scope, input.actorId);
    const schedules = await this.querySchedulesByScope(input.scope, 'active');
    const window = scopeWindow({ from: input.from, to: input.to });

    for (const schedule of schedules) {
      await this.materializePersistedSchedule(
        schedule.id,
        window,
        this.databaseService,
        input.scope,
      );
    }

    const params =
      input.scope.contextType === 'organization'
        ? [input.scope.organizationId, input.from, input.to]
        : [input.scope.personalOwnerUserId, input.from, input.to];
    const scopeClause =
      input.scope.contextType === 'organization'
        ? `s.context_type = 'organization' and s.organization_id = $1`
        : `s.context_type = 'personal' and s.personal_owner_user_id = $1`;

    const result = await this.databaseService.query<{
      detached: boolean;
      due_at: string | null;
      ends_at: string | null;
      local_date: string;
      occurrence_date: string;
      schedule_id: string;
      starts_at: string | null;
      title: string;
    }>(
      `select
         p.schedule_id,
         p.occurrence_date,
         p.title,
         p.local_date,
         p.starts_at,
         p.ends_at,
         p.due_at,
         p.detached
       from schedule_occurrence_projections p
       inner join schedules s on s.id = p.schedule_id
       where ${scopeClause}
         and s.operational_state = 'active'
         and (
           (p.starts_at is not null and p.starts_at < $3 and coalesce(p.ends_at, p.starts_at) >= $2)
           or (p.due_at is not null and p.due_at between $2 and $3)
         )
       order by coalesce(p.starts_at, p.due_at) asc`,
      params,
    );

    return result.rows.map((row) => ({
      calendarEntryType: 'schedule_occurrence' as const,
      detached: row.detached,
      dueAt: row.due_at,
      endAt: row.ends_at,
      id: `${row.schedule_id}:${row.occurrence_date}:${row.title}`,
      itemType: 'schedule' as const,
      localDate: row.local_date,
      occurrenceDate: row.occurrence_date,
      scheduleId: row.schedule_id,
      startAt: row.starts_at,
      title: row.title,
    }));
  }

  private assertDefinitionValid(definition: ScheduleDefinition) {
    const errors = validateScheduleDefinition(definition).filter(
      (issue) => issue.level === 'error',
    );
    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'The submitted schedule definition is invalid.',
        validation: errors,
      });
    }
  }

  private summarizeItems(items: ScheduleItemDefinition[]) {
    const eventCount = items.filter((item) => item.itemType === 'event').length;
    const taskCount = items.filter((item) => item.itemType === 'task').length;
    return {
      eventCount,
      taskCount,
      total: items.length,
    };
  }

  private daysBetween(left: string, right: string) {
    const leftDate = new Date(`${left}T00:00:00.000Z`);
    const rightDate = new Date(`${right}T00:00:00.000Z`);
    return Math.round(
      (rightDate.getTime() - leftDate.getTime()) / (24 * 60 * 60 * 1000),
    );
  }

  private async assertCanViewScope(scope: ActiveScope, actorId: string) {
    if (scope.contextType === 'personal') {
      if (scope.personalOwnerUserId !== actorId) {
        throw new ForbiddenException(
          'Personal schedules can only be viewed in your own personal context.',
        );
      }
      return;
    }

    await this.orgService.resolveOrganizationContextForActor({
      actorId,
      organizationId: scope.organizationId!,
    });
  }

  private async assertCanManageScope(scope: ActiveScope, actorId: string) {
    await this.assertCanViewScope(scope, actorId);
    if (scope.contextType === 'personal') {
      return;
    }

    const result = await this.databaseService.query<{ role: string }>(
      `select role
       from organization_memberships
       where organization_id = $1
         and user_id = $2`,
      [scope.organizationId, actorId],
    );

    if (!isAdminRole(result.rows[0]?.role)) {
      throw new ForbiddenException(
        'Only organization administrators can manage schedules in an organization context.',
      );
    }
  }

  private async querySchedulesByScope(
    scope: ActiveScope,
    state?: 'active' | 'archived' | 'template',
  ) {
    const params: unknown[] =
      scope.contextType === 'organization'
        ? [scope.organizationId]
        : [scope.personalOwnerUserId];
    const scopeClause =
      scope.contextType === 'organization'
        ? `context_type = 'organization' and organization_id = $1`
        : `context_type = 'personal' and personal_owner_user_id = $1`;
    const stateClause = state ? `and operational_state = $2` : '';

    if (state) {
      params.push(state);
    }

    const result = await this.databaseService.query<ScheduleRow>(
      `select
         id,
         context_type,
         organization_id,
         personal_owner_user_id,
         lifecycle_state,
         operational_state,
         name,
         description,
         boundary_start_date,
         boundary_end_date
       from schedules
       where ${scopeClause}
         and lifecycle_state = 'active'
         ${stateClause}
       order by updated_at desc, name asc`,
      params,
    );

    return result.rows;
  }

  private async readScheduleDefinition(scheduleId: string, scope: ActiveScope) {
    const row = await this.findScheduleRow(
      scheduleId,
      scope,
      this.databaseService,
    );
    const versions = await this.readScheduleVersions(
      scheduleId,
      this.databaseService,
    );
    if (!row || versions.length === 0) {
      throw new NotFoundException('Schedule not found.');
    }

    return {
      boundaryEndDate: row.boundary_end_date,
      boundaryStartDate: row.boundary_start_date,
      description: row.description,
      id: row.id,
      name: row.name,
      state: row.operational_state,
      versions,
    } satisfies ScheduleDefinition;
  }

  private async findScheduleRow(
    scheduleId: string,
    scope: ActiveScope,
    executor: QueryExecutor,
  ) {
    const params =
      scope.contextType === 'organization'
        ? [scheduleId, scope.organizationId]
        : [scheduleId, scope.personalOwnerUserId];
    const scopeClause =
      scope.contextType === 'organization'
        ? `context_type = 'organization' and organization_id = $2`
        : `context_type = 'personal' and personal_owner_user_id = $2`;

    const result = await queryExecutor<ScheduleRow>(
      executor,
      `select
         id,
         context_type,
         organization_id,
         personal_owner_user_id,
         lifecycle_state,
         operational_state,
         name,
         description,
         boundary_start_date,
         boundary_end_date
       from schedules
       where id = $1
         and ${scopeClause}
         and lifecycle_state = 'active'`,
      params,
    );
    return result.rows[0] ?? null;
  }

  private async readScheduleVersions(
    scheduleId: string,
    executor: QueryExecutor,
  ) {
    const result = await queryExecutor<ScheduleVersionRow>(
      executor,
      `select
         id,
         effective_from_date,
         timezone,
         timezone_mode,
         recurrence_rule,
         items,
         change_summary
       from schedule_versions
       where schedule_id = $1
       order by effective_from_date asc`,
      [scheduleId],
    );

    return result.rows.map((row) => ({
      effectiveFromDate: row.effective_from_date,
      id: row.id,
      items: row.items,
      recurrence: row.recurrence_rule,
      timezone: row.timezone,
      timezoneMode: row.timezone_mode,
    }));
  }

  private async readScheduleExceptions(
    scheduleId: string,
    executor: QueryExecutor = this.databaseService,
  ) {
    const result = await queryExecutor<ScheduleExceptionRow>(
      executor,
      `select
         id,
         occurrence_date,
         target_item_id,
         action,
         detached,
         (override_data ->> 'movedToDate')::text as moved_to_date,
         case
           when override_data ? 'overrideItem' then (override_data -> 'overrideItem')::jsonb
           else null
         end as override_item
       from schedule_exceptions
       where schedule_id = $1
       order by occurrence_date asc`,
      [scheduleId],
    );

    return result.rows.map((row) => ({
      action: row.action,
      detached: row.detached,
      id: row.id,
      movedToDate: row.moved_to_date,
      occurrenceDate: row.occurrence_date,
      overrideItem: row.override_item,
      targetItemId: row.target_item_id,
    })) satisfies ScheduleOccurrenceException[];
  }

  private async listExceptionDatesInScope(input: {
    anchorDate: string;
    includePast: boolean;
    scheduleId: string;
    scope: ScheduleMutationScope;
  }) {
    if (input.scope === 'selected') {
      const result = await this.databaseService.query<{
        occurrence_date: string;
      }>(
        `select occurrence_date
         from schedule_exceptions
         where schedule_id = $1
           and occurrence_date = $2`,
        [input.scheduleId, input.anchorDate],
      );
      return result.rows.map((row) => normalizeDateToken(row.occurrence_date));
    }

    if (input.scope === 'selected_and_future' || !input.includePast) {
      const result = await this.databaseService.query<{
        occurrence_date: string;
      }>(
        `select occurrence_date
         from schedule_exceptions
         where schedule_id = $1
           and occurrence_date >= $2
         order by occurrence_date asc`,
        [input.scheduleId, input.anchorDate],
      );
      return result.rows.map((row) => normalizeDateToken(row.occurrence_date));
    }

    const result = await this.databaseService.query<{
      occurrence_date: string;
    }>(
      `select occurrence_date
       from schedule_exceptions
       where schedule_id = $1
       order by occurrence_date asc`,
      [input.scheduleId],
    );
    return result.rows.map((row) => normalizeDateToken(row.occurrence_date));
  }

  private async insertVersions(
    executor: QueryExecutor,
    input: {
      actorId: string;
      scheduleId: string;
      versions: ScheduleVersionDefinition[];
    },
  ) {
    for (const version of sortVersions(input.versions)) {
      await queryExecutor(
        executor,
        `insert into schedule_versions (
           id,
           schedule_id,
           effective_from_date,
           timezone,
           timezone_mode,
           recurrence_rule,
           items,
           created_by_user_id,
           created_at
         )
         values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)`,
        [
          version.id || randomUUID(),
          input.scheduleId,
          version.effectiveFromDate,
          version.timezone,
          version.timezoneMode,
          JSON.stringify(version.recurrence),
          JSON.stringify(version.items),
          input.actorId,
          nowIso(),
        ],
      );
    }
  }

  private async upsertException(
    executor: QueryExecutor,
    input: {
      action: ScheduleOccurrenceMutationAction;
      actorId: string;
      detached: boolean;
      movedToDate: string | null;
      occurrenceDate: string;
      overrideItem: Partial<ScheduleItemDefinition> | null;
      scheduleId: string;
      targetItemId: string | null;
    },
  ) {
    const exceptionId = randomUUID();
    const overrideData = {
      movedToDate: input.movedToDate,
      overrideItem: input.overrideItem,
    };

    if (input.targetItemId) {
      await queryExecutor(
        executor,
        `delete from schedule_exceptions
         where schedule_id = $1
           and occurrence_date = $2
           and action = $3
           and target_item_id = $4`,
        [
          input.scheduleId,
          input.occurrenceDate,
          input.action,
          input.targetItemId,
        ],
      );

      await queryExecutor(
        executor,
        `insert into schedule_exceptions (
           id,
           schedule_id,
           occurrence_date,
           target_item_id,
           action,
           detached,
           override_data,
           created_by_user_id,
           created_at
         )
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
        [
          exceptionId,
          input.scheduleId,
          input.occurrenceDate,
          input.targetItemId,
          input.action,
          input.detached,
          JSON.stringify(overrideData),
          input.actorId,
          nowIso(),
        ],
      );
      return;
    }

    await queryExecutor(
      executor,
      `delete from schedule_exceptions
       where schedule_id = $1
         and occurrence_date = $2
         and action = $3
         and target_item_id is null`,
      [input.scheduleId, input.occurrenceDate, input.action],
    );

    await queryExecutor(
      executor,
      `insert into schedule_exceptions (
         id,
         schedule_id,
         occurrence_date,
         target_item_id,
         action,
         detached,
         override_data,
         created_by_user_id,
         created_at
       )
       values ($1, $2, $3, null, $4, $5, $6::jsonb, $7, $8)`,
      [
        exceptionId,
        input.scheduleId,
        input.occurrenceDate,
        input.action,
        input.detached,
        JSON.stringify(overrideData),
        input.actorId,
        nowIso(),
      ],
    );
  }

  private async materializePersistedSchedule(
    scheduleId: string,
    window: { from: string; to: string },
    executor: QueryExecutor,
    scope?: ActiveScope,
  ) {
    const row = scope
      ? await this.findScheduleRow(scheduleId, scope, executor)
      : await queryExecutor<ScheduleRow>(
          executor,
          `select
             id,
             context_type,
             organization_id,
             personal_owner_user_id,
             lifecycle_state,
             operational_state,
             name,
             description,
             boundary_start_date,
             boundary_end_date
           from schedules
           where id = $1
             and lifecycle_state = 'active'`,
          [scheduleId],
        ).then((result) => result.rows[0] ?? null);
    if (!row || row.operational_state !== 'active') {
      return;
    }

    const definition: ScheduleDefinition = {
      boundaryEndDate: row.boundary_end_date,
      boundaryStartDate: row.boundary_start_date,
      description: row.description,
      id: row.id,
      name: row.name,
      state: row.operational_state,
      versions: await this.readScheduleVersions(scheduleId, executor),
    };
    const exceptions = await this.readScheduleExceptions(scheduleId, executor);
    const materialized = materializeScheduleOccurrences({
      definition,
      exceptions,
      window,
    });

    await queryExecutor(
      executor,
      `delete from schedule_occurrence_projections
       where schedule_id = $1
         and occurrence_date between $2 and $3`,
      [scheduleId, window.from, window.to],
    );

    for (const projection of materialized.projections) {
      await queryExecutor(
        executor,
        `insert into schedule_occurrence_projections (
           id,
           schedule_id,
           schedule_version_id,
           occurrence_date,
           item_definition_id,
           item_type,
           title,
           local_date,
           starts_at,
           ends_at,
           due_at,
           timezone,
           timezone_mode,
           detached,
           projection_hash,
           materialized_at
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         on conflict (schedule_id, occurrence_date, item_definition_id)
         do update set
           schedule_version_id = excluded.schedule_version_id,
           item_type = excluded.item_type,
           title = excluded.title,
           local_date = excluded.local_date,
           starts_at = excluded.starts_at,
           ends_at = excluded.ends_at,
           due_at = excluded.due_at,
           timezone = excluded.timezone,
           timezone_mode = excluded.timezone_mode,
           detached = excluded.detached,
           projection_hash = excluded.projection_hash,
           materialized_at = excluded.materialized_at`,
        [
          randomUUID(),
          projection.scheduleId,
          projection.scheduleVersionId,
          projection.occurrenceDate,
          projection.itemDefinitionId,
          projection.itemType,
          projection.title,
          projection.localDate,
          projection.startsAt,
          projection.endsAt,
          projection.dueAt,
          projection.timezone,
          projection.timezoneMode,
          projection.detached,
          projectionHash(projection),
          nowIso(),
        ],
      );
    }

    await queryExecutor(
      executor,
      `update schedules
       set last_materialized_from = $2,
           last_materialized_to = $3,
           last_materialized_at = $4
       where id = $1`,
      [
        scheduleId,
        `${window.from}T00:00:00.000Z`,
        `${window.to}T23:59:59.999Z`,
        nowIso(),
      ],
    );
  }
}
