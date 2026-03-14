import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import type { ApiRequest } from '../security/request-context.types';
import { SecurityPolicy } from '../security/security-policy.decorator';
import { CalService } from './cal.service';

class CreatePersonalCalendarDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;
}

class ListCalendarViewQuery {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value == null) {
      return undefined;
    }

    const values = Array.isArray(value) ? value : [value];
    return values.filter((entry): entry is string => typeof entry === 'string');
  })
  @IsArray()
  @IsString({ each: true })
  calendarIds?: string[];
}

class CreateImportedContactDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName!: string;

  @IsString()
  @MinLength(2)
  providerCode!: string;

  @IsString()
  @MinLength(2)
  providerContactId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string;
}

class CreateTaskDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  calendarIds!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contactIds?: string[];

  @IsString()
  @MinLength(2)
  @MaxLength(140)
  title!: string;

  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  workRelated?: boolean;

  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'urgent'])
  priority?: 'low' | 'medium' | 'high' | 'urgent';

  @IsOptional()
  @IsIn(['todo', 'in_progress', 'blocked', 'completed'])
  status?: 'todo' | 'in_progress' | 'blocked' | 'completed';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  estimatedDurationMinutes?: number;

  @IsOptional()
  @IsBoolean()
  autoCompleteFromSubtasks?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependencyTaskIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  subtasks?: Array<{
    title: string;
    completed?: boolean;
  }>;
}

class UpdateTaskDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  calendarIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contactIds?: string[];

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  title?: string;

  @IsOptional()
  @IsISO8601()
  dueAt?: string | null;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  location?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  workRelated?: boolean;

  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'urgent'])
  priority?: 'low' | 'medium' | 'high' | 'urgent';

  @IsOptional()
  @IsIn(['todo', 'in_progress', 'blocked', 'completed'])
  status?: 'todo' | 'in_progress' | 'blocked' | 'completed';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  estimatedDurationMinutes?: number | null;

  @IsOptional()
  @IsBoolean()
  autoCompleteFromSubtasks?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependencyTaskIds?: string[];

  @IsOptional()
  @IsArray()
  subtasks?: Array<{
    title: string;
    completed?: boolean;
  }>;
}

class ListTasksQuery {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['all', 'none', 'overdue', 'next_7_days', 'next_30_days'])
  deadlinePeriod?: 'all' | 'none' | 'overdue' | 'next_7_days' | 'next_30_days';

  @IsOptional()
  @IsIn(['all', 'todo', 'in_progress', 'blocked', 'completed'])
  status?: 'all' | 'todo' | 'in_progress' | 'blocked' | 'completed';

  @IsOptional()
  @IsIn(['all', 'low', 'medium', 'high', 'urgent'])
  priority?: 'all' | 'low' | 'medium' | 'high' | 'urgent';
}

class CreateEventDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  calendarIds!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contactIds?: string[];

  @IsString()
  @MinLength(2)
  @MaxLength(140)
  title!: string;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @IsOptional()
  @IsISO8601()
  startAt?: string;

  @IsOptional()
  @IsISO8601()
  endAt?: string;

  @IsOptional()
  @IsString()
  allDayStartDate?: string;

  @IsOptional()
  @IsString()
  allDayEndDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  workRelated?: boolean;

  @IsOptional()
  @IsString()
  linkedTaskId?: string;
}

class UpdateEventDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  calendarIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contactIds?: string[];

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  title?: string;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @IsOptional()
  @IsISO8601()
  startAt?: string | null;

  @IsOptional()
  @IsISO8601()
  endAt?: string | null;

  @IsOptional()
  @IsString()
  allDayStartDate?: string | null;

  @IsOptional()
  @IsString()
  allDayEndDate?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  durationMinutes?: number | null;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  location?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  workRelated?: boolean;

  @IsOptional()
  @IsString()
  linkedTaskId?: string | null;
}

class AddAttachmentDto {
  @IsString()
  @MinLength(1)
  fileName!: string;

  @IsString()
  @MinLength(1)
  mimeType!: string;

  @IsInt()
  @Min(0)
  fileSizeBytes!: number;

  @IsString()
  @MinLength(3)
  storageKey!: string;
}

class CopyToPersonalDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  calendarIds?: string[];
}

@Controller('cal')
export class CalController {
  constructor(private readonly calService: CalService) {}

