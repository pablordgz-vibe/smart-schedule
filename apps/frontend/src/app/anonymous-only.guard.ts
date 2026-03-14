import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStateService } from './auth-state.service';
import { ContextService } from './context.service';

export const anonymousOnlyGuard: CanActivateFn = () => {
  const authState = inject(AuthStateService);
  const contextService = inject(ContextService);
  const router = inject(Router);

  if (!authState.isAuthenticated()) {
    return true;
  }

  return router.parseUrl(contextService.fallbackRoute());
};
