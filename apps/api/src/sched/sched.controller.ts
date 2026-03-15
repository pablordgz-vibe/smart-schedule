import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { randomUUID } from 'node:crypto';
import type {
  ScheduleDefinition,
  ScheduleItemDefinition,
  ScheduleVersionDefinition,
} from '../../../../packages/domain-sched/src';
import type { ApiRequest } from '../security/request-context.types';
import { SecurityPolicy } from '../security/security-policy.decorator';
import { SchedService } from './sched.service';

class SchedulePauseWindowDto {
  @IsISO8601({ strict: true }, { message: 'startDate must be a date token.' })
  startDate!: string;

  @IsISO8601({ strict: true }, { message: 'endDate must be a date token.' })
  endDate!: string;
}

class ScheduleRecurrenceDto {
  @IsIn(['daily', 'weekly', 'monthly'])
  frequency!: 'daily' | 'monthly' | 'weekly';

  @IsInt()
  @Min(1)
  @Max(52)
  interval!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  count?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number | null;

  @IsArray()
  @IsInt({ each: true })
  weekdays!: number[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SchedulePauseWindowDto)
  pauses!: SchedulePauseWindowDto[];
}

class ScheduleItemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsIn(['event', 'task'])
  itemType!: 'event' | 'task';

  @IsString()
  @MinLength(2)
  @MaxLength(140)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  location?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @IsBoolean()
  workRelated!: boolean;

  @IsInt()
  @Min(0)
  @Max(60)
  dayOffset!: number;

  @IsOptional()
  @IsString()
  startTime?: string | null;

  @IsOptional()
  @IsString()
  dueTime?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  durationMinutes?: number | null;

  @IsIn(['grouped', 'individual'])
  repetitionMode!: 'grouped' | 'individual';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  groupKey?: string | null;
}

class ScheduleVersionDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsISO8601(
    { strict: true },
    { message: 'effectiveFromDate must be a date token.' },
  )
  effectiveFromDate!: string;

  @IsString()
  @MinLength(2)
  timezone!: string;

  @IsIn(['utc_constant', 'wall_clock'])
  timezoneMode!: 'utc_constant' | 'wall_clock';

  @ValidateNested()
  @Type(() => ScheduleRecurrenceDto)
  recurrence!: ScheduleRecurrenceDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ScheduleItemDto)
  items!: ScheduleItemDto[];
}

class ScheduleDefinitionDto {
  @IsIn(['active', 'archived', 'template'])
  state!: 'active' | 'archived' | 'template';

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'boundaryStartDate must be a date token.' },
  )
  boundaryStartDate?: string | null;

  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'boundaryEndDate must be a date token.' },
  )
  boundaryEndDate?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ScheduleVersionDto)
  versions!: ScheduleVersionDto[];
}

class ListSchedulesQuery {
  @IsOptional()
  @IsIn(['active', 'archived', 'template'])
  state?: 'active' | 'archived' | 'template';

  @IsOptional()
  @IsString()
  query?: string;
}

class ListOccurrencesQuery {
  @IsISO8601({ strict: true }, { message: 'from must be a date token.' })
  from!: string;

  @IsISO8601({ strict: true }, { message: 'to must be a date token.' })
  to!: string;
}

class ScheduleChangeControlDto {
  @IsOptional()
  @IsIn(['all', 'selected_and_future'])
  scope?: 'all' | 'selected_and_future';

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'anchorDate must be a date token.' })
  anchorDate?: string;

  @IsOptional()
  @IsBoolean()
  includePast?: boolean;

  @IsOptional()
  @IsBoolean()
  overwriteExceptions?: boolean;
}

class UpdateScheduleDto {
  @ValidateNested()
  @Type(() => ScheduleDefinitionDto)
  definition!: ScheduleDefinitionDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScheduleChangeControlDto)
  changeControl?: ScheduleChangeControlDto;
}

class OccurrenceMutationDto {
  @IsIn(['cancel', 'move', 'replace'])
  action!: 'cancel' | 'move' | 'replace';

  @IsIn(['all', 'selected', 'selected_and_future'])
  scope!: 'all' | 'selected' | 'selected_and_future';

  @IsOptional()
  @IsBoolean()
  includePast?: boolean;

  @IsOptional()
  @IsBoolean()
  overwriteExceptions?: boolean;

  @IsOptional()
  @IsBoolean()
  detached?: boolean;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'movedToDate must be a date token.' })
  movedToDate?: string | null;

  @IsOptional()
  @IsString()
  targetItemId?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScheduleItemDto)
  overrideItem?: ScheduleItemDto | null;
}

function mapItem(dto: ScheduleItemDto): ScheduleItemDefinition {
  return {
    dayOffset: dto.dayOffset,
    description: dto.description?.trim() || null,
    dueTime: dto.dueTime?.trim() || null,
    durationMinutes: dto.durationMinutes ?? null,
    groupKey: dto.groupKey?.trim() || null,
    id: dto.id?.trim() || randomUUID(),
    itemType: dto.itemType,
    location: dto.location?.trim() || null,
    notes: dto.notes?.trim() || null,
    repetitionMode: dto.repetitionMode,
    startTime: dto.startTime?.trim() || null,
    title: dto.title.trim(),
    workRelated: dto.workRelated,
  };
}

