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

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContextStore: RequestContextStore) {}

  use(request: ApiRequest, response: Response, next: NextFunction) {
    const actorId = getHeaderValue(request, requestContextHeaderNames.actorId);
    const correlationId =
      getHeaderValue(request, requestContextHeaderNames.correlationId) ??
      randomUUID();
    const requestId =
      getHeaderValue(request, requestContextHeaderNames.requestId) ??
      randomUUID();
    const requestContext: RequestContext = {
      actor: {
        id: actorId,
        roles: getRolesHeaderValue(request),
        type: actorId ? 'user' : 'anonymous',
      },
      context: {
        id: getHeaderValue(request, requestContextHeaderNames.activeContextId),
        tenantId: getHeaderValue(request, requestContextHeaderNames.tenantId),
        type: getContextType(request, actorId),
      },
      correlationId,
      requestId,
    };

    request.requestContext = requestContext;
    response.setHeader(requestContextHeaderNames.correlationId, correlationId);
    response.setHeader(requestContextHeaderNames.requestId, requestId);

    this.requestContextStore.run(requestContext, next);
  }
}
