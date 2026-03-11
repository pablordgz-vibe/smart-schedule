import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RateLimitPolicy } from '@smart-schedule/contracts';
import { PUBLIC_ROUTE_KEY } from './public-route.decorator';
import { RateLimitService } from './rate-limit.service';
import { RATE_LIMIT_POLICY_KEY } from './rate-limit.decorator';
import { ApiRequest } from './request-context.types';
import { getRequestIp, getRoutePath } from './http-platform';
import { throwRateLimited } from './security-errors';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly defaultPolicy: RateLimitPolicy = {
    keyScope: 'actor-or-ip',
    limit: getNumberEnv('RATE_LIMIT_MAX', 60),
    windowMs: getNumberEnv('RATE_LIMIT_WINDOW_MS', 60_000),
  };

  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
  ) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<ApiRequest>();
    const isPublicRoute = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );
    const routePolicy =
      this.reflector.getAllAndOverride<RateLimitPolicy>(RATE_LIMIT_POLICY_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? this.defaultPolicy;

    if (isPublicRoute && routePolicy.limit <= 0) {
      return true;
    }

    const actorId = request.requestContext?.actor.id;
    const ip = getRequestIp(request);
    const keySubject = routePolicy.keyScope === 'ip' ? ip : (actorId ?? ip);
    const routePath = getRoutePath(request);
    const key = `${routePath}:${request.method}:${keySubject}`;
    const result = this.rateLimitService.consume(key, routePolicy);

    if (!result.allowed) {
      throwRateLimited('Rate limit exceeded for this route.', {
        limit: String(routePolicy.limit),
        resetAt: new Date(result.resetAt).toISOString(),
      });
    }

    return true;
  }
}

function getNumberEnv(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
