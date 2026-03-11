import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import type { ActiveContextType } from '@smart-schedule/contracts';
import { requestContextHeaderNames } from '@smart-schedule/contracts';
import type { Response } from 'express';
import { Public } from './public-route.decorator';
import { RateLimit } from './rate-limit.decorator';
import { SecurityPolicy } from './security-policy.decorator';
import type { ApiRequest } from './request-context.types';
import { SessionService } from './session.service';
import { IdentityService } from '../identity/identity.service';

class SessionLoginDto {
  @IsString()
  actorId!: string;

  @IsOptional()
  @IsString()
  contextId?: string;

  @IsOptional()
  @IsIn(['organization', 'personal', 'system'])
  contextType?: Exclude<ActiveContextType, 'public'>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsString()
  tenantId?: string;
}

class DeactivateActorDto {
  @IsString()
  actorId!: string;
}

class OrganizationMutationDto {
  @IsString()
  contextId!: string;

  @IsIn(['organization', 'personal', 'system'])
  contextType!: Exclude<ActiveContextType, 'public'>;

  @IsString()
  tenantId!: string;
}

const sessionCookieName =
  process.env.SESSION_COOKIE_NAME || 'smart_schedule_session';

@Controller('kernel')
export class SecurityTestController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly identityService: IdentityService,
  ) {}

  @Public()
  @RateLimit({ keyScope: 'ip', limit: 2, windowMs: 60_000 })
  @Post('session/login')
  async login(
    @Body() body: SessionLoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.identityService.ensureTestUser({
      actorId: body.actorId,
      adminTier: body.roles?.includes('system-admin') ? 0 : null,
      roles: body.roles ?? ['user'],
    });

    const createdSession = await this.sessionService.createSession({
      actorId: body.actorId,
      context: {
        id: body.contextId ?? body.actorId,
        tenantId: body.tenantId ?? null,
        type: body.contextType ?? 'personal',
      },
    });

    response.cookie(
      sessionCookieName,
      createdSession.cookieValue,
      {
        httpOnly: true,
        sameSite: 'strict',
        secure: true,
      },
    );

    return {
      csrfToken: createdSession.session.csrfToken,
      session: createdSession.session,
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    requireContextId: true,
  })
  @Get('session/me')
  me(@Req() request: ApiRequest) {
    return {
      requestContext: request.requestContext,
      sessionAuthenticated: request.authenticatedBy === 'session',
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    requireContextId: true,
  })
  @Post('session/logout')
  logout(
    @Req() request: ApiRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.sessionService.revokeSession(request.sessionCookieValue ?? null);
    response.clearCookie(sessionCookieName);
    return {
      loggedOut: true,
    };
  }

  @Public()
  @Post('testing/deactivate-actor')
  deactivateActor(@Body() body: DeactivateActorDto) {
    return {
      revokedSessions: this.sessionService.revokeActorSessions(body.actorId),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['personal'],
    bindings: [{ equals: 'actor.id', field: 'ownerId', location: 'params' }],
    requireContextId: true,
  })
  @Get('testing/personal-items/:ownerId')
  readPersonalItem(@Param('ownerId') ownerId: string) {
    return {
      ownerId,
      scope: 'personal',
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization'],
    bindings: [
      { equals: 'context.id', field: 'organizationId', location: 'params' },
      { equals: 'context.id', field: 'contextId', location: 'body' },
      { equals: 'context.type', field: 'contextType', location: 'body' },
      { equals: 'context.tenantId', field: 'tenantId', location: 'body' },
    ],
    requireContextId: true,
    requireTenant: true,
    requiredRoles: ['org:member'],
  })
  @Post('testing/organizations/:organizationId/mutations')
  mutateOrganizationScopedResource(
    @Param('organizationId') organizationId: string,
    @Body() body: OrganizationMutationDto,
  ) {
    return {
      accepted: true,
      organizationId,
      requestContextHeaders: {
        contextIdHeader: requestContextHeaderNames.activeContextId,
        tenantIdHeader: requestContextHeaderNames.tenantId,
      },
      targetContext: body,
    };
  }
}
