import type { Request } from 'express';
import type { RequestContext } from '@smart-schedule/contracts';

export type ApiRequest = Request & {
  requestContext?: RequestContext;
};
