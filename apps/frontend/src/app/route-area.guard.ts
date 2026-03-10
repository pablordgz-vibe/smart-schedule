import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ContextService } from './context.service';
import { AppArea } from './route-catalog';

export const routeAreaGuard: CanActivateFn = (route) => {
  const contextService = inject(ContextService);
  const router = inject(Router);
  const area = route.data?.['area'] as AppArea | undefined;

  if (!area || contextService.isAreaAllowed(area)) {
    return true;
  }

  return router.parseUrl(contextService.fallbackRoute());
};
