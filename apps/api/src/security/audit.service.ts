import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@smart-schedule/contracts';
import { RequestContextStore } from './request-context.store';

type AuditRecordInput = {
  action: string;
  details?: Record<string, boolean | number | string | null>;
  requestContext?: RequestContext | null;
  targetId?: string | null;
  targetType?: string | null;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly requestContextStore: RequestContextStore) {}

  emit(input: AuditRecordInput) {
    const requestContext =
      input.requestContext ?? this.requestContextStore.get();

    this.logger.log(
      JSON.stringify({
        action: input.action,
        actorId: requestContext?.actor.id ?? null,
        actorRoles: requestContext?.actor.roles ?? [],
        actorType: requestContext?.actor.type ?? 'anonymous',
        contextId: requestContext?.context.id ?? null,
        contextType: requestContext?.context.type ?? null,
        correlationId: requestContext?.correlationId ?? null,
        details: input.details ?? {},
        outcome: 'success',
        requestId: requestContext?.requestId ?? null,
        targetId: input.targetId ?? null,
        targetType: input.targetType ?? null,
        tenantId: requestContext?.context.tenantId ?? null,
      }),
    );
  }
}
