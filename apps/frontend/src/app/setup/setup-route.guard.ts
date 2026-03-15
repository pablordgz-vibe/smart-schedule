import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStateService } from '../auth-state.service';
import { ContextService } from '../context.service';
import { SetupStateService } from './setup-state.service';

export const setupRouteGuard: CanActivateFn = () => {
  const authState = inject(AuthStateService);
  const contextService = inject(ContextService);
  const router = inject(Router);
  const setupState = inject(SetupStateService);

  if (!setupState.isComplete()) {
    return true;
  }

  return router.parseUrl(
    authState.isAuthenticated() ? contextService.fallbackRoute() : '/auth/sign-in',
  );
};
