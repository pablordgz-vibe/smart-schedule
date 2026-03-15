import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../persistence/database.service';
import { AuditService } from '../security/audit.service';
import { OrgService } from '../org/org.service';

type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'completed';

const taskStatuses: TaskStatus[] = [
  'todo',
  'in_progress',
  'blocked',
  'completed',
];
const taskPriorities: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

type ActiveScope = {
  contextType: 'organization' | 'personal';
  organizationId: string | null;
  personalOwnerUserId: string | null;
};

type CalendarDescriptor = {
  id: string;
  name: string;
  ownerUserId: string | null;
  type: 'organization' | 'personal';
};

type EventRecord = {
  all_day: boolean;
  all_day_end_date: string | null;
  all_day_start_date: string | null;
  context_type: 'organization' | 'personal';
  created_at: string;
  created_by_user_id: string;
  duration_minutes: number | null;
  end_at: string | null;
  id: string;
  lifecycle_state: 'active' | 'deleted';
  linked_task_id: string | null;
  location: string | null;
  notes: string | null;
  organization_id: string | null;
  personal_owner_user_id: string | null;
  start_at: string | null;
  timezone: string;
  title: string;
  updated_at: string;
  work_related: boolean;
};

type TaskRecord = {
  auto_complete_from_subtasks: boolean;
  completed: boolean;
  context_type: 'organization' | 'personal';
  created_at: string;
  created_by_user_id: string;
  due_at: string | null;
  estimated_duration_minutes: number | null;
  id: string;
  lifecycle_state: 'active' | 'deleted';
  location: string | null;
  notes: string | null;
  organization_id: string | null;
  personal_owner_user_id: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  timezone: string;
  title: string;
  updated_at: string;
  work_related: boolean;
};

type CreateTaskInput = {
  actorId: string;
  calendarIds: string[];
  contactIds: string[];
  dueAt: string | null;
  estimatedDurationMinutes: number | null;
  priority: TaskPriority;
  scope: ActiveScope;
  status: TaskStatus;
  subtasks: Array<{ completed: boolean; title: string }>;
  timezone: string;
  title: string;
  autoCompleteFromSubtasks: boolean;
  dependencyTaskIds: string[];
  location: string | null;
  notes: string | null;
  workRelated: boolean;
};

type CreateEventInput = {
  actorId: string;
  allDay: boolean;
  allDayEndDate: string | null;
  allDayStartDate: string | null;
  calendarIds: string[];
  contactIds: string[];
  durationMinutes: number | null;
  endAt: string | null;
  linkedTaskId: string | null;
  location: string | null;
  notes: string | null;
  scope: ActiveScope;
  startAt: string | null;
  timezone: string;
  title: string;
  workRelated: boolean;
};

function nowIso() {
  return new Date().toISOString();
}

function resolveEventEnd(input: {
  durationMinutes?: number | null;
  endAt?: Date | null;
  startAt: Date;
}) {
  if (input.endAt) {
    return input.endAt;
  }

  const durationMinutes = input.durationMinutes ?? 0;
  if (durationMinutes <= 0) {
    throw new BadRequestException('Event duration must be greater than zero.');
  }

  return new Date(input.startAt.getTime() + durationMinutes * 60_000);
}

function summarizeAllocation(input: {
  allocatedMinutes: number;
  estimateMinutes: number | null;
}) {
  const estimateMinutes = input.estimateMinutes;
  if (estimateMinutes == null || estimateMinutes <= 0) {
    return {
      allocatedMinutes: input.allocatedMinutes,
      estimateMinutes: estimateMinutes ?? null,
      overAllocated: false,
      remainingMinutes: null,
    };
  }

  const remaining = estimateMinutes - input.allocatedMinutes;
  return {
    allocatedMinutes: input.allocatedMinutes,
    estimateMinutes,
    overAllocated: remaining < 0,
    remainingMinutes: Math.max(remaining, 0),
  };
}

