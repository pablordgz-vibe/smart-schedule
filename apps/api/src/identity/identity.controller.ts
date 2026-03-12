import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import type { FastifyReply } from 'fastify';
import type {
  ActiveContextType,
  AuthMutationResult,
  AuthSessionSnapshot,
  SocialProviderCode,
} from '@smart-schedule/contracts';
import { Public } from '../security/public-route.decorator';
import {
  clearSessionCookie,
  setSessionCookie,
} from '../security/http-platform';
import type { ApiRequest } from '../security/request-context.types';
import { SecurityPolicy } from '../security/security-policy.decorator';
import { SessionService } from '../security/session.service';
import { IdentityService } from './identity.service';
import { OrgService } from '../org/org.service';

class SignUpDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(12)
  password!: string;
}

class PasswordSignInDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  password!: string;
}

class SocialAuthDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsIn(['github', 'google', 'microsoft'])
  provider!: SocialProviderCode;

  @IsString()
  @MinLength(3)
  providerSubject!: string;
}

class EmailOnlyDto {
  @IsEmail()
  email!: string;
}

class TokenConfirmDto {
  @IsString()
  @MinLength(12)
  token!: string;
}

class PasswordResetConfirmDto extends TokenConfirmDto {
  @IsString()
  @MinLength(12)
  password!: string;
}

class LinkSocialDto {
  @IsIn(['github', 'google', 'microsoft'])
  provider!: SocialProviderCode;

  @IsString()
  @MinLength(3)
  providerSubject!: string;
}

class UpdateAuthConfigDto {
  @IsOptional()
  @IsBoolean()
  requireEmailVerification?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9)
  minAdminTierForAccountDeactivation?: number;
}

class SwitchContextDto {
  @IsIn(['organization', 'personal', 'system'])
  contextType!: Extract<
    ActiveContextType,
    'organization' | 'personal' | 'system'
  >;

  @IsOptional()
  @IsString()
  organizationId?: string;
}

