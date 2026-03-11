import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { AuditEnvelope } from '@smart-schedule/contracts';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { ApiRequest } from './request-context.types';
import { getRequestResource } from './http-platform';
import { RequestContextStore } from './request-context.store';

@Injectable()
export class AuditTrailInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditTrailInterceptor.name);

  constructor(private readonly requestContextStore: RequestContextStore) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<ApiRequest>();
    const requestContext =
      request.requestContext ?? this.requestContextStore.get();
    const resource = getRequestResource(request);

    return next.handle().pipe(
      tap(() => {
        if (!requestContext) {
          return;
        }

        this.emitAuditEnvelope({
          action: request.method,
          actorId: requestContext.actor.id,
          actorType: requestContext.actor.type,
          contextId: requestContext.context.id,
          contextType: requestContext.context.type,
          correlationId: requestContext.correlationId,
          outcome: 'success',
          requestId: requestContext.requestId,
          resource,
          tenantId: requestContext.context.tenantId,
        });
      }),
      catchError((error: unknown) => {
        if (requestContext) {
          this.emitAuditEnvelope({
            action: request.method,
            actorId: requestContext.actor.id,
            actorType: requestContext.actor.type,
            contextId: requestContext.context.id,
            contextType: requestContext.context.type,
            correlationId: requestContext.correlationId,
            outcome: 'failure',
            requestId: requestContext.requestId,
            resource,
            tenantId: requestContext.context.tenantId,
          });
        }

        return throwError(() => error);
      }),
    );
  }

  private emitAuditEnvelope(envelope: AuditEnvelope) {
    this.logger.log(JSON.stringify(envelope));
  }
}
