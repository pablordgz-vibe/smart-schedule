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
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type {
  TimePolicyCategory,
  TimePolicyScopeLevel,
} from '@smart-schedule/domain-time';
import type { ApiRequest } from '../security/request-context.types';
import { SecurityPolicy } from '../security/security-policy.decorator';
import { TimeService } from './time.service';

class ListPoliciesQuery {
  @IsOptional()
  @IsIn([
    'working_hours',
    'availability',
    'unavailability',
    'holiday',
    'blackout',
    'rest',
    'max_hours',
  ])
  policyType?: TimePolicyCategory;

  @IsOptional()
  @IsIn(['organization', 'group', 'user'])
  scopeLevel?: TimePolicyScopeLevel;

  @IsOptional()
  @IsString()
  targetGroupId?: string;

  @IsOptional()
  @IsString()
  targetUserId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeInactive?: boolean;
}

class TimePolicyDto {
  @IsIn([
    'working_hours',
    'availability',
    'unavailability',
    'holiday',
    'blackout',
    'rest',
    'max_hours',
  ])
  policyType!: TimePolicyCategory;

  @IsIn(['organization', 'group', 'user'])
  scopeLevel!: TimePolicyScopeLevel;

  @IsOptional()
  @IsIn(['custom', 'official'])
  sourceType?: 'custom' | 'official';

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  targetGroupId?: string;

  @IsOptional()
  @IsString()
  targetUserId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime?: string;

  @IsOptional()
  @IsISO8601()
  startAt?: string;

  @IsOptional()
  @IsISO8601()
  endAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  minRestMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  maxDailyMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7 * 24 * 60)
  maxWeeklyMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  providerCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  locationCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  holidayName?: string;
}

class UpdateTimePolicyDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime?: string;

  @IsOptional()
  @IsISO8601()
  startAt?: string;

  @IsOptional()
  @IsISO8601()
  endAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  minRestMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  maxDailyMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7 * 24 * 60)
  maxWeeklyMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  providerCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  locationCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  holidayName?: string;
}

class PolicyPreviewQuery {
  @IsOptional()
  @IsString()
  targetUserId?: string;
}

class EvaluateAdvisoryDto {
  @IsIn(['event', 'task'])
  itemType!: 'event' | 'task';

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
  @IsISO8601()
  dueAt?: string;

  @IsOptional()
  @IsBoolean()
  workRelated?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  location?: string;

  @IsOptional()
  @IsString()
  targetUserId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(8 * 60)
  commuteMinutesBefore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(8 * 60)
  commuteMinutesAfter?: number;

  @IsOptional()
  @IsString()
  weatherSummary?: string;

  @IsOptional()
  @IsString()
  weatherPreparationNote?: string;
}

class ImportOfficialHolidaysDto {
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  providerCode!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(32)
  locationCode!: string;

  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  replaceExisting?: boolean;

  @IsIn(['organization', 'group', 'user'])
  scopeLevel!: TimePolicyScopeLevel;

  @IsOptional()
  @IsString()
  targetGroupId?: string;

  @IsOptional()
  @IsString()
  targetUserId?: string;
}

class HolidayImportOptionsQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  providerCode?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  countryCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;
}

class HolidayLocationCatalogQuery {
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  providerCode!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  countryCode?: string;
}