  private getScope(request: ApiRequest) {
    return this.calService.getScope({
      actorId: request.requestContext!.actor.id!,
      contextId: request.requestContext!.context.id!,
      contextType: request.requestContext!.context.type,
    });
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  @Get('calendars')
  async listCalendars(@Req() request: ApiRequest) {
    return {
      calendars: await this.calService.listCalendars({
        actorId: request.requestContext!.actor.id!,
        scope: this.getScope(request),
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['personal'],
    requireContextId: true,
  })
  @Post('calendars')
  async createPersonalCalendar(
    @Req() request: ApiRequest,
    @Body() body: CreatePersonalCalendarDto,
  ) {
    return {
      calendar: await this.calService.createPersonalCalendar({
        actorId: request.requestContext!.actor.id!,
        name: body.name,
        scope: this.getScope(request),
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  @Get('contacts/imported')
  async listImportedContacts(
    @Req() request: ApiRequest,
    @Query('query') query: string | undefined,
  ) {
    return {
      contacts: await this.calService.listImportedContacts({
        actorId: request.requestContext!.actor.id!,
        query: query ?? null,
        scope: this.getScope(request),
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  @Post('contacts/imported')
  async createImportedContact(
    @Req() request: ApiRequest,
    @Body() body: CreateImportedContactDto,
  ) {
    return {
      contact: await this.calService.createImportedContact({
        actorId: request.requestContext!.actor.id!,
        displayName: body.displayName,
        email: body.email ?? null,
        phone: body.phone ?? null,
        providerCode: body.providerCode,
        providerContactId: body.providerContactId,
        scope: this.getScope(request),
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  @Get('calendar-view')
  async listCalendarView(
    @Req() request: ApiRequest,
    @Query() query: ListCalendarViewQuery,
  ) {
    return {
      view: await this.calService.listCalendarView({
        actorId: request.requestContext!.actor.id!,
        calendarIds: query.calendarIds ?? [],
        from: query.from,
        scope: this.getScope(request),
        to: query.to,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  @Get('tasks')
  async listTasks(@Req() request: ApiRequest, @Query() query: ListTasksQuery) {
    return {
      tasks: await this.calService.listTasks({
        actorId: request.requestContext!.actor.id!,
        deadlinePeriod: query.deadlinePeriod ?? 'all',
        nameQuery: query.name?.trim() ? query.name : null,
        priority: query.priority ?? 'all',
        scope: this.getScope(request),
        status: query.status ?? 'all',
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  @Post('tasks')
  async createTask(@Req() request: ApiRequest, @Body() body: CreateTaskDto) {
    return {
      task: await this.calService.createTask({
        actorId: request.requestContext!.actor.id!,
        autoCompleteFromSubtasks: body.autoCompleteFromSubtasks ?? false,
        calendarIds: body.calendarIds,
        contactIds: body.contactIds ?? [],
        dependencyTaskIds: body.dependencyTaskIds ?? [],
        dueAt: body.dueAt ?? null,
        estimatedDurationMinutes: body.estimatedDurationMinutes ?? null,
        location: body.location ?? null,
        notes: body.notes ?? null,
        priority: body.priority ?? 'medium',
        scope: this.getScope(request),
        status: body.status ?? 'todo',
        subtasks:
          body.subtasks?.map((subtask) => ({
            completed: subtask.completed ?? false,
            title: subtask.title,
          })) ?? [],
        timezone: body.timezone ?? 'UTC',
        title: body.title,
        workRelated: body.workRelated ?? false,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  @Get('tasks/:taskId')
  async getTaskById(
    @Req() request: ApiRequest,
    @Param('taskId') taskId: string,
  ) {
    return {
      task: await this.calService.getTaskById({
        actorId: request.requestContext!.actor.id!,
        scope: this.getScope(request),
        taskId,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  @Patch('tasks/:taskId')
  async updateTask(
    @Req() request: ApiRequest,
    @Param('taskId') taskId: string,
    @Body() body: UpdateTaskDto,
  ) {
    return {
      task: await this.calService.updateTask({
        actorId: request.requestContext!.actor.id!,
        patch: {
          autoCompleteFromSubtasks: body.autoCompleteFromSubtasks,
          calendarIds: body.calendarIds,
          contactIds: body.contactIds,
          dependencyTaskIds: body.dependencyTaskIds,
          dueAt: body.dueAt,
          estimatedDurationMinutes: body.estimatedDurationMinutes,
          location: body.location,
          notes: body.notes,
          priority: body.priority,
          status: body.status,
          subtasks: body.subtasks?.map((subtask) => ({
            completed: subtask.completed ?? false,
            title: subtask.title,
          })),
          timezone: body.timezone,
          title: body.title,
          workRelated: body.workRelated,
        },
        scope: this.getScope(request),
        taskId,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  @Delete('tasks/:taskId')
  async deleteTask(
    @Req() request: ApiRequest,
    @Param('taskId') taskId: string,
  ) {
    return {
      result: await this.calService.deleteTask({
        actorId: request.requestContext!.actor.id!,
        scope: this.getScope(request),
        taskId,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  @Post('events')
  async createEvent(@Req() request: ApiRequest, @Body() body: CreateEventDto) {
    return {
      event: await this.calService.createEvent({
        actorId: request.requestContext!.actor.id!,
        allDay: body.allDay ?? false,
        allDayEndDate: body.allDayEndDate ?? null,
        allDayStartDate: body.allDayStartDate ?? null,
        calendarIds: body.calendarIds,
        contactIds: body.contactIds ?? [],
        durationMinutes: body.durationMinutes ?? null,
        endAt: body.endAt ?? null,
        linkedTaskId: body.linkedTaskId ?? null,
        location: body.location ?? null,
        notes: body.notes ?? null,
        scope: this.getScope(request),
        startAt: body.startAt ?? null,
        timezone: body.timezone ?? 'UTC',
        title: body.title,
        workRelated: body.workRelated ?? false,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  @Get('events/:eventId')
  async getEventById(
    @Req() request: ApiRequest,
    @Param('eventId') eventId: string,
  ) {
    return {
      event: await this.calService.getEventById({
        actorId: request.requestContext!.actor.id!,
        eventId,
        scope: this.getScope(request),
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  @Patch('events/:eventId')
  async updateEvent(
    @Req() request: ApiRequest,
    @Param('eventId') eventId: string,
    @Body() body: UpdateEventDto,
  ) {
    return {
      event: await this.calService.updateEvent({
        actorId: request.requestContext!.actor.id!,
        eventId,
        patch: {
          allDay: body.allDay,
          allDayEndDate: body.allDayEndDate,
          allDayStartDate: body.allDayStartDate,
          calendarIds: body.calendarIds,
          contactIds: body.contactIds,
          durationMinutes: body.durationMinutes,
          endAt: body.endAt,
          linkedTaskId: body.linkedTaskId,
          location: body.location,
          notes: body.notes,
          startAt: body.startAt,
          timezone: body.timezone,
          title: body.title,
          workRelated: body.workRelated,
        },
        scope: this.getScope(request),
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  @Delete('events/:eventId')
  async deleteEvent(
    @Req() request: ApiRequest,
    @Param('eventId') eventId: string,
  ) {
    return {
      result: await this.calService.deleteEvent({
        actorId: request.requestContext!.actor.id!,
        eventId,
        scope: this.getScope(request),
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  @Post('events/:eventId/attachments')
  async addEventAttachment(
    @Req() request: ApiRequest,
    @Param('eventId') eventId: string,
    @Body() body: AddAttachmentDto,
  ) {
    return {
      attachment: await this.calService.addAttachment({
        actorId: request.requestContext!.actor.id!,
        fileName: body.fileName,
        fileSizeBytes: body.fileSizeBytes,
        itemId: eventId,
        itemType: 'event',
        mimeType: body.mimeType,
        scope: this.getScope(request),
        storageKey: body.storageKey,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  @Post('tasks/:taskId/attachments')
  async addTaskAttachment(
    @Req() request: ApiRequest,
    @Param('taskId') taskId: string,
    @Body() body: AddAttachmentDto,
  ) {
    return {
      attachment: await this.calService.addAttachment({
        actorId: request.requestContext!.actor.id!,
        fileName: body.fileName,
        fileSizeBytes: body.fileSizeBytes,
        itemId: taskId,
        itemType: 'task',
        mimeType: body.mimeType,
        scope: this.getScope(request),
        storageKey: body.storageKey,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  @Post('items/:itemType/:itemId/copy-to-personal')
  async copyToPersonal(
    @Req() request: ApiRequest,
    @Param('itemType') itemType: 'event' | 'task',
    @Param('itemId') itemId: string,
    @Body() body: CopyToPersonalDto,
  ) {
    if (itemType !== 'event' && itemType !== 'task') {
      throw new BadRequestException('Unsupported item type.');
    }

    return {
      item: await this.calService.copyItemToPersonal({
        actorId: request.requestContext!.actor.id!,
        itemId,
        itemType,
        personalCalendarIds: body.calendarIds ?? [],
      }),
    };
  }
}
