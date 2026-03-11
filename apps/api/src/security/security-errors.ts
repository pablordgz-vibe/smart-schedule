import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import type { SecurityErrorPayload } from '@smart-schedule/contracts';

export function throwAuthenticationRequired(message: string) {
  throw new UnauthorizedException(
    createSecurityError('AUTHENTICATION_REQUIRED', 'authentication_required', message),
  );
}

export function throwNotPermitted(
  message: string,
  details?: SecurityErrorPayload['details'],
) {
  throw new ForbiddenException(
    createSecurityError('NOT_PERMITTED', 'not_permitted', message, details),
  );
}

export function throwContextMismatch(
  message: string,
  details?: SecurityErrorPayload['details'],
) {
  throw new ForbiddenException(
    createSecurityError('CONTEXT_MISMATCH', 'context_mismatch', message, details),
  );
}

export function throwTenantMismatch(
  message: string,
  details?: SecurityErrorPayload['details'],
) {
  throw new ForbiddenException(
    createSecurityError('TENANT_MISMATCH', 'tenant_mismatch', message, details),
  );
}

export function throwInvalidCsrf(message: string) {
  throw new ForbiddenException(
    createSecurityError('CSRF_INVALID', 'csrf_invalid', message),
  );
}

export function throwRateLimited(
  message: string,
  details?: SecurityErrorPayload['details'],
) {
  throw new HttpException(
    createSecurityError('RATE_LIMITED', 'rate_limited', message, details),
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

function createSecurityError(
  code: SecurityErrorPayload['code'],
  kind: SecurityErrorPayload['kind'],
  message: string,
  details?: SecurityErrorPayload['details'],
): { error: SecurityErrorPayload } {
  return {
    error: {
      code,
      details,
      kind,
      message,
    },
  };
}