@Controller('time')
export class TimeController {
  constructor(private readonly timeService: TimeService) {}

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  @Get('policies')
  async listPolicies(
    @Req() request: ApiRequest,
    @Query() query: ListPoliciesQuery,
  ) {
    return {
      policies: await this.timeService.listPolicies({
        actorId: request.requestContext!.actor.id!,
        context: request.requestContext!,
        policyType: query.policyType,
        scopeLevel: query.scopeLevel,
        targetGroupId: query.targetGroupId,
        targetUserId: query.targetUserId,
        includeInactive: query.includeInactive ?? false,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  @Post('policies')
  async createPolicy(@Req() request: ApiRequest, @Body() body: TimePolicyDto) {
    return {
      policy: await this.timeService.createPolicy({
        actorId: request.requestContext!.actor.id!,
        context: request.requestContext!,
        isActive: body.isActive ?? true,
        policyType: body.policyType,
        rule: {
          date: body.date,
          daysOfWeek: body.daysOfWeek,
          endAt: body.endAt,
          endTime: body.endTime,
          holidayName: body.holidayName,
          locationCode: body.locationCode,
          maxDailyMinutes: body.maxDailyMinutes,
          maxWeeklyMinutes: body.maxWeeklyMinutes,
          minRestMinutes: body.minRestMinutes,
          providerCode: body.providerCode,
          startAt: body.startAt,
          startTime: body.startTime,
        },
        scopeLevel: body.scopeLevel,
        sourceType: body.sourceType ?? 'custom',
        targetGroupId: body.targetGroupId ?? null,
        targetUserId: body.targetUserId ?? null,
        title: body.title,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  @Patch('policies/:policyId')
  async updatePolicy(
    @Req() request: ApiRequest,
    @Param('policyId') policyId: string,
    @Body() body: UpdateTimePolicyDto,
  ) {
    const hasRulePatch =
      body.date != null ||
      body.daysOfWeek != null ||
      body.endAt != null ||
      body.endTime != null ||
      body.holidayName != null ||
      body.locationCode != null ||
      body.maxDailyMinutes != null ||
      body.maxWeeklyMinutes != null ||
      body.minRestMinutes != null ||
      body.providerCode != null ||
      body.startAt != null ||
      body.startTime != null;

    return {
      policy: await this.timeService.updatePolicy({
        actorId: request.requestContext!.actor.id!,
        context: request.requestContext!,
        patch: {
          isActive: body.isActive,
          rule: hasRulePatch
            ? {
                date: body.date,
                daysOfWeek: body.daysOfWeek,
                endAt: body.endAt,
                endTime: body.endTime,
                holidayName: body.holidayName,
                locationCode: body.locationCode,
                maxDailyMinutes: body.maxDailyMinutes,
                maxWeeklyMinutes: body.maxWeeklyMinutes,
                minRestMinutes: body.minRestMinutes,
                providerCode: body.providerCode,
                startAt: body.startAt,
                startTime: body.startTime,
              }
            : undefined,
          title: body.title,
        },
        policyId,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  @Delete('policies/:policyId')
  async deletePolicy(
    @Req() request: ApiRequest,
    @Param('policyId') policyId: string,
  ) {
    return await this.timeService.deletePolicy({
      actorId: request.requestContext!.actor.id!,
      context: request.requestContext!,
      policyId,
    });
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  @Get('policies/preview')
  async previewPolicies(
    @Req() request: ApiRequest,
    @Query() query: PolicyPreviewQuery,
  ) {
    return {
      preview: await this.timeService.previewEffectivePolicies({
        actorId: request.requestContext!.actor.id!,
        context: request.requestContext!,
        targetUserId: query.targetUserId ?? null,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  @Post('advisory/evaluate')
  async evaluateAdvisory(
    @Req() request: ApiRequest,
    @Body() body: EvaluateAdvisoryDto,
  ) {
    const now = new Date();
    const allDay = body.allDay ?? false;

    const startAt = body.itemType === 'task' ? body.dueAt : body.startAt;
    const endAt =
      body.itemType === 'task'
        ? new Date(
            new Date(body.dueAt ?? now.toISOString()).getTime() + 30 * 60_000,
          ).toISOString()
        : body.endAt;

    if (!startAt || !endAt) {
      throw new BadRequestException(
        'startAt/endAt are required for events and dueAt is required for tasks.',
      );
    }

    return {
      advisory: await this.timeService.evaluateAdvisory({
        actorId: request.requestContext!.actor.id!,
        candidate: {
          allDay,
          endAt,
          location: body.location ?? null,
          startAt,
          title: body.title,
          workRelated: body.workRelated ?? false,
        },
        commuteSignal:
          body.commuteMinutesBefore != null || body.commuteMinutesAfter != null
            ? {
                commuteMinutesAfter: body.commuteMinutesAfter ?? null,
                commuteMinutesBefore: body.commuteMinutesBefore ?? null,
                source: 'user',
              }
            : null,
        context: request.requestContext!,
        targetUserId: body.targetUserId ?? null,
        weatherSignal:
          body.weatherPreparationNote && body.weatherSummary
            ? {
                preparationNote: body.weatherPreparationNote,
                source: 'user',
                summary: body.weatherSummary,
              }
            : null,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  @Get('holidays/locations')
  async getHolidayLocationCatalog(@Query() query: HolidayLocationCatalogQuery) {
    return {
      catalog: await this.timeService.getHolidayLocationCatalog({
        countryCode: query.countryCode,
        providerCode: query.providerCode,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  @Post('holidays/import')
  async importOfficialHolidays(
    @Req() request: ApiRequest,
    @Body() body: ImportOfficialHolidaysDto,
  ) {
    return {
      importResult: await this.timeService.importOfficialHolidays({
        actorId: request.requestContext!.actor.id!,
        context: request.requestContext!,
        locationCode: body.locationCode,
        providerCode: body.providerCode,
        replaceExisting: body.replaceExisting ?? true,
        scopeLevel: body.scopeLevel,
        targetGroupId: body.targetGroupId ?? null,
        targetUserId: body.targetUserId ?? null,
        year: body.year,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization', 'personal'],
    requireContextId: true,
  })
  @Get('holidays/import-options')
  async getHolidayImportOptions(
    @Req() request: ApiRequest,
    @Query() query: HolidayImportOptionsQueryDto,
  ) {
    return {
      options: await this.timeService.getHolidayLocationCatalog({
        countryCode: query.countryCode ?? undefined,
        providerCode: query.providerCode ?? 'calendarific',
      }),
    };
  }
}
