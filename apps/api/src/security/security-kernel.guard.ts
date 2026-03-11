import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PUBLIC_ROUTE_KEY } from './public-route.decorator';
import { ApiRequest } from './request-context.types';
import { RequestContextStore } from './request-context.store';
import { SECURITY_POLICY_KEY } from './security-policy.decorator';
import {
  throwAuthenticationRequired,
  throwContextMismatch,
  throwInvalidCsrf,
  throwNotPermitted,
  throwTenantMismatch,
} from './security-errors';
import type {
  AuthorizationPolicy,
  RequestFieldBinding,
  RequestFieldBindingSource,
} from '@smart-schedule/contracts';

const csrfHeaderName = 'x-csrf-token';

function isUnsafeMethod(method: string) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

function getExpectedBindingValue(
  request: ApiRequest,
  source: RequestFieldBindingSource,
) {
  const requestContext = request.requestContext;

  switch (source) {
    case 'actor.id':
      return requestContext?.actor.id ?? null;
    case 'context.id':
      return requestContext?.context.id ?? null;
    case 'context.tenantId':
      return requestContext?.context.tenantId ?? null;
    case 'context.type':
      return requestContext?.context.type ?? null;
  }
}

function getActualBindingValue(request: ApiRequest, binding: RequestFieldBinding) {
  const container = request[binding.location];
  if (!container || typeof container !== 'object') {
    return null;
  }

  const value = Reflect.get(container as object, binding.field);
  return typeof value === 'string' ? value : value == null ? null : String(value);
}

function evaluatePolicy(request: ApiRequest, policy: AuthorizationPolicy) {
  const requestContext = request.requestContext;
  if (!requestContext) {
    return;
  }

  if (
    policy.allowedActorTypes &&
    !policy.allowedActorTypes.includes(requestContext.actor.type)
  ) {
    throwNotPermitted('The current actor type is not permitted for this route.');
  }

  if (
    policy.allowedContextTypes &&
    !policy.allowedContextTypes.includes(requestContext.context.type)
  ) {
    throwContextMismatch('The active context is not permitted for this route.', {
      allowedContextTypes: policy.allowedContextTypes,
      actualContextType: requestContext.context.type,
    });
  }

  if (policy.requireContextId && !requestContext.context.id) {
    throwContextMismatch('An explicit active context is required for this route.');
  }

  if (policy.requireTenant && !requestContext.context.tenantId) {
    throwTenantMismatch('A tenant-scoped context is required for this route.');
  }

  if (
    policy.requiredRoles?.length &&
    !policy.requiredRoles.some((role) => requestContext.actor.roles.includes(role))
  ) {
    throwNotPermitted('The current actor is missing a required role.', {
      requiredRoles: policy.requiredRoles,
    });
  }

  for (const binding of policy.bindings ?? []) {
    const actualValue = getActualBindingValue(request, binding);
    const expectedValue = getExpectedBindingValue(request, binding.equals);

    if (actualValue !== expectedValue) {
      const mismatchDetails = {
        actual: actualValue,
        expected: expectedValue,
        field: `${binding.location}.${binding.field}`,
      };

      if (binding.equals === 'context.tenantId') {
        throwTenantMismatch(
          'The request payload does not match the active tenant scope.',
          mismatchDetails,
        );
      }

      throwContextMismatch(
        'The request payload does not match the active security context.',
        mismatchDetails,
      );
    }
  }
}

@Injectable()
export class SecurityKernelGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly requestContextStore: RequestContextStore,
  ) {}

  canActivate(context: ExecutionContext) {
    const isPublicRoute = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublicRoute) {
      return true;
    }

    const request = context.switchToHttp().getRequest<ApiRequest>();
    const requestContext =
      request.requestContext ?? this.requestContextStore.get();

    if (!requestContext) {
      throw new InternalServerErrorException(
        'Request context scaffold is unavailable.',
      );
    }

    if (requestContext.actor.type === 'anonymous') {
      throwAuthenticationRequired(
        'Authenticated routes require a valid session or trusted identity scaffold.',
      );
    }

    if (requestContext.context.type === 'public') {
      throwAuthenticationRequired(
        'Authenticated routes require an active execution context.',
      );
    }

    if (
      request.authenticatedBy === 'session' &&
      isUnsafeMethod(request.method) &&
      request.header(csrfHeaderName) !== request.session?.csrfToken
    ) {
      throwInvalidCsrf(
        'Unsafe cookie-authenticated requests require a valid CSRF token.',
      );
    }

    const policy = this.reflector.getAllAndOverride<AuthorizationPolicy>(
      SECURITY_POLICY_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (policy) {
      evaluatePolicy(request, policy);
    }

    return true;
  }
}
