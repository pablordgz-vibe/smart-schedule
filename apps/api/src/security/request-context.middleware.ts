import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  ActiveContextType,
  RequestContext,
  requestContextHeaderNames,
} from '@smart-schedule/contracts';
import { randomUUID } from 'node:crypto';
import { ApiRequest } from './request-context.types';
import { RequestContextStore } from './request-context.store';
import { SessionService } from './session.service';
import {
  clearSessionCookie,
  getHeaderValue,
  sessionCookieName,
} from './http-platform';

const activeContextTypes = new Set<ActiveContextType>([
  'organization',
  'personal',
  'public',
  'system',
]);

function getRolesHeaderValue(request: Pick<ApiRequest, 'headers'>) {
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
  request: Pick<ApiRequest, 'headers'>,
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

function parseCookies(request: Pick<ApiRequest, 'headers'>) {
  const cookieHeader = getHeaderValue(request, 'cookie');
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

type RequestContextHookInput = {
  fastify: Pick<FastifyInstance, 'addHook'>;
  requestContextStore: RequestContextStore;
  sessionService: SessionService;
};

async function buildRequestContext(
  request: ApiRequest,
  reply: FastifyReply,
  sessionService: SessionService,
) {
  const cookies = parseCookies(request);
  const sessionCookieValue = cookies.get(sessionCookieName) ?? null;
  const session = await sessionService.resolveSession(sessionCookieValue);
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
    clearSessionCookie(reply);
  }

  return {
    authenticatedBy: session ? 'session' : actorId ? 'header' : 'anonymous',
    requestContext,
    session: session ?? undefined,
    sessionCookieValue,
  } satisfies Pick<
    ApiRequest,
    'authenticatedBy' | 'requestContext' | 'session' | 'sessionCookieValue'
  >;
}

export function registerRequestContextHook({
  fastify,
  requestContextStore,
  sessionService,
}: RequestContextHookInput) {
  fastify.addHook('onRequest', (request, reply, done) => {
    void buildRequestContext(request as ApiRequest, reply, sessionService)
      .then((resolved) => {
        const apiRequest = request as ApiRequest;
        apiRequest.authenticatedBy = resolved.authenticatedBy;
        apiRequest.requestContext = resolved.requestContext;
        apiRequest.session = resolved.session;
        apiRequest.sessionCookieValue = resolved.sessionCookieValue;
        reply.header(
          requestContextHeaderNames.correlationId,
          resolved.requestContext.correlationId,
        );
        reply.header(
          requestContextHeaderNames.requestId,
          resolved.requestContext.requestId,
        );

        requestContextStore.run(resolved.requestContext, done);
      })
      .catch(done);
  });
}
