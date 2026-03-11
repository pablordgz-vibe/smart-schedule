import { Injectable, NestMiddleware } from '@nestjs/common';
import {
  ActiveContextType,
  RequestContext,
  requestContextHeaderNames,
} from '@smart-schedule/contracts';
import { randomUUID } from 'node:crypto';
import { NextFunction, Response } from 'express';
import { ApiRequest } from './request-context.types';
import { RequestContextStore } from './request-context.store';
import { SessionService } from './session.service';

const activeContextTypes = new Set<ActiveContextType>([
  'organization',
  'personal',
  'public',
  'system',
]);

function getHeaderValue(request: ApiRequest, headerName: string) {
  const value = request.header(headerName);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function getRolesHeaderValue(request: ApiRequest) {
  const headerValue = getHeaderValue(
    request,
    requestContextHeaderNames.actorRoles,
  );
  if (!headerValue) {
    return [];
  }

  return headerValue
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function getContextType(
  request: ApiRequest,
  actorId: string | null,
): ActiveContextType {
  const headerValue = getHeaderValue(
    request,
    requestContextHeaderNames.activeContextType,
  );

  if (headerValue && activeContextTypes.has(headerValue as ActiveContextType)) {
    return headerValue as ActiveContextType;
  }

  return actorId ? 'personal' : 'public';
}

function parseCookies(request: ApiRequest) {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    return new Map<string, string>();
  }

  return new Map(
    cookieHeader
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf('=');
        if (separatorIndex < 0) {
          return [part, ''] as const;
        }

        return [
          decodeURIComponent(part.slice(0, separatorIndex)),
          decodeURIComponent(part.slice(separatorIndex + 1)),
        ] as const;
      }),
  );
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly sessionCookieName =
    process.env.SESSION_COOKIE_NAME || 'smart_schedule_session';

  constructor(
    private readonly requestContextStore: RequestContextStore,
    private readonly sessionService: SessionService,
  ) {}

  use(request: ApiRequest, response: Response, next: NextFunction) {
    const cookies = parseCookies(request);
    const sessionCookieValue = cookies.get(this.sessionCookieName) ?? null;
    const session = this.sessionService.resolveSession(sessionCookieValue);
    const actorId =
      session?.actor.id ??
      getHeaderValue(request, requestContextHeaderNames.actorId);
    const correlationId =
      getHeaderValue(request, requestContextHeaderNames.correlationId) ??
      randomUUID();
    const requestId =
      getHeaderValue(request, requestContextHeaderNames.requestId) ??
      randomUUID();
    const requestContext: RequestContext = {
      actor: {
        id: actorId,
        roles: session?.actor.roles ?? getRolesHeaderValue(request),
        type: session ? 'user' : actorId ? 'user' : 'anonymous',
      },
      context: {
        id:
          session?.context.id ??
          getHeaderValue(request, requestContextHeaderNames.activeContextId),
        tenantId:
          session?.context.tenantId ??
          getHeaderValue(request, requestContextHeaderNames.tenantId),
        type: session?.context.type ?? getContextType(request, actorId),
      },
      correlationId,
      requestId,
    };

    if (sessionCookieValue && !session) {
      response.clearCookie(this.sessionCookieName);
    }

    request.authenticatedBy = session ? 'session' : actorId ? 'header' : 'anonymous';
    request.requestContext = requestContext;
    request.session = session ?? undefined;
    request.sessionCookieValue = sessionCookieValue;
    response.setHeader(requestContextHeaderNames.correlationId, correlationId);
    response.setHeader(requestContextHeaderNames.requestId, requestId);

    this.requestContextStore.run(requestContext, next);
  }
}