function dedupe(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function requireTaskStatus(status: string): TaskStatus {
  if (!taskStatuses.includes(status as TaskStatus)) {
    throw new BadRequestException('Unsupported task status.');
  }

  return status as TaskStatus;
}

function requireTaskPriority(priority: string): TaskPriority {
  if (!taskPriorities.includes(priority as TaskPriority)) {
    throw new BadRequestException('Unsupported task priority.');
  }

  return priority as TaskPriority;
}

@Injectable()
export class CalService {
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
        'Calendar and task APIs require a personal or organization context.',
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

  async listCalendars(input: { actorId: string; scope: ActiveScope }) {
    const calendars = await this.resolveVisibleCalendars(
      input.scope,
      input.actorId,
    );
    return calendars;
  }

  async createPersonalCalendar(input: {
    actorId: string;
    name: string;
    scope: ActiveScope;
  }) {
    if (input.scope.contextType !== 'personal') {
      throw new ForbiddenException(
        'Personal calendars can only be created in personal context.',
      );
    }

    const timestamp = nowIso();
    const result = await this.databaseService.query<{
      id: string;
      name: string;
      owner_user_id: string;
    }>(
      `insert into personal_calendars (
         id,
         owner_user_id,
         name,
         created_by_user_id,
         created_at,
         updated_at
       )
       values ($1, $2, $3, $4, $5, $6)
       returning id, name, owner_user_id`,
      [
        randomUUID(),
        input.actorId,
        input.name.trim(),
        input.actorId,
        timestamp,
        timestamp,
      ],
    );

    return {
      id: result.rows[0].id,
      name: result.rows[0].name,
      ownerUserId: result.rows[0].owner_user_id,
      type: 'personal' as const,
    };
  }

  async listImportedContacts(input: {
    actorId: string;
    query: string | null;
    scope: ActiveScope;
  }) {
    await this.ensureScopeAccess(input.scope, input.actorId);
    const params: unknown[] = [];
    const where: string[] = [];

    if (input.scope.contextType === 'personal') {
      params.push(input.actorId);
      where.push(
        `context_type = 'personal' and personal_owner_user_id = $${params.length}`,
      );
    } else {
      params.push(input.scope.organizationId);
      where.push(
        `context_type = 'organization' and organization_id = $${params.length}`,
      );
    }

    if (input.query?.trim()) {
      params.push(`%${input.query.trim()}%`);
      where.push(
        `(display_name ilike $${params.length} or coalesce(email, '') ilike $${params.length})`,
      );
    }

    const result = await this.databaseService.query<{
      display_name: string;
      email: string | null;
      id: string;
      phone: string | null;
      provider_code: string;
      provider_contact_id: string;
    }>(
      `select
         id,
         provider_code,
         provider_contact_id,
         display_name,
         email,
         phone
       from imported_contacts
       where ${where.join(' and ')}
       order by display_name asc
       limit 50`,
      params,
    );

    return result.rows.map((row) => ({
      displayName: row.display_name,
      email: row.email,
      id: row.id,
      phone: row.phone,
      providerCode: row.provider_code,
      providerContactId: row.provider_contact_id,
    }));
  }

  async createImportedContact(input: {
    actorId: string;
    displayName: string;
    email: string | null;
    phone: string | null;
    providerCode: string;
    providerContactId: string;
    scope: ActiveScope;
  }) {
    await this.ensureScopeAccess(input.scope, input.actorId);

    const timestamp = nowIso();
    const result = await this.databaseService.query<{ id: string }>(
      `insert into imported_contacts (
         id,
         context_type,
         organization_id,
         personal_owner_user_id,
         provider_code,
         provider_contact_id,
         display_name,
         email,
         phone,
         created_by_user_id,
         created_at,
         updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
       on conflict do nothing
       returning id`,
      [
        randomUUID(),
        input.scope.contextType,
        input.scope.organizationId,
        input.scope.personalOwnerUserId,
        input.providerCode.trim().toLowerCase(),
        input.providerContactId.trim(),
        input.displayName.trim(),
        input.email,
        input.phone,
        input.actorId,
        timestamp,
      ],
    );

    if (!result.rows[0]) {
      throw new BadRequestException(
        'That imported contact already exists in this context.',
      );
    }

    return this.listImportedContacts({
      actorId: input.actorId,
      query: input.displayName,
      scope: input.scope,
    }).then((contacts) =>
      contacts.find((contact) => contact.id === result.rows[0].id),
    );
  }

  async createTask(input: CreateTaskInput) {
    await this.ensureScopeAccess(input.scope, input.actorId);
    const calendarRefs = await this.resolveCalendarRefs(
      input.scope,
      input.actorId,
      input.calendarIds,
    );
    const contactIds = await this.resolveContactIds(
      input.scope,
      input.actorId,
      input.contactIds,
    );
    await this.assertDependencyTasksInScope(
      input.scope,
      input.actorId,
      input.dependencyTaskIds,
    );

    const timestamp = nowIso();
    const taskId = randomUUID();

    await this.databaseService.transaction(async (client) => {
      await client.query(
        `insert into calendar_tasks (
           id,
           context_type,
           organization_id,
           personal_owner_user_id,
           created_by_user_id,
           lifecycle_state,
           title,
           due_at,
           timezone,
           location,
           notes,
           work_related,
           priority,
           status,
           completed,
           estimated_duration_minutes,
           auto_complete_from_subtasks,
           created_at,
           updated_at
         )
         values (
           $1,
           $2,
           $3,
           $4,
           $5,
           'active',
           $6,
           $7,
           $8,
           $9,
           $10,
           $11,
           $12,
           $13,
           $14,
           $15,
           $16,
           $17,
           $17
         )`,
        [
          taskId,
          input.scope.contextType,
          input.scope.organizationId,
          input.scope.personalOwnerUserId,
          input.actorId,
          input.title,
          input.dueAt,
          input.timezone,
          input.location,
          input.notes,
          input.workRelated,
          input.priority,
          input.status,
          input.status === 'completed',
          input.estimatedDurationMinutes,
          input.autoCompleteFromSubtasks,
          timestamp,
        ],
      );

      for (const calendar of calendarRefs) {
        await client.query(
          `insert into calendar_item_calendar_memberships (
             id,
             item_type,
             item_id,
             context_type,
             organization_id,
             personal_owner_user_id,
             calendar_type,
             calendar_id,
             created_by_user_id,
             created_at
           )
           values ($1, 'task', $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            randomUUID(),
            taskId,
            input.scope.contextType,
            input.scope.organizationId,
            input.scope.personalOwnerUserId,
            calendar.type,
            calendar.id,
            input.actorId,
            timestamp,
          ],
        );
      }

      for (const subtask of input.subtasks) {
        await client.query(
          `insert into calendar_task_subtasks (
             id,
             task_id,
             title,
             completed,
             created_at,
             updated_at
           )
           values ($1, $2, $3, $4, $5, $5)`,
          [
            randomUUID(),
            taskId,
            subtask.title.trim(),
            subtask.completed,
            timestamp,
          ],
        );
      }

      for (const dependencyTaskId of dedupe(input.dependencyTaskIds)) {
        await client.query(
          `insert into calendar_task_dependencies (
             id,
             task_id,
             depends_on_task_id,
             created_at
           )
           values ($1, $2, $3, $4)`,
          [randomUUID(), taskId, dependencyTaskId, timestamp],
        );
      }

      for (const contactId of contactIds) {
        await client.query(
          `insert into calendar_task_contacts (
             task_id,
             contact_id,
             created_at
           )
           values ($1, $2, $3)`,
          [taskId, contactId, timestamp],
        );
      }
    });

    await this.refreshTaskAutoCompletion(taskId);

    this.auditService.emit({
      action: 'cal.task.created',
      details: {
        calendarCount: calendarRefs.length,
        hasDeadline: Boolean(input.dueAt),
      },
      targetId: taskId,
      targetType: 'task',
    });

    return this.getTaskById({
      actorId: input.actorId,
      scope: input.scope,
      taskId,
    });
  }

  async updateTask(input: {
    actorId: string;
    scope: ActiveScope;
    taskId: string;
    patch: {
      autoCompleteFromSubtasks?: boolean;
      calendarIds?: string[];
      contactIds?: string[];
      dependencyTaskIds?: string[];
      dueAt?: string | null;
      estimatedDurationMinutes?: number | null;
      location?: string | null;
      notes?: string | null;
      priority?: TaskPriority;
      status?: TaskStatus;
      subtasks?: Array<{ completed: boolean; id?: string; title: string }>;
      timezone?: string;
      title?: string;
      workRelated?: boolean;
    };
  }) {
    const existing = await this.requireTask(
      input.scope,
      input.actorId,
      input.taskId,
    );

    const priority = input.patch.priority ?? existing.priority;
    const status = input.patch.status ?? existing.status;
    const dueAt =
      input.patch.dueAt === undefined ? existing.due_at : input.patch.dueAt;

    if (priority) {
      requireTaskPriority(priority);
    }

    if (status) {
      requireTaskStatus(status);
    }

    await this.databaseService.transaction(async (client) => {
      await client.query(
        `update calendar_tasks
         set title = $2,
             due_at = $3,
             timezone = $4,
             location = $5,
             notes = $6,
             work_related = $7,
             priority = $8,
             status = $9,
             completed = $10,
             estimated_duration_minutes = $11,
             auto_complete_from_subtasks = $12,
             updated_at = $13
         where id = $1`,
        [
          input.taskId,
          (input.patch.title ?? existing.title).trim(),
          dueAt,
          input.patch.timezone ?? existing.timezone,
          input.patch.location === undefined
            ? existing.location
            : input.patch.location,
          input.patch.notes === undefined ? existing.notes : input.patch.notes,
          input.patch.workRelated ?? existing.work_related,
          priority,
          status,
          status === 'completed',
          input.patch.estimatedDurationMinutes === undefined
            ? existing.estimated_duration_minutes
            : input.patch.estimatedDurationMinutes,
          input.patch.autoCompleteFromSubtasks ??
            existing.auto_complete_from_subtasks,
          nowIso(),
        ],
      );

      if (input.patch.calendarIds) {
        const calendarRefs = await this.resolveCalendarRefs(
          input.scope,
          input.actorId,
          input.patch.calendarIds,
        );
        await client.query(
          `delete from calendar_item_calendar_memberships
           where item_type = 'task'
             and item_id = $1`,
          [input.taskId],
        );

        for (const calendar of calendarRefs) {
          await client.query(
            `insert into calendar_item_calendar_memberships (
               id,
               item_type,
               item_id,
               context_type,
               organization_id,
               personal_owner_user_id,
               calendar_type,
               calendar_id,
               created_by_user_id,
               created_at
             )
             values ($1, 'task', $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              randomUUID(),
              input.taskId,
              input.scope.contextType,
              input.scope.organizationId,
              input.scope.personalOwnerUserId,
              calendar.type,
              calendar.id,
              input.actorId,
              nowIso(),
            ],
          );
        }
      }

      if (input.patch.contactIds) {
        const contactIds = await this.resolveContactIds(
          input.scope,
          input.actorId,
          input.patch.contactIds,
        );
        await client.query(
          `delete from calendar_task_contacts where task_id = $1`,
          [input.taskId],
        );
        for (const contactId of contactIds) {
          await client.query(
            `insert into calendar_task_contacts (task_id, contact_id, created_at)
             values ($1, $2, $3)`,
            [input.taskId, contactId, nowIso()],
          );
        }
      }

      if (input.patch.subtasks) {
        await client.query(
          `delete from calendar_task_subtasks where task_id = $1`,
          [input.taskId],
        );
        for (const subtask of input.patch.subtasks) {
          await client.query(
            `insert into calendar_task_subtasks (
               id,
               task_id,
               title,
               completed,
               created_at,
               updated_at
             )
             values ($1, $2, $3, $4, $5, $5)`,
            [
              randomUUID(),
              input.taskId,
              subtask.title.trim(),
              subtask.completed,
              nowIso(),
            ],
          );
        }
      }

      if (input.patch.dependencyTaskIds) {
        await this.assertDependencyTasksInScope(
          input.scope,
          input.actorId,
          input.patch.dependencyTaskIds,
        );
        await client.query(
          `delete from calendar_task_dependencies where task_id = $1`,
          [input.taskId],
        );
        for (const dependencyTaskId of dedupe(input.patch.dependencyTaskIds)) {
          await client.query(
            `insert into calendar_task_dependencies (
               id,
               task_id,
               depends_on_task_id,
               created_at
             )
             values ($1, $2, $3, $4)`,
            [randomUUID(), input.taskId, dependencyTaskId, nowIso()],
          );
        }
      }
    });

    await this.refreshTaskAutoCompletion(input.taskId);

    this.auditService.emit({
      action: 'cal.task.updated',
      targetId: input.taskId,
      targetType: 'task',
    });

    return this.getTaskById({
      actorId: input.actorId,
      scope: input.scope,
      taskId: input.taskId,
    });
  }

  async deleteTask(input: {
    actorId: string;
    scope: ActiveScope;
    taskId: string;
  }) {
    await this.requireTask(input.scope, input.actorId, input.taskId);

    await this.databaseService.query(
      `update calendar_tasks
       set lifecycle_state = 'deleted',
           updated_at = $2
       where id = $1`,
      [input.taskId, nowIso()],
    );

    this.auditService.emit({
      action: 'cal.task.deleted',
      targetId: input.taskId,
      targetType: 'task',
    });

    return { ok: true };
  }

  async getTaskById(input: {
    actorId: string;
    scope: ActiveScope;
    taskId: string;
  }) {
    const task = await this.requireTask(
      input.scope,
      input.actorId,
      input.taskId,
    );

    const [
      calendarMemberships,
      contacts,
      dependencies,
      subtasks,
      linkedEvents,
      provenance,
      attachments,
    ] = await Promise.all([
      this.getItemCalendarMemberships('task', input.taskId),
      this.getTaskContacts(input.taskId),
      this.getTaskDependencies(input.taskId),
      this.getTaskSubtasks(input.taskId),
      this.getLinkedEvents(input.scope, input.actorId, input.taskId),
      this.getItemProvenance('task', input.taskId),
      this.getItemAttachments('task', input.taskId),
    ]);

    const allocation = await this.getTaskAllocation(task.id);

    return {
      allocation,
      attachments,
      autoCompleteFromSubtasks: task.auto_complete_from_subtasks,
      calendars: calendarMemberships,
      completed: task.completed,
      contacts,
      createdAt: task.created_at,
      dependencies,
      dueAt: task.due_at,
      estimatedDurationMinutes: task.estimated_duration_minutes,
      id: task.id,
      lifecycleState: task.lifecycle_state,
      linkedEvents,
      location: task.location,
      notes: task.notes,
      priority: task.priority,
      provenance,
      status: task.status,
      subtasks,
      timezone: task.timezone,
      title: task.title,
      updatedAt: task.updated_at,
      workRelated: task.work_related,
    };
  }

  async listTasks(input: {
    actorId: string;
    deadlinePeriod: 'all' | 'next_30_days' | 'next_7_days' | 'none' | 'overdue';
    nameQuery: string | null;
    priority: TaskPriority | 'all';
    scope: ActiveScope;
    status: TaskStatus | 'all';
  }) {
    await this.ensureScopeAccess(input.scope, input.actorId);
    const visibleCalendars = await this.resolveVisibleCalendars(
      input.scope,
      input.actorId,
    );
    const calendarIds = visibleCalendars.map((calendar) => calendar.id);

    if (calendarIds.length === 0) {
      return [];
    }

    const params: unknown[] = [calendarIds];
    const filters: string[] = [
      `t.lifecycle_state = 'active'`,
      `exists (
         select 1
         from calendar_item_calendar_memberships m
         where m.item_type = 'task'
           and m.item_id = t.id
           and m.calendar_id = any($1::text[])
       )`,
    ];

    if (input.scope.contextType === 'personal') {
      params.push(input.actorId);
      filters.push(
        `t.context_type = 'personal' and t.personal_owner_user_id = $${params.length}`,
      );
    } else {
      params.push(input.scope.organizationId);
      filters.push(
        `t.context_type = 'organization' and t.organization_id = $${params.length}`,
      );
    }

    if (input.nameQuery?.trim()) {
      params.push(`%${input.nameQuery.trim()}%`);
      filters.push(`t.title ilike $${params.length}`);
    }

    if (input.status !== 'all') {
      params.push(input.status);
      filters.push(`t.status = $${params.length}`);
    }

    if (input.priority !== 'all') {
      params.push(input.priority);
      filters.push(`t.priority = $${params.length}`);
    }

    switch (input.deadlinePeriod) {
      case 'none':
        filters.push('t.due_at is null');
        break;
      case 'overdue':
        filters.push(`t.due_at is not null and t.due_at < now()`);
        break;
      case 'next_7_days':
        filters.push(
          `t.due_at is not null and t.due_at >= now() and t.due_at < now() + interval '7 days'`,
        );
        break;
      case 'next_30_days':
        filters.push(
          `t.due_at is not null and t.due_at >= now() and t.due_at < now() + interval '30 days'`,
        );
        break;
      case 'all':
        break;
    }

    const result = await this.databaseService.query<TaskRecord>(
      `select t.*
       from calendar_tasks t
       where ${filters.join(' and ')}
       order by t.due_at asc nulls last, t.updated_at desc`,
      params,
    );

    const entries = await Promise.all(
      result.rows.map(async (row) => {
        const [allocation, subtaskStats, dependencyCount] = await Promise.all([
          this.getTaskAllocation(row.id),
          this.getSubtaskStats(row.id),
          this.getTaskDependencyCount(row.id),
        ]);

        return {
          allocation,
          completed: row.completed,
          dueAt: row.due_at,
          estimatedDurationMinutes: row.estimated_duration_minutes,
          id: row.id,
          priority: row.priority,
          status: row.status,
          subtaskSummary: subtaskStats,
          taskDependencyCount: dependencyCount,
          title: row.title,
          workRelated: row.work_related,
        };
      }),
    );

    return entries;
  }

  async createEvent(input: CreateEventInput) {
    await this.ensureScopeAccess(input.scope, input.actorId);
    const calendarRefs = await this.resolveCalendarRefs(
      input.scope,
      input.actorId,
      input.calendarIds,
    );
    const contactIds = await this.resolveContactIds(
      input.scope,
      input.actorId,
      input.contactIds,
    );

    if (!input.allDay && !input.startAt) {
      throw new BadRequestException('Timed events require startAt.');
    }

    if (input.allDay && (!input.allDayStartDate || !input.allDayEndDate)) {
      throw new BadRequestException(
        'All-day events require allDayStartDate and allDayEndDate.',
      );
    }

    if (input.linkedTaskId) {
      await this.requireTask(input.scope, input.actorId, input.linkedTaskId);
    }

    const eventId = randomUUID();
    const timestamp = nowIso();

    const resolvedTimedValues = !input.allDay
      ? (() => {
          const startAt = new Date(input.startAt!);
          const explicitEnd = input.endAt ? new Date(input.endAt) : null;
          const endAt = resolveEventEnd({
            durationMinutes: input.durationMinutes,
            endAt: explicitEnd,
            startAt,
          });
          if (endAt <= startAt) {
            throw new BadRequestException(
              'Event end must be after event start.',
            );
          }

          return {
            durationMinutes: Math.round(
              (endAt.getTime() - startAt.getTime()) / 60_000,
            ),
            endAt: endAt.toISOString(),
            startAt: startAt.toISOString(),
          };
        })()
      : null;

    await this.databaseService.transaction(async (client) => {
      await client.query(
        `insert into calendar_events (
           id,
           context_type,
           organization_id,
           personal_owner_user_id,
           created_by_user_id,
           lifecycle_state,
           title,
           all_day,
           start_at,
           end_at,
           all_day_start_date,
           all_day_end_date,
           duration_minutes,
           timezone,
           location,
           notes,
           work_related,
           linked_task_id,
           created_at,
           updated_at
         )
         values (
           $1,
           $2,
           $3,
           $4,
           $5,
           'active',
           $6,
           $7,
           $8,
           $9,
           $10,
           $11,
           $12,
           $13,
           $14,
           $15,
           $16,
           $17,
           $18,
           $18
         )`,
        [
          eventId,
          input.scope.contextType,
          input.scope.organizationId,
          input.scope.personalOwnerUserId,
          input.actorId,
          input.title.trim(),
          input.allDay,
          resolvedTimedValues?.startAt ?? null,
          resolvedTimedValues?.endAt ?? null,
          input.allDayStartDate,
          input.allDayEndDate,
          resolvedTimedValues?.durationMinutes ?? null,
          input.timezone,
          input.location,
          input.notes,
          input.workRelated,
          input.linkedTaskId,
          timestamp,
        ],
      );

      for (const calendar of calendarRefs) {
        await client.query(
          `insert into calendar_item_calendar_memberships (
             id,
             item_type,
             item_id,
             context_type,
             organization_id,
             personal_owner_user_id,
             calendar_type,
             calendar_id,
             created_by_user_id,
             created_at
           )
           values ($1, 'event', $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            randomUUID(),
            eventId,
            input.scope.contextType,
            input.scope.organizationId,
            input.scope.personalOwnerUserId,
            calendar.type,
            calendar.id,
            input.actorId,
            timestamp,
          ],
        );
      }

      for (const contactId of contactIds) {
        await client.query(
          `insert into calendar_event_contacts (
             event_id,
             contact_id,
             created_at
           )
           values ($1, $2, $3)`,
          [eventId, contactId, timestamp],
        );
      }
    });

    this.auditService.emit({
      action: 'cal.event.created',
      details: {
        allDay: input.allDay,
        linkedTaskId: input.linkedTaskId,
      },
      targetId: eventId,
      targetType: 'event',
    });

    return this.getEventById({
      actorId: input.actorId,
      eventId,
      scope: input.scope,
    });
  }

  async updateEvent(input: {
    actorId: string;
    eventId: string;
    patch: {
      allDay?: boolean;
      allDayEndDate?: string | null;
      allDayStartDate?: string | null;
      calendarIds?: string[];
      contactIds?: string[];
      durationMinutes?: number | null;
      endAt?: string | null;
      linkedTaskId?: string | null;
      location?: string | null;
      notes?: string | null;
      startAt?: string | null;
      timezone?: string;
      title?: string;
      workRelated?: boolean;
    };
    scope: ActiveScope;
  }) {
    const existing = await this.requireEvent(
      input.scope,
      input.actorId,
      input.eventId,
    );

    const nextAllDay = input.patch.allDay ?? existing.all_day;
    const nextStartAt =
      input.patch.startAt === undefined
        ? existing.start_at
        : input.patch.startAt;
    const nextEndAt =
      input.patch.endAt === undefined ? existing.end_at : input.patch.endAt;
    const nextDuration =
      input.patch.durationMinutes === undefined
        ? existing.duration_minutes
        : input.patch.durationMinutes;
    const nextAllDayStartDate =
      input.patch.allDayStartDate === undefined
        ? existing.all_day_start_date
        : input.patch.allDayStartDate;
    const nextAllDayEndDate =
      input.patch.allDayEndDate === undefined
        ? existing.all_day_end_date
        : input.patch.allDayEndDate;

    if (!nextAllDay && !nextStartAt) {
      throw new BadRequestException('Timed events require startAt.');
    }

    if (nextAllDay && (!nextAllDayStartDate || !nextAllDayEndDate)) {
      throw new BadRequestException(
        'All-day events require allDayStartDate and allDayEndDate.',
      );
    }

    const resolvedTimedValues = !nextAllDay
      ? (() => {
          const startAt = new Date(nextStartAt!);
          const endAt = resolveEventEnd({
            durationMinutes: nextDuration,
            endAt: nextEndAt ? new Date(nextEndAt) : null,
            startAt,
          });
          if (endAt <= startAt) {
            throw new BadRequestException('Event end must be after start.');
          }

          return {
            durationMinutes: Math.round(
              (endAt.getTime() - startAt.getTime()) / 60_000,
            ),
            endAt: endAt.toISOString(),
            startAt: startAt.toISOString(),
          };
        })()
      : null;

    if (input.patch.linkedTaskId) {
      await this.requireTask(
        input.scope,
        input.actorId,
        input.patch.linkedTaskId,
      );
    }

    await this.databaseService.transaction(async (client) => {
      await client.query(
        `update calendar_events
         set title = $2,
             all_day = $3,
             start_at = $4,
             end_at = $5,
             all_day_start_date = $6,
             all_day_end_date = $7,
             duration_minutes = $8,
             timezone = $9,
             location = $10,
             notes = $11,
             work_related = $12,
             linked_task_id = $13,
             updated_at = $14
         where id = $1`,
        [
          input.eventId,
          (input.patch.title ?? existing.title).trim(),
          nextAllDay,
          resolvedTimedValues?.startAt ?? null,
          resolvedTimedValues?.endAt ?? null,
          nextAllDay ? nextAllDayStartDate : null,
          nextAllDay ? nextAllDayEndDate : null,
          resolvedTimedValues?.durationMinutes ?? null,
          input.patch.timezone ?? existing.timezone,
          input.patch.location === undefined
            ? existing.location
            : input.patch.location,
          input.patch.notes === undefined ? existing.notes : input.patch.notes,
          input.patch.workRelated ?? existing.work_related,
          input.patch.linkedTaskId === undefined
            ? existing.linked_task_id
            : input.patch.linkedTaskId,
          nowIso(),
        ],
      );

      if (input.patch.calendarIds) {
        const calendarRefs = await this.resolveCalendarRefs(
          input.scope,
          input.actorId,
          input.patch.calendarIds,
        );
        await client.query(
          `delete from calendar_item_calendar_memberships
           where item_type = 'event'
             and item_id = $1`,
          [input.eventId],
        );

        for (const calendar of calendarRefs) {
          await client.query(
            `insert into calendar_item_calendar_memberships (
               id,
               item_type,
               item_id,
               context_type,
               organization_id,
               personal_owner_user_id,
               calendar_type,
               calendar_id,
               created_by_user_id,
               created_at
             )
             values ($1, 'event', $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              randomUUID(),
              input.eventId,
              input.scope.contextType,
              input.scope.organizationId,
              input.scope.personalOwnerUserId,
              calendar.type,
              calendar.id,
              input.actorId,
              nowIso(),
            ],
          );
        }
      }

      if (input.patch.contactIds) {
        const contactIds = await this.resolveContactIds(
          input.scope,
          input.actorId,
          input.patch.contactIds,
        );
        await client.query(
          `delete from calendar_event_contacts where event_id = $1`,
          [input.eventId],
        );

        for (const contactId of contactIds) {
          await client.query(
            `insert into calendar_event_contacts (
               event_id,
               contact_id,
               created_at
             )
             values ($1, $2, $3)`,
            [input.eventId, contactId, nowIso()],
          );
        }
      }
    });

    this.auditService.emit({
      action: 'cal.event.updated',
      targetId: input.eventId,
      targetType: 'event',
    });

    return this.getEventById({
      actorId: input.actorId,
      eventId: input.eventId,
      scope: input.scope,
    });
  }

  async deleteEvent(input: {
    actorId: string;
    eventId: string;
    scope: ActiveScope;
  }) {
    await this.requireEvent(input.scope, input.actorId, input.eventId);

    await this.databaseService.query(
      `update calendar_events
       set lifecycle_state = 'deleted',
           updated_at = $2
       where id = $1`,
      [input.eventId, nowIso()],
    );

    this.auditService.emit({
      action: 'cal.event.deleted',
      targetId: input.eventId,
      targetType: 'event',
    });

    return { ok: true };
  }

  async getEventById(input: {
    actorId: string;
    eventId: string;
    scope: ActiveScope;
  }) {
    const event = await this.requireEvent(
      input.scope,
      input.actorId,
      input.eventId,
    );
    const [calendars, contacts, provenance, attachments] = await Promise.all([
      this.getItemCalendarMemberships('event', input.eventId),
      this.getEventContacts(input.eventId),
      this.getItemProvenance('event', input.eventId),
      this.getItemAttachments('event', input.eventId),
    ]);

    const allocation = event.linked_task_id
      ? await this.getTaskAllocation(event.linked_task_id)
      : {
          allocatedMinutes: 0,
          estimateMinutes: null,
          overAllocated: false,
          remainingMinutes: null,
        };

    return {
      allDay: event.all_day,
      allDayEndDate: event.all_day_end_date,
      allDayStartDate: event.all_day_start_date,
      allocation,
      attachments,
      calendars,
      contacts,
      createdAt: event.created_at,
      durationMinutes: event.duration_minutes,
      endAt: event.end_at,
      id: event.id,
      lifecycleState: event.lifecycle_state,
      linkedTaskId: event.linked_task_id,
      location: event.location,
      notes: event.notes,
      provenance,
      startAt: event.start_at,
      timezone: event.timezone,
      title: event.title,
      updatedAt: event.updated_at,
      workRelated: event.work_related,
    };
  }

  async listCalendarView(input: {
    actorId: string;
    calendarIds: string[];
    from: string;
    scope: ActiveScope;
    to: string;
  }) {
    await this.ensureScopeAccess(input.scope, input.actorId);
    const visibleCalendars = await this.resolveVisibleCalendars(
      input.scope,
      input.actorId,
    );
    const visibleIds = visibleCalendars.map((calendar) => calendar.id);

    const selectedIds =
      input.calendarIds.length > 0 ? dedupe(input.calendarIds) : visibleIds;
    const invalidSelected = selectedIds.filter(
      (id) => !visibleIds.includes(id),
    );
    if (invalidSelected.length > 0) {
      throw new ForbiddenException(
        'One or more selected calendars are not visible in the active context.',
      );
    }

    if (selectedIds.length === 0) {
      return { entries: [], selectedCalendarIds: [] };
    }

    const eventRows = await this.databaseService.query<
      EventRecord & {
        calendar_ids: string[];
      }
    >(
      `select
         e.*,
         array_agg(distinct m.calendar_id) as calendar_ids
       from calendar_events e
       inner join calendar_item_calendar_memberships m
         on m.item_type = 'event'
         and m.item_id = e.id
       where e.lifecycle_state = 'active'
         and m.calendar_id = any($1::text[])
         and (
           (e.all_day = false and e.start_at < $3::timestamptz and e.end_at >= $2::timestamptz)
           or (
             e.all_day = true
             and daterange(e.all_day_start_date, e.all_day_end_date + 1, '[]')
               && daterange(($2::timestamptz at time zone 'UTC')::date, (($3::timestamptz at time zone 'UTC')::date) + 1, '[]')
           )
         )
         and (
           ($4 = 'personal' and e.context_type = 'personal' and e.personal_owner_user_id = $5)
           or ($4 = 'organization' and e.context_type = 'organization' and e.organization_id = $6)
         )
       group by e.id
       order by coalesce(e.start_at, e.all_day_start_date::timestamptz) asc`,
      [
        selectedIds,
        input.from,
        input.to,
        input.scope.contextType,
        input.actorId,
        input.scope.organizationId,
      ],
    );

    const taskRows = await this.databaseService.query<
      TaskRecord & {
        calendar_ids: string[];
      }
    >(
      `select
         t.*,
         array_agg(distinct m.calendar_id) as calendar_ids
       from calendar_tasks t
       inner join calendar_item_calendar_memberships m
         on m.item_type = 'task'
         and m.item_id = t.id
       where t.lifecycle_state = 'active'
         and t.due_at is not null
         and t.due_at >= $2::timestamptz
         and t.due_at < $3::timestamptz
         and m.calendar_id = any($1::text[])
         and (
           ($4 = 'personal' and t.context_type = 'personal' and t.personal_owner_user_id = $5)
           or ($4 = 'organization' and t.context_type = 'organization' and t.organization_id = $6)
         )
       group by t.id
       order by t.due_at asc`,
      [
        selectedIds,
        input.from,
        input.to,
        input.scope.contextType,
        input.actorId,
        input.scope.organizationId,
      ],
    );

    const entries = [
      ...eventRows.rows.map((event) => ({
        allDay: event.all_day,
        calendarEntryType: event.linked_task_id ? 'linked_work_event' : 'event',
        calendarIds: event.calendar_ids,
        endAt: event.end_at,
        id: event.id,
        itemType: 'event' as const,
        linkedTaskId: event.linked_task_id,
        startAt: event.start_at,
        timezone: event.timezone,
        title: event.title,
      })),
      ...taskRows.rows.map((task) => ({
        calendarEntryType: 'task_due',
        calendarIds: task.calendar_ids,
        dueAt: task.due_at,
        id: task.id,
        itemType: 'task' as const,
        priority: task.priority,
        status: task.status,
        timezone: task.timezone,
        title: task.title,
      })),
    ].sort((left, right) => {
      const leftTime = new Date(
        'startAt' in left
          ? (left.startAt ?? new Date().toISOString())
          : (left.dueAt ?? new Date().toISOString()),
      ).getTime();
      const rightTime = new Date(
        'startAt' in right
          ? (right.startAt ?? new Date().toISOString())
          : (right.dueAt ?? new Date().toISOString()),
      ).getTime();
      return leftTime - rightTime;
    });

    return {
      entries,
      selectedCalendarIds: selectedIds,
    };
  }

  async addAttachment(input: {
    actorId: string;
    fileName: string;
    fileSizeBytes: number;
    itemId: string;
    itemType: 'event' | 'task';
    mimeType: string;
    scope: ActiveScope;
    storageKey: string;
  }) {
    if (input.itemType === 'event') {
      await this.requireEvent(input.scope, input.actorId, input.itemId);
    } else {
      await this.requireTask(input.scope, input.actorId, input.itemId);
    }

    const result = await this.databaseService.query<{ id: string }>(
      `insert into calendar_item_attachments (
         id,
         item_type,
         item_id,
         file_name,
         mime_type,
         file_size_bytes,
         storage_key,
         state,
         created_by_user_id,
         created_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, 'created', $8, $9)
       returning id`,
      [
        randomUUID(),
        input.itemType,
        input.itemId,
        input.fileName,
        input.mimeType,
        input.fileSizeBytes,
        input.storageKey,
        input.actorId,
        nowIso(),
      ],
    );

    return {
      id: result.rows[0].id,
      itemId: input.itemId,
      itemType: input.itemType,
      state: 'created' as const,
    };
  }

  async copyItemToPersonal(input: {
    actorId: string;
    itemId: string;
    itemType: 'event' | 'task';
    personalCalendarIds: string[];
  }) {
    const personalScope: ActiveScope = {
      contextType: 'personal',
      organizationId: null,
      personalOwnerUserId: input.actorId,
    };

    const dedupedCalendarIds = dedupe(input.personalCalendarIds);
    const targetCalendarIds =
      dedupedCalendarIds.length > 0
        ? dedupedCalendarIds
        : [await this.resolveDefaultPersonalCalendarId(input.actorId)];

    const personalCalendarRefs = await this.resolveCalendarRefs(
      personalScope,
      input.actorId,
      targetCalendarIds,
    );

    if (input.itemType === 'event') {
      const source = await this.requireEventVisibleFromAnyOrganization(
        input.actorId,
        input.itemId,
      );
      const copiedId = randomUUID();
      const timestamp = nowIso();

      await this.databaseService.transaction(async (client) => {
        await client.query(
          `insert into calendar_events (
             id,
             context_type,
             organization_id,
             personal_owner_user_id,
             created_by_user_id,
             lifecycle_state,
             title,
             all_day,
             start_at,
             end_at,
             all_day_start_date,
             all_day_end_date,
             duration_minutes,
             timezone,
             location,
             notes,
             work_related,
             linked_task_id,
             created_at,
             updated_at
           )
           values (
             $1,
             'personal',
             null,
             $2,
             $2,
             'active',
             $3,
             $4,
             $5,
             $6,
             $7,
             $8,
             $9,
             $10,
             $11,
             $12,
             $13,
             null,
             $14,
             $14
           )`,
          [
            copiedId,
            input.actorId,
            source.title,
            source.all_day,
            source.start_at,
            source.end_at,
            source.all_day_start_date,
            source.all_day_end_date,
            source.duration_minutes,
            source.timezone,
            source.location,
            source.notes,
            source.work_related,
            timestamp,
          ],
        );

        for (const calendar of personalCalendarRefs) {
          await client.query(
            `insert into calendar_item_calendar_memberships (
               id,
               item_type,
               item_id,
               context_type,
               organization_id,
               personal_owner_user_id,
               calendar_type,
               calendar_id,
               created_by_user_id,
               created_at
             )
             values ($1, 'event', $2, 'personal', null, $3, 'personal', $4, $3, $5)`,
            [randomUUID(), copiedId, input.actorId, calendar.id, timestamp],
          );
        }

        await client.query(
          `insert into calendar_item_copy_provenance (
             id,
             item_type,
             item_id,
             source_context_type,
             source_organization_id,
             source_personal_owner_user_id,
             source_item_id,
             source_item_type,
             copied_at,
             copied_by_user_id
           )
           values ($1, 'event', $2, 'organization', $3, null, $4, 'event', $5, $6)`,
          [
            randomUUID(),
            copiedId,
            source.organization_id,
            source.id,
            timestamp,
            input.actorId,
          ],
        );

        await this.copyEventContacts({
          actorId: input.actorId,
          client,
          sourceEventId: source.id,
          targetEventId: copiedId,
          timestamp,
        });
      });

      return this.getEventById({
        actorId: input.actorId,
        eventId: copiedId,
        scope: personalScope,
      });
    }

    const sourceTask = await this.requireTaskVisibleFromAnyOrganization(
      input.actorId,
      input.itemId,
    );
    const copiedTaskId = randomUUID();
    const timestamp = nowIso();

    await this.databaseService.transaction(async (client) => {
      await client.query(
        `insert into calendar_tasks (
           id,
           context_type,
           organization_id,
           personal_owner_user_id,
           created_by_user_id,
           lifecycle_state,
           title,
           due_at,
           timezone,
           location,
           notes,
           work_related,
           priority,
           status,
           completed,
           estimated_duration_minutes,
           auto_complete_from_subtasks,
           created_at,
           updated_at
         )
         values (
           $1,
           'personal',
           null,
           $2,
           $2,
           'active',
           $3,
           $4,
           $5,
           $6,
           $7,
           $8,
           $9,
           $10,
           $11,
           $12,
           $13,
           $14,
           $14
         )`,
        [
          copiedTaskId,
          input.actorId,
          sourceTask.title,
          sourceTask.due_at,
          sourceTask.timezone,
          sourceTask.location,
          sourceTask.notes,
          sourceTask.work_related,
          sourceTask.priority,
          sourceTask.status,
          sourceTask.completed,
          sourceTask.estimated_duration_minutes,
          sourceTask.auto_complete_from_subtasks,
          timestamp,
        ],
      );

      for (const calendar of personalCalendarRefs) {
        await client.query(
          `insert into calendar_item_calendar_memberships (
             id,
             item_type,
             item_id,
             context_type,
             organization_id,
             personal_owner_user_id,
             calendar_type,
             calendar_id,
             created_by_user_id,
             created_at
           )
           values ($1, 'task', $2, 'personal', null, $3, 'personal', $4, $3, $5)`,
          [randomUUID(), copiedTaskId, input.actorId, calendar.id, timestamp],
        );
      }

      await client.query(
        `insert into calendar_item_copy_provenance (
           id,
           item_type,
           item_id,
           source_context_type,
           source_organization_id,
           source_personal_owner_user_id,
           source_item_id,
           source_item_type,
           copied_at,
           copied_by_user_id
         )
         values ($1, 'task', $2, 'organization', $3, null, $4, 'task', $5, $6)`,
        [
          randomUUID(),
          copiedTaskId,
          sourceTask.organization_id,
          sourceTask.id,
          timestamp,
          input.actorId,
        ],
      );

      await this.copyTaskContacts({
        actorId: input.actorId,
        client,
        sourceTaskId: sourceTask.id,
        targetTaskId: copiedTaskId,
        timestamp,
      });
      await this.copyTaskSubtasks({
        client,
        sourceTaskId: sourceTask.id,
        targetTaskId: copiedTaskId,
        timestamp,
      });
    });

    return this.getTaskById({
      actorId: input.actorId,
      scope: personalScope,
      taskId: copiedTaskId,
    });
  }

  private async copyEventContacts(input: {
    actorId: string;
    client: PoolClient;
    sourceEventId: string;
    targetEventId: string;
    timestamp: string;
  }) {
    const contacts = await input.client.query<{
      email: string | null;
      name: string;
      phone: string | null;
      provider_code: string;
      provider_contact_id: string;
    }>(
      `select
         c.display_name as name,
         c.provider_code,
         c.provider_contact_id,
         c.email,
         c.phone
       from calendar_event_contacts ec
       inner join imported_contacts c
         on c.id = ec.contact_id
       where ec.event_id = $1`,
      [input.sourceEventId],
    );

    for (const contact of contacts.rows) {
      const personalContactId = await this.ensurePersonalContactCopy({
        actorId: input.actorId,
        client: input.client,
        source: contact,
        timestamp: input.timestamp,
      });

      await input.client.query(
        `insert into calendar_event_contacts (event_id, contact_id)
         values ($1, $2)
         on conflict do nothing`,
        [input.targetEventId, personalContactId],
      );
    }
  }

  private async copyTaskContacts(input: {
    actorId: string;
    client: PoolClient;
    sourceTaskId: string;
    targetTaskId: string;
    timestamp: string;
  }) {
    const contacts = await input.client.query<{
      email: string | null;
      name: string;
      phone: string | null;
      provider_code: string;
      provider_contact_id: string;
    }>(
      `select
         c.display_name as name,
         c.provider_code,
         c.provider_contact_id,
         c.email,
         c.phone
       from calendar_task_contacts tc
       inner join imported_contacts c
         on c.id = tc.contact_id
       where tc.task_id = $1`,
      [input.sourceTaskId],
    );

    for (const contact of contacts.rows) {
      const personalContactId = await this.ensurePersonalContactCopy({
        actorId: input.actorId,
        client: input.client,
        source: contact,
        timestamp: input.timestamp,
      });

      await input.client.query(
        `insert into calendar_task_contacts (task_id, contact_id)
         values ($1, $2)
         on conflict do nothing`,
        [input.targetTaskId, personalContactId],
      );
    }
  }

  private async copyTaskSubtasks(input: {
    client: PoolClient;
    sourceTaskId: string;
    targetTaskId: string;
    timestamp: string;
  }) {
    const subtasks = await input.client.query<{
      completed: boolean;
      title: string;
    }>(
      `select title, completed
       from calendar_task_subtasks
       where task_id = $1
       order by created_at asc, id asc`,
      [input.sourceTaskId],
    );

    for (const subtask of subtasks.rows) {
      await input.client.query(
        `insert into calendar_task_subtasks (
           id,
           task_id,
           title,
           completed,
           created_at
         )
         values ($1, $2, $3, $4, $5)`,
        [
          randomUUID(),
          input.targetTaskId,
          subtask.title,
          subtask.completed,
          input.timestamp,
        ],
      );
    }
  }

  private async ensurePersonalContactCopy(input: {
    actorId: string;
    client: PoolClient;
    source: {
      email: string | null;
      name: string;
      phone: string | null;
      provider_code: string;
      provider_contact_id: string;
    };
    timestamp: string;
  }) {
    const existing = await input.client.query<{ id: string }>(
      `select id
       from imported_contacts
       where personal_owner_user_id = $1
         and provider_code = $2
         and provider_contact_id = $3
       limit 1`,
      [
        input.actorId,
        input.source.provider_code,
        input.source.provider_contact_id,
      ],
    );

    const existingId = existing.rows[0]?.id;
    if (existingId) {
      return existingId;
    }

    const copiedId = randomUUID();
    await input.client.query(
      `insert into imported_contacts (
         id,
         context_type,
         organization_id,
         personal_owner_user_id,
         created_by_user_id,
         provider_code,
         provider_contact_id,
         display_name,
         email,
         phone,
         created_at,
         updated_at
       )
       values (
         $1,
         'personal',
         null,
         $2,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7,
         $8,
         $8
       )`,
      [
        copiedId,
        input.actorId,
        input.source.provider_code,
        input.source.provider_contact_id,
        input.source.name,
        input.source.email,
        input.source.phone,
        input.timestamp,
      ],
    );

    return copiedId;
  }

  private async resolveDefaultPersonalCalendarId(actorId: string) {
    await this.ensureDefaultPersonalCalendar(actorId);

    const result = await this.databaseService.query<{ id: string }>(
      `select id
       from personal_calendars
       where owner_user_id = $1
       order by created_at asc, id asc
       limit 1`,
      [actorId],
    );

    const calendarId = result.rows[0]?.id;
    if (!calendarId) {
      throw new BadRequestException(
        'No personal calendar is available for copy target.',
      );
    }

    return calendarId;
  }

  private async ensureScopeAccess(scope: ActiveScope, actorId: string) {
    if (scope.contextType === 'organization') {
      await this.orgService.resolveOrganizationContextForActor({
        actorId,
        organizationId: scope.organizationId!,
      });
      return;
    }

    if (scope.personalOwnerUserId !== actorId) {
      throw new ForbiddenException('Personal context owner mismatch.');
    }
  }

  private async ensureDefaultPersonalCalendar(actorId: string) {
    const existing = await this.databaseService.query<{ id: string }>(
      `select id
       from personal_calendars
       where owner_user_id = $1
       limit 1`,
      [actorId],
    );

    if (existing.rows[0]) {
      return;
    }

    const timestamp = nowIso();
    await this.databaseService.query(
      `insert into personal_calendars (
         id,
         owner_user_id,
         name,
         created_by_user_id,
         created_at,
         updated_at
       )
       values ($1, $2, $3, $4, $5, $5)`,
      [randomUUID(), actorId, 'Personal', actorId, timestamp],
    );
  }

  private async resolveVisibleCalendars(
    scope: ActiveScope,
    actorId: string,
  ): Promise<CalendarDescriptor[]> {
    await this.ensureScopeAccess(scope, actorId);

    if (scope.contextType === 'organization') {
      const calendars = await this.orgService.listVisibleOrganizationCalendars({
        actorId,
        organizationId: scope.organizationId!,
      });

      return calendars.map((calendar) => ({
        id: calendar.id,
        name: calendar.name,
        ownerUserId: calendar.ownerUserId,
        type: 'organization' as const,
      }));
    }

    await this.ensureDefaultPersonalCalendar(actorId);
    const result = await this.databaseService.query<{
      id: string;
      name: string;
      owner_user_id: string;
    }>(
      `select id, name, owner_user_id
       from personal_calendars
       where owner_user_id = $1
       order by name asc`,
      [actorId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      ownerUserId: row.owner_user_id,
      type: 'personal' as const,
    }));
  }

  private async resolveCalendarRefs(
    scope: ActiveScope,
    actorId: string,
    calendarIds: string[],
  ) {
    const ids = dedupe(calendarIds);
    if (ids.length === 0) {
      throw new BadRequestException('At least one calendar is required.');
    }

    const visible = await this.resolveVisibleCalendars(scope, actorId);
    const visibleMap = new Map(
      visible.map((calendar) => [calendar.id, calendar]),
    );
    const missing = ids.filter((id) => !visibleMap.has(id));
    if (missing.length > 0) {
      throw new ForbiddenException(
        'One or more target calendars are not visible in the current context.',
      );
    }

    return ids.map((id) => ({ id, type: visibleMap.get(id)!.type }));
  }

  private async resolveContactIds(
    scope: ActiveScope,
    actorId: string,
    contactIds: string[],
  ) {
    const ids = dedupe(contactIds);
    if (ids.length === 0) {
      return [];
    }

    await this.ensureScopeAccess(scope, actorId);

    const result = await this.databaseService.query<{ id: string }>(
      `select id
       from imported_contacts
       where id = any($1::text[])
         and (
           ($2 = 'personal' and context_type = 'personal' and personal_owner_user_id = $3)
           or ($2 = 'organization' and context_type = 'organization' and organization_id = $4)
         )`,
      [ids, scope.contextType, actorId, scope.organizationId],
    );

    if (result.rows.length !== ids.length) {
      throw new ForbiddenException(
        'One or more contacts are not available in this context.',
      );
    }

    return ids;
  }

  private async getTaskAllocation(taskId: string) {
    const result = await this.databaseService.query<{
      allocated_minutes: string;
      estimate_minutes: number | null;
    }>(
      `select
         coalesce(sum(coalesce(duration_minutes, 0)), 0)::text as allocated_minutes,
         max(t.estimated_duration_minutes) as estimate_minutes
       from calendar_events e
       left join calendar_tasks t
         on t.id = e.linked_task_id
       where e.lifecycle_state = 'active'
         and e.linked_task_id = $1`,
      [taskId],
    );

    const row = result.rows[0];
    const allocatedMinutes = Number(row?.allocated_minutes ?? 0);
    return summarizeAllocation({
      allocatedMinutes,
      estimateMinutes: row?.estimate_minutes ?? null,
    });
  }

  private async getTaskSubtasks(taskId: string) {
    const result = await this.databaseService.query<{
      completed: boolean;
      id: string;
      title: string;
    }>(
      `select id, title, completed
       from calendar_task_subtasks
       where task_id = $1
       order by created_at asc`,
      [taskId],
    );

    return result.rows;
  }

  private async getSubtaskStats(taskId: string) {
    const result = await this.databaseService.query<{
      completed_count: string;
      total_count: string;
    }>(
      `select
         count(*)::text as total_count,
         count(*) filter (where completed = true)::text as completed_count
       from calendar_task_subtasks
       where task_id = $1`,
      [taskId],
    );

    const row = result.rows[0];
    return {
      completed: Number(row?.completed_count ?? 0),
      total: Number(row?.total_count ?? 0),
    };
  }

  private async getTaskDependencies(taskId: string) {
    const result = await this.databaseService.query<{
      depends_on_task_id: string;
    }>(
      `select depends_on_task_id
       from calendar_task_dependencies
       where task_id = $1`,
      [taskId],
    );

    return result.rows.map((row) => row.depends_on_task_id);
  }

  private async getTaskDependencyCount(taskId: string) {
    const result = await this.databaseService.query<{
      dependency_count: string;
    }>(
      `select count(*)::text as dependency_count
       from calendar_task_dependencies
       where task_id = $1`,
      [taskId],
    );

    return Number(result.rows[0]?.dependency_count ?? 0);
  }

  private async getLinkedEvents(
    scope: ActiveScope,
    actorId: string,
    taskId: string,
  ) {
    const visibleCalendars = await this.resolveVisibleCalendars(scope, actorId);
    const calendarIds = visibleCalendars.map((calendar) => calendar.id);
    if (calendarIds.length === 0) {
      return [];
    }

    const result = await this.databaseService.query<{
      end_at: string | null;
      id: string;
      start_at: string | null;
      title: string;
    }>(
      `select distinct e.id, e.title, e.start_at, e.end_at
       from calendar_events e
       inner join calendar_item_calendar_memberships m
         on m.item_type = 'event'
         and m.item_id = e.id
       where e.lifecycle_state = 'active'
         and e.linked_task_id = $1
         and m.calendar_id = any($2::text[])
       order by e.start_at asc nulls last`,
      [taskId, calendarIds],
    );

    return result.rows.map((row) => ({
      endAt: row.end_at,
      id: row.id,
      startAt: row.start_at,
      title: row.title,
    }));
  }

  private async getTaskContacts(taskId: string) {
    const result = await this.databaseService.query<{
      contact_id: string;
      display_name: string;
      email: string | null;
      phone: string | null;
      provider_code: string;
    }>(
      `select
         c.id as contact_id,
         c.provider_code,
         c.display_name,
         c.email,
         c.phone
       from calendar_task_contacts tc
       inner join imported_contacts c
         on c.id = tc.contact_id
       where tc.task_id = $1
       order by c.display_name asc`,
      [taskId],
    );

    return result.rows.map((row) => ({
      displayName: row.display_name,
      email: row.email,
      id: row.contact_id,
      phone: row.phone,
      providerCode: row.provider_code,
    }));
  }

  private async getEventContacts(eventId: string) {
    const result = await this.databaseService.query<{
      contact_id: string;
      display_name: string;
      email: string | null;
      phone: string | null;
      provider_code: string;
    }>(
      `select
         c.id as contact_id,
         c.provider_code,
         c.display_name,
         c.email,
         c.phone
       from calendar_event_contacts ec
       inner join imported_contacts c
         on c.id = ec.contact_id
       where ec.event_id = $1
       order by c.display_name asc`,
      [eventId],
    );

    return result.rows.map((row) => ({
      displayName: row.display_name,
      email: row.email,
      id: row.contact_id,
      phone: row.phone,
      providerCode: row.provider_code,
    }));
  }

  private async getItemCalendarMemberships(
    itemType: 'event' | 'task',
    itemId: string,
  ) {
    const result = await this.databaseService.query<{
      calendar_id: string;
      calendar_type: 'organization' | 'personal';
      name: string;
    }>(
      `select
         m.calendar_id,
         m.calendar_type,
         case
           when m.calendar_type = 'organization' then oc.name
           else pc.name
         end as name
       from calendar_item_calendar_memberships m
       left join organization_calendars oc
         on m.calendar_type = 'organization'
         and oc.id = m.calendar_id
       left join personal_calendars pc
         on m.calendar_type = 'personal'
         and pc.id = m.calendar_id
       where m.item_type = $1
         and m.item_id = $2
       order by name asc`,
      [itemType, itemId],
    );

    return result.rows.map((row) => ({
      calendarId: row.calendar_id,
      calendarName: row.name,
      calendarType: row.calendar_type,
    }));
  }

  private async getItemProvenance(itemType: 'event' | 'task', itemId: string) {
    const result = await this.databaseService.query<{
      copied_at: string;
      source_context_type: 'organization' | 'personal';
      source_item_id: string;
      source_item_type: 'event' | 'task';
      source_organization_id: string | null;
      source_personal_owner_user_id: string | null;
    }>(
      `select
         source_context_type,
         source_organization_id,
         source_personal_owner_user_id,
         source_item_id,
         source_item_type,
         copied_at
       from calendar_item_copy_provenance
       where item_type = $1
         and item_id = $2
       limit 1`,
      [itemType, itemId],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      copiedAt: row.copied_at,
      sourceContextType: row.source_context_type,
      sourceItemId: row.source_item_id,
      sourceItemType: row.source_item_type,
      sourceOrganizationId: row.source_organization_id,
      sourcePersonalOwnerUserId: row.source_personal_owner_user_id,
    };
  }

  private async getItemAttachments(itemType: 'event' | 'task', itemId: string) {
    const result = await this.databaseService.query<{
      file_name: string;
      file_size_bytes: string;
      id: string;
      mime_type: string;
      state: 'created' | 'quarantined' | 'ready' | 'rejected';
      storage_key: string;
    }>(
      `select id, file_name, mime_type, file_size_bytes::text, storage_key, state
       from calendar_item_attachments
       where item_type = $1
         and item_id = $2
       order by created_at desc`,
      [itemType, itemId],
    );

    return result.rows.map((row) => ({
      fileName: row.file_name,
      fileSizeBytes: Number(row.file_size_bytes),
      id: row.id,
      mimeType: row.mime_type,
      state: row.state,
      storageKey: row.storage_key,
    }));
  }

  private async refreshTaskAutoCompletion(taskId: string) {
    const task = await this.databaseService.query<{
      auto_complete_from_subtasks: boolean;
      status: TaskStatus;
    }>(
      `select auto_complete_from_subtasks, status
       from calendar_tasks
       where id = $1`,
      [taskId],
    );

    const record = task.rows[0];
    if (!record?.auto_complete_from_subtasks) {
      return;
    }

    const stats = await this.getSubtaskStats(taskId);
    if (stats.total <= 0 || stats.completed !== stats.total) {
      return;
    }

    if (record.status === 'completed') {
      return;
    }

    await this.databaseService.query(
      `update calendar_tasks
       set status = 'completed',
           completed = true,
           updated_at = $2
       where id = $1`,
      [taskId, nowIso()],
    );
  }

  private async assertDependencyTasksInScope(
    scope: ActiveScope,
    actorId: string,
    dependencyTaskIds: string[],
  ) {
    const ids = dedupe(dependencyTaskIds);
    if (ids.length === 0) {
      return;
    }

    const visibleCalendars = await this.resolveVisibleCalendars(scope, actorId);
    const visibleCalendarIds = visibleCalendars.map((calendar) => calendar.id);
    const result = await this.databaseService.query<{ id: string }>(
      `select distinct t.id
       from calendar_tasks t
       inner join calendar_item_calendar_memberships m
         on m.item_type = 'task'
         and m.item_id = t.id
       where t.id = any($1::text[])
         and t.lifecycle_state = 'active'
         and m.calendar_id = any($2::text[])
         and (
           ($3 = 'personal' and t.context_type = 'personal' and t.personal_owner_user_id = $4)
           or ($3 = 'organization' and t.context_type = 'organization' and t.organization_id = $5)
         )`,
      [
        ids,
        visibleCalendarIds,
        scope.contextType,
        actorId,
        scope.organizationId,
      ],
    );

    if (result.rows.length !== ids.length) {
      throw new ForbiddenException(
        'Dependencies must reference accessible tasks in the same context.',
      );
    }
  }

  private async requireTask(
    scope: ActiveScope,
    actorId: string,
    taskId: string,
  ) {
    await this.ensureScopeAccess(scope, actorId);
    const visibleCalendars = await this.resolveVisibleCalendars(scope, actorId);
    const visibleIds = visibleCalendars.map((calendar) => calendar.id);

    const result = await this.databaseService.query<TaskRecord>(
      `select t.*
       from calendar_tasks t
       where t.id = $1
         and t.lifecycle_state = 'active'
         and (
           ($2 = 'personal' and t.context_type = 'personal' and t.personal_owner_user_id = $3)
           or ($2 = 'organization' and t.context_type = 'organization' and t.organization_id = $4)
         )
         and exists (
           select 1
           from calendar_item_calendar_memberships m
           where m.item_type = 'task'
             and m.item_id = t.id
             and m.calendar_id = any($5::text[])
         )`,
      [taskId, scope.contextType, actorId, scope.organizationId, visibleIds],
    );

    const task = result.rows[0];
    if (!task) {
      throw new NotFoundException('Task not found in the active context.');
    }

    return task;
  }

  private async requireEvent(
    scope: ActiveScope,
    actorId: string,
    eventId: string,
  ) {
    await this.ensureScopeAccess(scope, actorId);
    const visibleCalendars = await this.resolveVisibleCalendars(scope, actorId);
    const visibleIds = visibleCalendars.map((calendar) => calendar.id);

    const result = await this.databaseService.query<EventRecord>(
      `select e.*
       from calendar_events e
       where e.id = $1
         and e.lifecycle_state = 'active'
         and (
           ($2 = 'personal' and e.context_type = 'personal' and e.personal_owner_user_id = $3)
           or ($2 = 'organization' and e.context_type = 'organization' and e.organization_id = $4)
         )
         and exists (
           select 1
           from calendar_item_calendar_memberships m
           where m.item_type = 'event'
             and m.item_id = e.id
             and m.calendar_id = any($5::text[])
         )`,
      [eventId, scope.contextType, actorId, scope.organizationId, visibleIds],
    );

    const event = result.rows[0];
    if (!event) {
      throw new NotFoundException('Event not found in the active context.');
    }

    return event;
  }

  private async requireEventVisibleFromAnyOrganization(
    actorId: string,
    eventId: string,
  ) {
    const event = await this.databaseService.query<EventRecord>(
      `select *
       from calendar_events
       where id = $1
         and lifecycle_state = 'active'
         and context_type = 'organization'`,
      [eventId],
    );

    const row = event.rows[0];
    if (!row) {
      throw new NotFoundException('Organization event not found.');
    }

    const visible = await this.orgService.listVisibleOrganizationCalendars({
      actorId,
      organizationId: row.organization_id!,
    });

    if (visible.length === 0) {
      throw new ForbiddenException(
        'The source event is not visible to the current actor.',
      );
    }

    const visibleIds = visible.map((calendar) => calendar.id);
    const membership = await this.databaseService.query<{ exists: boolean }>(
      `select exists (
         select 1
         from calendar_item_calendar_memberships
         where item_type = 'event'
           and item_id = $1
           and calendar_id = any($2::text[])
       ) as exists`,
      [eventId, visibleIds],
    );

    if (!membership.rows[0]?.exists) {
      throw new ForbiddenException(
        'The source event is not visible to the current actor.',
      );
    }

    return row;
  }

  private async requireTaskVisibleFromAnyOrganization(
    actorId: string,
    taskId: string,
  ) {
    const task = await this.databaseService.query<TaskRecord>(
      `select *
       from calendar_tasks
       where id = $1
         and lifecycle_state = 'active'
         and context_type = 'organization'`,
      [taskId],
    );

    const row = task.rows[0];
    if (!row) {
      throw new NotFoundException('Organization task not found.');
    }

    const visible = await this.orgService.listVisibleOrganizationCalendars({
      actorId,
      organizationId: row.organization_id!,
    });

    if (visible.length === 0) {
      throw new ForbiddenException(
        'The source task is not visible to the current actor.',
      );
    }

    const visibleIds = visible.map((calendar) => calendar.id);
    const membership = await this.databaseService.query<{ exists: boolean }>(
      `select exists (
         select 1
         from calendar_item_calendar_memberships
         where item_type = 'task'
           and item_id = $1
           and calendar_id = any($2::text[])
       ) as exists`,
      [taskId, visibleIds],
    );

    if (!membership.rows[0]?.exists) {
      throw new ForbiddenException(
        'The source task is not visible to the current actor.',
      );
    }

    return row;
  }
}