@Controller()
export class IdentityController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly sessionService: SessionService,
    private readonly orgService: OrgService,
  ) {}

  @Public()
  @Get('auth/providers')
  async getProviders() {
    return this.identityService.getAuthConfiguration();
  }

  @Public()
  @Get('auth/session')
  async getSession(@Req() request: ApiRequest): Promise<AuthSessionSnapshot> {
    return this.buildSessionSnapshot(request);
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    requireContextId: true,
  })
  @Post('auth/context')
  async switchContext(
    @Req() request: ApiRequest,
    @Body() body: SwitchContextDto,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    const actorId = request.requestContext!.actor.id!;
    if (
      body.contextType === 'system' &&
      !request.requestContext!.actor.roles.includes('system-admin')
    ) {
      throw new UnauthorizedException(
        'Only system administrators can enter system context.',
      );
    }

    if (request.sessionCookieValue) {
      await this.sessionService.revokeSession(request.sessionCookieValue);
    }

    const context =
      body.contextType === 'organization'
        ? await this.resolveOrganizationContext(actorId, body.organizationId)
        : {
            id: actorId,
            tenantId: null,
            type: body.contextType,
          };

    const createdSession = await this.sessionService.createSession({
      actorId,
      context,
    });

    setSessionCookie(response, createdSession.cookieValue);

    return {
      session: await this.buildSessionSnapshot({
        ...request,
        session: createdSession.session,
      } as ApiRequest),
    };
  }

  @Public()
  @Post('auth/sign-up')
  @HttpCode(201)
  async signUp(@Body() body: SignUpDto): Promise<AuthMutationResult> {
    const result = await this.identityService.registerPasswordUser(body);
    return {
      session: {
        activeContext: {
          id: null,
          tenantId: null,
          type: 'public',
        },
        availableContexts: [],
        authenticated: false,
        configuredSocialProviders:
          await this.identityService.getConfiguredSocialProviders(),
        csrfToken: null,
        requireEmailVerification: (
          await this.identityService.getAuthConfiguration()
        ).requireEmailVerification,
        user: result.user,
      },
      tokenDelivery: result.tokenDelivery,
    };
  }

  @Public()
  @Post('auth/sign-in/password')
  async signInWithPassword(
    @Body() body: PasswordSignInDto,
    @Req() request: ApiRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    const user = await this.identityService.authenticatePassword(
      body.email,
      body.password,
    );
    return this.issueSession(user.id, request, response);
  }

  @Public()
  @Post('auth/sign-in/social')
  async signInWithSocial(
    @Body() body: SocialAuthDto,
    @Req() request: ApiRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    const user = await this.identityService.authenticateSocial(body);
    return this.issueSession(user.id, request, response);
  }

  @Public()
  @Post('auth/verify-email/request')
  async requestEmailVerification(@Body() body: EmailOnlyDto) {
    return {
      tokenDelivery: await this.identityService.requestEmailVerification(
        body.email,
      ),
    };
  }

  @Public()
  @Post('auth/verify-email/confirm')
  async confirmEmailVerification(@Body() body: TokenConfirmDto) {
    return {
      user: await this.identityService.confirmEmailVerification(body.token),
    };
  }

  @Public()
  @Post('auth/password-reset/request')
  async requestPasswordReset(@Body() body: EmailOnlyDto) {
    return {
      tokenDelivery: await this.identityService.requestPasswordReset(
        body.email,
      ),
    };
  }

  @Public()
  @Post('auth/password-reset/confirm')
  async confirmPasswordReset(@Body() body: PasswordResetConfirmDto) {
    return {
      user: await this.identityService.confirmPasswordReset(
        body.token,
        body.password,
      ),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    requireContextId: true,
  })
  @Post('auth/providers/link')
  async linkProvider(@Req() request: ApiRequest, @Body() body: LinkSocialDto) {
    return {
      user: await this.identityService.linkSocialIdentity(
        request.requestContext!.actor.id!,
        body,
      ),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    requireContextId: true,
  })
  @Post('auth/providers/:provider/unlink')
  async unlinkProvider(
    @Req() request: ApiRequest,
    @Param('provider') provider: SocialProviderCode,
  ) {
    return {
      user: await this.identityService.unlinkSocialIdentity(
        request.requestContext!.actor.id!,
        provider,
      ),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    requireContextId: true,
  })
  @Post('auth/account/delete')
  async deleteAccount(
    @Req() request: ApiRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    const userId = request.requestContext!.actor.id!;
    const user = await this.identityService.deleteAccount(userId);
    await this.sessionService.revokeActorSessions(userId);
    clearSessionCookie(response);
    return { user };
  }

  @Public()
  @Post('auth/account/recovery/request')
  async requestRecovery(@Body() body: EmailOnlyDto) {
    return {
      tokenDelivery: await this.identityService.requestAccountRecovery(
        body.email,
      ),
    };
  }

  @Public()
  @Post('auth/account/recover')
  async recoverAccount(
    @Body() body: TokenConfirmDto,
    @Req() request: ApiRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    const user = await this.identityService.recoverAccount(body.token);
    return this.issueSession(user.id, request, response);
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    requireContextId: true,
  })
  @Post('auth/logout')
  async logout(
    @Req() request: ApiRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    await this.sessionService.revokeSession(request.sessionCookieValue ?? null);
    clearSessionCookie(response);
    return {
      loggedOut: true,
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['system'],
    requiredRoles: ['system-admin'],
    requireContextId: true,
  })
  @Post('admin/users/:userId/deactivate')
  async deactivateUser(
    @Req() request: ApiRequest,
    @Param('userId') userId: string,
  ) {
    const user = await this.identityService.deactivateAccount(
      userId,
      request.requestContext!.actor.id!,
      request.requestContext!.actor.roles,
    );
    await this.sessionService.revokeActorSessions(userId);
    return { user };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['system'],
    requiredRoles: ['system-admin'],
    requireContextId: true,
  })
  @Post('admin/users/:userId/reactivate')
  async reactivateUser(
    @Req() request: ApiRequest,
    @Param('userId') userId: string,
  ) {
    return {
      user: await this.identityService.reactivateAccount(
        userId,
        request.requestContext!.actor.id!,
        request.requestContext!.actor.roles,
      ),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['system'],
    requiredRoles: ['system-admin'],
    requireContextId: true,
  })
  @Patch('admin/auth/config')
  async updateAuthConfig(
    @Req() request: ApiRequest,
    @Body() body: UpdateAuthConfigDto,
  ) {
    void request;
    return this.identityService.updateAuthConfiguration({
      minAdminTierForAccountDeactivation:
        body.minAdminTierForAccountDeactivation,
      requireEmailVerification: body.requireEmailVerification,
    });
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['system'],
    requiredRoles: ['system-admin'],
    requireContextId: true,
  })
  @Get('admin/auth/config')
  async getAdminAuthConfig(@Req() request: ApiRequest) {
    void request;
    return this.identityService.getAuthConfiguration();
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['system'],
    requiredRoles: ['system-admin'],
    requireContextId: true,
  })
  @Get('admin/users')
  async listUsers(@Req() request: ApiRequest, @Query('query') query?: string) {
    void request;
    return {
      users: await this.identityService.listUsers({ query }),
    };
  }

  private async issueSession(
    userId: string,
    request: ApiRequest,
    response: FastifyReply,
  ): Promise<AuthMutationResult> {
    if (request.sessionCookieValue) {
      await this.sessionService.revokeSession(request.sessionCookieValue);
    }

    const createdSession = await this.sessionService.createSession({
      actorId: userId,
      context: {
        id: userId,
        tenantId: null,
        type: 'personal',
      },
    });

    setSessionCookie(response, createdSession.cookieValue);

    const session = await this.buildSessionSnapshot({
      ...request,
      session: createdSession.session,
    } as ApiRequest);

    return { session };
  }

  private async buildSessionSnapshot(
    request: Pick<ApiRequest, 'session'>,
  ): Promise<AuthSessionSnapshot> {
    const config = await this.identityService.getAuthConfiguration();
    const user = request.session?.actor.id
      ? await this.identityService.getUserSummary(request.session.actor.id)
      : null;

    return {
      activeContext: request.session?.context ?? {
        id: null,
        tenantId: null,
        type: 'public',
      },
      availableContexts:
        user && request.session
          ? await this.orgService.listSessionContextsForActor({
              actorId: user.id,
              actorRoles: user.roles,
            })
          : [],
      authenticated: Boolean(user && request.session),
      configuredSocialProviders: config.supportedSocialProviders,
      csrfToken: request.session?.csrfToken ?? null,
      requireEmailVerification: config.requireEmailVerification,
      user,
    };
  }

  private async resolveOrganizationContext(
    actorId: string,
    organizationId?: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException(
        'organizationId is required for organization context.',
      );
    }

    const resolved = await this.orgService.resolveOrganizationContextForActor({
      actorId,
      organizationId,
    });
    return resolved.context;
  }
}
