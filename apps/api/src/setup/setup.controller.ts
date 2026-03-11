import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Post,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsObject,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Public } from '../security/public-route.decorator';
import { RateLimit } from '../security/rate-limit.decorator';
import { throwBootstrapLocked } from '../security/security-errors';
import { BootstrapRoute } from './bootstrap-route.decorator';
import { SetupService } from './setup.service';

class SetupAdminDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(12)
  password!: string;
}

class SetupIntegrationDto {
  @IsString()
  code!: string;

  @IsObject()
  credentials!: Record<string, string>;

  @IsBoolean()
  enabled!: boolean;

  @IsIn(['api-key', 'provider-login'])
  mode!: 'api-key' | 'provider-login';
}

class CompleteSetupDto {
  @ValidateNested()
  @Type(() => SetupAdminDto)
  admin!: SetupAdminDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetupIntegrationDto)
  integrations!: SetupIntegrationDto[];
}

@Controller('setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Public()
  @BootstrapRoute()
  @Get('state')
  async getState() {
    if (await this.setupService.isSetupComplete()) {
      throwBootstrapLocked(
        'Initial setup has already completed for this deployment.',
      );
    }

    return this.setupService.getSetupState();
  }

  @Public()
  @BootstrapRoute()
  @Get('integrations')
  async getIntegrationOptions() {
    if (await this.setupService.isSetupComplete()) {
      throwBootstrapLocked(
        'Initial setup has already completed for this deployment.',
      );
    }

    return {
      edition: process.env.APP_EDITION ?? 'community',
      providers: this.setupService.getAvailableIntegrations(),
    };
  }

  @Public()
  @BootstrapRoute()
  @Post('complete')
  @HttpCode(201)
  @RateLimit({ keyScope: 'ip', limit: 5, windowMs: 60_000 })
  async complete(@Body() body: CompleteSetupDto) {
    if (
      body.integrations.some(
        (integration) =>
          integration.enabled &&
          Object.keys(integration.credentials).length === 0,
      )
    ) {
      throw new BadRequestException(
        'Enabled integrations must include credential values.',
      );
    }

    const result = await this.setupService.completeSetup(body);
    if (!result) {
      throw new ConflictException({
        error: {
          code: 'BOOTSTRAP_LOCKED',
          kind: 'bootstrap_locked',
          message: 'Initial setup has already completed for this deployment.',
        },
      });
    }

    return result;
  }
}
