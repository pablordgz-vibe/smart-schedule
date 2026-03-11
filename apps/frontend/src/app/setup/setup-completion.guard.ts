import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { SetupStateService } from './setup-state.service';

function resolveSetupAccess() {
  const router = inject(Router);
  const setupState = inject(SetupStateService);

  if (setupState.isComplete()) {
    return true;
  }

  return router.parseUrl('/setup');
}

export const setupCompletionGuard: CanActivateFn = () => resolveSetupAccess();

export const setupCompletionChildGuard: CanActivateChildFn = () =>
  resolveSetupAccess();
