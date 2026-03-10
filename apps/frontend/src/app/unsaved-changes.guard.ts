import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { DirtyStateService } from './dirty-state.service';

export const unsavedChangesGuard: CanDeactivateFn<unknown> = () => {
  const dirtyState = inject(DirtyStateService);

  if (!dirtyState.isDirty()) {
    return true;
  }

  return window.confirm('You have unsaved changes. Leave this screen?');
};
