import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import type { ApiRequest } from '../security/request-context.types';
import { SecurityPolicy } from '../security/security-policy.decorator';
import { OrgService } from './org.service';

class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  name!: string;
}

class CreateInvitationDto {
  @IsEmail()
  email!: string;

  @IsIn(['admin', 'member'])
  role!: 'admin' | 'member';
}

class AcceptInvitationDto {
  @IsString()
  @MinLength(12)
  inviteCode!: string;
}

class CreateGroupDto {
  @IsString()
  @MinLength(2)
  name!: string;
}

class GroupMemberDto {
  @IsString()
  @MinLength(3)
  userId!: string;
}

class CreateOrganizationCalendarDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  ownerUserId?: string;
}

class GrantCalendarVisibilityDto {
  @IsString()
  @MinLength(3)
  userId!: string;
}

@Controller('org')
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['personal'],
    requireContextId: true,
  })
  @Post('organizations')
  async createOrganization(
    @Req() request: ApiRequest,
    @Body() body: CreateOrganizationDto,
  ) {
    return {
      organization: await this.orgService.createOrganization({
        actorId: request.requestContext!.actor.id!,
        name: body.name,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    requireContextId: true,
  })
  @Get('organizations/mine')
  async listOwnOrganizations(@Req() request: ApiRequest) {
    return {
      organizations: await this.orgService.listOrganizationsForUser(
        request.requestContext!.actor.id!,
      ),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization'],
    bindings: [
      { equals: 'context.id', field: 'organizationId', location: 'params' },
    ],
    requireContextId: true,
    requireTenant: true,
  })
  @Get('organizations/:organizationId/memberships')
  async listMemberships(
    @Req() request: ApiRequest,
    @Param('organizationId') organizationId: string,
  ) {
    return {
      memberships: await this.orgService.listMemberships({
        actorId: request.requestContext!.actor.id!,
        organizationId,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization'],
    bindings: [
      { equals: 'context.id', field: 'organizationId', location: 'params' },
    ],
    requireContextId: true,
    requireTenant: true,
  })
  @Post('organizations/:organizationId/invitations')
  async createInvitation(
    @Req() request: ApiRequest,
    @Param('organizationId') organizationId: string,
    @Body() body: CreateInvitationDto,
  ) {
    return {
      invitation: await this.orgService.createInvitation({
        actorId: request.requestContext!.actor.id!,
        email: body.email,
        organizationId,
        role: body.role,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization'],
    bindings: [
      { equals: 'context.id', field: 'organizationId', location: 'params' },
    ],
    requireContextId: true,
    requireTenant: true,
  })
  @Get('organizations/:organizationId/invitations')
  async listOrganizationInvitations(
    @Req() request: ApiRequest,
    @Param('organizationId') organizationId: string,
  ) {
    return {
      invitations: await this.orgService.listOrganizationInvitations({
        actorId: request.requestContext!.actor.id!,
        organizationId,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['personal'],
    requireContextId: true,
  })
  @Get('invitations/mine')
  async listMyInvitations(@Req() request: ApiRequest) {
    return {
      invitations: await this.orgService.listInvitationsForActor(
        request.requestContext!.actor.id!,
      ),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['personal'],
    requireContextId: true,
  })
  @Post('invitations/accept')
  async acceptInvitation(
    @Req() request: ApiRequest,
    @Body() body: AcceptInvitationDto,
  ) {
    return {
      accepted: await this.orgService.acceptInvitation({
        actorId: request.requestContext!.actor.id!,
        inviteCode: body.inviteCode,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization'],
    bindings: [
      { equals: 'context.id', field: 'organizationId', location: 'params' },
    ],
    requireContextId: true,
    requireTenant: true,
  })
  @Post('organizations/:organizationId/groups')
  async createGroup(
    @Req() request: ApiRequest,
    @Param('organizationId') organizationId: string,
    @Body() body: CreateGroupDto,
  ) {
    return {
      group: await this.orgService.createGroup({
        actorId: request.requestContext!.actor.id!,
        name: body.name,
        organizationId,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization'],
    bindings: [
      { equals: 'context.id', field: 'organizationId', location: 'params' },
    ],
    requireContextId: true,
    requireTenant: true,
  })
  @Get('organizations/:organizationId/groups')
  async listGroups(
    @Req() request: ApiRequest,
    @Param('organizationId') organizationId: string,
  ) {
    return {
      groups: await this.orgService.listGroups({
        actorId: request.requestContext!.actor.id!,
        organizationId,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization'],
    bindings: [
      { equals: 'context.id', field: 'organizationId', location: 'params' },
    ],
    requireContextId: true,
    requireTenant: true,
  })
  @Post('organizations/:organizationId/groups/:groupId/members')
  async addGroupMember(
    @Req() request: ApiRequest,
    @Param('organizationId') organizationId: string,
    @Param('groupId') groupId: string,
    @Body() body: GroupMemberDto,
  ) {
    return {
      result: await this.orgService.addUserToGroup({
        actorId: request.requestContext!.actor.id!,
        groupId,
        organizationId,
        userId: body.userId,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization'],
    bindings: [
      { equals: 'context.id', field: 'organizationId', location: 'params' },
    ],
    requireContextId: true,
    requireTenant: true,
  })
  @Delete('organizations/:organizationId/groups/:groupId/members/:userId')
  async removeGroupMember(
    @Req() request: ApiRequest,
    @Param('organizationId') organizationId: string,
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
  ) {
    return {
      result: await this.orgService.removeUserFromGroup({
        actorId: request.requestContext!.actor.id!,
        groupId,
        organizationId,
        userId,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization'],
    bindings: [
      { equals: 'context.id', field: 'organizationId', location: 'params' },
    ],
    requireContextId: true,
    requireTenant: true,
  })
  @Post('organizations/:organizationId/calendars')
  async createOrganizationCalendar(
    @Req() request: ApiRequest,
    @Param('organizationId') organizationId: string,
    @Body() body: CreateOrganizationCalendarDto,
  ) {
    return {
      calendar: await this.orgService.createOrganizationCalendar({
        actorId: request.requestContext!.actor.id!,
        name: body.name,
        organizationId,
        ownerUserId: body.ownerUserId ?? null,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization'],
    bindings: [
      { equals: 'context.id', field: 'organizationId', location: 'params' },
    ],
    requireContextId: true,
    requireTenant: true,
  })
  @Get('organizations/:organizationId/calendars')
  async listOrganizationCalendars(
    @Req() request: ApiRequest,
    @Param('organizationId') organizationId: string,
  ) {
    return {
      calendars: await this.orgService.listVisibleOrganizationCalendars({
        actorId: request.requestContext!.actor.id!,
        organizationId,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization'],
    bindings: [
      { equals: 'context.id', field: 'organizationId', location: 'params' },
    ],
    requireContextId: true,
    requireTenant: true,
  })
  @Post('organizations/:organizationId/calendars/:calendarId/visibility')
  async grantCalendarVisibility(
    @Req() request: ApiRequest,
    @Param('organizationId') organizationId: string,
    @Param('calendarId') calendarId: string,
    @Body() body: GrantCalendarVisibilityDto,
  ) {
    return {
      result: await this.orgService.grantCalendarVisibility({
        actorId: request.requestContext!.actor.id!,
        calendarId,
        organizationId,
        userId: body.userId,
      }),
    };
  }

  @SecurityPolicy({
    allowedActorTypes: ['user'],
    allowedContextTypes: ['organization'],
    bindings: [
      { equals: 'context.id', field: 'organizationId', location: 'params' },
    ],
    requireContextId: true,
    requireTenant: true,
  })
  @Delete(
    'organizations/:organizationId/calendars/:calendarId/visibility/:userId',
  )
  async revokeCalendarVisibility(
    @Req() request: ApiRequest,
    @Param('organizationId') organizationId: string,
    @Param('calendarId') calendarId: string,
    @Param('userId') userId: string,
  ) {
    return {
      result: await this.orgService.revokeCalendarVisibility({
        actorId: request.requestContext!.actor.id!,
        calendarId,
        organizationId,
        userId,
      }),
    };
  }
}