function mapVersion(dto: ScheduleVersionDto): ScheduleVersionDefinition {
  return {
    effectiveFromDate: dto.effectiveFromDate.slice(0, 10),
    id: dto.id?.trim() || randomUUID(),
    items: dto.items.map(mapItem),
    recurrence: {
      count: dto.recurrence.count ?? null,
      dayOfMonth: dto.recurrence.dayOfMonth ?? null,
      frequency: dto.recurrence.frequency,
      interval: dto.recurrence.interval,
      pauses: dto.recurrence.pauses.map((pause) => ({
        endDate: pause.endDate.slice(0, 10),
        startDate: pause.startDate.slice(0, 10),
      })),
      weekdays: dto.recurrence.weekdays,
    },
    timezone: dto.timezone.trim(),
    timezoneMode: dto.timezoneMode,
  };
}

function mapDefinition(dto: ScheduleDefinitionDto): ScheduleDefinition {
  return {
    boundaryEndDate: dto.boundaryEndDate?.slice(0, 10) ?? null,
    boundaryStartDate: dto.boundaryStartDate?.slice(0, 10) ?? null,
    description: dto.description?.trim() || null,
    id: randomUUID(),
    name: dto.name.trim(),
    state: dto.state,
    versions: dto.versions.map(mapVersion),
  };
}

@Controller('sched')
export class SchedController {
  constructor(private readonly schedService: SchedService) {}

  @Get()
  @SecurityPolicy({
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  async listSchedules(
    @Req() req: ApiRequest,
    @Query() query: ListSchedulesQuery,
  ) {
    const requestContext = req.requestContext!;
    return {
      schedules: await this.schedService.listSchedules({
        actorId: requestContext.actor.id!,
        query: query.query,
        scope: this.schedService.getScope({
          actorId: requestContext.actor.id!,
          contextId: requestContext.context.id!,
          contextType: requestContext.context.type,
        }),
        state: query.state,
      }),
    };
  }

  @Get(':scheduleId')
  @SecurityPolicy({
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  async getSchedule(
    @Req() req: ApiRequest,
    @Param('scheduleId') scheduleId: string,
  ) {
    const requestContext = req.requestContext!;
    return this.schedService.getSchedule({
      actorId: requestContext.actor.id!,
      scheduleId,
      scope: this.schedService.getScope({
        actorId: requestContext.actor.id!,
        contextId: requestContext.context.id!,
        contextType: requestContext.context.type,
      }),
    });
  }

  @Post('preview')
  @SecurityPolicy({
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  async previewSchedule(
    @Req() req: ApiRequest,
    @Body() definitionDto: ScheduleDefinitionDto,
  ) {
    const requestContext = req.requestContext!;
    return this.schedService.previewSchedule({
      actorId: requestContext.actor.id!,
      definition: mapDefinition(definitionDto),
      scope: this.schedService.getScope({
        actorId: requestContext.actor.id!,
        contextId: requestContext.context.id!,
        contextType: requestContext.context.type,
      }),
    });
  }

  @Post()
  @SecurityPolicy({
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  async createSchedule(
    @Req() req: ApiRequest,
    @Body() definitionDto: ScheduleDefinitionDto,
  ) {
    const requestContext = req.requestContext!;
    return this.schedService.createSchedule({
      actorId: requestContext.actor.id!,
      definition: mapDefinition(definitionDto),
      scope: this.schedService.getScope({
        actorId: requestContext.actor.id!,
        contextId: requestContext.context.id!,
        contextType: requestContext.context.type,
      }),
    });
  }

  @Patch(':scheduleId')
  @SecurityPolicy({
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  async updateSchedule(
    @Req() req: ApiRequest,
    @Param('scheduleId') scheduleId: string,
    @Body() body: UpdateScheduleDto,
  ) {
    const requestContext = req.requestContext!;
    return this.schedService.updateSchedule({
      actorId: requestContext.actor.id!,
      changeControl: body.changeControl,
      definition: {
        ...mapDefinition(body.definition),
        id: scheduleId,
      },
      scheduleId,
      scope: this.schedService.getScope({
        actorId: requestContext.actor.id!,
        contextId: requestContext.context.id!,
        contextType: requestContext.context.type,
      }),
    });
  }

  @Get(':scheduleId/occurrences')
  @SecurityPolicy({
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  async listOccurrences(
    @Req() req: ApiRequest,
    @Param('scheduleId') scheduleId: string,
    @Query() query: ListOccurrencesQuery,
  ) {
    const requestContext = req.requestContext!;
    return {
      occurrences: await this.schedService.listScheduleOccurrences({
        actorId: requestContext.actor.id!,
        from: query.from.slice(0, 10),
        scheduleId,
        scope: this.schedService.getScope({
          actorId: requestContext.actor.id!,
          contextId: requestContext.context.id!,
          contextType: requestContext.context.type,
        }),
        to: query.to.slice(0, 10),
      }),
    };
  }

  @Post(':scheduleId/occurrences/:occurrenceDate/mutate')
  @SecurityPolicy({
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  async mutateOccurrence(
    @Req() req: ApiRequest,
    @Param('scheduleId') scheduleId: string,
    @Param('occurrenceDate') occurrenceDate: string,
    @Body() body: OccurrenceMutationDto,
  ) {
    const requestContext = req.requestContext!;
    return {
      occurrences: await this.schedService.mutateOccurrence({
        action: body.action,
        actorId: requestContext.actor.id!,
        detached: body.detached ?? false,
        includePast: body.includePast ?? false,
        movedToDate: body.movedToDate?.slice(0, 10) ?? null,
        occurrenceDate: occurrenceDate.slice(0, 10),
        overrideItem: body.overrideItem ? mapItem(body.overrideItem) : null,
        overwriteExceptions: body.overwriteExceptions ?? false,
        scheduleId,
        scope: body.scope,
        scopeContext: this.schedService.getScope({
          actorId: requestContext.actor.id!,
          contextId: requestContext.context.id!,
          contextType: requestContext.context.type,
        }),
        targetItemId: body.targetItemId ?? null,
      }),
    };
  }
}
