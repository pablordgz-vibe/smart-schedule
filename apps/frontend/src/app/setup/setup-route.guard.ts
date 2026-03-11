import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SetupStateService } from './setup-state.service';

export const setupRouteGuard: CanActivateFn = () => {
  const router = inject(Router);
  const setupState = inject(SetupStateService);

  return setupState.isComplete() ? router.parseUrl('/home') : true;
};
