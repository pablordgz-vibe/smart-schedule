import type { FastifyRequest } from 'fastify';
import type { RequestContext, SessionRecord } from '@smart-schedule/contracts';

export type ApiRequest = FastifyRequest & {
  authenticatedBy?: 'anonymous' | 'header' | 'session';
  requestContext?: RequestContext;
  session?: SessionRecord;
  sessionCookieValue?: string | null;
};
