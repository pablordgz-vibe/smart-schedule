import type { Request } from 'express';
import type { RequestContext, SessionRecord } from '@smart-schedule/contracts';

export type ApiRequest = Request & {
  authenticatedBy?: 'anonymous' | 'header' | 'session';
  requestContext?: RequestContext;
  session?: SessionRecord;
  sessionCookieValue?: string | null;
};
