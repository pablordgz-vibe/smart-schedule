import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PUBLIC_ROUTE_KEY } from './public-route.decorator';
import { ApiRequest } from './request-context.types';
import { RequestContextStore } from './request-context.store';

@Injectable()
export class SecurityKernelGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly requestContextStore: RequestContextStore,
  ) {}

  canActivate(context: ExecutionContext) {
    const isPublicRoute = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublicRoute) {
      return true;
    }

    const request = context.switchToHttp().getRequest<ApiRequest>();
    const requestContext =
      request.requestContext ?? this.requestContextStore.get();

    if (!requestContext) {
      throw new InternalServerErrorException(
        'Request context scaffold is unavailable.',
      );
    }

    if (requestContext.actor.type === 'anonymous') {
      throw new UnauthorizedException(
        'Authenticated routes require the identity scaffold headers.',
      );
    }

    if (requestContext.context.type === 'public') {
      throw new UnauthorizedException(
        'Authenticated routes require an active execution context.',
      );
    }

    return true;
  }
}
